import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { type AlignedRow, CaptionList } from "../components/caption-list.tsx";
import { TrackPicker } from "../components/track-picker.tsx";
import type { YTPlayer } from "../components/youtube-player.tsx";
import {
  type CaptionCue,
  type YouTubeCaptionTrack,
  fetchPlayerApi,
  fetchTrackJson3,
  parseJson3,
  pickTracks,
} from "../lib/youtube.ts";
import contentCss from "./content.css?inline";

// Adapter: wrap the page's <video> element as YTPlayer
function getVideoPlayer(): YTPlayer | null {
  const video = document.querySelector("video");
  if (!video) return null;
  return {
    playVideo: () => void video.play(),
    pauseVideo: () => video.pause(),
    seekTo: (seconds: number) => {
      video.currentTime = seconds;
    },
    getCurrentTime: () => video.currentTime,
    getPlayerState: () => (video.paused ? 2 : 1),
    destroy: () => {},
  };
}

// Simple 1:1 alignment by index (placeholder)
function alignByIndex(cues1: CaptionCue[], cues2: CaptionCue[]): AlignedRow[] {
  const len = Math.max(cues1.length, cues2.length);
  const rows: AlignedRow[] = [];
  for (let i = 0; i < len; i++) {
    const c1 = cues1[i];
    const c2 = cues2[i];
    rows.push({
      begin: c1?.begin ?? c2?.begin ?? 0,
      end: c1?.end ?? c2?.end ?? 0,
      text1: c1?.text ?? "",
      text2: c2?.text ?? "",
    });
  }
  return rows;
}

function ExtensionViewer({ videoId }: { videoId: string }) {
  const [tracks, setTracks] = useState<YouTubeCaptionTrack[]>([]);
  const [selectedVssId1, setSelectedVssId1] = useState<string>();
  const [selectedVssId2, setSelectedVssId2] = useState<string>();
  const [rows, setRows] = useState<AlignedRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [player] = useState<YTPlayer | null>(() => getVideoPlayer());

  // Fetch metadata
  useEffect(() => {
    setLoading(true);
    setError(undefined);

    fetchPlayerApi(videoId)
      .then((result) => {
        setTracks(result.captionTracks);
        const { track1, track2 } = pickTracks(result.captionTracks);
        setSelectedVssId1(track1?.vssId);
        setSelectedVssId2(track2?.vssId);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [videoId]);

  // Fetch selected tracks
  useEffect(() => {
    if (tracks.length === 0) return;
    setRows([]);

    const track1 = tracks.find((t) => t.vssId === selectedVssId1);
    const track2 = tracks.find((t) => t.vssId === selectedVssId2);

    Promise.all([
      track1 ? fetchTrackJson3(track1.baseUrl).then(parseJson3) : [],
      track2 ? fetchTrackJson3(track2.baseUrl).then(parseJson3) : [],
    ])
      .then(([cues1, cues2]) => setRows(alignByIndex(cues1, cues2)))
      .catch((err) => setError(String(err)));
  }, [tracks, selectedVssId1, selectedVssId2]);

  // RAF loop — sync with page video element
  useEffect(() => {
    if (!player || rows.length === 0) return;
    let rafId: number;

    const loop = () => {
      const playing = player.getPlayerState() === 1;
      setIsPlaying(playing);
      if (playing) {
        const time = player.getCurrentTime();
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].begin <= time) {
            setCurrentIndex(i);
            break;
          }
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [player, rows]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Loading subtitles…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-1 text-xs text-muted-foreground">
        <span>
          idx:{currentIndex ?? "–"} playing:{String(isPlaying)} rows:
          {rows.length} player:{player ? "ok" : "null"}
        </span>
      </div>
      <TrackPicker
        tracks={tracks}
        selectedVssId1={selectedVssId1}
        selectedVssId2={selectedVssId2}
        onSelect={(v1, v2) => {
          setSelectedVssId1(v1);
          setSelectedVssId2(v2);
        }}
      />
      <CaptionList
        rows={rows}
        currentIndex={currentIndex}
        isPlaying={isPlaying}
        player={player}
      />
    </div>
  );
}

// --- Style injection ---

// Inject CSS into shadow root, hoisting @property declarations to document head
// because @property doesn't work inside Shadow DOM <style> elements.
// https://github.com/tailwindlabs/tailwindcss/issues/15005#issuecomment-3891099776
function addStyle(shadow: ShadowRoot, css: string) {
  const processed = css.replaceAll(":root", ":host");

  const propertyRules: string[] = [];
  const shadowCss = processed.replace(
    /@property\s+[^{]+\{[^}]*\}/g,
    (match) => {
      propertyRules.push(match);
      return "";
    },
  );

  if (propertyRules.length > 0) {
    const propStyle = document.createElement("style");
    propStyle.textContent = propertyRules.join("\n");
    document.head.appendChild(propStyle);
  }

  const style = document.createElement("style");
  style.textContent = shadowCss;
  shadow.appendChild(style);
}

// --- Injection ---

function isWatchPage() {
  return window.location.pathname === "/watch";
}

function getVideoId() {
  return new URL(window.location.href).searchParams.get("v");
}

function inject() {
  if (document.getElementById("ytsub-host")) return;

  const videoId = getVideoId();
  if (!videoId) return;

  // Create shadow root for style isolation
  const host = document.createElement("div");
  host.id = "ytsub-host";
  Object.assign(host.style, {
    all: "initial",
    position: "fixed",
    right: "10px",
    top: "65px",
    bottom: "20px",
    width: "400px",
    zIndex: "100000",
  });
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  addStyle(shadow, contentCss);

  const container = document.createElement("div");
  container.id = "ytsub-root";
  shadow.appendChild(container);

  createRoot(container).render(
    <StrictMode>
      <ExtensionViewer videoId={videoId} />
    </StrictMode>,
  );
}

function remove() {
  document.getElementById("ytsub-host")?.remove();
}

// YouTube SPA navigation
function init() {
  if (isWatchPage()) inject();

  document.addEventListener("yt-navigate-finish", () => {
    remove();
    if (isWatchPage()) inject();
  });
}

init();
