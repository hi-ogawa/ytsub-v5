import { RPCHandler } from "@orpc/server/fetch";
import { parseAuthToken, verifyToken } from "./auth.ts";
import { handleAuthCheck, handleLogin, handleLogout } from "./routes/auth.ts";
import { router } from "./rpc.ts";

const handler = new RPCHandler(router);

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Auth endpoints — plain REST (need Set-Cookie headers)
    if (url.pathname === "/api/auth/login") return handleLogin(request);
    if (url.pathname === "/api/auth/logout") return handleLogout();
    if (url.pathname === "/api/auth/check") return handleAuthCheck(request);

    if (url.pathname.startsWith("/api")) {
      // Health endpoint is public
      const isHealth = url.pathname === "/api/health";

      if (!isHealth) {
        const token = parseAuthToken(request);
        if (!token || !(await verifyToken(token))) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
      }

      const { response } = await handler.handle(request, {
        prefix: "/api",
      });
      if (response) return response;
    }

    return new Response("Not found", { status: 404 });
  },
};
