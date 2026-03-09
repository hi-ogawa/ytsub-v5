import { Link } from "react-router";
import type { YouTubeExtractionResult } from "../lib/youtube.ts";

const fixtureModules = import.meta.glob<YouTubeExtractionResult>(
  "/scripts/youtube-json/*/metadata.json",
  { eager: true, import: "default" },
);

const fixtures = Object.values(fixtureModules);

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function DevIndexPage() {
  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Dev Viewer</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {fixtures.map((meta) => (
          <Link
            key={meta.video.youtubeId}
            to={`/dev/youtube/${meta.video.youtubeId}`}
            className="block overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all hover:border-ring hover:shadow-md"
          >
            <img
              src={`https://img.youtube.com/vi/${meta.video.youtubeId}/mqdefault.jpg`}
              alt=""
              loading="lazy"
              className="aspect-video w-full object-cover"
            />
            <div className="p-4">
              <h2 className="mb-1 line-clamp-2 font-semibold leading-snug">
                {meta.video.title}
              </h2>
              <p className="mb-3 truncate text-sm text-muted-foreground">
                {meta.video.channelName || "Unknown channel"}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5 font-mono">
                  {meta.captionTracks.map((t) => t.languageCode).join(", ")}
                </span>
                <span>{formatDuration(meta.video.duration)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
