// 表示用ラベル。純粋関数のみを置く（server-only を持ち込まない）。
// UI・CSV・AIプロンプトの3箇所から使うため、どこにも依存しない場所に置いている。

import type { WebsiteStatus } from '@/types/business';

const WEBSITE_STATUS_LABELS: Record<WebsiteStatus, string> = {
  none: '公式サイトなし・Web情報も極めて少ない',
  profile_only: '店舗プロフィールのみ',
  multiple_portals: '複数のポータルサイトのみ',
  portal_only: 'ポータルサイトのみ',
  sns_only: 'SNSのみ',
  official_low_quality: '公式サイトはあるが改善余地が大きい',
  official_good: '公式サイトあり・十分整備',
  unknown: '未調査',
};

export function describeStatus(status: WebsiteStatus): string {
  return WEBSITE_STATUS_LABELS[status];
}
