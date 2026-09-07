import {
  countBusinesses,
  getDailySpend,
  getMonthlySpend,
  getUsageBreakdown,
  listRecentUsage,
  listSearchLogs,
  startOfDayIso,
  startOfMonthIso,
} from '@/lib/db/repository';
import { env } from '@/config/env';
import { formatUsd } from '@/components/ui';

export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<string, string> = {
  business_data: 'ビジネスデータAPI',
  web_search: 'Web検索API',
  ai: 'AI',
  crawler: 'クローラ',
};

export default function CostsPage(): React.ReactElement {
  const monthly = getMonthlySpend();
  const daily = getDailySpend();
  const businessCount = countBusinesses();
  const monthBreakdown = getUsageBreakdown(startOfMonthIso());
  const dayBreakdown = getUsageBreakdown(startOfDayIso());
  const recent = listRecentUsage(30);
  const logs = listSearchLogs(10);

  const remaining = Math.max(0, env.budget.monthlyUsd - monthly);
  const pct = env.budget.monthlyUsd > 0 ? Math.min(100, (monthly / env.budget.monthlyUsd) * 100) : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">コストダッシュボード</h1>

      <div className="card space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">今月の使用額</span>
          <span className="text-2xl font-bold">{formatUsd(monthly)}</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-stone-200">
          <div
            className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-sm text-stone-600">
          月間予算 {formatUsd(env.budget.monthlyUsd)} / 残り {formatUsd(remaining)}
          （1回の検索の上限は {formatUsd(env.budget.perSearchUsd)}）
        </p>
        <p className="text-xs text-stone-500">
          予算を超える外部API呼び出しは、警告ではなく例外を投げて停止します。
          上限は .env.local の MONTHLY_BUDGET_USD / PER_SEARCH_BUDGET_USD で変更できます。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="本日の使用額" value={formatUsd(daily)} />
        <Stat label="今月の使用額" value={formatUsd(monthly)} />
        <Stat label="登録店舗数" value={`${businessCount}件`} />
        <Stat
          label="1店舗あたり平均コスト"
          value={businessCount > 0 ? formatUsd(monthly / businessCount) : '—'}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownCard title="本日の内訳" rows={dayBreakdown} />
        <BreakdownCard title="今月の内訳" rows={monthBreakdown} />
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">検索ログ</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-stone-500">まだ検索履歴がありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-stone-500">
                <tr>
                  <th className="py-1">日時</th>
                  <th>地域</th>
                  <th>業種</th>
                  <th className="text-right">取得</th>
                  <th className="text-right">該当</th>
                  <th className="text-right">新規</th>
                  <th className="text-right">重複</th>
                  <th className="text-right">コスト</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={String(l['id'])} className="border-t border-stone-100">
                    <td className="py-1">{String(l['searched_at']).slice(0, 16).replace('T', ' ')}</td>
                    <td>{String(l['region'])}</td>
                    <td>{String(l['category'])}</td>
                    <td className="text-right">{String(l['result_count'])}</td>
                    <td className="text-right">{String(l['qualified_count'])}</td>
                    <td className="text-right">{String(l['new_business_count'])}</td>
                    <td className="text-right">{String(l['duplicate_count'])}</td>
                    <td className="text-right">{formatUsd(Number(l['total_cost_usd'] ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">API使用履歴</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-stone-500">
            まだ外部APIを呼び出していません（モックデータのみで動作中の場合はここは空のままです）。
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white text-xs text-stone-500">
                <tr>
                  <th className="py-1">日時</th>
                  <th>種別</th>
                  <th>プロバイダ</th>
                  <th className="text-right">req</th>
                  <th className="text-right">件数</th>
                  <th className="text-right">コスト</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((u) => (
                  <tr key={u.id} className="border-t border-stone-100">
                    <td className="py-1">{u.occurredAt.slice(0, 16).replace('T', ' ')}</td>
                    <td>{KIND_LABELS[u.kind] ?? u.kind}</td>
                    <td>{u.provider}</td>
                    <td className="text-right">{u.requestCount}</td>
                    <td className="text-right">{u.itemCount}</td>
                    <td className="text-right">{formatUsd(u.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="card">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: { kind: string; requestCount: number; itemCount: number; costUsd: number }[];
}): React.ReactElement {
  return (
    <div className="card">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-500">記録なし（$0）</p>
      ) : (
        <table className="w-full text-left text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.kind} className="border-t border-stone-100">
                <td className="py-1">{KIND_LABELS[r.kind] ?? r.kind}</td>
                <td className="text-right text-stone-500">{r.requestCount}req</td>
                <td className="text-right font-mono">{formatUsd(r.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
