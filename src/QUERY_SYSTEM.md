# Unified Query System — Integration Layer

Complete unified orchestrator that connects all query components (MCP, HTTP API, HA filtering, semantic activation) into a single entry point supporting all query patterns.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Query Entry Points                       │
├─────────────┬──────────────────┬──────────────┬─────────────────┤
│  CLI (MCP)  │  HTTP API        │  Python SDK  │  Direct JS      │
└──────┬──────┴────────┬─────────┴──────┬───────┴────────┬────────┘
       │               │                │                │
       └───────────────┴────────────────┴────────────────┘
                       │
           ┌───────────▼────────────┐
           │ QueryOrchestrator      │
           │  (Main Orchestrator)   │
           └───────────┬────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
    QueryIndexes   HAFilter      QueryCache
    (Fast lookup)  (Permissions) (Results)
       │               │               │
       └───────────────┼───────────────┘
                       │
       ┌───────────────▼───────────────┐
       │   Context Nodes + Semantic JSON │
       │   (Dev, Grants, Desktop)       │
       └────────────────────────────────┘
```

## Components

### 1. unified-context-query.mjs (Main Orchestrator)

Central orchestration class that ties everything together.

**Initialization:**
```javascript
const orchestrator = new QueryOrchestrator(config);
await orchestrator.initialize();
```

**Indexing:** Loads 3 semantic JSON files and builds 4 indexes:
- `byTag` — fast lookup by tags
- `byCapability` — fast lookup by capabilities  
- `byType` — fast lookup by type
- `byId` — node ID → metadata mapping
- `fullText` — full-text search index

**Query Flow:**
1. Check cache (if enabled)
2. Validate HA permissions
3. Execute indexed query (tags + capabilities + type)
4. Apply permission filters
5. Format response (json/jsonl/csv/markdown)
6. Cache result

**Performance Targets:**
- Startup: <1s
- Query latency: 50-100ms typical
- Memory: ~50-100MB (254 nodes + indexes)

### 2. mcp-query-server.mjs (MCP Provider)

Exposes `context_query` tool via MCP protocol.

**Registration:**
```bash
node init-query-system.mjs --register-mcp
```

This creates MCP configs in:
- `~/.claude/.mcp/context-query.json`
- `~/.grok/.mcp/context-query.json`
- `~/.kimi/.mcp/context-query.json`
- `~/.fable/.mcp/context-query.json`

**Tool Interface:**
```
context_query(
  query: string,
  tags: string[],
  capabilities: string[],
  type?: string,
  caller_id?: string,
  format?: 'json'|'jsonl'|'csv'|'markdown',
  k?: number,
  semantic_activation?: boolean
)
```

### 3. query-api-server.mjs (HTTP API)

Express server exposing REST endpoints.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/query` | Execute query |
| GET | `/api/stats` | Orchestrator stats |
| DELETE | `/api/cache` | Clear cache |
| GET | `/health` | Health check |

**Query Parameters:**
```bash
POST /api/query
{
  "query": "system.ha-status",
  "tags": ["system"],
  "capabilities": ["read"],
  "format": "json",
  "k": 10,
  "semantic_activation": false
}
```

**Response:**
```json
{
  "results": [...],
  "metadata": {
    "resultCount": 5,
    "elapsedMs": 42,
    "timestamp": "2026-08-07T00:00:00Z",
    "cached": false
  }
}
```

**Rate Limiting:**
- Per caller-ID: 60 requests/minute (configurable)
- Returns `X-Rate-Limit-Remaining` header

### 4. query_sdk.py (Python SDK)

Python client library with automatic fallback.

**Installation:**
```bash
cp query_sdk.py /path/to/your/project/
```

**Usage:**
```python
from query_sdk import QueryClient, QueryResponse

# Initialize client
client = QueryClient()

# Execute query
response = client.query(
    text="system.ha-status",
    tags=["system"],
    k=10
)

# Access results
for result in response.results:
    print(f"{result.id}: {result.label} ({result.score:.2f})")
```

**Features:**
- Automatic HTTP/subprocess fallback
- Client-side result caching (configurable)
- Rate limit awareness
- Typed result objects
- Context manager support

## Configuration

### query-config.json

Main configuration for the orchestrator:

```json
{
  "ha": {
    "permissionMatrix": {
      "claude": { "read": true, "write": false },
      "grok": { "read": true, "activate": true },
      ...
    }
  },
  "cache": {
    "maxSize": 1000,
    "ttlMs": 3600000
  },
  "semantic": {
    "enabled": true,
    "maxActivationDepth": 3,
    "decayRate": 0.72
  },
  "indexes": {
    "buildOnStartup": true,
    "warmCacheOnInit": true
  }
}
```

### api-config.json

Configuration for HTTP API server:

```json
{
  "port": 3000,
  "host": "localhost",
  "rateLimitPerMinute": 60,
  "corsOrigins": ["http://localhost:*"],
  "logRequests": true
}
```

