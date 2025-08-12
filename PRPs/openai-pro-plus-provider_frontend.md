# PRP: OpenAI (Pro/Plus) Provider - Frontend Implementation

## Context

This PRP implements the frontend components for the new "OpenAI (Pro/Plus)" provider. This includes creating a dedicated UI component that only supports Codex CLI import (no manual API key input), integrating with the provider selection system, and displaying token status indicators.

**Dependencies**:

- `openai-pro-plus-provider_overview.md` - Architecture definition
- `openai-pro-plus-provider_backend.md` - Backend handler and API integration

## Implementation Details

### File Analysis and Modifications

#### 1. Provider Constants Registration

**File**: `/webview-ui/src/components/settings/constants.ts`

**Current**: PROVIDERS array with existing providers (lines 43-73)
**Analysis**: Clean alphabetical sorting, need to add OpenAI (Pro/Plus) entry

**Implementation**:

```typescript
// Add to PROVIDERS array (maintain alphabetical order by label)
export const PROVIDERS = [
	// ... existing providers
	{ value: "openai-pro-plus", label: "OpenAI (Pro/Plus)" }, // Add after "OpenAI"
	// ... rest of providers
].sort((a, b) => a.label.localeCompare(b.label))

// Add to MODELS_BY_PROVIDER (reuse openai-native models)
export const MODELS_BY_PROVIDER: Partial<Record<ProviderName, Record<string, ModelInfo>>> = {
	// ... existing mappings
	"openai-pro-plus": openAiNativeModels, // Same models as openai-native
}
```

#### 2. Settings UI Component

**File**: `/webview-ui/src/components/settings/providers/OpenAIProPlus.tsx` (NEW)

**Analysis**: Based on existing `OpenAI.tsx` component but simplified for Codex CLI only

**Implementation**:

```typescript
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
				setTokenStatus(prev => ({
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

		setTokenStatus(prev => ({ ...prev, isValidating: true, validationError: undefined }))
		vscode.postMessage({ type: "openaiProPlusValidateTokens" })
	}

	const getStatusIcon = () => {
		if (tokenStatus.isValidating) {
			return <span className="codicon codicon-loading spin text-vscode-foreground"></span>
		}
		if (tokenStatus.validationError) {
			return <span className="codicon codicon-error text-vscode-errorForeground" title={tokenStatus.validationError}></span>
		}
		if (tokenStatus.isAuthenticated) {
			return <span className="codicon codicon-check text-vscode-charts-green" title="Authenticated"></span>
		}
		return <span className="codicon codicon-circle-outline text-vscode-descriptionForeground" title="Not authenticated"></span>
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
						<span className={tokenStatus.hasApiKey ? "text-vscode-charts-green" : "text-vscode-descriptionForeground"}>
							{tokenStatus.hasApiKey ? "Present" : "Not available"}
						</span>
					</div>
					<div className="flex justify-between">
						<span>OAuth Tokens:</span>
						<span className={tokenStatus.hasTokens ? "text-vscode-charts-green" : "text-vscode-descriptionForeground"}>
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
						OpenAI (Pro/Plus) provider requires authentication via Codex CLI.
						Import your existing credentials to get started.
					</div>
				</div>

				<VSCodeButton
					appearance="primary"
					onClick={handleImportFromCodex}
					disabled={isAuthLoading}>
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
									This provider only supports Codex CLI authentication.
									Use the button above to import your credentials.
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
						<li>• Install Codex CLI: <code>pip install codex-cli</code></li>
						<li>• Authenticate: <code>codex auth login</code></li>
						<li>• Import credentials using the button above</li>
					</ul>
				</div>
			</div>
		</>
	)
}
```

#### 3. Settings Router Integration

**File**: `/webview-ui/src/components/settings/ApiOptions.tsx`

**Analysis**: Contains switch statement for provider UI components
**Current**: Around line 200+ switch statement with provider cases

**Implementation**: Add case for openai-pro-plus

```typescript
// Import the new component
import { OpenAIProPlus } from "./providers/OpenAIProPlus"

// Add case in provider switch statement
case "openai-pro-plus":
	return (
		<OpenAIProPlus
			apiConfiguration={apiConfiguration}
			setApiConfigurationField={setApiConfigurationField}
		/>
	)
```

#### 4. Message Handler Extension (Frontend)

**File**: `/webview-ui/src/components/settings/providers/OpenAIProPlus.tsx`

**Analysis**: Need additional message types for token validation

**Add to backend message handling**:

**File**: `/src/core/webview/webviewMessageHandler.ts`

```typescript
// Add new case for token validation
case "openaiProPlusValidateTokens": {
	await provider.validateProPlusTokens()
	break
}
```

**File**: `/src/core/webview/ClineProvider.ts`

