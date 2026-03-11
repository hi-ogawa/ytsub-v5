import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
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

// --- Store ---

class CaptionSessionStore {
  // Config (immutable after construction)
  readonly youtubeId: string;
  readonly tracks: YouTubeCaptionTrack[];
  readonly videoMeta: VideoMeta;

  // State
  selectedVssId1: string | undefined;
  selectedVssId2: string | undefined;
  forceStrategy: MergeStrategy | undefined = undefined;
  hydrationStatus: "pending" | "none" | "loaded" = "pending";
  private _rows: MergedCaption[] | undefined = undefined;
  private _activeStrategy: MergeStrategy | undefined = undefined;
  private _captionOverrides = new Map<
    number,
    { text1?: string; text2?: string }
  >();
  private _bookmarks: ExtensionBookmark[] = [];

  // Subscriber
  private _onChange: (() => void) | null = null;
  // Snapshot counter for useSyncExternalStore
  private _version = 0;

  constructor(params: {
    youtubeId: string;
    tracks: YouTubeCaptionTrack[];
    videoMeta: VideoMeta;
  }) {
    this.youtubeId = params.youtubeId;
    this.tracks = params.tracks;
    this.videoMeta = params.videoMeta;
    const initial = getInitialTracks(params.tracks, params.youtubeId);
    this.selectedVssId1 = initial.vssId1;
    this.selectedVssId2 = initial.vssId2;
  }

  private notify() {
    this._version++;
    this._onChange?.();
  }

  get version() {
    return this._version;
  }

  subscribe(cb: () => void) {
    this._onChange = cb;
    return () => {
      if (this._onChange === cb) this._onChange = null;
    };
  }

  // --- Derived ---

  get sel1(): YouTubeCaptionTrack | undefined {
    return this.tracks.find((t) => t.vssId === this.selectedVssId1);
  }

  get sel2(): YouTubeCaptionTrack | undefined {
    return this.tracks.find((t) => t.vssId === this.selectedVssId2);
  }

  get rows(): MergedCaption[] | undefined {
    if (this._captionOverrides.size === 0) return this._rows;
    return this._rows?.map((r) => {
      const override = this._captionOverrides.get(r.idx);
      if (!override) return r;
      return {
        ...r,
        ...(override.text1 !== undefined && { text1: override.text1 }),
        ...(override.text2 !== undefined && { text2: override.text2 }),
      };
    });
  }

  get activeStrategy(): MergeStrategy | undefined {
    return this._activeStrategy;
  }

  get isAutoStrategy(): boolean {
    return (
      this.hydrationStatus !== "loaded" &&
      !this.forceStrategy &&
      (this._activeStrategy === "strict" ||
        this._activeStrategy === "relaxed-strict")
    );
  }

  get bookmarks(): ExtensionBookmark[] {
    return this._bookmarks;
  }

  get bookmarksByIndex(): Map<number, ExtensionBookmark[]> {
    const map = new Map<number, ExtensionBookmark[]>();
    for (const bm of this._bookmarks) {
      const list = map.get(bm.captionIndex);
      if (list) list.push(bm);
      else map.set(bm.captionIndex, [bm]);
    }
    return map;
  }

  get hasBookmarks(): boolean {
    return this._bookmarks.length > 0;
  }

  get tracksLocked(): boolean {
    return this.hasBookmarks;
  }

  get loading(): boolean {
    return this.hydrationStatus === "pending";
  }

  get error(): null {
    // Fetch errors are tracked in React layer (useQuery). Store always returns null.
    return null;
  }

  // --- Operations ---

  async hydrate(): Promise<void> {
    const session = await getSession(this.youtubeId);
    if (session) {
      this.selectedVssId1 = session.vssId1;
      this.selectedVssId2 = session.vssId2;
      this._rows = session.captions;
      this._activeStrategy = undefined;
      this._bookmarks = session.bookmarks;
      this.hydrationStatus = "loaded";
    } else {
      this.hydrationStatus = "none";
    }
    this.notify();
  }

  setCaptions(merged: MergedCaption[], strategy: MergeStrategy): void {
    this._rows = merged;
    this._activeStrategy = strategy;
    this.notify();
  }

  setTracks(v1: string | undefined, v2: string | undefined): void {
    this.selectedVssId1 = v1;
    this.selectedVssId2 = v2;
    if (v1 && v2) saveSelectedTracks(this.tracks, v1, v2, this.youtubeId);
    this.notify();
  }

  setForceStrategy(s: MergeStrategy | undefined): void {
    this.forceStrategy = s;
    this.notify();
  }

  updateCaptions(
    entries: { idx: number; text1?: string; text2?: string }[],
  ): void {
    for (const { idx, ...data } of entries) {
      this._captionOverrides.set(idx, {
        ...this._captionOverrides.get(idx),
        ...data,
      });
    }
    this.notify();
  }

  addBookmarks(
    selections: (BookmarkSelection & {
      timestamp: number;
      context: string;
      translation?: string;
      etymology?: string;
      notes?: string;
    })[],
  ): void {
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
    this._bookmarks = [...this._bookmarks, ...newBookmarks];
    this.persistSession();
    this.syncVideoIndex();
    this.notify();
  }

  deleteBookmark(bookmarkId: string): void {
    this._bookmarks = this._bookmarks.filter((b) => b.id !== bookmarkId);
    if (this._bookmarks.length > 0) {
      this.persistSession();
    } else {
      deleteSession(this.youtubeId);
      this.hydrationStatus = "none";
    }
    this.syncVideoIndex();
    this.notify();
  }

