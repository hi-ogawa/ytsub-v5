import { expect, test } from "vitest";
import { alignResultToSession } from "./ai-prompt.ts";
import type { ExtensionBookmark } from "./extension-bookmarks.ts";

const bookmark: ExtensionBookmark = {
  id: "b1",
  text: "쌍거풀",
  side: 0,
  offset: 0,
  captionIndex: 7,
  timestamp: 30,
  context: "쌍거풀이 생겼다",
  translation: "double eyelid",
  notes: "kept",
  createdAt: "2026-01-01T00:00:00Z",
};

const captions = [
  { begin: 1, end: 2, text1: "안녕하세요", text2: "Hello" },
  {
    begin: 2,
    end: 4,
    text1: "갑자기 쌍꺼풀이 생겼다",
    text2: "Double eyelids",
  },
];

test("moves a bookmark to its new row and keeps its other fields", () => {
  const result = alignResultToSession(
    {
      captions,
      bookmarks: [{ id: "b1", captionIndex: 1, offset: 4, text: "쌍꺼풀" }],
    },
    [bookmark],
  );
  expect(result.errors).toEqual([]);
  expect(result.captions.map((c) => c.idx)).toEqual([0, 1]);
  expect(result.bookmarks).toEqual([
    {
      ...bookmark,
      text: "쌍꺼풀",
      offset: 4,
      captionIndex: 1,
      context: "갑자기 쌍꺼풀이 생겼다",
      timestamp: 2,
    },
  ]);
});

test("reports a missing bookmark", () => {
  const result = alignResultToSession({ captions, bookmarks: [] }, [bookmark]);
  expect(result.errors).toEqual(['"쌍거풀" (b1) is missing']);
});

test("reports a bookmark whose text isn't at its offset", () => {
  const result = alignResultToSession(
    {
      captions,
      bookmarks: [{ id: "b1", captionIndex: 1, offset: 0, text: "쌍꺼풀" }],
    },
    [bookmark],
  );
  expect(result.errors).toEqual([
    '"쌍꺼풀" not at offset 0 in caption 1: "갑자기 쌍꺼풀이 생겼다"',
  ]);
});

test("checks an English-side bookmark against text2", () => {
  const result = alignResultToSession(
    {
      captions,
      bookmarks: [{ id: "b1", captionIndex: 1, offset: 7, text: "eyelids" }],
    },
    [{ ...bookmark, side: 1 }],
  );
  expect(result.errors).toEqual([]);
  expect(result.bookmarks[0].context).toBe("Double eyelids");
});

test("adds a bookmark from an entry without an id", () => {
  const result = alignResultToSession(
    {
      captions,
      bookmarks: [
        { id: "b1", captionIndex: 1, offset: 4, text: "쌍꺼풀" },
        {
          captionIndex: 0,
          offset: 0,
          text: "안녕하세요",
          translation: "hello",
        },
      ],
    },
    [bookmark],
  );
  expect(result.errors).toEqual([]);
  expect(result.bookmarks[1]).toMatchObject({
    text: "안녕하세요",
    side: 0,
    offset: 0,
    captionIndex: 0,
    context: "안녕하세요",
    timestamp: 1,
    translation: "hello",
  });
});

test("reports a new bookmark whose text isn't at its offset", () => {
  const result = alignResultToSession(
    {
      captions,
      bookmarks: [
        { id: "b1", captionIndex: 1, offset: 4, text: "쌍꺼풀" },
        { captionIndex: 0, offset: 2, text: "안녕" },
      ],
    },
    [bookmark],
  );
  expect(result.errors).toEqual([
    '"안녕" not at offset 2 in caption 0: "안녕하세요"',
  ]);
});
