import { useEffect } from "react";
import skillPrompt from "../../docs/skills/zamak/SKILL.md?raw";
import type { CaptionSessionStore } from "./caption-session.ts";

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

interface ZamakAddBookmarkEntry {
  captionIndex: number;
  text: string;
  translation?: string;
  etymology?: string;
  notes?: string;
}

interface ZamakApi {
  log: ZamakLog;
  getSkillPrompt(): string;
  getCaptions(): ZamakCaption[];
  updateCaptions(entries: ZamakCaptionUpdate[]): void;
  getBookmarks(): ZamakBookmark[];
  addBookmarks(entries: ZamakAddBookmarkEntry[]): void;
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
    addBookmarks: () => notReady("addBookmarks"),
    fillBookmarks: () => notReady("fillBookmarks"),
    getVideoContext: () => notReady("getVideoContext"),
  };
}

// Install stub immediately on module load
if (!window.__zamak) {
  window.__zamak = createStubApi();
}

export function useZamakApi(store: CaptionSessionStore | null) {
  useEffect(() => {
    if (!store) {
      window.__zamak = createStubApi();
      return;
    }

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
        return store.rows.map((r, i) => ({
          idx: i,
          begin: r.begin,
          end: r.end,
          text1: r.text1,
          text2: r.text2,
        }));
      },

      updateCaptions(entries) {
        store.updateCaptions(entries);
        console.log(`ZAMAK:updateCaptions done — ${entries.length} updated`);
      },

      getBookmarks(): ZamakBookmark[] {
        const { rows, bookmarks } = store;
        return bookmarks.map((bm) => {
          const start = Math.max(0, bm.captionIndex - CONTEXT_RADIUS);
          const end = Math.min(
            rows.length,
            bm.captionIndex + CONTEXT_RADIUS + 1,
          );
          const captionContext: { text1: string; text2: string }[] = [];
          for (let i = start; i < end; i++) {
            captionContext.push({
              text1: rows[i].text1,
              text2: rows[i].text2,
            });
          }

          return {
            id: bm.id,
            text: bm.text,
            context: bm.context,
            captionContext,
            translation: bm.translation ?? "",
            etymology: bm.etymology ?? "",
            notes: bm.notes ?? "",
          };
        });
      },

      addBookmarks(entries) {
        const { rows } = store;
        const warnings: string[] = [];
        const valid: Parameters<typeof store.createBookmarks>[0] = [];
        for (const { captionIndex, text, ...metadata } of entries) {
          const row = rows[captionIndex];
          if (!row) {
            warnings.push(
              `captionIndex ${captionIndex} out of range, skipped "${text}"`,
            );
            continue;
          }
          const offset = row.text1.indexOf(text);
          if (offset === -1) {
            warnings.push(
              `"${text}" not found in caption ${captionIndex}: "${row.text1}", skipped`,
            );
            continue;
          }
          valid.push({
            captionIndex,
            text,
            side: 0,
            offset,
            timestamp: row.begin,
            context: row.text1,
            ...metadata,
          });
        }
        if (valid.length > 0) {
          store.createBookmarks(valid);
        }
        if (warnings.length > 0) {
          console.warn("ZAMAK:addBookmarks warnings\n" + warnings.join("\n"));
        }
        console.log(
          `ZAMAK:addBookmarks done — ${valid.length} added, ${warnings.length} skipped`,
        );
      },

      fillBookmarks(entries) {
        store.updateBookmarks(entries);
        console.log(`ZAMAK:fillBookmarks done — ${entries.length} updated`);
      },

      getVideoContext() {
        return {
          youtubeId: store.videoMeta.youtubeId,
          title: store.videoMeta.title,
          language1: store.track1.languageCode,
          language2: store.track2.languageCode,
        };
      },
    };

    window.__zamak = api;

    return () => {
      // Revert to stub on unmount (panel closed)
      window.__zamak = createStubApi();
    };
  }, [store]);
}
