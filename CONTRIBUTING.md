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
mise install     # Node.js, pnpm, uv, Gitleaks, Harbor and SkillEvaluator at the pinned versions
mise tasks       # list the available tasks
mise run check   # every check that needs no model key
```

Without mise, install these yourself:

- Node.js 22 or later.
- [uv](https://docs.astral.sh/uv/) for the Python tools.
- For Tier 1 and Tier 2: `uv tool install --python 3.13 "skillevaluator[all]==1.0.1"` and [Gitleaks](https://github.com/gitleaks/gitleaks).
- For live evaluations: `uv tool install --python 3.13 harbor==0.27.0` and Docker.

No `npm install` is needed; the scripts have no dependencies. Every `pnpm <script>` below also works as `npm run <script>` or `mise run <script>`.

## Checks

| Command | What it does | Needs |
| --- | --- | --- |
| `pnpm validate` | Validates each skill against the Agent Skills specification | uv |
| `pnpm eval:check` | Validates the eval cases, fixtures and model matrix | Node.js |
| `pnpm check:harness` | Shows whether Claude Code, Codex, OpenCode and other harnesses load each skill | SkillEvaluator |
| `pnpm check:tier1` | Quality score and security scan (SkillSpector, Gitleaks, Bandit); reports go to `reports/tier1/` | SkillEvaluator, Gitleaks |
| `pnpm check:tier2` | Repeated content inside a skill and overlap between skills | SkillEvaluator, a provider key |
| `pnpm eval` | Live evaluation with and without each skill | Harbor, Docker, provider keys |

CI runs `validate` and `eval:check` in the Validate workflow, and Tier 1 in the Skill checks workflow, on every pull request. The checks that call model providers run on a maintainer's machine with their own keys, never in CI.

### How the tools fit together

| Question | Tool | Runs |
| --- | --- | --- |
| Is the skill well-formed, loadable and free of security findings? | [NVIDIA SkillEvaluator](https://github.com/NVIDIA/SkillEvaluator) Tier 1 | CI and locally |
| Does the skill repeat itself, and do the skills overlap? | SkillEvaluator Tier 2 | Locally |
| Does the skill change what an agent produces? | [Harbor](https://github.com/harbor-framework/harbor) | Locally |

SkillEvaluator has its own live evaluation (Tier 3), which is built on Harbor. This repository uses Harbor directly instead, because Tier 3 fixes the agent's reasoning effort and CLI version and requires the eval data to sit inside the skill directory, where it would be installed into users' projects.

If the Tier 1 scanner flags something in `SKILL.md` or `references/`, change the content or raise it in the pull request. There is no exceptions file.

### Tier 2: deduplication

```sh
pnpm check:tier2                                  # every skill, then overlap between skills
node scripts/dedup.mjs --skill astro-best-practices
node scripts/dedup.mjs --dry-run                  # print the commands only
```

Tier 2 needs an embeddings model and a chat model. It uses `OPENAI_API_KEY` if set, otherwise `OPENROUTER_API_KEY`; an Anthropic key alone is not enough, because Anthropic has no embeddings API. Reports are written to `reports/tier2/`.

The two skills are expected to be reported as similar at medium severity: both are Astro best-practice skills, and each description names the other as the place for out-of-scope work. Treat a high-severity overlap, or a "duplicate" verdict inside one skill, as something to fix.

## Evaluations

Each skill has eval cases in `evals/<name>/cases.json`. A case has a prompt, a fixture project from `evals/<name>/fixtures/`, and checks. Every case is run in a fresh container twice, once with the skill installed and once without, and the scores are compared.

Scoring is deterministic. `evals/grader.py` runs inside the container after the agent finishes and reports:

- `file_checks`: the share of the case's file checks that hold (regular expressions that must or must not match in the edited project);
- `astro_build`: whether `astro build` succeeds, for cases with `build_check`.

No language model judges the output. `expected_output` and `assertions` in a case describe the intended result for people reading the dataset; they are not scored.

### Writing a case

```json
{
  "id": "client-router",
  "prompt": "Enable Astro's client-side router with animated page transitions for every page of this Astro project.",
  "fixture": "astro-basic",
  "should_trigger": true,
  "expected_output": "The shared layout enables Astro's client router so navigation between pages is animated.",
  "assertions": ["The shared layout renders `<ClientRouter />` imported from `astro:transitions` inside `<head>`."],
  "build_check": true,
  "file_checks": [
    { "id": "client-router", "path": "src/layouts/Layout.astro", "contains": ["<ClientRouter"], "not_contains": ["ViewTransitions"] }
  ]
}
```

- Write the prompt the way a user would. Do not name the skill or hint at the answer; both arms get the same prompt, and the baseline must be able to succeed.
- `fixture` is a directory in `evals/<name>/fixtures/`. It becomes the agent's working directory, with dependencies installed and a git repository initialised.
- `file_checks` entries take `path` (a file or glob inside the project), and any of `exists: false`, `contains` and `not_contains` (lists of regular expressions). Check for what must be true of any correct solution; do not fail a valid alternative.
- Set `build_check` to `true` when the project should build afterwards.
- Set `should_trigger` to `false` for cases where the skill should not be used: an unrelated task and a near miss. Each skill needs at least one.
- Before adding a fixture, build it yourself against the current release, both in its starting state and with a correct solution applied.

Run `pnpm eval:check` after editing.

### Running live evaluations

Live evaluations run on your machine with your own provider keys. Put the keys you have in `.env.local` (gitignored; copy `.env.example`), or export them in your shell:

| Harness | Reaches models through | Key |
| --- | --- | --- |
| Claude Code | Anthropic API | `ANTHROPIC_API_KEY` |
| Codex | OpenAI API | `OPENAI_API_KEY` |
| OpenCode | OpenRouter | `OPENROUTER_API_KEY` |

Matrix entries whose key is missing are skipped, so one key is enough to start. Harbor also reads `.env.local` itself and uses the key that matches the model's provider.

Live runs cost money and take time. A trial takes a few minutes. A full matrix is two skills, ten cases, six entries, two arms and three attempts: 720 trials. Start small.

```sh
# Check everything without calling a model
pnpm eval:dry

