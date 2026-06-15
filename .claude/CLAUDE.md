# verex

Claude Code configuration for the `verex` repo (pnpm / Turbo monorepo).

## Autonomous after-hours workflow (jay)

When jay asks for code changes and may be away (can't answer permission prompts in real time):

1. **Never commit directly to `main`.** First create a feature branch:
   `git switch -c claude/<short-topic>` (e.g. `claude/fix-login-redirect`).
2. Do the work and commit on that branch with clear, *why*-focused messages.
3. Push the branch and open a PR for review:
   `git push -u origin claude/<short-topic>` then `gh pr create --fill --base main`.
4. **Do not merge to `main` yourself** — leave the PR for jay to review and merge later.
5. Destructive commands (force-push, `reset --hard`, `clean`, `branch -D`, `rm`) still
   prompt by design — leave those for jay rather than working around them.

When done, summarize what changed and include the PR link.
