import Link from 'next/link';
import type { Business } from '@/types/business';
import { EmailCell } from './ContactCell';
import { PriorityBadge, ScoreBar, WebsiteStatusBadge } from './ui';

/**
 * 一覧のカード。
 *
 * 設計の意図：このツールの目的は「電話をかけること」なので、
 * 電話番号を本文中の小さいリンクではなく、カード内で最も押しやすい要素にしている。
 * 電話がない店舗ではボタン自体を出さず、「電話番号なし」と明示する
 * （押せないボタンを置くより、無いと分かる方が速い）。
 */
export function LeadCard({ business: b }: { business: Business }): React.ReactElement {
  const phone = b.phone?.value ?? null;
  const notContacted = b.leadStatus === '未接触';

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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          評価 <strong>{b.rating?.value ?? '—'}</strong>
        </span>
        <span>
          口コミ <strong>{b.reviewCount?.value ?? '—'}</strong>件
        </span>
        <span className="flex items-center gap-1">
          Lead Score <strong>{b.leadScore}</strong>
          <span className="inline-block w-16 align-middle">
            <ScoreBar value={b.leadScore} label={`Lead Score ${b.leadScore}点`} />
          </span>
        </span>
      </div>

      {/* メールは営業の手段そのものなので、一覧の段階でアドレスまで出す */}
      <div className="flex min-w-0 text-sm">
        <EmailCell email={b.email} compact />
      </div>

      {b.salesAnalysis?.reason && (
        <p className="rounded bg-violet-50 px-2 py-1.5 text-xs text-violet-900">{b.salesAnalysis.reason}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="btn-primary"
            aria-label={`${b.name} に電話する（${phone}）`}
          >
            📞 {phone}
          </a>
        ) : (
          <span className="text-sm text-stone-400">電話番号なし</span>
        )}
        <Link href={`/leads/${b.id}`} className="btn-secondary">
          詳細・営業トーク
        </Link>
        <span
          className={`ml-auto text-xs ${notContacted ? 'text-stone-400' : 'font-medium text-stone-700'}`}
        >
          {b.leadStatus}
        </span>
      </div>
    </div>
  );
}
