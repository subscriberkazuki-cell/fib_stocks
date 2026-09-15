// 小規模事業者持続化補助金（一般型・通常枠）
//
// ⚠️ 制度の内容は公募回ごとに変わる。この定数は VERIFIED_ON 時点で確認した第20回の内容。
//    次の公募回では必ず公募要領を読み直し、ここを更新すること。
//    店舗に案内するときは「採択を保証しない」「商工会議所で確認を」を必ず添える。
//
// ■ この制度が営業にとって重要な理由
//   ウェブサイト制作費が補助対象で、補助率2/3。¥98,000 なら約¥65,000が戻る計算になり、
//   価格の話が軽くなる。さらに「申請を手伝える制作者」は明確な差別化になる。
//
// ■ ただし、先出し提案とそのままでは両立しない（§SUBSIDY_CONFLICT を必ず読むこと）

import { jpDate, jpMonthDay } from '@/lib/subsidy/schedule';

export const VERIFIED_ON = '2026-09-14';
export const ROUND_NAME = '第20回（一般型・通常枠）';

// ============================================================
// 金額と率
// ============================================================

export const SUBSIDY = {
  /** 補助率。赤字事業者は 3/4 */
  rate: 2 / 3,
  rateDeficit: 3 / 4,

  /** 通常枠の補助上限 */
  baseCap: 500_000,

  /** 上乗せ特例 */
  invoiceBonus: 500_000,
  wageBonus: 1_500_000,
  maxCap: 2_500_000,

  /**
   * ウェブサイト関連費として受けられる補助金の上限（税込）。
   * 第19回までは「補助金交付申請額の1/4（最大50万円）」だったが、
   * 第20回でこの1/4縛りが撤廃され、フラットな30万円上限になった。
   */
  webCap: 300_000,
} as const;

// ============================================================
// スケジュール（第20回）
// ============================================================

export const SCHEDULE = {
  applicationOpens: '2026-11-05',
  applicationCloses: '2026-12-15T17:00',
  /**
   * ★ 最大の罠。
   * 様式4（事業支援計画書）は商工会議所・商工会が発行するもので、
   * その発行受付の締切が申請締切より11日早い。ここを逃すと申請自体ができない。
   * 締切直前は相談が集中するので、3週間前には窓口に行かせること（consultBy() が算出する）。
   */
  form4Deadline: '2026-12-04',
  resultAnnouncement: '2027年3月頃',
} as const;

// ============================================================
// 対象者
// ============================================================

export interface EmployeeLimit {
  label: string;
  limit: number;
  note: string;
}

export const EMPLOYEE_LIMITS: EmployeeLimit[] = [
  {
    label: '商業・サービス業（宿泊業・娯楽業を除く）',
    limit: 5,
    note: '飲食店・美容室・小売店・士業など。多くの対象店舗がこちら。',
  },
  {
    label: '製造業その他・宿泊業・娯楽業',
    limit: 20,
    note: '工務店・自動車整備・宿泊施設など。',
  },
];

/** 「常時使用する従業員」に含めるかどうか。ここを誤ると対象判定ごと間違える */
export const EMPLOYEE_COUNT_RULES = {
  included: [
    'パート・アルバイト（所定の期間を超えて継続雇用されている場合）',
    '従業員と兼務している役員',
  ],
  excluded: [
    '会社役員（従業員を兼務していない場合）',
    '個人事業主本人',
    '同居の親族従業員',
    '休業・休職中の社員',
    '日々雇い入れられる者',
    '2か月以内の期間を定めて雇用される者',
    '季節的業務に4か月以内の期間を定めて雇用される者',
    '外注先',
  ],
} as const;

/** 制度上、そもそも対象外になる法人格・業種 */
export const INELIGIBLE_ENTITIES: readonly string[] = [
  '医療法人',
  '学校法人',
  '宗教法人',
  '農業法人',
  '任意団体',
  '一般社団法人・一般財団法人（※一部例外あり。要確認）',
  '風俗営業等の規制対象業種',
];

// ============================================================
// ⚠️ 先出し提案との衝突（最重要）
// ============================================================

