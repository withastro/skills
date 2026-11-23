# Contributing

Thanks for helping improve the Astro skills. This guide covers how skills are written here, how they are tested, and how to run the checks.

## What makes a good change

Research on agent skills is consistent on one point: most skills have no measurable effect, and long ones can make agents worse. A skill helps when it supplies something the agent would otherwise get wrong. So in this repository:

- **Start from an observed failure.** A good addition begins with "the agent wrote X, the correct code is Y". If a current model already gets it right without the skill, leave it out.
- **Verify against the source.** Check every API name, option and default against the official docs or the package source for the current release. Astro and Starlight change quickly; memory is not a source.
- **Keep it short.** `SKILL.md` holds the rules that prevent failures and a table that routes to reference files. Detail lives in `references/`, which agents read only when needed.
- **Point to the docs, do not copy them.** Copied documentation drifts. Link to the page.
- **Explain why.** A rule with its reason generalises better than an instruction in capitals.
- **Add or update an eval case** for behaviour you change.

## Repository layout

See the tree in [AGENTS.md](AGENTS.md).

## Setup

With [mise](https://mise.jdx.dev/) (recommended):

```sh
mise install     # Node.js, pnpm, uv, Gitleaks and SkillEvaluator at the pinned versions
mise tasks       # list the available tasks
mise run check   # every check that needs no model key
```

Without mise, install these yourself:

- Node.js 22 or later.
- [uv](https://docs.astral.sh/uv/) for the Python tools.
- For the security and live evaluation checks: `uv tool install --python 3.13 "skillevaluator[all]==1.0.1"` and [Gitleaks](https://github.com/gitleaks/gitleaks).

Live evaluations also need Docker.

No `npm install` is needed; the scripts have no dependencies. Every `pnpm <script>` below also works as `npm run <script>` or `mise run <script>`.

## Checks

| Command | What it does | Needs |
| --- | --- | --- |
| `pnpm validate` | Validates each skill against the Agent Skills specification | uv |
| `pnpm eval:validate` | Validates each eval dataset, config, grader and Dockerfile | SkillEvaluator |
| `pnpm check:grader` | Confirms each skill's `evals/grader.py` matches `scripts/grader.py` | Node.js |
| `pnpm check:harness` | Shows whether Claude Code, Codex, OpenCode and other harnesses load each skill | SkillEvaluator |
| `pnpm check:tier1` | Quality score and security scan (SkillSpector, Gitleaks, Bandit); reports go to `reports/tier1/` | SkillEvaluator, Gitleaks |

CI runs the first three in the Validate workflow and Tier 1 in the Skill checks workflow on every pull request.

### The three SkillEvaluator tiers

| Tier | Question | How it runs here |
| --- | --- | --- |
| 1: Validation | Is the skill well-formed, loadable and free of security findings? | CI on every pull request, and `pnpm check:tier1` locally. No model key. |
| 2: Deduplication | Does the skill repeat itself, and do the skills overlap? | `pnpm check:tier2` locally, with your own key. |
| 3: Live evaluation | Does the skill change what an agent produces? | `pnpm eval` locally, with your own keys. See [Evaluations](#evaluations). |

Tiers 2 and 3 call model providers, so they run on a maintainer's machine and not in CI.

### Tier 2: deduplication

```sh
pnpm check:tier2                                  # every skill, then overlap between skills
node scripts/dedup.mjs --skill astro-best-practices
node scripts/dedup.mjs --dry-run                  # print the commands only
```

Tier 2 needs an embeddings model and a chat model. It uses `OPENAI_API_KEY` if set, otherwise `OPENROUTER_API_KEY`; an Anthropic key alone is not enough, because Anthropic has no embeddings API. Reports are written to `reports/tier2/`.

The two skills are expected to be reported as similar at medium severity: both are Astro best-practice skills, and each description names the other as the place for out-of-scope work. Treat a high-severity overlap, or a "duplicate" verdict inside one skill, as something to fix.

### Security scan exceptions

Tier 1 scans everything in a skill directory, including `evals/`. The fixture projects, the grader and the trial Dockerfile trigger findings that are expected for test material (caret dependency ranges, a subprocess call that runs `astro build`). These are recorded as reviewed exceptions in `.skillevaluator/baselines/eval-fixtures.yaml`. Every rule there is limited to `evals/` paths.

Do not add an exception for `SKILL.md` or `references/`. If the scanner flags skill content, change the content, or raise it in the pull request.

In pull requests, CI reads the exceptions from the target branch. A pull request that edits them is still scanned with the old ones.

## Evaluations

Each skill has an eval dataset in `skills/<name>/evals/evals.json`. A case has a prompt, a fixture project from `evals/files/`, an expected outcome, and assertions. Cases are run twice, once with the skill installed and once without, and the scores are compared.

Scores come from two places:

- **Judged dimensions** from SkillEvaluator's standard graders, which use a language model.
- **Deterministic checks** from `scripts/grader.py`: `file_checks` (regular expressions that must or must not match in the edited project) and `astro_build` (whether `astro build` succeeds). These do not depend on a judge.

### Writing a case

```json
{
  "id": "client-router",
  "prompt": "Enable Astro's client-side router with animated page transitions for every page of the Astro project at input/astro-basic.",
  "expected_output": "The shared layout enables Astro's client router so navigation between pages is animated.",
  "expected_skill": "astro-best-practices",
  "files": ["files/astro-basic"],
  "project": "astro-basic",
  "build_check": true,
  "assertions": ["The shared layout renders `<ClientRouter />` imported from `astro:transitions` inside `<head>`."],
  "file_checks": [
    { "id": "client-router", "path": "src/layouts/Layout.astro", "contains": ["<ClientRouter"], "not_contains": ["ViewTransitions"] }
  ]
}
```

- Write the prompt the way a user would. Do not name the skill or hint at the answer; both arms get the same prompt, and the baseline must be able to succeed.
- Describe outcomes in `expected_output` and `assertions`, not "the agent read the skill".
- `files` lists fixture paths relative to `evals/`. They are staged at `input/<name>` in the agent's working directory. `project` is that name.
- `file_checks` entries take `path` (a file or glob inside the project), and any of `exists: false`, `contains` and `not_contains` (lists of regular expressions). Check for what must be true of any correct solution; do not fail a valid alternative.
- Set `build_check` to `true` when the project should build afterwards.
- Include negative cases with `"expected_skill": null` and `"should_trigger": false`: an unrelated task and a near miss.
- Before adding a fixture, build it yourself against the current release, both in its starting state and with a correct solution applied.

Run `pnpm eval:validate` after editing.

### Running live evaluations

Live evaluations run on your machine with your own provider keys. They are not part of CI, so no keys are stored in the repository settings.

Put the keys you have in `.env.local` (gitignored; copy `.env.example`), or export them in your shell:

| Harness | Reaches models through | Key |
| --- | --- | --- |
| Claude Code | Anthropic API | `ANTHROPIC_API_KEY` |
| Codex | OpenAI API | `OPENAI_API_KEY` |
| OpenCode | OpenRouter | `OPENROUTER_API_KEY` |

Matrix entries whose key is missing are skipped, so one key is enough to start. Each run is given only the key its route needs.

Live runs cost money. A full matrix is two skills, ten cases, six harness and model combinations, two arms and three attempts: several hundred agent runs. Start small.

```sh
# See what would run
pnpm eval:dry

# One harness and model, first two cases, one attempt
node scripts/eval-matrix.mjs --skill astro-best-practices --only claude-code-haiku --max-cases 2 --attempts 1

# Everything for which a key is set
node scripts/eval-matrix.mjs

# Rebuild the summary from results already on disk
pnpm eval:summary
```

With mise, pass options after `--`: `mise run eval -- --only codex-luna --max-cases 2`.

#### The model matrix

The matrix is defined in [`evals/matrix.json`](evals/matrix.json). Each harness has a small and a frontier model, because the question is whether a skill lifts a weaker model without making a stronger one worse.

| Entry | Harness | Model | Tier |
| --- | --- | --- | --- |
| `claude-code-haiku` | Claude Code | `claude-haiku-5-5` | small |
| `claude-code-opus` | Claude Code | `claude-opus-5-5` | frontier |
| `codex-luna` | Codex | `gpt-6-luna` | small |
| `codex-sol` | Codex | `gpt-6.2-sol` | frontier |
| `opencode-gemini-hydrogen` | OpenCode | `google/gemini-4-hydrogen` | small |
| `opencode-gemini-neon` | OpenCode | `google/gemini-4-neon` | frontier |

To change the models, edit `entries`. An entry names an `agent`, a `route` and a `model`. OpenCode on the `openrouter` route accepts any OpenRouter model ID, so a model from another provider can be added there without a new key. `routes` holds the provider, key name and judge model for each route.

Reasoning effort is not configurable. SkillEvaluator 1.0.1 fixes it per agent (Codex `high`, Claude Code `medium`, OpenCode the provider default) and has no option to override it. The summary table shows the effort that applied.

The Claude Code and Codex model IDs are given in each provider's native form. None of the six entries has been run with real keys from this repository yet; if a provider rejects an ID, `skillevaluator models` lists the IDs your key can use.

#### Reading the results

Results are written to `.eval-runs/` (not committed), with a table in `.eval-runs/summary.md`. `--strict` exits non-zero when a frontier model's deterministic score drops by more than `regressionTolerance`.

- `File checks` and `Astro build` are deterministic and comparable across all rows.
- `Overall (judged)` uses a judge model fixed per route. Compare it between the small and frontier rows of one harness, not across harnesses.
- A partial run (`--max-cases`) is for iteration. Use a full run as release evidence, and attach the summary to the release notes.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/), for example `feat(astro-best-practices): cover route caching` or `fix(starlight-best-practices): correct sidebar slug rule`.
