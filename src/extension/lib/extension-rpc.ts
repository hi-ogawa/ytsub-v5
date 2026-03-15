// Typed RPC mechanism for content script ↔ background worker communication.
//
// Forward RPC (content-initiated, request → response):
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
// Reverse (tab) RPC (background-initiated, request → response):
//
//   Background worker (background.ts)
//     → chrome.tabs.sendMessage(tabId, {type: "zamak-tab-rpc", ...})
//   ISOLATED world (relay.ts)
//     → chrome.runtime.onMessage listener, dispatches CustomEvent "zamak:tab-rpc"
//   MAIN world (content.tsx)
//     → handler executes, writes result to localStorage, dispatches response event
//   ISOLATED world (relay.ts)
//     → reads localStorage, calls sendResponse back to background

// --- Wire format ---

type RpcRequest = {
  type: "zamak-rpc";
  id: string;
  method: string;
  params?: unknown;
};

type RpcResponse = {
  id: string;
  result?: unknown;
  error?: string;
};

// --- Content-side: typed client factory (MAIN world) ---

const RPC_REQUEST_EVENT = "zamak:rpc";
const RPC_RESPONSE_EVENT = "zamak:rpc-response";
const RPC_RESPONSE_KEY = "zamak:rpc-response";

let rpcIdCounter = 0;

function call(method: string, params?: unknown): Promise<unknown> {
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
        else resolve(response.result);
      } catch {
        window.removeEventListener(RPC_RESPONSE_EVENT, onResponse);
        reject(new Error("Failed to parse RPC response"));
      }
    };
    window.addEventListener(RPC_RESPONSE_EVENT, onResponse);
    window.dispatchEvent(
      new CustomEvent(RPC_REQUEST_EVENT, {
        detail: { id, method, params },
      }),
    );
  });
}

// Type helpers for deriving client from handler map
type HandlerParams<H> = H extends () => Promise<unknown>
  ? undefined
  : H extends (params: infer P) => Promise<unknown>
    ? P
    : undefined;
type HandlerResult<H> = H extends (...args: never[]) => Promise<infer R>
  ? R
  : never;

type RpcClient<Handlers> = {
  [M in keyof Handlers]: HandlerParams<Handlers[M]> extends undefined
    ? () => Promise<HandlerResult<Handlers[M]>>
    : (
        params: HandlerParams<Handlers[M]>,
      ) => Promise<HandlerResult<Handlers[M]>>;
};

/** Send RPC directly via chrome.runtime.sendMessage (for ISOLATED world / relay / extension pages). */
async function directCall(method: string, params?: unknown): Promise<unknown> {
  const request: RpcRequest = {
    type: "zamak-rpc",
    id: "",
    method,
    params,
  };
  const response = await chrome.runtime.sendMessage(request);
  if (response?.__error) throw new Error(response.__error);
  return response;
}

/**
 * Create a typed RPC client proxy. Type parameter should be `typeof bgRpcHandlers`.
 * - Default (MAIN world): routes through localStorage event bridge via relay
 * - `direct: true` (ISOLATED world / relay): calls chrome.runtime.sendMessage directly
 */
export function createRpc<Handlers extends Record<string, Function>>(options?: {
  direct?: boolean;
}) {
  const fn = options?.direct ? directCall : call;
  return new Proxy({} as never, {
    get(_target, method: string) {
      return (params?: unknown) => fn(method, params);
    },
  }) as RpcClient<Handlers>;
}

// --- Relay-side: generic passthrough (ISOLATED world) ---

export function setupRpcRelay() {
  window.addEventListener(RPC_REQUEST_EVENT, async (e) => {
    const { id, method, params } = (e as CustomEvent).detail;
    try {
      const request: RpcRequest = { type: "zamak-rpc", id, method, params };
      const result = await chrome.runtime.sendMessage(request);
      const response: RpcResponse = result?.__error
        ? { id, error: result.__error }
        : { id, result };
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

export function registerRpcHandlers(handlers: Record<string, Function>) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "zamak-rpc") return;
    const { method, params } = msg as RpcRequest;
    const handler = handlers[method];
    if (!handler) {
      sendResponse(undefined);
      return;
    }
    handler(params).then(sendResponse, (err: unknown) =>
      sendResponse({
        __error: err instanceof Error ? err.message : "Unknown error",
      }),
    );
    return true; // keep channel open for async response
  });
}

// --- Reverse (tab) RPC: background → relay → MAIN world ---

type TabRpcRequest = {
  type: "zamak-tab-rpc";
  id: string;
  method: string;
  params?: unknown;
};

const TAB_RPC_REQUEST_EVENT = "zamak:tab-rpc";
const TAB_RPC_RESPONSE_EVENT = "zamak:tab-rpc-response";
const TAB_RPC_RESPONSE_KEY = "zamak:tab-rpc-response";

let tabRpcIdCounter = 0;

/** Background → tab: send RPC to a content script tab via relay. */
export async function sendTabRpc(
  tabId: number,
  method: string,
  params?: unknown,
): Promise<unknown> {
  const request: TabRpcRequest = {
    type: "zamak-tab-rpc",
    id: `tab-rpc-${++tabRpcIdCounter}-${Date.now()}`,
    method,
    params,
  };
  const response = (await chrome.tabs.sendMessage(tabId, request)) as
    | { result?: unknown; error?: string }
    | undefined;
  if (response?.error) throw new Error(response.error);
  return response?.result;
}

/** ISOLATED world: relay tab RPC from background to MAIN world and back. */
export function setupTabRpcRelay() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "zamak-tab-rpc") return;
    const { id, method, params } = msg as TabRpcRequest;

    const onResponse = () => {
      try {
        const raw = localStorage.getItem(TAB_RPC_RESPONSE_KEY);
        if (!raw) return;
        const response: RpcResponse = JSON.parse(raw);
        if (response.id !== id) return;
        window.removeEventListener(TAB_RPC_RESPONSE_EVENT, onResponse);
        if (response.error) sendResponse({ error: response.error });
        else sendResponse({ result: response.result });
      } catch {
        window.removeEventListener(TAB_RPC_RESPONSE_EVENT, onResponse);
        sendResponse({ error: "Failed to parse tab RPC response" });
      }
    };
    window.addEventListener(TAB_RPC_RESPONSE_EVENT, onResponse);
    window.dispatchEvent(
      new CustomEvent(TAB_RPC_REQUEST_EVENT, {
        detail: { id, method, params },
      }),
    );
    return true; // keep channel open for async response
  });
}

/** MAIN world: register handlers for tab RPC calls from background. */
export function registerTabRpcHandlers(handlers: Record<string, Function>) {
  window.addEventListener(TAB_RPC_REQUEST_EVENT, async (e) => {
    const { id, method, params } = (e as CustomEvent).detail;
    try {
      const handler = handlers[method];
      const result = handler ? await handler(params) : undefined;
      const response: RpcResponse = { id, result };
      localStorage.setItem(TAB_RPC_RESPONSE_KEY, JSON.stringify(response));
      window.dispatchEvent(new Event(TAB_RPC_RESPONSE_EVENT));
    } catch (err) {
      const response: RpcResponse = {
        id,
        error: err instanceof Error ? err.message : "Unknown error",
      };
      localStorage.setItem(TAB_RPC_RESPONSE_KEY, JSON.stringify(response));
      window.dispatchEvent(new Event(TAB_RPC_RESPONSE_EVENT));
    }
  });
}