```typescript
/**
 * Validate OpenAI Pro/Plus tokens and notify UI
 */
async validateProPlusTokens(): Promise<void> {
	try {
		const config = this.context.getValue<ProviderSettings>("apiConfiguration") || {}

		if (config.apiProvider !== "openai-pro-plus") {
			throw new Error("Not using OpenAI Pro/Plus provider")
		}

		// Create temporary handler to validate tokens
		const handler = new OpenAiProPlusHandler(config)
		const validation = await handler.validateTokens()

		// Send result to UI
		this.getWebviewPanel()?.webview.postMessage({
			type: "openaiProPlusTokenValidation",
			isValid: validation.isValid,
			error: validation.error,
			needsRefresh: validation.needsRefresh,
		})
	} catch (error) {
		this.getWebviewPanel()?.webview.postMessage({
			type: "openaiProPlusTokenValidation",
			isValid: false,
			error: error instanceof Error ? error.message : "Token validation failed",
		})
	}
}
```

#### 5. Translation Keys

**File**: Likely in i18n files (based on existing t() usage)

**Implementation**: Add translation keys (if not already present)

```json
{
	"settings": {
		"providers": {
			"useCustomBaseUrl": "Use custom base URL",
			"openaiProPlus": {
				"title": "OpenAI (Pro/Plus)",
				"description": "OpenAI provider with Codex CLI authentication",
				"importFromCodex": "Import from Codex CLI",
				"authenticationRequired": "Authentication Required",
				"tokenValidation": "Token Validation",
				"lastRefresh": "Last Refresh"
			}
		}
	}
}
```

### CSS/Styling Considerations

**Analysis**: Component uses existing VS Code design tokens

- `text-vscode-*` classes for colors
- `codicon` classes for icons
- `border-vscode-*` for borders
- Standard spacing utilities

**Implementation**: Uses existing design system, no new CSS needed.

### Icon Usage

**Analysis**: Uses VS Code Codicons

- `codicon-loading` with `spin` animation for loading states
- `codicon-check` for success status
- `codicon-error` for error status
- `codicon-circle-outline` for neutral status
- `codicon-sign-in` for import button
- `codicon-refresh` for validation button
- `codicon-info` and `codicon-warning` for info boxes

## Implementation Tasks (Order of Execution)

### Task 1: Provider Registration

1. Add "openai-pro-plus" to PROVIDERS array in `/webview-ui/src/components/settings/constants.ts`
2. Add model mapping to MODELS_BY_PROVIDER
3. Verify alphabetical sorting is maintained

### Task 2: Component Creation

1. Create `/webview-ui/src/components/settings/providers/OpenAIProPlus.tsx`
2. Implement base component structure with state management
3. Add authentication status display
4. Add Codex CLI import functionality
5. Add token validation UI

### Task 3: Router Integration

1. Add import and case in `/webview-ui/src/components/settings/ApiOptions.tsx`
2. Test component routing works correctly

### Task 4: Backend Message Integration

1. Add token validation message handler in `webviewMessageHandler.ts`
2. Add validation method to `ClineProvider.ts`
3. Add message type definitions

### Task 5: Testing

1. Create component tests
2. Test message handling
3. Test UI state updates
4. Test error handling

### Task 6: Styling & Polish

1. Verify design consistency
2. Test responsive behavior
3. Verify accessibility
4. Add any missing translations

## Testing Implementation

### Component Tests

**File**: `/webview-ui/src/components/settings/providers/__tests__/OpenAIProPlus.test.tsx` (NEW)

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { OpenAIProPlus } from "../OpenAIProPlus"
import type { ProviderSettings } from "@roo-code/types"

// Mock vscode API
const mockPostMessage = jest.fn()
jest.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: mockPostMessage,
	},
}))

