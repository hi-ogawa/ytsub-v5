// Typed RPC between the content script, the relay, the background, and the
// bookmarks page. docs/extension-runtime.md explains how the calls flow.

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

// --- MAIN ↔ ISOLATED world messaging ---

// Window messages, not a BroadcastChannel, so RPC stays inside one tab.
// See docs/extension-runtime.md.

const RPC_CHANNEL = "zamak:rpc";
const TAB_RPC_CHANNEL = "zamak:tab-rpc";

type WorldMessage = {
  channel: string;
  kind: "request" | "response";
  data: unknown;
};

function postWorldMessage(
  channel: string,
  kind: WorldMessage["kind"],
  data: unknown,
) {
  window.postMessage({ channel, kind, data } satisfies WorldMessage, "*");
}

function listenWorldMessage(
  channel: string,
  kind: WorldMessage["kind"],
  listener: (data: any) => void,
  options?: { signal?: AbortSignal },
) {
  window.addEventListener(
    "message",
    (e) => {
      const message = e.data as WorldMessage | undefined;
      if (e.source !== window) return;
      if (message?.channel !== channel || message.kind !== kind) return;
      listener(message.data);
    },
    options,
  );
}

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

// --- MAIN world: call background via the relay ---

export function createRuntimeRelayRpc<
  Handlers extends Record<string, Function>,
>() {
  return createRpcProxy<Handlers>((method, params) => {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const ac = new AbortController();
      listenWorldMessage(
        RPC_CHANNEL,
        "response",
        (response: RpcResponse) => {
          if (response.id !== id) return;
          ac.abort();
          if (response.error) reject(new Error(response.error));
          else resolve(response.result);
        },
        { signal: ac.signal },
      );
      postWorldMessage(RPC_CHANNEL, "request", { id, method, params });
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
  listenWorldMessage(RPC_CHANNEL, "request", async ({ id, method, params }) => {
    try {
      const request: RpcRequest = { type: "zamak-rpc", id, method, params };
      const result = await chrome.runtime.sendMessage(request);
      const response: RpcResponse = result?.__error
        ? { id, error: result.__error }
        : { id, result };
      postWorldMessage(RPC_CHANNEL, "response", response);
    } catch (err) {
      const response: RpcResponse = {
        id,
        error: err instanceof Error ? err.message : "Unknown error",
      };
      postWorldMessage(RPC_CHANNEL, "response", response);
    }
  });
}

export function setupTabRpcRelay() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "zamak-tab-rpc") return;
    const { id, method, params } = msg as TabRpcRequest;

    const ac = new AbortController();
    listenWorldMessage(
      TAB_RPC_CHANNEL,
      "response",
      (response: RpcResponse) => {
        if (response.id !== id) return;
        ac.abort();
        if (response.error) sendResponse({ error: response.error });
        else sendResponse({ result: response.result });
      },
      { signal: ac.signal },
    );
    postWorldMessage(TAB_RPC_CHANNEL, "request", { id, method, params });
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

export function createContentRpc<Handlers extends Record<string, Function>>(
  tabId: number,
) {
  return createRpcProxy<Handlers>(async (method, params) => {
    const request: TabRpcRequest = {
      type: "zamak-tab-rpc",
      id: crypto.randomUUID(),
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
  listenWorldMessage(
    TAB_RPC_CHANNEL,
    "request",
    async ({ id, method, params }) => {
      try {
        const handler = handlers[method];
        const result = handler ? await handler(params) : undefined;
        postWorldMessage(TAB_RPC_CHANNEL, "response", {
          id,
          result,
        } satisfies RpcResponse);
      } catch (err) {
        console.error(`[zamak tab-rpc handler] ${method}:`, err);
        postWorldMessage(TAB_RPC_CHANNEL, "response", {
          id,
          error: err instanceof Error ? err.message : "Unknown error",
        } satisfies RpcResponse);
      }
    },
  );
}
