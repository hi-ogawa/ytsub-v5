import { useMutation } from "@tanstack/react-query";
import { type SubmitEvent, useRef } from "react";
import { useNavigate } from "react-router";
import { orpc } from "../rpc.ts";

export function LoginPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const login = useMutation(
    orpc.auth.login.mutationOptions({
      onSuccess: () => navigate("/", { replace: true }),
      onError: () => inputRef.current?.focus(),
    }),
  );

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    login.mutate({ password: form.get("password") as string });
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-32 max-w-xs space-y-4">
      <h1 className="text-xl font-bold">Zamak — login</h1>
      <input
        ref={inputRef}
        name="password"
        type="password"
        placeholder="Password"
        autoFocus
        required
        className="w-full rounded border px-3 py-2"
      />
      <button
        type="submit"
        disabled={login.isPending}
        className="w-full rounded bg-primary px-3 py-2 text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {login.isPending ? "..." : "Login"}
      </button>
      {login.isError && (
        <p className="text-sm text-destructive">Invalid password</p>
      )}
    </form>
  );
}
