// Popup page script — reads video index from chrome.storage.local and renders list.

const root = document.getElementById("root");

function render(entries) {
  if (!entries || entries.length === 0) {
    root.innerHTML =
      '<div class="empty">No bookmarked videos yet.<br>Open a YouTube video and create bookmarks to see them here.</div>';
    return;
  }

  // Sort by most recently updated
  const sorted = [...entries].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const list = document.createElement("div");
  list.className = "list";

  for (const entry of sorted) {
    const card = document.createElement("a");
    card.className = "card";
    card.href = `https://www.youtube.com/watch?v=${entry.youtubeId}`;
    card.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: card.href });
    });

    card.innerHTML = `
      <img class="thumb" src="https://img.youtube.com/vi/${entry.youtubeId}/mqdefault.jpg" alt="" />
      <div class="info">
        <div class="title">${escapeHtml(entry.title)}</div>
        <div class="channel">${escapeHtml(entry.channelName || "Unknown channel")}</div>
        <div class="meta">
          <span class="badge">${entry.bookmarkCount} bookmark${entry.bookmarkCount === 1 ? "" : "s"}</span>
        </div>
      </div>
    `;

    list.appendChild(card);
  }

  root.innerHTML = "";
  root.appendChild(list);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

chrome.storage.local.get("video-index", (result) => {
  render(result["video-index"]);
});
