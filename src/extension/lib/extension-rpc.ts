// Typed RPC mechanism for content script ↔ background worker communication.
//
// Data flow (content-initiated, always request → response):
//
//   MAIN world (content.tsx)
//     → dispatches CustomEvent "zamak:rpc" with {id, method, params}
//   ISOLATED world (relay.ts)
//     → listens for event, calls chrome.runtime.sendMessage
//   Background worker (background.ts)
//     → handles message, returns response
//   ISOLATED world (relay.ts)
//     → writes response to localStorage, dispatches "zamak:rpc-response"
//   MAIN world (content.tsx)
//     → reads response from localStorage, resolves promise
//
// To add a new RPC method:
//   1. Add its signature to RpcSchema
//   2. Add its handler to the handlers map in background.ts

import type { VideoIndexEntry } from "../../lib/video-index.ts";

// --- Schema: defines all RPC methods, their params, and return types ---

export type RpcSchema = {
  getSyncState: {
    params: { youtubeId: string };
    result: { authenticated: boolean; serverUpdatedAt?: string };
  };
  openBookmarks: {
    params?: undefined;
    result: void;
  };
  videoIndexUpdated: {
    params: { entries: VideoIndexEntry[] };
    result: void;
  };
};

export type RpcMethod = keyof RpcSchema;

// --- Background-side: handler map type ---

export type RpcHandlers = {
  [M in RpcMethod]: RpcSchema[M]["params"] extends undefined
    ? () => Promise<RpcSchema[M]["result"]>
    : (params: RpcSchema[M]["params"]) => Promise<RpcSchema[M]["result"]>;
};

// --- Wire format ---

export type RpcRequest = {
  type: "zamak-rpc";
  id: string;
  method: RpcMethod;
  params?: unknown;
};

export type RpcResponse = {
  id: string;
  result?: unknown;
  error?: string;
};

// --- Content-side: typed client (MAIN world) ---

const RPC_REQUEST_EVENT = "zamak:rpc";
const RPC_RESPONSE_EVENT = "zamak:rpc-response";
const RPC_RESPONSE_KEY = "zamak:rpc-response";

let rpcIdCounter = 0;

function call<M extends RpcMethod>(
  method: M,
  ...args: RpcSchema[M]["params"] extends undefined
    ? []
    : [params: RpcSchema[M]["params"]]
): Promise<RpcSchema[M]["result"]> {
  const id = `rpc-${++rpcIdCounter}-${Date.now()}`;
  return new Promise((resolve, reject) => {
    const onResponse = () => {
      try {
        const raw = localStorage.getItem(RPC_RESPONSE_KEY);
        if (!raw) return;
        const response: RpcResponse = JSON.parse(raw);
        if (response.id !== id) return;
        window.removeEventListener(RPC_RESPONSE_EVENT, onResponse);
        if (response.error) reject(new Error(response.error));
        else resolve(response.result as RpcSchema[M]["result"]);
      } catch {
        window.removeEventListener(RPC_RESPONSE_EVENT, onResponse);
        reject(new Error("Failed to parse RPC response"));
      }
    };
    window.addEventListener(RPC_RESPONSE_EVENT, onResponse);
    window.dispatchEvent(
      new CustomEvent(RPC_REQUEST_EVENT, {
        detail: { id, method, params: args[0] },
      }),
    );
  });
}

// Proxy client — call any method with full type inference:
//   rpc.getSyncState({ youtubeId: "..." })
//   rpc.openBookmarks()
export const rpc = new Proxy({} as never, {
  get(_target, method: string) {
    return (params?: unknown) => call(method as RpcMethod, params as never);
  },
}) as {
  [M in RpcMethod]: RpcSchema[M]["params"] extends undefined
    ? () => Promise<RpcSchema[M]["result"]>
    : (params: RpcSchema[M]["params"]) => Promise<RpcSchema[M]["result"]>;
};

// --- Relay-side: generic passthrough (ISOLATED world) ---

export function setupRpcRelay() {
  window.addEventListener(RPC_REQUEST_EVENT, async (e) => {
    const { id, method, params } = (e as CustomEvent).detail;
    try {
      const request: RpcRequest = { type: "zamak-rpc", id, method, params };
      const result = await chrome.runtime.sendMessage(request);
      const response: RpcResponse = { id, result };
      localStorage.setItem(RPC_RESPONSE_KEY, JSON.stringify(response));
      window.dispatchEvent(new Event(RPC_RESPONSE_EVENT));
    } catch (err) {
      const response: RpcResponse = {
        id,
        error: err instanceof Error ? err.message : "Unknown error",
      };
      localStorage.setItem(RPC_RESPONSE_KEY, JSON.stringify(response));
      window.dispatchEvent(new Event(RPC_RESPONSE_EVENT));
    }
  });
}

// --- Background-side: handler registration ---

export function registerRpcHandlers(handlers: RpcHandlers) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "zamak-rpc") return;
    const { method, params } = msg as RpcRequest;
    const handler = handlers[method];
    if (!handler) {
      sendResponse(undefined);
      return;
    }
    (handler as (p: unknown) => Promise<unknown>)(params).then(sendResponse);
    return true; // keep channel open for async response
  });
}
