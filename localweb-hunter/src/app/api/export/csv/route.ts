// CSV出力（§11-6）。UTF-8 BOM付きでExcelの文字化けを防ぐ。

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { listBusinesses, type ListFilters } from '@/lib/db/repository';
import { buildCsv, csvFilename } from '@/lib/csv/exportCsv';
import { fail } from '@/lib/api/respond';
import type { LeadPriority, LeadStatus } from '@/types/business';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse | Response> {
  try {
    const sp = req.nextUrl.searchParams;
    const filters: ListFilters = { sort: 'leadScore', limit: 5000 };
    if (sp.get('city')) filters.city = sp.get('city') as string;
    if (sp.get('category')) filters.category = sp.get('category') as string;
    if (sp.get('q')) filters.query = sp.get('q') as string;
    if (sp.get('minPriority')) filters.minPriority = sp.get('minPriority') as LeadPriority;
    if (sp.get('leadStatus')) filters.leadStatus = sp.get('leadStatus') as LeadStatus;
    if (sp.get('requireEmail') === 'true') filters.requireEmail = true;
    if (sp.get('requirePhone') === 'true') filters.requirePhone = true;

    const csv = buildCsv(listBusinesses(filters));

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csvFilename()}"`,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
