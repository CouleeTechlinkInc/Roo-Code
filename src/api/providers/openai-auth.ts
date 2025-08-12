import axios from "axios"
import { PKCEChallenge } from "../../utils/oauth/pkce"

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

/**
 * OpenAI OAuth authentication manager.
 * Handles the complete OAuth flow for ChatGPT Plus/Pro authentication,
 * including token exchange and API key retrieval.
 */
export class OpenAIAuth {
	private static readonly CONFIG: OpenAIAuthConfig = {
		// Use exact Codex CLI client ID for compatibility
		clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
		redirectUri: "http://localhost:1455/auth/callback",
		scopes: ["openid", "profile", "email", "offline_access"],
	}

	/**
	 * Builds the authorization URL for the OAuth flow with exact Codex CLI parameters.
	 */
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
			// Codex CLI specific parameters for compatibility
			id_token_add_organizations: "true",
			codex_cli_simplified_flow: "true",
		})

		return `https://auth.openai.com/oauth/authorize?${params.toString()}`
	}

	/**
	 * Exchanges the authorization code for OAuth tokens.
	 */
	static async exchangeCodeForTokens(code: string, codeVerifier: string, redirectUri: string): Promise<OpenAITokens> {
		try {
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
				throw new Error("Failed to exchange authorization code for tokens")
			}

			return response.data
		} catch (error) {
			if (axios.isAxiosError(error)) {
				const errorMsg = error.response?.data?.error_description || error.response?.data?.error || error.message
				throw new Error(`Token exchange failed: ${errorMsg}`)
			}
			throw error
		}
	}

	/**
	 * Exchanges an ID token for an OpenAI API key using token-to-token exchange.
	 */
	static async exchangeTokenForApiKey(idToken: string, clientId?: string): Promise<string> {
		try {
			const response = await axios.post(
				"https://auth.openai.com/oauth/token",
				{
					grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
					requested_token_type: "openai-api-key",
					subject_token: idToken,
					subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
					client_id: clientId || "RooCode", // Use Roo Code client ID for token exchange
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
					"Failed to exchange token for API key. " +
						"You may need to complete OpenAI Platform onboarding at https://platform.openai.com/",
				)
			}

			return response.data.access_token
		} catch (error) {
			if (axios.isAxiosError(error)) {
				const errorMsg = error.response?.data?.error_description || error.response?.data?.error || error.message

				// Provide more specific error messages based on common scenarios
				if (error.response?.status === 400) {
					throw new Error(
						"API key exchange failed. This may occur if: " +
							"1) You haven't completed OpenAI Platform onboarding, or " +
							"2) Your account doesn't have API access. " +
							`Visit https://platform.openai.com/ to set up API access. (${errorMsg})`,
					)
				} else if (error.response?.status === 401) {
					throw new Error("Authentication failed. Please try signing in again.")
				} else {
					throw new Error(`API key exchange failed: ${errorMsg}`)
				}
			}
			throw error
		}
	}

	/**
	 * Refreshes OAuth tokens using the refresh token.
	 */
	static async refreshTokens(refreshToken: string): Promise<OpenAITokens> {
		try {
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
		} catch (error) {
			if (axios.isAxiosError(error)) {
				const errorMsg = error.response?.data?.error_description || error.response?.data?.error || error.message

				if (
					error.response?.status === 400 &&
					(error.response?.data?.error === "invalid_grant" ||
						errorMsg.includes("invalid_grant") ||
						errorMsg.includes("expired"))
				) {
					throw new Error("Refresh token is invalid or expired. Please sign in again.")
				} else {
					throw new Error(`Token refresh failed: ${errorMsg}`)
				}
			}
			throw error
		}
	}

	/**
	 * Attempts to redeem complimentary credits for Plus/Pro users (best-effort).
	 * This operation is non-blocking and will not throw errors.
	 */
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
			// Best-effort only - log warning but don't throw
			// This prevents credit redemption failures from blocking the auth flow
			console.warn("Credit redemption failed (non-blocking):", error instanceof Error ? error.message : error)
		}
	}

	/**
	 * Validates if a token is likely expired based on standard JWT structure.
	 * Note: This is a best-effort check and doesn't verify signatures.
	 */
	static isTokenExpired(token: string): boolean {
		try {
			const parts = token.split(".")
			if (parts.length !== 3) {
				return true // Invalid JWT structure
			}

			const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString())
			const now = Math.floor(Date.now() / 1000)

			// Check if token has expired (with 5 minute buffer)
			// If no expiration field, consider it expired
			return !payload.exp || payload.exp < now + 300
		} catch {
			return true // Assume expired if we can't parse
		}
	}

	/**
	 * Determines if tokens should be refreshed based on age and expiration.
	 */
	static shouldRefreshTokens(lastRefresh: string, idToken?: string): boolean {
		try {
			const lastRefreshDate = new Date(lastRefresh)

			// Check if the date is invalid
			if (isNaN(lastRefreshDate.getTime())) {
				return true // Refresh if we can't determine age
			}

			const daysSinceRefresh = (Date.now() - lastRefreshDate.getTime()) / (1000 * 60 * 60 * 24)

			// Refresh if it's been more than 7 days or if the token is expired
			// If no token is provided, refresh to ensure we have valid credentials
			return daysSinceRefresh > 7 || (idToken ? this.isTokenExpired(idToken) : true)
		} catch {
			return true // Refresh if we can't determine age
		}
	}
}
