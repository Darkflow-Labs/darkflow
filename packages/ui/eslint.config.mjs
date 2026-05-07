import { config } from "@repo/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='useEffect']",
          message:
            "Do not use React useEffect in @darkflow/ui. Prefer the Effect library (or ref callbacks / useSyncExternalStore) for lifecycle and subscriptions.",
        },
      ],
    },
  },
];
