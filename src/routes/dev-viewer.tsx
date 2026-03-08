import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { type AlignedRow, CaptionList } from "../components/caption-list.tsx";
import { TrackPicker } from "../components/track-picker.tsx";
import { useYouTubePlayer } from "../components/youtube-player.tsx";
import {
  type CaptionCue,
  type YouTubeCaptionTrack,
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
  const [tracks, setTracks] = useState<YouTubeCaptionTrack[]>([]);
  const [selectedVssId1, setSelectedVssId1] = useState<string>();
  const [selectedVssId2, setSelectedVssId2] = useState<string>();
  const [rows, setRows] = useState<AlignedRow[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [youtubeId, setYoutubeId] = useState<string>();
  const [currentIndex, setCurrentIndex] = useState<number>();
  const [isPlaying, setIsPlaying] = useState(false);

  const { ref: playerElRef, player } = useYouTubePlayer(youtubeId);

  // Load metadata
  useEffect(() => {
    if (!videoId) return;
    setLoading(true);
    setError(undefined);

    fetchMetadata(videoId)
      .then((meta) => {
        setYoutubeId(meta.video.youtubeId);
        setTracks(meta.captionTracks);
        const { track1, track2 } = pickTracks(meta.captionTracks);
        setSelectedVssId1(track1?.vssId);
        setSelectedVssId2(track2?.vssId);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [videoId]);

  // Fetch tracks when selection changes
  useEffect(() => {
    if (!videoId) return;
    setRows([]);

    Promise.all([
      selectedVssId1
        ? fetchTrackFixture(videoId, selectedVssId1)
        : Promise.resolve([]),
      selectedVssId2
        ? fetchTrackFixture(videoId, selectedVssId2)
        : Promise.resolve([]),
    ])
      .then(([cues1, cues2]) => setRows(alignByIndex(cues1, cues2)))
      .catch((err) => setError(String(err)));
  }, [videoId, selectedVssId1, selectedVssId2]);

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
    </div>
  );
}
