# AGENTS.md

Guidance for coding agents working in this repository. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md).

## What this repository is

Agent Skills for Astro, in the [Agent Skills](https://agentskills.io/) format. The skills are documentation that other agents load, so accuracy matters more than volume.

```
skills/<name>/
  SKILL.md            entry point: frontmatter, core rules, routing table to references
  references/*.md     topic files, read on demand, one level deep
  skill-card.md       owner, use, risks, evidence
evals/
  matrix.json         agent x model x effort matrix for live evals
  grader.py           deterministic verifier run inside each trial container
  Dockerfile          trial image
  <name>/cases.json   eval cases for a skill
  <name>/fixtures/    small projects the cases start from
  <name>/solutions/   reference solution per case, used to verify the case
scripts/
  eval-matrix.mjs     live evals with Harbor (local only)
  dedup.mjs           SkillEvaluator Tier 2 (local only)
  lib/                shared helpers; lib/tasks.mjs turns cases into Harbor tasks
mise.toml             pinned tools and tasks
```

Generated and ignored: `.eval-tasks/` (Harbor tasks), `.eval-results/` (run results), `reports/`.

## Rules for editing skills

- Keep skill directories free of anything an agent does not need: no eval data, fixtures or scripts.
- Verify every API name, option, default and import path against the current official docs or the package source before writing it. Do not write Astro or Starlight details from memory; they change between releases.
- Add content only when it corrects something agents get wrong. Do not restate what a model already does correctly, and do not copy docs pages; link to them.
- Keep `SKILL.md` under about 150 lines. Critical rules and the outdated-patterns table stay in `SKILL.md`; detail goes in `references/`.
- State facts and give the reason. Avoid "ALWAYS" and "NEVER" in capitals, required step sequences for small edits, and templates with hard-coded paths the agent might copy over a project's own layout.
- Frontmatter uses `name`, `description`, `license` and `metadata` only. Keep `description` under 1,024 characters and write lists in block style.
- When a claim changes, update the eval case that covers it in `evals/<name>/cases.json`, or add one. A new case needs a reference solution, and `pnpm eval:verify` must pass for it.
- A change to `SKILL.md` or `references/` that changes behaviour needs a `metadata.version` bump in the skill and, for the plugin, in `.claude-plugin/plugin.json`.

## Commands

```sh
pnpm validate         # Agent Skills specification
pnpm eval:check       # eval cases, fixtures and matrix
pnpm eval:verify      # reference solutions score 1.0, untouched fixtures do not (Docker, no model calls)
pnpm check:tier1      # SkillEvaluator Tier 1 (needs skillevaluator and gitleaks installed)
pnpm check:tier2      # SkillEvaluator Tier 2 deduplication (calls a model provider)
pnpm eval:dry         # generate Harbor tasks and validate each job; no model calls
```

Each also runs as `mise run <name>`; `mise run check` runs the ones that need no model key.

Run `pnpm validate` and `pnpm eval:check` before finishing a change. Do not run `pnpm eval` or `pnpm check:tier2` unless asked: they call model providers with the maintainer's own keys and cost money. Never commit `.env.local` or print its values.
