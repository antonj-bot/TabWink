import { useEffect, useRef, useState } from 'react'
import {
  BarChart3,
  FileText,
  Image as ImageIcon,
  Menu,
  MessageSquarePlus,
  Paperclip,
  Send,
  Trash2,
  X
} from 'lucide-react'
import FeedbackButtons from './components/FeedbackButtons'
import Rankings from './components/Rankings'

const starter = [
  'What does the SOP say about missing information?',
  'Help me identify the correct report role.',
  'Show the source and page for your answer.'
]

const CHAT_STORAGE_KEY = 'tabwink.conversations'

function readChatData() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || 'null')
    const conversations = Array.isArray(saved?.conversations)
      ? saved.conversations
          .filter(
            chat =>
              chat &&
              typeof chat.id === 'string' &&
              Array.isArray(chat.messages)
          )
          .slice(0, 20)
      : []

    const activeId = conversations.some(chat => chat.id === saved?.activeId)
      ? saved.activeId
      : null

    return { conversations, activeId }
  } catch {
    return { conversations: [], activeId: null }
  }
}

function conversationTitle(text) {
  const title = text.replace(/\s+/g, ' ').trim()
  return title.length > 42 ? `${title.slice(0, 39)}...` : title
}

function formatVinReply(data) {
  const vehicle = data.vehicle || (data.make ? data : null)

  if (vehicle) {
    const correction =
      data.detected_vin && data.detected_vin !== vehicle.vin
        ? `The image read ${data.detected_vin}; corrected to ${vehicle.vin}. `
        : ''

    return `${correction}${vehicle.year || 'Year unknown'} ${vehicle.make} ${vehicle.model} (VIN: ${vehicle.vin}).`
  }

  if (data.closest_matches?.length > 1) {
    const matches = data.closest_matches.map(
      match =>
        `${match.suggested_vin} (${match.year || 'Year unknown'} ${match.make} ${match.model})`
    )

    return `I couldn't confirm ${data.detected_vin || 'that VIN'}. Closest NHTSA matches: ${matches.join('; ')}. Compare these with the VIN on the vehicle.`
  }

  if (data.did_you_mean) {
    const suggestion = data.did_you_mean

    return `I couldn't confirm ${data.detected_vin || 'the VIN'}. Did you mean ${suggestion.suggested_vin} (${suggestion.year} ${suggestion.make} ${suggestion.model})?`
  }

  if (data.error) return data.error

  if (data.detected_vin) {
    return `I detected ${data.detected_vin}, but NHTSA could not decode it.`
  }

  return 'I could not find a VIN in that image. Try a clearer, closer photo of the VIN label.'
}

