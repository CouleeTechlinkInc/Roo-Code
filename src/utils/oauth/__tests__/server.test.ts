import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import axios from "axios"
import { OAuthServer } from "../server"

describe("OAuth Server", () => {
	let server: OAuthServer

	afterEach(async () => {
		if (server) {
			server.close()
		}
	})

	describe("server initialization", () => {
		it("should create server with default options", () => {
			server = new OAuthServer()
			expect(server).toBeDefined()
		})

		it("should create server with custom options", () => {
			server = new OAuthServer({ port: 8080, timeout: 60000 })
			expect(server).toBeDefined()
		})
	})

	describe("server startup", () => {
		it("should start server on default port 1455", async () => {
			server = new OAuthServer()
			const port = await server.start()
			expect(port).toBe(1455)
		})

		it("should start server on custom port", async () => {
			server = new OAuthServer({ port: 0 }) // Use random available port
			const port = await server.start()
			expect(port).toBeGreaterThan(0)
		})

		it("should throw error if port is already in use", async () => {
			const server1 = new OAuthServer({ port: 1456 })
			await server1.start()

			const server2 = new OAuthServer({ port: 1456 })

			await expect(server2.start()).rejects.toThrow("Port 1456 is already in use")

			server1.close()
			server2.close()
		})
	})

	describe("callback handling", () => {
		beforeEach(async () => {
			server = new OAuthServer({ port: 0 }) // Use random port to avoid conflicts
			await server.start()
		})

		it("should handle successful OAuth callback", async () => {
			const callbackPromise = new Promise((resolve) => {
				server.on("callback", resolve)
			})

			// Get the actual port the server is listening on
			const port = await server.start()

			// Simulate OAuth callback
			const response = await axios.get(`http://127.0.0.1:${port}/auth/callback?code=test_code&state=test_state`)
			expect(response.status).toBe(200)
			expect(response.data).toContain("Authentication Successful")

			const callback = await callbackPromise
			expect(callback).toMatchObject({
				code: "test_code",
				state: "test_state",
			})
		})

		it("should handle OAuth callback with error", async () => {
			const callbackPromise = new Promise((resolve) => {
				server.on("callback", resolve)
			})

			const port = await server.start()

			// Simulate OAuth error callback
			const response = await axios.get(
				`http://127.0.0.1:${port}/auth/callback?error=access_denied&error_description=User%20denied%20access`,
			)
			expect(response.status).toBe(200)

			const callback = await callbackPromise
			expect(callback).toMatchObject({
				error: "access_denied",
				error_description: "User denied access",
			})
		})

		it("should return 404 for non-callback endpoints", async () => {
			const port = await server.start()

			try {
				await axios.get(`http://127.0.0.1:${port}/not-found`)
				expect.fail("Should have thrown 404 error")
			} catch (error: any) {
				expect(error.response.status).toBe(404)
			}
		})

		it("should close server after callback", async () => {
			const port = await server.start()

			// Make callback request
			await axios.get(`http://127.0.0.1:${port}/auth/callback?code=test`)

			// Wait for server to close (it closes with a 1 second delay)
			await new Promise((resolve) => setTimeout(resolve, 1100))

			// Server should be closed now
			try {
				await axios.get(`http://127.0.0.1:${port}/auth/callback`, { timeout: 1000 })
				expect.fail("Server should be closed")
			} catch (error: any) {
				expect(error.code).toBe("ECONNREFUSED")
			}
		})
	})

	describe("timeout handling", () => {
		it("should emit timeout event after specified timeout", async () => {
			server = new OAuthServer({ port: 0, timeout: 100 }) // Very short timeout for testing

			const timeoutPromise = new Promise((resolve) => {
				server.on("timeout", resolve)
			})

			await server.start()

			// Wait for timeout event
			await expect(timeoutPromise).resolves.toBeUndefined()
		}, 10000) // Increase test timeout

		it("should close server on timeout", async () => {
			server = new OAuthServer({ port: 0, timeout: 100 })
			const port = await server.start()

			// Wait for timeout
			await new Promise((resolve) => setTimeout(resolve, 150))

			// Server should be closed
			try {
				await axios.get(`http://127.0.0.1:${port}/auth/callback`, { timeout: 1000 })
				expect.fail("Server should be closed after timeout")
			} catch (error: any) {
				expect(error.code).toBe("ECONNREFUSED")
			}
		})
	})

	describe("success page generation", () => {
		it("should serve success page with proper HTML", async () => {
			server = new OAuthServer({ port: 0 })
			const port = await server.start()

			const response = await axios.get(`http://127.0.0.1:${port}/auth/callback?code=test`)

			expect(response.headers["content-type"]).toBe("text/html")
			expect(response.data).toContain("Authentication Successful")
			expect(response.data).toContain("You can now close this tab")
			expect(response.data).toContain("<!DOCTYPE html>")
		})
	})

	describe("server closing", () => {
		it("should close server gracefully", async () => {
			server = new OAuthServer({ port: 0 })
			const port = await server.start()

			// Verify server is running
			const response = await axios.get(`http://127.0.0.1:${port}/auth/callback?code=test`)
			expect(response.status).toBe(200)

			// Close server
			server.close()

			// Wait a moment for close to take effect
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Server should be closed
			try {
				await axios.get(`http://127.0.0.1:${port}/auth/callback`, { timeout: 1000 })
				expect.fail("Server should be closed")
			} catch (error: any) {
				expect(error.code).toBe("ECONNREFUSED")
			}
		})

		it("should handle multiple close calls gracefully", () => {
			server = new OAuthServer()

			expect(() => {
				server.close()
				server.close()
			}).not.toThrow()
		})
	})
})
