'use client'

import { useEffect, useState } from 'react'

interface Gateway {
  id: string
  name: string
  apiKey: string
  publicIp: string | null
  wireguardPublicKey: string | null
  status: string
  lastSeenAt: string | null
  createdAt: string
}

export default function GatewaysPage() {
  const [gateways, setGateways] = useState<Gateway[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newGatewayName, setNewGatewayName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ publicIp: '' })

  useEffect(() => {
    fetchGateways()
  }, [])

  async function fetchGateways() {
    try {
      const res = await fetch('/api/gateways')
      if (!res.ok) throw new Error('Failed to fetch gateways')
      const data = await res.json()
      setGateways(data)
    } catch (err) {
      setError('Failed to load gateways')
    } finally {
      setLoading(false)
    }
  }

  async function createGateway() {
    if (!newGatewayName.trim()) {
      alert('Please enter gateway name')
      return
    }

    try {
      const res = await fetch('/api/gateways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGatewayName }),
      })

      if (!res.ok) throw new Error('Failed to create gateway')

      setNewGatewayName('')
      setShowNewForm(false)
      fetchGateways()
    } catch (err) {
      alert('Failed to create gateway')
    }
  }

  async function deleteGateway(id: string) {
    if (!confirm('Are you sure you want to delete this gateway?')) return

    try {
      const res = await fetch(`/api/gateways/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to delete gateway')
      fetchGateways()
    } catch (err) {
      alert('Failed to delete gateway')
    }
  }

  function startEdit(gateway: Gateway) {
    setEditingId(gateway.id)
    setEditForm({ publicIp: gateway.publicIp || '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm({ publicIp: '' })
  }

  async function saveEdit(id: string) {
    try {
      const res = await fetch(`/api/gateways/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicIp: editForm.publicIp || null }),
      })

      if (!res.ok) throw new Error('Failed to update gateway')

      setEditingId(null)
      setEditForm({ publicIp: '' })
      fetchGateways()
    } catch (err) {
      alert('Failed to update gateway')
    }
  }

  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Gateways</h1>
        <button onClick={() => setShowNewForm(!showNewForm)}>
          {showNewForm ? 'Cancel' : 'New Gateway'}
        </button>
      </div>

      {showNewForm && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2>Create New Gateway</h2>
          <div className="form-group">
            <label>Gateway Name</label>
            <input
              type="text"
              value={newGatewayName}
              onChange={(e) => setNewGatewayName(e.target.value)}
              placeholder="gateway-1"
            />
          </div>
          <button onClick={createGateway}>Create Gateway</button>
        </div>
      )}

      <div className="card">
        <h2>Gateway List ({gateways.length})</h2>
        {gateways.length === 0 ? (
          <p style={{ color: '#666' }}>No gateways yet. Create one to get started.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Public IP</th>
                <th>API Key</th>
                <th>Last Seen</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {gateways.map((gateway) => (
                <tr key={gateway.id}>
                  <td><strong>{gateway.name}</strong></td>
                  <td>
                    <span className={`status ${gateway.status}`}>
                      {gateway.status}
                    </span>
                  </td>
                  <td>
                    {editingId === gateway.id ? (
                      <input
                        type="text"
                        value={editForm.publicIp}
                        onChange={(e) => setEditForm({ publicIp: e.target.value })}
                        placeholder="1.2.3.4"
                        style={{ width: '120px', fontSize: '0.875rem' }}
                      />
                    ) : (
                      <code>{gateway.publicIp || '-'}</code>
                    )}
                  </td>
                  <td>
                    <code style={{ fontSize: '0.75rem' }}>
                      {gateway.apiKey.substring(0, 20)}...
                    </code>
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#666' }}>
                    {gateway.lastSeenAt
                      ? new Date(gateway.lastSeenAt).toLocaleString()
                      : 'Never'}
                  </td>
                  <td>
                    {editingId === gateway.id ? (
                      <>
                        <button
                          onClick={() => saveEdit(gateway.id)}
                          style={{ marginRight: '0.5rem' }}
                        >
                          Save
                        </button>
                        <button onClick={cancelEdit}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(gateway)}
                          style={{ marginRight: '0.5rem' }}
                        >
                          Edit
                        </button>
                        <button
                          className="danger"
                          onClick={() => deleteGateway(gateway.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
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
