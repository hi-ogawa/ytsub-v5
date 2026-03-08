import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { mergeCaptions } from "../lib/caption-merge.ts";
import {
  type CaptionCue,
  type YouTubeCaptionTrack,
  pickTracks,
} from "../lib/youtube.ts";
import { CaptionList } from "./caption-list.tsx";
import { TrackPicker } from "./track-picker.tsx";
import type { YTPlayer } from "./youtube-player.tsx";

export function CaptionPanel({
  tracks,
  fetchCues,
  player,
}: {
  tracks: YouTubeCaptionTrack[];
  fetchCues: (track: YouTubeCaptionTrack) => Promise<CaptionCue[]>;
  player: YTPlayer | null;
}) {
  const { track1, track2 } = pickTracks(tracks);
  const [selectedVssId1, setSelectedVssId1] = useState<string | undefined>(
    track1?.vssId,
  );
  const [selectedVssId2, setSelectedVssId2] = useState<string | undefined>(
    track2?.vssId,
  );
  const [currentIndex, setCurrentIndex] = useState<number>();
  const [isPlaying, setIsPlaying] = useState(false);

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

  return (
    <>
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
    </>
  );
}
