# kakuremichi（隠れ道）

A self-hosted tunnel-based reverse proxy system inspired by CloudFlare Tunnel and Pangolin.

**Project Status:** Phase 1 Implementation (Basic Architecture)

## Overview

kakuremichi enables secure access to services behind firewalls and NAT without requiring port forwarding. It consists of three main components:

- **Control**: Central management server (Node.js + Next.js)
- **Gateway**: Entry nodes that receive external traffic (Go + WireGuard)
- **Agent**: Edge clients deployed on origin networks (Go + WireGuard)

## Architecture

```
┌─────────┐
│ Control │ ← Web UI & REST API
└─────────┘
  ↓ WebSocket  ↓ WebSocket
  (config)     (config)
  ↓            ↓
[Gateway]    [Agent]
   ↓ WireGuard  ↓
External    Private
Users       Apps
```

**Key Design Principles:**
- **Control Plane & Data Plane Separation**: Management traffic and actual data traffic are completely separated
- **Multi-Gateway Support**: Deploy multiple gateways for load balancing and high availability
- **Scalable**: Add gateways and agents dynamically without reconfiguration

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Go 1.23+ (for local development)
- Node.js 22+ (for local development)

### Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/yourorg/kakuremichi.git
cd kakuremichi

# Start all components
docker-compose -f docker/docker-compose.yml up
```

Access the Control Panel at http://localhost:3000

### Local Development

#### Control Server

```bash
cd control
npm install
npm run db:migrate
npm run dev
```

#### Gateway

```bash
cd gateway
go mod download
go run ./cmd/gateway --api-key=gtw_dev_key --control-url=ws://localhost:3001
```

#### Agent

```bash
cd agent
go mod download
go run ./cmd/agent --api-key=agt_dev_key --control-url=ws://localhost:3001
```

## Project Structure

```
kakuremichi/
├── control/              # Control server (Node.js + Next.js)
│   ├── src/
│   │   ├── app/         # Next.js App Router
│   │   ├── lib/db/      # Drizzle ORM & schemas
│   │   └── lib/utils/   # Utilities
│   └── package.json
├── gateway/              # Gateway (Go)
│   ├── cmd/gateway/
│   ├── internal/
│   └── go.mod
├── agent/                # Agent (Go)
│   ├── cmd/agent/
│   ├── internal/
│   └── go.mod
├── docker/               # Docker configurations
│   ├── control/
│   ├── gateway/
│   ├── agent/
│   └── docker-compose.yml
└── docs/                 # Documentation
```

## Phase 1 Implementation Status

### Completed
- ✅ Project structure & monorepo setup
- ✅ Control: Database schema (Drizzle ORM + SQLite)
- ✅ Control: REST API (Agent/Gateway/Tunnel CRUD)
- ✅ Gateway: Basic configuration & skeleton code
- ✅ Agent: Basic configuration & skeleton code
- ✅ Docker: Dockerfiles & docker-compose.yml

### In Progress
- 🚧 WireGuard integration (Gateway & Agent)
- 🚧 Local proxy (Agent)
- 🚧 WebSocket communication (Control ⇔ Gateway/Agent)

### Recently Completed
- ✅ HTTP reverse proxy (Gateway)
- ✅ Let's Encrypt SSL automation (ACME HTTP-01)

### Planned (Phase 2+)
- ⏳ Web UI (Next.js frontend)
- ⏳ Kubernetes integration
- ⏳ Multi-organization support

See [SUMMARY.md](SUMMARY.md) for detailed roadmap.

## Documentation

- [Deployment Guide](DEPLOYMENT.md) - Production deployment and SSL setup
- [Requirements](requirements.md) - MVP requirements and use cases
- [Architecture](claude.md) - System architecture and WireGuard design
- [Data Model](data-model.md) - Database schema
- [API Design](api-design.md) - REST API and WebSocket protocol
- [Tech Stack](tech-stack.md) - Technologies and libraries
- [Documentation Index](DOCUMENTATION_INDEX.md) - All documentation files

## Technology Stack

- **Control**: Node.js 22, TypeScript 5, Next.js 15, Drizzle ORM, SQLite
- **Gateway**: Go 1.23, WireGuard, Let's Encrypt (autocert)
- **Agent**: Go 1.23, WireGuard + netstack, Docker client

## Development

### Running Tests

```bash
# Control
cd control
npm test

# Gateway
cd gateway
go test ./...

# Agent
cd agent
go test ./...
```

### Database Migrations

```bash
cd control
npm run db:generate  # Generate migration files
npm run db:migrate   # Apply migrations
npm run db:studio    # Open Drizzle Studio
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Inspired by [Pangolin](https://github.com/pangolindex/pangolin) and CloudFlare Tunnel
- Uses [WireGuard](https://www.wireguard.com/) for secure tunneling

---

**Project Created:** 2025-11-22
**Last Updated:** 2025-11-22 (ACME/SSL automation implemented)
