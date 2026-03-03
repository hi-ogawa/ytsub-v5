interface Video {
  id: number;
  youtubeId: string;
  title: string;
  channelName: string;
  duration: number; // seconds
  language1: string;
  language2: string;
  createdAt: string;
}

export interface Caption {
  id: number;
  videoId: number;
  language: string;
  idx: number;
  begin: number; // seconds
  end: number; // seconds
  text: string;
}

export interface Bookmark {
  id: number;
  videoId: number;
  captionId: number | null;
  text: string;
  translation: string;
  timestamp: number;
  status: "pending" | "approved" | "rejected";
}

export const FAKE_VIDEOS: Video[] = [
  {
    id: 1,
    youtubeId: "9bZkp7q19f0",
    title: "PSY - GANGNAM STYLE(강남스타일) M/V",
    channelName: "officialpsy",
    duration: 252,
    language1: "ko",
    language2: "en",
    createdAt: "2026-03-01",
  },
  {
    id: 2,
    youtubeId: "CK1vLkfKUX0",
    title: "BTS (방탄소년단) 'Dynamite' Official MV",
    channelName: "HYBE LABELS",
    duration: 225,
    language1: "ko",
    language2: "en",
    createdAt: "2026-03-02",
  },
  {
    id: 3,
    youtubeId: "WMweEpGlu_U",
    title: "아이유(IU) - 좋은 날 (Good Day) MV",
    channelName: "1theK (원더케이)",
    duration: 245,
    language1: "ko",
    language2: "en",
    createdAt: "2026-03-03",
  },
];