## Initialization

### One-Time Setup

```bash
# Full initialization (builds indexes, warms cache, creates scripts)
node init-query-system.mjs

# Include MCP registration
node init-query-system.mjs --register-mcp

# Start daemons after init
node init-query-system.mjs --start
```

**Initialization Steps:**
1. Verify HA session is active
2. Load context nodes from `~/.grok/context-nodes/`
3. Load semantic JSON (dev, grants, desktop)
4. Build all indexes
5. Warm cache with common queries
6. Register MCP tool with all LLMs
7. Create daemon control scripts
8. (Optional) Start daemons

### Daemon Control Scripts

After initialization, use these scripts to manage daemons:

```bash
# Start MCP daemon (+ optional API server)
bash ~/.grok/hard-allow/start-query-daemon.sh [--with-api]

# Stop daemons gracefully
bash ~/.grok/hard-allow/stop-query-daemon.sh

# Restart daemons
bash ~/.grok/hard-allow/restart-query-daemon.sh

# Check daemon status
bash ~/.grok/hard-allow/status-query-daemon.sh
```

## Usage

### CLI (Direct Query)

```bash
# Basic query
node unified-context-query.mjs query --text "system" --tags "system,security"

# Full options
node unified-context-query.mjs query \
  --text "ha-status" \
  --tags "system" \
  --capabilities "read" \
  --type "leaf" \
  --format json \
  --k 20 \
  --semantic

# Show statistics
node unified-context-query.mjs stats
```

### MCP (All LLMs)

```
# In Claude, Grok, Kimi, or Fable:
@context_query query="system.ha-status" tags=["system"]
```

### HTTP API

```bash
# Start API server
PORT=3000 node query-api-server.mjs

# Query
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -H "X-Caller-ID: my-app" \
  -d '{
    "query": "system.ha-status",
    "tags": ["system"],
    "k": 10,
    "format": "json"
  }'

# Get stats
curl http://localhost:3000/api/stats

# Health check
curl http://localhost:3000/health
```

### Python SDK

```python
from query_sdk import QueryClient

client = QueryClient(
    api_url="http://localhost:3000",
    caller_id="my-python-app"
)

# Query
response = client.query(
    text="system",
    tags=["system"],
    format="json",
    k=10
)

print(f"Found {response.result_count} results")
for result in response.results:
    print(f"  {result.id}: {result.label}")

# Get cache stats
print(client.get_cache_stats())
```

## Data Flow

### Query Execution (5 Steps)

1. **Validation:** Check HA permissions, parse parameters
2. **Cache Check:** Return if cached and not expired
3. **Indexed Query:** Execute against 4 indexes (tags, capabilities, type, full-text)
4. **Permission Filter:** Apply HA filter based on caller_id
5. **Format & Cache:** Format response, save to cache

### Index Building

1. Load context nodes from `~/.grok/context-nodes/state.json`
2. Load semantic JSON from 3 sources (dev, grants, desktop)
3. Extract and index:
   - Nodes by tag
   - Nodes by capability
   - Nodes by type
   - Full-text search

**Indexing Stats:**
- ~254 total nodes (context + semantic)
- ~80 unique tags
- ~120 capabilities
- ~30 types

## Performance

### Benchmarks

| Operation | Latency | Notes |
|-----------|---------|-------|
| Startup | <1s | Warm start, no I/O |
| Query (cached) | <5ms | Direct cache hit |
| Query (tag filter) | 15-25ms | Index lookup + format |
| Query (full-text) | 50-100ms | Scan all nodes, rank |
| Cache size | 50MB | 1000 entries @ 50KB each |
| Memory | 80-100MB | All indexes + orchestrator |

### Optimization Tips

1. **Use tags when possible:** Tag indexes are fastest (O(1))
2. **Combine filters:** AND logic reduces result set
3. **Enable client caching:** Reduces API calls
4. **Batch queries:** Use single `/api/query` instead of multiple
5. **Request k in advance:** Avoid re-querying for pagination

## Monitoring

### Logging

Query logs written to: `~/.grok/hard-allow/query-engine.log`

Log levels:
- `info` — successful queries
- `warn` — cache misses, HA warnings
- `error` — query failures, permission denied

### Metrics

Get orchestrator stats:

```bash
node unified-context-query.mjs stats
```

Returns:
- Node count
- Index sizes
- Cache hit rate
- HA status
- Memory usage

### Health Checks

```bash
# HTTP API health
curl http://localhost:3000/health

# Direct query test
node unified-context-query.mjs query --text "system"

# Daemon status
bash ~/.grok/hard-allow/status-query-daemon.sh
```

## Troubleshooting

### HA Not Active

**Error:** `HA not armed (missing active.env)`

**Solution:** Re-arm HA session:
```bash
node ~/.grok/hard-allow/arm-v2.mjs
```

### Index Building Fails

**Error:** `Failed to load context nodes`

