import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { type AlignedRow, CaptionList } from "../components/caption-list.tsx";
import { useYouTubePlayer } from "../components/youtube-player.tsx";
import {
  type CaptionCue,
  type YouTubeExtractionResult,
  parseJson3,
  pickTracks,
} from "../lib/youtube.ts";

// Fetch pre-scraped fixture data served by Vite as static files
async function fetchMetadata(
  videoId: string,
): Promise<YouTubeExtractionResult> {
  const res = await fetch(`/scripts/youtube-json/${videoId}/metadata.json`);
  if (!res.ok) throw new Error(`No fixture for ${videoId}`);
  return res.json();
}

async function fetchTrackFixture(
  videoId: string,
  vssId: string,
): Promise<CaptionCue[]> {
  const res = await fetch(
    `/scripts/youtube-json/${videoId}/track-${vssId}.json`,
  );
  if (!res.ok) throw new Error(`No track fixture for ${vssId}`);
  return parseJson3(await res.json());
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

export function DevViewerPage() {
  const { videoId } = useParams<"videoId">();
  const [rows, setRows] = useState<AlignedRow[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [youtubeId, setYoutubeId] = useState<string>();
  const [currentIndex, setCurrentIndex] = useState<number>();
  const [isPlaying, setIsPlaying] = useState(false);

  const { ref: playerElRef, player } = useYouTubePlayer(youtubeId);

  // Load data
  useEffect(() => {
    if (!videoId) return;
    setLoading(true);
    setError(undefined);

    fetchMetadata(videoId)
      .then(async (meta) => {
        setYoutubeId(meta.video.youtubeId);
        const { track1, track2 } = pickTracks(meta.captionTracks);
        const [cues1, cues2] = await Promise.all([
          track1
            ? fetchTrackFixture(videoId, track1.vssId)
            : Promise.resolve([]),
          track2
            ? fetchTrackFixture(videoId, track2.vssId)
            : Promise.resolve([]),
        ]);
        setRows(alignByIndex(cues1, cues2));
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [videoId]);

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

  if (!videoId) return <div className="p-4">No video ID</div>;
  if (loading)
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  if (error)
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {error}
      </div>
    );

  return (
    <div className="flex h-full w-full flex-col lg:flex-row lg:gap-2 lg:p-2">
      {/* YouTube embed */}
      <div className="flex-none lg:flex-1">
        <div className="flex justify-center">
          <div className="relative w-full max-w-xl lg:max-w-none">
            <div className="relative pt-[56.2%]">
              <div className="absolute top-0 h-full w-full" ref={playerElRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Caption panel */}
      <div className="flex min-h-0 flex-[1_0_0] flex-col border-t lg:w-1/3 lg:flex-none lg:rounded lg:border">
        <CaptionList
          rows={rows}
          currentIndex={currentIndex}
          isPlaying={isPlaying}
          player={player}
        />
      </div>
    </div>
  );
}
