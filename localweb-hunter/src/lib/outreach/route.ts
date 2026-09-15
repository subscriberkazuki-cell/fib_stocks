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

/** 雛形を探すときの目印。変えたら route.test.ts が落ちる */
export const STANDARD_MAIL_LABEL = 'URLを送るメール（電話が繋がらなかった場合も兼用）';
export const SUBSIDY_MAIL_LABEL = '① 補助金の案内（最初の接触・無料診断の提示）';

export type RouteKey = 'standard' | 'subsidy';

export interface MailRoute {
  key: RouteKey;
  label: string;
  /** なぜこの文面なのか。画面に出す */
  why: string;
  template: string;
  /** 先出しページのURLが本文に必要か */
  needsPreviewUrl: boolean;
}

function templateFor(key: RouteKey): string {
  const label = key === 'standard' ? STANDARD_MAIL_LABEL : SUBSIDY_MAIL_LABEL;
  const pool = key === 'standard' ? OUTREACH_SCRIPTS : SUBSIDY_SUPPORT_SCRIPTS;
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
      key: 'subsidy',
      label: '補助金の案内',
      why: '補助金の対象になりそうな店舗に、まず制度を知らせる。HPの話はそのあと。',
      template: templateFor('subsidy'),
      needsPreviewUrl: false,
    },
  ];
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
  const useSubsidy = prospect.prospect === 'high';
  const recommended = routes.find((r) => r.key === (useSubsidy ? 'subsidy' : 'standard'))!;

  return {
    recommended,
    why: useSubsidy
      ? '補助金の見込みが高いため。先にHPを売り込むと、あとの補助金の話が売り込みに見えてしまう。'
      : '補助金の見込みが高くないため、通常どおりページを見てもらうところから入る。',
    routes,
  };
}
