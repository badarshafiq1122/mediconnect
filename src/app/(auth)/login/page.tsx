import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_HOME } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";
import { LoginForm } from "@/features/auth/components/login-form";
import { callbackToPath } from "@/features/auth/redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect(ROLE_HOME[user.role]);

  const { callbackUrl } = await searchParams;
  const host = (await headers()).get("host");
  const ownOrigins = host ? [`http://${host}`, `https://${host}`] : [];
  const demo = process.env.NODE_ENV !== "production";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to manage your appointments.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <LoginForm callbackUrl={callbackToPath(callbackUrl, ownOrigins) ?? undefined} />
        {demo ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Local demo (after <code>npm run db:seed</code>): <code>alex.rivera@mediconnect.test</code> / <code>Password123!</code>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
