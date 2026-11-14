# CHANGELOG

## 2026-11-14 初版（PC への導入前）

### 追加
- PHASE 0 調査スクリプト（読み取り専用）
- 非破壊インストーラー（既定ドライラン・上書きなし・削除なし）
- 司令塔の基本方針 `CLAUDE.md`
- `settings.json`：権限ルール（Bash / PowerShell 両対応）、bypassPermissions の無効化、同時稼働2体、auto memory 無効、Hooks 5本
- 専門エージェント3体：research-analyst / quality-reviewer（Red Team）/ technical-qa（修正権限なし）
- Skills 7本：research / stock-a / stock-b / business-review / project-build / content-production / remember
- Obsidian の AI_Hub 雛形（索引・プロフィール・決定事項・プロジェクト）
- 静的検査 `tests/validate_kit.py`

### 設計上の判断
- 公式ドキュメント（code.claude.com/docs、2026-11-14 取得）の仕様に合わせた
- Hooks は PowerShell で書き、`powershell.exe -File` で起動する（Git Bash の有無に依存しない）
- .ps1 は BOM 付き UTF-8。Windows PowerShell 5.1 が BOM なしを Shift-JIS として読むため
- Hooks の出力は BOM なし UTF-8。BOM が付くと JSON として扱われないため
- Skill 本文で `$` と数字を並べない。引数に置き換えられるため

### 修正
- 権限ルールから `Write(...)` を削除。公式仕様では `Write(パス)` のルールは一致せず、`Edit(パス)` がファイル作成も含めて扱う。`Edit(...)` 側で同じ範囲をカバーしている
