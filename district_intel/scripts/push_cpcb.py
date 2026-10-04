"""
Send this PC's CPCB files to the `cpcb` branch of the dataload repo (github.com/ApshanaSP/farmwisenew-dataload),
where GitHub's hourly build picks them up. CPCB is the one feed GitHub's machines cannot reach, so the PC collects
it (scripts/run_intel.bat) and GitHub builds the store from every feed and uploads it to AWS.

Uses this PC's own git login. The branch holds a single commit, replaced on every push; this repo's branches,
index and working tree are not touched. Nothing is sent when the files have not changed since the last push.

    python scripts/push_cpcb.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "cpcb_air_quality_collector" / "data"
URL = "https://github.com/ApshanaSP/farmwisenew-dataload.git"
LAST = REPO / "district_intel" / "output" / "state" / "cpcb_pushed.txt"  # tree id of the last push


def git(*args: str, env: dict | None = None, timeout: int = 60) -> str:
    p = subprocess.run(["git", *args], cwd=REPO, env=env, capture_output=True, text=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError(f"git {args[0]}: {(p.stderr or p.stdout).strip()[:300]}")
    return p.stdout.strip()


def main() -> int:
    stamp = time.strftime("%d %b %Y %H:%M")
    files = sorted(p.relative_to(REPO).as_posix() for p in DATA.glob("*.csv"))
    if not files:
        print(f"{stamp} push_cpcb: no CPCB files in {DATA}")
        return 1
    with tempfile.TemporaryDirectory() as tmp:  # a throwaway index, so the repo's own staging area stays as it is
        env = {**os.environ, "GIT_INDEX_FILE": str(Path(tmp) / "index")}
        git("add", "--force", "--", *files, env=env)
        tree = git("write-tree", env=env)
    if LAST.exists() and LAST.read_text(encoding="utf-8").strip() == tree:
        print(f"{stamp} push_cpcb: unchanged since the last push")
        return 0
    commit = git("commit-tree", tree, "-m", f"CPCB files from the PC, {stamp}")
    # never wait for a login prompt: this runs from Task Scheduler with nobody at the screen
    quiet = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never"}
    git("push", "--force", "--quiet", URL, f"{commit}:refs/heads/cpcb", env=quiet, timeout=180)
    LAST.write_text(tree, encoding="utf-8")
    print(f"{stamp} push_cpcb: sent {len(files)} files ({commit[:8]})")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, subprocess.TimeoutExpired) as e:
        print(f"{time.strftime('%d %b %Y %H:%M')} push_cpcb: FAILED ({e}); tried again next hour")
        sys.exit(1)
