"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithDiscord } from "@darkflow/auth/client";
import { AuthSignInScreen } from "@darkflow/ui/auth-sign-in-screen";

export const SignInView = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDiscordSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const { error } = await signInWithDiscord({
      callbackURL: "http://localhost:3000/",
      errorCallbackURL: "http://localhost:3000/sign-in",
    });

    if (error) {
      setErrorMessage(error.message || "Discord sign-in failed. Please try again.");
      setIsLoading(false);
      return;
    }

    router.refresh();
  };

  return (
    <AuthSignInScreen
      onDiscordSignIn={handleDiscordSignIn}
      isLoading={isLoading}
      errorMessage={errorMessage}
    />
  );
};
