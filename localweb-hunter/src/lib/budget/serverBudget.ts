// サーバー側で BudgetGuard を組み立てる場所。
// env と DB を知っているのはここだけで、BudgetGuard 本体は純粋なので単体テストできる。

import 'server-only';
import { BudgetGuard, type UsageRecorder } from './budgetGuard';
import { env } from '@/config/env';
import { getMonthlySpend, recordUsage } from '@/lib/db/repository';

const dbUsageRecorder: UsageRecorder = {
  getMonthlySpend: () => getMonthlySpend(),
  record: (entry) => recordUsage(entry),
};

export function createBudgetGuard(): BudgetGuard {
  return new BudgetGuard(
    { monthlyUsd: env.budget.monthlyUsd, perSearchUsd: env.budget.perSearchUsd },
    dbUsageRecorder
  );
}
