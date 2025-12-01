'use client'

import { useEffect, useState } from 'react'

interface Agent {
  id: string
  name: string
  apiKey: string
  wireguardPublicKey: string | null
  status: string
  lastSeenAt: string | null
  createdAt: string
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newAgentName, setNewAgentName] = useState('')

  useEffect(() => {
    fetchAgents()
  }, [])

  async function fetchAgents() {
    try {
      const res = await fetch('/api/agents')
      if (!res.ok) throw new Error('Failed to fetch agents')
      const data = await res.json()
      setAgents(data)
    } catch (err) {
      setError('Failed to load agents')
    } finally {
      setLoading(false)
    }
  }

  async function createAgent() {
    if (!newAgentName.trim()) {
      alert('Please enter agent name')
      return
    }

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAgentName }),
      })

      if (!res.ok) throw new Error('Failed to create agent')

      setNewAgentName('')
      setShowNewForm(false)
      fetchAgents()
    } catch (err) {
      alert('Failed to create agent')
    }
  }

  async function deleteAgent(id: string) {
    if (!confirm('Are you sure you want to delete this agent?')) return

    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to delete agent')
      fetchAgents()
    } catch (err) {
      alert('Failed to delete agent')
    }
  }

  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Agents</h1>
        <button onClick={() => setShowNewForm(!showNewForm)}>
          {showNewForm ? 'Cancel' : 'New Agent'}
        </button>
      </div>

      {showNewForm && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2>Create New Agent</h2>
          <div className="form-group">
            <label>Agent Name</label>
            <input
              type="text"
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              placeholder="my-agent"
            />
          </div>
          <button onClick={createAgent}>Create Agent</button>
        </div>
      )}

      <div className="card">
        <h2>Agent List ({agents.length})</h2>
        {agents.length === 0 ? (
          <p style={{ color: '#666' }}>No agents yet. Create one to get started.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>API Key</th>
                <th>Last Seen</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td><strong>{agent.name}</strong></td>
                  <td>
                    <span className={`status ${agent.status}`}>
                      {agent.status}
                    </span>
                  </td>
                  <td>
                    <code style={{ fontSize: '0.75rem' }}>
                      {agent.apiKey}
                    </code>
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#666' }}>
                    {agent.lastSeenAt
                      ? new Date(agent.lastSeenAt).toLocaleString()
                      : 'Never'}
                  </td>
                  <td>
                    <button
                      className="danger"
                      onClick={() => deleteAgent(agent.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
