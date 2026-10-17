#!/usr/bin/env tsx
/**
 * KeeLead MCP Server — Model Context Protocol
 * 
 * Exposes KeeLead's lead generation capabilities as MCP tools
 * for AI agents like OpenClaw, Claude Code, Cursor, LangChain, etc.
 * 
 * 57 data sources • 10 tools • 5 resources • 4 prompts
 * 
 * Usage:
 *   npx tsx mcp/server.ts
 *   
 * Or with API URL:
 *   KEELEAD_API_URL=http://localhost:3000 npx tsx mcp/server.ts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

const API_URL = process.env.KEELEAD_API_URL || "http://localhost:3000"
// Optional "user:password" for deployments behind HTTP Basic Auth (e.g. Traefik)
const AUTH = process.env.KEELEAD_AUTH

// Helper to call KeeLead API
async function apiCall(path: string, method: string = "GET", body?: unknown) {
  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(AUTH ? { Authorization: `Basic ${Buffer.from(AUTH).toString("base64")}` } : {}),
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

// Create MCP server
const server = new Server(
  { name: "keelead", version: "2.0.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
)

// ─── TOOLS ───────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "keelead_search_leads",
      description: "Search for LOCAL BUSINESS leads (cafes, restaurants, shops, offices...) via OpenStreetMap, plus GitHub users and DuckDuckGo. Returns real name/phone/address/website where OpenStreetMap has them. Not suited to finding people by job title. Results are not saved until keelead_save_leads.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language search query (e.g., 'Find 50 SaaS founders in San Francisco')" },
          count: { type: "number", description: "Maximum number of results to return (default: 25)" },
          location: { type: "string", description: "Filter by location" },
          industry: { type: "string", description: "Filter by industry" },
          sources: { type: "array", items: { type: "string" }, description: "Specific source IDs to search (e.g., ['linkedin', 'crunchbase'])" },
        },
        required: ["query"],
      },
    },
    {
      name: "keelead_verify_email",
      description: "Verify email addresses with 10-layer verification: syntax (RFC 5322), domain existence, MX records, disposable detection (30+ providers), role-based detection, typo suggestion, SMTP check, catch-all detection, spam trap detection, free provider detection. Returns score 0-100.",
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
      description: "Generate candidate email addresses for a person at a domain (first.last@, first@, f.last@...). These are GUESSES, not confirmed addresses: run keelead_verify_email on them, and note SMTP-level confirmation is often impossible.",
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
      description: "List the data sources KeeLead has registered. Most of the 57 need third-party API keys or are not wired up; only OpenStreetMap, GitHub, DuckDuckGo and (with THREADS_ACCESS_TOKEN) Threads return real data through the search tools.",
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
      description: "Search public Threads posts by keyword through the official Threads API. Each result is a post author (username + profile URL + post text + permalink); Threads never exposes email or phone. Requires THREADS_ACCESS_TOKEN on the server. Results are NOT saved until keelead_save_leads is called.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keyword(s) or tag to search, e.g. 'butuh jasa website'" },
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
      description: "Save leads (e.g. from keelead_search_threads or keelead_search_leads) into the KeeLead database so they show up in the dashboard. Duplicates (same email, or same website/permalink) are skipped.",
      inputSchema: {
        type: "object",
        properties: {
          leads: { type: "array", items: { type: "object" }, description: "Lead objects exactly as returned by the search tools (max 200)" },
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
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    let result: unknown

    switch (name) {
      case "keelead_search_leads": {
        result = await apiCall("/leads", "POST", {
          query: args?.query,
          count: args?.count || 25,
          location: args?.location,
          industry: args?.industry,
          sources: args?.sources,
        })
        break
      }
      case "keelead_verify_email": {
        result = await apiCall("/verify", "POST", {
          email: args?.email,
          emails: args?.emails,
        })
        break
      }
      case "keelead_email_pattern": {
        result = await apiCall("/enrich/patterns", "POST", args)
        break
      }
      case "keelead_list_sources": {
        result = await apiCall("/sources", "GET")
        break
      }
      case "keelead_search_threads": {
        result = await apiCall("/threads/search", "POST", args)
        break
      }
      case "keelead_save_leads": {
        result = await apiCall("/leads/saved", "POST", { leads: args?.leads })
        break
      }
      case "keelead_list_saved_leads": {
        const qs = new URLSearchParams()
        for (const key of ["status", "source", "q", "limit"]) {
          if (args?.[key] !== undefined) qs.set(key, String(args[key]))
        }
        result = await apiCall(`/leads/saved?${qs}`, "GET")
        break
      }
      case "keelead_update_lead": {
        result = await apiCall("/leads/saved", "PATCH", args)
        break
      }
      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    }
  }
})

// ─── RESOURCES ───────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "keelead://leads",
      name: "Lead Database",
      description: "Access all leads in the KeeLead database",
      mimeType: "application/json",
    },
    {
      uri: "keelead://campaigns",
      name: "Campaigns",
      description: "Access campaign data and stats",
      mimeType: "application/json",
    },
    {
      uri: "keelead://signals",
      name: "Intent Signals",
      description: "Access intent signals (job changes, funding, hiring)",
      mimeType: "application/json",
    },
    {
      uri: "keelead://sources",
      name: "Data Sources (57)",
      description: "List all 57 data sources across 11 categories",
      mimeType: "application/json",
    },
    {
      uri: "keelead://templates",
      name: "Templates",
      description: "Email templates, search templates, export templates",
      mimeType: "application/json",
    },
  ],
}))

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri
  const resource = uri.replace("keelead://", "")
  
  let data: unknown
  switch (resource) {
    case "leads":
      data = await apiCall("/leads?limit=100")
      break
    case "campaigns":
      data = await apiCall("/campaigns")
      break
    case "signals":
      data = await apiCall("/signals")
      break
    case "sources":
      data = await apiCall("/sources")
      break
    case "templates":
      data = await apiCall("/templates")
      break
    default:
      throw new Error(`Unknown resource: ${resource}`)
  }

  return {
    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }],
  }
})

// ─── PROMPTS ─────────────────────────────────────────────────────────────────

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "generate_outreach",
      description: "Generate a personalized outreach email for a lead",
      arguments: [
        { name: "leadName", description: "Lead's full name", required: true },
        { name: "company", description: "Lead's company", required: true },
        { name: "title", description: "Lead's job title", required: true },
        { name: "purpose", description: "Outreach purpose", required: true },
        { name: "tone", description: "Email tone: formal, casual, friendly", required: false },
      ],
    },
    {
      name: "research_and_score",
      description: "Research a company and score it as a lead",
      arguments: [
        { name: "company", description: "Company name to research", required: true },
        { name: "icp", description: "Ideal customer profile (JSON)", required: false },
      ],
    },
    {
      name: "find_similar",
      description: "Find leads similar to a given profile",
      arguments: [
        { name: "profile", description: "Lead profile to match (JSON)", required: true },
        { name: "count", description: "Number of similar leads to find", required: false },
      ],
    },
    {
      name: "enrich_and_outreach",
      description: "Full pipeline: find lead → enrich → score → generate outreach",
      arguments: [
        { name: "query", description: "Who to find", required: true },
        { name: "purpose", description: "Outreach purpose", required: true },
      ],
    },
  ],
}))

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    case "generate_outreach":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Generate a personalized ${args?.tone || "friendly"} outreach email for:\n\nName: ${args?.leadName}\nCompany: ${args?.company}\nTitle: ${args?.title}\nPurpose: ${args?.purpose}\n\nUse KeeLead to research the company first (57 sources available), then craft a highly personalized email referencing specific details about their business.`,
            },
          },
        ],
      }
    case "research_and_score":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Research ${args?.company} using KeeLead's research tool (sources: OpenCorporates, SEC EDGAR, Companies House, Glassdoor, Crunchbase, and more), then score it as a lead.${args?.icp ? ` ICP: ${args.icp}` : ""}\n\nProvide: company overview, tech stack, key people, funding, and a lead score with reasoning.`,
            },
          },
        ],
      }
    case "find_similar":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Find ${args?.count || 10} leads similar to this profile:\n${args?.profile}\n\nUse KeeLead to search across all 57 data sources and return leads with similar titles, industries, and company sizes.`,
            },
          },
        ],
      }
    case "enrich_and_outreach":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Full pipeline: Search for "${args?.query}" using KeeLead (57 sources), enrich the top results with additional data, score them, and generate personalized outreach emails for the top 3.\n\nPurpose: ${args?.purpose}`,
            },
          },
        ],
      }
    default:
      throw new Error(`Unknown prompt: ${name}`)
  }
})

// ─── START ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("KeeLead MCP Server v2.0 running on stdio (57 sources, 10 tools, 5 resources, 4 prompts)")
}

main().catch(console.error)
