import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, X } from 'lucide-react'

export default function FeedbackButtons({ message }) {
  const [selectedType, setSelectedType] = useState(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  if (message.role !== 'bot' || message.isVinResponse) {
    return null
  }

  const source = message.sources?.[0]

  async function submitFeedback(type, feedbackNote = '') {
  if (!source) {
    setError('This answer does not have an SOP source.')
    return
  }

  setSaving(true)
  setError('')

  try {
    const payload = {
      answer_id:
        message.answerId ||
        `legacy-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`,

      question: message.question || '',
      response: message.text || '',
      state: message.state || null,
      sop_name: source.name || 'Unknown SOP',
      sop_url: source.url || '',
      feedback_type: type,
      user_note: feedbackNote.trim() || null,
      status: type === 'effective' ? 'effective' : 'open'
    }

    console.log('Submitting feedback:', payload)

    const response = await fetch('/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const responseText = await response.text()

    console.log('Feedback response status:', response.status)
    console.log('Feedback response body:', responseText)

    let data = null

    if (responseText.trim()) {
      try {
        data = JSON.parse(responseText)
      } catch {
        throw new Error(
          `The server returned invalid JSON. Status: ${response.status}`
        )
      }
    }

    if (!response.ok) {
      throw new Error(
        data?.detail ||
        responseText ||
        `Feedback request failed (${response.status}).`
      )
    }

    if (!data) {
      throw new Error(
        `The feedback server returned an empty response. Status: ${response.status}`
      )
    }

    setSubmitted(true)
    setSelectedType(null)
    setNote('')
  } catch (requestError) {
    console.error('Feedback submission failed:', requestError)

    setError(
      requestError instanceof Error
        ? requestError.message
        : 'Feedback could not be recorded.'
    )
  } finally {
    setSaving(false)
  }
}

  function chooseFeedback(type) {
    if (type === 'effective') {
      submitFeedback('effective')
      return
    }

    setSelectedType(type)
    setNote('')
    setError('')
  }

  if (submitted) {
    return (
      <div className="feedback-success">
        <CheckCircle2 size={16} />
        Feedback recorded. Thank you.
      </div>
    )
  }

  return (
    <div className="feedback-section">
      <p className="feedback-question">
        Was this SOP helpful and current?
      </p>

      <div className="feedback-buttons">
        <button
          type="button"
          className="feedback-button feedback-effective"
          disabled={saving}
          onClick={() => chooseFeedback('effective')}
        >
          <CheckCircle2 size={16} />
          Effective SOP
        </button>

        <button
          type="button"
          className="feedback-button feedback-confusing"
          disabled={saving}
          onClick={() => chooseFeedback('confusing')}
        >
          <AlertTriangle size={16} />
          Confusing
        </button>

        <button
          type="button"
          className="feedback-button feedback-outdated"
          disabled={saving}
          onClick={() => chooseFeedback('outdated')}
        >
          <Clock3 size={16} />
          Outdated SOP
        </button>
      </div>

      {selectedType && (
        <div className="feedback-note-box">
          <div className="feedback-note-header">
            <strong>
              {selectedType === 'confusing'
                ? 'What was confusing?'
                : 'What appears outdated?'}
            </strong>

            <button
              type="button"
              className="feedback-note-close"
              onClick={() => {
                setSelectedType(null)
                setNote('')
              }}
              aria-label="Close feedback note"
            >
              <X size={17} />
            </button>
          </div>

          <textarea
            rows="3"
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder={
              selectedType === 'confusing'
                ? 'Optional: Explain which part was unclear.'
                : 'Optional: Explain which information needs to be updated.'
            }
          />

          <div className="feedback-note-actions">
            <button
              type="button"
              className="feedback-cancel"
              disabled={saving}
              onClick={() => {
                setSelectedType(null)
                setNote('')
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              className="feedback-submit"
              disabled={saving}
              onClick={() => submitFeedback(selectedType, note)}
            >
              {saving ? 'Saving...' : 'Submit feedback'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="feedback-error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}