import { Router } from "itty-router";

const router = Router();

// default route
router.get("/", () => jsonResponse({ message: "Hello World" }));

// catch all for 404
router.all("*", () => errorResponse(404));

function jsonResponse(json, status = 200) {
  return new Response(JSON.stringify(json), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(code) {
  const codes = {
    404: "Not Found",
    500: "Internal Server Error",
  };

  if (codes[code]) {
    return Response.json(
      {
        error: {
          code: code,
          message: codes[code],
        },
      },
      { status: code }
    );
  } else {
    return Response.json(
      {
        error: {
          code: 500,
          message: codes[500],
        },
      },
      { status: 500 }
    );
  }
}

export default {
  fetch: router.handle,
};
