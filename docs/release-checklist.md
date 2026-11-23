# Release checklist

Steps for releasing a new version of a skill. Adapted from NVIDIA's [agent skill release checklist](https://docs.nvidia.com/skills/release-checklist).

## Before scanning

- [ ] The skill has a narrow, concrete purpose, stated in its `## Purpose` section.
- [ ] The `description` says when the skill should activate and where it should not.
- [ ] Every statement was checked against the current Astro or Starlight release. Record the versions checked in the pull request.
- [ ] Reference files exist for every link in `SKILL.md`, and nothing in `references/` is unused.
- [ ] `metadata.version` is bumped in `SKILL.md`, and `version` in `.claude-plugin/plugin.json` if the plugin changed.

## Scanning and evaluation

- [ ] `pnpm validate` and `pnpm eval:check` pass.
- [ ] The skill directory contains only `SKILL.md`, `references/` and `skill-card.md`.
- [ ] The Skill checks workflow (SkillEvaluator Tier 1) passes on the release commit. Download its report artifact.
- [ ] No critical or high finding is open. Medium findings in `SKILL.md` and `references/` are reviewed and either fixed or noted in the pull request.
- [ ] `pnpm check:tier2` (SkillEvaluator Tier 2) passes: no duplicated instructions inside the skill and no high-severity overlap with another skill.
- [ ] `pnpm check:harness` shows the skill loads in Claude Code, Codex and OpenCode.
- [ ] A full live evaluation was run locally for the skill (`node scripts/eval-matrix.mjs --skill <name>`), without `--max-cases`, covering at least one small and one frontier model. Note which matrix entries were skipped for lack of a key.
- [ ] For every frontier model, the deterministic scores with the skill are not lower than without it beyond the tolerance (`--strict` passes).
- [ ] For at least one small model, the skill improves the deterministic scores. If it does not, find out why before releasing: the content may be restating what models already know.
- [ ] The skill was loaded in most trials where it should be, and not in the cases marked `should_trigger: false`.
- [ ] The summary table from `.eval-results/summary.md` is attached to the release notes.

## Skill card

- [ ] `skill-card.md` describes the actual behaviour in one sentence.
- [ ] Owner, licence, use case and deployment geography are filled in.
- [ ] Each known risk has a specific mitigation.
- [ ] The version in the card matches `metadata.version`.

## Signing

Signing is not set up yet; it is tracked in the repository's issues. Until it is, this section is skipped and the skill card says so.

- [ ] Sign the exact directory that passed review, producing `skill.oms.sig` (OpenSSF Model Signing format).
- [ ] Publish the signature with the skill and document the expected signer identity.
- [ ] Verify the published artifact before announcing the release.

## Release

- [ ] Merge with a Conventional Commit message.
- [ ] Tag the release and publish release notes with: what changed, the Astro and Starlight versions checked, the evaluation summary, and a link to the Tier 1 report.
- [ ] Confirm `npx skills add withastro/skills` installs the new version.
