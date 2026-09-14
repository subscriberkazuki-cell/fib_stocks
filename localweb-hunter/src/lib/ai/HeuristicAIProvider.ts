// HeuristicAIProvider — AIキーなしで動くルールベース版（$0）
//
// これは「AIの代替物」ではなく、AIを設定していない人でもツールが
// 最後まで機能するための下地。営業トークはテンプレートだが、
// 入力にある事実だけで組み立てるので、ハルシネーションは構造的に起きない。

import type {
  AIProvider,
  OfficialSiteInput,
  OfficialSiteJudgement,
  SalesAnalysisInput,
  SalesAnalysisPayload,
} from './AIProvider';
import { classifyUrl } from '@/lib/detection/noWebsiteDetection';
import { normalizePhone } from '@/lib/dedupe/phone';

export class HeuristicAIProvider implements AIProvider {
  readonly name = 'heuristic';
  readonly modelId = 'rule-based/v1';
  readonly billable = false;

  isConfigured(): boolean {
    return true;
  }
  costPerCall(): number {
    return 0;
  }

  async judgeOfficialSite(input: OfficialSiteInput): Promise<OfficialSiteJudgement> {
    const classification = classifyUrl(input.url);
    const excerpt = input.pageExcerpt ?? '';
    const title = input.pageTitle ?? '';
    const haystack = `${title} ${excerpt}`;

    const nameMatched = input.businessName.length > 1 ? haystack.includes(input.businessName) : null;

    const phoneNorm = normalizePhone(input.phone);
    const phoneMatched = phoneNorm
      ? haystack.replace(/[-\s()（）]/g, '').includes(phoneNorm)
      : null;

    // 住所は表記ゆれが大きいので、番地を除いた前半で照合する
    const addressCore = input.address.replace(/[0-9０-９\-−ー]/g, '').slice(0, 12);
    const addressMatched = addressCore.length >= 4 ? haystack.includes(addressCore) : null;

    let probability: number;
    if (classification !== 'official') {
      probability = 0.05;
    } else {
      const hits = [nameMatched, phoneMatched, addressMatched].filter((v) => v === true).length;
      // 独自ドメインで、店名・電話・住所のいずれかが実際にページ内で確認できれば確度が上がる
      probability = Math.min(0.4 + hits * 0.2, 0.95);
    }

    const siteType =
      classification === 'official' ? 'official'
      : classification === 'social' ? 'social'
      : classification === 'marketplace' ? 'marketplace'
      : classification === 'portal' || classification === 'job' ? 'portal'
      : classification === 'map_profile' ? 'unknown'
      : 'unknown';

    return {
      official_site_probability: probability,
      reason: `ドメイン分類=${classification}。ページ内で店名${nameMatched ? '一致' : '未確認'}／電話${phoneMatched ? '一致' : '未確認'}／住所${addressMatched ? '一致' : '未確認'}。`,
      matched_business_name: nameMatched,
      matched_phone: phoneMatched,
      matched_address: addressMatched,
      site_type: siteType,
    };
  }

