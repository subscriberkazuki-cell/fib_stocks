import Link from 'next/link';
import { PROCEDURE, TALK_STRUCTURE, CALL_TIMING } from '@/config/procedure';
import { INDUSTRY_APPROACHES, OBJECTIONS } from '@/config/approaches';
import { LP_OFFERINGS, SITE_OFFERINGS } from '@/config/offerings';
import { INTRO_OFFER, applyIntroOffer, firstYearTotal, getPricing, hasAnyPriceConfigured, yen } from '@/config/pricing';
import { OUTREACH_FLOW, OUTREACH_SCRIPTS, SUBSIDY_SCRIPTS } from '@/config/outreachFlow';
import {
  ADVISORY_RULES, COMBINABLE_EXPENSES, ROUND_NAME, SCHEDULE, SUBSIDY, SUBSIDY_CONFLICT,
  TRACKS, TRACK_RECORD, VERIFIED_ON, costAtWebCap, estimateSubsidy,
} from '@/config/subsidy';

export const metadata = { title: '営業手順 | LocalWeb Hunter' };

function pr_includes(key: string): React.ReactElement | null {
  const pr = getPricing(key);
  if (!pr || pr.withMonthly.monthly === 0) return null;
  return (
    <p className="text-xs text-stone-500">月額に含まれるもの: {pr.withMonthly.monthlyIncludes}</p>
  );
}

