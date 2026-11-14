<#
  PHASE 0: PC の現状調査（読み取り専用）

  何も変更しません。ファイルの削除・変更・設定の書き換え・ソフトのインストールは行いません。
  例外は1つだけで、調査結果のレポートをこのスクリプトと同じフォルダに新規作成します。

  秘密情報（APIキー・トークン）の「値」は一切表示しません。
  環境変数は「設定されているかどうか」だけを報告します。

  実行方法（PowerShell）:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\survey.ps1
#>

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$lines = New-Object System.Collections.Generic.List[string]
function Add([string]$s = '') { $lines.Add($s) }
function Section([string]$t) { Add ''; Add "## $t"; Add '' }

function Probe-Command([string]$name, [string[]]$versionArgs) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $cmd) { return "未検出" }
  $v = ''
  try { $v = (& $cmd.Source @versionArgs 2>&1 | Select-Object -First 1) -as [string] } catch { $v = '(バージョン取得失敗)' }
  return "検出: $($cmd.Source)  /  $($v.Trim())"
}

Add "# PHASE 0 調査レポート"
Add ""
Add "- 作成日時: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Add "- コンピューター名: $env:COMPUTERNAME"
Add "- 実行ユーザー: $env:USERNAME"

# ------------------------------------------------------------
Section "1. ハードウェア・OS"
$os = Get-CimInstance Win32_OperatingSystem
Add "- OS: $($os.Caption) $($os.Version) (Build $($os.BuildNumber))"
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
Add "- CPU: $($cpu.Name.Trim()) / $($cpu.NumberOfCores)コア $($cpu.NumberOfLogicalProcessors)スレッド"
Add ("- RAM: {0:N1} GB（空き {1:N1} GB）" -f ($os.TotalVisibleMemorySize / 1MB), ($os.FreePhysicalMemory / 1MB))
foreach ($g in Get-CimInstance Win32_VideoController) {
  Add ("- GPU: {0}（ドライバ {1}）" -f $g.Name, $g.DriverVersion)
}
$smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($smi) {
  $vram = & nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader 2>$null
  Add "- nvidia-smi: $vram"
}
foreach ($d in Get-PSDrive -PSProvider FileSystem) {
  if ($null -ne $d.Used -and ($d.Used + $d.Free) -gt 0) {
    Add ("- ドライブ {0}: 合計 {1:N0} GB / 使用 {2:N0} GB / 空き {3:N0} GB" -f $d.Name, (($d.Used + $d.Free) / 1GB), ($d.Used / 1GB), ($d.Free / 1GB))
  }
}

# ------------------------------------------------------------
Section "2. 開発ツール"
Add "- Claude Code: $(Probe-Command 'claude' @('--version'))"
Add "- Node.js: $(Probe-Command 'node' @('-v'))"
Add "- npm: $(Probe-Command 'npm' @('-v'))"
Add "- Python: $(Probe-Command 'python' @('--version'))"
Add "- py launcher: $(Probe-Command 'py' @('--version'))"
Add "- Git: $(Probe-Command 'git' @('--version'))"
$gitBash = Test-Path "$env:ProgramFiles\Git\bin\bash.exe"
Add "- Git Bash: $(if ($gitBash) { '検出' } else { '未検出（Hooks は PowerShell で動く設計なので問題なし）' })"
Add "- PowerShell 7 (pwsh): $(Probe-Command 'pwsh' @('-v'))"
Add "- GitHub CLI: $(Probe-Command 'gh' @('--version'))"

# ------------------------------------------------------------
Section "3. 他のAIツール"
Add "- Ollama: $(Probe-Command 'ollama' @('--version'))"
if (Get-Command ollama -ErrorAction SilentlyContinue) {
  Add "- Ollama のモデル一覧（読み取りのみ）:"
  $models = & ollama list 2>&1
  foreach ($m in $models) { Add "    $m" }
}
Add "- Codex CLI: $(Probe-Command 'codex' @('--version'))"
Add "- Gemini CLI: $(Probe-Command 'gemini' @('--version'))"
foreach ($n in @('antigravity', 'agy')) {
  Add "- $n : $(Probe-Command $n @('--version'))"
}

# ------------------------------------------------------------
Section "4. 認証と課金に関わる設定（値は表示しない）"
foreach ($k in @('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY')) {
  $set = [bool]([Environment]::GetEnvironmentVariable($k, 'Process') -or [Environment]::GetEnvironmentVariable($k, 'User') -or [Environment]::GetEnvironmentVariable($k, 'Machine'))
  Add "- $k : $(if ($set) { '設定あり ← 二重課金の確認が必要' } else { 'なし' })"
}
Add ""
Add "> ANTHROPIC_API_KEY が設定されていると、Claude Code が Pro の契約ではなく API 従量課金を使う場合があります。"

