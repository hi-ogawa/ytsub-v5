import type { YouTubeCaptionTrack } from "../lib/youtube.ts";

function trackLabel(track: YouTubeCaptionTrack): string {
  if (track.vssId.includes(".t.")) return `${track.languageCode} (translated)`;
  const kind = track.kind === "asr" ? " (auto)" : "";
  return `${track.name} [${track.languageCode}]${kind}`;
}

export function TrackPicker({
  tracks,
  selectedVssId1,
  selectedVssId2,
  onSelect,
  disabled,
}: {
  tracks: YouTubeCaptionTrack[];
  selectedVssId1: string | undefined;
  selectedVssId2: string | undefined;
  onSelect: (vssId1: string | undefined, vssId2: string | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 text-sm"
      title={
        disabled ? "Cannot change tracks while bookmarks exist" : undefined
      }
    >
      <select
        className={`min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-sm ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
        value={selectedVssId1 ?? ""}
        onChange={(e) => onSelect(e.target.value || undefined, selectedVssId2)}
        disabled={disabled}
      >
        <option value="">None</option>
        {tracks.map((t) => (
          <option key={t.vssId} value={t.vssId}>
            {trackLabel(t)}
          </option>
        ))}
      </select>
      <select
        className={`min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-sm ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
        value={selectedVssId2 ?? ""}
        onChange={(e) => onSelect(selectedVssId1, e.target.value || undefined)}
        disabled={disabled}
      >
        <option value="">None</option>
        {tracks.map((t) => (
          <option key={t.vssId} value={t.vssId}>
            {trackLabel(t)}
          </option>
        ))}
      </select>
    </div>
  );
}
