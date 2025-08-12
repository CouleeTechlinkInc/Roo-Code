import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import axios from "axios"
import { OpenAIAuth } from "../openai-auth"
import { generatePKCEChallenge } from "../../../utils/oauth/pkce"

// Mock axios
vi.mock("axios", () => ({
	default: {
		post: vi.fn(),
		isAxiosError: vi.fn()
	}
}))

describe("OpenAI Authentication", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("buildAuthUrl", () => {
		it("should build correct authorization URL with default port", () => {
			const challenge = generatePKCEChallenge()
			const state = "test-state"

			const authUrl = OpenAIAuth.buildAuthUrl(challenge, state)

			expect(authUrl).toContain("https://auth.openai.com/oauth/authorize")
			expect(authUrl).toContain("response_type=code")
			expect(authUrl).toContain("client_id=app_EMoamEEZ73f0CkXaXp7hrann")
			expect(authUrl).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback")
			expect(authUrl).toContain(`code_challenge=${encodeURIComponent(challenge.codeChallenge)}`)
			expect(authUrl).toContain("code_challenge_method=S256")
			expect(authUrl).toContain(`state=${state}`)
			// Both %20 and + are valid URL encodings for spaces
			expect(authUrl).toMatch(
				/scope=(openid(%20|\+)profile(%20|\+)email(%20|\+)offline_access|openid\+profile\+email\+offline_access)/,
			)
			expect(authUrl).toContain("id_token_add_organizations=true")
			expect(authUrl).toContain("codex_cli_simplified_flow=true")
		})

		it("should build correct authorization URL with custom port", () => {
			const challenge = generatePKCEChallenge()
			const state = "test-state"
			const customPort = 8080

			const authUrl = OpenAIAuth.buildAuthUrl(challenge, state, customPort)

			expect(authUrl).toContain(`redirect_uri=http%3A%2F%2Flocalhost%3A${customPort}%2Fauth%2Fcallback`)
		})
	})

	describe("exchangeCodeForTokens", () => {
		it("should successfully exchange code for tokens", async () => {
			const mockResponse = {
				data: {
					access_token: "access-token-123",
					refresh_token: "refresh-token-123",
					id_token: "id-token-123",
					token_type: "Bearer",
					expires_in: 3600,
				},
			}

			vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

			const result = await OpenAIAuth.exchangeCodeForTokens(
				"test-code",
				"test-verifier",
				"http://localhost:1455/auth/callback",
			)

			expect(result).toEqual(mockResponse.data)
			expect(axios.post).toHaveBeenCalledWith(
				"https://auth.openai.com/oauth/token",
				{
					grant_type: "authorization_code",
					client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
					code: "test-code",
					redirect_uri: "http://localhost:1455/auth/callback",
					code_verifier: "test-verifier",
				},
				{
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
					},
				},
			)
		})

		it("should handle token exchange failure", async () => {
			const mockError = {
				response: {
					data: {
						error: "invalid_grant",
						error_description: "Code has expired",
					},
				},
			}

			vi.mocked(axios.post).mockRejectedValueOnce(mockError)
			vi.mocked(axios.isAxiosError).mockReturnValueOnce(true)

			await expect(OpenAIAuth.exchangeCodeForTokens("invalid-code", "verifier", "redirect-uri")).rejects.toThrow(
				"Token exchange failed: Code has expired",
			)
		})

		it("should handle missing access_token in response", async () => {
			const mockResponse = {
				data: {
					// Missing access_token
					refresh_token: "refresh-token-123",
				},
			}

			vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

			await expect(OpenAIAuth.exchangeCodeForTokens("test-code", "verifier", "redirect-uri")).rejects.toThrow(
				"Failed to exchange authorization code for tokens",
			)
		})
	})

	describe("exchangeTokenForApiKey", () => {
		it("should successfully exchange ID token for API key", async () => {
			const mockResponse = {
				data: {
					access_token: "sk-api-key-123",
				},
			}

			vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

			const result = await OpenAIAuth.exchangeTokenForApiKey("id-token-123")

			expect(result).toBe("sk-api-key-123")
			expect(axios.post).toHaveBeenCalledWith(
				"https://auth.openai.com/oauth/token",
				{
					grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
					requested_token_type: "openai-api-key",
					subject_token: "id-token-123",
					subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
					client_id: "RooCode",
				},
				{
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
					},
				},
			)
		})

		it("should use custom client ID when provided", async () => {
			const mockResponse = {
				data: { access_token: "sk-api-key-123" },
			}

			vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

			await OpenAIAuth.exchangeTokenForApiKey("id-token-123", "CustomClient")

			expect(axios.post).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					client_id: "CustomClient",
				}),
				expect.any(Object),
			)
		})

		it("should handle API key exchange failure with specific error messages", async () => {
			const mockError = {
				response: {
					status: 400,
					data: {
						error: "invalid_request",
						error_description: "Platform onboarding required",
					},
				},
			}

			vi.mocked(axios.post).mockRejectedValueOnce(mockError)
			vi.mocked(axios.isAxiosError).mockReturnValueOnce(true)

			await expect(OpenAIAuth.exchangeTokenForApiKey("invalid-token")).rejects.toThrow(
				"API key exchange failed. This may occur if",
			)
		})

		it("should handle 401 authentication errors", async () => {
			const mockError = {
				response: {
					status: 401,
					data: { error: "unauthorized" },
				},
			}

			vi.mocked(axios.post).mockRejectedValueOnce(mockError)
			vi.mocked(axios.isAxiosError).mockReturnValueOnce(true)

			await expect(OpenAIAuth.exchangeTokenForApiKey("expired-token")).rejects.toThrow(
				"Authentication failed. Please try signing in again.",
			)
		})
	})

	describe("refreshTokens", () => {
		it("should successfully refresh tokens", async () => {
			const mockResponse = {
				data: {
					access_token: "new-access-token",
					refresh_token: "new-refresh-token",
					id_token: "new-id-token",
				},
			}

			vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

			const result = await OpenAIAuth.refreshTokens("refresh-token-123")

			expect(result).toEqual(mockResponse.data)
			expect(axios.post).toHaveBeenCalledWith(
				"https://auth.openai.com/oauth/token",
				{
					grant_type: "refresh_token",
					client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
					refresh_token: "refresh-token-123",
				},
				{
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
					},
				},
			)
		})

		it("should handle expired refresh token", async () => {
			const mockError = {
				response: {
					status: 400,
					data: {
						error: "invalid_grant",
						error_description: "Refresh token expired",
					},
				},
			}

			vi.mocked(axios.post).mockRejectedValueOnce(mockError)
			vi.mocked(axios.isAxiosError).mockReturnValueOnce(true)

			await expect(OpenAIAuth.refreshTokens("expired-refresh-token")).rejects.toThrow(
				"Refresh token is invalid or expired. Please sign in again.",
			)
		})
	})

	describe("redeemCredits", () => {
		it("should silently handle credit redemption success", async () => {
			const mockResponse = { data: { success: true } }
			vi.mocked(axios.post).mockResolvedValueOnce(mockResponse)

			// Should not throw even if successful
			await expect(OpenAIAuth.redeemCredits("id-token-123")).resolves.toBeUndefined()

			expect(axios.post).toHaveBeenCalledWith(
				"https://api.openai.com/v1/billing/redeem_credits",
				{},
				{
					headers: {
						Authorization: "Bearer id-token-123",
						"Content-Type": "application/json",
					},
				},
			)
		})

		it("should silently handle credit redemption failure", async () => {
			const mockError = new Error("Credit redemption failed")
			vi.mocked(axios.post).mockRejectedValueOnce(mockError)

			// Should not throw even if failed (best-effort)
			await expect(OpenAIAuth.redeemCredits("id-token-123")).resolves.toBeUndefined()
		})
	})

	describe("isTokenExpired", () => {
		it("should return false for valid non-expired token", () => {
			// Create a mock JWT token that expires in 1 hour
			const futureTimestamp = Math.floor(Date.now() / 1000) + 3600
			const payload = Buffer.from(JSON.stringify({ exp: futureTimestamp })).toString("base64url")
			const mockToken = `header.${payload}.signature`

			expect(OpenAIAuth.isTokenExpired(mockToken)).toBe(false)
		})

		it("should return true for expired token", () => {
			// Create a mock JWT token that expired 1 hour ago
			const pastTimestamp = Math.floor(Date.now() / 1000) - 3600
			const payload = Buffer.from(JSON.stringify({ exp: pastTimestamp })).toString("base64url")
			const mockToken = `header.${payload}.signature`

			expect(OpenAIAuth.isTokenExpired(mockToken)).toBe(true)
		})

		it("should return true for token expiring within 5 minutes (buffer)", () => {
			// Create a mock JWT token that expires in 2 minutes (within 5-minute buffer)
			const soonTimestamp = Math.floor(Date.now() / 1000) + 120
			const payload = Buffer.from(JSON.stringify({ exp: soonTimestamp })).toString("base64url")
			const mockToken = `header.${payload}.signature`

			expect(OpenAIAuth.isTokenExpired(mockToken)).toBe(true)
		})

		it("should return true for malformed token", () => {
			expect(OpenAIAuth.isTokenExpired("invalid-token")).toBe(true)
			expect(OpenAIAuth.isTokenExpired("header.invalid-payload.signature")).toBe(true)
			expect(OpenAIAuth.isTokenExpired("")).toBe(true)
		})

		it("should return true for token without expiration", () => {
			const payload = Buffer.from(JSON.stringify({ sub: "user123" })).toString("base64url")
			const mockToken = `header.${payload}.signature`

			expect(OpenAIAuth.isTokenExpired(mockToken)).toBe(true)
		})
	})

	describe("shouldRefreshTokens", () => {
		it("should return false for recent non-expired tokens", () => {
			const recentDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 1 day ago
			const futureTimestamp = Math.floor(Date.now() / 1000) + 3600
			const payload = Buffer.from(JSON.stringify({ exp: futureTimestamp })).toString("base64url")
			const validToken = `header.${payload}.signature`

			expect(OpenAIAuth.shouldRefreshTokens(recentDate, validToken)).toBe(false)
		})

		it("should return true for old tokens", () => {
			const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() // 8 days ago
			const futureTimestamp = Math.floor(Date.now() / 1000) + 3600
			const payload = Buffer.from(JSON.stringify({ exp: futureTimestamp })).toString("base64url")
			const validToken = `header.${payload}.signature`

			expect(OpenAIAuth.shouldRefreshTokens(oldDate, validToken)).toBe(true)
		})

		it("should return true for expired tokens regardless of age", () => {
			const recentDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 1 day ago
			const pastTimestamp = Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
			const payload = Buffer.from(JSON.stringify({ exp: pastTimestamp })).toString("base64url")
			const expiredToken = `header.${payload}.signature`

			expect(OpenAIAuth.shouldRefreshTokens(recentDate, expiredToken)).toBe(true)
		})

		it("should return true for invalid date strings", () => {
			expect(OpenAIAuth.shouldRefreshTokens("invalid-date")).toBe(true)
		})

		it("should return true when no token provided", () => {
			const recentDate = new Date().toISOString()
			expect(OpenAIAuth.shouldRefreshTokens(recentDate)).toBe(true)
		})
	})
})
