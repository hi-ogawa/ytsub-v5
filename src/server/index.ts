/// <reference types="@cloudflare/workers-types" />

import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { RPCHandler } from "@orpc/server/fetch";
import type { Env } from "./db.ts";
import { router } from "./rpc.ts";

const rpcHandler = new RPCHandler(router);
const openApiHandler = new OpenAPIHandler(router);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const context = { env };

    if (url.pathname.startsWith("/rpc")) {
      const { response } = await rpcHandler.handle(request, {
        prefix: "/rpc",
        context,
      });
      if (response) return response;
    }

    if (url.pathname.startsWith("/api")) {
      const { response } = await openApiHandler.handle(request, {
        prefix: "/api",
        context,
      });
      if (response) return response;
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
