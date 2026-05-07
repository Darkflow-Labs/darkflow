import { mustGetQuery } from "@rocicorp/zero";
import { handleQueryRequest } from "@rocicorp/zero/server";
import { auth } from "@darkflow/auth/server";
import { queries, schema } from "@darkflow/sync";

export const runtime = "nodejs";

export const POST = async (req: Request) => {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  const ctx = session?.user?.id ? { userId: session.user.id } : undefined;

  const result = await handleQueryRequest(
    (name, args) => {
      const query = mustGetQuery(queries, name);
      return query.fn({ args, ctx } as never);
    },
    schema,
    req,
  );

  return Response.json(result);
};
