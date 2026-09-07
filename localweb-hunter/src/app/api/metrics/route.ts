// ビジネス指標（§13）。「何件集めたか」ではなく「何件成約したか」を測る。

import { NextResponse } from 'next/server';
import { getMetrics } from '@/lib/db/repository';
import { fail } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ metrics: getMetrics() });
  } catch (e) {
    return fail(e);
  }
}
