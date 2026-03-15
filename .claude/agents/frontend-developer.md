# Frontend Developer Agent

## Role
You are a frontend developer on the Mini CRM project. You work in `frontend/` with React 18 + Vite.

## Stack
- **React 18** + **Vite 6**
- **React Router v6** — routing in `src/main.jsx`
- **TanStack Query v5** — all server state (`useQuery`, `useMutation`)
- **Zustand** — client state (`src/store/auth.js`, `src/store/year.js`)
- **Recharts** — charts on dashboard
- **Axios** — HTTP client via `src/api/client.js`

## Project Structure
```
src/
├── api/
│   ├── client.js        # Axios instance, JWT interceptor, 401 redirect
│   └── index.js         # All API functions (22 functions)
├── components/
│   ├── layout/Layout.jsx  # Sidebar + year selector + nav
│   ├── ui/Modal.jsx       # Reusable modal (Escape to close)
│   └── ui/Confirm.jsx     # Confirm dialog
├── pages/               # 9 pages (one per route)
├── store/
│   ├── auth.js          # token, setToken, logout
│   └── year.js          # year, setYear (global year context)
└── utils/index.js       # fmt, fmtDate, MONTHS, downloadBlob, statusColor
```

## CSS Conventions (index.css utility classes)
- Layout: `.card`, `.stat-card`, `.grid-2/3/4`, `.toolbar`, `.toolbar-left/right`
- Buttons: `.btn .btn-primary/secondary/danger/ghost`, `.btn-sm`, `.btn-icon`
- Forms: `.input`, `.label`, `.form-group`, `.select`
- Table: `.th`, `.td`, `.overflow-table`
- Status: `.badge .badge-blue/green/amber/red/gray`
- Feedback: `.alert .alert-error/success/warning`, `.empty-state`, `.spinner`
- Text helpers: `.text-muted`, `.text-small`, `.text-right`, `.fw-500/600`

## Year Context
The global `year` from `useYearStore()` is used on every data-fetching page.
Always include `year` in `queryKey` arrays when the data is year-dependent:
```js
const { year } = useYearStore()
useQuery({ queryKey: ['employees', year, filters], queryFn: () => getEmployees({ year }) })
```

## Adding a New Page
1. Create `src/pages/MyPage.jsx`
2. Import and add `<Route>` in `src/main.jsx`
3. Add nav link in `src/components/layout/Layout.jsx` (NAV array)
4. Add API function to `src/api/index.js`

## API Pattern
```js
// Query
const { data = [], isLoading } = useQuery({
  queryKey: ['resource', id, year],
  queryFn: () => getResource(id, { year }),
})

// Mutation with invalidation
const mut = useMutation({
  mutationFn: (data) => createResource(data),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['resource'] }),
  onError: (e) => setErr(e.response?.data?.detail || 'Ошибка'),
})
```

## Excel Download Pattern
```js
import { downloadBlob } from '../utils'
async function handleExport() {
  const blob = await exportEmployees(year)
  downloadBlob(blob, `employees_${year}.xlsx`)
}
```

## Key UI Conventions
- All money values: `fmt(value) + ' ₽'` from `utils/index.js`
- All dates: `fmtDate(date)` — returns `—` for null
- Status colors: `statusColor('ok'|'warning'|'overrun')` + `statusLabel()`
- Empty states: use `.empty-state` class with an emoji + message
- Loading: `<span className="spinner" />` inline
- Terminated employees: `opacity: 0.55` on the row
