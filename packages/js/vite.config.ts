import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "Darkflow",
      formats: ["es", "cjs"],
      fileName: (format) => `darkflow.${format === "es" ? "es" : "cjs"}.js`
    },
    rollupOptions: {
      external: ["ofetch", "ws"],
      output: {
        exports: "named",
        globals: {
          ofetch: "ofetch",
          ws: "WebSocket"
        }
      }
    },
    sourcemap: true,
    minify: false,
    target: "es2022"
  },
  plugins: [
    dts({
      rollupTypes: true,
      entryRoot: "src",
      tsconfigPath: "./tsconfig.json"
    })
  ]
});
