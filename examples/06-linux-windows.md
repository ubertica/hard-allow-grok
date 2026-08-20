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

Need `rsync` **or** `tar`. Node 18+.

## Windows

```powershell
node installer\install.mjs
node $env:USERPROFILE\.grok\hard-allow\ceremony.mjs --init
# confirm: windows-hello (bin\windows-hello-gate.ps1) or passphrase
node $env:USERPROFILE\.grok\hard-allow\ceremony.mjs
```

Add `%USERPROFILE%\.grok\bin` to PATH. Wrapper: `grok.cmd`.

```powershell
grok --hard-allow
```
