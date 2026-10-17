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
  "KeeLead is the bookkeeper for Loox Travel's lead hunting (corporate gatherings, outbound, team building in Bandung/Lembang).",
  "It only records and remembers: it never sends, blocks, limits or approves anything. You decide what to do; KeeLead tells you what it remembers.",
  "Flow: find posts yourself -> keelead_check_seen on their permalinks BEFORE judging them (skip the token cost of posts it already knows) ->",
  "keelead_save_leads for the relevant ones (post permalink in `website`, post text in `notes`) -> after you reply on Threads, keelead_log_reply (with replyUrl).",
  "If someone asks not to be contacted: keelead_save_leads (if not saved yet), then keelead_update_lead with status 'lost', addTags ['dnc'] and a note; keelead_check_seen will then show dnc:true for that author.",
  "Never invent prices or availability. Never store login credentials.",
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
      "Save leads into the KeeLead database so they show up in the dashboard. Duplicates (same email, or same `website`) are skipped, so put the post permalink in `website` for social leads (for Threads, firstName = the username without @). Fields: firstName, lastName, email, phone, company, title, website, location, source, confidence (0-1), tags[], notes, metadata{}.",
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
    description:
      "Update a saved lead's status and/or notes, or add tags (addTags appends, never removes). To mark someone who asked not to be contacted: status 'lost', addTags ['dnc'], notes with the reason.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["new", "contacted", "qualified", "converted", "lost"] },
        notes: { type: "string" },
        addTags: { type: "array", items: { type: "string" }, description: "Tags to add, e.g. ['dnc']" },
      },
      required: ["id"],
    },
  },
  {
    name: "keelead_check_seen",
    description:
      "Ask what KeeLead remembers about up to 100 post permalinks, in one cheap call. Returns { new: [...inputs KeeLead knows nothing about], known: [{ input, lead?, replies?, authorLastRepliedAt?, dnc? }] }. Information only: KeeLead never says skip or don't. Call this BEFORE spending tokens judging posts.",
    inputSchema: {
      type: "object",
      properties: {
        posts: { type: "array", items: { type: "string" }, description: "Post permalinks, e.g. https://www.threads.com/@user/post/ABC123 (1-100)" },
      },
      required: ["posts"],
    },
  },
  {
    name: "keelead_log_reply",
    description:
      "Record a reply you made (or drafted) on a post. Always succeeds for valid input, even if the post/account was replied to before; the response says how many other records exist. Status defaults to 'sent' (then the linked lead goes new -> contacted). Fields: postUrl, text, status (draft|sent|failed), replyUrl, note, leadId, sentAt.",
    inputSchema: {
      type: "object",
      properties: {
        postUrl: { type: "string", description: "Permalink of the post you replied to" },
        text: { type: "string", description: "The reply text" },
        status: { type: "string", enum: ["draft", "sent", "failed"], description: "Default 'sent'" },
        replyUrl: { type: "string", description: "Link to your reply, if you have it" },
        note: { type: "string" },
        leadId: { type: "string", description: "Optional; found automatically from the permalink when the post was saved as a lead" },
        sentAt: { type: "string", description: "ISO time; defaults to now for 'sent'" },
      },
      required: ["postUrl", "text"],
    },
  },
  {
    name: "keelead_update_reply",
    description:
      "Correct a logged reply: status (draft|sent|failed, any change allowed), text, replyUrl, note, sentAt. Setting 'sent' fills sentAt if empty and moves a 'new' lead to 'contacted'.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Reply id from keelead_log_reply / keelead_list_replies" },
        status: { type: "string", enum: ["draft", "sent", "failed"] },
        text: { type: "string" },
        replyUrl: { type: "string" },
        note: { type: "string" },
        sentAt: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "keelead_list_replies",
    description: "List logged replies, newest first. Filters: status, username (no @), limit (default 50, max 200).",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "sent", "failed"] },
        username: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
]

export async function callTool(
  name: string,
  args: Record<string, unknown> | undefined,
  api: ApiCall,
  client = "api"
): Promise<unknown> {
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
      // Only these fields: `tags` (replace-all) stays REST-only so an agent cannot wipe a lead's tags by accident
      return api("/leads/saved", "PATCH", { id: args?.id, status: args?.status, notes: args?.notes, addTags: args?.addTags })
    case "keelead_check_seen":
      return api("/seen", "POST", { posts: args?.posts })
    case "keelead_log_reply":
      return api("/replies", "POST", { ...args, client })
    case "keelead_update_reply": {
      const { id, ...patch } = args ?? {}
      return api(`/replies/${encodeURIComponent(String(id ?? ""))}`, "PATCH", patch)
    }
    case "keelead_list_replies": {
      const qs = new URLSearchParams()
      for (const key of ["status", "username", "limit"]) {
        if (args?.[key] !== undefined) qs.set(key, String(args[key]))
      }
      return api(`/replies?${qs}`, "GET")
    }
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
      const result = await callTool(name, args, api, client)
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
