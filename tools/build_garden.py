#!/usr/bin/env python3
"""Turn a folder of "<n>s Large.jpeg" / "<n>p Large.jpeg" files into the garden.

  python3 tools/build_garden.py "S for Sketches；P for Photos"

For every day n it writes assets/dayNN-sketch.webp (ink on transparent) and
assets/dayNN-photo.webp, then regenerates data.js. Titles / captions are read
from captions.json (optional): {"3": {"title": "...", "caption": "..."}}.
Existing outputs are kept; pass --rebuild to re-encode everything. Site settings
(start date, constellations) live in config.js, which this script never touches.
"""
import hashlib, json, os, re, sys
import numpy as np
from PIL import Image, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOTAL = 100
PAT = re.compile(r"^(\d+)\s*([sp])\b.*\.(jpe?g|png|webp)$", re.I)


def sketch_to_ink(im):
    """White paper -> transparent, black ink -> opaque (works for jpeg noise too).
    A small source is first enlarged (Lanczos) and only then thresholded, so its outlines stay smooth when it is shown large."""
    L = ImageOps.exif_transpose(im).convert("L")
    if max(L.size) > 900:
        L.thumbnail((900, 900), Image.LANCZOS)
    elif max(L.size) < 900:
        k = 900 / max(L.size)
        L = L.resize((round(L.width * k), round(L.height * k)), Image.LANCZOS)
    a = L.point(lambda v: 0 if v >= 235 else 255 if v <= 40 else int((235 - v) * 255 / 195))
    out = Image.merge("RGBA", [Image.new("L", L.size, 24)] * 3 + [a])
    return out


def photo_small(im):
    im = ImageOps.exif_transpose(im).convert("RGB")
    if max(im.size) > 1200:
        im.thumbnail((1200, 1200), Image.LANCZOS)
    elif max(im.size) < 800:                                   # a tiny original: enlarge it well rather than leave it to the browser
        k = 1200 / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2.0, percent=70, threshold=2))
    return im


def flower_head(ink, size=384):
    """Round, softly feathered flower head for the 3D garden (ink on transparent)."""
    im = ink.convert("RGBA")
    w, h = im.size; m = min(w, h)
    im = im.crop(((w - m) // 2, (h - m) // 2, (w - m) // 2 + m, (h - m) // 2 + m)).resize((size, size), Image.LANCZOS)
    yy, xx = np.mgrid[0:size, 0:size]
    r = np.hypot(xx - (size - 1) / 2, yy - (size - 1) / 2) / (size / 2)
    feather = np.clip((1.0 - r) / 0.34, 0, 1)            # solid inside 0.66R, fades to nothing at R
    feather = feather * feather * (3 - 2 * feather)
    a = np.asarray(im.getchannel("A"), dtype=np.float32) * feather
    out = im.copy(); out.putalpha(Image.fromarray(a.astype(np.uint8)))
    return out


def square_photo(photo, size=640):
    """The colour picture as a plain square (the same crop the round head uses, so the circle sits exactly inside it)."""
    im = photo.convert("RGB")
    w, h = im.size; m = min(w, h)
    top = int((h - m) * 0.4)                                    # a touch above centre; subjects sit high
    im = im.crop(((w - m) // 2, top, (w - m) // 2 + m, top + m))
    if m < size:
        return im.resize((size, size), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6, percent=60, threshold=2))
    return im.resize((size, size), Image.LANCZOS)


def tag(path):
    return hashlib.md5(open(path, "rb").read()).hexdigest()[:8]


def main(folder, rebuild=False):
    found = {}
    for f in os.listdir(folder):
        m = PAT.match(f)
        if m:
            found.setdefault(int(m.group(1)), {})[m.group(2).lower()] = os.path.join(folder, f)
    days = sorted(d for d, v in found.items() if "s" in v and "p" in v)
    skipped = sorted(set(found) - set(days))
    caps = {}
    cp = os.path.join(ROOT, "captions.json")
    if os.path.exists(cp):
        caps = json.load(open(cp, encoding="utf8"))

    os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
    entries = []
    for d in days:
        s_out = f"assets/day{d:02d}-sketch.webp"
        p_out = f"assets/day{d:02d}-photo.webp"
        t_out = f"assets/heads/day{d:02d}.webp"
        os.makedirs(os.path.join(ROOT, "assets", "heads"), exist_ok=True)
        if rebuild or not os.path.exists(os.path.join(ROOT, s_out)):
            sketch_to_ink(Image.open(found[d]["s"])).save(os.path.join(ROOT, s_out), quality=88, method=6, alpha_quality=100)
        if rebuild or not os.path.exists(os.path.join(ROOT, p_out)):
            photo_small(Image.open(found[d]["p"])).save(os.path.join(ROOT, p_out), quality=82, method=6)
        if rebuild or not os.path.exists(os.path.join(ROOT, t_out)):
            flower_head(Image.open(os.path.join(ROOT, s_out))).save(os.path.join(ROOT, t_out), quality=88, method=6, alpha_quality=100)
        sq_out = f"assets/squares/day{d:02d}.webp"
        os.makedirs(os.path.join(ROOT, "assets", "squares"), exist_ok=True)
        if rebuild or not os.path.exists(os.path.join(ROOT, sq_out)):
            square_photo(Image.open(os.path.join(ROOT, p_out))).save(os.path.join(ROOT, sq_out), quality=84, method=6)
        c = caps.get(str(d), {})
        entries.append({
            "day": d,
            "title": c.get("title", ""),
            "sketch": f"{s_out}?v={tag(os.path.join(ROOT, s_out))}",
            "photo": f"{p_out}?v={tag(os.path.join(ROOT, p_out))}",
            "head": f"{t_out}?v={tag(os.path.join(ROOT, t_out))}",
            "square": f"{sq_out}?v={tag(os.path.join(ROOT, sq_out))}",
            "caption": c.get("caption", ""),
        })

    body = ",\n".join("    " + json.dumps(e, ensure_ascii=False) for e in entries)
    open(os.path.join(ROOT, "data.js"), "w", encoding="utf8").write(
        "// Generated by tools/build_garden.py. Titles and captions live in captions.json.\n"
        "window.GARDEN = {\n"
        f"  total: {TOTAL},\n"
        "  entries: [\n" + body + ",\n  ],\n};\n"
    )
    print(f"built {len(days)} days: {days[0]}..{days[-1]}")
    if skipped:
        print("skipped (need both sketch and photo):", skipped)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(args[0] if args else "S for Sketches；P for Photos", rebuild="--rebuild" in sys.argv)
