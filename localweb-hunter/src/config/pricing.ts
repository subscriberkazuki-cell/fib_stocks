// 価格設定。
//
// ■ 相場（2026年・日本）
//   大手制作会社     300万円〜        月額5万円〜
//   中小制作会社     80〜150万円      月額1〜3万円
//   フリーランス     10〜50万円       月額5,000〜1万円
//   LP1ページ単体   平均55.4万円・中央値40万円（10万円以下は個人・フリーランスのみ）
//   月額保守        サーバー管理のみ5,000円前後 / 更新対応込み1〜3万円
//
// ■ この価格帯を選んだ理由
//
//   実績がないうちは安くしたくなるが、先出し提案では**相手のリスクは既にゼロ**
//   （完成品を見てから決められる）。そこに低価格を重ねるのは、
//   持っているカードを二重に切ることになる。
//
//   1ページでも、先出し制作1〜2h + 電話とやり取り2〜3h + 修正2h + 公開1h で
//   6〜8時間かかる。¥98,000 なら時給14,000円で専門職として成立するが、
//   ¥30,000 だと時給4,300円で、営業時間を足すと事業として続かない。
//
//   さらに、最初の客に付けた価格はその人の紹介客にも引き継がれる。
//   紹介が回り始めた瞬間に価格が固定されるので、安易な値下げは後から効いてくる。

export interface PriceTier {
  /** 公開時の一括 */
  initial: number;
  /** 月額。0 なら買い切り */
  monthly: number;
  /** 月額に含まれるもの */
  monthlyIncludes: string;
}

export interface OfferingPrice {
  /** 月額ありの構成。入口の金額が下がるので、こちらを主力にする */
  withMonthly: PriceTier;
  /** 買い切り。サブスクを嫌う層（年配の店主に多い）向け */
  oneTime: PriceTier;
}

/**
 * ★ ここを自分の価格に書き換えること。
 *   null にすると、UIには金額を出さず「未設定」と表示される。
 */
export const PRICING: Record<string, OfferingPrice | null> = {
  site_onepage: {
    withMonthly: {
      initial: 98_000,
      monthly: 5_500,
      monthlyIncludes: 'ドメイン・サーバー・SSL・月1回までの内容修正',
    },
    oneTime: { initial: 168_000, monthly: 0, monthlyIncludes: '' },
  },
  site_standard: {
    withMonthly: {
      initial: 198_000,
      monthly: 8_800,
      monthlyIncludes: 'ドメイン・サーバー・SSL・月2回までの内容修正',
    },
    oneTime: { initial: 298_000, monthly: 0, monthlyIncludes: '' },
  },
  site_reservation: {
    withMonthly: {
      initial: 268_000,
      monthly: 11_000,
      monthlyIncludes: 'ドメイン・サーバー・SSL・予約システムの調整・月2回までの内容修正',
    },
    oneTime: { initial: 398_000, monthly: 0, monthlyIncludes: '' },
  },
  site_renewal: {
    withMonthly: {
      initial: 148_000,
      monthly: 5_500,
      monthlyIncludes: 'ドメイン・サーバー・SSL・月1回までの内容修正',
    },
    oneTime: { initial: 228_000, monthly: 0, monthlyIncludes: '' },
  },
  lp_trial: {
    withMonthly: {
      initial: 128_000,
      monthly: 5_500,
      monthlyIncludes: 'サーバー・SSL・申込フォームの保守・月1回までの内容修正',
    },
    oneTime: { initial: 198_000, monthly: 0, monthlyIncludes: '' },
  },
  lp_product: {
    withMonthly: {
      initial: 168_000,
      monthly: 5_500,
      monthlyIncludes: 'サーバー・SSL・フォームの保守・月1回までの内容修正',
    },
    oneTime: { initial: 248_000, monthly: 0, monthlyIncludes: '' },
  },
  lp_campaign: {
    withMonthly: {
      initial: 78_000,
      monthly: 3_300,
      monthlyIncludes: 'サーバー・SSL・期間中の内容修正',
    },
    oneTime: { initial: 118_000, monthly: 0, monthlyIncludes: '' },
  },
};

/**
 * 実績づくりのための割引。
 *
 * **理由と件数を明示すること。** 理由のない値引きは後から戻せないが、
 * 「事例を作りたいので最初の5件」という形なら、6件目から通常価格に戻しても筋が通る。
 * 最初の客に付けた価格は、その人の紹介客にも引き継がれるので、
 * 無条件の安値は事業として後から効いてくる。
 */
export interface IntroOffer {
  enabled: boolean;
  /** 割引率（0.3 = 30%引き） */
  discountRate: number;
  /** 何件までか。この数字を相手に伝える */
  limitCount: number;
  /** 代わりに何をもらうか。これが値引きの理由になる */
  condition: string;
  /** 相手に伝える文言 */
  reason: string;
}

export const INTRO_OFFER: IntroOffer = {
  enabled: true,
  discountRate: 0.3,
  limitCount: 5,
  condition: '制作事例としてポートフォリオに掲載させていただくこと',
  reason: '柏市での制作事例を作りたいため',
};

export function applyIntroOffer(amount: number): number {
  if (!INTRO_OFFER.enabled) return amount;
  // 1,000円単位で丸める（端数があると「値引きした感」ではなく「雑な見積もり」に見える）
  return Math.round((amount * (1 - INTRO_OFFER.discountRate)) / 1000) * 1000;
}

export function yen(v: number): string {
  return `¥${v.toLocaleString('ja-JP')}`;
}

export function getPricing(offeringKey: string): OfferingPrice | null {
  return PRICING[offeringKey] ?? null;
}

/** UI表示用。未設定なら金額を出さない（根拠のない数字を相手に見せないため） */
export function priceLabel(key: string): string {
  const p = getPricing(key);
  if (!p) return '未設定';
  const m = p.withMonthly;
  return m.monthly > 0
    ? `${yen(m.initial)} + 月額${yen(m.monthly)}`
    : yen(m.initial);
}

export function hasAnyPriceConfigured(): boolean {
  return Object.values(PRICING).some((p) => p !== null);
}

/** 初年度の総額。相手が実際に払う金額なので、月額だけ見せると不誠実になる */
export function firstYearTotal(tier: PriceTier): number {
  return tier.initial + tier.monthly * 12;
}

// ============================================================
// 小規模事業者持続化補助金
//
// ウェブサイト関連費が補助対象になる。営業材料として強いが、
// 要件が毎年変わるため、断定的に案内しないこと。
// ============================================================

export const SUBSIDY_NOTE = {
  name: '小規模事業者持続化補助金',
  rate: '2/3',
  webCap: 300_000,
  caution:
    'ウェブサイト関連費「のみ」での申請はできず、他の販路開拓費と組み合わせる必要がある。' +
    '補助率・上限・要件は公募回ごとに変わるため、店主には「商工会議所・商工会で確認してください」と案内すること。' +
    '採択を保証するような言い方はしない。',
} as const;

/** 補助金を使った場合の実質負担額の目安。あくまで目安として示すこと */
export function estimatedSubsidizedCost(amount: number): number {
  const covered = Math.min(amount, SUBSIDY_NOTE.webCap) * (2 / 3);
  return Math.round(amount - covered);
}
