### Proposal: Add “Sign in with ChatGPT (Plus/Pro)” authentication for the OpenAI provider

This document outlines a compliant, testable plan to let users authenticate Roo Code with their ChatGPT Plus/Pro account instead of manually pasting an API key. It follows project policies in `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md`, and integrates cleanly with the existing OpenAI provider implementation described in `README.md`.

---

#### Why

- Reduce friction for users who already have ChatGPT Plus/Pro but don’t know or don’t want to manage API keys.
- Align with Codex CLI’s login flow that exchanges OAuth tokens for an API key (usage continues to go through OpenAI APIs as today).
- Keep existing request code paths unchanged by ultimately storing an API key in VS Code Secret Storage.

---

### Scope (MVP)

- New auth mode for OpenAI provider: `"apiKey" | "chatgpt"`.
- Add a “Sign in with ChatGPT (Plus/Pro)” button in Providers → OpenAI settings panel and a matching command palette action.
- Launch a local OAuth+PKCE browser flow, receive callback on `http://127.0.0.1:<port>/auth/callback`, exchange code for tokens, then perform token-exchange to retrieve an “openai-api-key”.
- Store resulting API key + refreshable tokens in VS Code `SecretStorage`; wire the OpenAI provider to read from SecretStorage when `authMode === "chatgpt"`.
- Provide “Sign out”, “Refresh credentials”, and “Import from Codex CLI” actions.

Out of scope (future): enterprise SSO variants; multi-account switching UI.

---

### High-level design

- UX additions

    - Settings → Providers → OpenAI
        - Button: “Sign in with ChatGPT (Plus/Pro)”
        - Status text: “Signed in with ChatGPT” or “Not signed in”
        - Buttons: “Sign out”, “Refresh credentials”, “Import from Codex CLI”, “Paste Codex auth.json”
    - Commands
        - `Roo: Sign in with ChatGPT (OpenAI)`
        - `Roo: Sign out ChatGPT (OpenAI)`
        - `Roo: Import OpenAI credentials from Codex CLI`
        - `Roo: Paste Codex auth.json`

- Data model (SecretStorage keys)

    - `roo.openai.chatgpt.apiKey`: exchanged OpenAI API key (Bearer token)
    - `roo.openai.chatgpt.idToken`: OAuth ID token (JWT)
    - `roo.openai.chatgpt.refreshToken`: OAuth refresh token
    - `roo.openai.chatgpt.lastRefreshIso`: ISO timestamp

- Configuration

    - `openAi.authMode`: `"apiKey" | "chatgpt"` (default remains `"apiKey"`)

- Request path
    - No changes to `src/api/providers/openai*.ts` request logic. When `authMode === "chatgpt"`, we read the API key from SecretStorage and pass it as usual.

#### API endpoints used (explicit)

- After ChatGPT sign‑in, Roo exchanges tokens for a first‑class OpenAI API key and then calls the standard Platform endpoints — not ChatGPT web endpoints.
- Endpoints:
    - Responses API (GPT‑5 and `codex-mini-latest`):
        - `POST https://api.openai.com/v1/responses`
        - Headers: `Authorization: Bearer <apiKey>`, `Content-Type: application/json`, `Accept: text/event-stream` (for streaming)
    - Chat Completions API (o1/o3/o4-mini and other chat models):
        - `POST https://api.openai.com/v1/chat/completions`
        - Headers: `Authorization: Bearer <apiKey>`, `Content-Type: application/json` (SDK handles streaming headers)
- Base URL overrides follow existing Roo settings:
    - `openAiNativeBaseUrl` (default `https://api.openai.com`) for `openai-native` handler.
    - `openAiBaseUrl` (default `https://api.openai.com/v1`) for `openai` handler.
- Optional scoping headers (if configured in settings/environment) are forwarded unchanged, e.g. `OpenAI-Organization`, `OpenAI-Project`.
- We do not call `https://chatgpt.com/backend-api/codex`; the “drop‑in” behavior is limited to the authentication flow and token‑exchange semantics.

---

### OAuth + token-exchange flow (mirrors Codex CLI)

1. Start local server

    - Bind `127.0.0.1` on port 1455 by default; if occupied, pick a random free port.
    - Generate `state` and PKCE `code_verifier`/`code_challenge` (S256).

2. Open browser to authorization URL

    - `https://auth.openai.com/oauth/authorize`
    - Query params (match Codex CLI exactly for drop‑in compatibility):
        - `response_type=code`
        - `client_id=app_EMoamEEZ73f0CkXaXp7hrann`
        - `redirect_uri=http://localhost:1455/auth/callback`
        - `scope=openid profile email offline_access`
        - `code_challenge` + `code_challenge_method=S256`
        - `id_token_add_organizations=true`
        - `codex_cli_simplified_flow=true`
        - `state`

3. Handle callback on `/auth/callback`

    - Validate `state`.
    - Exchange code → tokens via `POST https://auth.openai.com/oauth/token` with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`.
    - Persist `id_token`, `access_token`, `refresh_token` in SecretStorage.

4. Token exchange → API key

    - If `id_token` claims include organization/project (or allowed for personal), request an API key via token-exchange:
        - `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`
        - `requested_token=openai-api-key`
        - `subject_token=<id_token>`
        - `subject_token_type=urn:ietf:params:oauth:token-type:id_token`
        - `client_id=<RooClientId>`
    - Store returned token as `roo.openai.chatgpt.apiKey` in SecretStorage.
    - If org/project missing, show guidance (CTA link) to complete Platform onboarding, then allow retry.

5. Optional: complimentary credit redemption (best-effort)

    - POST `https://api.openai.com/v1/billing/redeem_credits` with the `id_token` when Plus/Pro and eligible. Errors are logged as warnings only.

