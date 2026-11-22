// Typed calls from a page to an extension frame it embeds, plus events from the
// frame back to the page. docs/extension-runtime.md explains the storage frame
// that uses it.

type FrameMessage =
  | { type: "zamak-frame:hello" }
  | { type: "zamak-frame:ready" }
  | {
      type: "zamak-frame:request";
      id: string;
      method: string;
      params: unknown[];
    }
  | {
      type: "zamak-frame:response";
      id: string;
      result?: unknown;
      error?: string;
    }
  | { type: "zamak-frame:event"; event: unknown };

type FrameHandlers = Record<string, (...params: any[]) => Promise<unknown>>;

type FrameRpcClient<Handlers extends FrameHandlers> = {
  [M in keyof Handlers]: (
    ...params: Parameters<Handlers[M]>
  ) => Promise<Awaited<ReturnType<Handlers[M]>>>;
};

type Connection = { frame: Window; origin: string };

type ConnectOptions = {
  frameId: string;
  timeoutMs: number;
  timeoutMessage: string;
};

// --- Page side ---

export function connectFrameRpc<Handlers extends FrameHandlers, Event>(
  options: ConnectOptions,
) {
  const listeners = new Set<(event: Event) => void>();
  let connection: Promise<Connection> | undefined;

  function connect() {
    connection ??= waitForFrame(options).then((conn) => {
      listenFrom(conn, (message) => {
        if (message.type !== "zamak-frame:event") {
          return;
        }
        for (const l of listeners) {
          l(message.event as Event);
        }
      });
      return conn;
    });
    return connection;
  }

  async function call(method: string, params: unknown[]) {
    const conn = await connect();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const ac = new AbortController();
      const timer = setTimeout(() => {
        ac.abort();
        reject(new Error(options.timeoutMessage));
      }, options.timeoutMs);
      listenFrom(
        conn,
        (message) => {
          if (message.type !== "zamak-frame:response" || message.id !== id) {
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
      postTo(conn, { type: "zamak-frame:request", id, method, params });
    });
  }

  const client = new Proxy({} as FrameRpcClient<Handlers>, {
    get(_target, method: string) {
      return (...params: unknown[]) => call(method, params);
    },
  });

  function onEvent(listener: (event: Event) => void) {
    connect().catch(() => {});
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { client, onEvent };
}

// The page mounts the frame through another script, and either may load
// first. The frame announces itself when it starts, and answers a hello sent
// after that.
function waitForFrame(options: ConnectOptions): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const ac = new AbortController();
    const timer = setTimeout(() => {
      ac.abort();
      reject(new Error(options.timeoutMessage));
    }, options.timeoutMs);
    window.addEventListener(
      "message",
      (event) => {
        const message = event.data as FrameMessage | undefined;
        if (message?.type !== "zamak-frame:ready") {
          return;
        }
        if (!event.origin.startsWith("chrome-extension://")) {
          return;
        }
        const frame = document.getElementById(options.frameId);
        if (
          !(frame instanceof HTMLIFrameElement) ||
          event.source !== frame.contentWindow
        ) {
          return;
        }
        clearTimeout(timer);
        ac.abort();
        resolve({ frame: frame.contentWindow!, origin: event.origin });
      },
      { signal: ac.signal },
    );
    const frame = document.getElementById(options.frameId);
    if (frame instanceof HTMLIFrameElement) {
      frame.contentWindow?.postMessage(
        { type: "zamak-frame:hello" } satisfies FrameMessage,
        "*",
      );
    }
  });
}

// --- Frame side ---

// Answers only `parentOrigin`, and only the methods in `handlers`.
export function serveFrameRpc<Event>(
  handlers: FrameHandlers,
  options: { parentOrigin: string },
) {
  const parent = { frame: window.parent, origin: options.parentOrigin };

  listenFrom(parent, async (message) => {
    if (message.type === "zamak-frame:hello") {
      postTo(parent, { type: "zamak-frame:ready" });
      return;
    }
    if (message.type !== "zamak-frame:request") {
      return;
    }
    const { id, method, params } = message;
    try {
      if (!Object.hasOwn(handlers, method)) {
        throw new Error(`Unknown method: ${method}`);
      }
      const result = await handlers[method]!(...params);
      postTo(parent, { type: "zamak-frame:response", id, result });
    } catch (error) {
      console.error(`[zamak frame] ${method}:`, error);
      postTo(parent, {
        type: "zamak-frame:response",
        id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
  postTo(parent, { type: "zamak-frame:ready" });

  return {
    emit(event: Event) {
      postTo(parent, { type: "zamak-frame:event", event });
    },
  };
}

// --- Messaging ---

function postTo(conn: Connection, message: FrameMessage) {
  conn.frame.postMessage(message, conn.origin);
}

function listenFrom(
  conn: Connection,
  listener: (message: FrameMessage) => void,
  options?: { signal?: AbortSignal },
) {
  window.addEventListener(
    "message",
    (event) => {
      if (event.source !== conn.frame || event.origin !== conn.origin) {
        return;
      }
      const message = event.data as FrameMessage | undefined;
      if (message?.type) {
        listener(message);
      }
    },
    options,
  );
}
