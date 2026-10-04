# BigWorm Gateway - Technical Architecture and Infrastructure

## 1. Frontend Technology Stack

BigWorm is built as a single-page web application specialized for high-throughput canvas streaming and keyboard/mouse event translation:

- Core Framework: React 19 (^19.0.0) with react-dom (^19.0.0), using functional components, standard hooks, and React Context.
- Build Toolchain: Vite 6 (^6.0.7) configured in [bigworm/vite.config.js](file:///e:/TechTrekGT/bigworm/vite.config.js). Uses @vitejs/plugin-react (^4.3.4) and outputs client bundles to dist/client.
- Remote Desktop Client Engine: guacamole-common-js (^1.5.0), the official JavaScript client library for Apache Guacamole. Provides canvas rendering, audio playback, mouse event normalization, keyboard scancode mapping, and WebSocket tunnel transport.
- Styling Framework: Tailwind CSS 3.4 (^3.4.17) configured in [bigworm/tailwind.config.js](file:///e:/TechTrekGT/bigworm/tailwind.config.js) with slate-950 foundations and cyan accents.
- Iconography: lucide-react (^0.474.0) for connection state badges, display controls, and terminal icons.

## 2. Serverless Edge Worker Architecture (src/worker.js)

BigWorm executes at the Cloudflare edge as an ESM Worker defined in [bigworm/src/worker.js](file:///e:/TechTrekGT/bigworm/src/worker.js) and configured via [bigworm/wrangler.jsonc](file:///e:/TechTrekGT/bigworm/wrangler.jsonc):

- Subdomain Route: Configured with pattern bigworm.techtrekgt.com and custom_domain: true.
- Assets Pipeline: ASSETS binding pointed to ./dist/client with run_worker_first: true.
- Pipeline Dispatch:
  - Auth Endpoints: /api/auth/login, /api/auth/logout, and /api/auth/me handle session lifecycle using shared platform JWT logic.
  - Guacamole Token Exchange: /api/guac-token validates the user JWT session, connects internally to Guacamole REST services, and returns a Guacamole session token and connection ID.
  - Tunnel Reverse Proxy: Any request path matching /tunnel/* is intercepted by handleTunnelProxy. The worker verifies the SSO JWT token before forwarding raw HTTP or WebSocket traffic to the internal Guacamole instance.
  - Static Asset Delivery: Requests not matching /api/* or /tunnel/* fall back to env.ASSETS.fetch(request) to serve the React SPA.

## 3. WebSocket Upgrade and Reverse Proxy Engine

Guacamole relies on real-time bidirectional communication over WebSockets for interactive screen updates:

- Tunnel Path Translation: Incoming requests to /tunnel/* are rewritten to /guacamole/* before forwarding to the internal upstream host defined by GUACAMOLE_INTERNAL_URL.
- WebSocket Upgrade Handling: When incoming requests contain Upgrade: websocket, Cloudflare Workers handle WebSocket upgrades transparently. If unauthorized, the worker returns a synthesized WebSocket closure response using WebSocketPair with code 1008 (Policy Violation).
- HTTP Tunnel Fallback: If WebSockets are blocked by client firewalls, guacamole-common-js falls back automatically to HTTP long-polling over the same tunnel endpoint.

## 4. Docker Compose Host Infrastructure

The backend services run on the local host machine using Docker Compose, declared in [bigworm/bigworm-docker-compose.yml](file:///e:/TechTrekGT/bigworm/bigworm-docker-compose.yml):

- Service guacd (guacamole/guacd:1.5.5):
  - The native protocol proxy daemon written in C.
  - Converts native remote desktop protocols (RDP, VNC, SSH) into the lightweight Guacamole streaming protocol.
  - Communicates internally over port 4822 within the isolated bridge network guacnet.
  - Configured with extra_hosts mapping host.docker.internal and TechTrek to the host gateway for direct access to host RDP services.
- Service guacamole (guacamole/guacamole:1.5.5):
  - Java servlet web application and REST API running on Apache Tomcat.
  - Port Binding: 127.0.0.1:8080:8080. Bound strictly to local loopback, preventing external access from the local area network or internet.
  - Configuration Volume: Mounts ./guacamole-config to /etc/guacamole:ro, providing file-based user and connection mappings (user-mapping.xml).
- Automation Script: Powershell launch utility [bigworm/start-bigworm.ps1](file:///e:/TechTrekGT/bigworm/start-bigworm.ps1) automates container startup and health verification.

## 5. Cloudflare Tunnel Bridge Architecture

The bridge between the edge Cloudflare Worker and the local Docker container is established via Cloudflare Tunnel (cloudflared):

- Outbound Tunnel Connection: A local cloudflared daemon establishes an encrypted outbound connection to Cloudflare edge nodes.
- Zero Public Inbound Exposure: No firewall ports are opened on the host router.
- Internal Route Target: Cloudflare Tunnel routes traffic targeting the internal tunnel hostname (configured in GUACAMOLE_INTERNAL_URL) straight to 127.0.0.1:8080 on the host machine.
- Security Wall: Traffic can only reach the tunnel hostname if it is authorized by the BigWorm Cloudflare Worker after successful JWT token verification.
