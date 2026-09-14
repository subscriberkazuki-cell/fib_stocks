// クローラは取得前に必ず robots.txt を確認し、取得できなければアクセスを見送る。
// モックサイト（/api/mock-site/）を自分で巡回できるよう、明示的に許可を返す。
//
// アプリ本体は営業データを含むので、外部クローラには巡回させない。

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(
    ['User-agent: *', 'Allow: /api/mock-site/', 'Disallow: /', ''].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
}
