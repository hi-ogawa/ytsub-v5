import type { APIRequestContext } from "@playwright/test";

export const rpc = (request: APIRequestContext, path: string, data: any = {}) =>
  request.post(`/api/${path.replace(/\./g, "/")}`, {
    headers: { "Content-Type": "application/json" },
    data: { json: data },
  });

export const json = async (res: Awaited<ReturnType<typeof rpc>>) => {
  const body = await res.json();
  return body.json;
};

export const uid = () => Math.random().toString(36).slice(2);

export async function seedVideo(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
) {
  const res = await rpc(request, "videos/createVideo", {
    youtubeId: `seed-${uid()}`,
    title: "Seed Video",
    channelName: "Seed Channel",
    duration: 300,
    ...overrides,
  });
  return json(res);
}

export async function seedCaptions(
  request: APIRequestContext,
  videoId: number,
  language = "ko",
  texts: string[] = ["안녕하세요", "감사합니다"],
) {
  const res = await rpc(request, "videos/createCaptions", {
    videoId,
    captions: texts.map((text, i) => ({
      language,
      idx: i,
      begin: i * 2.5,
      end: (i + 1) * 2.5,
      text,
    })),
  });
  return json(res);
}

export async function seedBookmarks(
  request: APIRequestContext,
  videoId: number,
  texts: string[] = ["안녕", "세계"],
) {
  const res = await rpc(request, "bookmarks/createBookmarks", {
    bookmarks: texts.map((text, i) => ({
      videoId,
      text,
      translation: `translation-${i}`,
      timestamp: i * 1.5,
    })),
  });
  return json(res);
}
