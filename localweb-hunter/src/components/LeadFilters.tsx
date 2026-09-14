'use client';

// 一覧のフィルタとソート（§11-3）。
// URLクエリに反映するので、絞り込んだ状態をそのままブックマークできる。

import { useRouter, useSearchParams } from 'next/navigation';

const SORTS = [
  { value: 'leadScore', label: 'Lead Score順' },
  { value: 'priority', label: '営業優先度順' },
  { value: 'rating', label: '評価順' },
  { value: 'reviewCount', label: 'レビュー数順' },
  { value: 'updatedAt', label: '更新順' },
];

const STATUSES = ['未接触', '電話済', '留守', '担当者不在', '興味あり', '提案済', '成約', '失注', '保留', '営業対象外'];

export function LeadFilters(): React.ReactElement {
  const router = useRouter();
  const sp = useSearchParams();

  const setParam = (key: string, value: string): void => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/leads?${next.toString()}`);
  };

  const exportUrl = `/api/export/csv?${sp.toString()}`;

  return (
    <div className="card flex flex-wrap items-end gap-3">
      <div className="min-w-[160px] flex-1">
        <label className="label" htmlFor="q">キーワード</label>
        <input
          id="q"
          className="input"
          defaultValue={sp.get('q') ?? ''}
          placeholder="店名・住所・業種"
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', e.currentTarget.value);
          }}
        />
      </div>

      <div>
        <label className="label" htmlFor="sort">並び順</label>
        <select id="sort" className="input" value={sp.get('sort') ?? 'leadScore'} onChange={(e) => setParam('sort', e.target.value)}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="minPriority">優先度</label>
        <select id="minPriority" className="input" value={sp.get('minPriority') ?? ''} onChange={(e) => setParam('minPriority', e.target.value)}>
          <option value="">すべて</option>
          {(['S', 'A', 'B', 'C'] as const).map((p) => (
            <option key={p} value={p}>{p}以上</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="leadStatus">ステータス</label>
        <select id="leadStatus" className="input" value={sp.get('leadStatus') ?? ''} onChange={(e) => setParam('leadStatus', e.target.value)}>
          <option value="">すべて</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={sp.get('requirePhone') === 'true'}
          onChange={(e) => setParam('requirePhone', e.target.checked ? 'true' : '')}
        />
        電話あり
      </label>

      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={sp.get('requireEmail') === 'true'}
          onChange={(e) => setParam('requireEmail', e.target.checked ? 'true' : '')}
        />
        メールあり
      </label>

      <a href={exportUrl} className="btn-secondary ml-auto" download>
        CSV出力
      </a>
    </div>
  );
}
