import { useCallback, useRef, useState } from "react";
import { z } from "zod";
import { createLocalStorageStore } from "../utils/local-storage-store.ts";

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 280;
const MAX_WIDTH = 800;

const preferencesSchema = z
  .object({
    width: z.number().min(MIN_WIDTH).max(MAX_WIDTH).catch(DEFAULT_WIDTH),
  })
  .catch({ width: DEFAULT_WIDTH });

const panelPreferences = createLocalStorageStore({
  key: "zamak:panel-width",
  parse: (stored) => preferencesSchema.parse(stored),
});

export function ResizablePanel({
  children,
  id,
  className,
  style,
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [width, setWidth] = useState(() => panelPreferences.get().width);
  const widthRef = useRef(width);
  widthRef.current = width;

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = widthRef.current;

    // A cross-origin iframe (the YouTube player) can take the pointer events
    // when the drag passes over it, even with pointer capture.
    const iframes = [...document.querySelectorAll("iframe")];
    for (const iframe of iframes) {
      iframe.style.pointerEvents = "none";
    }

    const onPointerMove = (event: PointerEvent) => {
      // Dragging left = wider (panel is right-aligned)
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(MAX_WIDTH, startWidth + (startX - event.clientX)),
      );
      setWidth(newWidth);
    };

    const onPointerUp = () => {
      target.releasePointerCapture(event.pointerId);
      for (const iframe of iframes) {
        iframe.style.pointerEvents = "";
      }
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      panelPreferences.update({ width: widthRef.current });
    };

    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
  }, []);

  return (
    <div
      id={id}
      className={className}
      style={{ ...style, width: `${width}px` }}
      data-testid="resizable-panel"
    >
      <div
        className="absolute top-0 bottom-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-ring/50"
        data-testid="resize-handle"
        onPointerDown={onPointerDown}
      />
      {children}
    </div>
  );
}
