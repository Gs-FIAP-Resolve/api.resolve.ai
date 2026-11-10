import { supabase } from '../_lib/supabase.js'
import { getUserId } from '../_lib/auth.js'
import { applyCors } from '../_cors.js'
import { buildSystemPrompt } from '../_lib/system-prompt.js'
import { streamChatCompletion, generateTitle } from '../_lib/openrouter.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_MESSAGE_LENGTH = 4000
const MAX_TITLE_LENGTH = 100
const DB_FLUSH_INTERVAL_MS = 700

function applySecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
}

function sendEvent(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// ---------------------------------------------------------------------------
// GET — lista as conversas do usuário, ou retorna uma conversa específica
// ---------------------------------------------------------------------------
async function handleGet(req, res, userId) {
    const { id } = req.query

    if (id) {
        if (!UUID_RE.test(id)) return res.status(400).json({ error: 'id inválido.' })

        const { data, error } = await supabase
            .from('chat')
            .select('id, title, chat, created_at')
            .eq('id', id)
            .eq('user_id', userId)
            .maybeSingle()

        if (error) {
            console.error('[/api/chat GET] Erro ao buscar conversa:', error.message)
            return res.status(500).json({ error: 'Falha ao carregar a conversa.' })
        }
        if (!data) return res.status(404).json({ error: 'Conversa não encontrada.' })

        return res.status(200).json(data)
    }

    const { data, error } = await supabase
        .from('chat')
        .select('id, title, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[/api/chat GET] Erro ao listar conversas:', error.message)
        return res.status(500).json({ error: 'Falha ao carregar as conversas.' })
    }

    return res.status(200).json(data)
}

// ---------------------------------------------------------------------------
// PATCH — renomeia uma conversa
// ---------------------------------------------------------------------------
async function handlePatch(req, res, userId) {
    const { id, title } = req.body ?? {}

    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'id inválido.' })
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ error: 'O título não pode estar vazio.' })
    }
    if (title.length > MAX_TITLE_LENGTH) {
        return res.status(400).json({ error: `O título deve ter no máximo ${MAX_TITLE_LENGTH} caracteres.` })
    }

    const { data, error } = await supabase
        .from('chat')
        .update({ title: title.trim() })
        .eq('id', id)
        .eq('user_id', userId)
        .select('id, title')
        .maybeSingle()

    if (error) {
        console.error('[/api/chat PATCH] Erro ao renomear conversa:', error.message)
        return res.status(500).json({ error: 'Falha ao renomear a conversa.' })
    }
    if (!data) return res.status(404).json({ error: 'Conversa não encontrada.' })

    return res.status(200).json(data)
}

// ---------------------------------------------------------------------------
// DELETE — remove uma conversa
// ---------------------------------------------------------------------------
async function handleDelete(req, res, userId) {
    const { id } = req.query

    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'id inválido.' })

    const { data, error } = await supabase
        .from('chat')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle()

    if (error) {
        console.error('[/api/chat DELETE] Erro ao excluir conversa:', error.message)
        return res.status(500).json({ error: 'Falha ao excluir a conversa.' })
    }
    if (!data) return res.status(404).json({ error: 'Conversa não encontrada.' })

    return res.status(204).end()
}

// ---------------------------------------------------------------------------
// POST — envia mensagem e faz streaming da resposta da IA
// ---------------------------------------------------------------------------
function validatePostBody(body) {
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

async function handlePost(req, res, userId) {
    const validationError = validatePostBody(req.body)
    if (validationError) return res.status(400).json({ error: validationError })

    const message = req.body.message.trim()
    let chatId = req.body.chatId || null
    const isNewChat = !chatId

    const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('name, location')
        .eq('id', userId)
        .maybeSingle()

    if (profileError) {
        console.error('[/api/chat POST] Erro ao buscar perfil:', profileError.message)
        return res.status(500).json({ error: 'Falha ao carregar o perfil do usuário.' })
    }

    let history = []

    if (!isNewChat) {
        const { data: chatRow, error: chatError } = await supabase
            .from('chat')
            .select('id, chat')
            .eq('id', chatId)
            .eq('user_id', userId)
            .maybeSingle()

        if (chatError) {
            console.error('[/api/chat POST] Erro ao buscar conversa:', chatError.message)
            return res.status(500).json({ error: 'Falha ao carregar a conversa.' })
        }
        if (!chatRow) return res.status(404).json({ error: 'Conversa não encontrada.' })

        history = Array.isArray(chatRow.chat) ? chatRow.chat : []
    }

    const userMessage = { role: 'user', content: message, created_at: new Date().toISOString() }
    const assistantMessage = { role: 'assistant', content: '', created_at: new Date().toISOString() }
    const assistantIndex = history.length + 1
    const messages = [...history, userMessage, assistantMessage]

    if (isNewChat) {
        const { data: created, error: insertError } = await supabase
            .from('chat')
            .insert({ user_id: userId, chat: messages })
            .select('id')
            .single()

        if (insertError || !created) {
            console.error('[/api/chat POST] Erro ao criar conversa:', insertError?.message)
            return res.status(500).json({ error: 'Falha ao iniciar a conversa.' })
        }

        chatId = created.id
    } else {
        const { error: updateError } = await supabase.from('chat').update({ chat: messages }).eq('id', chatId)

        if (updateError) {
            console.error('[/api/chat POST] Erro ao salvar mensagem do usuário:', updateError.message)
            return res.status(500).json({ error: 'Falha ao salvar a mensagem.' })
        }
    }

    res.setHeader('X-Chat-ID', chatId)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    sendEvent(res, 'chat_id', { chatId })

    const titlePromise = isNewChat
        ? generateTitle(message)
            .then(async (title) => {
                if (!title) return
                const { error } = await supabase.from('chat').update({ title }).eq('id', chatId)
                if (!error) sendEvent(res, 'title', { title })
            })
            .catch((err) => console.error('[/api/chat POST] Erro ao gerar título:', err.message))
        : Promise.resolve()

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
        if (error) console.error('[/api/chat POST] Erro ao atualizar conversa:', error.message)
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
        console.error('[/api/chat POST] Erro no streaming:', err.message)
        sendEvent(res, 'error', { message: 'Não foi possível concluir a resposta. Tente novamente.' })
    } finally {
        res.end()
    }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
    if (applyCors(req, res)) return

    applySecurityHeaders(res)

    const userId = getUserId(req)
    if (!userId) return res.status(401).json({ error: 'Not authenticated' })

    switch (req.method) {
        case 'GET':
            return handleGet(req, res, userId)
        case 'PATCH':
            return handlePatch(req, res, userId)
        case 'DELETE':
            return handleDelete(req, res, userId)
        case 'POST':
            return handlePost(req, res, userId)
        default:
            return res.status(405).end()
    }
}