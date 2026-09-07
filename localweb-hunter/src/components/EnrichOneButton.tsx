'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatUsd } from './ui';

export function EnrichOneButton({ id, done }: { id: string; done: boolean }): React.ReactElement {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/businesses/${id}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runAiAnalysis: true }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '調査に失敗しました');

      const d = data as { errors: string[]; actualCostUsd: number };
      setMessage(
        `調査完了（コスト ${formatUsd(d.actualCostUsd)}）` +
          (d.errors.length > 0 ? ` / 注意: ${d.errors[0] ?? ''}` : '')
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '調査に失敗しました');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-secondary" onClick={() => void run()} disabled={running}>
        {running ? '調査中…' : done ? '再調査してHP案を生成' : 'Webを調査してHP案を生成'}
      </button>
      {message && <span className="text-sm text-stone-600">{message}</span>}
    </div>
  );
}
