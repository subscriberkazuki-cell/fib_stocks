import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBusiness, getHistory } from '@/lib/db/repository';
import { describeStatus } from '@/lib/labels';
import { evaluateWebsiteOpportunity } from '@/lib/scoring/websitePresenceScore';
import { AiBadge, Field, PriorityBadge, ScoreBar, Unconfirmed, WebsiteStatusBadge } from '@/components/ui';
import { CrmPanel } from '@/components/CrmPanel';
import { EnrichOneButton } from '@/components/EnrichOneButton';
import { NextActionPanel } from '@/components/NextActionPanel';

export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const b = getBusiness(id);
  if (!b) notFound();

  const history = getHistory(id);
  const opportunity = b.websiteSignals ? evaluateWebsiteOpportunity(b.websiteSignals) : null;
  const phone = b.phone?.value ?? null;
  const ai = b.salesAnalysis;

  return (
    <div className="space-y-4">
      <Link href="/leads" className="text-sm text-stone-600 underline">← リード一覧に戻る</Link>

      {/* ---- 店舗概要 ---- */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{b.name}</h1>
            <p className="text-sm text-stone-600">{b.category || '業種不明'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PriorityBadge priority={b.salesPriority} />
            <WebsiteStatusBadge status={b.websiteStatus} />
          </div>
        </div>

        {/* 主アクション。スマートフォンからワンタップで発信できるようにする（§11-4） */}
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="btn-primary w-full justify-center py-3 text-base sm:w-auto sm:px-8"
            aria-label={`${b.name} に電話する（${phone}）`}
          >
            📞 {phone} に電話する
          </a>
        ) : (
          <p className="rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-600">
            公開されている電話番号が見つかりませんでした。
          </p>
        )}

        <h2 className="border-t border-stone-100 pt-3 font-semibold">店舗概要</h2>

        {b.regulatoryNotes.length > 0 && (
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">この業種は広告規制の確認が必要です</p>
            <ul className="ml-4 list-disc">
              {b.regulatoryNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              営業対象として問題があるわけではありません。制作するHPの表現に制限がかかる点にご注意ください。
            </p>
          </div>
        )}

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="評価">{b.rating?.value ?? <Unconfirmed />}</Field>
          <Field label="レビュー数">{b.reviewCount?.value ?? <Unconfirmed />}</Field>
          <Field label="電話番号">
            {phone ? (
              <a href={`tel:${phone}`} className="text-sky-700 underline">{phone}</a>
            ) : (
              <Unconfirmed />
            )}
          </Field>
          <Field label="メール">
            {b.email ? (
              <a href={`mailto:${b.email.value}`} className="text-sky-700 underline">{b.email.value}</a>
            ) : (
              <Unconfirmed />
            )}
          </Field>
          <Field label="住所">{b.address || <Unconfirmed />}</Field>
          <Field label="営業時間">{b.openingHours ?? <Unconfirmed />}</Field>
          <Field label="データ出所">{b.source}</Field>
          <Field label="最終確認">{b.lastCheckedAt?.slice(0, 10) ?? '—'}</Field>
        </dl>

        {(b.phone || b.email) && (
          <p className="text-xs text-stone-500">
            出所:{' '}
            {b.phone && `電話=${b.phone.source}`}
            {b.phone && b.email && ' / '}
            {b.email && (
              <>
                メール=
                <a href={b.email.sourceUrl} className="underline" target="_blank" rel="noreferrer">
                  {b.email.sourceUrl ?? b.email.source}
                </a>
              </>
            )}
          </p>
        )}
      </div>

      <NextActionPanel business={b} />

      {/* ---- Web状況 ---- */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Web状況</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Field label="判定">{describeStatus(b.websiteStatus)}</Field>
          <Field label="公式サイト">
            {b.websiteUrl ? (
              <a href={b.websiteUrl} className="break-all text-sky-700 underline" target="_blank" rel="noreferrer">
                {b.websiteUrl}
              </a>
            ) : (
              <span className="text-stone-500">見つかりませんでした</span>
            )}
          </Field>
          <Field label="SNS">
            {b.socialUrls.length > 0 ? (
              <div className="flex flex-col">
                {b.socialUrls.slice(0, 4).map((u) => (
                  <a key={u} href={u} className="break-all text-sky-700 underline" target="_blank" rel="noreferrer">
                    {u}
                  </a>
                ))}
              </div>
            ) : (
              <Unconfirmed />
            )}
          </Field>
        </dl>

        {b.candidateUrls.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-stone-600">
              調査した候補URL（{b.candidateUrls.length}件）
            </summary>
            <ul className="mt-2 space-y-1">
              {b.candidateUrls.map((c) => (
                <li key={c.url} className="flex flex-wrap items-baseline gap-2">
                  <span className="badge bg-stone-100 text-stone-700">{c.classification}</span>
                  <a href={c.url} className="break-all text-sky-700 underline" target="_blank" rel="noreferrer">
                    {c.url}
                  </a>
                  {c.officialSiteProbability !== null && (
                    <span className="text-xs text-stone-500">
                      公式である確度 {(c.officialSiteProbability * 100).toFixed(0)}%
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        {b.websiteOpportunityScore !== null && (
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Website Opportunity Score（改善余地）</span>
              <strong>{b.websiteOpportunityScore}</strong>
            </div>
            <ScoreBar value={b.websiteOpportunityScore} />
            {opportunity ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {opportunity.items
                  .filter((i) => !i.satisfied)
                  .map((i) => (
                    <span key={i.key} className="badge bg-red-50 text-red-700">
                      {i.label}なし
                    </span>
                  ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-stone-500">
                公式サイトが見つからなかったため、改善余地は最大の100としています。
              </p>
            )}
          </div>
        )}

        <EnrichOneButton id={b.id} done={b.phase2CompletedAt !== null} />
        {b.phase2CompletedAt === null && (
          <p className="text-xs text-stone-500">
            この店舗はまだPhase 2（サイト解析・メール探索）を実行していません。
            Web状況の判定は、データ提供元のサイト欄だけを見た暫定値です。
          </p>
        )}
      </div>

      {/* ---- 営業情報 ---- */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">営業情報</h2>
          {ai && <AiBadge model={ai.model} />}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>Lead Score</span>
              <strong>{b.leadScore}</strong>
            </div>
            <ScoreBar value={b.leadScore} />
          </div>
          <Field label="Web Presence Score">{b.webPresenceScore}</Field>
          <Field label="営業優先度">{b.salesPriority}</Field>
        </div>

        {b.leadScoreBreakdown && (
          <details className="text-sm">
            <summary className="cursor-pointer text-stone-600">スコアの内訳</summary>
            <table className="mt-2 w-full text-left text-xs">
              <tbody>
                {[
                  ['評価', b.leadScoreBreakdown.rating, b.leadScoreBreakdown.weightsUsed.rating],
                  ['レビュー件数', b.leadScoreBreakdown.reviewCount, b.leadScoreBreakdown.weightsUsed.reviewCount],
                  ['HPなし', b.leadScoreBreakdown.noWebsite, b.leadScoreBreakdown.weightsUsed.noWebsite],
                  ['SNSあり', b.leadScoreBreakdown.hasSns, b.leadScoreBreakdown.weightsUsed.hasSns],
                  ['電話あり', b.leadScoreBreakdown.hasPhone, b.leadScoreBreakdown.weightsUsed.hasPhone],
                  ['地域密着', b.leadScoreBreakdown.localDensity, b.leadScoreBreakdown.weightsUsed.localDensity],
                  ['集客型', b.leadScoreBreakdown.footTraffic, b.leadScoreBreakdown.weightsUsed.footTraffic],
                  ['Web改善余地', b.leadScoreBreakdown.webImprovementPotential, b.leadScoreBreakdown.weightsUsed.webImprovementPotential],
                ].map(([label, got, max]) => (
                  <tr key={String(label)} className="border-b border-stone-100">
                    <td className="py-1">{label}</td>
                    <td className="py-1 text-right font-mono">{got}</td>
                    <td className="py-1 text-right text-stone-400">/ {max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        {ai ? (
          <div className="space-y-3 rounded-md bg-violet-50 p-3 text-sm">
            {ai.reason && <p>{ai.reason}</p>}

            {ai.storeTypeTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ai.storeTypeTags.map((t) => (
                  <span key={t} className="badge bg-white text-violet-800">{t}</span>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {ai.strengths.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-stone-600">強み</p>
                  <ul className="ml-4 list-disc">
                    {ai.strengths.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </div>
              )}
              {ai.weaknesses.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-stone-600">弱み・懸念</p>
                  <ul className="ml-4 list-disc">
                    {ai.weaknesses.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {ai.salesAngle && (
              <div>
                <p className="text-xs font-medium text-stone-600">営業の切り口</p>
                <p>{ai.salesAngle}</p>
              </div>
            )}
            {ai.recommendedOffer && (
              <div>
                <p className="text-xs font-medium text-stone-600">推奨オファー</p>
                <p>{ai.recommendedOffer}</p>
              </div>
            )}

            {/* 電話をかける直前に読むものなので、30秒トークだけは開いた状態で出す */}
            {ai.talk30s && (
              <div className="rounded border border-violet-200 bg-white p-3">
                <p className="mb-1 text-xs font-medium text-stone-600">
                  30秒トーク（このまま読めます）
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{ai.talk30s}</p>
              </div>
            )}

            {[
              ['15秒トーク（短縮版）', ai.talk15s],
              ['60秒トーク（詳しく話す場合）', ai.talk60s],
              ['営業メール案', ai.emailDraft],
              ['HP提案の構成', ai.hpPlan],
            ]
              .filter((t): t is [string, string] => typeof t[1] === 'string' && t[1] !== '')
              .map(([label, body]) => (
                <details key={label} className="rounded bg-white p-2">
                  <summary className="cursor-pointer font-medium">{label}</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{body}</pre>
                </details>
              ))}

            <p className="text-xs text-stone-500">
              上記はAIが生成した推定・提案です。事実確認をしてからご利用ください。
              生成モデル: {ai.model}
            </p>
          </div>
        ) : (
          <p className="text-sm text-stone-500">
            AI営業分析はまだ生成されていません。上の「Webを調査してHP案を生成」から実行できます。
          </p>
        )}
      </div>

      <CrmPanel business={b} />

      {history.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-semibold">履歴</h2>
          <ul className="space-y-1 text-sm">
            {history.slice(0, 20).map((h) => (
              <li key={String(h['id'])} className="flex flex-wrap gap-2 border-b border-stone-100 py-1">
                <span className="text-stone-500">{String(h['recorded_at']).slice(0, 16).replace('T', ' ')}</span>
                <span className="badge bg-stone-100 text-stone-700">{String(h['event'])}</span>
                <span>{String(h['note'] ?? '')}</span>
                {h['lead_score'] !== null && (
                  <span className="ml-auto text-stone-500">Score {String(h['lead_score'])}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
