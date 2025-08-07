/**
 * Refactor Temp: Tool — inspectSelectedElementCss
 * Stateless helpers to format element debugging info as rich text for AI consumption.
 * Keep HTTP bindings and selectedElement storage in browser-connector.ts.
 */

export interface LayoutDebugInfo {
  issues?: string[];
  suggestions?: string[];
  isFlexItem?: boolean;
  isGridItem?: boolean;
  isFlexContainer?: boolean;
  isGridContainer?: boolean;
}

export interface ParentContext {
  tagName?: string;
  display?: string;
  isFlexContainer?: boolean;
  isGridContainer?: boolean;
}

export interface SelectedElementPayload {
  tagName?: string;
  id?: string;
  className?: string;
  layoutDebug?: LayoutDebugInfo;
  parentContext?: ParentContext;
  // Additional fields from the extension are preserved but ignored by formatter
  [key: string]: any;
}

/**
 * Format the selected element payload into a human-friendly, AI-friendly text block.
 */
export function formatSelectedElementDebugText(
  json: SelectedElementPayload
): string {
  let formattedContent = "🔍 **Enhanced Element Debugging Context**\n\n";

  if (json && json.tagName) {
    formattedContent += `**Element**: ${json.tagName}${
      json.id ? "#" + json.id : ""
    }${
      json.className
        ? "." + json.className.split(" ").slice(0, 2).join(".")
        : ""
    }\n\n`;
  }

  if (json?.layoutDebug?.issues && json.layoutDebug.issues.length > 0) {
    formattedContent += "🚨 **Critical Issues Detected**:\n";
    json.layoutDebug.issues.forEach((issue: string) => {
      formattedContent += `• ${issue}\n`;
    });
    formattedContent += "\n";
  }

  if (
    json?.layoutDebug?.suggestions &&
    json.layoutDebug.suggestions.length > 0
  ) {
    formattedContent += "💡 **Suggested Fixes**:\n";
    json.layoutDebug.suggestions.forEach((s: string) => {
      formattedContent += `• ${s}\n`;
    });
    formattedContent += "\n";
  }

  if (json.parentContext || json.layoutDebug) {
    formattedContent += "📐 **Layout Context**:\n";
    if (json.parentContext) {
      formattedContent += `• Parent: ${
        json.parentContext.tagName ?? "unknown"
      } (${json.parentContext.display ?? "unknown"})`;
      if (json.parentContext.isFlexContainer)
        formattedContent += " [Flex Container]";
      if (json.parentContext.isGridContainer)
        formattedContent += " [Grid Container]";
      formattedContent += "\n";
    }
    if (json.layoutDebug) {
      if (json.layoutDebug.isFlexItem)
        formattedContent += "• This is a flex item\n";
      if (json.layoutDebug.isGridItem)
        formattedContent += "• This is a grid item\n";
      if (json.layoutDebug.isFlexContainer)
        formattedContent += "• This is a flex container\n";
      if (json.layoutDebug.isGridContainer)
        formattedContent += "• This is a grid container\n";
    }
    formattedContent += "\n";
  }

  formattedContent += "📄 **Full Debug Data Below**:\n";
  return formattedContent + JSON.stringify(json, null, 2);
}
