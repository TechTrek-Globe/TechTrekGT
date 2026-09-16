# Admin Dashboard Implementation Plan

## Goal
Implement a new exclusive "Admin" tab for the Outpost Tracker application, restricted solely to the user account: `jgk1865@gmail.com`. This dashboard will display system-wide user statistics and inventory counts, enforcing strict data isolation and routing constraints.

## User Review Required / Open Questions
> [!IMPORTANT]
> **Account Status Column:** The current `users` table in `personal-budget-db` does not have a `status` or `locked` column. Do you want me to write a D1 migration to add this (`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'Active'`), or should I just assume 'Active' for everyone in this initial iteration?
> 
> **Admin Email Hardcode:** The instruction says restricted solely to `jgk1865@gmail.com`. I will hardcode this exact email check in both the frontend (to hide the tab) and the backend (to reject API requests with 403). Is this acceptable?

## Proposed Changes

### 1. `functions/api/admin/stats.js` [NEW]
*   Create a new secure Cloudflare Pages Function.
*   **Security:** Wrap with authentication middleware. Extract `payload.email` from the JWT. If it does not equal `jgk1865@gmail.com`, return an immediate `403 Forbidden`.
*   **Database Query:** Execute a query against `env.DB` joining `users` and `auction_items`:
    ```sql
    SELECT 
      u.id, u.email, u.name, u.created_at, 
      COUNT(i.id) as item_count 
    FROM users u 
    LEFT JOIN auction_items i ON u.id = i.user_id 
    GROUP BY u.id
    ORDER BY u.created_at ASC
    ```
*   Return aggregated totals and the array of user details.

### 2. `src/worker.js` [MODIFY]
*   Import the new admin stats handler.
*   Add a new route block:
    ```javascript
    } else if (apiPath === '/api/admin/stats' && request.method === 'GET') {
      response = await adminStatsGetHandler(context);
    }
    ```

### 3. `src/components/AppLayout.jsx` [MODIFY]
*   Import `Shield` from `lucide-react` for the Admin tab icon.
*   Dynamically compute the active `NAV_ITEMS` based on `user?.email`.
*   If `user?.email === 'jgk1865@gmail.com'`, append the Admin tab to the sidebar and mobile bottom nav.

### 4. `src/App.jsx` [MODIFY]
*   Add `'admin'` to the `VIEWS` array.
*   Create a lazy import for `AdminView`: `const AdminView = lazyWithRetry(() => import('./components/AdminView').then(m => ({ default: m.AdminView })));`
*   In the `MainContent` `useEffect` hook, enforce strict client-side routing. If a non-admin attempts to hit `/outpost/admin`, forcefully redirect them to `/outpost/dashboard`.
*   Add the rendered `<AdminView />` inside the main Suspense block.

### 5. `src/components/AdminView.jsx` [NEW]
*   Create the pure JS/JSX React component using Tailwind CSS.
*   On mount, `fetch('/api/admin/stats')` using standard credentials included fetch.
*   Display loading skeletons while waiting.
*   Render a dashboard layout (CSS Grid) with:
    *   **KPI Cards:** Total Registered Users, Total Items Across All Accounts.
    *   **User Data Table/Grid:** Listing Email, Name, Account Status (Active/Locked), and Item Count for each user.

## Verification Plan
1.  **Frontend Gating:** Log in as a standard user. Confirm the Admin tab is hidden. Attempt to manually navigate to `/outpost/admin`. Confirm the app auto-redirects to `/outpost/dashboard`.
2.  **Backend Gating:** Attempt to `GET /api/admin/stats` with a non-admin JWT. Confirm the worker returns `403 Forbidden`.
3.  **Admin Flow:** Log in as `jgk1865@gmail.com`. Confirm the Admin tab is visible. Click it, confirm the backend returns 200 OK with correct aggregated cross-tenant stats.
4.  **Deployment:** Run `npm run build` locally to verify 0 errors, then `npm run deploy` to publish to Cloudflare.
