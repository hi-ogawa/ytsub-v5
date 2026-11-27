import type { YTPlayer } from "../components/youtube-player.tsx";
import { startAnimationFrameLoop } from "../utils/animation-frame-loop.ts";
import { RestartableTask } from "../utils/restartable-task.ts";
import { createStore } from "../utils/store.ts";
import { type MergedCaption, mergeCaptions } from "./caption-merge.ts";
import {
  type ExportData,
  getInitialTracks,
  saveSelectedTracks,
  sessionToExportData,
} from "./caption-session.ts";
import type {
  CaptionStorage,
  PersistedCaptionSession,
} from "./caption-storage.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";
import {
  type Json3File,
  type YouTubeCaptionTrack,
  type YouTubeExtractionResult,
  type YouTubeVideoData,
  getLangCodeFromVssId,
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
}

// Apart from the panel's state, because it changes with every caption while
// the video plays, and only the caption list shows it.
interface PlaybackState {
  /** Index of the caption row at the playback position */
  currentIndex?: number;
  isPlaying: boolean;
  /** Index of the caption row playing on repeat */
  repeatIndex?: number;
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
  private readonly startTime?: number;
  private readonly buildTask = new RestartableTask();
  private player?: YTPlayer;

  constructor(options: {
    storage: CaptionStorage;
    youtubeId: string;
    trackSource?: CaptionTrackSource;
    /** Where the player starts, whose caption is current before playback */
    startTime?: number;
  }) {
    this.storage = options.storage;
    this.youtubeId = options.youtubeId;
    this.trackSource = options.trackSource;
    this.startTime = options.startTime;
  }

  /** Show the saved session, or build one from the tracks picked last time. */
  async restore(): Promise<void> {
    const saved = await this.storage.getSession(this.youtubeId);
    const session = saved && toCaptionSession(saved);
    // The playback loop marks a caption only once the player plays, which a
    // page opened from a link waits a tap for.
    if (session && this.startTime !== undefined) {
      const index = findRowIndexAt(session.rows, this.startTime);
      if (index >= 0) {
        this.playbackStore.update({ currentIndex: index });
      }
    }
    this.store.update({ restoring: false, session });
    const tracks = await this.loadTracks();
    if (tracks && !saved) {
      await this.buildSession(getInitialTracks(tracks, this.youtubeId));
    }
  }

