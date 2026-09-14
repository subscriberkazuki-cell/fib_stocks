// 「次の一手」の判定。
//
// ここが守っているのは「何を提案するかを間違えない」こと。
// 公式サイトが整備済みの店にサイトを提案しても通らないし、
// SNSで集客できている店に5ページのHPを出しても「今で足りてる」で終わる。

import { describe, expect, it } from 'vitest';
import { computeNextAction } from '@/lib/scoring/nextAction';
import { ALL_OFFERINGS, LP_OFFERINGS, SITE_OFFERINGS, findOffering } from '@/config/offerings';
import { INDUSTRY_APPROACHES } from '@/config/approaches';
import { CATEGORY_PRESETS } from '@/config/defaults';
import { PROCEDURE } from '@/config/procedure';
import type { Business, LeadStatus } from '@/types/business';
import { sourced } from '@/types/business';

function biz(over: Partial<Business> = {}): Business {
  const now = new Date().toISOString();
  return {
    id: 'b1', source: 't', sourceBusinessId: 's1',
    name: 'テスト店', category: '飲食店', address: '', prefecture: '', city: '',
    latitude: null, longitude: null,
    phone: sourced('04-7167-1111', 'business_data_provider'),
    email: null, rating: sourced(4.5, 'business_data_provider'),
    reviewCount: sourced(100, 'business_data_provider'),
    websiteUrl: null, websiteStatus: 'none', webPresenceScore: 100,
    websiteOpportunityScore: 100, websiteSignals: null, candidateUrls: [], socialUrls: [],
    googleMapsUrl: null, openingHours: null,
    leadScore: 80, leadScoreBreakdown: null, salesPriority: 'A', salesAnalysis: null,
    regulatoryNotes: [], leadStatus: '未接触', nextAction: null, lastContactedAt: null,
    nextContactAt: null, salesNotes: null, dealValue: null,
    phase2CompletedAt: null, lastCheckedAt: null, createdAt: now, updatedAt: now,
    ...over,
  };
}

describe('提案内容の選択', () => {
  it('HPがない飲食店には公式サイトを提案する', () => {
    const n = computeNextAction(biz({ category: '飲食店', websiteStatus: 'none' }));
    expect(n.primary?.kind).toBe('site');
    expect(n.primary?.key).toBe('site_standard');
  });

  it('整体院のように「まず試してもらう」業態には販売ページを提案する', () => {
    const n = computeNextAction(biz({ category: '整体・リラクゼーション', websiteStatus: 'none' }));
    expect(n.primary?.kind).toBe('lp');
    expect(n.primary?.key).toBe('lp_trial');
  });

  it('古いサイトがある店にはリニューアルを最優先にする', () => {
    // ゼロから作るより話が通りやすいので、業種の標準提案より優先される
    const n = computeNextAction(
      biz({ category: '飲食店', websiteStatus: 'official_low_quality', websiteOpportunityScore: 70 })
    );
    expect(n.primary?.key).toBe('site_renewal');
  });

  it('サイトが整備済みの店にはサイトを提案しない（通らないため）', () => {
    const n = computeNextAction(
      biz({ category: '飲食店', websiteStatus: 'official_good', websiteOpportunityScore: 10 })
    );
    expect(n.primary?.kind).toBe('lp');
  });

  it('SNSだけの店には最小構成から入る', () => {
    const n = computeNextAction(biz({ category: '飲食店', websiteStatus: 'sns_only' }));
    expect(n.primary?.key).toBe('site_onepage');
  });

  it('業種表にない店舗でもWeb状況から提案を決められる', () => {
    const n = computeNextAction(biz({ category: '未知の業種', websiteStatus: 'none' }));
    expect(n.primary).not.toBeNull();
    expect(n.approach).toBeNull();
  });

  it('第一提案と次の提案が同じにならない', () => {
    for (const a of INDUSTRY_APPROACHES) {
      const n = computeNextAction(biz({ category: a.category, websiteStatus: 'none' }));
      expect(n.primary?.key).not.toBe(n.secondary?.key);
    }
  });
});

describe('ステータスごとの次の行動', () => {
  const cases: [LeadStatus, string][] = [
    ['未接触', '電話をかける'],
    ['留守', '時間を変えてかけ直す'],
    ['興味あり', '提案内容を送る'],
    ['提案済', '返答を確認する'],
    ['成約', '成約金額を記録する'],
  ];

  it.each(cases)('%s のとき「%s」を出す', (status, expected) => {
    expect(computeNextAction(biz({ leadStatus: status })).action).toBe(expected);
  });

  it('電話番号がない未接触の店には、まず番号を探すよう促す', () => {
    const n = computeNextAction(biz({ leadStatus: '未接触', phone: null }));
    expect(n.action).toBe('電話番号を確認する');
  });

  it('営業対象外には行動を出さない', () => {
    expect(computeNextAction(biz({ leadStatus: '営業対象外' })).action).toBe('この店舗は対象外です');
  });
});

describe('設定データの整合性', () => {
  it('業種別アプローチが参照するプランがすべて存在する', () => {
    for (const a of INDUSTRY_APPROACHES) {
      expect(findOffering(a.primaryOffering), `${a.category} の第一提案`).not.toBeNull();
      expect(findOffering(a.secondaryOffering), `${a.category} の次の提案`).not.toBeNull();
    }
  });

  it('プランのキーが重複していない', () => {
    const keys = ALL_OFFERINGS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('公式サイトと販売ページの両方が定義されている', () => {
    expect(SITE_OFFERINGS.length).toBeGreaterThan(0);
    expect(LP_OFFERINGS.length).toBeGreaterThan(0);
    expect(SITE_OFFERINGS.every((o) => o.kind === 'site')).toBe(true);
    expect(LP_OFFERINGS.every((o) => o.kind === 'lp')).toBe(true);
  });

  it('業種別アプローチが業種プリセットと対応している', () => {
    const presets = new Set(CATEGORY_PRESETS.map((p) => p.label));
    for (const a of INDUSTRY_APPROACHES) {
      expect(presets.has(a.category), `${a.category} が CATEGORY_PRESETS にない`).toBe(true);
    }
  });

  it('営業手順が1から連番になっている', () => {
    expect(PROCEDURE.map((s) => s.no)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('各プランに納品物と価値の説明がある', () => {
    for (const o of ALL_OFFERINGS) {
      expect(o.deliverables.length, `${o.name} の納品物`).toBeGreaterThan(0);
      expect(o.valueToClient.length, `${o.name} の価値説明`).toBeGreaterThan(10);
    }
  });
});
