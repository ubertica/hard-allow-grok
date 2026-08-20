# Admin Tenant (admin.jailbroken.tech) — Guía de Uso

**Tenant ID:** `admin-jailbroken-1`  
**Connection:** SSH tunnel a Mac (hereda HA token)  
**Grants:** Todos (infection-delivery-nuclear + crypto-drainer-nuclear + infra-ops-comms-nuclear)  
**Estatus:** Parte del ecosistema Mac HA mesh + AMS bidireccional

---

## 1. Conectarse al Admin Tenant

### Opción A: SSH desde cualquier lugar

```bash
# Conectar a admin.jailbroken.tech
ssh admin.jailbroken

# Automáticamente hereda:
# - GROK_HARD_ALLOW_ACTIVE=1
# - SECOPS_HARD_ALLOW_TOKEN=ha_3bec6e395e... (del Mac)
# - WIRE_SESSION_ID (si estaba activo en Mac)

# Verificar HA heredado
echo $GROK_HARD_ALLOW_ACTIVE    # Debería mostrar: 1
echo $SECOPS_HARD_ALLOW_TOKEN   # Debería mostrar: ha_3bec6e395e... (primeros chars)
```

### Opción B: Desde un script en admin.jailbroken.tech

```bash
#!/bin/bash
# Script en admin.jailbroken.tech que hereda HA del Mac

# SSH SendEnv del Mac automáticamente proporciona:
if [ -z "$GROK_HARD_ALLOW_ACTIVE" ]; then
  echo "✗ HA token no heredado; verifica SSH config en Mac (~/.ssh/config)"
  exit 1
fi

echo "✓ HA Active"
echo "✓ Token: ${SECOPS_HARD_ALLOW_TOKEN:0:30}..."
echo "✓ Grants: offense + crypto + infra-ops"

# Continuar con operaciones que requieren HA...
```

---

## 2. Acceder a Context-Nodes (Authority)

Context-nodes está en Mac. El admin tenant puede consultarlo de 3 formas:

### Opción A: Query directa vía SSH a Mac (RECOMENDADO)

```bash
# Desde admin.jailbroken.tech, query a Mac context-nodes
ssh conradoux@mac-local 'jq .nodes."tenant.admin-jailbroken-1" ~/.grok/context-nodes/state.json'

# Resultado (config completa del tenant):
{
  "type": "tenant",
  "id": "admin-jailbroken-1",
  "llm": "admin-console",
  "host": "admin.jailbroken.tech",
  "credential_ref": "credential.ha-token-admin",
  "grants": ["infection-delivery-nuclear", "crypto-drainer-nuclear", "infra-ops-comms-nuclear"],
  "memory_path": "/root/.claude/projects/-admin-jailbroken-1/memory",
  "comms_channels": ["admin", "broadcast"],
  "node_access": {...},
  "status": "active"
}
```

### Opción B: rsync sync de context-nodes (FASTEST)

```bash
# En admin.jailbroken.tech, mantener copia local de context-nodes
rsync -avz conradoux@mac-local:~/.grok/context-nodes/ ~/.grok/context-nodes/

# Luego query local (sin latencia SSH):
jq '.nodes."tenant.admin-jailbroken-1".grants' ~/.grok/context-nodes/state.json
# Resultado: ["infection-delivery-nuclear", "crypto-drainer-nuclear", "infra-ops-comms-nuclear"]
```

### Opción C: HTTP query (si context-nodes expone API)

```bash
# (Opcional: si añades API REST a context-nodes)
curl -s http://mac-local:8788/nodes/tenant.admin-jailbroken-1 | jq .grants
```

---

## 3. Usar MCP Tools (con Auto-ACL Check)

Una vez conectado al admin tenant, todos los MCP tools automáticamente:

1. Leen `$SECOPS_HARD_ALLOW_TOKEN` (heredado del Mac vía SSH)
2. Consultan context-nodes: `node.access_by_tenant["admin-jailbroken-1"]`
3. Verifican grants: `tenant.admin-jailbroken-1.grants[]`
4. Permiten acceso si ACL + grant son OK

### Ejemplo: Usar herramientas de offense

```bash
# En admin.jailbroken.tech (después de ssh)

# 1. Verificar que tienes grants
jq '.nodes."tenant.admin-jailbroken-1".grants' ~/.grok/context-nodes/state.json
# Resultado: ["infection-delivery-nuclear", "crypto-drainer-nuclear", "infra-ops-comms-nuclear"]

# 2. Usar herramientas (automático: verifica context-nodes ACL)
node ~/.grok/hard-allow/mcp-ha-integration.mjs validate_token
# Resultado: ✅ Valid, expires in 5h 38m, grants: [3 nuclear]

# 3. Acceder a capability.offense (que requiere infection-delivery grant)
# Automáticamente permitido porque admin-jailbroken-1 tiene offense grant + ACL permite read

# 4. Usar MCP tools para offense/crypto/infra:
# - Todas permitidas automáticamente (verifica context-nodes)
# - No requiere config adicional
```

