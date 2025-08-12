import { useCallback, useState, useEffect } from "react"
import { Checkbox } from "vscrui"
import { VSCodeTextField, VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { vscode } from "@src/utils/vscode"

import { inputEventTransform } from "../transforms"

type OpenAIProPlusProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

interface TokenStatus {
	isAuthenticated: boolean
	hasApiKey: boolean
	hasTokens: boolean
	lastRefresh?: string
	isValidating?: boolean
	validationError?: string
}

export const OpenAIProPlus = ({ apiConfiguration, setApiConfigurationField }: OpenAIProPlusProps) => {
	const { t } = useAppTranslation()

	// Custom base URL toggle
	const [openAiProPlusBaseUrlSelected, setOpenAiProPlusBaseUrlSelected] = useState(
		!!apiConfiguration?.openAiProPlusBaseUrl,
	)

	// Authentication and import state
	const [isAuthLoading, setIsAuthLoading] = useState(false)
	const [tokenStatus, setTokenStatus] = useState<TokenStatus>({
		isAuthenticated: false,
		hasApiKey: false,
		hasTokens: false,
	})

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	// Update token status when configuration changes
	useEffect(() => {
		const hasApiKey = !!apiConfiguration?.openAiChatGptApiKey
		const hasTokens = !!(apiConfiguration?.openAiChatGptIdToken && apiConfiguration?.openAiChatGptRefreshToken)
		const isAuthenticated = hasApiKey || hasTokens

		setTokenStatus({
			isAuthenticated,
			hasApiKey,
			hasTokens,
			lastRefresh: apiConfiguration?.openAiChatGptLastRefresh,
		})
	}, [
		apiConfiguration?.openAiChatGptApiKey,
		apiConfiguration?.openAiChatGptIdToken,
		apiConfiguration?.openAiChatGptRefreshToken,
		apiConfiguration?.openAiChatGptLastRefresh,
	])

	// Listen for import completion and validation results
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data

			if (message.type === "openaiProPlusImportFromCodexComplete") {
				setIsAuthLoading(false)
			}

			if (message.type === "openaiProPlusTokenValidation") {
				setTokenStatus((prev) => ({
					...prev,
					isValidating: false,
					validationError: message.error,
				}))
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	const handleImportFromCodex = () => {
		setIsAuthLoading(true)
		vscode.postMessage({ type: "openaiProPlusImportFromCodex" })
	}

	const handleValidateTokens = () => {
		if (!tokenStatus.isAuthenticated) return

		setTokenStatus((prev) => ({ ...prev, isValidating: true, validationError: undefined }))
		vscode.postMessage({ type: "openaiProPlusValidateTokens" })
	}

	const getStatusIcon = () => {
		if (tokenStatus.isValidating) {
			return <span className="codicon codicon-loading spin text-vscode-foreground"></span>
		}
		if (tokenStatus.validationError) {
			return (
				<span
					className="codicon codicon-error text-vscode-errorForeground"
					title={tokenStatus.validationError}></span>
			)
		}
		if (tokenStatus.isAuthenticated) {
			return <span className="codicon codicon-check text-vscode-charts-green" title="Authenticated"></span>
		}
		return (
			<span
				className="codicon codicon-circle-outline text-vscode-descriptionForeground"
				title="Not authenticated"></span>
		)
	}

	const formatLastRefresh = (isoString?: string) => {
		if (!isoString) return "Never"
		try {
			return new Date(isoString).toLocaleString()
		} catch {
			return "Invalid date"
		}
	}

	return (
		<>
			{/* Custom Base URL Section */}
			<Checkbox
				checked={openAiProPlusBaseUrlSelected}
				onChange={(checked: boolean) => {
					setOpenAiProPlusBaseUrlSelected(checked)
					if (!checked) {
						setApiConfigurationField("openAiProPlusBaseUrl", "")
					}
				}}>
				{t("settings:providers.useCustomBaseUrl")}
			</Checkbox>
			{openAiProPlusBaseUrlSelected && (
				<VSCodeTextField
					value={apiConfiguration?.openAiProPlusBaseUrl || ""}
					type="url"
					onInput={handleInputChange("openAiProPlusBaseUrl")}
					placeholder="https://api.openai.com"
					className="w-full mt-1"
				/>
			)}

			{/* Authentication Status Section */}
			<div className="mt-4 p-3 border border-vscode-widget-border rounded">
				<div className="flex items-center justify-between mb-3">
					<div className="flex items-center gap-2">
						{getStatusIcon()}
						<span className="font-medium text-sm">Authentication Status</span>
					</div>
					{tokenStatus.isAuthenticated && (
						<VSCodeButton
							appearance="icon"
							onClick={handleValidateTokens}
							disabled={tokenStatus.isValidating}
							title="Validate credentials">
							<span className="codicon codicon-refresh"></span>
						</VSCodeButton>
					)}
				</div>

				<div className="space-y-1 text-xs text-vscode-descriptionForeground">
					<div className="flex justify-between">
						<span>API Key:</span>
						<span
							className={
								tokenStatus.hasApiKey ? "text-vscode-charts-green" : "text-vscode-descriptionForeground"
							}>
							{tokenStatus.hasApiKey ? "Present" : "Not available"}
						</span>
					</div>
					<div className="flex justify-between">
						<span>OAuth Tokens:</span>
						<span
							className={
								tokenStatus.hasTokens ? "text-vscode-charts-green" : "text-vscode-descriptionForeground"
							}>
							{tokenStatus.hasTokens ? "Present" : "Not available"}
						</span>
					</div>
					<div className="flex justify-between">
						<span>Last Refresh:</span>
						<span>{formatLastRefresh(tokenStatus.lastRefresh)}</span>
					</div>
				</div>

				{tokenStatus.validationError && (
					<div className="mt-2 p-2 bg-vscode-inputValidation-errorBackground border border-vscode-inputValidation-errorBorder rounded">
						<div className="flex items-center gap-2 text-xs text-vscode-inputValidation-errorForeground">
							<span className="codicon codicon-warning"></span>
							<span>{tokenStatus.validationError}</span>
						</div>
					</div>
				)}
			</div>

			{/* Codex CLI Import Section */}
			<div className="mt-4 pt-4 border-t border-vscode-widget-border">
				<div className="mb-3">
					<label className="block font-medium text-sm">Import from Codex CLI</label>
					<div className="text-xs text-vscode-descriptionForeground mt-1">
						OpenAI (Pro/Plus) provider requires authentication via Codex CLI. Import your existing
						credentials to get started.
					</div>
				</div>

				<VSCodeButton appearance="primary" onClick={handleImportFromCodex} disabled={isAuthLoading}>
					{isAuthLoading ? (
						<>
							<span className="codicon codicon-loading spin mr-2"></span>
							Importing...
						</>
					) : (
						<>
							<span className="codicon codicon-sign-in mr-2"></span>
							Import from Codex CLI
						</>
					)}
				</VSCodeButton>

				{!tokenStatus.isAuthenticated && (
					<div className="mt-2 p-2 bg-vscode-inputValidation-infoBackground border border-vscode-inputValidation-infoBorder rounded">
						<div className="flex items-start gap-2 text-xs text-vscode-inputValidation-infoForeground">
							<span className="codicon codicon-info mt-0.5"></span>
							<div>
								<div className="font-medium mb-1">Authentication Required</div>
								<div>
									This provider only supports Codex CLI authentication. Use the button above to import
									your credentials.
								</div>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Help Section */}
			<div className="mt-4 pt-4 border-t border-vscode-widget-border">
				<div className="text-xs text-vscode-descriptionForeground">
					<div className="font-medium mb-2">Need help?</div>
					<ul className="space-y-1 ml-4">
						<li>
							• Install Codex CLI: <code>pip install codex-cli</code>
						</li>
						<li>
							• Authenticate: <code>codex auth login</code>
						</li>
						<li>• Import credentials using the button above</li>
					</ul>
				</div>
			</div>
		</>
	)
}
