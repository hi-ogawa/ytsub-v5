import { useMutation } from "@tanstack/react-query";
import { type SubmitEvent, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { orpc } from "../rpc.ts";

export function LoginPage() {
  const navigate = useNavigate();
  const usernameRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"login" | "register">("login");

  const login = useMutation(
    orpc.auth.login.mutationOptions({
      onSuccess: () => navigate("/", { replace: true }),
    }),
  );

  const register = useMutation(
    orpc.auth.register.mutationOptions({
      onSuccess: () => navigate("/", { replace: true }),
    }),
  );

  const mutation = mode === "login" ? login : register;

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    mutation.mutate({
      username: form.get("username") as string,
      password: form.get("password") as string,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-32 max-w-xs space-y-4">
      <h1 className="text-xl font-bold">
        Zamak — {mode === "login" ? "login" : "sign up"}
      </h1>
      <input
        ref={usernameRef}
        name="username"
        type="text"
        placeholder="Username"
        autoFocus
        required
        minLength={mode === "register" ? 3 : undefined}
        className="w-full rounded border px-3 py-2"
      />
      <input
        name="password"
        type="password"
        placeholder="Password"
        required
        minLength={mode === "register" ? 8 : undefined}
        className="w-full rounded border px-3 py-2"
      />
      <button
        type="submit"
        disabled={mutation.isPending}
        className="w-full rounded bg-primary px-3 py-2 text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {mutation.isPending ? "..." : mode === "login" ? "Login" : "Sign up"}
      </button>
      {mutation.isError && (
        <p className="text-sm text-destructive">
          {mode === "login"
            ? "Invalid username or password"
            : "Registration failed — username may already be taken"}
        </p>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            No account?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("register");
                login.reset();
              }}
              className="text-primary underline"
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("login");
                register.reset();
              }}
              className="text-primary underline"
            >
              Login
            </button>
          </>
        )}
      </p>
    </form>
  );
}
