import { stat } from "node:fs/promises";
import { resolve } from "node:path";

const maxBytes = Number.parseInt(process.env.DARKFLOW_JS_BUNDLE_MAX_BYTES ?? "500000", 10);
const targets = ["dist/darkflow.es.js", "dist/darkflow.cjs.js"];

const run = async () => {
  const failures = [];
  for (const target of targets) {
    const filePath = resolve(process.cwd(), target);
    const info = await stat(filePath);
    if (info.size > maxBytes) {
      failures.push({ target, size: info.size });
    }
  }
  if (failures.length > 0) {
    for (const failure of failures) {
      // eslint-disable-next-line no-console
      console.error(
        `[bundle-size] ${failure.target} is ${failure.size} bytes (limit: ${maxBytes} bytes).`
      );
    }
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(`[bundle-size] OK (${targets.join(", ")}) <= ${maxBytes} bytes each`);
};

void run();
