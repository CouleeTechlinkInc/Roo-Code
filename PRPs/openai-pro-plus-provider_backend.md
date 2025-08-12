# PRP: OpenAI (Pro/Plus) Provider - Backend Implementation

## Context

This PRP implements the backend components for the new "OpenAI (Pro/Plus)" provider. This provider extends the existing OpenAI Native handler but restricts authentication to Codex CLI import only, providing a clean separation from the standard OpenAI provider while maintaining full model compatibility.

**Dependencies**: This PRP implements the backend architecture defined in `openai-pro-plus-provider_overview.md`.

## Implementation Details

### File Analysis and Modifications

#### 1. Provider Type Registration

**File**: `/packages/types/src/provider-settings.ts`

**Analysis**: Currently defines all provider types and schemas. Need to add new "openai-pro-plus" provider.

**Implementation**:

```typescript
// Line ~47: Add to providerNames array
export const providerNames = [
	// ... existing providers
	"openai-pro-plus",  // Add this line
] as const

// Line ~203-206: Add new schema after openAiNativeSchema
const openAiProPlusSchema = apiModelIdProviderModelSchema.extend({
	openAiProPlusApiKey: z.string().optional(),
	openAiProPlusBaseUrl: z.string().optional(),
	// Reuse ChatGPT auth fields for Codex CLI import
	openAiChatGptApiKey: z.string().optional(),
	openAiChatGptIdToken: z.string().optional(),
	openAiChatGptRefreshToken: z.string().optional(),
	openAiChatGptLastRefresh: z.string().optional(),
})

// Line ~328: Add to discriminated union after sambanova
openAiProPlusSchema.merge(z.object({ apiProvider: z.literal("openai-pro-plus") })),

// Line ~365: Add to merged schema
...openAiProPlusSchema.shape,
```

#### 2. Handler Implementation

**File**: `/src/api/providers/openai-pro-plus.ts` (NEW)

**Implementation**:

```typescript
import { Anthropic } from "@anthropic-ai/sdk"
import type { ApiHandlerOptions } from "../../shared/api"
import type { ModelInfo } from "@roo-code/types"
import { OpenAiNativeHandler } from "./openai-native"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"

/**
 * OpenAI Pro/Plus Provider Handler
 *
 * This handler extends OpenAiNativeHandler but restricts authentication to
 * Codex CLI import only. It provides identical functionality to the native
 * OpenAI provider but with enforced ChatGPT authentication mode.
 */
export class OpenAiProPlusHandler extends OpenAiNativeHandler implements SingleCompletionHandler {
	constructor(options: ApiHandlerOptions) {
		// Transform Pro/Plus specific options to OpenAI Native format
		const transformedOptions: ApiHandlerOptions = {
			...options,
			// Force ChatGPT authentication mode
			openAiAuthMode: "chatgpt",
			// Map Pro/Plus settings to native OpenAI settings
			openAiNativeApiKey: options.openAiChatGptApiKey,
			openAiNativeBaseUrl: options.openAiProPlusBaseUrl || "https://api.openai.com",
			// Preserve ChatGPT auth tokens
			openAiChatGptApiKey: options.openAiChatGptApiKey,
			openAiChatGptIdToken: options.openAiChatGptIdToken,
			openAiChatGptRefreshToken: options.openAiChatGptRefreshToken,
			openAiChatGptLastRefresh: options.openAiChatGptLastRefresh,
		}

		super(transformedOptions)
	}

	/**
	 * Validates that the provider has valid authentication
	 * @returns true if ChatGPT tokens are present
	 */
	public hasValidAuthentication(): boolean {
		return !!(
			this.options.openAiChatGptApiKey ||
			(this.options.openAiChatGptIdToken && this.options.openAiChatGptRefreshToken)
		)
	}

	/**
	 * Gets the authentication status for UI display
	 * @returns object with status and details
	 */
	public getAuthenticationStatus(): {
		isAuthenticated: boolean
		hasApiKey: boolean
		hasTokens: boolean
		lastRefresh?: string
	} {
		const hasApiKey = !!this.options.openAiChatGptApiKey
		const hasTokens = !!(this.options.openAiChatGptIdToken && this.options.openAiChatGptRefreshToken)

		return {
			isAuthenticated: hasApiKey || hasTokens,
			hasApiKey,
			hasTokens,
			lastRefresh: this.options.openAiChatGptLastRefresh,
		}
	}

	/**
	 * Override to provide Pro/Plus specific error messaging
	 */
	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	) {
		// Validate authentication before proceeding
		if (!this.hasValidAuthentication()) {
			throw new Error(
				"OpenAI (Pro/Plus) provider requires authentication via Codex CLI import. " +
					"Please use 'Import from Codex CLI' to authenticate.",
			)
		}

		// Delegate to parent implementation
		yield* super.createMessage(systemPrompt, messages, metadata)
	}

	/**
	 * Override to provide Pro/Plus specific error messaging
	 */
	override async completePrompt(prompt: string): Promise<string> {
		if (!this.hasValidAuthentication()) {
			throw new Error(
				"OpenAI (Pro/Plus) provider requires authentication via Codex CLI import. " +
					"Please use 'Import from Codex CLI' to authenticate.",
			)
		}

		return super.completePrompt(prompt)
	}
}
```

