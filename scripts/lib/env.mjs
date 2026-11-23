// Shared helpers for the local evaluation scripts: repository root, loading
// provider keys from .env.local, and building a child environment that holds
// only the provider settings a run needs.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Provider credentials and endpoint settings. Each run is given only the ones
// its route needs, so a maintainer's other keys never reach an unrelated run.
const PROVIDER_VARIABLES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENROUTER_API_KEY',
  'NVIDIA_API_KEY',
  'SKILL_EVAL_LLM_PROVIDER',
  'SKILL_EVAL_LLM_MODEL',
  'SKILL_EVAL_LLM_BASE_URL',
  'SKILL_EVAL_LLM_API_KEY',
  'SKILL_EVAL_EMBEDDING_PROVIDER',
  'SKILL_EVAL_EMBEDDING_MODEL',
  'SKILL_EVAL_EMBEDDING_BASE_URL',
  'SKILL_EVAL_EMBEDDING_API_KEY',
];

// Loads KEY=value lines from .env.local. Values already in the shell win.
export function loadLocalEnv() {
  const path = join(root, '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, name, raw] = match;
    const value = raw.replace(/^(['"])(.*)\1$/, '$2');
    if (value && process.env[name] === undefined) process.env[name] = value;
  }
}

// The current environment without any provider settings, plus `settings`.
export function providerEnv(settings) {
  const env = { ...process.env };
  for (const name of PROVIDER_VARIABLES) delete env[name];
  return { ...env, ...settings };
}

export function fail(message) {
  console.error(message);
  process.exit(2);
}
