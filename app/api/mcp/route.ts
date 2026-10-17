import { NextRequest, NextResponse } from "next/server"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { authenticateMcp, mcpEnabled } from "@/lib/mcp/auth"
import { createKeeleadServer, makeApiCall } from "@/lib/mcp/tools"

// MCP over Streamable HTTP, for remote agents (Grokbot, Hermes). Auth is a per-client bearer token
// (MCP_TOKENS); Traefik routes this path around BasicAuth, so this check is the only gate.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Tools call KeeLead's own REST API on loopback, i.e. inside the container, past Traefik
const SELF_URL = `http://127.0.0.1:${process.env.PORT || 3000}`

async function handle(request: NextRequest) {
  if (!mcpEnabled()) {
    return NextResponse.json({ error: "MCP endpoint is disabled: MCP_TOKENS is not configured" }, { status: 503 })
  }
  const client = authenticateMcp(request.headers.get("authorization"))
  if (!client) {
    return NextResponse.json({ error: "Missing or invalid bearer token" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } })
  }

  // Stateless: a fresh server + transport per request, no session to lose on restart
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  const server = createKeeleadServer(makeApiCall(SELF_URL), client)
  await server.connect(transport)
  return transport.handleRequest(request)
}

export const POST = handle

// Stateless server: no SSE stream to open and no session to close (allowed by the MCP spec)
const notAllowed = () =>
  NextResponse.json({ error: "Method not allowed; use POST" }, { status: 405, headers: { Allow: "POST" } })
export const GET = notAllowed
export const DELETE = notAllowed
