import { supabase } from '../_lib/supabase.js'
import { getUserId } from '../_lib/auth.js'
import { applyCors } from '../_cors.js'
import { buildSystemPrompt } from '../_lib/system-prompt.js'
import { streamChatCompletion, generateTitle } from '../_lib/openrouter.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_MESSAGE_LENGTH = 4000
const DB_FLUSH_INTERVAL_MS = 700

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
function validateBody(body) {
  const { message, chatId } = body ?? {}

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return 'A mensagem não pode estar vazia.'
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return `A mensagem deve ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.`
  }
  if (chatId !== undefined && chatId !== null && !UUID_RE.test(chatId)) {
    return 'chatId inválido.'
  }
  return null
}

function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (applyCors(req, res)) return

  applySecurityHeaders(res)

  if (req.method !== 'POST') return res.status(405).end()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const userId = getUserId(req)
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const validationError = validateBody(req.body)
  if (validationError) {
    return res.status(400).json({ error: validationError })
  }

  const message = req.body.message.trim()
  let chatId = req.body.chatId || null
  const isNewChat = !chatId

  // ── Perfil do usuário (personaliza o prompt) ────────────────────────────────
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('name, location')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    console.error('[/api/chat] Erro ao buscar perfil:', profileError.message)
    return res.status(500).json({ error: 'Falha ao carregar o perfil do usuário.' })
  }

  // ── Carrega a conversa existente ou prepara uma nova ────────────────────────
  let history = []

  if (!isNewChat) {
    const { data: chatRow, error: chatError } = await supabase
      .from('chat')
      .select('id, chat')
      .eq('id', chatId)
      .eq('user_id', userId)
      .maybeSingle()

    if (chatError) {
      console.error('[/api/chat] Erro ao buscar conversa:', chatError.message)
      return res.status(500).json({ error: 'Falha ao carregar a conversa.' })
    }
    if (!chatRow) {
      return res.status(404).json({ error: 'Conversa não encontrada.' })
    }

    history = Array.isArray(chatRow.chat) ? chatRow.chat : []
  }

  const userMessage = { role: 'user', content: message, created_at: new Date().toISOString() }
  const assistantMessage = { role: 'assistant', content: '', created_at: new Date().toISOString() }
  const assistantIndex = history.length + 1
  const messages = [...history, userMessage, assistantMessage]

  // ── Cria a ocorrência no banco já na primeira mensagem ──────────────────────
  if (isNewChat) {
    const { data: created, error: insertError } = await supabase
      .from('chat')
      .insert({ user_id: userId, chat: messages })
      .select('id')
      .single()

    if (insertError || !created) {
      console.error('[/api/chat] Erro ao criar conversa:', insertError?.message)
      return res.status(500).json({ error: 'Falha ao iniciar a conversa.' })
    }

    chatId = created.id
  } else {
    const { error: updateError } = await supabase.from('chat').update({ chat: messages }).eq('id', chatId)

    if (updateError) {
      console.error('[/api/chat] Erro ao salvar mensagem do usuário:', updateError.message)
      return res.status(500).json({ error: 'Falha ao salvar a mensagem.' })
    }
  }

  // ── Abre o stream ────────────────────────────────────────────────────────
  res.setHeader('X-Chat-ID', chatId)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  sendEvent(res, 'chat_id', { chatId })

  // ── Título da conversa em paralelo (apenas na primeira mensagem) ───────────
  const titlePromise = isNewChat
    ? generateTitle(message)
        .then(async (title) => {
          if (!title) return
          const { error } = await supabase.from('chat').update({ title }).eq('id', chatId)
          if (!error) sendEvent(res, 'title', { title })
        })
        .catch((err) => console.error('[/api/chat] Erro ao gerar título:', err.message))
    : Promise.resolve()

  // ── Stream da resposta principal, com atualização em tempo real do chat ────
  const systemPrompt = buildSystemPrompt(profile ?? {})
  const modelMessages = [
    { role: 'system', content: systemPrompt },
    ...history.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: message },
  ]

  let lastFlush = Date.now()
  let flushInFlight = false

  async function flushToDb(content, { force = false } = {}) {
    if (flushInFlight && !force) return
    if (!force && Date.now() - lastFlush < DB_FLUSH_INTERVAL_MS) return

    flushInFlight = true
    lastFlush = Date.now()
    messages[assistantIndex] = { ...messages[assistantIndex], content }

    const { error } = await supabase.from('chat').update({ chat: messages }).eq('id', chatId)
    if (error) console.error('[/api/chat] Erro ao atualizar conversa:', error.message)
    flushInFlight = false
  }

  try {
    const fullText = await streamChatCompletion(modelMessages, (delta, soFar) => {
      sendEvent(res, 'token', { content: delta })
      flushToDb(soFar)
    })

    await flushToDb(fullText, { force: true })
    await titlePromise

    sendEvent(res, 'done', { chatId })
  } catch (err) {
    console.error('[/api/chat] Erro no streaming:', err.message)
    sendEvent(res, 'error', { message: 'Não foi possível concluir a resposta. Tente novamente.' })
  } finally {
    res.end()
  }
}