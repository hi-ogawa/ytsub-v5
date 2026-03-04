import { useParams } from "react-router";

export function VideoViewerPage() {
  const { id } = useParams<"id">();

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-gray-500">Video {id} — viewer coming soon.</p>
    </div>
  );
}
