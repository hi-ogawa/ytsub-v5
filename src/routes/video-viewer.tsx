import { Link, useParams } from "react-router";
import { type CaptionEntry, CaptionPanel } from "../components/caption-panel";
import { VideoEmbed } from "../components/video-embed";

const MOCK_YOUTUBE_ID = "dQw4w9WgXcQ";
const MOCK_ACTIVE_INDEX = 2;

const MOCK_CAPTIONS: CaptionEntry[] = [
  { idx: 0, begin: 1.0, end: 2.5, text1: "안녕하세요", text2: "Hello" },
  { idx: 1, begin: 3.0, end: 4.5, text1: "감사합니다", text2: "Thank you" },
  {
    idx: 2,
    begin: 5.0,
    end: 7.0,
    text1: "네, 맞아요",
    text2: "Yes, that's right",
  },
  {
    idx: 3,
    begin: 8.0,
    end: 10.0,
    text1: "잠깐만요",
    text2: "Wait a moment",
  },
  {
    idx: 4,
    begin: 11.0,
    end: 13.5,
    text1: "다시 한번 말씀해 주세요",
    text2: "Please say that again",
  },
  {
    idx: 5,
    begin: 14.0,
    end: 16.0,
    text1: "좋은 아침이에요",
    text2: "Good morning",
  },
  {
    idx: 6,
    begin: 17.0,
    end: 19.0,
    text1: "오늘 날씨가 좋네요",
    text2: "The weather is nice today",
  },
  {
    idx: 7,
    begin: 20.0,
    end: 22.5,
    text1: "어디에서 왔어요?",
    text2: "Where are you from?",
  },
  {
    idx: 8,
    begin: 23.0,
    end: 25.0,
    text1: "한국어를 공부하고 있어요",
    text2: "I'm studying Korean",
  },
  {
    idx: 9,
    begin: 26.0,
    end: 28.0,
    text1: "정말요? 대단하네요",
    text2: "Really? That's impressive",
  },
  {
    idx: 10,
    begin: 29.0,
    end: 31.5,
    text1: "아직 잘 못해요",
    text2: "I'm not good yet",
  },
  {
    idx: 11,
    begin: 32.0,
    end: 34.0,
    text1: "괜찮아요, 연습하면 돼요",
    text2: "It's okay, just keep practicing",
  },
];

export function VideoViewerPage() {
  const { id } = useParams<"id">();

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-4 border-b border-gray-200 px-4 py-2">
        <Link
          to="/"
          className="text-sm text-blue-500 hover:underline whitespace-nowrap"
        >
          ← Back
        </Link>
        <h1 className="truncate text-lg font-semibold">Video {id}</h1>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:gap-2 lg:p-2">
        <div className="flex-none lg:flex-1">
          <VideoEmbed youtubeId={MOCK_YOUTUBE_ID} />
        </div>
        <div className="min-h-0 flex-[1_0_0] lg:w-1/3 lg:flex-none">
          <CaptionPanel
            entries={MOCK_CAPTIONS}
            activeIndex={MOCK_ACTIVE_INDEX}
          />
        </div>
      </div>
    </div>
  );
}