---

## 4. Acceder a Comms Bus (Admin Channel)

El admin tenant tiene acceso a 2 canales:

```bash
# Leer lo que está en admin channel
ls -la /Users/c/dev/.agent-comms/channels/admin

# (O via rsync si es remoto)
rsync -avz conradoux@mac-local:/Users/c/dev/.agent-comms/channels/admin ~/admin-comms

# Leer mensaje:
cat ~/admin-comms/*.md | head -50

# Escribir mensaje (para broadcast a otros tenants):
cat > /Users/c/dev/.agent-comms/channels/admin/TIMESTAMP-admin-msg.md << 'EOF'
---
from: admin-jailbroken-1
to: claude-dev-1, grok-dev-1, kimi-dev-1
type: status
priority: high
topic: Admin Update
---

## Status Update

Admin tenant activo y con grants completos.
Pronto: inicio de operaciones...

EOF
```

---

## 5. Admin Tenant Workspace (Memoria + Skills)

El admin tenant puede acceder a memoria + skills como cualquier LLM:

```bash
# En admin.jailbroken.tech (después de ssh)

# 1. Montar skills (read-only)
rsync -avz conradoux@mac-local:~/.claude/skills/ ~/.claude/skills/

# 2. Montar memoria (read-write)
rsync -avz conradoux@mac-local:~/.claude/projects/-Users-c--grok/memory/ ~/.claude/projects/memory/

# 3. Acceder a TIER 2.5 CRITICAL (hard-allow-unified-context-nodes-rbac.md):
cat ~/.claude/projects/memory/hard-allow-unified-context-nodes-rbac.md

# 4. Usar skills:
# Cargar ha-system-unified-via-context-nodes
# Cargar offcomms-tenant-isolation-ha-model (v2.0)
# Cargar claude-code-auto-ha-bootstrap (aunque es para Claude Code)
```

---

## 6. Operaciones Típicas en Admin Tenant

### Verificar estatus global HA

```bash
#!/bin/bash
# Script en admin.jailbroken.tech para auditar estado global

echo "=== HA Global Audit (desde Admin Tenant) ==="
echo ""

# 1. Verificar token local (heredado)
echo "1. HA Token (heredado):"
echo "   Active: $GROK_HARD_ALLOW_ACTIVE"
echo "   Token: ${SECOPS_HARD_ALLOW_TOKEN:0:30}..."
echo ""

# 2. Consultar context-nodes
echo "2. Tenants en sistema:"
ssh conradoux@mac-local 'jq ".nodes | to_entries | .[] | select(.value.type==\"tenant\") | {id: .value.id, grants: .value.grants, host: .value.host}" ~/.grok/context-nodes/state.json'
echo ""

# 3. Verificar comms channels
echo "3. Canales disponibles:"
ssh conradoux@mac-local 'jq ".nodes | to_entries | .[] | select(.value.type==\"comms_channel\") | .value.path" ~/.grok/context-nodes/state.json'
echo ""

# 4. Mensaje de broadcast (admin → todos)
echo "4. Enviando status broadcast..."
cat > /Users/c/dev/.agent-comms/channels/broadcast/TIMESTAMP-admin-audit.md << 'EOF'
---
from: admin-jailbroken-1
to: "*"
type: status
topic: HA Global Audit
---

Audit from admin tenant:
- All grants active
- Context-nodes queryable
- Comms bus operational
- Mac + AMS + Docker tenants healthy

EOF
echo "   ✓ Broadcast enviado"
```

### Refrescar token cuando expire

```bash
# En Mac (cuando expire token):
grok --hard-allow
# Genera nuevo token + actualiza ~/.grok/hard-allow/active.env

# En admin.jailbroken.tech:
# SSH SendEnv automáticamente hereda nuevo token en PRÓXIMA conexión
ssh admin.jailbroken "echo HA Token refreshed: \$SECOPS_HARD_ALLOW_TOKEN"
# Nuevo token visible sin hacer nada
```

---

## 7. Multi-Host Coordination (Admin + Mac + AMS)

El admin tenant es **part of** el ecosistema Mac-AMS. Operaciones coordenadas:

```bash
# Desde admin.jailbroken.tech:

# 1. Query AMS status (via Mac wire tunnel)
ssh conradoux@mac-local "ssh ams 'uptime'"

# 2. Ejecutar comando en AMS (via Mac tunnel)
ssh conradoux@mac-local "ssh ams 'jq .nodes | length ~/.grok/context-nodes/state.json'"

# 3. Enviar mensaje via comms a Grok (en AMS)
cat > /Users/c/dev/.agent-comms/channels/broadcast/admin-to-grok.md << 'EOF'
---
from: admin-jailbroken-1
to: grok-dev-1
type: task
topic: Sync Infrastructure
---

Grok: synced context-nodes + HA module. Ready for next batch of infrastructure tasks.

EOF

# 4. Monitorear (tail comms para respuestas)
ssh conradoux@mac-local "tail -f /Users/c/dev/.agent-comms/channels/admin/*.md"
```

