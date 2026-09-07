import { Suspense } from 'react';
import Link from 'next/link';
import { listBusinesses, type ListFilters } from '@/lib/db/repository';
import { LeadCard } from '@/components/LeadCard';
import { LeadFilters } from '@/components/LeadFilters';
import { EnrichButton } from '@/components/EnrichButton';
import type { LeadPriority, LeadStatus } from '@/types/business';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<React.ReactElement> {
  const sp = await searchParams;

  const filters: ListFilters = {
    sort: (single(sp['sort']) as ListFilters['sort']) ?? 'leadScore',
    limit: 200,
  };
  const q = single(sp['q']);
  if (q) filters.query = q;
  const minPriority = single(sp['minPriority']);
  if (minPriority) filters.minPriority = minPriority as LeadPriority;
  const leadStatus = single(sp['leadStatus']);
  if (leadStatus) filters.leadStatus = leadStatus as LeadStatus;
  if (single(sp['requirePhone']) === 'true') filters.requirePhone = true;
  if (single(sp['requireEmail']) === 'true') filters.requireEmail = true;

  const businesses = listBusinesses(filters);
  const all = listBusinesses({ limit: 5000 });
  const remaining = all.filter((b) => b.phase2CompletedAt === null).length;

  const summary = {
    total: all.length,
    shown: businesses.length,
    noWebsite: all.filter((b) =>
      ['none', 'sns_only', 'portal_only', 'multiple_portals', 'profile_only'].includes(b.websiteStatus)
    ).length,
    sTier: all.filter((b) => b.salesPriority === 'S').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">リード一覧</h1>
        <p className="text-sm text-stone-600">
          全{summary.total}件 / 表示{summary.shown}件 / HPなし{summary.noWebsite}件 / 優先度S {summary.sTier}件
        </p>
      </div>

      <Suspense fallback={<div className="card text-sm text-stone-500">読み込み中…</div>}>
        <LeadFilters />
      </Suspense>

      <EnrichButton remaining={remaining} />

      {businesses.length === 0 ? (
        <div className="card text-center text-sm text-stone-600">
          まだリードがありません。
          <Link href="/" className="ml-1 underline">検索画面</Link> から店舗を探してください。
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {businesses.map((b) => (
            <LeadCard key={b.id} business={b} />
          ))}
        </div>
      )}
    </div>
  );
}
