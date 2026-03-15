import type { UseMutationResult } from "@tanstack/react-query";
import type { SubmitEvent } from "react";

export function LoginForm({
  mutation,
  submitLabel,
  errorMessage,
  footer,
}: {
  mutation: UseMutationResult<
    unknown,
    Error,
    { username: string; password: string }
  >;
  submitLabel: string;
  errorMessage?: string;
  footer?: React.ReactNode;
}) {
  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    mutation.mutate({
      username: form.get("username") as string,
      password: form.get("password") as string,
    });
  }

  return (
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
        {mutation.isPending ? "..." : submitLabel}
      </button>
      {mutation.isError && (
        <p data-testid="login-error" className="text-xs text-destructive">
          {errorMessage ?? mutation.error.message ?? "Something went wrong"}
        </p>
      )}
      {footer}
    </form>
  );
}
