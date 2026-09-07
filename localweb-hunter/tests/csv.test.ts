// CSVのBOMが落ちるとExcelで日本語が化ける。仕様として外せないのでテストしている。

import { describe, expect, it } from 'vitest';
import { buildCsv, escapeCsvCell, UTF8_BOM } from '@/lib/csv/exportCsv';
import type { Business } from '@/types/business';
import { sourced } from '@/types/business';

function biz(over: Partial<Business> = {}): Business {
  return {
    id: 'b1', source: 'test', sourceBusinessId: 's1',
    name: 'さくら整体院', category: '整体・リラクゼーション', address: '千葉県柏市旭町1-2-3',
    prefecture: '千葉県', city: '柏市', latitude: 35.86, longitude: 139.97,
    phone: sourced('04-7167-1111', 'business_data_provider'),
    email: null,
    rating: sourced(4.5, 'business_data_provider'),
    reviewCount: sourced(60, 'business_data_provider'),
    websiteUrl: null, websiteStatus: 'none', webPresenceScore: 100,
    websiteOpportunityScore: 100, websiteSignals: null, candidateUrls: [], socialUrls: [],
    googleMapsUrl: null, openingHours: null,
    leadScore: 78, leadScoreBreakdown: null, salesPriority: 'A',
    salesAnalysis: null, regulatoryNotes: [],
    leadStatus: '未接触', nextAction: null, lastContactedAt: null, nextContactAt: null,
    salesNotes: null, dealValue: null,
    phase2CompletedAt: null, lastCheckedAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

describe('escapeCsvCell', () => {
  it('カンマ・改行・引用符を含む値を引用符で包む', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('通常の値はそのまま', () => {
    expect(escapeCsvCell('さくら整体院')).toBe('さくら整体院');
    expect(escapeCsvCell(78)).toBe('78');
  });

  it('null / undefined は空文字', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });
});

describe('buildCsv', () => {
  it('UTF-8 BOM で始まる（Excelでの文字化け防止）', () => {
    expect(buildCsv([biz()]).startsWith(UTF8_BOM)).toBe(true);
    expect(buildCsv([]).charCodeAt(0)).toBe(0xfeff);
  });

  it('CRLF 改行を使う', () => {
    expect(buildCsv([biz()])).toContain('\r\n');
  });

  it('ヘッダーと店舗行を出力する', () => {
    const csv = buildCsv([biz()]);
    expect(csv).toContain('店舗名');
    expect(csv).toContain('さくら整体院');
    expect(csv).toContain('04-7167-1111');
  });

  it('未取得の連絡先は空欄ではなく「未確認」と書く', () => {
    // 空欄だと「調べていない」のか「調べたが無かった」のか区別できない
    const csv = buildCsv([biz({ phone: null, email: null })]);
    const dataLine = csv.split('\r\n')[1] ?? '';
    expect(dataLine).toContain('未確認');
  });

  it('AI生成列であることをヘッダーに明記する', () => {
    const header = buildCsv([]).split('\r\n')[0] ?? '';
    expect(header).toContain('営業理由(AI生成)');
    expect(header).toContain('営業トーク30秒(AI生成)');
  });

  it('連絡先の出所も出力する（検証できるように）', () => {
    const header = buildCsv([]).split('\r\n')[0] ?? '';
    expect(header).toContain('電話番号の出所');
    expect(header).toContain('メールの出所URL');
  });
});
