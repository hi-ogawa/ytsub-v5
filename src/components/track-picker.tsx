import type { YouTubeCaptionTrack } from "../lib/youtube.ts";

function trackLabel(track: YouTubeCaptionTrack): string {
  const kind = track.kind === "asr" ? " (auto)" : "";
  return `${track.name} [${track.languageCode}]${kind}`;
}

export function TrackPicker({
  tracks,
  selectedVssId1,
  selectedVssId2,
  onSelect,
}: {
  tracks: YouTubeCaptionTrack[];
  selectedVssId1: string | undefined;
  selectedVssId2: string | undefined;
  onSelect: (vssId1: string | undefined, vssId2: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5 text-sm">
      <label className="flex items-center gap-1">
        <span className="text-muted-foreground">Track 1:</span>
        <select
          className="rounded border bg-background px-1 py-0.5 text-sm"
          value={selectedVssId1 ?? ""}
          onChange={(e) =>
            onSelect(e.target.value || undefined, selectedVssId2)
          }
        >
          <option value="">None</option>
          {tracks.map((t) => (
            <option key={t.vssId} value={t.vssId}>
              {trackLabel(t)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <span className="text-muted-foreground">Track 2:</span>
        <select
          className="rounded border bg-background px-1 py-0.5 text-sm"
          value={selectedVssId2 ?? ""}
          onChange={(e) =>
            onSelect(selectedVssId1, e.target.value || undefined)
          }
        >
          <option value="">None</option>
          {tracks.map((t) => (
            <option key={t.vssId} value={t.vssId}>
              {trackLabel(t)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
