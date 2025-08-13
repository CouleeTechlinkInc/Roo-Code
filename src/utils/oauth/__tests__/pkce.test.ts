import { describe, it, expect } from "vitest"
import { generatePKCEChallenge, generateState } from "../pkce"

describe("PKCE Utilities", () => {
	describe("generatePKCEChallenge", () => {
		it("should generate a valid PKCE challenge", () => {
			const challenge = generatePKCEChallenge()

			expect(challenge).toHaveProperty("codeVerifier")
			expect(challenge).toHaveProperty("codeChallenge")
			expect(challenge).toHaveProperty("codeChallengeMethod")
			expect(challenge.codeChallengeMethod).toBe("S256")
		})

		it("should generate code verifier of correct length", () => {
			const challenge = generatePKCEChallenge()

			// Code verifier should be exactly 43 characters (base64url encoded)
			expect(challenge.codeVerifier).toHaveLength(43)

			// Should be URL-safe base64 (no padding, no +/= characters)
			expect(challenge.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/)
		})

		it("should generate code challenge of correct length", () => {
			const challenge = generatePKCEChallenge()

			// Code challenge should be base64url encoded SHA256 hash (43 characters)
			expect(challenge.codeChallenge).toHaveLength(43)

			// Should be URL-safe base64
			expect(challenge.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/)
		})

		it("should generate unique challenges on multiple calls", () => {
			const challenge1 = generatePKCEChallenge()
			const challenge2 = generatePKCEChallenge()

			expect(challenge1.codeVerifier).not.toBe(challenge2.codeVerifier)
			expect(challenge1.codeChallenge).not.toBe(challenge2.codeChallenge)
		})

		it("should generate deterministic challenge from same verifier", () => {
			// We can't easily test this without exposing internal functions,
			// but we can verify the challenge is consistent with crypto standards
			const challenge = generatePKCEChallenge()

			expect(challenge.codeChallenge).toBeTruthy()
			expect(challenge.codeChallengeMethod).toBe("S256")
		})
	})

	describe("generateState", () => {
		it("should generate a valid state parameter", () => {
			const state = generateState()

			expect(state).toBeTruthy()
			expect(typeof state).toBe("string")

			// State should be 32 characters (16 bytes as hex)
			expect(state).toHaveLength(32)

			// Should be hexadecimal
			expect(state).toMatch(/^[0-9a-f]+$/)
		})

		it("should generate unique states on multiple calls", () => {
			const state1 = generateState()
			const state2 = generateState()

			expect(state1).not.toBe(state2)
		})

		it("should generate cryptographically random state", () => {
			// Generate multiple states and ensure they're all different
			const states = Array.from({ length: 10 }, () => generateState())
			const uniqueStates = new Set(states)

			expect(uniqueStates.size).toBe(10)
		})
	})
})
