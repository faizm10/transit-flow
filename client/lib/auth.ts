import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, profile }) {
      // Persist GitHub login handle and avatar into the JWT on first sign-in
      if (profile) {
        const p = profile as { login?: string; avatar_url?: string };
        if (p.login) token.login = p.login;
        if (p.avatar_url) token.picture = p.avatar_url;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        // Expose the GitHub user id (stable, globally unique) as session.user.id
        session.user.id = token.sub!;
        (session.user as typeof session.user & { login?: string }).login =
          token.login as string | undefined;
      }
      return session;
    },
  },
});
