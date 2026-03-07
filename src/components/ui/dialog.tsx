// Reference: shadcn/ui dialog.tsx
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

const Dialog = DialogPrimitive.Root;
const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={
        "fixed inset-0 z-50 bg-overlay" + (className ? ` ${className}` : "")
      }
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={
          "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-card p-6 shadow-lg" +
          (className ? ` ${className}` : "")
        }
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={
        "mb-4 text-lg font-semibold" + (className ? ` ${className}` : "")
      }
      {...props}
    />
  );
}

export { Dialog, DialogClose, DialogContent, DialogTitle };
