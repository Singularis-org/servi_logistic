import { Prisma, type PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { construirQueryDireccion, hashDireccion } from "@/lib/geo/direccion-query";
import type { IJobRepository } from "@/lib/interfaces/repositories/IJobRepository";
import type { IOrdenGeocodeRepository } from "@/lib/interfaces/repositories/IOrdenGeocodeRepository";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { OrdenGeocodeRepository } from "@/lib/repositories/OrdenGeocodeRepository";
import { dedupeKeyGeocodificacion } from "@/lib/services/jobs/geocodificacion-encolado";

import { puntoDeOrden, type DistritoDemo } from "./geografia";
import { enTandas } from "./paralelo";

// SL-43 (design §6; R20, R22, R23) — los datos de la demo, listos en un QA que no procesa la cola.
//
// Las órdenes nacen ya ubicadas: se escribe lo mismo que escribiría el job de geocodificación con un
// proveedor que contesta bien, con su mismo repositorio, y se cierra ese job como hecho. Los demás
// jobs que encolan los servicios se cierran sin ejecutar, para que ni el cron ni el drenador los
// manden nunca a un proveedor.
//
// Todo corre dentro de `conEmpresa(<demo>)`: desde `20261025150000_jobs_por_empresa`, `servi_app`
// solo ve y actualiza los jobs de la empresa fijada. Sin ella, la extensión rechaza el SQL
// (`EmpresaNoResuelta`); con otra empresa, `complete`/`fail` no tocarían ninguna fila y nadie lo
// notaría. Por eso la comprobación final cuenta lo que queda abierto.

/**
 * Los tipos que la receta encola hoy (design §6.2). Un job de la demo de otro tipo se cierra igual,
 * pero se devuelve para que la demo salga con 1 nombrándolo (R23): un tipo nuevo que empiecen a
 * encolar los servicios se ve en el primer despliegue, en vez de esperar a un drenado que lo mande a
 * un proveedor.
 */
export const TIPOS_DE_JOB_ESPERADOS: readonly string[] = ["geocodificacion", "optimizacion_ruta", "push_web"];

/** `last_error` de los jobs cerrados sin ejecutar: dice quién los cerró y por qué. */
export const MOTIVO_CIERRE_SIN_EJECUTAR = "[demo-qa] cerrado sin ejecutar: QA no procesa la cola";

/**
 * Escrituras a la vez al ubicar y al cerrar jobs: cada una es una sola sentencia (su conexión, ~4 idas
 * y vueltas con la envoltura de empresa), así que la tanda puede ser más ancha que la de `TANDA`.
 */
const TANDA_DE_ESCRITURAS_CORTAS = 5;

/** Lo que escribe `GeocodificacionService` cuando el proveedor contesta. La UI no pinta la precisión. */
const PRECISION_DEMO = "APPROXIMATE";
const STATUS_DEMO = "OK";

export type JobAbierto = { id: string; tipo: string };

export interface DepsJobsDemo {
  geocode: Pick<IOrdenGeocodeRepository, "guardarResultado">;
  jobs: Pick<IJobRepository, "findByDedupeKeys" | "complete" | "fail">;
  /** Los jobs `pending` o `processing` de la empresa. */
  jobsAbiertos(organizacionId: string): Promise<JobAbierto[]>;
}

type ClienteJobsDemo = Pick<PrismaClient, "orden" | "$queryRaw" | "$executeRaw">;

/**
 * Las dependencias reales sobre el cliente de la app (`getPrismaClient`, sobre `DATABASE_URL`), el
 * mismo con el que el job escribe en tiempo de ejecución.
 */
export function crearDepsJobsDemo(prisma: ClienteJobsDemo): DepsJobsDemo {
  return {
    geocode: new OrdenGeocodeRepository(prisma),
    jobs: new JobRepository(prisma),
    // El filtro por empresa va escrito aunque la RLS ya lo imponga: si esta consulta corriera como
    // dueño, sin RLS, seguiría contando solo los de la demo.
    jobsAbiertos: async (organizacionId) =>
      prisma.$queryRaw<JobAbierto[]>(Prisma.sql`
        SELECT "id", "tipo"::text AS "tipo"
          FROM "jobs"
         WHERE "organizacion_id" = ${organizacionId}
           AND "estado" IN ('pending', 'processing')
         ORDER BY "created_at", "id"`),
  };
}

export type OrdenAUbicar = Readonly<{
  id: string;
  direccion: string | null;
  distrito: DistritoDemo;
  /** Posición de la orden dentro de su distrito: decide su desplazamiento (`puntoDeOrden`). */
  indice: number;
}>;

export type ResultadoUbicar = { ubicadas: number; jobsGeocodificacionCerrados: number };

/** El job de geocodificación de la orden, por su clave exacta. `null` si la dirección no se geocodifica. */
function claveDeGeocodificacion(orden: OrdenAUbicar): string | null {
  // El mismo criterio que `encolarGeocodificacion`: sin dirección con contenido no hay job.
  const geocodificable = construirQueryDireccion({
    direccion: orden.direccion,
    distritoNombre: null,
    cantonNombre: "",
    provinciaNombre: "",
  });
  return geocodificable === null ? null : dedupeKeyGeocodificacion(orden.id, hashDireccion(orden.direccion ?? ""));
}

/**
 * R20: escribe las coordenadas de cada orden y cierra su job de geocodificación como hecho. Va
 * justo después de crear las órdenes y antes de cualquier asignación: el gate pide coordenadas.
 *
 * Si una orden con dirección no tiene su job, lanza: los servicios dejaron de encolarlo como se
 * espera, y es mejor verlo aquí que con un job colgado en QA.
 */
export async function ubicarOrdenes(
  deps: DepsJobsDemo,
  organizacionId: string,
  ordenes: readonly OrdenAUbicar[],
  ahora: Date,
): Promise<ResultadoUbicar> {
  // Cada orden y cada job son filas distintas: van por tandas a la vez, cada escritura por su
  // conexión del pool (`enTandas`).
  return conEmpresa(organizacionId, async () => {
    await enTandas(
      ordenes,
      (orden) => {
        const punto = puntoDeOrden(orden.distrito, orden.indice);
        return deps.geocode.guardarResultado(orden.id, {
          latitud: punto.latitud,
          longitud: punto.longitud,
          precision: PRECISION_DEMO,
          status: STATUS_DEMO,
          geocodedAt: ahora,
        });
      },
      TANDA_DE_ESCRITURAS_CORTAS,
    );

    const claves = ordenes.flatMap((o) => {
      const clave = claveDeGeocodificacion(o);
      return clave === null ? [] : [clave];
    });
    const jobs = await deps.jobs.findByDedupeKeys(claves);
    const encontradas = new Set(jobs.map((j) => j.dedupeKey));
    const sinJob = claves.filter((c) => !encontradas.has(c)).length;
    if (sinJob > 0) {
      throw new Error(`[demo-qa] ${sinJob} orden(es) con dirección sin su job de geocodificación`);
    }

    const abiertos = jobs.filter((job) => job.estado === "pending" || job.estado === "processing");
    await enTandas(abiertos, (job) => deps.jobs.complete(job.id), TANDA_DE_ESCRITURAS_CORTAS);
    return { ubicadas: ordenes.length, jobsGeocodificacionCerrados: abiertos.length };
  });
}

export type ResultadoCierre = {
  /** Jobs cerrados sin ejecutar, por tipo (R22). */
  cerradosPorTipo: Record<string, number>;
  /** Tipos cerrados que no están en `TIPOS_DE_JOB_ESPERADOS` (R23). Vacío si todo es lo esperado. */
  tiposNoEsperados: string[];
};

/**
 * R22, R23: cierra sin ejecutar todo job abierto de la empresa demo, del tipo que sea, y lo cuenta
 * por tipo. `runAfter = null` lo deja `failed` sin reintento: ni el cron ni `scripts/drenar-jobs.ts`
 * lo vuelven a tomar.
 */
export async function cerrarJobsSinEjecutar(deps: DepsJobsDemo, organizacionId: string): Promise<ResultadoCierre> {
  return conEmpresa(organizacionId, async () => {
    const abiertos = await deps.jobsAbiertos(organizacionId);
    const cerradosPorTipo: Record<string, number> = {};
    await enTandas(abiertos, (job) => deps.jobs.fail(job.id, MOTIVO_CIERRE_SIN_EJECUTAR, null), TANDA_DE_ESCRITURAS_CORTAS);
    for (const job of abiertos) cerradosPorTipo[job.tipo] = (cerradosPorTipo[job.tipo] ?? 0) + 1;
    const tiposNoEsperados = Object.keys(cerradosPorTipo)
      .filter((t) => !TIPOS_DE_JOB_ESPERADOS.includes(t))
      .sort();
    return { cerradosPorTipo, tiposNoEsperados };
  });
}

/**
 * D6.3 (R22): la parte de la comprobación final que toca la cola. Cuenta los jobs de la demo que
 * siguen `pending` o `processing`, por tipo; vacío = la cola de la demo está cerrada.
 */
export async function jobsAbiertosPorTipo(
  deps: DepsJobsDemo,
  organizacionId: string,
): Promise<Record<string, number>> {
  return conEmpresa(organizacionId, async () => {
    const abiertos = await deps.jobsAbiertos(organizacionId);
    const porTipo: Record<string, number> = {};
    for (const job of abiertos) porTipo[job.tipo] = (porTipo[job.tipo] ?? 0) + 1;
    return porTipo;
  });
}
