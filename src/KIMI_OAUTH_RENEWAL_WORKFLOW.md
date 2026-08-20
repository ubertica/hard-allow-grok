# Kimi OAuth Renewal Workflow

**Date:** 2026-08-07  
**Status:** EXPIRED (2026-08-06T23:04:10Z)  
**Impact:** MCP tools unavailable until renewed  
**Action Required:** OAuth re-authentication

---

## Problem

Kimi OAuth token expired yesterday. This blocks:
- MCP tool discovery (ha-mcp tools not callable)
- Any Kimi API calls (queries, agent invocation, context access)
- HA inheritance to Kimi subagents

**Note:** MCP configuration is 100% correct; only auth is blocking.

---

## Solution: OAuth Renewal (3 methods)

### Method 1: Interactive (Desktop App) — RECOMMENDED

**Step 1: Open Kimi App**
```bash
# On this Mac
open -a "Kimi"
# Or navigate to kimi.moonshot.cn login

# Or open directly:
open "https://kimi.moonshot.cn"
```

**Step 2: Login**
- Email/phone + verification code
- Or WeChat/QQ OAuth if configured

**Step 3: Authorize**
- Click "Allow" when prompted for permissions
- Accept any scopes (profile, API access, etc.)

**Step 4: Verify Token Renewed**
```bash
# Check in app settings
# Settings → API Keys → View Token
# Or check environment:

grep -i kimi ~/.claude/projects/**/memory/*.md 2>/dev/null | grep -i "oauth\|token\|expire"

# Or query context nodes
jq '.nodes.system.credentials.kimi' ~/.grok/context-nodes/state.json
```

**Expected output:**
```json
{
  "status": "authenticated",
  "expiresAt": "2026-08-21T23:04:10Z",  // 14 days from now
  "scopes": ["api", "profile"]
}
```

---

### Method 2: CLI / Programmatic (headless)

**Step 1: Get OAuth Credentials**

From Kimi.app settings:
- Client ID: (saved in ~/.kimi/.env or keychain)
- Client Secret: (saved in keychain)
- Redirect URI: http://localhost:8888 (default)

**Step 2: Run OAuth Flow Script**

```bash
cat > /tmp/kimi-oauth-renew.mjs << 'EOF'
#!/usr/bin/env node
import { spawn } from 'child_process'
import http from 'http'
import { URL } from 'url'

const CLIENT_ID = process.env.KIMI_CLIENT_ID
const CLIENT_SECRET = process.env.KIMI_CLIENT_SECRET
const REDIRECT_URI = 'http://localhost:8888'
const AUTHORIZE_URL = 'https://api.moonshot.cn/oauth/authorize'
const TOKEN_URL = 'https://api.moonshot.cn/oauth/token'

// Step 1: Launch browser for user approval
const authUrl = new URL(AUTHORIZE_URL)
authUrl.searchParams.set('client_id', CLIENT_ID)
authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', 'api profile')

console.log('Opening browser for Kimi OAuth...')
spawn('open', [authUrl.toString()])

// Step 2: Listen for redirect with auth code
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI)
  const authCode = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    res.writeHead(400)
    res.end(`OAuth Error: ${error}`)
    process.exit(1)
  }

  if (!authCode) {
    res.writeHead(400)
    res.end('No auth code received')
    process.exit(1)
  }

  // Step 3: Exchange code for token
  console.log('Exchanging auth code for token...')
  
  const tokenResponse = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    }),
  })

  const tokenData = await tokenResponse.json()

  if (tokenData.error) {
    res.writeHead(400)
    res.end(`Token Error: ${tokenData.error}`)
    process.exit(1)
  }

  const token = tokenData.access_token
  const expiresIn = tokenData.expires_in
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Step 4: Save token
  console.log(`✓ Token received: ${token.slice(0, 20)}...`)
  console.log(`✓ Expires at: ${expiresAt}`)

  // Save to keychain (macOS)
  const { execSync } = await import('child_process')
  try {
    execSync(`security add-generic-password -U -a kimi -s "kimi-oauth-token" -w "${token}"`)
    console.log('✓ Token saved to macOS keychain')
  } catch (e) {
    console.warn('Could not save to keychain:', e.message)
  }

  // Save to ~/.kimi/.env for reference
  const fs = await import('fs')
  const envContent = `KIMI_OAUTH_TOKEN="${token}"\nKIMI_OAUTH_EXPIRES_AT="${expiresAt}"\n`
  fs.writeFileSync(`${process.env.HOME}/.kimi/.env`, envContent)
  console.log('✓ Token saved to ~/.kimi/.env')

  // Update context nodes
  const stateFile = `${process.env.HOME}/.grok/context-nodes/state.json`
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
  state.nodes['system.credentials'].kimi = {
    oauth_token: token,
    expiresAt: expiresAt,
    status: 'authenticated',
    renewedAt: new Date().toISOString(),
  }
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))
  console.log('✓ Context nodes updated')

  // Success response
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(`
    <h1>✓ OAuth Success!</h1>
    <p>Token renewed and saved.</p>
    <p>You can close this window.</p>
    <script>window.close()</script>
  `)

  console.log('✓ OAuth renewal complete!')
  setTimeout(() => process.exit(0), 1000)
})

server.listen(8888, () => {
  console.log('Listening on http://localhost:8888')
})
EOF

# Run the script
export KIMI_CLIENT_ID="your-client-id"
export KIMI_CLIENT_SECRET="your-client-secret"
node /tmp/kimi-oauth-renew.mjs
```

