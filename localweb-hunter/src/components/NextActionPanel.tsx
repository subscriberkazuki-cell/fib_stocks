import type { Business } from '@/types/business';
import { computeNextAction } from '@/lib/scoring/nextAction';
import {
  INTRO_OFFER, applyIntroOffer, estimatedSubsidizedCost, firstYearTotal, getPricing, yen,
} from '@/config/pricing';

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
  const pricing = getPricing(offering.key);

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
        <div>
          <span className="text-stone-500">期間 </span>
          {offering.leadTimeWeeks}
        </div>
      </dl>

      {pricing ? (
        <div className="mt-2 space-y-1 rounded bg-stone-50 p-2 text-xs">
          <div className="flex justify-between">
            <span className="text-stone-600">月額あり</span>
            <span className="font-medium">
              {yen(pricing.withMonthly.initial)}
              {pricing.withMonthly.monthly > 0 && ` + 月${yen(pricing.withMonthly.monthly)}`}
            </span>
          </div>
          {pricing.withMonthly.monthly > 0 && (
            // 月額だけ見せて総額を隠すと不信になるので、初年度の総額も併記する
            <div className="flex justify-between text-stone-500">
              <span>初年度の総額</span>
              <span>{yen(firstYearTotal(pricing.withMonthly))}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-stone-600">買い切り</span>
            <span className="font-medium">{yen(pricing.oneTime.initial)}</span>
          </div>

          {INTRO_OFFER.enabled && (
            <div className="mt-1 flex justify-between border-t border-stone-200 pt-1 text-emerald-800">
              <span>事例掲載の条件で（{INTRO_OFFER.limitCount}件まで）</span>
              <span className="font-medium">{yen(applyIntroOffer(pricing.withMonthly.initial))}</span>
            </div>
          )}

          <p className="pt-1 text-stone-500">
            補助金（補助率2/3）が使えた場合の実質負担の目安:{' '}
            {yen(estimatedSubsidizedCost(pricing.withMonthly.initial))}
            <span className="block">
              ※ウェブ費用のみでの単独申請は不可。採択は保証されないため、商工会議所での確認を案内すること。
            </span>
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-stone-400">
          価格未設定（src/config/pricing.ts の PRICING に設定してください）
        </p>
      )}

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
