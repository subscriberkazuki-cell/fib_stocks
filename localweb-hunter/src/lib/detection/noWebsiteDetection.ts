// 「ホームページなし」判定（§7）
//
// website_url == null だけで判定してはならない、というのがこの機能の核心。
// 4段階で判定する：
//   Stage 1  プロバイダのレスポンスに公式サイトURLがあるか
//   Stage 2  無ければ「店名 + 市区町村名」でWeb検索し候補URLを集める（webSearch側）
//   Stage 3  候補URLをドメインで分類する ← このファイル
//   Stage 4  公式サイトがあっても除外しない。品質を評価して営業機会を測る
//
// ドメインリストは config/portalDomains.ts に置き、ここにハードコードしない。

import {
  FREE_HOSTING_DOMAINS,
  JOB_DOMAINS,
  MAP_PROFILE_DOMAINS,
  MARKETPLACE_DOMAINS,
  PORTAL_DOMAINS,
  SOCIAL_DOMAINS,
} from '@/config/portalDomains';
import type { CandidateUrl, SiteClassification, WebsiteStatus } from '@/types/business';

export function extractHostname(url: string): string | null {
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, '');
    // URLコンストラクタは任意の文字列をホスト名として受け入れてしまう
    // （日本語の文にpunycodeを付けて返す）。TLDのない文字列は弾く。
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

/**
 * ホスト名がドメインリストに一致するか。
 * 部分文字列一致は使わない（"notgoogle.com" が "google.com" に誤マッチするため）。
 * 一致は「完全一致」か「サブドメイン」のみ。
 */
function hostMatches(host: string, domains: readonly string[]): boolean {
  return domains.some((d) => {
    const dd = d.toLowerCase();
    // "google.com/maps" のようなパス付きエントリはホスト部分だけで比較する
    const domainOnly = dd.split('/')[0] ?? dd;
    return host === domainOnly || host.endsWith(`.${domainOnly}`);
  });
}

export function classifyUrl(url: string): SiteClassification {
  const host = extractHostname(url);
  if (!host) return 'unknown';

  if (hostMatches(host, SOCIAL_DOMAINS)) return 'social';
  if (hostMatches(host, MAP_PROFILE_DOMAINS)) return 'map_profile';
  if (hostMatches(host, JOB_DOMAINS)) return 'job';
  if (hostMatches(host, PORTAL_DOMAINS)) return 'portal';
  if (hostMatches(host, MARKETPLACE_DOMAINS)) return 'marketplace';
  if (hostMatches(host, FREE_HOSTING_DOMAINS)) return 'free_hosting';

  return 'official';
}

export function toCandidateUrl(url: string, extra: { title?: string; snippet?: string } = {}): CandidateUrl {
  return {
    url,
    ...(extra.title ? { title: extra.title } : {}),
    ...(extra.snippet ? { snippet: extra.snippet } : {}),
    classification: classifyUrl(url),
    officialSiteProbability: null,
  };
}

export interface WebsiteStatusInput {
  candidates: CandidateUrl[];
  /** Stage 1: プロバイダのレスポンスに公式サイトURLが入っていたか */
  hasProviderWebsiteField: boolean;
  /** Stage 4: 公式サイトの実測品質。未調査なら null */
  officialSiteQuality: 'good' | 'low' | null;
}

export interface WebsiteStatusResult {
  status: WebsiteStatus;
  officialUrl: string | null;
  socialUrls: string[];
}

/**
 * Stage 3 + Stage 4: 候補URL群から website_status を決定する。
 *
 * 「公式サイトあり」と判定するのは、独自ドメインの候補が実際にある場合のみ。
 * 無料ホスティング（Wix/Jimdoの無料枠等）は独自HPとして数えず、
 * 「営業機会あり」側に倒す — これは判断として意図的なもので、
 * 無料枠のページは作り直し提案の対象になりやすいため。
 */
export function determineWebsiteStatus(input: WebsiteStatusInput): WebsiteStatusResult {
  const { candidates, hasProviderWebsiteField, officialSiteQuality } = input;

  const officials = candidates.filter((c) => c.classification === 'official');
  const socials = candidates.filter((c) => c.classification === 'social');
  const portals = candidates.filter(
    (c) => c.classification === 'portal' || c.classification === 'marketplace' || c.classification === 'free_hosting'
  );
  const mapProfiles = candidates.filter((c) => c.classification === 'map_profile');

  const socialUrls = socials.map((c) => c.url);
  const officialUrl = officials[0]?.url ?? null;

  const hasOfficial = officials.length > 0 || (hasProviderWebsiteField && candidates.length === 0);

  if (hasOfficial) {
    // Stage 4 未実施なら、営業対象として残るよう low_quality 側に倒しておく。
    // 「良いサイトである」と断定するには実測が要る（§7 Stage 4）。
    return {
      status: officialSiteQuality === 'good' ? 'official_good' : 'official_low_quality',
      officialUrl,
      socialUrls,
    };
  }

  if (portals.length >= 2) return { status: 'multiple_portals', officialUrl: null, socialUrls };
  if (portals.length === 1) return { status: 'portal_only', officialUrl: null, socialUrls };
  if (socials.length > 0) return { status: 'sns_only', officialUrl: null, socialUrls };
  if (mapProfiles.length > 0) return { status: 'profile_only', officialUrl: null, socialUrls };

  return { status: 'none', officialUrl: null, socialUrls };
}

/** website_status が「独自HPを持っていない」状態か（Lead Score の noWebsite 配点に使う） */
export function isMissingOwnWebsite(status: WebsiteStatus): boolean {
  return status === 'none' || status === 'sns_only' || status === 'portal_only' ||
    status === 'multiple_portals' || status === 'profile_only';
}