export const FAKE_CAPTIONS: Caption[] = [
  // Korean captions for video 1
  {
    id: 1,
    videoId: 1,
    language: "ko",
    idx: 0,
    begin: 0,
    end: 4,
    text: "오빤 강남스타일",
  },
  {
    id: 2,
    videoId: 1,
    language: "ko",
    idx: 1,
    begin: 4,
    end: 8,
    text: "강남스타일",
  },
  {
    id: 3,
    videoId: 1,
    language: "ko",
    idx: 2,
    begin: 8,
    end: 12,
    text: "오빤 강남스타일",
  },
  {
    id: 4,
    videoId: 1,
    language: "ko",
    idx: 3,
    begin: 12,
    end: 16,
    text: "강남스타일",
  },
  {
    id: 5,
    videoId: 1,
    language: "ko",
    idx: 4,
    begin: 16,
    end: 20,
    text: "에헤 에헤",
  },
  {
    id: 6,
    videoId: 1,
    language: "ko",
    idx: 5,
    begin: 20,
    end: 24,
    text: "에헤 에헤",
  },
  {
    id: 7,
    videoId: 1,
    language: "ko",
    idx: 6,
    begin: 24,
    end: 28,
    text: "오빤 강남스타일",
  },
  {
    id: 8,
    videoId: 1,
    language: "ko",
    idx: 7,
    begin: 28,
    end: 32,
    text: "낮에는 따사로운 인간적인 여자",
  },
  {
    id: 9,
    videoId: 1,
    language: "ko",
    idx: 8,
    begin: 32,
    end: 36,
    text: "커피 한 잔의 여유를 아는 품격 있는 여자",
  },
  {
    id: 10,
    videoId: 1,
    language: "ko",
    idx: 9,
    begin: 36,
    end: 40,
    text: "밤이 오면 심장이 터져버리는 그런 여자",
  },
  {
    id: 11,
    videoId: 1,
    language: "ko",
    idx: 10,
    begin: 40,
    end: 44,
    text: "그런 반전 있는 여자",
  },
  {
    id: 12,
    videoId: 1,
    language: "ko",
    idx: 11,
    begin: 44,
    end: 48,
    text: "나는 사나이",
  },
  {
    id: 13,
    videoId: 1,
    language: "ko",
    idx: 12,
    begin: 48,
    end: 52,
    text: "낮에는 너만큼 따사로운 그런 사나이",
  },
  {
    id: 14,
    videoId: 1,
    language: "ko",
    idx: 13,
    begin: 52,
    end: 56,
    text: "커피 식기도 전에 마셔버리는 사나이",
  },
  {
    id: 15,
    videoId: 1,
    language: "ko",
    idx: 14,
    begin: 56,
    end: 60,
    text: "밤이 오면 심장이 터져버리는 그런 사나이",
  },
  {
    id: 16,
    videoId: 1,
    language: "ko",
    idx: 15,
    begin: 60,
    end: 64,
    text: "그런 사나이",
  },
  {
    id: 17,
    videoId: 1,
    language: "ko",
    idx: 16,
    begin: 64,
    end: 68,
    text: "아름다워 사랑스러워",
  },
  {
    id: 18,
    videoId: 1,
    language: "ko",
    idx: 17,
    begin: 68,
    end: 72,
    text: "그래 너 hey 그래 바로 너 hey",
  },
  {
    id: 19,
    videoId: 1,
    language: "ko",
    idx: 18,
    begin: 72,
    end: 76,
    text: "지금부터 갈 데까지 가볼까",
  },
  {
    id: 20,
    videoId: 1,
    language: "ko",
    idx: 19,
    begin: 76,
    end: 80,
    text: "오빤 강남스타일",
  },

  // English captions for video 1
  {
    id: 101,
    videoId: 1,
    language: "en",
    idx: 0,
    begin: 0,
    end: 4,
    text: "Oppa Gangnam Style",
  },
  {
    id: 102,
    videoId: 1,
    language: "en",
    idx: 1,
    begin: 4,
    end: 8,
    text: "Gangnam Style",
  },
  {
    id: 103,
    videoId: 1,
    language: "en",
    idx: 2,
    begin: 8,
    end: 12,
    text: "Oppa Gangnam Style",
  },
  {
    id: 104,
    videoId: 1,
    language: "en",
    idx: 3,
    begin: 12,
    end: 16,
    text: "Gangnam Style",
  },
  {
    id: 105,
    videoId: 1,
    language: "en",
    idx: 4,
    begin: 16,
    end: 20,
    text: "Eh, eh",
  },
  {
    id: 106,
    videoId: 1,
    language: "en",
    idx: 5,
    begin: 20,
    end: 24,
    text: "Eh, eh",
  },
  {
    id: 107,
    videoId: 1,
    language: "en",
    idx: 6,
    begin: 24,
    end: 28,
    text: "Oppa Gangnam Style",
  },
  {
    id: 108,
    videoId: 1,
    language: "en",
    idx: 7,
    begin: 28,
    end: 32,
    text: "A warm and human girl during the day",
  },
  {
    id: 109,
    videoId: 1,
    language: "en",
    idx: 8,
    begin: 32,
    end: 36,
    text: "A classy girl who knows how to enjoy a cup of coffee",
  },
  {
    id: 110,
    videoId: 1,
    language: "en",
    idx: 9,
    begin: 36,
    end: 40,
    text: "A girl whose heart explodes when night comes",
  },
  {
    id: 111,
    videoId: 1,
    language: "en",
    idx: 10,
    begin: 40,
    end: 44,
    text: "Such a girl with a twist",
  },
  {
    id: 112,
    videoId: 1,
    language: "en",
    idx: 11,
    begin: 44,
    end: 48,
    text: "I am a man",
  },
  {
    id: 113,
    videoId: 1,
    language: "en",
    idx: 12,
    begin: 48,
    end: 52,
    text: "A man as warm as you during the day",
  },
  {
    id: 114,
    videoId: 1,
    language: "en",
    idx: 13,
    begin: 52,
    end: 56,
    text: "A man who gulps down his coffee before it cools",
  },
  {
    id: 115,
    videoId: 1,
    language: "en",
    idx: 14,
    begin: 56,
    end: 60,
    text: "A man whose heart explodes when night comes",
  },
  {
    id: 116,
    videoId: 1,
    language: "en",
    idx: 15,
    begin: 60,
    end: 64,
    text: "Such a man",
  },
  {
    id: 117,
    videoId: 1,
    language: "en",
    idx: 16,
    begin: 64,
    end: 68,
    text: "Beautiful and loveable",
  },
  {
    id: 118,
    videoId: 1,
    language: "en",
    idx: 17,
    begin: 68,
    end: 72,
    text: "Yeah you, hey, yeah exactly you, hey",
  },
  {
    id: 119,
    videoId: 1,
    language: "en",
    idx: 18,
    begin: 72,
    end: 76,
    text: "Shall we go all the way from now on?",
  },
  {
    id: 120,
    videoId: 1,
    language: "en",
    idx: 19,
    begin: 76,
    end: 80,
    text: "Oppa Gangnam Style",
  },
];

export const FAKE_BOOKMARKS: Bookmark[] = [
  {
    id: 1,
    videoId: 1,
    captionId: 8,
    text: "따사로운",
    translation: "warm, gentle",
    timestamp: 28,
    status: "approved",
  },
  {
    id: 2,
    videoId: 1,
    captionId: 9,
    text: "품격",
    translation: "dignity, grace, class",
    timestamp: 32,
    status: "pending",
  },
  {
    id: 3,
    videoId: 1,
    captionId: 10,
    text: "심장이 터져버리는",
    translation: "heart bursting/exploding",
    timestamp: 36,
    status: "pending",
  },
  {
    id: 4,
    videoId: 1,
    captionId: 11,
    text: "반전",
    translation: "reversal, twist, surprise",
    timestamp: 40,
    status: "approved",
  },
];

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
