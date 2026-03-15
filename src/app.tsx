import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Toaster, toast } from "sonner";
import { DevFixturesPage } from "./routes/dev-fixtures.tsx";
import { DevViewerPage } from "./routes/dev-viewer.tsx";
import { LoginPage, RegisterPage } from "./routes/login.tsx";
import {
  AuthLayout,
  authLoader,
  DevLayout,
  GuestLayout,
  RootLayout,
} from "./routes/root.tsx";
import { VideoListPage } from "./routes/video-list.tsx";
import { VideoViewerPage } from "./routes/video-viewer.tsx";

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.toastOnError === false) return;
      toast.error(error.message || "Something went wrong");
    },
  }),
});

const router = createBrowserRouter([
  {
    path: "/dev",
    Component: DevLayout,
    children: [
      { index: true, Component: VideoListPage },
      { path: "fixtures", Component: DevFixturesPage },
      { path: "videos/:videoId", Component: DevViewerPage },
    ],
  },
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
