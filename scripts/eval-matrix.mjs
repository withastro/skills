#!/usr/bin/env node
// Runs the live evaluation (NVIDIA SkillEvaluator Tier 3) for each skill across
// the harness x model matrix in evals/matrix.json, then prints the skill's
// measured effect per model: with-skill score minus without-skill score.
//
// This is a local tool. Each maintainer uses their own provider keys, read
// from the shell environment or from a gitignored `.env.local` file in the
// repository root (see `.env.example`). Nothing here runs in CI.
//
// Usage:
//   node scripts/eval-matrix.mjs [options]
//
// Options:
//   --skill <name>       Skill directory name under skills/ (default: all skills)
//   --only <id,id>       Run only these matrix entry ids
//   --attempts <n>       Attempts per case (default: matrix.json `attempts`)
//   --max-cases <n>      Run only the first n cases (smoke run; not release evidence)
//   --env-mode <mode>    docker (default) or local
//   --dry-run            Print the commands without running them
//   --summary-only       Skip running; summarise results already in .eval-runs/
//   --strict             Exit 1 when a frontier entry regresses beyond the tolerance
//
// Entries whose route key is not set are skipped and reported as such.
// Live runs call model providers and cost money; see CONTRIBUTING.md.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fail, loadLocalEnv, providerEnv, root } from './lib/env.mjs';

const runsDir = join(root, '.eval-runs');
const matrix = JSON.parse(readFileSync(join(root, 'evals', 'matrix.json'), 'utf8'));

// Reasoning effort is fixed by SkillEvaluator for each agent and cannot be
// changed per run (as of SkillEvaluator 1.0.1). Shown in the summary so
// results are read with it in mind.
const AGENT_EFFORT = {
  'claude-code': 'medium (fixed)',
  codex: 'high (fixed)',
  opencode: 'provider default',
};

function routeFor(entry) {
  const route = matrix.routes[entry.route];
  if (!route) fail(`Matrix entry ${entry.id} uses unknown route: ${entry.route}`);
  return route;
}

// Environment and agent model argument for one entry.
function runSettings(entry) {
  const route = routeFor(entry);
  const settings = {
    SKILL_EVAL_LLM_PROVIDER: route.provider,
    SKILL_EVAL_LLM_MODEL: entry.judgeModel ?? route.judgeModel,
  };

  let agentModel = entry.model;
  if (route.provider === 'openai-compatible') {
    // An OpenAI-compatible gateway such as OpenRouter: SkillEvaluator reads the
    // shared URL and key, and OpenCode needs its `openai/` adapter prefix.
    settings.SKILL_EVAL_LLM_BASE_URL = route.baseUrl;
    settings.SKILL_EVAL_LLM_API_KEY = process.env[route.key] ?? '';
    if (entry.agent === 'opencode') agentModel = `openai/${entry.model}`;
  } else {
    settings[route.key] = process.env[route.key] ?? '';
  }
  const env = providerEnv(settings);
  return { route, env, agentModel };
}

function parseArgs(argv) {
  const options = { dryRun: false, summaryOnly: false, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) fail(`Missing value for ${arg}`);
      return next;
    };
    if (arg === '--skill') options.skill = value();
    else if (arg === '--only') options.only = value().split(',').map((id) => id.trim());
    else if (arg === '--attempts') options.attempts = Number(value());
    else if (arg === '--max-cases') options.maxCases = Number(value());
    else if (arg === '--env-mode') options.envMode = value();
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--summary-only') options.summaryOnly = true;
    else if (arg === '--strict') options.strict = true;
    else fail(`Unknown option: ${arg}`);
  }
  return options;
}

function listSkills() {
  const skillsDir = join(root, 'skills');
  return readdirSync(skillsDir).filter((name) => existsSync(join(skillsDir, name, 'evals', 'evals.json')));
}

// Newest file with the given name anywhere under dir, or undefined.
function findNewest(dir, fileName) {
  if (!existsSync(dir)) return undefined;
  let newest;
  const visit = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const stats = statSync(path);
      if (stats.isDirectory()) visit(path);
      else if (name === fileName && (!newest || stats.mtimeMs > newest.mtimeMs)) {
        newest = { path, mtimeMs: stats.mtimeMs };
      }
    }
  };
  visit(dir);
  return newest?.path;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function runEntry(skill, entry, options) {
  const { route, env, agentModel } = runSettings(entry);
  const missing = process.env[route.key] ? [] : [route.key];
  if (missing.length > 0 && !options.dryRun) {
    console.log(`\n== ${skill} / ${entry.id}: skipped, missing ${missing.join(', ')}`);
    return { status: 'skipped', reason: `missing ${missing.join(', ')}` };
  }

  const resultsDir = join(runsDir, skill, entry.id);
  const args = [
    'tier3',
    'evaluate',
    join('skills', skill),
    '--agents',
    entry.agent,
    '--agent-model',
    `${entry.agent}=${agentModel}`,
    '--env-mode',
    options.envMode ?? matrix.envMode,
    '--n-attempts',
    String(options.attempts ?? matrix.attempts),
    '--results-dir',
    relative(root, resultsDir),
  ];
  if (options.maxCases) args.push('--max-cases', String(options.maxCases));

  console.log(`\n== ${skill} / ${entry.id}`);
  console.log(`route: ${entry.route} (${route.key}), judge: ${env.SKILL_EVAL_LLM_MODEL}`);
  console.log(`skillevaluator ${args.join(' ')}`);
  if (options.dryRun) {
    if (missing.length > 0) console.log(`(would be skipped: missing ${missing.join(', ')})`);
    return { status: 'dry-run' };
  }

  mkdirSync(resultsDir, { recursive: true });
  const run = spawnSync('skillevaluator', args, { cwd: root, env, stdio: 'inherit' });
  if (run.error) return { status: 'error', reason: run.error.message };
  return { status: run.status === 0 ? 'completed' : 'failed', exitCode: run.status };
}

