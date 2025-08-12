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
			const testResponse = await (this as any).client.models.list()

			return { isValid: true }
		} catch (error: any) {
			// Check for specific error types
			if (error?.status === 401) {
				return {
					isValid: false,
					error: "Invalid credentials",
					needsRefresh: true,
				}
			}
			if (error?.status === 403) {
				return {
					isValid: false,
					error: "Access denied - check subscription status",
				}
			}

			return {
				isValid: false,
				error: error.message || "Token validation failed",
			}
		}
	}
}
