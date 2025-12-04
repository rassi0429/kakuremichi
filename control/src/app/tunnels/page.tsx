'use client'

import { useEffect, useState } from 'react'

interface GatewayIP {
  gatewayId: string
  gatewayName: string
  ip: string
}

interface Tunnel {
  id: string
  domain: string
  target: string
  agentId: string
  enabled: boolean
  subnet: string | null
  agentIp: string | null
  gatewayIps: GatewayIP[]
  httpProxyEnabled: boolean
  socksProxyEnabled: boolean
  createdAt: string
  updatedAt: string
}

interface Agent {
  id: string
  name: string
}

export default function TunnelsPage() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [formData, setFormData] = useState({
    domain: '',
    target: '',
    agentId: '',
    httpProxyEnabled: false,
    socksProxyEnabled: false,
  })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const [tunnelsRes, agentsRes] = await Promise.all([
        fetch('/api/tunnels'),
        fetch('/api/agents'),
      ])

      if (!tunnelsRes.ok || !agentsRes.ok) throw new Error('Failed to fetch data')

      const tunnelsData = await tunnelsRes.json()
      const agentsData = await agentsRes.json()

      setTunnels(tunnelsData)
      setAgents(agentsData)
    } catch (err) {
      setError('Failed to load tunnels')
    } finally {
      setLoading(false)
    }
  }

  async function createTunnel() {
    if (!formData.domain || !formData.target || !formData.agentId) {
      alert('Please fill in all fields')
      return
    }

    try {
      const res = await fetch('/api/tunnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) throw new Error('Failed to create tunnel')

      setFormData({ domain: '', target: '', agentId: '', httpProxyEnabled: false, socksProxyEnabled: false })
      setShowNewForm(false)
      fetchData()
    } catch (err) {
      alert('Failed to create tunnel')
    }
  }

  async function toggleTunnel(id: string, enabled: boolean) {
    try {
      const res = await fetch(`/api/tunnels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      })

      if (!res.ok) throw new Error('Failed to toggle tunnel')
      fetchData()
    } catch (err) {
      alert('Failed to toggle tunnel')
    }
  }

  async function deleteTunnel(id: string) {
    if (!confirm('Are you sure you want to delete this tunnel?')) return

    try {
      const res = await fetch(`/api/tunnels/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Failed to delete tunnel')
      fetchData()
    } catch (err) {
      alert('Failed to delete tunnel')
    }
  }

  function getAgentName(agentId: string) {
    const agent = agents.find(a => a.id === agentId)
    return agent ? agent.name : 'Unknown'
  }

  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Tunnels</h1>
        <button onClick={() => setShowNewForm(!showNewForm)}>
          {showNewForm ? 'Cancel' : 'New Tunnel'}
        </button>
      </div>

      {showNewForm && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2>Create New Tunnel</h2>
          <div className="form-group">
            <label>Domain</label>
            <input
              type="text"
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              placeholder="app.example.com"
            />
          </div>
          <div className="form-group">
            <label>Target</label>
            <input
              type="text"
              value={formData.target}
              onChange={(e) => setFormData({ ...formData, target: e.target.value })}
              placeholder="http://localhost:8080"
            />
          </div>
          <div className="form-group">
            <label>Agent</label>
            <select
              value={formData.agentId}
              onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
            >
              <option value="">Select an agent</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: '#666' }}>Exit Node Settings</h3>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.httpProxyEnabled}
                  onChange={(e) => setFormData({ ...formData, httpProxyEnabled: e.target.checked })}
                />
                <span>Enable HTTP Proxy (localhost:8080)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.socksProxyEnabled}
                  onChange={(e) => setFormData({ ...formData, socksProxyEnabled: e.target.checked })}
                />
                <span>Enable SOCKS5 Proxy (localhost:1080)</span>
              </label>
            </div>
          </div>
          <button onClick={createTunnel}>Create Tunnel</button>
        </div>
      )}

      <div className="card">
        <h2>Tunnel List ({tunnels.length})</h2>
        {tunnels.length === 0 ? (
          <p style={{ color: '#666' }}>No tunnels yet. Create one to get started.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Target</th>
                <th>Agent</th>
                <th>Network</th>
                <th>Exit Node</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tunnels.map((tunnel) => (
                <tr key={tunnel.id}>
                  <td><strong>{tunnel.domain}</strong></td>
                  <td><code>{tunnel.target}</code></td>
                  <td>{getAgentName(tunnel.agentId)}</td>
                  <td style={{ fontSize: '0.75rem' }}>
                    {tunnel.subnet ? (
                      <div>
                        <div><code>{tunnel.subnet}</code></div>
                        <div style={{ color: '#666' }}>
                          Agent: {tunnel.agentIp}
                        </div>
                        {tunnel.gatewayIps && tunnel.gatewayIps.length > 0 && (
                          <div style={{ color: '#666', marginTop: '4px' }}>
                            {tunnel.gatewayIps.map((gw) => (
                              <div key={gw.gatewayId}>
                                GW ({gw.gatewayName}): {gw.ip}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}>-</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.75rem' }}>
                    {(tunnel.httpProxyEnabled || tunnel.socksProxyEnabled) ? (
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {tunnel.httpProxyEnabled && (
                          <span style={{
                            background: '#e3f2fd',
                            color: '#1565c0',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem'
                          }}>HTTP</span>
                        )}
                        {tunnel.socksProxyEnabled && (
                          <span style={{
                            background: '#f3e5f5',
                            color: '#7b1fa2',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem'
                          }}>SOCKS5</span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}>-</span>
                    )}
                  </td>
                  <td>
                    <span className={`status ${tunnel.enabled ? 'online' : 'offline'}`}>
                      {tunnel.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="secondary"
                        onClick={() => toggleTunnel(tunnel.id, tunnel.enabled)}
                      >
                        {tunnel.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        className="danger"
                        onClick={() => deleteTunnel(tunnel.id)}
                      >
                        Delete
                      </button>
                    </div>
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
