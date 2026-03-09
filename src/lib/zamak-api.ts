import { useEffect, useRef } from "react";
import skillPrompt from "../../docs/skills/zamak/SKILL.md?raw";
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

interface ZamakLog {
  skillPrompt(): void;
  videoContext(): void;
  captions(): void;
  bookmarks(): void;
}

interface ZamakApi {
  log: ZamakLog;
  getSkillPrompt(): string;
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

const NOT_READY_MSG =
  "ZAMAK: caption panel not open. Open it first, then retry.";

function notReady(method: string): never {
  console.warn(NOT_READY_MSG, `(called: ${method})`);
  throw new Error(NOT_READY_MSG);
}

// Stub API — always available, skill prompt works, everything else warns
function createStubApi(): ZamakApi {
  return {
    log: {
      skillPrompt() {
        console.warn(NOT_READY_MSG, "(skill prompt still readable)");
        console.log("ZAMAK:skillPrompt", skillPrompt);
      },
      videoContext() {
        notReady("log.videoContext");
      },
      captions() {
        notReady("log.captions");
      },
      bookmarks() {
        notReady("log.bookmarks");
      },
    },
    getSkillPrompt: () => skillPrompt,
    getCaptions: () => notReady("getCaptions"),
    updateCaptions: () => notReady("updateCaptions"),
    getBookmarks: () => notReady("getBookmarks"),
    fillBookmarks: () => notReady("fillBookmarks"),
    getVideoContext: () => notReady("getVideoContext"),
  };
}

// Install stub immediately on module load
if (!window.__zamak) {
  window.__zamak = createStubApi();
}

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
  const sessionRef = useRef(session);
  const rowsRef = useRef(rows);
  sessionRef.current = session;
  rowsRef.current = rows;

  useEffect(() => {
    const api: ZamakApi = {
      log: {
        skillPrompt() {
          console.log("ZAMAK:skillPrompt", api.getSkillPrompt());
        },
        videoContext() {
          console.log(
            "ZAMAK:videoContext " + JSON.stringify(api.getVideoContext()),
          );
        },
        captions() {
          console.log("ZAMAK:captions " + JSON.stringify(api.getCaptions()));
        },
        bookmarks() {
          console.log("ZAMAK:bookmarks " + JSON.stringify(api.getBookmarks()));
        },
      },

      getSkillPrompt() {
        return skillPrompt;
      },

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

    window.__zamak = api;

    return () => {
      // Revert to stub on unmount (panel closed)
      window.__zamak = createStubApi();
    };
  }, [videoMeta, language1, language2]);
}
