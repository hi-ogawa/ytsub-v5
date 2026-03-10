/** Minimal caption row — satisfied by both MergedCaption and server Caption */
export type CaptionRow = {
  idx: number;
  begin: number;
  end: number;
  text1: string;
  text2: string;
};

/** Minimal bookmark — satisfied by both ExtensionBookmark and server Bookmark */
export type BookmarkItem = {
  id: string | number;
  text: string;
  side: number;
  offset: number;
  timestamp: number;
  translation: string;
  etymology: string;
  notes: string;
};
