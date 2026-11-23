#!/usr/bin/env node
// Copies scripts/grader.py into every skill's evals/ directory. SkillEvaluator
// only stages a grader that lives inside the skill, so each skill carries a copy.
//
//   node scripts/sync-grader.mjs          write the copies
//   node scripts/sync-grader.mjs --check  exit 1 if a copy is missing or differs

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'scripts', 'grader.py'), 'utf8');
const check = process.argv.includes('--check');
const skillsDir = join(root, 'skills');
const stale = [];

for (const skill of readdirSync(skillsDir)) {
  const evalsDir = join(skillsDir, skill, 'evals');
  if (!existsSync(join(evalsDir, 'evals.json'))) continue;
  const target = join(evalsDir, 'grader.py');
  const current = existsSync(target) ? readFileSync(target, 'utf8') : undefined;
  if (current === source) continue;
  if (check) stale.push(relative(root, target));
  else {
    writeFileSync(target, source);
    console.log(`updated ${relative(root, target)}`);
  }
}

if (check && stale.length > 0) {
  console.error(`Out of date (run \`node scripts/sync-grader.mjs\`):\n${stale.map((path) => `  ${path}`).join('\n')}`);
  process.exit(1);
}
