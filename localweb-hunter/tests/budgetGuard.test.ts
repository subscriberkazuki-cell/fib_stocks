// 予算ガードは「超えたら止まる」ことが仕様。
// ここが静かに壊れると、想定外の課金が発生する。

import { describe, expect, it } from 'vitest';
import { BudgetExceededError, BudgetGuard, type UsageRecorder } from '@/lib/budget/budgetGuard';

function makeRecorder(initialSpend = 0): UsageRecorder & { records: unknown[]; spend: number } {
  const state = {
    spend: initialSpend,
    records: [] as unknown[],
    getMonthlySpend(): number {
      return state.spend;
    },
    record(entry: { costUsd: number }): void {
      state.spend += entry.costUsd;
      state.records.push(entry);
    },
  };
  return state;
}

const limits = { monthlyUsd: 5, perSearchUsd: 1 };

describe('BudgetGuard', () => {
  it('予算内なら run() を実行して結果を返す', async () => {
    const rec = makeRecorder();
    const guard = new BudgetGuard(limits, rec);

    const result = await guard.spend({
      kind: 'business_data',
      provider: 'test',
      estimatedCostUsd: 0.5,
      run: async () => ({ value: 'ok', actualCostUsd: 0.4 }),
    });

    expect(result).toBe('ok');
    // 実コストが分かる場合は見積もりではなく実測を記録する
    expect(rec.spend).toBeCloseTo(0.4);
    expect(guard.sessionSpend).toBeCloseTo(0.4);
  });

  it('月間予算を超える呼び出しは例外を投げ、run() を実行しない', async () => {
    const rec = makeRecorder(4.9);
    const guard = new BudgetGuard(limits, rec);
    let ran = false;

    await expect(
      guard.spend({
        kind: 'business_data',
        provider: 'test',
        estimatedCostUsd: 0.5,
        run: async () => {
          ran = true;
          return { value: 'ok' };
        },
      })
    ).rejects.toBeInstanceOf(BudgetExceededError);

    // 「呼んでから止める」ではなく「呼ばずに止める」ことが重要
    expect(ran).toBe(false);
    expect(rec.spend).toBeCloseTo(4.9);
  });

  it('1回の検索の上限も独立して効く', async () => {
    // 月間はまだ余裕があるが、この検索セッションでは使いすぎている状態
    const rec = makeRecorder(0);
    const guard = new BudgetGuard(limits, rec);

    await guard.spend({
      kind: 'business_data',
      provider: 'test',
      estimatedCostUsd: 0.9,
      run: async () => ({ value: 1, actualCostUsd: 0.9 }),
    });

    await expect(
      guard.spend({
        kind: 'business_data',
        provider: 'test',
        estimatedCostUsd: 0.2,
        run: async () => ({ value: 2 }),
      })
    ).rejects.toMatchObject({ detail: { scope: 'per_search' } });
  });

  it('ちょうど上限に等しい場合は通す（超えたときだけ止める）', () => {
    const guard = new BudgetGuard(limits, makeRecorder(4.5));
    expect(() => guard.assertWithinBudget(0.5)).not.toThrow();
    expect(() => guard.assertWithinBudget(0.51)).toThrow(BudgetExceededError);
  });

  it('canSpend は例外を投げずに可否を返す', () => {
    const guard = new BudgetGuard(limits, makeRecorder(4.9));
    expect(guard.canSpend(0.05)).toBe(true);
    expect(guard.canSpend(0.5)).toBe(false);
  });

  it('不正な推定コストは弾く', () => {
    const guard = new BudgetGuard(limits, makeRecorder());
    expect(() => guard.assertWithinBudget(Number.NaN)).toThrow();
    expect(() => guard.assertWithinBudget(-1)).toThrow();
  });
});
