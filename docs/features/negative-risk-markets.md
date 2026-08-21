# Negative-Risk (Multi-Outcome) Markets

**Goal:** support capital-efficient **multi-outcome** events (only one outcome wins) via the
**negative-risk** mechanism — relating positions across all outcomes through a conversion op.

> Builds on Verex's existing Polymarket CTF backbone — adopts Polymarket's **Neg Risk Adapter**
> + **Neg Risk CTF Exchange** rather than re-inventing them.

> **Scope note:** neg risk applies to **mutually exclusive** events only. For the wider
> question of *which* event types force the outcome probabilities to sum to 100% — and the
> nested / multi-winner groups where they legitimately don't — see
> [market-groups.md](market-groups.md).

## Why
Verex currently does **binary YES/NO** markets. For an N-outcome event (e.g. "Who wins the
election?"), independent binary markets are capital-inefficient: buying one outcome's **No** has
no relationship to the others. Negative risk makes **"bet against A" ≡ "bet for all others."**

## How it works (Polymarket model)
- A **No share** in any market → convertible into **1 Yes share in every other market** in the event.
- The conversion is **atomic**, through the **Neg Risk Adapter** contract (over the CTF stack):
  hold 1 No(A) → call `convert` → receive 1 Yes for every other outcome.
- Neg-risk events use **different contracts** (Neg Risk Adapter + Neg Risk CTF Exchange).
- Orders set **`negRisk: true`** in the order options (SDK/CLI), and the API exposes a `negRisk`
  boolean on events/markets.

## Augmented negative risk (outcomes can emerge later)
For races where new outcomes appear after launch (e.g. a new candidate):
- **Named** outcomes (known) · **Placeholder** slots (clarified later via a bulletin board) ·
  **Explicit "Other"** (catches anything unnamed).
- **Trading rule:** only trade **named** outcomes; ignore placeholders until named; the "Other"
  definition narrows as placeholders are assigned — don't trade it directly.
- Flags: `enableNegRisk: true` + `negRiskAugmented: true`; SDK option is always `negRisk: true`.

## Adaptation to Verex
- **Contracts:** import Polymarket's Neg Risk Adapter + Neg Risk CTF Exchange (like the existing
  `ctf-exchange` submodule).
- **SDK/CLI:** add the `negRisk` order option to sign/fill; expose a `convert` command.
- **API/indexer:** surface `negRisk` on markets/events; index conversion events.
- **Web:** multi-outcome market UI.

## Open questions
- Standard neg risk only, or **augmented** (placeholders) too?
- Roadmap placement — needs the v2 CTF backbone stable first (post-S2).
- Condition/`questionId` design for multi-outcome vs binary.

## Features
- [ ] **Neg Risk contracts** — import the Neg Risk Adapter + Neg Risk CTF Exchange
- [ ] **Conversion op** — No(A) → Yes(every other outcome), atomic via the adapter
- [ ] **Multi-outcome market creation** — N-outcome events on the CTF stack
- [ ] **SDK/CLI `negRisk` support** — order option + a `convert` command
- [ ] **API / web** — `negRisk` flag + multi-outcome UI
- [ ] **Augmented neg risk** (optional) — named / placeholder / Other + bulletin-board clarification
- [ ] (you) Decide standard vs augmented; roadmap placement

## Resources
- Neg Risk Adapter: <https://github.com/Polymarket/neg-risk-ctf-adapter>
- Polymarket docs — Negative Risk Markets (pasted reference)