  updateBookmarks(
    entries: {
      id: string;
      data: Partial<
        Pick<ExtensionBookmark, "translation" | "etymology" | "notes">
      >;
    }[],
  ): void {
    const updates = new Map(entries.map((e) => [e.id, e.data]));
    this._bookmarks = this._bookmarks.map((b) => {
      const data = updates.get(b.id);
      return data ? { ...b, ...data } : b;
    });
    this.persistSession();
    this.notify();
  }

  clearBookmarks(): void {
    this._bookmarks = [];
    deleteSession(this.youtubeId);
    this.hydrationStatus = "none";
    this.syncVideoIndex();
    this.notify();
  }

  buildExportData(): object | undefined {
    const rows = this.rows;
    if (!rows) return undefined;
    return {
      video: {
        youtubeId: this.videoMeta.youtubeId,
        title: this.videoMeta.title,
        channelName: this.videoMeta.channelName ?? "",
        channelId: this.videoMeta.channelId ?? "",
        duration: this.videoMeta.duration ?? 0,
        language1: this.sel1?.languageCode ?? "ko",
        language2: this.sel2?.languageCode ?? "en",
      },
      captions: rows.map((r, i) => ({
        idx: i,
        begin: r.begin,
        end: r.end,
        text1: r.text1,
        text2: r.text2,
      })),
      bookmarks: this._bookmarks.map((b) => ({
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
  }

  // --- Internal ---

  private persistSession(): void {
    const rows = this._rows;
    const sel1 = this.sel1;
    const sel2 = this.sel2;
    if (!rows || !sel1 || !sel2) return;
    const session: CaptionSession = {
      youtubeId: this.youtubeId,
      vssId1: sel1.vssId,
      vssId2: sel2.vssId,
      language1: sel1.languageCode,
      language2: sel2.languageCode,
      captions: rows,
      bookmarks: this._bookmarks,
    };
    saveSession(session);
  }

  private syncVideoIndex(): void {
    if (this._bookmarks.length > 0) {
      updateVideoIndex(
        this.youtubeId,
        this.videoMeta.title,
        this.videoMeta.channelName ?? "",
        this._bookmarks.length,
      );
    } else {
      removeFromVideoIndex(this.youtubeId);
    }
  }
}

// --- React Hook (thin adapter) ---

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
  // Create store — stable across renders, recreate on youtubeId change
  const storeRef = useRef<CaptionSessionStore>(undefined);
  if (!storeRef.current || storeRef.current.youtubeId !== youtubeId) {
    storeRef.current = new CaptionSessionStore({
      youtubeId,
      tracks,
      videoMeta,
    });
  }
  const store = storeRef.current;

  // Subscribe for re-renders
  useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.version,
  );

  // Hydrate from IndexedDB
  useEffect(() => {
    store.hydrate();
  }, [store]);

  // Fetch json3 — disabled when hydrated
  const isHydrated = store.hydrationStatus === "loaded";
  const sel1 = store.sel1;
  const sel2 = store.sel2;

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

  // Merge fetched captions into store
  const json3_1 = json3Query1.data;
  const json3_2 = json3Query2.data;
  const mergeResult = useMemo(() => {
    if (isHydrated || !json3_1 || !json3_2 || !sel1 || !sel2) return undefined;
    return mergeCaptions(
      { json3: json3_1, vssId: sel1.vssId },
      { json3: json3_2, vssId: sel2.vssId },
      store.forceStrategy,
    );
  }, [json3_1, json3_2, sel1, sel2, store.forceStrategy, isHydrated]);

  useEffect(() => {
    if (mergeResult) {
      store.setCaptions(mergeResult.captions, mergeResult.strategy);
    }
  }, [mergeResult, store]);

  // Export — DOM trigger lives in React layer
  const handleExport = () => {
    const data = store.buildExportData();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-${youtubeId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const error = json3Query1.error ?? json3Query2.error ?? null;

  return {
    // Track selection
    selectedVssId1: store.selectedVssId1,
    selectedVssId2: store.selectedVssId2,
    selectedTrack1: sel1,
    selectedTrack2: sel2,
    onSelectTracks: (v1: string | undefined, v2: string | undefined) =>
      store.setTracks(v1, v2),
    tracksLocked: store.tracksLocked,

    // Merge strategy
    forceStrategy: store.forceStrategy,
    onSetForceStrategy: (s: MergeStrategy | undefined) =>
      store.setForceStrategy(s),
    activeStrategy: store.activeStrategy,
    isAutoStrategy: store.isAutoStrategy,
    fallbackStrategies: FALLBACK_STRATEGIES,

    // Caption data
    rows: store.rows,
    onUpdateCaptions: (
      entries: { idx: number; text1?: string; text2?: string }[],
    ) => store.updateCaptions(entries),
    error,
    loading: store.loading,

    // Bookmarks
    bookmarks: store.bookmarks,
    bookmarksByIndex: store.bookmarksByIndex,
    onCreateBookmarks: (
      ...args: Parameters<CaptionSessionStore["addBookmarks"]>
    ) => store.addBookmarks(...args),
    onDeleteBookmark: (id: string) => store.deleteBookmark(id),
    onUpdateBookmarks: (
      ...args: Parameters<CaptionSessionStore["updateBookmarks"]>
    ) => store.updateBookmarks(...args),
    onClearBookmarks: () => store.clearBookmarks(),
    hasBookmarks: store.hasBookmarks,

    // Export
    onExport: handleExport,
  };
}

export type CaptionSessionManager = ReturnType<typeof useCaptionSession>;
