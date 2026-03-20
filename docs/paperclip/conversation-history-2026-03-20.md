# Paperclip Orchestration — Conversation History

**Date:** 2026-03-20
**Session ID:** 37b984d7-2a0b-4340-ab19-3ca39dcd1934
**To resume:** `cd /Users/dg/lab/microsaas/paperclip && claude --resume 37b984d7-2a0b-4340-ab19-3ca39dcd1934`

---

## Phase 1: Research & Discovery

### Paperclip Overview
- Explored https://paperclip.ing/ and https://github.com/paperclipai/paperclip
- Paperclip is an open-source AI company orchestration platform (MIT license, 30k stars, 3 weeks old)
- Coordinates AI agents (Claude Code, Codex, Cursor, etc.) into org chart structures
- Features: heartbeats, task management, budgets, governance, audit logs
- `claude_local` adapter invokes Claude Code CLI — works with Max subscription at no extra API cost

### Project Analysis
Explored three projects for orchestration:

**Beacon (screener-automation):**
- Autonomous value research engine, scores ~5,300 Indian listed companies
- TypeScript monorepo (shared, scraper, analyzer, dashboard), ~8,000 LOC
- Feature-complete but 0% test coverage, 8 error handling gaps
- Deployed via GitHub Actions -> ArgoCD -> K3s homelab
- Ideal first target: well-defined mechanical backlog (M12 testing, M13 error handling)

**CallKaro (hyperlocal-discovery):**
- Voice AI agent calling retail shops in Hindi for price quotes
- Python, LiveKit, Sarvam AI STT/TTS, Claude Haiku LLM
- Alpha to Beta maturity, 188 unit + 26 live tests
- Needs: latency optimization, SIP hardening, category expansion

**AI Receptionist (microsaas/ai_receptionist):**
- AI phone receptionist for Indian SMBs, answers inbound calls 24/7
- Built on CallKaro codebase, ~40-50% complete for MVP launch
- Needs: business onboarding, SIP routing, calendar integration

---

## Phase 2: Brainstorming & Design

### Key Decisions Made

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Autonomy level | Autonomous development with PR-gated review | DG stays informed and can steer direction |
| Cost model | Claude Max subscription (no per-token cost) | Already paying for Max; schedule during off-peak |
| Review workflow | PR-gated — nothing merges without DG approval | Safety for early-stage autonomous development |
| Communication | GitHub-native (PRs + issues) | Zero additional infrastructure; natural paper trail |
| Agent structure | CTO (Opus) + Engineer (Opus) per project | CTO plans/reviews, Engineer codes/tests; clean separation |
| CTO-Engineer handoff | Variable detail per complexity | CTO's judgment: detailed specs for complex, goal-level for obvious |
| Vision alignment | Live conversation first, then task system ongoing | Rich back-and-forth for initial vision; async for ongoing |
| Rollout | Graduated: Beacon first, then CallKaro, then AI Receptionist | De-risk with mechanical backlog before nuanced work |
| Heartbeat schedule | Session-reset-triggered, 2 cycles/day (10pm + 8am IST) | Maximize token availability during off-peak hours |
| Both agents | Write extensive documentation for everything | Complete paper trail of all decisions and actions |

### Future Features (documented, not built)
- Daily WhatsApp summary of agent activity
- Auto-merge for mechanical changes (tests, lint, docs)

---

## Phase 3: Design Spec

Written and committed to:
`/Users/dg/lab/microsaas/paperclip/docs/superpowers/specs/2026-03-20-paperclip-orchestration-design.md`

### Spec Review Results
Reviewed by code-reviewer subagent. Key issues found and fixed:
- Added Task Structure subsection (Paperclip task model, priority ordering, granularity guideline)
- Added Agent Guardrails (prohibited operations, CLAUDE.md enforcement)
- Fixed Engineer heartbeat flow (check open PRs first, address feedback before new work)
- Made Engineer heartbeat conditional on CTO completion (not fixed 30-min offset)
- Graduated performance guardrails (Phase 1: basic tests, Phase 2+: benchmarks)
- Corrected Beacon CI claim (no test gate exists yet — added as first task)
- Added Health Monitoring (scheduler logs, 24-hour stale alerts)
- Added Rollback Procedure
- Added Pre-Build Verification checklist

