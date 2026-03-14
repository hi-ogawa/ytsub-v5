import { useMutation } from "@tanstack/react-query";
import { Database, EllipsisVertical, Upload } from "lucide-react";
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
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-10 flex-none items-center justify-between border-b px-3">
        <Link to="/dev" className="text-sm font-semibold">
          Zamak <span className="text-muted-foreground">(dev)</span>
        </Link>
        <HeaderMenu authenticated={false} />
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
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
