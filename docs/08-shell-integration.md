# 08 — Shell integration

## ~/.zshrc auto-source

After install, `~/.zshrc` contains a block:

```bash
# HARD ALLOW auto-source
if session live (ceremony --check); then
  source ~/.grok/hard-allow/active.env
fi
```

Effects:

- New terminal tabs get the token without re-running ceremony  
- Node scripts, gates, denylist see `SECOPS_HARD_ALLOW_TOKEN`  
- Subshells used by agents inherit the same env  

Apply immediately: `source ~/.zshrc`

## Manual

```bash
source ~/.grok/hard-allow/active.env
node ~/.grok/hard-allow/ceremony.mjs --check
```