  // Resolves the tracks, or undefined without a source or on failure. A failure
  // stays in `tracksError` instead of rejecting, so it never hides a saved
  // session.
  private async loadTracks(): Promise<YouTubeCaptionTrack[] | undefined> {
    if (!this.trackSource) {
      return undefined;
    }
    this.store.update({ loadingTracks: true });
    try {
      const { video, captionTracks } = await this.trackSource.fetchTracks();
      this.store.update({ loadingTracks: false, video, tracks: captionTracks });
      return captionTracks;
    } catch (error) {
      this.store.update({ loadingTracks: false, tracksError: error });
      return undefined;
    }
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
    this.playbackStore.update({
      currentIndex: undefined,
      isPlaying: false,
      repeatIndex: undefined,
    });
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
    const newBookmarks: ExtensionBookmark[] = selections.map((selection) => ({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...selection,
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
      bookmarks: session.bookmarks.map((bookmark) => {
        const update = updates.get(bookmark.id);
        return update ? { ...bookmark, ...update } : bookmark;
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
    editedAt?: string;
  }): Promise<void> {
    const session = this.getSession();
    await this.updateSession(
      {
        rows: options.captions,
        bookmarks: options.bookmarks,
        vssId1: options.vssId1 ?? session.vssId1,
        vssId2: options.vssId2 ?? session.vssId2,
      },
      { editedAt: options.editedAt },
    );
  }

  toExportData(options?: { editedAt?: string }): ExportData {
    const session = this.getSession();
    return sessionToExportData(
      {
        ...session.video,
        language1: getLangCodeFromVssId(session.vssId1),
        language2: getLangCodeFromVssId(session.vssId2),
        vssId1: session.vssId1,
        vssId2: session.vssId2,
        captions: session.rows,
        bookmarks: session.bookmarks,
      },
      options,
    );
  }

  private getSession(): CaptionSession {
    const { session } = this.store.get();
    if (!session) {
      throw new Error("No caption session");
    }
    return session;
  }

  private async updateSession(
    update: Partial<CaptionSession>,
    options?: { editedAt?: string },
  ): Promise<void> {
    const session = { ...this.getSession(), ...update };
    this.store.update({ session });
    await this.saveSession(session, options);
  }

  private async saveSession(
    session: CaptionSession,
    options?: { editedAt?: string },
  ): Promise<void> {
    await this.storage.saveSession(
      {
        ...session.video,
        vssId1: session.vssId1,
        vssId2: session.vssId2,
        language1: getLangCodeFromVssId(session.vssId1),
        language2: getLangCodeFromVssId(session.vssId2),
        captions: session.rows,
        bookmarks: session.bookmarks,
      },
      { pulledEditedAt: options?.editedAt },
    );
  }

  // --- Playback ---

  /**
   * Control playback through this player, and follow it to the caption at its
   * playback position, until the returned function is called. The current
   * caption stays put while the player is paused.
   */
  attachPlayer(player: YTPlayer): () => void {
    this.player = player;
    const stopLoop = startAnimationFrameLoop(() => this.syncPlayback(player));
    return () => {
      stopLoop();
      this.player = undefined;
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
      const repeatRow =
        state.repeatIndex === undefined ? undefined : rows[state.repeatIndex];
      if (repeatRow && time >= repeatRow.end) {
        player.seekTo(repeatRow.begin);
        return;
      }
      const index = findRowIndexAt(rows, time);
      if (index >= 0) {
        currentIndex = index;
      }
    }
    if (isPlaying !== state.isPlaying || currentIndex !== state.currentIndex) {
      this.playbackStore.update({ isPlaying, currentIndex });
    }
  }

  /**
   * Pause or resume when the row is current, and otherwise play it from its
   * begin. A bookmark starts at its row's begin, so this plays bookmarks too.
   */
  playOrToggleRow(index: number): void {
    if (index === this.playbackStore.get().currentIndex) {
      this.togglePlay();
    } else {
      this.playRow(index);
    }
  }

  /** Seek to the row's begin and play, ending any repeat. */
  private playRow(index: number): void {
    this.player?.seekTo(this.getSession().rows[index].begin);
    this.player?.playVideo();
    this.playbackStore.update({ repeatIndex: undefined });
  }

  /**
   * Play the row on repeat from its begin, or stop repeating it if it already
   * repeats. Only one row repeats at a time.
   */
  toggleRepeat(index: number): void {
    if (this.playbackStore.get().repeatIndex === index) {
      this.playbackStore.update({ repeatIndex: undefined });
      return;
    }
    this.playRow(index);
    this.playbackStore.update({ repeatIndex: index, currentIndex: index });
  }

  private togglePlay(): void {
    if (this.player?.getPlayerState() === 1) {
      this.player.pauseVideo();
    } else {
      this.player?.playVideo();
    }
  }

  // Previous and next wrap around. Previous skips a bookmark within the last
  // second, so pressing it right after a jump moves on instead of repeating.

  /** Seek to the bookmark before the playback position, and return it. */
  seekToPreviousBookmark(): ExtensionBookmark | undefined {
    const { player } = this;
    const bookmarks = sortBookmarks(this.getSession().bookmarks);
    if (!player || bookmarks.length === 0) {
      return undefined;
    }
    const time = player.getCurrentTime();
    const bookmark =
      bookmarks.findLast((b) => b.timestamp < time - 1) ??
      bookmarks[bookmarks.length - 1];
    this.seekToBookmark(bookmark);
    return bookmark;
  }

  /** Seek to the bookmark after the playback position, and return it. */
  seekToNextBookmark(): ExtensionBookmark | undefined {
    const { player } = this;
    const bookmarks = sortBookmarks(this.getSession().bookmarks);
    if (!player || bookmarks.length === 0) {
      return undefined;
    }
    const time = player.getCurrentTime();
    const bookmark =
      bookmarks.find((b) => b.timestamp > time + 0.5) ?? bookmarks[0];
    this.seekToBookmark(bookmark);
    return bookmark;
  }

  // The playback loop only follows the player while it plays, so a paused seek
  // sets the current caption itself.
  private seekToBookmark(bookmark: ExtensionBookmark): void {
    this.player?.seekTo(bookmark.timestamp);
    this.playbackStore.update({
      currentIndex: bookmark.captionIndex,
      repeatIndex: undefined,
    });
  }
}

function findRowIndexAt(rows: MergedCaption[], time: number): number {
  return rows.findLastIndex((row) => row.begin <= time);
}

/** Bookmarks in playback order, the order both panel tabs list them in. */
export function sortBookmarks(
  bookmarks: ExtensionBookmark[],
): ExtensionBookmark[] {
  return [...bookmarks].sort(
    (a, b) => a.timestamp - b.timestamp || a.offset - b.offset,
  );
}

function toCaptionSession(saved: PersistedCaptionSession): CaptionSession {
  return {
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
  };
}
