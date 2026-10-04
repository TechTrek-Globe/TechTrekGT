# BigWorm Gateway - Platform Features and Remote Desktop Services

## 1. Remote Desktop Protocol Support and Capabilities

BigWorm delivers full-featured remote desktop access through Apache Guacamole and its native protocol proxy daemon (guacd):

- Remote Desktop Protocol (RDP): Direct connection to Windows physical machines and virtual workstations. Supports true color rendering, clipboard synchronization, font smoothing, and dynamic desktop resizing.
- Virtual Network Computing (VNC): Connection to Linux graphic desktops and legacy hardware consoles across internal networks.
- Secure Shell (SSH): Full terminal terminal emulation inside the browser, supporting ANSI color schemes, command history, and interactive CLI tooling.

## 2. Interactive Browser Canvas Streaming

The client interface in [bigworm/src/components/GuacamoleView.jsx](file:///e:/TechTrekGT/bigworm/src/components/GuacamoleView.jsx) transforms the browser into an ultra-low-latency remote display:

- Hardware-Accelerated Canvas Rendering: guacamole-common-js paints remote display updates directly onto an HTML5 canvas element, applying efficient dirty-rectangle blitting to minimize memory consumption and battery drain.
- Resolution Auto-Fitting: Automatically captures browser viewport dimensions and requests matching screen resolutions from the remote host, ensuring crisp text and eliminating letterboxing.
- Audio Playback: Streams remote system audio back to the client browser via Web Audio API pipelines.
- Smooth Display Scaling: Provides dynamic scaling controls to fit large desktop resolutions onto smaller laptop or tablet displays without distortion.

## 3. Input Normalization and Peripheral Handling

BigWorm captures and translates local user input into native OS events:

- Mouse Event Forwarding: Normalizes local mouse movement, absolute coordinates, button clicks (left, middle, right), drag-and-drop actions, and multi-directional mouse wheel scrolling.
- Keyboard Scancode Translation: Captures keyboard events across diverse operating systems and browsers, mapping key combinations (including Alt+Tab, Windows/Super keys, and function keys) directly into remote scancodes.
- Unfocused Event Interception: Uses explicit event listeners to prevent accidental browser shortcut execution (such as Ctrl+W or back navigation) while focused on the remote session.

## 4. Operational Toolbar and Ergonomics

The remote desktop viewport is designed for maximum usable workspace:

- Floating Auto-Hiding Controls: A top navigation bar provides quick access to connection controls. After 3 seconds of mouse inactivity during an active session, the bar smoothly hides itself to maximize screen real estate, reappearing immediately upon mouse movement near the top edge.
- Fullscreen Mode: Native browser fullscreen toggle via Maximize2 / Minimize icons for an immersive desktop experience indistinguishable from a local machine.
- Live Connection Telemetry: Real-time status indicators in the toolbar display current streaming state (fetching token, connecting, connected, disconnected, error).
- Reconnect and Disconnect Controls: Dedicated buttons allowing operators to gracefully terminate remote sessions or instantly reconnect following network blips.
- Resilient Iframe Fallback: If canvas streaming encounters environment-specific browser restrictions, BigWorm includes an alternative iframe bridge mode to load the Guacamole client UI directly.

## 5. Session Gate and Authentication Flow

Client access is protected by an integrated authentication perimeter:

- Seamless SSO Session Verification: On load, [bigworm/src/App.jsx](file:///e:/TechTrekGT/bigworm/src/App.jsx) verifies user status via [bigworm/src/context/AuthContext.jsx](file:///e:/TechTrekGT/bigworm/src/context/AuthContext.jsx).
- Inline Authentication Portal: Unauthenticated users are presented with [bigworm/src/components/AuthPage.jsx](file:///e:/TechTrekGT/bigworm/src/components/AuthPage.jsx) to log in using standard TechTrekGT credentials.
- Instant Session Revocation: Clicking logout immediately invalidates the edge JWT cookie, disconnects the Guacamole client, and clears active canvas elements from memory.
