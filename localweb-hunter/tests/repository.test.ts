// リポジトリ層の回帰テスト。
//
// ここで守っているのは、実際に発生していた3つの不具合：
//   1. Phase 2 の対象を「LIMITしてからfilter」していたため、
//      上位が調査済みになると対象が0件になり Phase 2 が永久に進まなかった
//   2. 未調査件数を「全行取得してJSでcount」していたため、
//      取得上限を超えると静かに過小報告になっていた
//   3. 電話番号の照合をSQL側の replace() 連打でやっていたため、
//      全角表記の番号が重複排除の候補から漏れていた

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  countPendingPhase2,
  findDedupeCandidates,
  getLeadSummary,
  listBusinesses,
  upsertBusiness,
} from '@/lib/db/repository';
import type { Business } from '@/types/business';
import { sourced } from '@/types/business';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(readFileSync('src/lib/db/schema.sql', 'utf8'));
});

afterEach(() => {
  db.close();
});

function biz(over: Partial<Business> = {}): Business {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    source: 'test',
    sourceBusinessId: randomUUID(),
    name: 'テスト店',
    category: '飲食店',
    address: '千葉県柏市1-1-1',
    prefecture: '千葉県',
    city: '柏市',
    latitude: 35.86,
    longitude: 139.97,
    phone: null,
    email: null,
    rating: sourced(4.5, 'business_data_provider'),
    reviewCount: sourced(50, 'business_data_provider'),
    websiteUrl: null,
    websiteStatus: 'none',
    webPresenceScore: 100,
    websiteOpportunityScore: null,
    websiteSignals: null,
    candidateUrls: [],
    socialUrls: [],
    googleMapsUrl: null,
    openingHours: null,
    leadScore: 50,
    leadScoreBreakdown: null,
    salesPriority: 'B',
    salesAnalysis: null,
    regulatoryNotes: [],
    leadStatus: '未接触',
    nextAction: null,
    lastContactedAt: null,
    nextContactAt: null,
    salesNotes: null,
    dealValue: null,
    phase2CompletedAt: null,
    lastCheckedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe('Phase 2 の対象選択', () => {
  it('上位が調査済みでも、未調査の店舗を取りこぼさない', () => {
    // 高スコアの30件は調査済み、低スコアの50件が未調査、という状況を作る
    for (let i = 0; i < 30; i++) {
      upsertBusiness(biz({ leadScore: 100 - i, phase2CompletedAt: new Date().toISOString() }), db);
    }
    for (let i = 0; i < 50; i++) {
      upsertBusiness(biz({ leadScore: 60 - (i % 20), phase2CompletedAt: null }), db);
    }

    const targets = listBusinesses({ phase2Done: false, sort: 'leadScore', limit: 25 }, db);

    // 以前の実装（LIMIT 25 してから filter）ではここが 0 になっていた
    expect(targets).toHaveLength(25);
    expect(targets.every((t) => t.phase2CompletedAt === null)).toBe(true);
  });

  it('未調査のものを Lead Score の高い順に返す', () => {
    upsertBusiness(biz({ leadScore: 30 }), db);
    upsertBusiness(biz({ leadScore: 90 }), db);
    upsertBusiness(biz({ leadScore: 60 }), db);

    const targets = listBusinesses({ phase2Done: false, sort: 'leadScore', limit: 10 }, db);
    expect(targets.map((t) => t.leadScore)).toEqual([90, 60, 30]);
  });

  it('phase2Done: true で調査済みだけを返す', () => {
    upsertBusiness(biz({ phase2CompletedAt: new Date().toISOString() }), db);
    upsertBusiness(biz({ phase2CompletedAt: null }), db);

    expect(listBusinesses({ phase2Done: true }, db)).toHaveLength(1);
    expect(listBusinesses({ phase2Done: false }, db)).toHaveLength(1);
    expect(listBusinesses({}, db)).toHaveLength(2);
  });
});

describe('件数の集計', () => {
  it('1,000件を超えても未調査件数を正しく数える', () => {
    for (let i = 0; i < 1200; i++) upsertBusiness(biz({ phase2CompletedAt: null }), db);
    for (let i = 0; i < 50; i++) {
      upsertBusiness(biz({ phase2CompletedAt: new Date().toISOString() }), db);
    }
    // 以前は全行を limit 1000 で取ってJSで数えていたため 970 と報告していた
    expect(countPendingPhase2(db)).toBe(1200);
  });

  it('サマリーを1クエリで返す', () => {
    upsertBusiness(biz({ websiteStatus: 'none', salesPriority: 'S', phone: sourced('04-7167-1111', 'business_data_provider') }), db);
    upsertBusiness(biz({ websiteStatus: 'sns_only', salesPriority: 'A' }), db);
    upsertBusiness(biz({ websiteStatus: 'official_good', salesPriority: 'D', phase2CompletedAt: new Date().toISOString() }), db);

    const s = getLeadSummary(db);
    expect(s.total).toBe(3);
    expect(s.noWebsite).toBe(2);      // none + sns_only
    expect(s.sTier).toBe(1);
    expect(s.pendingPhase2).toBe(2);
    expect(s.withPhone).toBe(1);
    expect(s.withEmail).toBe(0);
  });
});

describe('電話番号による重複候補の検索', () => {
  it('全角で登録された番号も候補として引ける', () => {
    // 以前はSQL側で replace() を重ねていたため、全角表記が候補から漏れていた
    upsertBusiness(
      biz({ name: '全角店', phone: sourced('０４－７１６７－１１１１', 'business_data_provider') }),
      db
    );

    const found = findDedupeCandidates(
      { normalizedPhone: '0471671111', name: '別名', latitude: null, longitude: null },
      db
    );
    expect(found.map((f) => f.name)).toContain('全角店');
  });

  it('括弧付きの表記も引ける', () => {
    upsertBusiness(
      biz({ name: '代表付き店', phone: sourced('04-7167-1111（代表）', 'business_data_provider') }),
      db
    );

    const found = findDedupeCandidates(
      { normalizedPhone: '0471671111', name: '別名', latitude: null, longitude: null },
      db
    );
    expect(found.map((f) => f.name)).toContain('代表付き店');
  });

  it('別の番号は引っかからない', () => {
    upsertBusiness(biz({ name: '他店', phone: sourced('04-7100-0000', 'business_data_provider') }), db);

    const found = findDedupeCandidates(
      { normalizedPhone: '0471671111', name: '無関係', latitude: null, longitude: null },
      db
    );
    expect(found.map((f) => f.name)).not.toContain('他店');
  });
});
