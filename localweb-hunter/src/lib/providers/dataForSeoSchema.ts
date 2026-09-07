// DataForSEO レスポンスの zod スキーマ（§14 Step 1）
//
// 外部APIのスキーマは予告なく変わる。パース時にここで検証しておけば、
// 「静かに全フィールドが undefined になってリストの質だけが落ちる」事故を防げる。
//
// 未検証の項目は passthrough で通し、必須にするのは
// 「これが無ければ店舗として成立しない」ものだけに絞ってある。

import { z } from 'zod';

const ratingSchema = z
  .object({
    value: z.number().nullable().optional(),
    votes_count: z.number().nullable().optional(),
    rating_type: z.string().nullable().optional(),
  })
  .passthrough();

const addressInfoSchema = z
  .object({
    borough: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    zip: z.string().nullable().optional(),
    region: z.string().nullable().optional(),
    country_code: z.string().nullable().optional(),
  })
  .passthrough();

export const businessItemSchema = z
  .object({
    // どれか1つは必ず来る前提。すべて無ければ店舗を一意に識別できない。
    place_id: z.string().nullable().optional(),
    cid: z.string().nullable().optional(),
    feature_id: z.string().nullable().optional(),

    title: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    additional_categories: z.array(z.string()).nullable().optional(),
    address: z.string().nullable().optional(),
    address_info: addressInfoSchema.nullable().optional(),
    phone: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    rating: ratingSchema.nullable().optional(),
    work_time: z.unknown().nullable().optional(),
    is_claimed: z.boolean().nullable().optional(),
  })
  .passthrough();

export type DataForSeoBusinessItem = z.infer<typeof businessItemSchema>;

export const searchResponseSchema = z
  .object({
    status_code: z.number(),
    status_message: z.string(),
    cost: z.number().nullable().optional(),
    tasks: z
      .array(
        z
          .object({
            id: z.string().optional(),
            status_code: z.number(),
            status_message: z.string(),
            cost: z.number().nullable().optional(),
            result: z
              .array(
                z
                  .object({
                    total_count: z.number().nullable().optional(),
                    count: z.number().nullable().optional(),
                    offset: z.number().nullable().optional(),
                    offset_token: z.string().nullable().optional(),
                    items: z.array(businessItemSchema).nullable().optional(),
                  })
                  .passthrough()
              )
              .nullable()
              .optional(),
          })
          .passthrough()
      )
      .nullable()
      .optional(),
  })
  .passthrough();

export type DataForSeoSearchResponse = z.infer<typeof searchResponseSchema>;

/** DataForSEO が成功を表すステータスコード */
export const DFS_OK = 20000;
