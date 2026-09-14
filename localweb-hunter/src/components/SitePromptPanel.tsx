'use client';

// 店舗ごとのサイト制作プロンプトを出す。
//
// 「プロンプトの雛形」を別ファイルで持っていても、毎回店名や住所を差し替える手間で使われなくなる。
// リードの実データが既にあるので、その場で完成した状態のプロンプトを出してコピーさせる。

import { useMemo, useState } from 'react';
import type { Business } from '@/types/business';
import { buildSitePrompt } from '@/lib/prompt/sitePrompt';
import { findSiteDesign } from '@/config/siteDesign';

export function SitePromptPanel({ business }: { business: Business }): React.ReactElement {
  const [hasPhotos, setHasPhotos] = useState(false);
  const [builderName, setBuilderName] = useState('');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const prompt = useMemo(
    () => buildSitePrompt(business, { hasPhotos, builderName, isProposal: true }),
    [business, hasPhotos, builderName]
  );

  const design = findSiteDesign(business.category);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">サイト制作プロンプト</h2>
        {design ? (
          <span className="badge bg-emerald-100 text-emerald-800">{design.category}向けの指定あり</span>
        ) : (
          <span className="badge bg-stone-100 text-stone-600">汎用（業種の指定なし）</span>
        )}
      </div>

      <p className="text-sm text-stone-600">
        この店舗の実データを差し込んだ、1ページサイト制作用のプロンプトです。
        コピーして Claude Code に貼れば、そのまま <code className="rounded bg-stone-100 px-1 text-xs">index.html</code> が出ます。
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0"
            checked={hasPhotos}
            onChange={(e) => setHasPhotos(e.target.checked)}
          />
          <span>
            店主から写真を受け取っている
            <span className="block text-xs text-stone-500">
              未チェックだと「写真なしで完成させる」指示になります
            </span>
          </span>
        </label>

        <div>
          <label className="label" htmlFor="builderName">
            制作者名（フッターに入ります）
          </label>
          <input
            id="builderName"
            className="input"
            value={builderName}
            placeholder="例: 山田 / 〇〇デザイン"
            onChange={(e) => setBuilderName(e.target.value)}
          />
        </div>
      </div>

      {design && (
        <div className="rounded-md bg-stone-50 p-3 text-sm">
          <p className="text-xs font-medium text-stone-500">この業種の指定内容</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {[design.palette.bg, design.palette.ink, design.palette.accent, design.palette.sub].map((c) => (
              <span key={c} className="inline-flex items-center gap-1 text-xs">
                <span
                  className="inline-block h-4 w-4 rounded border border-stone-300"
                  style={{ backgroundColor: c }}
                  aria-hidden="true"
                />
                {c}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-stone-600">{design.mood}</p>
          {design.forbidden.length > 0 && (
            <p className="mt-2 text-xs text-red-800">
              禁止表現 {design.forbidden.length}件を含みます（{design.forbidden[0]?.slice(0, 40)}…）
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" onClick={() => void copy()}>
          {copied ? 'コピーしました' : 'プロンプトをコピー'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen((v) => !v)}>
          {open ? '閉じる' : '中身を確認'}
        </button>
        <span className="text-xs text-stone-500">{prompt.length.toLocaleString('ja-JP')}文字</span>
      </div>

      {open && (
        <pre className="max-h-96 overflow-auto rounded-md bg-stone-900 p-3 text-xs leading-relaxed text-stone-100">
          {prompt}
        </pre>
      )}

      <p className="text-xs text-stone-500">
        生成したHTMLは、店主の合意を得るまで公開しないでください。
        プロンプトには <code className="rounded bg-stone-100 px-1">noindex</code> の指示と、
        提案用サンプルである旨のフッター表記が含まれています。
      </p>
    </div>
  );
}