export default function PlaybookPage(): React.ReactElement {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">営業手順とアプローチ</h1>
        <p className="mt-1 text-sm text-stone-600">
          リストを開いてから成約までの流れと、業種ごとの切り口をまとめています。
          刺さった切り口が分かったら <code className="rounded bg-stone-100 px-1 text-xs">src/config/approaches.ts</code>{' '}
          に書き足していってください。
        </p>
      </div>

      <nav className="card flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">目次</span>
        {[
          ['#senchi', '先出し提案の進め方'],
          ['#procedure', '営業手順（7ステップ）'],
          ['#talk', '電話トークの型'],
          ['#timing', 'かける時間帯'],
          ['#industry', '業種別アプローチ'],
          ['#objection', '断られたときの対応'],
          ['#offerings', '提案プラン一覧'],
          ['#subsidy', '補助金の活用'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="text-stone-600 underline hover:text-stone-900">
            {label}
          </a>
        ))}
      </nav>

      {/* ============ 先出し提案 ============ */}
      <section id="senchi" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">先出し提案の進め方</h2>
        <div className="card bg-stone-900 text-white">
          <p className="font-medium">「作りませんか」ではなく「もう作りました」</p>
          <p className="mt-1 text-sm text-stone-300">
            前者は未来の約束なので、相手は「頼むかどうか」を判断します。後者は既に存在するものなので、
            相手は「捨てるかどうか」を判断します。実績のない事業者にとって、この差が最も大きく効きます。
          </p>
          <p className="mt-2 text-sm text-stone-300">
            写真は、<strong className="text-white">作った後にもらいます</strong>。
            先に許可と写真集めを求めると、まだ何も見ていない相手に面倒な作業を頼むことになり、そこで止まります。
            完成物を見た後なら、写真の提供は「断る側の作業」ではなく「進める側の小さな一歩」になります。
          </p>
        </div>

        {OUTREACH_FLOW.map((stage) => (
          <div key={stage.no} className="card space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-bold text-white">
                {stage.no}
              </span>
              <h3 className="text-lg font-semibold">{stage.title}</h3>
              <span className="ml-auto text-xs text-stone-500">{stage.goal}</span>
            </div>

            <ul className="ml-5 list-disc space-y-1 text-sm">
              {stage.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md bg-sky-50 p-3">
                <p className="text-xs font-medium text-sky-900">この段階で相手に求めるもの</p>
                <p className="text-sm text-sky-950">{stage.askFromOwner}</p>
              </div>
              <div className="rounded-md bg-stone-50 p-3">
                <p className="text-xs font-medium text-stone-500">なぜこの順番か</p>
                <p className="text-sm">{stage.rationale}</p>
              </div>
            </div>

            <div className="rounded-md bg-red-50 p-3">
              <p className="text-xs font-medium text-red-900">やってはいけないこと</p>
              <ul className="ml-4 list-disc text-sm text-red-950">
                {stage.never.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}

        <h3 className="pt-2 text-lg font-semibold">各段階で使う文面</h3>
        <p className="text-sm text-stone-600">
          【 】の部分を実データに置き換えて使ってください。店舗ごとの文面は、
          リード詳細画面にその店の数字が入った状態で生成されています。
        </p>

        {OUTREACH_SCRIPTS.map((s) => (
          <div key={s.label} className="card space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge bg-stone-900 text-white">段階 {s.stage}</span>
              <span className="badge bg-stone-100 text-stone-700">{s.channel}</span>
              <h4 className="font-semibold">{s.label}</h4>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-stone-50 p-3 font-sans text-sm leading-relaxed">
              {s.body}
            </pre>
            <p className="text-xs text-stone-600">{s.note}</p>
          </div>
        ))}
      </section>

      {/* ============ 営業手順 ============ */}
      <section id="procedure" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">営業手順</h2>
        <p className="text-sm text-stone-600">
          この順番を崩さないこと。特に <strong>ステップ5（すぐ記録する）</strong> を飛ばすと、
          営業指標が機能しなくなり「どのスコアの店が成約したか」を検証できなくなります。
        </p>

        {PROCEDURE.map((step) => (
          <div key={step.no} className="card space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-bold text-white">
                {step.no}
              </span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              {step.where && (
                <Link href={step.where.href} className="btn-secondary ml-auto text-xs">
                  {step.where.label}を開く →
                </Link>
              )}
            </div>

            <ul className="ml-5 list-disc space-y-1 text-sm">
              {step.what.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>

            <div className="rounded-md bg-stone-50 p-3">
              <p className="text-xs font-medium text-stone-500">なぜそうするか</p>
              <p className="text-sm">{step.why}</p>
            </div>

            <div className="rounded-md bg-red-50 p-3">
              <p className="text-xs font-medium text-red-900">よくある失敗</p>
              <p className="text-sm text-red-950">{step.pitfall}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ============ トークの型 ============ */}
      <section id="talk" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">電話トークの型（60秒）</h2>
        <p className="text-sm text-stone-600">
          最初の電話の目的は「売ること」ではなく「話を聞いてもらえる状態を作ること」です。
          店舗ごとの具体的なトークは、各リードの詳細画面に生成されています。
        </p>

        <div className="space-y-2">
          {TALK_STRUCTURE.map((t) => (
            <div key={t.phase} className="card">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-semibold">{t.phase}</span>
                <span className="badge bg-stone-100 text-stone-600">{t.seconds}</span>
                <span className="text-sm text-stone-600">{t.goal}</span>
              </div>
              <p className="mt-2 rounded bg-stone-50 p-2 text-sm">{t.example}</p>
              <p className="mt-1 text-xs text-stone-600">{t.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ 時間帯 ============ */}
      <section id="timing" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">かける時間帯</h2>
        <p className="text-sm text-stone-600">
          忙しい時間にかけるのは営業妨害です。繋がらないだけでなく、地域での評判にも関わります。
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="text-xs text-stone-500">
              <tr>
                <th className="py-2">業種</th>
                <th>狙う時間</th>
                <th>避ける時間</th>
                <th>理由</th>
              </tr>
            </thead>
            <tbody>
              {CALL_TIMING.map((c) => (
                <tr key={c.category} className="border-t border-stone-100 align-top">
                  <td className="py-2 font-medium">{c.category}</td>
                  <td className="py-2 text-emerald-700">{c.good}</td>
                  <td className="py-2 text-red-700">{c.avoid}</td>
                  <td className="py-2 text-stone-600">{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ============ 業種別 ============ */}
      <section id="industry" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">業種別アプローチ</h2>
        <p className="text-sm text-stone-600">
          「ホームページを作りませんか」は、どの業種に言っても同じように弱い切り口です。
          相手が困っているのはWebではなく商売の方なので、その業種で実際に起きている
          取りこぼしから入ります。
        </p>

        <div className="grid gap-3 lg:grid-cols-2">
          {INDUSTRY_APPROACHES.map((a) => (
            <div key={a.category} className="card space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{a.category}</h3>
                <span
                  className={`badge ${a.primaryKind === 'lp' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}`}
                >
                  {a.primaryKind === 'lp' ? '販売ページから' : '公式サイトから'}
                </span>
              </div>

              <div>
                <p className="text-xs font-medium text-stone-500">起きている取りこぼし</p>
                <p className="text-sm">{a.painPoint}</p>
              </div>

              <div className="rounded-md bg-amber-50 p-2">
                <p className="text-xs font-medium text-amber-900">切り口</p>
                <p className="text-sm text-amber-950">「{a.hook}」</p>
              </div>

              <div className="rounded-md bg-red-50 p-2">
                <p className="text-xs font-medium text-red-900">注意点</p>
                <p className="text-sm text-red-950">{a.caution}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ 断り対応 ============ */}
      <section id="objection" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">断られたときの対応</h2>
        <div className="card bg-stone-50 text-sm">
          <p className="font-medium">前提：食い下がるための資料ではありません。</p>
          <p className="mt-1 text-stone-700">
            相手が本当に不要なら引くのが正しい判断です。1件に粘る時間で3件かけた方が成果が出ますし、
            地域で商売をしている以上、評判を守ることの方が長期的には大事です。
            各項目の「引くべきサイン」を必ず見てください。
          </p>
        </div>

        <div className="space-y-2">
          {OBJECTIONS.map((o) => (
            <div key={o.said} className="card space-y-2">
              <p className="font-semibold">「{o.said}」</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-stone-500">相手の本音</p>
                  <p className="text-sm">{o.meaning}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500">返し方</p>
                  <p className="text-sm">{o.response}</p>
                </div>
              </div>
              <div className="rounded-md bg-stone-100 p-2">
                <p className="text-xs font-medium text-stone-600">引くべきサイン</p>
                <p className="text-sm">{o.stopIf}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ プラン ============ */}
      <section id="offerings" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">提案プラン一覧</h2>

        <div className="card bg-stone-50 text-sm">
          <p className="font-medium">公式サイトと販売ページは目的が違います</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md bg-white p-3">
              <span className="badge bg-emerald-100 text-emerald-800">公式サイト</span>
              <p className="mt-1">
                店名で検索されたときの<strong>受け皿</strong>。信頼性と基本情報。常設で、
                継続的に流入を受ける資産になる。
              </p>
            </div>
            <div className="rounded-md bg-white p-3">
              <span className="badge bg-sky-100 text-sky-800">販売ページ（LP）</span>
              <p className="mt-1">
                1つの商品・コース・キャンペーンを<strong>売り切る</strong>1枚。
                行動は1つだけ。広告やSNSから直接送れる。
              </p>
            </div>
          </div>
          <p className="mt-2 text-stone-700">
            SNSで集客できている店に5ページのHPを提案しても「今で足りてる」で終わりますが、
            「初回体験の申込ページ」なら来月の予約数の話になります。何を提案するかの判断は、
            各リードの詳細画面の「次の一手」が自動で出しています。
          </p>
        </div>

        <div className="card space-y-2 text-sm">
          <h3 className="font-semibold">価格の考え方</h3>
          <p>
            日本の相場は、フリーランスで制作費10〜50万円・月額保守5,000〜1万円、
            中小の制作会社で80〜150万円です。LP1ページ単体では中央値40万円、
            10万円以下は個人・フリーランスにしか頼めない価格帯とされています。
          </p>
          <p>
            <strong>実績がないうちほど、安くしすぎない方が持ちます。</strong>
            1ページでも先出し制作・電話・修正・公開で6〜8時間かかるので、
            ¥98,000 なら時給14,000円で成立しますが、¥30,000 だと時給4,300円で、
            営業時間を足すと事業として続きません。
          </p>
          <p>
            それに<strong>先出し提案の時点で、相手のリスクは既にゼロ</strong>です
            （完成品を見てから決められる）。そこへ低価格を重ねるのは、
            持っているカードを二重に切ることになります。
            安くすべきは価格ではなく入口のハードルで、この2つは別物です。
          </p>
          <p>
            最初の客に付けた価格は、その人の紹介客にも引き継がれます。
            安くするなら、<strong>理由と件数を明示した割引</strong>にしてください
            （「事例を作りたいので最初の{INTRO_OFFER.limitCount}件まで」）。
            理由が終われば価格を戻せます。
          </p>
        </div>

        {!hasAnyPriceConfigured() && (
          <div className="card bg-amber-50 text-sm text-amber-900">
            <p className="font-medium">価格が未設定です</p>
            <p className="mt-1">
              <code className="rounded bg-white px-1 text-xs">src/config/offerings.ts</code> の{' '}
              <code className="rounded bg-white px-1 text-xs">PRICE_HINTS</code> にご自身の価格帯を設定してください。
              根拠のない金額を画面に出さないよう、未設定の間は「未設定」と表示しています。
            </p>
          </div>
        )}

        {[
          { title: '公式サイト', items: SITE_OFFERINGS, style: 'bg-emerald-100 text-emerald-800' },
          { title: '販売ページ（LP）', items: LP_OFFERINGS, style: 'bg-sky-100 text-sky-800' },
        ].map((group) => (
          <div key={group.title} className="space-y-2">
            <h3 className="font-semibold">{group.title}</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {group.items.map((o) => (
                <div key={o.key} className="card space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${group.style}`}>{group.title}</span>
                    <h4 className="font-semibold">{o.name}</h4>
                  </div>
                  <p className="text-sm text-stone-600">{o.summary}</p>

                  <div>
                    <p className="text-xs font-medium text-stone-500">こういう店に</p>
                    <p className="text-sm">{o.whenToUse}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-stone-500">相手にとっての価値</p>
                    <p className="text-sm">{o.valueToClient}</p>
                  </div>

                  <div className="text-sm">
                    <span className="text-stone-500">期間 </span>
                    {o.leadTimeWeeks}
                  </div>

                  {(() => {
                    const pr = getPricing(o.key);
                    if (!pr) return <p className="text-sm text-stone-400">価格未設定</p>;
                    return (
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="border-t border-stone-100">
                            <td className="py-1 text-stone-600">月額あり</td>
                            <td className="py-1 text-right font-medium">
                              {yen(pr.withMonthly.initial)}
                              {pr.withMonthly.monthly > 0 && ` + 月${yen(pr.withMonthly.monthly)}`}
                            </td>
                          </tr>
                          {pr.withMonthly.monthly > 0 && (
                            <tr className="border-t border-stone-100 text-stone-500">
                              <td className="py-1">初年度の総額</td>
                              <td className="py-1 text-right">{yen(firstYearTotal(pr.withMonthly))}</td>
                            </tr>
                          )}
                          <tr className="border-t border-stone-100">
                            <td className="py-1 text-stone-600">買い切り</td>
                            <td className="py-1 text-right font-medium">{yen(pr.oneTime.initial)}</td>
                          </tr>
                          {INTRO_OFFER.enabled && (
                            <tr className="border-t border-stone-100 text-emerald-800">
                              <td className="py-1">事例掲載の条件で</td>
                              <td className="py-1 text-right font-medium">
                                {yen(applyIntroOffer(pr.withMonthly.initial))}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    );
                  })()}

                  {pr_includes(o.key)}

                  <details className="text-sm">
                    <summary className="cursor-pointer text-stone-600">納品物</summary>
                    <ul className="ml-4 mt-1 list-disc text-sm">
                      {o.deliverables.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ============ 補助金 ============ */}
      <section id="subsidy" className="space-y-3 scroll-mt-4">
        <h2 className="text-xl font-bold">小規模事業者持続化補助金の活用</h2>

        <div className="card border-l-4 border-l-red-600 bg-red-50">
          <p className="font-medium text-red-900">先に売ると、補助金は使えなくなります</p>
          <p className="mt-1 text-sm text-red-950">{SUBSIDY_CONFLICT.problem}</p>
          <p className="mt-2 text-sm text-red-950">{SUBSIDY_CONFLICT.timeline}</p>
          <p className="mt-2 text-sm font-medium text-red-950">{SUBSIDY_CONFLICT.solution}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {TRACKS.map((tr) => (
            <div key={tr.key} className="card space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{tr.label}</h3>
                <span className="badge bg-stone-100 text-stone-600">入金まで {tr.timeToCash}</span>
              </div>
              <p className="text-sm text-stone-600">{tr.forWhom}</p>
              <ol className="ml-5 list-decimal space-y-1 text-sm">
                {tr.flow.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ol>
              <p className="rounded-md bg-red-50 p-2 text-xs text-red-950">{tr.caution}</p>
            </div>
          ))}
        </div>

        <div className="card space-y-3">
          <h3 className="font-semibold">{ROUND_NAME}の要点</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <tbody>
                {[
                  ['申請受付', `${SCHEDULE.applicationOpens} 〜 ${SCHEDULE.applicationCloses.replace('T', ' ')}`],
                  ['様式4の発行締切', `${SCHEDULE.form4Deadline}（申請締切より11日早い）`],
                  ['採択発表', SCHEDULE.resultAnnouncement],
                  ['補助率', '2/3（赤字事業者は3/4）'],
                  ['補助上限', '50万円（インボイス特例+50万・賃金引上げ特例+150万で最大250万円）'],
                  ['ウェブ関連費の上限', `30万円（制作費45万円相当で頭打ち。第19回までの「1/4縛り」は撤廃）`],
                  ['採択率', `${(TRACK_RECORD.rate * 100).toFixed(1)}%（${TRACK_RECORD.round}：${TRACK_RECORD.applications.toLocaleString('ja-JP')}件中${TRACK_RECORD.adopted.toLocaleString('ja-JP')}件）`],
                  ['入金まで', '事業完了後の精算払い。申請から1年程度'],
                ].map(([k, v]) => (
                  <tr key={k} className="border-t border-stone-100 align-top">
                    <td className="py-1.5 pr-4 font-medium text-stone-600">{k}</td>
                    <td className="py-1.5">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-md bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-900">ウェブ費用だけでは申請できません</p>
            <p className="mt-1 text-amber-950">
              他の販路開拓費と組み合わせる必要があります。「他に何を申請すればいいですか」と聞かれたときの答え：
            </p>
            <ul className="ml-4 mt-1 list-disc text-amber-950">
              {COMBINABLE_EXPENSES.map((e) => (
                <li key={e.name}>
                  <strong>{e.name}</strong>（{e.example}）
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-md bg-stone-50 p-3 text-sm">
            <p className="font-medium">金額の目安（制作費98,000円の場合）</p>
            <p className="mt-1">
              補助されうる額 <strong>{estimateSubsidy(98_000).subsidized.toLocaleString('ja-JP')}円</strong> ／
              実質のご負担 <strong>{estimateSubsidy(98_000).outOfPocket.toLocaleString('ja-JP')}円</strong>
            </p>
            <p className="mt-1 text-xs text-stone-600">
              ウェブ関連費の補助上限は{SUBSIDY.webCap.toLocaleString('ja-JP')}円なので、
              制作費が{costAtWebCap().toLocaleString('ja-JP')}円を超えても補助額は増えません。
            </p>
          </div>
        </div>

        <div className="card bg-red-50">
          <h3 className="font-semibold text-red-900">案内するときの注意</h3>
          <ul className="ml-4 mt-2 list-disc space-y-1 text-sm text-red-950">
            {ADVISORY_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>

        <h3 className="pt-2 text-lg font-semibold">補助金トラックの文面</h3>
        {SUBSIDY_SCRIPTS.map((s) => (
          <div key={s.label} className="card space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge bg-stone-900 text-white">段階 {s.stage}</span>
              <span className="badge bg-stone-100 text-stone-700">{s.channel}</span>
              <h4 className="font-semibold">{s.label}</h4>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-stone-50 p-3 font-sans text-sm leading-relaxed">
              {s.body}
            </pre>
            <p className="text-xs text-stone-600">{s.note}</p>
          </div>
        ))}

        <p className="text-xs text-stone-500">
          {VERIFIED_ON} 時点で確認した内容です。制度は公募回ごとに変わるため、
          次の公募回では必ず公募要領を読み直し、
          <code className="rounded bg-stone-100 px-1">src/config/subsidy.ts</code> を更新してください。
        </p>
      </section>

      <div className="card bg-stone-900 text-white">
        <p className="font-medium">最後に</p>
        <p className="mt-1 text-sm text-stone-300">
          ここに書いた時間帯や切り口は出発点です。実際にかけてみて反応が違ったら、
          <code className="rounded bg-stone-700 px-1 text-xs">src/config/approaches.ts</code> と{' '}
          <code className="rounded bg-stone-700 px-1 text-xs">src/config/procedure.ts</code>{' '}
          を書き換えてください。正解は地域と時期で変わります。
          自分の実数は <Link href="/metrics" className="underline">営業指標</Link> で確認できます。
        </p>
      </div>
    </div>
  );
}
