import { NextRequest, NextResponse } from "next/server"

// Official Threads keyword search: https://developers.facebook.com/docs/threads/keyword-search
const THREADS_API = "https://graph.threads.net/v1.0/keyword_search"
const FIELDS = "id,text,media_type,permalink,timestamp,username,has_replies,is_quote_post,is_reply"

interface ThreadsPost {
  id: string
  text?: string
  media_type?: string
  permalink?: string
  timestamp?: string
  username?: string
  has_replies?: boolean
  is_quote_post?: boolean
  is_reply?: boolean
}

export async function POST(request: NextRequest) {
  const token = process.env.THREADS_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: "THREADS_ACCESS_TOKEN is not configured on the server" },
      { status: 503 }
    )
  }

  const body = await request.json().catch(() => null)
  const query = typeof body?.query === "string" ? body.query.trim() : ""
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 })

  const params = new URLSearchParams({
    q: query,
    fields: FIELDS,
    search_type: body.searchType === "TOP" ? "TOP" : "RECENT",
    search_mode: body.searchMode === "TAG" ? "TAG" : "KEYWORD",
    limit: String(Math.min(Math.max(parseInt(body.limit) || 25, 1), 100)),
    access_token: token,
  })
  if (body.since) params.set("since", String(body.since))
  if (body.until) params.set("until", String(body.until))
  if (body.authorUsername) params.set("author_username", String(body.authorUsername).replace(/^@/, ""))

  const res = await fetch(`${THREADS_API}?${params}`, { signal: AbortSignal.timeout(20000) })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // Pass Meta's error through (expired token, missing threads_keyword_search approval, rate limit...)
    return NextResponse.json(
      { error: data?.error?.message || `Threads API returned ${res.status}`, code: data?.error?.code },
      { status: res.status === 401 || res.status === 403 ? res.status : 502 }
    )
  }

  const posts: ThreadsPost[] = data?.data || []
  // One lead per post: Threads gives a username and a public post, never an email or phone
  const leads = posts
    .filter((p) => p.username)
    .map((p) => ({
      firstName: p.username as string,
      lastName: "",
      website: p.permalink,
      source: "Threads",
      confidence: 0.5,
      tags: ["threads", p.is_reply ? "reply" : "post"],
      notes: p.text,
      metadata: {
        threadsId: p.id,
        username: p.username,
        profileUrl: `https://www.threads.com/@${p.username}`,
        postText: p.text,
        postedAt: p.timestamp,
        query,
        hasReplies: p.has_replies,
        isQuotePost: p.is_quote_post,
      },
    }))

  return NextResponse.json({ leads, total: leads.length, query })
}
