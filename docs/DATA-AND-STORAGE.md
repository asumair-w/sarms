# How SARMS data is built and stored

SARMS **does not use a real database** (no SQL, MongoDB, or backend API). All “database” behavior is built from **in-memory React state** plus **seed data** and a small amount of **browser storage**.

---

## 1. In-memory “database” (React state)

All main app data lives in **one React Context**: `AppStoreContext` (`src/context/AppStoreContext.jsx`).

- **State** is a single object updated by a **reducer** (`storeReducer`).
- **Initial state** is built by calling “getInitial” functions from the data modules (see below).
- **Updates** happen by dispatching actions (e.g. `ADD_TASK`, `ADD_RECORD`, `UPDATE_SESSION`).

### What is stored in state

| State key          | Description                    | Updated by                          |
|--------------------|--------------------------------|-------------------------------------|
| `tasks`            | Assignments (zone, type, status, workers) | Assign Task, Monitor                |
| `records`          | Production & quality records   | Record Production                   |
| `sessions`         | Active worker sessions         | Worker flow (start/end task)        |
| `inventory`        | Inventory items                | Inventory & Equipment               |
| `equipment`        | Equipment list                 | Inventory & Equipment               |
| `faults`           | Logged faults                  | Log Fault & Maintenance             |
| `maintenancePlans` | Planned maintenance            | Log Fault & Maintenance             |

**Important:** This state exists only in memory. **Refreshing the page resets everything** to the initial seed data. Nothing here is written to a server or real database.

---

## 2. Seed data (“initial database”)

The initial state is built from **JavaScript modules** under `src/data/`:

| Data module        | File(s)           | Exports / role |
|--------------------|-------------------|----------------|
| Tasks & records    | `assignTask.js`   | `getInitialTasks()`, `getInitialRecords()` – demo tasks and production/quality records |
| Workers            | `engineerWorkers.js` | `SEED_WORKERS` – list of workers (used by context and auth); no “getInitial”, workers are a constant list |
| Sessions           | `monitorActive.js`   | `getInitialSessions()` – active worker sessions (often empty at start) |
| Inventory & equipment | `inventory.js`   | `getInitialInventory()`, `getInitialEquipment()` – items and equipment |
| Faults & maintenance | `faults.js`      | `getInitialFaults()`, `getInitialMaintenancePlans()` – faults and plans |

Each “getInitial*” function returns an **array of plain objects** (e.g. task `{ id, zoneId, taskType, workerIds, status, ... }`). That array is the starting value for the corresponding key in `initialState` in `AppStoreContext`.

So the “database” is **built** by:

1. Calling these getInitial functions once when the app loads.
2. Putting their return values into `initialState`.
3. Using the reducer to update that state when the user adds/edits tasks, records, sessions, etc.

There is no schema file and no migrations; the “schema” is the shape of the objects in these data files and in the reducer (e.g. what fields are read/updated).

---

## 3. Browser storage (persistence)

Only a few things are persisted in the browser:

| Where            | Key(s) / usage | Purpose |
|------------------|----------------|--------|
| **sessionStorage** | `sarms-user-id`, `sarms-user-role` | Current login (cleared when tab closes). |
| **localStorage**   | `sarms_lang`   | Language (en/ar). |
| **localStorage**   | `sarms-sidebar-collapsed` | Sidebar collapsed (Engineer/Admin layout). |
| **localStorage**   | Power BI URL (admin settings) | Embed URL for dashboard. |
| **localStorage**   | `sarms-worker-session-{userId}` | Worker’s in-progress session so they can resume after “back to login”. |

Tasks, records, inventory, faults, etc. are **not** saved to localStorage or any server. They only persist until the page is refreshed.

---

## 4. Auth “database”

User credentials and roles are **not** in AppStoreContext. They live in **`src/auth.js`** in a **mock object** `MOCK_USERS` (e.g. `w1`/`e1`/`a1` and passwords). There is no real user table or API; `validateCredentials` and `validateUserIdFromQR` read from this object.

---

## 5. Summary

- **“Database”** = one in-memory state object in `AppStoreContext`, filled at load time by **getInitial*()** from `src/data/*.js`.
- **Structure** = whatever object shapes you define in those data files and in the reducer (no separate DB schema).
- **Persistence** = only language, sidebar, Power BI URL, and worker session in browser storage; **no persistence** for tasks, records, inventory, faults, or sessions across reloads.
- **Auth** = mock user list in `auth.js`, not a real database.

To add a **real** database later, you would:

1. Add a backend (e.g. Node + Express, or a serverless API).
2. Replace the getInitial* calls with API calls (or load from API after first fetch).
3. Replace each `dispatch(...)` that changes data with an API call, then update state from the response (or refetch).
4. Optionally keep localStorage/sessionStorage only for UI preferences and short-lived session data, and store all business data in the backend database.
