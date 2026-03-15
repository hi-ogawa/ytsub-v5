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

// --- Wire format ---

export type RpcRequest = {
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

/** Create a typed RPC client proxy. Type parameter should be `typeof bgRpcHandlers`. */
export function createRpc<Handlers extends Record<string, Function>>() {
  return new Proxy({} as never, {
    get(_target, method: string) {
      return (params?: unknown) => call(method, params);
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

export function registerRpcHandlers(handlers: Record<string, Function>) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "zamak-rpc") return;
    const { method, params } = msg as RpcRequest;
    const handler = handlers[method];
    if (!handler) {
      sendResponse(undefined);
      return;
    }
    handler(params).then(sendResponse);
    return true; // keep channel open for async response
  });
}
