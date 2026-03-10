import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FALLBACK_STRATEGIES,
  type MergeStrategy,
  type MergedCaption,
  mergeCaptions,
} from "./caption-merge.ts";
import {
  type CaptionSession,
  deleteSession,
  getSession,
  saveSession,
} from "./caption-session-db.ts";
import {
  type BookmarkSelection,
  type ExtensionBookmark,
  createBookmark,
} from "./extension-bookmarks.ts";
import {
  type Json3File,
  type YouTubeCaptionTrack,
  pickBestTrack,
} from "./youtube.ts";

interface VideoMeta {
  youtubeId: string;
  title: string;
  channelName?: string;
  channelId?: string;
  duration?: number;
}

// --- Track preference persistence ---

const TRACKS_KEY = "zamak:selected-tracks";
const LANGS_KEY = "zamak:preferred-langs";

function getInitialTracks(
  tracks: YouTubeCaptionTrack[],
  videoId: string,
): { vssId1?: string; vssId2?: string } {
  try {
    const perVideo = localStorage.getItem(`${TRACKS_KEY}:${videoId}`);
    if (perVideo) {
      const { vssId1, vssId2 } = JSON.parse(perVideo);
      const valid1 = tracks.some((t) => t.vssId === vssId1);
      const valid2 = tracks.some((t) => t.vssId === vssId2);
      if (valid1 && valid2) return { vssId1, vssId2 };
    }
    const globalPref = localStorage.getItem(LANGS_KEY);
    if (globalPref) {
      const { lang1, lang2 } = JSON.parse(globalPref);
      return {
        vssId1: pickBestTrack(tracks, lang1)?.vssId,
        vssId2: pickBestTrack(tracks, lang2)?.vssId,
      };
    }
  } catch {}
  return {};
}

function saveSelectedTracks(
  tracks: YouTubeCaptionTrack[],
  vssId1: string,
  vssId2: string,
  videoId: string,
) {
  localStorage.setItem(
    `${TRACKS_KEY}:${videoId}`,
    JSON.stringify({ vssId1, vssId2 }),
  );
  const t1 = tracks.find((t) => t.vssId === vssId1);
  const t2 = tracks.find((t) => t.vssId === vssId2);
  if (t1 && t2) {
    localStorage.setItem(
      LANGS_KEY,
      JSON.stringify({ lang1: t1.languageCode, lang2: t2.languageCode }),
    );
  }
}

// --- Hook ---

