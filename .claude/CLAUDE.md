
## Paperclip Agent Guardrails

These rules apply to all Paperclip-orchestrated agents (CTO and Engineer) working on this project.

### Prohibited Without Board Approval (create a GitHub issue labeled `board-direction`)
- Database schema migrations
- CI/CD pipeline modifications (GitHub Actions workflows, ArgoCD config)
- Dependency additions or upgrades (must justify in PR description; Board approves at merge)
- Changes to deployment configuration (Dockerfiles, K8s manifests)

### Prohibited Always
- `git push --force`, `git reset --hard`, `git clean`
- Deleting files not created by the agent in the same PR
- Modifying `.env` files or secrets
- Running commands with `sudo`
- Publishing packages (`npm publish`)
- Modifying this CLAUDE.md file

### Documentation Requirements
- CTO: Write a planning log to `docs/paperclip/planning-log/YYYY-MM-DD.md` after every heartbeat
- Engineer: Write an engineering log to `docs/paperclip/engineering-log/YYYY-MM-DD.md` after every heartbeat
- Both: All decision rationale must be documented — no undocumented changes

### Branch Naming
- All feature branches: `paperclip/YYYY-MM-DD-<task-slug>`
- Never commit directly to `main`

### PR Requirements
- Detailed description: what changed, why, test results
- Must pass full test suite before opening PR
- Must not introduce regressions