#### 3. Handler Registration

**File**: `/src/api/providers/index.ts`

**Current**: Exports all handler classes
**Modification**: Add export for new handler

```typescript
// Add to exports
export { OpenAiProPlusHandler } from "./openai-pro-plus"
```

**File**: `/src/api/index.ts`

**Current**: `buildApiHandler()` function with switch statement (lines 81-147)
**Modification**: Add case for openai-pro-plus

```typescript
// Add after line 105 (openai-native case)
case "openai-pro-plus":
	return new OpenAiProPlusHandler(options)
```

**Import Addition**: Add to imports at top

```typescript
import {
	// ... existing imports
	OpenAiProPlusHandler, // Add this
} from "./providers"
```

#### 4. Codex CLI Import Extension

**File**: `/src/core/webview/ClineProvider.ts`

**Analysis**: Existing `handleCodexImport()` method handles OpenAI provider. Need to extend for Pro/Plus.

**Implementation**: Add new method after existing `handleCodexImport()` method

```typescript
/**
 * Handle Codex CLI import specifically for OpenAI Pro/Plus provider
 */
async handleCodexImportProPlus(): Promise<void> {
	try {
		// Reuse existing import logic but target Pro/Plus settings
		const importMethod = await vscode.window.showQuickPick(
			[
				{ label: "Import from file", value: "file", description: "Read from ~/.codex/auth.json" },
				{ label: "Paste auth.json content", value: "paste", description: "Paste the content directly" },
			],
			{
				placeHolder: "How would you like to import Codex CLI credentials for OpenAI (Pro/Plus)?",
				ignoreFocusOut: true,
			},
		)
		if (!importMethod) return

		let authData: any
		if (importMethod.value === "file") {
			authData = await this.importFromCodexFile()
		} else {
			authData = await this.importFromCodexPaste()
		}

		if (!authData) return

		// Update Pro/Plus specific settings
		const currentConfig = this.context.getValue<ProviderSettings>("apiConfiguration") || {}
		const updatedConfig: ProviderSettings = {
			...currentConfig,
			apiProvider: "openai-pro-plus",
			// Map to Pro/Plus specific fields
			openAiChatGptApiKey: authData.api_key,
			openAiChatGptIdToken: authData.id_token,
			openAiChatGptRefreshToken: authData.refresh_token,
			openAiChatGptLastRefresh: new Date().toISOString(),
		}

		await this.context.setValue("apiConfiguration", updatedConfig)

		// Notify UI of completion
		this.getWebviewPanel()?.webview.postMessage({
			type: "openaiProPlusImportFromCodexComplete",
		})

		vscode.window.showInformationMessage(
			"Successfully imported Codex CLI credentials for OpenAI (Pro/Plus) provider"
		)
	} catch (error) {
		vscode.window.showErrorMessage(
			`Failed to import Codex CLI credentials for OpenAI (Pro/Plus): ${error instanceof Error ? error.message : "Unknown error"}`,
		)
	}
}
```

