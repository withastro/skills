#!/usr/bin/env python3
"""Deterministic grader for the withastro/skills eval datasets.

SkillEvaluator stages this file into each trial and runs it after the agent
finishes (grading mode `default_plus_custom`). It adds two custom metrics next
to the standard judged dimensions:

- `file_checks`: fraction of the case's `file_checks` that hold in the project
  the agent edited. Each check names a file (or glob) and regular expressions
  that must or must not match.
- `astro_build`: 1.0 when `astro build` succeeds in the project, 0.0 when it
  fails. Only reported for cases with `"build_check": true`, and only when
  Node.js is available and dependencies can be installed.

Both arms (with and without the skill) are graded by the same checks, so the
difference between them is the skill's measured effect.

The same file is used by every skill in this repository. Edit
`scripts/grader.py` and run `node scripts/sync-grader.mjs`; do not edit the
copies under `skills/*/evals/`.

Standard library only: the default trial image has no extra packages.
"""

from __future__ import annotations

import glob
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ENTRY_JSON = Path(os.environ.get("HARBOR_ENTRY_JSON", "/tests/entry.json"))
REWARD_JSON = Path(os.environ.get("HARBOR_REWARD_JSON", "/logs/verifier/reward.json"))
REWARD_TXT = Path(os.environ.get("HARBOR_REWARD_TXT", "/logs/verifier/reward.txt"))

IGNORED_DIRS = {"node_modules", "dist", ".astro", ".git", ".vercel", ".netlify", ".wrangler"}
INSTALL_TIMEOUT_SEC = int(os.environ.get("ASTRO_EVAL_INSTALL_TIMEOUT_SEC", "300"))
BUILD_TIMEOUT_SEC = int(os.environ.get("ASTRO_EVAL_BUILD_TIMEOUT_SEC", "240"))


def find_input_root() -> Optional[Path]:
    """Locate the directory the fixtures were staged into."""
    candidates = [
        os.environ.get("ASTRO_EVAL_INPUT_DIR"),
        "/workspace/input",
        str(Path.cwd() / "input"),
        str(Path.cwd()),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_dir():
            return Path(candidate)
    return None


def matching_files(project: Path, pattern: str) -> List[Path]:
    """Files under `project` matching a relative path or glob, skipping build output."""
    matches = glob.glob(str(project / glob.escape(pattern)), recursive=True)
    if not matches:
        matches = glob.glob(str(project / pattern), recursive=True)
    files = []
    for match in matches:
        path = Path(match)
        if not path.is_file():
            continue
        relative_parts = path.relative_to(project).parts
        if any(part in IGNORED_DIRS for part in relative_parts):
            continue
        files.append(path)
    return sorted(files)


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def run_file_check(project: Path, check: Dict[str, Any]) -> Tuple[bool, str]:
    """Evaluate one file check. Returns (passed, reason)."""
    pattern = check.get("path", "")
    files = matching_files(project, pattern)
    should_exist = check.get("exists", True)

    if not should_exist:
        if files:
            return False, "{} should not exist".format(pattern)
        return True, "{} is absent".format(pattern)

    if not files:
        return False, "{} not found".format(pattern)

    texts = [read_text(path) for path in files]
    for expression in check.get("contains", []):
        if not any(re.search(expression, text, re.MULTILINE) for text in texts):
            return False, "{} does not match /{}/".format(pattern, expression)
    for expression in check.get("not_contains", []):
        if any(re.search(expression, text, re.MULTILINE) for text in texts):
            return False, "{} still matches /{}/".format(pattern, expression)
    return True, "ok"


def grade_file_checks(project: Path, checks: List[Dict[str, Any]]) -> Tuple[float, Dict[str, Any]]:
    results = []
    passed = 0
    for index, check in enumerate(checks):
        ok, reason = run_file_check(project, check)
        passed += 1 if ok else 0
        results.append(
            {
                "id": check.get("id", "check-{}".format(index + 1)),
                "passed": ok,
                "reason": reason,
            }
        )
    score = passed / len(checks)
    failed = [result["id"] + ": " + result["reason"] for result in results if not result["passed"]]
    reason = "{} of {} file checks passed".format(passed, len(checks))
    if failed:
        reason += "; failed: " + "; ".join(failed)
    return score, {"score": score, "reason": reason, "checks": results}


def command_environment() -> Dict[str, str]:
    """Minimal environment for npm and Astro: named variables only, no credentials."""
    environment = {"CI": "1", "ASTRO_TELEMETRY_DISABLED": "1"}
    for name in ("PATH", "HOME", "TMPDIR", "LANG"):
        value = os.environ.get(name)
        if value:
            environment[name] = value
    return environment


def run_command(command: List[str], cwd: Path, timeout: int) -> Tuple[bool, str]:
    try:
        completed = subprocess.run(
            command,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            env=command_environment(),
        )
    except subprocess.TimeoutExpired:
        return False, "timed out after {}s".format(timeout)
    except OSError as error:
        return False, str(error)
    output = completed.stdout.decode("utf-8", errors="replace")
    return completed.returncode == 0, output[-1500:]


def grade_build(project: Path) -> Optional[Dict[str, Any]]:
    """Run `astro build`. Returns None when the build cannot be attempted."""
    npm = shutil.which("npm")
    npx = shutil.which("npx")
    if not npm or not npx or not (project / "package.json").is_file():
        return None
    if not (project / "node_modules").is_dir():
        installed, output = run_command(
            [npm, "install", "--no-audit", "--no-fund", "--loglevel=error"], project, INSTALL_TIMEOUT_SEC
        )
        if not installed:
            # A failed install is an environment problem (no network, registry
            # error), not evidence about the agent's work, so report nothing.
            return None
    built, output = run_command([npx, "--no-install", "astro", "build"], project, BUILD_TIMEOUT_SEC)
    return {
        "score": 1.0 if built else 0.0,
        "reason": "astro build succeeded" if built else "astro build failed: " + output,
    }


def main() -> None:
    entry = json.loads(ENTRY_JSON.read_text(encoding="utf-8")) if ENTRY_JSON.exists() else {}
    custom_metrics = {}  # type: Dict[str, float]
    details = {}  # type: Dict[str, Any]

    input_root = find_input_root()
    project_name = entry.get("project")
    project = input_root / project_name if input_root and project_name else input_root

    checks = entry.get("file_checks") or []
    if checks and project and project.is_dir():
        score, detail = grade_file_checks(project, checks)
        custom_metrics["file_checks"] = score
        details["file_checks"] = detail
    elif checks:
        custom_metrics["file_checks"] = 0.0
        details["file_checks"] = {"score": 0.0, "reason": "project directory not found"}

    if entry.get("build_check") and project and project.is_dir():
        build = grade_build(project)
        if build is not None:
            custom_metrics["astro_build"] = build["score"]
            details["astro_build"] = build

    overall = sum(custom_metrics.values()) / len(custom_metrics) if custom_metrics else 1.0
    reward = {"overall": overall, "custom_metrics": custom_metrics, "details": details}

    REWARD_JSON.parent.mkdir(parents=True, exist_ok=True)
    REWARD_JSON.write_text(json.dumps(reward, indent=2), encoding="utf-8")
    REWARD_TXT.write_text(str(overall), encoding="utf-8")


if __name__ == "__main__":
    main()
