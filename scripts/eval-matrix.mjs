#!/usr/bin/env node
// Live evaluation with Harbor (https://github.com/harbor-framework/harbor).
//
// For each skill and each entry of evals/matrix.json (an agent harness, a
// model and a reasoning effort), every eval case is run in a fresh container
// twice: once with the skill installed and once without. The deterministic
// grader scores both, and this script prints the difference.
//
// This is a local tool. Each maintainer uses their own provider keys, read
// from the shell environment or from a gitignored `.env.local` file in the
// repository root (see `.env.example`). Nothing here runs in CI.
//
// Usage:
//   node scripts/eval-matrix.mjs [options]
//
// Options:
//   --skill <name>       Skill to evaluate (default: every skill with cases)
//   --only <id,id>       Run only these matrix entry ids
//   --case <id,id>       Run only these case ids
//   --max-cases <n>      Run only the first n cases (smoke run; not release evidence)
//   --attempts <n>       Attempts per case and arm (default: matrix.json `attempts`)
//   --concurrency <n>    Trials run at once (default: matrix.json `concurrency`)
//   --check              Validate the datasets and matrix, then exit. No model calls
//   --dry-run            Generate tasks and validate each job with Harbor. No model calls
//   --summary-only       Skip running; summarise results already in .eval-results/
//   --strict             Exit 1 when a frontier entry regresses beyond the tolerance
//
// Entries whose key is not set are skipped and reported as such.
// Live runs call model providers and cost money; see CONTRIBUTING.md.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fail, loadLocalEnv, providerEnv, root } from './lib/env.mjs';
import { buildTasks, listSkills, loadCases, validateSkill } from './lib/tasks.mjs';

const resultsDir = join(root, '.eval-results');
const matrix = JSON.parse(readFileSync(join(root, 'evals', 'matrix.json'), 'utf8'));
const METRICS = ['file_checks', 'astro_build', 'reward'];

function parseArgs(argv) {
  const options = { check: false, dryRun: false, summaryOnly: false, strict: false };
  const list = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) fail(`Missing value for ${arg}`);
      return next;
    };
    if (arg === '--skill') options.skill = value();
    else if (arg === '--only') options.only = list(value());
    else if (arg === '--case') options.cases = list(value());
    else if (arg === '--max-cases') options.maxCases = Number(value());
    else if (arg === '--attempts') options.attempts = Number(value());
    else if (arg === '--concurrency') options.concurrency = Number(value());
    else if (arg === '--check') options.check = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--summary-only') options.summaryOnly = true;
    else if (arg === '--strict') options.strict = true;
    else fail(`Unknown option: ${arg}`);
  }
  return options;
}

function validateMatrix() {
  const problems = [];
  const ids = new Set();
  for (const entry of matrix.entries ?? []) {
    const where = `matrix entry ${entry.id ?? '(no id)'}`;
    if (!entry.id || ids.has(entry.id)) problems.push(`${where}: id is missing or duplicated`);
    ids.add(entry.id);
    for (const field of ['agent', 'model', 'key']) {
      if (typeof entry[field] !== 'string' || entry[field] === '') problems.push(`${where}: ${field} is required`);
    }
    if (!['small', 'frontier'].includes(entry.tier)) problems.push(`${where}: tier must be "small" or "frontier"`);
    if (!('effort' in entry)) problems.push(`${where}: effort is required (use null for the agent's default)`);
  }
  if (ids.size === 0) problems.push('matrix has no entries');
  return problems;
}

// Case ids selected by --case and --max-cases, in dataset order.
function selectCases(skill, options) {
  let ids = loadCases(skill).map((item) => item.id);
  if (options.cases) {
    const unknown = options.cases.filter((id) => !ids.includes(id));
    if (unknown.length > 0) fail(`Unknown case for ${skill}: ${unknown.join(', ')}`);
    ids = ids.filter((id) => options.cases.includes(id));
  }
  if (options.maxCases) ids = ids.slice(0, options.maxCases);
  return ids;
}

