// Lead Generation Engine - Multi-source orchestrator
import { LeadIntent } from "@/lib/ai"
import openstreetmapSource from "@/lib/sources/local/openstreetmap"

export interface Lead {
  id?: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  company?: string
  title?: string
  website?: string
  linkedin?: string
  location?: string
  source: string
  confidence: number
  verified?: boolean
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface SearchResult {
  leads: Lead[]
  total: number
  sources: string[]
  query: string
  timestamp: Date
}

// Data source plugin interface
export interface DataSource {
  name: string
  type: "web" | "api" | "scraper" | "database"
  enabled: boolean
  search(query: string, params: Record<string, string>): Promise<Lead[]>
}

// Built-in data source implementations
class WebSearchSource implements DataSource {
  name = "Web Search"
  type = "web" as const
  enabled = true

  async search(query: string, params: Record<string, string>): Promise<Lead[]> {
    // Use DuckDuckGo instant answer API
    try {
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
      )
      const data = await response.json()
      const leads: Lead[] = []
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, 10)) {
          if (topic.Text) {
            const parts = topic.Text.split(" - ")
            const name = parts[0]?.trim() || "Unknown"
            const [firstName, ...rest] = name.split(" ")
            leads.push({
              firstName: firstName || name,
              lastName: rest.join(" ") || "",
              company: params.company || parts[1]?.trim(),
              title: params.title,
              source: "Web Search",
              confidence: 0.6,
              website: topic.FirstURL,
            })
          }
        }
      }
      return leads
    } catch {
      return []
    }
  }
}

class GitHubSource implements DataSource {
  name = "GitHub"
  type = "api" as const
  enabled = true

  async search(query: string, params: Record<string, string>): Promise<Lead[]> {
    try {
      const response = await fetch(
        `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=10`
      )
      const data = await response.json()
      const leads: Lead[] = []
      for (const user of data.items?.slice(0, 10) || []) {
        const nameParts = (user.login || "").split(/[-_.]/)
        leads.push({
          firstName: nameParts[0] || user.login,
          lastName: nameParts.slice(1).join(" ") || "",
          company: params.company,
          title: "Developer",
          website: user.html_url,
          source: "GitHub",
          confidence: 0.5,
          metadata: { avatar: user.avatar_url, type: user.type },
        })
      }
      return leads
    } catch {
      return []
    }
  }
}

class OpenStreetMapLeadSource implements DataSource {
  name = "OpenStreetMap"
  type = "api" as const
  enabled = true

  async search(query: string, params: Record<string, string>): Promise<Lead[]> {
    const q =
      params.location && !query.toLowerCase().includes(params.location.toLowerCase())
        ? `${query} in ${params.location}`
        : query
    return openstreetmapSource.search(q, { count: parseInt(params.count) || 25 })
  }
}

// Source registry
const SOURCES: DataSource[] = [
  new WebSearchSource(),
  new GitHubSource(),
  new OpenStreetMapLeadSource(),
]

// Main search orchestrator
export async function searchLeads(intent: LeadIntent): Promise<SearchResult> {
  const { query, params } = intent
  const enabledSources = SOURCES.filter((s) => s.enabled)
  const allLeads: Lead[] = []

  // Search across all enabled sources
  const promises = enabledSources.map(async (source) => {
    try {
      return await source.search(query, params)
    } catch {
      return []
    }
  })

  const results = await Promise.all(promises)
  for (const leads of results) {
    allLeads.push(...leads)
  }

  // Deduplicate by email
  const seen = new Set<string>()
  const uniqueLeads = allLeads.filter((lead) => {
    const key = lead.email || `${lead.firstName}-${lead.lastName}-${lead.company}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Sort by confidence
  uniqueLeads.sort((a, b) => b.confidence - a.confidence)

  // Limit results
  const limit = parseInt(params.count) || 25
  const limited = uniqueLeads.slice(0, limit)

  return {
    leads: limited,
    total: uniqueLeads.length,
    sources: enabledSources.map((s) => s.name),
    query,
    timestamp: new Date(),
  }
}

// Get all available sources
export function getDataSources(): DataSource[] {
  return SOURCES
}

// Toggle source
export function toggleSource(name: string, enabled: boolean): void {
  const source = SOURCES.find((s) => s.name === name)
  if (source) source.enabled = enabled
}