// Mock translation hook
jest.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("OpenAIProPlus Component", () => {
	const mockSetApiConfigurationField = jest.fn()

	const defaultProps = {
		apiConfiguration: {} as ProviderSettings,
		setApiConfigurationField: mockSetApiConfigurationField,
	}

	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe("Authentication Status", () => {
		it("shows not authenticated when no credentials", () => {
			render(<OpenAIProPlus {...defaultProps} />)

			expect(screen.getByText("Not authenticated")).toBeInTheDocument()
			expect(screen.getByText("Not available")).toBeInTheDocument()
		})

		it("shows authenticated when API key present", () => {
			const config = {
				openAiChatGptApiKey: "test-key",
			} as ProviderSettings

			render(<OpenAIProPlus {...defaultProps} apiConfiguration={config} />)

			expect(screen.getByText("Present")).toBeInTheDocument()
		})

		it("shows authenticated when tokens present", () => {
			const config = {
				openAiChatGptIdToken: "id-token",
				openAiChatGptRefreshToken: "refresh-token",
			} as ProviderSettings

			render(<OpenAIProPlus {...defaultProps} apiConfiguration={config} />)

			expect(screen.getAllByText("Present")).toHaveLength(1)
		})
	})

	describe("Codex CLI Import", () => {
		it("triggers import message on button click", () => {
			render(<OpenAIProPlus {...defaultProps} />)

			const importButton = screen.getByText("Import from Codex CLI")
			fireEvent.click(importButton)

			expect(mockPostMessage).toHaveBeenCalledWith({
				type: "openaiProPlusImportFromCodex"
			})
		})

		it("shows loading state during import", () => {
			render(<OpenAIProPlus {...defaultProps} />)

			const importButton = screen.getByText("Import from Codex CLI")
			fireEvent.click(importButton)

			expect(screen.getByText("Importing...")).toBeInTheDocument()
			expect(importButton).toBeDisabled()
		})

		it("resets loading state on completion message", async () => {
			render(<OpenAIProPlus {...defaultProps} />)

			// Trigger import
			fireEvent.click(screen.getByText("Import from Codex CLI"))
			expect(screen.getByText("Importing...")).toBeInTheDocument()

			// Simulate completion message
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { type: "openaiProPlusImportFromCodexComplete" }
				})
			)

			await waitFor(() => {
				expect(screen.getByText("Import from Codex CLI")).toBeInTheDocument()
			})
		})
	})

	describe("Token Validation", () => {
		it("shows validation button when authenticated", () => {
			const config = {
				openAiChatGptApiKey: "test-key",
			} as ProviderSettings

			render(<OpenAIProPlus {...defaultProps} apiConfiguration={config} />)

			expect(screen.getByTitle("Validate credentials")).toBeInTheDocument()
		})

		it("triggers validation message on button click", () => {
			const config = {
				openAiChatGptApiKey: "test-key",
			} as ProviderSettings

			render(<OpenAIProPlus {...defaultProps} apiConfiguration={config} />)

			const validateButton = screen.getByTitle("Validate credentials")
			fireEvent.click(validateButton)

			expect(mockPostMessage).toHaveBeenCalledWith({
				type: "openaiProPlusValidateTokens"
			})
		})

		it("displays validation errors", async () => {
			const config = {
				openAiChatGptApiKey: "test-key",
			} as ProviderSettings

			render(<OpenAIProPlus {...defaultProps} apiConfiguration={config} />)

			// Simulate validation error
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "openaiProPlusTokenValidation",
						error: "Invalid credentials"
					}
				})
			)

			await waitFor(() => {
				expect(screen.getByText("Invalid credentials")).toBeInTheDocument()
			})
		})
	})

	describe("Custom Base URL", () => {
		it("shows base URL field when checkbox checked", () => {
			render(<OpenAIProPlus {...defaultProps} />)

			const checkbox = screen.getByLabelText(/useCustomBaseUrl/)
			fireEvent.click(checkbox)

			expect(screen.getByPlaceholderText("https://api.openai.com")).toBeInTheDocument()
		})

		it("clears base URL when checkbox unchecked", () => {
			const config = {
				openAiProPlusBaseUrl: "https://custom.api.com",
			} as ProviderSettings

			render(<OpenAIProPlus {...defaultProps} apiConfiguration={config} />)

			const checkbox = screen.getByLabelText(/useCustomBaseUrl/)
			fireEvent.click(checkbox)

			expect(mockSetApiConfigurationField).toHaveBeenCalledWith(
				"openAiProPlusBaseUrl",
				""
			)
		})
	})
})
```

## Validation Gates

### Component Testing

```bash
# Component tests
npm test -- webview-ui/src/components/settings/providers/__tests__/OpenAIProPlus.test.tsx

# All settings tests
npm test -- webview-ui/src/components/settings/

# Type checking
npx tsc --noEmit --project webview-ui/tsconfig.json
```

### Integration Testing

```bash
# Build webview UI
npm run build

# UI compilation
cd webview-ui && npm run build

# Linting
npm run lint
```

### Manual Testing Checklist

1. ✅ Provider appears in dropdown list
2. ✅ OpenAIProPlus component loads without errors
3. ✅ Authentication status displays correctly
4. ✅ Codex CLI import button works
5. ✅ Token validation button works when authenticated
6. ✅ Status indicators update based on authentication state
7. ✅ Custom base URL toggle works
8. ✅ Error messages display appropriately
9. ✅ Loading states work correctly
10. ✅ Help section is informative and accurate

### UI/UX Validation

1. ✅ Component follows VS Code design patterns
2. ✅ Icons are appropriate and accessible
3. ✅ Color coding is consistent (green=good, red=error, etc.)
4. ✅ Text is clear and actionable
5. ✅ Loading states provide feedback
6. ✅ Error states are helpful
7. ✅ Layout is responsive and clean

## Success Criteria

### Functional Requirements

1. ✅ New provider appears in provider selection dropdown
2. ✅ Component only shows Codex CLI import (no manual API key input)
3. ✅ Authentication status is visually clear
4. ✅ Token validation provides immediate feedback
5. ✅ Import process works end-to-end
6. ✅ Error handling is comprehensive and user-friendly

### Technical Requirements

1. ✅ Component follows existing patterns and conventions
2. ✅ Type-safe props and state management
3. ✅ Proper message handling with backend
4. ✅ Accessible UI with proper ARIA labels
5. ✅ Responsive design works across screen sizes

### User Experience

1. ✅ Clear differentiation from regular OpenAI provider
2. ✅ Intuitive onboarding flow
3. ✅ Helpful guidance and documentation
4. ✅ Immediate visual feedback for all actions
5. ✅ Professional appearance consistent with VS Code

This frontend implementation completes the OpenAI (Pro/Plus) provider feature, providing a clean and user-friendly interface that enforces Codex CLI authentication while maintaining feature parity with the regular OpenAI provider.
