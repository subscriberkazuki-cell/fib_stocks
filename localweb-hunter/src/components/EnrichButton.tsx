'use client';

// 未調査の店舗をまとめてPhase 2にかけるボタン。
// 検索時のバッチ上限で残った分を、ここから少しずつ進める。

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatUsd } from './ui';

export function EnrichButton({ remaining }: { remaining: number }): React.ReactElement | null {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (remaining === 0) return null;

  const run = async (): Promise<void> => {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch('/api/enrich/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10, runAiAnalysis: true }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? '調査に失敗しました');

      const d = data as { enriched: number; remaining: number; stoppedByBudget: boolean; actualCostUsd: number; errors: string[] };
      const parts = [`${d.enriched}件を調査しました（残り${d.remaining}件・コスト ${formatUsd(d.actualCostUsd)}）`];
      if (d.stoppedByBudget) parts.push('⚠️ 予算上限で停止しました');
      if (d.errors.length > 0) parts.push(`エラー${d.errors.length}件`);
      setMessage(parts.join(' / '));
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '調査に失敗しました');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card flex flex-wrap items-center gap-3 bg-sky-50">
      <span className="text-sm">
        未調査の店舗が <strong>{remaining}件</strong> あります。Phase 2（サイト解析・メール探索・AI分析）を実行できます。
      </span>
      <button type="button" className="btn-primary" onClick={() => void run()} disabled={running}>
        {running ? '調査中…' : '10件ずつ調査する'}
      </button>
      {message && <span className="text-sm text-stone-700">{message}</span>}
    </div>
  );
}
