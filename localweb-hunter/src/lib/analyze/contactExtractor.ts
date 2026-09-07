// メールアドレスの抽出（§2-3, §2-4）
//
// **絶対にやらないこと**：
//   * 店名やドメインから info@... を組み立てて「見つかった」ことにする
//   * 見つからないときに、それらしい値で埋める
// 見つからなければ null を返す。UIには「未確認」と出す。それが正しい状態。
//
// さらに §2-4 に従い、事業用と判断できないフリーメールは収集・蓄積しない。
// gmail.com 等でも、そのドメイン上の公式サイトに掲載されていれば
// 「事業用として公開されている」と判断できるが、そう言い切れないものは捨てる。

import { FREE_EMAIL_DOMAINS } from '@/config/portalDomains';
import { extractHostname } from '@/lib/detection/noWebsiteDetection';
import { stripTags } from './html';

// RFC完全準拠は不要。実際のサイトに載る形をカバーしつつ誤検出を抑える。
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** 画像ファイル名やダミー値をメールと誤認しないための除外 */
const NOISE_PATTERNS = [
  /\.(png|jpe?g|gif|webp|svg|css|js)$/i,
  /^(example|sample|test|dummy|noreply|no-reply|donotreply)@/i,
  /@(example\.(com|org|net)|sentry\.io|wixpress\.com|localhost)$/i,
];

export interface ExtractedEmail {
  email: string;
  sourceUrl: string;
  /** そのサイトのドメインと一致するメールか。事業用である確度が高い */
  matchesSiteDomain: boolean;
  isFreeMail: boolean;
}

export function extractEmailsFromHtml(html: string, pageUrl: string): ExtractedEmail[] {
  const siteHost = extractHostname(pageUrl);
  const found = new Map<string, ExtractedEmail>();

  // mailto: リンクは最も確実な出所なので優先して拾う
  const mailtoRe = /href=["']mailto:([^"'?]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(html)) !== null) {
    const raw = m[1];
    if (raw) addEmail(found, decodeURIComponent(raw), pageUrl, siteHost);
  }

  // 本文中のテキストからも拾う（タグを剥がしてから探す）
  const text = stripTags(html);
  const matches = text.match(EMAIL_RE) ?? [];
  for (const raw of matches) addEmail(found, raw, pageUrl, siteHost);

  return [...found.values()];
}

function addEmail(
  acc: Map<string, ExtractedEmail>,
  raw: string,
  pageUrl: string,
  siteHost: string | null
): void {
  const email = raw.trim().toLowerCase().replace(/[.,;:)>\]]+$/, '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  if (NOISE_PATTERNS.some((p) => p.test(email))) return;
  if (acc.has(email)) return;

  const domain = email.split('@')[1] ?? '';
  const isFreeMail = FREE_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
  const matchesSiteDomain =
    siteHost !== null && (domain === siteHost || siteHost.endsWith(`.${domain}`) || domain.endsWith(`.${siteHost}`));

  acc.set(email, { email, sourceUrl: pageUrl, matchesSiteDomain, isFreeMail });
}

/**
 * 保存してよい1件を選ぶ。該当なしなら null。
 *
 * 優先順位：
 *   1. サイトと同じドメインのメール（事業用と判断できる）
 *   2. フリーメールでない独自ドメインのメール
 *   3. フリーメールは、公式サイト上に掲載されていた場合のみ許容
 *      （公式サイトに載せている＝事業用の連絡先として公開している、と判断できるため）
 * ポータルやSNSページ上で拾ったフリーメールは、個人の私的アドレスの可能性があるので保存しない。
 */
export function selectBusinessEmail(
  candidates: ExtractedEmail[],
  opts: { fromOfficialSite: boolean }
): ExtractedEmail | null {
  if (candidates.length === 0) return null;

  const sameDomain = candidates.find((c) => c.matchesSiteDomain && !c.isFreeMail);
  if (sameDomain) return sameDomain;

  const ownDomain = candidates.find((c) => !c.isFreeMail);
  if (ownDomain) return ownDomain;

  if (opts.fromOfficialSite) {
    const freeOnOfficial = candidates.find((c) => c.isFreeMail);
    if (freeOnOfficial) return freeOnOfficial;
  }

  return null;
}
