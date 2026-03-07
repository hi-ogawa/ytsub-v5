import { HoverCard as HoverCardPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

const HoverCard = HoverCardPrimitive.Root;
const HoverCardTrigger = HoverCardPrimitive.Trigger;

function HoverCardContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={
          "z-50 w-48 rounded border border-border bg-popover p-2 shadow-lg outline-hidden" +
          (className ? ` ${className}` : "")
        }
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
