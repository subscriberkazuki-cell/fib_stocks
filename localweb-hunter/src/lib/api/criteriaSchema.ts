// 検索条件のバリデーション。
// UIからのJSONをそのまま信用せず、ここで型と範囲を確定させる。

import { z } from 'zod';
import type { SearchCriteria } from '@/types/business';

export const searchCriteriaSchema = z.object({
  region: z.object({
    kind: z.enum(['city', 'prefecture', 'coordinate']),
    city: z.string().optional(),
    prefecture: z.string().optional(),
    centerLat: z.number().min(-90).max(90).optional(),
    centerLng: z.number().min(-180).max(180).optional(),
    radiusKm: z.number().min(0.5).max(50).optional(),
  }),
  categories: z.array(z.string()).default([]),
  minRating: z.number().min(0).max(5).default(3.7),
  minReviewCount: z.number().int().min(0).max(10000).default(5),
  noWebsiteOnly: z.boolean().default(true),
  includeSnsOnly: z.boolean().default(true),
  includeLowQualitySite: z.boolean().default(false),
  requireEmail: z.boolean().default(false),
  requirePhone: z.boolean().default(false),
  minPriority: z.enum(['S', 'A', 'B', 'C', 'D']).nullable().default(null),
  exhaustive: z.boolean().default(false),
  runPhase2: z.boolean().default(true),
  runAiAnalysis: z.boolean().default(true),
});

export function parseCriteria(input: unknown): SearchCriteria {
  return searchCriteriaSchema.parse(input) as SearchCriteria;
}
