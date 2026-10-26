// SL-43 T10 (design §9.2; R1, R3, R5–R7, R9–R24, R26–R28, R32) — LA DEMO DE QA DE PUNTA A PUNTA,
// contra Postgres REAL y el doble HTTP de Storage del E2E (`e2e/_storage-falso/servidor.mjs`).
//
// Llama a `ejecutarDemo` de verdad, en modo a mano: la guardia, la conexión del dueño, el candado,
// la marca de QA, el borrado, las dos recetas y la comprobación final son los reales. Solo se
// inyectan `env` (la base del test, el doble y una contraseña generada aquí), `salida` (capturada)
// y `salir` (no mata el proceso). Cada caso que necesita otra cosa lo dice.
//
// Lo que se afirma se lee con el cliente dueño y con el cliente crudo de Storage, no con el código
// que se prueba. Cada «no cambió» va precedido de su control de no vacuidad.
//
// La base de este archivo NO puede tener otras empresas demo: el borrado de la demo las borraría.
// `tomarExclusionDemoQa` lo serializa con `demo-qa-borrado.test.ts`. El `afterAll` borra todo lo que
// el archivo creó (también la empresa real) y quita la marca: los tests de `down` de migraciones que
// comparten la base caen si quedan filas de la demo.
//
// LOS CASOS SON SECUENCIALES Y DEPENDEN DEL ORDEN: la corrida 1 deja las dos empresas demo que usan
// la corrida 2, R3, R6, R10 y R5. Rehacerlas en cada caso costaría ~25 s por caso. El `describe` es
// `sequential` y cada caso dependiente lo comprueba con `exigirCorrida1`: suelto con `-t` sale rojo
// con ese mensaje, no con una aserción que despiste. Para depurar uno, corre el archivo entero.
//
// LA FOTO DE PLATAFORMA (R7) NO DEPENDE DE QUE NADIE MÁS ESCRIBA EN LA BASE (review B1). En CI otros
// archivos commitean en paralelo `jobs` sin empresa (`dos-empresas-entradas`, los escenarios 419/454)
// y fijan la tarifa global (los de SL-40/SL-45). Por eso:
// - `jobs` sin empresa se acota a lo que la demo podría tocar: un centinela propio y los que nombran
//   en su `payload` algo de la demo (empresa, usuario, orden, aviso);
// - `geocode_cache` va entera (ningún test de integración la commitea) más un centinela propio;
// - `cobro_plataforma_tarifa` (una sola fila global) se lee con el lock de SL-40 tomado durante la
//   ventana y con un valor de control fijado, que se restaura al soltarlo.
// NO se sostiene `tomarLockDeEscrituraReal` toda la vida del archivo (~80 s): medido el 2026-10-25,
// con ese lock tomado 80 s, 6 archivos pequeños que serializan con él caen enteros por timeout de
// 20 s (9 de 10 casos; sin el lock, solo 2, por la base sin usuarios).
//
// Mutaciones medidas (design §9.3): 1–8 y 12, anotadas en `progress/impl_SL-43.md`.

import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { arrancarStorageFalso } from "@/e2e/_storage-falso/servidor.mjs";
import { loadDescargaConfig } from "@/lib/config/descarga";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { OrdenGeocodeRepository } from "@/lib/repositories/OrdenGeocodeRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { AsignabilidadCoordenadasService } from "@/lib/services/AsignabilidadCoordenadasService";
import { AuthService } from "@/lib/services/AuthService";
import { ConsoleEmailSender } from "@/lib/services/email/ConsoleEmailSender";
import { NodemailerEmailSender } from "@/lib/services/email/NodemailerEmailSender";
import { ORDER_STATUS_SEED } from "@/lib/types/order-status";
import { ejecutarDemo, type EfectosDemo, type EntornoDemoQa, type PasosDemo } from "@/scripts/demo-qa";
import { borrarEmpresasDemo } from "@/scripts/demo-qa/borrar";
import { DISTRITOS_DEMO, puntoDeOrden } from "@/scripts/demo-qa/geografia";
import { comprobarMarcaDeQa } from "@/scripts/demo-qa/guardia-entorno";
import { MOTIVO_CIERRE_SIN_EJECUTAR } from "@/scripts/demo-qa/ubicar-y-cerrar-jobs";
import { RUTAS_GUARDADAS } from "@/scripts/migrar-storage-a-carpetas";

import { crearEmpresaE2E, crearUsuarioE2E } from "../../fabricas/e2e";
import { comoApp } from "../../fabricas/organizaciones";
import { escenarioReparto, type EscenarioReparto } from "../../fabricas/escenarios/reparto";
import { tomarExclusionDemoQa, type ExclusionDemoQa } from "./_exclusion-demo-qa";
import { tomarTarifaGlobal } from "./_fixtures/cobro-plataforma-40";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";

// R23: un job de un tipo que nadie espera, metido justo antes de que la receta cierre la cola de la
// empresa. `cerrarJobsSinEjecutar` sigue siendo la real; solo se le antepone la inserción cuando un
// caso la arma.
const control = vi.hoisted(() => ({ antesDeCerrarJobs: null as null | ((organizacionId: string) => Promise<void>) }));
vi.mock("@/scripts/demo-qa/ubicar-y-cerrar-jobs", async (original) => {
  const real = await original<typeof import("@/scripts/demo-qa/ubicar-y-cerrar-jobs")>();
  return {
    ...real,
    cerrarJobsSinEjecutar: async (...args: Parameters<typeof real.cerrarJobsSinEjecutar>) => {
      const antes = control.antesDeCerrarJobs;
      if (antes) {
        control.antesDeCerrarJobs = null;
        await antes(args[1]);
      }
      return real.cerrarJobsSinEjecutar(...args);
    },
  };
});

// `sequential`: los casos dependen del orden (cabecera). Que nadie lo vuelva concurrente.
const describeSiHayBase = HAY_BASE_DE_DATOS ? describe.sequential : describe.skip;

const PREFIJO_LOG = "[demo-qa-test]";
const SLUGS = ["demo-qa-a", "demo-qa-b"] as const;
/** El tipo que el caso de R23 mete en la cola: existe en el enum y no está en los esperados. */
const TIPO_NO_ESPERADO = "whatsapp_bienvenida";

/**
 * B1 — centinelas propios de las tablas de plataforma, commiteados en el `beforeAll` y borrados en
 * el `afterAll`. Son el control de no vacuidad de R7: con la base vacía de CI, un borrado que se
 * llevara `jobs` sin empresa o la caché no cambiaría ninguna foto. El job es de un tipo del enum
 * original (ningún `down` lo quita), `done` (ningún drenaje lo toma) y sin `dedupe_key`.
 */
const CENTINELA_JOB = randomUUID();
const CENTINELA_GEOCODE = randomUUID();
/** El valor global que se fija mientras dura una foto: las dos demo tienen su excepción (R19). */
const TARIFA_GLOBAL_DE_CONTROL = "7.00";

/**
 * R15, EL CONTRATO: órdenes vivas por estado en cada empresa demo, escritas a mano. Medidas en la
 * primera corrida de T8/T9 y de este test. Si la receta cambia, este literal se cambia a mano.
 */
const ORDENES_POR_ESTADO: Record<string, number> = {
  por_recolectar_en_tienda: 2,
  recolectando: 2,
  en_ruta_bodega_central: 2,
  en_preparacion: 2,
  en_bodega_central: 2,
  en_ruta_bodega_satelite: 2,
  en_bodega_satelite: 2,
  mensajero_recogiendo_en_bodega: 2,
  en_reparto: 4,
  entregado: 3,
  reprogramado: 2,
  novedad: 2,
  novedad_interna: 2,
  devolucion_a_origen_por_rechazo: 2,
  por_devolver_a_bodega_central: 2,
  devolviendo_a_bodega_central: 2,
  por_devolver_a_tienda: 2,
  devolviendo_a_tienda: 2,
  devuelta_a_tienda: 2,
  incidente: 2,
};

