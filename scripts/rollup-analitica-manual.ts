import { pathToFileURL } from "node:url";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { paraCadaEmpresa, type ResumenPorEmpresa } from "@/lib/db/para-cada-empresa";
import type { IAnaliticaRollupService } from "@/lib/interfaces/services/IAnaliticaRollupService";
import { buildAnaliticaRollupService } from "@/lib/services/jobs/analitica-rollup-diario-handler";
import { construirReglasPaisEmpresa } from "@/lib/services/ReglasPaisEmpresaService";
import { fechaObjetivo, validarFechaInvocacionManual } from "@/lib/analytics/rollup-dia";
import { esFechaCalendarioValida } from "@/lib/utils/calendario-zona";

// Feature 124 (R39, design §8) — INVOCACION MANUAL del rollup de UNA fecha.
//
// Uso:  node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/rollup-analitica-manual.ts [YYYY-MM-DD]
// Sin argumento agrega, en cada empresa, la fecha objetivo por defecto: el dia que acaba de cerrar
// (D-1) en la zona horaria de su pais.
//
// SLT-42 (design §6.1; R24, R28): recorre las empresas como el job diario (`paraCadaEmpresa`),
// cada una en su contexto y con la zona de su pais. Una empresa sin zona falla sola y las demas
// corren; el script sale con codigo != 0 si alguna fallo o rechazo la fecha.
//
// DOS guardas, y las dos son deliberadas:
//
// 1. **Tope de antiguedad (R39).** Solo se admiten HOY y AYER en el calendario de la zona de cada
//    empresa. Cualquier fecha mas vieja se rechaza remitiendo al backfill de la feature 125. Esto
//    es la contrapartida operativa de R35 estricto (D3/D8): sin esta guarda, la 124 se convierte
//    en la 125 por la puerta de atras —un recomputo de fechas pasadas, invisible y no auditado—,
//    que es exactamente lo que R35 prohibe. El rechazo NO escribe nada en esa empresa. Una fecha
//    mal formada se rechaza ANTES de construir el cliente Prisma; el tope, que depende de la zona,
//    se comprueba dentro de cada empresa, antes de escribir.
// 2. **Guarda de host (patron de la 123).** Aborta si `DATABASE_URL` no apunta a
//    `localhost:5432/servi_logistic`. Este script escribe; correrlo por descuido contra produccion
//    no es un incidente recuperable.
//
// Este script NO nombra la tabla del rollup ni la consulta de ninguna forma: delega en el
// servicio, cuya unica puerta a esa tabla es `AnaliticaRollupRepository` (R42).

const HOST_LOCAL = new Set(["localhost", "127.0.0.1", "::1"]);
const PUERTO_LOCAL = "5432";
const BASE_LOCAL = "servi_logistic";

/** `true` solo si la URL apunta a `localhost:5432/servi_logistic`. Cualquier duda -> `false`. */
export function esDestinoLocal(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const puerto = u.port === "" ? PUERTO_LOCAL : u.port;
    const base = u.pathname.replace(/^\//, "");
    return HOST_LOCAL.has(host) && puerto === PUERTO_LOCAL && base === BASE_LOCAL;
  } catch {
    return false;
  }
}

/** Lo que el rollup manual necesita, inyectable para probarlo sin base. */
export interface RollupManualDeps {
  /** La fecha del argumento, o `undefined` para el D-1 de cada empresa. */
  fechaPedida: string | undefined;
  now: Date;
  /** Corre `fn` una vez por empresa, en su contexto (`paraCadaEmpresa`). */
  porEmpresa: (fn: (organizacionId: string) => Promise<void>) => Promise<ResumenPorEmpresa>;
  /** La zona del pais de la empresa EN CURSO; sin zona, `PaisSinZonaHoraria` (R28). */
  zonaHoraria: () => Promise<string>;
  service: Pick<IAnaliticaRollupService, "agregarFecha">;
  log: (mensaje: string) => void;
}

