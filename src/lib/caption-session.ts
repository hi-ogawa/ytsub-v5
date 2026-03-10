import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { removeFromVideoIndex, updateVideoIndex } from "./video-index.ts";
import {
  type Json3File,
  type YouTubeCaptionTrack,
  pickBestTrack,
} from "./youtube.ts";

export interface VideoMeta {
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

// --- Export (standalone) ---

function triggerExportDownload(
  videoMeta: VideoMeta,
  rows: MergedCaption[],
  bookmarks: ExtensionBookmark[],
  sel1: YouTubeCaptionTrack | undefined,
  sel2: YouTubeCaptionTrack | undefined,
) {
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
}

// --- Sub-hooks ---

function useSessionHydration(youtubeId: string) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<CaptionSession | undefined>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSession(youtubeId).then((s) => {
      if (!cancelled) {
        setSession(s);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [youtubeId]);

  return { loading, session, setSession };
}

function useTrackSelection(
  tracks: YouTubeCaptionTrack[],
  youtubeId: string,
  hydratedSession: CaptionSession | undefined,
) {
  const [{ vssId1, vssId2 }, setSelectedPair] = useState(() =>
    getInitialTracks(tracks, youtubeId),
  );

  // Override from hydrated session
  useEffect(() => {
    if (hydratedSession) {
      setSelectedPair({
        vssId1: hydratedSession.vssId1,
        vssId2: hydratedSession.vssId2,
      });
    }
  }, [hydratedSession]);

  const sel1 = tracks.find((t) => t.vssId === vssId1);
  const sel2 = tracks.find((t) => t.vssId === vssId2);

  const setTracks = useCallback(
    (v1: string | undefined, v2: string | undefined) => {
      setSelectedPair({ vssId1: v1, vssId2: v2 });
      if (v1 && v2) saveSelectedTracks(tracks, v1, v2, youtubeId);
    },
    [tracks, youtubeId],
  );

  return {
    selectedVssId1: vssId1,
    selectedVssId2: vssId2,
    sel1,
    sel2,
    setTracks,
  };
}

function useCaptionData(
  sel1: YouTubeCaptionTrack | undefined,
  sel2: YouTubeCaptionTrack | undefined,
  fetchJson3: (track: YouTubeCaptionTrack) => Promise<Json3File>,
  isHydrated: boolean,
  hydratedSession: CaptionSession | undefined,
) {
  const [forceStrategy, setForceStrategy] = useState<
    MergeStrategy | undefined
  >();

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

  let mergedRows: MergedCaption[] | undefined;
  let activeStrategy: MergeStrategy | undefined;

  if (isHydrated && hydratedSession) {
    mergedRows = hydratedSession.captions;
    activeStrategy = undefined;
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

  // Caption text overrides
  const [captionOverrides, setCaptionOverrides] = useState<
    Map<number, { text1?: string; text2?: string }>
  >(new Map());

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

  const isAutoStrategy =
    !isHydrated &&
    !forceStrategy &&
    (activeStrategy === "strict" || activeStrategy === "relaxed-strict");

  const error = json3Query1.error ?? json3Query2.error ?? null;

  return {
    rows,
    activeStrategy,
    isAutoStrategy,
    forceStrategy,
    setForceStrategy,
    updateCaptions,
    error,
  };
}

function useBookmarks(
  youtubeId: string,
  videoMeta: VideoMeta,
  rows: MergedCaption[] | undefined,
  sel1: YouTubeCaptionTrack | undefined,
  sel2: YouTubeCaptionTrack | undefined,
  hydratedSession: CaptionSession | undefined,
  setHydratedSession: (s: CaptionSession | undefined) => void,
) {
  const [bookmarks, setBookmarks] = useState<ExtensionBookmark[]>([]);

  useEffect(() => {
    if (hydratedSession) {
      setBookmarks(hydratedSession.bookmarks);
    }
  }, [hydratedSession]);

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

  // Use refs so persist/sync always read current values without re-creating callbacks
  const rowsRef = useRef(rows);
  const sel1Ref = useRef(sel1);
  const sel2Ref = useRef(sel2);
  const bookmarksRef = useRef(bookmarks);
  rowsRef.current = rows;
  sel1Ref.current = sel1;
  sel2Ref.current = sel2;
  bookmarksRef.current = bookmarks;

  const persist = useCallback(
    (updatedBookmarks: ExtensionBookmark[]) => {
      const r = rowsRef.current;
      const s1 = sel1Ref.current;
      const s2 = sel2Ref.current;
      if (!r || !s1 || !s2) return;
      const session: CaptionSession = {
        youtubeId,
        vssId1: s1.vssId,
        vssId2: s2.vssId,
        language1: s1.languageCode,
        language2: s2.languageCode,
        captions: r,
        bookmarks: updatedBookmarks,
      };
      saveSession(session);
      setHydratedSession(session);
    },
    [youtubeId, setHydratedSession],
  );

  const syncVideoIndex = useCallback(
    (bookmarkCount: number) => {
      if (bookmarkCount > 0) {
        updateVideoIndex(
          youtubeId,
          videoMeta.title,
          videoMeta.channelName ?? "",
          bookmarkCount,
        );
      } else {
        removeFromVideoIndex(youtubeId);
      }
    },
    [youtubeId, videoMeta.title, videoMeta.channelName],
  );

  const addBookmarks = useCallback(
    (
      selections: (BookmarkSelection & {
        timestamp: number;
        context: string;
        translation?: string;
        etymology?: string;
        notes?: string;
      })[],
    ) => {
      const newBookmarks = selections.map((sel) =>
        createBookmark({
          text: sel.text,
          side: sel.side,
          offset: sel.offset,
          captionIndex: sel.captionIndex,
          timestamp: sel.timestamp,
          context: sel.context,
          translation: sel.translation,
          etymology: sel.etymology,
          notes: sel.notes,
        }),
      );
      const updated = [...bookmarksRef.current, ...newBookmarks];
      setBookmarks(updated);
      persist(updated);
      syncVideoIndex(updated.length);
    },
    [persist, syncVideoIndex],
  );

  const deleteBookmark = useCallback(
    (bookmarkId: string) => {
      const updated = bookmarksRef.current.filter((b) => b.id !== bookmarkId);
      setBookmarks(updated);
      if (updated.length > 0) {
        persist(updated);
      } else {
        deleteSession(youtubeId);
        setHydratedSession(undefined);
      }
      syncVideoIndex(updated.length);
    },
    [youtubeId, persist, syncVideoIndex, setHydratedSession],
  );

  const updateBookmarks = useCallback(
    (
      entries: {
        id: string;
        data: Partial<
          Pick<ExtensionBookmark, "translation" | "etymology" | "notes">
        >;
      }[],
    ) => {
      const updates = new Map(entries.map((e) => [e.id, e.data]));
      const updated = bookmarksRef.current.map((b) => {
        const data = updates.get(b.id);
        return data ? { ...b, ...data } : b;
      });
      setBookmarks(updated);
      persist(updated);
    },
    [persist],
  );

  const clearBookmarks = useCallback(() => {
    setBookmarks([]);
    deleteSession(youtubeId);
    setHydratedSession(undefined);
    syncVideoIndex(0);
  }, [youtubeId, syncVideoIndex, setHydratedSession]);

  return {
    bookmarks,
    bookmarksByIndex,
    hasBookmarks,
    addBookmarks,
    deleteBookmark,
    updateBookmarks,
    clearBookmarks,
  };
}

// --- Main hook ---

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
  const {
    loading,
    session: hydratedSession,
    setSession: setHydratedSession,
  } = useSessionHydration(youtubeId);
  const isHydrated = !!hydratedSession;

  const { selectedVssId1, selectedVssId2, sel1, sel2, setTracks } =
    useTrackSelection(tracks, youtubeId, hydratedSession);

  const {
    rows,
    activeStrategy,
    isAutoStrategy,
    forceStrategy,
    setForceStrategy,
    updateCaptions,
    error,
  } = useCaptionData(sel1, sel2, fetchJson3, isHydrated, hydratedSession);

  const bm = useBookmarks(
    youtubeId,
    videoMeta,
    rows,
    sel1,
    sel2,
    hydratedSession,
    setHydratedSession,
  );

  const handleExport = useCallback(() => {
    if (!rows) return;
    triggerExportDownload(videoMeta, rows, bm.bookmarks, sel1, sel2);
  }, [rows, bm.bookmarks, videoMeta, sel1, sel2]);

  return {
    // Track selection
    selectedVssId1,
    selectedVssId2,
    selectedTrack1: sel1,
    selectedTrack2: sel2,
    onSelectTracks: setTracks,
    tracksLocked: bm.hasBookmarks,

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
    loading,

    // Bookmarks
    bookmarks: bm.bookmarks,
    bookmarksByIndex: bm.bookmarksByIndex,
    onCreateBookmarks: bm.addBookmarks,
    onDeleteBookmark: bm.deleteBookmark,
    onUpdateBookmarks: bm.updateBookmarks,
    onClearBookmarks: bm.clearBookmarks,
    hasBookmarks: bm.hasBookmarks,

    // Export
    onExport: handleExport,
  };
}

export type CaptionSessionManager = ReturnType<typeof useCaptionSession>;
