// Keep a local copy of the user's videos up to date, one getFullSession result per video.
// Usage: ZAMAK_USERNAME=... ZAMAK_PASSWORD=... node skills/zamak/scripts/sync-library.ts
// The copy goes to $ZAMAK_CACHE_DIR, or ~/.cache/zamak by default.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API_URL = "https://zamak.hiro18181.workers.dev/api";
const PAGE_SIZE = 100;

// Maps each cached video's youtubeId to its editedAt
type Index = Record<string, string>;

interface ListedVideo {
  youtubeId: string;
  title: string;
  editedAt: string;
}

async function main() {
  const username = process.env.ZAMAK_USERNAME;
  const password = process.env.ZAMAK_PASSWORD;
  if (!username || !password) {
    throw new Error("Set ZAMAK_USERNAME and ZAMAK_PASSWORD");
  }
  const cacheDir =
    process.env.ZAMAK_CACHE_DIR ?? join(homedir(), ".cache/zamak");
  const videosDir = join(cacheDir, "videos");
  const indexPath = join(cacheDir, "index.json");
  mkdirSync(videosDir, { recursive: true });

  const index = readIndex(indexPath);
  const { token } = await callApi<{ token: string }>({
    path: "auth/login",
    input: { username, password },
  });
  const listed = await listAllVideos(token);

  let fetched = 0;
  for (const video of listed) {
    if (index[video.youtubeId] === video.editedAt) {
      continue;
    }
    const session = await callApi<{ video: { editedAt: string } } | null>({
      path: "videos/getFullSession",
      input: { youtubeId: video.youtubeId },
      token,
    });
    if (!session) {
      continue;
    }
    writeFileSync(
      join(videosDir, `${video.youtubeId}.json`),
      JSON.stringify(session, null, 2),
    );
    // The session's own editedAt, in case the video changed since the listing
    index[video.youtubeId] = session.video.editedAt;
    fetched++;
    console.log(`fetched ${video.youtubeId} ${video.title}`);
  }

  const listedIds = new Set(listed.map((video) => video.youtubeId));
  let removed = 0;
  for (const youtubeId of Object.keys(index)) {
    if (listedIds.has(youtubeId)) {
      continue;
    }
    rmSync(join(videosDir, `${youtubeId}.json`), { force: true });
    delete index[youtubeId];
    removed++;
    console.log(`removed ${youtubeId}`);
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(
    `${listed.length} videos in ${cacheDir}: ${fetched} fetched, ${removed} removed`,
  );
}

function readIndex(indexPath: string): Index {
  try {
    return JSON.parse(readFileSync(indexPath, "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function listAllVideos(token: string): Promise<ListedVideo[]> {
  const videos: ListedVideo[] = [];
  while (true) {
    const page = await callApi<{ items: ListedVideo[]; total: number }>({
      path: "videos/listVideos",
      input: { limit: PAGE_SIZE, offset: videos.length },
      token,
    });
    videos.push(...page.items);
    if (page.items.length === 0 || videos.length >= page.total) {
      return videos;
    }
  }
}

async function callApi<T>({
  path,
  input,
  token,
}: {
  path: string;
  input: unknown;
  token?: string;
}): Promise<T> {
  const response = await fetch(`${API_URL}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ json: input }),
  });
  if (!response.ok) {
    throw new Error(
      `${path} failed: ${response.status} ${await response.text()}`,
    );
  }
  const body = (await response.json()) as { json: T };
  return body.json;
}

await main();
