import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * 環境変数の読み取り。
 *
 * ここで確かめたいのは値の変換ではなく、**未実装の設定を黙って無視しないこと。**
 * 「クラウドに保存しているつもりで、実際は手元のファイルに書いていた」が
 * 最悪の勘違いなので、設定した時点で落ちる必要がある。
 */
async function loadEnv(vars: Record<string, string | undefined>): Promise<typeof import('@/config/env')> {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import('@/config/env');
}

const touched = ['STORAGE_DRIVER', 'BUSINESS_DATA_PROVIDER', 'MONTHLY_BUDGET_USD'];

afterEach(() => {
  for (const k of touched) delete process.env[k];
  vi.resetModules();
});

describe('保存先の設定', () => {
  it('既定は sqlite', async () => {
    const { env } = await loadEnv({ STORAGE_DRIVER: undefined });
    expect(env.storage.driver).toBe('sqlite');
  });

  it('未実装の supabase を指定したら、黙って sqlite に落とさず失敗する', async () => {
    // 黙ってフォールバックすると、クラウドに保存しているつもりで
    // 手元のファイルに書き続けることになる
    await expect(loadEnv({ STORAGE_DRIVER: 'supabase' })).rejects.toThrow('実装されていません');
  });

  it('知らない値も失敗させる', async () => {
    await expect(loadEnv({ STORAGE_DRIVER: 'mysql' })).rejects.toThrow('STORAGE_DRIVER');
  });
});

describe('他の設定は、知らない値なら既定に戻す', () => {
  it('データプロバイダは既定が mock', async () => {
    const { env } = await loadEnv({ BUSINESS_DATA_PROVIDER: 'そんなものはない' });
    expect(env.businessProvider).toBe('mock');
  });

  it('予算は数値でなければ既定に戻す', async () => {
    const { env } = await loadEnv({ MONTHLY_BUDGET_USD: 'たくさん' });
    expect(env.budget.monthlyUsd).toBe(5);
  });
});
