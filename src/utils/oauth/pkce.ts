import { randomBytes, createHash } from "crypto"

export interface PKCEChallenge {
	codeVerifier: string
	codeChallenge: string
	codeChallengeMethod: "S256"
}

/**
 * Generates a PKCE challenge for OAuth2 authentication.
 * This function creates a cryptographically secure code verifier and its corresponding challenge
 * following RFC 7636 specification and matching Codex CLI exactly.
 */
export function generatePKCEChallenge(): PKCEChallenge {
	// Generate 64 random bytes and convert to hex string (128 hex chars) - matching Codex CLI
	const codeVerifier = randomBytes(64).toString("hex")

	// Create SHA256 hash and encode as base64url (remove padding like Codex CLI)
	const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url")

	return {
		codeVerifier,
		codeChallenge,
		codeChallengeMethod: "S256",
	}
}

/**
 * Generates a cryptographically secure state parameter for OAuth2 authentication.
 * The state parameter is used to prevent CSRF attacks during the OAuth flow.
 * Matches Codex CLI with 32 bytes (64 hex chars).
 */
export function generateState(): string {
	return randomBytes(32).toString("hex")
}
