import { randomBytes, createHash } from "crypto"

export interface PKCEChallenge {
	codeVerifier: string
	codeChallenge: string
	codeChallengeMethod: "S256"
}

/**
 * Generates a PKCE challenge for OAuth2 authentication.
 * This function creates a cryptographically secure code verifier and its corresponding challenge
 * following RFC 7636 specification.
 */
export function generatePKCEChallenge(): PKCEChallenge {
	// Generate cryptographically secure random string (43 characters)
	// Using 32 bytes which gives us 43 characters in base64url encoding
	const codeVerifier = randomBytes(32).toString("base64url").slice(0, 43) // Ensure exactly 43 characters

	// Create SHA256 hash and encode as base64url
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
 */
export function generateState(): string {
	return randomBytes(16).toString("hex")
}
