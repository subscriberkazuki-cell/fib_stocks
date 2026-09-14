// モックの店舗サイト。
//
// なぜこれが必要か：
//   モックプロバイダが返すサイトURLが到達不能だと、Phase 2 の
//   「サイト品質の実測」も「公開メールの抽出」も一度も実行されない。
//   その状態だと Website Opportunity Score は常に100、メールは常に未確認になり、
//   機能が動いているのかどうかを確かめられない。
//
//   そこでモック時だけ、この経路が実際のHTMLを返す。
//   クローラは本物として robots.txt を確認し、HTMLをパースし、
//   mailto: からメールを抽出する。**実装の経路は本番と完全に同じ。**
//
// メールアドレスのドメインは .test（RFC 2606 で予約され、実在し得ない）に固定している。
// 実在する誰かのアドレスに偶然一致しないようにするため。

import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** id から決定論的に値を選ぶ。同じ店舗なら毎回同じサイトになる */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const seed = hash(id);
  const name = req.nextUrl.searchParams.get('name') ?? 'サンプル店舗';

  // 店舗ごとにサイトの出来を変える。
  // 全部同じ品質だと Website Opportunity Score に差が出ず、
  // スコアが効いているかどうかを確認できない。
  const quality = seed % 3; // 0=古い / 1=そこそこ / 2=整備済み
  const hasEmail = seed % 4 !== 0;      // 4件に3件はメール記載あり
  const emailLocal = ['info', 'contact', 'shop'][seed % 3] ?? 'info';
  const email = `${emailLocal}@sample-${seed % 1000}.test`;

  const mobile = quality >= 1;
  const rich = quality === 2;

  const body = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
${mobile ? '<meta name="viewport" content="width=device-width, initial-scale=1">' : ''}
<title>${name}｜千葉県柏市</title>
${rich ? `<meta name="description" content="${name}の公式サイトです。営業時間・メニュー・アクセスのご案内。">` : ''}
${rich ? `<meta property="og:title" content="${name}">` : ''}
${rich ? '<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness"}</script>' : ''}
</head>
<body>
<h1>${name}</h1>

<h2>営業時間</h2>
<p>10:00〜20:00（定休日：水曜日）</p>

<h2>メニュー・サービス</h2>
<ul>
  <li>スタンダードコース 60分 ${rich ? '5,500円（税込）' : ''}</li>
  <li>ロングコース 90分 ${rich ? '8,800円（税込）' : ''}</li>
</ul>

<h2>アクセス</h2>
<p>千葉県柏市旭町1-2-3　柏駅西口から徒歩5分　駐車場3台あり</p>
${rich ? '<iframe src="https://www.google.com/maps/embed?pb=sample" title="地図"></iframe>' : ''}

<h2>お問い合わせ</h2>
<p>お電話：<a href="tel:0471671111">04-7167-1111</a></p>
${hasEmail ? `<p>メール：<a href="mailto:${email}">${email}</a></p>` : ''}
${rich ? '<form action="/contact" method="post"><input name="message"><button>送信</button></form>' : ''}
${rich ? '<p><a href="https://www.instagram.com/sample_shop/">Instagram</a></p>' : ''}

${Array.from({ length: rich ? 8 : 2 }, (_, i) => `<img src="/photo${i}.jpg" alt="店内${i}">`).join('\n')}

<footer>
  <p>最終更新：${quality === 0 ? '2019' : '2026'}年4月1日</p>
  <p><a href="/about">当店について</a> | <a href="/contact">お問い合わせ</a></p>
</footer>
${rich ? '<p>' + 'ご来店ありがとうございます。当店は地域の皆様に支えられ営業しております。'.repeat(20) + '</p>' : ''}
</body>
</html>`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
