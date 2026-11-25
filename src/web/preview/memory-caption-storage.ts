import type {
  CaptionStorage,
  PersistedCaptionSession,
} from "../../lib/caption-storage.ts";

// Keeps sessions until the page reloads. The preview's list page takes its
// entries from fixtures, so this storage keeps no video index.
export class MemoryCaptionStorage implements CaptionStorage {
  private sessions = new Map<string, PersistedCaptionSession>();

  getSession: CaptionStorage["getSession"] = async (youtubeId) =>
    this.sessions.get(youtubeId);

  saveSession: CaptionStorage["saveSession"] = async (session) => {
    this.sessions.set(session.youtubeId, session);
  };

  deleteVideo: CaptionStorage["deleteVideo"] = async (youtubeId) => {
    this.sessions.delete(youtubeId);
  };

  markSynced: CaptionStorage["markSynced"] = async () => {};

  getVideoIndexEntry: CaptionStorage["getVideoIndexEntry"] = async () =>
    undefined;

  listVideoIndex: CaptionStorage["listVideoIndex"] = async () => [];

  subscribe: CaptionStorage["subscribe"] = () => () => {};
}
