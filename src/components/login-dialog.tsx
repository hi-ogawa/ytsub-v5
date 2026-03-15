import { useMutation } from "@tanstack/react-query";
import type { SubmitEvent } from "react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog.tsx";

export function LoginDialog({
  open,
  onOpenChange,
  onLogin,
  signUpUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: (input: { username: string; password: string }) => Promise<void>;
  signUpUrl?: string;
}) {
  const mutation = useMutation({
    mutationFn: onLogin,
    onSuccess: () => onOpenChange(false),
  });

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    mutation.mutate({
      username: form.get("username") as string,
      password: form.get("password") as string,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="login-dialog" aria-describedby={undefined}>
        <DialogTitle>Sign in</DialogTitle>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            name="username"
            type="text"
            placeholder="Username"
            autoFocus
            required
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            data-testid="login-submit"
            disabled={mutation.isPending}
            className="w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {mutation.isPending ? "..." : "Sign in"}
          </button>
          {mutation.isError && (
            <p data-testid="login-error" className="text-xs text-destructive">
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Invalid username or password"}
            </p>
          )}
          {signUpUrl && (
            <p className="text-center text-xs text-muted-foreground">
              No account?{" "}
              <a
                href={signUpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Sign up
              </a>
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
