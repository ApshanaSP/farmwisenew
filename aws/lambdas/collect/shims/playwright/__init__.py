"""Stand-in for Playwright inside Lambda (Chromium cannot run there). Importing works; starting a browser raises
playwright's own Error type, so the collectors' existing "playwright-error" handling records it and carries on."""
