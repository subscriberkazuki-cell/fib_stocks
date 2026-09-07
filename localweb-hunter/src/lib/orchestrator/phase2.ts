// Phase 2 — 通過した店舗だけに行う高コスト調査（§6）
//
// 呼び出し元は「Phase 1 を通過した店舗」しか渡してこない前提。
// この関数を全店舗に対して回すと、2段階分離の意味がなくなる。
//
// 流れ：
//   Stage 2  Web検索で公式サイト候補を探す
//   Stage 3  候補URLをドメインで分類（AI不使用）
//   Stage 4  公式サイトの品質を実測 → Website Opportunity Score
//   +        公開情報からメール抽出（推測生成は一切しない）
//
// 各段階の失敗は errors に積むだけで、店舗情報そのものは失わない（§12-3）。

import 'server-only';
import type { Business, CandidateUrl, EnrichmentResult } from '@/types/business';
import { sourced } from '@/types/business';
import type { WebSearchProvider } from '@/lib/search/SearchProvider';
import type { PoliteHttpClient } from '@/lib/crawler/httpClient';
import type { AIProvider } from '@/lib/ai/AIProvider';
import { BudgetExceededError } from '@/lib/budget/budgetGuard';
import { determineWebsiteStatus, toCandidateUrl } from '@/lib/detection/noWebsiteDetection';
import {
  calculateWebPresenceScore,
  evaluateWebsiteOpportunity,
  judgeOfficialSiteQuality,
} from '@/lib/scoring/websitePresenceScore';
import { analyzeWebsite } from '@/lib/analyze/websiteAnalyzer';
import { extractEmailsFromHtml, selectBusinessEmail } from '@/lib/analyze/contactExtractor';
import { stripTags } from '@/lib/analyze/html';

export interface Phase2Deps {
  search: WebSearchProvider;
  http: PoliteHttpClient;
  ai: AIProvider;
  maxPagesPerSite: number;
}

/** AIに最終判定を任せる閾値。ルールベースで白黒つく場合はAIを呼ばない（コスト削減） */
const AI_JUDGEMENT_MIN_CANDIDATES = 1;

export async function enrichBusiness(biz: Business, deps: Phase2Deps): Promise<EnrichmentResult> {
  const errors: string[] = [];

  // ---- Stage 2: Web検索で候補URLを集める ----
  let candidates: CandidateUrl[] = [...biz.candidateUrls];

  if (biz.websiteUrl && !candidates.some((c) => c.url === biz.websiteUrl)) {
    candidates.push(toCandidateUrl(biz.websiteUrl));
  }

  if (deps.search.isConfigured()) {
    const locality = biz.city || biz.prefecture;
    const query = `${biz.name} ${locality}`.trim();
    try {
      const hits = await deps.search.search(query, 10);
      for (const hit of hits) {
        if (candidates.some((c) => c.url === hit.url)) continue;
        candidates.push(toCandidateUrl(hit.url, { title: hit.title, snippet: hit.snippet }));
      }
    } catch (e) {
      if (e instanceof BudgetExceededError) throw e;
      errors.push(`Web検索に失敗: ${e instanceof Error ? e.message : '不明なエラー'}`);
    }
  }

  // ---- Stage 3: ルールベース分類は toCandidateUrl 内で済んでいる ----
  // 独自ドメインに見える候補が複数ある場合だけ、AIに最終判定させる（§7 Stage 3末尾）
  const officialCandidates = candidates.filter((c) => c.classification === 'official');

  let confirmedOfficial: CandidateUrl | null = null;
  if (officialCandidates.length >= AI_JUDGEMENT_MIN_CANDIDATES) {
    confirmedOfficial = await pickOfficialSite(biz, officialCandidates, deps, errors);
  }

  // AIが「公式ではない」と判定した候補は official から降格させる
  candidates = candidates.map((c) => {
    if (c.classification !== 'official') return c;
    if (confirmedOfficial && c.url === confirmedOfficial.url) return confirmedOfficial;
    const judged = officialCandidates.find((o) => o.url === c.url);
    if (judged?.officialSiteProbability !== null && judged?.officialSiteProbability !== undefined && judged.officialSiteProbability < 0.5) {
      return { ...c, classification: 'unknown', officialSiteProbability: judged.officialSiteProbability, ...(judged.reason ? { reason: judged.reason } : {}) };
    }
    return c;
  });

  // ---- Stage 4: 公式サイトの品質を実測する ----
  const officialUrl = confirmedOfficial?.url ?? null;
  let signals = null;
  let opportunityScore: number | null = null;
  let email = biz.email;
  const snsFromSite: string[] = [];

  if (officialUrl) {
    try {
      const analysis = await analyzeWebsite(officialUrl, deps.http);
      signals = analysis.signals;
      snsFromSite.push(...analysis.snsUrls);
      if (analysis.error) errors.push(`サイト解析: ${analysis.error}`);

      opportunityScore = evaluateWebsiteOpportunity(signals).score;

      // ---- メール抽出（公開情報のみ・推測生成は一切しない, §2-3/§2-4）----
      if (!email && signals.reachable) {
        email = await findEmail(officialUrl, analysis.contactPageUrls, deps, errors);
      }
    } catch (e) {
      if (e instanceof BudgetExceededError) throw e;
      errors.push(`サイト解析に失敗: ${e instanceof Error ? e.message : '不明なエラー'}`);
    }
  }

  const quality = judgeOfficialSiteQuality(signals);
  const { status, officialUrl: resolvedUrl, socialUrls } = determineWebsiteStatus({
    candidates,
    hasProviderWebsiteField: officialUrl !== null,
    officialSiteQuality: quality,
  });

  const allSocial = [...new Set([...socialUrls, ...snsFromSite])];

  return {
    websiteStatus: status,
    webPresenceScore: calculateWebPresenceScore(status),
    officialSiteUrl: resolvedUrl ?? officialUrl,
    candidateUrls: candidates,
    socialUrls: allSocial,
    email,
    // サイトが無い場合の Opportunity Score は「機会が最大」の100
    websiteOpportunityScore: opportunityScore ?? (officialUrl === null ? 100 : null),
    websiteSignals: signals,
    errors,
  };
}

