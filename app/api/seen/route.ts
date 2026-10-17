import { NextRequest, NextResponse } from "next/server"
import { InputError, seenCheck } from "@/lib/replies/store"

// What KeeLead remembers about a list of post permalinks. Read-only, information only.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  try {
    return NextResponse.json(await seenCheck(body?.posts))
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }
}
