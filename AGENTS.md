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
    evals.json        eval cases (agentskills.io shape plus `project`, `file_checks`, `build_check`)
    config.yml        SkillEvaluator run policy
    grader.py         copy of scripts/grader.py; do not edit here
    files/            fixture projects staged into the trial workspace
    environment/      trial container image
evals/matrix.json     harness x model matrix for live evals (local only)
mise.toml             pinned tools and tasks
scripts/              grader source, grader sync, Tier 2 and Tier 3 runners
.skillevaluator/      reviewed security-scan exceptions (eval material only)
```

## Rules for editing skills

- Verify every API name, option, default and import path against the current official docs or the package source before writing it. Do not write Astro or Starlight details from memory; they change between releases.
- Add content only when it corrects something agents get wrong. Do not restate what a model already does correctly, and do not copy docs pages; link to them.
- Keep `SKILL.md` under about 150 lines. Critical rules and the outdated-patterns table stay in `SKILL.md`; detail goes in `references/`.
- State facts and give the reason. Avoid "ALWAYS" and "NEVER" in capitals, required step sequences for small edits, and templates with hard-coded paths the agent might copy over a project's own layout.
- Frontmatter uses `name`, `description`, `license` and `metadata` only. Keep `description` under 1,024 characters and write lists in block style.
- When a claim changes, update the eval case that covers it, or add one.
- A change to `SKILL.md` or `references/` that changes behaviour needs a `metadata.version` bump in the skill and, for the plugin, in `.claude-plugin/plugin.json`.

## Commands

```sh
pnpm validate         # Agent Skills specification
pnpm eval:validate    # eval dataset contract
pnpm check:grader     # grader copies match scripts/grader.py
pnpm check:tier1      # SkillEvaluator Tier 1 (needs skillevaluator and gitleaks installed)
pnpm check:tier2      # SkillEvaluator Tier 2 deduplication (calls a model provider)
pnpm eval:dry         # print the live-eval commands without running them
```

Each also runs as `mise run <name>`; `mise run check` runs all of the above that need no model key.

Run `pnpm validate`, `pnpm eval:validate` and `pnpm check:grader` before finishing a change. Do not run `pnpm eval` or `pnpm check:tier2` unless asked: it calls model providers with the maintainer's own keys and costs money. Never commit `.env.local` or print its values.

After editing `scripts/grader.py`, run `node scripts/sync-grader.mjs`.
