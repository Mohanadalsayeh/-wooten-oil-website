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


    /* =====================================================
       FUEL REQUEST
    ===================================================== */

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


    /* =====================================================
       CONTACT MESSAGE
    ===================================================== */

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


    /* =====================================================
       MAS 90 CUSTOMER IMPORT
    ===================================================== */

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


    /* =====================================================
       CUSTOMER LOGIN
    ===================================================== */

    if (url.pathname === "/api/customer/login") {
      if (request.method === "POST") {
        return customerLoginPost({
          request,
          env
        });
      }

      return methodNotAllowed();
    }


    /* =====================================================
       CURRENT LOGGED-IN CUSTOMER
    ===================================================== */

    if (url.pathname === "/api/customer/me") {
      if (request.method === "GET") {
        return customerMeGet({
          request,
          env
        });
      }

      return methodNotAllowed();
    }


    /* =====================================================
       CUSTOMER LOGOUT
    ===================================================== */

    if (url.pathname === "/api/customer/logout") {
      if (request.method === "POST") {
        return customerLogoutPost({
          request,
          env
        });
      }

      return methodNotAllowed();
    }


    /* =====================================================
       CUSTOMER ACTIVATION - START
    ===================================================== */

    if (url.pathname === "/api/customer/activation/start") {
      if (request.method === "POST") {
        return customerActivationStart({
          request,
          env
        });
      }

      return methodNotAllowed();
    }


    /* =====================================================
       CUSTOMER ACTIVATION - VERIFY CODE
    ===================================================== */

    if (url.pathname === "/api/customer/activation/verify") {
      if (request.method === "POST") {
        return customerActivationVerify({
          request,
          env
        });
      }

      return methodNotAllowed();
    }


    /* =====================================================
       CUSTOMER ACTIVATION - SET PASSWORD
    ===================================================== */

    if (url.pathname === "/api/customer/activation/set-password") {
      if (request.method === "POST") {
        return customerActivationSetPassword({
          request,
          env
        });
      }

      return methodNotAllowed();
    }


    /* =====================================================
       ADMIN - GENERATE PHONE ACTIVATION CODE
    ===================================================== */

    if (url.pathname === "/api/admin/customer-activation-code") {
      if (request.method === "POST") {
        return adminGenerateActivationCode({
          request,
          env
        });
      }

      return methodNotAllowed();
    }


    /* =====================================================
       WEBSITE / STATIC FILES
    ===================================================== */

    return env.ASSETS.fetch(request);
  }
};
