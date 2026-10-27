# Renewing an AI key

The console shows **"An AI key needs renewing"** (or **"AI is off"**) at the top when a provider refuses its key:
HTTP 401 or 403, or Amazon Bedrock's `ExpiredTokenException` / `AccessDeniedException`. The banner names the provider and
the time of the first refusal. It goes away by itself the next time that provider answers.

Until then the website keeps working. Another provider answers if one is set (`AI_PROVIDER`, `AI_FALLBACK_PROVIDER` in
`.env`), and otherwise Ask District IQ and the AI write-ups use the rules only.

## Website (Ask District IQ, the briefing write-ups)

1. Get a new key:
   - **Amazon Bedrock:** a Bedrock API key (`AWS_BEARER_TOKEN_BEDROCK`), or temporary AWS keys from the AWS access portal
     ("Access keys"). Temporary keys expire after a few hours, so renew them before a demo.
   - **Groq:** a key starting `gsk_` from console.groq.com.
   - **Gemini:** a key from aistudio.google.com.
2. In `chennai-grievance-portal-main`, run:

   ```bash
   npm run ai:key
   ```

   Paste the key or keys, then press Enter on an empty line. The script writes `.env`, tests the key and prints only the
   last 4 characters.
3. There is no restart. The website re-reads `.env`, and the banner clears on the next successful answer.
   `npm run ai:check` tests the keys already in `.env`.

## Pipeline (district_intel news labels, the hourly build)

The hourly build reads its keys from `district_intel/.env` on this PC, and from the GitHub secrets of the dataload
repository (`GROQ_API_KEY`, `GEMINI_API_KEY`, and the AWS keys for Bedrock Nova). A refused key there does not stop the
build: the local model and the rules label the news instead. The run log (`district_intel/output/last_build.log`) names
the provider that failed. Renew the secret in the repository settings, and the next hourly run uses it.

## Never

- Commit a key, or paste one into chat, an issue or a document.
- Reuse one person's personal key for the shared website.
