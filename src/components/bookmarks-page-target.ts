/**
 * How the caption panel opens the bookmarks page. The web app links to its
 * own route, while a YouTube page can't link to the extension's page, so the
 * extension opens it through a handler.
 */
export type BookmarksPageTarget = { href: string } | { onOpen: () => void };
