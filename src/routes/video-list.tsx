import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">Import Video</h2>

        <div
          className="mb-4 rounded-lg border-2 border-dashed border-gray-300 p-6 text-center text-sm text-gray-500"
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add("border-blue-400", "bg-blue-50");
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove("border-blue-400", "bg-blue-50");
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove("border-blue-400", "bg-blue-50");
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          <p className="mb-2">
            Drop <code>import.json</code> here or{" "}
            <button
              type="button"
              className="text-blue-600 underline"
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
          <p className="mb-4 text-sm text-red-600">{parseError}</p>
        )}

        {parsed && (
          <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
            <p className="font-medium">{parsed.video.title}</p>
            <p className="text-gray-500">
              {parsed.captions.length} captions, {parsed.bookmarks?.length ?? 0}{" "}
              bookmarks
            </p>
          </div>
        )}

        {importMutation.isError && (
          <p className="mb-4 text-sm text-red-600">
            Import failed: {importMutation.error.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!parsed || importMutation.isPending}
            className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
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

function VideoCard({
  video,
  onDelete,
}: {
  video: {
    id: number;
    youtubeId: string;
    title: string;
    channelName: string | null;
    language1: string;
    language2: string;
    duration: number;
    createdAt: string;
  };
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  return (
    <div className="relative">
      <Link
        to={`/videos/${video.id}`}
        className="block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
      >
        <img
          src={`https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          className="aspect-video w-full object-cover"
        />
        <div className="p-4">
          <h2 className="mb-1 line-clamp-2 pr-5 font-semibold leading-snug">
            {video.title}
          </h2>
          <p className="mb-3 truncate text-sm text-gray-500">
            {video.channelName || "Unknown channel"}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="rounded bg-gray-100 px-2 py-0.5 font-mono">
              {video.language1} / {video.language2}
            </span>
            <span>{formatDuration(video.duration)}</span>
            <span className="ml-auto">{formatDate(video.createdAt)}</span>
          </div>
        </div>
      </Link>
      <div ref={menuRef} className="absolute right-2 top-[calc(56.2%+0.5rem)]">
        <button
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-1 w-32 rounded border bg-white py-1 shadow-lg">
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                if (
                  window.confirm(
                    `Delete "${video.title}"? This will also delete its captions and bookmarks.`,
                  )
                ) {
                  onDelete();
                }
              }}
            >
              Delete
            </button>
          </div>
        )}
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
          className="rounded bg-black px-3 py-1.5 text-sm text-white hover:bg-gray-800"
          onClick={() => setShowImport(true)}
        >
          Import
        </button>
      </div>
      {showImport && <ImportDialog onClose={() => setShowImport(false)} />}
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : isError || !data ? (
        <p className="text-sm text-red-500">Failed to load videos.</p>
      ) : (
        <>
          <p className="mb-6 text-sm text-gray-500">{data.total} videos</p>
          {data.items.length === 0 ? (
            <p className="text-sm text-gray-400">No videos yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.items.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onDelete={() => deleteMutation.mutate({ id: video.id })}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
