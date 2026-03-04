import type { RefObject } from "react";

export function VideoEmbed({
  playerRef,
}: {
  playerRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="relative pt-[56.2%]">
      <div ref={playerRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
