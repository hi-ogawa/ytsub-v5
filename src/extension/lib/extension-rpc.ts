// Typed RPC mechanism for content script ↔ background worker communication.
//
// Forward RPC (content-initiated, request → response):
//
//   MAIN world (content.tsx)
//     → posts {id, method, params} on BroadcastChannel "zamak:rpc"
//   ISOLATED world (relay.ts)
//     → receives message, calls chrome.runtime.sendMessage
//   Background worker (background.ts)
//     → handles message, returns response
//   ISOLATED world (relay.ts)
//     → posts {id, result/error} on BroadcastChannel "zamak:rpc"
//   MAIN world (content.tsx)
//     → receives response, resolves promise
//
// Reverse (tab) RPC (background-initiated, request → response):
//
//   Background worker (background.ts)
//     → chrome.tabs.sendMessage(tabId, {type: "zamak-tab-rpc", ...})
//   ISOLATED world (relay.ts)
//     → chrome.runtime.onMessage listener, posts on BroadcastChannel "zamak:tab-rpc"
//   MAIN world (content.tsx)
//     → handler executes, posts result on BroadcastChannel "zamak:tab-rpc"
//   ISOLATED world (relay.ts)
//     → receives response, calls sendResponse back to background

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

// --- BroadcastChannel names ---

const RPC_CHANNEL = "zamak:rpc";
const TAB_RPC_CHANNEL = "zamak:tab-rpc";

// --- Type helpers for deriving client from handler map ---

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

function createRpcProxy<Handlers extends Record<string, Function>>(
  call: (method: string, params?: unknown) => Promise<unknown>,
): RpcClient<Handlers> {
  return new Proxy({} as never, {
    get(_target, method: string) {
      return (params?: unknown) => call(method, params);
    },
  });
}

// --- MAIN world: call background via BroadcastChannel relay ---

export function createRuntimeRelayRpc<
  Handlers extends Record<string, Function>,
>() {
  const channel = new BroadcastChannel(RPC_CHANNEL);
  let idCounter = 0;
  return createRpcProxy<Handlers>((method, params) => {
    const id = `rpc-${++idCounter}-${Date.now()}`;
    return new Promise((resolve, reject) => {
      const ac = new AbortController();
      channel.addEventListener(
        "message",
        (e) => {
          const response: RpcResponse = e.data;
          if (response.id !== id) return;
          ac.abort();
          if (response.error) reject(new Error(response.error));
          else resolve(response.result);
        },
        { signal: ac.signal },
      );
      channel.postMessage({ id, method, params });
    });
  });
}

// --- ISOLATED world / extension pages: call background directly ---

export function createRuntimeRpc<Handlers extends Record<string, Function>>() {
  return createRpcProxy<Handlers>(async (method, params) => {
    const request: RpcRequest = {
      type: "zamak-rpc",
      id: "",
      method,
      params,
    };
    const response = await chrome.runtime.sendMessage(request);
    if (response?.__error) throw new Error(response.__error);
    return response;
  });
}

// --- ISOLATED world: relay setup ---

export function setupRpcRelay() {
  const channel = new BroadcastChannel(RPC_CHANNEL);
  channel.addEventListener("message", async (e) => {
    const { id, method, params } = e.data;
    try {
      const request: RpcRequest = { type: "zamak-rpc", id, method, params };
      const result = await chrome.runtime.sendMessage(request);
      const response: RpcResponse = result?.__error
        ? { id, error: result.__error }
        : { id, result };
      channel.postMessage(response);
    } catch (err) {
      const response: RpcResponse = {
        id,
        error: err instanceof Error ? err.message : "Unknown error",
      };
      channel.postMessage(response);
    }
  });
}

export function setupTabRpcRelay() {
  const channel = new BroadcastChannel(TAB_RPC_CHANNEL);
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "zamak-tab-rpc") return;
    const { id, method, params } = msg as TabRpcRequest;

    const ac = new AbortController();
    channel.addEventListener(
      "message",
      (e) => {
        const response: RpcResponse = e.data;
        if (response.id !== id) return;
        ac.abort();
        if (response.error) sendResponse({ error: response.error });
        else sendResponse({ result: response.result });
      },
      { signal: ac.signal },
    );
    channel.postMessage({ id, method, params });
    return true; // keep channel open for async response
  });
}

// --- Background: handler registration + tab RPC client ---

export function registerRpcHandlers(handlers: Record<string, Function>) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "zamak-rpc") return;
    const { method, params } = msg as RpcRequest;
    const handler = handlers[method];
    if (!handler) {
      sendResponse(undefined);
      return;
    }
    handler(params).then(sendResponse, (err: unknown) => {
      console.error(`[zamak rpc] ${method}:`, err);
      sendResponse({
        __error: err instanceof Error ? err.message : "Unknown error",
      });
    });
    return true; // keep channel open for async response
  });
}

type TabRpcRequest = {
  type: "zamak-tab-rpc";
  id: string;
  method: string;
  params?: unknown;
};

let contentRpcIdCounter = 0;

export function createContentRpc<Handlers extends Record<string, Function>>(
  tabId: number,
) {
  return createRpcProxy<Handlers>(async (method, params) => {
    const request: TabRpcRequest = {
      type: "zamak-tab-rpc",
      id: `tab-rpc-${++contentRpcIdCounter}-${Date.now()}`,
      method,
      params,
    };
    const response = (await chrome.tabs.sendMessage(tabId, request)) as
      | { result?: unknown; error?: string }
      | undefined;
    if (response?.error) {
      console.error(`[zamak tab-rpc] ${method}:`, response.error);
      throw new Error(response.error);
    }
    return response?.result;
  });
}

// --- MAIN world: register handlers for tab RPC calls from background ---

export function registerTabRpcHandlers(handlers: Record<string, Function>) {
  const channel = new BroadcastChannel(TAB_RPC_CHANNEL);
  channel.addEventListener("message", async (e) => {
    const { id, method, params } = e.data;
    try {
      const handler = handlers[method];
      const result = handler ? await handler(params) : undefined;
      channel.postMessage({ id, result } satisfies RpcResponse);
    } catch (err) {
      console.error(`[zamak tab-rpc handler] ${method}:`, err);
      channel.postMessage({
        id,
        error: err instanceof Error ? err.message : "Unknown error",
      } satisfies RpcResponse);
    }
  });
}
