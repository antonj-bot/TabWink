import { useEffect, useMemo, useState } from 'react'
import './Rankings.css'
import {
  AlertTriangle,
  ArchiveRestore,
  BarChart3,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  LogIn,
  LogOut,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck,
  X
} from 'lucide-react'

function sourceHref(url) {
  if (!url) return '#'
  if (/^https?:\/\//i.test(url)) return url
  return `http://127.0.0.1:8000${url}`
}

function formatDate(value) {
  if (!value) return 'No date'
  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
}

async function readApiResponse(response) {
  const responseText = await response.text()
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
        `Request failed (${response.status}).`
    )
  }

  return data
}

export default function Rankings() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [selectedSopKey, setSelectedSopKey] = useState(null)
  const [workspaceTab, setWorkspaceTab] = useState('rankings')

  const [isSme, setIsSme] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [smeName, setSmeName] = useState('SME Reviewer')

  const [commentDrafts, setCommentDrafts] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [resolveRecord, setResolveRecord] = useState(null)
  const [resolutionNote, setResolutionNote] = useState('')

  function flash(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2500)
  }

  async function loadFeedback() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/feedback')
      const data = await readApiResponse(response)

      if (!Array.isArray(data)) {
        throw new Error('The feedback API did not return a list.')
      }

      setRecords(data)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not load feedback.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFeedback()
  }, [])

  const grouped = useMemo(() => {
    const groups = new Map()

    for (const record of records) {
      const key = record.sop_url || record.sop_name || `unknown-${record.id}`
      const current = groups.get(key) || {
        key,
        name: record.sop_name || 'Unknown SOP',
        url: record.sop_url || '',
        state: record.state || '',
        effective: 0,
        confusing: 0,
        outdated: 0,
        open: 0,
        resolved: 0,
        records: []
      }

      if (record.feedback_type === 'effective') current.effective += 1
      if (record.feedback_type === 'confusing') current.confusing += 1
      if (record.feedback_type === 'outdated') current.outdated += 1
      if (record.status === 'open') current.open += 1
      if (record.status === 'resolved') current.resolved += 1

      current.records.push(record)
      groups.set(key, current)
    }

    return [...groups.values()]
  }, [records])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return grouped

    return grouped.filter(group =>
      `${group.name} ${group.state}`.toLowerCase().includes(query)
    )
  }, [grouped, search])

  const effectiveRanking = useMemo(
    () =>
      [...filtered]
        .filter(group => group.effective > 0)
        .sort(
          (a, b) =>
            b.effective - a.effective || a.name.localeCompare(b.name)
        ),
    [filtered]
  )

  const reviewRanking = useMemo(
    () =>
      [...filtered]
        .map(group => ({
          ...group,
          records: group.records.filter(
            record =>
              record.status === 'open' &&
              ['confusing', 'outdated'].includes(record.feedback_type)
          )
        }))
        .filter(group => group.records.length > 0)
        .map(group => ({
          ...group,
          confusing: group.records.filter(
            record => record.feedback_type === 'confusing'
          ).length,
          outdated: group.records.filter(
            record => record.feedback_type === 'outdated'
          ).length
        }))
        .sort((a, b) => {
          const scoreA = a.outdated * 2 + a.confusing
          const scoreB = b.outdated * 2 + b.confusing
          return scoreB - scoreA || b.outdated - a.outdated
        }),
    [filtered]
  )

  const resolvedGroups = useMemo(
    () =>
      [...filtered]
        .map(group => ({
          ...group,
          records: group.records
            .filter(record => record.status === 'resolved')
            .sort(
              (a, b) =>
                new Date(b.resolved_at || b.created_at) -
                new Date(a.resolved_at || a.created_at)
            )
        }))
        .filter(group => group.records.length > 0),
    [filtered]
  )

  const selectedSop = useMemo(
    () => grouped.find(group => group.key === selectedSopKey) || null,
    [grouped, selectedSopKey]
  )

  const totals = useMemo(
    () => ({
      effective: records.filter(r => r.feedback_type === 'effective').length,
      confusing: records.filter(r => r.feedback_type === 'confusing').length,
      outdated: records.filter(r => r.feedback_type === 'outdated').length,
      open: records.filter(r => r.status === 'open').length,
      resolved: records.filter(r => r.status === 'resolved').length
    }),
    [records]
  )

  function login(event) {
    event.preventDefault()

    if (!email.trim() || !password.trim()) return

    const displayName = email.includes('@')
      ? email.split('@')[0].replace(/[._-]+/g, ' ')
      : 'SME Reviewer'

    setSmeName(displayName || 'SME Reviewer')
    setIsSme(true)
    setShowLogin(false)
    setPassword('')
    flash('Signed in as an SME reviewer.')
  }

  async function addComment(recordId) {
    const comment = (commentDrafts[recordId] || '').trim()
    if (!comment) return

    setSavingId(recordId)
    setError('')

    try {
      const response = await fetch(`/feedback/${recordId}/comment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
      })

      await readApiResponse(response)
      setCommentDrafts(current => ({ ...current, [recordId]: '' }))
      await loadFeedback()
      flash('SME comment saved.')
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not save the SME comment.'
      )
    } finally {
      setSavingId(null)
    }
  }

  async function resolveFeedback() {
    if (!resolveRecord || !resolutionNote.trim()) return

    setSavingId(resolveRecord.id)
    setError('')

    try {
      const response = await fetch(
        `/feedback/${resolveRecord.id}/resolve`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resolution_note: resolutionNote.trim(),
            resolved_by: smeName || 'SME Reviewer'
          })
        }
      )

      await readApiResponse(response)
      setResolveRecord(null)
      setResolutionNote('')
      await loadFeedback()
      flash('Query marked as resolved.')
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not resolve the query.'
      )
    } finally {
      setSavingId(null)
    }
  }

  async function reopenFeedback(recordId) {
    setSavingId(recordId)
    setError('')

    try {
      const response = await fetch(`/feedback/${recordId}/reopen`, {
        method: 'PATCH'
      })

      await readApiResponse(response)
      await loadFeedback()
      flash('Query returned to the open review queue.')
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not reopen the query.'
      )
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className="rankings-page">
      <div className="rankings-heading">
        <div>
          <span className="rankings-eyebrow">SME WORKSPACE</span>
          <h1>SOP Rankings</h1>
          <p>
            Review effective guidance and prioritize confusing or outdated SOPs.
          </p>
        </div>

        <div className="rankings-actions">
          {isSme ? (
            <>
              <div className="sme-identity">
                <ShieldCheck size={16} />
                <div>
                  <strong>{smeName}</strong>
                  <span>SME reviewer</span>
                </div>
              </div>

              <button
                className="sme-logout"
                onClick={() => setIsSme(false)}
              >
                <LogOut size={15} />
                Sign out
              </button>
            </>
          ) : (
            <button
              className="sme-login-button"
              onClick={() => setShowLogin(true)}
            >
              <LogIn size={15} />
              SME Login
            </button>
          )}

          <button
            className="rankings-refresh"
            onClick={loadFeedback}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="ranking-stats">
        <StatCard
          icon={CheckCircle2}
          label="Effective SOPs"
          value={totals.effective}
          tone="effective"
        />
        <StatCard
          icon={AlertTriangle}
          label="Confusing SOPs"
          value={totals.confusing}
          tone="confusing"
        />
        <StatCard
          icon={Clock3}
          label="Outdated SOPs"
          value={totals.outdated}
          tone="outdated"
        />
        <StatCard
          icon={BarChart3}
          label="Open reviews"
          value={totals.open}
          tone="open"
        />
      </div>

      <div className="rankings-toolbar workspace-toolbar">
        <div className="workspace-tabs">
          <button
            className={workspaceTab === 'rankings' ? 'active' : ''}
            onClick={() => setWorkspaceTab('rankings')}
          >
            <BarChart3 size={15} />
            Rankings
          </button>

          <button
            className={workspaceTab === 'resolved' ? 'active' : ''}
            onClick={() => setWorkspaceTab('resolved')}
          >
            <CheckCircle2 size={15} />
            Resolved Queries
            <span>{totals.resolved}</span>
          </button>
        </div>

        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search by SOP or state..."
        />
      </div>

      {notice && <div className="rankings-notice">{notice}</div>}
      {error && <div className="rankings-error">{error}</div>}

      {loading ? (
        <div className="rankings-loading">
          <RefreshCw size={20} className="spin" />
          Loading feedback rankings...
        </div>
      ) : workspaceTab === 'rankings' ? (
        <div className="rankings-grid">
          <RankingPanel
            title="Effective SOP Ranking"
            subtitle="Ranked by Effective SOP votes"
            tone="effective"
            empty="No effective votes recorded yet."
            groups={effectiveRanking}
            onSelect={group => setSelectedSopKey(group.key)}
            renderScore={group => (
              <div className="ranking-main-score effective">
                <strong>{group.effective}</strong>
                <span>effective</span>
              </div>
            )}
          />

          <RankingPanel
            title="SOP Review Ranking"
            subtitle="Open outdated reports carry twice the review weight"
            tone="review"
            empty="No open confusing or outdated reports."
            groups={reviewRanking}
            onSelect={group => setSelectedSopKey(group.key)}
            renderScore={group => (
              <div className="ranking-review-counts">
                <span className="outdated-count">
                  {group.outdated} outdated
                </span>
                <span className="confusing-count">
                  {group.confusing} confusing
                </span>
              </div>
            )}
          />
        </div>
      ) : (
        <ResolvedQueries
          groups={resolvedGroups}
          isSme={isSme}
          savingId={savingId}
          onLogin={() => setShowLogin(true)}
          onReopen={reopenFeedback}
        />
      )}

      {selectedSop && (
        <FeedbackDetailsModal
          group={selectedSop}
          isSme={isSme}
          savingId={savingId}
          commentDrafts={commentDrafts}
          setCommentDrafts={setCommentDrafts}
          onAddComment={addComment}
          onResolve={record => {
            setResolveRecord(record)
            setResolutionNote('')
          }}
          onReopen={reopenFeedback}
          onLogin={() => setShowLogin(true)}
          onClose={() => setSelectedSopKey(null)}
        />
      )}

      {showLogin && (
        <Modal onClose={() => setShowLogin(false)}>
          <div className="sme-login-heading">
            <ShieldCheck size={24} />
            <div>
              <h2>SME Login</h2>
              <p>Demo login for authorized SOP reviewers.</p>
            </div>
          </div>

          <form className="sme-login-form" onSubmit={login}>
            <label>
              Work email
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="sme@company.com"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="Enter any password for this demo"
                required
              />
            </label>

            <button type="submit">Sign in as SME</button>
          </form>
        </Modal>
      )}

      {resolveRecord && (
        <Modal onClose={() => setResolveRecord(null)}>
          <div className="resolve-heading">
            <CheckCircle2 size={24} />
            <div>
              <h2>Resolve this query</h2>
              <p>{resolveRecord.question}</p>
            </div>
          </div>

          <label className="resolution-field">
            Resolution note
            <textarea
              rows="5"
              value={resolutionNote}
              onChange={event => setResolutionNote(event.target.value)}
              placeholder="Describe what was corrected, clarified, or verified."
            />
          </label>

          <div className="resolution-actions">
            <button
              className="secondary"
              onClick={() => setResolveRecord(null)}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={
                !resolutionNote.trim() || savingId === resolveRecord.id
              }
              onClick={resolveFeedback}
            >
              <CheckCircle2 size={15} />
              {savingId === resolveRecord.id
                ? 'Resolving...'
                : 'Mark resolved'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}

function RankingPanel({
  title,
  subtitle,
  tone,
  groups,
  empty,
  renderScore,
  onSelect
}) {
  return (
    <div className={`ranking-panel ${tone}`}>
      <div className="ranking-panel-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span>{groups.length} SOPs</span>
      </div>

      <div className="ranking-list">
        {groups.length === 0 ? (
          <div className="ranking-empty">{empty}</div>
        ) : (
          groups.map((group, index) => (
            <button
              className="ranking-row"
              key={group.key}
              onClick={() => onSelect(group)}
            >
              <span className="ranking-number">{index + 1}</span>

              <div className="ranking-name">
                <strong>{group.name}</strong>
                <span>
                  {group.state || 'General'} · {group.records.length}{' '}
                  feedback record{group.records.length === 1 ? '' : 's'}
                </span>
              </div>

              {renderScore(group)}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function FeedbackDetailsModal({
  group,
  isSme,
  savingId,
  commentDrafts,
  setCommentDrafts,
  onAddComment,
  onResolve,
  onReopen,
  onLogin,
  onClose
}) {
  return (
    <div className="ranking-modal-backdrop" onMouseDown={onClose}>
      <div
        className="ranking-modal"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="ranking-modal-header">
          <div>
            <span>FEEDBACK DETAILS</span>
            <h2>{group.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Close feedback details">
            <X size={19} />
          </button>
        </div>

        {group.url && (
          <a
            className="ranking-source-link"
            href={sourceHref(group.url)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText size={17} />
            <div>
              <strong>{group.name}</strong>
              <span>Open SOP resource</span>
            </div>
            <ExternalLink size={15} />
          </a>
        )}

        <div className="ranking-record-list">
          {group.records.map(record => (
            <article className="ranking-record" key={record.id}>
              <div className="ranking-record-top">
                <FeedbackBadge type={record.feedback_type} />
                <span className={`record-status ${record.status}`}>
                  {record.status}
                </span>
              </div>

              <div className="ranking-field">
                <label>User question</label>
                <p>{record.question || 'Question not recorded.'}</p>
              </div>

              <div className="ranking-field">
                <label>TabWink response</label>
                <p>{record.response || 'Response not recorded.'}</p>
              </div>

              {record.user_note && (
                <div className="ranking-field user-note">
                  <label>User note</label>
                  <p>{record.user_note}</p>
                </div>
              )}

              {record.sme_comment && (
                <div className="ranking-field sme-note">
                  <label>SME comment</label>
                  <p>{record.sme_comment}</p>
                </div>
              )}

              {record.status === 'resolved' && (
                <div className="ranking-field resolution-note">
                  <label>
                    Resolved by {record.resolved_by || 'SME Reviewer'}
                  </label>
                  <p>{record.resolution_note || 'No resolution note.'}</p>
                  <small>{formatDate(record.resolved_at)}</small>
                </div>
              )}

              <small>Submitted {formatDate(record.created_at)}</small>

              {isSme ? (
                <div className="sme-record-actions">
                  <div className="sme-comment-row">
                    <input
                      value={commentDrafts[record.id] || ''}
                      onChange={event =>
                        setCommentDrafts(current => ({
                          ...current,
                          [record.id]: event.target.value
                        }))
                      }
                      placeholder="Add or replace SME comment..."
                    />
                    <button
                      disabled={
                        !(commentDrafts[record.id] || '').trim() ||
                        savingId === record.id
                      }
                      onClick={() => onAddComment(record.id)}
                    >
                      <Send size={14} />
                    </button>
                  </div>

                  {record.status === 'resolved' ? (
                    <button
                      className="reopen-button"
                      disabled={savingId === record.id}
                      onClick={() => onReopen(record.id)}
                    >
                      <ArchiveRestore size={15} />
                      Reopen query
                    </button>
                  ) : record.feedback_type !== 'effective' ? (
                    <button
                      className="resolve-button"
                      onClick={() => onResolve(record)}
                    >
                      <CheckCircle2 size={15} />
                      Resolve query
                    </button>
                  ) : null}
                </div>
              ) : record.feedback_type !== 'effective' ? (
                <button className="record-login-button" onClick={onLogin}>
                  <LogIn size={14} />
                  SME login to comment or resolve
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function ResolvedQueries({
  groups,
  isSme,
  savingId,
  onLogin,
  onReopen
}) {
  const records = groups.flatMap(group =>
    group.records.map(record => ({ ...record, group }))
  )

  if (records.length === 0) {
    return (
      <div className="resolved-empty">
        <CheckCircle2 size={28} />
        <h2>No resolved queries yet</h2>
        <p>Resolved SME reviews will appear here.</p>
      </div>
    )
  }

  return (
    <div className="resolved-grid">
      {records.map(record => (
        <article className="resolved-card" key={record.id}>
          <div className="resolved-card-top">
            <span className="resolved-badge">
              <CheckCircle2 size={13} />
              Resolved
            </span>
            <small>{formatDate(record.resolved_at)}</small>
          </div>

          <h2>{record.group.name}</h2>

          <div className="ranking-field">
            <label>User question</label>
            <p>{record.question || 'Question not recorded.'}</p>
          </div>

          <div className="ranking-field resolution-note">
            <label>
              Resolution by {record.resolved_by || 'SME Reviewer'}
            </label>
            <p>{record.resolution_note || 'No resolution note.'}</p>
          </div>

          {record.group.url && (
            <a
              className="resolved-source"
              href={sourceHref(record.group.url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText size={15} />
              Open SOP source
              <ExternalLink size={13} />
            </a>
          )}

          {isSme ? (
            <button
              className="reopen-button"
              disabled={savingId === record.id}
              onClick={() => onReopen(record.id)}
            >
              <ArchiveRestore size={15} />
              {savingId === record.id ? 'Reopening...' : 'Reopen query'}
            </button>
          ) : (
            <button className="record-login-button" onClick={onLogin}>
              <LogIn size={14} />
              SME login to reopen
            </button>
          )}
        </article>
      ))}
    </div>
  )
}

function Modal({ children, onClose }) {
  return (
    <div className="ranking-modal-backdrop" onMouseDown={onClose}>
      <div
        className="sme-action-modal"
        onMouseDown={event => event.stopPropagation()}
      >
        <button
          className="sme-modal-close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className={`ranking-stat ${tone}`}>
      <div className="ranking-stat-icon">
        <Icon size={18} />
      </div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

function FeedbackBadge({ type }) {
  const labels = {
    effective: 'Effective SOP',
    confusing: 'Confusing',
    outdated: 'Outdated SOP'
  }

  return (
    <span className={`feedback-type-badge ${type}`}>
      {labels[type] || type}
    </span>
  )
}
