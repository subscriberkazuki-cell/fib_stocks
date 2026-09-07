// サブクエリの分割（§12-1「柏市を全件調査」モード）
//
// 1リクエストの取得上限を超える場合、まずページング（cursor）を試し、
// それでも取りこぼす場合に地点・カテゴリ分割にフォールバックする。
// 分割された各サブクエリは search_subqueries に記録され、
// 中断してもそこからレジュームできる（§12-2）。

import { CATEGORY_PRESETS } from '@/config/defaults';
import type { SearchCriteria, SubQueryParams } from '@/types/business';

export interface PlannedSubQuery {
  label: string;
  params: SubQueryParams;
}

/**
 * 円を六角格子で覆う中心点を返す。
 * 正方格子だと隅に穴が空くので、行を半径分ずらして重なりを作っている。
 */
export function gridPoints(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  cellRadiusKm: number
): { lat: number; lng: number }[] {
  if (cellRadiusKm >= radiusKm) return [{ lat: centerLat, lng: centerLng }];

  const points: { lat: number; lng: number }[] = [];
  // 隣接セルが少し重なるよう、間隔をセル半径の1.5倍にする
  const stepKm = cellRadiusKm * 1.5;
  const kmPerDegLat = 110.574;
  const kmPerDegLng = 111.32 * Math.cos((centerLat * Math.PI) / 180);

  const rows = Math.ceil(radiusKm / stepKm);
  for (let row = -rows; row <= rows; row++) {
    const latOffset = (row * stepKm) / kmPerDegLat;
    const lat = centerLat + latOffset;
    // 行ごとに半ステップずらす（六角格子）
    const shift = row % 2 === 0 ? 0 : stepKm / 2;
    const cols = Math.ceil(radiusKm / stepKm);

    for (let col = -cols; col <= cols; col++) {
      const lngOffset = (col * stepKm + shift) / kmPerDegLng;
      const lng = centerLng + lngOffset;

      // 円の外に出たセルは捨てる（セル半径ぶんの余裕を持たせる）
      const dxKm = (col * stepKm + shift);
      const dyKm = row * stepKm;
      if (Math.sqrt(dxKm * dxKm + dyKm * dyKm) > radiusKm + cellRadiusKm) continue;

      points.push({ lat, lng });
    }
  }

  return points.length > 0 ? points : [{ lat: centerLat, lng: centerLng }];
}

export function planSubQueries(criteria: SearchCriteria): PlannedSubQuery[] {
  const r = criteria.region;
  const centerLat = r.centerLat ?? 35.8617;
  const centerLng = r.centerLng ?? 139.9707;
  const radiusKm = r.radiusKm ?? 5;
  const city = r.city ?? null;
  const prefecture = r.prefecture ?? null;

  const categories: (string | null)[] =
    criteria.categories.length > 0 ? criteria.categories : [null];

  // 通常モードは分割しない。まずページングで取り切ることを狙う（§12-1）。
  if (!criteria.exhaustive) {
    return categories.map((category) => ({
      label: `${city ?? `${centerLat.toFixed(3)},${centerLng.toFixed(3)}`} / ${category ?? '全業種'} / ${radiusKm}km`,
      params: { centerLat, centerLng, radiusKm, city, prefecture, category },
    }));
  }

  // 全件調査モード：地点を分割する。
  // 全業種のまま分割すると1地点あたりの件数が上限に当たりやすいので、
  // カテゴリ未指定なら全カテゴリに展開する。
  const cellRadiusKm = Math.max(1, Math.min(2, radiusKm / 3));
  const points = gridPoints(centerLat, centerLng, radiusKm, cellRadiusKm);
  const cats: (string | null)[] =
    criteria.categories.length > 0 ? criteria.categories : CATEGORY_PRESETS.map((c) => c.label);

  const out: PlannedSubQuery[] = [];
  for (const cat of cats) {
    points.forEach((p, i) => {
      out.push({
        label: `${city ?? '指定地点'} #${i + 1} / ${cat ?? '全業種'} / ${cellRadiusKm}km`,
        params: {
          centerLat: p.lat,
          centerLng: p.lng,
          radiusKm: cellRadiusKm,
          city,
          prefecture,
          category: cat,
        },
      });
    });
  }

  return out;
}
