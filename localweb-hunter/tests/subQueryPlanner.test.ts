import { describe, expect, it } from 'vitest';
import { gridPoints, planSubQueries } from '@/lib/orchestrator/subQueryPlanner';
import { DEFAULT_CRITERIA } from '@/config/defaults';
import { distanceMeters } from '@/lib/dedupe/dedupe';

describe('gridPoints', () => {
  it('セルが検索半径以上なら分割しない', () => {
    expect(gridPoints(35.86, 139.97, 5, 5)).toHaveLength(1);
  });

  it('半径を覆う複数の地点を返す', () => {
    const pts = gridPoints(35.86, 139.97, 5, 1.5);
    expect(pts.length).toBeGreaterThan(5);
  });

  it('生成した地点はすべて検索範囲の周辺に収まる', () => {
    const pts = gridPoints(35.86, 139.97, 5, 1.5);
    for (const p of pts) {
      const d = distanceMeters(35.86, 139.97, p.lat, p.lng);
      expect(d).not.toBeNull();
      // セル半径ぶんのはみ出しは許容する（円の縁を取りこぼさないため）
      expect(d as number).toBeLessThan((5 + 1.5) * 1000);
    }
  });

  it('隣接セルが離れすぎず、間に穴が空かない', () => {
    const pts = gridPoints(35.86, 139.97, 5, 1.5);
    for (const p of pts) {
      const nearest = pts
        .filter((q) => q !== p)
        .map((q) => distanceMeters(p.lat, p.lng, q.lat, q.lng) ?? Infinity)
        .sort((a, b) => a - b)[0];
      // セル間隔は半径の1.5倍なので、直径3kmのセルなら最近傍は2.25km以内
      expect(nearest).toBeLessThan(1.5 * 1.5 * 1000 + 1);
    }
  });
});

describe('planSubQueries', () => {
  it('通常モードは分割せず1クエリにする（まずページングで取り切る）', () => {
    const plan = planSubQueries({ ...DEFAULT_CRITERIA, exhaustive: false });
    expect(plan).toHaveLength(1);
  });

  it('業種を複数指定すれば業種ごとに分かれる', () => {
    const plan = planSubQueries({ ...DEFAULT_CRITERIA, exhaustive: false, categories: ['飲食店', '美容室・理容室'] });
    expect(plan).toHaveLength(2);
  });

  it('全件調査モードでは地点×業種に分割する', () => {
    const plan = planSubQueries({ ...DEFAULT_CRITERIA, exhaustive: true });
    expect(plan.length).toBeGreaterThan(10);
  });

  it('全件調査モードでも業種を指定すればその業種だけになる', () => {
    const one = planSubQueries({ ...DEFAULT_CRITERIA, exhaustive: true, categories: ['飲食店'] });
    const all = planSubQueries({ ...DEFAULT_CRITERIA, exhaustive: true });
    expect(one.length).toBeLessThan(all.length);
  });

  it('各サブクエリは実行に必要なパラメータを持つ', () => {
    const plan = planSubQueries({ ...DEFAULT_CRITERIA, exhaustive: true });
    for (const sq of plan.slice(0, 5)) {
      expect(sq.params.centerLat).not.toBeNull();
      expect(sq.params.centerLng).not.toBeNull();
      expect(sq.params.radiusKm).not.toBeNull();
      expect(sq.label).toBeTruthy();
    }
  });
});
