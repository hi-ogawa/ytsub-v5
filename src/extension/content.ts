import {
  fetchPlayerApi,
  fetchTrackJson3,
  parseJson3,
  pickTracks,
} from "../lib/youtube";

// const APP_URL = "http://localhost:5173"; // TODO: wire up POST

async function importVideo() {
  const videoId = new URL(window.location.href).searchParams.get("v");
  if (!videoId) {
    alert("ytsub: No video ID found");
    return;
  }

  const button = document.getElementById("ytsub-import-btn");
  if (button) {
    button.textContent = "Importing...";
    button.setAttribute("disabled", "");
  }

  try {
    const result = await fetchPlayerApi(videoId);
    const { track1, track2 } = pickTracks(result.captionTracks);

    if (!track1) {
      alert("ytsub: No Korean subtitle track found");
      return;
    }

    const [json3_1, json3_2] = await Promise.all([
      fetchTrackJson3(track1.baseUrl),
      track2 ? fetchTrackJson3(track2.baseUrl) : Promise.resolve(null),
    ]);

    const cues1 = parseJson3(json3_1);
    const cues2 = json3_2 ? parseJson3(json3_2) : [];

    // Simple 1:1 alignment by index (placeholder — Step 4 will improve)
    const captions = cues1.map((cue, idx) => ({
      idx,
      begin: cue.begin,
      end: cue.end,
      text1: cue.text,
      text2: idx < cues2.length ? cues2[idx].text : "",
    }));

    const payload = {
      video: {
        youtubeId: result.video.youtubeId,
        title: result.video.title,
        channelName: result.video.channelName,
        channelId: result.video.channelId,
        duration: result.video.duration,
        language1: "ko",
        language2: "en",
      },
      captions,
      bookmarks: [],
    };

    // Download as JSON file for testing
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ytsub-import-${videoId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    console.error("[ytsub] Import failed:", err);
    alert(`ytsub: Import failed — ${err}`);
  } finally {
    if (button) {
      button.textContent = "Import to ytsub";
      button.removeAttribute("disabled");
    }
  }
}

function injectButton() {
  if (document.getElementById("ytsub-import-btn")) return;

  const button = document.createElement("button");
  button.id = "ytsub-import-btn";
  button.textContent = "Import to ytsub";
  Object.assign(button.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "9999",
    padding: "8px 16px",
    backgroundColor: "#065f46",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
  });
  button.addEventListener("click", importVideo);
  document.body.appendChild(button);
}

function removeButton() {
  document.getElementById("ytsub-import-btn")?.remove();
}

function isWatchPage() {
  return window.location.pathname === "/watch";
}

// YouTube is an SPA — detect navigation via yt-navigate-finish events
function init() {
  if (isWatchPage()) injectButton();

  document.addEventListener("yt-navigate-finish", () => {
    if (isWatchPage()) {
      injectButton();
    } else {
      removeButton();
    }
  });
}

init();
