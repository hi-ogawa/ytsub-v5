import { useMutation, useQuery } from "@tanstack/react-query";
import { Database, EllipsisVertical, LogIn, Upload } from "lucide-react";
import type { SubmitEvent } from "react";
import { useState } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLoaderData,
  useRouteLoaderData,
} from "react-router";
import { ImportDialog } from "../components/import-dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { useTheme } from "../lib/theme.ts";
import { orpc } from "../rpc.ts";

export async function authLoader() {
  const res = await fetch("/api/auth/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: {} }),
  });
  const data = (await res.json()) as { json: { authenticated: boolean } };
  return { authenticated: data.json.authenticated };
}

export function RootLayout() {
  const { authenticated } = useLoaderData<typeof authLoader>();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-10 flex-none items-center justify-between border-b px-3">
        <Link to="/" className="text-sm font-semibold">
          Zamak
        </Link>
        <HeaderMenu authenticated={authenticated} />
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export function GuestLayout() {
  const { authenticated } = useRouteLoaderData("root") as Awaited<
    ReturnType<typeof authLoader>
  >;
  if (authenticated) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function AuthLayout() {
  const { authenticated } = useRouteLoaderData("root") as Awaited<
    ReturnType<typeof authLoader>
  >;
  if (!authenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function DevLayout() {
  const authQuery = useQuery(orpc.auth.check.queryOptions());
  const authenticated = authQuery.data?.authenticated === true;
  const [showLogin, setShowLogin] = useState(false);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-10 flex-none items-center justify-between border-b px-3">
        <Link to="/dev" className="text-sm font-semibold">
          Zamak <span className="text-muted-foreground">(dev)</span>
        </Link>
        <div className="flex items-center gap-1">
          {!authenticated && !showLogin && (
            <button
              type="button"
              onClick={() => setShowLogin(true)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              <LogIn className="h-3 w-3" />
              Sign in
            </button>
          )}
          <HeaderMenu authenticated={authenticated} />
        </div>
      </header>
      {showLogin && !authenticated && (
        <DevLoginBanner
          onSuccess={() => {
            setShowLogin(false);
            authQuery.refetch();
          }}
          onCancel={() => setShowLogin(false)}
        />
      )}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function DevLoginBanner({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const loginMutation = useMutation(
    orpc.auth.login.mutationOptions({ onSuccess }),
  );

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    loginMutation.mutate({
      username: form.get("username") as string,
      password: form.get("password") as string,
    });
  }

  return (
    <div className="border-b bg-muted/30 px-4 py-3">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-lg items-center gap-2"
      >
        <input
          name="username"
          type="text"
          placeholder="Username"
          autoFocus
          required
          className="h-8 w-32 rounded border px-2 text-sm"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="h-8 w-32 rounded border px-2 text-sm"
        />
        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="h-8 rounded bg-primary px-3 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {loginMutation.isPending ? "..." : "Sign in"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded px-2 text-sm text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
        {loginMutation.isError && (
          <span className="text-xs text-destructive">
            Invalid username or password
          </span>
        )}
      </form>
    </div>
  );
}

function HeaderMenu({ authenticated }: { authenticated: boolean }) {
  const { theme, cycle, Icon } = useTheme();
  const [showImport, setShowImport] = useState(false);

  const logoutMutation = useMutation(
    orpc.auth.logout.mutationOptions({
      onSuccess: () => {
        window.location.href = "/login";
      },
    }),
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-testid="header-menu"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        >
          <EllipsisVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-36">
          <DropdownMenuItem
            onSelect={() => setShowImport(true)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Import
          </DropdownMenuItem>
          {import.meta.env.DEV && (
            <DropdownMenuItem
              data-testid="bootstrap-fixtures"
              onSelect={async () => {
                const { bootstrapFixtures } =
                  await import("../lib/dev-fixtures.ts");
                await bootstrapFixtures();
              }}
              className="gap-2"
            >
              <Database className="h-4 w-4" />
              Dev Bootstrap
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            data-testid="theme-toggle"
            data-theme={theme}
            onSelect={(e) => {
              e.preventDefault();
              cycle();
            }}
            className="gap-2"
          >
            <Icon className="h-4 w-4" />
            <span className="capitalize">{theme}</span>
          </DropdownMenuItem>
          {authenticated && (
            <DropdownMenuItem onSelect={() => logoutMutation.mutate({})}>
              Log out
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ImportDialog open={showImport} onOpenChange={setShowImport} />
    </>
  );
}
