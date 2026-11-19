import { ejecutar, sqlDe, type Conexion } from "./ida-y-vuelta-32";

// SLT-48 (design §9) — para las idas y vueltas de migraciones ANTERIORES a SLT-48 sobre una base que ya
// la tiene aplicada.
//
// Esos tests aplican el `down.sql` de su migración y luego su `migration.sql`. Con SLT-48 puesta, ese
// `down.sql` encuentra vistas donde esperaba `provincia`, `canton` y `distrito`, y sin la sincronía que
// sus triggers suponían. Este helper quita SLT-48 (su `down.sql`) antes y la vuelve a poner (su
// `migration.sql`) después, sobre la misma conexión. Así la ida y vuelta vieja corre sobre la base que
// conocía y, de paso, el `down.sql` de SLT-48 se ejercita una vez más (R11).
//
// Los dos archivos traen su propio `BEGIN`/`COMMIT`: el helper no los anida en otra transacción.
// Pensado para las bases PROPIAS de esos tests (`slt43_…`, `slt46_…`), nunca para la compartida: el
// `down.sql` recrea tablas y triggers de `orden` que otros archivos en paralelo están usando.

export const M_SLT48_VISTAS = "20261117120100_slt48_geografia_vieja_a_vistas";

/** Aplica el `down.sql` de SLT-48: vuelven las tablas viejas y su sincronía. */
export async function bajarSlt48(db: Conexion): Promise<void> {
  await ejecutar(db, sqlDe(M_SLT48_VISTAS, "down.sql"), `${M_SLT48_VISTAS}/down.sql (sin-slt48)`);
}

/** Vuelve a aplicar el `migration.sql` de SLT-48: las tablas viejas pasan otra vez a vistas. */
export async function subirSlt48(db: Conexion): Promise<void> {
  await ejecutar(db, sqlDe(M_SLT48_VISTAS, "migration.sql"), `${M_SLT48_VISTAS}/migration.sql (sin-slt48)`);
}

/**
 * Corre `fn` con SLT-48 quitada y la repone al terminar bien. Si `fn` falla, no la repone: la base es
 * desechable y reponerla podría tapar el error de `fn` con otro.
 */
export async function sinSlt48<T>(db: Conexion, fn: () => Promise<T>): Promise<T> {
  await bajarSlt48(db);
  const resultado = await fn();
  await subirSlt48(db);
  return resultado;
}
