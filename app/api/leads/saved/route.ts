import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"
import { LEAD_STATUSES, saveLeads, toSavedLead, type LeadInput } from "@/lib/leads/store"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const source = searchParams.get("source")
  const q = searchParams.get("q")?.trim()
  const limit = Math.min(parseInt(searchParams.get("limit") || "100") || 100, 500)

  const rows = await prisma.lead.findMany({
    where: {
      ...(status && status !== "all" ? { status } : {}),
      ...(source ? { source } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { company: { contains: q } },
              { email: { contains: q } },
              { notes: { contains: q } },
              { metadata: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  const total = await prisma.lead.count()
  return NextResponse.json({ leads: rows.map(toSavedLead), total })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const leads: LeadInput[] | undefined = body?.leads
  if (!Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: "leads (non-empty array) is required" }, { status: 400 })
  }
  if (leads.length > 200) {
    return NextResponse.json({ error: "max 200 leads per request" }, { status: 400 })
  }
  const { saved, skipped } = await saveLeads(leads)
  return NextResponse.json({ saved: saved.length, skipped, leads: saved })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: "id is required" }, { status: 400 })
  if (body.status !== undefined && !LEAD_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of ${LEAD_STATUSES.join(", ")}` }, { status: 400 })
  }

  try {
    const row = await prisma.lead.update({
      where: { id: body.id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(Array.isArray(body.tags) ? { tags: JSON.stringify(body.tags) } : {}),
      },
    })
    return NextResponse.json({ lead: toSavedLead(row) })
  } catch {
    return NextResponse.json({ error: "lead not found" }, { status: 404 })
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const ids: string[] | undefined = body?.ids
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids (non-empty array) is required" }, { status: 400 })
  }
  const { count } = await prisma.lead.deleteMany({ where: { id: { in: ids } } })
  return NextResponse.json({ deleted: count })
}
