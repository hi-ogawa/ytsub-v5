// YouTube video data extraction and subtitle parsing.
// Core logic for the browser extension — no extension APIs, testable standalone.
//
// Functions marked "page-context" must run in YouTube's main world
// (via Playwright page.evaluate or extension main-world content script).
// They are self-contained — no imports, no closures.

// === Types ===

interface YouTubeVideoData {
  youtubeId: string;
  title: string;
  channelName: string;
  channelId: string;
  duration: number;
}

interface YouTubeCaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string; // "asr" = auto-generated, absent = manual
  name: string;
  vssId: string;
}

interface YouTubeExtractionResult {
  video: YouTubeVideoData;
  captionTracks: YouTubeCaptionTrack[];
}

interface Json3Event {
  tStartMs: number;
  dDurationMs: number;
  segs?: { utf8: string }[];
}

interface Json3File {
  events: Json3Event[];
}

interface CaptionCue {
  begin: number;
  end: number;
  text: string;
}

// === Page-context functions ===
// Self-contained: no imports, no closures. Serialized by page.evaluate().

/**
 * Extract video metadata + caption track list from ytInitialPlayerResponse.
 * Useful for checking subtitle availability quickly (no API call),
 * but the baseUrls are NOT usable for fetching — YouTube requires a POT
 * (Proof of Origin Token) that only the player JS generates at runtime.
 * Use fetchPlayerApi() to get usable baseUrls.
 */
export function extractVideoData(): YouTubeExtractionResult {
  const playerResponse = (
    window as unknown as { ytInitialPlayerResponse?: Record<string, unknown> }
  ).ytInitialPlayerResponse as Record<string, unknown> | undefined;
  if (!playerResponse) {
    throw new Error("ytInitialPlayerResponse not found on page");
  }

  const details = playerResponse.videoDetails as Record<string, unknown>;
  if (!details) {
    throw new Error("videoDetails not found in player response");
  }

  const captions = playerResponse.captions as
    | Record<string, unknown>
    | undefined;
  const tracklistRenderer = captions?.playerCaptionsTracklistRenderer as
    | Record<string, unknown>
    | undefined;
  const rawTracks = (tracklistRenderer?.captionTracks ?? []) as Record<
    string,
    unknown
  >[];

  const captionTracks = rawTracks.map((track) => {
    // name can be { simpleText: "..." } or { runs: [{ text: "..." }] }
    const nameObj = track.name as Record<string, unknown> | undefined;
    let name = String(track.languageCode);
    if (nameObj) {
      if (typeof nameObj.simpleText === "string") {
        name = nameObj.simpleText;
      } else if (Array.isArray(nameObj.runs)) {
        name = (nameObj.runs as { text: string }[]).map((r) => r.text).join("");
      }
    }
    return {
      baseUrl: String(track.baseUrl),
      languageCode: String(track.languageCode),
      kind: track.kind ? String(track.kind) : undefined,
      name,
      vssId: String(track.vssId),
    };
  });

  return {
    video: {
      youtubeId: String(details.videoId),
      title: String(details.title),
      channelName: String(details.author),
      channelId: String(details.channelId),
      duration: Number(details.lengthSeconds),
    },
    captionTracks,
  };
}

