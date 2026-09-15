// 差出人情報。
//
// ============================================================
// なぜ必須なのか
// ============================================================
//
// 営業目的のメールは **特定電子メール法** の規制対象で、本文に次の表示が義務づけられている
// （第4条および施行規則）。書かずに送ると、措置命令・罰則の対象になり得る。
//
//   1. 送信者の氏名または名称
//   2. 送信者の住所
//   3. 受信拒否の通知を受けるためのメールアドレスまたはURL
//   4. 苦情・問い合わせを受け付けられる連絡先
//
// したがって **これが埋まっていないメールは送れない。**
// アプリ側は「書き忘れた」が起きないように、未設定なら送信ボタン自体を止める。
//
// 屋号と電話番号は法律上の必須ではないが、入っている方が明らかに信用される。
// 見知らぬ相手からのメールで、屋号も電話もないものは警戒される。

export interface SenderIdentity {
  /** 氏名または名称（法律上必須） */
  name: string;
  /** 屋号（任意だが推奨） */
  company: string;
  /** 住所（法律上必須） */
  address: string;
  /** 電話番号（任意だが推奨） */
  phone: string;
  /** 受信拒否・問い合わせを受けるアドレス（法律上必須） */
  email: string;
}

export const EMPTY_SENDER: SenderIdentity = {
  name: '',
  company: '',
  address: '',
  phone: '',
  email: '',
};

export interface SenderField {
  key: keyof SenderIdentity;
  label: string;
  /** 法律上の必須項目か。未入力なら送信を止める */
  required: boolean;
  why: string;
  placeholder: string;
}

export const SENDER_FIELDS: SenderField[] = [
  {
    key: 'name',
    label: '氏名または名称',
    required: true,
    why: '特定電子メール法で表示が義務づけられている。',
    placeholder: '柏 太郎',
  },
  {
    key: 'company',
    label: '屋号',
    required: false,
    why: '法律上は任意。ただし屋号がないメールは警戒されやすい。',
    placeholder: '〇〇ウェブ制作',
  },
  {
    key: 'address',
    label: '住所',
    required: true,
    why: '特定電子メール法で表示が義務づけられている。番地まで書くこと。',
    placeholder: '千葉県柏市〇〇 1-2-3',
  },
  {
    key: 'phone',
    label: '電話番号',
    required: false,
    why: '法律上は任意。ただし連絡先が1つしかないと問い合わせのハードルが上がる。',
    placeholder: '04-0000-0000',
  },
  {
    key: 'email',
    label: 'メールアドレス',
    required: true,
    why: '受信拒否と問い合わせの受け先。特定電子メール法で必要。',
    placeholder: 'you@example.com',
  },
];

/** 法律上の必須項目のうち、埋まっていないもののラベル */
export function missingRequiredSenderFields(s: SenderIdentity): string[] {
  return SENDER_FIELDS.filter((f) => f.required && s[f.key].trim() === '').map((f) => f.label);
}

/** 任意だが入れた方がよい項目のうち、埋まっていないもののラベル */
export function missingRecommendedSenderFields(s: SenderIdentity): string[] {
  return SENDER_FIELDS.filter((f) => !f.required && s[f.key].trim() === '').map((f) => f.label);
}
