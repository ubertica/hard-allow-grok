# Example 1 — install and init on a clean machine

```bash
git clone https://github.com/ubertica/hard-allow-grok.git
cd hard-allow-grok
# If Grok is missing, the installer asks to run:
#   curl -fsSL https://x.ai/cli/install.sh | bash
./install.sh --skip-init
# non-interactive:  ./install.sh --install-grok --skip-init

node ~/.grok/hard-allow/ceremony.mjs --init
# code:  (you type a new code, twice)
# confirm: auto

node ~/.grok/hard-allow/ceremony.mjs
# code + Touch ID / sudo / Hello

node ~/.grok/hard-allow/ceremony.mjs --check
# { "live": true, "scope": "*", ... }

echo $GROK_HARD_ALLOW_ACTIVE   # after: source ~/.grok/hard-allow/active.env
```

Expected: `INSTALL-STAMP.json` exists, `operator.json` mode 0600, no `session.json` in git.