function agentConfig(entry, skill) {
  const kwargs = {};
  if (entry.effort) kwargs.reasoning_effort = entry.effort;
  if (entry.version) kwargs.version = entry.version;
  return {
    name: entry.agent,
    model_name: entry.model,
    ...(skill ? { skills: [join('skills', skill)] } : {}),
    ...(Object.keys(kwargs).length > 0 ? { kwargs } : {}),
  };
}

function runEntry(skill, entry, tasksPath, options) {
  const hasKey = Boolean(process.env[entry.key]);
  if (!hasKey && !options.dryRun) {
    console.log(`\n== ${skill} / ${entry.id}: skipped, missing ${entry.key}`);
    return { status: 'skipped', reason: `missing ${entry.key}` };
  }

  const entryDir = join(resultsDir, skill, entry.id);
  mkdirSync(entryDir, { recursive: true });
  const jobName = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  const job = {
    job_name: jobName,
    jobs_dir: relative(root, entryDir),
    n_attempts: options.attempts ?? matrix.attempts,
    n_concurrent_trials: options.concurrency ?? matrix.concurrency,
    // The first agent is the with-skill arm, the second the baseline.
    agents: [agentConfig(entry, skill), agentConfig(entry)],
    datasets: [{ path: relative(root, tasksPath) }],
  };
  const jobFile = join(entryDir, 'job.json');
  writeFileSync(jobFile, `${JSON.stringify(job, null, 2)}\n`);

  const args = ['run', '--config', relative(root, jobFile), '--yes'];
  if (options.dryRun) args.push('--dry-run');
  console.log(`\n== ${skill} / ${entry.id}`);
  console.log(`${entry.agent}, ${entry.model}, effort ${entry.effort ?? 'default'}, key ${entry.key}${hasKey ? '' : ' (not set)'}`);
  console.log(`harbor ${args.join(' ')}`);

  // Harbor checks for the provider key even in a dry run, so give it a placeholder then.
  const key = process.env[entry.key] ?? (options.dryRun ? 'dry-run-placeholder' : '');
  const run = spawnSync('harbor', args, { cwd: root, env: providerEnv({ [entry.key]: key }), stdio: 'inherit' });
  if (run.error) return { status: 'error', reason: run.error.message };
  if (options.dryRun) return { status: run.status === 0 ? 'dry-run ok' : 'dry-run failed' };
  return { status: run.status === 0 ? 'completed' : 'failed' };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

// Whether the agent loaded the skill, judged from its recorded tool calls: a
// call to a skill tool naming the skill, or a read of a file inside the skill
// directory. Returns undefined when no trajectory was recorded.
function skillLoaded(trialDir, skill) {
  const trajectory = readJson(join(trialDir, 'agent', 'trajectory.json'));
  if (!trajectory?.steps) return undefined;
  for (const step of trajectory.steps) {
    for (const call of step.tool_calls ?? []) {
      const name = String(call.function_name ?? '').toLowerCase();
      const args = JSON.stringify(call.arguments ?? {});
      if (name.includes('skill') && args.includes(skill)) return true;
      if (args.includes(`skills/${skill}/`) || args.includes(`${skill}/SKILL.md`)) return true;
    }
  }
  return false;
}

// Trials of the newest job for one entry, or undefined when there is none.
function readTrials(skill, entry) {
  const entryDir = join(resultsDir, skill, entry.id);
  if (!existsSync(entryDir)) return undefined;
  const jobs = readdirSync(entryDir)
    .map((name) => join(entryDir, name))
    .filter((path) => statSync(path).isDirectory() && existsSync(join(path, 'config.json')))
    .sort();
  const jobDir = jobs.at(-1);
  if (!jobDir) return undefined;

  const trials = [];
  for (const name of readdirSync(jobDir)) {
    const trialDir = join(jobDir, name);
    const result = readJson(join(trialDir, 'result.json'));
    if (!result?.config?.agent) continue;
    const started = Date.parse(result.agent_execution?.started_at);
    const finished = Date.parse(result.agent_execution?.finished_at);
    trials.push({
      caseId: basename(result.task_id?.path ?? ''),
      withSkill: (result.config.agent.skills ?? []).length > 0,
      rewards: result.verifier_result?.rewards,
      error: result.exception_info?.exception_type,
      inputTokens: result.agent_result?.n_input_tokens,
      outputTokens: result.agent_result?.n_output_tokens,
      costUsd: result.agent_result?.cost_usd,
      seconds: Number.isFinite(started) && Number.isFinite(finished) ? (finished - started) / 1000 : undefined,
      skillLoaded: skillLoaded(trialDir, skill),
    });
  }
  return { jobDir, trials };
}

const mean = (values) => {
  const numbers = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  return numbers.length > 0 ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : undefined;
};

// Per-arm scores for one entry. A metric is averaged over attempts per case,
// then over the cases that both arms scored, so the arms are compared on the
// same cases.
function scoreEntry(skill, entry) {
  const data = readTrials(skill, entry);
  if (!data) return undefined;
  const cases = new Map(loadCases(skill).map((item) => [item.id, item]));
  const arm = (withSkill) => data.trials.filter((trial) => trial.withSkill === withSkill);

  const metrics = {};
  for (const metric of METRICS) {
    const perCase = (trials) => {
      const byCase = new Map();
      for (const trial of trials) {
        const value = trial.rewards?.[metric];
        if (typeof value !== 'number') continue;
        byCase.set(trial.caseId, [...(byCase.get(trial.caseId) ?? []), value]);
      }
      return new Map([...byCase].map(([id, values]) => [id, mean(values)]));
    };
    const withCases = perCase(arm(true));
    const withoutCases = perCase(arm(false));
    const shared = [...withCases.keys()].filter((id) => withoutCases.has(id));
    if (shared.length === 0) continue;
    const withSkill = mean(shared.map((id) => withCases.get(id)));
    const withoutSkill = mean(shared.map((id) => withoutCases.get(id)));
    metrics[metric] = { with_skill: withSkill, without_skill: withoutSkill, delta: withSkill - withoutSkill, cases: shared.length };
  }

  const usage = (trials) => ({
    trials: trials.length,
    errors: trials.filter((trial) => trial.error).length,
    input_tokens: mean(trials.map((trial) => trial.inputTokens)),
    output_tokens: mean(trials.map((trial) => trial.outputTokens)),
    cost_usd: mean(trials.map((trial) => trial.costUsd)),
    seconds: mean(trials.map((trial) => trial.seconds)),
  });
  const loadRate = (shouldTrigger) => {
    const observed = arm(true).filter(
      (trial) => cases.get(trial.caseId)?.should_trigger === shouldTrigger && trial.skillLoaded !== undefined,
    );
    return observed.length > 0 ? observed.filter((trial) => trial.skillLoaded).length / observed.length : undefined;
  };

  return {
    job: relative(root, data.jobDir),
    metrics,
    with_skill: usage(arm(true)),
    without_skill: usage(arm(false)),
    skill_loaded: { expected: loadRate(true), not_expected: loadRate(false) },
  };
}

const formatScore = (metric) => {
  if (!metric) return 'n/a';
  const sign = metric.delta > 0 ? '+' : '';
  return `${metric.without_skill.toFixed(2)} → ${metric.with_skill.toFixed(2)} (${sign}${metric.delta.toFixed(2)})`;
};
const formatPair = (without, withSkill, format) =>
  without === undefined || withSkill === undefined ? 'n/a' : `${format(without)} → ${format(withSkill)}`;
const formatRate = (rate) => (rate === undefined ? 'n/a' : `${Math.round(rate * 100)}%`);
const thousands = (value) => `${Math.round(value / 1000)}k`;

function summarise(skills, entries, statuses) {
  const lines = ['# Skill evaluation matrix', ''];
  const regressions = [];
  const tolerance = matrix.regressionTolerance ?? 0;
  const summary = {};

  for (const skill of skills) {
    summary[skill] = {};
    lines.push(`## ${skill}`, '');
    lines.push('| Entry | Agent | Model | Effort | Tier | File checks | Astro build | Trials (errors) | Input tokens | Seconds | Skill loaded: expected / not expected | Status |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const entry of entries) {
      const scores = scoreEntry(skill, entry);
      const status = statuses.get(`${skill}/${entry.id}`);
      const statusText = status ? [status.status, status.reason].filter(Boolean).join(': ') : scores ? 'from disk' : 'no results';
      summary[skill][entry.id] = { ...entry, status: statusText, ...scores };
      const trials = scores
        ? `${scores.without_skill.trials} + ${scores.with_skill.trials} (${scores.without_skill.errors + scores.with_skill.errors})`
        : 'n/a';
      lines.push(
        `| ${[
          entry.id,
          entry.agent,
          entry.model,
          entry.effort ?? 'default',
          entry.tier,
          formatScore(scores?.metrics.file_checks),
          formatScore(scores?.metrics.astro_build),
          trials,
          formatPair(scores?.without_skill.input_tokens, scores?.with_skill.input_tokens, thousands),
          formatPair(scores?.without_skill.seconds, scores?.with_skill.seconds, (value) => Math.round(value)),
          `${formatRate(scores?.skill_loaded.expected)} / ${formatRate(scores?.skill_loaded.not_expected)}`,
          statusText,
        ].join(' | ')} |`,
      );
      if (entry.tier === 'frontier') {
        for (const metric of ['file_checks', 'astro_build']) {
          const delta = scores?.metrics[metric]?.delta;
          if (typeof delta === 'number' && delta < -tolerance) regressions.push(`${skill} / ${entry.id}: ${metric} ${delta.toFixed(2)}`);
        }
      }
    }
    lines.push('');
  }

  lines.push('Score, token and time cells show without-skill → with-skill. Scores are 0-1, averaged over attempts and then over cases.');
  lines.push('File checks and Astro build are deterministic, so every row is comparable.');
  lines.push('Trials are baseline + with-skill; tokens and seconds are per-trial means.');
  lines.push('Skill loaded is the share of with-skill trials in which the agent loaded the skill, for cases where it should and for cases where it should not. It is read from recorded tool calls and is a heuristic.');
  lines.push('');
  if (regressions.length > 0) {
    lines.push('## Frontier regressions', '');
    for (const regression of regressions) lines.push(`- ${regression}`);
    lines.push('');
  }
  return { text: lines.join('\n'), regressions, summary };
}

loadLocalEnv();
const options = parseArgs(process.argv.slice(2));

const skills = options.skill ? [options.skill] : listSkills();
for (const skill of skills) {
  if (!listSkills().includes(skill)) fail(`No eval cases for skill: ${skill}`);
}
const problems = [...validateMatrix(), ...skills.flatMap((skill) => validateSkill(skill))];
if (problems.length > 0) fail(`Invalid eval configuration:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
if (options.check) {
  console.log(`OK: ${skills.map((skill) => `${skill} (${loadCases(skill).length} cases)`).join(', ')}; ${matrix.entries.length} matrix entries`);
  process.exit(0);
}

const entries = options.only ? matrix.entries.filter((entry) => options.only.includes(entry.id)) : matrix.entries;
if (entries.length === 0) fail('No matrix entries selected.');

const statuses = new Map();
if (!options.summaryOnly) {
  for (const skill of skills) {
    const tasksPath = buildTasks(skill, { only: selectCases(skill, options) });
    for (const entry of entries) statuses.set(`${skill}/${entry.id}`, runEntry(skill, entry, tasksPath, options));
  }
}

const failed = [...statuses.values()].some((status) => ['failed', 'error', 'dry-run failed'].includes(status.status));
if (options.dryRun) process.exit(failed ? 1 : 0);

const { text, regressions, summary } = summarise(skills, entries, statuses);
mkdirSync(resultsDir, { recursive: true });
writeFileSync(join(resultsDir, 'summary.md'), text);
writeFileSync(join(resultsDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\n${text}`);
console.log(`Summary written to ${relative(root, join(resultsDir, 'summary.md'))} and summary.json`);
if (failed || (options.strict && regressions.length > 0)) process.exit(1);
