import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { usePortalContainer } from "./portal-container.tsx";

function DropdownMenu({
  modal,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const container = usePortalContainer();
  // In extension (shadow DOM), modal must be false to avoid setting
  // pointer-events:none and overflow:hidden on document.body.
  return (
    <DropdownMenuPrimitive.Root
      modal={modal ?? (container ? false : undefined)}
      {...props}
    />
  );
}
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  const container = usePortalContainer();
  return (
    <DropdownMenuPrimitive.Portal container={container}>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={
          "z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md" +
          (className ? ` ${className}` : "")
        }
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={
        "flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50" +
        (className ? ` ${className}` : "")
      }
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
};
