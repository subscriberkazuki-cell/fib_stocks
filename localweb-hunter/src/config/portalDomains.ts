// ポータル/SNS ドメイン定義（§7 Stage 3）
//
// ここは「運用しながら育てる」場所。新しいポータルを見つけたら配列に足すだけでよい。
// 判定ロジック側（noWebsiteDetection.ts）にドメインをハードコードしないこと。

export const SOCIAL_DOMAINS: readonly string[] = [
  'instagram.com',
  'facebook.com',
  'fb.com',
  'fb.me',
  'm.facebook.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'lin.ee',
  'line.me',
  'page.line.me',
  'youtube.com',
  'youtu.be',
  'ameblo.jp',
  'note.com',
  'threads.net',
  'pinterest.jp',
  'pinterest.com',
];

/** 地図・店舗プロフィールのみ（独自HPとは見なさない） */
export const MAP_PROFILE_DOMAINS: readonly string[] = [
  'google.com',
  'google.co.jp',
  'maps.app.goo.gl',
  'goo.gl',
  'g.page',
  'business.site', // Google が発行する簡易サイト。独自HPとしては扱わない
];

/** グルメ・美容・医療・生活系ポータル */
export const PORTAL_DOMAINS: readonly string[] = [
  // グルメ
  'tabelog.com',
  'gnavi.co.jp',
  'retty.me',
  'hitosara.com',
  'ramendb.supleks.jp',
  // 美容・リラク
  'hotpepper.jp',
  'beauty.hotpepper.jp',
  'minimodel.jp',
  'beauty.rakuten.co.jp',
  'ozmall.co.jp',
  // 医療・健康
  'epark.jp',
  'caloo.jp',
  'byoinnavi.jp',
  'haisha-yoyaku.jp',
  'clinicta.jp',
  // 汎用ローカルポータル
  'ekiten.jp',
  'mypl.net',
  'itp.ne.jp', // iタウンページ
  'navitime.co.jp',
  'mapion.co.jp',
  'goo.ne.jp',
  'townpage.goo.ne.jp',
  'hotfrog.jp',
  'e-shops.jp',
  'shop-info.jp',
  'loco.yahoo.co.jp',
  // 士業・専門
  'bengo4.com',
  'zeiri4.com',
  'shiho-shoshi.or.jp',
];

/** 予約・EC・マーケットプレイス */
export const MARKETPLACE_DOMAINS: readonly string[] = [
  'rakuten.co.jp',
  'rakuten.ne.jp',
  'amazon.co.jp',
  'shopping.yahoo.co.jp',
  'auctions.yahoo.co.jp',
  'paypaymall.yahoo.co.jp',
  'ikyu.com',
  'jalan.net',
  'rurubu.travel',
  'booking.com',
  'airrsv.net',
  'reserva.be',
  'coubic.com',
  'stores.jp',
  'base.shop',
  'thebase.in',
  'shopify.com',
  'minne.com',
  'creema.jp',
  'mercari.com',
  'ubereats.com',
  'demae-can.com',
  'wolt.com',
];

/** 求人ポータル */
export const JOB_DOMAINS: readonly string[] = [
  'indeed.com',
  'jp.indeed.com',
  'townwork.net',
  'baitoru.com',
  'mynavi.jp',
  'rikunabi.com',
  'en-japan.com',
  'doda.jp',
  'job-medley.com',
  'weban.jp',
  'shigoto.mhlw.go.jp',
];

/**
 * 「独自ドメインに見えるが実質は共有ホスティングの無料ページ」。
 * 独自HPとしてカウントしないが、ポータルとも違うので分けている。
 */
export const FREE_HOSTING_DOMAINS: readonly string[] = [
  'wixsite.com',
  'jimdofree.com',
  'jimdo.com',
  'webnode.jp',
  'crayonsite.com',
  'crayonsite.net',
  'localinfo.jp',
  'gorp.jp',
  'on.omisenomikata.jp',
  'omisenomikata.jp',
  'wordpress.com',
  'blogspot.com',
  'hatenablog.com',
  'fc2.com',
  'web.fc2.com',
  'sakura.ne.jp', // 共有サーバのユーザーディレクトリ形式が多い
  'ne.jp',
];

