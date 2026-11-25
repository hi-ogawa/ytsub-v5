import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { usePortalContainer } from "./portal-container.tsx";

const DropdownMenuOpenContext = createContext<
  [boolean, (open: boolean) => void] | undefined
>(undefined);

function DropdownMenu({
  modal,
  ...props
}: Omit<
  ComponentProps<typeof DropdownMenuPrimitive.Root>,
  "open" | "defaultOpen" | "onOpenChange"
>) {
  const container = usePortalContainer();
  const [open, setOpen] = useState(false);
  // In extension (shadow DOM), modal must be false to avoid setting
  // pointer-events:none and overflow:hidden on document.body.
  return (
    <DropdownMenuOpenContext.Provider value={[open, setOpen]}>
      <DropdownMenuPrimitive.Root
        modal={modal ?? (container ? false : undefined)}
        open={open}
        onOpenChange={setOpen}
        {...props}
      />
    </DropdownMenuOpenContext.Provider>
  );
}

// Radix toggles the menu on pointerdown, before the browser knows whether a
// touch is a tap or a scroll. A modal menu that opens then locks the page, so
// the scroll never happens. Touch and pen toggle on click instead, which the
// browser fires only for a tap. A mouse still toggles on press.
//
// A tap on the trigger of an open menu closes the menu on pointerdown, as a
// press outside its content, before the click arrives. So the click toggles
// from the state the menu had when the tap started, and only for a tap that
// started on the trigger. A modal menu blocks pointer events outside it, so
// that pointerdown never reaches the trigger.
function DropdownMenuTrigger({
  onPointerDown,
  onClick,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  const [open, setOpen] = useContext(DropdownMenuOpenContext)!;
  const tapRef = useRef<{ wasOpen: boolean }>(undefined);
  return (
    <DropdownMenuPrimitive.Trigger
      onPointerDown={(event) => {
        onPointerDown?.(event);
        tapRef.current = undefined;
        // Radix skips its toggle when the event is already default-prevented.
        if (event.pointerType !== "mouse") {
          tapRef.current = { wasOpen: open };
          event.preventDefault();
        }
      }}
      onClick={(event) => {
        onClick?.(event);
        if (tapRef.current) {
          setOpen(!tapRef.current.wasOpen);
          tapRef.current = undefined;
        }
      }}
      {...props}
    />
  );
}

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
