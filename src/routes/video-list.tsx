import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { orpc } from "../rpc.ts";

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface ImportData {
  video: { youtubeId: string; title: string; [key: string]: unknown };
  captions: unknown[];
  bookmarks?: unknown[];
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ImportData | null>(null);
  const [parseError, setParseError] = useState("");

  const importMutation = useMutation(
    orpc.videos.importVideo.mutationOptions({
      onSuccess: async (data) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.videos.listVideos.queryOptions({ input: {} }).queryKey,
        });
        onClose();
        navigate(`/videos/${data.videoId}`);
      },
    }),
  );

  function handleFile(file: File) {
    setParseError("");
    setParsed(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!data.video || !data.captions) {
          setParseError("Invalid format: missing 'video' or 'captions' key.");
          return;
        }
        setParsed(data);
      } catch {
        setParseError("Failed to parse JSON.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">Import Video</h2>

        <div
          className="mb-4 rounded-lg border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground"
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add("border-ring", "bg-highlight-bg");
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove("border-ring", "bg-highlight-bg");
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove("border-ring", "bg-highlight-bg");
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          <p className="mb-2">
            Drop <code>import.json</code> here or{" "}
            <button
              type="button"
              className="text-accent underline"
              onClick={() => fileRef.current?.click()}
            >
              browse
            </button>
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            data-testid="file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>

        {parseError && (
          <p className="mb-4 text-sm text-destructive">{parseError}</p>
        )}

        {parsed && (
          <div className="mb-4 rounded border border-border bg-muted p-3 text-sm">
            <p className="font-medium">{parsed.video.title}</p>
            <p className="text-muted-foreground">
              {parsed.captions.length} captions, {parsed.bookmarks?.length ?? 0}{" "}
              bookmarks
            </p>
          </div>
        )}

        {importMutation.isError && (
          <p className="mb-4 text-sm text-destructive">
            Import failed: {importMutation.error.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!parsed || importMutation.isPending}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            onClick={() => {
              if (parsed) importMutation.mutate(parsed as never);
            }}
          >
            {importMutation.isPending ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function VideoListPage() {
  const [showImport, setShowImport] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery(
    orpc.videos.listVideos.queryOptions({ input: {} }),
  );
  const deleteMutation = useMutation(
    orpc.videos.deleteVideo.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: orpc.videos.listVideos.queryOptions({ input: {} }).queryKey,
        }),
    }),
  );

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Videos</h1>
        <button
          type="button"
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          onClick={() => setShowImport(true)}
        >
          Import
        </button>
      </div>
      {showImport && <ImportDialog onClose={() => setShowImport(false)} />}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError || !data ? (
        <p className="text-sm text-destructive">Failed to load videos.</p>
      ) : (
        <>
          <p className="mb-6 text-sm text-muted-foreground">
            {data.total} videos
          </p>
          {data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No videos yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.items.map((video) => (
                <Link
                  key={video.id}
                  to={`/videos/${video.id}`}
                  className="block overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
                >
                  <img
                    src={`https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                  <div className="p-4">
                    <h2 className="mb-1 line-clamp-2 font-semibold leading-snug">
                      {video.title}
                    </h2>
                    <p className="mb-3 truncate text-sm text-muted-foreground">
                      {video.channelName || "Unknown channel"}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-2 py-0.5 font-mono">
                        {video.language1} / {video.language2}
                      </span>
                      <span>{formatDuration(video.duration)}</span>
                      <span className="ml-auto">
                        {formatDate(video.createdAt)}
                      </span>
                      <button
                        className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-destructive-subtle hover:text-destructive"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (
                            window.confirm(
                              `Delete "${video.title}"? This will also delete its captions and bookmarks.`,
                            )
                          ) {
                            deleteMutation.mutate({ id: video.id });
                          }
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
