// Single definition of KeeLead's MCP tools, shared by the stdio server (mcp/server.ts)
// and the HTTP endpoint (app/api/mcp/route.ts). Relative imports only: mcp/server.ts runs under tsx.
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

export type ApiCall = (path: string, method?: string, body?: unknown) => Promise<unknown>

// Calls KeeLead's own REST API. `auth` is "user:password" for deployments behind HTTP Basic Auth.
export function makeApiCall(baseUrl: string, auth?: string): ApiCall {
  return async (path, method = "GET", body) => {
    try {
      const res = await fetch(`${baseUrl}/api${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: `Basic ${Buffer.from(auth).toString("base64")}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const detail = data && typeof data === "object" && "error" in data ? `: ${(data as { error: string }).error}` : ""
        return { error: `API returned ${res.status} ${res.statusText}${detail}` }
      }
      return data
    } catch (err) {
      return { error: `API call failed: ${err instanceof Error ? err.message : String(err)}` }
    }
  }
}

export const SERVER_INSTRUCTIONS = [
  "KeeLead stores and verifies sales leads for Loox Travel (corporate gatherings, outbound, team building in Bandung/Lembang).",
  "KeeLead has no LLM of its own: you do the judging and writing, KeeLead does the remembering.",
  "Typical flow: find posts yourself -> keelead_save_leads (keep permalink in `website`, post text in `notes`) -> keelead_update_lead as status changes.",
  "Never invent prices or availability. Never store login credentials. Replies to people need the owner's approval.",
].join(" ")

export const TOOLS = [
  {
    name: "keelead_search_leads",
    description:
      "Search for LOCAL BUSINESS leads (cafes, restaurants, shops, offices...) via OpenStreetMap, plus GitHub users and DuckDuckGo. Returns real name/phone/address/website where OpenStreetMap has them. Not suited to finding people by job title. Results are not saved until keelead_save_leads.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query (e.g., 'hotel di Lembang')" },
        count: { type: "number", description: "Maximum number of results to return (default: 25)" },
        location: { type: "string", description: "Filter by location" },
        industry: { type: "string", description: "Filter by industry" },
        sources: { type: "array", items: { type: "string" }, description: "Specific source IDs to search" },
      },
      required: ["query"],
    },
  },
  {
    name: "keelead_verify_email",
    description:
      "Verify email addresses: syntax, domain existence, MX records, disposable and role-based detection. Returns score 0-100. SMTP and catch-all checks are not yet tested.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email address to verify" },
        emails: { type: "array", items: { type: "string" }, description: "Array of emails for bulk verification" },
      },
    },
  },
  {
    name: "keelead_email_pattern",
    description:
      "Generate candidate email addresses for a person at a domain (first.last@, first@, f.last@...). These are GUESSES, not confirmed addresses: run keelead_verify_email on them.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Company domain (e.g., 'acme.com')" },
        firstName: { type: "string", description: "First name to test patterns with" },
        lastName: { type: "string", description: "Last name to test patterns with" },
      },
      required: ["domain", "firstName", "lastName"],
    },
  },
  {
    name: "keelead_list_sources",
    description:
      "List the data sources KeeLead has registered. Most are not wired up; only OpenStreetMap, GitHub, DuckDuckGo and (with THREADS_ACCESS_TOKEN) Threads return real data.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter by category" },
        enabled: { type: "boolean", description: "Filter by enabled status" },
      },
    },
  },
  {
    name: "keelead_search_threads",
    description:
      "Search public Threads posts through the official Threads API. Needs THREADS_ACCESS_TOKEN on the server (and Meta App Review); without it this returns a 503 error. If you can browse Threads yourself, do that and use keelead_save_leads instead. Results are NOT saved until keelead_save_leads is called.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword(s) or tag to search, e.g. 'cari tempat gathering'" },
        limit: { type: "number", description: "Max posts (1-100, default 25)" },
        searchType: { type: "string", enum: ["RECENT", "TOP"], description: "RECENT (default) or TOP" },
        searchMode: { type: "string", enum: ["KEYWORD", "TAG"], description: "KEYWORD (default) or TAG" },
        since: { type: "string", description: "Only posts after this date (Unix timestamp or YYYY-MM-DD)" },
        until: { type: "string", description: "Only posts before this date" },
        authorUsername: { type: "string", description: "Restrict to one author (no @)" },
      },
      required: ["query"],
    },
  },
  {
    name: "keelead_save_leads",
    description:
      "Save leads into the KeeLead database so they show up in the dashboard. Duplicates (same email, or same `website`) are skipped, so put the post permalink in `website` for social leads. Fields: firstName, lastName, email, phone, company, title, website, location, source, confidence (0-1), tags[], notes, metadata{}.",
    inputSchema: {
      type: "object",
      properties: {
        leads: { type: "array", items: { type: "object" }, description: "Lead objects (max 200)" },
      },
      required: ["leads"],
    },
  },
  {
    name: "keelead_list_saved_leads",
    description: "List leads saved in the KeeLead database, optionally filtered.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["new", "contacted", "qualified", "converted", "lost"] },
        source: { type: "string", description: "e.g. 'Threads'" },
        q: { type: "string", description: "Free-text search" },
        limit: { type: "number", description: "Default 100, max 500" },
      },
    },
  },
  {
    name: "keelead_update_lead",
    description: "Update a saved lead's status and/or notes.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["new", "contacted", "qualified", "converted", "lost"] },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
]

export async function callTool(name: string, args: Record<string, unknown> | undefined, api: ApiCall): Promise<unknown> {
  switch (name) {
    case "keelead_search_leads":
      return api("/leads", "POST", {
        query: args?.query,
        count: args?.count || 25,
        location: args?.location,
        industry: args?.industry,
        sources: args?.sources,
      })
    case "keelead_verify_email":
      return api("/verify", "POST", { email: args?.email, emails: args?.emails })
    case "keelead_email_pattern":
      return api("/enrich/patterns", "POST", args)
    case "keelead_list_sources":
      return api("/sources", "GET")
    case "keelead_search_threads":
      return api("/threads/search", "POST", args)
    case "keelead_save_leads":
      return api("/leads/saved", "POST", { leads: args?.leads })
    case "keelead_list_saved_leads": {
      const qs = new URLSearchParams()
      for (const key of ["status", "source", "q", "limit"]) {
        if (args?.[key] !== undefined) qs.set(key, String(args[key]))
      }
      return api(`/leads/saved?${qs}`, "GET")
    }
    case "keelead_update_lead":
      return api("/leads/saved", "PATCH", args)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// `client` names the caller (e.g. "grokbot") for the audit line; stdio passes "stdio".
export function createKeeleadServer(api: ApiCall, client: string): Server {
  const server = new Server(
    { name: "keelead", version: "3.0.0" },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    console.log(JSON.stringify({ event: "mcp_tool_call", client, tool: name, at: new Date().toISOString() }))
    try {
      const result = await callTool(name, args, api)
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      }
    }
  })

  return server
}
