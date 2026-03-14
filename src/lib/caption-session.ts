import type { InferRouterInputs } from "@orpc/server";
import type { Router } from "../server/rpc.ts";
import { type MergeStrategy, type MergedCaption } from "./caption-merge.ts";
import {
  type PersistedCaptionSession,
  deleteSession,
  saveSession,
} from "./caption-session-db.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";
import { removeFromVideoIndex, updateVideoIndex } from "./video-index.ts";
import {
  type YouTubeCaptionTrack,
  type YouTubeVideoData,
  pickBestTrack,
} from "./youtube.ts";

type ExportData = InferRouterInputs<Router>["videos"]["importVideo"];

// --- Track preference persistence ---

const TRACKS_KEY = "zamak:selected-tracks";
const LANGS_KEY = "zamak:preferred-langs";

export function getInitialTracks(
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

export function saveSelectedTracks(
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

function langFromVssId(vssId: string): string {
  return vssId.split(".").pop()!;
}

export class CaptionSessionManager {
  readonly videoMeta: YouTubeVideoData;
  vssId1: string;
  vssId2: string;
  rows: MergedCaption[];
  readonly strategy: MergeStrategy; // TODO: smells
  bookmarks: ExtensionBookmark[];
  version = 0;
  private listeners = new Set<() => void>();

  constructor(params: {
    videoMeta: YouTubeVideoData;
    vssId1: string;
    vssId2: string;
    rows: MergedCaption[];
    strategy: MergeStrategy;
    bookmarks: ExtensionBookmark[];
  }) {
    this.videoMeta = params.videoMeta;
    this.vssId1 = params.vssId1;
    this.vssId2 = params.vssId2;
    this.rows = params.rows;
    this.strategy = params.strategy;
    this.bookmarks = params.bookmarks;
  }

  notify() {
    this.version++;
    for (const cb of this.listeners) cb();
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

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
    entries: (Partial<ExtensionBookmark> & { id: string })[],
  ): Promise<void> {
    const updates = new Map(entries.map((e) => [e.id, e]));
    this.bookmarks = this.bookmarks.map((b) => {
      const u = updates.get(b.id);
      return u ? { ...b, ...u } : b;
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

  async replace(options: {
    captions: MergedCaption[];
    bookmarks: ExtensionBookmark[];
    vssId1?: string;
    vssId2?: string;
  }): Promise<void> {
    this.rows = options.captions;
    this.bookmarks = options.bookmarks;
    if (options.vssId1 !== undefined) this.vssId1 = options.vssId1;
    if (options.vssId2 !== undefined) this.vssId2 = options.vssId2;
    this.syncVideoIndex();
    this.notify();
    await this.persistSession();
  }

  toExportData(): ExportData {
    return {
      video: {
        youtubeId: this.videoMeta.youtubeId,
        title: this.videoMeta.title,
        channelName: this.videoMeta.channelName,
        channelId: this.videoMeta.channelId,
        duration: this.videoMeta.duration,
        language1: langFromVssId(this.vssId1),
        language2: langFromVssId(this.vssId2),
        vssId1: this.vssId1,
        vssId2: this.vssId2,
      },
      captions: this.rows.map((r, i) => ({
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
  }

  async persistSession(): Promise<void> {
    const session: PersistedCaptionSession = {
      youtubeId: this.videoMeta.youtubeId,
      vssId1: this.vssId1,
      vssId2: this.vssId2,
      language1: langFromVssId(this.vssId1),
      language2: langFromVssId(this.vssId2),
      strategy: this.strategy,
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
        this.videoMeta.channelName,
        this.bookmarks.length,
      );
    } else {
      removeFromVideoIndex(this.videoMeta.youtubeId);
    }
  }
}
