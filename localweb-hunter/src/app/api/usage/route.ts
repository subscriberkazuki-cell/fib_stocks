// コストダッシュボード用（§11-7）

import { NextResponse } from 'next/server';
import {
  getDailySpend,
  getMonthlySpend,
  getUsageBreakdown,
  listRecentUsage,
  listSearchLogs,
  startOfDayIso,
  startOfMonthIso,
  countBusinesses,
} from '@/lib/db/repository';
import { env } from '@/config/env';
import { fail } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const monthlySpend = getMonthlySpend();
    const dailySpend = getDailySpend();
    const businessCount = countBusinesses();

    return NextResponse.json({
      today: { totalUsd: dailySpend, breakdown: getUsageBreakdown(startOfDayIso()) },
      thisMonth: { totalUsd: monthlySpend, breakdown: getUsageBreakdown(startOfMonthIso()) },
      budget: {
        monthlyLimit: env.budget.monthlyUsd,
        monthlyRemaining: Math.max(0, env.budget.monthlyUsd - monthlySpend),
        perSearchLimit: env.budget.perSearchUsd,
      },
      businessCount,
      costPerBusiness: businessCount > 0 ? monthlySpend / businessCount : 0,
      recentUsage: listRecentUsage(30),
      searchLogs: listSearchLogs(10),
    });
  } catch (e) {
    return fail(e);
  }
}
