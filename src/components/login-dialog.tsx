import type { SubmitEvent } from "react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog.tsx";

export function LoginDialog({
  open,
  onOpenChange,
  onLogin,
  signUpUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: (username: string, password: string) => Promise<void>;
  signUpUrl?: string;
}) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setPending(true);

    const form = new FormData(e.currentTarget);
    try {
      await onLogin(
        form.get("username") as string,
        form.get("password") as string,
      );
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid username or password",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
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
            disabled={pending}
            className="w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "..." : "Sign in"}
          </button>
          {error && <p className="text-xs text-destructive">{error}</p>}
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
