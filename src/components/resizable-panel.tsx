import { PANEL_WIDTH } from "../lib/caption-panel-preferences.ts";

export function ResizablePanel({
  children,
  width,
  onWidthChange,
  id,
  className,
  style,
}: {
  children: React.ReactNode;
  width: number;
  onWidthChange: (width: number) => void;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const onPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = width;

    // A cross-origin iframe (the YouTube player) can take the pointer events
    // when the drag passes over it, even with pointer capture.
    const iframes = [...document.querySelectorAll("iframe")];
    for (const iframe of iframes) {
      iframe.style.pointerEvents = "none";
    }

    const onPointerMove = (event: PointerEvent) => {
      // Dragging left = wider (panel is right-aligned)
      const newWidth = Math.max(
        PANEL_WIDTH.min,
        Math.min(PANEL_WIDTH.max, startWidth + (startX - event.clientX)),
      );
      onWidthChange(newWidth);
    };

    const onPointerUp = () => {
      target.releasePointerCapture(event.pointerId);
      for (const iframe of iframes) {
        iframe.style.pointerEvents = "";
      }
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
    };

    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
  };

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
