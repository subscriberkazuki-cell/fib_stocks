'use client';

// スコア重み・優先度閾値の編集（§8-1, §8-3）
// 合計が100でなくてもエラーにはしない。実データの分布を見て
// 「HPなしをもっと重く」といった調整を自由にできる方が実務では役に立つ。
// ただし合計は常に表示して、100からどれだけ離れているかは分かるようにする。

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LeadScoreWeights, PriorityThresholds } from '@/types/business';

const WEIGHT_LABELS: { key: keyof LeadScoreWeights; label: string; hint: string }[] = [
  { key: 'rating', label: 'レビュー評価', hint: '3.0を0点、5.0を満点として正規化' },
  { key: 'reviewCount', label: 'レビュー件数', hint: '対数スケール（500件で頭打ち）' },
  { key: 'noWebsite', label: 'HPなし', hint: '独自HPを持っていない場合に加算' },
  { key: 'hasSns', label: 'SNSはある', hint: 'SNS→HPの導線を提案できる' },
  { key: 'hasPhone', label: '電話番号あり', hint: 'すぐ営業できる' },
  { key: 'localDensity', label: '地域密着ビジネス', hint: '業種プリセットで判定' },
  { key: 'footTraffic', label: '集客型ビジネス', hint: '業種プリセットで判定' },
  { key: 'webImprovementPotential', label: 'Web改善余地', hint: 'Website Opportunity Scoreから算出' },
];

export function WeightsForm({
  initialWeights,
  initialThresholds,
}: {
  initialWeights: LeadScoreWeights;
  initialThresholds: PriorityThresholds;
}): React.ReactElement {
  const router = useRouter();
  const [weights, setWeights] = useState(initialWeights);
  const [thresholds, setThresholds] = useState(initialThresholds);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const total = Object.values(weights).reduce((a, b) => a + b, 0);

  const save = async (): Promise<void> => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/weights', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights, thresholds }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '保存に失敗しました');
      setMessage('保存しました。次回の検索・調査から反映されます。');
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Lead Score の重み</h2>
          <span className={`text-sm ${total === 100 ? 'text-stone-600' : 'text-amber-700'}`}>
            合計 {total}点{total !== 100 && '（100点でなくても保存できます）'}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {WEIGHT_LABELS.map((w) => (
            <div key={w.key}>
              <label className="label" htmlFor={w.key}>
                {w.label}
                <span className="ml-2 font-normal text-stone-400">{weights[w.key]}点</span>
              </label>
              <input
                id={w.key}
                type="range"
                min={0}
                max={50}
                step={1}
                className="w-full"
                value={weights[w.key]}
                onChange={(e) => setWeights({ ...weights, [w.key]: Number(e.target.value) })}
              />
              <p className="text-xs text-stone-500">{w.hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">営業優先度の閾値</h2>
        <p className="text-sm text-stone-600">
          実データが溜まったら分布を見て調整してください。S &gt; A &gt; B &gt; C の順である必要があります。
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          {(['S', 'A', 'B', 'C'] as const).map((p) => (
            <div key={p}>
              <label className="label" htmlFor={`th-${p}`}>{p} 以上</label>
              <input
                id={`th-${p}`}
                type="number"
                min={0}
                max={100}
                className="input"
                value={thresholds[p]}
                onChange={(e) => setThresholds({ ...thresholds, [p]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>
          {saving ? '保存中…' : '設定を保存'}
        </button>
        {message && <span className="text-sm text-stone-600">{message}</span>}
      </div>
      <p className="text-xs text-stone-500">
        保存しても、既存リードのスコアは自動では再計算されません。
        再スコアリングしたい店舗は、詳細画面から「再調査」を実行してください。
      </p>
    </div>
  );
}
