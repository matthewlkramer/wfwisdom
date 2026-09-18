import type { SessionUser } from "@wfw/shared";
declare global { namespace Express { interface Request { user?: SessionUser | null; } } }
export {};
