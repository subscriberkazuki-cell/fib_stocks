// 重複排除のバグは「静かにリストの質を下げる」タイプなので、
// 特にテナントビル・チェーン本部番号のケースを重点的に確認する。

import { describe, expect, it } from 'vitest';
import {
  dedupeBatch,
  distanceMeters,
  findDuplicate,
  normalizeAddress,
  normalizeName,
} from '@/lib/dedupe/dedupe';
import type { Business, BusinessCandidate } from '@/types/business';
import { sourced } from '@/types/business';

function candidate(over: Partial<BusinessCandidate> = {}): BusinessCandidate {
  return {
    sourceBusinessId: 'c1',
    source: 'test',
    name: 'さくら整体院',
    category: '整体・リラクゼーション',
    address: '千葉県柏市旭町1-2-3',
    prefecture: '千葉県',
    city: '柏市',
    latitude: 35.8617,
    longitude: 139.9707,
    rating: 4.5,
    reviewCount: 60,
    phone: '04-7167-1111',
    hasWebsiteFieldPopulated: false,
    websiteUrlRaw: null,
    ...over,
  };
}

function business(over: Partial<Business> = {}): Business {
  const c = candidate();
  return {
    id: 'b1',
    source: 'test',
    sourceBusinessId: 'e1',
    name: c.name,
    category: c.category,
    address: c.address,
    prefecture: c.prefecture,
    city: c.city,
    latitude: c.latitude,
    longitude: c.longitude,
    phone: sourced('04-7167-1111', 'business_data_provider'),
    email: null,
    rating: sourced(4.5, 'business_data_provider'),
    reviewCount: sourced(60, 'business_data_provider'),
    websiteUrl: null,
    websiteStatus: 'none',
    webPresenceScore: 100,
    websiteOpportunityScore: null,
    websiteSignals: null,
    candidateUrls: [],
    socialUrls: [],
    googleMapsUrl: null,
    openingHours: null,
    leadScore: 70,
    leadScoreBreakdown: null,
    salesPriority: 'A',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('distanceMeters', () => {
  it('同一地点は0m', () => {
    expect(distanceMeters(35.8617, 139.9707, 35.8617, 139.9707)).toBe(0);
  });

  it('緯度0.001度は約111m', () => {
    const d = distanceMeters(35.8617, 139.9707, 35.8627, 139.9707);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  it('座標が欠けていれば null（距離不明を0mと誤認しない）', () => {
    expect(distanceMeters(null, 139.97, 35.86, 139.97)).toBeNull();
    expect(distanceMeters(35.86, 139.97, 35.86, null)).toBeNull();
  });
});

describe('normalizeName / normalizeAddress', () => {
  it('記号・空白・法人格の表記ゆれを吸収する', () => {
    expect(normalizeName('株式会社 さくら整体院')).toBe(normalizeName('さくら整体院'));
    expect(normalizeName('さくら・整体院')).toBe(normalizeName('さくら整体院'));
    expect(normalizeName('ＡＢＣ　クリニック')).toBe(normalizeName('abcクリニック'));
  });

  it('丁目・番地・号とハイフンの混在を吸収する', () => {
    expect(normalizeAddress('千葉県柏市旭町1丁目2番3号')).toBe(normalizeAddress('千葉県柏市旭町1-2-3'));
  });
});

describe('findDuplicate', () => {
  it('source + source_business_id が一致すれば即同一', () => {
    const existing = business({ sourceBusinessId: 'c1', name: '全く別の名前' });
    const match = findDuplicate(candidate({ sourceBusinessId: 'c1' }), [existing]);
    expect(match?.reason).toBe('source_id');
  });

  it('電話番号が一致し座標も近ければ同一とみなす', () => {
    const existing = business({ latitude: 35.86175, longitude: 139.97075, name: '別名だが同じ店' });
    const match = findDuplicate(candidate(), [existing]);
    expect(match?.reason).toBe('phone_and_location');
    expect(match?.distanceM).toBeLessThan(100);
  });

  it('電話番号が一致しても離れていれば統合しない（テナントビル・チェーン本部対策）', () => {
    // 同じ代表番号だが 1km 以上離れている = 別店舗の可能性が高い
    const existing = business({ latitude: 35.8717, longitude: 139.9707, name: '別の店舗' });
    const match = findDuplicate(candidate(), [existing]);
    expect(match).toBeNull();
  });

  it('フリーダイヤル一致だけでは統合しない', () => {
    const existing = business({
      phone: sourced('0120-123-456', 'business_data_provider'),
      latitude: 35.86171,
      longitude: 139.97071,
      name: 'チェーンA 松戸店',
    });
    const match = findDuplicate(
      candidate({ phone: '0120-123-456', name: 'チェーンA 柏店' }),
      [existing]
    );
    expect(match).toBeNull();
  });

  it('店名 + 住所の一致で統合する（座標がなくても拾える）', () => {
    const existing = business({
      phone: null,
      latitude: null,
      longitude: null,
      address: '千葉県柏市旭町1丁目2番3号',
    });
    const match = findDuplicate(candidate({ phone: null }), [existing]);
    expect(match?.reason).toBe('name_and_address');
  });

  it('店名一致 + 座標が近ければ統合する', () => {
    const existing = business({ phone: null, address: '住所表記が全く違う' });
    const match = findDuplicate(candidate({ phone: null }), [existing]);
    expect(match?.reason).toBe('name_and_location');
  });

  it('無関係な店舗は新規として扱う', () => {
    const existing = business({
      name: '全然違う店',
      phone: sourced('04-7100-0000', 'business_data_provider'),
      address: '千葉県柏市中央9-9-9',
      latitude: 35.9,
      longitude: 140.0,
    });
    expect(findDuplicate(candidate(), [existing])).toBeNull();
  });
});

describe('dedupeBatch', () => {
  it('同一バッチ内の重複を落とし、情報量の多い方を残す', () => {
    const a = candidate({ sourceBusinessId: 'a', reviewCount: 60, websiteUrlRaw: null, hasWebsiteFieldPopulated: false });
    const b = candidate({
      sourceBusinessId: 'b',
      reviewCount: 80,
      websiteUrlRaw: 'https://sakura.example/',
      hasWebsiteFieldPopulated: true,
      latitude: 35.86172,
      longitude: 139.97072,
    });

    const { unique, duplicateCount } = dedupeBatch([a, b]);

    expect(unique).toHaveLength(1);
    expect(duplicateCount).toBe(1);
    // 片方にしかない情報は失わない
    expect(unique[0]?.websiteUrlRaw).toBe('https://sakura.example/');
    expect(unique[0]?.hasWebsiteFieldPopulated).toBe(true);
    expect(unique[0]?.reviewCount).toBe(80);
  });

  it('別店舗はそのまま残す', () => {
    const a = candidate({ sourceBusinessId: 'a', name: 'A店', phone: '04-7167-1111' });
    const b = candidate({ sourceBusinessId: 'b', name: 'B店', phone: '04-7167-2222', latitude: 35.9, longitude: 140.1 });
    const { unique, duplicateCount } = dedupeBatch([a, b]);
    expect(unique).toHaveLength(2);
    expect(duplicateCount).toBe(0);
  });
});