export const SUBSIDY_CONFLICT = {
  problem:
    '補助対象になるのは「交付決定日以降に発注」した経費だけで、' +
    '交付決定前の発注・契約・支払いはさかのぼって対象にできない。' +
    'つまり、先に作って渡し、その場で契約して支払ってもらうと、その費用は補助金の対象外になる。',
  timeline:
    '採択発表のあと見積を提出し、事務局の審査を経て交付決定に至るまで通常1〜2か月かかる。' +
    '申請から入金までは全体で1年程度を見込む必要がある。',
  solution:
    'トラックを分ける。今すぐ欲しい店舗には通常どおり販売し、' +
    '補助金を使いたい店舗には、先に作ったページを「提案資料」として扱い、' +
    '交付決定後に正式発注してもらう。' +
    '提案資料として完成品を見せること自体は何の問題もなく、' +
    'むしろ申請書の具体性が上がるので採択にも有利に働く。',
} as const;

export type Track = 'immediate' | 'subsidy';

export interface TrackDefinition {
  key: Track;
  label: string;
  forWhom: string;
  flow: string[];
  timeToCash: string;
  caution: string;
}

export const TRACKS: TrackDefinition[] = [
  {
    key: 'immediate',
    label: '通常トラック（すぐ公開）',
    forWhom: '補助金を使わず、今すぐサイトが欲しい店舗。',
    flow: [
      '先出しで作ったページを見せる',
      '写真をもらって仕上げる',
      '契約・入金',
      '公開',
    ],
    timeToCash: '2〜4週間',
    caution: 'この経路で受け取った費用は、あとから補助金の対象にはできない。',
  },
  {
    key: 'subsidy',
    label: '補助金トラック',
    forWhom: '補助金を使いたい店舗。実質負担を3分の1に抑えられる。',
    flow: [
      '先出しで作ったページを「提案資料」として見せる（この時点では受注しない）',
      '見積書を出す（申請書に添付してもらう）',
      '店舗が商工会議所で様式4を取得（申請締切より前に締切があるので注意）',
      `店舗が申請（${jpDate(SCHEDULE.applicationOpens)}〜${jpMonthDay(SCHEDULE.applicationCloses)}）`,
      '採択発表（2027年3月頃）',
      '見積提出 → 交付決定（1〜2か月）',
      '★ここで正式発注 → 制作 → 納品・支払い',
      '店舗が実績報告 → 確定検査 → 補助金が入金',
    ],
    timeToCash: '半年〜1年',
    caution:
      '交付決定より前に発注・契約・支払いをすると対象外になる。' +
      '採択率は5割弱なので、落ちた場合にどうするかを先に決めておくこと。',
  },
];

// ============================================================
// 実績
// ============================================================

export const TRACK_RECORD = {
  round: '第19回',
  applications: 16_576,
  adopted: 7_819,
  get rate(): number {
    return this.adopted / this.applications;
  },
} as const;

// ============================================================
// 計算
// ============================================================

export interface SubsidyEstimate {
  /** 制作費（税込） */
  cost: number;
  /** 補助される額 */
  subsidized: number;
  /** 店舗の実質負担 */
  outOfPocket: number;
  /** ウェブ上限に当たっているか */
  cappedByWebLimit: boolean;
}

export function estimateSubsidy(cost: number, isDeficit = false): SubsidyEstimate {
  const rate = isDeficit ? SUBSIDY.rateDeficit : SUBSIDY.rate;
  const raw = cost * rate;
  const subsidized = Math.floor(Math.min(raw, SUBSIDY.webCap));
  return {
    cost,
    subsidized,
    outOfPocket: cost - subsidized,
    cappedByWebLimit: raw > SUBSIDY.webCap,
  };
}

/** ウェブ関連費の補助上限に達する制作費。これを超えても補助額は増えない */
export function costAtWebCap(isDeficit = false): number {
  return Math.floor(SUBSIDY.webCap / (isDeficit ? SUBSIDY.rateDeficit : SUBSIDY.rate));
}

// ============================================================
// 適格性のスクリーニング
//
// アプリが持っているのは業種と店名だけなので、確定判定はできない。
// 「確実に対象外」「要確認」「対象になり得る」の3段階に振り分け、
// 判断材料を出すところまでにとどめる。
// ============================================================

