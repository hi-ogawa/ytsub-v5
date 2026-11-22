import type { YTPlayer } from "../components/youtube-player.tsx";
import { RestartableTask } from "../utils/restartable-task.ts";
import { createStore } from "../utils/store.ts";
import { type MergedCaption, mergeCaptions } from "./caption-merge.ts";
import {
  type ExportData,
  getInitialTracks,
  saveSelectedTracks,
  sessionToExportData,
} from "./caption-session.ts";
import type { CaptionStorage } from "./caption-storage.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";
import {
  type Json3File,
  type YouTubeCaptionTrack,
  type YouTubeExtractionResult,
  type YouTubeVideoData,
  langFromVssId,
} from "./youtube.ts";

/** Where a new session's captions come from */
export interface CaptionTrackSource {
  fetchTracks(): Promise<YouTubeExtractionResult>;
  fetchJson3(track: YouTubeCaptionTrack): Promise<Json3File>;
}

export interface CaptionSession {
  video: YouTubeVideoData;
  vssId1: string;
  vssId2: string;
  rows: MergedCaption[];
  bookmarks: ExtensionBookmark[];
}

export interface CaptionPanelState {
  /** True until the saved session has been read from storage */
  restoring: boolean;
  session?: CaptionSession;
  /** The video's caption tracks, empty until they load */
  tracks: YouTubeCaptionTrack[];
  /** The video as the track source describes it, for a new session */
  video?: YouTubeVideoData;
  loadingTracks: boolean;
  tracksError?: unknown;
  /** Tracks picked for a session that isn't built yet */
  selectedVssId1?: string;
  selectedVssId2?: string;
  building: boolean;
  buildError?: unknown;
  player?: YTPlayer;
}

// Apart from the panel's state, because it changes with every caption while
// the video plays, and only the caption list shows it.
interface PlaybackState {
  /** Index of the caption row at the playback position */
  currentIndex?: number;
  isPlaying: boolean;
}

/**
 * The caption panel's data and operations for one video: the session of merged
 * captions and bookmarks, building it from caption tracks, and following the
 * player.
 *
 * The saved session needs nothing from YouTube, so it shows whether or not the
 * tracks load. Without a track source, as in the web app, the runtime only
 * shows the saved session.
 *
 * Read state from `store`, and change it only through the methods, because
 * they also save the session.
 */
export class CaptionPanelRuntime {
  readonly store = createStore<CaptionPanelState>({
    restoring: true,
    tracks: [],
    loadingTracks: false,
    building: false,
  });
  readonly playbackStore = createStore<PlaybackState>({ isPlaying: false });

  readonly storage: CaptionStorage;
  readonly youtubeId: string;
  readonly trackSource?: CaptionTrackSource;
  private restorePromise?: Promise<void>;
  private readonly buildTask = new RestartableTask();

  constructor(options: {
    storage: CaptionStorage;
    youtubeId: string;
    trackSource?: CaptionTrackSource;
  }) {
    this.storage = options.storage;
    this.youtubeId = options.youtubeId;
    this.trackSource = options.trackSource;
  }

  /**
   * Show the saved session, or build one from the tracks picked last time. Only
   * the first call does anything.
   */
  restore(): Promise<void> {
    this.restorePromise ??= this.restoreSession();
    return this.restorePromise;
  }

  private async restoreSession(): Promise<void> {
    const tracksLoaded = this.loadTracks();
    const saved = await this.storage.getSession(this.youtubeId);
    if (saved) {
      this.store.update({
        restoring: false,
        session: {
          video: {
            youtubeId: saved.youtubeId,
            title: saved.title,
            channelName: saved.channelName,
            channelId: saved.channelId,
            duration: saved.duration,
          },
          vssId1: saved.vssId1,
          vssId2: saved.vssId2,
          rows: saved.captions,
          bookmarks: saved.bookmarks,
        },
      });
      return;
    }
    this.store.update({ restoring: false });
    if (await tracksLoaded) {
      await this.buildSession(
        getInitialTracks(this.store.get().tracks, this.youtubeId),
      );
    }
  }

