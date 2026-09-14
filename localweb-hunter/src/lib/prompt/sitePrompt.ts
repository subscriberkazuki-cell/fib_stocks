// 店舗サイト制作プロンプトの生成。
//
// 狙い：AIに「1ページのサイトを作って」と頼んだときに出てくる既定の顔
//       （紫グラデーションのヒーロー＋3カラムの特徴カード＋架空の推薦文）を潰し、
//       その店の業種・実データに合ったものを出させること。
//
// そのために必要なのは3つ。
//   1. 実データを渡す（店名・評価・住所・営業時間を推測させない）
//   2. デザイン方針を具体的に指定する（HEXまで。「おしゃれに」では既定値が出る）
//   3. やってはいけないことを明示する（捏造・規制表現・AIっぽい定型）

import { findSiteDesign, type SiteDesign } from '@/config/siteDesign';
import { findIndustryApproach } from '@/config/approaches';
import type { Business } from '@/types/business';

export interface SitePromptOptions {
  /** 店主から写真を受け取っているか。段階によって指示が変わる */
  hasPhotos: boolean;
  /** 制作者の連絡先。フッターに入れる */
  builderName: string;
  /** 提案用の非公開プレビューであることを明示するか */
  isProposal: boolean;
}

export const DEFAULT_PROMPT_OPTIONS: SitePromptOptions = {
  hasPhotos: false,
  builderName: '',
  isProposal: true,
};

/** 店舗の実データ。推測させないために、分かっているものと分かっていないものを区別して渡す */
function factsBlock(b: Business): string {
  const line = (label: string, value: string | number | null | undefined): string =>
    `- ${label}: ${value === null || value === undefined || value === '' ? '（不明 — 推測して書かないこと）' : value}`;

  return [
    line('店舗名', b.name),
    line('業種', b.category),
    line('住所', b.address),
    line('電話番号', b.phone?.value ?? null),
    line('営業時間', b.openingHours),
    line('Googleなどの評価', b.rating?.value ?? null),
    line('口コミ件数', b.reviewCount?.value ?? null),
    b.socialUrls.length > 0 ? `- SNS: ${b.socialUrls.join(', ')}` : '- SNS: （なし）',
  ].join('\n');
}

function designBlock(d: SiteDesign): string {
  return `## このサイトが達成すること
${d.objective}

## 見る人
${d.visitor}

## 配色（この値を使うこと。無難な青に置き換えないこと）
- 背景: ${d.palette.bg}
- 文字: ${d.palette.ink}
- アクセント: ${d.palette.accent}
- 補助: ${d.palette.sub}
- 意図: ${d.palette.note}

## 書体
${d.typography}

## 全体の印象
${d.mood}

## セクションの構成（この順序で。増やさず、減らさず）
${d.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## 主要な行動（CV）
${d.primaryCta}

## この業種で効く細部
${d.details.map((x) => `- ${x}`).join('\n')}

## この業種で書いてはいけないこと
${d.forbidden.map((x) => `- ${x}`).join('\n')}`;
}

function photoBlock(d: SiteDesign, hasPhotos: boolean): string {
  if (hasPhotos) {
    return `## 写真
店主から提供された写真を使う。ファイル名は images/ 配下を想定して相対パスで書き、
実際の差し替えがしやすいようにコメントで「何の写真か」を書いておくこと。

- 実写真でなければならない: ${d.realPhotoOnly.join('、')}
- フリー素材で代替してよい: ${d.stockPhotoOk.join('、')}

**他店の写真やフリー素材を、この店の${d.realPhotoOnly[0] ?? '実物'}であるかのように見せてはならない。**
来店した客が「写真と違う」となるうえ、景品表示法の優良誤認にあたる可能性がある。

画像には必ず width/height または aspect-ratio を指定し、読み込み時にレイアウトがずれないようにすること。
ファーストビュー以外の画像は loading="lazy" を付ける。`;
  }

  return `## 写真（重要：この段階では写真が無い）

まだ店主から写真を受け取っていないため、**写真に依存しないデザインで完成させること。**
「後で写真を入れれば良くなる」ではなく、**写真が1枚も無い状態で完成品として成立させる。**

具体的には：
${d.withoutPhotos}

写真が入る位置には、以下の形でプレースホルダを置くこと：
- aspect-ratio でスペースを確保する（後から差し替えてもレイアウトが崩れない）
- 背景はアクセント色の薄いトーンか、控えめな幾何学パターン
- 中央に「写真が入ります（店内）」のように、何の写真かを小さく表示
- **灰色のベタ塗りや「画像なし」アイコンは使わない**（未完成に見え、提案として弱くなる）

フリー素材は使わないこと。この段階で他店の写真が入っていると、
店主が「うちの店じゃない」と感じて、それ以降の話が進まなくなる。`;
}

const TECH_REQUIREMENTS = `## 技術要件

- **単一のHTMLファイル**として出力する（index.html 1枚で完結）。CSSは \`<style>\` 内に書く
- CSSフレームワークは使わない。Tailwind CDN も使わない（読み込みが重く、本番用途に向かない）
- フォントは Google Fonts を \`<link>\` で読み込む。必ずフォールバックを指定する
  例: \`font-family: 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif;\`
- レスポンシブ。**スマートフォンを基準に設計し、広い画面に広げる**（来訪者の大半はスマホ）
- 横スクロールを発生させない
- 電話番号は \`<a href="tel:...">\`。ハイフンを除いた番号を href に入れる
- 地図は Google Maps の埋め込み（iframe）。住所から検索するURL形式を使う
- \`prefers-reduced-motion\` を尊重する。アニメーションは控えめに（動きで誤魔化さない）
- 色のコントラスト比は本文4.5:1以上を確保する
- セマンティックHTML。\`<header> <main> <section> <footer>\`、見出しは h1 → h2 の階層を守る
- 画像には alt を必ず書く。装飾目的なら \`alt=""\`
- \`<title>\` は「店舗名｜業種 - 市区町村」の形式
- meta description、OGP、JSON-LD（schema.org の LocalBusiness）を入れる
- JavaScriptは最小限。営業時間の判定など、明確な用途がある場合のみ`;