# One entry, first two cases, one attempt: eight trials
node scripts/eval-matrix.mjs --skill astro-best-practices --only claude-code-haiku --max-cases 2 --attempts 1

# One case on every entry you have a key for
node scripts/eval-matrix.mjs --skill astro-best-practices --case legacy-project-upgrade

# Everything
node scripts/eval-matrix.mjs --strict

# Rebuild the summary from results already on disk
pnpm eval:summary
```

With mise, pass options after `--`: `mise run eval -- --only codex-luna --max-cases 2`.

The runner generates one Harbor task per case into `.eval-tasks/`, writes a job file per entry, and runs `harbor run`. Results go to `.eval-results/<skill>/<entry>/<timestamp>/`; `harbor view .eval-results/<skill>/<entry>` opens them in a browser, including each agent's full trajectory.

#### The model matrix

[`evals/matrix.json`](evals/matrix.json) lists the entries. Each harness has a small and a frontier model, because the question is whether a skill lifts a weaker model without making a stronger one worse.

| Entry | Harness | Model | Effort | Tier |
| --- | --- | --- | --- | --- |
| `claude-code-haiku` | Claude Code | `anthropic/claude-haiku-5-5` | medium | small |
| `claude-code-opus` | Claude Code | `anthropic/claude-opus-5-5` | high | frontier |
| `codex-luna` | Codex | `openai/gpt-6-luna` | medium | small |
| `codex-sol` | Codex | `openai/gpt-6.2-sol` | high | frontier |
| `opencode-gemini-hydrogen` | OpenCode | `openrouter/google/gemini-4-hydrogen` | default | small |
| `opencode-gemini-neon` | OpenCode | `openrouter/google/gemini-4-neon` | default | frontier |

To change it, edit `entries`:

- `model` is a Harbor model name: `anthropic/<id>`, `openai/<id>`, or `openrouter/<provider>/<id>` for any model on OpenRouter. With an `openrouter/` model, set `key` to `OPENROUTER_API_KEY`; this works for Claude Code and Codex entries too.
- `effort` is the agent's reasoning effort. Claude Code accepts `low`, `medium`, `high`, `xhigh` and `max`. Codex accepts `none`, `minimal`, `low`, `medium`, `high`, `xhigh` and `max`. OpenCode takes a variant name that the model defines. `null` leaves the agent's default.
- `version` (optional) pins the agent CLI version; without it Harbor installs the latest.
- To compare effort levels, add entries that differ only in `effort` and `id`.

Harbor validates these values; `pnpm eval:dry` reports a wrong effort or agent name without calling a model.

#### Reading the results

The summary is printed and written to `.eval-results/summary.md` and `summary.json`.

- **File checks** and **Astro build** show the baseline score, the with-skill score and the difference. They are deterministic and comparable across all rows.
- **Trials (errors)**: a trial with an error (a timeout, a provider failure) has no score. Look at the trial's `result.json` before trusting a row with errors.
- **Input tokens** and **Seconds** are per-trial means for each arm. A skill that changes no score but halves the tokens is still doing something.
- **Skill loaded** is the share of with-skill trials in which the agent loaded the skill, for cases where it should and for cases where it should not. It is read from the agent's recorded tool calls and is a heuristic: confirmed on an OpenCode trajectory, not yet on Claude Code or Codex.
- `--strict` exits non-zero when a frontier entry's score drops by more than `regressionTolerance`.

A partial run (`--max-cases`, `--case`) is for iteration. Use a full run as release evidence, and attach the summary to the release notes.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/), for example `feat(astro-best-practices): cover route caching` or `fix(starlight-best-practices): correct sidebar slug rule`.
