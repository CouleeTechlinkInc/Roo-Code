import { useCallback, useState, useEffect } from "react"
import { Checkbox } from "vscrui"
import { VSCodeTextField, VSCodeDropdown, VSCodeOption, VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"
import { vscode } from "@src/utils/vscode"
import type { OpenAiChatGptStatusPayload } from "@roo/ExtensionMessage"

import { inputEventTransform } from "../transforms"

type OpenAIProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const OpenAI = ({ apiConfiguration, setApiConfigurationField }: OpenAIProps) => {
	const { t } = useAppTranslation()

	const [openAiNativeBaseUrlSelected, setOpenAiNativeBaseUrlSelected] = useState(
		!!apiConfiguration?.openAiNativeBaseUrl,
	)

	// ChatGPT authentication state
	const [authMode, setAuthMode] = useState<"apiKey" | "chatgpt">(
		apiConfiguration?.openAiAuthMode || "apiKey"
	)
	const [chatGptStatus, setChatGptStatus] = useState<OpenAiChatGptStatusPayload>({
		authenticated: false
	})
	const [isAuthLoading, setIsAuthLoading] = useState(false)
	const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

	// Check ChatGPT auth status on mount and auth mode change
	useEffect(() => {
		if (authMode === "chatgpt") {
			vscode.postMessage({ type: "requestOpenAIChatGptStatus" })
		}
	}, [authMode])

	// Listen for auth status updates
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "openAiChatGptStatus") {
				setChatGptStatus(message.payload)
				setIsAuthLoading(false)
			} else if (message.type === "openAiChatGptAuthSuccess") {
				vscode.postMessage({ type: "requestOpenAIChatGptStatus" })
			} else if (message.type === "openAiChatGptSignOutSuccess") {
				setChatGptStatus({ authenticated: false })
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

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

	const handleAuthModeChange = (newMode: "apiKey" | "chatgpt") => {
		setAuthMode(newMode)
		setApiConfigurationField("openAiAuthMode", newMode)
	}

	const handleSignIn = () => {
		setIsAuthLoading(true)
		vscode.postMessage({ type: "openaiSignInChatGPT" })
	}

	const handleSignOut = () => {
		if (showSignOutConfirm) {
			vscode.postMessage({ type: "openaiSignOutChatGPT" })
			setShowSignOutConfirm(false)
		} else {
			setShowSignOutConfirm(true)
			setTimeout(() => setShowSignOutConfirm(false), 3000)
		}
	}

	const handleRefresh = () => {
		setIsAuthLoading(true)
		vscode.postMessage({ type: "openaiRefreshCredentials" })
	}

	const handleImportFromCodex = () => {
		vscode.postMessage({ type: "openaiImportFromCodex" })
	}

	// Render ChatGPT authentication UI
	const renderChatGptAuth = () => {
		return (
			<div className="flex flex-col gap-3">
				<div className="text-sm text-vscode-descriptionForeground">
					{t("settings:openaiAuth.chatgptAuth.description")}
				</div>
				
				{chatGptStatus.authenticated ? (
					<>
						<div className="p-3 bg-vscode-textBlockQuote-background border border-vscode-textBlockQuote-border rounded">
							<div className="flex items-center gap-2 mb-2">
								<span className="text-green-500">✓</span>
								<span className="font-medium">{t("settings:openaiAuth.status.authenticated")}</span>
							</div>
							{chatGptStatus.userEmail && (
								<div className="text-sm text-vscode-descriptionForeground">
									{t("settings:openaiAuth.status.email")}: {chatGptStatus.userEmail}
								</div>
							)}
							{chatGptStatus.lastRefresh && (
								<div className="text-sm text-vscode-descriptionForeground">
									{t("settings:openaiAuth.status.lastRefresh")}: {new Date(chatGptStatus.lastRefresh).toLocaleString()}
								</div>
							)}
						</div>
						
						<div className="flex gap-2">
							<VSCodeButton 
								appearance="secondary"
								onClick={handleRefresh}
								disabled={isAuthLoading}
							>
								{isAuthLoading ? t("settings:openaiAuth.actions.refreshing") : t("settings:openaiAuth.actions.refresh")}
							</VSCodeButton>
							<VSCodeButton
								appearance="secondary"
								onClick={handleSignOut}
							>
								{showSignOutConfirm ? t("settings:openaiAuth.actions.confirmSignOut") : t("settings:openaiAuth.actions.signOut")}
							</VSCodeButton>
						</div>
					</>
				) : (
					<>
						{chatGptStatus.error && (
							<div className="p-3 bg-vscode-inputValidation-errorBackground border border-vscode-inputValidation-errorBorder rounded text-sm">
								{chatGptStatus.error}
							</div>
						)}
						
						<div className="flex flex-col gap-2">
							<VSCodeButton
								onClick={handleSignIn}
								disabled={isAuthLoading}
							>
								{isAuthLoading ? t("settings:openaiAuth.actions.signingIn") : t("settings:openaiAuth.actions.signIn")}
							</VSCodeButton>
							
							<VSCodeButton
								appearance="secondary"
								onClick={handleImportFromCodex}
								disabled={isAuthLoading}
							>
								{t("settings:openaiAuth.actions.importFromCodex")}
							</VSCodeButton>
							
							<div className="text-xs text-vscode-descriptionForeground mt-1">
								{t("settings:openaiAuth.info.importInfo")}
							</div>
						</div>
					</>
				)}
			</div>
		)
	}

	return (
		<>
			{/* Authentication Mode Selection */}
			<div className="mb-4">
				<label className="block font-medium mb-2">
					{t("settings:openaiAuth.authMode.label")}
				</label>
				<VSCodeDropdown
					value={authMode}
					onChange={(e: any) => handleAuthModeChange(e.target.value as "apiKey" | "chatgpt")}
					className="w-full"
				>
					<VSCodeOption value="apiKey">
						{t("settings:openaiAuth.authMode.apiKey")}
					</VSCodeOption>
					<VSCodeOption value="chatgpt">
						{t("settings:openaiAuth.authMode.chatgpt")}
					</VSCodeOption>
				</VSCodeDropdown>
				<div className="text-sm text-vscode-descriptionForeground mt-1">
					{t("settings:openaiAuth.authMode.description")}
				</div>
			</div>

			{authMode === "chatgpt" ? (
				renderChatGptAuth()
			) : (
				<>
					<Checkbox
						checked={openAiNativeBaseUrlSelected}
						onChange={(checked: boolean) => {
							setOpenAiNativeBaseUrlSelected(checked)

							if (!checked) {
								setApiConfigurationField("openAiNativeBaseUrl", "")
							}
						}}>
						{t("settings:providers.useCustomBaseUrl")}
					</Checkbox>
					{openAiNativeBaseUrlSelected && (
						<>
							<VSCodeTextField
								value={apiConfiguration?.openAiNativeBaseUrl || ""}
								type="url"
								onInput={handleInputChange("openAiNativeBaseUrl")}
								placeholder="https://api.openai.com/v1"
								className="w-full mt-1"
							/>
						</>
					)}
					<VSCodeTextField
						value={apiConfiguration?.openAiNativeApiKey || ""}
						type="password"
						onInput={handleInputChange("openAiNativeApiKey")}
						placeholder={t("settings:placeholders.apiKey")}
						className="w-full">
						<label className="block font-medium mb-1">{t("settings:providers.openAiApiKey")}</label>
					</VSCodeTextField>
					<div className="text-sm text-vscode-descriptionForeground -mt-2">
						{t("settings:providers.apiKeyStorageNotice")}
					</div>
					{!apiConfiguration?.openAiNativeApiKey && (
						<VSCodeButtonLink href="https://platform.openai.com/api-keys" appearance="secondary">
							{t("settings:providers.getOpenAiApiKey")}
						</VSCodeButtonLink>
					)}
				</>
			)}
		</>
	)
}