/** R12: perfil → rol, y si es tienda, si tiene bodega propia (`fulfillment`). */
const PERFILES: Record<string, { rol: string; fulfillment?: boolean; zona?: "central" | "satelite" }> = {
  maestro: { rol: "maestro" },
  admin: { rol: "admin" },
  "tienda-bodega": { rol: "Admin Tienda", fulfillment: true },
  tienda: { rol: "Admin Tienda", fulfillment: false },
  satelite: { rol: "adminSatelite", zona: "satelite" },
  "mensajero-central": { rol: "mensajero", zona: "central" },
  "mensajero-satelite": { rol: "mensajero", zona: "satelite" },
  "mensajero-recolector": { rol: "mensajero", zona: "central" },
  "mensajero-corte": { rol: "mensajero", zona: "central" },
  "mensajero-cierre-rechazado": { rol: "mensajero", zona: "central" },
  "mensajero-cierre-pendiente": { rol: "mensajero", zona: "central" },
  "mensajero-reposo": { rol: "mensajero", zona: "central" },
};

/** R11: los orígenes del historial que deja la receta, todos de servicio. */
const ORIGENES_DE_SERVICIO = [
  // Lo escriben `DevolucionOrigenService`, `EnvioDevolucionCentralService`, `RecepcionOrigenService` y
  // `DevolucionTiendaRepository` (devoluciones de las fichas 48, 139 y 419), no un CRUD genérico.
  "ajuste_estado",
  "anclaje_devolucion",
  "asignacion_bodega",
  "asignacion_recoleccion",
  "asignacion_satelite",
  "carga_api",
  "carga_masiva",
  "corte_sin_gestionar",
  "devolucion_rechazada",
  "generacion_guia",
  "gestion",
  "incidente",
  "recepcion_bodega_central",
  "recepcion_satelite",
  "recoleccion",
  "recoleccion_tienda",
  "rechazo_tienda",
  "ruteo_satelite",
];

/** Lo que nunca puede aparecer: el alta individual se borró (2026-08-07) y la recuperación es manual. */
const ORIGENES_PROHIBIDOS = ["creacion_manual", "recuperacion_manual"];

let base: PrismaClient;
let doble: Awaited<ReturnType<typeof arrancarStorageFalso>>;
let cliente: SupabaseClient;
let exclusion: ExclusionDemoQa | undefined;
let tablasConEmpresa: string[] = [];
let fksAUsuario: { tabla: string; columna: string }[] = [];
let fksAOrden: { tabla: string; columna: string }[] = [];
let buckets: string[] = [];

const contrasena = `Demo-${randomBytes(9).toString("base64url")}-7a`;
const claveDeStorage = `clave-${randomUUID()}`;
const salidas: string[] = [];
const consola: string[] = [];
const duraciones: { etiqueta: string; ms: number; codigo: number }[] = [];

let real: { escenario: EscenarioReparto; ordenEnReparto: string; huella: Record<string, string> };
/** Lo que dejó la corrida 1: el caso de la corrida 2 lo busca en toda la base. */
let corrida1: { organizaciones: string[]; usuarios: string[]; ordenes: string[] };
let correosCorrida1: string[] = [];

const espiaConsola = vi.spyOn(ConsoleEmailSender.prototype, "enviar").mockResolvedValue({ messageId: null } as never);
const espiaSmtp = vi.spyOn(NodemailerEmailSender.prototype, "enviar").mockResolvedValue({ messageId: null } as never);

// ─── Utilidades ────────────────────────────────────────────────────────────────────────────────

function entorno(): EntornoDemoQa {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    SUPABASE_URL: doble.url,
    SUPABASE_SERVICE_ROLE_KEY: claveDeStorage,
    DEMO_QA_CONTRASENA: contrasena,
  };
}

interface Corrida {
  codigo: 0 | 1;
  lineas: { t: number; l: string }[];
  ms: number;
  texto: string;
}

/** Una ejecución de la demo, a mano, con la salida capturada. */
async function correr(etiqueta: string, extra: Partial<EfectosDemo> = {}): Promise<Corrida> {
  const lineas: { t: number; l: string }[] = [];
  const anotar = (l: string) => {
    lineas.push({ t: Date.now(), l });
    salidas.push(l);
  };
  const inicio = Date.now();
  const r = await ejecutarDemo({
    argumentos: [],
    env: entorno(),
    salida: { log: anotar, error: anotar },
    salir: () => undefined,
    ...extra,
  });
  const ms = Date.now() - inicio;
  duraciones.push({ etiqueta, ms, codigo: r.codigo });
  anotarEnLog(`${PREFIJO_LOG} ${etiqueta}: código ${r.codigo} en ${(ms / 1000).toFixed(1)} s`);
  return { codigo: r.codigo, lineas, ms, texto: lineas.map((x) => x.l).join("\n") };
}

/** Los pasos reales, como los arma `scripts/demo-qa.ts`, para envolver uno (R28). */
async function pasosReales(): Promise<PasosDemo> {
  const borrar = await import("@/scripts/demo-qa/borrar");
  const receta = await import("@/scripts/demo-qa/receta");
  return {
    comprobarMarca: (dueno) => comprobarMarcaDeQa(dueno),
    comprobarSlugs: (dueno) => borrar.comprobarSlugs(dueno),
    borrar: (dueno) => borrar.borrarEmpresasDemo(dueno),
    crearEmpresa: (dueno, clave, c) => receta.crearEmpresaDemo({ dueno }, clave, { contrasena: c }),
    comprobarEmpresa: (dueno, organizacionId, estadosPorDecision) =>
      receta.comprobarEmpresaDemo({ dueno }, organizacionId, { estadosPorDecision }),
    empresasDemo: (dueno) => borrar.empresasDemo(dueno),
    novedadInternaConCorteDeManana: receta.NOVEDAD_INTERNA_CON_CORTE_DE_MANANA,
  };
}

async function fksHacia(tabla: string): Promise<{ tabla: string; columna: string }[]> {
  return base.$queryRawUnsafe<{ tabla: string; columna: string }[]>(
    `SELECT cl.relname::text AS tabla, a.attname::text AS columna
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       JOIN pg_class r ON r.oid = c.confrelid
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND n.nspname = 'public' AND r.relname = $1 AND array_length(c.conkey, 1) = 1
      ORDER BY 1, 2`,
    tabla,
  );
}

async function contar(sql: string, ...params: unknown[]): Promise<number> {
  const [f] = await base.$queryRawUnsafe<{ n: number }[]>(sql, ...params);
  return f.n;
}

/** Todos los objetos del doble bajo `<carpeta>/`, en todos los buckets que nombran filas. */
async function objetosBajo(carpeta: string): Promise<string[]> {
  const res: string[] = [];
  const recorrer = async (bucket: string, prefijo: string): Promise<void> => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await cliente.storage.from(bucket).list(prefijo, { limit: 1000, offset });
      if (error) throw error;
      for (const e of data ?? []) {
        const ruta = `${prefijo}/${e.name}`;
        if (e.id === null) await recorrer(bucket, ruta);
        else res.push(`${bucket}/${ruta}`);
      }
      if (!data || data.length < 1000) break;
    }
  };
  for (const b of buckets) await recorrer(b, carpeta);
  return res.sort();
}

/**
 * Huella de una empresa: por tabla con `organizacion_id`, recuento y md5 de sus filas; su fila de
 * `organizacion`; las filas que cuelgan de sus usuarios (sesión, dispositivo, intentos…), y la
 * lista de sus objetos en el doble.
 */
