// Phase 2 バッチの締め切り制御。
//
// 守っているもの：1店舗あたり最大12秒以上かかるのに25件を素直に回すと
// maxDuration(300秒) を突き抜けてプロセスごと殺され、
// 「何件終わったか」すらクライアントに返らなくなる。

import { describe, expect, it } from 'vitest';
import { estimatePerBusinessMs, runPhase2Batch } from '@/lib/orchestrator/phase2Batch';
import { passesPostEnrichFilter } from '@/lib/orchestrator/phase1Rules';
import type { Business } from '@/types/business';
import { sourced } from '@/types/business';

describe('estimatePerBusinessMs', () => {
  it('クロール間隔とページ数から所要時間を見積もる', () => {
    // robots 1 + 本体 1 + 連絡先ページ 4 + 公式サイト判定 3 = 9リクエスト
    expect(estimatePerBusinessMs(2000, 5)).toBe(9 * 2000);
  });

  it('間隔が長いほど見積もりも長くなる', () => {
    expect(estimatePerBusinessMs(4000, 5)).toBeGreaterThan(estimatePerBusinessMs(2000, 5));
  });
});

function stubBusiness(name: string): Business {
  const now = new Date().toISOString();
  return {
    id: name, source: 't', sourceBusinessId: name, name,
    category: '', address: '', prefecture: '', city: '',
    latitude: null, longitude: null, phone: null, email: null,
    rating: null, reviewCount: null, websiteUrl: null, websiteStatus: 'none',
    webPresenceScore: 100, websiteOpportunityScore: null, websiteSignals: null,
    candidateUrls: [], socialUrls: [], googleMapsUrl: null, openingHours: null,
    leadScore: 0, leadScoreBreakdown: null, salesPriority: 'D', salesAnalysis: null,
    regulatoryNotes: [], leadStatus: '未接触', nextAction: null, lastContactedAt: null,
    nextContactAt: null, salesNotes: null, dealValue: null,
    phase2CompletedAt: null, lastCheckedAt: null, createdAt: now, updatedAt: now,
  };
}

describe('runPhase2Batch の締め切り制御', () => {
  it('締め切りを過ぎていれば1件も着手しない', async () => {
    const targets = [stubBusiness('a'), stubBusiness('b')];
    const deps = { minIntervalMs: 2000, maxPagesPerSite: 5 } as never;

    const result = await runPhase2Batch(targets, deps, {
      runAiAnalysis: false,
      deadlineAt: Date.now() - 1000, // すでに期限切れ
    });

    expect(result.enriched).toBe(0);
    expect(result.stoppedByDeadline).toBe(true);
  });

  it('残り時間が1店舗分に満たなければ着手せず打ち切る', async () => {
    const targets = [stubBusiness('a')];
    const deps = { minIntervalMs: 2000, maxPagesPerSite: 5 } as never;

    // 1店舗に18秒必要なところ、残り5秒しかない
    const result = await runPhase2Batch(targets, deps, {
      runAiAnalysis: false,
      deadlineAt: Date.now() + 5000,
    });

    expect(result.enriched).toBe(0);
    expect(result.stoppedByDeadline).toBe(true);
  });
});

describe('passesPostEnrichFilter', () => {
  const base = { websiteStatus: 'none' as const, email: null, phone: null };
  const withEmail = { ...base, email: sourced('a@b.jp', 'official_site') };
  const withPhone = { ...base, phone: sourced('0471671111', 'business_data_provider') };

  it('条件が緩ければ通す', () => {
    expect(passesPostEnrichFilter(base, { includeSnsOnly: true, requireEmail: false, requirePhone: false })).toBe(true);
  });

  it('「SNSのみを含まない」設定で sns_only を落とす', () => {
    // 以前はこの設定がどこからも読まれておらず、チェックボックスが黙って無効だった
    expect(
      passesPostEnrichFilter(
        { ...base, websiteStatus: 'sns_only' },
        { includeSnsOnly: false, requireEmail: false, requirePhone: false }
      )
    ).toBe(false);
    expect(
      passesPostEnrichFilter(
        { ...base, websiteStatus: 'sns_only' },
        { includeSnsOnly: true, requireEmail: false, requirePhone: false }
      )
    ).toBe(true);
  });

  it('「メールがある店舗のみ」を適用する', () => {
    expect(passesPostEnrichFilter(base, { includeSnsOnly: true, requireEmail: true, requirePhone: false })).toBe(false);
    expect(passesPostEnrichFilter(withEmail, { includeSnsOnly: true, requireEmail: true, requirePhone: false })).toBe(true);
  });

  it('「電話がある店舗のみ」を適用する', () => {
    expect(passesPostEnrichFilter(base, { includeSnsOnly: true, requireEmail: false, requirePhone: true })).toBe(false);
    expect(passesPostEnrichFilter(withPhone, { includeSnsOnly: true, requireEmail: false, requirePhone: true })).toBe(true);
  });
});
