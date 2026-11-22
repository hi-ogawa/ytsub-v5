import { Repeat } from "lucide-react";

/** Toggles a caption row's repeat. Its click stays off the row or card it sits on. */
export function RepeatToggle({
  isRepeating,
  onToggle,
  className,
}: {
  isRepeating: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      className={[
        "rounded border p-0.5",
        isRepeating
          ? "border-accent/60 bg-accent/15 text-accent"
          : "border-transparent hover:text-foreground",
        className,
      ].join(" ")}
      title="Repeat"
      aria-pressed={isRepeating}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <Repeat className="size-3.5" />
    </button>
  );
}
