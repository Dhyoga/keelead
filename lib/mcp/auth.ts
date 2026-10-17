import { timingSafeEqual } from "node:crypto"

// MCP_TOKENS="grokbot:<token>,hermes:<token>" — one bearer token per client so access can be revoked individually.
function configuredTokens(): { name: string; token: string }[] {
  return (process.env.MCP_TOKENS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const i = entry.indexOf(":")
      return { name: entry.slice(0, i), token: entry.slice(i + 1) }
    })
    .filter((t) => t.name && t.token.length >= 24)
}

export function mcpEnabled(): boolean {
  return configuredTokens().length > 0
}

// Returns the client name for a valid "Bearer <token>" header, otherwise null.
export function authenticateMcp(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const given = Buffer.from(match[1].trim())

  let found: string | null = null
  for (const { name, token } of configuredTokens()) {
    const expected = Buffer.from(token)
    // Compare every token (no early exit) and only when lengths match, as timingSafeEqual requires
    if (expected.length === given.length && timingSafeEqual(expected, given)) found = name
  }
  return found
}
