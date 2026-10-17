"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Search, Trash2, Mail, Phone, Globe, MapPin, Loader2 } from "lucide-react"

interface Lead {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  company: string
  title: string
  website: string
  location: string
  source: string
  status: string
  score: number
  verified: boolean
  tags: string[]
  notes: string
  metadata: Record<string, unknown>
  createdAt: string
}

const STATUSES = ["new", "contacted", "qualified", "converted", "lost"]

const statusColors: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-400",
  contacted: "bg-yellow-500/20 text-yellow-400",
  qualified: "bg-purple-500/20 text-purple-400",
  converted: "bg-emerald-500/20 text-emerald-400",
  lost: "bg-red-500/20 text-red-400",
}

const displayName = (l: Lead) => [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "(no name)"

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ status: statusFilter })
      if (searchQuery.trim()) params.set("q", searchQuery.trim())
      const res = await fetch(`/api/leads/saved?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setLeads(data.leads)
      setTotal(data.total)
    } catch (e) {
      setError(`Failed to load leads (${e instanceof Error ? e.message : "unknown error"})`)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchQuery])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const toggleSelectAll = () => {
    setSelectedLeads(selectedLeads.size === leads.length ? new Set() : new Set(leads.map((l) => l.id)))
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedLeads)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedLeads(next)
  }

  const deleteSelected = async () => {
    if (!confirm(`Delete ${selectedLeads.size} lead(s)? This cannot be undone.`)) return
    await fetch("/api/leads/saved", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedLeads) }),
    })
    setSelectedLeads(new Set())
    setSelectedLead(null)
    load()
  }

  const setStatus = async (lead: Lead, status: string) => {
    const res = await fetch("/api/leads/saved", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lead.id, status }),
    })
    if (!res.ok) return
    const updated: Lead = (await res.json()).lead
    setSelectedLead(updated)
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
  }

  const postText = selectedLead && typeof selectedLead.metadata.postText === "string" ? selectedLead.metadata.postText : ""

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="text-zinc-400 text-sm mt-1">
          {total} saved leads. Leads are added by your agent through MCP (keelead_save_leads).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search leads..."
            className="pl-9 bg-white/5 border-white/10"
          />
        </div>
        <div className="flex gap-2">
          {["all", ...STATUSES].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === status ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
        {selectedLeads.size > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={deleteSelected}
            className="ml-auto border-red-500/20 text-red-400 text-xs hover:bg-red-500/10"
          >
            <Trash2 className="w-3 h-3 mr-1" /> Delete ({selectedLeads.size})
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Card className="bg-[#0a0a0a] border-white/10">
        <CardContent className="p-0">
          {loading && leads.length === 0 ? (
            <div className="p-10 flex justify-center text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : leads.length === 0 ? (
            <div className="p-10 text-center text-zinc-400 text-sm">
              {total === 0 ? "No leads saved yet." : "No leads match the current filter."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left p-3 w-10">
                      <Checkbox checked={selectedLeads.size === leads.length && leads.length > 0} onCheckedChange={toggleSelectAll} />
                    </th>
                    <th className="text-left p-3 text-zinc-400 font-medium">Name</th>
                    <th className="text-left p-3 text-zinc-400 font-medium">Company</th>
                    <th className="text-left p-3 text-zinc-400 font-medium">Contact</th>
                    <th className="text-left p-3 text-zinc-400 font-medium">Source</th>
                    <th className="text-left p-3 text-zinc-400 font-medium">Status</th>
                    <th className="text-left p-3 text-zinc-400 font-medium">Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectedLeads.has(lead.id)} onCheckedChange={() => toggleSelect(lead.id)} />
                      </td>
                      <td className="p-3 font-medium">{displayName(lead)}</td>
                      <td className="p-3 text-zinc-300">{lead.company || "-"}</td>
                      <td className="p-3 text-zinc-400">{lead.email || lead.phone || "-"}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="border-white/10 text-zinc-400 text-xs">
                          {lead.source || "-"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge className={`${statusColors[lead.status] ?? ""} border-0 text-xs`}>{lead.status}</Badge>
                      </td>
                      <td className="p-3 text-zinc-400">{new Date(lead.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedLead && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedLead(null)} />
          <div className="relative w-full max-w-md bg-[#0a0a0a] border-l border-white/10 h-full overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Lead Details</h2>
                <button onClick={() => setSelectedLead(null)} className="text-zinc-400 hover:text-white">
                  ✕
                </button>
              </div>
              <div>
                <h3 className="text-xl font-bold">{displayName(selectedLead)}</h3>
                {(selectedLead.title || selectedLead.company) && (
                  <p className="text-zinc-400">{[selectedLead.title, selectedLead.company].filter(Boolean).join(" at ")}</p>
                )}
              </div>

              {postText && (
                <div className="p-3 rounded-lg bg-white/5 text-sm whitespace-pre-wrap">{postText}</div>
              )}

              {selectedLead.email && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                  <Mail className="w-4 h-4 text-zinc-400" />
                  <span className={selectedLead.verified ? "text-emerald-400" : ""}>{selectedLead.email}</span>
                </div>
              )}
              {selectedLead.phone && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                  <Phone className="w-4 h-4 text-zinc-400" />
                  <span>{selectedLead.phone}</span>
                </div>
              )}
              {selectedLead.website && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                  <Globe className="w-4 h-4 text-zinc-400" />
                  <a href={selectedLead.website} target="_blank" rel="noreferrer" className="text-blue-400 break-all">
                    {selectedLead.website}
                  </a>
                </div>
              )}
              {selectedLead.location && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                  <MapPin className="w-4 h-4 text-zinc-400" />
                  <span>{selectedLead.location}</span>
                </div>
              )}

              {selectedLead.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedLead.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="border-white/10 text-zinc-300">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              <div>
                <p className="text-sm text-zinc-400 mb-2">Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatus(selectedLead, s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        selectedLead.status === s ? statusColors[s] : "text-zinc-400 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
