#!/usr/bin/env node
// Tier 2 (NVIDIA SkillEvaluator deduplication), run locally with your own key:
//   1. repeated or redundant instructions inside each skill, and
//   2. overlap between the skills in this repository.
//
// Tier 2 needs an embeddings model and a chat model. The first key found is
// used: OPENAI_API_KEY (OpenAI directly), then OPENROUTER_API_KEY (OpenRouter).
// Anthropic has no embeddings API, so ANTHROPIC_API_KEY alone is not enough.
// Keys are read from the shell or from .env.local.
//
// Usage: node scripts/dedup.mjs [--skill <name>] [--dry-run]
// Reports are written to reports/tier2/.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fail, loadLocalEnv, providerEnv, root } from './lib/env.mjs';

loadLocalEnv();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skillIndex = args.indexOf('--skill');
const onlySkill = skillIndex >= 0 ? args[skillIndex + 1] : undefined;
if (skillIndex >= 0 && !onlySkill) fail('Missing value for --skill');

function providerSettings() {
  if (process.env.OPENAI_API_KEY) {
    return {
      label: 'OpenAI (OPENAI_API_KEY)',
      settings: {
        SKILL_EVAL_LLM_PROVIDER: 'openai',
        SKILL_EVAL_LLM_MODEL: 'gpt-6-luna',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
    };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      label: 'OpenRouter (OPENROUTER_API_KEY)',
      settings: {
        SKILL_EVAL_LLM_PROVIDER: 'openai-compatible',
        SKILL_EVAL_LLM_BASE_URL: 'https://openrouter.ai/api/v1',
        SKILL_EVAL_LLM_API_KEY: process.env.OPENROUTER_API_KEY,
        SKILL_EVAL_LLM_MODEL: 'openai/gpt-6-luna',
        SKILL_EVAL_EMBEDDING_PROVIDER: 'openai-compatible',
        SKILL_EVAL_EMBEDDING_MODEL: 'openai/text-embedding-3-small',
      },
    };
  }
  return undefined;
}

const skillsDir = join(root, 'skills');
const skills = readdirSync(skillsDir).filter((name) => existsSync(join(skillsDir, name, 'SKILL.md')));
if (onlySkill && !skills.includes(onlySkill)) fail(`Unknown skill: ${onlySkill}`);

const commands = [];
for (const skill of onlySkill ? [onlySkill] : skills) {
  commands.push({
    title: `repeated content inside ${skill}`,
    args: ['tier2', join('skills', skill), '-r', 'cli,json,html', '-o', join('reports', 'tier2', skill)],
  });
}
if (!onlySkill && skills.length > 1) {
  commands.push({
    title: 'overlap between skills',
    args: ['similarity-check', 'skills', '-r', 'cli,json,html', '-o', join('reports', 'tier2', 'collection')],
  });
}

const provider = providerSettings();
if (!provider && !dryRun) {
  fail('Tier 2 needs OPENAI_API_KEY or OPENROUTER_API_KEY (in the shell or .env.local). Nothing was run.');
}
console.log(`Provider: ${provider ? provider.label : 'none set (dry run)'}`);

let failed = false;
for (const command of commands) {
  console.log(`\n== ${command.title}`);
  console.log(`skillevaluator ${command.args.join(' ')}`);
  if (dryRun) continue;
  const run = spawnSync('skillevaluator', command.args, {
    cwd: root,
    env: providerEnv(provider.settings),
    stdio: 'inherit',
  });
  if (run.error) fail(run.error.message);
  if (run.status !== 0) failed = true;
}
if (failed) process.exit(1);
