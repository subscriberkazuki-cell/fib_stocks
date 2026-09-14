// 一覧に出すメールアドレスの扱い。
//
// 守っているのは「推測生成したものが表示に混ざらない」こと。
// 画面に出ているアドレスは、必ずどこかのページで実際に確認できたものである、
// という前提が崩れると、営業先に存在しないアドレスを送ることになる。

import { describe, expect, it } from 'vitest';
import { extractEmailsFromHtml, selectBusinessEmail } from '@/lib/analyze/contactExtractor';
import { buildCsv } from '@/lib/csv/exportCsv';
import type { Business } from '@/types/business';
import { sourced } from '@/types/business';

function biz(over: Partial<Business> = {}): Business {
  const now = new Date().toISOString();
  return {
    id: 'b1', source: 't', sourceBusinessId: 's1',
    name: 'テスト店', category: '飲食店', address: '', prefecture: '', city: '',
    latitude: null, longitude: null, phone: null, email: null,
    rating: null, reviewCount: null, websiteUrl: null, websiteStatus: 'none',
    webPresenceScore: 100, websiteOpportunityScore: null, websiteSignals: null,
    candidateUrls: [], socialUrls: [], googleMapsUrl: null, openingHours: null,
    leadScore: 0, leadScoreBreakdown: null, salesPriority: 'D', salesAnalysis: null,
    regulatoryNotes: [], leadStatus: '未接触', nextAction: null, lastContactedAt: null,
    nextContactAt: null, salesNotes: null, dealValue: null,
    phase2CompletedAt: null, lastCheckedAt: null, createdAt: now, updatedAt: now,
    ...over,
  };
}

describe('表示するメールは必ず出所を持つ', () => {
  it('抽出したメールには、どのページで見つけたかが付く', () => {
    const html = '<a href="mailto:info@sample-1.test">お問い合わせ</a>';
    const found = extractEmailsFromHtml(html, 'https://sample-1.test/contact');
    const selected = selectBusinessEmail(found, { fromOfficialSite: true });

    expect(selected).not.toBeNull();
    expect(selected?.sourceUrl).toBe('https://sample-1.test/contact');
  });

  it('SourcedField にした時点で出所URLが保持される', () => {
    const field = sourced('info@sample-1.test', 'official_site', {
      sourceUrl: 'https://sample-1.test/contact',
      verified: true,
    });
    expect(field.sourceUrl).toBe('https://sample-1.test/contact');
    expect(field.source).toBe('official_site');
    expect(field.verified).toBe(true);
  });
});

describe('CSV出力', () => {
  it('メールと出所URLを並べて出す', () => {
    const csv = buildCsv([
      biz({
        email: sourced('info@sample-1.test', 'official_site', {
          sourceUrl: 'https://sample-1.test/contact',
        }),
      }),
    ]);
    expect(csv).toContain('info@sample-1.test');
    expect(csv).toContain('https://sample-1.test/contact');
  });

  it('メールがない店舗は「未確認」と出る（空欄にしない）', () => {
    const csv = buildCsv([biz({ email: null })]);
    const row = csv.split('\r\n')[1] ?? '';
    expect(row).toContain('未確認');
  });
});
