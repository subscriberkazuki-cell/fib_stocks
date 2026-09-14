// AIへのプロンプト（§9-4 ハルシネーション対策）
//
// 共通ルールを1箇所に書き、全プロンプトの先頭に必ず入れる。
// 「不明なら null / 要確認」を明示的に許可することで、埋めたくなる圧力を下げる。

import type { OfficialSiteInput, SalesAnalysisInput } from './AIProvider';

export const ANTI_HALLUCINATION_RULES = `
【厳守事項】
- 入力に含まれていない事実を出力してはならない。
- 電話番号・メールアドレス・住所・URL・料金・受賞歴・創業年などを推測して生成してはならない。
- 判断できない項目は必ず null を出力すること。文章中で触れる必要がある場合は「要確認」と書くこと。
- レビュー内容・口コミの具体的な文言は入力にないため、決して創作してはならない。
- 出力は指定されたJSON形式のみ。前後に説明文やコードフェンスを付けないこと。
`.trim();

export function officialSiteJudgementPrompt(input: OfficialSiteInput): string {
  return `${ANTI_HALLUCINATION_RULES}

あなたは、あるURLが指定された店舗の「公式ホームページ」かどうかを判定します。

# 店舗情報
店舗名: ${input.businessName}
住所: ${input.address}
電話番号: ${input.phone ?? '（不明）'}

# 判定対象
URL: ${input.url}
ドメイン: ${input.domain}
ページタイトル: ${input.pageTitle ?? '（取得できず）'}
ページ本文の抜粋: ${input.pageExcerpt ? input.pageExcerpt.slice(0, 1500) : '（取得できず）'}
その店舗のSNS: ${input.snsUrls.length > 0 ? input.snsUrls.join(', ') : '（なし）'}

# 出力するJSON
{
  "official_site_probability": 0.0〜1.0の数値,
  "reason": "判定理由を1〜2文",
  "matched_business_name": true/false/null,
  "matched_phone": true/false/null,
  "matched_address": true/false/null,
  "site_type": "official" | "portal" | "social" | "booking" | "marketplace" | "unknown"
}

matched_* は、ページ本文の中でその情報が実際に確認できた場合のみ true、
確認できなかった場合は false、本文が取得できず判断不能な場合は null にすること。`;
}

export function salesAnalysisPrompt(input: SalesAnalysisInput): string {
  const patternBlock = input.detectedPattern
    ? `# ルールベースで検出済みの営業パターン
種別: ${input.detectedPattern.label}
根拠: ${input.detectedPattern.reason}
推奨オファー: ${input.detectedPattern.recommendedOffer}
（この検出結果を踏まえて具体化してください。矛盾する場合はその旨を reason に書いてください）`
    : '# ルールベースで検出済みの営業パターン\n（該当なし）';

  const weaknessBlock =
    input.observedWeaknesses.length > 0
      ? input.observedWeaknesses.map((w) => `- ${w}`).join('\n')
      : '（サイト未調査、または弱点が計測されていない）';

  const regulatoryBlock =
    input.regulatoryNotes.length > 0
      ? `\n# 広告規制に関する注記（提案内容を考える際に考慮すること）\n${input.regulatoryNotes.map((n) => `- ${n}`).join('\n')}`
      : '';

  return `${ANTI_HALLUCINATION_RULES}

あなたは、地域の店舗向けに **公式サイト（HP）と販売ページ（LP）** を制作する会社の
営業担当を支援するアシスタントです。
以下の店舗について、営業対象としての価値を分析し、実際に電話をかけるための材料を作ってください。

# 提供できるサービス（この2系統から選んで提案してください）
■ 公式サイト … 店名で検索されたときの受け皿。信頼性と基本情報。常設。
  - 1ページ型サイト：店舗情報を1枚に。SNSはあるが公式サイトがない店に。
  - 5ページ型サイト：店舗紹介・メニュー・アクセス・問い合わせを分けた標準構成。
  - 予約対応サイト：予約が売上に直結する業態に。予約フォーム／外部予約システム連携。
  - サイトリニューアル：既存サイトがスマホ非対応・更新停止している場合。

■ 販売ページ（LP） … 1つの商品・コース・キャンペーンを売り切る1枚。行動は1つだけ。
  - 体験・相談申込ページ：「まず試してもらえれば続く」業態（整体・ジム・塾・士業）に。
  - 商品・コース販売ページ：単価の高い商品や回数券がある店に。
  - キャンペーンページ：期間限定の集客企画に。

**使い分けの原則**：
  公式サイトが無い店 → まず公式サイト。ただしSNSで集客できている店は1ページ型＋LPの方が刺さる。
  公式サイトが既に整備されている店 → サイトの提案は通らない。販売ページ（LP）で提案する。
  古いサイトがある店 → リニューアルが最優先。ゼロから作るより話が通りやすい。

# 店舗情報（これがすべての入力です。ここにない情報は使わないでください）
店舗名: ${input.businessName}
業種: ${input.category || '（不明）'}
住所: ${input.address || '（不明）'}
Google等の評価: ${input.rating ?? '（不明）'}
レビュー件数: ${input.reviewCount ?? '（不明）'}
Web上の状態: ${input.websiteStatus}
サイトの改善余地スコア（0〜100・高いほど改善余地あり）: ${input.websiteOpportunityScore ?? '（未調査）'}
電話番号: ${input.hasPhone ? 'あり' : 'なし'}
メールアドレス: ${input.hasEmail ? 'あり' : 'なし'}
SNS: ${input.socialUrls.length > 0 ? input.socialUrls.join(', ') : 'なし'}

${patternBlock}

# 実測されたサイトの弱点（ここに挙がっていない弱点を指摘しないこと）
${weaknessBlock}${regulatoryBlock}

# 営業トークを書くときの注意
- 相手は忙しい店舗の方です。最初の一言で「売り込み」と切られない書き方にしてください。
- 評価やレビュー件数に実際に触れて、その店を見た上で電話していることが伝わるようにしてください。
- 存在しない実績・受賞歴・口コミ内容を作らないこと。
- 誇大な効果保証（「必ず集客できます」等）を書かないこと。

# 出力するJSON
{
  "score": 0〜100の数値またはnull,
  "reason": "この店舗が営業対象として有望（または不向き）な理由を2〜3文",
  "strengths": ["営業上の強み", "..."],
  "weaknesses": ["営業上の懸念・弱み", "..."],
  "sales_angle": "どの角度から提案するか",
  "recommended_offer": "推奨するプラン（上記の7つから1つ選び、その名称を含めて書く）",
  "store_type_tags": ["高単価型","地域密着型","リピート型","新規集客型","SNS集客型","店舗ブランド型","専門サービス型","予約型","緊急需要型","EC併用型" から該当するもの"],
  "estimated_priority": "S"|"A"|"B"|"C"|"D"|null,
  "talk_15s": "15秒で話す電話営業トーク",
  "talk_30s": "30秒版",
  "talk_60s": "60秒版",
  "email_draft": "この店舗向けの営業メール本文（件名を1行目に「件名: 」で始めて書く）",
  "hp_plan": "提案するページの構成案を3〜5行で（公式サイトならページ構成、LPなら上から下への流れ）"
}`;
}
