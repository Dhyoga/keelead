#!/usr/bin/env node
// Smoke test for the check_seen / reply log tools, through the real /api/mcp endpoint.
//
//   MCP_URL=http://localhost:3100/api/mcp MCP_TOKEN=... node scripts/smoke-replies.mjs
//
// Optional:
//   MCP_CLIENT_NAME   name that goes with MCP_TOKEN (default "smoke"); checked against Reply.client
//   KEELEAD_REST_URL  base URL of the REST API, used to delete the test leads/replies afterwards
//   KEELEAD_AUTH      "user:password" when the REST API sits behind BasicAuth
//
// Everything it creates uses a random run id, and is removed at the end when KEELEAD_REST_URL is set.

const MCP_URL = process.env.MCP_URL || "http://localhost:3100/api/mcp"
const TOKEN = process.env.MCP_TOKEN
const CLIENT = process.env.MCP_CLIENT_NAME || "smoke"
const REST = process.env.KEELEAD_REST_URL
const REST_AUTH = process.env.KEELEAD_AUTH
if (!TOKEN) {
  console.error("MCP_TOKEN is required")
  process.exit(2)
}

let rpcId = 0
async function rpc(method, params) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  })
  const body = await res.json()
  if (body.error) throw new Error(`rpc ${method}: ${JSON.stringify(body.error)}`)
  return body.result
}

