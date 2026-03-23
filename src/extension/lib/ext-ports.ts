// Track extension page ports via long-lived connections.
// Mirrors content-ports.ts but stores Port objects (not tab IDs)
// so BG can send messages directly to extension pages.

const PORT_NAME = "zamak:ext";

/** Background: track extension page ports. */
export function createExtPortTracker() {
  const ports = new Set<chrome.runtime.Port>();

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) return;
    ports.add(port);
    port.onDisconnect.addListener(() => {
      ports.delete(port);
    });
  });

  return {
    /** Send a message to all connected extension pages. */
    broadcast(message: unknown) {
      for (const port of ports) {
        port.postMessage(message);
      }
    },
  };
}

/** Extension page: register with background. Returns the port for receiving messages. */
export function connectExtPort() {
  return chrome.runtime.connect({ name: PORT_NAME });
}