  async analyzeSalesOpportunity(input: SalesAnalysisInput): Promise<SalesAnalysisPayload> {
    const rating = input.rating;
    const reviews = input.reviewCount;
    const ratingText = rating !== null ? `評価${rating}` : '評価は要確認';
    const reviewText = reviews !== null ? `口コミ${reviews}件` : '口コミ件数は要確認';

    const strengths: string[] = [];
    if (rating !== null && rating >= 4.3) strengths.push(`評価が${rating}と高く、来店客の満足度が高い`);
    if (reviews !== null && reviews >= 50) strengths.push(`レビューが${reviews}件あり、継続的に集客できている`);
    if (input.socialUrls.length > 0) strengths.push('SNSでの発信があり、受け皿を作れば流入を活かせる');
    if (input.hasPhone) strengths.push('電話番号が公開されており、すぐに接触できる');
    if (strengths.length === 0) strengths.push('要確認');

    // 「サイト未調査」と「サイトが存在しない」を区別する。
    // HPがない店舗に「未調査のため要確認」と出すのは事実として誤り。
    const noSite =
      input.websiteStatus.includes('なし') ||
      input.websiteStatus.includes('SNSのみ') ||
      input.websiteStatus.includes('ポータル') ||
      input.websiteStatus.includes('プロフィールのみ');
    const weaknesses = input.observedWeaknesses.length > 0
      ? input.observedWeaknesses.slice(0, 5)
      : noSite
        ? ['公式サイトがないため、検索から来た人が情報を確認できない']
        : ['サイト未調査のため弱点は要確認'];

    const offer = input.detectedPattern?.recommendedOffer ?? '5ページ型の公式サイト';
    const angle = input.detectedPattern?.reason
      ?? `${ratingText}・${reviewText}という実績に対して、Web上の受け皿（${input.websiteStatus}）が見合っていない点を起点に提案する。`;

    const tags: string[] = [];
    if (input.category.includes('クリニック') || input.category.includes('士業') || input.category.includes('ジム')) tags.push('高単価型');
    if (input.socialUrls.length > 0) tags.push('SNS集客型');
    if (input.category.includes('美容') || input.category.includes('整体')) tags.push('リピート型', '予約型');
    if (tags.length === 0) tags.push('地域密着型');

    const shopName = input.businessName;
    // 一覧カードに出る一言。ここが全店舗で同じ文言だと、
    // 44枚並んだときにカードの1/4を占めて何の判断材料にもならない。
    // 店舗ごとに変わる要素（評価・件数・Web状態・パターン・SNS有無）で組み立てる。
    const reasonParts: string[] = [];
    if (input.detectedPattern) reasonParts.push(input.detectedPattern.label);
    if (rating !== null && rating >= 4.5) reasonParts.push(`評価${rating}と高評価`);
    else if (rating !== null) reasonParts.push(`評価${rating}`);
    if (reviews !== null && reviews >= 200) reasonParts.push(`口コミ${reviews}件と集客力あり`);
    else if (reviews !== null && reviews >= 30) reasonParts.push(`口コミ${reviews}件`);
    else if (reviews !== null) reasonParts.push(`口コミ${reviews}件と少なめ`);
    if (input.socialUrls.length > 0) reasonParts.push('SNS運用あり');
    if (input.websiteOpportunityScore !== null && input.websiteOpportunityScore >= 70) {
      reasonParts.push('サイトの改善余地大');
    }
    if (input.hasEmail) reasonParts.push('メール取得済');

    return {
      score: null, // 数値スコアは Lead Score が担当する。ここで別の数字を作らない
      reason: reasonParts.join('・') + '。',
      strengths,
      weaknesses,
      sales_angle: angle,
      recommended_offer: offer,
      store_type_tags: [...new Set(tags)].slice(0, 4),
      estimated_priority: null, // Lead Score から算出する値を上書きしない
      talk_15s: `お忙しいところ恐れ入ります。${shopName}様のホームページを探していたのですが見当たらず、お電話しました。ホームページ制作をしている者です。1分だけよろしいでしょうか。`,
      talk_30s: `お忙しいところ失礼します。${shopName}様、口コミの評価がとても良いのを拝見しまして、ホームページを探したのですが見つからず、お電話しました。ホームページ制作をしております。${reviewText}いただいているお店だと、検索から来られる方の受け皿があると取りこぼしが減ると思いまして、ご案内だけでもと思いお電話しました。`,
      talk_60s: `お忙しいところ恐れ入ります。ホームページ制作をしております者です。${shopName}様、${ratingText}・${reviewText}と拝見しまして、地域でしっかり支持されているお店だと思ったのですが、公式のホームページが見当たりませんでした。今は「店名で検索したときに公式の情報が出てこない」状態なので、来店を検討している方が営業時間やメニューを確認できずに離脱している可能性があります。${offer}であれば、必要な情報を1箇所にまとめて、電話や予約への導線まで作れます。無理におすすめするつもりはないのですが、費用感だけでもお伝えできればと思いお電話しました。`,
      email_draft: `件名: ${shopName}様のホームページについてのご提案\n\n${shopName} ご担当者様\n\n突然のご連絡失礼いたします。ホームページ制作を行っております。\n\n${shopName}様の口コミを拝見し、${ratingText}・${reviewText}と地域で高く評価されているお店だと感じました。一方で公式ホームページが見当たらず、店名で検索された方に情報が届いていない可能性があると考えご連絡しております。\n\nご提案内容：${offer}\n\nご興味がありましたら、費用と制作期間の目安をお送りいたします。不要でしたらこのメールは破棄いただいて構いません。\n\n※本メールは公開されている情報をもとにお送りしています。`,
      hp_plan: `${offer}\n- トップ：店舗の雰囲気が伝わる写真と、営業時間・電話番号を最初に表示\n- ${input.category || 'サービス'}紹介：提供内容と料金の目安\n- アクセス：地図・駐車場の有無\n- お問い合わせ：電話タップと問い合わせフォーム${input.socialUrls.length > 0 ? '\n- SNS連携：既存アカウントへの導線' : ''}`,
    };
  }
}
