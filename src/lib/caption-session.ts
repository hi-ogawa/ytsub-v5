import { useQuery } from "@tanstack/react-query";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
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
import type { ExtensionBookmark } from "./extension-bookmarks.ts";
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

export class CaptionSessionStore {
  readonly videoMeta: VideoMeta;
  readonly track1: YouTubeCaptionTrack;
  readonly track2: YouTubeCaptionTrack;
  rows: MergedCaption[];
  readonly strategy: MergeStrategy; // TODO: smells
  bookmarks: ExtensionBookmark[];
  version = 0;
  private listeners = new Set<() => void>();

  constructor(params: {
    tracks: YouTubeCaptionTrack[];
    videoMeta: VideoMeta;
    vssId1: string;
    vssId2: string;
    rows: MergedCaption[];
    strategy: MergeStrategy;
    bookmarks: ExtensionBookmark[];
  }) {
    this.videoMeta = params.videoMeta;
    this.track1 = params.tracks.find((t) => t.vssId === params.vssId1)!;
    this.track2 = params.tracks.find((t) => t.vssId === params.vssId2)!;
    this.rows = params.rows;
    this.strategy = params.strategy;
    this.bookmarks = params.bookmarks;
  }

  notify() {
    this.version++;
    for (const cb of this.listeners) cb();
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // --- Operations ---

  async updateCaptions(
    entries: { idx: number; text1?: string; text2?: string }[],
  ): Promise<void> {
    const updates = new Map(entries.map((e) => [e.idx, e]));
    this.rows = this.rows.map((r) => {
      const u = updates.get(r.idx);
      if (!u) return r;
      return {
        ...r,
        ...(u.text1 !== undefined && { text1: u.text1 }),
        ...(u.text2 !== undefined && { text2: u.text2 }),
      };
    });
    this.notify();
    await this.persistSession();
  }

  async createBookmarks(
    selections: Omit<ExtensionBookmark, "id" | "createdAt">[],
  ): Promise<void> {
    const newBookmarks: ExtensionBookmark[] = selections.map((sel) => ({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...sel,
    }));
    this.bookmarks = [...this.bookmarks, ...newBookmarks];
    this.syncVideoIndex();
    this.notify();
    await this.persistSession();
  }

  async deleteBookmark(bookmarkId: string): Promise<void> {
    this.bookmarks = this.bookmarks.filter((b) => b.id !== bookmarkId);
    if (this.bookmarks.length > 0) {
      this.syncVideoIndex();
      this.notify();
      await this.persistSession();
    } else {
      this.syncVideoIndex();
      this.notify();
      await deleteSession(this.videoMeta.youtubeId);
    }
  }

  async updateBookmarks(
    entries: {
      id: string;
      data: Partial<
        Pick<ExtensionBookmark, "translation" | "etymology" | "notes">
      >;
    }[],
  ): Promise<void> {
    const updates = new Map(entries.map((e) => [e.id, e.data]));
    this.bookmarks = this.bookmarks.map((b) => {
      const data = updates.get(b.id);
      return data ? { ...b, ...data } : b;
    });
    this.notify();
    await this.persistSession();
  }

  async clearBookmarks(): Promise<void> {
    this.bookmarks = [];
    this.syncVideoIndex();
    this.notify();
    await deleteSession(this.videoMeta.youtubeId);
  }

  exportFile(): void {
    const rows = this.rows;
    const data = {
      video: {
        youtubeId: this.videoMeta.youtubeId,
        title: this.videoMeta.title,
        channelName: this.videoMeta.channelName ?? "",
        channelId: this.videoMeta.channelId ?? "",
        duration: this.videoMeta.duration ?? 0,
        language1: this.track1.languageCode,
        language2: this.track2.languageCode,
      },
      captions: rows.map((r, i) => ({
        idx: i,
        begin: r.begin,
        end: r.end,
        text1: r.text1,
        text2: r.text2,
      })),
      bookmarks: this.bookmarks.map((b) => ({
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
    a.download = `import-${this.videoMeta.youtubeId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async persistSession(): Promise<void> {
    const session: CaptionSession = {
      youtubeId: this.videoMeta.youtubeId,
      vssId1: this.track1.vssId,
      vssId2: this.track2.vssId,
      language1: this.track1.languageCode,
      language2: this.track2.languageCode,
      captions: this.rows,
      bookmarks: this.bookmarks,
    };
    await saveSession(session);
  }

  syncVideoIndex(): void {
    if (this.bookmarks.length > 0) {
      updateVideoIndex(
        this.videoMeta.youtubeId,
        this.videoMeta.title,
        this.videoMeta.channelName ?? "",
        this.bookmarks.length,
      );
    } else {
      removeFromVideoIndex(this.videoMeta.youtubeId);
    }
  }
}

// --- React Hook ---

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
  // Hydration from IndexedDB (gcTime: 0 ensures fresh data on each mount)
  const hydrationQuery = useQuery({
    queryKey: ["caption-session", youtubeId],
    queryFn: async () => (await getSession(youtubeId)) ?? null,
    gcTime: 0,
  });
  const session = hydrationQuery.data ?? undefined;
  const isHydrating = hydrationQuery.isPending;

  // Track selection state (user overrides, undefined = use default)
  const [userVssId1, setUserVssId1] = useState<string | undefined>();
  const [userVssId2, setUserVssId2] = useState<string | undefined>();
  const [userStrategy, setUserStrategy] = useState<MergeStrategy | undefined>();

  // Resolve initial tracks from localStorage preferences
  const initialTracks = useMemo(
    () => getInitialTracks(tracks, youtubeId),
    [tracks, youtubeId],
  );

  // Effective track pair: user override > hydrated session > localStorage
  const vssId1 = userVssId1 ?? session?.vssId1 ?? initialTracks.vssId1;
  const vssId2 = userVssId2 ?? session?.vssId2 ?? initialTracks.vssId2;

  // Use hydrated data when session exists and user hasn't overridden tracks
  const useHydratedData = !!session && !userVssId1 && !userVssId2;

  const sel1 = tracks.find((t) => t.vssId === vssId1);
  const sel2 = tracks.find((t) => t.vssId === vssId2);

  // Json3 fetches — disabled while hydrating or when using hydrated data
  const json3Query1 = useQuery({
    queryKey: ["json3", sel1?.vssId],
    queryFn: () => fetchJson3(sel1!),
    enabled: !!sel1 && !isHydrating && !useHydratedData,
  });

  const json3Query2 = useQuery({
    queryKey: ["json3", sel2?.vssId],
    queryFn: () => fetchJson3(sel2!),
    enabled: !!sel2 && !isHydrating && !useHydratedData,
  });

  // Merge fetched captions
  const json3_1 = json3Query1.data;
  const json3_2 = json3Query2.data;
  const mergeResult = useMemo(() => {
    if (useHydratedData || !json3_1 || !json3_2 || !sel1 || !sel2)
      return undefined;
    return mergeCaptions(
      { json3: json3_1, vssId: sel1.vssId },
      { json3: json3_2, vssId: sel2.vssId },
      userStrategy,
    );
  }, [json3_1, json3_2, sel1, sel2, userStrategy, useHydratedData]);

  // Resolve all data for store creation
  const resolvedData = useMemo(() => {
    if (isHydrating || !vssId1 || !vssId2) return null;

    if (useHydratedData) {
      return {
        vssId1: session!.vssId1,
        vssId2: session!.vssId2,
        rows: session!.captions,
        strategy: "partition" as MergeStrategy,
        bookmarks: session!.bookmarks,
      };
    }

    if (!mergeResult) return null;

    return {
      vssId1,
      vssId2,
      rows: mergeResult.captions,
      strategy: mergeResult.strategy,
      bookmarks: [] as ExtensionBookmark[],
    };
  }, [isHydrating, vssId1, vssId2, useHydratedData, session, mergeResult]);

  // Store creation (ref to preserve mutable state across renders)
  const storeRef = useRef<CaptionSessionStore | null>(null);
  const storeKeyRef = useRef("");

  if (resolvedData) {
    const key = `${youtubeId}:${resolvedData.vssId1}:${resolvedData.vssId2}:${resolvedData.strategy}`;
    if (key !== storeKeyRef.current) {
      storeKeyRef.current = key;
      storeRef.current = new CaptionSessionStore({
        tracks,
        videoMeta,
        ...resolvedData,
      });
    }
  } else {
    storeRef.current = null;
    storeKeyRef.current = "";
  }

  const store = storeRef.current;

  useSyncExternalStore(
    (cb) => store?.subscribe(cb) ?? (() => {}),
    () => store?.version ?? 0,
  );

  // Track selection callback
  const selectTracks = useCallback(
    (v1: string | undefined, v2: string | undefined) => {
      setUserVssId1(v1);
      setUserVssId2(v2);
      if (v1 && v2) saveSelectedTracks(tracks, v1, v2, youtubeId);
    },
    [tracks, youtubeId],
  );

  // Strategy selection callback
  const selectStrategy = useCallback((s: MergeStrategy) => {
    setUserStrategy(s);
  }, []);

  const error = json3Query1.error ?? json3Query2.error ?? null;

  return { store, error, selectTracks, selectStrategy, vssId1, vssId2 };
}

export type CaptionSession_Hook = ReturnType<typeof useCaptionSession>;
