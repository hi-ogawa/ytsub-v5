import { Tooltip as TooltipPrimitive } from "radix-ui";
import { usePortalContainer } from "./portal-container.tsx";

/**
 * A label shown on hover or focus after a short delay. For an icon whose
 * label lives only here, where the browser's `title` tooltip would wait
 * about a second and never show on touch.
 */
export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
}) {
  const container = usePortalContainer();
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal container={container}>
          <TooltipPrimitive.Content
            sideOffset={4}
            className="z-50 rounded bg-foreground px-2 py-1 text-xs text-background shadow-lg"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
