// Short-session-title user extension: a pure formatter plus one
// `before_agent_start` hook that stores its result on the first real prompt.
// Cleanup shapes mirror ~/.omo/agent/agent-tab-title.js, a managed asset this
// standalone user extension must not import.
declare const process: any

// `/reload` rebuilds the extension runner in this same process and runs the
// factory again for the replacement runner, while a duplicate registration on
// the runner already bound must be ignored. The marker therefore records which
// runner claimed it instead of blocking the process.
const EXTENSION_KEY = Symbol.for('omo-short-session-title-extension')
const registeredRunners = globalThis as { [key: symbol]: unknown | undefined }

const MAX_CODEPOINTS = 24
const MAX_WORDS = 4
const MIN_WORD_BOUNDARY_RATIO = 0.55
const SOURCE_SCAN_LIMIT = 512

export const SHORT_SESSION_TITLE_MAX_CODEPOINTS = MAX_CODEPOINTS
export const SHORT_SESSION_TITLE_MAX_WORDS = MAX_WORDS

const URL_PATTERN = /https?:\/\/\S+/gi
// Decoration is stripped before the sentence split: a markdown link or a GitLab
// URL fragment must not leak "merge_requests" style tokens into the title.
const DECORATION_PATTERN = /[`*_~#>{}()[\]]/g
const SENTENCE_BOUNDARY_PATTERN = /[.!?,;\n\r\u2028\u2029]/u
const PREFIX_PATTERN = /^(?:issue|task|bug|feature|pr)\s*(?:#?\d+)?\s*[:-]\s*/i
// Any prompt starting with a command or path token is not a task title. This is
// Senpi's own rule (session-title-generator shouldSkipSessionTitle), so a
// first-turn `/name 사용자지정` never becomes an automatic title.
const SLASH_COMMAND_PATTERN = /^\/\S/
const LEADING_FILLER_PATTERNS = [
  /^(?:can|could|would)\s+you(?:\s+please)?\s+/i,
  /^please(?:\s+|$)/i,
  /^i\s+(?:want|need)\s+(?:you\s+)?to\s+/i,
  /^help\s+me(?:\s+to)?\s+/i,
  /^help\s+/i,
  /^let'?s\s+/i,
  /^we\s+need\s+to\s+/i,
  /^need\s+to\s+/i
]
const ATTACHED_REQUEST_PATTERN = /^(.+?)(?:해|해요|합니다)\s*줘(?:요)?$/u
const LOOSE_REQUEST_PATTERN = /^(.+?)줘(?:요)?$/u
const TRAILING_REQUEST_TOKENS = new Set([
  '해줘',
  '해주세요',
  '해줘요',
  '주세요',
  '부탁해',
  '부탁해요',
  '부탁드려요',
  '부탁드립니다',
  'please',
  'plz',
  'pls'
])
const TRAILING_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'of',
  'for',
  'and',
  'or',
  'in',
  'on',
  'at',
  'by',
  'with'
])
const EDGE_PUNCTUATION_PATTERN = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}]/u

function dropTrailingFillerToken(value: string): string {
  const words = value.split(' ')
  const last = words[words.length - 1]
  if (last === undefined || !TRAILING_REQUEST_TOKENS.has(last.toLowerCase())) return value
  return words.slice(0, -1).join(' ')
}

function stripAttachedRequestEnding(value: string): string {
  const words = value.split(' ')
  const last = words[words.length - 1] ?? ''
  for (const pattern of [ATTACHED_REQUEST_PATTERN, LOOSE_REQUEST_PATTERN]) {
    const body = pattern.exec(last)?.[1]
    // A one-character body would strip the whole verb and leave a stub ("해").
    if (body !== undefined && Array.from(body).length >= 2) {
      return [...words.slice(0, -1), body].join(' ')
    }
  }
  return value
}

function stripTrailingRequest(value: string): string {
  let result = value
  for (;;) {
    const trimmed = result.trim()
    const withoutToken = dropTrailingFillerToken(trimmed)
    const reduced = withoutToken === trimmed ? stripAttachedRequestEnding(trimmed) : withoutToken
    if (reduced === trimmed) return trimmed
    result = reduced
  }
}

function clampToCodepointBudget(value: string): string {
  const points = Array.from(value)
  if (points.length <= MAX_CODEPOINTS) return value
  const head = points.slice(0, MAX_CODEPOINTS - 1)
  const lastSpace = head.lastIndexOf(' ')
  if (lastSpace >= Math.ceil((MAX_CODEPOINTS - 1) * MIN_WORD_BOUNDARY_RATIO)) {
    return head.slice(0, lastSpace).join('').trim()
  }
  return `${head.join('')}…`
}

export function deriveShortSessionTitle(prompt: string | null | undefined): string | null {
  if (typeof prompt !== 'string') return null
  const trimmed = prompt.trim()
  if (!trimmed) return null
  if (SLASH_COMMAND_PATTERN.test(trimmed)) return null
  const cleaned = trimmed
    .slice(0, SOURCE_SCAN_LIMIT)
    .replace(URL_PATTERN, ' ')
    .replace(DECORATION_PATTERN, ' ')
    .replace(PREFIX_PATTERN, '')
    .replace(/\s+/gu, ' ')
  const firstSentence = cleaned.split(SENTENCE_BOUNDARY_PATTERN)[0] ?? ''
  let candidate = firstSentence.trim()
  for (const pattern of LEADING_FILLER_PATTERNS) {
    candidate = candidate.replace(pattern, '').trim()
  }
  const words: string[] = []
  for (const token of stripTrailingRequest(candidate).split(' ')) {
    const word = token.replace(EDGE_PUNCTUATION_PATTERN, '')
    if (word && WORD_CHARACTER_PATTERN.test(word)) words.push(word)
    if (words.length === MAX_WORDS) break
  }
  for (;;) {
    const last = words[words.length - 1]
    if (words.length <= 1 || last === undefined || !TRAILING_STOPWORDS.has(last.toLowerCase())) break
    words.pop()
  }
  if (words.length === 0) return null
  return clampToCodepointBudget(words.join(' '))
}

export default function shortSessionTitleExtension(pi: any): void {
  // A non-Orca host, or a child agent that inherited this pane's environment,
  // must never title anything. The PID check mirrors the managed titlebar
  // extension, which claims ORCA_PI_TITLE_OWNED for the pane's owner process.
  if (!process.env.ORCA_PANE_KEY || !process.env.ORCA_TERMINAL_HANDLE) return
  const ownerPid = process.env.ORCA_PI_TITLE_OWNED
  if (ownerPid && ownerPid !== String(process.pid)) return
  if (registeredRunners[EXTENSION_KEY] === pi) return
  registeredRunners[EXTENSION_KEY] = pi

  // Both flags describe the current session only. `session_start` marks every
  // boundary, so a `/reload` keeps its name while a later `new` session in this
  // same runner can still be named once.
  let titled = false
  let keepExistingName = false

  pi.on('session_start', (event: any) => {
    // A reloaded or resumed session keeps whatever name it already has.
    keepExistingName = event?.reason === 'reload' || event?.reason === 'resume'
    titled = false
  })

  // Synchronous on purpose: this runs before Senpi starts model-based title
  // generation, whose guard skips a session that already has a name. One event
  // is emitted by the runtime, so the managed Orca title extension renames the
  // tab once. This handler must never listen for that event.
  pi.on('before_agent_start', (event: any) => {
    if (titled || keepExistingName || event?.preview === true) return
    if (pi.getSessionName()) return
    const title = deriveShortSessionTitle(event?.prompt)
    // Meaningless input is left to Senpi's own title generation, and the slot
    // stays open for the next real prompt.
    if (!title) return
    titled = true
    pi.setSessionName(title)
  })
}