async function huella(organizacionId: string): Promise<Record<string, string>> {
  const h: Record<string, string> = {};
  for (const t of tablasConEmpresa) {
    const [f] = await base.$queryRawUnsafe<{ n: number; m: string }[]>(
      `SELECT count(*)::int AS n, coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '') AS m
         FROM "${t}" x WHERE organizacion_id = $1`,
      organizacionId,
    );
    h[t] = `${f.n}:${f.m}`;
  }
  const [org] = await base.$queryRawUnsafe<{ m: string | null }[]>(
    // Sin `updated_at`: R10 cambia el slug de la real y lo restaura; el contenido es lo que cuenta.
    `SELECT md5((x.id, x.nombre, x.slug, x.cobro_plataforma_por_orden, x.es_demo, x.created_at)::text) AS m
       FROM organizacion x WHERE id = $1`,
    organizacionId,
  );
  h["organizacion"] = org?.m ?? "sin fila";
  const usuarios = (await base.usuario.findMany({ where: { organizacionId }, select: { id: true } })).map((u) => u.id);
  for (const fk of [...fksAUsuario, { tabla: "Session", columna: "userId" }]) {
    if (tablasConEmpresa.includes(fk.tabla)) continue;
    h[`${fk.tabla}.${fk.columna}`] = String(
      await contar(`SELECT count(*)::int AS n FROM "${fk.tabla}" WHERE "${fk.columna}" = ANY($1::text[])`, usuarios),
    );
  }
  h["storage"] = (await objetosBajo(organizacionId)).join(",");
  return h;
}

function filasDe(h: Record<string, string>, tabla: string): number {
  return Number(h[tabla]?.split(":")[0] ?? 0);
}

/** md5 por fila de una tabla de plataforma (o de su parte sin empresa): «no cambió» es igualdad. */
async function fotoDe(sql: string, ...params: unknown[]): Promise<Record<string, string>> {
  const filas = await base.$queryRawUnsafe<{ id: string; m: string }[]>(sql, ...params);
  return Object.fromEntries(filas.map((f) => [f.id, f.m]));
}

/**
 * Los ids que un job de la demo llevaría en su `payload` (`ordenId`, `mensajeroId`,
 * `notificacionId`…): las empresas dadas, sus usuarios, sus órdenes y sus avisos.
 */
async function idsDeLaDemo(organizaciones: string[]): Promise<string[]> {
  if (organizaciones.length === 0) return [];
  const filas = await base.$queryRawUnsafe<{ id: string }[]>(
    `SELECT unnest($1::text[]) AS id
     UNION SELECT id FROM usuario WHERE organizacion_id = ANY($1::text[])
     UNION SELECT id FROM orden WHERE organizacion_id = ANY($1::text[])
     UNION SELECT id FROM notificacion WHERE organizacion_id = ANY($1::text[])`,
    organizaciones,
  );
  return filas.map((f) => f.id);
}

/**
 * md5 por fila de lo que la demo podría tocar en las tablas de plataforma (cabecera, B1). La tarifa
 * global solo es estable dentro de `conTarifaGlobalDeControl`.
 */
async function fotoPlataforma(referencias: string[]): Promise<Record<string, Record<string, string>>> {
  return {
    jobsSinEmpresa: await fotoDe(
      `SELECT id, md5(x::text) AS m FROM jobs x
        WHERE organizacion_id IS NULL AND (id = $1 OR payload::text LIKE ANY($2::text[]))`,
      CENTINELA_JOB,
      referencias.map((r) => `%${r}%`),
    ),
    geocodeCache: await fotoDe(`SELECT id, md5(x::text) AS m FROM geocode_cache x`),
    cobroPlataformaTarifa: await fotoDe(`SELECT id::text AS id, md5(x::text) AS m FROM cobro_plataforma_tarifa x`),
  };
}

/** Control de no vacuidad de una foto: los dos centinelas y la tarifa de control están. */
function exigirCentinelas(foto: Record<string, Record<string, string>>): void {
  expect(foto.jobsSinEmpresa[CENTINELA_JOB], "centinela de jobs").toBeDefined();
  expect(foto.geocodeCache[CENTINELA_GEOCODE], "centinela de geocode_cache").toBeDefined();
  expect(Object.keys(foto.cobroPlataformaTarifa), "tarifa global de control").toEqual(["true"]);
}

/**
 * Corre `fn` con el lock de la tarifa global de SL-40 (el mismo que toman los archivos que la fijan)
 * y con un valor de control puesto; al soltar, la deja como estaba. Solo dura la ventana entre dos
 * fotos: sostenerlo los ~80 s del archivo retrasaría a esos archivos lo mismo.
 */
async function conTarifaGlobalDeControl<T>(fn: () => Promise<T>): Promise<T> {
  const tarifa = await tomarTarifaGlobal();
  try {
    await tarifa.fijar(TARIFA_GLOBAL_DE_CONTROL);
    return await fn();
  } finally {
    await tarifa.soltar();
  }
}

/**
 * Las empresas que la demo podría crear o borrar: las demo, las de sus slugs y la real. No la tabla
 * entera: otros archivos crean y borran empresas a la vez en CI (B1).
 */
async function empresasAlAlcanceDeLaDemo(): Promise<string[]> {
  const filas = await base.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM organizacion WHERE es_demo OR slug LIKE 'demo-qa%' OR id = $1 ORDER BY id`,
    real.escenario.empresa.organizacionId,
  );
  return filas.map((f) => f.id);
}

/** m7 — los casos que necesitan las empresas de la corrida 1 lo dicen, en vez de fallar raro. */
function exigirCorrida1(): void {
  expect(corrida1, "depende de la corrida 1: el archivo es secuencial; córrelo entero, no con -t").toBeDefined();
}

async function sembrarCentinelas(): Promise<void> {
  await base.$executeRawUnsafe(
    `INSERT INTO jobs (id, tipo, payload, estado, max_intentos, organizacion_id)
     VALUES ($1, 'liberar_reprogramadas'::job_tipo, '{"centinela":"SL-43 demo-qa"}'::jsonb, 'done', 1, NULL)`,
    CENTINELA_JOB,
  );
  await base.$executeRawUnsafe(
    `INSERT INTO geocode_cache (id, direccion_hash, latitud, longitud, precision)
     VALUES ($1, 'sl43-centinela-' || $1, 9.9, -84.1, 'centinela')`,
    CENTINELA_GEOCODE,
  );
}

async function quitarCentinelas(): Promise<void> {
  await base.$executeRawUnsafe(`DELETE FROM jobs WHERE id = $1`, CENTINELA_JOB);
  await base.$executeRawUnsafe(`DELETE FROM geocode_cache WHERE id = $1`, CENTINELA_GEOCODE);
}

async function empresasDemo(): Promise<{ id: string; slug: string }[]> {
  return base.organizacion.findMany({ where: { esDemo: true }, select: { id: true, slug: true }, orderBy: { slug: "asc" } });
}

async function ponerMarca(): Promise<void> {
  await base.$executeRawUnsafe(`INSERT INTO entorno_marca (clave, valor) VALUES ('entorno', 'qa') ON CONFLICT DO NOTHING`);
}

async function quitarMarca(): Promise<void> {
  await base.$executeRawUnsafe(`DELETE FROM entorno_marca WHERE clave = 'entorno'`);
}

/** El estado de cada orden de la empresa, por valor. */
async function porEstado(organizacionId: string): Promise<Record<string, number>> {
  const filas = await base.$queryRawUnsafe<{ v: string; n: number }[]>(
    `SELECT s.value::text AS v, count(*)::int AS n
       FROM orden o JOIN order_status s ON s.id = o.estatus_id
      WHERE o.organizacion_id = $1 AND o.deleted_at IS NULL
      GROUP BY 1`,
    organizacionId,
  );
  return Object.fromEntries(filas.map((f) => [f.v, f.n]));
}

// ─── La empresa real ───────────────────────────────────────────────────────────────────────────

/**
 * Una empresa creada como en la app (`crearEmpresaE2E`), con dos órdenes de su mensajero central:
 * una se queda EN REPARTO, de hoy y sin cierre (justo lo que el corte de mañana movería a
 * `novedad_interna`), y la otra se entrega con evidencia, que sube al doble.
 */
async function crearEmpresaReal(): Promise<{ escenario: EscenarioReparto; ordenEnReparto: string }> {
  const app = getPrismaClient();
  const evidencia = new Uint8Array(readFileSync(path.join(process.cwd(), "e2e", "fixtures", "evidencia.jpg")));
  let organizacionId = "";
  const nucleo = escenarioReparto({
    lector: () => base,
    evidencia: () => evidencia,
    // La geocodificación como la dejaría el job: coordenadas y su job cerrado.
    prepararAsignacion: async (ordenIds) => {
      await conEmpresa(organizacionId, async () => {
        const geo = new OrdenGeocodeRepository(app);
        for (const [i, id] of ordenIds.entries()) {
          const p = puntoDeOrden(DISTRITOS_DEMO.central, 50 + i);
          await geo.guardarResultado(id, { ...p, precision: "APPROXIMATE", status: "OK", geocodedAt: new Date() });
        }
        const jobs = new JobRepository(app);
        const abiertos = await base.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM jobs WHERE organizacion_id = $1 AND tipo = 'geocodificacion' AND estado IN ('pending', 'processing')`,
          organizacionId,
        );
        for (const j of abiertos) await jobs.complete(j.id);
      });
    },
    altas: {
      empresa: async (etiqueta) => {
        const e = await crearEmpresaE2E(etiqueta);
        organizacionId = e.organizacionId;
        return e;
      },
      usuario: (empresa, _perfil, rol, extra) => crearUsuarioE2E(empresa, rol, extra),
    },
  });
  const escenario = await nucleo.crearEscenarioReparto("SL43 real");
  const m = await nucleo.crearMensajero(escenario, "central");
  const enReparto = await nucleo.crearOrden(escenario, { zona: "central" });
  const entregada = await nucleo.crearOrden(escenario, { zona: "central" });
  await nucleo.llevarA(escenario, enReparto, "en_reparto", { mensajero: m });
  await nucleo.llevarA(escenario, entregada, "en_reparto", { mensajero: m });
  await nucleo.gestionar(escenario, entregada, m, { resultado: "entregado" });
  return { escenario, ordenEnReparto: enReparto.id };
}

