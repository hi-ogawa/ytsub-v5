import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { usePortalContainer } from "./portal-container.tsx";

function Popover({
  modal = false,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root modal={modal} {...props} />;
}
const PopoverTrigger = PopoverPrimitive.Trigger;

function PopoverContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  const container = usePortalContainer();
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={
          "z-50 w-48 rounded border border-border bg-popover p-2 shadow-lg outline-hidden" +
          (className ? ` ${className}` : "")
        }
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
