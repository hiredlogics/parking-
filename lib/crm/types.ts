/**
 * Shared account types.
 *
 * These are genuinely persisted rows (the `clients` and `admins`
 * tables) written by real auth — `lib/auth/service.ts::registerCustomer`
 * for `Client`, `lib/db/repos.ts::createAdmin` for `Admin`. The rest of
 * the old CRM demo model (cases/appeals/documents/tasks/notes/etc. that
 * used to live alongside these) has been removed — the real appeal-case
 * data lives in `appeal_cases` (see `lib/cases/types.ts`).
 */

export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  joinedAt: string;
  lastActivityAt: string;
  status?: "ACTIVE" | "INACTIVE";
}

export interface Admin {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "STAFF" | "SUPPORT";
  avatarInitials: string;
}
