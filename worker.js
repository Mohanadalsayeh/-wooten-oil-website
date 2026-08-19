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

import {
  customerLoginPost,
  customerMeGet,
  customerLogoutPost
} from "./functions/api/customer-login.js";

import {
  customerActivationStart,
  customerActivationVerify,
  customerActivationSetPassword,
  adminGenerateActivationCode
} from "./functions/api/customer-activation.js";


async function addBalanceFields(response, env) {
  try {
    const body = await response.clone().json();
    if (!body || !body.customer || !body.customer.account_number || !env.DB) return response;
    const row = await env.DB.prepare(`
      SELECT current_balance, aging_category_1, aging_category_2, aging_category_3, aging_category_4
      FROM customers WHERE account_number = ? LIMIT 1
    `).bind(body.customer.account_number).first();
    if (row) {
      body.customer.current_balance = Number(row.current_balance || 0);
      body.customer.aging_category_1 = Number(row.aging_category_1 || 0);
      body.customer.aging_category_2 = Number(row.aging_category_2 || 0);
      body.customer.aging_category_3 = Number(row.aging_category_3 || 0);
      body.customer.aging_category_4 = Number(row.aging_category_4 || 0);
      body.customer.previous_balance = body.customer.aging_category_1 + body.customer.aging_category_2 + body.customer.aging_category_3 + body.customer.aging_category_4;
      body.customer.total_balance = body.customer.current_balance + body.customer.previous_balance;
    }
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "no-store");
    return new Response(JSON.stringify(body), {status: response.status, statusText: response.statusText, headers});
  } catch (_) {
    return response;
  }
}

function methodNotAllowed() {
  return new Response(
    JSON.stringify({
      success: false,
      error: "Method not allowed."
    }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

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

      return methodNotAllowed();
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

      return methodNotAllowed();
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

      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/login") {
      if (request.method === "POST") {
        return addBalanceFields(await customerLoginPost({
          request,
          env
        }), env);
      }

      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/me") {
      if (request.method === "GET") {
        return addBalanceFields(await customerMeGet({
          request,
          env
        }), env);
      }

      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/logout") {
      if (request.method === "POST") {
        return customerLogoutPost({
          request,
          env
        });
      }

      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/activation/start") {
      if (request.method === "POST") {
        return customerActivationStart({
          request,
          env
        });
      }

      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/activation/verify") {
      if (request.method === "POST") {
        return customerActivationVerify({
          request,
          env
        });
      }

      return methodNotAllowed();
    }

    if (url.pathname === "/api/customer/activation/set-password") {
      if (request.method === "POST") {
        return customerActivationSetPassword({
          request,
          env
        });
      }

      return methodNotAllowed();
    }

    if (url.pathname === "/api/admin/customer-activation-code") {
      if (request.method === "POST") {
        return adminGenerateActivationCode({
          request,
          env
        });
      }

      return methodNotAllowed();
    }

    return env.ASSETS.fetch(request);
  }
};
