import { NextRequest, NextResponse } from "next/server"
import { InputError, updateReply } from "@/lib/replies/store"

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON body is required" }, { status: 400 })
  try {
    const reply = await updateReply(params.id, body)
    if (!reply) return NextResponse.json({ error: "reply not found" }, { status: 404 })
    return NextResponse.json({ reply })
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }
}