const ANTI_PATTERNS = `## 避けること（AIが既定で出しがちなもの）

以下は、生成AIがどの業種にも同じように出してくる型で、**地域の個人店には合わない**。
明示的に避けること。

- 紫〜青のグラデーションのヒーロー背景
- 「Fast」「Reliable」「Affordable」のような抽象的な3カラムの特徴カード
- アイコン付きの丸いバッジを並べた「選ばれる理由」セクション
- **架空の顧客の推薦文**（実在しない人の声を作るのは捏造。絶対に書かない）
- 「10,000人以上が利用」のような**根拠のない数字**
- 意味のないスクロールアニメーション、パララックス
- 英語のキャッチコピー（地域の個人店では浮く）
- 「〜しませんか？」で始まる問いかけ型の見出しの多用
- 全幅のヒーロー画像に白文字を重ねただけの構成

代わりに：
- その店の**具体的な事実**を見出しにする（「柏駅西口 徒歩5分 / 駐車場3台」）
- 情報の密度で見せる。余白と文字の大きさの差でリズムを作る
- 装飾より**情報が正確に整理されていること**を優先する`;

const NO_FABRICATION = `## 捏造の禁止（最重要）

**渡された事実に無い情報を、それらしく作ってはならない。**

- 創業年、受賞歴、メディア掲載、スタッフ数、席数、資格 — 渡していないものは書かない
- 顧客の声・レビュー本文は一切作らない（評価の数値は渡したものだけ使ってよい）
- メニュー名や価格を勝手に作らない
- 不明な項目は、その部分を省略するか、\`<!-- 要確認: 席数 -->\` の形でHTMLコメントに残す

このサイトは実在の店舗に提案するものなので、事実でない記述が混ざると、
その1点で提案全体の信用が失われる。`;

export function buildSitePrompt(b: Business, opts: SitePromptOptions = DEFAULT_PROMPT_OPTIONS): string {
  const design = findSiteDesign(b.category);
  const approach = findIndustryApproach(b.category);

  const proposalNote = opts.isProposal
    ? `\n## この制作物の位置づけ
これは**まだ店主の合意を得ていない提案用のプレビュー**である。

- 検索エンジンにインデックスさせない: \`<meta name="robots" content="noindex, nofollow">\` を入れる
- フッターに「これは制作提案用のサンプルです。${opts.builderName || '（制作者名）'}が作成しました。」と小さく記載する
- 店舗の正式な公式サイトであるかのような表記（コピーライト表記など）はしない\n`
    : '';

  const regulatory =
    b.regulatoryNotes.length > 0
      ? `\n## この店舗に適用される広告規制\n${b.regulatoryNotes.map((n) => `- ${n}`).join('\n')}\n表現がこれらに触れていないか、書き終えてから確認すること。\n`
      : '';

  const contextNote = approach
    ? `\n## この業種の来訪者が抱えている不満\n${approach.painPoint}\n\nサイトはこの不満を解消する方向で設計する。\n`
    : '';

  if (!design) {
    // 業種表に無い場合でも、事実と禁止事項だけは渡して最低限の品質を確保する
    return `あなたは、日本の地域店舗向けのWebサイトを専門とするプロのWebデザイナー兼フロントエンドエンジニアです。
以下の店舗の**1ページ完結**の公式サイトを作ってください。

# 店舗の事実（これがすべて。ここに無い情報は書かないこと）
${factsBlock(b)}
${proposalNote}${regulatory}
${TECH_REQUIREMENTS}

${ANTI_PATTERNS}

${NO_FABRICATION}

# 出力
index.html を1枚、完成した状態で出力してください。説明は最小限で構いません。`;
  }

  return `あなたは、日本の地域店舗向けのWebサイトを専門とするプロのWebデザイナー兼フロントエンドエンジニアです。
以下の店舗の**1ページ完結**の公式サイトを作ってください。

上から下へスクロールするだけで完結する構成で、**スマートフォンでの閲覧を基準**に設計します。

# 店舗の事実（これがすべて。ここに無い情報は書かないこと）
${factsBlock(b)}
${proposalNote}${contextNote}${regulatory}
# デザインの方針

${designBlock(design)}

${photoBlock(design, opts.hasPhotos)}

${TECH_REQUIREMENTS}

${ANTI_PATTERNS}

${NO_FABRICATION}

# 品質の基準

書き終えたら、以下を自分で確認してください。満たしていなければ直してから出力します。

1. スマートフォン幅（375px）で横スクロールが発生していないか
2. ファーストビューで「店名・何の店か・電話ボタン」が見えているか
3. ${design.primaryCta.split('。')[0]}が、スクロールのどの位置からでも押せるか
4. 渡していない事実を書いていないか（創業年・受賞歴・客の声・メニュー価格）
5. 「この業種で書いてはいけないこと」に触れていないか
6. 上の「避けること」に挙げた型を使っていないか
7. 写真が1枚も無い状態でも、完成品として成立して見えるか

# 出力
index.html を1枚、完成した状態で出力してください。`;
}

/** プロンプトの概算文字数。UIで「長すぎないか」を示すために使う */
export function promptLength(prompt: string): number {
  return prompt.length;
}