export interface ResultadoRollupManual {
  rechazadas: { organizacionId: string; motivo: string }[];
  fallidas: string[];
}

/**
 * SLT-42 (R24, R28): el rollup manual de cada empresa con la zona de su pais. La fecha (la pedida
 * o el D-1 local) se valida en esa zona ANTES de escribir; un rechazo no escribe nada en esa
 * empresa. Conteos agregados y nada mas (R37): sin PII.
 */
export async function correrRollupManual(deps: RollupManualDeps): Promise<ResultadoRollupManual> {
  const rechazadas: ResultadoRollupManual["rechazadas"] = [];
  const resumen = await deps.porEmpresa(async (organizacionId) => {
    const zona = await deps.zonaHoraria();
    const fecha = deps.fechaPedida ?? fechaObjetivo(deps.now, zona);
    const admitida = validarFechaInvocacionManual(fecha, deps.now, zona);
    if (!admitida.ok) {
      rechazadas.push({ organizacionId, motivo: admitida.motivo });
      return;
    }
    const r = await deps.service.agregarFecha(admitida.fecha);
    deps.log(
      `Rollup ${organizacionId} ${r.fecha}: filasEscritas=${r.filasEscritas} ` +
        `filasRetiradas=${r.filasRetiradas} ms=${r.ms}`,
    );
  });
  return { rechazadas, fallidas: resumen.fallidas.map((f) => f.organizacionId) };
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // sin .env: se usan las variables ya presentes en process.env
  }

  const now = new Date();
  const fechaPedida = process.argv[2];

  // Guarda 1a (R39) ANTES de cualquier conexion: una fecha mal formada no debe ni abrir la base.
  if (fechaPedida !== undefined && !esFechaCalendarioValida(fechaPedida)) {
    console.error(`RECHAZADO: fecha invalida: se espera YYYY-MM-DD y llego "${fechaPedida}"`);
    process.exit(1);
    return;
  }

  // Guarda 2 (host): este script ESCRIBE. Produccion no se toca ni por error.
  const url = process.env.DATABASE_URL;
  if (url === undefined || !esDestinoLocal(url)) {
    console.error(
      "ABORTA: DATABASE_URL no apunta a localhost:5432/servi_logistic. Este script ESCRIBE el rollup " +
        "de una fecha; no se corre contra ninguna otra base.",
    );
    process.exit(1);
    return;
  }

  const prisma = getPrismaClient();
  try {
    const reglasPais = construirReglasPaisEmpresa(prisma);
    // R37: conteos agregados y nada mas. Sin PII (el id de la empresa no lo es). Sin `BigInt` (R32).
    const { rechazadas, fallidas } = await correrRollupManual({
      fechaPedida,
      now,
      porEmpresa: (fn) => paraCadaEmpresa(fn),
      zonaHoraria: () => reglasPais.zonaHoraria(),
      service: buildAnaliticaRollupService(() => new Date()),
      log: (m) => console.log(m),
    });
    // Guarda 1b (R39): el tope, por empresa. Esas empresas no escribieron nada.
    for (const r of rechazadas) console.error(`RECHAZADO en ${r.organizacionId}: ${r.motivo}`);
    if (rechazadas.length > 0) {
      console.error(
        "El job diario solo agrega hoy o el dia que acaba de cerrar. Para recomputar un rango " +
          "historico, usa el backfill de la feature 125 (deliberado, sobre un rango explicito).",
      );
    }
    if (fallidas.length > 0) console.error(`Fallo en ${fallidas.length} empresa(s): ${fallidas.join(", ")}`);
    if (rechazadas.length > 0 || fallidas.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    // R38: el error se propaga con su contexto (fecha + etapa vienen dentro del
    // `AnaliticaRollupError`); aqui solo se imprime y se sale con codigo != 0.
    console.error("Fallo el rollup manual:", error);
    process.exit(1);
  });
}
