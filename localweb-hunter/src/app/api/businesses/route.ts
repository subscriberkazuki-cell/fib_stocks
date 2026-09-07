import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { listBusinesses, type ListFilters } from '@/lib/db/repository';
import { fail } from '@/lib/api/respond';
import type { LeadPriority, LeadStatus } from '@/types/business';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const sp = req.nextUrl.searchParams;
    const filters: ListFilters = {
      sort: (sp.get('sort') as ListFilters['sort']) ?? 'leadScore',
      limit: Number(sp.get('limit') ?? 200),
      offset: Number(sp.get('offset') ?? 0),
    };
    if (sp.get('city')) filters.city = sp.get('city') as string;
    if (sp.get('category')) filters.category = sp.get('category') as string;
    if (sp.get('q')) filters.query = sp.get('q') as string;
    if (sp.get('minPriority')) filters.minPriority = sp.get('minPriority') as LeadPriority;
    if (sp.get('leadStatus')) filters.leadStatus = sp.get('leadStatus') as LeadStatus;
    if (sp.get('requireEmail') === 'true') filters.requireEmail = true;
    if (sp.get('requirePhone') === 'true') filters.requirePhone = true;
    if (sp.get('websiteStatuses')) filters.websiteStatuses = (sp.get('websiteStatuses') as string).split(',');

    return NextResponse.json({ businesses: listBusinesses(filters) });
  } catch (e) {
    return fail(e);
  }
}
