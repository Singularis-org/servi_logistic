import type { Actor } from "@/lib/interfaces/services/IOrdenService";

/**
 * SL-17 (design §7.7, R48) — el punto de enganche con SL-32.
 *
 * Quién es superadmin lo define SL-32 en `lib/auth/plataforma.ts` (`esPlataforma`), que aún no
 * existe en esta rama. Hasta entonces el alta de empresa falla cerrado para TODOS: es preferible
 * que nadie pueda crear empresas a que lo pueda hacer un rol que no debía. La guardia de
 * `tests/unit/actions/organizaciones-action.test.ts` se pone en rojo en cuanto `plataforma.ts`
 * exista y este archivo no lo importe.
 */
export function exigirSuperadmin(actor: Actor | null): boolean {
  void actor;
  // SL-32: sustituir por esPlataforma de lib/auth/plataforma.ts
  return false;
}
