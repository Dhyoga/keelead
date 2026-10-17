import prisma from "@/lib/db"
import type { Lead as DbLead } from "@prisma/client"

export interface SavedLead {
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

export const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "lost"]

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function toSavedLead(l: DbLead): SavedLead {
  return {
    id: l.id,
    firstName: l.firstName,
    lastName: l.lastName,
    email: l.email ?? "",
    phone: l.phone ?? "",
    company: l.company ?? "",
    title: l.title ?? "",
    website: l.website ?? "",
    location: l.location ?? "",
    source: l.source ?? "",
    status: l.status,
    score: l.score,
    verified: l.verified,
    tags: parseJson<string[]>(l.tags, []),
    notes: l.notes ?? "",
    metadata: parseJson<Record<string, unknown>>(l.metadata, {}),
    createdAt: l.createdAt.toISOString(),
  }
}

export interface LeadInput {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  company?: string
  title?: string
  website?: string
  location?: string
  source?: string
  confidence?: number
  verified?: boolean
  tags?: string[]
  notes?: string
  metadata?: Record<string, unknown>
}

// Saves leads, skipping ones already stored (same email, or same website/permalink when there is no email)
export async function saveLeads(inputs: LeadInput[]) {
  const saved: SavedLead[] = []
  let skipped = 0

  for (const input of inputs) {
    const email = input.email?.trim() || null
    const website = input.website?.trim() || null
    const dupWhere = email ? { email } : website ? { website } : null
    if (dupWhere && (await prisma.lead.findFirst({ where: dupWhere }))) {
      skipped++
      continue
    }

    const row = await prisma.lead.create({
      data: {
        firstName: input.firstName?.trim() || "",
        lastName: input.lastName?.trim() || "",
        email,
        phone: input.phone || null,
        company: input.company || null,
        title: input.title || null,
        website,
        location: input.location || null,
        source: input.source || null,
        score: Math.round((input.confidence ?? 0) * 100),
        verified: input.verified ?? false,
        tags: input.tags?.length ? JSON.stringify(input.tags) : null,
        notes: input.notes || null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    })
    saved.push(toSavedLead(row))
  }

  return { saved, skipped }
}
