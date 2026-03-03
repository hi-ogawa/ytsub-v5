import { FAKE_VIDEOS, formatDuration } from "../data/fake.ts";

interface Props {
  onSelectVideo: (id: number) => void;
}

export function VideoList({ onSelectVideo }: Props) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-700">
        Videos ({FAKE_VIDEOS.length})
      </h2>
      <ul className="space-y-2">
        {FAKE_VIDEOS.map((video) => (
          <li key={video.id}>
            <button
              onClick={() => onSelectVideo(video.id)}
              className="flex w-full items-start gap-4 rounded-lg border border-gray-200 bg-white p-4 text-left transition hover:border-gray-300 hover:bg-gray-50"
            >
              <img
                src={`https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`}
                alt={video.title}
                className="h-20 w-36 shrink-0 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 leading-snug">
                  {video.title}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {video.channelName}
                </p>
                <p className="mt-2 text-xs text-gray-400">
                  {video.language1.toUpperCase()} /{" "}
                  {video.language2.toUpperCase()}
                  {"  ·  "}
                  {formatDuration(video.duration)}
                  {"  ·  "}
                  {video.createdAt}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
