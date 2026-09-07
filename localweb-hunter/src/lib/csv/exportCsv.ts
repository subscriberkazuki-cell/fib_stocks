// CSV出力（§11-6）
//
// **UTF-8 BOM必須。** BOMなしだとExcelで開いたときに日本語が文字化けする。
// 営業リストは実務でExcelに取り込まれるので、ここは仕様として外せない。
//
// AI生成された列（営業理由・営業トーク）には見出しに「AI生成」と明記する。
// 実データと推定値が混ざったまま人の手に渡らないようにするため（§2-3）。

import type { Business } from '@/types/business';
import { describeStatus } from '@/lib/labels';

export const UTF8_BOM = '﻿';

/** RFC 4180 準拠のエスケープ。ダブルクォート・改行・カンマを含む値を安全に包む */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCsvCell).join(',');
}

const HEADERS = [
  '店舗名', '業種', '住所', '電話番号', '電話番号の出所', 'メール', 'メールの出所URL',
  '評価', 'レビュー数', 'Web状況', '公式サイトURL', 'SNS',
  'Lead Score', 'Website Opportunity Score', 'Sales Priority',
  '営業理由(AI生成)', '営業トーク30秒(AI生成)', '推奨HPプラン(AI生成)',
  '広告規制の注記', 'ステータス', '次回アクション', '次回連絡日', 'メモ', '最終確認日',
];

export function buildCsv(businesses: Business[]): string {
  const lines = [toCsvRow(HEADERS)];

  for (const b of businesses) {
    lines.push(
      toCsvRow([
        b.name,
        b.category,
        b.address,
        // 未確認は空欄ではなく「未確認」と書く。空欄だと「調べていない」のか
        // 「調べたが無かった」のか区別がつかないため。
        b.phone?.value ?? '未確認',
        b.phone?.source ?? '',
        b.email?.value ?? '未確認',
        b.email?.sourceUrl ?? '',
        b.rating?.value ?? '',
        b.reviewCount?.value ?? '',
        describeStatus(b.websiteStatus),
        b.websiteUrl ?? '',
        b.socialUrls.join(' '),
        b.leadScore,
        b.websiteOpportunityScore ?? '',
        b.salesPriority,
        b.salesAnalysis?.reason ?? '',
        b.salesAnalysis?.talk30s ?? '',
        b.salesAnalysis?.recommendedOffer ?? '',
        b.regulatoryNotes.join(' / '),
        b.leadStatus,
        b.nextAction ?? '',
        b.nextContactAt ?? '',
        b.salesNotes ?? '',
        b.lastCheckedAt ?? '',
      ])
    );
  }

  // Excelは CRLF を期待するので改行コードも合わせる
  return UTF8_BOM + lines.join('\r\n') + '\r\n';
}

export function csvFilename(prefix = 'localweb-hunter'): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${prefix}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
}
