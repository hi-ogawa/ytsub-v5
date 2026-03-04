export type CaptionEntry = {
  idx: number;
  begin: number;
  end: number;
  text1: string;
  text2: string;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function CaptionRow({
  entry,
  isActive,
  onSeek,
}: {
  entry: CaptionEntry;
  isActive: boolean;
  onSeek?: (seconds: number) => void;
}) {
  return (
    <div
      data-index={entry.idx}
      className={`rounded-lg border-2 ${
        isActive ? "border-blue-500 ring-2 ring-blue-200" : "border-transparent"
      }`}
    >
      <div className="flex items-center justify-between px-3 py-1 text-xs text-gray-500">
        <span>
          {formatTime(entry.begin)} - {formatTime(entry.end)}
        </span>
      </div>
      <div
        className="flex cursor-pointer"
        onClick={() => onSeek?.(entry.begin)}
      >
        <div className="flex-1 border-r border-gray-200 px-3 py-2 text-sm">
          {entry.text1}
        </div>
        <div className="flex-1 px-3 py-2 text-sm">{entry.text2}</div>
      </div>
    </div>
  );
}

export function CaptionPanel({
  entries,
  activeIndex,
  onSeek,
}: {
  entries: CaptionEntry[];
  activeIndex: number;
  onSeek?: (seconds: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 overflow-y-auto p-2">
      {entries.map((entry) => (
        <CaptionRow
          key={entry.idx}
          entry={entry}
          isActive={entry.idx === activeIndex}
          onSeek={onSeek}
        />
      ))}
    </div>
  );
}
