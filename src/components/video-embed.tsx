export function VideoEmbed({ youtubeId }: { youtubeId: string }) {
  return (
    <div className="relative pt-[56.2%]">
      <iframe
        className="absolute inset-0 h-full w-full"
        src={`https://www.youtube.com/embed/${youtubeId}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
