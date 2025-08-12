import { useCallback, useState, useEffect } from "react"
import { Checkbox } from "vscrui"
import { VSCodeTextField, VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"
import { vscode } from "@src/utils/vscode"

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

	// Simple loading state for Codex import
	const [isAuthLoading, setIsAuthLoading] = useState(false)

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

	// Listen for import completion
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "openaiImportFromCodexComplete") {
				setIsAuthLoading(false)
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	const handleImportFromCodex = () => {
		setIsAuthLoading(true)
		vscode.postMessage({ type: "openaiImportFromCodex" })
	}

	return (
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

			{/* Codex CLI Import Section */}
			<div className="mt-4 pt-4 border-t border-vscode-widget-border">
				<div className="mb-2">
					<label className="block font-medium text-sm">Import from Codex CLI</label>
					<div className="text-xs text-vscode-descriptionForeground mt-1">
						Import your existing Codex CLI credentials
					</div>
				</div>
				<VSCodeButton appearance="secondary" onClick={handleImportFromCodex} disabled={isAuthLoading}>
					{t("settings:openaiAuth.chatgptAuth.importFromCodexButton")}
				</VSCodeButton>
			</div>
		</>
	)
}
