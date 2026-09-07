// DataForSEO Business Listings Search API の疎通確認。
//
//   DATAFORSEO_LOGIN=xxx DATAFORSEO_PASSWORD=yyy npm run check:dataforseo
//
// 目的:
//   1. 認証・疎通が通るか
//   2. items[] の実フィールド名を確認し、
//      src/lib/providers/DataForSEOProvider.ts の toCandidate() が正しく対応しているか検証する
//   3. 実際に課金された cost を確認し、.env.local の単価設定が妥当か検証する
//
// このスクリプトは limit=10 の小さいクエリを1回だけ投げる。
// 現行単価なら約 $0.012 + 10 × $0.00036 = 約 $0.016。

const login = process.env.DATAFORSEO_LOGIN;
const password = process.env.DATAFORSEO_PASSWORD;

if (!login || !password) {
  console.error('DATAFORSEO_LOGIN と DATAFORSEO_PASSWORD を環境変数で指定してください。');
  console.error('例: DATAFORSEO_LOGIN=xxx DATAFORSEO_PASSWORD=yyy npm run check:dataforseo');
  process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');

// 柏駅付近、半径5km、評価3.7以上・レビュー5件以上、10件だけ
const KASHIWA = { lat: 35.8617, lng: 139.9707 };
const RADIUS_KM = 5;

const requestBody = [
  {
    location_coordinate: `${KASHIWA.lat},${KASHIWA.lng},${RADIUS_KM}`,
    filters: [
      ['rating.value', '>=', 3.7],
      'and',
      ['rating.votes_count', '>=', 5],
    ],
    limit: 10,
  },
];

// DataForSEOProvider.toCandidate() が読むフィールド。
// ここが実レスポンスに存在するかを確認する。
const EXPECTED_FIELDS = [
  { path: 'place_id | cid | feature_id', note: '重複排除の主キー。どれか必須' },
  { path: 'title', note: '店名。必須' },
  { path: 'category', note: '業種' },
  { path: 'address | address_info.address', note: '住所' },
  { path: 'address_info.region', note: '都道府県' },
  { path: 'address_info.city', note: '市区町村' },
  { path: 'latitude / longitude', note: '座標。重複排除の距離判定に使う' },
  { path: 'rating.value', note: '評価。中核フィルタ' },
  { path: 'rating.votes_count', note: 'レビュー件数。中核フィルタ' },
  { path: 'phone', note: '電話番号' },
  { path: 'url | domain', note: '公式サイト（Stage 1判定）' },
];

function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

async function main() {
  console.log('リクエスト送信中...\n');
  console.log(JSON.stringify(requestBody, null, 2));

  const res = await fetch(
    'https://api.dataforseo.com/v3/business_data/business_listings/search/live',
    {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }
  );

  console.log('\nHTTP Status:', res.status);
  if (!res.ok) {
    console.error('リクエストが失敗しました:', res.statusText);
    console.error(await res.text().catch(() => ''));
    process.exit(1);
  }

  const json = await res.json();
  const task = json?.tasks?.[0];

  if (!task) {
    console.error('\n⚠️ tasks が返ってきていません。認証情報を確認してください。');
    console.error(JSON.stringify(json, null, 2).slice(0, 2000));
    process.exit(1);
  }
  if (task.status_code !== 20000) {
    console.error(`\n⚠️ status_code=${task.status_code} (${task.status_message})`);
    console.error('リクエストパラメータを見直してください。');
    process.exit(1);
  }

  const result = task.result?.[0];
  const items = result?.items ?? [];

  console.log(`\n✅ ${items.length}件取得`);
  console.log(`   実コスト: $${task.cost}`);
  console.log(`   total_count: ${result?.total_count ?? '(なし)'}`);
  console.log(`   offset_token: ${result?.offset_token ? 'あり（ページング可能）' : 'なし'}`);

  if (items.length > 0) {
    console.log(`\n   1件あたり実コスト: $${(task.cost / items.length).toFixed(6)}`);
    console.log('   → .env.local の DATAFORSEO_COST_PER_REQUEST / _PER_ITEM がこれと');
    console.log('     大きくずれていたら更新してください。');
  }

  const item = items[0];
  if (!item) {
    console.log('\n⚠️ items が空です。フィルタが厳しすぎるか、この地点にデータがありません。');
    return;
  }

  console.log('\n--- DataForSEOProvider が読むフィールドの存在確認 ---');
  for (const f of EXPECTED_FIELDS) {
    const paths = f.path.split(/\s*[|/]\s*/);
    const found = paths.find((p) => get(item, p.trim()) !== undefined);
    const mark = found ? '✅' : '❌';
    const value = found ? JSON.stringify(get(item, found.trim())).slice(0, 50) : '(なし)';
    console.log(`  ${mark} ${f.path.padEnd(34)} ${value}`);
    if (!found) console.log(`     ↳ ${f.note} — toCandidate() の修正が必要です`);
  }

  console.log('\n--- 1件目のフィールド一覧 ---');
  console.log(Object.keys(item).join(', '));

  console.log('\n--- 1件目の内容 ---');
  console.log(JSON.stringify(item, null, 2));

  console.log('\n次にやること:');
  console.log('  1. ❌ が付いたフィールドがあれば DataForSEOProvider.toCandidate() を修正する');
  console.log('  2. 実コストに合わせて .env.local の DATAFORSEO_COST_PER_* を更新する');
  console.log('  3. .env.local の BUSINESS_DATA_PROVIDER=dataforseo に変更する');
  console.log('  4. まず半径3km程度の小さい範囲で1回実行し、/costs で実コストを確認する');
}

main().catch((err) => {
  console.error('リクエスト失敗:', err);
  process.exit(1);
});