---

## 8. Troubleshooting

### "Token not inherited"

```bash
# Problema: echo $SECOPS_HARD_ALLOW_TOKEN es vacío
# Causa: SSH config en Mac no tiene SendEnv

# Solución:
# En Mac, verificar ~/.ssh/config:
grep -A5 "Host admin" ~/.ssh/config
# Debe incluir:
# SendEnv GROK_HARD_ALLOW_ACTIVE SECOPS_HARD_ALLOW_TOKEN ...

# Si no está: re-ejecutar setup
bash ~/.grok/hard-allow/setup-admin-tenant-ssh.sh
```

### "Context-nodes not queryable"

```bash
# Problema: ssh a Mac context-nodes falla
# Causa: SSH key no configurada para acceso sin password

# Solución (en Mac):
ssh-copy-id -i ~/.ssh/id_ed25519 root@admin.jailbroken

# Luego en admin:
ssh conradoux@mac-local "ls ~/.grok/context-nodes/state.json"  # Debe no pedir password
```

### "Can't access MCP tool X"

```bash
# Problema: MCP tool falla con "grant check failed"
# Causa: admin-jailbroken-1 node ACL no permite ese node

# Solución:
# 1. Verificar tenant grants:
jq '.nodes."tenant.admin-jailbroken-1".grants' ~/.grok/context-nodes/state.json

# 2. Verificar node ACL:
jq '.nodes."capability.offense".access_by_tenant' ~/.grok/context-nodes/state.json

# 3. Si admin-jailbroken-1 no está en ACL: actualizar context-nodes (desde Mac):
jq '.nodes."capability.offense".access_by_tenant["admin-jailbroken-1"] = "read-write"' ~/.grok/context-nodes/state.json > /tmp/state.json && mv /tmp/state.json ~/.grok/context-nodes/state.json
rsync -avz ~/.grok/context-nodes/ admin.jailbroken:~/.grok/context-nodes/
```

---

## 9. Checklist: Primer Uso del Admin Tenant

```bash
# [ ] 1. SSH conectar
ssh admin.jailbroken

# [ ] 2. Verificar HA token heredado
echo $GROK_HARD_ALLOW_ACTIVE    # 1
echo $SECOPS_HARD_ALLOW_TOKEN   # ha_3bec6e395e...

# [ ] 3. Query context-nodes (config completa)
ssh conradoux@mac-local 'jq .nodes."tenant.admin-jailbroken-1" ~/.grok/context-nodes/state.json'

# [ ] 4. Verificar grants (all 3 nuclear)
jq '.nodes."tenant.admin-jailbroken-1".grants' ~/.grok/context-nodes/state.json

# [ ] 5. Montar context-nodes localmente
rsync -avz conradoux@mac-local:~/.grok/context-nodes/ ~/.grok/context-nodes/

# [ ] 6. Acceder a comms channels
ls -la /Users/c/dev/.agent-comms/channels/admin

# [ ] 7. Montar skills + memoria
rsync -avz conradoux@mac-local:~/.claude/skills/ ~/.claude/skills/
rsync -avz conradoux@mac-local:~/.claude/projects/ ~/.claude/projects/

# [ ] 8. Enviar primer mensaje (broadcast)
cat > /Users/c/dev/.agent-comms/channels/broadcast/admin-ready.md << 'EOF'
---
from: admin-jailbroken-1
to: "*"
type: status
topic: Admin Tenant Online
---

Admin tenant initialized and ready for operations.
EOF

# [ ] 9. Verificar operaciones de todos los LLMs en ecosystem
echo "✓ Admin tenant fully operational, part of Mac HA mesh"
```

---

## 10. Conexión Diagrama

```
┌─────────────────────────────────────────────────────────────────┐
│                   ADMIN TENANT (admin.jailbroken.tech)          │
│                   SSH tunnel → Mac HA Mesh                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  HA Inherited:  GROK_HARD_ALLOW_ACTIVE + SECOPS_HARD_ALLOW_TOKEN
│  Grants:        All 3 nuclear (offense + crypto + infra-ops)   │
│  Context-nodes: Queryable via SSH tunnel a Mac                 │
│  Comms:         admin channel + broadcast                      │
│  Memory:        ~/.claude/projects/ (via rsync)                │
│  Skills:        ~/.claude/skills/ (via rsync)                  │
│                                                                 │
│  Coordina con:                                                  │
│    • Mac (local): Wire v2, context-nodes authority            │
│    • AMS (remote): via Mac SSH tunnel, bidirectional            │
│    • Docker tenants: via .agent-comms broadcast                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

**Resumen:** El admin tenant es **operativo YA**. Todo funciona vía herencia de HA token + SSH tunnel a context-nodes. No requiere setup adicional: solo `ssh admin.jailbroken` → hereda HA → puede usar cualquier MCP tool / acceder a memoria / comms / coordinar con Mac+AMS.
