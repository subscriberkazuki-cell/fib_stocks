// 候補1件の保存失敗で、そのエリアの検索結果を全部捨てないこと。
//
// 以前は候補ループに例外の隔離がなく、1件の不整合で検索全体が500になっていた。
// しかもサブクエリは保存前に「完了」になっていたので、再開しても残りの候補は戻らなかった。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';

vi.mock('@/lib/db/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/repository')>();
  return {
    ...actual,
    upsertBusiness: (biz: Parameters<typeof actual.upsertBusiness>[0], db?: DatabaseSync) => {
      if (biz.name === '壊れた店') throw new Error('想定外の制約違反');
      actual.upsertBusiness(biz, db);
    },
  };
});

const { openDbAt } = await import('@/lib/db/sqlite');
const repo = await import('@/lib/db/repository');
const { runPhase1Job } = await import('@/lib/orchestrator/phase1');
const { DEFAULT_CRITERIA } = await import('@/config/defaults');
import type { BusinessCandidate } from '@/types/business';
import type { BudgetGuard } from '@/lib/budget/budgetGuard';

let db: DatabaseSync;
beforeEach(() => {
  db = openDbAt(':memory:');
});
afterEach(() => {
  db.close();
});

function cand(name: string, i: number): BusinessCandidate {
  return {
    source: 'osm', sourceBusinessId: `node/${i}`, name, category: '飲食店',
    address: `千葉県柏市${i}`, prefecture: '千葉県', city: '柏市',
    latitude: 35.86 + i * 0.01, longitude: 139.97, rating: null, reviewCount: null,
    phone: `04-7100-000${i}`, hasWebsiteFieldPopulated: false, websiteUrlRaw: null,
  };
}

describe('候補ループの例外隔離', () => {
  it('1件が失敗しても前後の店は保存され、理由が残り、サブクエリは完了する', async () => {
    const list = [cand('一軒目', 1), cand('壊れた店', 2), cand('三軒目', 3)];
    const job = repo.createJob(
      { ...DEFAULT_CRITERIA, categories: ['飲食店'], minRating: 0, minReviewCount: 0 },
      [{ label: '柏の葉・飲食店', params: { centerLat: 35.89, centerLng: 139.95, radiusKm: 3, city: '柏市', prefecture: '千葉県', category: '飲食店' } }],
      db,
    );
    const p = await runPhase1Job(job, {
      db,
      budget: {} as unknown as BudgetGuard,
      provider: {
        name: 'osm', billable: false,
        searchBusinesses: async () => ({ businesses: list, nextCursor: null, totalEstimated: 3, requestCount: 1, itemCount: 3, costUsd: 0 }),
        getCostModel: () => ({ perRequestUsd: 0, perItemUsd: 0, maxItemsPerRequest: 100 }),
        getProviderStatus: async () => ({ available: true, provider: 'osm', billable: false, message: '' }),
      },
    });

    const names = (db.prepare('SELECT name FROM businesses ORDER BY name').all() as { name: string }[]).map((r) => r.name);
    expect(names).toEqual(['一軒目', '三軒目']);
    expect(p.created).toBe(2);
    expect(p.errors).toHaveLength(1);
    expect(p.errors[0]).toContain('壊れた店');
    expect(p.errors[0]).toContain('node/2');

    const sq = db.prepare('SELECT status FROM search_subqueries WHERE job_id = ?').get(job.id) as { status: string } | undefined;
    expect(sq?.status).toBe('completed');
    const j = db.prepare('SELECT status, error_message FROM search_jobs WHERE id = ?').get(job.id) as { status: string; error_message: string };
    expect(j.status).toBe('completed');
    expect(j.error_message).toContain('壊れた店');
  });
});
