import { useEffect, useState } from "react";
import type { MergedCaption } from "../lib/caption-merge.ts";
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
export function useBookmarkSelection({
  contentRef,
  runtime,
  rows,
}: {
  contentRef: React.RefObject<HTMLElement | null>;
  runtime: CaptionPanelRuntime;
  rows: MergedCaption[];
}) {
  const [selection, setSelection] = useState<BookmarkSelection>();

  useEffect(() => {
    const handler = () => {
      const domSelection = getSelectionAt(contentRef.current) ?? undefined;
      setSelection(
        domSelection ? extractBookmarkSelection(domSelection) : undefined,
      );
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  function create() {
    if (!selection) {
      return;
    }
    const row = rows[selection.captionIndex];
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
