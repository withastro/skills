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
//   --arm <with|without> Run only one arm. Use `--arm with` after changing a skill: the
//                        baseline does not depend on the skill, so earlier baseline
//                        results are reused in the summary
//   --check              Validate the datasets and matrix, then exit. No model calls
//   --verify             Prove the cases with reference solutions: the solution must
//                        score 1.0 and the untouched fixture must not. No model calls
//   --dry-run            Generate tasks and validate each job with Harbor. No model calls
//   --resume             Continue the last run: skip entries that finished, resume the
//                        interrupted one, start the rest. Finished trials are kept
//   --summary-only       Skip running; summarise results already in .eval-results/
//   --strict             Exit 1 when a frontier entry regresses beyond the tolerance
//   --record             Save the summary to evals/results/<date>-<commit>/ and update the
//                        README. Only for clean, full runs made at the current commit
//
// Entries whose key is not set are skipped and reported as such.
// Live runs call model providers and cost money; see CONTRIBUTING.md.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fail, loadLocalEnv, providerEnv, root } from './lib/env.mjs';
import { buildTasks, hasSolution, listSkills, loadCases, tasksDir, validateSkill } from './lib/tasks.mjs';

const resultsDir = join(root, '.eval-results');
const matrix = JSON.parse(readFileSync(join(root, 'evals', 'matrix.json'), 'utf8'));
const METRICS = ['file_checks', 'output_checks', 'astro_build', 'reward'];