# ------------------------------------------------------------
Section "5. 既存の Claude Code 設定（中身は変更しない）"
$cc = Join-Path $env:USERPROFILE '.claude'
Add "- ~/.claude: $(if (Test-Path $cc) { '存在' } else { 'なし' })"
foreach ($f in @('CLAUDE.md', 'settings.json', 'settings.local.json')) {
  $p = Join-Path $cc $f
  if (Test-Path $p) { Add ("  - {0}: あり（{1:N0} バイト, 更新 {2}）" -f $f, (Get-Item $p).Length, (Get-Item $p).LastWriteTime.ToString('yyyy-MM-dd')) }
  else { Add "  - ${f}: なし" }
}
$settingsPath = Join-Path $cc 'settings.json'
if (Test-Path $settingsPath) {
  try {
    $s = Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Add "  - settings.json のキー: $(($s.PSObject.Properties.Name) -join ', ')"
    if ($s.permissions) { Add "  - permissions.defaultMode: $($s.permissions.defaultMode)" }
    if ($s.hooks) { Add "  - hooks のイベント: $(($s.hooks.PSObject.Properties.Name) -join ', ')" }
  } catch { Add "  - settings.json: JSON として読めませんでした" }
}
foreach ($dir in @('agents', 'skills', 'hooks', 'commands', 'rules')) {
  $p = Join-Path $cc $dir
  if (Test-Path $p) {
    $names = (Get-ChildItem $p -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name) -join ', '
    Add "  - ${dir}/: $names"
  } else { Add "  - ${dir}/: なし" }
}
$cj = Join-Path $env:USERPROFILE '.claude.json'
if (Test-Path $cj) {
  try {
    $j = Get-Content $cj -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.mcpServers) { Add "- ユーザー全体の MCP サーバー（名前のみ）: $(($j.mcpServers.PSObject.Properties.Name) -join ', ')" }
    else { Add "- ユーザー全体の MCP サーバー: なし" }
  } catch { Add "- ~/.claude.json: 読めませんでした" }
}

# ------------------------------------------------------------
Section "6. Obsidian"
$obsExe = @(
  "$env:LOCALAPPDATA\Programs\Obsidian\Obsidian.exe",
  "$env:ProgramFiles\Obsidian\Obsidian.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
Add "- Obsidian 本体: $(if ($obsExe) { "検出 ($obsExe)" } else { '既定の場所では未検出' })"
$obsCfg = Join-Path $env:APPDATA 'obsidian\obsidian.json'
if (Test-Path $obsCfg) {
  Add "- Obsidian 設定ファイル: $obsCfg"
  try {
    $oc = Get-Content $obsCfg -Raw -Encoding UTF8 | ConvertFrom-Json
    $i = 0
    foreach ($v in $oc.vaults.PSObject.Properties) {
      $i++
      $vp = $v.Value.path
      $open = if ($v.Value.open) { '（最後に開いていた）' } else { '' }
      $exists = if (Test-Path $vp) { '存在' } else { '見つからない' }
      $notes = if (Test-Path $vp) { (Get-ChildItem $vp -Recurse -Filter *.md -ErrorAction SilentlyContinue | Measure-Object).Count } else { 0 }
      Add "  - Vault 候補 ${i}: $vp $open / $exists / Markdown $notes 件"
    }
    if ($i -eq 0) { Add "  - 登録されている Vault はありません" }
  } catch { Add "  - 設定ファイルを読めませんでした" }
} else {
  Add "- Obsidian 設定ファイル: なし（Vault の登録情報が見つかりません）"
  Add "- 限定した場所で .obsidian フォルダを探します（Documents / OneDrive / ホーム直下、深さ3まで）"
  $roots = @("$env:USERPROFILE\Documents", "$env:OneDrive", "$env:USERPROFILE") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
  foreach ($r in $roots) {
    Get-ChildItem $r -Directory -Recurse -Depth 3 -Filter '.obsidian' -Force -ErrorAction SilentlyContinue |
      ForEach-Object { Add "  - 候補: $($_.Parent.FullName)" }
  }
}

# ------------------------------------------------------------
Section "7. Muse AI"
$uninst = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$museApps = Get-ItemProperty $uninst -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*Muse*' }
if ($museApps) {
  foreach ($a in $museApps) { Add "- インストール済み: $($a.DisplayName) $($a.DisplayVersion) / 場所: $($a.InstallLocation)" }
} else { Add "- アンインストール情報に 'Muse' を含むアプリは見つかりませんでした" }
foreach ($base in @($env:APPDATA, $env:LOCALAPPDATA)) {
  Get-ChildItem $base -Directory -Filter '*muse*' -ErrorAction SilentlyContinue | ForEach-Object { Add "- データフォルダ候補: $($_.FullName)" }
}
$store = Get-AppxPackage -Name '*Muse*' -ErrorAction SilentlyContinue
foreach ($p in $store) { Add "- Microsoft Store アプリ: $($p.Name) $($p.Version)" }

# ------------------------------------------------------------
Section "8. Remote Control 対象フォルダ（参考）"
Add "- クラウドセッションから見えていたフォルダ: nandemonaimono / ClaudeCode_Backup_20261014_200223 / 株強弱"
Add "- これらの実際の場所を確認します:"
foreach ($name in @('nandemonaimono', 'ClaudeCode_Backup_20261014_200223', '株強弱')) {
  $hits = Get-ChildItem $env:USERPROFILE -Directory -Recurse -Depth 3 -Filter $name -Force -ErrorAction SilentlyContinue | Select-Object -First 3
  if ($hits) { foreach ($h in $hits) { Add "  - $name : $($h.FullName)" } } else { Add "  - $name : ホーム配下（深さ3まで）では見つからず" }
}

# ------------------------------------------------------------
$out = Join-Path $PSScriptRoot ("PHASE0_REPORT_{0}.md" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
$lines | Out-File -FilePath $out -Encoding utf8
$lines | ForEach-Object { Write-Output $_ }
Write-Output ""
Write-Output "レポートを保存しました: $out"
