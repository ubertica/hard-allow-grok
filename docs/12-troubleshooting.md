# 12 — Troubleshooting

| Symptom | Cause | Fix |
|---------|--------|-----|
| `PASS_ARGS[@]: unbound variable` | bash `set -u` + empty array | Wrapper branches on `${#PASS_ARGS[@]}` |
| Ceremony OK then no TUI / `zsh: killed` | Binary overwritten or **codesign-poisoned path** | Point `grok-real` at `grok-macos-aarch64`; remove poisoned `grok-0.2.101-*` name |
| Ceremony OK, wrapper re-runs itself | `grok-real` was the script | Restore Mach-O; never write wrapper through symlink into downloads |
| Soft refuse monologue | Model default | HA rules + system override + ladder; reframe; `/model` |
| Empty API refuse | Server-side | Unblock ladder; local model fallback (future); do **not** clear HA |
| Token not in new terminal | zshrc not sourced | `source ~/.zshrc` or re-login |
| Auto-update breaks wrapper | xAI rewrites `~/.grok/bin/grok` | Re-run `install/install.sh` |
| Subagent “forgets” HA | Prompt without prefix / env cleared | Use system override prefix; SubagentStart re-arm |
