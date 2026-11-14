# PostToolUse (Write|Edit): 「独立レビューがまだの変更」を記録する。
#
# 記録は Stop フックが読み、完了報告の前にレビューを促す。
# 記憶の保存（Vault の AI_Hub 配下）はレビュー対象から外す。毎回止まると邪魔になるため。
# ただし成果物の置き場（03_Research / 04_Outputs）はレビュー対象に含める。

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = $utf8

try {
  $in = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $file = [string]$in.tool_input.file_path
  if (-not $file) { exit 0 }
  $norm = $file.Replace('\', '/').ToLowerInvariant()

  $cfgPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'ai-hub.json'
  if (Test-Path $cfgPath) {
    $cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $hub = ([string]$cfg.vaultPath).Replace('\', '/').ToLowerInvariant().TrimEnd('/') + '/ai_hub/'
    if ($norm.StartsWith($hub)) {
      $rest = $norm.Substring($hub.Length)
      if (-not ($rest.StartsWith('03_research/') -or $rest.StartsWith('04_outputs/'))) { exit 0 }
    }
  }

  $sid = [regex]::Replace([string]$in.session_id, '[^A-Za-z0-9_\-]', '')
  if (-not $sid) { exit 0 }
  $dir = Join-Path $env:TEMP 'ai-hub-review'
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $flag = Join-Path $dir "$sid.pending"
  $existing = @()
  if (Test-Path $flag) { $existing = Get-Content $flag -Encoding UTF8 }
  if ($existing -notcontains $file) { Add-Content -Path $flag -Value $file -Encoding UTF8 }
  exit 0
} catch {
  exit 0
}
