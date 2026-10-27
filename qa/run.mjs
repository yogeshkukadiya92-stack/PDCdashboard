import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { chromium } from "playwright";
import { tmpdir } from "node:os";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const data = mkdtempSync(path.join(tmpdir(), "pdc-browser-"));
const output = path.join(root, "qa", "artifacts");
const browserChannel = process.env.PDC_BROWSER_CHANNEL ||
  (!existsSync(chromium.executablePath()) && existsSync("/Applications/Google Chrome.app") ? "chrome" : "");
mkdirSync(output, { recursive: true });
const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: "0",
    DATA_DIR: data,
    ADMIN_EMAIL: "qa-admin@example.com",
    ADMIN_PASSWORD: "QaTest12345",
  },
  stdio: ["ignore", "pipe", "inherit"],
});
try {
  const port = await new Promise((resolve, reject) => {
    server.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/port (\d+)/);
      if (match) resolve(match[1]);
    });
    server.once("exit", (code) => reject(new Error(`Server exited ${code}`)));
  });
  for (const script of [
    "admin-flow.mjs",
    "roles-flow.mjs",
    "admin-controls.mjs",
    "operations-flow.mjs",
    "dashboard-edge-cases.mjs",
    "dashboard-audit.mjs",
  ])
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, "qa", script)], {
        cwd: root,
        env: {
          ...process.env,
          PDC_BROWSER_CHANNEL: browserChannel,
          QA_BASE_URL: `http://127.0.0.1:${port}`,
          QA_OUTPUT_DIR: output,
        },
        stdio: "inherit",
      });
      child.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`${script} failed (${code})`)),
      );
    });
  console.log(`Browser evidence saved to ${output}`);
} finally {
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill();
  await exited;
  rmSync(data, { recursive: true, force: true });
}
