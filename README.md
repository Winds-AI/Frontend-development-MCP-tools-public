# Autonomous Frontend Browser Tools (AFBT)

**🚀 Optimized for Autonomous AI-Powered Frontend Development Workflows**

- Autonomous Frontend Browser Tools enables AI tools to interact with your browser for enhanced development capabilities. This document provides an overview of the available tools within the MCP server. For setup instructions, please refer to `SETUP_GUIDE.md` in docs folder.
- For future plans refer to `FUTURE_PLANS.md`
- For few helper instructions on how to use these tools `HOW_TO_USE.md`
- How it works and architecture is in `PROJECT_OVERVIEW.md`
- For understandig how each tool works `each-tool-explained` directory (Work In Progress).
- For a single, skimmable overview and quick-reference of tools and workflows, see `docs/PROJECT_OVERVIEW.md`.

## Prerequisites

- Node.js 20+ (or 22 LTS) is required. Node 18 lacks the global `File` Web API used by `undici`, which will cause `ReferenceError: File is not defined` when launching via npx.
- Recommended: pnpm (the setup script will install it if missing).

## Quickstart (npx)

1) Start the connector + setup UI

```bash
npx @winds-ai/autonomous-frontend-browser-tools
```

Requires Node ≥ 20. Verify with `node -v`.

- The Browser Connector runs in your terminal (logs remain there)
- A Setup UI opens at `http://127.0.0.1:5055`
- Configure `chrome-extension/projects.json` and `.env` (left column → Environment)
- Click "Save" then "Close" — the UI stops; the connector keeps running

2) Load the Chrome extension (manual once)

- Open `chrome://extensions` → Enable Developer mode → "Load unpacked" → select `chrome-extension/` (the folder is auto-copied on first run)

3) Configure your MCP client (Cursor example)

```json
{
  "mcpServers": {
    "autonomous-frontend-browser-tools": {
      "command": "npx",
      "args": ["-y", "@winds-ai/autonomous-frontend-browser-tools", "afbt-mcp"],
      "env": { "ACTIVE_PROJECT": "my-frontend" }
    }
  }
}
```

4) Open DevTools on your target tab (extension panel) and use tools

### Environment variables

- Preferred: set in `.env` from the Setup UI (Configure tab) or in your shell
- Keys/models supported:
  - `OPENAI_API_KEY` (+ optional `OPENAI_EMBED_MODEL`)
  - `GEMINI_API_KEY` (+ optional `GEMINI_EMBED_MODEL`)

Notes:
- `.env` and `chrome-extension/projects.json` are local-only; they are excluded from npm publish
- Health shows disconnected until DevTools is open on the inspected tab

## Motivation

At this point in time, I think the models are capable of doing a lot of things, but they are not able to do it in a way that is helpful to the user because of a lack of context.

We humans can do tasks accurately because we have a lot of context about the task we are doing, and we can use that context to make decisions.

Too much context also makes it hard for LLMs to make decisions. So, giving the right context at the right time is very important, and this will be the key to making LLMs more helpful to the user. MCP servers are one of the ways to provide context to LLMs at the right time.

One day, I came across AgentDeskAI's repo ([https://github.com/AgentDeskAI/browser-tools-mcp](https://github.com/AgentDeskAI/browser-tools-mcp)). This repo consisted of a Chrome extension and an MCP server. It had tools like get browser logs, get network status, etc. This inspired me, and I started using these tools in my development workflow. I came to the realization that when I am writing code, I am juggling a lot of things and managing this context so I know what to write. So, what if we can provide this context to LLMs at the right time? AgentDeskAI was a huge inspiration and starting point for this project, and that is why you will see that this is a fork of that repository. Though at this moment, I am not using most of the tools they had in their repo except the `getSelectedElement` tool, they do have many interesting tools, and I am planning to use some again depending on how this setup works.

I am a Frontend Developer and Applied AI enthusiast, and I am working on this project to make already good AI coding IDEs better by creating a custom workflow on top of these tools. This workflow allows me to automate my work of frontend development and delegate the tasks to these AI IDEs, and they can autonomously work. This allows me to focus on important tasks like future-proof project setup. Oh yeah, one important thing to note is that currently, this workflow only works if the project is already set up and has basic things like auth context, API calling structure, routing, and how those routes are exposed, etc. All of this context should be set up in AI IDEs. I use Windsurf's Memories to store this context, which allows the agent to retrieve the important memories based on my prompt. You can use Cursor's Rule file also, but I don't know how well this will work because I haven't tried it.

Now, to make Frontend development autonomous, we have to understand what a frontend developer uses to code and how he/she thinks.

A frontend developer uses API documentation, browser, browser logs, browser errors, the ability to make API calls, functional requirement documents, developer tools, and his/her visual capability to see the UI and make decisions. Considering these aspects of frontend development, we can create an MCP server that can provide context to AI IDEs at the right time. So, I made tools that can access all these aspects of frontend development and provide context to AI IDEs at the right time. These tools include: `analyzeApiCalls`, `takeScreenshot`, `getSelectedElement`, `analyzeImageFile`, `ingestFrdDocument`, `getFrdIngestionStatus`, `searchApiDocs`... and more coming soon.

I plan to make such workflows for backend and QA testers also, but primarily I am a frontend guy, so I chose this first. If you are interested in this project, please let me know, and I will be happy to help you. We can create something big and awesome.

---
