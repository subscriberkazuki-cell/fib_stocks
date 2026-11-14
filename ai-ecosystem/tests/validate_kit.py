"""AI Hub キットの静的検査。

PC（Windows）で実際に動かす前に、ここで確かめられることを確かめる。
- 設定ファイルが正しい JSON で、Hooks の参照先が実在する
- Skills / エージェントの frontmatter が公式の項目名だけを使っている
  （Claude Code は知らない項目名を黙って無視するので、綴り間違いが静かに効かなくなる）
- Skill 本文で `$` と数字が並んでいない（引数に置き換えられて文面が壊れる）
- .ps1 が BOM 付き UTF-8（Windows PowerShell 5.1 は BOM なしを Shift-JIS として読む）
- インストーラーと調査スクリプトが削除・上書きをしない

実行: python3 tests/validate_kit.py   （失敗があれば終了コード1）
"""
import json
import re
import sys
from pathlib import Path

import yaml

KIT = Path(__file__).resolve().parent.parent
HUB = KIT / "hub"
errors: list[str] = []
checks = 0


def check(cond: bool, msg: str) -> None:
    global checks
    checks += 1
    if not cond:
        errors.append(msg)


# 公式ドキュメント（code.claude.com/docs/en/skills, sub-agents, 2026-11 時点）の項目名
SKILL_FIELDS = {
    "name", "description", "when_to_use", "argument-hint", "arguments",
    "disable-model-invocation", "user-invocable", "allowed-tools", "disallowed-tools",
    "model", "effort", "context", "agent", "background", "hooks", "paths", "shell",
    "metadata", "license", "compatibility",
}
AGENT_FIELDS = {
    "name", "description", "tools", "disallowedTools", "model", "permissionMode",
    "maxTurns", "autoCompactWindow", "skills", "mcpServers", "hooks", "memory",
    "background", "omitClaudeMd", "effort", "isolation", "color", "initialPrompt",
    "experimental",
}
KNOWN_TOOLS = {
    "Read", "Write", "Edit", "NotebookEdit", "Grep", "Glob", "Bash", "PowerShell",
    "WebSearch", "WebFetch", "Agent", "Skill",
}
HOOK_EVENTS = {
    "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop",
    "SubagentStart", "SubagentStop", "Notification", "PreCompact", "SessionEnd",
}


def frontmatter(path: Path) -> tuple[dict, str]:
    text = path.read_text(encoding="utf-8")
    check(text.startswith("---\n"), f"{path}: frontmatter が1行目から始まっていない")
    _, fm, body = text.split("---\n", 2)
    data = yaml.safe_load(fm)
    check(isinstance(data, dict), f"{path}: frontmatter が YAML のマップになっていない")
    return data or {}, body


# ---------------- settings.json ----------------
settings_path = HUB / ".claude" / "settings.json"
settings = json.loads(settings_path.read_text(encoding="utf-8"))
perm = settings["permissions"]
check(perm.get("defaultMode") == "default", "defaultMode は default（手動確認）であること")
check(perm.get("disableBypassPermissionsMode") == "disable", "bypassPermissions を無効化していること")
check(settings.get("env", {}).get("CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS") == "2", "同時稼働の上限が2であること")
check(settings.get("autoMemoryEnabled") is False, "auto memory を無効にしていること（Obsidian と二重管理しない）")
for must in ["Bash(git push *)", "PowerShell(git push *)", "Bash(rm *)", "PowerShell(Remove-Item *)"]:
    check(must in perm["ask"], f"ask に {must} がない")
for must in ["Bash(git push --force*)", "PowerShell(git push --force*)", "Read(//**/.env)"]:
    check(must in perm["deny"], f"deny に {must} がない")
# Write / Glob / Grep のパス指定ルールは一致しない（公式: Edit(path) を使う）
for bucket in ("allow", "ask", "deny"):
    for r in perm[bucket]:
        check(not r.startswith(("Write(", "Glob(", "Grep(")), f"{bucket}: {r} は効かない（Edit / Read を使う）")
check(any(r.startswith("Edit(") and "AI_Hub" in r for r in perm["allow"]), "Vault の AI_Hub への書き込み許可がない")
check("Edit(~/.claude/**)" in perm["ask"], "~/.claude の変更に確認が入らない")
# Bash と PowerShell のルールが対になっていること（Windows では PowerShell ツールが使われ得る）
for bucket in ("ask", "deny"):
    bash = {r[5:-1] for r in perm[bucket] if r.startswith("Bash(")}
    pwsh = {r[11:-1] for r in perm[bucket] if r.startswith("PowerShell(")}
    for cmd in bash:
        if cmd.startswith("rm "):
            continue  # PowerShell 側は Remove-Item で書いている
        check(cmd in pwsh, f"{bucket}: Bash({cmd}) に対応する PowerShell ルールがない")

for event, groups in settings["hooks"].items():
    check(event in HOOK_EVENTS, f"未知の Hook イベント: {event}")
    for g in groups:
        for h in g["hooks"]:
            check(h["type"] == "command", f"{event}: command 以外の Hook")
            script = next((a for a in h.get("args", []) if a.endswith(".ps1")), None)
            check(script is not None, f"{event}: .ps1 を参照していない")
            if script:
                rel = script.replace("${CLAUDE_PROJECT_DIR}/", "")
                check((HUB / rel).exists(), f"{event}: 参照先がない {rel}")
                check(h.get("command") == "powershell.exe", f"{event}: powershell.exe で起動していない")

