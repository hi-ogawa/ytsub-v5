import type { ReactNode } from "react";

export function VideoCard({
  youtubeId,
  href,
  title,
  titleRight,
  channelName,
  badge,
  overlay,
  onClick,
}: {
  youtubeId: string;
  href: string;
  title: string;
  titleRight?: ReactNode;
  channelName: string;
  badge: ReactNode;
  overlay?: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <a
      href={href}
      data-testid={`video-card-${youtubeId}`}
      className="block overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all hover:border-ring hover:shadow-md"
      onClick={onClick}
    >
      <div className="relative">
        <img
          src={`https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          className="aspect-video w-full object-cover"
        />
        {overlay}
      </div>
      <div className="p-4">
        <div className="mb-1 flex items-start gap-1">
          <h2
            data-testid="video-card-title"
            className="line-clamp-2 flex-1 font-semibold leading-snug"
          >
            {title}
          </h2>
          {titleRight}
        </div>
        <p
          data-testid="video-card-channel"
          className="mb-3 truncate text-sm text-muted-foreground"
        >
          {channelName || "Unknown channel"}
        </p>
        <div
          data-testid="video-card-badge"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          {badge}
        </div>
      </div>
    </a>
  );
}