// Reads the with/without deltas SkillEvaluator wrote for one matrix entry.
function readLift(skill, entry) {
  const dir = join(runsDir, skill, entry.id);
  const lift = readJson(findNewest(dir, 'lift.json') ?? '');
  const custom = readJson(findNewest(dir, 'custom_lift.json') ?? '');
  if (!lift && !custom) return undefined;
  const pick = (source, metric) => source?.[metric];
  return {
    overall: pick(lift, 'overall'),
    fileChecks: pick(custom, 'file_checks'),
    astroBuild: pick(custom, 'astro_build'),
  };
}

function formatCell(metric) {
  if (!metric || typeof metric.delta !== 'number') return 'n/a';
  const sign = metric.delta > 0 ? '+' : '';
  return `${metric.without_skill.toFixed(2)} → ${metric.with_skill.toFixed(2)} (${sign}${metric.delta.toFixed(2)})`;
}

function summarise(skills, entries, statuses) {
  const lines = ['# Skill evaluation matrix', ''];
  const regressions = [];
  const tolerance = matrix.regressionTolerance ?? 0;

  for (const skill of skills) {
    lines.push(`## ${skill}`, '');
    lines.push('| Entry | Agent | Model | Effort | Tier | Overall (judged) | File checks | Astro build | Status |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const entry of entries) {
      const lift = readLift(skill, entry);
      const status = statuses.get(`${skill}/${entry.id}`);
      const statusText = status ? [status.status, status.reason].filter(Boolean).join(': ') : lift ? 'from disk' : 'no results';
      lines.push(
        `| ${entry.id} | ${entry.agent} | ${entry.model} | ${AGENT_EFFORT[entry.agent] ?? 'unknown'} | ${entry.tier} | ${formatCell(lift?.overall)} | ${formatCell(lift?.fileChecks)} | ${formatCell(lift?.astroBuild)} | ${statusText} |`,
      );
      if (entry.tier === 'frontier') {
        for (const [name, metric] of Object.entries({ 'file checks': lift?.fileChecks, 'astro build': lift?.astroBuild })) {
          if (metric && typeof metric.delta === 'number' && metric.delta < -tolerance) {
            regressions.push(`${skill} / ${entry.id}: ${name} ${metric.delta.toFixed(2)}`);
          }
        }
      }
    }
    lines.push('');
  }

  lines.push('Cells show without-skill → with-skill (difference). Scores are 0-1.');
  lines.push('File checks and Astro build are deterministic and comparable across every row.');
  lines.push('Overall is judged by the model named for that route in evals/matrix.json, so compare it within a harness only.');
  lines.push('Effort is the reasoning effort SkillEvaluator applies to the agent; it cannot be set per run.');
  lines.push('');
  if (regressions.length > 0) {
    lines.push('## Frontier regressions', '');
    for (const regression of regressions) lines.push(`- ${regression}`);
    lines.push('');
  }
  return { text: lines.join('\n'), regressions };
}

loadLocalEnv();
const options = parseArgs(process.argv.slice(2));
const skills = options.skill ? [options.skill] : listSkills();
for (const skill of skills) {
  if (!existsSync(join(root, 'skills', skill, 'evals', 'evals.json'))) fail(`No evals for skill: ${skill}`);
}
const entries = options.only ? matrix.entries.filter((entry) => options.only.includes(entry.id)) : matrix.entries;
if (entries.length === 0) fail('No matrix entries selected.');

const statuses = new Map();
if (!options.summaryOnly) {
  for (const skill of skills) {
    for (const entry of entries) statuses.set(`${skill}/${entry.id}`, runEntry(skill, entry, options));
  }
}

if (!options.dryRun) {
  const { text, regressions } = summarise(skills, entries, statuses);
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, 'summary.md'), text);
  console.log(`\n${text}`);
  console.log(`Summary written to ${relative(root, join(runsDir, 'summary.md'))}`);
  const failed = [...statuses.values()].some((status) => status.status === 'failed' || status.status === 'error');
  if (failed || (options.strict && regressions.length > 0)) process.exit(1);
}
