// 営業対象の絞り込みルール（§16-3）
//
// 方針の分岐が2つある：
//   * 宗教法人・政治団体・公共機関 → そもそも営業対象外なので**除外する**
//   * 医療・士業など広告規制のある業種 → 営業機会としては有望なので**除外もスコア減点もしない**。
//     店舗詳細に注記を出すだけにとどめる。
//
// 「規制があるから避ける」ではなく「規制があることを知った上で提案する」ための設計。

import { EXCLUDED_ORGANIZATION_KEYWORDS, REGULATED_CATEGORY_KEYWORDS } from '@/config/portalDomains';

export function isExcludedOrganization(name: string, category: string): boolean {
  const haystack = `${name} ${category}`;
  return EXCLUDED_ORGANIZATION_KEYWORDS.some((kw) => haystack.includes(kw));
}

/** 広告規制の注記。スコアには一切影響させない */
export function regulatoryNotesFor(name: string, category: string): string[] {
  const haystack = `${name} ${category}`;
  const notes = REGULATED_CATEGORY_KEYWORDS
    .filter((r) => haystack.includes(r.keyword))
    .map((r) => r.note);
  return [...new Set(notes)];
}
