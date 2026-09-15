// 既存サイトについて、営業文に書いてよい「気になった点」を組み立てる。
//
// ============================================================
// 書いてよいのは、実際に見に行って観測したことだけ
// ============================================================
//
// リニューアルの提案文で「スマホで見づらいですよ」と書くのは簡単だが、
// **見てもいないのに書けば、それは嘘である。** 相手は自分の店のサイトを知っているので、
// 外れていればその場で分かるし、「誰にでも同じ文面を送っている」と伝わる。
//
// 幸い Phase 2 のクローラが実際にページを取得して信号を記録している
// （SSLの有無、viewport の指定、最終更新日など）。ここではそれだけを根拠にする。
// 調査前（websiteSignals が null）なら、書けることは何も無い。
//
// 言い回しも「ありません」ではなく **「見つけられませんでした」** にしてある。
// クローラが見るページ数には限りがあり、実際には別ページにあるかもしれない。
// 断定して外すより、こちらの観測範囲として書く方が正確で、相手にも角が立たない。
//
// 件数は絞る。8個並べると粗探しに読める。直す価値のある順に3つまで。

import type { Business } from '@/types/business';

/** 最終更新がこれより古ければ、情報が古くなっている可能性として触れる */
export const STALE_YEARS = 2;

export interface SiteFinding {
  key: string;
  /** 営業文にそのまま入る一行 */
  line: string;
}

/** 直す価値の大きい順。この順で最大3つ使う */
export function siteFindings(b: Business, now: Date = new Date()): SiteFinding[] {
  const s = b.websiteSignals;
  if (!s || !s.reachable) return [];

  const found: SiteFinding[] = [];

  if (!s.hasSsl) {
    found.push({
      key: 'ssl',
      line: 'https ではなく http のままのため、ブラウザによっては「保護されていない通信」と表示されます',
    });
  }
  if (!s.isMobileFriendly || !s.hasViewportMeta) {
    found.push({
      key: 'mobile',
      line: 'スマートフォンで開いたときに、拡大しないと読みにくい状態でした',
    });
  }

  const latest = s.latestDateFound;
  if (latest) {
    const years = (now.getTime() - new Date(latest).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (years >= STALE_YEARS) {
      found.push({
        key: 'stale',
        line: `ページ内で確認できた一番新しい日付が${latest.slice(0, 7).replace('-', '年')}月で、情報が古くなっているかもしれません`,
      });
    }
  }

  if (!s.hasOpeningHours) {
    found.push({ key: 'hours', line: '営業時間の記載を見つけられませんでした' });
  }
  if (!s.hasPriceInfo) {
    found.push({ key: 'price', line: '料金・メニューの価格の記載を見つけられませんでした' });
  }
  if (!s.hasAccessInfo && !s.hasMapEmbed) {
    found.push({ key: 'access', line: 'アクセス・地図の案内を見つけられませんでした' });
  }
  if (!s.hasReservationLink && !s.hasContactForm) {
    found.push({ key: 'contact', line: '予約や問い合わせへの導線を見つけられませんでした' });
  }

  return found.slice(0, 3);
}

/** 営業文に差し込む形にする */
export function formatFindings(findings: SiteFinding[]): string {
  return findings.map((f) => `　・${f.line}`).join('\n');
}
