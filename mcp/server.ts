#!/usr/bin/env tsx
/**
 * KeeLead MCP Server (stdio) — for local use from a checkout of this repo.
 * Remote agents (Grokbot, Hermes) should use the HTTP endpoint instead: POST /api/mcp (see AGENTS.md).
 *
 * Tool definitions live in lib/mcp/tools.ts and are shared with the HTTP endpoint.
 *
 * Usage:
 *   KEELEAD_API_URL=http://localhost:3000 npx tsx mcp/server.ts
 *   KEELEAD_AUTH=user:password   (optional, for deployments behind HTTP Basic Auth)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createKeeleadServer, makeApiCall } from "../lib/mcp/tools"

const api = makeApiCall(process.env.KEELEAD_API_URL || "http://localhost:3000", process.env.KEELEAD_AUTH)

async function main() {
  await createKeeleadServer(api, "stdio").connect(new StdioServerTransport())
  console.error("KeeLead MCP server running on stdio")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
