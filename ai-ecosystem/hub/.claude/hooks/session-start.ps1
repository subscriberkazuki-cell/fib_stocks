# SessionStart: 記憶の「索引だけ」を読み込む。本文は読まない。
#
# 毎回すべての記憶を読み込むと、文脈が膨らんで肝心の指示が埋もれる。
# ここでは AI_HOME（基本情報）・PROJECT_INDEX（進行状況）・MEMORY_INDEX（ノートの目録）
# だけを上限つきで渡し、本文は必要になったときに Claude が検索して読む。
# Claude Code の上限は 10,000 文字。余裕を持たせて 6,000 文字で切る。

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
try { $null = [Console]::In.ReadToEnd() } catch {}

function Emit([string]$text) {
  $o = @{ hookSpecificOutput = @{ hookEventName = 'SessionStart'; additionalContext = $text } }
  [Console]::Out.Write(($o | ConvertTo-Json -Compress -Depth 4))
  exit 0
}

try {
  $cfgPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'ai-hub.json'
  if (-not (Test-Path $cfgPath)) {
    Emit 'AI Hub: .claude/ai-hub.json がありません。Obsidian Vault に未接続のまま動いています。install.ps1 で設定してください。'
  }
  $cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $homeDir = Join-Path $cfg.vaultPath 'AI_Hub\00_Home'
  if (-not (Test-Path $homeDir)) {
    Emit "AI Hub: Vault の AI_Hub\00_Home が見つかりません（$homeDir）。記憶なしで動いています。"
  }

  $budget = 6000
  $parts = New-Object System.Collections.Generic.List[string]
  $parts.Add("AI Hub の記憶索引（Vault: $($cfg.vaultPath)）。本文が必要なときは Vault を検索して読むこと。")

  foreach ($spec in @(@('AI_HOME.md', 1500), @('PROJECT_INDEX.md', 2000), @('MEMORY_INDEX.md', 2400))) {
    $p = Join-Path $homeDir $spec[0]
    if (-not (Test-Path $p)) { continue }
    $t = Get-Content $p -Raw -Encoding UTF8
    $cap = [Math]::Min([int]$spec[1], $budget)
    if ($cap -le 200) { break }
    if ($t.Length -gt $cap) { $t = $t.Substring(0, $cap) + "`n…（以下省略。全文: $p）" }
    $parts.Add("=== $($spec[0]) ===`n$t")
    $budget -= $t.Length
  }
  Emit ($parts -join "`n`n")
} catch {
  # 記憶の読み込みに失敗しても、セッション自体は止めない
  Emit "AI Hub: 記憶索引の読み込みに失敗しました（$($_.Exception.Message)）。"
}
