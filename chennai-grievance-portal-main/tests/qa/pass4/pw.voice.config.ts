// Same as playwright.config.ts but: --mute-audio on every launch, the server (already running) on 3186, outputs under test-results-voice.
import { defineConfig } from "@playwright/test";
import path from "path";
export default defineConfig({
  testDir: path.join(process.cwd(), "tests"),
  testMatch: process.env.VOICE_SPECS ? new RegExp(process.env.VOICE_SPECS) : /e2e[\/].*\.spec\.ts/,
  timeout: 120_000, workers: 1, fullyParallel: false, reporter: [["list"], ["json", { outputFile: "../../../docs/qa/pass4/evidence/voice-specs.json" }]],
  outputDir: "../../../test-results-voice",
  use: { baseURL: "http://127.0.0.1:3186", launchOptions: { args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }, permissions: ["microphone"] }
});
