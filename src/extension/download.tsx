import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { useTheme } from "../lib/theme.ts";
import type {
  YouTubeStreamingFormat,
  YouTubeVideoData,
} from "../lib/youtube.ts";
import { chromeStorage } from "./lib/chrome-storage.ts";
import "../styles.css";

export interface DownloadPageData {
  video: YouTubeVideoData;
  formats: YouTubeStreamingFormat[];
}

const STORAGE_KEY = "download-data";

// --- Chunked download ---

const CHUNK_SIZE = 5_000_000; // 5MB

interface DownloadProgress {
  offset: number;
  total: number;
}

async function downloadAudio(
  format: YouTubeStreamingFormat,
  onProgress: (p: DownloadProgress) => void,
): Promise<Uint8Array> {
  const filesize = format.contentLength;
  if (!filesize) throw new Error("Unknown file size");

  const numChunks = Math.ceil(filesize / CHUNK_SIZE);
  const result = new Uint8Array(filesize);
  let offset = 0;

  for (let i = 0; i < numChunks; i++) {
    const start = CHUNK_SIZE * i;
    const end = Math.min(CHUNK_SIZE * (i + 1), filesize);
    const res = await fetch(format.url, {
      headers: { range: `bytes=${start}-${end - 1}` },
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Download failed: ${res.status}`);
    }
    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      result.set(value, offset);
      offset += value.length;
      onProgress({ offset, total: filesize });
    }
  }

  return result;
}

function triggerBrowserDownload(data: Uint8Array, filename: string) {
  const blob = new Blob([data as unknown as BlobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
  const [data, setData] = useState<DownloadPageData>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chromeStorage.get<DownloadPageData>(STORAGE_KEY).then((d) => {
      setData(d ?? undefined);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <p className="text-sm">
          No video data. Open a YouTube video with the Zamak extension first.
        </p>
      </div>
    );
  }

  return <DownloadForm data={data} />;
}

function DownloadForm({ data }: { data: DownloadPageData }) {
  const audioFormats = data.formats
    .filter(isAudioOnly)
    .filter((f) => f.contentLength)
    .sort((a, b) => (b.contentLength ?? 0) - (a.contentLength ?? 0));

  const [selectedItag, setSelectedItag] = useState<number>(
    audioFormats[0]?.itag ?? 0,
  );
  const [progress, setProgress] = useState<DownloadProgress>();
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);

  const handleDownload = async () => {
    const format = audioFormats.find((f) => f.itag === selectedItag);
    if (!format) return;

    setDownloading(true);
    setDone(false);
    setProgress(undefined);

    try {
      const result = await downloadAudio(format, setProgress);
      const ext = format.mimeType.split(";")[0]?.split("/")[1] ?? "webm";
      const filename = `${data.video.title}.${ext}`;
      triggerBrowserDownload(result, filename);
      setDone(true);
      toast.success("Download complete");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDownloading(false);
    }
  };

  const progressPercent =
    progress && progress.total > 0
      ? ((progress.offset / progress.total) * 100).toFixed(1)
      : undefined;

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
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
            {downloading && `Downloading... ${progressPercent ?? "0"}%`}
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
