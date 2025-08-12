# PRP: OpenAI (Pro/Plus) Provider - Overview

## Context

This PRP provides the high-level architecture for implementing a new "OpenAI (Pro/Plus)" provider that is distinct from the existing "OpenAI" provider. This new provider will ONLY support "Import from Codex CLI" authentication (no manual API key input) and will import all the same models as the regular OpenAI provider.

## Requirements Analysis

### Key Requirements

1. **Separate Provider Identity**: Create a distinct "OpenAI (Pro/Plus)" provider separate from existing "OpenAI" provider
2. **Codex CLI Only**: Only support "Import from Codex CLI" authentication - no manual API key input
3. **Model Parity**: Import all same models as regular OpenAI provider (`openAiNativeModels`)
4. **Token Validation**: Show visual UI indicators when tokens are valid and working
5. **Clean Separation**: Avoid mixing OAuth and API key validation logic

### Current Architecture Analysis

Based on codebase research:

**Existing Providers:**

- `"openai"` -> `OpenAiHandler` (OpenAI Compatible provider)
- `"openai-native"` -> `OpenAiNativeHandler` (Current OpenAI provider)

**Provider Registration:**

- Types defined in `/packages/types/src/provider-settings.ts`
- API handlers in `/src/api/index.ts` buildApiHandler()
- UI constants in `/webview-ui/src/components/settings/constants.ts`
- Frontend components in `/webview-ui/src/components/settings/providers/`

**Codex CLI Import:**

- Existing functionality in `ClineProvider.handleCodexImport()`
- Message handling via `webviewMessageHandler.ts`
- Frontend integration in `OpenAI.tsx` component

## Architecture Overview

### New Provider Definition

**Provider Name**: `"openai-pro-plus"`  
**Display Label**: `"OpenAI (Pro/Plus)"`  
**Handler Class**: `OpenAiProPlusHandler` (extends existing `OpenAiNativeHandler`)

### Core Components

1. **Backend Provider** (`openai-pro-plus-provider_backend.md`)

    - New provider type registration
    - Handler implementation extending OpenAiNativeHandler
    - Authentication mode restrictions (Codex CLI only)
    - Token validation and status checking

2. **Frontend Integration** (`openai-pro-plus-provider_frontend.md`)
    - New provider option in settings
    - Dedicated UI component for Pro/Plus provider
    - Token status indicators
    - Codex CLI import integration

### Data Model

#### Provider Settings Extension

```typescript
// Add to provider-settings.ts
const openAiProPlusSchema = apiModelIdProviderModelSchema.extend({
	openAiProPlusApiKey: z.string().optional(),
	openAiProPlusBaseUrl: z.string().optional(),
	// Inherit Codex CLI import fields
	openAiChatGptApiKey: z.string().optional(),
	openAiChatGptIdToken: z.string().optional(),
	openAiChatGptRefreshToken: z.string().optional(),
	openAiChatGptLastRefresh: z.string().optional(),
})
```

#### Provider Type Addition

```typescript
// Add to providerNames array
"openai-pro-plus"

// Add to discriminated union
openAiProPlusSchema.merge(z.object({ apiProvider: z.literal("openai-pro-plus") }))
```

### File Structure

#### Files to Create

```
src/api/providers/openai-pro-plus.ts          # New handler class
webview-ui/src/components/settings/providers/
└── OpenAIProPlus.tsx                         # New UI component
```

#### Files to Modify

```
packages/types/src/provider-settings.ts       # Add provider type
src/api/index.ts                              # Register handler
src/api/providers/index.ts                    # Export handler
webview-ui/src/components/settings/constants.ts # Add to PROVIDERS list
webview-ui/src/components/settings/ApiOptions.tsx # Add UI component case
src/core/webview/webviewMessageHandler.ts     # Add message handlers
src/core/webview/ClineProvider.ts             # Add Pro/Plus import methods
```

### Implementation Strategy

#### Backend Handler Approach

```typescript
export class OpenAiProPlusHandler extends OpenAiNativeHandler {
	constructor(options: ApiHandlerOptions) {
		// Force authentication mode to 'chatgpt' for Pro/Plus provider
		super({
			...options,
			openAiAuthMode: "chatgpt",
			// Map Pro/Plus specific settings to base settings
			openAiNativeApiKey: options.openAiChatGptApiKey,
			openAiNativeBaseUrl: options.openAiProPlusBaseUrl || "https://api.openai.com",
		})
	}

	// Override getModel to use same models as openai-native
	override getModel() {
		// Identical to OpenAiNativeHandler but using Pro/Plus settings
		return super.getModel()
	}
}
```