export type Eligibility = 'likely_eligible' | 'needs_check' | 'likely_ineligible';

export interface EligibilityResult {
  status: Eligibility;
  /** 適用される従業員数の上限 */
  employeeLimit: EmployeeLimit;
  reasons: string[];
  /** 店主に確認すべきこと */
  toConfirm: string[];
}

/** 従業員20人まで認められる業種（それ以外は5人以下） */
const LARGER_LIMIT_CATEGORIES = ['工務店・リフォーム', '自動車関連', '宿泊'];

/** 法人格によって対象外になり得る業種 */
const ENTITY_RISK: Record<string, string> = {
  'クリニック・歯科':
    '医療法人は対象外。個人開業（法人化していない診療所）であれば対象になり得るので、法人格の確認が必要。',
  '学習塾・教室': '学校法人は対象外。個人経営・株式会社の塾であれば対象になり得る。',
};

export function screenEligibility(category: string, businessName: string): EligibilityResult {
  const employeeLimit =
    EMPLOYEE_LIMITS[LARGER_LIMIT_CATEGORIES.includes(category) ? 1 : 0] ?? EMPLOYEE_LIMITS[0]!;

  const reasons: string[] = [];
  const toConfirm: string[] = [
    `常時使用する従業員が${employeeLimit.limit}人以下か（個人事業主本人・同居の親族・非兼務役員は数えない）`,
    '過去に同じ補助金を受給していないか（一定期間の制限がある場合がある）',
  ];

  // 店名に法人格が出ているケースを拾う
  const haystack = `${businessName} ${category}`;
  const hitEntity = INELIGIBLE_ENTITIES.find((e) => {
    const core = e.split('（')[0] ?? e;
    return haystack.includes(core);
  });

  if (hitEntity) {
    return {
      status: 'likely_ineligible',
      employeeLimit,
      reasons: [`${hitEntity}は制度上の対象外です。`],
      toConfirm: [],
    };
  }

  const entityRisk = ENTITY_RISK[category];
  if (entityRisk) {
    reasons.push(entityRisk);
    toConfirm.unshift('法人格（医療法人・学校法人などでないか）');
    return { status: 'needs_check', employeeLimit, reasons, toConfirm };
  }

  reasons.push(`${employeeLimit.label}にあたるため、従業員${employeeLimit.limit}人以下が条件になります。`);
  return { status: 'likely_eligible', employeeLimit, reasons, toConfirm };
}

// ============================================================
// 店舗に案内するときの注意
// ============================================================

export const ADVISORY_RULES: readonly string[] = [
  '採択を保証する言い方をしない。採択率は5割弱で、落ちることの方が珍しくない。',
  '「補助金が出るので実質◯円です」と言い切らない。「対象になる可能性があります」までにとどめる。',
  '最終的な可否は商工会議所・商工会と事務局が判断する。自分が判定しない。',
  'ウェブ関連費のみでは申請できない。他の販路開拓費と組み合わせる必要があることを必ず伝える。',
  '交付決定前に発注・契約・支払いをすると対象外になることを、最初に伝える。ここを伝え忘れると後で必ず揉める。',
  '入金は事業完了後の精算払いで、申請から1年程度かかる。店舗は一度全額を立て替える必要がある。',
  '制度は公募回ごとに変わる。この資料の内容は ' + VERIFIED_ON + ' 時点のもの。',
];

/** ウェブ関連費と組み合わせられる他の経費の例。「他に何を申請すればいいか」への答え */
export const COMBINABLE_EXPENSES: readonly { name: string; example: string }[] = [
  { name: '機械装置等費', example: '厨房機器、施術ベッド、POSレジ、撮影機材' },
  { name: '展示会等出展費', example: '地域の物産展・商談会への出展料' },
  { name: '新商品開発費', example: '新メニューの試作、パッケージ制作' },
  { name: '資料購入費', example: '業務に必要な図書' },
  { name: '借料', example: 'イベント会場やスペースの賃借料' },
  { name: '委託・外注費', example: '店舗改装工事、看板設置' },
];
