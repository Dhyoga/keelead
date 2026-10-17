import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"
import { InputError, createReply, listReplies } from "@/lib/replies/store"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const replies = await listReplies({
    status: searchParams.get("status"),
    username: searchParams.get("username"),
    limit: parseInt(searchParams.get("limit") || "") || undefined,
  })
  return NextResponse.json({ replies, total: replies.length })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON body is required" }, { status: 400 })
  try {
    return NextResponse.json(await createReply(body))
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }
}

// REST only (behind BasicAuth), deliberately not an MCP tool: lets the owner remove a wrong or test entry
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const ids: unknown = body?.ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((i) => typeof i !== "string")) {
    return NextResponse.json({ error: "ids (non-empty array of strings) is required" }, { status: 400 })
  }
  const { count } = await prisma.reply.deleteMany({ where: { id: { in: ids as string[] } } })
  return NextResponse.json({ deleted: count })
}
