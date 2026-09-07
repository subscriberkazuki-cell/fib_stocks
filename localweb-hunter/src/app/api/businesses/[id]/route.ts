// 店舗の取得と、営業メモ・ステータスの更新（§11-4, §11-5）

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBusiness, getHistory, updateCrm } from '@/lib/db/repository';
import { fail, notFound, badRequest } from '@/lib/api/respond';
import { LEAD_STATUSES } from '@/types/business';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const business = getBusiness(id);
    if (!business) return notFound('店舗が見つかりません');
    return NextResponse.json({ business, history: getHistory(id) });
  } catch (e) {
    return fail(e);
  }
}

const crmPatchSchema = z.object({
  leadStatus: z.enum(LEAD_STATUSES).optional(),
  salesNotes: z.string().max(10000).nullable().optional(),
  nextAction: z.string().max(1000).nullable().optional(),
  nextContactAt: z.string().nullable().optional(),
  lastContactedAt: z.string().nullable().optional(),
  dealValue: z.number().min(0).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const parsed = crmPatchSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest(`入力が不正です: ${parsed.error.issues[0]?.message ?? ''}`);

    const updated = updateCrm(id, parsed.data);
    if (!updated) return notFound('店舗が見つかりません');
    return NextResponse.json({ business: updated });
  } catch (e) {
    return fail(e);
  }
}
