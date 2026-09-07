import { NextResponse } from 'next/server';
import { listJobs } from '@/lib/db/repository';
import { fail } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ jobs: listJobs(20) });
  } catch (e) {
    return fail(e);
  }
}
