# Stop: 独立レビューを経ずに完了報告しようとしたら、1回だけ止めて促す。
#
# 無限ループを防ぐ仕組み:
#   - 止めるのは1回だけ。止めた時点で記録を消すので、次の Stop では止まらない
#   - Claude Code が渡す stop_hook_active が true（このフックで続行中）なら何もしない
#   - レビュー担当がバックグラウンドで動いている最中なら止めない（終われば記録が消える）
# レビュー不要な軽微な修正なら、Claude はその理由を1行述べて終われる。

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8

try {
  $in = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($in.stop_hook_active -eq $true) { exit 0 }

  foreach ($t in @($in.background_tasks)) {
    if ($t -and ($t.agent_type -eq 'quality-reviewer' -or $t.agent_type -eq 'technical-qa')) { exit 0 }
  }

  $sid = [regex]::Replace([string]$in.session_id, '[^A-Za-z0-9_\-]', '')
  if (-not $sid) { exit 0 }
  $flag = Join-Path (Join-Path $env:TEMP 'ai-hub-review') "$sid.pending"
  if (-not (Test-Path $flag)) { exit 0 }

  $files = @(Get-Content $flag -Encoding UTF8 | Where-Object { $_ })
  Remove-Item $flag -Force
  $shown = ($files | Select-Object -First 8 | ForEach-Object { Split-Path $_ -Leaf }) -join ', '
  if ($files.Count -gt 8) { $shown += " ほか$($files.Count - 8)件" }

  $o = @{
    decision = 'block'
    reason = "独立レビューが未実施です（変更: $shown）。成果物なら quality-reviewer、コードなら technical-qa に検査させてから完了報告してください。軽微な修正などでレビュー不要な場合は、その理由を1行述べて終了してかまいません。"
  }
  [Console]::Out.Write(($o | ConvertTo-Json -Compress -Depth 4))
  exit 0
} catch {
  exit 0
}
