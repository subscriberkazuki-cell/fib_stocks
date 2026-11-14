# PreToolUse (Write|Edit): APIキーや秘密鍵をファイルに書き込ませない。
#
# .env などの秘密ファイルそのものは settings.json の Read 拒否ルールで守っている
# （Read の拒否は同じパスへの Edit / Write も止める）。
# ここでは「普通のファイルにキーを直書きする」ほうを止める。
# 理由文には検出した種類だけを書き、キーの値は出さない。

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8

try {
  $in = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $ti = $in.tool_input
  $text = (@($ti.content, $ti.new_string) | Where-Object { $_ }) -join "`n"
  if (-not $text) { exit 0 }

  $patterns = [ordered]@{
    'Anthropic APIキー' = 'sk-ant-[A-Za-z0-9_\-]{20,}'
    'OpenAI APIキー'    = 'sk-(proj-)?[A-Za-z0-9_\-]{32,}'
    'AWS アクセスキー'  = 'AKIA[0-9A-Z]{16}'
    'GitHub トークン'   = 'gh[pousr]_[A-Za-z0-9]{36,}'
    'Slack トークン'    = 'xox[abposr]-[A-Za-z0-9\-]{10,}'
    'Google APIキー'    = 'AIza[0-9A-Za-z_\-]{35}'
    '秘密鍵'            = '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  }
  foreach ($k in $patterns.Keys) {
    if ($text -cmatch $patterns[$k]) {
      $o = @{ hookSpecificOutput = @{
          hookEventName = 'PreToolUse'
          permissionDecision = 'deny'
          permissionDecisionReason = "書き込み内容に $k らしき文字列があります。秘密情報はファイルに直書きせず、環境変数や .env（Git 管理外）で扱ってください。"
        } }
      [Console]::Out.Write(($o | ConvertTo-Json -Compress -Depth 4))
      exit 0
    }
  }
  exit 0
} catch {
  # 判定できないときは止めず、通常の権限確認に任せる
  exit 0
}
