import { Prisma } from "@prisma/client"
import type { Reply as DbReply } from "@prisma/client"
import prisma from "@/lib/db"
import { parsePost, normalizeUsername } from "./postkey"

// KeeLead is the bookkeeper: nothing here refuses an action because of business rules
// (duplicates, frequency, dnc). Errors are only for malformed input.

export const REPLY_STATUSES = ["draft", "sent", "failed"]
export const MAX_SEEN_INPUTS = 100

export class InputError extends Error {}

export interface ReplyView {
  id: string
  postKey: string
  postUrl: string
  targetUsername: string
  leadId: string
  text: string
  status: string
  sentAt: string
  replyUrl: string
  note: string
  client: string
  createdAt: string
}

export function toReplyView(r: DbReply): ReplyView {
  return {
    id: r.id,
    postKey: r.postKey,
    postUrl: r.postUrl,
    targetUsername: r.targetUsername,
    leadId: r.leadId ?? "",
    text: r.text,
    status: r.status,
    sentAt: r.sentAt?.toISOString() ?? "",
    replyUrl: r.replyUrl ?? "",
    note: r.note ?? "",
    client: r.client,
    createdAt: r.createdAt.toISOString(),
  }
}

function parseTags(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

interface LeadRow {
  id: string
  status: string
  tags: string | null
}

// Leads whose firstName equals one of the usernames, ignoring case (Threads leads are stored with firstName = username)
async function leadsByAuthors(usernames: string[]): Promise<(LeadRow & { firstName: string })[]> {
  if (usernames.length === 0) return []
  return prisma.$queryRaw<(LeadRow & { firstName: string })[]>(
    Prisma.sql`SELECT id, status, tags, firstName FROM Lead WHERE LOWER(firstName) IN (${Prisma.join(usernames)})`
  )
}

// Lead saved for this exact post: website holds the permalink (any host/query spelling)
async function leadsByPosts(refs: ReturnType<typeof parsePost>[]): Promise<(LeadRow & { website: string | null })[]> {
  const conditions = refs.map((r) =>
    r.code ? { website: { contains: `/post/${r.code}` } } : { website: r.input.trim() }
  )
  if (conditions.length === 0) return []
  return prisma.lead.findMany({
    where: { OR: conditions },
    select: { id: true, status: true, tags: true, website: true },
    orderBy: { createdAt: "asc" },
  })
}

export interface KnownPost {
  input: string
  lead?: { id: string; status: string; tags: string[] }
  replies?: { status: string; sentAt?: string }[]
  authorLastRepliedAt?: string
  dnc?: boolean
}

// What KeeLead remembers about a list of posts. Information only: no verdicts, no writes.
// Fixed number of queries (4), regardless of how many inputs.
export async function seenCheck(inputs: string[]): Promise<{ new: string[]; known: KnownPost[] }> {
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > MAX_SEEN_INPUTS) {
    throw new InputError(`posts must contain 1-${MAX_SEEN_INPUTS} items`)
  }
  const refs = inputs.map((i) => parsePost(String(i)))
  const usernames = Array.from(new Set(refs.map((r) => r.username).filter((u): u is string => !!u)))

  const [postLeads, authorLeads, postReplies, accountReplies] = await Promise.all([
    leadsByPosts(refs),
    leadsByAuthors(usernames),
    prisma.reply.findMany({
      where: { postKey: { in: refs.map((r) => r.postKey) } },
      select: { postKey: true, status: true, sentAt: true },
      orderBy: { createdAt: "asc" },
    }),
    usernames.length
      ? prisma.reply.groupBy({
          by: ["targetUsername"],
          where: { targetUsername: { in: usernames }, status: "sent", sentAt: { not: null } },
          _max: { sentAt: true },
        })
      : Promise.resolve([]),
  ])

  const dncAuthors = new Set(
    authorLeads.filter((l) => parseTags(l.tags).includes("dnc")).map((l) => l.firstName.toLowerCase())
  )
  const lastReplied = new Map(accountReplies.map((a) => [a.targetUsername, a._max.sentAt]))

  const result: { new: string[]; known: KnownPost[] } = { new: [], known: [] }
  for (const ref of refs) {
    const item: KnownPost = { input: ref.input }

    const leadRow = postLeads.find((l) =>
      ref.code ? l.website?.includes(`/post/${ref.code}`) : l.website === ref.input.trim()
    )
    if (leadRow) item.lead = { id: leadRow.id, status: leadRow.status, tags: parseTags(leadRow.tags) }

    const replies = postReplies.filter((r) => r.postKey === ref.postKey)
    if (replies.length) {
      item.replies = replies.map((r) => ({ status: r.status, ...(r.sentAt ? { sentAt: r.sentAt.toISOString() } : {}) }))
    }

    const last = ref.username ? lastReplied.get(ref.username) : null
    if (last) item.authorLastRepliedAt = last.toISOString()

    if ((ref.username && dncAuthors.has(ref.username)) || item.lead?.tags.includes("dnc")) item.dnc = true

    if (item.lead || item.replies || item.authorLastRepliedAt || item.dnc) result.known.push(item)
    else result.new.push(ref.input)
  }
  return result
}

