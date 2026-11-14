<#
  AI Hub インストーラー（既存環境を壊さない）

  - 既定はドライラン。何をするかを表示するだけで、何も書き込みません
  - -Apply を付けたときだけ実行します
  - 既存のファイルは上書きしません。削除もしません。既にあるものは「スキップ」と表示します
  - ~/.claude（ユーザー全体の設定）には触れません。司令塔用の新しいフォルダと、
    Obsidian Vault の中の AI_Hub フォルダにだけ書き込みます

  使い方（PowerShell）:
    # 1) まず確認（何も変わりません）
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -VaultPath "C:\Users\you\Documents\MyVault"
    # 2) 内容に問題がなければ実行
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -VaultPath "C:\Users\you\Documents\MyVault" -Apply
#>
param(
  [Parameter(Mandatory = $true)][string]$VaultPath,
  [string]$HubPath = (Join-Path $env:USERPROFILE 'AI_Hub_Workspace'),
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
$kit = $PSScriptRoot
$log = New-Object System.Collections.Generic.List[string]
$counts = @{ create = 0; skip = 0 }

function Note([string]$s) { $log.Add($s); Write-Output $s }

# ------------------------------------------------------------
# Vault の確認。推測で別の場所を使わない
# ------------------------------------------------------------
$VaultPath = $VaultPath.TrimEnd('\', '/')
if (-not (Test-Path $VaultPath -PathType Container)) {
  throw "Vault が見つかりません: $VaultPath  （PHASE 0 レポートの候補から正しいパスを指定してください）"
}
if (-not (Test-Path (Join-Path $VaultPath '.obsidian') -PathType Container)) {
  throw "このフォルダには .obsidian がありません。Obsidian の Vault ではない可能性があります: $VaultPath"
}

# 権限ルール用のパス（Claude Code は Windows のパスを /c/Users/... の形に直して照合する）
$drive = $VaultPath.Substring(0, 1).ToLowerInvariant()
$vaultRule = '//' + $drive + ($VaultPath.Substring(2) -replace '\\', '/')
$vaultJson = $VaultPath -replace '\\', '\\'

Note "モード: $(if ($Apply) { '実行（-Apply）' } else { 'ドライラン（何も書き込みません）' })"
Note "司令塔フォルダ: $HubPath"
Note "Obsidian Vault: $VaultPath"
Note "権限ルール用のパス: $vaultRule"
Note ''

function Place([string]$src, [string]$dst, [scriptblock]$transform) {
  if (Test-Path $dst) {
    Note "  スキップ（既存のため変更せず）: $dst"
    $counts.skip++
    return
  }
  Note "  作成: $dst"
  $counts.create++
  if (-not $Apply) { return }
  $dir = Split-Path $dst -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  if ($transform) {
    $text = [IO.File]::ReadAllText($src, $utf8)
    [IO.File]::WriteAllText($dst, (& $transform $text), $utf8)
  } else {
    Copy-Item -LiteralPath $src -Destination $dst
  }
}

# ------------------------------------------------------------
# 1. 司令塔フォルダ（CLAUDE.md・.claude/ 一式）
# ------------------------------------------------------------
Note '[1] 司令塔フォルダ'
$hubSrc = Join-Path $kit 'hub'
foreach ($f in Get-ChildItem $hubSrc -Recurse -File -Force) {
  $rel = $f.FullName.Substring($hubSrc.Length).TrimStart('\', '/')
  $dst = Join-Path $HubPath $rel
  if ($rel -eq '.claude\settings.json' -or $rel -eq '.claude/settings.json') {
    Place $f.FullName $dst { param($t) $t.Replace('__VAULT_PATH__', $vaultJson).Replace('__VAULT_RULE__', $vaultRule) }
  } else {
    Place $f.FullName $dst $null
  }
}

# Vault の場所を Hooks と Skills に伝える設定
$cfgDst = Join-Path $HubPath '.claude\ai-hub.json'
if (Test-Path $cfgDst) {
  Note "  スキップ（既存のため変更せず）: $cfgDst"
  $counts.skip++
} else {
  Note "  作成: $cfgDst"
  $counts.create++
  if ($Apply) {
    $json = (@{ vaultPath = $VaultPath; installedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') } | ConvertTo-Json)
    [IO.File]::WriteAllText($cfgDst, $json, $utf8)
  }
}
Note ''

# ------------------------------------------------------------
# 2. Vault の AI_Hub（足りないファイルだけ追加）
# ------------------------------------------------------------
Note '[2] Obsidian Vault の AI_Hub'
$tplSrc = Join-Path $kit 'vault-template\AI_Hub'
$hubInVault = Join-Path $VaultPath 'AI_Hub'
foreach ($d in Get-ChildItem $tplSrc -Recurse -Directory) {
  $dst = Join-Path $hubInVault $d.FullName.Substring($tplSrc.Length).TrimStart('\', '/')
  if (-not (Test-Path $dst)) {
    Note "  フォルダ作成: $dst"
    if ($Apply) { New-Item -ItemType Directory -Path $dst -Force | Out-Null }
  }
}
foreach ($f in Get-ChildItem $tplSrc -Recurse -File -Force) {
  if ($f.Name -eq '.gitkeep') { continue }
  $dst = Join-Path $hubInVault $f.FullName.Substring($tplSrc.Length).TrimStart('\', '/')
  Place $f.FullName $dst $null
}
Note ''

Note "結果: 作成 $($counts.create) 件 / スキップ $($counts.skip) 件 / 削除 0 件"
if (-not $Apply) {
  Note '（ドライランです。実際に作るには -Apply を付けて再実行してください）'
} else {
  $logPath = Join-Path $HubPath ("INSTALL_LOG_{0}.txt" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
  [IO.File]::WriteAllLines($logPath, $log, $utf8)
  Write-Output "ログ: $logPath"
  Write-Output ''
  Write-Output '次の手順:'
  Write-Output "  cd `"$HubPath`""
  Write-Output '  claude'
  Write-Output '  （初回はフォルダの信頼確認が出ます。内容を確認して許可してください）'
}
