// The watch page reaches extension-origin storage through a hidden extension
// frame. docs/extension-runtime.md explains the bridge.

import type {
  CaptionStorage,
  StorageListener,
  StorageNotice,
} from "../../lib/caption-storage.ts";

export const STORAGE_FRAME_ID = "zamak-storage-frame";
export const STORAGE_FRAME_PATH = "storage-frame.html";
export const YOUTUBE_ORIGIN = "https://www.youtube.com";

const RELOAD_MESSAGE = "Zamak lost its connection to storage. Reload the page.";

const REQUEST_TIMEOUT_MS = 30_000;

export type BridgeMethod =
  | "getSession"
  | "saveSession"
  | "setSyncedAt"
  | "getIndexEntry"
  | "listIndex";

export type BridgeMessage =
  | { type: "zamak-storage:hello" }
  | { type: "zamak-storage:ready" }
  | {
      type: "zamak-storage:request";
      id: string;
      method: BridgeMethod;
      params: unknown[];
    }
  | {
      type: "zamak-storage:response";
      id: string;
      result?: unknown;
      error?: string;
    }
  | { type: "zamak-storage:notice"; notice: StorageNotice };

type Connection = { frame: Window; origin: string };

export function createBridgeStorage(): CaptionStorage {
  const listeners = new Set<StorageListener>();
  let connection: Promise<Connection> | undefined;

  function connect() {
    connection ??= waitForFrame().then((conn) => {
      window.addEventListener("message", (e) => {
        if (e.source !== conn.frame || e.origin !== conn.origin) {
          return;
        }
        const message = e.data as BridgeMessage;
        if (message?.type !== "zamak-storage:notice") {
          return;
        }
        for (const l of listeners) {
          l(message.notice);
        }
      });
      return conn;
    });
    return connection;
  }

  async function call(method: BridgeMethod, ...params: unknown[]) {
    const { frame, origin } = await connect();
    const id = crypto.randomUUID();
    return new Promise<any>((resolve, reject) => {
      const ac = new AbortController();
      const timer = setTimeout(() => {
        ac.abort();
        reject(new Error(RELOAD_MESSAGE));
      }, REQUEST_TIMEOUT_MS);
      window.addEventListener(
        "message",
        (e) => {
          if (e.source !== frame || e.origin !== origin) {
            return;
          }
          const message = e.data as BridgeMessage;
          if (message?.type !== "zamak-storage:response") {
            return;
          }
          if (message.id !== id) {
            return;
          }
          clearTimeout(timer);
          ac.abort();
          if (message.error) {
            reject(new Error(message.error));
          } else {
            resolve(message.result);
          }
        },
        { signal: ac.signal },
      );
      frame.postMessage(
        {
          type: "zamak-storage:request",
          id,
          method,
          params,
        } satisfies BridgeMessage,
        origin,
      );
    });
  }

  return {
    getSession: (youtubeId) => call("getSession", youtubeId),
    saveSession: (session, options) => call("saveSession", session, options),
    async deleteVideo() {
      throw new Error("Deleting is not available on the watch page");
    },
    setSyncedAt: (youtubeId, serverUpdatedAt) =>
      call("setSyncedAt", youtubeId, serverUpdatedAt),
    getIndexEntry: (youtubeId) => call("getIndexEntry", youtubeId),
    listIndex: () => call("listIndex"),
    subscribe(listener) {
      connect().catch(() => {});
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// The relay mounts the frame, and either side may load first. The frame
// announces itself when it starts, and answers a hello sent after that.
function waitForFrame(): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const ac = new AbortController();
    const timer = setTimeout(() => {
      ac.abort();
      reject(new Error(RELOAD_MESSAGE));
    }, REQUEST_TIMEOUT_MS);
    window.addEventListener(
      "message",
      (e) => {
        const message = e.data as BridgeMessage;
        if (message?.type !== "zamak-storage:ready") {
          return;
        }
        if (!e.origin.startsWith("chrome-extension://")) {
          return;
        }
        const frame = document.getElementById(STORAGE_FRAME_ID);
        if (
          !(frame instanceof HTMLIFrameElement) ||
          e.source !== frame.contentWindow
        ) {
          return;
        }
        clearTimeout(timer);
        ac.abort();
        resolve({ frame: frame.contentWindow!, origin: e.origin });
      },
      { signal: ac.signal },
    );
    const frame = document.getElementById(STORAGE_FRAME_ID);
    if (frame instanceof HTMLIFrameElement) {
      frame.contentWindow?.postMessage(
        { type: "zamak-storage:hello" } satisfies BridgeMessage,
        "*",
      );
    }
  });
}
