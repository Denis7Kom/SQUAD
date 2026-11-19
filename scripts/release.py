import re
import subprocess
from datetime import date
from pathlib import Path


def git(*args):
    return subprocess.check_output(["git", *args], text=True, encoding="utf-8").strip()


def replace_once(path, pattern, replacement):
    source = path.read_bytes().decode("utf-8")
    updated, count = re.subn(pattern, replacement, source)
    if count != 1:
        raise ValueError(f"Expected one version marker in {path}, found {count}")
    return updated.encode("utf-8")


version_path = Path("VERSION")
current = version_path.read_text().strip()
major, minor, patch, stage = re.fullmatch(
    r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-alpha|-beta)?", current
).groups()
tag = f"v{current}"
if not git("tag", "--list", tag):
    # A reviewed PR may prepare VERSION and CHANGELOG before the release workflow.
    # Anchor an untagged version to its latest VERSION commit, not its original addition.
    baseline = git("log", "--first-parent", "-1", "--format=%H", "--", "VERSION")
    if not baseline or git("show", f"{baseline}:VERSION") != current:
        raise ValueError(f"Cannot identify baseline for {tag}")
    git("tag", tag, baseline)

bump = 0
changes = []
for commit in git("rev-list", "--reverse", f"{tag}..HEAD").splitlines():
    message = git("show", "-s", "--format=%B", commit)
    subject = message.splitlines()[0] if message else ""
    header = re.match(r"^\w+(?:\([^()\n]+\))?(!)?: ", subject)
    if (header and header[1]) or re.search(r"^BREAKING[ -]CHANGE: \S", message, re.M):
        rank = 3
    elif re.match(r"^feat(?:\([^()\n]+\))?: ", subject):
        rank = 2
    elif re.match(r"^fix(?:\([^()\n]+\))?: ", subject):
        rank = 1
    else:
        continue
    bump = max(bump, rank)
    changes.append(f"- {subject} ({commit[:7]})")

if bump:
    numbers = [int(major), int(minor), int(patch)]
    component = 3 - bump
    numbers[component] += 1
    numbers[component + 1:] = [0] * (2 - component)
    version = ".".join(map(str, numbers)) + (stage or "")
    next_tag = f"v{version}"
    if git("tag", "--list", next_tag):
        raise ValueError(f"Tag already exists: {next_tag}")
    index = Path("index.html")
    worker = Path("sw.js")
    changelog = Path("CHANGELOG.md")
    html = replace_once(index, r'(?<=aria-label="Версия проекта">ver\. )[^<]+', version)
    cache = replace_once(worker, r'(?<=const CACHE="squad-shell-)[^"]+', version)
    heading, prior = changelog.read_text(encoding="utf-8").split("\n\n", 1)
    notes = "\n".join(changes)
    index.write_bytes(html)
    worker.write_bytes(cache)
    version_path.write_text(version + "\n")
    changelog.write_text(
        f"{heading}\n\n## {version} — {date.today().isoformat()}\n\n{notes}\n\n{prior}",
        encoding="utf-8",
    )
    git("add", "VERSION", "CHANGELOG.md", "index.html", "sw.js")
    git("commit", "-m", f"chore(release): {version}")
    git("tag", next_tag)
    git("push", "--atomic", "origin", "HEAD:refs/heads/main",
        f"refs/tags/{tag}", f"refs/tags/{next_tag}")
else:
    git("push", "origin", f"refs/tags/{tag}")
