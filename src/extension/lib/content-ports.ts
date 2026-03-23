// Track tabs with active, current-version content scripts via long-lived ports.
// Relay connects on load; port auto-disconnects on tab close, navigation, or extension update.

const PORT_NAME = "zamak:content";

/** Background: track content script ports and find tabs with active scripts. */
export function createContentPortTracker() {
  const tabIds = new Set<number>();

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) return;
    const tabId = port.sender?.tab?.id;
    if (tabId === undefined) return;
    tabIds.add(tabId);
    port.onDisconnect.addListener(() => {
      tabIds.delete(tabId);
    });
  });

  return {
    findTab(): number {
      for (const tabId of tabIds) {
        return tabId;
      }
      throw new Error("No YouTube tab open");
    },
    findTabOrUndefined(): number | undefined {
      for (const tabId of tabIds) {
        return tabId;
      }
      return undefined;
    },
  };
}

/** Relay (ISOLATED world): register with background. */
export function connectContentPort() {
  chrome.runtime.connect({ name: PORT_NAME });
}