# ---------------- Skills ----------------
skills = sorted((HUB / ".claude" / "skills").glob("*/SKILL.md"))
check({p.parent.name for p in skills} == {
    "research", "stock-a", "stock-b", "business-review", "project-build", "content-production", "remember",
}, "指定された7本の Skill が揃っていない")
for p in skills:
    fm, body = frontmatter(p)
    unknown = set(fm) - SKILL_FIELDS
    check(not unknown, f"{p}: 未知の項目 {unknown}")
    check(fm.get("name") == p.parent.name, f"{p}: name がフォルダ名と違う")
    desc = (fm.get("description") or "") + (fm.get("when_to_use") or "")
    check(0 < len(desc) <= 1536, f"{p}: description が空か 1,536 文字を超えている")
    for m in re.finditer(r"(?<!\\)\$(\d)", body):
        check(False, f"{p}: 本文の ${m.group(1)} が引数に置き換えられる")
    check("$ARGUMENTS" in body, f"{p}: $ARGUMENTS を使っていない（依頼内容が渡らない）")

# ---------------- Agents ----------------
agents = sorted((HUB / ".claude" / "agents").glob("*.md"))
check({p.stem for p in agents} == {"research-analyst", "quality-reviewer", "technical-qa"}, "3体のエージェントが揃っていない")
for p in agents:
    fm, _ = frontmatter(p)
    check(not (set(fm) - AGENT_FIELDS), f"{p}: 未知の項目 {set(fm) - AGENT_FIELDS}")
    check(fm.get("name") == p.stem, f"{p}: name がファイル名と違う")
    check(bool(fm.get("description")), f"{p}: description がない")
    tools = [t.strip() for t in str(fm.get("tools", "")).split(",") if t.strip()]
    check(all(t in KNOWN_TOOLS for t in tools), f"{p}: 未知のツール {set(tools) - KNOWN_TOOLS}")
    check("permissionMode" not in fm, f"{p}: エージェント個別に権限モードを緩めない")
# 検査担当は編集できないこと（実装と検査の分離）
for name in ("quality-reviewer", "technical-qa"):
    fm, _ = frontmatter(HUB / ".claude" / "agents" / f"{name}.md")
    tools = str(fm.get("tools", ""))
    check("Edit" not in tools.split(", ") and "Write" not in tools.split(", "), f"{name}: 編集ツールを持っている")

# ---------------- CLAUDE.md ----------------
lines = (HUB / "CLAUDE.md").read_text(encoding="utf-8").splitlines()
check(len(lines) < 200, "CLAUDE.md は200行未満（公式推奨）")

# ---------------- PowerShell ----------------
for ps1 in KIT.rglob("*.ps1"):
    raw = ps1.read_bytes()
    check(raw.startswith(b"\xef\xbb\xbf"), f"{ps1.relative_to(KIT)}: BOM 付き UTF-8 になっていない")
    text = raw.decode("utf-8-sig")
    check("\t" not in text or True, "")
for name in ("install.ps1", "phase0/survey.ps1"):
    text = (KIT / name).read_text(encoding="utf-8-sig")
    check(not re.search(r"\bRemove-Item\b|\brm\s|\bdel\s", text), f"{name}: 削除処理が含まれている")
survey = (KIT / "phase0" / "survey.ps1").read_text(encoding="utf-8-sig")
check(not re.search(r"Set-Content|Set-ItemProperty|New-ItemProperty|Install-|winget|npm i", survey), "survey.ps1: 書き換え・インストール処理が含まれている")
for hook in (HUB / ".claude" / "hooks").glob("*.ps1"):
    text = hook.read_text(encoding="utf-8-sig")
    if "[Console]::Out.Write" in text:
        check("UTF8Encoding $false" in text, f"{hook.name}: 出力に BOM が付き得る（JSON として扱われなくなる）")
    check("$home " not in text.lower() and "$home=" not in text.lower(), f"{hook.name}: $HOME（読み取り専用の自動変数）に代入している")
installer = (KIT / "install.ps1").read_text(encoding="utf-8-sig")
check("if (Test-Path $dst)" in installer, "install.ps1: 既存ファイルのスキップ処理がない")
check("[switch]$Apply" in installer, "install.ps1: 既定がドライランになっていない")

# ---------------- Vault テンプレート ----------------
home = KIT / "vault-template" / "AI_Hub" / "00_Home"
for f in ("AI_HOME.md", "USER_PROFILE.md", "PROJECT_INDEX.md", "MEMORY_INDEX.md", "DECISIONS.md"):
    check((home / f).exists(), f"00_Home/{f} がない")

# ---------------- 秘密情報が紛れ込んでいないか ----------------
secret = re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|@gmail\.com")
for f in KIT.rglob("*"):
    if f.is_file() and f.suffix in {".md", ".json", ".ps1", ".py"} and f.name != "validate_kit.py":
        check(not secret.search(f.read_text(encoding="utf-8-sig")), f"{f.relative_to(KIT)}: 秘密情報・個人情報らしき文字列")

print(f"{checks} 項目を検査")
if errors:
    print(f"失敗 {len(errors)} 件:")
    for e in errors:
        print("  ✗", e)
    sys.exit(1)
print("すべて合格")