**Step 3: Verify**
```bash
cat ~/.kimi/.env | grep KIMI_OAUTH_EXPIRES_AT

# Or check context nodes
jq '.nodes.system.credentials.kimi' ~/.grok/context-nodes/state.json
```

---

### Method 3: Manual Token Input

If you already have a valid Kimi OAuth token:

```bash
# Save token to keychain
security add-generic-password -U -a kimi -s "kimi-oauth-token" -w "sk_kimi_xxxxx"

# Or save to ~/.kimi/.env
cat > ~/.kimi/.env << 'EOF'
KIMI_OAUTH_TOKEN="sk_kimi_xxxxx"
KIMI_OAUTH_EXPIRES_AT="2026-08-21T23:04:10Z"
EOF

# Update context nodes
node -e "
const fs = require('fs')
const stateFile = process.env.HOME + '/.grok/context-nodes/state.json'
const state = JSON.parse(fs.readFileSync(stateFile))
state.nodes['system.credentials'].kimi = {
  oauth_token: 'sk_kimi_xxxxx',
  expiresAt: '2026-08-21T23:04:10Z',
  status: 'authenticated',
  renewedAt: new Date().toISOString()
}
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))
console.log('✓ Token updated')
"
```

---

## Verification Post-Renewal

### Check 1: Token Status

```bash
jq '.nodes.system.credentials.kimi' ~/.grok/context-nodes/state.json
# Expected: status: "authenticated", expiresAt: future date
```

### Check 2: Context Node HTTP API

```bash
curl -s http://localhost:8000/proxy/state.json | jq '.nodes.system.credentials.kimi'
```

### Check 3: MCP Tools Available

Restart Kimi CLI or Kimi Code session:
```bash
# Kimi CLI
kimi status
# Should show: ✓ Connected

# Or in Kimi Code / chat
call validate_token()
# Should succeed (not "MCP not found")
```

### Check 4: Quick Test Query

```bash
# In Kimi session
kimi_ask "HA token status?" 
# Should succeed (not auth error)

# Or via MCP
call list_agents()
# Should return: [claude, grok, kimi, fable]
```

---

## Troubleshooting

### "OAuth server unreachable"

```bash
# Check network
curl -I https://api.moonshot.cn/oauth/token

# If blocked by firewall, use SSH tunnel
ssh -L 8888:localhost:8888 user@proxy.host

# Or use VPN
# (depends on your setup)
```

### "Token still showing expired"

```bash
# Clear old token from keychain
security delete-generic-password -a kimi -s "kimi-oauth-token" 2>/dev/null

# Clear cache
rm -f ~/.kimi/.env
rm -f ~/.kimi/.oauth-cache

# Clear context nodes cache
jq '.nodes.system.credentials.kimi = {}' ~/.grok/context-nodes/state.json > /tmp/state.json
mv /tmp/state.json ~/.grok/context-nodes/state.json

# Restart MCP daemon
launchctl restart com.jailbroken.mcp-context-query-pipeline

# Re-authenticate
# (Run Method 1 or 2 again)
```

### "MCP tools still unavailable"

```bash
# Verify MCP is configured
cat ~/.kimi/.mcp/mcp.json | jq '.mcpServers.ha-mcp'

# Verify disabled is false
cat ~/.kimi/.mcp/mcp.json | jq '.mcpServers.ha-mcp.disabled'

# Restart Kimi session (app close + reopen)
# macOS: cmd+q

# Or restart Kimi CLI
kimi quit
sleep 2
kimi hello
```

---

## Post-Renewal: Enable HA Inheritance

Once OAuth is renewed, Kimi can inherit HA token from parent shell:

```bash
# In your shell
source ~/.grok/hard-allow/active.env

# Spawn Kimi with inherited token
kimi hello
# Kimi now has $SECOPS_HARD_ALLOW_TOKEN + 3 nuclear grants

# Verify
kimi_ask "Call validate_token()"
# Should return: { valid: true, grantsActive: 3 }
```

---

## Timeline

| Time | Action |
|------|--------|
| Now | OAuth token expired (2026-08-06) |
| T+0 | Run OAuth renewal (Method 1/2/3) |
| T+2min | Token validated + saved |
| T+5min | MCP daemon restarted (auto) |
| T+10min | Kimi session restarted (manual restart needed) |
| T+15min | Full HA integration active |

---

## References

- **Kimi OAuth Docs:** https://platform.moonshot.cn/docs/oauth
- **Context Nodes:** ~/.grok/context-nodes/state.json (credentials.kimi)
- **MCP Config:** ~/.kimi/.mcp/mcp.json
- **Token Storage:** ~/.kimi/.env or macOS Keychain

---

**Operator:** conradoux@hotmail.com  
**Urgency:** High (blocks all Kimi MCP access)  
**Fix Time:** 5-15 minutes  
**Difficulty:** Easy (most steps automated)