#### Frontend Component Approach

- Create `OpenAIProPlus.tsx` component
- Only show "Import from Codex CLI" functionality
- Display token status indicators
- Remove manual API key input fields
- Show visual validation states

### Security Considerations

1. **Authentication Restriction**: Only allow Codex CLI authentication
2. **Token Validation**: Implement token health checking
3. **SecretStorage**: Use same secure storage patterns as existing OpenAI provider
4. **Error Handling**: Clear error messages for authentication failures

### Integration Points

#### Existing Codex CLI Import

- Leverage existing `handleCodexImport()` functionality
- Extend to work with Pro/Plus provider settings
- Maintain compatibility with existing patterns

#### Token Status Validation

- Implement token validation endpoint calls
- Show visual indicators (green checkmark, red X, loading spinner)
- Update UI based on token validity

#### Model Management

- Use identical model list as `openai-native` provider
- Ensure feature parity (reasoning, verbosity, etc.)
- Maintain same API compatibility

## Implementation Order

### Phase 1: Backend Foundation (`openai-pro-plus-provider_backend.md`)

1. Add provider type to type definitions
2. Create OpenAiProPlusHandler class
3. Register handler in API router
4. Extend Codex CLI import for Pro/Plus provider
5. Implement token validation logic

### Phase 2: Frontend Integration (`openai-pro-plus-provider_frontend.md`)

1. Add provider to constants and UI lists
2. Create OpenAIProPlus.tsx component
3. Integrate Codex CLI import UI
4. Add token status indicators
5. Update settings routing logic

### Phase 3: Testing & Validation

1. Unit tests for handler functionality
2. UI component testing
3. Integration testing with Codex CLI import
4. Manual validation of token status indicators

## Validation Gates

### Backend PRP Validation

```bash
# TypeScript compilation
npm run build

# Provider tests
npm test -- src/api/providers/__tests__/openai-pro-plus.spec.ts

# Type checking
npx tsc --noEmit

# Integration tests
npm test -- --testPathPattern="openai.*pro.*plus"
```

### Frontend PRP Validation

```bash
# UI compilation
npm run build

# Component tests
npm test -- --testPathPattern="OpenAIProPlus"

# Linting
npm run lint

# Type checking
npx tsc --noEmit --project webview-ui/tsconfig.json
```

## Success Criteria

### Functional Requirements

1. **Provider Separation**: Distinct "OpenAI (Pro/Plus)" provider appears in settings
2. **Authentication Restriction**: Only Codex CLI import available, no manual API key input
3. **Model Parity**: All openai-native models available in Pro/Plus provider
4. **Token Validation**: Visual indicators show token status (valid/invalid/loading)
5. **Feature Compatibility**: Same capabilities as openai-native (reasoning, verbosity, etc.)

### Technical Requirements

1. **Type Safety**: All provider settings properly typed and validated
2. **Code Reuse**: Maximum reuse of existing OpenAiNativeHandler logic
3. **Clean Architecture**: Clear separation between regular and Pro/Plus providers
4. **Error Handling**: Graceful handling of authentication and validation errors

### User Experience

1. **Clear Differentiation**: Users understand difference between OpenAI and OpenAI (Pro/Plus)
2. **Simple Onboarding**: Easy Codex CLI import process
3. **Status Visibility**: Clear visual feedback on authentication status
4. **Consistent Behavior**: Same model behavior as regular OpenAI provider

## Risk Mitigation

1. **Code Duplication**: Minimize by extending existing handler classes
2. **Authentication Confusion**: Clear UI labeling and messaging
3. **Token Management**: Reuse existing SecretStorage patterns
4. **Model Inconsistency**: Share model definitions between providers
5. **Breaking Changes**: Maintain backward compatibility with existing providers

## External Dependencies

### Documentation

- OpenAI API Documentation: https://platform.openai.com/docs/api-reference
- VS Code Extension API: https://code.visualstudio.com/api
- Codex CLI Documentation: https://github.com/openai/codex-cli

### Existing Codebase Patterns

- Provider architecture in `/src/api/providers/`
- Settings UI patterns in `/webview-ui/src/components/settings/`
- Codex CLI import in `ClineProvider.handleCodexImport()`
- SecretStorage usage in existing OpenAI provider

This overview serves as the foundation for the detailed implementation PRPs that follow.
