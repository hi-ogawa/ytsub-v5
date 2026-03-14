import { useNavigate } from "react-router";
import { VideoCard } from "../components/video-card.tsx";
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

export function DevFixturesPage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dev Viewer</h1>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {fixtures.map((meta) => (
          <VideoCard
            key={meta.video.youtubeId}
            youtubeId={meta.video.youtubeId}
            href={`/dev/videos/${meta.video.youtubeId}`}
            title={meta.video.title}
            channelName={meta.video.channelName || "Unknown channel"}
            badge={
              <>
                <span className="rounded bg-muted px-2 py-0.5 font-mono">
                  {meta.captionTracks.map((t) => t.languageCode).join(", ")}
                </span>
                <span>{formatDuration(meta.video.duration)}</span>
              </>
            }
            onClick={(e) => {
              e.preventDefault();
              navigate(`/dev/videos/${meta.video.youtubeId}`);
            }}
          />
        ))}
      </div>
    </div>
  );
}
