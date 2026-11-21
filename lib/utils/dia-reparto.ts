import type { DiaReparto } from "@/lib/types/dia-reparto";
import { inicioDelDiaComoFecha, manana } from "@/lib/utils/calendario-zona";

// Feature 246 (T1.3, design §4.2) — EL UNICO sitio que traduce el token «hoy/mañana» a una fecha.
//
// UN SOLO SITIO QUE SABE TRADUCIR ⇒ UN SOLO SITIO DONDE ESE CRITERIO PUEDE EQUIVOCARSE. Los dos
// servicios de asignacion (central y satelite) llaman aqui UNA vez y pasan la fecha ya resuelta al
// repositorio. Recalcularla abajo abriria la puerta a que dos capas de la misma peticion cayeran a
// distinto lado de la medianoche.

/**
 * R5/R6 — fecha calendario de `zona` (la del pais de la empresa, SLT-42) para la que queda el lote,
 * en la convencion `@db.Date` del repo (feature 46): **medianoche UTC de la fecha calendario local**,
 * que es exactamente como Postgres almacena y Prisma lee un `DATE`. «Mañana» es la fecha calendario
 * siguiente, no `hoy + 24 h`: en una zona con horario de verano el dia de cambio dura 23 o 25 h.
 *
 * ⚠️ AQUI VIVE LA TRAMPA DEL REPO, y por eso se nombra: `inicioDelDiaEnUtc(fecha, zona)` —el
 * instante real de las 00:00 locales— NO sirve para esto. Aquella es la cota para columnas `timestamp`
 * (`asignado_at`, `gestion_orden.created_at`, convencion 144/166). `fecha_reparto` es `DATE`:
 * usar el helper equivocado desplaza el dia el desfase de la zona y devuelve el defecto por otra
 * puerta —el mismo error que cerro la ficha 166—. `inicioDelDiaComoFecha` es el helper correcto para
 * esta columna, y es el que ya usa `fecha_reprogramacion` (46/R9).
 *
 * `now` es un PARAMETRO con default: el reloj se inyecta en los tests y jamas se lee dentro del
 * calculo.
 */
export function resolverFechaReparto(dia: DiaReparto, zona: string, now: Date = new Date()): Date {
  if (dia === "hoy") return inicioDelDiaComoFecha(now, zona);
  return new Date(`${manana(now, zona)}T00:00:00.000Z`);
}

/**
 * R7/R17 — la MISMA fecha, como texto `YYYY-MM-DD`, para las escrituras en SQL CRUDO.
 *
 * ⚠️ POR QUE ESTO EXISTE Y NO SE PASA EL `Date` DIRECTAMENTE. `asignarSateliteLote` escribe con un
 * `UPDATE` crudo (`Prisma.sql`), y ahi Prisma no sabe que la columna destino es `DATE`: el driver
 * `pg` serializa un `Date` de JS como `timestamptz` con el offset LOCAL del proceso Node, y
 * Postgres lo convierte a `date` usando el `TimeZone` DE LA SESION. Con la sesion en UTC sale el
 * dia correcto; con la sesion en una zona al oeste de UTC (la de Costa Rica) sale el ANTERIOR. Es decir: el dia de reparto
 * dependeria de la configuracion del servidor de base de datos — exactamente el tipo de off-by-one
 * que esta ficha existe para evitar, y el que cerro la 166 por la otra puerta.
 *
 * Con un texto `YYYY-MM-DD` y un `::date` explicito en el `SET` no interviene ninguna zona horaria:
 * `'2026-08-21'::date` es el 21 en cualquier sesion. Por eso el `SET` NO lleva `NOW()::date` ni
 * `AT TIME ZONE`: el dia lo decide el servidor de aplicacion, en TypeScript, y entra como
 * parametro.
 *
 * Los getters son `getUTC*` a proposito: `fecha` YA es la medianoche UTC de la fecha calendario local
 * (eso es lo que devuelve `resolverFechaReparto`), asi que sus campos UTC SON la fecha buscada.
 * Leerlos en hora local desplazaria el dia en cualquier maquina que no este en UTC.
 */
export function fechaRepartoComoTexto(fecha: Date): string {
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getUTCDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}
