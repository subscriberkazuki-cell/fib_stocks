---
name: remember
description: 重要な決定事項・判断基準・好み・調査で得た知見・失敗とその原因・プロジェクトの進捗を、Obsidian Vault の AI_Hub に整理して保存する。「覚えて」「記録して」「メモしておいて」と言われたとき、または作業の終わりに再利用価値のある知見が出たときに使う。
argument-hint: "[覚えておく内容]"
---

# /remember — 記憶の保存

保存する内容: $ARGUMENTS

Vault の場所は `.claude/ai-hub.json` の `vaultPath`。保存先はその中の `AI_Hub/`。

## 保存しないもの
- APIキー・パスワード・トークン・個人の連絡先などの秘密情報（見つけたら保存せず、その旨を伝える）
- 会話の丸ごとの記録、一時的な作業メモ、すぐ古くなる情報
- 再利用の見込みがないもの

## 手順

1. **分類** — 次のどれかに分ける
   | 種類 | 例 | 保存先 |
   |---|---|---|
   | decision（決定） | 方針・採用した設計 | `00_Home/DECISIONS.md` に追記、詳細があれば該当プロジェクト |
   | preference（好み・判断基準） | 文章の好み、分析の基準 | `00_Home/USER_PROFILE.md` |
   | project-status（進捗） | THEMORA の現状 | `01_Projects/<プロジェクト>/` と `00_Home/PROJECT_INDEX.md` |
   | knowledge（知見） | 手順・技術メモ | `02_Knowledge/<分野>/` |
   | failure（失敗と原因） | うまくいかなかった方法 | `02_Knowledge/<分野>/` または該当プロジェクト |
   | hypothesis（仮説） | まだ確かめていない見立て | 該当プロジェクト（必ず hypothesis と明記） |
2. **重複の確認** — 保存先と `00_Home/MEMORY_INDEX.md` を検索する。同じ話題のノートがあれば、**新しく作らずそのノートを更新する**
3. **書く** — 1ノート1話題。下のテンプレートに従う
4. **変更履歴** — 既存の決定を変える場合は、古い内容を消さず `status: superseded` にし、新しいノートの `supersedes` に古いノートを書く。DECISIONS.md には「変更」として追記する
5. **索引の更新** — `00_Home/MEMORY_INDEX.md` に1行（日付・種類・プロジェクト・リンク・1行要約）を追加または更新する
6. **報告** — どのファイルに何を保存・更新したかを1〜2行で伝える

## ノートのテンプレート

```markdown
---
type: decision | preference | project-status | knowledge | failure | hypothesis
project: THEMORA | FRED | Bookmap_BOT | Investment | Startup | Content | General
status: active | superseded
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: []
supersedes: ""
---

# タイトル（内容が分かる具体的な名前）

## 要点
## 詳細・根拠
## 関連ノート
- [[...]]
```

## MEMORY_INDEX の1行の形式

```
- YYYY-MM-DD | decision | THEMORA | [[ノート名]] — 1行要約
```
