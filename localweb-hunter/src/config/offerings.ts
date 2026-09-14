// 提供サービスのカタログ。
//
// このアプリが売る相手は「顧客相手のビジネス（B2C の地域店舗）」で、
// 売るものは **公式サイト（HP）** と **販売ページ（LP）** の2系統ある。
// この2つは目的が違うので、同じ「HP制作」として一緒くたに提案すると刺さらない。
//
//   公式サイト … 店名で検索されたときの受け皿。信頼性と基本情報。常設。
//   販売ページ … 1つの商品・コース・キャンペーンを売り切る。行動は1つだけ。
//
// 例：整体院に「5ページのHP」を提案しても「今あるInstagramで足りてる」で終わる。
//     「初回体験60分の申込ページ」なら、来月の予約が何件増えるかの話になる。
//
// ★ 価格は運用者ごとに違うので、下の PRICE_HINTS を自分の価格帯に書き換えること。
//    書き換えるまでUIには「未設定」と表示され、金額を勝手に見せることはしない。

export type OfferingKind = 'site' | 'lp';

export interface Offering {
  key: string;
  name: string;
  kind: OfferingKind;
  /** 一言でいうと何か */
  summary: string;
  /** どういう状況の店舗に向くか */
  whenToUse: string;
  /** 納品物 */
  deliverables: string[];
  /** 相手にとっての価値。営業トークの芯になる部分 */
  valueToClient: string;
  /** 制作期間の目安（週） */
  leadTimeWeeks: string;
}

// ============================================================
// 公式サイト（HP）
// ============================================================

export const SITE_OFFERINGS: Offering[] = [
  {
    key: 'site_onepage',
    name: '1ページ型サイト',
    kind: 'site',
    summary: '店舗情報を1枚にまとめた、最小構成の公式サイト',
    whenToUse:
      'SNSは動いているが公式サイトがない店。まず「検索したときに出てくる状態」を作りたい場合。予算の壁が低いので最初の1件として通しやすい。',
    deliverables: [
      '店舗紹介・写真',
      'メニュー／サービスの概要',
      '営業時間・定休日',
      'アクセス（地図・駐車場）',
      '電話タップ・問い合わせ導線',
      'SNSへのリンク',
    ],
    valueToClient:
      '店名で検索した人が、営業時間とメニューを確認できずに離脱するのを止められる。SNSを見た人の着地点になる。',
    leadTimeWeeks: '1〜2週',
  },
  {
    key: 'site_standard',
    name: '5ページ型サイト',
    kind: 'site',
    summary: '店舗紹介・メニュー・アクセス・問い合わせを分けた標準構成',
    whenToUse:
      '評価も口コミ件数も十分あり、商売として成立している店。情報量が必要で、検索からの流入を継続的に受けたい場合。',
    deliverables: [
      'トップページ',
      'メニュー／サービス詳細（料金含む）',
      '店舗・スタッフ紹介',
      'アクセス・営業案内',
      'お問い合わせフォーム',
      '基本的なSEO設定（title / description / 構造化データ）',
    ],
    valueToClient:
      '「この店で大丈夫か」を検討している人に、判断材料をひととおり渡せる。ポータルサイトに依存せず自分の資産になる。',
    leadTimeWeeks: '3〜4週',
  },
  {
    key: 'site_reservation',
    name: '予約対応サイト',
    kind: 'site',
    summary: '5ページ型に予約導線を組み込んだ構成',
    whenToUse:
      '予約が売上に直結する業態（美容室・整体・クリニック・飲食の個室など）で、予約手段が電話しかない、またはポータル経由しかない場合。',
    deliverables: [
      '5ページ型サイト一式',
      '予約フォーム、または外部予約システム（STORES予約・RESERVA等）の連携',
      '予約前に知りたい情報の整理（所要時間・料金・キャンセル規定）',
      '予約完了メールの文面',
    ],
    valueToClient:
      '営業時間外の予約を取りこぼさない。ポータル経由の送客手数料を減らせる余地ができる。',
    leadTimeWeeks: '4〜6週',
  },
  {
    key: 'site_renewal',
    name: 'サイトリニューアル',
    kind: 'site',
    summary: '既存サイトの作り直し。スマホ対応・導線・SEOの立て直し',
    whenToUse:
      '公式サイトはあるが、スマホで崩れる／何年も更新されていない／問い合わせ導線がない、といった状態。評価と口コミ件数が多いほど機会損失が大きいので優先度が上がる。',
    deliverables: [
      '現状サイトの問題点の洗い出し（本アプリの改善余地スコアがそのまま使える）',
      'スマートフォン対応',
      '電話・予約・問い合わせ導線の再設計',
      'SSL対応',
      '基本的なSEO設定の是正',
      '既存コンテンツの移行',
    ],
    valueToClient:
      '今あるサイトが機会損失を出している状態を止める。ゼロから作るより心理的ハードルが低い。',
    leadTimeWeeks: '3〜5週',
  },
];

