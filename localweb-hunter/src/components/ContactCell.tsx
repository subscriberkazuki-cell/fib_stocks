'use client';

// 一覧に出す連絡先。
//
// 「メールあり」とだけ書くと、結局リードを開かないとアドレスが分からず、
// メール営業のときに1件ずつ詳細を開くことになる。
// アドレスそのものを出し、ワンタップでコピーできるようにしている。
//
// 出所（どのページで見つけたか）は title 属性で持たせている。
// 推測生成していないことを、その場で確認できるようにするため。

import { useState } from 'react';
import type { SourcedField } from '@/types/business';

export function EmailCell({
  email,
  compact = false,
}: {
  email: SourcedField<string> | null;
  compact?: boolean;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);

  if (!email) {
    return <span className="text-stone-400">メール未確認</span>;
  }

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(email.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードが使えない環境（http・権限なし）ではリンクを使ってもらう
      setCopied(false);
    }
  };

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <a
        href={`mailto:${email.value}`}
        className={`truncate text-sky-700 underline ${compact ? 'max-w-[14rem]' : ''}`}
        title={
          email.sourceUrl
            ? `このページで確認: ${email.sourceUrl}`
            : `出所: ${email.source}`
        }
      >
        {email.value}
      </a>
      <button
        type="button"
        onClick={() => void copy()}
        className="shrink-0 rounded border border-stone-300 px-1.5 py-0.5 text-xs text-stone-600 hover:bg-stone-100"
        aria-label={`${email.value} をコピー`}
      >
        {copied ? '済' : 'コピー'}
      </button>
    </span>
  );
}
