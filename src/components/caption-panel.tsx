import { useQuery } from "@tanstack/react-query";
import { Check, Download, EllipsisVertical } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FALLBACK_STRATEGIES,
  type MergeStrategy,
  mergeCaptions,
} from "../lib/caption-merge.ts";
import {
  type CaptionCue,
  type YouTubeCaptionTrack,
  pickBestTrack,
} from "../lib/youtube.ts";
import { CaptionList } from "./caption-list.tsx";
import { TrackPicker } from "./track-picker.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import type { YTPlayer } from "./youtube-player.tsx";

interface VideoMeta {
  youtubeId: string;
  title: string;
  channelName?: string;
  channelId?: string;
  duration?: number;
}

export function CaptionFab({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`fixed right-3 bottom-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none text-foreground shadow-lg pointer-events-auto ${open ? "bg-[#2563eb]" : "bg-[#1a3a5c]"}`}
      title={open ? "Hide captions" : "Show captions"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="size-8"
        viewBox="0 0 128 128"
      >
        <path
          d="M28,36 h72 v12 l-52,32 h52 v12 h-72 v-12 l52,-32 h-52 z"
          fill="#ffffff"
        />
      </svg>
    </button>
  );
}

const WIDTH_KEY = "zamak:panel-width";
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 280;
const MAX_WIDTH = 800;

function getPanelWidth(): number {
  try {
    const stored = localStorage.getItem(WIDTH_KEY);
    if (stored) {
      const n = Number(stored);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch {}
  return DEFAULT_WIDTH;
}

export function ResizablePanel({
  children,
  id,
  className,
  style,
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [width, setWidth] = useState(getPanelWidth);
  const widthRef = useRef(width);
  widthRef.current = width;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = widthRef.current;

    const onPointerMove = (e: PointerEvent) => {
      // Dragging left = wider (panel is right-aligned)
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(MAX_WIDTH, startWidth + (startX - e.clientX)),
      );
      setWidth(newWidth);
    };

    const onPointerUp = () => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      localStorage.setItem(WIDTH_KEY, String(widthRef.current));
    };

    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
  }, []);

  return (
    <div
      id={id}
      className={className}
      style={{ ...style, width: `${width}px` }}
      data-testid="resizable-panel"
    >
      <div
        className="absolute top-0 bottom-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-ring/50"
        data-testid="resize-handle"
        onPointerDown={onPointerDown}
      />
      {children}
    </div>
  );
}

const LANGS_KEY = "zamak:preferred-langs";

function getPreferredLangs(): { lang1: string; lang2: string } {
  try {
    const stored = localStorage.getItem(LANGS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { lang1: "ko", lang2: "en" };
}

function savePreferredLangs(lang1: string, lang2: string) {
  localStorage.setItem(LANGS_KEY, JSON.stringify({ lang1, lang2 }));
}

export function CaptionPanel({
  tracks,
  fetchCues,
  player,
  videoMeta,
}: {
  tracks: YouTubeCaptionTrack[];
  fetchCues: (track: YouTubeCaptionTrack) => Promise<CaptionCue[]>;
  player: YTPlayer | null;
  videoMeta?: VideoMeta;
}) {
  const [selectedVssId1, setSelectedVssId1] = useState<string | undefined>(
    () => pickBestTrack(tracks, getPreferredLangs().lang1)?.vssId,
  );
  const [selectedVssId2, setSelectedVssId2] = useState<string | undefined>(
    () => pickBestTrack(tracks, getPreferredLangs().lang2)?.vssId,
  );
  const [currentIndex, setCurrentIndex] = useState<number>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoScroll, setAutoScroll] = useState(() => {
    try {
      const stored = localStorage.getItem("zamak:auto-scroll");
      return stored !== null ? (JSON.parse(stored) as boolean) : true;
    } catch {
      return true;
    }
  });
  const [forceStrategy, setForceStrategy] = useState<
    MergeStrategy | undefined
  >();

  const sel1 = tracks.find((t) => t.vssId === selectedVssId1);
  const sel2 = tracks.find((t) => t.vssId === selectedVssId2);

  const cues1Query = useQuery({
    queryKey: ["cues", sel1?.baseUrl],
    queryFn: () => fetchCues(sel1!),
    enabled: !!sel1,
  });

  const cues2Query = useQuery({
    queryKey: ["cues", sel2?.baseUrl],
    queryFn: () => fetchCues(sel2!),
    enabled: !!sel2,
  });

  const cues1 = cues1Query.data ?? [];
  const cues2 = cues2Query.data ?? [];
  const mergeResult =
    cues1.length > 0 || cues2.length > 0
      ? mergeCaptions(cues1, cues2, forceStrategy)
      : undefined;
  const rows = mergeResult?.captions ?? [];
  const activeStrategy = mergeResult?.strategy;
  const isAutoStrategy =
    !forceStrategy &&
    (activeStrategy === "strict" || activeStrategy === "relaxed-strict");

  const cueError = cues1Query.error ?? cues2Query.error;

  // RAF loop — poll player time, update current entry
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

  if (cueError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {String(cueError)}
      </div>
    );
  }

  function toggleAutoScroll() {
    setAutoScroll((prev) => {
      const next = !prev;
      localStorage.setItem("zamak:auto-scroll", JSON.stringify(next));
      return next;
    });
  }

  function handleExport() {
    if (!videoMeta) return;
    const data = {
      video: {
        youtubeId: videoMeta.youtubeId,
        title: videoMeta.title,
        channelName: videoMeta.channelName ?? "",
        channelId: videoMeta.channelId ?? "",
        duration: videoMeta.duration ?? 0,
        language1: sel1?.languageCode ?? "ko",
        language2: sel2?.languageCode ?? "en",
      },
      captions: rows.map((r, i) => ({
        idx: i,
        begin: r.begin,
        end: r.end,
        text1: r.text1,
        text2: r.text2,
      })),
      bookmarks: [],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-${videoMeta.youtubeId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex items-center border-b">
        <div className="min-w-0 flex-1">
          <TrackPicker
            tracks={tracks}
            selectedVssId1={selectedVssId1}
            selectedVssId2={selectedVssId2}
            onSelect={(v1, v2) => {
              setSelectedVssId1(v1);
              setSelectedVssId2(v2);
              const t1 = tracks.find((t) => t.vssId === v1);
              const t2 = tracks.find((t) => t.vssId === v2);
              if (t1 && t2)
                savePreferredLangs(t1.languageCode, t2.languageCode);
            }}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="mr-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
            title="Settings"
          >
            <EllipsisVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                toggleAutoScroll();
              }}
            >
              <Check
                className={`mr-2 h-4 w-4 ${autoScroll ? "opacity-100" : "opacity-0"}`}
              />
              Auto-scroll
            </DropdownMenuItem>
            {!isAutoStrategy && (
              <div className="px-2 py-1.5">
                <label className="mb-1 block text-xs text-muted-foreground">
                  Alignment
                </label>
                <select
                  className="w-full rounded border bg-background px-1 py-0.5 text-sm"
                  value={forceStrategy ?? activeStrategy ?? ""}
                  onChange={(e) =>
                    setForceStrategy(
                      (e.target.value as MergeStrategy) || undefined,
                    )
                  }
                  title="Alignment strategy"
                >
                  {FALLBACK_STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {videoMeta && (
              <DropdownMenuItem onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export import.json
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CaptionList
        rows={rows}
        currentIndex={currentIndex}
        isPlaying={isPlaying}
        player={player}
        autoScroll={autoScroll}
      />
    </>
  );
}
