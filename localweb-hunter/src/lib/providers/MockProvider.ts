// MockProvider — 課金ゼロで全機能を動かすためのプロバイダ。
//
// これは「サンプル」ではなく本番同等の経路を通る実装。UI・スコアリング・
// 重複排除・CRMを、APIキーなしで最後まで検証できるようにするために置いている。
//
// 注意: ここで返す店舗は実在の店舗ではない。実在店舗の情報を捏造しないため、
// 店名は明示的に架空とわかる命名にしてある（§2-3）。

import type { BusinessCandidate } from '@/types/business';
import type {
  BusinessDataProvider,
  CostModel,
  ProviderStatus,
  SearchBusinessesParams,
  SearchBusinessesResult,
} from './BusinessDataProvider';

const CATEGORY_POOL = [
  { name: 'ラーメン', category: '飲食店' },
  { name: 'カフェ', category: '飲食店' },
  { name: '居酒屋', category: '飲食店' },
  { name: 'ヘアサロン', category: '美容室・理容室' },
  { name: '整体院', category: '整体・リラクゼーション' },
  { name: '歯科クリニック', category: 'クリニック・歯科' },
  { name: 'パーソナルジム', category: 'ジム・フィットネス' },
  { name: '学習塾', category: '学習塾・教室' },
  { name: 'ベーカリー', category: '小売店' },
  { name: '自動車整備', category: '自動車関連' },
  { name: 'リフォーム工房', category: '工務店・リフォーム' },
  { name: '税理士事務所', category: '士業・専門サービス' },
  { name: 'トリミングサロン', category: 'ペット関連' },
  { name: 'ネイルサロン', category: '美容室・理容室' },
];

const SUFFIX_POOL = ['さくら', 'あおば', 'ひまわり', 'こもれび', 'なぎさ', 'つばき', 'みどり', 'あかつき', 'ゆうひ', 'はるかぜ'];

/** 決定論的な擬似乱数。同じ検索条件なら毎回同じ結果になり、UIの動作確認がしやすい */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class MockProvider implements BusinessDataProvider {
  readonly name = 'mock';
  readonly billable = false;

  /**
   * @param baseUrl モック店舗サイトを配信する自分自身のURL。
   *   これを渡すと Phase 2（サイト解析・メール抽出）が実際に動く。
   *   渡さない場合はサイトなし扱いになり、Phase 2 は「到達不能」として処理される。
   */
  constructor(
    private readonly baseUrl: string | null = null,
    private readonly countPerQuery = 120
  ) {}

  getCostModel(): CostModel {
    return { perRequestUsd: 0, perItemUsd: 0, maxItemsPerRequest: 1000 };
  }

  async getProviderStatus(): Promise<ProviderStatus> {
    return {
      available: true,
      provider: 'mock',
      billable: false,
      message: 'モックデータで動作中です（コスト $0）。実データを使うには .env.local の BUSINESS_DATA_PROVIDER を変更してください。',
    };
  }

  async searchBusinesses(params: SearchBusinessesParams): Promise<SearchBusinessesResult> {
    const p = params.params;
    const seed = hashString(`${p.city}|${p.category}|${p.centerLat}|${p.centerLng}|${p.radiusKm}`);
    const rng = makeRng(seed);

    const lat = p.centerLat ?? 35.8617;
    const lng = p.centerLng ?? 139.9707;
    const radiusDeg = (p.radiusKm ?? 5) / 111;
    const city = p.city ?? '柏市';
    const prefecture = p.prefecture ?? '千葉県';

    const pool = p.category
      ? CATEGORY_POOL.filter((c) => c.category === p.category)
      : CATEGORY_POOL;
    const usePool = pool.length > 0 ? pool : CATEGORY_POOL;

    const businesses: BusinessCandidate[] = [];
    for (let i = 0; i < this.countPerQuery; i++) {
      const t = usePool[Math.floor(rng() * usePool.length)];
      if (!t) continue;
      const suffix = SUFFIX_POOL[Math.floor(rng() * SUFFIX_POOL.length)] ?? 'さくら';

      // 評価は 3.0〜4.9 に分布させ、レビュー数は「少数の店に集中する」実分布に寄せる
      const rating = Math.round((3.0 + rng() * 1.9) * 10) / 10;
      const reviewCount = Math.max(1, Math.floor(Math.pow(rng(), 2.5) * 400) + 1);

      // 3割程度は公式サイトを持っている想定
      const hasSite = rng() < 0.3;
      const hasPhone = rng() < 0.85;

      const slug = `${suffix}${t.name}`;
      businesses.push({
        sourceBusinessId: `mock-${seed}-${i}`,
        source: 'mock',
        name: `【サンプル】${slug}${p.category ? '' : ''}`,
        category: t.category,
        address: `${prefecture}${city}${Math.floor(rng() * 5) + 1}-${Math.floor(rng() * 30) + 1}-${Math.floor(rng() * 20) + 1}`,
        prefecture,
        city,
        latitude: lat + (rng() - 0.5) * radiusDeg * 2,
        longitude: lng + (rng() - 0.5) * radiusDeg * 2,
        rating,
        reviewCount,
        phone: hasPhone ? `04-71${String(Math.floor(rng() * 90) + 10)}-${String(Math.floor(rng() * 9000) + 1000)}` : null,
        hasWebsiteFieldPopulated: hasSite && this.baseUrl !== null,
        // 自分自身が配信するモック店舗サイトを指す。
        // クローラは本物として robots.txt を確認し、HTMLを解析し、mailto: を拾う。
        websiteUrlRaw:
          hasSite && this.baseUrl
            ? `${this.baseUrl}/api/mock-site/${seed}-${i}?name=${encodeURIComponent(slug)}`
            : null,
        googleMapsUrl: undefined,
        openingHours: '10:00-20:00',
      });
    }

    return {
      businesses,
      nextCursor: null,
      totalEstimated: businesses.length,
      requestCount: 1,
      itemCount: businesses.length,
      costUsd: 0,
    };
  }
}
