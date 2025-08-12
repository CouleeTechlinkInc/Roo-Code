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

/**
 * Local HTTP server for handling OAuth callbacks during the authentication flow.
 * This server binds to localhost only for security and handles a single callback request.
 */
export class OAuthServer extends EventEmitter {
	private server?: http.Server
	private options: Required<OAuthServerOptions>

	constructor(options: OAuthServerOptions = {}) {
		super()
		this.options = {
			port: options.port ?? 1455, // Default port for Codex CLI compatibility
			timeout: options.timeout ?? 300000, // 5 minutes default timeout
		}
	}

	/**
	 * Starts the OAuth callback server on the specified port.
	 * Returns the actual port number the server is listening on.
	 */
	async start(): Promise<number> {
		return new Promise((resolve, reject) => {
			this.server = http.createServer(this.handleRequest.bind(this))

			this.server.on("error", (err: NodeJS.ErrnoException) => {
				if (err.code === "EADDRINUSE") {
					reject(
						new Error(
							`Port ${this.options.port} is already in use. ` +
								`For remote development, run: ssh -L ${this.options.port}:localhost:${this.options.port} <your-remote-host>`,
						),
					)
				} else {
					reject(err)
				}
			})

			this.server.listen(this.options.port, "127.0.0.1", () => {
				// Get the actual port number the server is listening on
				const address = this.server?.address()
				const actualPort = typeof address === "object" && address ? address.port : this.options.port
				resolve(actualPort)
			})

			// Auto-close after timeout to prevent hanging processes
			setTimeout(() => {
				this.close()
				this.emit("timeout")
			}, this.options.timeout)
		})
	}

	/**
	 * Handles incoming HTTP requests to the OAuth callback endpoint.
	 */
	private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
		if (req.url && req.url.startsWith("/auth/callback")) {
			const parsedUrl = url.parse(req.url, true)
			const callback: OAuthCallback = {
				code: parsedUrl.query.code as string,
				state: parsedUrl.query.state as string,
				error: parsedUrl.query.error as string,
				error_description: parsedUrl.query.error_description as string,
			}

			// Send success page to user
			res.writeHead(200, { "Content-Type": "text/html" })
			res.end(this.getSuccessPage())

			// Emit callback and close server after a brief delay
			this.emit("callback", callback)
			setTimeout(() => this.close(), 1000)
		} else {
			res.writeHead(404, { "Content-Type": "text/html" })
			res.end("<html><body><h1>404 Not Found</h1><p>OAuth callback endpoint not found.</p></body></html>")
		}
	}

	/**
	 * Returns the HTML page shown to users after successful authentication.
	 */
	private getSuccessPage(): string {
		return `
<!DOCTYPE html>
<html>
<head>
	<title>Roo Code - Authentication Success</title>
	<style>
		body { 
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif; 
			text-align: center; 
			padding: 50px; 
			background-color: #f5f5f5;
			margin: 0;
		}
		.container {
			background: white;
			border-radius: 8px;
			padding: 40px;
			box-shadow: 0 2px 10px rgba(0,0,0,0.1);
			display: inline-block;
		}
		.success { 
			color: #28a745; 
			font-size: 24px; 
			margin-bottom: 20px; 
			font-weight: 600;
		}
		.message { 
			color: #6c757d; 
			font-size: 16px;
			line-height: 1.5;
		}
		.icon {
			font-size: 48px;
			margin-bottom: 20px;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="icon">✓</div>
		<div class="success">Authentication Successful</div>
		<div class="message">
			You have successfully signed in to Roo Code with your ChatGPT account.<br>
			You can now close this tab and return to VS Code.
		</div>
	</div>
</body>
</html>
		`
	}

	/**
	 * Closes the OAuth callback server and cleans up resources.
	 */
	close() {
		if (this.server) {
			this.server.close()
			this.server = undefined
		}
	}
}
