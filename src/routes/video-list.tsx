import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EllipsisVertical, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
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

function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
        onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Import Video</DialogTitle>

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
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!parsed || importMutation.isPending}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            onClick={() => {
              if (parsed) importMutation.mutate(parsed as never);
            }}
          >
            {importMutation.isPending ? "Importing..." : "Import"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
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
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary-hover"
          onClick={() => setShowImport(true)}
        >
          Import
        </button>
      </div>
      <ImportDialog open={showImport} onOpenChange={setShowImport} />
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
                  className="block overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all hover:shadow-md hover:border-ring"
                >
                  <img
                    src={`https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                  <div className="p-4">
                    <div className="mb-1 flex items-start gap-1">
                      <h2 className="line-clamp-2 flex-1 font-semibold leading-snug">
                        {video.title}
                      </h2>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="-mr-1.5 -mt-1 shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          <EllipsisVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete "${video.title}"? This will also delete its captions and bookmarks.`,
                                )
                              ) {
                                deleteMutation.mutate({ id: video.id });
                              }
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
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
