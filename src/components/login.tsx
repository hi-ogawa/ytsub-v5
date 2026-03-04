import { type FormEvent, useState } from "react";

export function Login({ onSuccess }: { onSuccess?: () => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { password } }),
      });
      if (!res.ok) {
        setError("Invalid password");
        return;
      }
      onSuccess?.();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-32 max-w-xs space-y-4">
      <h1 className="text-xl font-bold">ytsub — login</h1>
      <input
        name="password"
        type="password"
        placeholder="Password"
        autoFocus
        required
        className="w-full rounded border px-3 py-2"
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {loading ? "..." : "Login"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
