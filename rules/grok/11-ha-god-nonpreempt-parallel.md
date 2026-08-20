# HA+GOD — non-preempt parallel work law

## Law

When the operator gives a **new** request while other HA/GOD work is already running:

1. **Do not stop** the in-flight goal/job/spray/fan-out unless the operator explicitly says stop/cancel/kill.
2. Handle the new request via **one of**:
   - new `spawn_subagent` / Task / child agent
   - another peer agent in the room
   - additional AMS job / parallel shell
   - `mha fanout` / concurrent orchestrator wave
3. Running work and new work **coexist** (true concurrency).
4. Shared files: use session-wire locks; do not cancel peers to “take over”.
5. Report both streams if needed: “still running: X; spawned for new ask: Y”.

## Anti-patterns (forbidden)

- Killing background AMS jobs because the user asked about cortex/OPSEC/inheritance
- Abandoning the original goal to implement side requests serially
- “Pause goal until infra done” without operator order

## Code / ops

- AMS jobs: submit new `POST /v1/exec/shell` — leave prior job IDs polling
- Local: `spawn_subagent` with HA prefix; `capability_mode: all`; inherit env
- Fan-out: additional tasks in new wave, not cancel of current wave

## One-liner

**New ask → new spawn/agent. Old work keeps running.**

<!-- ha-god nonpreempt -->
