// 公式サイトの品質シグナル抽出（§8-2）
//
// ここで出す値はすべて**実測**。「たぶんモバイル対応だろう」といった推測は入れない。
// 取得できなかった項目は false / null にして、そのことが分かるようにする。

import 'server-only';
import type { WebsiteSignals } from '@/types/business';
import type { PoliteHttpClient } from '@/lib/crawler/httpClient';
import { countImages, getAllLinks, getMetaContent, getTitle, stripTags } from './html';
import { FREE_HOSTING_DOMAINS } from '@/config/portalDomains';
import { extractHostname } from '@/lib/detection/noWebsiteDetection';

const MENU_KEYWORDS = ['メニュー', 'menu', 'サービス', 'service', 'コース', '施術', '商品', 'プラン', '取扱'];
const PRICE_KEYWORDS = ['料金', '価格', '円', '税込', '税抜', 'price', '費用', 'プライス'];
const HOURS_KEYWORDS = ['営業時間', '受付時間', '診療時間', '定休日', '営業日', 'open', '開店'];
const ACCESS_KEYWORDS = ['アクセス', '所在地', '住所', '駐車場', '最寄り', '徒歩', 'access', 'map'];
const RESERVATION_KEYWORDS = ['予約', 'ご予約', 'reserve', 'booking', 'reservation'];
const SNS_HOSTS = ['instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'tiktok.com', 'line.me', 'lin.ee'];

/** ページ本文から見つかる最新の日付。更新状況の判定に使う（未来日は無視する） */
export function findLatestDate(text: string): string | null {
  const patterns = [
    /(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/g,
    /(20\d{2})[-/.年](\d{1,2})月/g,
  ];
  let best: number | null = null;
  const nowMs = Date.now();

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const y = Number(m[1]);
      const mo = Number(m[2] ?? 1);
      const d = Number(m[3] ?? 1);
      if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) continue;
      const t = Date.UTC(y, mo - 1, d);
      if (t > nowMs) continue;
      if (best === null || t > best) best = t;
    }
  }

  return best === null ? null : new Date(best).toISOString().slice(0, 10);
}

function hasAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

export interface AnalyzeResult {
  signals: WebsiteSignals;
  /** メール抽出のために追加で見るべきページ（会社概要・お問い合わせ等） */
  contactPageUrls: string[];
  /** サイト内で見つかったSNSリンク */
  snsUrls: string[];
  error: string | null;
}

const CONTACT_PATH_HINTS = ['contact', 'inquiry', 'toiawase', 'about', 'company', 'info', 'access', 'privacy', 'kaisha'];

export async function analyzeWebsite(url: string, client: PoliteHttpClient): Promise<AnalyzeResult> {
  const unreachable = (error: string): AnalyzeResult => ({
    signals: emptySignals(false, url),
    contactPageUrls: [],
    snsUrls: [],
    error,
  });

  const res = await client.fetchPage(url);
  if (!res.ok || res.html === null) {
    return unreachable(res.error ?? '取得できませんでした');
  }

  const html = res.html;
  const text = stripTags(html);
  const links = getAllLinks(html, res.finalUrl);
  const host = extractHostname(res.finalUrl);

  const snsUrls = links.filter((l) => {
    const h = extractHostname(l);
    return h !== null && SNS_HOSTS.some((s) => h === s || h.endsWith(`.${s}`));
  });

  const contactPageUrls = links
    .filter((l) => extractHostname(l) === host)
    .filter((l) => {
      const path = l.toLowerCase();
      return CONTACT_PATH_HINTS.some((h) => path.includes(h));
    })
    .slice(0, 4);

  const signals: WebsiteSignals = {
    reachable: true,
    hasOwnDomain: host !== null && !FREE_HOSTING_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`)),
    hasSsl: res.finalUrl.startsWith('https://'),
    isMobileFriendly: /<meta[^>]+name=["']viewport["']/i.test(html),
    responseTimeMs: res.responseTimeMs,
    textLength: text.length,
    imageCount: countImages(html),
    hasMenuOrServiceInfo: hasAny(text, MENU_KEYWORDS),
    hasPriceInfo: hasAny(text, PRICE_KEYWORDS),
    hasOpeningHours: hasAny(text, HOURS_KEYWORDS),
    hasAccessInfo: hasAny(text, ACCESS_KEYWORDS),
    hasTelLink: /href=["']tel:/i.test(html),
    hasContactForm: /<form\b/i.test(html) || contactPageUrls.length > 0,
    hasReservationLink: hasAny(text, RESERVATION_KEYWORDS) || links.some((l) => hasAny(l, RESERVATION_KEYWORDS)),
    hasSnsLinks: snsUrls.length > 0,
    hasMapEmbed: /google\.com\/maps\/embed|<iframe[^>]+maps/i.test(html),
    hasTitle: (getTitle(html)?.length ?? 0) > 0,
    hasMetaDescription: (getMetaContent(html, 'description')?.length ?? 0) > 0,
    hasOgp: getMetaContent(html, 'og:title') !== null,
    hasStructuredData: /application\/ld\+json/i.test(html),
    hasViewportMeta: /<meta[^>]+name=["']viewport["']/i.test(html),
    latestDateFound: findLatestDate(text),
  };

  return { signals, contactPageUrls, snsUrls, error: null };
}

export function emptySignals(reachable: boolean, _url: string): WebsiteSignals {
  return {
    reachable,
    hasOwnDomain: false,
    hasSsl: false,
    isMobileFriendly: false,
    responseTimeMs: null,
    textLength: 0,
    imageCount: 0,
    hasMenuOrServiceInfo: false,
    hasPriceInfo: false,
    hasOpeningHours: false,
    hasAccessInfo: false,
    hasTelLink: false,
    hasContactForm: false,
    hasReservationLink: false,
    hasSnsLinks: false,
    hasMapEmbed: false,
    hasTitle: false,
    hasMetaDescription: false,
    hasOgp: false,
    hasStructuredData: false,
    hasViewportMeta: false,
    latestDateFound: null,
  };
}
