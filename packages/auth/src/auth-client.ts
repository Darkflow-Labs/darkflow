"use client";

import { createAuthClient } from "better-auth/react";

const baseURL =
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL,
});

type SignInWithDiscordOptions = {
  callbackURL?: string;
  errorCallbackURL?: string;
  newUserCallbackURL?: string;
  disableRedirect?: boolean;
};

export const signInWithDiscord = async ({
  callbackURL = "/",
  errorCallbackURL = "/sign-in",
  newUserCallbackURL,
  disableRedirect,
}: SignInWithDiscordOptions = {}) => {
  return authClient.signIn.social({
    provider: "discord",
    callbackURL,
    errorCallbackURL,
    newUserCallbackURL,
    disableRedirect,
  });
};
