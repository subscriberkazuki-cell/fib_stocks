'use client';

// 営業メモ（§11-4）。ユーザーが手で入れた情報なので、
// 再検索・再調査で絶対に上書きされないよう Phase 1/2 側で保護してある。

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LEAD_STATUSES, type Business, type LeadStatus } from '@/types/business';

export function CrmPanel({ business }: { business: Business }): React.ReactElement {
  const router = useRouter();
  const [leadStatus, setLeadStatus] = useState<LeadStatus>(business.leadStatus);
  const [salesNotes, setSalesNotes] = useState(business.salesNotes ?? '');
  const [nextAction, setNextAction] = useState(business.nextAction ?? '');
  const [nextContactAt, setNextContactAt] = useState(business.nextContactAt?.slice(0, 10) ?? '');
  const [dealValue, setDealValue] = useState(business.dealValue?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/businesses/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadStatus,
          salesNotes: salesNotes || null,
          nextAction: nextAction || null,
          nextContactAt: nextContactAt ? new Date(nextContactAt).toISOString() : null,
          dealValue: dealValue ? Number(dealValue) : null,
          // ステータスを「電話済」以降に進めたら、接触日を自動で記録する
          lastContactedAt:
            leadStatus !== '未接触' && !business.lastContactedAt ? new Date().toISOString() : undefined,
        }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '保存に失敗しました');
      setMessage('保存しました');
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">営業メモ</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="leadStatus">ステータス</label>
          <select
            id="leadStatus"
            className="input"
            value={leadStatus}
            onChange={(e) => setLeadStatus(e.target.value as LeadStatus)}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="nextContactAt">次回連絡日</label>
          <input
            id="nextContactAt"
            type="date"
            className="input"
            value={nextContactAt}
            onChange={(e) => setNextContactAt(e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="nextAction">次回アクション</label>
          <input
            id="nextAction"
            className="input"
            value={nextAction}
            placeholder="例: 来週火曜の午前に再架電"
            onChange={(e) => setNextAction(e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="salesNotes">メモ</label>
          <textarea
            id="salesNotes"
            className="input min-h-[100px]"
            value={salesNotes}
            onChange={(e) => setSalesNotes(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="dealValue">成約金額（円）</label>
          <input
            id="dealValue"
            type="number"
            className="input"
            value={dealValue}
            placeholder="成約時に入力"
            onChange={(e) => setDealValue(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
        {message && <span className="text-sm text-stone-600">{message}</span>}
      </div>
      <p className="text-xs text-stone-500">
        ステータスを変更すると、その時点のLead Scoreが履歴に記録されます。
        あとから「どのスコアの店が成約したか」を検証するためです。
      </p>
    </div>
  );
}