  // Resolves whether the tracks loaded. A failure stays in `tracksError`
  // instead of rejecting, so it never hides a saved session.
  private async loadTracks(): Promise<boolean> {
    if (!this.trackSource) {
      return false;
    }
    this.store.update({ loadingTracks: true });
    try {
      const { video, captionTracks } = await this.trackSource.fetchTracks();
      this.store.update({ loadingTracks: false, video, tracks: captionTracks });
      return true;
    } catch (error) {
      this.store.update({ loadingTracks: false, tracksError: error });
      return false;
    }
  }

  getSession(): CaptionSession {
    const { session } = this.store.get();
    if (!session) {
      throw new Error("No caption session");
    }
    return session;
  }

  // --- Building a session from tracks ---

  /** Replace the session with one built from these tracks, once both are picked. */
  async selectTracks(selection: {
    vssId1?: string;
    vssId2?: string;
  }): Promise<void> {
    const { vssId1, vssId2 } = selection;
    if (vssId1 && vssId2) {
      saveSelectedTracks({
        tracks: this.store.get().tracks,
        vssId1,
        vssId2,
        youtubeId: this.youtubeId,
      });
    }
    this.store.update({ session: undefined });
    this.playbackStore.update({ currentIndex: undefined, isPlaying: false });
    await this.buildSession(selection);
  }

  private async buildSession(selection: {
    vssId1?: string;
    vssId2?: string;
  }): Promise<void> {
    const { runStep, signal } = this.buildTask.restart();
    const { tracks, video } = this.store.get();
    const track1 = tracks.find((t) => t.vssId === selection.vssId1);
    const track2 = tracks.find((t) => t.vssId === selection.vssId2);
    this.store.update({
      selectedVssId1: track1?.vssId,
      selectedVssId2: track2?.vssId,
      building: !!track1 && !!track2,
      buildError: undefined,
    });
    // Tracks exist only once the source has loaded them with the video.
    if (!track1 || !track2 || !this.trackSource || !video) {
      return;
    }
    try {
      const [json3_1, json3_2] = await runStep(
        Promise.all([
          this.trackSource.fetchJson3(track1),
          this.trackSource.fetchJson3(track2),
        ]),
      );
      const session: CaptionSession = {
        video,
        vssId1: track1.vssId,
        vssId2: track2.vssId,
        rows: mergeCaptions(
          { json3: json3_1, vssId: track1.vssId },
          { json3: json3_2, vssId: track2.vssId },
        ),
        bookmarks: [],
      };
      await runStep(this.saveSession(session));
      this.store.update({ session, building: false });
    } catch (error) {
      if (!signal.aborted) {
        this.store.update({ building: false, buildError: error });
      }
    }
  }

  // --- Editing the session ---

  async createBookmarks(
    selections: Omit<ExtensionBookmark, "id" | "createdAt">[],
  ): Promise<void> {
    const newBookmarks: ExtensionBookmark[] = selections.map((sel) => ({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...sel,
    }));
    const session = this.getSession();
    await this.updateSession({
      bookmarks: [...session.bookmarks, ...newBookmarks],
    });
  }

  async deleteBookmark(bookmarkId: string): Promise<void> {
    const session = this.getSession();
    await this.updateSession({
      bookmarks: session.bookmarks.filter((b) => b.id !== bookmarkId),
    });
  }

  async updateBookmarks(
    entries: (Partial<ExtensionBookmark> & { id: string })[],
  ): Promise<void> {
    const updates = new Map(entries.map((e) => [e.id, e]));
    const session = this.getSession();
    await this.updateSession({
      bookmarks: session.bookmarks.map((b) => {
        const u = updates.get(b.id);
        return u ? { ...b, ...u } : b;
      }),
    });
  }

  async clearBookmarks(): Promise<void> {
    await this.updateSession({ bookmarks: [] });
  }

