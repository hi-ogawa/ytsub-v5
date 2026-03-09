import { useEffect, useRef } from "react";
import type { MergedCaption } from "./caption-merge.ts";
import type { CaptionSessionManager } from "./caption-session.ts";

interface VideoMeta {
  youtubeId: string;
  title: string;
  channelName?: string;
  channelId?: string;
  duration?: number;
}

interface ZamakBookmark {
  id: string;
  text: string;
  context: string;
  captionContext: { text1: string; text2: string }[];
  translation: string;
  etymology: string;
  notes: string;
}

interface ZamakFillEntry {
  id: string;
  translation?: string;
  etymology?: string;
  notes?: string;
}

interface ZamakCaption {
  idx: number;
  begin: number;
  end: number;
  text1: string;
  text2: string;
}

interface ZamakCaptionUpdate {
  idx: number;
  text1?: string;
  text2?: string;
}

interface ZamakApi {
  getCaptions(): ZamakCaption[];
  updateCaptions(entries: ZamakCaptionUpdate[]): void;
  getBookmarks(): ZamakBookmark[];
  fillBookmarks(entries: ZamakFillEntry[]): void;
  getVideoContext(): {
    youtubeId: string;
    title: string;
    language1: string;
    language2: string;
  };
}

declare global {
  interface Window {
    __zamak?: ZamakApi;
  }
}

const CONTEXT_RADIUS = 1; // rows before/after the bookmark's caption

export function useZamakApi({
  session,
  rows,
  videoMeta,
  language1,
  language2,
}: {
  session: CaptionSessionManager;
  rows: MergedCaption[] | undefined;
  videoMeta: VideoMeta;
  language1: string;
  language2: string;
}) {
  // Use refs to avoid re-running the effect on every state change
  // while keeping the API methods current
  const sessionRef = useRef(session);
  const rowsRef = useRef(rows);
  sessionRef.current = session;
  rowsRef.current = rows;

  useEffect(() => {
    window.__zamak = {
      getCaptions(): ZamakCaption[] {
        const currentRows = rowsRef.current;
        if (!currentRows) return [];
        return currentRows.map((r, i) => ({
          idx: i,
          begin: r.begin,
          end: r.end,
          text1: r.text1,
          text2: r.text2,
        }));
      },

      updateCaptions(entries) {
        sessionRef.current.onUpdateCaptions(entries);
      },

      getBookmarks(): ZamakBookmark[] {
        const { bookmarks } = sessionRef.current;
        const currentRows = rowsRef.current;
        if (!currentRows) return [];

        return bookmarks.map((bm) => {
          const start = Math.max(0, bm.captionIndex - CONTEXT_RADIUS);
          const end = Math.min(
            currentRows.length,
            bm.captionIndex + CONTEXT_RADIUS + 1,
          );
          const captionContext: { text1: string; text2: string }[] = [];
          for (let i = start; i < end; i++) {
            captionContext.push({
              text1: currentRows[i].text1,
              text2: currentRows[i].text2,
            });
          }

          return {
            id: bm.id,
            text: bm.text,
            context: bm.context,
            captionContext,
            translation: bm.translation,
            etymology: bm.etymology,
            notes: bm.notes,
          };
        });
      },

      fillBookmarks(entries) {
        for (const { id, ...data } of entries) {
          sessionRef.current.onUpdateBookmark(id, data);
        }
      },

      getVideoContext() {
        return {
          youtubeId: videoMeta.youtubeId,
          title: videoMeta.title,
          language1,
          language2,
        };
      },
    };

    return () => {
      delete window.__zamak;
    };
  }, [videoMeta, language1, language2]);
}
