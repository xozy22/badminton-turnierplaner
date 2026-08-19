# -*- coding: utf-8 -*-
"""H3: the changelog leaves the README.

Both files were feature documentation and release notes at once, and from
v2.7 the release notes were German prose inside the English document. A
newcomer had to scroll through 120 lines of "Hotfix: TournamentView White
Screen" to reach the installation instructions.
"""
import io

for path in ["README.md", "README_DE.md"]:
    lines = io.open(path, encoding="utf-8").read().split("\n")
    start = end = None
    for i, l in enumerate(lines):
        if start is None and l.startswith("### ") and "(v2.9.0)" in l:
            start = i
        if start is not None and l.startswith("### ") and "(v2.7.0)" in l:
            # The version block ends at the next non-version ### heading.
            for j in range(i + 1, len(lines)):
                if lines[j].startswith("### ") and "(v" not in lines[j]:
                    end = j
                    break
            break
    print("%s: versions at lines %s..%s" % (path, start, end))
    if start is None or end is None:
        continue
    block = lines[start:end]
    io.open(path + ".versions", "w", encoding="utf-8", newline="").write("\n".join(block))
    print("  extracted %d lines" % len(block))
