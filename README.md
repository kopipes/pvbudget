# PVBudget — Budget Form Builder

A multi-role budget management system with approval workflows, built with React + Express + SQLite.

## Features

- **Multi-role system**: Admin, Corporate, Manager, User — each with specific permissions
- **Budget forms**: Create/edit budget items with QTY, MDY, internal rate, and budget columns
- **Approval workflow**: 2-stage approval by Admin/Corporate before finalization
- **Revision handling**: Forms can be sent back for revision with notes
- **Realisasi tracking**: Actual budget tracking alongside planned budgets
- **Excel export**: Export forms with full formulas preserved
- **Division management**: Organize forms by divisions (Finance, Marketing, Operations, etc.)
- **User management**: Admins can create/update/delete users and assign roles
- **Role-based dashboards**: Stats and pending items adapted per user role

## Default Users

| Username | Password | Role |
|---|---|---|
| admin | admin123 | Admin |
| corporate | corp123 | Corporate |
| manager | manager123 | Manager |
| user | user123 | User |

## Quick Start

```bash
# Start the backend (port 3001)
node server/index.cjs

# Start the frontend (port 5173)
npm run dev
```

Or run both via two terminals:
```bash
# Terminal 1 — Backend
node server/index.cjs

# Terminal 2 — Frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Architecture

### Frontend (`src/`)
- `App.jsx` — Main budget form editor (Budget / Realisasi tabs)
- `Dashboard.jsx` — Role-based dashboard with stats and form lists
- `LoginPage.jsx` — Authentication page
- `UserManagement.jsx` — Admin user CRUD modal
- `DivisionManagement.jsx` — Admin division CRUD modal

### Backend (`server/`)
- `index.cjs` — Express API (forms routes)
- `auth.cjs` — Auth + user/division management routes
- `db.cjs` — SQLite database setup and seed data

### Database — SQLite (`form-builder.sqlite`)
Tables: `users`, `divisions`, `forms`, `sessions`, `manager_divisions`, `approval_history`

## Role Permissions

| Feature | Admin | Corporate | Manager | User |
|---|---|---|---|---|
| Create forms | ✅ | ❌ | ✅ | ✅ |
| Edit own forms | ✅ | ❌ | ✅ | ✅ |
| Submit for approval | ✅ | ❌ | ✅ | ✅ |
| Approve forms | ✅ | ✅ | ❌ | ❌ |
| Unlock approved forms | ✅ | ❌ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ | ❌ |
| Manage divisions | ✅ | ❌ | ❌ | ❌ |
| View all forms | ✅ | ✅ | ✅* | Own only |
| Delete forms | ✅ | ❌ | ❌ | ❌ |

*Managers can see forms from subordinates and their managed divisions

## API Endpoints

### Auth
- `POST /api/auth/login` — Login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Current user info

### Forms
- `GET /api/forms` — List all visible forms
- `GET /api/forms/:id` — Get form detail
- `GET /api/forms/my` — Current user's forms
- `GET /api/forms/pending` — Pending approval forms (Admin/Corporate)
- `GET /api/forms/revisions` — Forms in revision
- `POST /api/forms` — Create new form
- `PUT /api/forms/:id` — Update form
- `DELETE /api/forms/:id` — Delete form (Admin only)
- `POST /api/forms/:id/submit` — Submit for approval
- `POST /api/forms/:id/approve` — Approve form
- `POST /api/forms/:id/reject` — Reject / request revision
- `PUT /api/forms/:id/unlock` — Unlock approved form
- `GET /api/forms/:id/history` — Version history
- `GET /api/forms/:id/approval-history` — Approval log

### Users & Divisions (Admin)
- `GET /api/users` — List all users
- `POST /api/users` — Create user
- `PUT /api/users/:id` — Update user
- `DELETE /api/users/:id` — Delete user
- `GET /api/divisions` — List divisions
- `POST /api/divisions` — Create division
- `PUT /api/divisions/:id` — Update division
- `DELETE /api/divisions/:id` — Delete division

## Form Status Flow

```
Draft → Pending → Approved → (Archive on new version)
             ↘ Revision → Pending...
```

## Environment Variables

Create `.env.development`:
```env
VITE_API_URL=http://localhost:3001
PORT=3001
```
