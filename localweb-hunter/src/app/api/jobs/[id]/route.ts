import { NextResponse } from 'next/server';
import { getJob, getSubQueries } from '@/lib/db/repository';
import { fail, notFound } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const job = getJob(id);
    if (!job) return notFound('ジョブが見つかりません');
    return NextResponse.json({ job, subQueries: getSubQueries(id) });
  } catch (e) {
    return fail(e);
  }
}
