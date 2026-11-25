import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Toaster } from "sonner";
import type { CaptionStorage } from "../lib/caption-storage.ts";
import { createAppQueryClient } from "../lib/query-client.ts";
import { LaunchDiagnostics, recordLaunch } from "./launch-diagnostics.tsx";
import { LoginPage, RegisterPage } from "./routes/login.tsx";
import {
  AuthLayout,
  authLoader,
  GuestLayout,
  RootLayout,
} from "./routes/root.tsx";
import { VideoListPage } from "./routes/video-list.tsx";
import { VideoViewerPage } from "./routes/video-viewer.tsx";

const queryClient = createAppQueryClient();

export function App({ storage }: { storage: CaptionStorage }) {
  const [router] = useState(() => createAppRouter(storage));
  useLaunchQueue(router);
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors />
      <LaunchDiagnostics />
    </QueryClientProvider>
  );
}

// The manifest's `launch_handler` focuses the open installed app for a link
// it captures, and the link arrives here instead of loading a new page.
function useLaunchQueue(router: ReturnType<typeof createAppRouter>) {
  useEffect(() => {
    window.launchQueue?.setConsumer(({ targetURL }) => {
      recordLaunch(targetURL);
      if (!targetURL) {
        return;
      }
      const url = new URL(targetURL);
      const path = url.pathname + url.search + url.hash;
      if (path !== location.pathname + location.search + location.hash) {
        router.navigate(path);
      }
    });
  }, [router]);
}

declare global {
  interface Window {
    launchQueue?: {
      setConsumer(consumer: (params: { targetURL?: string }) => void): void;
    };
  }
}

function createAppRouter(storage: CaptionStorage) {
  return createBrowserRouter([
    {
      path: "/_preview",
      lazy: () => import("./preview/preview-page.tsx"),
      HydrateFallback: () => null,
    },
    {
      id: "root",
      element: <RootLayout storage={storage} />,
      loader: authLoader,
      // Login and logout reload the page, so a route change, such as a `?t`
      // link handed to the open app, never needs the auth check again.
      shouldRevalidate: () => false,
      HydrateFallback: () => null,
      children: [
        {
          Component: GuestLayout,
          children: [
            { path: "/login", Component: LoginPage },
            { path: "/register", Component: RegisterPage },
          ],
        },
        {
          Component: AuthLayout,
          children: [
            { path: "/", element: <VideoListPage storage={storage} /> },
            {
              path: "/videos/:youtubeId",
              element: <VideoViewerPage storage={storage} />,
            },
          ],
        },
      ],
    },
  ]);
}
