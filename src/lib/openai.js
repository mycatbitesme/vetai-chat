import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
})

export async function createThread() {
  const thread = await openai.beta.threads.create()
  return thread.id
}

export async function sendMessage(threadId, message, assistantId) {
  // Add message to thread
  await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: message
  })

  // Create and run
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId
  })

  // Poll for completion
  let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id)
  
  while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
    await new Promise(resolve => setTimeout(resolve, 1000))
    runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id)
  }

  if (runStatus.status === 'completed') {
    // Get messages
    const messages = await openai.beta.threads.messages.list(threadId)
    const lastMessage = messages.data[0]
    return lastMessage.content[0].text.value
  } else {
    throw new Error(`Run failed with status: ${runStatus.status}`)
  }
}

export async function getThreadMessages(threadId) {
  const messages = await openai.beta.threads.messages.list(threadId)
  return messages.data.reverse().map(msg => ({
    id: msg.id,
    role: msg.role,
    content: msg.content[0].text.value,
    timestamp: msg.created_at
  }))
}
