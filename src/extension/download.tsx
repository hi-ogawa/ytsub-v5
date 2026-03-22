import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { useTheme } from "../lib/theme.ts";
import type {
  YouTubeStreamingFormat,
  YouTubeVideoData,
} from "../lib/youtube.ts";
import type { bgRpcHandlers } from "./background.ts";
import { createRuntimeRpc } from "./lib/extension-rpc.ts";
import "../styles.css";

const bgRpc = createRuntimeRpc<typeof bgRpcHandlers>();

interface DownloadPageData {
  video: YouTubeVideoData;
  formats: YouTubeStreamingFormat[];
}

// --- Video ID parsing ---

function parseVideoId(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 11 && /^[\w-]+$/.test(trimmed)) return trimmed;
  if (trimmed.match(/youtube\.com|youtu\.be/)) {
    try {
      const url = new URL(trimmed);
      if (url.hostname === "youtu.be") return url.pathname.substring(1);
      return url.searchParams.get("v") ?? undefined;
    } catch {}
  }
  return undefined;
}

// --- Format helpers ---

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLabel(f: YouTubeStreamingFormat): string {
  const mime = f.mimeType.split(";")[0];
  const codec = f.mimeType.split(";")[1]?.trim() ?? "";
  const size = f.contentLength ? formatBytes(f.contentLength) : "unknown size";
  if (f.width && f.height) {
    return `${mime} ${f.width}x${f.height} ${codec} (${size})`;
  }
  return `${mime} ${codec} (${size})`;
}

function isAudioOnly(f: YouTubeStreamingFormat): boolean {
  return f.mimeType.startsWith("audio/");
}

// --- Components ---

function DownloadPage() {
  const [input, setInput] = useState("");
  const [data, setData] = useState<DownloadPageData>();
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const videoId = parseVideoId(input);
    if (!videoId) {
      toast.error("Invalid video ID or URL");
      return;
    }
    setSearching(true);
    setData(undefined);
    try {
      const result = await bgRpc.getDownloadData({ videoId });
      setData(result as DownloadPageData);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <form onSubmit={handleSearch} className="space-y-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Video ID</label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ID or URL"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {data && (
        <>
          <div className="border-t pt-4" />
          <DownloadForm data={data} />
        </>
      )}
    </div>
  );
}

function DownloadForm({ data }: { data: DownloadPageData }) {
  const audioFormats = data.formats
    .filter(isAudioOnly)
    .filter((f) => f.contentLength)
    .sort((a, b) => (b.contentLength ?? 0) - (a.contentLength ?? 0));

  const [selectedItag, setSelectedItag] = useState<number>(
    audioFormats[0]?.itag ?? 0,
  );
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    setDone(false);
    try {
      const result = (await bgRpc.downloadFormat({
        videoId: data.video.youtubeId,
        itag: selectedItag,
      })) as { filename: string; size: number };
      setDone(true);
      toast.success(
        `Downloaded ${result.filename} (${formatBytes(result.size)})`,
      );
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{data.video.title}</h1>
        <p className="text-sm text-muted-foreground">
          {data.video.channelName}
        </p>
      </div>

      <img
        src={`https://i.ytimg.com/vi/${data.video.youtubeId}/hqdefault.jpg`}
        alt=""
        className="w-full rounded"
      />

      {audioFormats.length === 0 ? (
        <p className="text-sm text-red-500">No audio formats available.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Audio format</label>
            <select
              value={selectedItag}
              onChange={(e) => setSelectedItag(Number(e.target.value))}
              disabled={downloading}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            >
              {audioFormats.map((f) => (
                <option key={f.itag} value={f.itag}>
                  {formatLabel(f)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || done}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {!downloading && !done && "Download"}
            {downloading && "Downloading..."}
            {done && "Done"}
          </button>
        </>
      )}
    </div>
  );
}

function App() {
  useTheme();
  return (
    <div className="min-h-screen">
      <header className="flex h-10 items-center border-b px-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          Zamak
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium uppercase leading-none text-green-700 dark:bg-green-900 dark:text-green-300">
            dl
          </span>
        </span>
      </header>
      <DownloadPage />
      <Toaster position="top-right" richColors />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
