import { auth } from "@darkflow/auth/server";
import { autumnHandler } from "autumn-js/next";

const secretKey = process.env.AUTUMN_SECRET_KEY;

const handler =
  secretKey !== undefined && secretKey.length > 0
    ? autumnHandler({
        identify: async (request) => {
          const session = await auth.api.getSession({ headers: request.headers });
          const user = session?.user;
          if (!user?.id) {
            return { customerId: null };
          }
          return {
            customerId: user.id,
            customerData: {
              name: user.name,
              email: user.email ?? undefined
            }
          };
        },
        secretKey
      })
    : null;

export const GET = async (request: Request) => {
  if (!handler) {
    return new Response("Autumn is not configured (AUTUMN_SECRET_KEY).", { status: 503 });
  }
  return handler.GET(request);
};

export const POST = async (request: Request) => {
  if (!handler) {
    return new Response("Autumn is not configured (AUTUMN_SECRET_KEY).", { status: 503 });
  }
  return handler.POST(request);
};

export const DELETE = async (request: Request) => {
  if (!handler) {
    return new Response("Autumn is not configured (AUTUMN_SECRET_KEY).", { status: 503 });
  }
  return handler.DELETE(request);
};
