# Control - フロントエンド（Web UI）

## 概要

ControlサーバーのWeb UI実装。Next.js App Router + Reactを使用。

**パス**: `control/src/app/`

---

## ページ構成

```
control/src/app/
├── layout.tsx                    # ルートレイアウト
├── page.tsx                      # / (ダッシュボード) - 認証必須
├── login/
│   └── page.tsx                  # /login (ログインページ) - 認証不要
├── agents/
│   ├── page.tsx                  # /agents (Agent一覧) - 認証必須
│   ├── new/
│   │   └── page.tsx              # /agents/new (Agent追加) - 認証必須
│   └── [id]/
│       └── page.tsx              # /agents/:id (Agent詳細) - 認証必須
├── gateways/
│   ├── page.tsx                  # /gateways (Gateway一覧) - 認証必須
│   ├── new/
│   │   └── page.tsx              # /gateways/new (Gateway追加) - 認証必須
│   └── [id]/
│       └── page.tsx              # /gateways/:id (Gateway詳細) - 認証必須
└── tunnels/
    ├── page.tsx                  # /tunnels (Tunnel一覧) - 認証必須
    ├── new/
    │   └── page.tsx              # /tunnels/new (Tunnel追加) - 認証必須
    └── [id]/
        └── page.tsx              # /tunnels/:id (Tunnel詳細・編集) - 認証必須
```

---

## コンポーネント構成

```
control/src/components/
├── ui/                           # 汎用UIコンポーネント
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Table.tsx
│   ├── Badge.tsx
│   ├── Modal.tsx
│   └── CopyButton.tsx
├── layout/
│   ├── Header.tsx
│   └── Sidebar.tsx
├── agents/
│   ├── AgentList.tsx
│   ├── AgentCard.tsx
│   ├── AgentStatusBadge.tsx
│   └── CreateAgentForm.tsx
├── gateways/
│   ├── GatewayList.tsx
│   ├── GatewayCard.tsx
│   └── CreateGatewayForm.tsx
└── tunnels/
    ├── TunnelList.tsx
    ├── TunnelCard.tsx
    ├── CreateTunnelForm.tsx
    └── EditTunnelForm.tsx
```

---

## ルートレイアウト

**ファイル**: `control/src/app/layout.tsx`

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'kakuremichi - Control Panel',
  description: 'Tunnel reverse proxy management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <div className="flex h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
```

---

## ログインページ

**ファイル**: `control/src/app/login/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        router.push('/');
        router.refresh();
      } else {
        const data = await response.json();
        setError(data.error?.message || 'ログインに失敗しました');
      }
    } catch (err) {
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">kakuremichi</h1>
        <h2 className="text-lg text-gray-600 mb-6 text-center">管理者ログイン</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              パスワード
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </Button>
        </form>

        <div className="mt-6 text-sm text-gray-600 text-center">
          <p>環境変数 ADMIN_PASSWORD でパスワードを設定してください</p>
        </div>
      </Card>
    </div>
  );
}
```

**注意**: このページはルートレイアウトを使用しない独立したレイアウトです。

---

## 認証ミドルウェア（クライアントサイド）

**ファイル**: `control/src/middleware.ts`

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { SessionData } from '@/lib/auth/session';

const publicPaths = ['/login', '/api/auth/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公開パスはスキップ
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // インストールスクリプトはスキップ
  if (pathname.startsWith('/api/install/')) {
    return NextResponse.next();
  }

  try {
    const session = await getIronSession<SessionData>(cookies(), {
      password: process.env.SESSION_SECRET!,
      cookieName: 'kakuremichi-session',
    });

    if (!session.authenticated) {
      // 未認証の場合はログインページへリダイレクト
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Middleware error:', error);
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

---

## ダッシュボード

**ファイル**: `control/src/app/page.tsx`

```typescript
import { Card } from '@/components/ui/Card';
import { getAllAgents } from '@/lib/db/queries/agents';
import { getAllGateways } from '@/lib/db/queries/gateways';
import { getAllTunnels } from '@/lib/db/queries/tunnels';