#### 5. Message Handler Extension

**File**: `/src/core/webview/webviewMessageHandler.ts`

**Analysis**: Handles webview messages including existing `openaiImportFromCodex`

**Implementation**: Add new case in switch statement (around line 640)

```typescript
case "openaiProPlusImportFromCodex": {
	await provider.handleCodexImportProPlus()
	break
}
```

#### 6. Message Type Definition

**File**: `/src/shared/WebviewMessage.ts`

**Analysis**: Defines message types for webview communication

**Implementation**: Add to message type union

```typescript
// Add to WebviewMessage type
| { type: "openaiProPlusImportFromCodex" }
| { type: "openaiProPlusImportFromCodexComplete" }
```

### Token Validation Implementation

#### Additional Method for Handler

Add to `OpenAiProPlusHandler` class:

```typescript
/**
 * Validates current tokens by making a test API call
 * @returns Promise resolving to validation result
 */
public async validateTokens(): Promise<{
	isValid: boolean
	error?: string
	needsRefresh?: boolean
}> {
	try {
		if (!this.hasValidAuthentication()) {
			return { isValid: false, error: "No authentication credentials available" }
		}

		// Make a minimal API call to validate credentials
		const testResponse = await this.client.models.list()

		return { isValid: true }
	} catch (error: any) {
		// Check for specific error types
		if (error?.status === 401) {
			return {
				isValid: false,
				error: "Invalid credentials",
				needsRefresh: true
			}
		}
		if (error?.status === 403) {
			return {
				isValid: false,
				error: "Access denied - check subscription status"
			}
		}

		return {
			isValid: false,
			error: error.message || "Token validation failed"
		}
	}
}
```

### Testing Implementation

#### Unit Test File

**File**: `/src/api/providers/__tests__/openai-pro-plus.spec.ts` (NEW)

```typescript
import { OpenAiProPlusHandler } from "../openai-pro-plus"
import type { ApiHandlerOptions } from "../../../shared/api"

describe("OpenAiProPlusHandler", () => {
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockOptions = {
			openAiChatGptApiKey: "test-api-key",
			openAiChatGptIdToken: "test-id-token",
			openAiChatGptRefreshToken: "test-refresh-token",
			openAiChatGptLastRefresh: "2024-01-01T00:00:00.000Z",
		}
	})

	describe("constructor", () => {
		it("should force chatgpt auth mode", () => {
			const handler = new OpenAiProPlusHandler(mockOptions)
			expect(handler.options.openAiAuthMode).toBe("chatgpt")
		})

		it("should map Pro/Plus settings to native settings", () => {
			const handler = new OpenAiProPlusHandler({
				...mockOptions,
				openAiProPlusBaseUrl: "https://custom.openai.com",
			})

			expect(handler.options.openAiNativeApiKey).toBe("test-api-key")
			expect(handler.options.openAiNativeBaseUrl).toBe("https://custom.openai.com")
		})
	})

	describe("hasValidAuthentication", () => {
		it("should return true with API key", () => {
			const handler = new OpenAiProPlusHandler(mockOptions)
			expect(handler.hasValidAuthentication()).toBe(true)
		})

		it("should return true with tokens", () => {
			const handler = new OpenAiProPlusHandler({
				openAiChatGptIdToken: "id-token",
				openAiChatGptRefreshToken: "refresh-token",
			})
			expect(handler.hasValidAuthentication()).toBe(true)
		})

		it("should return false without credentials", () => {
			const handler = new OpenAiProPlusHandler({})
			expect(handler.hasValidAuthentication()).toBe(false)
		})
	})

	describe("getAuthenticationStatus", () => {
		it("should return correct status with all credentials", () => {
			const handler = new OpenAiProPlusHandler(mockOptions)
			const status = handler.getAuthenticationStatus()

			expect(status.isAuthenticated).toBe(true)
			expect(status.hasApiKey).toBe(true)
			expect(status.hasTokens).toBe(true)
			expect(status.lastRefresh).toBe("2024-01-01T00:00:00.000Z")
		})
	})

	describe("createMessage", () => {
		it("should throw error without authentication", async () => {
			const handler = new OpenAiProPlusHandler({})

			const generator = handler.createMessage("test", [])
			await expect(generator.next()).rejects.toThrow(
				"OpenAI (Pro/Plus) provider requires authentication via Codex CLI import",
			)
		})
	})

	describe("getModel", () => {
		it("should return same models as OpenAI Native", () => {
			const handler = new OpenAiProPlusHandler(mockOptions)
			const model = handler.getModel()

			// Should use OpenAI Native models
			expect(model.id).toBeDefined()
			expect(model.info).toBeDefined()
		})
	})
})
```

