import { BrowserRouter, Route, Routes } from "react-router-dom";
import { VideoList } from "./pages/video-list.tsx";
import { VideoViewer } from "./pages/video-viewer.tsx";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<VideoList />} />
        <Route path="/videos/:id" element={<VideoViewer />} />
      </Routes>
    </BrowserRouter>
  );
}