  async replace(options: {
    captions: MergedCaption[];
    bookmarks: ExtensionBookmark[];
    vssId1?: string;
    vssId2?: string;
  }): Promise<void> {
    const session = this.getSession();
    await this.updateSession({
      rows: options.captions,
      bookmarks: options.bookmarks,
      vssId1: options.vssId1 ?? session.vssId1,
      vssId2: options.vssId2 ?? session.vssId2,
    });
  }

  toExportData(): ExportData {
    const session = this.getSession();
    return sessionToExportData({
      ...session.video,
      language1: langFromVssId(session.vssId1),
      language2: langFromVssId(session.vssId2),
      vssId1: session.vssId1,
      vssId2: session.vssId2,
      captions: session.rows,
      bookmarks: session.bookmarks,
    });
  }

  private async updateSession(update: Partial<CaptionSession>): Promise<void> {
    const session = { ...this.getSession(), ...update };
    this.store.update({ session });
    await this.saveSession(session);
  }

  private async saveSession(session: CaptionSession): Promise<void> {
    await this.storage.saveSession({
      ...session.video,
      vssId1: session.vssId1,
      vssId2: session.vssId2,
      language1: langFromVssId(session.vssId1),
      language2: langFromVssId(session.vssId2),
      captions: session.rows,
      bookmarks: session.bookmarks,
    });
  }

  // --- Playback ---

  /**
   * Control playback through this player, and follow it to the caption at its
   * playback position, until the returned function is called. The current
   * caption stays put while the player is paused.
   */
  attachPlayer(player: YTPlayer): () => void {
    this.store.update({ player });
    let rafId: number;
    const loop = () => {
      this.syncPlayback(player);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      this.store.update({ player: undefined });
    };
  }

  private syncPlayback(player: YTPlayer): void {
    const rows = this.store.get().session?.rows;
    if (!rows || rows.length === 0) {
      return;
    }
    const isPlaying = player.getPlayerState() === 1;
    const state = this.playbackStore.get();
    let currentIndex = state.currentIndex;
    if (isPlaying) {
      const time = player.getCurrentTime();
      const index = rows.findLastIndex((row) => row.begin <= time);
      if (index >= 0) {
        currentIndex = index;
      }
    }
    if (isPlaying !== state.isPlaying || currentIndex !== state.currentIndex) {
      this.playbackStore.update({ isPlaying, currentIndex });
    }
  }

  // Previous and next wrap around. Previous skips a bookmark within the last
  // second, so pressing it right after a jump moves on instead of repeating.

  /** Seek to the bookmark before the playback position, and return it. */
  seekToPreviousBookmark(): ExtensionBookmark | undefined {
    const { player } = this.store.get();
    const bookmarks = sortBookmarks(this.getSession().bookmarks);
    if (!player || bookmarks.length === 0) {
      return undefined;
    }
    const time = player.getCurrentTime();
    const bookmark =
      bookmarks.findLast((bm) => bm.timestamp < time - 1) ??
      bookmarks[bookmarks.length - 1];
    this.seekToBookmark(bookmark);
    return bookmark;
  }

  /** Seek to the bookmark after the playback position, and return it. */
  seekToNextBookmark(): ExtensionBookmark | undefined {
    const { player } = this.store.get();
    const bookmarks = sortBookmarks(this.getSession().bookmarks);
    if (!player || bookmarks.length === 0) {
      return undefined;
    }
    const time = player.getCurrentTime();
    const bookmark =
      bookmarks.find((bm) => bm.timestamp > time + 0.5) ?? bookmarks[0];
    this.seekToBookmark(bookmark);
    return bookmark;
  }

  // The playback loop only follows the player while it plays, so a paused seek
  // sets the current caption itself.
  private seekToBookmark(bookmark: ExtensionBookmark): void {
    this.store.get().player?.seekTo(bookmark.timestamp);
    this.playbackStore.update({ currentIndex: bookmark.captionIndex });
  }
}

/** Bookmarks in playback order, the order both panel tabs list them in. */
export function sortBookmarks(
  bookmarks: ExtensionBookmark[],
): ExtensionBookmark[] {
  return [...bookmarks].sort(
    (a, b) => a.timestamp - b.timestamp || a.offset - b.offset,
  );
}