export default function App() {
  const [chatData, setChatData] = useState(readChatData)
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('Searching the SOPs...')
  const [error, setError] = useState('')
  const [view, setView] = useState('chat')
  const inputRef = useRef(null)

  const activeConversation = chatData.conversations.find(
    chat => chat.id === chatData.activeId
  )
  const messages = activeConversation?.messages || []

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatData))
    } catch {
      setError('Conversation history could not be saved in this browser.')
    }
  }, [chatData])

  function recordMessage(conversationId, message, create = false) {
    setChatData(current => {
      const existing = current.conversations.find(
        chat => chat.id === conversationId
      )

      if (!existing && !create) return current

      const conversation = existing || {
        id: conversationId,
        title: conversationTitle(message.text),
        messages: [],
        updatedAt: Date.now()
      }

      const updated = {
        ...conversation,
        title: conversation.title || conversationTitle(message.text),
        messages: [...conversation.messages, message].slice(-80),
        updatedAt: Date.now()
      }

      return {
        conversations: [
          updated,
          ...current.conversations.filter(chat => chat.id !== conversationId)
        ].slice(0, 20),
        activeId: create ? conversationId : current.activeId
      }
    })
  }

  function startNewChat() {
    setChatData(current => ({ ...current, activeId: null }))
    setText('')
    setFile(null)
    setError('')
    setOpen(false)
  }

  function clearActiveChat() {
    setChatData(current => ({
      conversations: current.conversations.filter(
        chat => chat.id !== current.activeId
      ),
      activeId: null
    }))
    setError('')
  }

  function pasteScreenshot(event) {
    const imageItem = [...event.clipboardData.items].find(
      item => item.kind === 'file' && item.type.startsWith('image/')
    )
    const image = imageItem?.getAsFile()

    if (!image) return

    event.preventDefault()
    const extension =
      image.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'

    setFile(
      new File([image], `pasted-screenshot.${extension}`, {
        type: image.type
      })
    )
    setError('')
  }

  async function send(value = text) {
    const question = value.trim()
    const attachment = file

    if (attachment && !attachment.type.startsWith('image/')) {
      setError('Upload an image of the VIN label.')
      return
    }

    if ((!question && !attachment) || loading) return

    const conversationId =
      activeConversation?.id ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`

    const isTypedVin =
      !attachment && question.replace(/[^a-z0-9]/gi, '').length === 17
    const isVinRequest = Boolean(attachment) || isTypedVin

    setError('')
    recordMessage(
      conversationId,
      {
        role: 'user',
        text: question || 'Decode the VIN in this image.',
        file: attachment?.name
      },
      true
    )

    setText('')
    setFile(null)
    setLoadingText(isVinRequest ? 'Decoding VIN...' : 'Searching the SOPs...')
    setLoading(true)

    try {
      let response

      if (attachment) {
        const formData = new FormData()
        formData.append('file', attachment)
        response = await fetch('/ocr', {
          method: 'POST',
          body: formData
        })
      } else if (isTypedVin) {
        response = await fetch(`/vin/${encodeURIComponent(question)}`)
      } else {
        response = await fetch(
          `/ask?question=${encodeURIComponent(question)}`
        )
      }

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || `Request failed (${response.status}).`)
      }

      const sources = !isVinRequest
        ? (data.resources || []).map(resource => ({
            name: resource.name,
            url: resource.url,
            page: resource.page
          }))
        : []

      recordMessage(conversationId, {
        role: 'bot',
        answerId:
          globalThis.crypto?.randomUUID?.() ||
          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        question: question || 'Decode the VIN in this image.',
        text: isVinRequest
          ? formatVinReply(data)
          : data.answer || 'The backend returned an empty answer.',
        sources,
        state: data.state || null,
        isVinResponse: isVinRequest
      })
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unexpected request error.'

      recordMessage(conversationId, {
        role: 'bot',
        text: `I could not process that request: ${message}`,
        isError: true,
        isVinResponse: isVinRequest
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <aside className={open ? 'open' : ''}>
        <div className="brand">
          <img src="/tabwink-logo.jpg" alt="TabWink logo" />
          <div>
            <strong>TabWink</strong>
            <span>Digital Keying Assistant</span>
          </div>
        </div>

        <button className="new" onClick={startNewChat}>
          <MessageSquarePlus size={18} />
          New chat
        </button>

        <p className="side-title">RECENT</p>

        {chatData.conversations.length === 0 ? (
          <div className="recent-empty">No saved conversations yet</div>
        ) : (
          <nav className="recent-list" aria-label="Recent conversations">
            {chatData.conversations.map(chat => (
              <button
                className={`recent-item ${
                  chat.id === chatData.activeId ? 'active' : ''
                }`}
                key={chat.id}
                title={chat.title}
                onClick={() => {
                  setChatData(current => ({
                    ...current,
                    activeId: chat.id
                  }))
                  setText('')
                  setError('')
                  setOpen(false)
                }}
              >
                {chat.title}
              </button>
            ))}
          </nav>
        )}

        <div className="aside-bottom">
          <div className="status">
            <i />
            SOP assistant ready
          </div>
          <small>
            Prototype UI
            <br />
            Verify answers against the cited SOP.
          </small>
        </div>
      </aside>

      {open && (
        <button
          className="overlay"
          onClick={() => setOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      <main>
        <header>
          <button
            className="menu"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </button>

          <div>
            <b>TabWink</b>
            <span>Your Digital Keying Assistant</span>
          </div>

          <div className="header-actions">
            <button
              className={`rankings-nav ${
                view === 'rankings' ? 'active' : ''
              }`}
              onClick={() =>
                setView(current =>
                  current === 'chat' ? 'rankings' : 'chat'
                )
              }
            >
              <BarChart3 size={16} />

              {view === 'rankings'
                ? 'Back to chat'
                : 'Rankings'}
            </button>

            <button
              className="clear"
              onClick={clearActiveChat}
              disabled={!activeConversation || view !== 'chat'}
            >
              <Trash2 size={16} />
              Clear
            </button>
          </div>
        </header>
        
        {view === 'chat' ? (
        <>
          <section className="chat">
            {messages.length === 0 ? (
              <div className="welcome">
                <img src="/tabwink-logo.jpg" alt="TabWink logo" />

                <h1>How can TabWink help?</h1>

                <p>
                  Ask about your division&apos;s SOPs or upload a photo of a
                  VIN label.
                </p>

                <div className="cards">
                  {starter.map(s => (
                    <button key={s} onClick={() => send(s)}>
                      {s}
                      <Send size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="thread">
                {messages.map((m, i) => (
                  <div
                    key={m.answerId || i}
                    className={`message ${m.role}`}
                  >
                    <div className="avatar">
                      {m.role === 'bot' ? (
                        <img src="/tabwink-logo.jpg" alt="TabWink" />
                      ) : (
                        'You'
                      )}
                    </div>

                    <div className="bubble">
                      <b>{m.role === 'bot' ? 'TabWink' : 'You'}</b>
                      <p>{m.text}</p>

                      {m.file && (
                        <div className="attached">
                          <Paperclip size={14} />
                          {m.file}
                        </div>
                      )}

                      {m.sources?.map((s, j) =>
                        s.url ? (
                          <a
                            className="source"
                            key={`${s.name}-${j}`}
                            href={`http://127.0.0.1:8000${s.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <FileText size={17} />
                            <div>
                              <strong>{s.name}</strong>
                              <span>Open SOP resource</span>
                            </div>
                          </a>
                        ) : (
                          <div
                            className="source"
                            key={`${s.name}-${j}`}
                          >
                            <FileText size={17} />
                            <div>
                              <strong>{s.name}</strong>
                              <span>{s.page || 'SOP resource'}</span>
                            </div>
                          </div>
                        )
                      )}

                      {m.role === 'bot' && !m.isError && (
                        <FeedbackButtons message={m} />
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="message bot">
                    <div className="avatar">
                      <img src="/tabwink-logo.jpg" alt="TabWink" />
                    </div>

                    <div className="bubble">
                      <b>TabWink</b>
                      <p>{loadingText}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      ) : (
        <Rankings onClose={() => setView('chat')} />
      )}
        {view === 'chat' && (
          <footer>
            {file && (
              <div className="file-preview">
                <ImageIcon />
                <div>
                  <b>{file.name}</b>
                  <span>{Math.ceil(file.size / 1024)} KB</span>
                </div>
                <button
                  onClick={() => setFile(null)}
                  aria-label="Remove attachment"
                >
                  <X />
                </button>
              </div>
            )}

            {error && (
              <div className="request-error" role="alert">
                {error}
              </div>
            )}

            <div className="composer">
              <button
                onClick={() => inputRef.current?.click()}
                title="Upload a VIN photo or paste a screenshot"
              >
                <Paperclip />
              </button>

              <input
                ref={inputRef}
                hidden
                type="file"
                accept="image/*"
                onChange={event => {
                  setFile(event.target.files?.[0] || null)
                  setError('')
                }}
              />

              <textarea
                rows="1"
                placeholder="Ask about an SOP, enter a VIN, or paste a screenshot..."
                value={text}
                onChange={event => setText(event.target.value)}
                onPaste={pasteScreenshot}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    send()
                  }
                }}
              />

              <button
                className="send"
                onClick={() => send()}
                disabled={loading || (!text.trim() && !file)}
              >
                <Send />
              </button>
            </div>

            <small>
              TabWink can make mistakes. Verify important answers against the
              cited SOP.
            </small>
          </footer>
        )}
      </main>
    </div>
  )
}
