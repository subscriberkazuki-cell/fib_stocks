// OsmProvider — OpenStreetMap Overpass API（完全無料・ODbL）
//
// 位置づけ（重要）: OSM は**評価とレビュー件数を持たない**。
// 本アプリの中核フィルタ「評価3.7以上・レビュー5件以上」が成立しないため、
// これ単体では「商売が成立している店舗」を絞り込めない。
// rating/reviewCount は捏造せず null のまま返す（§2-3）。
//
// 使いどころは §3-1 が言う「無料の補助ソース」：
//   - 業種カテゴリの補完
//   - 住所・座標の検証
//   - 重複排除の照合材料
//   - そして「評価が要らない用途」での$0の下見
//
// Overpass は公共の無償サーバーなので、間隔を空けて叩く。

import type { BusinessCandidate, SubQueryParams } from '@/types/business';
import type {
  BusinessDataProvider,
  CostModel,
  ProviderStatus,
  SearchBusinessesParams,
  SearchBusinessesResult,
} from './BusinessDataProvider';
import { CATEGORY_PRESETS } from '@/config/defaults';

const DEFAULT_FILTERS = [
  'amenity=restaurant', 'amenity=cafe', 'amenity=bar', 'amenity=fast_food',
  'shop=hairdresser', 'shop=beauty', 'shop=massage',
  'amenity=clinic', 'amenity=dentist', 'amenity=doctors',
  'leisure=fitness_centre', 'shop=bakery', 'shop=florist',
  'shop=car_repair', 'amenity=veterinary',
];

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export class OsmProvider implements BusinessDataProvider {
  readonly name = 'osm';
  readonly billable = false;

  private lastRequestAt = 0;

  constructor(
    private readonly endpoint: string,
    private readonly userAgent: string
  ) {}

  getCostModel(): CostModel {
    return { perRequestUsd: 0, perItemUsd: 0, maxItemsPerRequest: 2000 };
  }

  private filtersFor(category: string | null): string[] {
    if (!category) return DEFAULT_FILTERS;
    const preset = CATEGORY_PRESETS.find((p) => p.label === category || p.key === category);
    return preset?.osmFilters ?? DEFAULT_FILTERS;
  }

  private buildQuery(p: SubQueryParams): string {
    const lat = p.centerLat ?? 35.8617;
    const lng = p.centerLng ?? 139.9707;
    const radiusM = Math.round((p.radiusKm ?? 5) * 1000);
    const filters = this.filtersFor(p.category);

    const clauses = filters
      .map((f) => {
        const [k, v] = f.split('=');
        return `  nwr["${k}"="${v}"](around:${radiusM},${lat},${lng});`;
      })
      .join('\n');

    // 名前のない POI は営業リストとして意味がないので name タグ必須で絞る
    return `[out:json][timeout:60];\n(\n${clauses}\n);\nout center tags 2000;`;
  }

  /** 公共サーバーへの連投を避ける。無料で使わせてもらっている以上ここは譲らない */
  private async throttle(): Promise<void> {
    const wait = 2000 - (Date.now() - this.lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  async searchBusinesses(params: SearchBusinessesParams): Promise<SearchBusinessesResult> {
    await this.throttle();

    const query = this.buildQuery(params.params);
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': this.userAgent },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(70_000),
    });

    if (!res.ok) {
      throw new Error(`Overpass APIエラー: HTTP ${res.status} ${res.statusText}`);
    }

    const raw: unknown = await res.json();
    const elements = this.extractElements(raw);

    const businesses: BusinessCandidate[] = [];
    for (const el of elements) {
      const tags = el.tags ?? {};
      const name = tags['name'];
      if (!name) continue;

      const lat = el.lat ?? el.center?.lat ?? null;
      const lon = el.lon ?? el.center?.lon ?? null;
      const website = tags['website'] ?? tags['contact:website'] ?? null;

      businesses.push({
        sourceBusinessId: `${el.type}/${el.id}`,
        source: 'osm',
        name,
        category: this.categoryLabel(tags),
        address: this.formatAddress(tags, params.params),
        prefecture: tags['addr:province'] ?? params.params.prefecture ?? '',
        city: tags['addr:city'] ?? params.params.city ?? '',
        latitude: lat,
        longitude: lon,
        // OSM は評価を持たない。「無い」ことを null で正直に表す（推定で埋めない）
        rating: null,
        reviewCount: null,
        phone: tags['phone'] ?? tags['contact:phone'] ?? null,
        hasWebsiteFieldPopulated: Boolean(website),
        websiteUrlRaw: website,
        openingHours: tags['opening_hours'],
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

  private extractElements(raw: unknown): OverpassElement[] {
    if (typeof raw !== 'object' || raw === null) return [];
    const elements = (raw as { elements?: unknown }).elements;
    if (!Array.isArray(elements)) return [];
    return elements.filter((e): e is OverpassElement => typeof e === 'object' && e !== null && 'id' in e);
  }

  private categoryLabel(tags: Record<string, string>): string {
    for (const preset of CATEGORY_PRESETS) {
      for (const filter of preset.osmFilters) {
        const [k, v] = filter.split('=');
        if (k && v && tags[k] === v) return preset.label;
      }
    }
    return tags['amenity'] ?? tags['shop'] ?? tags['office'] ?? tags['craft'] ?? '';
  }

  private formatAddress(tags: Record<string, string>, p: SubQueryParams): string {
    const parts = [
      tags['addr:province'] ?? p.prefecture ?? '',
      tags['addr:city'] ?? p.city ?? '',
      tags['addr:suburb'] ?? '',
      tags['addr:quarter'] ?? '',
      tags['addr:neighbourhood'] ?? '',
      tags['addr:block_number'] ?? '',
      tags['addr:housenumber'] ?? '',
    ].filter(Boolean);
    return parts.join('');
  }

  async getProviderStatus(): Promise<ProviderStatus> {
    return {
      available: true,
      provider: 'osm',
      billable: false,
      message:
        'OpenStreetMap（$0）で動作中。評価・レビュー件数を持たないため、' +
        '「評価3.7以上・レビュー5件以上」のフィルタは適用されません（該当条件は自動的に無効化されます）。',
    };
  }
}
