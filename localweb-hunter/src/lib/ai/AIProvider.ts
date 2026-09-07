// AIProvider — AI利用の抽象化（§9）
//
// ハルシネーション対策はこの層で構造的に効かせる：
//   * 出力は必ずJSON schemaで受け取り、zodで検証する
//   * パースに失敗したら最大3回リトライ。それでも駄目ならそのフィールドは null
//   * 結果は SalesAnalysis / OfficialSiteJudgement として、実データとは別の器に入れる
//
// 「入力にない事実を出力してはならない」はプロンプト側（prompts.ts）で明示する。

import { z } from 'zod';

export const officialSiteJudgementSchema = z.object({
  official_site_probability: z.number().min(0).max(1),
  reason: z.string(),
  matched_business_name: z.boolean().nullable(),
  matched_phone: z.boolean().nullable(),
  matched_address: z.boolean().nullable(),
  site_type: z.enum(['official', 'portal', 'social', 'booking', 'marketplace', 'unknown']),
});
export type OfficialSiteJudgement = z.infer<typeof officialSiteJudgementSchema>;

export const salesAnalysisSchema = z.object({
  score: z.number().min(0).max(100).nullable(),
  reason: z.string().nullable(),
  strengths: z.array(z.string()).max(5),
  weaknesses: z.array(z.string()).max(5),
  sales_angle: z.string().nullable(),
  recommended_offer: z.string().nullable(),
  store_type_tags: z.array(z.string()).max(4),
  estimated_priority: z.enum(['S', 'A', 'B', 'C', 'D']).nullable(),
  talk_15s: z.string().nullable(),
  talk_30s: z.string().nullable(),
  talk_60s: z.string().nullable(),
  email_draft: z.string().nullable(),
  hp_plan: z.string().nullable(),
});
export type SalesAnalysisPayload = z.infer<typeof salesAnalysisSchema>;

export interface AIProvider {
  readonly name: string;
  readonly modelId: string;
  readonly billable: boolean;
  isConfigured(): boolean;
  costPerCall(): number;

  judgeOfficialSite(input: OfficialSiteInput): Promise<OfficialSiteJudgement | null>;
  analyzeSalesOpportunity(input: SalesAnalysisInput): Promise<SalesAnalysisPayload | null>;
}

export interface OfficialSiteInput {
  businessName: string;
  address: string;
  phone: string | null;
  url: string;
  pageTitle: string | null;
  pageExcerpt: string | null;
  domain: string;
  snsUrls: string[];
}

export interface SalesAnalysisInput {
  businessName: string;
  category: string;
  address: string;
  rating: number | null;
  reviewCount: number | null;
  websiteStatus: string;
  websiteOpportunityScore: number | null;
  hasPhone: boolean;
  hasEmail: boolean;
  socialUrls: string[];
  /** ルールベースで先に検出した営業パターン。AIにはこれを踏まえて書かせる */
  detectedPattern: { label: string; reason: string; recommendedOffer: string } | null;
  /** サイトの実測上の弱点。ここにない項目をAIに指摘させない */
  observedWeaknesses: string[];
  regulatoryNotes: string[];
}
