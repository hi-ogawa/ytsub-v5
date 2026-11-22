import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { createAppQueryClient } from "../lib/query-client.ts";
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

const router = createBrowserRouter([
  {
    id: "root",
    Component: RootLayout,
    loader: authLoader,
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
          { path: "/", Component: VideoListPage },
          { path: "/videos/:youtubeId", Component: VideoViewerPage },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
