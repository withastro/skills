# Astro Skills

Official [Agent Skills](https://agentskills.io/) for building with [Astro](https://astro.build/). They give coding agents the current Astro and Starlight APIs, so the agent does not fall back on patterns from older releases.

| Skill | Use it for |
| --- | --- |
| [`astro-best-practices`](skills/astro-best-practices/SKILL.md) | Writing, reviewing and upgrading Astro 7 projects: components and islands, content collections, rendering and routing, actions, sessions, environment variables, Markdown, images |
| [`starlight-best-practices`](skills/starlight-best-practices/SKILL.md) | Starlight documentation sites: configuration, sidebar, authoring, component overrides, custom pages, theming, i18n, plugins |

## Install

With the [`skills`](https://skills.sh/) CLI, for any supported agent:

```sh
npx skills add withastro/skills
```

As a Claude Code plugin, which also configures the [Astro docs MCP server](https://docs.astro.build/en/guides/build-with-ai/):

```
/plugin marketplace add withastro/skills
/plugin install astro@astro
```

The skills work without the MCP server. When it is available, they use it to look up APIs in the official docs.

## How the skills are built

Each skill is a short `SKILL.md` that lists the removed and renamed APIs agents most often get wrong, plus a few reference files the agent reads only when the task needs them. The skills point to the official docs instead of copying them.

Every skill ships with:

- `skill-card.md`: owner, intended use, risks and evidence.
- `evals/`: an evaluation dataset with small fixture projects. Each case is run with and without the skill to measure what the skill changes.

## Checks

| Check | What it covers | When |
| --- | --- | --- |
| Validate | Agent Skills specification, eval dataset contract | Every pull request |
| Skill checks | [NVIDIA SkillEvaluator](https://github.com/NVIDIA/SkillEvaluator) Tier 1: quality score, harness compatibility, security scanning with SkillSpector and Gitleaks | Every pull request |
| Deduplication | SkillEvaluator Tier 2: repeated instructions inside a skill and overlap between skills | Locally, by maintainers with their own provider keys |
| Evals | SkillEvaluator Tier 3: with-skill versus without-skill runs on Claude Code, Codex and OpenCode, with a small and a frontier model each | Locally, by maintainers with their own provider keys |

The repository is set up for [mise](https://mise.jdx.dev/): `mise install` provides the tools and `mise run check` runs every check that needs no model key.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to run them and how to change a skill, and [docs/release-checklist.md](docs/release-checklist.md) for the release steps.

## License

[MIT](LICENSE)
