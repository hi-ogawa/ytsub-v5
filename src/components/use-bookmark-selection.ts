import { useEffect, useState } from "react";
import type { CaptionPanelRuntime } from "../lib/caption-panel-runtime.ts";
import {
  type BookmarkSelection,
  extractBookmarkSelection,
} from "../lib/extension-bookmarks.ts";
import { getSelectionAt } from "../utils/get-selection.ts";

/**
 * Tracks text selected inside `contentRef` as a bookmark candidate, and
 * creates the bookmark from it on `create()`.
 */
export function useBookmarkSelection(
  contentRef: React.RefObject<HTMLElement | null>,
  runtime: CaptionPanelRuntime,
) {
  const [selection, setSelection] = useState<BookmarkSelection>();

  useEffect(() => {
    const handler = () => {
      const sel = getSelectionAt(contentRef.current) ?? undefined;
      setSelection(sel ? extractBookmarkSelection(sel) : undefined);
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  function create() {
    if (!selection) {
      return;
    }
    const row = runtime.getSession().rows[selection.captionIndex];
    if (!row) {
      return;
    }
    runtime.createBookmarks([
      {
        ...selection,
        timestamp: row.begin,
        context: selection.side === 0 ? row.text1 : row.text2,
      },
    ]);
    cancel();
  }

  function cancel() {
    getSelectionAt(contentRef.current)?.removeAllRanges();
    setSelection(undefined);
  }

  return { selection, create, cancel };
}
