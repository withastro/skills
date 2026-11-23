// Loads the eval cases in evals/<skill>/cases.json, validates them, and turns
// them into Harbor task directories under .eval-tasks/ (generated, not
// committed). One task per case:
//
//   .eval-tasks/<skill>/<case-id>/
//     instruction.md          the case prompt
//     task.toml               timeouts and resources
//     environment/Dockerfile  evals/Dockerfile
//     environment/project/    the case's fixture
//     tests/test.sh           runs the grader
//     tests/grader.py         evals/grader.py
//     tests/case.json         the case, read by the grader
//     solution/               reference solution, if evals/<skill>/solutions/<case-id>/
//                             exists. Only Harbor's oracle agent receives it.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './env.mjs';

const evalsDir = join(root, 'evals');
export const tasksDir = join(root, '.eval-tasks');

const CASE_KEYS = new Set([
  'id',
  'prompt',
  'fixture',
  'should_trigger',
  'expected_output',
  'assertions',
  'build_check',
  'file_checks',
  'output_checks',
]);
const CHECK_KEYS = new Set(['id', 'path', 'exists', 'contains', 'not_contains', 'any_of']);

export function listSkills() {
  return readdirSync(evalsDir).filter((name) => existsSync(join(evalsDir, name, 'cases.json')));
}

export function loadCases(skill) {
  const data = JSON.parse(readFileSync(join(evalsDir, skill, 'cases.json'), 'utf8'));
  return data.cases;
}

// Returns a list of problems; empty when the dataset is valid.
export function validateSkill(skill) {
  const problems = [];
  const report = (message) => problems.push(`${skill}: ${message}`);
  if (!existsSync(join(root, 'skills', skill, 'SKILL.md'))) report('no matching skill in skills/');

  let data;
  try {
    data = JSON.parse(readFileSync(join(evalsDir, skill, 'cases.json'), 'utf8'));
  } catch (error) {
    return [`${skill}: cases.json is not valid JSON (${error.message})`];
  }
  if (data.skill_name !== skill) report(`skill_name is "${data.skill_name}", expected "${skill}"`);
  if (!Array.isArray(data.cases) || data.cases.length === 0) return [...problems, `${skill}: no cases`];

  const ids = new Set();
  for (const item of data.cases) {
    const where = `case ${item.id ?? '(no id)'}`;
    if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(item.id)) report(`${where}: id must be lowercase letters, digits and hyphens`);
    if (ids.has(item.id)) report(`${where}: duplicate id`);
    ids.add(item.id);
    for (const key of Object.keys(item)) if (!CASE_KEYS.has(key)) report(`${where}: unknown field "${key}"`);
    if (typeof item.prompt !== 'string' || item.prompt.trim() === '') report(`${where}: prompt is required`);
    if (item.prompt?.includes(skill)) report(`${where}: prompt names the skill; both arms get the same prompt`);
    if (typeof item.expected_output !== 'string' || item.expected_output.trim() === '') report(`${where}: expected_output is required`);
    if (typeof item.should_trigger !== 'boolean') report(`${where}: should_trigger must be true or false`);
    if (typeof item.fixture !== 'string' || !existsSync(join(evalsDir, skill, 'fixtures', item.fixture))) {
      report(`${where}: fixture "${item.fixture}" not found in evals/${skill}/fixtures/`);
    }
    if (!item.file_checks?.length && !item.output_checks?.length && !item.build_check) {
      report(`${where}: needs file_checks, output_checks or build_check to be graded`);
    }
    const validateCheck = (check) => {
      for (const key of Object.keys(check)) if (!CHECK_KEYS.has(key)) report(`${where}: unknown check field "${key}"`);
      if (Array.isArray(check.any_of)) {
        if (check.any_of.length < 2) report(`${where}: any_of needs at least two checks`);
        check.any_of.forEach(validateCheck);
        return;
      }
      if (typeof check.path !== 'string' || check.path === '') report(`${where}: check needs a path`);
      for (const expression of [...(check.contains ?? []), ...(check.not_contains ?? [])]) {
        try {
          new RegExp(expression);
        } catch {
          report(`${where}: invalid regular expression ${JSON.stringify(expression)}`);
        }
      }
    };
    [...(item.file_checks ?? []), ...(item.output_checks ?? [])].forEach(validateCheck);
  }
  if (!data.cases.some((item) => item.should_trigger === false)) report('needs at least one should_trigger: false case');
  return problems;
}

const TASK_TOML = (skill, id) => `schema_version = "1.4"

[task]
name = "withastro/${skill}-${id}"
version = "1.0.0"

[agent]
timeout_sec = 1200.0

[verifier]
timeout_sec = 900.0

[environment]
build_timeout_sec = 1200.0
cpus = 2
memory_mb = 4096
`;

// Applies a reference solution: removes the paths listed in delete.txt, then
// copies files/ over the project.
const SOLVE_SH = `#!/bin/bash
set -euo pipefail
if [ -f /solution/delete.txt ]; then
  while IFS= read -r path; do
    [ -n "$path" ] && rm -rf "/app/$path"
  done < /solution/delete.txt
fi
if [ -d /solution/files ]; then
  cp -R /solution/files/. /app/
fi
`;

export function hasSolution(skill, id) {
  return existsSync(join(evalsDir, skill, 'solutions', id));
}

const TEST_SH = `#!/bin/bash
# Verifier entry point: grades the project in /app and writes
# /logs/verifier/reward.json.
python3 /tests/grader.py
`;

// Writes the Harbor tasks for one skill and returns their directory.
export function buildTasks(skill, { only, group } = {}) {
  // `group` keeps tasks generated for another purpose (verification) apart
  // from the ones a live run is using.
  const skillTasksDir = group ? join(tasksDir, group, skill) : join(tasksDir, skill);
  rmSync(skillTasksDir, { recursive: true, force: true });
  for (const item of loadCases(skill)) {
    if (only && !only.includes(item.id)) continue;
    const taskDir = join(skillTasksDir, item.id);
    mkdirSync(join(taskDir, 'environment'), { recursive: true });
    mkdirSync(join(taskDir, 'tests'), { recursive: true });
    writeFileSync(join(taskDir, 'instruction.md'), `${item.prompt}\n`);
    writeFileSync(join(taskDir, 'task.toml'), TASK_TOML(skill, item.id));
    cpSync(join(evalsDir, 'Dockerfile'), join(taskDir, 'environment', 'Dockerfile'));
    cpSync(join(evalsDir, skill, 'fixtures', item.fixture), join(taskDir, 'environment', 'project'), { recursive: true });
    writeFileSync(join(taskDir, 'tests', 'test.sh'), TEST_SH);
    chmodSync(join(taskDir, 'tests', 'test.sh'), 0o755);
    cpSync(join(evalsDir, 'grader.py'), join(taskDir, 'tests', 'grader.py'));
    writeFileSync(join(taskDir, 'tests', 'case.json'), `${JSON.stringify(item, null, 2)}\n`);
    if (hasSolution(skill, item.id)) {
      cpSync(join(evalsDir, skill, 'solutions', item.id), join(taskDir, 'solution'), { recursive: true });
      writeFileSync(join(taskDir, 'solution', 'solve.sh'), SOLVE_SH);
      chmodSync(join(taskDir, 'solution', 'solve.sh'), 0o755);
    }
  }
  return skillTasksDir;
}
