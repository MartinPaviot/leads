#!/bin/bash
# Drop into ~/.claude/statusline-command.sh and chmod +x.
# Shows current dir + context-window usage. (No hardcoded project prefix.)
input=$(cat)
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

status=""
[ -n "$cwd" ] && status="$cwd"
[ -n "$used" ] && status="$status  ctx:${used}%"

echo "$status"
