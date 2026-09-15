// 設定ファイルの文字列に埋め込んだ `**強調**` の解析。
//
// 表示部品（Rich）から切り出してあるのは、ここをテストできるようにするため。
// 強調が入っているのは「法的な線引き」「やってはいけないこと」のような、
// 読み飛ばされると実害が出る箇所なので、記号がそのまま画面に出る状態を再発させたくない。

export interface EmphasisPart {
  text: string;
  strong: boolean;
}

/**
 * `**` で囲まれた部分を切り出す。Markdownを解釈するわけではない。
 * 閉じていない `**` はそのまま平文として残す（勝手に消すと文意が変わるため）。
 */
export function parseEmphasis(text: string): EmphasisPart[] {
  const parts: EmphasisPart[] = [];
  const re = /\*\*([\s\S]+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), strong: false });
    parts.push({ text: m[1] ?? '', strong: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), strong: false });
  return parts;
}

/** 表示したときに `**` が生の記号として残るか。設定ファイルの検査に使う */
export function hasUnclosedEmphasis(text: string): boolean {
  return parseEmphasis(text).some((p) => !p.strong && p.text.includes('**'));
}
