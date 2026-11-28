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

/** The frame's methods, plus `subscribe` for its events */
type FrameRpcClient<Handlers extends FrameHandlers, Event> = {
  [M in keyof Handlers]: (
    ...params: Parameters<Handlers[M]>
  ) => Promise<Awaited<ReturnType<Handlers[M]>>>;
} & { subscribe(listener: (event: Event) => void): () => void };

type Connection = { frame: Window; origin: string };

type ConnectOptions = {
  frameId: string;
  timeoutMs: number;
  timeoutMessage: string;
};

// --- Page side ---

export function connectFrameRpc<Handlers extends FrameHandlers, Event>(
  options: ConnectOptions,
): FrameRpcClient<Handlers, Event> {
  const listeners = new Set<(event: Event) => void>();
  let connectionPromise: Promise<Connection> | undefined;

  function connect() {
    connectionPromise ??= waitForFrame(options).then((connection) => {
      listenFrom(connection, (message) => {
        if (message.type !== "zamak-frame:event") {
          return;
        }
        for (const listener of listeners) {
          listener(message.event as Event);
        }
      });
      return connection;
    });
    return connectionPromise;
  }

  async function call(method: string, params: unknown[]) {
    const connection = await connect();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error(options.timeoutMessage));
      }, options.timeoutMs);
      listenFrom(
        connection,
        (message) => {
          if (message.type !== "zamak-frame:response" || message.id !== id) {
            return;
          }
          clearTimeout(timer);
          controller.abort();
          if (message.error) {
            reject(new Error(message.error));
          } else {
            resolve(message.result);
          }
        },
        { signal: controller.signal },
      );
      postTo(connection, { type: "zamak-frame:request", id, method, params });
    });
  }

  function subscribe(listener: (event: Event) => void) {
    connect().catch(() => {});
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return new Proxy({} as FrameRpcClient<Handlers, Event>, {
    get(_target, method) {
      if (method === "subscribe") {
        return subscribe;
      }
      // `then` stays undefined so the client never looks like a promise.
      if (typeof method !== "string" || method === "then") {
        return undefined;
      }
      return (...params: unknown[]) => call(method, params);
    },
  });
}

/**
 * The page mounts the frame through another script, and either may load
 * first. The frame announces itself when it starts, and answers a hello sent
 * after that.
 */
function waitForFrame(options: ConnectOptions): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
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
        controller.abort();
        resolve({ frame: frame.contentWindow!, origin: event.origin });
      },
      { signal: controller.signal },
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

/** Answers only `parentOrigin`, and only the listed `methods` of `target`. */
export function serveFrameRpc<Target, Event>(
  target: Target,
  options: {
    methods: readonly (keyof Target & string)[];
    parentOrigin: string;
  },
) {
  const methods: readonly string[] = options.methods;
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
      if (!methods.includes(method)) {
        throw new Error(`Unknown method: ${method}`);
      }
      const handlers = target as FrameHandlers;
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

function postTo(connection: Connection, message: FrameMessage) {
  connection.frame.postMessage(message, connection.origin);
}

function listenFrom(
  connection: Connection,
  listener: (message: FrameMessage) => void,
  options?: { signal?: AbortSignal },
) {
  window.addEventListener(
    "message",
    (event) => {
      if (
        event.source !== connection.frame ||
        event.origin !== connection.origin
      ) {
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
