import { defineConfig } from "@playwright/test";

/**
 * Jarvis's end-to-end specs, on the dev test console (/dev/thunai), providers mocked at the browser with page.route. Run with
 *   npx playwright test
 * The real Silero model, AudioWorklet, turn machine and mouth run; audio comes in through a WebAudio stream with a known speech
 * start (tests/e2e/helpers.ts), and vad.spec also runs once through the fake capture device. No real microphone is involved.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.SPEC_URL ?? "http://127.0.0.1:3011",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
    permissions: ["microphone"]
  },
  webServer: {
    command: "npx next dev -H 127.0.0.1 -p 3011",
    url: "http://127.0.0.1:3011/dev/thunai",
    reuseExistingServer: true,
    timeout: 240_000,
    env: { NEXT_DIST_DIR: ".next-test", DATA_BACKEND: "aws", AWS_STORE_DRY_RUN: "1", AWS_STORE_RELOAD_MINUTES: "100000", AWS_DURABLE_FILE: "data/aws-cache/dryrun-spec/durable.sqlite", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", THUNAI_DIR: "data/thunai/spec" }
  }
});
