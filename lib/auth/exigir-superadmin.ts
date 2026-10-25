import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { esPlataforma } from "@/lib/auth/plataforma";

/**
 * SL-17 (design §7.7, R48) — el punto de enganche con SL-32.
 *
 * Quién es superadmin lo define SL-32 en `lib/auth/plataforma.ts`; este archivo solo lo pregunta.
 * Sin sesión falla cerrado: preferible que nadie cree empresas a que lo haga quien no debía. La
 * guardia de `tests/unit/actions/organizaciones-action.test.ts` vigila que el enganche no vuelva a
 * quedarse sin importar `plataforma.ts`.
 */
export function exigirSuperadmin(actor: Actor | null): boolean {
  if (actor === null) return false;
  return esPlataforma(actor.rol);
}