/**
 * 営業対象外にする組織（§16-3）。
 * スコアで下げるのではなく、そもそもリストから除外する。
 */
export const EXCLUDED_ORGANIZATION_KEYWORDS: readonly string[] = [
  '市役所',
  '区役所',
  '町役場',
  '村役場',
  '県庁',
  '公民館',
  '図書館',
  '消防署',
  '警察署',
  '交番',
  '税務署',
  '法務局',
  '保健所',
  '裁判所',
  '選挙管理委員会',
  '神社',
  '寺院',
  '教会',
  '霊園',
  '納骨堂',
  '政党',
  '後援会',
  '労働組合',
];

/**
 * 広告規制の確認が必要な業種（§16-3）。
 * スコアは下げない。店舗詳細に注記を出すだけ。
 */
export const REGULATED_CATEGORY_KEYWORDS: readonly { keyword: string; note: string }[] = [
  { keyword: 'クリニック', note: '医療広告ガイドラインの確認が必要です（体験談・ビフォーアフター写真等に制限）' },
  { keyword: '医院', note: '医療広告ガイドラインの確認が必要です' },
  { keyword: '歯科', note: '医療広告ガイドラインの確認が必要です' },
  { keyword: '病院', note: '医療広告ガイドラインの確認が必要です' },
  { keyword: '診療所', note: '医療広告ガイドラインの確認が必要です' },
  { keyword: '整骨院', note: 'あん摩マツサージ指圧師等法・柔道整復師法による広告制限があります' },
  { keyword: '接骨院', note: 'あん摩マツサージ指圧師等法・柔道整復師法による広告制限があります' },
  { keyword: '鍼灸', note: 'あん摩マツサージ指圧師等法による広告制限があります' },
  { keyword: '薬局', note: '医薬品medical広告規制（薬機法）の確認が必要です' },
  { keyword: 'ドラッグストア', note: '薬機法の確認が必要です' },
  { keyword: '弁護士', note: '日本弁護士連合会の業務広告規程の確認が必要です' },
  { keyword: '法律事務所', note: '日本弁護士連合会の業務広告規程の確認が必要です' },
  { keyword: '税理士', note: '税理士会の広告規程の確認が必要です' },
  { keyword: '司法書士', note: '司法書士会の広告規程の確認が必要です' },
  { keyword: '行政書士', note: '行政書士会の広告規程の確認が必要です' },
  { keyword: '不動産', note: '宅建業法の広告規制（おとり広告・誇大広告の禁止）の確認が必要です' },
  { keyword: 'エステ', note: '特定商取引法（特定継続的役務提供）・景表法の確認が必要です' },
  { keyword: '脱毛', note: '医療広告ガイドライン／景表法の確認が必要です' },
  { keyword: '美容外科', note: '医療広告ガイドラインの確認が必要です' },
  { keyword: '金融', note: '金商法・貸金業法の広告規制の確認が必要です' },
];

/**
 * 事業用と判断できないフリーメールのドメイン（§2-4）。
 * ここに該当し、かつ店舗ドメイン上のページで見つからなかったメールは保存しない。
 */
export const FREE_EMAIL_DOMAINS: readonly string[] = [
  'gmail.com',
  'yahoo.co.jp',
  'ymail.ne.jp',
  'outlook.com',
  'outlook.jp',
  'hotmail.com',
  'hotmail.co.jp',
  'live.jp',
  'icloud.com',
  'me.com',
  'docomo.ne.jp',
  'ezweb.ne.jp',
  'au.com',
  'softbank.ne.jp',
  'i.softbank.jp',
  'ymobile.ne.jp',
  'nifty.com',
  'excite.co.jp',
  'aol.jp',
  'protonmail.com',
  'proton.me',
];
