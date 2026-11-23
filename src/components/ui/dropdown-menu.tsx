import type { ComponentProps } from "react";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "./popover.tsx";

// Menus are popovers, so they open and close like every other popover. They
// don't have Radix Menu's arrow-key navigation or typeahead. Unlike a plain
// popover, a menu is modal, so a tap outside it only closes it rather than
// also clicking what is underneath.
function DropdownMenu({
  modal = true,
  ...props
}: ComponentProps<typeof Popover>) {
  return <Popover modal={modal} {...props} />;
}

function DropdownMenuTrigger(props: ComponentProps<typeof PopoverTrigger>) {
  return <PopoverTrigger aria-haspopup="menu" {...props} />;
}

function DropdownMenuContent({
  className,
  align = "center",
  ...props
}: ComponentProps<typeof PopoverContent>) {
  return (
    <PopoverContent
      role="menu"
      align={align}
      className={
        "min-w-[8rem] overflow-hidden p-1 text-popover-foreground" +
        (className ? ` ${className}` : "")
      }
      {...props}
    />
  );
}

// An item closes the menu on click unless its onClick calls preventDefault().
function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof PopoverClose>) {
  return (
    <PopoverClose
      role="menuitem"
      className={
        "flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50" +
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
