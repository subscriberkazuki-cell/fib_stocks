# WORKFLOWS — 業務ごとの流れ

司令塔フォルダで `claude` を起動し、下のように頼みます。Skill 名を打たなくても、内容から自動で選ばれるものがあります（`/project-build` と `/content-production` は手動起動のみ）。

| 業務 | 頼み方の例 | 使う Skill | 検査 | 人間の確認ポイント |
|---|---|---|---|---|
| A. 調査・分析 | 「生成AIの国内市場規模を調べて」 | `/research` | quality-reviewer | 曖昧な定義の確認 |
| B. 株式分析 | `/stock-a NVDA FY2027Q3` → `/stock-b NVDA` | `/stock-a` `/stock-b` | quality-reviewer（数値照合） | 売買判断はオーナー |
| C. 新規事業 | 「〇〇の事業案を検証して」 | `/business-review` | quality-reviewer（Red Team） | 進める / 見送りの判断 |
| D. コンテンツ | `/content-production https://youtu.be/...` | `/content-production` | quality-reviewer | **公開・投稿はオーナー** |
| E. Web開発 | `/project-build C:\dev\themora 決算カレンダーに絞り込みを追加` | `/project-build` | technical-qa | 設計の確認、push・デプロイ |
| 記憶 | 「この方針を覚えて」 | `/remember` | — | — |

## A. 調査・分析
テーマを問いに分解 → 過去の調査を Vault で確認 → research-analyst が収集（独立した問いだけ2体並列）→ 統合 → quality-reviewer が検査 → 修正（2回まで）→ `03_Research/` に保存。

## B. 株式分析
- **A分析**：ティッカーと決算期を確定 → 一次資料を収集 → 業績・成長ドライバーTOP1〜2・セグメント・中国依存・KPIと予想の差・バリュエーション・ブル/ベア・Core Definition → 主要数値を4つ以上照合 → `01_Projects/Investment/<TICKER>/`
- **B分析**：A分析の TOP1・TOP2 ごとに日米の競合を探索 → 100点基準で採点 → 60点未満を除外 → 最大3社 → 対象事業の売上構成比を必ず示す

## C. 新規事業
一文の価値提案 → 過去案の確認 → 市場・競合・海外モデルの調査 → 収益・コスト・単位採算・損益分岐・競争優位・MVP・ロードマップ → Red Team が失敗シナリオと最も弱い前提を指摘 → 判定材料を提示（判断はオーナー）。見送りでも理由を失敗知見として保存。

## D. コンテンツ（YouTube → ブログ）
字幕取得（**失敗したらそこで止めて報告**）→ 内容分析 → 要点 → 構成 → 記事 → SNS案 → 検査 → `01_Projects/Content/` に下書き保存。投稿はしない。

## E. Web開発
既存コードの調査 → 受け入れ条件 → 設計（大きければ確認）→ 作業ブランチ → 実装 → テスト → technical-qa（修正権限なし）→ 修正 → 報告。push・デプロイ・マージはオーナーの承認後。発注を伴うコード（FRED・BOT）は本番設定で動かさない。
