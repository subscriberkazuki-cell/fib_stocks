// 画面をまたいで使う小さな表示部品。
// 「未確認」と「値がある」の描き分けをここに集約している。
// 空欄で済ませると「調べていない」のか「無かった」のか区別できないため。

import type { LeadPriority, WebsiteStatus } from '@/types/business';

const PRIORITY_STYLES: Record<LeadPriority, string> = {
  S: 'bg-red-100 text-red-800 ring-1 ring-red-300',
  A: 'bg-orange-100 text-orange-800 ring-1 ring-orange-300',
  B: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  C: 'bg-lime-100 text-lime-800 ring-1 ring-lime-300',
  D: 'bg-stone-100 text-stone-600 ring-1 ring-stone-300',
};

export function PriorityBadge({ priority }: { priority: LeadPriority }): React.ReactElement {
  return <span className={`badge ${PRIORITY_STYLES[priority]}`}>優先度 {priority}</span>;
}

const STATUS_LABELS: Record<WebsiteStatus, { label: string; style: string }> = {
  none: { label: 'HPなし', style: 'bg-red-100 text-red-800' },
  profile_only: { label: 'プロフィールのみ', style: 'bg-red-100 text-red-800' },
  multiple_portals: { label: 'ポータルのみ(複数)', style: 'bg-orange-100 text-orange-800' },
  portal_only: { label: 'ポータルのみ', style: 'bg-orange-100 text-orange-800' },
  sns_only: { label: 'SNSのみ', style: 'bg-amber-100 text-amber-800' },
  official_low_quality: { label: 'HPあり(改善余地大)', style: 'bg-sky-100 text-sky-800' },
  official_good: { label: 'HPあり(整備済)', style: 'bg-emerald-100 text-emerald-800' },
  unknown: { label: '未調査', style: 'bg-stone-100 text-stone-600' },
};

export function WebsiteStatusBadge({ status }: { status: WebsiteStatus }): React.ReactElement {
  const s = STATUS_LABELS[status];
  return <span className={`badge ${s.style}`}>{s.label}</span>;
}

/** 値がないときに「未確認」と明示する。捏造しない代わりに、状態は正直に見せる（§2-3） */
export function Unconfirmed(): React.ReactElement {
  return <span className="text-stone-400">未確認</span>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="text-sm text-stone-900">{children}</dd>
    </div>
  );
}

/** AI生成であることを明示するラベル。実データと混ざって見えないようにする（§2-3） */
export function AiBadge({ model }: { model?: string }): React.ReactElement {
  return (
    <span
      className="badge bg-violet-100 text-violet-800"
      title={model ? `生成モデル: ${model}` : undefined}
    >
      AI生成（要確認）
    </span>
  );
}

export function ScoreBar({
  value,
  max = 100,
  label,
}: {
  value: number;
  max?: number;
  label?: string;
}): React.ReactElement {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200"
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ?? `スコア ${value} / ${max}`}
    >
      <div className="h-full rounded-full bg-stone-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function formatUsd(v: number): string {
  if (v === 0) return '$0.00';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}
