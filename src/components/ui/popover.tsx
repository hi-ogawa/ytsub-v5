// Reference: shadcn/ui popover.tsx
import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

const Popover = PopoverPrimitive.Root;
const PopoverAnchor = PopoverPrimitive.Anchor;

function PopoverContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={
          "z-50 w-48 rounded border border-border bg-popover p-2 shadow-lg" +
          (className ? ` ${className}` : "")
        }
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent };
