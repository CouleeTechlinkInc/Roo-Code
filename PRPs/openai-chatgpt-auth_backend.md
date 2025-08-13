# PRP: OpenAI ChatGPT Plus/Pro Authentication - Backend Implementation

## Context

This PRP implements the backend infrastructure for OpenAI ChatGPT Plus/Pro authentication, including OAuth flow, SecretStorage integration, and provider authentication mode support. This PRP builds upon the architecture defined in `openai-chatgpt-auth_overview.md`.

## Scope

### In Scope

- OAuth utilities (PKCE, HTTP server, token exchange)
- OpenAI provider authentication mode support
- SecretStorage integration for secure token management
- Command registration for authentication actions
- Token refresh and rotation logic
- Codex CLI import functionality
- Headless development support

### Out of Scope

- UI components (handled in `openai-chatgpt-auth_frontend.md`)
- Visual status indicators
- Settings panel modifications

## Implementation Tasks

### 1. OAuth Infrastructure

#### 1.1 PKCE Utilities (`src/utils/oauth/pkce.ts`)

**Requirements:**

- Generate cryptographically secure code verifier (43-128 chars, URL-safe)
- Create SHA256 code challenge from verifier
- Match Codex CLI implementation exactly

**Implementation:**

```typescript
import { randomBytes, createHash } from "crypto"

export interface PKCEChallenge {
	codeVerifier: string
	codeChallenge: string
	codeChallengeMethod: "S256"
}

export function generatePKCEChallenge(): PKCEChallenge {
	// Generate cryptographically secure random string
	const codeVerifier = randomBytes(32).toString("base64url").slice(0, 43) // Ensure exactly 43 characters

	// Create SHA256 hash and encode as base64url
	const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url")

	return {
		codeVerifier,
		codeChallenge,
		codeChallengeMethod: "S256",
	}
}

export function generateState(): string {
	return randomBytes(16).toString("hex")
}
```

**Testing:**

- Verify code verifier length and character set
- Verify SHA256 challenge generation
- Test multiple generation calls for uniqueness
- Validate base64url encoding (no padding, URL-safe chars)

#### 1.2 Local HTTP Server (`src/utils/oauth/server.ts`)

**Requirements:**

- Bind to `127.0.0.1:1455` (Codex CLI compatibility)
- Handle single OAuth callback request
- Return success page and close server
- Support custom callback handling
- Provide SSH forwarding instructions for remote development

**Implementation:**

```typescript
import * as http from "http"
import * as url from "url"
import { EventEmitter } from "events"

export interface OAuthServerOptions {
	port?: number
	timeout?: number
}

export interface OAuthCallback {
	code?: string
	state?: string
	error?: string
	error_description?: string
}

export class OAuthServer extends EventEmitter {
	private server?: http.Server
	private options: Required<OAuthServerOptions>

	constructor(options: OAuthServerOptions = {}) {
		super()
		this.options = {
			port: options.port ?? 1455,
			timeout: options.timeout ?? 300000, // 5 minutes
		}
	}

	async start(): Promise<number> {
		return new Promise((resolve, reject) => {
			this.server = http.createServer(this.handleRequest.bind(this))

			this.server.on("error", (err: NodeJS.ErrnoException) => {
				if (err.code === "EADDRINUSE") {
					reject(
						new Error(
							`Port ${this.options.port} is already in use. To use this feature with remote development, run: ssh -L ${this.options.port}:localhost:${this.options.port} <your-remote-host>`,
						),
					)
				} else {
					reject(err)
				}
			})

			this.server.listen(this.options.port, "127.0.0.1", () => {
				resolve(this.options.port)
			})

			// Auto-close after timeout
			setTimeout(() => {
				this.close()
				this.emit("timeout")
			}, this.options.timeout)
		})
	}

	private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
		if (req.url && req.url.startsWith("/auth/callback")) {
			const parsedUrl = url.parse(req.url, true)
			const callback: OAuthCallback = {
				code: parsedUrl.query.code as string,
				state: parsedUrl.query.state as string,
				error: parsedUrl.query.error as string,
				error_description: parsedUrl.query.error_description as string,
			}

			// Send success page
			res.writeHead(200, { "Content-Type": "text/html" })
			res.end(this.getSuccessPage())

			// Emit callback and close server
			this.emit("callback", callback)
			setTimeout(() => this.close(), 1000)
		} else {
			res.writeHead(404)
			res.end("Not Found")
		}
	}

	private getSuccessPage(): string {
		return `
<!DOCTYPE html>
<html>
<head>
  <title>Roo Code - Authentication Success</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 50px; }
    .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
    .message { color: #6c757d; }
  </style>
</head>
<body>
  <div class="success">✓ Authentication Successful</div>
  <div class="message">You can close this tab and return to VS Code.</div>
</body>
</html>
    `
	}

	close() {
		if (this.server) {
			this.server.close()
			this.server = undefined
		}
	}
}
```

**Testing:**

- Test server startup on port 1455
- Test port conflict handling and error messages
- Test callback request parsing
- Test timeout behavior
- Test SSH forwarding instruction generation

#### 1.3 OpenAI Authentication (`src/utils/oauth/openai-auth.ts`)

**Requirements:**

- Build authorization URL with exact Codex CLI parameters
- Handle token exchange for authorization code
- Perform token-to-API-key exchange using id_token
- Handle token refresh flow
- Support complimentary credit redemption (best-effort)

**Implementation:**

```typescript
import axios from "axios"
import * as vscode from "vscode"
import { PKCEChallenge } from "./pkce"

export interface OpenAIAuthConfig {
	clientId: string
	redirectUri: string
	scopes: string[]
}

export interface OpenAITokens {
	access_token: string
	refresh_token: string
	id_token: string
	token_type: string
	expires_in: number
}

export interface OpenAICredentials {
	apiKey: string
	tokens: OpenAITokens
	lastRefresh: string
}

export class OpenAIAuth {
	private static readonly CONFIG: OpenAIAuthConfig = {
		clientId: "app_EMoamEEZ73f0CkXaXp7hrann", // Codex CLI client ID
		redirectUri: "http://localhost:1455/auth/callback",
		scopes: ["openid", "profile", "email", "offline_access"],
	}

	static buildAuthUrl(challenge: PKCEChallenge, state: string, port: number = 1455): string {
		const redirectUri = `http://localhost:${port}/auth/callback`
		const params = new URLSearchParams({
			response_type: "code",
			client_id: this.CONFIG.clientId,
			redirect_uri: redirectUri,
			scope: this.CONFIG.scopes.join(" "),
			code_challenge: challenge.codeChallenge,
			code_challenge_method: challenge.codeChallengeMethod,
			state,
			id_token_add_organizations: "true",
			codex_cli_simplified_flow: "true",
		})

		return `https://auth.openai.com/oauth/authorize?${params.toString()}`
	}

	static async exchangeCodeForTokens(code: string, codeVerifier: string, redirectUri: string): Promise<OpenAITokens> {
		const response = await axios.post(
			"https://auth.openai.com/oauth/token",
			{
				grant_type: "authorization_code",
				client_id: this.CONFIG.clientId,
				code,
				redirect_uri: redirectUri,
				code_verifier: codeVerifier,
			},
			{
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
			},
		)

		if (!response.data.access_token) {
			throw new Error("Failed to exchange code for tokens")
		}

		return response.data
	}

	static async exchangeTokenForApiKey(idToken: string, clientId?: string): Promise<string> {
		const response = await axios.post(
			"https://auth.openai.com/oauth/token",
			{
				grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
				requested_token_type: "openai-api-key",
				subject_token: idToken,
				subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
				client_id: clientId || "roo-code", // Use Roo Code client ID
			},
			{
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
			},
		)

		if (!response.data.access_token) {
			throw new Error(
				"Failed to exchange token for API key. You may need to complete OpenAI Platform onboarding at https://platform.openai.com/",
			)
		}

		return response.data.access_token
	}

	static async refreshTokens(refreshToken: string): Promise<OpenAITokens> {
		const response = await axios.post(
			"https://auth.openai.com/oauth/token",
			{
				grant_type: "refresh_token",
				client_id: this.CONFIG.clientId,
				refresh_token: refreshToken,
			},
			{
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
			},
		)

		if (!response.data.access_token) {
			throw new Error("Failed to refresh tokens")
		}

		return response.data
	}

	static async redeemCredits(idToken: string): Promise<void> {
		try {
			await axios.post(
				"https://api.openai.com/v1/billing/redeem_credits",
				{},
				{
					headers: {
						Authorization: `Bearer ${idToken}`,
						"Content-Type": "application/json",
					},
				},
			)
		} catch (error) {
			// Best-effort only - log but don't throw
			console.warn("Credit redemption failed (non-blocking):", error)
		}
	}
}
```

**Testing:**

- Test authorization URL generation with correct parameters
- Test token exchange flow (mocked)
- Test API key exchange (mocked)
- Test token refresh flow (mocked)
- Test credit redemption (mocked, verify non-throwing)

### 2. Provider Authentication Mode Support

#### 2.1 Extend Provider Settings Types (`packages/types/src/provider-settings.ts`)

**Requirements:**

- Add `openAiAuthMode` to OpenAI provider schema
- Add new secret storage keys for ChatGPT auth tokens
- Maintain backward compatibility

**Implementation:**

```typescript
// Add to openAiSchema
const openAiSchema = baseProviderSettingsSchema.extend({
	// ... existing fields
	openAiAuthMode: z
		.union([z.literal("apiKey"), z.literal("chatgpt")])
		.optional()
		.default("apiKey"),
	// ... rest of existing fields
})
```

**Update SECRET_STATE_KEYS:**

```typescript
export const SECRET_STATE_KEYS = [
	// ... existing keys
	"openAiChatGptApiKey", // roo.openai.chatgpt.apiKey
	"openAiChatGptIdToken", // roo.openai.chatgpt.idToken
	"openAiChatGptRefreshToken", // roo.openai.chatgpt.refreshToken
	"openAiChatGptLastRefresh", // roo.openai.chatgpt.lastRefreshIso
] as const satisfies readonly (keyof ProviderSettings)[]
```

#### 2.2 Modify OpenAI Provider (`src/api/providers/openai.ts`)

**Requirements:**

- Support dual authentication modes
- Read from SecretStorage when `authMode === "chatgpt"`
- Maintain existing API key behavior
- No changes to request logic - just change how API key is obtained

**Implementation:**

```typescript
// Add to OpenAiHandler constructor
constructor(options: ApiHandlerOptions) {
  super()
  this.options = options

  const baseURL = this.options.openAiBaseUrl ?? "https://api.openai.com/v1"

  // Determine API key based on auth mode
  let apiKey: string
  if (this.options.openAiAuthMode === "chatgpt") {
    // In actual implementation, this would come from context.secrets
    // For now, use the existing pattern but read from the ChatGPT-specific key
    apiKey = this.options.openAiChatGptApiKey ?? "not-provided"
  } else {
    // Default to standard API key mode
    apiKey = this.options.openAiApiKey ?? "not-provided"
  }

  // Rest of constructor logic unchanged...
}
```

**Note:** The actual SecretStorage reading will happen at a higher level in the provider resolution, similar to how other secrets are handled in the codebase.

### 3. Command Registration

#### 3.1 Add Command IDs (`packages/types/src/command.ts`)

**Requirements:**

- Add new command IDs for ChatGPT authentication actions
- Follow existing naming conventions

**Implementation:**

```typescript
// Add to CommandId type
export type CommandId =
	// ... existing commands
	"openaiSignInChatGPT" | "openaiSignOutChatGPT" | "openaiRefreshCredentials" | "openaiImportFromCodex"
// ... rest
```

#### 3.2 Register Commands (`src/activate/registerCommands.ts`)

**Requirements:**

- Register OAuth flow commands
- Handle sign-in/sign-out actions
- Support credential refresh
- Implement Codex CLI import

**Implementation:**

```typescript
// Add to getCommandsMap function
const getCommandsMap = ({ context, outputChannel, provider }: RegisterCommandOptions): Record<CommandId, any> => ({
	// ... existing commands

	openaiSignInChatGPT: async () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) return

		await visibleProvider.handleOpenAISignIn()
	},

	openaiSignOutChatGPT: async () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) return

		await visibleProvider.handleOpenAISignOut()
	},

	openaiRefreshCredentials: async () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) return

		await visibleProvider.handleOpenAIRefresh()
	},

	openaiImportFromCodex: async () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) return

		await visibleProvider.handleCodexImport()
	},

	// ... rest of commands
})
```

#### 3.3 Implement OAuth Handlers (`src/core/webview/ClineProvider.ts`)

**Requirements:**

- Implement OAuth sign-in flow
- Handle sign-out (clear SecretStorage)
- Support token refresh
- Import from Codex CLI auth.json

**Implementation:**

```typescript
// Add OAuth methods to ClineProvider class

async handleOpenAISignIn(): Promise<void> {
  try {
    const { generatePKCEChallenge, generateState } = await import('../../utils/oauth/pkce')
    const { OAuthServer } = await import('../../utils/oauth/server')
    const { OpenAIAuth } = await import('../../utils/oauth/openai-auth')

    // Generate PKCE challenge and state
    const challenge = generatePKCEChallenge()
    const state = generateState()

    // Start local server
    const server = new OAuthServer({ port: 1455 })
    const port = await server.start()

    // Build auth URL and open browser
    const authUrl = OpenAIAuth.buildAuthUrl(challenge, state, port)
    await vscode.env.openExternal(vscode.Uri.parse(authUrl))

    // Wait for callback
    const callback = await new Promise<any>((resolve, reject) => {
      server.on('callback', resolve)
      server.on('timeout', () => reject(new Error('Authentication timeout')))
    })

    // Validate state
    if (callback.state !== state) {
      throw new Error('Invalid OAuth state - possible CSRF attack')
    }

    if (callback.error) {
      throw new Error(`OAuth error: ${callback.error_description || callback.error}`)
    }

    if (!callback.code) {
      throw new Error('No authorization code received')
    }

    // Exchange code for tokens
    const tokens = await OpenAIAuth.exchangeCodeForTokens(
      callback.code,
      challenge.codeVerifier,
      `http://localhost:${port}/auth/callback`
    )

    // Exchange ID token for API key
    const apiKey = await OpenAIAuth.exchangeTokenForApiKey(tokens.id_token)

    // Store in SecretStorage
    await this.context.secrets.store('openAiChatGptApiKey', apiKey)
    await this.context.secrets.store('openAiChatGptIdToken', tokens.id_token)
    await this.context.secrets.store('openAiChatGptRefreshToken', tokens.refresh_token)
    await this.context.secrets.store('openAiChatGptLastRefresh', new Date().toISOString())

    // Switch to chatgpt auth mode
    const { apiConfiguration, currentApiConfigName } = await this.getState()
    const newConfiguration: ProviderSettings = {
      ...apiConfiguration,
      openAiAuthMode: "chatgpt"
    }

    await this.upsertProviderProfile(currentApiConfigName, newConfiguration)

    // Best-effort credit redemption
    await OpenAIAuth.redeemCredits(tokens.id_token)

    // Update UI
    this.postMessageToWebview({
      type: "action",
      action: "openAIAuthSuccess"
    })

  } catch (error) {
    console.error('OpenAI sign-in failed:', error)

    // Show user-friendly error
    vscode.window.showErrorMessage(
      `OpenAI sign-in failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

async handleOpenAISignOut(): Promise<void> {
  try {
    // Clear all ChatGPT auth secrets
    await this.context.secrets.delete('openAiChatGptApiKey')
    await this.context.secrets.delete('openAiChatGptIdToken')
    await this.context.secrets.delete('openAiChatGptRefreshToken')
    await this.context.secrets.delete('openAiChatGptLastRefresh')

    // Switch back to API key mode
    const { apiConfiguration, currentApiConfigName } = await this.getState()
    const newConfiguration: ProviderSettings = {
      ...apiConfiguration,
      openAiAuthMode: "apiKey"
    }

    await this.upsertProviderProfile(currentApiConfigName, newConfiguration)

    // Update UI
    this.postMessageToWebview({
      type: "action",
      action: "openAISignOutSuccess"
    })

    vscode.window.showInformationMessage('Signed out of ChatGPT successfully')

  } catch (error) {
    console.error('OpenAI sign-out failed:', error)
    vscode.window.showErrorMessage('Failed to sign out of ChatGPT')
  }
}

async handleOpenAIRefresh(): Promise<void> {
  try {
    const refreshToken = await this.context.secrets.get('openAiChatGptRefreshToken')
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    const { OpenAIAuth } = await import('../../utils/oauth/openai-auth')

    // Refresh tokens
    const tokens = await OpenAIAuth.refreshTokens(refreshToken)

    // Exchange new ID token for API key
    const apiKey = await OpenAIAuth.exchangeTokenForApiKey(tokens.id_token)

    // Update SecretStorage
    await this.context.secrets.store('openAiChatGptApiKey', apiKey)
    await this.context.secrets.store('openAiChatGptIdToken', tokens.id_token)
    await this.context.secrets.store('openAiChatGptRefreshToken', tokens.refresh_token)
    await this.context.secrets.store('openAiChatGptLastRefresh', new Date().toISOString())

    vscode.window.showInformationMessage('OpenAI credentials refreshed successfully')

  } catch (error) {
    console.error('OpenAI refresh failed:', error)
    vscode.window.showErrorMessage(
      `Failed to refresh OpenAI credentials: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
```

### 4. Codex CLI Import Functionality

#### 4.1 Import Handler (`src/core/webview/ClineProvider.ts`)

**Requirements:**

- Read from `~/.codex/auth.json` if it exists
- Support paste import with JSON validation
- Sanitized preview before confirmation
- Secure handling (no disk writes of pasted content)

**Implementation:**

```typescript
async handleCodexImport(): Promise<void> {
  try {
    // Offer both file import and paste import
    const importMethod = await vscode.window.showQuickPick([
      { label: 'Import from file', value: 'file' },
      { label: 'Paste auth.json content', value: 'paste' }
    ], { placeHolder: 'How would you like to import Codex CLI credentials?' })

    if (!importMethod) return

    let authData: any

    if (importMethod.value === 'file') {
      authData = await this.importFromCodexFile()
    } else {
      authData = await this.importFromCodexPaste()
    }

    if (authData) {
      await this.processCodexImport(authData)
    }

  } catch (error) {
    console.error('Codex import failed:', error)
    vscode.window.showErrorMessage(
      `Codex import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

private async importFromCodexFile(): Promise<any> {
  const os = await import('os')
  const fs = await import('fs/promises')
  const path = await import('path')

  const codexPath = path.join(os.homedir(), '.codex', 'auth.json')

  try {
    const content = await fs.readFile(codexPath, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      throw new Error('Codex auth.json not found at ~/.codex/auth.json')
    }
    throw new Error('Failed to read Codex auth.json file')
  }
}

private async importFromCodexPaste(): Promise<any> {
  const content = await vscode.window.showInputBox({
    prompt: 'Paste the contents of your Codex auth.json file',
    placeHolder: '{ "OPENAI_API_KEY": "sk-...", "tokens": { ... } }',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value.trim()) return null

      try {
        JSON.parse(value)
        return null
      } catch {
        return 'Invalid JSON format'
      }
    }
  })

  if (!content) return null

  try {
    return JSON.parse(content)
  } catch {
    throw new Error('Invalid JSON content')
  }
}

private async processCodexImport(authData: any): Promise<void> {
  // Validate structure
  if (!authData.OPENAI_API_KEY && !authData.tokens?.id_token) {
    throw new Error('Invalid auth.json: missing OPENAI_API_KEY or tokens.id_token')
  }

  // Show sanitized preview
  const preview = {
    OPENAI_API_KEY: authData.OPENAI_API_KEY ?
      `sk-...${authData.OPENAI_API_KEY.slice(-4)}` : 'not present',
    'tokens.id_token': authData.tokens?.id_token ?
      `${authData.tokens.id_token.slice(0, 20)}...` : 'not present',
    'tokens.refresh_token': authData.tokens?.refresh_token ? 'present' : 'not present'
  }

  const confirm = await vscode.window.showInformationMessage(
    `Import the following credentials?\n\n${JSON.stringify(preview, null, 2)}`,
    'Import', 'Cancel'
  )

  if (confirm !== 'Import') return

  // Store credentials
  if (authData.OPENAI_API_KEY) {
    await this.context.secrets.store('openAiChatGptApiKey', authData.OPENAI_API_KEY)
  }

  if (authData.tokens?.id_token) {
    await this.context.secrets.store('openAiChatGptIdToken', authData.tokens.id_token)
  }

  if (authData.tokens?.refresh_token) {
    await this.context.secrets.store('openAiChatGptRefreshToken', authData.tokens.refresh_token)
  }

  await this.context.secrets.store('openAiChatGptLastRefresh', new Date().toISOString())

  // Switch to ChatGPT auth mode
  const { apiConfiguration, currentApiConfigName } = await this.getState()
  const newConfiguration: ProviderSettings = {
    ...apiConfiguration,
    openAiAuthMode: "chatgpt"
  }

  await this.upsertProviderProfile(currentApiConfigName, newConfiguration)

  vscode.window.showInformationMessage('Codex CLI credentials imported successfully')
}
```

## Validation Gates

### Unit Tests

```bash
# OAuth utilities
npm test -- src/utils/oauth/__tests__/

# Provider authentication
npm test -- src/api/providers/__tests__/openai.spec.ts

# Command registration
npm test -- src/activate/__tests__/registerCommands.spec.ts
```

### Integration Tests

```bash
# Full OAuth flow (mocked)
npm test -- src/core/webview/__tests__/oauth-flow.spec.ts

# Codex import functionality
npm test -- src/core/webview/__tests__/codex-import.spec.ts

# Token refresh logic
npm test -- src/core/webview/__tests__/token-refresh.spec.ts
```

### Manual Testing

1. Verify OAuth flow opens browser correctly
2. Test port conflict handling and error messages
3. Verify token storage in SecretStorage
4. Test authentication mode switching
5. Verify Codex CLI import (both file and paste)

## Risk Mitigation

1. **Port Conflicts**: Clear error messages with SSH forwarding instructions
2. **Network Issues**: Timeout handling and retry mechanisms
3. **Token Security**: All secrets in SecretStorage, no logging of sensitive data
4. **Error Recovery**: Graceful fallback to API key mode
5. **Validation**: Robust input validation and sanitization

## Success Criteria

1. **OAuth Flow**: Complete sign-in flow with proper PKCE and state validation
2. **Token Management**: Secure storage and refresh of all tokens
3. **Provider Integration**: Seamless API key resolution from ChatGPT auth
4. **Command Integration**: All authentication commands working correctly
5. **Codex Compatibility**: Successful import from Codex CLI auth.json
6. **Security**: No sensitive data leakage in logs or storage

## Dependencies

- VS Code API (secrets, commands, external browser)
- Node.js built-ins (http, crypto, fs)
- Existing axios for HTTP requests
- Existing provider and settings infrastructure

This backend PRP provides the foundation for the frontend UI components defined in `openai-chatgpt-auth_frontend.md`.