/** 複数の独自ドメイン候補から、実際の公式サイトを1つ選ぶ */
async function pickOfficialSite(
  biz: Business,
  officialCandidates: CandidateUrl[],
  deps: Phase2Deps,
  errors: string[]
): Promise<CandidateUrl | null> {
  let best: CandidateUrl | null = null;
  let bestProb = 0;

  // 候補が多いとコストが膨らむので上位3件までに絞る
  for (const cand of officialCandidates.slice(0, 3)) {
    const page = await deps.http.fetchPage(cand.url);
    const excerpt = page.html ? stripTags(page.html).slice(0, 2000) : null;

    if (!page.ok && page.blockedByRobots) {
      errors.push(`${cand.url}: robots.txt により取得を見送りました`);
    }

    let judgement;
    try {
      judgement = await deps.ai.judgeOfficialSite({
        businessName: biz.name,
        address: biz.address,
        phone: biz.phone?.value ?? null,
        url: cand.url,
        pageTitle: page.html ? extractTitleSafe(page.html) : null,
        pageExcerpt: excerpt,
        domain: safeHostname(cand.url),
        snsUrls: biz.socialUrls,
      });
    } catch (e) {
      if (e instanceof BudgetExceededError) throw e;
      errors.push(`公式サイト判定に失敗: ${e instanceof Error ? e.message : '不明なエラー'}`);
      continue;
    }

    // AIが判定できなかった場合は null。推測で埋めず、その候補は保留にする（§9-4）
    if (!judgement) continue;

    const scored: CandidateUrl = {
      ...cand,
      officialSiteProbability: judgement.official_site_probability,
      reason: judgement.reason,
    };
    const idx = officialCandidates.findIndex((c) => c.url === cand.url);
    if (idx !== -1) officialCandidates[idx] = scored;

    if (judgement.official_site_probability > bestProb) {
      bestProb = judgement.official_site_probability;
      best = scored;
    }
  }

  return bestProb >= 0.5 ? best : null;
}

/**
 * 公開ページからメールを探す。
 * 見つからなければ null を返す。ドメインから info@ を組み立てるようなことは絶対にしない。
 */
async function findEmail(
  officialUrl: string,
  contactPageUrls: string[],
  deps: Phase2Deps,
  errors: string[]
): Promise<Business['email']> {
  const pages = [officialUrl, ...contactPageUrls].slice(0, deps.maxPagesPerSite);

  for (const url of pages) {
    const res = await deps.http.fetchPage(url);
    if (!res.ok || res.html === null) {
      if (res.blockedByRobots) errors.push(`${url}: robots.txt により取得を見送りました`);
      continue;
    }

    const found = extractEmailsFromHtml(res.html, res.finalUrl);
    const selected = selectBusinessEmail(found, { fromOfficialSite: true });
    if (selected) {
      return sourced(selected.email, 'official_site', { sourceUrl: selected.sourceUrl, verified: true });
    }
  }

  // 見つからなかった。これは失敗ではなく「未確認」という正しい結果。
  return null;
}

function extractTitleSafe(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m?.[1] ? stripTags(m[1]) : null;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
