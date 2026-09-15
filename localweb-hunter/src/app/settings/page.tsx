import { getScoringSettings, getSenderIdentity } from '@/lib/db/repository';
import { env } from '@/config/env';
import { WeightsForm } from '@/components/WeightsForm';
import { SenderForm } from '@/components/SenderForm';

export const dynamic = 'force-dynamic';

export default function SettingsPage(): React.ReactElement {
  const settings = getScoringSettings();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="mt-1 text-sm text-stone-600">
          スコアの重みと優先度の閾値はここで変更できます。コードには埋め込まれていません。
        </p>
      </div>

      <SenderForm initial={getSenderIdentity()} />

      <WeightsForm initialWeights={settings.weights} initialThresholds={settings.thresholds} />

      <div className="card space-y-2 text-sm">
        <h2 className="font-semibold">環境設定（.env.local で変更）</h2>
        <table className="w-full text-left">
          <tbody>
            {[
              ['BUSINESS_DATA_PROVIDER', env.businessProvider],
              ['SEARCH_PROVIDER', env.searchProvider],
              ['AI_PROVIDER', env.aiProvider],
              ['STORAGE_DRIVER', `${env.storage.driver}（supabase は未実装）`],
              ['MONTHLY_BUDGET_USD', `$${env.budget.monthlyUsd}`],
              ['PER_SEARCH_BUDGET_USD', `$${env.budget.perSearchUsd}`],
              ['SEARCH_RATE_LIMIT_PER_HOUR', `${env.searchRateLimitPerHour}回/時`],
              ['CRAWLER_MIN_INTERVAL_MS', `${env.crawler.minIntervalMs}ms（下限2000msで固定）`],
              ['CRAWLER_TIMEOUT_MS', `${env.crawler.timeoutMs}ms`],
              ['CRAWLER_MAX_RETRIES', `${env.crawler.maxRetries}回`],
              ['CRAWLER_USER_AGENT', env.crawler.userAgent],
              ['CRAWLER_MAX_PAGES_PER_SITE', `${env.crawler.maxPagesPerSite}ページ`],
            ].map(([k, v]) => (
              <tr key={k} className="border-t border-stone-100">
                <td className="py-1 pr-4 font-mono text-xs text-stone-600">{k}</td>
                <td className="py-1 break-all">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-stone-500">
          APIキーはここに表示しません。サーバー側だけで読み込んでいます。
        </p>
      </div>
    </div>
  );
}
