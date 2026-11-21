# Build a local review page for the items of a caption track the run wasn't sure of.
import argparse
import json
import os

import cv2

from frames import grab, snap

TEMPLATE = os.path.join(os.path.dirname(__file__), "review.html")


def main():
    p = argparse.ArgumentParser(description="Build a review page of the doubtful items in a caption track.")
    p.add_argument("video")
    p.add_argument("--video-id", required=True, help="YouTube ID, for the page's player")
    p.add_argument("--captions", default="captions.json")
    p.add_argument("--doubts", default="doubts.json", help="the groups and items to review")
    p.add_argument("--asr", help="a json3 subtitle track shown next to the captions")
    p.add_argument("--out", default="review", help="directory for the page and its frames")
    a = p.parse_args()
    with open(a.captions) as f:
        captions = [{"begin": c["begin"], "end": c["end"], "kind": c["kind"], "text": c["text"], "pos": c["position"]}
                    for c in json.load(f)]
    with open(a.doubts) as f:
        doubts = json.load(f)
    asr = read_json3(a.asr) if a.asr else []
    items = doubts["items"]
    for it in items:
        it["frames"] = [snap(t) for t in it.get("frames") or spread(it["begin"], it["end"])]
    os.makedirs(f"{a.out}/frames", exist_ok=True)
    frames = grab(a.video, sorted({t for it in items for t in it["frames"]}))
    for t, frame in frames.items():
        cv2.imwrite(f"{a.out}/frames/{t:.2f}.jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    data = {
        "videoId": a.video_id,
        "groups": [{"id": g["title"], "title": g["title"], "help": g["why"]} for g in doubts["groups"]],
        "items": [page_item(it, captions, asr) for it in items],
        "all": captions,
    }
    with open(TEMPLATE) as f:
        page = f.read().replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
    with open(f"{a.out}/index.html", "w") as f:
        f.write(page)
    print(f"{a.out}/index.html: {len(items)} items, {len(frames)} frames")


def read_json3(path):
    with open(path) as f:
        events = json.load(f)["events"]
    lines = []
    for e in events:
        text = "".join(s["utf8"] for s in e.get("segs", [])).replace("\n", " ").replace(">> ", "").strip()
        if text:
            begin = e["tStartMs"] / 1000
            lines.append({"begin": round(begin, 2), "end": round(begin + e.get("dDurationMs", 0) / 1000, 2), "text": text})
    return lines


def spread(begin, end):
    """Frames for an item that names none: one per few seconds of its range, up to three."""
    n = min(3, 1 + int((end - begin) // 3))
    return [begin + (end - begin) * (k + 0.5) / n for k in range(n)]


def page_item(it, captions, asr):
    overlaps = lambda x: x["end"] > it["begin"] and x["begin"] < it["end"]
    return {
        "id": f"{it['group']}-{it['begin']:g}", "group": it["group"], "begin": it["begin"], "end": it["end"], "reason": it["reason"],
        "frames": [{"t": t, "src": f"frames/{t:.2f}.jpg"} for t in it["frames"]],
        "captions": [c for c in captions if overlaps(c)],
        "asr": [line for line in asr if overlaps(line)],
    }


if __name__ == "__main__":
    main()
