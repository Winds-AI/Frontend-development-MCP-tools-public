# Research Topics & Future Ideas

This document contains research findings and potential future enhancements for the Browser Tools MCP Extension.

## Dynamic Tool Updates in MCP

### Research Finding
**Source**: [MCP TypeScript SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)

MCP tools can be **dynamically updated at runtime** without requiring application restarts. This includes:

- ✅ **Tool descriptions** can be updated dynamically
- ✅ **Input schemas** can be modified at runtime  
- ✅ **Tool availability** can be toggled (enable/disable)
- ✅ **Automatic notifications** are sent to clients when tools change
- ✅ **Complete tool removal** is possible

### ⚠️ **Critical Limitation: Cursor MCP Client Capabilities**

**Source**: [Official MCP Clients Documentation](https://modelcontextprotocol.io/clients)

**Cursor MCP Client Support Matrix:**
| Feature | Cursor Support |
|---------|----------------|
| **Resources** | ❌ |
| **Prompts** | ❌ |
| **Tools** | ✅ |
| **Discovery** | ❌ |
| **Sampling** | ❌ |
| **Roots** | ❌ |
| **Elicitation** | ❓ |

**Key Implications:**
- ✅ **Tools Only** - Cursor only supports basic tool calling
- ❌ **No Discovery** - No support for `listChanged` notifications or server discovery
- ❌ **No Dynamic Updates** - Tool descriptions are fetched once on connection
- ❌ **No Resources/Prompts** - Limited to tool functionality only

**Practical Impact**: 
- Dynamic tool updates **will never work** with Cursor/Kiro
- Tool descriptions must be **set correctly at server startup**
- Any runtime changes require **MCP server restart** to be visible

### Implementation Example
```typescript
// Store reference to tool for dynamic updates
const myTool = server.tool("toolName", "description", schema, handler);

// Update tool at runtime
myTool.update({
  description: "New dynamic description",
  paramSchema: newSchema
});

// Enable/disable tools
myTool.disable();
myTool.enable();

// Remove tool completely
myTool.remove();
```

### Current Implementation
- **Navigate Tool**: Dynamically updates description to include project-specific routes file path
- **Route Reference**: Shows `ROUTES_FILE_PATH` from project configuration

## Future Brainstorming Ideas

### 1. Context-Aware Tool Descriptions
- **API Tools**: Update descriptions based on available Swagger/OpenAPI endpoints
- **Database Tools**: Show available tables/schemas dynamically
- **File Tools**: Display current project structure in descriptions

### 2. Adaptive Tool Availability
- **Environment-Based**: Enable/disable tools based on development vs production
- **Permission-Based**: Show different tools based on user roles
- **Project-Type**: Different tool sets for React vs Vue vs Angular projects

### 3. Smart Tool Suggestions
- **Usage Patterns**: Prioritize frequently used tools in descriptions
- **Context Switching**: Update tool relevance based on current file/directory
- **Error Recovery**: Suggest alternative tools when one fails

### 4. Dynamic Schema Updates
- **API Discovery**: Update input schemas based on live API documentation
- **Configuration Changes**: Modify tool parameters when project config changes
- **Version Compatibility**: Adapt schemas for different framework versions

### 5. Real-time Tool Enhancement
- **Live Documentation**: Pull latest docs and update tool descriptions
- **Status Monitoring**: Show tool availability based on service health
- **Performance Metrics**: Include response time info in tool descriptions

### 6. Collaborative Features
- **Team Preferences**: Share and sync tool configurations across team
- **Usage Analytics**: Track which tools are most effective
- **Custom Tool Creation**: Allow users to create project-specific tools

## Implementation Notes

### Key Benefits
- **Better UX**: Tools stay relevant and informative
- **Reduced Errors**: AI agents get accurate, up-to-date information
- **Flexibility**: Adapt to different project types and workflows
- **Efficiency**: No need to restart servers for tool updates

### Technical Considerations
- **Performance**: Frequent updates should be optimized
- **Caching**: Consider caching strategies for expensive operations
- **Error Handling**: Graceful fallbacks when dynamic updates fail
- **Memory Management**: Clean up resources when tools are removed

## Next Steps

1. **Experiment** with more dynamic tool scenarios
2. **Measure Impact** of dynamic descriptions on AI agent accuracy
3. **Gather Feedback** from users on most valuable dynamic features
4. **Prototype** advanced ideas like context-aware tool availability
5. **Document** best practices for dynamic tool management

---

*This document will be updated as we explore and implement new dynamic tool capabilities.*