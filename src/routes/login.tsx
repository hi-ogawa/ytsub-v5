import { useMutation } from "@tanstack/react-query";
import type { SubmitEvent } from "react";
import { Link, useNavigate } from "react-router";
import { orpc } from "../rpc.ts";

export function LoginPage() {
  const navigate = useNavigate();
  const mutation = useMutation(
    orpc.auth.login.mutationOptions({
      onSuccess: () => navigate("/", { replace: true }),
    }),
  );

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
      <h1 className="text-xl font-bold">Zamak — login</h1>
      <input
        name="username"
        type="text"
        placeholder="Username"
        autoFocus
        required
        className="w-full rounded border px-3 py-2"
      />
      <input
        name="password"
        type="password"
        placeholder="Password"
        required
        className="w-full rounded border px-3 py-2"
      />
      <button
        type="submit"
        disabled={mutation.isPending}
        className="w-full rounded bg-primary px-3 py-2 text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {mutation.isPending ? "..." : "Login"}
      </button>
      {mutation.isError && (
        <p className="text-sm text-destructive">Invalid username or password</p>
      )}
      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link to="/register" className="text-primary underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const mutation = useMutation(
    orpc.auth.register.mutationOptions({
      onSuccess: () => navigate("/", { replace: true }),
    }),
  );

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
      <h1 className="text-xl font-bold">Zamak — sign up</h1>
      <input
        name="username"
        type="text"
        placeholder="Username"
        autoFocus
        required
        minLength={3}
        className="w-full rounded border px-3 py-2"
      />
      <input
        name="password"
        type="password"
        placeholder="Password"
        required
        minLength={8}
        className="w-full rounded border px-3 py-2"
      />
      <button
        type="submit"
        disabled={mutation.isPending}
        className="w-full rounded bg-primary px-3 py-2 text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {mutation.isPending ? "..." : "Sign up"}
      </button>
      {mutation.isError && (
        <p className="text-sm text-destructive">
          Registration failed — username may already be taken
        </p>
      )}
      <p className="text-center text-sm text-muted-foreground">
        Have an account?{" "}
        <Link to="/login" className="text-primary underline">
          Login
        </Link>
      </p>
    </form>
  );
}
