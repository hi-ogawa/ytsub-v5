export interface BookmarkSelection {
  captionIndex: number;
  side: number;
  offset: number;
  text: string;
}

export type ExtensionBookmark = BookmarkSelection & {
  id: string;
  timestamp: number;
  context: string;
  translation?: string;
  etymology?: string;
  notes?: string;
  createdAt: string;
};

// Walk up: text node → span[data-offset] → div[data-side] → div(flex) → div[data-index]
export function extractBookmarkSelection(
  selection: Selection,
): BookmarkSelection | undefined {
  const text = selection.toString();
  if (!text.trim()) {
    return;
  }
  if (selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    return;
  }

  const { startContainer, startOffset, endContainer } = range;
  if (
    startContainer.nodeType !== Node.TEXT_NODE ||
    endContainer.nodeType !== Node.TEXT_NODE
  ) {
    return;
  }

  const startEl = startContainer.parentElement;
  const endEl = endContainer.parentElement;
  const dataOffset = startEl?.getAttribute("data-offset");
  if (!startEl || !endEl || !dataOffset) {
    return;
  }

  const sideEl = startEl.parentElement;
  const dataSide = sideEl?.getAttribute("data-side");
  if (!sideEl || !dataSide || startEl.parentElement !== endEl.parentElement) {
    return;
  }

  const indexEl = sideEl.parentElement?.parentElement;
  const dataIndex = indexEl?.getAttribute("data-index");
  if (!indexEl || !dataIndex) {
    return;
  }

  return {
    captionIndex: Number(dataIndex),
    side: Number(dataSide),
    offset: Number(dataOffset) + startOffset,
    text,
  };
}

/**
 * Groups bookmarks by the caption row they belong to, and numbers them from 1
 * in the order given.
 */
export function indexBookmarks(bookmarks: ExtensionBookmark[]) {
  const bookmarksByIndex = new Map<number, ExtensionBookmark[]>();
  const bookmarkNumberById = new Map<string, number>();
  for (let index = 0; index < bookmarks.length; index++) {
    const bookmark = bookmarks[index];
    bookmarkNumberById.set(bookmark.id, index + 1);
    const list = bookmarksByIndex.get(bookmark.captionIndex);
    if (list) {
      list.push(bookmark);
    } else {
      bookmarksByIndex.set(bookmark.captionIndex, [bookmark]);
    }
  }
  return { bookmarksByIndex, bookmarkNumberById };
}
