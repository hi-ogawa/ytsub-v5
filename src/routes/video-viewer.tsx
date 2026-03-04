import { Link, useParams } from "react-router";

export function VideoViewerPage() {
  const { id } = useParams<"id">();

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link
        to="/"
        className="mb-4 inline-block text-sm text-blue-500 hover:underline"
      >
        ← Back to videos
      </Link>
      <h1 className="text-2xl font-bold">Video {id}</h1>
      <p className="mt-2 text-sm text-gray-500">Viewer coming soon.</p>
    </div>
  );
}
