# PRP: OpenAI ChatGPT Plus/Pro Authentication - Overview

## Context

This PRP provides the high-level architecture and shared patterns for implementing "Sign in with ChatGPT (Plus/Pro)" authentication for the OpenAI provider. This feature allows users to authenticate using their ChatGPT Plus/Pro accounts instead of manually managing API keys.

## Architecture Overview

### Core Components

1. **Provider Extension** (`openai-chatgpt-auth_backend.md`)

    - Extends OpenAI provider to support dual authentication modes: `"apiKey"` and `"chatgpt"`
    - SecretStorage integration for secure token management
    - OAuth flow implementation with PKCE
    - Token refresh and management

2. **UI Components** (`openai-chatgpt-auth_frontend.md`)
    - Settings panel modifications for OpenAI provider
    - Command palette integration
    - Status display and user feedback
    - Import functionality for Codex CLI compatibility

### Data Model

#### Configuration Settings

```typescript
// Add to openAiSchema in provider-settings.ts
openAiAuthMode: z.union([z.literal("apiKey"), z.literal("chatgpt")])
	.optional()
	.default("apiKey")
```

#### SecretStorage Keys

```typescript
// New secret keys to add to SECRET_STATE_KEYS
"roo.openai.chatgpt.apiKey": string      // Exchanged OpenAI API key
"roo.openai.chatgpt.idToken": string     // OAuth ID token (JWT)
"roo.openai.chatgpt.refreshToken": string // OAuth refresh token
"roo.openai.chatgpt.lastRefreshIso": string // ISO timestamp of last refresh
```

### OAuth Flow Architecture

1. **Local HTTP Server**

    - Binds to `127.0.0.1:1455` (Codex CLI compatibility)
    - Fallback to random port if 1455 is occupied
    - PKCE implementation with S256 challenge method
    - State validation for security

2. **Authorization URL**

    ```
    https://auth.openai.com/oauth/authorize
    - response_type=code
    - client_id=app_EMoamEEZ73f0CkXaXp7hrann
    - redirect_uri=http://localhost:1455/auth/callback
    - scope=openid profile email offline_access
    - code_challenge + code_challenge_method=S256
    - id_token_add_organizations=true
    - codex_cli_simplified_flow=true
    - state=<generated>
    ```

3. **Token Exchange**
    - Exchange authorization code for tokens
    - Use `id_token` to request OpenAI API key via token-exchange
    - Store all tokens securely in VS Code SecretStorage

### File Structure

#### Core Files to Create/Modify

```
src/
├── api/providers/openai.ts                    # Modify: Add authMode support
├── utils/oauth/                               # New: OAuth utilities
│   ├── pkce.ts                               # PKCE implementation
│   ├── server.ts                             # Local HTTP server
│   └── openai-auth.ts                        # OpenAI-specific auth logic
├── core/config/                              # Modify: Extend types
│   └── types.ts                              # Add authMode to settings
webview-ui/src/components/settings/providers/
└── OpenAICompatible.tsx                      # Modify: Add auth mode UI
```

#### New Command IDs

```typescript
// Add to CommandId type in types package
"openaiSignInChatGPT"
"openaiSignOutChatGPT"
"openaiRefreshCredentials"
"openaiImportFromCodex"
```

### Security Considerations

1. **SecretStorage Only**: All sensitive data (tokens, API keys) stored exclusively in VS Code SecretStorage
2. **Localhost Binding**: HTTP server binds only to `127.0.0.1` (not `0.0.0.0`)
3. **State Validation**: OAuth state parameter validation to prevent CSRF
4. **PKCE S256**: Use Proof Key for Code Exchange with SHA256 challenge
5. **Token Rotation**: Implement automatic refresh token rotation
6. **Error Handling**: Graceful degradation with actionable error messages

### Testing Strategy

1. **Unit Tests**

    - PKCE generation and validation
    - URL building and parsing
    - JWT token parsing (basic structure validation)
    - SecretStorage operations (mocked)

2. **Integration Tests**

    - OAuth flow simulation (mocked endpoints)
    - Token exchange and refresh flows
    - Error scenarios and fallback behavior
    - Codex CLI import functionality

3. **Manual Testing**
    - End-to-end OAuth flow
    - Settings UI interactions
    - Command palette functionality
    - Token refresh and expiration handling

### External Dependencies

- **Node.js Built-ins**: `http`, `crypto`, `url`
- **VS Code API**: `vscode.env.openExternal`, `vscode.SecretStorage`
- **Existing Libraries**: `axios` (already used in codebase)

### Implementation Order

1. **Backend Foundation** (`openai-chatgpt-auth_backend.md`)

    - OAuth utilities and HTTP server
    - Provider authentication mode support
    - SecretStorage integration

2. **Frontend Integration** (`openai-chatgpt-auth_frontend.md`)
    - Settings UI modifications
    - Command palette actions
    - Status display and user feedback

### Validation Gates

Each PRP must pass these validation gates before moving to the next:

#### Backend PRP Validation

```bash
# TypeScript compilation
npm run build

# Unit tests
npm test -- --testPathPattern=oauth

# Integration tests
npm test -- --testPathPattern=openai.*auth

# Provider functionality test
npm test -- src/api/providers/__tests__/openai.spec.ts
```

#### Frontend PRP Validation

```bash
# UI component compilation
npm run build

# Component tests
npm test -- --testPathPattern=OpenAI

# E2E settings flow test (manual)
# - Verify auth mode toggle works
# - Verify sign in button appears
# - Verify status display updates
```

## Success Criteria

1. **Drop-in Codex CLI Compatibility**

    - Use identical OAuth parameters and flow
    - Support import from `~/.codex/auth.json`
    - Compatible redirect URI and port

2. **Secure Implementation**

    - No tokens or keys in logs or plaintext storage
    - Proper PKCE and state validation
    - Secure token refresh mechanism

3. **User Experience**

    - Clear authentication status display
    - Actionable error messages
    - Smooth onboarding flow
    - Fallback to API key mode always available

4. **Enterprise Ready**
    - Headless/remote development support (SSH forwarding instructions)
    - Platform onboarding guidance for missing org/project setup
    - Complimentary credit redemption (best-effort)

## Risk Mitigation

1. **Port Conflicts**: If port 1455 is occupied, show actionable error with retry guidance
2. **Network Issues**: Provide SSH port forwarding instructions for remote development
3. **Token Expiry**: Implement automatic refresh with manual refresh fallback
4. **Platform Setup**: Guide users through OpenAI Platform onboarding if needed

This overview serves as the foundation for the detailed implementation PRPs that follow.
