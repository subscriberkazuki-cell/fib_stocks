import type { Business } from '@/types/business';
import { computeNextAction } from '@/lib/scoring/nextAction';
import { priceLabel } from '@/config/offerings';

/**
 * 「この店に次に何をするか」を1箇所にまとめたパネル。
 *
 * 詳細画面を開いた人が、スクロールして情報を読み解かなくても
 * 「電話をかける → この切り口で入る → これを提案する」まで一息で行けるようにしている。
 * 判定はルールベースなので、AIを設定していなくても必ず表示される。
 */
export function NextActionPanel({ business }: { business: Business }): React.ReactElement {
  const next = computeNextAction(business);
  const phone = business.phone?.value ?? null;

  return (
    <div className="card space-y-4 border-l-4 border-l-stone-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">次の一手</h2>
        <span className="text-xs text-stone-500">現在のステータス: {business.leadStatus}</span>
      </div>

      <div className="rounded-md bg-stone-900 p-3 text-white">
        <p className="text-lg font-bold">{next.action}</p>
        <p className="mt-1 text-sm text-stone-300">{next.why}</p>
        {phone && business.leadStatus === '未接触' && (
          <a
            href={`tel:${phone}`}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-stone-900 hover:bg-stone-200"
            aria-label={`${business.name} に電話する（${phone}）`}
          >
            📞 {phone} にかける
          </a>
        )}
      </div>

      {next.approach && (
        <div className="space-y-2">
          <div>
            <p className="text-xs font-medium text-stone-500">この業種が抱えている取りこぼし</p>
            <p className="text-sm">{next.approach.painPoint}</p>
          </div>
          <div className="rounded-md bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-900">電話の切り口（そのまま言えます）</p>
            <p className="mt-1 text-sm text-amber-950">「{next.approach.hook}」</p>
          </div>
          <div className="rounded-md bg-red-50 p-3">
            <p className="text-xs font-medium text-red-900">この業種での注意点</p>
            <p className="mt-1 text-sm text-red-950">{next.approach.caution}</p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {next.primary && <OfferingCard offering={next.primary} rank="第一提案" />}
        {next.secondary && next.secondary.key !== next.primary?.key && (
          <OfferingCard offering={next.secondary} rank="話が進んだら" />
        )}
      </div>
    </div>
  );
}

function OfferingCard({
  offering,
  rank,
}: {
  offering: ReturnType<typeof computeNextAction>['primary'];
  rank: string;
}): React.ReactElement | null {
  if (!offering) return null;
  const price = priceLabel(offering.key);

  return (
    <div className="rounded-md border border-stone-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge bg-stone-100 text-stone-600">{rank}</span>
        <span
          className={`badge ${offering.kind === 'lp' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}
        >
          {offering.kind === 'lp' ? '販売ページ' : '公式サイト'}
        </span>
      </div>

      <p className="mt-2 font-semibold">{offering.name}</p>
      <p className="text-xs text-stone-600">{offering.summary}</p>

      <dl className="mt-2 space-y-1 text-xs">
        <div>
          <dt className="text-stone-500">相手にとっての価値</dt>
          <dd>{offering.valueToClient}</dd>
        </div>
        <div className="flex gap-4">
          <span>
            <span className="text-stone-500">期間 </span>
            {offering.leadTimeWeeks}
          </span>
          <span>
            <span className="text-stone-500">価格 </span>
            {price === '未設定' ? (
              <span className="text-stone-400" title="src/config/offerings.ts の PRICE_HINTS に自分の価格を設定してください">
                未設定
              </span>
            ) : (
              price
            )}
          </span>
        </div>
      </dl>

      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-stone-600">納品物</summary>
        <ul className="ml-4 mt-1 list-disc">
          {offering.deliverables.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
