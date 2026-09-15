// どの文面でメールを送るかを決める。
//
// 補助金の案内という別ルートができたので、店舗によって最初の一通が変わる。
// 判定は既にある補助金スコア（別軸で出しているもの）をそのまま使う。
// ここで新しい判定基準を作ると、画面に出ている「補助金 見込み高」のバッジと
// 食い違う可能性があるため。
//
// なお自動で決まるのは **推奨** であって、手で切り替えられるようにしてある。
// 店主と一度話したあとなら、こちらの判断の方が正しいことが多い。

import type { Business } from '@/types/business';
import { OUTREACH_SCRIPTS } from '@/config/outreachFlow';
import { SUBSIDY_SUPPORT_SCRIPTS } from '@/config/subsidyOutreach';
import { scoreSubsidyProspect } from '@/lib/scoring/subsidyScore';
import { isMissingOwnWebsite } from '@/lib/detection/noWebsiteDetection';

/** 雛形を探すときの目印。変えたら route.test.ts が落ちる */
export const STANDARD_MAIL_LABEL = 'URLを送るメール（電話が繋がらなかった場合も兼用）';
export const RENEWAL_MAIL_LABEL = '既にサイトがある店舗へのメール（リニューアル提案）';
export const SUBSIDY_MAIL_LABEL = '① 補助金の案内（最初の接触・無料診断の提示）';

export type RouteKey = 'standard' | 'renewal' | 'subsidy';

export interface MailRoute {
  key: RouteKey;
  label: string;
  /** なぜこの文面なのか。画面に出す */
  why: string;
  template: string;
  /** 先出しページのURLが本文に必要か */
  needsPreviewUrl: boolean;
}

const LABELS: Record<RouteKey, string> = {
  standard: STANDARD_MAIL_LABEL,
  renewal: RENEWAL_MAIL_LABEL,
  subsidy: SUBSIDY_MAIL_LABEL,
};

function templateFor(key: RouteKey): string {
  const label = LABELS[key];
  const pool = key === 'subsidy' ? SUBSIDY_SUPPORT_SCRIPTS : OUTREACH_SCRIPTS;
  const found = pool.find((s) => s.label === label);
  // 雛形の label を変えたのに、ここを直し忘れた場合に気づけるようにする
  if (!found) throw new Error(`メールの雛形が見つかりません: ${label}`);
  return found.body;
}

export function allRoutes(): MailRoute[] {
  return [
    {
      key: 'standard',
      label: 'HPの先出し提案',
      why: '作ったページを見てもらうところから入る。通常の営業ルート。',
      template: templateFor('standard'),
      needsPreviewUrl: true,
    },
    {
      key: 'renewal',
      label: 'リニューアル提案',
      why: '既にサイトがある店舗に、実際に見て気づいた点を伝える。',
      template: templateFor('renewal'),
      needsPreviewUrl: false,
    },
    {
      key: 'subsidy',
      label: '補助金の案内',
      why: '補助金の対象になりそうな店舗に、まず制度を知らせる。HPの話はそのあと。',
      template: templateFor('subsidy'),
      needsPreviewUrl: false,
    },
  ];
}

/**
 * その文面をこの店舗に送ってよいか。
 *
 * **文面には店舗の状態を断定する一文が入っている。**
 * 先出し提案は「公式のホームページが見当たりませんでした」と書くので、
 * サイトを持っている店舗に送れば、その一文が嘘になる。
 * 相手は自分の店のサイトを知っているので、即座に分かる。
 *
 * ここはデータで判定できるので、人の注意力に任せず止める。
 */
export function routeFitBlockers(key: RouteKey, b: Business): string[] {
  const status = b.websiteStatus;

  if (key === 'standard') {
    if (status === 'unknown') {
      return ['まだWeb調査をしていないため、公式サイトの有無を断定できません（詳細調査を実行してください）'];
    }
    if (!isMissingOwnWebsite(status)) {
      return [
        'この文面は「公式のホームページが見当たりませんでした」と書いていますが、' +
        'この店舗はサイトを持っています。送ると事実と違うことになります。' +
        'リニューアル提案をお使いください。',
      ];
    }
  }

  if (key === 'renewal') {
    if (status === 'unknown') {
      return ['まだWeb調査をしていないため、サイトの中身について書けることがありません'];
    }
    if (isMissingOwnWebsite(status)) {
      return [
        'この文面はサイトがある店舗向けです。この店舗には公式サイトが無いため、' +
        '先出し提案をお使いください。',
      ];
    }
  }

  return [];
}

export interface RouteChoice {
  recommended: MailRoute;
  why: string;
  routes: MailRoute[];
}

/**
 * この店舗に最初に送る文面を選ぶ。
 *
 * 補助金の見込みが高い店舗には補助金の案内を先に出す。
 * 先にHPを売り込むと、あとから補助金の話をしても
 * 「結局それを売りたいだけ」に見えてしまい、順番として損をするため。
 */
export function chooseRoute(business: Business): RouteChoice {
  const routes = allRoutes();
  const prospect = scoreSubsidyProspect(business);
  const hasSite = !isMissingOwnWebsite(business.websiteStatus) && business.websiteStatus !== 'unknown';

  let key: RouteKey;
  let why: string;
  if (prospect.prospect === 'high') {
    key = 'subsidy';
    why = '補助金の見込みが高いため。先にHPを売り込むと、あとの補助金の話が売り込みに見えてしまう。';
  } else if (hasSite) {
    key = 'renewal';
    why = 'すでに公式サイトがあるため。「サイトが無い」と書く文面は、この店舗には送れない。';
  } else {
    key = 'standard';
    why = '補助金の見込みが高くなく、公式サイトも無いため、作ったページを見てもらうところから入る。';
  }

  return { recommended: routes.find((r) => r.key === key)!, why, routes };
}
