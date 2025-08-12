# PRP: OpenAI ChatGPT Plus/Pro Authentication - Frontend Implementation

## Context

This PRP implements the frontend UI components for OpenAI ChatGPT Plus/Pro authentication, including settings panel modifications, status display, and command palette integration. This PRP builds upon the backend infrastructure defined in `openai-chatgpt-auth_backend.md`.

## Scope

### In Scope

- OpenAI provider settings panel modifications
- Authentication mode toggle and status display
- Sign in/out buttons and action handling
- Command palette integration
- User feedback and error messaging
- Credential refresh UI
- Codex CLI import UI

### Out of Scope

- OAuth flow implementation (handled in backend PRP)
- SecretStorage operations (handled in backend PRP)
- HTTP server and PKCE utilities (handled in backend PRP)

## Implementation Tasks

### 1. Settings Panel Modifications

#### 1.1 Extend OpenAI Compatible Provider (`webview-ui/src/components/settings/providers/OpenAICompatible.tsx`)

**Requirements:**

- Add authentication mode toggle (API Key vs ChatGPT)
- Show appropriate UI based on selected mode
- Display authentication status for ChatGPT mode
- Provide sign in/out/refresh/import actions
- Maintain backward compatibility with existing settings

**Key Implementation Points:**

```typescript
// Add state for auth mode and status
const [authMode, setAuthMode] = useState<"apiKey" | "chatgpt">(apiConfiguration?.openAiAuthMode || "apiKey")
const [chatGptStatus, setChatGptStatus] = useState<{
	isAuthenticated: boolean
	userInfo?: string
	lastRefresh?: string
}>({ isAuthenticated: false })

// Add useEffect to check ChatGPT auth status on mount
useEffect(() => {
	if (authMode === "chatgpt") {
		// Request auth status from extension
		vscode.postMessage({
			type: "requestOpenAIChatGptStatus",
		})
	}
}, [authMode])

// Listen for auth status updates
const onMessage = useCallback((event: MessageEvent) => {
	const message: ExtensionMessage = event.data

	switch (message.type) {
		case "openAiChatGptStatus":
			setChatGptStatus(message.status)
			break
		case "openAiChatGptAuthSuccess":
			setChatGptStatus({ isAuthenticated: true })
			vscode.showInformationMessage("Successfully signed in with ChatGPT!")
			break
		// ... existing cases
	}
}, [])
```

**UI Structure:**

