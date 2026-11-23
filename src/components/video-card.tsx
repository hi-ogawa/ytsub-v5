import type { ReactNode } from "react";
import { Link } from "react-router";
import type { VideoListLayout } from "../lib/video-list-preferences.ts";

export function VideoCard({
  layout,
  youtubeId,
  href,
  title,
  titleRight,
  channelName,
  bookmarkCount,
  editTime,
  syncBadge,
}: {
  layout: VideoListLayout;
  youtubeId: string;
  href: string;
  title: string;
  titleRight?: ReactNode;
  channelName: string;
  bookmarkCount: ReactNode;
  editTime: ReactNode;
  syncBadge?: ReactNode;
}) {
  const thumbnailSrc = `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
  const channel = channelName || "Unknown channel";

  if (layout === "list") {
    return (
      <Link
        to={href}
        data-testid={`video-card-${youtubeId}`}
        className="flex gap-3 py-2.5 hover:bg-muted/60"
      >
        <img
          src={thumbnailSrc}
          alt=""
          loading="lazy"
          className="aspect-video w-28 shrink-0 rounded object-cover sm:w-40"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-1">
            <h2
              data-testid="video-card-title"
              className="line-clamp-2 flex-1 text-sm font-medium leading-5 sm:text-base sm:leading-6"
            >
              {title}
            </h2>
            {titleRight}
          </div>
          <div className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <p data-testid="video-card-channel" className="min-w-0 truncate">
              {channel}
            </p>
            <span aria-hidden className="shrink-0">
              ·
            </span>
            <span className="shrink-0">{bookmarkCount}</span>
            {/* On a phone, the time would leave the channel only a few characters */}
            <span aria-hidden className="hidden shrink-0 sm:inline">
              ·
            </span>
            <span className="hidden shrink-0 sm:inline">{editTime}</span>
            {syncBadge && (
              <span className="-my-1.5 -mr-1.5 ml-auto shrink-0">
                {syncBadge}
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={href}
      data-testid={`video-card-${youtubeId}`}
      className="block overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all hover:border-ring hover:shadow-md"
    >
      <img
        src={thumbnailSrc}
        alt=""
        loading="lazy"
        className="aspect-video w-full object-cover"
      />
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
          {channel}
        </p>
        <div
          data-testid="video-card-badge"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          {bookmarkCount}
          <span aria-hidden>·</span>
          {editTime}
          {syncBadge && <span className="ml-auto">{syncBadge}</span>}
        </div>
      </div>
    </Link>
  );
}
