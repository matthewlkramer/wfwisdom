import { useQuery } from "@tanstack/react-query";
import type { SessionUser } from "@wfw/shared";
import { api } from "./api";
/** The signed-in user, shared with the app shell's query so it is fetched once. */
export function useMe(): SessionUser | null {
  const q = useQuery({ queryKey: ["me"], queryFn: () => api.get<{ user: SessionUser | null }>("/api/me"), staleTime: 60_000 });
  return q.data?.user ?? null;
}
