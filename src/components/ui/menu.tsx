import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";

interface MenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("Menu components must be used within <Menu>");
  return ctx;
}

function Menu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <MenuContext.Provider value={{ open, setOpen, triggerRef }}>
      <div data-slot="menu" className="relative">
        {children}
      </div>
    </MenuContext.Provider>
  );
}

function MenuTrigger({ className, ...props }: ComponentProps<"button">) {
  const { open, setOpen, triggerRef } = useMenu();

  return (
    <button
      ref={triggerRef}
      data-slot="menu-trigger"
      type="button"
      aria-expanded={open}
      aria-haspopup="menu"
      className={className}
      onClick={() => setOpen(!open)}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
      }}
      {...props}
    />
  );
}

function MenuContent({ className, ...props }: ComponentProps<"div">) {
  const { open, setOpen, triggerRef } = useMenu();
  const contentRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, [setOpen, triggerRef]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        !contentRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        close();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, close, triggerRef]);

  // Focus first item on open
  useEffect(() => {
    if (!open) return;
    const first = contentRef.current?.querySelector<HTMLElement>(
      '[data-slot="menu-item"]',
    );
    first?.focus();
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (e: KeyboardEvent) => {
    const items = Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>(
        '[data-slot="menu-item"]',
      ) ?? [],
    );
    const current = document.activeElement as HTMLElement;
    const index = items.indexOf(current);

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const next = items[(index + 1) % items.length];
        next?.focus();
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = items[(index - 1 + items.length) % items.length];
        prev?.focus();
        break;
      }
      case "Home": {
        e.preventDefault();
        items[0]?.focus();
        break;
      }
      case "End": {
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
      }
      case "Escape": {
        e.preventDefault();
        close();
        break;
      }
      case "Tab": {
        close();
        break;
      }
    }
  };

  return (
    <div
      ref={contentRef}
      data-slot="menu-content"
      role="menu"
      onKeyDown={handleKeyDown}
      className={
        "absolute right-0 top-full z-50 mt-1 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md" +
        (className ? ` ${className}` : "")
      }
      {...props}
    />
  );
}

function MenuItem({
  className,
  variant = "default",
  ...props
}: ComponentProps<"button"> & {
  variant?: "default" | "destructive";
}) {
  const { setOpen, triggerRef } = useMenu();

  return (
    <button
      data-slot="menu-item"
      data-variant={variant}
      role="menuitem"
      type="button"
      tabIndex={-1}
      className={
        "flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive-subtle" +
        (className ? ` ${className}` : "")
      }
      onClick={(e) => {
        props.onClick?.(e);
        if (!e.defaultPrevented) {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.currentTarget.click();
        }
      }}
      {...props}
    />
  );
}

export { Menu, MenuTrigger, MenuContent, MenuItem };