## Implementation Tasks (Order of Execution)

### Task 1: Type System Updates

1. Add "openai-pro-plus" to `providerNames` in `/packages/types/src/provider-settings.ts`
2. Create `openAiProPlusSchema` with required fields
3. Add to discriminated union and merged schema
4. Update `MODEL_ID_KEYS` if needed

### Task 2: Handler Implementation

1. Create `/src/api/providers/openai-pro-plus.ts`
2. Implement `OpenAiProPlusHandler` class extending `OpenAiNativeHandler`
3. Add authentication validation methods
4. Add token validation functionality

### Task 3: Handler Registration

1. Export handler in `/src/api/providers/index.ts`
2. Add import and case in `/src/api/index.ts`
3. Test handler instantiation

### Task 4: Codex CLI Extension

1. Add `handleCodexImportProPlus()` method to `ClineProvider`
2. Add message handler case in `webviewMessageHandler.ts`
3. Add message type definitions in `WebviewMessage.ts`

### Task 5: Testing

1. Create unit test file for handler
2. Add integration tests for Codex CLI import
3. Test authentication validation

### Task 6: Validation

1. Run TypeScript compilation
2. Execute unit tests
3. Test provider instantiation
4. Validate message handling

## Validation Gates

### TypeScript Compilation

```bash
# Core compilation
npm run build

# Type checking without emit
npx tsc --noEmit
```

### Unit Testing

```bash
# Provider tests
npm test -- src/api/providers/__tests__/openai-pro-plus.spec.ts

# Handler registration tests
npm test -- src/api/__tests__/index.spec.ts

# Message handling tests
npm test -- src/core/webview/__tests__/webviewMessageHandler.spec.ts
```

### Integration Testing

```bash
# Provider functionality
npm test -- --testPathPattern="openai.*pro.*plus"

# Codex CLI import tests
npm test -- --testPathPattern="codex.*import"
```

### Manual Validation

1. Provider appears in buildApiHandler switch
2. Handler instantiates without errors
3. Authentication validation works correctly
4. Token validation returns expected results
5. Codex CLI import message routing works

## Success Criteria

### Functional Requirements

1. ✅ New "openai-pro-plus" provider type registered
2. ✅ Handler extends OpenAiNativeHandler correctly
3. ✅ Only ChatGPT authentication mode supported
4. ✅ Same models available as openai-native provider
5. ✅ Codex CLI import works for Pro/Plus provider
6. ✅ Token validation provides status feedback

### Technical Requirements

1. ✅ Type-safe provider definition
2. ✅ Clean inheritance from existing handler
3. ✅ Proper error messaging for authentication
4. ✅ Message handling for Pro/Plus import
5. ✅ Unit test coverage >90%

### Code Quality

1. ✅ Consistent with existing provider patterns
2. ✅ Proper error handling and messaging
3. ✅ Clean separation from regular OpenAI provider
4. ✅ Well-documented public methods

This backend implementation provides the foundation for the frontend PRP while maintaining clean architecture and maximum code reuse.
