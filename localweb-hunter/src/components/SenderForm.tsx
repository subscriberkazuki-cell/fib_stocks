'use client';

// 差出人情報の入力。
//
// ここが埋まっていないと営業メールを送れない（特定電子メール法）。
// 「あとで入れよう」で止まったまま忘れるのを防ぐため、
// 未入力の必須項目をその場で赤く出している。

import { useState } from 'react';
import {
  SENDER_FIELDS, type SenderIdentity,
  missingRecommendedSenderFields, missingRequiredSenderFields,
} from '@/config/sender';

export function SenderForm({ initial }: { initial: SenderIdentity }): React.ReactElement {
  const [value, setValue] = useState<SenderIdentity>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const missingRequired = missingRequiredSenderFields(value);
  const missingRecommended = missingRecommendedSenderFields(value);

  const save = async (): Promise<void> => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/sender', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const msg = typeof json === 'object' && json && 'error' in json ? String(json.error) : '保存できませんでした';
        setMessage(msg);
        return;
      }
      setMessage('保存しました');
    } catch {
      setMessage('保存できませんでした');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="font-semibold">差出人情報（営業メールに入ります）</h2>
        <p className="mt-1 text-xs text-stone-600">
          営業目的のメールには、氏名・住所・受信拒否の連絡先の表示が
          <strong>特定電子メール法で義務づけられています。</strong>
          ここが埋まるまで、メールの送信ボタンは押せません。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SENDER_FIELDS.map((f) => {
          const empty = value[f.key].trim() === '';
          return (
            <label key={f.key} className="space-y-1">
              <span className="flex items-baseline gap-2 text-xs font-medium text-stone-600">
                {f.label}
                {f.required ? (
                  <span className="rounded bg-red-100 px-1 text-[10px] text-red-800">必須</span>
                ) : (
                  <span className="rounded bg-stone-100 px-1 text-[10px] text-stone-600">任意</span>
                )}
              </span>
              <input
                type={f.key === 'email' ? 'email' : 'text'}
                value={value[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setValue({ ...value, [f.key]: e.target.value })}
                className={`w-full rounded-md border px-2 py-1.5 text-sm ${
                  f.required && empty ? 'border-red-300 bg-red-50' : 'border-stone-300'
                }`}
              />
              <span className="block text-[11px] text-stone-500">{f.why}</span>
            </label>
          );
        })}
      </div>

      {missingRequired.length > 0 && (
        <p className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-900">
          未入力のため、まだメールを送れません: {missingRequired.join('、')}
        </p>
      )}
      {missingRequired.length === 0 && missingRecommended.length > 0 && (
        <p className="rounded-md bg-stone-100 p-2 text-xs text-stone-700">
          送信はできます。ただし {missingRecommended.join('、')} も入れておくと、相手の警戒が下がります。
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:bg-stone-300"
        >
          {saving ? '保存中…' : '保存'}
        </button>
        {message && <span className="text-sm text-stone-600">{message}</span>}
      </div>
    </div>
  );
}
