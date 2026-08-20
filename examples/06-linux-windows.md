# Example 6 — Linux and Windows

## Linux

```bash
./install.sh
node ~/.grok/hard-allow/ceremony.mjs --init
# confirm: auto → polkit (pkexec) or sudo -v
node ~/.grok/hard-allow/ceremony.mjs
export PATH="$HOME/.grok/bin:$HOME/.local/bin:$PATH"
grok --hard-allow
```

Need `rsync` **or** `tar`. Node 18+. Missing Grok CLI: the installer asks, or:

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
node ~/.grok/hard-allow/installer/install.mjs --wire-grok
```

## Windows

```powershell
node installer\install.mjs
node $env:USERPROFILE\.grok\hard-allow\ceremony.mjs --init
# confirm: windows-hello (bin\windows-hello-gate.ps1) or passphrase
node $env:USERPROFILE\.grok\hard-allow\ceremony.mjs
```

Add `%USERPROFILE%\.grok\bin` to PATH. Wrapper: `grok.cmd`. Official CLI: Git Bash / MSYS2 `curl -fsSL https://x.ai/cli/install.sh | bash`, then `node installer\install.mjs --wire-grok`.

```powershell
grok --hard-allow
```
