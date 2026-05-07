import { mustGetMutator } from "@rocicorp/zero";
import { handleMutateRequest } from "@rocicorp/zero/server";
import { auth } from "@darkflow/auth/server";
import { mutators } from "@darkflow/sync";
import { getSyncZeroDbProvider } from "@/lib/sync/zero-db";

export const runtime = "nodejs";

export const POST = async (req: Request) => {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ctx = { userId: session.user.id };

  const { dbProvider } = getSyncZeroDbProvider();

  const result = await handleMutateRequest(
    dbProvider,
    async (transact, _mutation) =>
      transact(async (tx, name, args) => {
        const mutator = mustGetMutator(mutators, name);
        await mutator.fn({ args, tx, ctx } as never);
      }),
    req,
  );

  return Response.json(result);
};
