import { type YouTubeCaptionTrack, getLangName } from "../lib/youtube.ts";

function trackLabel(track: YouTubeCaptionTrack): string {
  if (track.vssId.includes(".t.")) {
    return `${track.languageCode} (translated)`;
  }
  const kind = track.kind === "asr" ? " (auto)" : "";
  return `${track.name} [${track.languageCode}]${kind}`;
}

export function TrackPicker({
  tracks,
  selectedVssId1,
  selectedVssId2,
  onSelect,
  disabled,
  loading,
}: {
  tracks: YouTubeCaptionTrack[];
  selectedVssId1?: string;
  selectedVssId2?: string;
  onSelect: (vssId1?: string, vssId2?: string) => void;
  disabled?: boolean;
  // While the tracks load, each select shows only its selected track, by
  // language name, so the header keeps its shape until the full list arrives.
  loading?: boolean;
}) {
  const selectDisabled = disabled || loading;

  return (
    <div
      data-testid="track-picker"
      className="flex items-center gap-1 px-2 py-1 text-sm lg:py-1.5"
      title={
        disabled ? "Cannot change tracks while bookmarks exist" : undefined
      }
    >
      <select
        className={`min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-sm ${selectDisabled ? "cursor-not-allowed opacity-50" : ""}`}
        value={selectedVssId1 ?? ""}
        onChange={(e) => onSelect(e.target.value || undefined, selectedVssId2)}
        disabled={selectDisabled}
      >
        <option value="">None</option>
        <TrackOptions
          tracks={tracks}
          selectedVssId={selectedVssId1}
          loading={loading}
        />
      </select>
      <select
        className={`min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-sm ${selectDisabled ? "cursor-not-allowed opacity-50" : ""}`}
        value={selectedVssId2 ?? ""}
        onChange={(e) => onSelect(selectedVssId1, e.target.value || undefined)}
        disabled={selectDisabled}
      >
        <option value="">None</option>
        <TrackOptions
          tracks={tracks}
          selectedVssId={selectedVssId2}
          loading={loading}
        />
      </select>
    </div>
  );
}

function TrackOptions({
  tracks,
  selectedVssId,
  loading,
}: {
  tracks: YouTubeCaptionTrack[];
  selectedVssId?: string;
  loading?: boolean;
}) {
  if (loading) {
    return selectedVssId ? (
      <option value={selectedVssId}>{getLangName(selectedVssId)}</option>
    ) : null;
  }
  return tracks.map((t) => (
    <option key={t.vssId} value={t.vssId}>
      {trackLabel(t)}
    </option>
  ));
}
