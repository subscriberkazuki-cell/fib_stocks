// Phase 1 の保存処理を、DB込みで通す回帰テスト。
//
// 守っているのは、実データ（OSM）の運用で踏んだ不具合：
//   柏駅を取り込んだあと、範囲の重なる柏の葉を検索すると
//   POST /api/search/run が「UNIQUE constraint failed: businesses.id」で500になり、
//   そのエリアの結果が1件も保存されなかった。
//
// 原因は、名前・電話・座標で既存店と同一と判定したのに、
// OSM の要素ID（source_business_id）だけが違う候補だったこと。
// 「id は既存行・(source, source_business_id) は新規」という行を書こうとして、
// ON CONFLICT に拾われず主キーの UNIQUE 制約で落ちていた。

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDbAt } from '@/lib/db/sqlite';
import * as repo from '@/lib/db/repository';
import { runPhase1Job } from '@/lib/orchestrator/phase1';
import type { BudgetGuard } from '@/lib/budget/budgetGuard';
import type { BusinessDataProvider } from '@/lib/providers/BusinessDataProvider';
import type { BusinessCandidate, SearchCriteria } from '@/types/business';
import { DEFAULT_CRITERIA } from '@/config/defaults';

let db: DatabaseSync;
beforeEach(() => {
  db = openDbAt(':memory:');
});
afterEach(() => {
  db.close();
});

function cand(over: Partial<BusinessCandidate> = {}): BusinessCandidate {
  return {
    source: 'osm',
    sourceBusinessId: 'node/1',
    name: 'さくら食堂',
    category: '飲食店',
    address: '千葉県柏市柏1-1-1',
    prefecture: '千葉県',
    city: '柏市',
    latitude: 35.8617,
    longitude: 139.9707,
    rating: null,
    reviewCount: null,
    phone: '04-7100-1111',
    hasWebsiteFieldPopulated: false,
    websiteUrlRaw: null,
    ...over,
  };
}

/** 渡した候補をそのまま1ページで返す、OSM相当のプロバイダ */
function provider(candidates: BusinessCandidate[]): BusinessDataProvider {
  return {
    name: 'osm',
    billable: false,
    searchBusinesses: async () => ({
      businesses: candidates,
      nextCursor: null,
      totalEstimated: candidates.length,
      requestCount: 1,
      itemCount: candidates.length,
      costUsd: 0,
    }),
    getCostModel: () => ({ perRequestUsd: 0, perItemUsd: 0, maxItemsPerRequest: 100 }),
    getProviderStatus: async () => ({ available: true, provider: 'osm', billable: false, message: '' }),
  };
}

const criteria: SearchCriteria = { ...DEFAULT_CRITERIA, categories: ['飲食店'], minRating: 0, minReviewCount: 0 };
// 費用0のプロバイダなので予算ガードは呼ばれない
const budget = {} as unknown as BudgetGuard;

async function search(candidates: BusinessCandidate[]): Promise<Awaited<ReturnType<typeof runPhase1Job>>> {
  const job = repo.createJob(
    criteria,
    [{ label: 't', params: { centerLat: 35.86, centerLng: 139.97, radiusKm: 3, city: '柏市', prefecture: '千葉県', category: '飲食店' } }],
    db,
  );
  return runPhase1Job(job, { provider: provider(candidates), budget, db });
}

function allRows(): { id: string; source_business_id: string; name: string }[] {
  return db.prepare('SELECT id, source_business_id, name FROM businesses').all() as never;
}

describe('既存店と同一判定された候補の保存', () => {
  it('要素IDだけが違う同じ店（範囲の重なる再検索）で、検索全体が落ちない', async () => {
    await search([cand()]);
    const [before] = allRows();

    // 柏の葉側の検索で、同じ店が別の要素IDで返ってきた
    const p = await search([cand({ sourceBusinessId: 'way/999' })]);

    expect(p.errors).toEqual([]);
    expect(p.updated).toBe(1);
    expect(p.created).toBe(0);
    const rows = allRows();
    expect(rows).toHaveLength(1);
    // 既存行の識別子を保つ（営業メモ・履歴がこの id にぶら下がっているため）
    expect(rows[0]!.id).toBe(before!.id);
    expect(rows[0]!.source_business_id).toBe('node/1');
  });

  it('同じ店の後ろにいる別の店も、ちゃんと保存される', async () => {
    await search([cand()]);
    await search([
      cand({ sourceBusinessId: 'way/999' }),
      cand({ sourceBusinessId: 'node/2', name: 'ひまわり亭', phone: '04-7100-2222', latitude: 35.8944, longitude: 139.9524 }),
    ]);
    expect(allRows().map((r) => r.name).sort()).toEqual(['さくら食堂', 'ひまわり亭']);
  });
});

describe('同じ要素IDの店が、改名などで照合候補に入らなかった場合', () => {
  it('新規扱いで別の id を作らず、既存行を更新する', async () => {
    // 電話なし・座標なしで登録された店
    await search([cand({ sourceBusinessId: 'node/5', name: '旧店名', phone: null, latitude: null, longitude: null })]);
    const [before] = allRows();

    // 同じ要素IDのまま改名された。電話も座標もないので、名前でも座標でも引けない
    const p = await search([cand({ sourceBusinessId: 'node/5', name: '新店名', phone: null, latitude: null, longitude: null })]);

    expect(p.errors).toEqual([]);
    const rows = allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(before!.id);
    expect(rows[0]!.name).toBe('新店名');
    // 履歴が実在する行を指している
    const orphan = db.prepare(
      'SELECT COUNT(*) AS n FROM business_history h LEFT JOIN businesses b ON b.id = h.business_id WHERE b.id IS NULL',
    ).get() as { n: number };
    expect(orphan.n).toBe(0);
  });
});
