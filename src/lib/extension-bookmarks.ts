export type ExtensionBookmark = {
  id: string;
  text: string;
  side: number;
  offset: number;
  captionIndex: number;
  timestamp: number;
  context: string;
  translation: string;
  etymology: string;
  notes: string;
  createdAt: string;
};

function storageKey(youtubeId: string) {
  return `zamak:bookmarks:${youtubeId}`;
}

export function getBookmarks(youtubeId: string): ExtensionBookmark[] {
  try {
    const raw = localStorage.getItem(storageKey(youtubeId));
    return raw ? (JSON.parse(raw) as ExtensionBookmark[]) : [];
  } catch {
    return [];
  }
}

export function addBookmark(
  youtubeId: string,
  data: Omit<
    ExtensionBookmark,
    "id" | "createdAt" | "translation" | "etymology" | "notes"
  >,
): ExtensionBookmark {
  const bookmark: ExtensionBookmark = {
    ...data,
    translation: "",
    etymology: "",
    notes: "",
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const bookmarks = getBookmarks(youtubeId);
  bookmarks.push(bookmark);
  localStorage.setItem(storageKey(youtubeId), JSON.stringify(bookmarks));
  return bookmark;
}

export function updateBookmark(
  youtubeId: string,
  id: string,
  data: Partial<Pick<ExtensionBookmark, "translation" | "etymology" | "notes">>,
): ExtensionBookmark | undefined {
  const bookmarks = getBookmarks(youtubeId);
  const idx = bookmarks.findIndex((b) => b.id === id);
  if (idx === -1) return;
  bookmarks[idx] = { ...bookmarks[idx], ...data };
  localStorage.setItem(storageKey(youtubeId), JSON.stringify(bookmarks));
  return bookmarks[idx];
}

// --- Text selection for bookmarking ---

export interface BookmarkSelection {
  captionIndex: number;
  side: number;
  offset: number;
  text: string;
}

// Walk up: text node → span[data-offset] → div[data-side] → div(flex) → div[data-index]
export function extractBookmarkSelection(
  selection: Selection,
): BookmarkSelection | undefined {
  const text = selection.toString();
  if (!text.trim()) return;
  if (selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  if (range.collapsed) return;

  const { startContainer, startOffset, endContainer } = range;
  if (
    startContainer.nodeType !== Node.TEXT_NODE ||
    endContainer.nodeType !== Node.TEXT_NODE
  )
    return;

  const startEl = startContainer.parentElement;
  const endEl = endContainer.parentElement;
  const dataOffset = startEl?.getAttribute("data-offset");
  if (!startEl || !endEl || !dataOffset) return;

  const sideEl = startEl.parentElement;
  const dataSide = sideEl?.getAttribute("data-side");
  if (!sideEl || !dataSide || startEl.parentElement !== endEl.parentElement)
    return;

  const indexEl = sideEl.parentElement?.parentElement;
  const dataIndex = indexEl?.getAttribute("data-index");
  if (!indexEl || !dataIndex) return;

  return {
    captionIndex: Number(dataIndex),
    side: Number(dataSide),
    offset: Number(dataOffset) + startOffset,
    text,
  };
}
