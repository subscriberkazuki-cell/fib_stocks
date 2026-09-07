import Link from 'next/link';
import type { Business } from '@/types/business';
import { PriorityBadge, ScoreBar, Unconfirmed, WebsiteStatusBadge } from './ui';

export function LeadCard({ business: b }: { business: Business }): React.ReactElement {
  const phone = b.phone?.value ?? null;

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/leads/${b.id}`} className="text-base font-semibold hover:underline">
            {b.name}
          </Link>
          <p className="text-xs text-stone-500">
            {b.category || '業種不明'} ・ {b.address || '住所不明'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <PriorityBadge priority={b.salesPriority} />
          <WebsiteStatusBadge status={b.websiteStatus} />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span>
          評価 <strong>{b.rating?.value ?? '—'}</strong>
        </span>
        <span>
          レビュー <strong>{b.reviewCount?.value ?? '—'}</strong>件
        </span>
        <span>
          電話 {phone ? <a href={`tel:${phone}`} className="text-sky-700 underline">{phone}</a> : <Unconfirmed />}
        </span>
        <span>メール {b.email?.value ?? <Unconfirmed />}</span>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-stone-600">
          <span>Lead Score</span>
          <span className="font-semibold text-stone-900">{b.leadScore}</span>
        </div>
        <ScoreBar value={b.leadScore} />
      </div>

      {b.salesAnalysis?.reason && (
        <p className="rounded bg-violet-50 p-2 text-xs text-violet-900">
          <span className="font-medium">AI:</span> {b.salesAnalysis.reason}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {phone && (
          <a href={`tel:${phone}`} className="btn-secondary">電話</a>
        )}
        <Link href={`/leads/${b.id}`} className="btn-secondary">詳細</Link>
        <span className="ml-auto self-center text-xs text-stone-500">{b.leadStatus}</span>
      </div>
    </div>
  );
}
