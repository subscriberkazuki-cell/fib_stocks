# AI Hub — Claude Code を司令塔とする個人用AIエコシステム

自然言語で指示すると、Claude Code がタスクを分解し、専門エージェントに任せ、別のエージェントに検査させ、再利用できる知見を Obsidian に記録する環境です。

- 構成と設計判断 → [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md)
- 業務ごとの使い方 → [docs/WORKFLOWS.md](docs/WORKFLOWS.md)
- 構築の進み具合と検証結果 → [docs/SETUP_REPORT.md](docs/SETUP_REPORT.md)
- 変更履歴 → [docs/CHANGELOG.md](docs/CHANGELOG.md)
- オーナーのプロフィール・プロジェクト一覧 → [vault-template/AI_Hub/00_Home/USER_PROFILE.md](vault-template/AI_Hub/00_Home/USER_PROFILE.md) / [PROJECT_INDEX.md](vault-template/AI_Hub/00_Home/PROJECT_INDEX.md)（インストール後は Vault 側が本物）

## 中身

```
ai-ecosystem/
├── phase0/survey.ps1      PC の現状調査（読み取り専用）
├── install.ps1            インストーラー（既定はドライラン。上書き・削除なし）
├── hub/                   司令塔フォルダの中身 → %USERPROFILE%\AI_Hub_Workspace に配置
│   ├── CLAUDE.md          毎回の基本方針
│   └── .claude/
│       ├── settings.json  権限ルール・Hooks・同時稼働2体
│       ├── agents/        research-analyst / quality-reviewer / technical-qa
│       ├── skills/        research / stock-a / stock-b / business-review /
│       │                  project-build / content-production / remember
│       └── hooks/         記憶の読み込み・秘密情報の防止・レビューの強制
├── vault-template/AI_Hub/ Obsidian Vault に追加する記憶の置き場
├── docs/                  設計・手順・報告
└── tests/validate_kit.py  キットの静的検査
```

## 導入手順（Windows）

### 0. キットを PC に置く

```powershell
git clone -b claude/google-maps-store-search-1goqvv https://github.com/subscriberkazuki-cell/fib_stocks.git
cd fib_stocks\ai-ecosystem
```

（Git がなければ、GitHub のブランチ画面から ZIP でダウンロードして展開しても同じです。）

### 1. PHASE 0：現状調査（何も変更しません）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\phase0\survey.ps1
```

`phase0\PHASE0_REPORT_<日時>.md` ができます。**Obsidian Vault の候補**と、**ANTHROPIC_API_KEY が設定されていないか**（二重課金の確認）を必ず見てください。

### 2. インストール内容の確認（ドライラン）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -VaultPath "<レポートで確認した Vault のパス>"
```

作るファイル・スキップするファイルの一覧が出るだけで、何も書き込みません。

### 3. インストール

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -VaultPath "<Vault のパス>" -Apply
```

- 作るのは `%USERPROFILE%\AI_Hub_Workspace`（司令塔フォルダ）と、Vault の中の `AI_Hub\` だけです
- **既存のファイルは上書きしません。削除もしません。** `~/.claude`（ユーザー全体の設定）にも触れません

### 4. 起動と動作確認

```powershell
cd $env:USERPROFILE\AI_Hub_Workspace
claude
```

初回はフォルダの信頼確認が出ます。確認して許可してください（許可するまで権限ルールの一部が効きません）。
そのあと [SETUP_REPORT の PHASE 6 チェックリスト](docs/SETUP_REPORT.md#phase-6-pc-上での最終検証チェックリスト) を順に試します。

## 起動・停止・復旧

| やりたいこと | 方法 |
|---|---|
| 起動 | `cd %USERPROFILE%\AI_Hub_Workspace` → `claude` |
| 停止 | `/exit` または Ctrl+C を2回 |
| 前回の続き | `claude --continue` |
| 読み込まれた設定の確認 | セッション内で `/context`・`/hooks`・`/agents`・`/memory`・`/doctor` |
| Hooks が原因で動かない | `/hooks` で該当フックを確認。急ぎなら `.claude/settings.json` の `hooks` を一時的に外す |
| 記憶の読み込みに失敗する | `.claude/ai-hub.json` の `vaultPath` が正しいか確認 |
| 元に戻す | `AI_Hub_Workspace` フォルダと Vault の `AI_Hub` フォルダを手動で削除（ほかには何も変更していません） |

## 守っていること

- 追加の契約・API 従量課金なし（Claude Pro の OAuth 認証で動く）
- 削除・`git push`・デプロイ・公開・送信・グローバルインストール・モデルのダウンロード・MCP 追加は、**権限ルールで必ず確認を挟む**
- `--dangerously-skip-permissions` と bypassPermissions モードは使えないようにしてある
- `.env`・秘密鍵は読み書きできない。APIキーのファイルへの直書きは Hook が止める
- 成果物は作成者以外のエージェントが検査する。修正は原則2回まで
