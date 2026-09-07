// AIの出力がJSONにならない場合、3回試して駄目なら null。
// 「それらしい値で埋める」ことを構造的に防いでいる（§9-4）。

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { extractJson, parseWithRetry } from '@/lib/ai/jsonRetry';

const schema = z.object({ score: z.number(), reason: z.string() });

describe('extractJson', () => {
  it('```json フェンスを剥がす', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('前後の説明文を落とす', () => {
    expect(extractJson('はい、結果です:\n{"a":1}\nよろしくお願いします')).toBe('{"a":1}');
  });
  it('そのままのJSONも通す', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
});

describe('parseWithRetry', () => {
  it('1回で成功すればそこで止める', async () => {
    let calls = 0;
    const r = await parseWithRetry(schema, async () => {
      calls++;
      return '{"score": 80, "reason": "良い"}';
    });
    expect(r.value).toEqual({ score: 80, reason: '良い' });
    expect(calls).toBe(1);
  });

  it('失敗したらリトライし、成功したら返す', async () => {
    let calls = 0;
    const r = await parseWithRetry(schema, async () => {
      calls++;
      return calls === 1 ? 'これはJSONではない' : '{"score": 70, "reason": "ok"}';
    });
    expect(r.value?.score).toBe(70);
    expect(r.attempts).toBe(2);
  });

  it('3回失敗したら null を返す（捏造で埋めない）', async () => {
    let calls = 0;
    const r = await parseWithRetry(schema, async () => {
      calls++;
      return 'まったくJSONではない';
    });
    expect(r.value).toBeNull();
    expect(calls).toBe(3);
    expect(r.lastError).not.toBeNull();
  });

  it('スキーマに合わない構造も失敗として扱う', async () => {
    const r = await parseWithRetry(schema, async () => '{"score": "文字列", "reason": 123}');
    expect(r.value).toBeNull();
  });

  it('前回のエラー内容を次の呼び出しに渡す', async () => {
    const errors: (string | null)[] = [];
    await parseWithRetry(schema, async (_attempt, prevError) => {
      errors.push(prevError);
      return 'invalid';
    });
    expect(errors[0]).toBeNull();
    expect(errors[1]).not.toBeNull();
  });
});
