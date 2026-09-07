// API Route共通のレスポンス整形。
// 予算超過は 402 Payment Required で返し、UIが「予算で止まった」ことを
// 通常のエラーと区別できるようにしている。

import { NextResponse } from 'next/server';
import { isBudgetExceeded } from '@/lib/budget/budgetGuard';

export function ok<T>(data: T): NextResponse {
  return NextResponse.json(data);
}

export function fail(error: unknown, fallbackStatus = 500): NextResponse {
  if (isBudgetExceeded(error)) {
    return NextResponse.json(
      { error: error.message, kind: 'BUDGET_EXCEEDED', detail: error.detail },
      { status: 402 }
    );
  }
  const message = error instanceof Error ? error.message : '不明なエラーが発生しました';
  return NextResponse.json({ error: message, kind: 'ERROR' }, { status: fallbackStatus });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message, kind: 'BAD_REQUEST' }, { status: 400 });
}

export function notFound(message = '見つかりませんでした'): NextResponse {
  return NextResponse.json({ error: message, kind: 'NOT_FOUND' }, { status: 404 });
}
