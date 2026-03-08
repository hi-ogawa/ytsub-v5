import { useQuery } from "@tanstack/react-query";
import { Captions } from "lucide-react";
import { useEffect, useState } from "react";
import { mergeCaptions } from "../lib/caption-merge.ts";
import { type CaptionCue, type YouTubeCaptionTrack } from "../lib/youtube.ts";
import { CaptionList } from "./caption-list.tsx";
import { TrackPicker } from "./track-picker.tsx";
import type { YTPlayer } from "./youtube-player.tsx";

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
      className={`fixed right-5 bottom-5 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-none text-foreground shadow-lg pointer-events-auto ${open ? "bg-ring" : "bg-[#1a3a5c]"}`}
      title={open ? "Hide captions" : "Show captions"}
    >
      <Captions size={24} />
    </button>
  );
}

const LANGS_KEY = "ytsub:preferred-langs";

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

function pickByPreferredLang(
  tracks: YouTubeCaptionTrack[],
  lang: string,
): YouTubeCaptionTrack | undefined {
  const forLang = tracks.filter((t) => t.languageCode === lang);
  return forLang.find((t) => !t.kind) ?? forLang.find((t) => t.kind === "asr");
}

export function CaptionPanel({
  tracks,
  fetchCues,
  player,
}: {
  tracks: YouTubeCaptionTrack[];
  fetchCues: (track: YouTubeCaptionTrack) => Promise<CaptionCue[]>;
  player: YTPlayer | null;
}) {
  const [selectedVssId1, setSelectedVssId1] = useState<string | undefined>(
    () => pickByPreferredLang(tracks, getPreferredLangs().lang1)?.vssId,
  );
  const [selectedVssId2, setSelectedVssId2] = useState<string | undefined>(
    () => pickByPreferredLang(tracks, getPreferredLangs().lang2)?.vssId,
  );
  const [currentIndex, setCurrentIndex] = useState<number>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoScroll, setAutoScroll] = useState(() => {
    try {
      const stored = localStorage.getItem("ytsub:auto-scroll");
      return stored !== null ? (JSON.parse(stored) as boolean) : true;
    } catch {
      return true;
    }
  });

  const sel1 = tracks.find((t) => t.vssId === selectedVssId1);
  const sel2 = tracks.find((t) => t.vssId === selectedVssId2);

  const cues1Query = useQuery({
    queryKey: ["cues", sel1?.vssId],
    queryFn: () => fetchCues(sel1!),
    enabled: !!sel1,
  });

  const cues2Query = useQuery({
    queryKey: ["cues", sel2?.vssId],
    queryFn: () => fetchCues(sel2!),
    enabled: !!sel2,
  });

  const cues1 = cues1Query.data ?? [];
  const cues2 = cues2Query.data ?? [];
  const rows =
    cues1.length > 0 || cues2.length > 0
      ? mergeCaptions(cues1, cues2).captions
      : [];

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
      localStorage.setItem("ytsub:auto-scroll", JSON.stringify(next));
      return next;
    });
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
        <button
          className={[
            "mr-1 rounded p-0.5",
            autoScroll
              ? "text-accent hover:bg-highlight-bg"
              : "text-muted-foreground hover:bg-muted",
          ].join(" ")}
          onClick={toggleAutoScroll}
          title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </button>
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