export interface ReplyInput {
  postUrl?: string
  text?: string
  status?: string
  replyUrl?: string
  note?: string
  leadId?: string
  sentAt?: string
  client?: string
}

// Agents send arbitrary JSON; reject wrong types as bad input instead of crashing with a 500
function assertStrings(obj: object, keys: string[]) {
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k]
    if (v !== undefined && typeof v !== "string") throw new InputError(`${k} must be a string`)
  }
}

function parseDate(raw: string, field: string): Date {
  const d = new Date(raw)
  if (isNaN(d.getTime())) throw new InputError(`${field} is not a valid date`)
  return d
}

// A sent reply moves a brand-new lead to "contacted"; any other lead status is left alone
async function bumpLead(leadId: string | null) {
  if (leadId) await prisma.lead.updateMany({ where: { id: leadId, status: "new" }, data: { status: "contacted" } })
}

export async function createReply(input: ReplyInput) {
  assertStrings(input, ["postUrl", "text", "status", "replyUrl", "note", "leadId", "sentAt", "client"])
  const postUrl = input.postUrl?.trim()
  const text = input.text?.trim()
  const status = input.status ?? "sent"
  if (!postUrl) throw new InputError("postUrl is required")
  if (!text) throw new InputError("text is required")
  if (!REPLY_STATUSES.includes(status)) throw new InputError(`status must be one of ${REPLY_STATUSES.join(", ")}`)
  const sentAtInput = input.sentAt ? parseDate(input.sentAt, "sentAt") : null

  const ref = parsePost(postUrl)
  let leadId = input.leadId?.trim() || null
  if (!leadId) leadId = (await leadsByPosts([ref]))[0]?.id ?? null

  const row = await prisma.reply.create({
    data: {
      postKey: ref.postKey,
      postUrl,
      targetUsername: ref.username ?? "",
      leadId,
      text,
      status,
      sentAt: status === "sent" ? sentAtInput ?? new Date() : sentAtInput,
      replyUrl: input.replyUrl?.trim() || null,
      note: input.note?.trim() || null,
      client: input.client?.trim() || "api",
    },
  })
  if (status === "sent") await bumpLead(leadId)

  // Information for the agent; never a reason to refuse
  const [otherForPost, otherForAccount, authorLeads] = await Promise.all([
    prisma.reply.count({ where: { postKey: ref.postKey, id: { not: row.id } } }),
    ref.username ? prisma.reply.count({ where: { targetUsername: ref.username, id: { not: row.id } } }) : Promise.resolve(0),
    ref.username ? leadsByAuthors([ref.username]) : Promise.resolve([]),
  ])
  const linkedLead = leadId ? await prisma.lead.findUnique({ where: { id: leadId }, select: { tags: true } }) : null
  const dnc = authorLeads.some((l) => parseTags(l.tags).includes("dnc")) || parseTags(linkedLead?.tags ?? null).includes("dnc")

  return {
    reply: toReplyView(row),
    otherRepliesForPost: otherForPost,
    otherRepliesForAccount: otherForAccount,
    ...(dnc ? { dnc: true } : {}),
  }
}

export interface ReplyPatch {
  status?: string
  text?: string
  replyUrl?: string
  note?: string
  sentAt?: string
}

// Returns null when the id does not exist
export async function updateReply(id: string, patch: ReplyPatch) {
  assertStrings(patch, ["status", "text", "replyUrl", "note", "sentAt"])
  const existing = await prisma.reply.findUnique({ where: { id } })
  if (!existing) return null

  if (patch.status !== undefined && !REPLY_STATUSES.includes(patch.status)) {
    throw new InputError(`status must be one of ${REPLY_STATUSES.join(", ")}`)
  }
  if (patch.text !== undefined && !patch.text.trim()) throw new InputError("text cannot be empty")

  const status = patch.status ?? existing.status
  let sentAt = patch.sentAt !== undefined ? (patch.sentAt ? parseDate(patch.sentAt, "sentAt") : null) : existing.sentAt
  if (status === "sent" && !sentAt) sentAt = new Date()

  const row = await prisma.reply.update({
    where: { id },
    data: {
      status,
      sentAt,
      ...(patch.text !== undefined ? { text: patch.text.trim() } : {}),
      ...(patch.replyUrl !== undefined ? { replyUrl: patch.replyUrl.trim() || null } : {}),
      ...(patch.note !== undefined ? { note: patch.note.trim() || null } : {}),
    },
  })
  if (status === "sent") await bumpLead(row.leadId)
  return toReplyView(row)
}

export async function listReplies(filters: { status?: string | null; username?: string | null; limit?: number }) {
  const limit = Math.min(Math.max(filters.limit || 50, 1), 200)
  const rows = await prisma.reply.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.username ? { targetUsername: normalizeUsername(filters.username) } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  return rows.map(toReplyView)
}
