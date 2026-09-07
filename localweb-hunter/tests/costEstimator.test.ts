import { describe, expect, it } from 'vitest';
import { estimatePhase1, estimatePhase2, estimateTotal } from '@/lib/cost/costEstimator';

// ブリーフの試算例に使われている DataForSEO の単価
// 2026年7月の値上げ後の単価
const DFS = { perRequestUsd: 0.012, perItemUsd: 0.00036, maxItemsPerRequest: 1000 };
const FREE = { perRequestUsd: 0, perItemUsd: 0, maxItemsPerRequest: 1000 };

describe('estimatePhase1', () => {
  it('柏市1,300件の試算が現行単価で $0.49 前後になる', () => {
    // 1,300件 → 2リクエスト × $0.012 = $0.024 + 1,300 × $0.00036 = $0.468 → 計 $0.492
    // ブリーフの $0.41 は値上げ前の単価に基づく数字なので、ここでは更新している。
    const r = estimatePhase1(DFS, 1, 1300);
    expect(r.requestCount).toBe(2);
    expect(r.totalCost).toBeCloseTo(0.49, 2);
  });

  it('1リクエストの上限を超えたらリクエスト数が増える', () => {
    expect(estimatePhase1(DFS, 1, 2500).requestCount).toBe(3);
  });

  it('サブクエリが増えればコストも増える', () => {
    const one = estimatePhase1(DFS, 1, 200).totalCost;
    const ten = estimatePhase1(DFS, 10, 200).totalCost;
    expect(ten).toBeCloseTo(one * 10, 5);
  });

  it('無料プロバイダなら $0', () => {
    expect(estimatePhase1(FREE, 20, 500).totalCost).toBe(0);
  });
});

describe('estimatePhase2', () => {
  it('通過件数に比例する', () => {
    const r = estimatePhase2(100, { webSearchPerBusiness: 0.005, aiPerBusiness: 0.001, crawlPerBusiness: 0 });
    expect(r.totalCost).toBeCloseTo(0.6, 5);
    expect(r.costPerBusiness).toBeCloseTo(0.006, 5);
  });

  it('0件なら $0（ゼロ除算しない）', () => {
    const r = estimatePhase2(0, { webSearchPerBusiness: 0.005, aiPerBusiness: 0.001, crawlPerBusiness: 0 });
    expect(r.totalCost).toBe(0);
    expect(r.costPerBusiness).toBe(0);
  });
});

describe('estimateTotal', () => {
  const rates = { webSearchPerBusiness: 0.005, aiPerBusiness: 0.001, crawlPerBusiness: 0 };

  it('Phase 2 は通過した件数にだけ課金される（2段階分離の効果）', () => {
    const withPhase2 = estimateTotal({
      costModel: DFS, subQueryCount: 1, estimatedItemsPerSubQuery: 1000,
      qualifiedRate: 0.14, phase2Rates: rates, runPhase2: true,
    });
    const withoutPhase2 = estimateTotal({
      costModel: DFS, subQueryCount: 1, estimatedItemsPerSubQuery: 1000,
      qualifiedRate: 0.14, phase2Rates: rates, runPhase2: false,
    });

    // 全件にPhase 2をかけた場合との差が、2段階分離で節約できている額
    const naive = 1000 * (rates.webSearchPerBusiness + rates.aiPerBusiness);
    expect(withPhase2.phase2.qualifiedCount).toBe(140);
    expect(withPhase2.phase2.totalCost).toBeLessThan(naive * 0.2);
    expect(withoutPhase2.phase2.totalCost).toBe(0);
  });

  it('すべて無料プロバイダなら isFree になる', () => {
    const r = estimateTotal({
      costModel: FREE, subQueryCount: 12, estimatedItemsPerSubQuery: 200,
      qualifiedRate: 0.14,
      phase2Rates: { webSearchPerBusiness: 0, aiPerBusiness: 0, crawlPerBusiness: 0 },
      runPhase2: true,
    });
    expect(r.grandTotal).toBe(0);
    expect(r.isFree).toBe(true);
  });
});
