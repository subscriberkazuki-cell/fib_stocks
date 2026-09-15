// 差出人情報の設定。
// 特定電子メール法で表示が義務づけられている項目なので、
// 必須項目が空のまま保存されることは許すが（下書き状態）、
// 送信側（MailButton）が未設定を検出して送信を止める。

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSenderIdentity, saveSenderIdentity } from '@/lib/db/repository';
import { badRequest, fail } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(getSenderIdentity());
  } catch (e) {
    return fail(e);
  }
}

const senderSchema = z.object({
  name: z.string().max(100),
  company: z.string().max(100),
  address: z.string().max(200),
  phone: z.string().max(30),
  // 空文字は「まだ入れていない」として許す。入っているなら形式を見る
  email: z.union([z.literal(''), z.string().email().max(200)]),
});

export async function PUT(req: Request): Promise<NextResponse> {
  try {
    const parsed = senderSchema.safeParse(await req.json());
    if (!parsed.success) {
      return badRequest(`差出人情報が不正です: ${parsed.error.issues[0]?.message ?? ''}`);
    }
    saveSenderIdentity(parsed.data);
    return NextResponse.json(getSenderIdentity());
  } catch (e) {
    return fail(e);
  }
}
