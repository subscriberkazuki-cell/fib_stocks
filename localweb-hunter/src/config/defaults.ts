// スコアリングの初期値。実行時はDBの設定を優先し、これはDBが空のときの種でしかない。
// （§8-1「重みは設定画面から変更可能」／§8-3「閾値も設定値として外出し」）

import type { LeadScoreWeights, PriorityThresholds, SearchCriteria } from '@/types/business';

export const DEFAULT_WEIGHTS: LeadScoreWeights = {
  rating: 15,
  reviewCount: 15,
  noWebsite: 25,
  hasSns: 10,
  hasPhone: 10,
  localDensity: 5,
  footTraffic: 10,
  webImprovementPotential: 10,
};

export const DEFAULT_PRIORITY_THRESHOLDS: PriorityThresholds = {
  S: 85,
  A: 70,
  B: 55,
  C: 40,
};

/** レビュー件数の対数正規化の頭打ち（§8-1） */
export const REVIEW_COUNT_CAP = 500;

export const DEFAULT_CRITERIA: SearchCriteria = {
  region: { kind: 'coordinate', city: '柏市', prefecture: '千葉県', centerLat: 35.8617, centerLng: 139.9707, radiusKm: 5 },
  categories: [],
  minRating: 3.7,
  minReviewCount: 5,
  noWebsiteOnly: true,
  includeSnsOnly: true,
  includeLowQualitySite: false,
  requireEmail: false,
  requirePhone: false,
  minPriority: null,
  exhaustive: false,
  runPhase2: true,
  runAiAnalysis: true,
};

/** 地域プリセット。柏市を起点に、周辺市町村へ広げられるようにしてある（§1） */
export const REGION_PRESETS: { label: string; lat: number; lng: number; city: string; prefecture: string }[] = [
  { label: '柏市（柏駅）', lat: 35.8617, lng: 139.9707, city: '柏市', prefecture: '千葉県' },
  { label: '柏市（柏の葉キャンパス）', lat: 35.8944, lng: 139.9524, city: '柏市', prefecture: '千葉県' },
  { label: '松戸市', lat: 35.7876, lng: 139.9032, city: '松戸市', prefecture: '千葉県' },
  { label: '流山市（おおたかの森）', lat: 35.8707, lng: 139.9256, city: '流山市', prefecture: '千葉県' },
  { label: '我孫子市', lat: 35.8744, lng: 140.0281, city: '我孫子市', prefecture: '千葉県' },
  { label: '野田市', lat: 35.9550, lng: 139.8747, city: '野田市', prefecture: '千葉県' },
  { label: '船橋市', lat: 35.7018, lng: 139.9853, city: '船橋市', prefecture: '千葉県' },
  { label: '千葉市（千葉駅）', lat: 35.6131, lng: 140.1136, city: '千葉市', prefecture: '千葉県' },
];

/**
 * 業種プリセット。localDense（地域密着）と footTraffic（集客型）は Lead Score の
 * 配点に直結するので、AIではなくこの表でルールベースに決める（§6）。
 */
export interface CategoryPreset {
  key: string;
  label: string;
  osmFilters: string[];
  localDense: boolean;
  footTraffic: boolean;
  /** 高単価業態か（§8-4 パターンE） */
  highTicket: boolean;
  /** 予約型業態か（§8-4 パターンD） */
  reservationBased: boolean;
}

export const CATEGORY_PRESETS: CategoryPreset[] = [
  { key: 'restaurant', label: '飲食店', osmFilters: ['amenity=restaurant', 'amenity=cafe', 'amenity=bar', 'amenity=fast_food'], localDense: true, footTraffic: true, highTicket: false, reservationBased: true },
  { key: 'beauty', label: '美容室・理容室', osmFilters: ['shop=hairdresser', 'shop=beauty'], localDense: true, footTraffic: true, highTicket: false, reservationBased: true },
  { key: 'relaxation', label: '整体・リラクゼーション', osmFilters: ['shop=massage', 'healthcare=physiotherapist'], localDense: true, footTraffic: false, highTicket: true, reservationBased: true },
  { key: 'clinic', label: 'クリニック・歯科', osmFilters: ['amenity=clinic', 'amenity=doctors', 'amenity=dentist'], localDense: true, footTraffic: false, highTicket: true, reservationBased: true },
  { key: 'fitness', label: 'ジム・フィットネス', osmFilters: ['leisure=fitness_centre', 'leisure=sports_centre'], localDense: true, footTraffic: false, highTicket: true, reservationBased: true },
  { key: 'school', label: '学習塾・教室', osmFilters: ['amenity=school', 'office=educational_institution'], localDense: true, footTraffic: false, highTicket: true, reservationBased: false },
  { key: 'retail', label: '小売店', osmFilters: ['shop=convenience', 'shop=bakery', 'shop=florist', 'shop=clothes'], localDense: true, footTraffic: true, highTicket: false, reservationBased: false },
  { key: 'automotive', label: '自動車関連', osmFilters: ['shop=car_repair', 'shop=car'], localDense: true, footTraffic: false, highTicket: true, reservationBased: true },
  { key: 'construction', label: '工務店・リフォーム', osmFilters: ['craft=builder', 'office=construction_company'], localDense: true, footTraffic: false, highTicket: true, reservationBased: false },
  { key: 'professional', label: '士業・専門サービス', osmFilters: ['office=lawyer', 'office=accountant', 'office=estate_agent'], localDense: false, footTraffic: false, highTicket: true, reservationBased: false },
  { key: 'hotel', label: '宿泊', osmFilters: ['tourism=hotel', 'tourism=guest_house'], localDense: false, footTraffic: true, highTicket: true, reservationBased: true },
  { key: 'pet', label: 'ペット関連', osmFilters: ['shop=pet', 'shop=pet_grooming', 'amenity=veterinary'], localDense: true, footTraffic: false, highTicket: true, reservationBased: true },
];

export function findCategoryPreset(category: string): CategoryPreset | null {
  const lower = category.toLowerCase();
  return (
    CATEGORY_PRESETS.find((p) => p.key === lower || p.label === category) ??
    CATEGORY_PRESETS.find((p) => p.osmFilters.some((f) => lower.includes(f.split('=')[1] ?? ''))) ??
    null
  );
}
