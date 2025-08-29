# Frontend Development Tools (AFBT)

  <a href="https://glama.ai/mcp/servers/@Winds-AI/Frontend-development-MCP-tools-public">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@Winds-AI/Frontend-development-MCP-tools-public/badge" alt="Browser Tools Extension MCP server" />
</a>

**🚀 Optimized for Autonomous AI-Powered Frontend Development Workflows**

- Autonomous Frontend Browser Tools enables AI coding agents to interact with your browser for autonomous frontend development workflows. This document provides an overview of the available tools within the MCP server.
- For indetail setup instructions, please refer to `SETUP_GUIDE.md` in docs folder, readme has quickstart guide below.
- For future plans refer to `FUTURE_PLANS.md`.
- For few helper instructions on how to use these tools `HOW_TO_USE.md`.
- How it works and architecture is in `PROJECT_OVERVIEW.md`.
- For understandig how each tool works `each-tool-explained` directory.

## Prerequisites
- Node.js 20+ (or 22 LTS) is required. Node 18 lacks the global `File` Web API used by `undici`, which will cause `ReferenceError: File is not defined` when launching via npx.
- Recommended: pnpm (the setup script will install it if missing).

## Quickstart (npx)

1) Make a new folder at your prefered location and then open terminal in that folder

2) Start the connector + setup UI

```bash
npx @winds-ai/autonomous-frontend-browser-tools
```

Requires Node ≥ 20. Verify with `node -v`.

- The Browser Connector runs in your terminal, you can see the logs there.
- A Setup UI opens at `http://127.0.0.1:5055`.
- Configure `projects.json` and `.env` via the Setup UI by taking refrence of the examples given.
- Click "Save" and then remember to close the UI by clicking on "Close" button ( this way it will save background resources) — the UI stops; the connector keeps running.
- Check the folder that you made, it will now have a chrome extension for you to load in chrome and use.

2) Load the Chrome extension (manual once)

- Open `chrome://extensions` → Enable Developer mode → "Load unpacked" → select `chrome-extension/` (npx overlays the packaged folder on updates; click Reload after updates)

3) Configure your MCP client (Cursor example)

```json
{
  "mcpServers": {
    "autonomous-frontend-browser-tools": {
      "command": "npx",
      "args": ["-y", "@winds-ai/autonomous-frontend-browser-tools"],
      "env": {
        "ACTIVE_PROJECT": "my-frontend",
        "AFBT_PROJECTS_JSON": "/absolute/path/to/projects.json",
        "BROWSER_TOOLS_PORT": "3025"
      }
    }
  }
}
```

Notes:
- The single entry auto-detects mode: non-interactive (MCP) vs interactive (Setup UI). You can force with `mcp`/`setup` subcommands.
- Node 20 is used automatically when the system Node is older.

4) Open DevTools on your target tab (localhost:3000 or any other port) and start using tools

### Active Project gotchas

- `api.searchEndpoints` uses header `X-ACTIVE-PROJECT` (set by the MCP layer automatically). If results look wrong, verify the active project.
- Other tools resolve the active project via `ACTIVE_PROJECT` env or `defaultProject` in `projects.json`.
- When switching between projects/IDEs, set `ACTIVE_PROJECT` per IDE instance. you can set project wise mcp.json file in each project folder based on the AI IDE you are using.

### Environment variables ( for generating embeddings of API docs, very minimal cost)

- Preferred: set in `.env` from the Setup UI (Environment tab) or in your shell
- Keys/models supported:
  - `OPENAI_API_KEY` (+ optional `OPENAI_EMBED_MODEL`)
  - `GEMINI_API_KEY` (+ optional `GEMINI_EMBED_MODEL`)

Notes:
- Health shows disconnected until DevTools is open on the inspected tab

### Troubleshooting (quick)

- Extension must be loaded and DevTools open on the tab.
- Server discovery scans ports 3025–3035; override with `BROWSER_TOOLS_PORT` if needed.
- If `api.request` with `includeAuthToken: true` fails, ensure `AUTH_STORAGE_TYPE`, `AUTH_TOKEN_KEY`, and optional `AUTH_ORIGIN` are set.
- If API search returns an embedding mismatch error, reindex via the Setup UI (Embeddings tab).

## Motivation

At this point in time, I think the models are capable of doing a lot of things, but they are not able to do it in a way that is helpful to the user because of a lack of context they have access to.

We humans can do tasks accurately because we have a lot of context about the task we are doing, and we can use that context to make decisions.

Too much context also makes it hard for LLMs to make decisions. So, giving the right context at the right time is very important, and this will be the key to making LLMs more helpful to the user. MCP servers are one of the ways to provide context to LLMs at the right time.

One day, I came across AgentDeskAI's repo ([https://github.com/AgentDeskAI/browser-tools-mcp](https://github.com/AgentDeskAI/browser-tools-mcp)). This repo consisted of a Chrome extension and an MCP server. It had tools like get browser logs, get network status, etc. This inspired me, and I started using these tools in my development workflow. I came to the realization that when I am writing code, I am juggling a lot of things and managing this context in my mind so I know what to write. So, what if we can provide this context to LLMs at the right time? AgentDeskAI was a huge inspiration and starting point for this project, and that is why you will see that this is a fork of that repository. Though at this moment, I am not using most of the tools they had in their repo except the `getSelectedElement` tool, they do have many interesting tools, and I am planning to use some again depending on how this workflow works.

I am a Frontend Developer and Applied AI enthusiast, and I am working on this project to make already good AI coding IDEs better by creating a custom workflow on top of these tools. This workflow allows me to automate my work of frontend development and delegate the tasks to these AI IDEs, and they can autonomously work. This allows me to focus on important tasks like future-proof project setup. Oh yeah, one important thing to note is that currently, this workflow only works if the project is already set up and has basic things like auth context, API calling structure, routing, and how those routes are exposed, etc. All of this context should be set up in AI IDEs. I initially used Windsurf's Memories to store this context, which allowed the agent to retrieve the important memories based on my prompt. Now i have shifted to cursor because windsurf launched it's own browser and in that i can't load my extension so windsurf's internal system prompt conflicts with this workflow. You can use Cursor's Rule files or memories, i prefer rules files in cursor.

Now, to make Frontend development autonomous, we have to understand what a frontend developer uses to code and how he/she thinks.

A frontend developer uses API documentation, browser, browser logs, browser errors, the ability to make API calls, functional requirement documents, developer tools, and his/her visual capability to see the UI and make decisions. Considering these aspects of frontend development, we can create an MCP server that can provide context to AI IDEs at the right time. So, I made tools that can access all these aspects of frontend development and provide context to AI IDEs at the right time. These tools include: `browser.network.inspect`, `browser.screenshot`, `ui.interact`(planned), `browser.console.read`, `api.request`, `api.listTags`, `api.searchEndpoints`, `browser.navigate`... and more coming soon.

I plan to make such workflows for backend and QA testers also, but primarily I am a frontend guy, so I chose this first. If you are interested in this project, please let me know, and I will be happy to help you. We can create something big and awesome.
