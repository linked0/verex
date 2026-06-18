# MCP Interface

**Goal:** expose Verex to AI agents via an MCP server — the canonical agent interface.

## Status
Not started. Scaffold + 2 read tools planned in S3; ADR `0001-mcp-server-as-canonical-agent-interface.md`.

## Design
- **Read tools (S3):** `list_markets`, `get_market`.
- **Write tools (S8):** `buy_yes/no`, `claim` — via session keys (depends on AA, S7).

## Open questions
- Promote the MCP scaffold earlier? (A recent commit hints "MCP as canonical interface" → Phase 1.)

## Features
- [ ] **MCP scaffold + read tools (S3)**
  - [ ] `packages/mcp-server` scaffold
  - [ ] `list_markets`, `get_market`; ADR 0001
- [ ] **Write tools (S8)**
  - [ ] `buy_yes/no`, `claim` via session keys (needs AA)