**Solution:** Rebuild context nodes:
```bash
node ~/.grok/hard-allow/create-context-nodes.mjs --refresh
```

### API Server Won't Start

**Error:** `Port 3000 already in use`

**Solution:** Use different port:
```bash
PORT=3001 node query-api-server.mjs
```

### MCP Not Registered

**Error:** `Tool not found: context_query`

**Solution:** Re-register MCP:
```bash
node init-query-system.mjs --register-mcp
```

## Development

### Adding New Semantic Sources

1. Add JSON file to any of:
   - `~/dev/multi-llm-ha-chat/semantic.json`
   - `~/.grok/hard-allow/grants/semantic.json`
   - `~/Desktop/semantic.json`

2. Nodes must have format:
   ```json
   {
     "id": "unique.node.id",
     "_label": "Display Label",
     "_type": "leaf|branch|system",
     "_tags": ["tag1", "tag2"],
     "_description": "Node description",
     ...
   }
   ```

3. Re-initialize system:
   ```bash
   node init-query-system.mjs
   ```

### Extending Query Engine

To add new query features:

1. Extend `QueryIndexes` class for new index types
2. Extend `query()` method for new parameters
3. Update MCP tool schema if exposing via MCP
4. Add unit tests in test suite

### Performance Profiling

```bash
# Run with profiler
node --prof unified-context-query.mjs query --text "system"

# Generate profile report
node --prof-process isolate-*.log > profile.txt
```

## Security

### HA Filtering

All queries filtered through `HAFilter`:
- Validates HA session is active
- Applies permission matrix per caller_id
- Logs all access attempts

### API Authentication

Optional X-API-Key header:
```bash
curl -H "X-API-Key: secret-key" http://localhost:3000/api/query
```

### Data Redaction

Sensitive data (tokens, keys, passwords) automatically redacted in logs and API responses.

## API Reference

### QueryOrchestrator Class

```javascript
new QueryOrchestrator(config)

// Initialize (must call before querying)
await orchestrator.initialize()

// Execute query
const response = await orchestrator.query({
  query: string,
  tags?: string[],
  capabilities?: string[],
  type?: string,
  callerId?: string,
  format?: 'json' | 'jsonl' | 'csv' | 'markdown',
  k?: number,
  semanticActivation?: boolean
})

// Get stats
orchestrator.stats()

// Save cache
await orchestrator.saveCache()
```

### MCP Tool Schema

```json
{
  "name": "context_query",
  "description": "Search and retrieve context nodes",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "tags": { "type": "array", "items": { "type": "string" } },
      "capabilities": { "type": "array", "items": { "type": "string" } },
      "type": { "type": "string" },
      "caller_id": { "type": "string" },
      "format": { "enum": ["json", "jsonl", "csv", "markdown"] },
      "k": { "type": "number" },
      "semantic_activation": { "type": "boolean" }
    }
  }
}
```

### HTTP API Endpoints

```
POST /api/query
GET /api/query?query=...&tags=...
GET /api/stats
DELETE /api/cache
GET /health
GET /
```

## Maintenance

### Regular Tasks

- **Weekly:** Check query cache hit rates, adjust TTL if needed
- **Monthly:** Review query logs, update semantic JSON if needed
- **Quarterly:** Rebuild indexes, refresh cache

### Backups

Context node snapshots saved to: `~/.grok/context-nodes/backups/`

Automatic backups on context refresh (last 5 versions kept).

## Files

- `unified-context-query.mjs` (550 lines) — Main orchestrator
- `mcp-query-server.mjs` (180 lines) — MCP wrapper
- `query-api-server.mjs` (280 lines) — HTTP API wrapper
- `query_sdk.py` (350 lines) — Python SDK
- `init-query-system.mjs` (400 lines) — Initialization script
- `query-config.json` — Orchestrator configuration
- `api-config.json` — API server configuration
- `QUERY_SYSTEM.md` — This documentation
- `start-query-daemon.sh` — Start daemon script
- `stop-query-daemon.sh` — Stop daemon script
- `restart-query-daemon.sh` — Restart daemon script
- `status-query-daemon.sh` — Status check script

## Next Steps

1. **Initialize system:**
   ```bash
   node init-query-system.mjs --register-mcp
   ```

2. **Test CLI:**
   ```bash
   node unified-context-query.mjs query --text "system"
   ```

3. **Start daemons:**
   ```bash
   bash start-query-daemon.sh --with-api
   ```

4. **Test MCP:**
   - In Claude/Grok/Kimi, try: `@context_query query="system"`

5. **Test HTTP API:**
   ```bash
   curl http://localhost:3000/health
   ```

6. **Test Python SDK:**
   ```bash
   python3 query_sdk.py "system" "system,security"
   ```

## Support

For issues or questions:
1. Check logs: `~/.grok/hard-allow/query-engine.log`
2. Run diagnostics: `node init-query-system.mjs --check`
3. Review configuration: `query-config.json`, `api-config.json`
