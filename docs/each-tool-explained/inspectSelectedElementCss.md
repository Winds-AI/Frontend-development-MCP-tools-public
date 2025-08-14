# inspectSelectedElementCss Tool

## Overview

Retrieves comprehensive debugging information for the element currently selected in Chrome DevTools (Elements panel). Designed to provide enough context for autonomous UI debugging with minimal tool calls.

## Tool Signature

```typescript
inspectSelectedElementCss();
```

No parameters.

## Returns

- Computed CSS context and layout hints
- Parent/child layout context (flex/grid)
- Automatic issue detection and suggestions
- Accessibility notes (if provided by the extension)
- Raw payload from the extension

## Example Output (abridged)

```
🔍 Enhanced Element Debugging Context
Element: BUTTON#save.primary

🚨 Critical Issues Detected:
• Flex item shrinking; consider min-width or flex-shrink: 0

💡 Suggested Fixes:
• Set align-items on parent or justify-content as needed

📐 Layout Context:
• Parent: DIV (flex) [Flex Container]
• This is a flex item

📄 Full Debug Data Below:
{ ...full JSON payload }
```

## Workflow

1) Take a screenshot with `captureBrowserScreenshot({ randomString: "any" })` (optional)
2) Select the problematic element in DevTools
3) Run `inspectSelectedElementCss()` and apply fixes based on suggestions
4) Re-screenshot to verify

## Prerequisites

- Chrome extension installed and connected
- DevTools open, element selected in Elements panel

