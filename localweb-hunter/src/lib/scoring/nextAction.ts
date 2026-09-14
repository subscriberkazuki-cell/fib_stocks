// 「この店に次に何をするか」を決める。
//
// 一覧に並べただけでは営業は進まない。画面を見た人が
// 「この店には、この切り口で、これを提案する」まで迷わず行けることが要る。
//
// ここはルールベース。AIが無くても、業種とWeb状況だけで決まる部分なので
// わざわざ生成に頼る必要がない（コストもかからない）。

import { findIndustryApproach, type IndustryApproach } from '@/config/approaches';
import { findOffering, type Offering } from '@/config/offerings';
import { findCategoryPreset } from '@/config/defaults';
import { isMissingOwnWebsite } from '@/lib/detection/noWebsiteDetection';
import type { Business, LeadStatus, WebsiteStatus } from '@/types/business';

export interface NextAction {
  /** いま取るべき行動 */
  action: string;
  /** なぜそれなのか */
  why: string;
  /** 第一提案 */
  primary: Offering | null;
  /** 話が進んだときの次 */
  secondary: Offering | null;
  /** 業種ごとの切り口 */
  approach: IndustryApproach | null;
  /** 電話の入り口で言うこと */
  openingLine: string | null;
}

/**
 * Web状況から提案内容を補正する。
 * 業種の標準提案があっても、実際のWeb状況の方が優先される場面がある。
 * 例：整体院の標準は体験LPだが、既に古いHPがあるならリニューアルが先。
 */
function adjustForWebStatus(
  status: WebsiteStatus,
  opportunityScore: number | null,
  industryPrimary: string,
  industrySecondary: string
): { primary: string; secondary: string } {
  // 古いサイトがある → リニューアルが最優先。ゼロから作るより話が通りやすい
  if (status === 'official_low_quality' && (opportunityScore ?? 0) >= 50) {
    return { primary: 'site_renewal', secondary: industryPrimary };
  }
  // 整備済みのサイトがある → サイト本体の提案は通らない。売る導線（LP）に切り替える
  if (status === 'official_good') {
    const lpFirst = industryPrimary.startsWith('lp_') ? industryPrimary : industrySecondary;
    return { primary: lpFirst.startsWith('lp_') ? lpFirst : 'lp_trial', secondary: 'lp_campaign' };
  }
  // SNSだけある → 受け皿が要る。最小構成から入る方が通しやすい
  if (status === 'sns_only') {
    return { primary: 'site_onepage', secondary: industryPrimary };
  }
  return { primary: industryPrimary, secondary: industrySecondary };
}

/** 営業ステータスごとの「次にやること」。リストを開いた人が迷わないようにする */
function actionForStatus(status: LeadStatus, hasPhone: boolean): { action: string; why: string } | null {
  switch (status) {
    case '未接触':
      return hasPhone
        ? { action: '電話をかける', why: 'まだ一度も接触していません。下の30秒トークをそのまま使えます。' }
        : {
            action: '電話番号を確認する',
            why: '公開されている電話番号が見つかっていません。店頭やSNSのプロフィールに記載がないか確認してください。',
          };
    case '留守':
    case '担当者不在':
      return {
        action: '時間を変えてかけ直す',
        why: '飲食店なら14〜17時、それ以外は10〜12時が繋がりやすい時間帯です。次回連絡日を入れておいてください。',
      };
    case '電話済':
      return {
        action: '反応を記録し、次のアクションを決める',
        why: '話せた内容をメモに残してください。ここを飛ばすと、次にかけるとき同じ話を最初からすることになります。',
      };
    case '興味あり':
      return {
        action: '提案内容を送る',
        why: '関心がある状態です。時間が経つほど冷めるので、下の推奨プランをもとに早めに具体化してください。',
      };
    case '提案済':
      return {
        action: '返答を確認する',
        why: '提案から1週間を目安に一度確認を入れてください。放置すると自然消滅します。',
      };
    case '保留':
      return {
        action: '再検討の時期を確認する',
        why: 'タイミングの問題であることが多いので、いつ頃なら話せるかだけ聞いて日付を入れておきます。',
      };
    case '成約':
      return {
        action: '成約金額を記録する',
        why: '営業指標の売上はこの欄の合計です。入れておくと「どのスコアの店が成約したか」を後から検証できます。',
      };
    case '失注':
    case '営業対象外':
      return null;
  }
}

export function computeNextAction(biz: Business): NextAction {
  const approach = findIndustryApproach(biz.category);
  const preset = findCategoryPreset(biz.category);

  // 業種表にない場合の既定。Web状況だけで決める。
  const fallbackPrimary = isMissingOwnWebsite(biz.websiteStatus)
    ? preset?.reservationBased
      ? 'site_reservation'
      : 'site_standard'
    : 'lp_trial';

  const { primary, secondary } = adjustForWebStatus(
    biz.websiteStatus,
    biz.websiteOpportunityScore,
    approach?.primaryOffering ?? fallbackPrimary,
    approach?.secondaryOffering ?? 'lp_trial'
  );

  const statusAction = actionForStatus(biz.leadStatus, biz.phone !== null);

  return {
    action: statusAction?.action ?? 'この店舗は対象外です',
    why: statusAction?.why ?? '営業対象外または失注として記録されています。',
    primary: findOffering(primary),
    secondary: findOffering(secondary),
    approach,
    openingLine: approach?.hook ?? null,
  };
}
