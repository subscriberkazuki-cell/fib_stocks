# SubagentStop (quality-reviewer | technical-qa): レビューが走ったので記録を消す。

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = $utf8
try {
  $in = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $sid = [regex]::Replace([string]$in.session_id, '[^A-Za-z0-9_\-]', '')
  if ($sid) {
    $flag = Join-Path (Join-Path $env:TEMP 'ai-hub-review') "$sid.pending"
    if (Test-Path $flag) { Remove-Item $flag -Force }
  }
} catch {}
exit 0
