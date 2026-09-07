// スコア重み・優先度閾値の設定（§8-1, §8-3）
// ここを変えると次回以降のスコアリングに反映される。

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getScoringSettings, saveScoringSettings } from '@/lib/db/repository';
import { badRequest, fail } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(getScoringSettings());
  } catch (e) {
    return fail(e);
  }
}

const weight = z.number().min(0).max(100);
const settingsSchema = z.object({
  weights: z.object({
    rating: weight,
    reviewCount: weight,
    noWebsite: weight,
    hasSns: weight,
    hasPhone: weight,
    localDensity: weight,
    footTraffic: weight,
    webImprovementPotential: weight,
  }),
  thresholds: z.object({
    S: z.number().min(0).max(100),
    A: z.number().min(0).max(100),
    B: z.number().min(0).max(100),
    C: z.number().min(0).max(100),
  }),
});

export async function PUT(req: Request): Promise<NextResponse> {
  try {
    const parsed = settingsSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest(`設定値が不正です: ${parsed.error.issues[0]?.message ?? ''}`);

    const { thresholds } = parsed.data;
    if (!(thresholds.S > thresholds.A && thresholds.A > thresholds.B && thresholds.B > thresholds.C)) {
      return badRequest('優先度の閾値は S > A > B > C の順になっている必要があります。');
    }

    saveScoringSettings(parsed.data);
    return NextResponse.json(getScoringSettings());
  } catch (e) {
    return fail(e);
  }
}
