// LocalWeb Hunter — コア型定義
//
// 設計の背骨になる制約が2つある：
//   1. 実データとAI推定値をスキーマレベルで分離する（§2-3）
//   2. 重要フィールドには必ず出所を持たせる（§2-3）
// このファイルの SourcedField / AiEstimate がその仕組み。

export type WebsiteStatus =
  | 'none'                  // 独自HPなし＋Web情報も極めて少ない（Web Presence 100）
  | 'profile_only'          // Google等の店舗プロフィールのみ（80）
  | 'multiple_portals'      // 複数ポータルのみ（60）
  | 'portal_only'           // ポータル1件のみ（50）
  | 'sns_only'              // SNSのみ（40）
  | 'official_low_quality'  // 公式サイトありだが古い・情報不足（20）
  | 'official_good'         // 公式サイトあり・十分整備（0）
  | 'unknown';              // 未調査（Phase 2 未実行）

export type LeadPriority = 'S' | 'A' | 'B' | 'C' | 'D';

export const LEAD_STATUSES = [
  '未接触', '電話済', '留守', '担当者不在', '興味あり',
  '提案済', '成約', '失注', '保留', '営業対象外',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** 実データの出所。'ai_estimate' はここに含めない（推定値は AiEstimate 側に隔離する） */
export type DataFieldSource =
  | 'business_data_provider'
  | 'official_site'
  | 'web_search'
  | 'sns'
  | 'osm'
  | 'manual';

/** 実データ。出所が特定できないものはそもそも保存しない（§2-3） */
export interface SourcedField<T> {
  value: T;
  source: DataFieldSource;
  /** 実際に確認できたURL。電話・メールの根拠として残す */
  sourceUrl?: string;
  verified: boolean;
  observedAt: string;
}

/**
 * AI推定値。実データと同じ器に入れない。
 * valueType が常に 'AI_ESTIMATE' 固定なのは、DBに落ちた後も
 * 「これは推定である」ことがフィールド単位で判別できるようにするため（§2-3, §9-4）。
 */
export interface AiEstimate<T> {
  value: T | null;
  valueType: 'AI_ESTIMATE';
  model: string;
  confidence: number | null; // 0-1。モデルが返さなければ null
  generatedAt: string;
}

export function aiEstimate<T>(value: T | null, model: string, confidence: number | null = null): AiEstimate<T> {
  return { value, valueType: 'AI_ESTIMATE', model, confidence, generatedAt: new Date().toISOString() };
}

export function sourced<T>(
  value: T,
  source: DataFieldSource,
  opts: { sourceUrl?: string; verified?: boolean } = {}
): SourcedField<T> {
  return {
    value,
    source,
    ...(opts.sourceUrl ? { sourceUrl: opts.sourceUrl } : {}),
    verified: opts.verified ?? false,
    observedAt: new Date().toISOString(),
  };
}

export type SiteClassification =
  | 'official'
  | 'portal'
  | 'social'
  | 'booking'
  | 'marketplace'
  | 'job'
  | 'map_profile'
  | 'free_hosting'
  | 'unknown';

export interface CandidateUrl {
  url: string;
  title?: string;
  snippet?: string;
  classification: SiteClassification;
  /** AIが最終判定した「公式サイトである確率」。ルールベースだけで確定した場合は null */
  officialSiteProbability: number | null;
  reason?: string;
}

/** Phase 1（安い一次スクリーニング）で取得する部分情報 */
export interface BusinessCandidate {
  sourceBusinessId: string;
  source: string;
  name: string;
  category: string;
  address: string;
  prefecture: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl?: string;
  rating: number | null;
  reviewCount: number | null;
  phone: string | null;
  /** プロバイダのレスポンスに公式サイトURLが入っていたか（Stage 1判定） */
  hasWebsiteFieldPopulated: boolean;
  websiteUrlRaw: string | null;
  openingHours?: string;
}

/** Phase 2（通過分だけ）で追加される調査結果 */
export interface EnrichmentResult {
  websiteStatus: WebsiteStatus;
  webPresenceScore: number;
  officialSiteUrl: string | null;
  candidateUrls: CandidateUrl[];
  socialUrls: string[];
  email: SourcedField<string> | null;
  websiteOpportunityScore: number | null;
  websiteSignals: WebsiteSignals | null;
  /** Phase 2で発生した失敗。店舗そのものは失わず、ここに記録する（§12-3） */
  errors: string[];
}

/** Website Opportunity Score の評価素材（§8-2）。すべて実測値であり推定は含まない */
export interface WebsiteSignals {
  reachable: boolean;
  hasOwnDomain: boolean;
  hasSsl: boolean;
  isMobileFriendly: boolean;
  responseTimeMs: number | null;
  textLength: number;
  imageCount: number;
  hasMenuOrServiceInfo: boolean;
  hasPriceInfo: boolean;
  hasOpeningHours: boolean;
  hasAccessInfo: boolean;
  hasTelLink: boolean;
  hasContactForm: boolean;
  hasReservationLink: boolean;
  hasSnsLinks: boolean;
  hasMapEmbed: boolean;
  hasTitle: boolean;
  hasMetaDescription: boolean;
  hasOgp: boolean;
  hasStructuredData: boolean;
  hasViewportMeta: boolean;
  /** ページ内に見つかった最新の日付（YYYY-MM-DD）。更新状況の判定に使う */
  latestDateFound: string | null;
}

/** AI営業分析の結果。全体が AI_ESTIMATE 扱い（§9-3） */
export interface SalesAnalysis {
  model: string;
  generatedAt: string;
  opportunityScore: number | null;
  reason: string | null;
  strengths: string[];
  weaknesses: string[];
  salesAngle: string | null;
  recommendedOffer: string | null;
  storeTypeTags: string[];
  estimatedPriority: LeadPriority | null;
  matchedPattern: SalesPattern | null;
  talk15s: string | null;
  talk30s: string | null;
  talk60s: string | null;
  emailDraft: string | null;
  hpPlan: string | null;
}

/** §8-4 の営業機会検出パターン */
export type SalesPattern = 'A' | 'B' | 'C' | 'D' | 'E';

export interface Business {
  id: string;
  source: string;
  sourceBusinessId: string;

  name: string;
  category: string;
  address: string;
  prefecture: string;
  city: string;
  latitude: number | null;
  longitude: number | null;

  phone: SourcedField<string> | null;
  email: SourcedField<string> | null;
  rating: SourcedField<number> | null;
  reviewCount: SourcedField<number> | null;

  websiteUrl: string | null;
  websiteStatus: WebsiteStatus;
  webPresenceScore: number;
  websiteOpportunityScore: number | null;
  websiteSignals: WebsiteSignals | null;
  candidateUrls: CandidateUrl[];
  socialUrls: string[];
  googleMapsUrl: string | null;
  openingHours: string | null;

  leadScore: number;
  leadScoreBreakdown: LeadScoreBreakdown | null;
  salesPriority: LeadPriority;

  /** AI分析。未実行なら null。実データとは別カラムに隔離されている */
  salesAnalysis: SalesAnalysis | null;

  /** 広告規制の注記（§16-3）。スコアには影響させない */
  regulatoryNotes: string[];

  leadStatus: LeadStatus;
  nextAction: string | null;
  lastContactedAt: string | null;
  nextContactAt: string | null;
  salesNotes: string | null;
  dealValue: number | null;

  phase2CompletedAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadScoreWeights {
  rating: number;
  reviewCount: number;
  noWebsite: number;
  hasSns: number;
  hasPhone: number;
  localDensity: number;
  footTraffic: number;
  webImprovementPotential: number;
}

export interface PriorityThresholds {
  S: number;
  A: number;
  B: number;
  C: number;
}

/** 各項目が何点入ったかの内訳。§10-3 のスナップショットに使う */
export interface LeadScoreBreakdown {
  rating: number;
  reviewCount: number;
  noWebsite: number;
  hasSns: number;
  hasPhone: number;
  localDensity: number;
  footTraffic: number;
  webImprovementPotential: number;
  total: number;
  weightsUsed: LeadScoreWeights;
}

export interface RegionCriteria {
  kind: 'city' | 'prefecture' | 'coordinate';
  city?: string;
  prefecture?: string;
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
}

export interface SearchCriteria {
  region: RegionCriteria;
  categories: string[];        // 空配列 = 全業種
  minRating: number;
  minReviewCount: number;
  noWebsiteOnly: boolean;
  includeSnsOnly: boolean;
  includeLowQualitySite: boolean;
  requireEmail: boolean;
  requirePhone: boolean;
  minPriority: LeadPriority | null;
  /** 「柏市を全件調査」モード。地点・カテゴリに分割して実行する（§12-1） */
  exhaustive: boolean;
  /** Phase 2（Web検索・サイト解析・メール抽出）まで実行するか */
  runPhase2: boolean;
  /** AI営業分析まで実行するか */
  runAiAnalysis: boolean;
}

export type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'budget_stopped';
export type SubQueryStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** レジューム可能な調査ジョブ（§12-2） */
export interface SearchJob {
  id: string;
  status: JobStatus;
  criteria: SearchCriteria;
  totalSubQueries: number;
  completedSubQueries: number;
  fetchedCount: number;
  qualifiedCount: number;
  newCount: number;
  duplicateCount: number;
  costUsd: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface SubQuery {
  id: string;
  jobId: string;
  seq: number;
  status: SubQueryStatus;
  label: string;
  params: SubQueryParams;
  cursor: string | null;
  fetchedCount: number;
  costUsd: number;
  errorMessage: string | null;
  attempts: number;
  updatedAt: string;
}

export interface SubQueryParams {
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
  city: string | null;
  prefecture: string | null;
  category: string | null;
}

export interface SearchLogEntry {
  id: string;
  jobId: string | null;
  searchedAt: string;
  region: string;
  category: string;
  criteria: SearchCriteria;
  resultCount: number;
  qualifiedCount: number;
  newBusinessCount: number;
  duplicateCount: number;
  apiRequestCount: number;
  apiItemCount: number;
  apiCostUsd: number;
  webSearchCostUsd: number;
  aiCostUsd: number;
  totalCostUsd: number;
}

export type ApiUsageKind = 'business_data' | 'web_search' | 'ai' | 'crawler';

export interface ApiUsageEntry {
  id: string;
  occurredAt: string;
  kind: ApiUsageKind;
  provider: string;
  requestCount: number;
  itemCount: number;
  costUsd: number;
  jobId: string | null;
  note: string | null;
}

/** §13 ビジネス指標 */
export interface BusinessMetrics {
  leadsFound: number;
  qualifiedLeads: number;
  sTierLeads: number;
  callsMade: number;
  contactsReached: number;
  interested: number;
  proposals: number;
  deals: number;
  revenue: number;
  conversionRate: number;
  averageDealValue: number;
  revenuePer100Leads: number;
}
