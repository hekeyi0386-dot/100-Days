#!/usr/bin/env python3
"""Stamp a fresh cache-busting version into index.html (module map, css, scripts).

  python3 tools/bump_version.py

Run it before pushing a change to anything in src/, style.css, data.js or config.js, so browsers and
CDNs fetch the new files instead of serving stale copies. Three.js (?v=187) is left alone."""
import re, time, pathlib
p = pathlib.Path(__file__).resolve().parent.parent / "index.html"
s = p.read_text()
stamp = time.strftime("%Y%m%d%H%M")
s2 = re.sub(r"\?v=(?!187\b)[0-9a-z]+", "?v=" + stamp, s)
p.write_text(s2)
print("version ->", stamp, f"({len(re.findall(stamp, s2))} references)")