```typescript
return (
  <>
    {/* Authentication Mode Toggle */}
    <div className="mb-4">
      <label className="block font-medium mb-2">
        {t("settings:providers.openai.authMode.label")}
      </label>
      <div className="flex gap-4">
        <label className="flex items-center">
          <input
            type="radio"
            name="openai-auth-mode"
            value="apiKey"
            checked={authMode === "apiKey"}
            onChange={() => handleAuthModeChange("apiKey")}
            className="mr-2"
          />
          {t("settings:providers.openai.authMode.apiKey")}
        </label>
        <label className="flex items-center">
          <input
            type="radio"
            name="openai-auth-mode"
            value="chatgpt"
            checked={authMode === "chatgpt"}
            onChange={() => handleAuthModeChange("chatgpt")}
            className="mr-2"
          />
          {t("settings:providers.openai.authMode.chatgpt")}
        </label>
      </div>
      <div className="text-sm text-vscode-descriptionForeground mt-1">
        {authMode === "apiKey"
          ? t("settings:providers.openai.authMode.apiKeyDescription")
          : t("settings:providers.openai.authMode.chatgptDescription")
        }
      </div>
    </div>

    {/* API Key Mode UI */}
    {authMode === "apiKey" && (
      <>
        <VSCodeTextField
          value={apiConfiguration?.openAiBaseUrl || ""}
          type="url"
          onInput={handleInputChange("openAiBaseUrl")}
          placeholder={t("settings:placeholders.baseUrl")}
          className="w-full">
          <label className="block font-medium mb-1">
            {t("settings:providers.openAiBaseUrl")}
          </label>
        </VSCodeTextField>

        <VSCodeTextField
          value={apiConfiguration?.openAiApiKey || ""}
          type="password"
          onInput={handleInputChange("openAiApiKey")}
          placeholder={t("settings:placeholders.apiKey")}
          className="w-full">
          <label className="block font-medium mb-1">
            {t("settings:providers.apiKey")}
          </label>
        </VSCodeTextField>

        {/* Existing API key mode UI continues... */}
      </>
    )}

    {/* ChatGPT Mode UI */}
    {authMode === "chatgpt" && (
      <>
        {/* Authentication Status */}
        <div className="mb-4 p-3 rounded border">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium">
              {t("settings:providers.openai.chatgpt.status.title")}
            </h4>
            <div className={`px-2 py-1 rounded text-sm ${
              chatGptStatus.isAuthenticated
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {chatGptStatus.isAuthenticated
                ? t("settings:providers.openai.chatgpt.status.authenticated")
                : t("settings:providers.openai.chatgpt.status.notAuthenticated")
              }
            </div>
          </div>

          {chatGptStatus.isAuthenticated && (
            <div className="text-sm text-vscode-descriptionForeground">
              {chatGptStatus.userInfo && (
                <div>{t("settings:providers.openai.chatgpt.status.user")}: {chatGptStatus.userInfo}</div>
              )}
              {chatGptStatus.lastRefresh && (
                <div>
                  {t("settings:providers.openai.chatgpt.status.lastRefresh")}: {
                    new Date(chatGptStatus.lastRefresh).toLocaleString()
                  }
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-4">
          {!chatGptStatus.isAuthenticated ? (
            <VSCodeButton
              appearance="primary"
              onClick={handleSignIn}
              disabled={isLoading}
            >
              {isLoading
                ? t("settings:providers.openai.chatgpt.actions.signingIn")
                : t("settings:providers.openai.chatgpt.actions.signIn")
              }
            </VSCodeButton>
          ) : (
            <>
              <VSCodeButton
                appearance="secondary"
                onClick={handleSignOut}
              >
                {t("settings:providers.openai.chatgpt.actions.signOut")}
              </VSCodeButton>

              <VSCodeButton
                appearance="secondary"
                onClick={handleRefresh}
              >
                {t("settings:providers.openai.chatgpt.actions.refresh")}
              </VSCodeButton>
            </>
          )}

          <VSCodeButton
            appearance="secondary"
            onClick={handleImportFromCodex}
          >
            {t("settings:providers.openai.chatgpt.actions.importFromCodex")}
          </VSCodeButton>
        </div>

        {/* Information Box */}
        <div className="p-3 bg-blue-50 rounded border-l-4 border-blue-400 mb-4">
          <div className="text-sm">
            <div className="font-medium mb-1">
              {t("settings:providers.openai.chatgpt.info.title")}
            </div>
            <div className="text-vscode-descriptionForeground">
              {t("settings:providers.openai.chatgpt.info.description")}
            </div>
            <div className="mt-2">
              <VSCodeButtonLink
                href="https://chatgpt.com/"
                appearance="secondary"
              >
                {t("settings:providers.openai.chatgpt.info.learnMore")}
              </VSCodeButtonLink>
            </div>
          </div>
        </div>
      </>
    )}

    {/* Common settings that apply to both modes */}
    <ModelPicker
      apiConfiguration={apiConfiguration}
      setApiConfigurationField={setApiConfigurationField}
      defaultModelId="gpt-4o"
      models={openAiModels}
      modelIdKey="openAiModelId"
      serviceName="OpenAI"
      serviceUrl="https://platform.openai.com"
      organizationAllowList={organizationAllowList}
      errorMessage={modelValidationError}
    />

    {/* Continue with existing common settings... */}
  </>
)
```

**Action Handlers:**

```typescript
const handleAuthModeChange = useCallback(
	(mode: "apiKey" | "chatgpt") => {
		setAuthMode(mode)
		setApiConfigurationField("openAiAuthMode", mode)

		// Clear any existing auth status when switching modes
		if (mode === "apiKey") {
			setChatGptStatus({ isAuthenticated: false })
		} else {
			// Request current status for ChatGPT mode
			vscode.postMessage({ type: "requestOpenAIChatGptStatus" })
		}
	},
	[setApiConfigurationField],
)

const handleSignIn = useCallback(async () => {
	setIsLoading(true)
	try {
		vscode.postMessage({ type: "openaiSignInChatGPT" })
	} finally {
		setIsLoading(false)
	}
}, [])

const handleSignOut = useCallback(async () => {
	const confirmed = await vscode.window.showWarningMessage(
		t("settings:providers.openai.chatgpt.confirmSignOut"),
		{ modal: true },
		t("common:signOut"),
	)

	if (confirmed === t("common:signOut")) {
		vscode.postMessage({ type: "openaiSignOutChatGPT" })
	}
}, [])

const handleRefresh = useCallback(() => {
	vscode.postMessage({ type: "openaiRefreshCredentials" })
}, [])

const handleImportFromCodex = useCallback(() => {
	vscode.postMessage({ type: "openaiImportFromCodex" })
}, [])
```

### 2. Message Handler Extensions

#### 2.1 WebView Message Types (`src/shared/WebviewMessage.ts`)

**Requirements:**

- Add new message types for ChatGPT authentication actions
- Support auth status requests and responses

**Implementation:**

```typescript
export interface WebviewMessage {
	type: // ... existing types
	| "requestOpenAIChatGptStatus"
		| "openaiSignInChatGPT"
		| "openaiSignOutChatGPT"
		| "openaiRefreshCredentials"
		| "openaiImportFromCodex"
	// ... rest
}
```

#### 2.2 Extension Message Types (`src/shared/ExtensionMessage.ts`)

**Requirements:**

- Add response message types for auth status updates
- Support success/failure notifications

**Implementation:**

```typescript
export interface ExtensionMessage {
	type: // ... existing types
	"openAiChatGptStatus" | "openAiChatGptAuthSuccess" | "openAiChatGptSignOutSuccess" | "openAiChatGptRefreshSuccess"
	// ... rest

	// Add status payload
	status?: {
		isAuthenticated: boolean
		userInfo?: string
		lastRefresh?: string
	}
}
```

#### 2.3 WebView Message Handler (`src/core/webview/webviewMessageHandler.ts`)

**Requirements:**

- Handle ChatGPT auth status requests
- Route authentication action messages to appropriate handlers
- Provide auth status responses

**Implementation:**

```typescript
// Add to webviewMessageHandler switch statement

case "requestOpenAIChatGptStatus": {
  try {
    // Check if user is authenticated by looking for stored tokens
    const apiKey = await provider.context.secrets.get('openAiChatGptApiKey')
    const idToken = await provider.context.secrets.get('openAiChatGptIdToken')
    const lastRefresh = await provider.context.secrets.get('openAiChatGptLastRefresh')

    const isAuthenticated = !!(apiKey && idToken)

    let userInfo: string | undefined
    if (isAuthenticated && idToken) {
      try {
        // Basic JWT parsing to extract user info (email/name)
        const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString())
        userInfo = payload.email || payload.name || 'ChatGPT User'
      } catch {
        userInfo = 'ChatGPT User'
      }
    }

    provider.postMessageToWebview({
      type: "openAiChatGptStatus",
      status: {
        isAuthenticated,
        userInfo,
        lastRefresh: lastRefresh || undefined
      }
    })
  } catch (error) {
    console.error('Error checking ChatGPT auth status:', error)
    provider.postMessageToWebview({
      type: "openAiChatGptStatus",
      status: { isAuthenticated: false }
    })
  }
  break
}

case "openaiSignInChatGPT": {
  await vscode.commands.executeCommand("roo.openaiSignInChatGPT")
  break
}

case "openaiSignOutChatGPT": {
  await vscode.commands.executeCommand("roo.openaiSignOutChatGPT")
  break
}

case "openaiRefreshCredentials": {
  await vscode.commands.executeCommand("roo.openaiRefreshCredentials")
  break
}

case "openaiImportFromCodex": {
  await vscode.commands.executeCommand("roo.openaiImportFromCodex")
  break
}
```

### 3. Internationalization (i18n)

#### 3.1 Add Translation Keys (`webview-ui/src/i18n/locales/en/settings.json`)

**Requirements:**

- Add comprehensive translation keys for all UI text
- Support multiple languages following existing patterns
- Provide clear, user-friendly messaging

**Implementation:**

```json
{
	"providers": {
		"openai": {
			"authMode": {
				"label": "Authentication Method",
				"apiKey": "API Key",
				"chatgpt": "ChatGPT Plus/Pro",
				"apiKeyDescription": "Enter your OpenAI API key manually",
				"chatgptDescription": "Sign in with your ChatGPT Plus or Pro account"
			},
			"chatgpt": {
				"status": {
					"title": "ChatGPT Authentication Status",
					"authenticated": "Signed In",
					"notAuthenticated": "Not Signed In",
					"user": "Signed in as",
					"lastRefresh": "Credentials last refreshed"
				},
				"actions": {
					"signIn": "Sign in with ChatGPT",
					"signingIn": "Signing in...",
					"signOut": "Sign Out",
					"refresh": "Refresh Credentials",
					"importFromCodex": "Import from Codex CLI"
				},
				"info": {
					"title": "About ChatGPT Authentication",
					"description": "Sign in with your ChatGPT Plus or Pro account to use your subscription benefits in Roo Code. This will automatically manage your OpenAI API access.",
					"learnMore": "Learn More About ChatGPT Plus"
				},
				"confirmSignOut": "Are you sure you want to sign out of ChatGPT? This will remove your stored credentials."
			}
		}
	}
}
```

#### 3.2 Extend Other Language Files

**Requirements:**

- Add corresponding translations for all supported languages
- Follow existing translation patterns and tone
- Ensure cultural appropriateness

**Note:** In the actual implementation, all language files would need to be updated with the new keys. For the PRP, we'll focus on the English version as the template.

### 4. Command Palette Integration

#### 4.1 Package.json Command Definitions (`src/package.json`)

**Requirements:**

- Define command palette entries for ChatGPT authentication
- Provide clear titles and categories
- Support keyboard shortcuts if appropriate

**Implementation:**

```json
{
	"contributes": {
		"commands": [
			{
				"command": "roo.openaiSignInChatGPT",
				"title": "Sign in with ChatGPT (OpenAI)",
				"category": "Roo"
			},
			{
				"command": "roo.openaiSignOutChatGPT",
				"title": "Sign out ChatGPT (OpenAI)",
				"category": "Roo"
			},
			{
				"command": "roo.openaiRefreshCredentials",
				"title": "Refresh OpenAI credentials",
				"category": "Roo"
			},
			{
				"command": "roo.openaiImportFromCodex",
				"title": "Import OpenAI credentials from Codex CLI",
				"category": "Roo"
			}
		]
	}
}
```

### 5. User Experience Enhancements

#### 5.1 Loading States and Feedback

**Requirements:**

- Show loading indicators during authentication
- Provide clear success/error messaging
- Handle timeout scenarios gracefully

**Implementation in React Components:**

```typescript
// Add loading state management
const [isLoading, setIsLoading] = useState(false)
const [authError, setAuthError] = useState<string | null>(null)

// Clear error when switching auth modes
useEffect(() => {
  setAuthError(null)
}, [authMode])

// Handle auth errors from extension messages
const onMessage = useCallback((event: MessageEvent) => {
  const message: ExtensionMessage = event.data

  switch (message.type) {
    case "openAiChatGptAuthError":
      setIsLoading(false)
      setAuthError(message.error || "Authentication failed")
      break

    case "openAiChatGptAuthSuccess":
      setIsLoading(false)
      setAuthError(null)
      setChatGptStatus({ isAuthenticated: true })
      break
  }
}, [])

// Display error messages
{authError && (
  <div className="p-3 bg-red-50 border border-red-200 rounded mb-4">
    <div className="text-red-800 text-sm">
      <div className="font-medium mb-1">Authentication Error</div>
      <div>{authError}</div>
    </div>
  </div>
)}
```

#### 5.2 Progressive Disclosure

**Requirements:**

- Hide advanced options behind toggles when not needed
- Show contextual help and documentation links
- Provide onboarding guidance for new users

**Implementation:**

```typescript
// Add state for advanced options
const [showAdvanced, setShowAdvanced] = useState(false)

// Advanced settings section (only for ChatGPT mode)
{authMode === "chatgpt" && (
  <div className="mt-4">
    <button
      type="button"
      onClick={() => setShowAdvanced(!showAdvanced)}
      className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-700"
    >
      <span className={`mr-1 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>
        ▶
      </span>
      Advanced Options
    </button>

    {showAdvanced && (
      <div className="mt-2 pl-4 border-l-2 border-gray-200">
        <div className="text-sm text-vscode-descriptionForeground mb-2">
          These options are for advanced users and typically don't need to be changed.
        </div>

        {/* Base URL override for custom OpenAI endpoints */}
        <VSCodeTextField
          value={apiConfiguration?.openAiBaseUrl || ""}
          type="url"
          onInput={handleInputChange("openAiBaseUrl")}
          placeholder="https://api.openai.com/v1"
          className="w-full">
          <label className="block font-medium mb-1">
            Custom Base URL (optional)
          </label>
        </VSCodeTextField>
      </div>
    )}
  </div>
)}
```

## Validation Gates

### Component Tests

```bash
# Settings component rendering
npm test -- webview-ui/src/components/settings/providers/__tests__/OpenAICompatible.spec.tsx

# Message handling
npm test -- webview-ui/src/__tests__/auth-messages.spec.tsx

# Translation completeness
npm test -- webview-ui/src/i18n/__tests__/settings-translations.spec.tsx
```

### Integration Tests

```bash
# Settings flow end-to-end
npm test -- webview-ui/src/__tests__/openai-settings-flow.spec.tsx

# Command palette integration
npm test -- src/activate/__tests__/command-integration.spec.ts
```

### Manual Testing Checklist

#### Settings Panel

- [ ] Auth mode toggle works correctly
- [ ] UI switches appropriately between API key and ChatGPT modes
- [ ] Status display shows correct authentication state
- [ ] Sign in button triggers OAuth flow
- [ ] Sign out button clears credentials
- [ ] Refresh button updates tokens
- [ ] Import button opens Codex CLI import flow
- [ ] Error states display clearly
- [ ] Loading states work correctly

#### Command Palette

- [ ] All ChatGPT auth commands appear in palette
- [ ] Commands execute correctly
- [ ] Commands provide appropriate user feedback
- [ ] Commands handle errors gracefully

#### User Experience

- [ ] Onboarding flow is clear for new users
- [ ] Error messages are actionable
- [ ] Success notifications appear correctly
- [ ] Settings persist between sessions
- [ ] Help documentation links work

## Error Handling Strategy

### User-Facing Errors

1. **Authentication Failures**

    - Clear explanation of what went wrong
    - Actionable steps to resolve
    - Fallback to API key mode option

2. **Network Issues**

    - Timeout explanations
    - Retry mechanisms
    - Offline state handling

3. **Permission Errors**
    - Platform onboarding guidance
    - Organization setup instructions
    - Contact support options

### Technical Errors

1. **Component Error Boundaries**

    - Graceful degradation
    - Error reporting
    - Recovery mechanisms

2. **State Management**
    - Consistent state updates
    - Rollback on failures
    - Cache invalidation

## Accessibility Considerations

### Keyboard Navigation

- All interactive elements accessible via keyboard
- Logical tab order
- Focus indicators visible

### Screen Readers

- Proper ARIA labels and descriptions
- Status updates announced
- Error messages associated with form fields

### Visual Design

- Sufficient color contrast
- Status indicators not relying solely on color
- Clear visual hierarchy

## Success Criteria

1. **Settings Integration**

    - Authentication mode toggle works correctly
    - Status display accurately reflects auth state
    - All action buttons function properly

2. **User Experience**

    - Clear onboarding for new ChatGPT auth users
    - Intuitive settings panel layout
    - Actionable error messages and recovery paths

3. **Command Integration**

    - All commands available in command palette
    - Commands work from both palette and settings UI
    - Proper user feedback for all actions

4. **Internationalization**

    - All UI text properly translated
    - Cultural appropriateness maintained
    - Consistent terminology across languages

5. **Accessibility**
    - WCAG 2.1 AA compliance
    - Full keyboard accessibility
    - Screen reader compatibility

## Dependencies

- Backend infrastructure from `openai-chatgpt-auth_backend.md`
- VS Code webview UI toolkit components
- Existing settings panel patterns and styling
- i18n translation infrastructure
- VS Code extension messaging system

This frontend PRP provides the complete user interface for the OpenAI ChatGPT authentication feature, building on the backend infrastructure to deliver a seamless user experience.

## Performance Considerations

### Component Optimization

- Memoize expensive calculations
- Debounce API status checks
- Lazy load advanced options

### Bundle Size

- Tree-shake unused OAuth utilities
- Optimize translation bundles
- Use dynamic imports where appropriate

### Network Efficiency

- Cache auth status checks
- Batch message updates
- Minimize redundant API calls

## Security Considerations (Frontend)

### Data Handling

- No sensitive data in component state
- Sanitize all user inputs
- Validate message payloads

### UI Security

- Prevent clickjacking in OAuth flows
- Validate external links
- Secure postMessage communication

This comprehensive frontend PRP completes the user-facing implementation of the OpenAI ChatGPT Plus/Pro authentication feature.
