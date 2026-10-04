# BigWorm Gateway - Product Identity and Remote Access Persona

## 1. Product Overview and Core Mission

BigWorm Gateway is the secure, browser-accessible remote desktop and administrative access portal within the TechTrekGT platform, hosted on the dedicated subdomain bigworm.techtrekgt.com. It allows authorized operators to access local physical workstations, virtual machines, and home lab systems securely from any web browser without requiring external VPN clients.

The core mission of BigWorm Gateway is to provide zero-trust, seamless remote desktop connectivity. It encapsulates Apache Guacamole behind the TechTrekGT Single Sign-On (SSO) perimeter, bridging edge web requests through a secure Cloudflare Tunnel to an internal Dockerized Guacamole daemon while maintaining complete network isolation from the public internet.

## 2. Target Personas and Access Archetypes

BigWorm is engineered for administrative, developer, and power-user workflows:

- Remote Systems Administrator: An operator requiring emergency or scheduled access to Windows RDP desktops, Linux GUI workstations, or headless terminal consoles while away from their primary local network.
- Secure Developer: A software engineer requiring low-latency access to dedicated local build environments, development databases, and private network assets from mobile or untrusted client devices.
- Homelab Enthusiast: A home server operator centralizing management of container hosts, media servers, and virtualization clusters behind a single authenticated web interface.

## 3. Visual Aesthetics and Design Philosophy

BigWorm utilizes an industrial, high-focus cyberpunk terminal aesthetic optimized for uninterrupted full-screen remote interaction:

- Deep Dark Canvas: Standardized on Slate-950 (#020617) to eliminate visual distraction, prevent eye strain during extended remote sessions, and match dark-mode operating systems.
- Telemetry Accents: Styled with high-contrast cyan highlights (text-cyan-400, border-cyan-500/30) and status badges indicating live connection states, encryption status, and streaming telemetry.
- Non-Intrusive Floating Controls: The remote desktop view incorporates an auto-hiding top drawer navigation bar that fades out after 3 seconds of mouse inactivity, giving full screen real estate to the remote display canvas.
- Typography: Implements monospace fonts for connection details, session IDs, and status messages, paired with Inter for clean modal and menu typography.

## 4. Security Isolation and Subdomain Architecture

BigWorm operates under strict origin and network isolation policies:

- Subdomain Origin Isolation: Mounted exclusively at bigworm.techtrekgt.com rather than a subpath. This isolates remote desktop canvas rendering, clipboard buffers, and WebSocket connections from root domain cookies and third-party scripts.
- Zero Inbound Ports: No router ports, firewall holes, or port forwardings are opened on the local hosting network. All edge traffic traverses an encrypted outbound Cloudflare Tunnel.
- Shared SSO Authentication: Access to the remote gateway requires active authorization against the TechTrekGT shared D1 user database, ensuring uniform credential verification across the platform.
