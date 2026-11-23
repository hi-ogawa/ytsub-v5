import { Popover as PopoverPrimitive } from "radix-ui";
import {
  createContext,
  useContext,
  useRef,
  type ComponentProps,
  type RefObject,
} from "react";
import { usePortalContainer } from "./portal-container.tsx";

const PopoverTriggerRefContext = createContext<
  RefObject<HTMLButtonElement | null> | undefined
>(undefined);

function Popover({
  modal,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Root>) {
  const container = usePortalContainer();
  const triggerRef = useRef<HTMLButtonElement>(null);
  // In extension (shadow DOM), modal must be false to avoid setting
  // pointer-events:none and overflow:hidden on document.body.
  return (
    <PopoverTriggerRefContext.Provider value={triggerRef}>
      <PopoverPrimitive.Root modal={container ? false : modal} {...props} />
    </PopoverTriggerRefContext.Provider>
  );
}

function PopoverTrigger(
  props: Omit<ComponentProps<typeof PopoverPrimitive.Trigger>, "ref">,
) {
  const triggerRef = useContext(PopoverTriggerRefContext);
  return <PopoverPrimitive.Trigger ref={triggerRef} {...props} />;
}

const PopoverClose = PopoverPrimitive.Close;

function PopoverContent({
  className,
  align = "start",
  sideOffset = 4,
  onPointerDownOutside,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  const container = usePortalContainer();
  const triggerRef = useContext(PopoverTriggerRefContext);
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={
          "z-50 rounded border border-border bg-popover shadow-lg outline-hidden" +
          (className ? ` ${className}` : "")
        }
        onPointerDownOutside={(event) => {
          onPointerDownOutside?.(event);
          // When modal=false (extension shadow DOM), DismissableLayer closes
          // on pointerdown before the trigger's click can toggle. Prevent the
          // dismiss when pressing the trigger so the toggle handles it. Use
          // composedPath() because shadow DOM retargets event.target to the
          // host element.
          const target = event.detail.originalEvent.composedPath()[0] as Node;
          if (triggerRef?.current?.contains(target)) {
            event.preventDefault();
          }
        }}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverClose, PopoverContent, PopoverTrigger };