// Calls a tool; returns the parsed JSON the tool printed (an { error } object when the API refused)
async function tool(name, args = {}) {
  const result = await rpc("tools/call", { name, arguments: args })
  const text = result.content?.[0]?.text ?? ""
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

let passed = 0
const failures = []
function check(label, cond, detail) {
  if (cond) {
    passed++
    console.log(`  ok   ${label}`)
  } else {
    failures.push(label)
    console.log(`  FAIL ${label}${detail !== undefined ? `\n         got: ${JSON.stringify(detail)}` : ""}`)
  }
}

const rid = Math.random().toString(36).slice(2, 8)
const user = `smoke${rid}`
const dncUser = `dncsmoke${rid}`
const P1 = `https://www.threads.com/@${user}/post/SMK${rid}A?xmt=abc`
const P1_variant = `https://threads.net/@${user.toUpperCase()}/post/SMK${rid}A/`
const P2 = `https://www.threads.com/@${user}/post/SMK${rid}B`
const P3 = `https://www.threads.com/@${dncUser}/post/SMK${rid}C`
const P3_other = `https://www.threads.com/@${dncUser}/post/SMK${rid}D`
const RAW = `not-a-permalink-${rid}`
const leadIds = []
const replyIds = []

async function main() {
  console.log(`MCP ${MCP_URL}  run=${rid}`)

  console.log("tools")
  const list = (await rpc("tools/list")).tools.map((t) => t.name)
  for (const n of ["keelead_check_seen", "keelead_log_reply", "keelead_update_reply", "keelead_list_replies", "keelead_update_lead"]) {
    check(`tools/list has ${n}`, list.includes(n), list)
  }
  check("no approve/claim/limit/dnc/delete tool", !list.some((n) => /approve|claim|limit|dnc|delete/.test(n)), list)

  console.log("check_seen: nothing known yet")
  let r = await tool("keelead_check_seen", { posts: [P1, RAW] })
  check("unknown permalink and raw input are both new", r.new?.length === 2 && r.known?.length === 0, r)
  r = await tool("keelead_check_seen", { posts: [] })
  check("empty list is a 400", /400/.test(r.error || "") && /1-100/.test(r.error || ""), r)
  r = await tool("keelead_check_seen", { posts: Array.from({ length: 101 }, (_, i) => `x${i}`) })
  check("101 items is a 400", /400/.test(r.error || ""), r)
  const hundred = Array.from({ length: 100 }, (_, i) => `raw-${rid}-${i}`)
  r = await tool("keelead_check_seen", { posts: hundred })
  check("100 items in one call add up to 100", r.new?.length + r.known?.length === 100, { new: r.new?.length, known: r.known?.length })

  console.log("lead saved for a post")
  r = await tool("keelead_save_leads", { leads: [{ firstName: user, website: P1, source: "Smoke", tags: ["threads"], notes: "smoke test" }] })
  check("lead saved", r.saved === 1, r)
  const L1 = r.leads?.[0]?.id
  if (L1) leadIds.push(L1)
  r = await tool("keelead_check_seen", { posts: [P1_variant] })
  check("other spelling of the permalink finds the lead", r.known?.[0]?.lead?.id === L1 && r.known[0].lead.status === "new", r)
  check("lead without replies has no replies field", r.known?.[0]?.replies === undefined, r)

  console.log("log_reply")
  r = await tool("keelead_log_reply", { postUrl: P1, text: "halo, kami Loox Travel", replyUrl: "https://www.threads.com/@looxtravel/post/R1" })
  const R1 = r.reply?.id
  if (R1) replyIds.push(R1)
  check("defaults to sent with sentAt", r.reply?.status === "sent" && !!r.reply?.sentAt, r)
  check("postKey and username derived", r.reply?.postKey === `threads:SMK${rid}A` && r.reply?.targetUsername === user, r.reply)
  check("client is the token's name", r.reply?.client === CLIENT, r.reply?.client)
  check("linked to the lead found by permalink", r.reply?.leadId === L1, r.reply)
  check("no other replies yet", r.otherRepliesForPost === 0 && r.otherRepliesForAccount === 0, r)
  r = await tool("keelead_list_saved_leads", { q: user })
  check("lead moved new -> contacted", r.leads?.find((l) => l.id === L1)?.status === "contacted", r.leads)

  console.log("check_seen after replying")
  r = await tool("keelead_check_seen", { posts: [P1_variant, P2] })
  const k1 = r.known?.find((k) => k.input === P1_variant)
  const k2 = r.known?.find((k) => k.input === P2)
  check("replied post shows the sent reply", k1?.replies?.[0]?.status === "sent" && !!k1.replies[0].sentAt, r)
  check("other post of the same author shows authorLastRepliedAt", !!k2?.authorLastRepliedAt && k2.replies === undefined, r)

  console.log("duplicates and bad input never block valid logging")
  r = await tool("keelead_log_reply", { postUrl: P1, text: "second thoughts", status: "draft" })
  const R2 = r.reply?.id
  if (R2) replyIds.push(R2)
  check("second record for the same post is accepted, draft has no sentAt", r.reply?.status === "draft" && !r.reply?.sentAt, r)
  check("response says there is 1 other record for the post and account", r.otherRepliesForPost === 1 && r.otherRepliesForAccount === 1, r)
  r = await tool("keelead_log_reply", { postUrl: P1, text: "  " })
  check("empty text is a 400", /400/.test(r.error || ""), r)
  r = await tool("keelead_log_reply", { postUrl: P1, text: "x", status: "bogus" })
  check("unknown status is a 400", /400/.test(r.error || ""), r)

  console.log("update_reply")
  r = await tool("keelead_update_reply", { id: R2, status: "sent", replyUrl: "https://www.threads.com/@looxtravel/post/R2" })
  check("draft -> sent fills sentAt and keeps replyUrl", r.reply?.status === "sent" && !!r.reply?.sentAt && /R2$/.test(r.reply?.replyUrl || ""), r)
  r = await tool("keelead_update_reply", { id: R2, status: "failed", note: "browser error" })
  check("sent -> failed is allowed", r.reply?.status === "failed" && r.reply?.note === "browser error", r)
  r = await tool("keelead_update_reply", { id: "does-not-exist", status: "sent" })
  check("unknown id is a 404", /404/.test(r.error || ""), r)
  r = await tool("keelead_list_replies", { status: "failed", username: `@${user.toUpperCase()}` })
  check("list filters by status and username", r.replies?.length === 1 && r.replies[0].id === R2, r)

  console.log("dnc through a lead")
  r = await tool("keelead_save_leads", { leads: [{ firstName: dncUser, website: P3, source: "Smoke", tags: ["threads"] }] })
  const L3 = r.leads?.[0]?.id
  if (L3) leadIds.push(L3)
  r = await tool("keelead_update_lead", { id: L3, status: "lost", addTags: ["dnc"], notes: "minta berhenti" })
  check("status lost and dnc tag added, old tag kept", r.lead?.status === "lost" && r.lead.tags.includes("dnc") && r.lead.tags.includes("threads"), r)
  r = await tool("keelead_update_lead", { id: L3, addTags: ["dnc"] })
  check("adding dnc twice keeps a single tag", r.lead?.tags.filter((t) => t === "dnc").length === 1, r)
  r = await tool("keelead_check_seen", { posts: [P3, P3_other] })
  check("dnc shows for the saved post and for another post by the same author", r.known?.length === 2 && r.known.every((k) => k.dnc === true), r)
  r = await tool("keelead_log_reply", { postUrl: P3_other, text: "tetap dicatat" })
  if (r.reply?.id) replyIds.push(r.reply.id)
  check("logging a reply to a dnc author still succeeds and says dnc", r.reply?.status === "sent" && r.dnc === true, r)
  r = await tool("keelead_log_reply", { postUrl: P3, text: "balasan ke lead lost" })
  if (r.reply?.id) replyIds.push(r.reply.id)
  r = await tool("keelead_list_saved_leads", { q: dncUser })
  check("a lost lead stays lost after a sent reply", r.leads?.find((l) => l.id === L3)?.status === "lost", r.leads)
}

async function cleanup() {
  if (!REST) {
    console.log(`\n(no KEELEAD_REST_URL: left ${leadIds.length} test leads and ${replyIds.length} test replies in the database)`)
    return
  }
  const headers = { "Content-Type": "application/json", ...(REST_AUTH ? { Authorization: `Basic ${Buffer.from(REST_AUTH).toString("base64")}` } : {}) }
  const del = async (path, ids) => {
    if (!ids.length) return "0"
    const res = await fetch(`${REST}/api${path}`, { method: "DELETE", headers, body: JSON.stringify({ ids }) })
    return res.ok ? String((await res.json()).deleted) : `failed (${res.status})`
  }
  console.log(`\ncleanup: deleted ${await del("/leads/saved", leadIds)} leads, ${await del("/replies", replyIds)} replies`)
}

try {
  await main()
} catch (err) {
  failures.push(`crashed: ${err.message}`)
  console.error(err)
} finally {
  await cleanup().catch((e) => console.error("cleanup failed:", e.message))
}
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
