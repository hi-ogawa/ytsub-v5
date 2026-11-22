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

  const startElement = startContainer.parentElement;
  const endElement = endContainer.parentElement;
  const dataOffset = startElement?.getAttribute("data-offset");
  if (!startElement || !endElement || !dataOffset) {
    return;
  }

  const sideElement = startElement.parentElement;
  const dataSide = sideElement?.getAttribute("data-side");
  if (
    !sideElement ||
    !dataSide ||
    startElement.parentElement !== endElement.parentElement
  ) {
    return;
  }

  const indexElement = sideElement.parentElement?.parentElement;
  const dataIndex = indexElement?.getAttribute("data-index");
  if (!indexElement || !dataIndex) {
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
  for (let i = 0; i < bookmarks.length; i++) {
    const bm = bookmarks[i];
    bookmarkNumberById.set(bm.id, i + 1);
    const list = bookmarksByIndex.get(bm.captionIndex);
    if (list) {
      list.push(bm);
    } else {
      bookmarksByIndex.set(bm.captionIndex, [bm]);
    }
  }
  return { bookmarksByIndex, bookmarkNumberById };
}
