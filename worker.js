import {
  onRequestPost,
  onRequestGet
} from "./functions/api/fuel-request.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/fuel-request") {
      if (request.method === "POST") {
        return onRequestPost({
          request,
          env,
          waitUntil: ctx.waitUntil.bind(ctx)
        });
      }

      if (request.method === "GET") {
        return onRequestGet({
          request,
          env
        });
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: "Method not allowed."
        }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    return env.ASSETS.fetch(request);
  }
};
