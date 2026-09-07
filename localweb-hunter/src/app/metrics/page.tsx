import Link from 'next/link';
import { getMetrics } from '@/lib/db/repository';

export const dynamic = 'force-dynamic';

export default function MetricsPage(): React.ReactElement {
  const m = getMetrics();
  const yen = (v: number): string => `¥${Math.round(v).toLocaleString('ja-JP')}`;
  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

  // 各段階でどれだけ残ったか。件数だけ見ても改善点が分からないので、
  // 「どこで落ちているか」が見える形にしている。
  const funnel = [
    { label: 'リード発見', value: m.leadsFound, from: m.leadsFound },
    { label: '調査済み（Qualified）', value: m.qualifiedLeads, from: m.leadsFound },
    { label: '優先度S', value: m.sTierLeads, from: m.leadsFound },
    { label: '架電した', value: m.callsMade, from: m.leadsFound },
    { label: '担当者に到達', value: m.contactsReached, from: m.callsMade },
    { label: '興味あり', value: m.interested, from: m.contactsReached },
    { label: '提案済', value: m.proposals, from: m.interested },
    { label: '成約', value: m.deals, from: m.proposals },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">営業指標</h1>
        <p className="mt-1 text-sm text-stone-600">
          店舗の取得件数は成功指標ではありません。「100店舗リストアップすると何件成約するか」を測ります。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="成約数" value={`${m.deals}件`} highlight />
        <Stat label="売上" value={yen(m.revenue)} highlight />
        <Stat label="成約率（対リード）" value={pct(m.conversionRate)} />
        <Stat label="100リードあたり売上" value={yen(m.revenuePer100Leads)} />
        <Stat label="平均成約単価" value={m.deals > 0 ? yen(m.averageDealValue) : '—'} />
        <Stat label="リード総数" value={`${m.leadsFound}件`} />
        <Stat label="調査済み" value={`${m.qualifiedLeads}件`} />
        <Stat label="優先度S" value={`${m.sTierLeads}件`} />
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">営業ファネル</h2>
        {m.leadsFound === 0 ? (
          <p className="text-sm text-stone-500">
            まだデータがありません。<Link href="/" className="underline">検索</Link> でリードを集め、
            <Link href="/leads" className="underline">一覧</Link> から営業ステータスを更新すると、ここに反映されます。
          </p>
        ) : (
          <div className="space-y-2">
            {funnel.map((f) => {
              const width = m.leadsFound > 0 ? (f.value / m.leadsFound) * 100 : 0;
              const rate = f.from > 0 ? f.value / f.from : 0;
              return (
                <div key={f.label}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{f.label}</span>
                    <span>
                      <strong>{f.value}</strong>
                      <span className="ml-2 text-xs text-stone-500">
                        前段階から {f.from > 0 ? pct(rate) : '—'}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-stone-200">
                    <div className="h-full rounded bg-stone-700" style={{ width: `${Math.max(width, 0.5)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card text-sm text-stone-600">
        <p className="font-medium text-stone-800">この指標の読み方</p>
        <ul className="ml-4 mt-1 list-disc space-y-1">
          <li>
            架電数・到達数は「現在のステータス」ではなく履歴から数えています。
            電話済 → 成約と進んだリードが架電数から消えないようにするためです。
          </li>
          <li>
            ステータスを変更した時点のLead Scoreがスナップショットとして残るので、
            「高スコアのリードが実際に成約したか」を後から検証できます。
          </li>
          <li>売上は各リードの「成約金額」欄に入力した値の合計です。</li>
        </ul>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}): React.ReactElement {
  return (
    <div className={`card ${highlight ? 'bg-stone-900 text-white' : ''}`}>
      <p className={`text-xs ${highlight ? 'text-stone-300' : 'text-stone-500'}`}>{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
