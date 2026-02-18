import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";
import { isAppError } from "@/lib/errors";
import { authenticateCredentials } from "@/features/auth/service";

class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        try {
          // The throttle lives inside authenticateCredentials (not only in the login action), so POSTing straight
          // to /api/auth/callback/credentials cannot bypass it.
          return await authenticateCredentials(credentials, request.headers);
        } catch (error) {
          if (isAppError(error, "RATE_LIMITED")) throw new RateLimitedSignin();
          throw error;
        }
      },
    }),
  ],
});
