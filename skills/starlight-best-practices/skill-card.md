# Skill Card

## Description

starlight-best-practices gives coding agents the current Starlight configuration, authoring and customisation APIs to use when building documentation sites with Starlight.

This skill is ready for commercial/non-commercial use.

## Owner

Astro maintainers, through the [withastro/skills](https://github.com/withastro/skills) repository. Report problems in that repository's issue tracker.

## License/Terms of Use

[MIT](https://github.com/withastro/skills/blob/main/LICENSE)

## Use Case

Developers who use a coding agent (Claude Code, Codex, OpenCode or another Agent Skills compatible harness) in a project that depends on `@astrojs/starlight`. The agent loads the skill when editing the Starlight configuration, writing docs pages, overriding components, adding custom pages, theming with CSS or Tailwind, setting up i18n, writing Starlight plugins, or fixing a Starlight build error.

## Deployment Geography for Use

Global.

### Requirements / Dependencies
Requires API Key or External Credential: No
Credential Type(s): None

Do not include secrets in prompts/logs/output; use least-privilege credentials; rotate keys as appropriate.

The skill is instructions and reference documents only. It bundles no scripts that run in the user's project. It works without network access; when the Astro docs MCP server (`https://mcp.docs.astro.build/mcp`) is configured, the skill suggests using its `search_astro_docs` tool to look up APIs.

## Known Risks and Mitigations

Risk: The guidance describes Starlight 0.43 on Astro 7. Starlight is pre-1.0 and changes its configuration in minor releases, so after a new release some statements may be outdated.

Mitigation: The skill tells the agent to read the installed Starlight and Astro versions first and to look up APIs in the official docs when unsure. Each release of the skill is re-checked against the Starlight changelog, and the eval dataset builds its fixture projects against the current Starlight release.

Risk: The agent may apply an upgrade step (for example replacing a removed API) in a project that is intentionally pinned to an older Starlight version.

Mitigation: The skill instructs the agent to keep code valid for the installed version and to treat upgrading as a separate, explicitly requested task. Users should review proposed changes before accepting them.

Risk: The skill recommends running project commands such as `astro check`, `astro build`, `astro add` and `npx @astrojs/upgrade`, which install packages and modify project files.

Mitigation: These are the official Astro CLI commands. They run under the user's agent permission settings; users should keep command approval enabled for package installation.

Risk: When the docs MCP server is used, the agent's search queries are sent to that server.

Mitigation: Queries are API and feature names. The skill does not instruct the agent to send source code or secrets.

## References

- [Starlight documentation](https://starlight.astro.build/)
- [Starlight changelog](https://github.com/withastro/starlight/blob/main/packages/starlight/CHANGELOG.md)
- [Build with AI](https://docs.astro.build/en/guides/build-with-ai/)
- Scan and evaluation evidence: the "Skill checks" workflow runs in [withastro/skills](https://github.com/withastro/skills/actions) (NVIDIA SkillEvaluator Tier 1, including SkillSpector), and the evaluation cases in [`evals/starlight-best-practices/`](https://github.com/withastro/skills/tree/main/evals/starlight-best-practices)

## Skill Output

Output type(s): Guidance that shapes the agent's code edits, reviews and commands in the user's Starlight project.

Output format: The skill itself produces no files. The agent's output is source code (`.astro`, `.ts`, `.md`, `.mdx`, configuration files), shell commands and explanations.

Output parameters: Not applicable.

Other properties: No data is stored or transmitted by the skill.

## Skill Version

0.1.0. Signing is not yet set up; see the repository's release checklist.

## Ethical Considerations

The skill gives technical guidance only. Generated code should be reviewed by a developer before it is deployed, in particular changes that affect published documentation content.
