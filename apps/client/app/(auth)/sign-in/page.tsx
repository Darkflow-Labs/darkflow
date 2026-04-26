import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@darkflow/auth/server";
import { SignInView } from "@/components/auth/SignInView";

export default async function SignInPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-0 flex-1 items-center">
      <SignInView />
    </main>
  );
}