export function useCaptionSession({
  youtubeId,
  tracks,
  fetchJson3,
  videoMeta,
}: {
  youtubeId: string;
  tracks: YouTubeCaptionTrack[];
  fetchJson3: (track: YouTubeCaptionTrack) => Promise<Json3File>;
  videoMeta: VideoMeta;
}) {
  // Hydrated session from IndexedDB (null = not loaded yet, undefined = no session)
  const [hydrated, setHydrated] = useState<CaptionSession | null | undefined>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    getSession(youtubeId).then((s) => {
      if (!cancelled) setHydrated(s ?? undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [youtubeId]);

  // Track selection
  const [{ vssId1: selectedVssId1, vssId2: selectedVssId2 }, setSelectedPair] =
    useState(() => getInitialTracks(tracks, youtubeId));

  // Override track selection from hydrated session
  useEffect(() => {
    if (hydrated) {
      setSelectedPair({ vssId1: hydrated.vssId1, vssId2: hydrated.vssId2 });
    }
  }, [hydrated]);

  const [forceStrategy, setForceStrategy] = useState<
    MergeStrategy | undefined
  >();

  const sel1 = tracks.find((t) => t.vssId === selectedVssId1);
  const sel2 = tracks.find((t) => t.vssId === selectedVssId2);

  // Fetch json3 — disabled when hydrated (captions already loaded)
  const isHydrated = hydrated != null && hydrated !== undefined;

  const json3Query1 = useQuery({
    queryKey: ["json3", sel1?.vssId],
    queryFn: () => fetchJson3(sel1!),
    enabled: !!sel1 && !isHydrated,
  });

  const json3Query2 = useQuery({
    queryKey: ["json3", sel2?.vssId],
    queryFn: () => fetchJson3(sel2!),
    enabled: !!sel2 && !isHydrated,
  });

  // Merge — either from hydrated session or fresh fetch
  const [captionOverrides, setCaptionOverrides] = useState<
    Map<number, { text1?: string; text2?: string }>
  >(new Map());

  let mergedRows: MergedCaption[] | undefined;
  let activeStrategy: MergeStrategy | undefined;

  if (isHydrated) {
    mergedRows = hydrated.captions;
    activeStrategy = undefined; // strategy was already applied
  } else {
    const json3_1 = json3Query1.data;
    const json3_2 = json3Query2.data;
    const mergeResult =
      json3_1 && json3_2 && sel1 && sel2
        ? mergeCaptions(
            { json3: json3_1, vssId: sel1.vssId },
            { json3: json3_2, vssId: sel2.vssId },
            forceStrategy,
          )
        : undefined;
    mergedRows = mergeResult?.captions;
    activeStrategy = mergeResult?.strategy;
  }

  // Apply caption overrides
  const rows = useMemo(() => {
    if (!mergedRows || captionOverrides.size === 0) return mergedRows;
    return mergedRows.map((r) => {
      const override = captionOverrides.get(r.idx);
      if (!override) return r;
      return {
        ...r,
        ...(override.text1 !== undefined && { text1: override.text1 }),
        ...(override.text2 !== undefined && { text2: override.text2 }),
      };
    });
  }, [mergedRows, captionOverrides]);

  const isAutoStrategy =
    !isHydrated &&
    !forceStrategy &&
    (activeStrategy === "strict" || activeStrategy === "relaxed-strict");

  const error = json3Query1.error ?? json3Query2.error ?? null;

  // Bookmarks — loaded from IndexedDB session (no localStorage)
  const [bookmarks, setBookmarks] = useState<ExtensionBookmark[]>([]);

  useEffect(() => {
    if (hydrated) {
      setBookmarks(hydrated.bookmarks);
    }
  }, [hydrated]);

  const bookmarksByIndex = useMemo(() => {
    const map = new Map<number, ExtensionBookmark[]>();
    for (const bm of bookmarks) {
      const list = map.get(bm.captionIndex);
      if (list) list.push(bm);
      else map.set(bm.captionIndex, [bm]);
    }
    return map;
  }, [bookmarks]);

  const hasBookmarks = bookmarks.length > 0;
  const tracksLocked = hasBookmarks;

  // Persist session to IndexedDB when bookmarks change
  const persistSession = useCallback(
    (updatedBookmarks: ExtensionBookmark[]) => {
      if (!rows || !sel1 || !sel2) return;
      const session: CaptionSession = {
        youtubeId,
        vssId1: sel1.vssId,
        vssId2: sel2.vssId,
        language1: sel1.languageCode,
        language2: sel2.languageCode,
        captions: rows,
        bookmarks: updatedBookmarks,
      };
      saveSession(session);
      setHydrated(session);
    },
    [youtubeId, rows, sel1, sel2],
  );

  const addBookmark = useCallback(
    (
      sel: BookmarkSelection & {
        timestamp: number;
        context: string;
        translation?: string;
        etymology?: string;
        notes?: string;
      },
    ) => {
      const bookmark = createBookmark({
        text: sel.text,
        side: sel.side,
        offset: sel.offset,
        captionIndex: sel.captionIndex,
        timestamp: sel.timestamp,
        context: sel.context,
        translation: sel.translation,
        etymology: sel.etymology,
        notes: sel.notes,
      });
      const updated = [...bookmarks, bookmark];
      setBookmarks(updated);
      persistSession(updated);
    },
    [bookmarks, persistSession],
  );

  const deleteBookmark = useCallback(
    (bookmarkId: string) => {
      const updated = bookmarks.filter((b) => b.id !== bookmarkId);
      setBookmarks(updated);
      if (updated.length > 0) {
        persistSession(updated);
      } else {
        deleteSession(youtubeId);
        setHydrated(undefined);
      }
    },
    [bookmarks, youtubeId, persistSession],
  );

  const updateBookmark = useCallback(
    (
      id: string,
      data: Partial<
        Pick<ExtensionBookmark, "translation" | "etymology" | "notes">
      >,
    ) => {
      const updated = bookmarks.map((b) =>
        b.id === id ? { ...b, ...data } : b,
      );
      setBookmarks(updated);
      persistSession(updated);
    },
    [bookmarks, persistSession],
  );

  const updateCaptions = useCallback(
    (entries: { idx: number; text1?: string; text2?: string }[]) => {
      setCaptionOverrides((prev) => {
        const next = new Map(prev);
        for (const { idx, ...data } of entries) {
          next.set(idx, { ...next.get(idx), ...data });
        }
        return next;
      });
    },
    [],
  );

  const clearBookmarks = useCallback(() => {
    setBookmarks([]);
    deleteSession(youtubeId);
    setHydrated(undefined);
  }, [youtubeId]);

  const setTracks = useCallback(
    (v1: string | undefined, v2: string | undefined) => {
      setSelectedPair({ vssId1: v1, vssId2: v2 });
      if (v1 && v2) saveSelectedTracks(tracks, v1, v2, youtubeId);
    },
    [tracks, youtubeId],
  );

  // Export
  const handleExport = useCallback(() => {
    if (!rows) return;
    const data = {
      video: {
        youtubeId: videoMeta.youtubeId,
        title: videoMeta.title,
        channelName: videoMeta.channelName ?? "",
        channelId: videoMeta.channelId ?? "",
        duration: videoMeta.duration ?? 0,
        language1: sel1?.languageCode ?? "ko",
        language2: sel2?.languageCode ?? "en",
      },
      captions: rows.map((r, i) => ({
        idx: i,
        begin: r.begin,
        end: r.end,
        text1: r.text1,
        text2: r.text2,
      })),
      bookmarks: bookmarks.map((b) => ({
        text: b.text,
        translation: b.translation,
        etymology: b.etymology,
        notes: b.notes,
        captionIdx: b.captionIndex,
        side: b.side,
        offset: b.offset,
        context: b.context,
        status: "manual",
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-${videoMeta.youtubeId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, bookmarks, videoMeta, sel1, sel2]);

  return {
    // Track selection
    selectedVssId1,
    selectedVssId2,
    onSelectTracks: setTracks,
    tracksLocked,

    // Merge strategy
    forceStrategy,
    onSetForceStrategy: setForceStrategy,
    activeStrategy,
    isAutoStrategy,
    fallbackStrategies: FALLBACK_STRATEGIES,

    // Caption data
    rows,
    onUpdateCaptions: updateCaptions,
    error,
    loading: hydrated === null, // still checking IndexedDB

    // Bookmarks
    bookmarks,
    bookmarksByIndex,
    onCreateBookmark: addBookmark,
    onDeleteBookmark: deleteBookmark,
    onUpdateBookmark: updateBookmark,
    onClearBookmarks: clearBookmarks,
    hasBookmarks,

    // Export
    onExport: handleExport,
  };
}

export type CaptionSessionManager = ReturnType<typeof useCaptionSession>;