export default async function DashboardPage() {
  const agents = await getAllAgents();
  const gateways = await getAllGateways();
  const tunnels = await getAllTunnels();

  const onlineAgents = agents.filter(a => a.status === 'online').length;
  const onlineGateways = gateways.filter(g => g.status === 'online').length;
  const activeTunnels = tunnels.filter(t => t.enabled).length;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">ダッシュボード</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <h3 className="text-lg font-semibold text-gray-700">Agents</h3>
          <div className="mt-2">
            <span className="text-3xl font-bold">{agents.length}</span>
            <span className="text-sm text-gray-500 ml-2">
              ({onlineAgents} online)
            </span>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-700">Gateways</h3>
          <div className="mt-2">
            <span className="text-3xl font-bold">{gateways.length}</span>
            <span className="text-sm text-gray-500 ml-2">
              ({onlineGateways} online)
            </span>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-700">Tunnels</h3>
          <div className="mt-2">
            <span className="text-3xl font-bold">{tunnels.length}</span>
            <span className="text-sm text-gray-500 ml-2">
              ({activeTunnels} active)
            </span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold mb-4">最近のAgent</h3>
          <ul className="space-y-2">
            {agents.slice(0, 5).map(agent => (
              <li key={agent.id} className="flex items-center justify-between">
                <span>{agent.name}</span>
                <span className={`text-sm ${agent.status === 'online' ? 'text-green-600' : 'text-gray-400'}`}>
                  {agent.status}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold mb-4">最近のTunnel</h3>
          <ul className="space-y-2">
            {tunnels.slice(0, 5).map(tunnel => (
              <li key={tunnel.id}>
                <span className="font-medium">{tunnel.domain}</span>
                <span className="text-sm text-gray-500 ml-2">
                  → {tunnel.target}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
```

---

## Agent一覧ページ

**ファイル**: `control/src/app/agents/page.tsx`

```typescript
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { AgentList } from '@/components/agents/AgentList';
import { getAllAgents } from '@/lib/db/queries/agents';

export default async function AgentsPage() {
  const agents = await getAllAgents();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Agents</h1>
        <Link href="/agents/new">
          <Button>+ Add Agent</Button>
        </Link>
      </div>

      <AgentList agents={agents} />
    </div>
  );
}
```

---

## Agent追加ページ

**ファイル**: `control/src/app/agents/new/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';

export default function NewAgentPage() {
  const [name, setName] = useState('');
  const [agent, setAgent] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const createAgent = async () => {
    if (!name) return;

    setLoading(true);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error.message);
        return;
      }

      const data = await res.json();
      setAgent(data);
    } catch (error) {
      alert('Failed to create agent');
    } finally {
      setLoading(false);
    }
  };

  if (agent) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Agent Created!</h1>

        <Card className="mb-6">
          <h2 className="text-xl font-semibold mb-4">Agent Details</h2>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm text-gray-600">Name</dt>
              <dd className="font-medium">{agent.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">API Key</dt>
              <dd className="font-mono text-sm">{agent.apiKey}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Virtual IP</dt>
              <dd className="font-mono text-sm">{agent.virtualIp}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Subnet</dt>
              <dd className="font-mono text-sm">{agent.subnet}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="text-xl font-semibold mb-4">Installation</h2>
          <p className="text-gray-600 mb-4">
            Run this command on your server to install the agent:
          </p>

          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
            <pre>{agent.installCommand}</pre>
          </div>

          <div className="mt-4 flex gap-2">
            <CopyButton text={agent.installCommand} />
            <Button onClick={() => router.push('/agents')} variant="secondary">
              Done
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Add New Agent</h1>

      <Card>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Agent Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., home-server"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Only alphanumeric characters, hyphens, and underscores
            </p>
          </div>

          <Button onClick={createAgent} disabled={!name || loading}>
            {loading ? 'Creating...' : 'Create Agent'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

---

## Tunnel一覧ページ

**ファイル**: `control/src/app/tunnels/page.tsx`

```typescript
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { TunnelList } from '@/components/tunnels/TunnelList';
import { getAllTunnels } from '@/lib/db/queries/tunnels';

export default async function TunnelsPage() {
  const tunnels = await getAllTunnels();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Tunnels</h1>
        <Link href="/tunnels/new">
          <Button>+ Create Tunnel</Button>
        </Link>
      </div>

      <TunnelList tunnels={tunnels} />
    </div>
  );
}
```

---

## Tunnel追加ページ

**ファイル**: `control/src/app/tunnels/new/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function NewTunnelPage() {
  const [agents, setAgents] = useState([]);
  const [domain, setDomain] = useState('');
  const [agentId, setAgentId] = useState('');
  const [target, setTarget] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Agent一覧取得
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => setAgents(data.agents));
  }, []);

  const createTunnel = async () => {
    if (!domain || !agentId || !target) return;

    setLoading(true);
    try {
      const res = await fetch('/api/tunnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, agentId, target, description }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error.message);
        return;
      }

      router.push('/tunnels');
    } catch (error) {
      alert('Failed to create tunnel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Create New Tunnel</h1>

      <Card>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Domain
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="app.example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Agent
            </label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select an agent</option>
              {agents.map((agent: any) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target
            </label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="localhost:8080"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Format: host:port (e.g., localhost:8080, 192.168.1.10:3000)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="My web application"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={createTunnel}
              disabled={!domain || !agentId || !target || loading}
            >
              {loading ? 'Creating...' : 'Create Tunnel'}
            </Button>
            <Button variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
```

---

## 汎用UIコンポーネント

### Button

**ファイル**: `control/src/components/ui/Button.tsx`

```typescript
import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const baseClasses = 'px-4 py-2 rounded-md font-medium transition-colors';
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
```

---

### CopyButton

**ファイル**: `control/src/components/ui/CopyButton.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Button } from './Button';

interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button onClick={copy}>
      {copied ? '✓ Copied!' : 'Copy to Clipboard'}
    </Button>
  );
}
```

---

### Badge

**ファイル**: `control/src/components/ui/Badge.tsx`

```typescript
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'default';
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  const colors = {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
    default: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[variant]}`}>
      {children}
    </span>
  );
}
```

---

## スタイリング

**ファイル**: `control/src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground: #111827;
  --background: #ffffff;
}

body {
  color: var(--foreground);
  background: var(--background);
  font-family: 'Inter', sans-serif;
}

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
}
```

---

## Tailwind設定

**ファイル**: `control/tailwind.config.ts`

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
