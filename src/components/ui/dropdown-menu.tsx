import { Check } from "lucide-react";
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

// Radix toggles the menu on pointerdown for every pointer type, so a touch
// scroll that starts on the trigger opens it. Like Radix's Select.Trigger, open
// on pointerdown only for a mouse, and on click for touch and pen, since the
// browser doesn't fire a click once the finger moves to scroll.
function DropdownMenuTrigger({
  onPointerDown,
  onClick,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  const [open, setOpen] = useContext(DropdownMenuOpenContext)!;
  const pointerTypeRef = useRef("touch");
  return (
    <DropdownMenuPrimitive.Trigger
      onPointerDown={(event) => {
        onPointerDown?.(event);
        pointerTypeRef.current = event.pointerType;
        // Radix skips its toggle when the event is already default-prevented.
        if (event.pointerType !== "mouse") {
          event.preventDefault();
        }
      }}
      onClick={(event) => {
        onClick?.(event);
        if (pointerTypeRef.current !== "mouse") {
          setOpen(!open);
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

const ITEM_CLASS_NAME =
  "flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50";

function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={ITEM_CLASS_NAME + (className ? ` ${className}` : "")}
      {...props}
    />
  );
}

function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={
        "px-2 py-1.5 text-xs text-muted-foreground" +
        (className ? ` ${className}` : "")
      }
      {...props}
    />
  );
}

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={ITEM_CLASS_NAME + (className ? ` ${className}` : "")}
      {...props}
    >
      <span className="mr-2 size-4">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
};
