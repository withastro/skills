#!/usr/bin/env python3
"""Deterministic verifier for the eval cases.

Runs inside the trial container after the agent finishes. Both arms (with and
without the skill) are graded by the same checks, so the difference between
them is the skill's measured effect.

Inputs:
- /tests/case.json: the case from evals/<skill>/cases.json.
- The project the agent edited, in the container's working directory (/app).

Output: /logs/verifier/reward.json with scores from 0 to 1:
- `file_checks`: fraction of the case's `file_checks` that hold. Each check
  names a file or glob and regular expressions that must or must not match.
- `astro_build`: 1 when `astro build` succeeds, 0 when it fails. For cases
  with `"build_check": true` or with `output_checks`.
- `output_checks`: fraction of the case's `output_checks` that hold in the
  build output directory (`dist/`). Same shape as file checks. These catch
  mistakes that build without error but produce the wrong site. 0 when the
  build fails.
- `reward`: the mean of the scores above.

A check is `{"path": ..., "exists": false}`, or `{"path": ..., "contains":
[...], "not_contains": [...]}`, or `{"any_of": [check, ...]}`, which passes
when at least one of its checks does.

Details of every check are written to /logs/verifier/details.json.

Standard library only.
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

CASE_JSON = Path(os.environ.get("EVAL_CASE_JSON", "/tests/case.json"))
PROJECT_DIR = Path(os.environ.get("EVAL_PROJECT_DIR", "/app"))
OUTPUT_DIR = Path(os.environ.get("EVAL_OUTPUT_DIR", "/logs/verifier"))

IGNORED_DIRS = {"node_modules", "dist", ".astro", ".git", ".vercel", ".netlify", ".wrangler"}
INSTALL_TIMEOUT_SEC = 300
BUILD_TIMEOUT_SEC = 240


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
        if any(part in IGNORED_DIRS for part in path.relative_to(project).parts):
            continue
        files.append(path)
    return sorted(files)


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def run_file_check(project: Path, check: Dict[str, Any]) -> Tuple[bool, str]:
    """Evaluate one check against the files under `project`. Returns (passed, reason)."""
    if "any_of" in check:
        reasons = []
        for alternative in check["any_of"]:
            passed, reason = run_file_check(project, alternative)
            if passed:
                return True, "ok"
            reasons.append(reason)
        return False, "none of: " + "; ".join(reasons)
    pattern = check.get("path", "")
    files = matching_files(project, pattern)

    if not check.get("exists", True):
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


def grade_file_checks(project: Path, checks: List[Dict[str, Any]]) -> Dict[str, Any]:
    results = []
    for index, check in enumerate(checks):
        passed, reason = run_file_check(project, check)
        results.append({"id": check.get("id", "check-{}".format(index + 1)), "passed": passed, "reason": reason})
    passed_count = sum(1 for result in results if result["passed"])
    return {"score": passed_count / len(checks), "checks": results}


def command_environment() -> Dict[str, str]:
    """Minimal environment for npm and Astro: named variables only."""
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
    return completed.returncode == 0, completed.stdout.decode("utf-8", errors="replace")[-2000:]


def grade_build(project: Path) -> Optional[Dict[str, Any]]:
    """Install dependencies and run `astro build`. None when it cannot be attempted."""
    npm = shutil.which("npm")
    npx = shutil.which("npx")
    if not npm or not npx or not (project / "package.json").is_file():
        return None
    # The agent may have added dependencies without installing them. Installing
    # here means a correct package.json is enough; it is quick when nothing changed.
    installed, output = run_command([npm, "install", "--no-audit", "--no-fund", "--loglevel=error"], project, INSTALL_TIMEOUT_SEC)
    if not installed:
        return {"score": 0.0, "reason": "npm install failed: " + output}
    built, output = run_command([npx, "--no-install", "astro", "build"], project, BUILD_TIMEOUT_SEC)
    return {"score": 1.0 if built else 0.0, "reason": "astro build succeeded" if built else "astro build failed: " + output}


def main() -> None:
    case = json.loads(CASE_JSON.read_text(encoding="utf-8"))
    scores = {}  # type: Dict[str, float]
    details = {"case": case.get("id")}  # type: Dict[str, Any]

    checks = case.get("file_checks") or []
    if checks:
        result = grade_file_checks(PROJECT_DIR, checks)
        scores["file_checks"] = result["score"]
        details["file_checks"] = result

    output_checks = case.get("output_checks") or []
    if case.get("build_check") or output_checks:
        result = grade_build(PROJECT_DIR)
        if result is not None:
            scores["astro_build"] = result["score"]
            details["astro_build"] = result
            if output_checks and result["score"] == 1.0:
                result = grade_file_checks(PROJECT_DIR / "dist", output_checks)
                scores["output_checks"] = result["score"]
                details["output_checks"] = result
            elif output_checks:
                scores["output_checks"] = 0.0
                details["output_checks"] = {"score": 0.0, "reason": "build failed"}

    reward = dict(scores)
    reward["reward"] = sum(scores.values()) / len(scores) if scores else 1.0

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "reward.json").write_text(json.dumps(reward, indent=2), encoding="utf-8")
    (OUTPUT_DIR / "details.json").write_text(json.dumps(details, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
