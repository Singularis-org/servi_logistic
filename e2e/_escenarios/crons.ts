import { abrirBaseE2E } from "../../tests/fabricas/e2e";

/**
 * SL-44 T3.2 (design D4; R8, R23) — LOS CRONS DEL E2E, POR SU RUTA REAL. `GET /api/cron/<nombre>`
 * con `Authorization: Bearer $CRON_SECRET` contra el servidor que levanta Playwright: el mismo
 * secreto que `playwright.config.ts` pone en `webServer.env` y en el entorno de los workers (R23).
 *
 * ── API ──────────────────────────────────────────────────────────────────────────────────────────
 *
 *   llamarCron(nombre, { secreto? }) → { status, cuerpo }
 *     Llama al cron y devuelve el código y el JSON. `secreto` sirve para probar el 401.
 *
 *   correrCron(nombre) → cuerpo
 *     Igual, pero exige 200.
 *
 *   drenarGeocodificacion(ordenIds)
 *     Corre `procesar-jobs` hasta que el job de geocodificación de cada orden haya fallado POR
 *     CONFIGURACIÓN (el E2E no tiene `GOOGLE_MAPS_API_KEY`): con ese fallo el gate de asignabilidad
 *     deja asignar la orden sin ubicación (`asignable_sin_ubicacion`, feature 400), que es lo que
 *     pasa en un despliegue sin credencial. Sin drenar, la orden queda «geocodificación en curso» y
 *     ninguna de las dos asignaciones la acepta.
 *
 * Los crons recorren TODAS las empresas de la base: por eso `workers: 1` (D3).
 *
 * Excepción de R8 que vive aquí (D4): ninguna en lo que usa el grupo `reparto`. La fecha de una
 * reprogramación «ya llegada» la produce `CorreccionFechaReprogramacionService` (ver
 * `./reparto.ts > corregirFechaReprogramacion`), así que esa mitad de la excepción se QUITA. La de
 * la fecha de una GESTIÓN en el pasado (para `corte-diario`) la decide el grupo `dinero`.
 */

export type NombreCron = "corte-diario" | "liberar-reprogramadas" | "procesar-devueltas-sla" | "procesar-jobs";

function urlBase(): string {
  return `http://localhost:${Number(process.env.E2E_PUERTO || 3000)}`;
}

export async function llamarCron(
  nombre: NombreCron,
  opts: { secreto?: string } = {},
): Promise<{ status: number; cuerpo: unknown }> {
  const secreto = opts.secreto ?? process.env.CRON_SECRET;
  if (!secreto) throw new Error("SL-44 E2E: falta CRON_SECRET (lo fija playwright.config.ts).");
  const res = await fetch(`${urlBase()}/api/cron/${nombre}`, {
    headers: { Authorization: `Bearer ${secreto}` },
  });
  const texto = await res.text();
  let cuerpo: unknown = texto;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    // no es JSON: se devuelve el texto
  }
  return { status: res.status, cuerpo };
}

export async function correrCron(nombre: NombreCron): Promise<unknown> {
  const r = await llamarCron(nombre);
  if (r.status !== 200) throw new Error(`SL-44 E2E: el cron ${nombre} respondió ${r.status}: ${JSON.stringify(r.cuerpo)}`);
  return r.cuerpo;
}

/** El prefijo con el que `GeocodificacionService` marca un fallo de configuración (feature 400). */
const FALLO_CONFIG = "[geocode:config]";

export async function drenarGeocodificacion(ordenIds: string[], intentos = 15): Promise<void> {
  const db = abrirBaseE2E();
  try {
    for (let i = 0; i < intentos; i++) {
      const jobs = await db.job.findMany({
        where: { tipo: "geocodificacion", OR: ordenIds.map((id) => ({ dedupeKey: { contains: id } })) },
        select: { dedupeKey: true, lastError: true, estado: true },
      });
      const listas = ordenIds.filter((id) =>
        jobs.some((j) => (j.dedupeKey ?? "").includes(id) && (j.lastError ?? "").startsWith(FALLO_CONFIG)),
      );
      if (listas.length === ordenIds.length) return;
      await correrCron("procesar-jobs");
    }
    throw new Error(
      `SL-44 E2E: tras ${intentos} pasadas de procesar-jobs, la geocodificación de ${ordenIds.join(", ")} no falló por configuración (¿hay GOOGLE_MAPS_API_KEY en el entorno del servidor?).`,
    );
  } finally {
    await db.$disconnect();
  }
}