// ─── El archivo ────────────────────────────────────────────────────────────────────────────────

describeSiHayBase("SL-43 — la demo de QA de punta a punta (Postgres real y doble de Storage)", () => {
  beforeAll(async () => {
    exclusion = await tomarExclusionDemoQa();
    base = crearPrismaDeTest();
    doble = await arrancarStorageFalso({ puerto: 0 });
    // Los adaptadores de `lib/storage/` leen esto al construirse: todo lo que suba la app va al doble.
    process.env.SUPABASE_URL = doble.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = claveDeStorage;
    cliente = createClient(doble.url, claveDeStorage);
    buckets = [...new Set([...RUTAS_GUARDADAS.map((r) => r.bucket()), loadDescargaConfig().BUCKET])];

    // R5: también lo que la receta escriba por consola, no solo la salida inyectada.
    for (const metodo of ["log", "warn", "error", "info"] as const) {
      const original = console[metodo].bind(console);
      vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
        consola.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join(" "));
        original(...args);
      });
    }

    tablasConEmpresa = (
      await base.$queryRawUnsafe<{ t: string }[]>(
        `SELECT c.table_name::text AS t
           FROM information_schema.columns c
           JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          WHERE c.table_schema = 'public' AND c.column_name = 'organizacion_id' AND t.table_type = 'BASE TABLE'
          ORDER BY 1`,
      )
    ).map((f) => f.t);
    fksAUsuario = await fksHacia("usuario");
    fksAOrden = await fksHacia("orden");

    // Esta base no puede traer empresas demo ni la marca de otro: se borrarían o mentirían.
    expect(await base.organizacion.count({ where: { esDemo: true } })).toBe(0);
    await ponerMarca();
    await sembrarCentinelas();

    const r = await crearEmpresaReal();
    const h = await huella(r.escenario.empresa.organizacionId);
    // Control de no vacuidad: sin órdenes ni objetos, «la huella no cambió» no prueba nada.
    expect(filasDe(h, "orden")).toBeGreaterThanOrEqual(1);
    expect(h["storage"].split(",").filter(Boolean).length).toBeGreaterThanOrEqual(1);
    real = { ...r, huella: h };
  }, 600_000);

  afterAll(async () => {
    const pasos: [string, () => Promise<unknown>][] = [
      // La real también se va: se marca y la borra el mismo borrado (por catálogo, con sus usuarios).
      [
        "marcar la real",
        async () => {
          if (real) await base.organizacion.update({ where: { id: real.escenario.empresa.organizacionId }, data: { esDemo: true } });
        },
      ],
      ["borrar las demo", () => borrarEmpresasDemo(base)],
      ["quitar la marca", () => quitarMarca()],
      ["quitar los centinelas", () => quitarCentinelas()],
    ];
    try {
      for (const [nombre, paso] of pasos) {
        try {
          if (base) await paso();
        } catch (e) {
          console.error(`${PREFIJO_LOG} afterAll: falló «${nombre}»: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (base) {
        const quedan = await base.organizacion.count({ where: { esDemo: true } });
        const marca = await contar(`SELECT count(*)::int AS n FROM entorno_marca`);
        const centinelas =
          (await contar(`SELECT count(*)::int AS n FROM jobs WHERE id = $1`, CENTINELA_JOB)) +
          (await contar(`SELECT count(*)::int AS n FROM geocode_cache WHERE id = $1`, CENTINELA_GEOCODE));
        anotarEnLog(`${PREFIJO_LOG} afterAll: empresas demo=${quedan} filas entorno_marca=${marca} centinelas=${centinelas}`);
      }
      anotarEnLog(
        `${PREFIJO_LOG} duraciones: ${duraciones.map((d) => `${d.etiqueta}=${(d.ms / 1000).toFixed(1)}s(${d.codigo})`).join(", ")}`,
      );
    } finally {
      await doble?.cerrar().catch(() => undefined);
      await base?.$disconnect().catch(() => undefined);
      await exclusion?.soltar().catch(() => undefined);
      vi.restoreAllMocks();
    }
  }, 600_000);

  it("la primera ejecución deja dos empresas demo completas (R1, R11–R19, R26)", async () => {
    const c = await correr("corrida 1");
    // R7 desde la primera: la real no cambia aunque no haya nada que borrar. Antes que el código:
    // un corte para todas las empresas (mutación 6) termina en 0 y solo se ve aquí.
    expect(await huella(real.escenario.empresa.organizacionId), "la empresa real cambió").toEqual(real.huella);
    expect(c.codigo, c.texto).toBe(0);

    // R1: exactamente las dos, marcadas, con sus slugs.
    const demo = await empresasDemo();
    expect(demo.map((d) => d.slug)).toEqual([...SLUGS]);
    expect(await base.organizacion.count({ where: { slug: { in: [...SLUGS] }, esDemo: false } })).toBe(0);

    const usuariosTodos: string[] = [];
    const ordenesTodas: string[] = [];
    const correos: string[] = [];
    for (const { id: org, slug } of demo) {
      const x = slug.slice(-1);

      // R15: las 20 cifras, el contrato escrito a mano.
      expect(Object.keys(ORDENES_POR_ESTADO).sort()).toEqual([...ORDER_STATUS_SEED].sort());
      expect(await porEstado(org), slug).toEqual(ORDENES_POR_ESTADO);

      // R12: un usuario por perfil, correos fijos `@example.test`; el de la API key es la excepción.
      const usuarios = await base.$queryRawUnsafe<
        { id: string; email: string; rol: string; fulfillment: boolean; zona: boolean | null; estado: string }[]
      >(
        `SELECT u.id, u.email, r.value::text AS rol, u.fulfillment, z.es_central AS zona, u.estado::text AS estado
           FROM usuario u JOIN rol r ON r.id = u.rol_id LEFT JOIN zona z ON z.id = u.zona_id
          WHERE u.organizacion_id = $1`,
        org,
      );
      const porCorreo = new Map(usuarios.map((u) => [u.email, u]));
      expect(usuarios).toHaveLength(Object.keys(PERFILES).length + 1);
      for (const [perfil, esperado] of Object.entries(PERFILES)) {
        const u = porCorreo.get(`demo-qa-${x}-${perfil}@example.test`);
        expect(u, `${slug} sin ${perfil}`).toBeDefined();
        expect(u!.rol, `${slug} ${perfil}`).toBe(esperado.rol);
        if (esperado.fulfillment !== undefined) expect(u!.fulfillment, `${slug} ${perfil}`).toBe(esperado.fulfillment);
        if (esperado.zona) expect(u!.zona, `${slug} ${perfil}`).toBe(esperado.zona === "central");
      }
      const api = usuarios.filter((u) => u.rol === "apiKey");
      expect(api.map((u) => u.email)).toEqual([`apikey+demo-qa-${x}-api@apikey.invalid`]);
      expect(usuarios.filter((u) => u.rol !== "apiKey").every((u) => u.email.endsWith("@example.test"))).toBe(true);
      correos.push(...usuarios.map((u) => u.email));
      usuariosTodos.push(...usuarios.map((u) => u.id));

      // R26: la contraseña vale en el paso de contraseña del login, para cada usuario navegable.
      const auth = authConPasoDeContrasenaReal();
      for (const u of usuarios.filter((v) => v.rol !== "apiKey")) {
        const r = await auth.login({ email: u.email, password: contrasena, ipAddress: "127.0.0.1", userAgent: "demo-qa-test" });
        expect(r.status, u.email).toBe("ok");
      }
      // Control: otra contraseña no entra (el paso compara de verdad).
      const mala = await auth.login({
        email: `demo-qa-${x}-maestro@example.test`,
        password: `${contrasena}x`,
        ipAddress: "127.0.0.1",
        userAgent: "demo-qa-test",
      });
      expect(mala.status).toBe("invalid_credentials");

      // R13: zona central y satélite con distrito, tarifa del mensajero y SINPE confirmado.
      const zonas = await base.$queryRawUnsafe<
        { es_central: boolean; distritos: number; tarifas: number; sinpe: boolean; revisado: boolean }[]
      >(
        `SELECT z.es_central,
                (SELECT count(*)::int FROM zona_distrito d WHERE d.zona_id = z.id) AS distritos,
                (SELECT count(*)::int FROM tarifa_zona_mensajero t WHERE t.zona_id = z.id) AS tarifas,
                (z.sinpe_numero IS NOT NULL AND z.sinpe_numero <> '') AS sinpe,
                (z.sinpe_revisado_at IS NOT NULL) AS revisado
           FROM zona z WHERE z.organizacion_id = $1 ORDER BY z.es_central DESC`,
        org,
      );
      expect(zonas.map((z) => z.es_central)).toEqual([true, false]);
      for (const z of zonas) {
        expect(z.distritos).toBeGreaterThanOrEqual(1);
        expect(z.tarifas).toBeGreaterThanOrEqual(1);
        expect(z.sinpe).toBe(true);
        expect(z.revisado).toBe(true);
      }
      // R13: una tarifa por tienda, y un distrito de sus zonas marcado como zona especial.
      expect(
        await contar(
          `SELECT count(DISTINCT u.id)::int AS n FROM usuario u JOIN rol r ON r.id = u.rol_id
             JOIN tarifas t ON t.tienda_id = u.id
            WHERE u.organizacion_id = $1 AND r.value = 'Admin Tienda'`,
          org,
        ),
      ).toBe(2);
      expect(
        await contar(
          `SELECT count(*)::int AS n FROM distrito_zona_especial e
            WHERE e.organizacion_id = $1
              AND EXISTS (SELECT 1 FROM zona_distrito d WHERE d.organizacion_id = $1 AND d.distrito_id = e.distrito_id)`,
          org,
        ),
      ).toBeGreaterThanOrEqual(1);

      // R14: las tres vías. Pantalla = carga de la tienda SIN bodega; masiva = la de la tienda CON
      // bodega; API = `carga_api`. Las dos primeras dejan el mismo origen (`progress/impl_SL-43.md > T8`).
      const vias = await base.$queryRawUnsafe<{ origen: string; fulfillment: boolean; n: number }[]>(
        `SELECT h.origen_tipo::text AS origen, t.fulfillment, count(*)::int AS n
           FROM orden_historial_estado h JOIN orden o ON o.id = h.orden_id JOIN usuario t ON t.id = o.tienda_id
          WHERE h.organizacion_id = $1 AND h.estatus_origen_id IS NULL
          GROUP BY 1, 2 ORDER BY 1, 2`,
        org,
      );
      const via = (origen: string, fulfillment: boolean) =>
        vias.find((v) => v.origen === origen && v.fulfillment === fulfillment)?.n ?? 0;
      expect(via("carga_masiva", false), "pantalla").toBeGreaterThanOrEqual(1);
      expect(via("carga_masiva", true), "carga masiva").toBeGreaterThanOrEqual(1);
      expect(via("carga_api", false), "API").toBeGreaterThanOrEqual(1);

      // R16: una gestión de cada resultado, pago mixto, devuelta a tienda e incidente indemnizado.
      const resultados = await base.$queryRawUnsafe<{ r: string }[]>(
        `SELECT DISTINCT resultado::text AS r FROM gestion_orden WHERE organizacion_id = $1 AND anulada_at IS NULL`,
        org,
      );
      expect(resultados.map((r) => r.r)).toEqual(
        expect.arrayContaining(["entregado", "devolucion_a_origen_por_rechazo", "reprogramado", "novedad"]),
      );
      expect(
        await contar(
          `SELECT count(*)::int AS n FROM (
             SELECT gestion_id FROM gestion_orden_pago WHERE organizacion_id = $1
              GROUP BY gestion_id HAVING count(DISTINCT metodo) >= 2) x`,
          org,
        ),
        "pago mixto",
      ).toBeGreaterThanOrEqual(1);
      expect(
        await contar(
          `SELECT count(*)::int AS n FROM orden_incidente
            WHERE organizacion_id = $1 AND estado = 'aprobado' AND indemnizacion > 0`,
          org,
        ),
        "incidente indemnizado",
      ).toBeGreaterThanOrEqual(1);

      // R17: cierres de día aprobado, rechazado y solicitado; cierre de bodega satélite conciliado.
      const cierres = await base.$queryRawUnsafe<{ e: string }[]>(
        `SELECT DISTINCT estado::text AS e FROM cierre_dia WHERE organizacion_id = $1`,
        org,
      );
      expect(cierres.map((e) => e.e)).toEqual(expect.arrayContaining(["aprobado", "rechazado", "solicitado"]));
      expect(
        await contar(
          `SELECT count(*)::int AS n FROM cierre_bodega b JOIN zona z ON z.id = b.zona_id
            WHERE b.organizacion_id = $1 AND NOT z.es_central AND b.estado = 'aprobado' AND b.conciliado_at IS NOT NULL`,
          org,
        ),
        "cierre de bodega",
      ).toBeGreaterThanOrEqual(1);

      // R18: caja desde cierres aprobados, pago a mensajero, aporte con comprobante y abono.
      const caja = await base.$queryRawUnsafe<{ c: string; o: string }[]>(
        `SELECT DISTINCT categoria::text AS c, origen_tipo::text AS o FROM wallet_movimiento WHERE organizacion_id = $1`,
        org,
      );
      expect(caja.some((m) => m.o === "cierre_dia"), "caja de cierres").toBe(true);
      expect(caja.map((m) => m.c)).toEqual(
        expect.arrayContaining([
          "egreso_pago_mensajero",
          "ingreso_aporte_capital",
          "ingreso_abono_tienda",
          "egreso_indemnizacion",
          "egreso_pago_plataforma",
        ]),
      );
      const aportes = await base.$queryRawUnsafe<{ p: string | null }[]>(
        `SELECT comprobante_path AS p FROM aporte_capital WHERE organizacion_id = $1`,
        org,
      );
      expect(aportes.length).toBeGreaterThanOrEqual(1);
      const objetos = await objetosBajo(org);
      for (const a of aportes) {
        expect(a.p).not.toBeNull();
        expect(objetos.some((o) => o.endsWith(`${org}/${a.p}`)), "comprobante del aporte en el doble").toBe(true);
      }
      expect(await contar(`SELECT count(*)::int AS n FROM abono_tienda WHERE organizacion_id = $1`, org)).toBeGreaterThanOrEqual(1);

      // R19: excepción de cobro propia, un cargo de la plataforma por orden y un pago a la plataforma.
      const fila = await base.$queryRawUnsafe<{ c: string | null }[]>(
        `SELECT cobro_plataforma_por_orden::text AS c FROM organizacion WHERE id = $1`,
        org,
      );
      expect(Number(fila[0].c)).toBe(100);
      // R11 también: cada orden nació por un camino con trigger, que deja su cargo.
      const sinCargoUnico = await contar(
        `SELECT count(*)::int AS n FROM orden o
          WHERE o.organizacion_id = $1
            AND (SELECT count(*) FROM cobro_plataforma_movimiento m WHERE m.orden_id = o.id AND m.tipo = 'cargo') <> 1`,
        org,
      );
      expect(sinCargoUnico, "órdenes sin exactamente un cargo de SL-40").toBe(0);
      expect(
        await contar(
          `SELECT count(*)::int AS n FROM cobro_plataforma_movimiento
            WHERE organizacion_id = $1 AND tipo = 'cargo' AND fuente = 'empresa' AND monto = 100`,
          org,
        ),
      ).toBe(await contar(`SELECT count(*)::int AS n FROM orden WHERE organizacion_id = $1`, org));

      // R11: todo el historial con un origen de servicio, y cada orden con su alta en él.
      const origenes = (
        await base.$queryRawUnsafe<{ o: string }[]>(
          `SELECT DISTINCT origen_tipo::text AS o FROM orden_historial_estado WHERE organizacion_id = $1 ORDER BY 1`,
          org,
        )
      ).map((f) => f.o);
      expect(origenes.filter((o) => ORIGENES_PROHIBIDOS.includes(o))).toEqual([]);
      expect(origenes.filter((o) => !ORIGENES_DE_SERVICIO.includes(o)), "origen fuera de la lista").toEqual([]);
      expect(
        await contar(
          `SELECT count(*)::int AS n FROM orden o WHERE o.organizacion_id = $1
              AND NOT EXISTS (SELECT 1 FROM orden_historial_estado h WHERE h.orden_id = o.id AND h.estatus_origen_id IS NULL)`,
          org,
        ),
        "órdenes sin su alta en el historial",
      ).toBe(0);

      ordenesTodas.push(
        ...(await base.orden.findMany({ where: { organizacionId: org }, select: { id: true } })).map((o) => o.id),
      );
    }

    // R26: la salida lista, por empresa, el perfil y el correo de cada usuario.
    for (const correo of correos) expect(c.texto).toContain(correo);
    corrida1 = { organizaciones: demo.map((d) => d.id), usuarios: usuariosTodos, ordenes: ordenesTodas };
    correosCorrida1 = [...correos].sort();
  }, 300_000);

  it("órdenes ubicadas y asignables, cola sin pendientes, sin integraciones ni correo (R20–R24)", async () => {
    exigirCorrida1();
    for (const org of corrida1.organizaciones) {
      // R20: ubicadas y con su geocodificación cerrada como hecha.
      expect(
        await contar(
          `SELECT count(*)::int AS n FROM orden WHERE organizacion_id = $1
              AND (latitud IS NULL OR longitud IS NULL OR geocode_status IS DISTINCT FROM 'OK')`,
          org,
        ),
        "órdenes sin ubicar",
      ).toBe(0);
      expect(
        await contar(
          `SELECT count(*)::int AS n FROM jobs WHERE organizacion_id = $1 AND tipo = 'geocodificacion' AND estado <> 'done'`,
          org,
        ),
      ).toBe(0);
      expect(
        await contar(`SELECT count(*)::int AS n FROM jobs WHERE organizacion_id = $1 AND tipo = 'geocodificacion'`, org),
      ).toBe(await contar(`SELECT count(*)::int AS n FROM orden WHERE organizacion_id = $1`, org));

      // R21: el gate real da `asignable` a toda orden en un estado desde el que se asigna.
      const asignables = await base.$queryRawUnsafe<
        { id: string; direccion: string | null; latitud: string | null; longitud: string | null; geocode_status: string | null }[]
      >(
        `SELECT o.id, o.direccion, o.latitud::text AS latitud, o.longitud::text AS longitud, o.geocode_status
           FROM orden o JOIN order_status s ON s.id = o.estatus_id
          WHERE o.organizacion_id = $1 AND o.deleted_at IS NULL AND s.value IN ('en_bodega_central', 'en_bodega_satelite')`,
        org,
      );
      expect(asignables.length).toBeGreaterThanOrEqual(1);
      const gate = await conEmpresa(org, () =>
        new AsignabilidadCoordenadasService(new JobRepository(getPrismaClient())).evaluar(
          asignables.map((o) => ({
            id: o.id,
            direccion: o.direccion,
            latitud: o.latitud === null ? null : Number(o.latitud),
            longitud: o.longitud === null ? null : Number(o.longitud),
            geocodeStatus: o.geocode_status,
          })),
        ),
      );
      expect(asignables.map((o) => gate.get(o.id))).toEqual(asignables.map(() => "asignable"));

      // R22: ningún job de la demo pendiente ni en curso; los cerrados sin ejecutar llevan su motivo.
      expect(
        await contar(`SELECT count(*)::int AS n FROM jobs WHERE organizacion_id = $1 AND estado IN ('pending', 'processing')`, org),
      ).toBe(0);
      expect(
        await contar(
          `SELECT count(*)::int AS n FROM jobs WHERE organizacion_id = $1 AND tipo = 'optimizacion_ruta'
              AND (estado <> 'failed' OR last_error IS DISTINCT FROM $2)`,
          org,
          MOTIVO_CIERRE_SIN_EJECUTAR,
        ),
      ).toBe(0);

      // R24: sin integraciones, suscripciones, plantillas ni envíos.
      for (const t of ["integracion", "webhook_suscripcion", "plantilla_mensaje", "whatsapp_envio"]) {
        expect(await contar(`SELECT count(*)::int AS n FROM "${t}" WHERE organizacion_id = $1`, org), t).toBe(0);
      }
    }
    // R22: la salida cuenta, por tipo, lo que cerró sin ejecutar.
    expect(salidas.join("\n")).toMatch(/jobs cerrados sin ejecutar \(QA no procesa la cola\): optimizacion_ruta \d+/);
    // R24: ningún correo.
    expect(espiaConsola).not.toHaveBeenCalled();
    expect(espiaSmtp).not.toHaveBeenCalled();
  }, 120_000);

  it("la segunda ejecución recrea y no toca la empresa real (R7, R9, R27)", async () => {
    exigirCorrida1();
    // Controles de no vacuidad: la corrida 1 dejó filas y objetos que la 2 tiene que borrar.
    expect(corrida1.ordenes.length).toBeGreaterThan(0);
    expect(corrida1.usuarios.length).toBeGreaterThan(0);
    const objetosViejos = (await Promise.all(corrida1.organizaciones.map(objetosBajo))).flat();
    expect(objetosViejos.length).toBeGreaterThan(0);
    // Los ids de la corrida 1 se leen antes de que la 2 los borre (sus avisos no están en `corrida1`).
    const referenciasViejas = await idsDeLaDemo(corrida1.organizaciones);

    const { c, plataformaAntes, plataformaDespues } = await conTarifaGlobalDeControl(async () => {
      const antes = await fotoPlataforma(referenciasViejas);
      exigirCentinelas(antes);
      const corrida = await correr("corrida 2");
      const nuevas = (await empresasDemo()).map((d) => d.id);
      const despues = await fotoPlataforma([...referenciasViejas, ...(await idsDeLaDemo(nuevas))]);
      return { c: corrida, plataformaAntes: antes, plataformaDespues: despues };
    });
    expect(c.codigo, c.texto).toBe(0);

    // R27: otra vez exactamente dos, nuevas.
    const demo = await empresasDemo();
    expect(demo.map((d) => d.slug)).toEqual([...SLUGS]);
    expect(demo.map((d) => d.id).filter((id) => corrida1.organizaciones.includes(id))).toEqual([]);

    // R7: ni una fila de la corrida 1 en ninguna tabla.
    const viejas = corrida1.organizaciones;
    expect(await base.organizacion.count({ where: { id: { in: viejas } } })).toBe(0);
    for (const t of tablasConEmpresa) {
      expect(await contar(`SELECT count(*)::int AS n FROM "${t}" WHERE organizacion_id = ANY($1::text[])`, viejas), t).toBe(0);
    }
    expect(await base.usuario.count({ where: { id: { in: corrida1.usuarios } } })).toBe(0);
    for (const fk of [...fksAUsuario, { tabla: "Session", columna: "userId" }]) {
      expect(
        await contar(`SELECT count(*)::int AS n FROM "${fk.tabla}" WHERE "${fk.columna}" = ANY($1::text[])`, corrida1.usuarios),
        `${fk.tabla}.${fk.columna}`,
      ).toBe(0);
    }
    for (const fk of fksAOrden) {
      expect(
        await contar(`SELECT count(*)::int AS n FROM "${fk.tabla}" WHERE "${fk.columna}" = ANY($1::text[])`, corrida1.ordenes),
        `${fk.tabla}.${fk.columna}`,
      ).toBe(0);
    }

    // R9: ningún objeto bajo las carpetas de la corrida 1; las nuevas sí tienen.
    expect((await Promise.all(viejas.map(objetosBajo))).flat()).toEqual([]);
    expect((await Promise.all(demo.map((d) => objetosBajo(d.id)))).flat().length).toBeGreaterThan(0);

    // R7: la empresa real, idéntica (filas, usuarios y objetos), y la plataforma sin cambios.
    expect(await huella(real.escenario.empresa.organizacionId)).toEqual(real.huella);
    expect(plataformaDespues).toEqual(plataformaAntes);

    // R12: los mismos correos en cada ejecución.
    const correos = (
      await base.usuario.findMany({ where: { organizacionId: { in: demo.map((d) => d.id) } }, select: { email: true } })
    )
      .map((u) => u.email)
      .sort();
    expect(correos).toEqual(correosCorrida1);

    // R24: tampoco en la segunda.
    expect(espiaConsola).not.toHaveBeenCalled();
    expect(espiaSmtp).not.toHaveBeenCalled();
  }, 480_000);

  it("sin la marca de QA no escribe nada (R3)", async () => {
    exigirCorrida1();
    const demo = await empresasDemo();
    // Control: hay empresas demo que un borrado prematuro se llevaría.
    expect(demo).toHaveLength(2);
    const orgsAntes = await empresasAlAlcanceDeLaDemo();
    const huellas = await Promise.all(demo.map((d) => huella(d.id)));
    const referencias = await idsDeLaDemo(demo.map((d) => d.id));
    const { plataformaAntes, plataformaDespues } = await conTarifaGlobalDeControl(async () => {
      const antes = await fotoPlataforma(referencias);
      exigirCentinelas(antes);
      await quitarMarca();
      try {
        const c = await correr("sin marca");
        expect(c.codigo).toBe(1);
        expect(c.texto).toContain("la base no es la de QA");
      } finally {
        await ponerMarca();
      }
      return { plataformaAntes: antes, plataformaDespues: await fotoPlataforma(referencias) };
    });
    expect(await empresasAlAlcanceDeLaDemo()).toEqual(orgsAntes);
    expect(await Promise.all(demo.map((d) => huella(d.id)))).toEqual(huellas);
    expect(plataformaDespues).toEqual(plataformaAntes);
  }, 300_000);

  it("`servi_app` no puede cambiar `es_demo` (R6)", async () => {
    const realId = real.escenario.empresa.organizacionId;
    const intentar = async (sql: string, ...params: unknown[]): Promise<string | null> => {
      let codigo: string | null = null;
      try {
        await base.$transaction(async (tx) => {
          await comoApp(tx, realId);
          await tx.$executeRawUnsafe(`SAVEPOINT r6`);
          try {
            await tx.$executeRawUnsafe(sql, ...params);
          } catch (e) {
            codigo = sqlstate(e);
          }
          throw new Error("revertir");
        });
      } catch (e) {
        if (!(e instanceof Error && e.message === "revertir")) throw e;
      }
      return codigo;
    };
    expect(await intentar(`UPDATE organizacion SET es_demo = true WHERE id = $1`, realId)).toBe("42501");
    expect(await intentar(`UPDATE organizacion SET es_demo = false WHERE id = $1`, realId)).toBe("42501");
    expect((await base.organizacion.findUniqueOrThrow({ where: { id: realId }, select: { esDemo: true } })).esDemo).toBe(false);
  }, 60_000);

  it("el alta normal nace sin marca (R6)", async () => {
    exigirCorrida1();
    // La real nació por `altaEmpresa` (crearEmpresaE2E): sin marca. Solo las de la demo la tienen.
    const realId = real.escenario.empresa.organizacionId;
    expect((await base.organizacion.findUniqueOrThrow({ where: { id: realId }, select: { esDemo: true } })).esDemo).toBe(false);
    const marcadas = (await empresasDemo()).map((d) => d.slug);
    expect(marcadas).toEqual([...SLUGS]);
  }, 60_000);

  it("slug demo en una empresa real: aborta sin cambios (R10)", async () => {
    exigirCorrida1();
    const realId = real.escenario.empresa.organizacionId;
    const slugReal = real.escenario.empresa.slug;
    const demo = await empresasDemo();
    expect(demo).toHaveLength(2);
    const idA = demo[0].id;
    // La demo A cede su slug y la real lo toma: hay empresas demo que borrar y un slug ocupado.
    await base.organizacion.update({ where: { id: idA }, data: { slug: "demo-qa-a-cedido" } });
    await base.organizacion.update({ where: { id: realId }, data: { slug: "demo-qa-a" } });
    try {
      const orgsAntes = await empresasAlAlcanceDeLaDemo();
      const huellas = await Promise.all([realId, ...demo.map((d) => d.id)].map(huella));
      expect(filasDe(huellas[1], "orden")).toBeGreaterThan(0);

      const c = await correr("slug en una real");
      expect(c.codigo).toBe(1);
      expect(c.texto).toMatch(/demo-qa-a/);

      expect(await empresasAlAlcanceDeLaDemo()).toEqual(orgsAntes);
      expect(await Promise.all([realId, ...demo.map((d) => d.id)].map(huella))).toEqual(huellas);
    } finally {
      await base.organizacion.update({ where: { id: realId }, data: { slug: slugReal } });
      await base.organizacion.update({ where: { id: idA }, data: { slug: "demo-qa-a" } });
    }
    // La huella de la real se tomó con el slug cambiado: vuelve a ser la original.
    expect(await huella(realId)).toEqual(real.huella);
  }, 120_000);

  it("un job de la demo de un tipo no esperado: sale 1 y lo nombra (R23)", async () => {
    let inyectadoEn: string | undefined;
    control.antesDeCerrarJobs = async (organizacionId) => {
      inyectadoEn = organizacionId;
      await base.$executeRawUnsafe(
        `INSERT INTO jobs (id, tipo, payload, estado, max_intentos, organizacion_id)
         VALUES ($1, $2::job_tipo, '{}'::jsonb, 'pending', 1, $3)`,
        randomUUID(),
        TIPO_NO_ESPERADO,
        organizacionId,
      );
    };
    try {
      const c = await correr("tipo no esperado");
      expect(c.codigo).toBe(1);
      expect(c.texto).toContain(TIPO_NO_ESPERADO);
      expect(c.texto).toContain("tipo no esperado");
    } finally {
      control.antesDeCerrarJobs = null;
    }
    // Se cerró sin ejecutar (R23 y R22): ningún job suyo quedó abierto.
    expect(inyectadoEn).toBeDefined();
    const filas = await base.$queryRawUnsafe<{ estado: string; last_error: string | null }[]>(
      `SELECT estado::text AS estado, last_error FROM jobs WHERE organizacion_id = $1 AND tipo = $2::job_tipo`,
      inyectadoEn,
      TIPO_NO_ESPERADO,
    );
    expect(filas).toEqual([{ estado: "failed", last_error: MOTIVO_CIERRE_SIN_EJECUTAR }]);
  }, 300_000);

  it("una ejecución cortada a mitad de la receta: la siguiente borra lo que quedó (R28)", async () => {
    const reales = await pasosReales();
    const receta = await import("@/scripts/demo-qa/receta");
    const c = await correr("cortada en B", {
      cargarPasos: async () => ({
        ...reales,
        // B nace, se marca y se corta en el primer paso con reloj (al ubicar su primera orden).
        crearEmpresa: (dueno, clave, cont) =>
          clave === "B"
            ? receta.crearEmpresaDemo({ dueno }, clave, {
                contrasena: cont,
                ahora: () => {
                  throw new Error("[demo-qa-test] corte simulado a mitad de la receta de B");
                },
              })
            : reales.crearEmpresa(dueno, clave, cont),
      }),
    });
    expect(c.codigo).toBe(1);
    // El detalle del error no se imprime (R5): basta con el código y la línea de fallo.
    expect(c.texto).toContain("FALLÓ la demo");
    const cortada = await empresasDemo();
    expect(cortada.map((d) => d.slug)).toEqual([...SLUGS]);
    const idB = cortada[1].id;
    // Control: B quedó a medias (con alguna orden, pero no todas).
    const ordenesB = await contar(`SELECT count(*)::int AS n FROM orden WHERE organizacion_id = $1`, idB);
    expect(ordenesB).toBeGreaterThan(0);
    expect(ordenesB).toBeLessThan(Object.values(ORDENES_POR_ESTADO).reduce((a, b) => a + b, 0));

    const r = await correr("tras el corte");
    expect(r.codigo, r.texto).toBe(0);
    const demo = await empresasDemo();
    expect(demo.map((d) => d.slug)).toEqual([...SLUGS]);
    expect(demo.map((d) => d.id).filter((id) => cortada.some((x) => x.id === id))).toEqual([]);
    expect(await base.organizacion.count({ where: { id: { in: cortada.map((x) => x.id) } } })).toBe(0);
    expect(await contar(`SELECT count(*)::int AS n FROM orden WHERE organizacion_id = $1`, idB)).toBe(0);
    expect(await objetosBajo(idB)).toEqual([]);
  }, 300_000);

  it("dos ejecuciones a la vez: la segunda espera a la primera (R32)", async () => {
    const [a, b] = await Promise.all([correr("simultánea 1"), correr("simultánea 2")]);
    expect(a.codigo, a.texto).toBe(0);
    expect(b.codigo, b.texto).toBe(0);
    expect((await empresasDemo()).map((d) => d.slug)).toEqual([...SLUGS]);

    // Una después de la otra: el trabajo de una (borrado → resumen) no se solapa con el de la otra.
    const tramo = (x: Corrida) => {
      const desde = x.lineas.find((l) => l.l.includes("borrando las empresas demo anteriores"))?.t;
      const hasta = x.lineas[x.lineas.length - 1]?.t;
      expect(desde, x.texto).toBeDefined();
      return { desde: desde as number, hasta: hasta as number };
    };
    const [ta, tb] = [tramo(a), tramo(b)];
    expect(ta.hasta <= tb.desde || tb.hasta <= ta.desde, JSON.stringify({ ta, tb })).toBe(true);
    expect([a, b].some((x) => x.texto.includes("espera a otra ejecución"))).toBe(true);
  }, 600_000);

  it("ninguna salida lleva la contraseña, la URL de la base ni la clave (R5)", () => {
    exigirCorrida1();
    // Control: hubo salida que mirar.
    expect(salidas.length).toBeGreaterThan(50);
    const todo = [...salidas, ...consola].join("\n");
    const prohibidos = [
      contrasena,
      claveDeStorage,
      process.env.DATABASE_URL,
      process.env.DIRECT_URL,
      "postgresql://",
      "postgres://",
      "$2a$",
      "$2b$",
    ].filter((p): p is string => typeof p === "string" && p.length > 0);
    for (const p of prohibidos) expect(todo.includes(p), "un secreto en la salida").toBe(false);
    expect(espiaConsola).not.toHaveBeenCalled();
    expect(espiaSmtp).not.toHaveBeenCalled();
  });
});

/**
 * Las líneas del propio test (duración de cada corrida, estado tras el `afterAll`). Directo a stdout:
 * el reporter de vitest no enseña el `console` de los tests que pasan.
 */
function anotarEnLog(linea: string): void {
  process.stdout.write(`${linea}
`);
}

/** `AuthService.login` con el repositorio de usuarios real (el hash de la base) y dobles alrededor. */
function authConPasoDeContrasenaReal(): AuthService {
  return new AuthService(
    new UserRepository(base),
    { contarFallosConsecutivosRecientes: async () => 0, registrar: async () => undefined } as never,
    { upsert: async () => undefined } as never,
    {} as never,
    { create: async () => ({ id: "sesion-de-test", expiresAt: new Date() }) } as never,
    { evaluate: async () => ({ isHigh: false, score: 0, reasons: [] }) } as never,
    {} as never,
  );
}

function sqlstate(e: unknown): string | null {
  let actual: unknown = e;
  for (let i = 0; i < 6 && actual && typeof actual === "object"; i++) {
    const o = actual as Record<string, unknown>;
    for (const k of ["code", "sqlState", "originalCode"]) {
      // `P2010` y compañía son códigos de Prisma, no SQLSTATE: se sigue hacia la causa.
      if (typeof o[k] === "string" && /^[0-9A-Z]{5}$/.test(o[k] as string) && !/^P\d{4}$/.test(o[k] as string)) return o[k] as string;
    }
    const m = typeof o.message === "string" ? /\b(42501)\b/.exec(o.message) : null;
    if (m) return m[1];
    const meta = o.meta as Record<string, unknown> | undefined;
    if (meta && typeof meta.code === "string" && /^[0-9A-Z]{5}$/.test(meta.code)) return meta.code;
    actual = o.cause ?? meta?.driverAdapterError;
  }
  return null;
}