/** Fetch json3 subtitle data for a caption track URL. Same-origin on YouTube. */
export async function fetchTrackJson3(baseUrl: string): Promise<Json3File> {
  const url = new URL(baseUrl);
  url.searchParams.set("fmt", "json3");
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch json3: ${res.status} ${text}`);
  }
  const text = await res.text();
  if (!text) {
    throw new Error(`Empty response from json3 fetch (status ${res.status})`);
  }
  return JSON.parse(text);
}

/**
 * Fetch video metadata via youtubei/v1/player with mobile client spoofing.
 * Mobile clients don't require SUBS POT, so caption baseUrls work directly.
 * Must run in YouTube page context (same-origin).
 *
 * Client configs synced from yt-dlp (see docs/skills/yt-dlp/SKILL.md).
 * Inlined in function body so page.evaluate() serialization works.
 */
export async function fetchPlayerApi(
  videoId: string,
): Promise<YouTubeExtractionResult> {
  // Mobile clients that don't require JS player or SUBS POT
  const clients = {
    // yt-dlp's current default — simplest client, no POT policies at all
    android_vr: {
      clientId: "28",
      userAgent:
        "com.google.android.apps.youtube.vr.oculus/1.71.26 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
      context: {
        clientName: "ANDROID_VR",
        clientVersion: "1.71.26",
        deviceMake: "Oculus",
        deviceModel: "Quest 3",
        androidSdkVersion: 32,
        osName: "Android",
        osVersion: "12L",
      },
    },
    // Fallback — proven in ytsub-v4
    ios: {
      clientId: "5",
      userAgent:
        "com.google.ios.youtube/21.02.3 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
      context: {
        clientName: "IOS",
        clientVersion: "21.02.3",
        deviceMake: "Apple",
        deviceModel: "iPhone16,2",
        osName: "iPhone",
        osVersion: "18.3.2.22D82",
      },
    },
  };
  const client = clients.android_vr;

  // Extract visitorData from ytcfg on the page
  const ytcfg = (
    window as unknown as { ytcfg?: { data_?: Record<string, unknown> } }
  ).ytcfg;
  let visitorData: string | undefined;
  if (ytcfg?.data_) {
    const d = ytcfg.data_;
    visitorData =
      (d.VISITOR_DATA as string) ??
      ((
        (d.INNERTUBE_CONTEXT as Record<string, unknown>)?.client as Record<
          string,
          unknown
        >
      )?.visitorData as string);
  }
  if (!visitorData) {
    throw new Error("Could not extract visitorData from ytcfg");
  }

  const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YouTube-Client-Name": client.clientId,
      "X-YouTube-Client-Version": client.context.clientVersion,
      "X-Goog-Visitor-Id": visitorData,
      Origin: "https://www.youtube.com",
      "User-Agent": client.userAgent,
    },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          ...client.context,
          userAgent: client.userAgent,
          hl: "en",
          timeZone: "UTC",
          utcOffsetMinutes: 0,
        },
      },
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Player API returned ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  // Parse response (inlined — page.evaluate can't see external functions)
  const details = data.videoDetails as Record<string, unknown>;
  if (!details) {
    throw new Error("videoDetails not found in player API response");
  }

  const captions = data.captions as Record<string, unknown> | undefined;
  const tracklistRenderer = captions?.playerCaptionsTracklistRenderer as
    | Record<string, unknown>
    | undefined;
  const rawTracks = (tracklistRenderer?.captionTracks ?? []) as Record<
    string,
    unknown
  >[];

  const captionTracks = rawTracks.map((track) => {
    const nameObj = track.name as Record<string, unknown> | undefined;
    let trackName = String(track.languageCode);
    if (nameObj) {
      if (typeof nameObj.simpleText === "string") {
        trackName = nameObj.simpleText;
      } else if (Array.isArray(nameObj.runs)) {
        trackName = (nameObj.runs as { text: string }[])
          .map((r) => r.text)
          .join("");
      }
    }
    return {
      baseUrl: String(track.baseUrl),
      languageCode: String(track.languageCode),
      kind: track.kind ? String(track.kind) : undefined,
      name: trackName,
      vssId: String(track.vssId),
    };
  });

  return {
    video: {
      youtubeId: String(details.videoId),
      title: String(details.title),
      channelName: String(details.author),
      channelId: String(details.channelId),
      duration: Number(details.lengthSeconds),
    },
    captionTracks,
  };
}

// === Universal functions ===
// Run anywhere (Node, browser, extension).

/** Parse json3 subtitle data → cue array. */
export function parseJson3(data: Json3File): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const event of data.events) {
    if (!event.segs || !event.dDurationMs) continue;
    const text = event.segs
      .map((s) => s.utf8)
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (!text) continue;
    cues.push({
      begin: event.tStartMs / 1000,
      end: (event.tStartMs + event.dDurationMs) / 1000,
      text,
    });
  }
  return cues;
}

/** Pick best caption tracks for ko + en from available tracks. */
export function pickTracks(
  tracks: YouTubeCaptionTrack[],
  lang1 = "ko",
  lang2 = "en",
): {
  track1: YouTubeCaptionTrack | undefined;
  track2: YouTubeCaptionTrack | undefined;
} {
  function pickBest(lang: string) {
    const forLang = tracks.filter((t) => t.languageCode === lang);
    // Prefer manual (kind absent) over auto-generated (kind: "asr")
    return (
      forLang.find((t) => !t.kind) ?? forLang.find((t) => t.kind === "asr")
    );
  }
  return { track1: pickBest(lang1), track2: pickBest(lang2) };
}
