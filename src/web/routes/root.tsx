import { useMutation } from "@tanstack/react-query";
import { EllipsisVertical, Upload } from "lucide-react";
import { useState } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLoaderData,
  useRouteLoaderData,
} from "react-router";
import { ImportDialog } from "../../components/import-dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import type { CaptionStorage } from "../../lib/caption-storage.ts";
import { orpc } from "../../lib/rpc-client.ts";
import { useTheme } from "../../lib/theme.ts";

export async function authLoader() {
  const response = await fetch("/api/auth/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: {} }),
  });
  const data = (await response.json()) as { json: { authenticated: boolean } };
  return { authenticated: data.json.authenticated };
}

export function RootLayout({ storage }: { storage: CaptionStorage }) {
  const { authenticated } = useLoaderData<typeof authLoader>();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-8 flex-none items-center justify-between border-b px-3 lg:h-10">
        <Link to="/" className="text-sm font-semibold">
          Zamak
        </Link>
        <HeaderMenu storage={storage} authenticated={authenticated} />
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
  if (authenticated) {
    return <Navigate to="/" replace />;
  }
  return (
    <div className="h-full">
      <Outlet />
    </div>
  );
}

export function AuthLayout() {
  const { authenticated } = useRouteLoaderData("root") as Awaited<
    ReturnType<typeof authLoader>
  >;
  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

function HeaderMenu({
  storage,
  authenticated,
}: {
  storage: CaptionStorage;
  authenticated: boolean;
}) {
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
          <EllipsisVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-36">
          {authenticated && (
            <DropdownMenuItem
              onSelect={() => setShowImport(true)}
              className="gap-2"
            >
              <Upload className="size-4" />
              Import
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            data-testid="theme-toggle"
            data-theme={theme}
            onSelect={(event) => {
              event.preventDefault();
              cycle();
            }}
            className="gap-2"
          >
            <Icon className="size-4" />
            <span className="capitalize">{theme}</span>
          </DropdownMenuItem>
          {authenticated && (
            <DropdownMenuItem onSelect={() => logoutMutation.mutate({})}>
              Log out
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {authenticated && (
        <ImportDialog
          storage={storage}
          open={showImport}
          onOpenChange={setShowImport}
        />
      )}
    </>
  );
}
