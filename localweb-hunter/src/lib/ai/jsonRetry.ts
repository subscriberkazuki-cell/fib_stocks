// AI出力のJSONパース + リトライ（§9-4）
//
// 3回失敗したら null を返す。無理にパースして壊れた値を通さないこと。
// null は「AIが判断できなかった」という正しい状態であり、埋めるべきではない。

import type { z } from 'zod';

export interface ParseAttemptResult<T> {
  value: T | null;
  attempts: number;
  lastError: string | null;
}

/** ```json フェンスや前後の説明文が付いてきた場合に、JSON部分だけ取り出す */
export function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;

  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start !== -1 && end > start) return body.slice(start, end + 1);
  return body.trim();
}

export async function parseWithRetry<T>(
  schema: z.ZodType<T>,
  call: (attempt: number, previousError: string | null) => Promise<string>,
  maxAttempts = 3
): Promise<ParseAttemptResult<T>> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const raw = await call(attempt, lastError);
      const parsed: unknown = JSON.parse(extractJson(raw));
      const result = schema.safeParse(parsed);
      if (result.success) return { value: result.data, attempts: attempt, lastError: null };

      lastError = result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(' / ');
    } catch (e) {
      lastError = e instanceof Error ? e.message : '不明なエラー';
    }
  }

  return { value: null, attempts: maxAttempts, lastError };
}
