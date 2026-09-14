import type { Business } from '@/types/business';
import { computeNextAction } from '@/lib/scoring/nextAction';
import { getPricing, yen } from '@/config/pricing';
import {
  ADVISORY_RULES, COMBINABLE_EXPENSES, ROUND_NAME, SCHEDULE, SUBSIDY, SUBSIDY_CONFLICT,
  TRACK_RECORD, VERIFIED_ON, costAtWebCap, estimateSubsidy, screenEligibility,
} from '@/config/subsidy';

/**
 * 補助金の案内。
 *
 * アプリが持っているのは業種と店名だけなので、対象かどうかは確定できない。
 * 「確実に対象外」「要確認」「対象になり得る」の3段階に振り分け、
 * 店主に何を聞けばいいかまで出すところまでにとどめている。
 * 自分が可否を判定してしまうと、外れたときに責任問題になる。
 */
export function SubsidyPanel({ business }: { business: Business }): React.ReactElement {
  const screen = screenEligibility(business.category, business.name);
  const next = computeNextAction(business);
  const pricing = next.primary ? getPricing(next.primary.key) : null;
  const cost = pricing?.withMonthly.initial ?? null;
  const est = cost !== null ? estimateSubsidy(cost) : null;

  if (screen.status === 'likely_ineligible') {
    return (
      <div className="card space-y-2">
        <h2 className="font-semibold">小規模事業者持続化補助金</h2>
        <div className="rounded-md bg-stone-100 p-3 text-sm">
          <p className="font-medium">この店舗は対象外の可能性が高いです</p>
          <ul className="ml-4 mt-1 list-disc">
            {screen.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-2 text-stone-600">補助金の話は持ち出さず、通常の提案で進めてください。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">小規模事業者持続化補助金</h2>
        <span
          className={`badge ${screen.status === 'likely_eligible' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
        >
          {screen.status === 'likely_eligible' ? '対象になり得る' : '要確認'}
        </span>
      </div>

      {/* 先出しモデルとの衝突。ここを読まずに案内すると必ず事故る */}
      <div className="rounded-md border-l-4 border-l-red-600 bg-red-50 p-3 text-sm">
        <p className="font-medium text-red-900">先に売ると、補助金は使えなくなります</p>
        <p className="mt-1 text-red-950">{SUBSIDY_CONFLICT.problem}</p>
        <p className="mt-2 text-red-950">
          <strong>補助金を使いたい店舗には、作ったページを「提案資料」として見せてください。</strong>
          受注は交付決定の後です。提案資料として完成品を見せること自体は問題がなく、
          むしろ申請書の具体性が上がるので採択にも有利に働きます。
        </p>
      </div>

      {est && cost !== null && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="制作費" value={yen(cost)} />
          <Stat label="補助される額（2/3）" value={yen(est.subsidized)} tone="good" />
          <Stat label="店舗の実質負担" value={yen(est.outOfPocket)} tone="good" />
        </div>
      )}

      <div className="space-y-2 text-sm">
        <div>
          <p className="text-xs font-medium text-stone-500">対象判定</p>
          <ul className="ml-4 list-disc">
            {screen.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-md bg-sky-50 p-3">
          <p className="text-xs font-medium text-sky-900">店主に確認すること</p>
          <ul className="ml-4 list-disc text-sky-950">
            {screen.toConfirm.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-stone-700">
          {ROUND_NAME}のスケジュールと条件
        </summary>
        <div className="mt-2 space-y-3">
          <table className="w-full text-left">
            <tbody>
              {[
                ['申請受付', `${SCHEDULE.applicationOpens} 〜 ${SCHEDULE.applicationCloses.replace('T', ' ')}`],
                ['様式4の発行締切', `${SCHEDULE.form4Deadline} ← 申請締切より11日早い`],
                ['採択発表', SCHEDULE.resultAnnouncement],
                ['補助率', '2/3（赤字事業者は3/4）'],
                ['補助上限', `${yen(SUBSIDY.baseCap)}（特例併用で最大${yen(SUBSIDY.maxCap)}）`],
                ['ウェブ関連費の上限', `${yen(SUBSIDY.webCap)}（制作費${yen(costAtWebCap())}相当で頭打ち）`],
                ['採択率', `${(TRACK_RECORD.rate * 100).toFixed(1)}%（${TRACK_RECORD.round}）`],
              ].map(([k, v]) => (
                <tr key={k} className="border-t border-stone-100">
                  <td className="py-1 pr-4 text-stone-600">{k}</td>
                  <td className="py-1">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="rounded-md bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-900">ウェブ費用だけでは申請できません</p>
            <p className="text-amber-950">
              他の販路開拓費と組み合わせる必要があります。組み合わせられる例：
            </p>
            <ul className="ml-4 mt-1 list-disc text-amber-950">
              {COMBINABLE_EXPENSES.slice(0, 4).map((e) => (
                <li key={e.name}>
                  {e.name}（{e.example}）
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-stone-700">案内するときの注意</summary>
        <ul className="ml-4 mt-2 list-disc space-y-1">
          {ADVISORY_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>

      <p className="text-xs text-stone-500">
        {VERIFIED_ON} 時点で確認した{ROUND_NAME}の内容です。制度は公募回ごとに変わります。
        最終的な可否は商工会議所・商工会と事務局が判断します。
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good';
}): React.ReactElement {
  return (
    <div className={`rounded-md p-3 ${tone === 'good' ? 'bg-emerald-50' : 'bg-stone-50'}`}>
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`text-lg font-bold ${tone === 'good' ? 'text-emerald-800' : ''}`}>{value}</p>
    </div>
  );
}
