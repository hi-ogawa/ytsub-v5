# Write the per-step caption features as CSV, one row per 0.25 s step, without deciding anything.
import argparse
import csv
import json
import sys
from collections import deque

import cv2
import numpy as np

from video import FPS, MIN_PIXELS, WIDEN, kept, static_map, steps

GROUP = np.ones((15, 31), np.uint8)  # joins the letters of one caption line into a cluster
MASKS = ("o", "b")  # outline, box
LAGS = {"1s": FPS, "2s": 2 * FPS}  # steps back for the slow comparisons
STEP = ("letters", "in_static", "kept", "kept_1s", "kept_2s", "gone", "new")
REGION = ("letters", "kept", "kept_1s", "kept_2s", "gone", "new", "box")


def main():
    p = argparse.ArgumentParser(description="Print the per-step caption features as CSV and write the static overlay boxes as JSON.")
    p.add_argument("video")
    p.add_argument("--start", type=float, help="window start in seconds")
    p.add_argument("--dur", type=float, help="window length in seconds")
    p.add_argument("--region", action="append", default=[], metavar="NAME=X,Y,W,H",
                   help="also write features for the letters inside this box of the 1280x720 frame, such as a caption bar; repeatable")
    p.add_argument("--region-mask", choices=MASKS, default="b", help="the mask the region features use")
    p.add_argument("--static", default="static.json", help="output path for the static overlay boxes")
    a = p.parse_args()
    regions = dict(parse_region(r) for r in a.region)
    w = csv.DictWriter(sys.stdout, columns(regions))
    w.writeheader()
    for row in rows(a.video, a.start, a.dur, regions, MASKS.index(a.region_mask)):
        w.writerow(row)
    with open(a.static, "w") as f:
        json.dump({"boxes": clusters(static_map(a.video).any(axis=0).astype(np.uint8))}, f)


def parse_region(s):
    name, box = s.split("=")
    return name, tuple(int(v) for v in box.split(","))


def columns(regions):
    return ["t", *[f"{name}_{k}" for name in STEP for k in MASKS], "scene", *[f"clusters_{k}" for k in MASKS],
            *[f"{name}_{r}" for r in regions for name in REGION]]


def rows(video, start=None, dur=None, regions=None, region_mask=1):
    regions = regions or {}
    back = deque(maxlen=max(LAGS.values()))  # masks of the steps before this one, newest last
    small_prev = None
    for s in steps(video, start, dur):
        m = s["masks"]
        f = step_features(s["frame"], m, s["raw"], s["static"], back[-1] if back else None, small_prev)
        small_prev = f.pop("small")
        row = {"t": round(s["t"], 2), "scene": num(f["scene"])}
        for j, k in enumerate(MASKS):
            row[f"clusters_{k}"] = json.dumps(f[f"clusters_{k}"])
            for name in ("letters", "in_static", "kept", "gone", "new"):
                row[f"{name}_{k}"] = num(f[name][j])
            for lag, n in LAGS.items():
                row[f"kept_{lag}_{k}"] = num(kept(back[-n][j], m[j]) if len(back) >= n else None)
        for r, box in regions.items():
            f = region_features(m[region_mask], [b[region_mask] for b in back], box)
            row.update({f"{name}_{r}": v for name, v in f.items()})
        back.append(m)
        yield row


def step_features(frame, m, raw, static, prev, small_prev):
    """The features of one step against the step before it."""
    small = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (64, 36), interpolation=cv2.INTER_AREA).astype(np.float32)
    f = {
        "letters": [int(x.sum()) for x in m],
        "in_static": [int((x & static).sum()) for x in raw],
        "kept": [None, None], "gone": [None, None], "new": [None, None],
        "clusters_o": clusters(m[0]), "clusters_b": clusters(m[1]),
        "scene": None if small_prev is None else float(np.abs(small - small_prev).mean() / 255),
        "small": small,
    }
    if prev is not None:
        for k in (0, 1):
            f["kept"][k] = kept(prev[k], m[k])
            f["gone"][k] = int((prev[k] & (1 - cv2.dilate(m[k], WIDEN))).sum())
            f["new"][k] = int((m[k] & (1 - cv2.dilate(prev[k], WIDEN))).sum())
    return f


def region_features(mask, back, box):
    """The step features of one mask inside a box, so that changes elsewhere in the frame, such as camera cuts, don't count."""
    x, y, w, h = box
    cur, back = mask[y:y + h, x:x + w], [b[y:y + h, x:x + w] for b in back]
    ys, xs = np.nonzero(cur)
    prev = back[-1] if back else None
    f = {
        "letters": int(cur.sum()),
        "kept": num(kept(prev, cur) if prev is not None else None),
        **{f"kept_{lag}": num(kept(back[-n], cur) if len(back) >= n else None) for lag, n in LAGS.items()},
        "gone": "" if prev is None else int((prev & (1 - cv2.dilate(cur, WIDEN))).sum()),
        "new": "" if prev is None else int((cur & (1 - cv2.dilate(prev, WIDEN))).sum()),
        "box": "" if len(xs) < MIN_PIXELS else json.dumps(
            [int(xs.min()) + x, int(ys.min()) + y, int(xs.max() - xs.min()) + 1, int(ys.max() - ys.min()) + 1]),
    }
    return f


def clusters(mask):
    n, labels, stats, _ = cv2.connectedComponentsWithStats(cv2.dilate(mask, GROUP))
    boxes = []
    for j in range(1, n):
        x, y, w, h, _ = stats[j]
        if mask[labels == j].sum() >= MIN_PIXELS:
            boxes.append([int(x), int(y), int(w), int(h)])
    return boxes


def num(v):
    return "" if v is None else round(v, 3) if isinstance(v, float) else v


if __name__ == "__main__":
    main()
