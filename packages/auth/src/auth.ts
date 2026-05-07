import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { Autumn } from "autumn-js";
import { prisma } from "@darkflow/db";

const baseURL =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
  "http://localhost:3000";

const autumnSecretKey = process.env.AUTUMN_SECRET_KEY;
const autumn =
  autumnSecretKey !== undefined && autumnSecretKey.length > 0
    ? new Autumn({ secretKey: autumnSecretKey, failOpen: false })
    : null;

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL,
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          if (!autumn) {
            return;
          }
          try {
            await autumn.customers.getOrCreate({
              customerId: user.id,
              name: user.name,
              email: typeof user.email === "string" ? user.email : undefined
            });
          } catch {
            /* Non-blocking: billing backfill can run later */
          }
        }
      }
    }
  }
});
