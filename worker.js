import {
  onRequestPost as fuelRequestPost,
  onRequestGet as fuelRequestGet
} from "./functions/api/fuel-request.js";

import {
  onRequestPost as contactMessagePost,
  onRequestGet as contactMessageGet
} from "./functions/api/contact-message.js";

import {
  onRequestPost as customerImportPost,
  onRequestGet as customerImportGet
} from "./functions/api/admin-customers-import.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/fuel-request") {
      if (request.method === "POST") {
        return fuelRequestPost({
          request,
          env,
          waitUntil: ctx.waitUntil.bind(ctx)
        });
      }

      if (request.method === "GET") {
        return fuelRequestGet({
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

    if (url.pathname === "/api/contact-message") {
      if (request.method === "POST") {
        return contactMessagePost({
          request,
          env,
          waitUntil: ctx.waitUntil.bind(ctx)
        });
      }

      if (request.method === "GET") {
        return contactMessageGet({
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
if (url.pathname === "/api/admin/customers-import") {
  if (request.method === "POST") {
    return customerImportPost({
      request,
      env
    });
  }

  if (request.method === "GET") {
    return customerImportGet({
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
