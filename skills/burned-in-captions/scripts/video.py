# Decode a video at the step rate and find caption letters in each frame, with no decisions about captions.
import os
import subprocess

import cv2
import numpy as np

FPS, W, H = 4, 1280, 720
MIN_PIXELS = 300  # fewer letter pixels than this is too little to compare
WIDEN = np.ones((5, 5), np.uint8)  # absorbs 2 px of jitter and compression noise


def steps(video, start=None, dur=None):
    """Yield each 0.25 s step's frame and letter masks, with static overlays dropped, and the masks before dropping."""
    static = static_map(video)
    for i, frame in enumerate(read_frames(video, FPS, start, dur)):
        raw = text_masks(frame)
        m = raw.copy()
        m[static] = 0
        yield {"i": i, "t": (start or 0) + i / FPS, "frame": frame, "masks": m, "raw": raw, "static": static}


def read_frames(video, fps, start=None, dur=None):
    window = (["-ss", str(start)] if start is not None else []) + (["-t", str(dur)] if dur is not None else [])
    p = subprocess.Popen(["ffmpeg", "-v", "error", *window, "-i", video, "-vf", f"fps={fps},scale={W}:{H}",
                          "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
    while len(b := p.stdout.read(W * H * 3)) == W * H * 3:
        yield np.frombuffer(b, np.uint8).reshape(H, W, 3)


def text_masks(img):
    # Caption fill with dark around it, from an outline (dark nearby) or from a box (dark on most sides, unlike scene edges).
    fill, dark, near_dark, dark_share = mask_parts(img)
    return np.stack([fill & near_dark, fill & (dark_share > 0.3)]).astype(np.uint8)


def mask_parts(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    v, s = hsv[..., 2], hsv[..., 1]
    fill = ((v > 200) & (s < 60)) | ((v > 150) & (s > 120))  # white, or saturated colors
    dark = (v < 70).astype(np.uint8)
    near_dark = cv2.dilate(dark, np.ones((10, 10), np.uint8)) > 0
    dark_share = cv2.blur(dark.astype(np.float32), (11, 11))
    return fill, dark, near_dark, dark_share


def static_map(video):
    # Logos and other overlays that never change make every frame look alike, so drop pixels
    # that are text in most frames of the whole video. Cached next to the video.
    path = video + ".static.npy"
    if os.path.exists(path):
        return np.load(path)
    sample = [text_masks(f) for f in read_frames(video, 0.5)]
    static = np.mean(sample, axis=0) > 0.5
    np.save(path, static)
    return static


def kept(old, new):
    # Share of the old letter pixels still covered by new letters: near 1 when text is only added.
    n = old.sum()
    return None if n < MIN_PIXELS else float((old & cv2.dilate(new, WIDEN)).sum() / n)