---

## Phase 4: Implementation Plan

Written to:
`/Users/dg/lab/microsaas/paperclip/docs/superpowers/plans/2026-03-20-paperclip-phase1-beacon.md`

### 10 Tasks:
1. Install and Verify Paperclip (interactive)
2. Prepare Beacon project for agent work (file creation)
3. Write CTO agent instructions (file creation)
4. Write Engineer agent instructions (file creation)
5. Create Beacon company and agents in Paperclip (API calls)
6. Build the scheduler script (Python code)
7. Vision alignment — live CTO session (interactive)
8. Seed backlog and run first manual heartbeat (testing)
9. Enable automated scheduling (process management)
10. Final commit and wrap-up

### Plan Review Results
Reviewed by code-reviewer subagent. Key fixes applied:
- Fixed `python3` -> `bash` for shell script invocation
- Added `scheduler/__init__.py` for Python package imports
- Added `.gitignore` (venv/, logs/, __pycache__/)
- Fixed double-night-cycle bug (timestamp tracking vs boolean flags)
- Fixed log timestamp parsing (ISO 8601 with IST)
- Added duplicate alert protection
- Added graceful shutdown signal handling
- Rate-limit check uses Haiku (cheapest) instead of Opus
- Added CI gate task to seeded backlog
- Added Paperclip API endpoints to agent instructions
- Model identifiers: use `opus` alias, not `claude-opus-4-6`

---

## Phase 5: Execution (In Progress)

### Completed Tasks:
- **Task 2:** Created docs/paperclip/ directory structure and .claude/CLAUDE.md guardrails in beacon-paperclip
- **Tasks 3+4:** Created CTO and Engineer agent instruction files
- **Tasks 5+6:** Created setup-beacon.sh, trigger-heartbeat.sh, and full scheduler package (config.py, scheduler.py, __init__.py, requirements.txt). Python venv set up with requests installed.

### Worktree Setup:
- DG requested testing in isolation — not on the real beacon project
- Created git worktree: `/Users/dg/lab/beacon-paperclip/` on branch `paperclip/setup`
- Original `/Users/dg/lab/screener-automation/` remains clean on `main`
- All config and scripts updated to point to `beacon-paperclip`

### Remaining Tasks:
- **Task 1:** Install Paperclip (`npx paperclipai onboard --yes`) — waiting on DG
- **Task 5 execution:** Run setup-beacon.sh (needs Paperclip running)
- **Task 7:** Vision alignment (live CTO conversation)
- **Task 8:** Seed backlog + first manual heartbeat
- **Tasks 9-10:** Enable scheduling + wrap-up

---

## Key Files Created

```
/Users/dg/lab/microsaas/paperclip/
├── .gitignore
├── agents/
│   ├── cto-instructions.md
│   └── engineer-instructions.md
├── scheduler/
│   ├── __init__.py
│   ├── config.py
│   ├── scheduler.py
│   └── requirements.txt
├── scripts/
│   ├── setup-beacon.sh
│   └── trigger-heartbeat.sh
├── venv/
├── logs/
└── docs/superpowers/
    ├── specs/2026-03-20-paperclip-orchestration-design.md
    └── plans/2026-03-20-paperclip-phase1-beacon.md

/Users/dg/lab/beacon-paperclip/ (worktree on paperclip/setup branch)
├── docs/paperclip/
│   ├── VISION.md (placeholder)
│   ├── decisions/.gitkeep
│   ├── planning-log/.gitkeep
│   ├── engineering-log/.gitkeep
│   └── reviews/.gitkeep
└── .claude/CLAUDE.md (agent guardrails)
```
