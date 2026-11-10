const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`)
  return value
}

function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    ...(process.env.OPENROUTER_SITE_URL && { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL }),
    ...(process.env.OPENROUTER_APP_NAME && { 'X-Title': process.env.OPENROUTER_APP_NAME }),
  }
}

// ---------------------------------------------------------------------------
// Modelo principal — tarefa pesada (análise + card + passo a passo), em stream
// ---------------------------------------------------------------------------
export async function streamChatCompletion(messages, onDelta) {
  const apiKey = requireEnv('OPENROUTER_API_KEY')
  const model = requireEnv('OPENROUTER_MODEL_PRIMARY')

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ model, stream: true, temperature: 0.4, messages }),
  })

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Falha no OpenRouter (${response.status}): ${errorText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue

      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue

      try {
        const json = JSON.parse(payload)
        const delta = json?.choices?.[0]?.delta?.content
        if (delta) {
          fullText += delta
          onDelta(delta, fullText)
        }
      } catch {
        // Chunk incompleto — o próximo trecho do buffer completa a linha
      }
    }
  }

  return fullText
}

// ---------------------------------------------------------------------------
// Modelo secundário — gera o título da conversa a partir da primeira mensagem
// ---------------------------------------------------------------------------
export async function generateTitle(firstUserMessage) {
  const apiKey = requireEnv('OPENROUTER_API_KEY')
  const model = requireEnv('OPENROUTER_MODEL_TITLE')

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 20,
      messages: [
        {
          role: 'system',
          content: 'Gere um título curto para identificar esta conversa, com no máximo 30 caracteres, sem aspas e sem ponto final. Responda apenas com o título, nada mais.',
        },
        { role: 'user', content: firstUserMessage.slice(0, 500) },
      ],
    }),
  })

  if (!response.ok) return null

  const data = await response.json()
  const title = data?.choices?.[0]?.message?.content?.trim()

  return title ? title.slice(0, 30) : null
}