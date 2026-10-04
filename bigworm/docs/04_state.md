# BigWorm Gateway - State Architecture and Connection Lifecycle

## 1. Overview of State Architecture

BigWorm Gateway operates under a multi-tier state architecture. Frontend state is governed by a finite connection state machine that coordinates WebSocket tunnel lifecycles, user authentication, and input sinks. Backend state combines stateless JWT verification at the edge with transient session token exchanges against the internal Guacamole REST API.

## 2. Client Connection State Machine

The client interface in [bigworm/src/components/GuacamoleView.jsx](file:///e:/TechTrekGT/bigworm/src/components/GuacamoleView.jsx) implements an explicit six-stage finite state machine:

- STATE.IDLE: Initial uninitialized state prior to user connection trigger or on page load.
- STATE.FETCHING: The client invokes /api/guac-token with credentials: 'include'. The edge worker authenticates the user and requests a Guacamole auth token from the internal container.
- STATE.CONNECTING: The client creates a Guacamole.WebSocketTunnel pointing to /tunnel/websocket-tunnel with the retrieved token and connection ID, instantiating the Guacamole.Client instance.
- STATE.CONNECTED: The WebSocket handshake succeeds and the remote desktop stream begins painting frames onto the display canvas. Keyboard and mouse event listeners are attached.
- STATE.DISCONNECTED: The remote session is terminated cleanly, either by user action, remote host logout, or session timeout. The client destroys the canvas element and releases event sinks.
- STATE.ERROR: An error occurs during token retrieval, tunnel communication, or remote host connection. The UI renders error messaging detailing whether the failure stems from authentication, tunnel unavailability, or misconfigured connection mappings.

## 3. Session Authentication and Platform State

Authentication state is managed via [bigworm/src/context/AuthContext.jsx](file:///e:/TechTrekGT/bigworm/src/context/AuthContext.jsx):

- Context Fields: user (profile data including id, email, is_admin), isAuthenticated, and isLoading.
- Session Invariant: Sessions rely exclusively on the HttpOnly SameSite=Strict auth_token cookie. JavaScript has zero direct access to raw token secrets.
- Verification Handshake: On mount, AuthContext queries /api/auth/me to validate the edge JWT token. If valid, the client transitions from loading directly to the Guacamole view.
- Automatic Cleanup: Invoking logout clears the session cookie at the edge, disconnects any active WebSocket tunnels, and resets the local connection state machine back to idle.

## 4. Guacamole Token Exchange and Tunnel Proxying

The edge worker coordinates token generation and proxy state without exposing internal credentials to the browser:

- Token Exchange (/api/guac-token):
  - The worker validates the incoming JWT cookie using JWT_SECRET.
  - The worker reads GUAC_USERNAME and GUAC_PASSWORD from environment variables and submits an authentication request to the internal Guacamole REST API (${GUACAMOLE_INTERNAL_URL}/guacamole/api/tokens).
  - Guacamole returns an auth token, user details, and a map of available connections.
  - The worker extracts the first active connectionId and returns the token and connection ID to the browser.
- Stateful Tunnel Proxying (/tunnel/*):
  - All client tunnel requests (both HTTP long-polling and WebSocket streams) route through handleTunnelProxy in [bigworm/src/worker.js](file:///e:/TechTrekGT/bigworm/src/worker.js).
  - Every connection initiation must pass JWT validation before the worker connects to the internal Cloudflare Tunnel endpoint.
  - Cloudflare Workers maintain the persistent WebSocket connection, streaming compressed binary protocol frames between the browser and the internal Guacamole daemon.

## 5. Persistent Relational Storage and Ephemeral KV

BigWorm leverages the shared platform data tier defined in [bigworm/wrangler.jsonc](file:///e:/TechTrekGT/bigworm/wrangler.jsonc):

- Cloudflare D1 Database (personal-budget-db): Houses the shared users table, password hashes, and admin privilege flags utilized during authentication.
- Cloudflare Workers KV (RATE_LIMIT_KV): Enforces brute-force defense on /api/auth/login, tracking failure counts by connecting IP and user email.
- Zero Stored Session State on Disk: Guacamole connection tokens and WebSocket streams are ephemeral and reside strictly in memory during active sessions, leaving no residual connection data in database storage.