// ============================================================
// 販売ページ（LP）
// ============================================================

export const LP_OFFERINGS: Offering[] = [
  {
    key: 'lp_trial',
    name: '体験・相談申込ページ',
    kind: 'lp',
    summary: '初回体験／無料相談への申込に絞った1枚',
    whenToUse:
      '「まず試してもらえれば続く」タイプの業態（整体・エステ・ジム・学習塾・士業の初回相談）。継続課金や高単価に繋がるので、1件あたりの価値が高い。',
    deliverables: [
      '悩み → 解決 → 体験内容 → 料金 → 申込 の構成',
      '申込フォーム（日時の希望を取る）',
      '「初めてでも大丈夫」を伝えるパート（当日の流れ・持ち物・所要時間）',
      'よくある不安への回答',
      '広告から飛ばす場合の計測タグ設置',
    ],
    valueToClient:
      '「行ってみようかな」で止まっている人を、申込まで運べる。広告を出すときの受け皿になる。',
    leadTimeWeeks: '2〜3週',
  },
  {
    key: 'lp_product',
    name: '商品・コース販売ページ',
    kind: 'lp',
    summary: '特定の商品やコースを売り切るための1枚',
    whenToUse:
      '単価の高い商品・回数券・コースがある店。既存のHPに埋もれていて、その商品だけを説明しきれていない場合。',
    deliverables: [
      '商品の価値説明（誰の何を解決するか）',
      '料金と内訳',
      '他との違い',
      '購入・申込フォーム、または決済連携',
      '特定商取引法に基づく表記の整備',
      'よくある質問',
    ],
    valueToClient:
      'HPの一部として埋もれている商品に、専用の説明の場を与えられる。広告やSNSから直接送れる。',
    leadTimeWeeks: '2〜4週',
  },
  {
    key: 'lp_campaign',
    name: 'キャンペーンページ',
    kind: 'lp',
    summary: '期間限定の集客企画に使う1枚',
    whenToUse:
      '新規オープン・季節需要・周年など、期間を区切って動かしたい場合。単発で終わらず、次回以降に使い回せる型を残せる。',
    deliverables: [
      'キャンペーン内容と期限',
      '申込・来店予約の導線',
      'SNS・チラシからの流入を想定した構成',
      '終了後に通常ページへ切り替える手順',
    ],
    valueToClient:
      'チラシやSNSの投稿から「詳しくはこちら」で飛ばせる先ができる。反応を数字で見られる。',
    leadTimeWeeks: '1〜2週',
  },
];

export const ALL_OFFERINGS: Offering[] = [...SITE_OFFERINGS, ...LP_OFFERINGS];

export function findOffering(key: string): Offering | null {
  return ALL_OFFERINGS.find((o) => o.key === key) ?? null;
}

// ============================================================
// 価格の目安
//
// ★ ここを自分の価格帯に書き換えること。
//    null のままだと、UIには金額を表示せず「未設定」と出る。
//    根拠のない金額を勝手に見せない（相手に伝える数字なので）。
// ============================================================

export const PRICE_HINTS: Record<string, { min: number; max: number } | null> = {
  site_onepage: null,
  site_standard: null,
  site_reservation: null,
  site_renewal: null,
  lp_trial: null,
  lp_product: null,
  lp_campaign: null,
};

export function priceLabel(key: string): string {
  const p = PRICE_HINTS[key];
  if (!p) return '未設定';
  const fmt = (v: number): string => `¥${v.toLocaleString('ja-JP')}`;
  return p.min === p.max ? fmt(p.min) : `${fmt(p.min)}〜${fmt(p.max)}`;
}

export function hasAnyPriceConfigured(): boolean {
  return Object.values(PRICE_HINTS).some((p) => p !== null);
}
