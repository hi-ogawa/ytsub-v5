import type { InferRouterInputs, InferRouterOutputs } from "@orpc/server";
import type { Router } from "../server/rpc.ts";
import type { MergedCaption } from "./caption-merge.ts";
import { captionPanelPreferences } from "./caption-panel-preferences.ts";
import type {
  CaptionStorage,
  PersistedCaptionSession,
} from "./caption-storage.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";
import { type YouTubeCaptionTrack, pickBestTrack } from "./youtube.ts";

export type ExportData = InferRouterInputs<Router>["videos"]["importVideo"];
type GetFullSessionOutput = NonNullable<
  InferRouterOutputs<Router>["videos"]["getFullSession"]
>;

// --- Track preference persistence ---

export function getInitialTracks(tracks: YouTubeCaptionTrack[]): {
  vssId1?: string;
  vssId2?: string;
} {
  const { language1, language2 } = captionPanelPreferences.get();
  if (!language1 || !language2) {
    return {};
  }
  return {
    vssId1: pickBestTrack(tracks, language1)?.vssId,
    vssId2: pickBestTrack(tracks, language2)?.vssId,
  };
}

export function saveSelectedTracks({
  tracks,
  vssId1,
  vssId2,
}: {
  tracks: YouTubeCaptionTrack[];
  vssId1: string;
  vssId2: string;
}) {
  const track1 = tracks.find((t) => t.vssId === vssId1);
  const track2 = tracks.find((t) => t.vssId === vssId2);
  if (track1 && track2) {
    captionPanelPreferences.update({
      language1: track1.languageCode,
      language2: track2.languageCode,
    });
  }
}

// --- Export ---

export function sessionToExportData(
  session: {
    youtubeId: string;
    title: string;
    channelName: string;
    channelId: string;
    duration: number;
    language1: string;
    language2: string;
    vssId1: string;
    vssId2: string;
    captions: MergedCaption[];
    bookmarks: ExtensionBookmark[];
  },
  options?: { editedAt?: string },
): ExportData {
  return {
    video: {
      youtubeId: session.youtubeId,
      title: session.title,
      channelName: session.channelName,
      channelId: session.channelId,
      duration: session.duration,
      language1: session.language1,
      language2: session.language2,
      vssId1: session.vssId1,
      vssId2: session.vssId2,
      editedAt: options?.editedAt,
    },
    captions: session.captions.map((r, i) => ({
      idx: i,
      begin: r.begin,
      end: r.end,
      text1: r.text1,
      text2: r.text2,
    })),
    bookmarks: session.bookmarks.map((b) => ({
      text: b.text,
      translation: b.translation,
      etymology: b.etymology,
      notes: b.notes,
      captionIdx: b.captionIndex,
      side: b.side,
      offset: b.offset,
      context: b.context,
    })),
  };
}

// --- Import (export data → local storage) ---

export async function importExportData(
  storage: CaptionStorage,
  data: ExportData,
): Promise<void> {
  const session: PersistedCaptionSession = {
    youtubeId: data.video.youtubeId,
    title: data.video.title,
    channelName: data.video.channelName ?? "",
    channelId: data.video.channelId ?? "",
    duration: data.video.duration ?? 0,
    vssId1: data.video.vssId1 ?? "",
    vssId2: data.video.vssId2 ?? "",
    language1: data.video.language1 ?? "",
    language2: data.video.language2 ?? "",
    captions: data.captions.map((c) => ({
      idx: c.idx,
      begin: c.begin,
      end: c.end,
      text1: c.text1 ?? "",
      text2: c.text2 ?? "",
      cue1Indices: [] as number[],
      cue2Indices: [] as number[],
      text1Segments: [c.text1 ?? ""],
      text2Segments: [c.text2 ?? ""],
    })),
    bookmarks: (data.bookmarks ?? []).map((b) => ({
      id: crypto.randomUUID(),
      text: b.text,
      side: b.side ?? 0,
      offset: b.offset ?? 0,
      captionIndex: b.captionIdx,
      timestamp: data.captions[b.captionIdx]?.begin ?? 0,
      context: b.context ?? "",
      translation: b.translation,
      etymology: b.etymology,
      notes: b.notes,
      createdAt: new Date().toISOString(),
    })),
  };
  await storage.saveSession(session);
}

export function serverSessionToLocal(
  data: GetFullSessionOutput,
): PersistedCaptionSession {
  return {
    youtubeId: data.video.youtubeId,
    title: data.video.title,
    channelName: data.video.channelName,
    channelId: data.video.channelId,
    duration: data.video.duration,
    vssId1: data.video.vssId1,
    vssId2: data.video.vssId2,
    language1: data.video.language1,
    language2: data.video.language2,
    captions: data.captions.map((c) => ({
      idx: c.idx,
      begin: c.begin,
      end: c.end,
      text1: c.text1,
      text2: c.text2,
      cue1Indices: [] as number[],
      cue2Indices: [] as number[],
      text1Segments: [c.text1],
      text2Segments: [c.text2],
    })),
    bookmarks: data.bookmarks.map((b) => ({
      id: String(b.id),
      text: b.text,
      side: b.side,
      offset: b.offset,
      captionIndex: data.captions.findIndex((c) => c.id === b.captionId),
      timestamp: b.timestamp,
      context: b.context,
      translation: b.translation,
      etymology: b.etymology,
      notes: b.notes,
      createdAt: b.createdAt,
    })),
  };
}
