// Identity of a Threads post, derived from its permalink so that every spelling of the same URL
// (threads.com / threads.net, tracking query, trailing slash, any username casing) maps to one key.
export interface PostRef {
  input: string
  postKey: string
  username: string | null
  code: string | null // Threads post code; null for opaque input
}

// Matches the path only: /@user/post/<code>
const PERMALINK = /\/@([A-Za-z0-9._]+)\/post\/([A-Za-z0-9_-]+)/

export function parsePost(input: string): PostRef {
  const trimmed = input.trim()
  const m = trimmed.match(PERMALINK)
  if (m) return { input, postKey: `threads:${m[2]}`, username: m[1].toLowerCase(), code: m[2] }
  return { input, postKey: `raw:${trimmed}`, username: null, code: null }
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase()
}
