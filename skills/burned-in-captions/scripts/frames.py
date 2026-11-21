# Tile frames at given times into sheets for reading, each tile labelled with its time: full frames, or a crop at a larger scale.
import argparse
import json
import os
import subprocess
import sys

import cv2
import numpy as np

from video import FPS, H, W, read_frames

SHEET_W, SHEET_H = 1920, 1350  # about 3,400 image tokens per sheet
SCALE, CROP_SCALE = 0.375, 0.75  # full frames at 480x270, crops at twice that
GAP = 10  # seconds between requested times that start a separate decode


def main():
    p = argparse.ArgumentParser(description="Tile frames at the given times into sheets and print each sheet's times, scale, and crop origin as JSON.")
    p.add_argument("video")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--at", type=float, nargs="+", help="times in seconds, rounded to the 0.25 s step grid")
    g.add_argument("--spread", type=int, help="this many times spread evenly across the whole video")
    p.add_argument("--crop", metavar="X,Y,W,H", help="tile only this box of the 1280x720 frame, for a closer look")
    p.add_argument("--scale", type=float, help=f"tile size against the frame, {SCALE} by default, or {CROP_SCALE} with --crop")
    p.add_argument("--out", default="sheets", help="directory for the sheet images")
    a = p.parse_args()
    crop = tuple(int(v) for v in a.crop.split(",")) if a.crop else (0, 0, W, H)
    scale = a.scale or (CROP_SCALE if a.crop else SCALE)
    tw, th = round(crop[2] * scale), round(crop[3] * scale)
    cols = max(1, SHEET_W // tw)
    per_sheet = cols * max(1, SHEET_H // th)
    times = spread(a.video, a.spread) if a.spread else sorted({snap(t) for t in a.at})
    frames = grab(a.video, times)
    os.makedirs(a.out, exist_ok=True)
    sheets = []
    x, y, w, h = crop
    for n in range(0, len(times), per_sheet):
        path = f"{a.out}/sheet-{n // per_sheet:03d}.jpg"
        part = times[n:n + per_sheet]
        cv2.imwrite(path, tile([(t, frames[t][y:y + h, x:x + w]) for t in part], tw, th, cols), [cv2.IMWRITE_JPEG_QUALITY, 90])
        sheets.append({"sheet": path, "times": part, "scale": scale, "origin": [x, y]})
    json.dump(sheets, sys.stdout, indent=1)
    print()


def snap(t):
    return round(t * FPS) / FPS


def spread(video, n):
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video],
                               capture_output=True, text=True, check=True).stdout)
    return [snap((k + 0.5) * dur / n) for k in range(n)]


def grab(video, times):
    """Decode at the step rate from the first time of each group, as features.py does, and keep the requested steps."""
    frames, group = {}, []
    for t in times + [None]:
        if group and (t is None or t - group[-1] > GAP):
            start = group[0]
            wanted = {round((u - start) * FPS): u for u in group}
            for i, frame in enumerate(read_frames(video, FPS, start, group[-1] - start + 1 / FPS)):
                if i in wanted:
                    frames[wanted[i]] = frame
            group = []
        if t is not None:
            group.append(t)
    return frames


def tile(items, tw, th, cols):
    rows = -(-len(items) // cols)
    sheet = np.zeros((rows * th, min(len(items), cols) * tw, 3), np.uint8)
    for n, (t, frame) in enumerate(items):
        img = cv2.resize(frame, (tw, th), interpolation=cv2.INTER_AREA)
        label = f"{t:.2f}s"
        cv2.rectangle(img, (0, 0), (12 + 13 * len(label), 30), (0, 0, 0), -1)
        cv2.putText(img, label, (6, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2, cv2.LINE_AA)
        r, c = divmod(n, cols)
        sheet[r * th:(r + 1) * th, c * tw:(c + 1) * tw] = img
    return sheet


if __name__ == "__main__":
    main()