function parseArgs(argv) {
  const options = { check: false, dryRun: false, record: false, resume: false, summaryOnly: false, strict: false, verify: false };
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
    else if (arg === '--arm') {
      options.arm = value();
      if (!['with', 'without'].includes(options.arm)) fail('--arm must be "with" or "without"');
    } else if (arg === '--check') options.check = true;
    else if (arg === '--verify') options.verify = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--resume') options.resume = true;
    else if (arg === '--summary-only') options.summaryOnly = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--record') options.record = true;
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

function git(...args) {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return run.status === 0 ? run.stdout.trim() : '';
}

// The commit the skills, cases and scripts are at, and whether any of them
// has uncommitted changes. Stored with each job so a recorded result can be
// tied to exactly what was tested.
function sourceState() {
  return {
    commit: git('rev-parse', 'HEAD'),
    dirty: git('status', '--porcelain', '--', 'skills', 'evals', 'scripts') !== '',
  };
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

// Newest Harbor job directory for one entry, or undefined.
function latestJobDir(skill, entry) {
  return jobDirs(skill, entry).at(-1);
}

// Whether every trial of a job has finished, with a score or an error.
function jobFinished(jobDir) {
  const result = readJson(join(jobDir, 'result.json'));
  const stats = result?.stats;
  if (!stats || !result.n_total_trials) return false;
  const done = (stats.n_completed_trials ?? 0) + (stats.n_errored_trials ?? 0) - (stats.n_cancelled_trials ?? 0);
  return done >= result.n_total_trials && !stats.n_running_trials && !stats.n_pending_trials;
}

function runEntry(skill, entry, tasksPath, options) {
  const hasKey = Boolean(process.env[entry.key]);
  if (!hasKey && !options.dryRun) {
    console.log(`\n== ${skill} / ${entry.id}: skipped, missing ${entry.key}`);
    return { status: 'skipped', reason: `missing ${entry.key}` };
  }

  const previous = options.resume && !options.dryRun ? latestJobDir(skill, entry) : undefined;
  if (previous && jobFinished(previous)) {
    console.log(`\n== ${skill} / ${entry.id}: already finished (${relative(root, previous)})`);
    return { status: 'completed', reason: 'kept from the previous run' };
  }
  if (previous) {
    // Harbor keeps the trials that finished and runs the rest. The job keeps the
    // attempts, cases and concurrency it was started with.
    const args = ['job', 'resume', '--job-path', relative(root, previous), '--filter-error-type', 'CancelledError'];
    console.log(`\n== ${skill} / ${entry.id}: resuming`);
    console.log(`harbor ${args.join(' ')}`);
    const run = spawnSync('harbor', args, { cwd: root, env: providerEnv({ [entry.key]: process.env[entry.key] }), stdio: 'inherit' });
    if (run.error) return { status: 'error', reason: run.error.message };
    return { status: run.status === 0 ? 'completed' : 'failed', reason: 'resumed' };
  }

  const entryDir = join(resultsDir, skill, entry.id);
  mkdirSync(entryDir, { recursive: true });
  const jobName = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  const job = {
    job_name: jobName,
    jobs_dir: relative(root, entryDir),
    n_attempts: options.attempts ?? matrix.attempts,
    n_concurrent_trials: options.concurrency ?? matrix.concurrency,
    // The with-skill arm, then the baseline, unless --arm selects one.
    agents: [
      ...(options.arm === 'without' ? [] : [agentConfig(entry, skill)]),
      ...(options.arm === 'with' ? [] : [agentConfig(entry)]),
    ],
    datasets: [{ path: relative(root, tasksPath) }],
  };
  const jobFile = join(entryDir, 'job.json');
  writeFileSync(jobFile, `${JSON.stringify(job, null, 2)}\n`);
  if (!options.dryRun) {
    const meta = { ...sourceState(), started_at: new Date().toISOString(), attempts: job.n_attempts, arm: options.arm ?? 'both', partial: Boolean(options.cases || options.maxCases) };
    writeFileSync(join(entryDir, `${jobName}.meta.json`), `${JSON.stringify(meta, null, 2)}\n`);
  }

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

// Job directories for one entry, oldest first.
function jobDirs(skill, entry) {
  const entryDir = join(resultsDir, skill, entry.id);
  if (!existsSync(entryDir)) return [];
  return readdirSync(entryDir)
    .map((name) => join(entryDir, name))
    .filter((path) => statSync(path).isDirectory() && existsSync(join(path, 'config.json')))
    .sort();
}

// Trials for one entry, or undefined when there are none. Runs can cover
// different cases (--case, --max-cases) and arms (--arm), so each case and arm
// is taken from the newest job that ran it; older trials of it are ignored.
function readTrials(skill, entry) {
  const jobs = jobDirs(skill, entry);
  if (jobs.length === 0) return undefined;
  const byCase = new Map();
  const byCaseJob = new Map();
  for (const jobDir of jobs) {
    const fromJob = new Map();
    for (const trial of readJobTrials(jobDir, skill)) {
      const slot = `${trial.caseId}\n${trial.withSkill}`;
      fromJob.set(slot, [...(fromJob.get(slot) ?? []), trial]);
    }
    for (const [slot, trials] of fromJob) {
      byCase.set(slot, trials);
      byCaseJob.set(slot, jobDir);
    }
  }
  // The jobs that still contribute a case, for provenance.
  const used = new Set();
  for (const jobDir of jobs) {
    if ([...byCaseJob.values()].includes(jobDir)) used.add(jobDir);
  }
  return { jobDir: jobs.at(-1), jobs: jobs.length, usedJobs: [...used], trials: [...byCase.values()].flat() };
}

function readJobTrials(jobDir, skill) {
  const trials = [];
  for (const name of readdirSync(jobDir)) {
    const trialDir = join(jobDir, name);
    const result = readJson(join(trialDir, 'result.json'));
    if (!result?.config?.agent) continue;
    const started = Date.parse(result.agent_execution?.started_at);
    const finished = Date.parse(result.agent_execution?.finished_at);
    trials.push({
      agentVersion: result.agent_info?.version,
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
  return trials;
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

  // Cost of a trial in tokens, money and time, compared the same way as the
  // scores: per case first, then over the cases both arms ran.
  const efficiency = {};
  for (const [name, field] of [['input_tokens', 'inputTokens'], ['cost_usd', 'costUsd'], ['seconds', 'seconds']]) {
    const perCase = (trials) => {
      const byCase = new Map();
      for (const trial of trials) {
        if (typeof trial[field] !== 'number' || trial.error) continue;
        byCase.set(trial.caseId, [...(byCase.get(trial.caseId) ?? []), trial[field]]);
      }
      return new Map([...byCase].map(([id, values]) => [id, mean(values)]));
    };
    const withCases = perCase(arm(true));
    const withoutCases = perCase(arm(false));
    const shared = [...withCases.keys()].filter((id) => withoutCases.has(id));
    if (shared.length === 0) continue;
    const withSkill = mean(shared.map((id) => withCases.get(id)));
    const withoutSkill = mean(shared.map((id) => withoutCases.get(id)));
    efficiency[name] = {
      with_skill: withSkill,
      without_skill: withoutSkill,
      change: withoutSkill > 0 ? (withSkill - withoutSkill) / withoutSkill : undefined,
    };
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
    jobs: data.jobs,
    used_jobs: data.usedJobs.map((jobDir) => relative(root, jobDir)),
    agent_versions: [...new Set(data.trials.map((trial) => trial.agentVersion).filter(Boolean))],
    scored_trials: data.trials.filter((trial) => trial.rewards).length,
    cases: new Set(data.trials.map((trial) => trial.caseId)).size,
    metrics,
    efficiency,
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
// Baseline → with skill, and the relative change. Lower is better.
const formatCost = (pair, format) => {
  if (!pair) return 'n/a';
  const change = pair.change === undefined ? '' : ` (${pair.change > 0 ? '+' : ''}${Math.round(pair.change * 100)}%)`;
  return `${format(pair.without_skill)} → ${format(pair.with_skill)}${change}`;
};
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
    lines.push('| Entry | Agent | Model | Effort | Tier | Cases | File checks | Output checks | Astro build | Trials (errors) | Input tokens | Cost per trial | Seconds | Skill loaded: expected / not expected | Status |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
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
          scores ? `${scores.cases} of ${loadCases(skill).length}` : 'n/a',
          formatScore(scores?.metrics.file_checks),
          formatScore(scores?.metrics.output_checks),
          formatScore(scores?.metrics.astro_build),
          trials,
          formatCost(scores?.efficiency.input_tokens, thousands),
          formatCost(scores?.efficiency.cost_usd, (value) => `$${value.toFixed(value < 0.1 ? 4 : 2)}`),
          formatCost(scores?.efficiency.seconds, (value) => Math.round(value)),
          `${formatRate(scores?.skill_loaded.expected)} / ${formatRate(scores?.skill_loaded.not_expected)}`,
          statusText,
        ].join(' | ')} |`,
      );
      if (entry.tier === 'frontier') {
        for (const metric of ['file_checks', 'output_checks', 'astro_build']) {
          const delta = scores?.metrics[metric]?.delta;
          if (typeof delta === 'number' && delta < -tolerance) regressions.push(`${skill} / ${entry.id}: ${metric} ${delta.toFixed(2)}`);
        }
      }
    }
    lines.push('');
  }

  lines.push('Score, token and time cells show without-skill → with-skill. Scores are 0-1, averaged over attempts and then over cases.');
  lines.push('File checks, output checks and Astro build are deterministic, so every row is comparable. Each is averaged over the cases that have it.');
  lines.push('Cases is how many of the skill\'s cases have results. When several runs cover a case, the newest run counts.');
  lines.push('Trials are baseline + with-skill. Input tokens, cost and seconds are per trial, averaged per case and then over cases, with the change the skill makes; lower is better. Cost is the agent\'s model cost as reported by Harbor.');
  lines.push('Skill loaded is the share of with-skill trials in which the agent loaded the skill, for cases where it should and for cases where it should not. It is read from recorded tool calls and is a heuristic.');
  lines.push('');
  if (regressions.length > 0) {
    lines.push('## Frontier regressions', '');
    for (const regression of regressions) lines.push(`- ${regression}`);
    lines.push('');
  }
  return { text: lines.join('\n'), regressions, summary };
}

// Saves the summary as a committed record. Refuses unless every result comes
// from a full run of all cases, started at the current commit with no
// uncommitted changes, so the record states exactly what was measured.
function record(skills, entries, summary, text) {
  const state = sourceState();
  const problems = [];
  if (state.dirty) problems.push('skills/, evals/ or scripts/ have uncommitted changes');
  if (options.only || options.cases || options.maxCases || options.skill) {
    problems.push('--record needs the whole matrix: remove --skill, --only, --case and --max-cases');
  }
  const notRun = [];
  for (const skill of skills) {
    const total = loadCases(skill).length;
    for (const entry of entries) {
      const scores = summary[skill][entry.id];
      const name = `${skill} / ${entry.id}`;
      if (!scores.used_jobs) {
        notRun.push(name);
        continue;
      }
      if (scores.cases < total) problems.push(`${name}: results for ${scores.cases} of ${total} cases`);
      if (scores.scored_trials === 0) problems.push(`${name}: no scored trials`);
      for (const jobDir of scores.used_jobs) {
        const meta = readJson(`${join(root, jobDir)}.meta.json`);
        if (!meta) problems.push(`${name}: ${jobDir} has no provenance file (run before --record existed)`);
        else if (meta.commit !== state.commit) problems.push(`${name}: ${jobDir} ran at commit ${meta.commit.slice(0, 7)}, not the current ${state.commit.slice(0, 7)}`);
        else if (meta.dirty) problems.push(`${name}: ${jobDir} ran with uncommitted changes`);
        else if (meta.attempts !== matrix.attempts) problems.push(`${name}: ${jobDir} ran with ${meta.attempts} attempts, not the ${matrix.attempts} in evals/matrix.json`);
      }
    }
  }
  if (notRun.length === entries.length * skills.length) problems.push('there are no results to record');
  if (problems.length > 0) fail(`\nNot recorded:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);

  const date = new Date().toISOString().slice(0, 10);
  const name = `${date}-${state.commit.slice(0, 7)}`;
  const recordDir = join(root, 'evals', 'results', name);
  mkdirSync(recordDir, { recursive: true });
  const harbor = spawnSync('harbor', ['--version'], { encoding: 'utf8' });
  const run = {
    recorded_at: new Date().toISOString(),
    commit: state.commit,
    harbor_version: harbor.status === 0 ? harbor.stdout.trim().split('\n').at(-1) : null,
    attempts: matrix.attempts,
    entries: entries.map((entry) => ({
      id: entry.id,
      agent: entry.agent,
      model: entry.model,
      effort: entry.effort,
      agent_versions: [...new Set(skills.flatMap((skill) => summary[skill][entry.id].agent_versions ?? []))],
    })),
    not_run: notRun,
  };
  // Local paths are of no use to a reader of the record.
  const published = structuredClone(summary);
  for (const skill of skills) {
    for (const entry of entries) {
      delete published[skill][entry.id].job;
      delete published[skill][entry.id].used_jobs;
      delete published[skill][entry.id].jobs;
      delete published[skill][entry.id].key;
    }
  }
  const heading = `Recorded ${date} at commit \`${state.commit.slice(0, 7)}\` with Harbor ${run.harbor_version ?? 'unknown'}, ${matrix.attempts} attempts per case and arm.`;
  const skipped = notRun.length > 0 ? `\nNot run: ${notRun.join(', ')}.\n` : '';
  writeFileSync(join(recordDir, 'summary.md'), `${text.replace('# Skill evaluation matrix\n', `# Skill evaluation results\n\n${heading}\n${skipped}`)}`);
  writeFileSync(join(recordDir, 'summary.json'), `${JSON.stringify(published, null, 2)}\n`);
  writeFileSync(join(recordDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);

  // README: a compact table between the results markers.
  const lines = [`${heading} Score cells show the score without the skill → with it (0-1). Cost and time show the change the skill makes per trial; negative is cheaper or faster.`, ''];
  lines.push('| Skill | Agent | Model | Effort | File checks | Output checks | Build | Cost per trial | Time per trial | Skill loaded when expected |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const change = (pair) => (pair?.change === undefined ? 'n/a' : `${pair.change > 0 ? '+' : ''}${Math.round(pair.change * 100)}%`);
  const cell = (metric) => (metric ? `${metric.without_skill.toFixed(2)} → ${metric.with_skill.toFixed(2)}` : 'n/a');
  for (const skill of skills) {
    for (const entry of entries) {
      const scores = summary[skill][entry.id];
      if (!scores.used_jobs) continue;
      const loaded = scores.skill_loaded?.expected;
      lines.push(
        `| ${skill} | ${entry.agent} | \`${entry.model}\` | ${entry.effort ?? 'default'} | ${cell(scores.metrics.file_checks)} | ${cell(scores.metrics.output_checks)} | ${cell(scores.metrics.astro_build)} | ${change(scores.efficiency.cost_usd)} | ${change(scores.efficiency.seconds)} | ${loaded === undefined ? 'n/a' : `${Math.round(loaded * 100)}%`} |`,
      );
    }
  }
  lines.push('', `Full record: [\`evals/results/${name}/\`](evals/results/${name}/summary.md). How these are measured: [CONTRIBUTING.md](CONTRIBUTING.md#evaluations).`);
  const readmePath = join(root, 'README.md');
  const readme = readFileSync(readmePath, 'utf8');
  const start = '<!-- results:start -->';
  const end = '<!-- results:end -->';
  if (readme.includes(start) && readme.includes(end)) {
    const updated = `${readme.slice(0, readme.indexOf(start) + start.length)}\n${lines.join('\n')}\n${readme.slice(readme.indexOf(end))}`;
    writeFileSync(readmePath, updated);
  }
  console.log(`\nRecorded to evals/results/${name}/ and README.md. Review the changes, then commit them.`);
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

// Runs every case that has a reference solution with Harbor's oracle agent
// (applies the solution) and its no-op agent (changes nothing). A sound case
// scores 1.0 for the first and less for the second.
function verifyCases(skill) {
  const selected = selectCases(skill, options);
  const withSolution = selected.filter((id) => hasSolution(skill, id));
  const without = selected.filter((id) => !hasSolution(skill, id));
  console.log(`\n== ${skill}: verifying ${withSolution.length} case(s) with a reference solution`);
  if (withSolution.length === 0) return { ok: true, without };

  const tasksPath = buildTasks(skill, { only: withSolution, group: '_verify' });
  const verifyDir = join(resultsDir, '_verify', skill);
  mkdirSync(verifyDir, { recursive: true });
  const jobName = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  const job = {
    job_name: jobName,
    jobs_dir: relative(root, verifyDir),
    n_attempts: 1,
    n_concurrent_trials: options.concurrency ?? matrix.concurrency,
    agents: [{ name: 'oracle' }, { name: 'nop' }],
    datasets: [{ path: relative(root, tasksPath) }],
  };
  const jobFile = join(verifyDir, 'job.json');
  writeFileSync(jobFile, `${JSON.stringify(job, null, 2)}\n`);
  const run = spawnSync('harbor', ['run', '--config', relative(root, jobFile), '--yes', '--quiet'], {
    cwd: root,
    env: providerEnv({}),
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (run.error) fail(run.error.message);

  const results = new Map(withSolution.map((id) => [id, {}]));
  const jobDir = join(verifyDir, jobName);
  for (const name of existsSync(jobDir) ? readdirSync(jobDir) : []) {
    const result = readJson(join(jobDir, name, 'result.json'));
    if (!result?.config?.agent) continue;
    const entry = results.get(basename(result.task_id?.path ?? ''));
    if (!entry) continue;
    entry[result.config.agent.name] = {
      rewards: result.verifier_result?.rewards,
      error: result.exception_info?.exception_type,
      details: readJson(join(jobDir, name, 'verifier', 'details.json')),
    };
  }

  let ok = true;
  const failedChecks = (details) =>
    ['file_checks', 'output_checks']
      .flatMap((kind) => details?.[kind]?.checks ?? [])
      .filter((check) => !check.passed)
      .map((check) => `${check.id}: ${check.reason}`);
  for (const [id, { oracle, nop }] of results) {
    const solved = oracle?.rewards && Object.values(oracle.rewards).every((score) => score === 1);
    const startFails = nop?.rewards && nop.rewards.reward < 1;
    const problems = [];
    if (!solved) {
      problems.push(`solution scores ${JSON.stringify(oracle?.rewards ?? oracle?.error ?? 'nothing')}`);
      problems.push(...failedChecks(oracle?.details));
      if (oracle?.details?.astro_build?.score === 0) problems.push(oracle.details.astro_build.reason.slice(-400));
    }
    if (!startFails) problems.push(`untouched fixture scores ${JSON.stringify(nop?.rewards ?? nop?.error ?? 'nothing')}; the case does not test anything`);
    console.log(`${problems.length === 0 ? 'ok  ' : 'FAIL'} ${id}${nop?.rewards ? ` (untouched fixture: ${nop.rewards.reward.toFixed(2)})` : ''}`);
    for (const problem of problems) console.log(`       ${problem}`);
    if (problems.length > 0) ok = false;
  }
  return { ok, without };
}

if (options.verify) {
  let ok = true;
  const unverified = [];
  for (const skill of skills) {
    const result = verifyCases(skill);
    ok &&= result.ok;
    unverified.push(...result.without.map((id) => `${skill}/${id}`));
  }
  if (unverified.length > 0) console.log(`\nNo reference solution, not verified: ${unverified.join(', ')}`);
  process.exit(ok ? 0 : 1);
}

const entries = options.only ? matrix.entries.filter((entry) => options.only.includes(entry.id)) : matrix.entries;
if (entries.length === 0) fail('No matrix entries selected.');

const statuses = new Map();
if (!options.summaryOnly) {
  for (const skill of skills) {
    // A resumed job must find the tasks it was started with, so keep them if present.
    const existingTasks = join(tasksDir, skill);
    const tasksPath =
      options.resume && existsSync(existingTasks) ? existingTasks : buildTasks(skill, { only: selectCases(skill, options) });
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
if (options.record) record(skills, entries, summary, text);
if (failed || (options.strict && regressions.length > 0)) process.exit(1);
