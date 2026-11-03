import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const executablePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);

export default defineConfig({
  testDir: "./tests/browser", workers: 1, timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3100", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    launchOptions: executablePath ? { executablePath } : {}, trace: "retain-on-failure" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100",
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-test-placeholder", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