6. Finish
    - Close local server; update UI status; downstream requests use the stored API key.

Refresh policy

- On activation and daily thereafter, check if `id_token` is expiring (or older than ~28 days). If so, refresh via `POST /oauth/token` with `grant_type=refresh_token`, rotate tokens, and optionally re-run token-exchange to rotate the API key if required. Update `lastRefreshIso`.

Headless/remote support

- If the callback cannot be reached (e.g., SSH/WSL/Remote Codespaces), surface the exact auth URL and instructions to set up `ssh -L 1455:localhost:1455 <host>`, or copy/paste the printed URL to a local browser.

---

### Implementation plan (issue-first, small PRs)

1. Provider wiring (small PR)

    - Add `openAi.authMode` config and read `SecretStorage` for `chatgpt` mode.
    - Fallback to existing text input when `apiKey` mode.

2. UI actions (small PR)

    - Settings provider panel additions (button + status + sign out/refresh/import).
    - Command palette registrations.

3. OAuth helper (medium PR)

    - Local HTTP server utility (127.0.0.1 only), PKCE util (Node crypto), URL opener via VS Code `env.openExternal`.
    - Callback handler: state check, token request, SecretStorage persistence.

4. Token-exchange + storage (medium PR)

    - Implement token-exchange call and store `roo.openai.chatgpt.apiKey`.
    - Plumb errors and show actionable messages.

5. Refresh + best-effort credit redemption (small PR)

    - Background refresh timer + manual “Refresh credentials”.
    - Optional credit redemption endpoint; non-blocking.

6. Import from Codex CLI (small PR)

    - Two pathways:
        1. File import: If `~/.codex/auth.json` exists, parse and import `OPENAI_API_KEY` and tokens to SecretStorage (user confirmation required).
        2. Paste import: Provide a secure paste dialog (multi-line input) where the user can paste the full contents of `auth.json`. Parse in-memory and discard the raw text after success.
    - Validation:
        - JSON parse; require at least one of `OPENAI_API_KEY` or `tokens.access_token` and a `tokens.id_token`.
        - Best-effort JWT shape check (3-part, base64url). Optionally parse claims to populate status.
    - Storage mapping:
        - `OPENAI_API_KEY` → `roo.openai.chatgpt.apiKey` (if present)
        - `tokens.id_token` → `roo.openai.chatgpt.idToken`
        - `tokens.refresh_token` → `roo.openai.chatgpt.refreshToken`
        - `last_refresh` → `roo.openai.chatgpt.lastRefreshIso` (if present)
    - UX:
        - Show a sanitized preview (redact tokens and keys except prefix/suffix) before confirming import.
        - On success, switch `openAi.authMode` to `"chatgpt"` and update status.

7. Tests & docs (small PR)
    - Unit: PKCE, URL build, state validation, JWT claim parsing, SecretStorage I/O.
    - Integration (mocked): code→token, token-exchange, refresh, error paths, and both file + paste import flows (malformed JSON, missing fields, valid JSON).
    - Update docs and screenshots in README/website where needed.

Rollout

- Hide behind feature flag in the first release; expand after telemetry shows stability (opt-in telemetry only, no secrets; redact values).

---

### Security & privacy

- Secrets only in `vscode.SecretStorage`; never log raw tokens or keys.
- Local server binds to loopback only.
- Validate `state`; use PKCE S256.
- Handle errors gracefully; no PII in logs.
- Follow project’s `SECURITY.md` for responsible handling and disclosure.
- Paste import: never write pasted JSON to disk; clear buffers after import; redact in all UI/telemetry.

---

### Community/process compliance

- Open a “Detailed Feature Proposal” issue and link all PRs to it as required by `CONTRIBUTING.md`.
- Keep edits focused, well-tested, and under reviewer size limits; clear user-facing docs.
- Interactions and reviews must follow `CODE_OF_CONDUCT.md`.

---

### Compatibility constraints (drop‑in replacement for Codex CLI)

- Use the exact Codex CLI client id: `app_EMoamEEZ73f0CkXaXp7hrann`.
- Use the same fixed local port: `1455` and the redirect URI `http://localhost:1455/auth/callback`.
- Include the same authorization parameters, notably `id_token_add_organizations=true` and `codex_cli_simplified_flow=true`.
- Perform the same token‑exchange grant to request `openai-api-key`.
- Preserve identical scopes and overall flow semantics; only storage/UX differs (VS Code SecretStorage, Roo UI).

### Risks and mitigations

- If port 1455 is busy, show an actionable error and retry guidance (to remain compatible with Codex semantics). Avoid silently changing the port.
- Users without Platform setup may not receive an API key → provide onboarding CTA and keep API-key mode as fallback.
- Remote/headless dev → print URL and give port-forward instructions.

---

### Milestones (estimates)

- Week 1: Config + UI skeleton + SecretStorage wiring (PRs 1–2).
- Week 2: OAuth helper + token-exchange (PRs 3–4).
- Week 3: Refresh + credit redemption + Codex import + tests (PRs 5–7).
- Week 4: Docs, polish, feature flag rollout.
