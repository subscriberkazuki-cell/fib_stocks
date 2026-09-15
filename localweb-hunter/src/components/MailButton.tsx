'use client';

// この店舗あてのメールを組み立てて、メールソフトを開く。
//
// 送信はアプリからは行わない。宛先・件名・本文が入った状態で
// 自分のメールソフトが開き、送信ボタンは自分の指で押す形にしている。
//
// 理由は2つ。
//   ・新規あて先への一斉送信はドメインの評判を落としやすく、
//     一度落ちると普通の仕事のメールも届かなくなる
//   ・ブリーフでも「初期版では営業メールの自動一斉送信機能を実装しない」と決めている
//
// 送る前に本文を目で読む手間が残るが、この段階ではそれが正しい。

import { useMemo, useState } from 'react';
import type { Business } from '@/types/business';
import type { SenderIdentity } from '@/config/sender';
import { composeMail, isMailtoTooLong, mailtoUrl } from '@/lib/outreach/compose';
import { chooseRoute, routeFitBlockers, type RouteKey } from '@/lib/outreach/route';

export function MailButton({
  business,
  sender,
}: {
  business: Business;
  sender: SenderIdentity;
}): React.ReactElement {
  const choice = useMemo(() => chooseRoute(business), [business]);
  const [routeKey, setRouteKey] = useState<RouteKey>(choice.recommended.key);
  const [previewUrl, setPreviewUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const route = choice.routes.find((r) => r.key === routeKey) ?? choice.recommended;
  const mail = useMemo(
    () => composeMail(route.template, { business, sender, previewUrl }),
    [route, business, sender, previewUrl],
  );

  // 文面が店舗の状態に合っているか（「サイトが無い」と書く文面をサイト持ちに送らない）を
  // 差し込みの可否より先に出す。こちらの方が根本的な理由なので。
  const blockers = useMemo(
    () => [...routeFitBlockers(route.key, business), ...mail.blockers],
    [route.key, business, mail],
  );
  const canSend = blockers.length === 0;
  const tooLong = canSend && isMailtoTooLong(mail);

  const copyBody = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(`${mail.subject}\n\n${mail.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">メールを送る</h2>
        <span className="text-xs text-stone-500">送信は自分のメールソフトで行います</span>
      </div>

      {/* どの文面か */}
      <div className="space-y-1">
        <div className="flex flex-wrap gap-2">
          {choice.routes.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRouteKey(r.key)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                r.key === routeKey
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-300 text-stone-700 hover:bg-stone-100'
              }`}
            >
              {r.label}
              {r.key === choice.recommended.key && (
                <span className="ml-1 text-xs opacity-80">（推奨）</span>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-600">
          {routeKey === choice.recommended.key ? choice.why : route.why}
        </p>
      </div>

      {/* 先出しページのURL */}
      {route.needsPreviewUrl && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-stone-600">
            先出しで作ったページのURL（本文に入ります）
          </span>
          <input
            type="url"
            value={previewUrl}
            onChange={(e) => setPreviewUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
          />
        </label>
      )}

      {/* 送れない理由 */}
      {blockers.length > 0 && (
        <div className="space-y-1 rounded-md border border-red-300 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-950">まだ送れません</p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-red-900">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {/* データが無くて落とした一文 */}
      {mail.dropped.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-950">
            データが無いので、この一文は本文から外しました
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-900">
            {mail.dropped.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-800">
            推測で埋めることはしません。数字を入れたい場合は、送る前にご自身で確かめて追記してください。
          </p>
        </div>
      )}

      {/* できあがった本文 */}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-stone-700">本文を確認する</summary>
        <div className="mt-2 space-y-2">
          <p className="text-xs text-stone-500">
            宛先: {mail.to ?? '（未取得）'}　／　件名: {mail.subject || '（なし）'}
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-stone-50 p-3 font-sans text-sm leading-relaxed">
            {mail.body}
          </pre>
        </div>
      </details>

      {tooLong && (
        <p className="rounded-md bg-stone-100 p-2 text-xs text-stone-700">
          本文が長いため、環境によってはメールソフトで途中までしか入りません。
          その場合は「本文をコピー」から貼り付けてください。
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <a
          href={canSend ? mailtoUrl(mail) : undefined}
          aria-disabled={!canSend}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${
            canSend
              ? 'bg-stone-900 text-white hover:bg-stone-700'
              : 'cursor-not-allowed bg-stone-200 text-stone-400'
          }`}
          onClick={(e) => {
            if (!canSend) e.preventDefault();
          }}
        >
          ✉️ メールソフトで開く
        </a>
        <button
          type="button"
          onClick={() => void copyBody()}
          className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
        >
          {copied ? 'コピーしました' : '本文をコピー'}
        </button>
      </div>
    </div>
  );
}
