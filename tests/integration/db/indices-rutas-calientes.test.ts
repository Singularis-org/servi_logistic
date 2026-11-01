import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { prepararConsultaAnalitica, type ConsultaAnalitica } from "@/lib/analytics/consulta";
import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { AnaliticaOperativaRollupRepository } from "@/lib/repositories/AnaliticaOperativaRollupRepository";
import { AnaliticaOperativaVivaRepository } from "@/lib/repositories/AnaliticaOperativaVivaRepository";
import { HistorialAccionRepository } from "@/lib/repositories/HistorialAccionRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TarifaRepository } from "@/lib/repositories/TarifaRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { WhatsappEjecucionRepository } from "@/lib/repositories/WhatsappEjecucionRepository";
import { comoApp, crearOrganizacion } from "../../fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  crearPrismaDeTestConEspia,
  parametrosDe,
  type EventoSqlDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SL-18 T5.3 — los indices de rutas calientes (migracion `20261026090100_indices_rutas_calientes`)
// contra Postgres real: R24 y R25. T5.4 suma los de la ampliacion
// (`20261026090200_indices_ordenes_gestiones_historial`): el listado de ordenes, la ventana
// intradia de gestiones y el listado del historial de acciones.
//
// QUE SE MIDE. La consulta es la REAL: se captura el SQL que emite cada repositorio por el cliente
// de la app (la extension pone `organizacion_id = $n`) y se le hace `EXPLAIN` tal cual. Si el test
// escribiera el SQL a mano, probaria que un SQL inventado usa el indice, no el de produccion.
//
// COMO. Dos empresas, A y B, con el mismo volumen (salvo el rollup: SLT-76 R14), sembradas en una transaccion que siempre se
// revierte. Las filas son sinteticas: `session_replication_role = replica` apaga las FK y los
// triggers, que no cambian el plan y obligarian a sembrar catalogos enteros (patron de
// `dos-empresas-entradas.test.ts`). Despues `ANALYZE`, y el `EXPLAIN` corre como `servi_app` con la
// empresa A fijada, igual que la envoltura de la app. Sin `enable_seqscan = off`: con este volumen
// el planificador elige por coste entre el compuesto, el de solo `organizacion_id` y, en el rollup,
// el unico del grano (fecha primero). Si el compuesto falta o no sirve, el plan nombra otro (medido
// en la mutacion de la bitacora).
//
// R25 es la busqueda del login: corre en `comoPlataforma`, sin empresa ni RLS, como dueno.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** Empresa con la que se captura el SQL; en el `EXPLAIN` se cambia por la de A. */
const EMPRESA_DE_CAPTURA = "sl18-t53-captura";

/** Filas por empresa. Con menos, el planificador prefiere leer la tabla entera y no hay nada que medir. */
const EJECUCIONES = 2000;
const TARIFAS = 1000;
const CUBOS_POR_DIA = 10;
/**
 * SLT-76 R14: cubos por dia de la empresa B DENTRO del rango consultado (junio de 2000). Con 10× los
 * de A, el unico del grano (fecha primero) lee 11× lo que lee el compuesto, y el de solo
 * `organizacion_id` lee las 366 jornadas de A (12×). Con el mismo volumen en las dos (2×), la
 * estadistica de una base acumulada daba vuelta el plan (m7 de SLT-75).
 */
const CUBOS_POR_DIA_B_EN_RANGO = 100;
const USUARIOS = 500;
/** Ordenes, gestiones y filas del historial por empresa (una gestion por orden). */
const ORDENES = 4000;

/** Fechas fuera de lo que tiene cualquier base de desarrollo: el corpus es lo unico en rango. */
const DESDE_ROLLUP = "2000-06-01";
const HASTA_ROLLUP = "2000-06-30";
const AHORA = new Date("2000-07-01T12:00:00Z");
/** Un dia de la ventana intradia, dentro del corpus de gestiones (una cada 15 min por empresa). */
const VENTANA_INTRADIA = {
  desde: new Date("2000-01-20T06:00:00Z"),
  hasta: new Date("2000-01-21T06:00:00Z"),
};

interface Ruta {
  /** Nombre del indice que la migracion crea. */
  indice: string;
  tabla: string;
  /** Columnas tal como las devuelve `pg_indexes.indexdef`. */
  columnas: string;
  /** Predicado del indice parcial, tal como lo devuelve `pg_indexes.indexdef`; `null` si no es parcial. */
  predicado?: string;
  /**
   * Quien pone la empresa en la consulta: la extension (`organizacion_id = $n` en el SQL) o la RLS
   * (SQL a mano: la condicion la añade la policy de `servi_app` y solo se ve en el plan).
   */
  empresaPor?: "extension" | "rls";
  /** De donde sale la consulta (archivo y metodo). */
  origen: string;
  capturar: (app: PrismaClient) => Promise<unknown>;
  /** Cual de las consultas capturadas sobre la tabla es la que se mide. */
  esLaConsulta: (sql: string) => boolean;
}

const conPagina = (sql: string) => /LIMIT/.test(sql) && !sql.includes("COUNT(");

function consultaDelMaestro(desde: string, hasta: string): ConsultaAnalitica {
  const r = prepararConsultaAnalitica(
    { rango: "personalizado", desde, hasta },
    { usuarioId: "u-maestro-sl18", rol: "maestro" },
    "entregas",
    AHORA,
  );
  if (r.status !== "ok") throw new Error(`preparacion no concedida: ${JSON.stringify(r)}`);
  return r.consulta;
}

const RUTAS: readonly Ruta[] = [
  {
    indice: "tarifas_organizacion_id_created_at_idx",
    tabla: "tarifas",
    columnas: "organizacion_id, created_at",
    origen: "TarifaRepository.list",
    capturar: (app) => new TarifaRepository(app).list({ skip: 0, take: 25 }),
    esLaConsulta: conPagina,
  },
  {
    indice: "whatsapp_envio_ejecucion_organizacion_id_created_at_idx",
    tabla: "whatsapp_envio_ejecucion",
    columnas: "organizacion_id, created_at DESC",
    origen: "WhatsappEjecucionRepository.historial",
    capturar: (app) => new WhatsappEjecucionRepository(app).historial({ page: 1, pageSize: 25 }),
    esLaConsulta: conPagina,
  },
  {
    indice: "analytics_daily_organizacion_id_fecha_idx",
    tabla: "analytics_daily",
    columnas: "organizacion_id, fecha",
    origen: "AnaliticaOperativaRollupRepository.agregarCubos",
    capturar: (app) =>
      new AnaliticaOperativaRollupRepository(app).agregarCubos(
        consultaDelMaestro(DESDE_ROLLUP, HASTA_ROLLUP),
        ["zona"],
      ),
    esLaConsulta: (sql) => sql.includes("GROUP BY"),
  },
  // T5.4 — la ampliacion (decision de Camilo, 2026-10-26).
  {
    // El orden por defecto de `/ordenes`: `prioridad DESC, created_at DESC, id`. El indice es
    // parcial con el mismo `deleted_at IS NULL` de la consulta.
    indice: "orden_organizacion_id_prioridad_created_at_id_idx",
    tabla: "orden",
    columnas: "organizacion_id, prioridad DESC, created_at DESC, id",
    predicado: "deleted_at IS NULL",
    origen: "OrdenRepository.list",
    capturar: (app) =>
      new OrdenRepository(app).list({ where: {}, sortBy: "created_at", sortDir: "desc", skip: 0, take: 25 }),
    esLaConsulta: (sql) => conPagina(sql) && sql.includes('"prioridad" DESC'),
  },
  {
    // SQL a mano: la empresa la pone la RLS, no la extension.
    indice: "gestion_orden_organizacion_id_created_at_idx",
    tabla: "gestion_orden",
    columnas: "organizacion_id, created_at",
    empresaPor: "rls",
    origen: "AnaliticaOperativaVivaRepository.contarGestionesVigentes",
    capturar: (app) =>
      new AnaliticaOperativaVivaRepository(app).cubosDelDiaEnCurso(
        consultaDelMaestro(DESDE_ROLLUP, HASTA_ROLLUP),
        VENTANA_INTRADIA,
      ),
    esLaConsulta: (sql) => sql.includes("AS entregas"),
  },
  {
    indice: "historial_accion_organizacion_id_created_at_id_idx",
    tabla: "historial_accion",
    columnas: "organizacion_id, created_at DESC, id",
    origen: "HistorialAccionRepository.list",
    capturar: (app) =>
      new HistorialAccionRepository(app).list({
        filtro: { q: null, actorId: null, accion: null, entidadTipo: null, desde: null, hasta: null },
        orden: { sortBy: "created_at", sortDir: "desc" },
        page: 1,
        pageSize: 25,
      }),
    esLaConsulta: conPagina,
  },
];

/**
 * Siembra A y B con el mismo volumen en cada tabla medida, salvo `analytics_daily` en el rango del
 * rollup (ver `CUBOS_POR_DIA_B_EN_RANGO`). Corre como dueno, en modo replica.
 *
 * Las filas de A y de B se INTERCALAN en el tiempo y en disco (`ORDER BY g, e.org`), como en
 * produccion, donde las dos empresas escriben el mismo dia. Sembrar primero toda A y luego toda B
 * deja cada empresa en paginas contiguas, abarata de mas el indice de solo `organizacion_id` y el
 * plan cambiaba entre corridas (medido: la consulta del rollup salio una vez por ese indice).
 */
async function sembrarDosEmpresas(tx: TxDeTest, a: string, b: string): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
  const empresas = [a, b];
  const sembrar = (sql: string, filas: number) => tx.$executeRawUnsafe(sql, empresas, filas);
  await sembrar(
    `INSERT INTO whatsapp_envio_ejecucion (id, envio_id, origen, solicitada_por, updated_at, created_at, organizacion_id)
     SELECT gen_random_uuid()::text, 'e' || (g % 10), 'prueba', 'u', now(),
       timestamp '2000-01-01' + g * interval '2 hours', e.org
     FROM generate_series(1, $2::int) g, unnest($1::text[]) e(org) ORDER BY g, e.org`,
    EJECUCIONES,
  );
  await sembrar(
    `INSERT INTO tarifas (id, zona_id, tienda_id, valor_flete, valor_flete_devuelto, valor_flete_gam,
       valor_flete_devuelto_gam, comision_cod, iva_flete, iva_comision_cod, updated_at, created_at, organizacion_id)
     SELECT gen_random_uuid()::text, 'z' || g, 't', 1, 1, 1, 1, 1, 1, 1, now(),
       timestamp '2000-01-01' + g * interval '3 hours', e.org
     FROM generate_series(1, $2::int) g, unnest($1::text[]) e(org) ORDER BY g, e.org`,
    TARIFAS,
  );
  // El unico del grano no lleva la empresa: la zona la distingue.
  // SLT-76 R14 (corpus decisivo): A siembra `CUBOS_POR_DIA` las 366 jornadas; B, lo mismo fuera
  // del rango consultado y `CUBOS_POR_DIA_B_EN_RANGO` dentro. Las dos empresas son nuevas y el rango
  // es del año 2000, asi que los tres indices candidatos solo ven filas de este corpus.
  await tx.$executeRawUnsafe(
    `INSERT INTO analytics_daily (id, fecha, zona_id, tienda_id, estatus_id, updated_at, organizacion_id)
     SELECT gen_random_uuid()::text, date '2000-01-01' + d, 'z-' || e.org || '-' || k, 't', 'e', now(), e.org
     FROM generate_series(0, 365) d, generate_series(1, $3::int) k, unnest($1::text[]) e(org)
     WHERE k <= CASE
         WHEN e.org = $4 AND date '2000-01-01' + d BETWEEN $5::date AND $6::date THEN $3::int
         ELSE $2::int
       END
     ORDER BY d, e.org, k`,
    empresas,
    CUBOS_POR_DIA,
    CUBOS_POR_DIA_B_EN_RANGO,
    b,
    DESDE_ROLLUP,
    HASTA_ROLLUP,
  );
  // R25: las dos empresas comparten los emails (R1 lo permite): el login encuentra dos cuentas.
  await sembrar(
    `INSERT INTO usuario (id, nombre, email, telefono, password_hash, cedula, tipo_identificacion_id, rol_id,
       updated_at, organizacion_id)
     SELECT gen_random_uuid()::text, 'u', 'sl18-t53-' || g || '@ejemplo.test', '8', 'h', 'c-' || g, 'ti', 'rol',
       now(), e.org
     FROM generate_series(1, $2::int) g, unnest($1::text[]) e(org) ORDER BY g, e.org`,
    USUARIOS,
  );
  // T5.4: ordenes con prioritarias (1 de cada 20) y borradas (1 de cada 25), como en el listado
  // real; la tienda va por empresa para no chocar con el unico `(tienda_id, num_remision)`.
  await sembrar(
    `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id, provincia_id,
       canton_id, producto, updated_at, created_at, prioridad, deleted_at, organizacion_id)
     SELECT 'sl18-o-' || e.org || '-' || g, 'r' || g, 'e', 'd', '8', 't-' || e.org || '-' || (g % 50),
       'z-' || e.org || '-' || (g % 30), 'p', 'c', 'x', now(), timestamp '2000-01-01' + g * interval '15 minutes',
       g % 20 = 0, CASE WHEN g % 25 = 0 THEN now() END, e.org
     FROM generate_series(1, $2::int) g, unnest($1::text[]) e(org) ORDER BY g, e.org`,
    ORDENES,
  );
  // La consulta intradia cruza la gestion con el estado de su orden al corte.
  await tx.$executeRawUnsafe(
    `INSERT INTO orden_historial_estado (id, orden_id, estatus_destino_id, origen_tipo, created_at, organizacion_id)
     SELECT 'h-' || o.id, o.id, o.estatus_id, (enum_range(NULL::orden_historial_origen_tipo))[1], o.created_at,
       o.organizacion_id
     FROM orden o WHERE o.organizacion_id = ANY($1::text[])`,
    empresas,
  );
  await sembrar(
    `INSERT INTO gestion_orden (id, orden_id, mensajero_id, resultado, created_at, organizacion_id)
     SELECT 'sl18-g-' || e.org || '-' || g, 'sl18-o-' || e.org || '-' || g, 'm' || (g % 20),
       (CASE WHEN g % 3 = 0 THEN 'novedad' ELSE 'entregado' END)::gestion_resultado,
       timestamp '2000-01-01' + g * interval '15 minutes' + interval '1 hour', e.org
     FROM generate_series(1, $2::int) g, unnest($1::text[]) e(org) ORDER BY g, e.org`,
    ORDENES,
  );
  await sembrar(
    `INSERT INTO historial_accion (id, accion, entidad_tipo, entidad_id, entidad_etiqueta, lote_id, created_at,
       organizacion_id)
     SELECT 'sl18-ha-' || e.org || '-' || g, 'orden_eliminada', 'orden', 'ent' || g, 'et', 'l' || g,
       timestamp '2000-01-01' + g * interval '15 minutes', e.org
     FROM generate_series(1, $2::int) g, unnest($1::text[]) e(org) ORDER BY g, e.org`,
    ORDENES,
  );
  // SLT-76 R14: con el objetivo de estadistica al maximo, la muestra de una tabla grande (base
  // acumulada) no deja fuera las filas del corpus. `SET LOCAL`: se revierte con lo demas.
  await tx.$executeRawUnsafe(`SET LOCAL default_statistics_target = 10000`);
  for (const tabla of [
    "whatsapp_envio_ejecucion",
    "tarifas",
    "analytics_daily",
    "usuario",
    "orden",
    "orden_historial_estado",
    "gestion_orden",
    "historial_accion",
  ]) {
    // Sin estadisticas frescas el planificador cree que la tabla tiene el tamano de antes.
    await tx.$executeRawUnsafe(`ANALYZE ${tabla}`);
  }
}

async function explicar(tx: TxDeTest, evento: EventoSqlDeTest, empresa: string | null): Promise<string> {
  const params = parametrosDe(evento).map((p) => (p === EMPRESA_DE_CAPTURA ? empresa : p));
  const filas = await tx.$queryRawUnsafe<Record<string, string>[]>(`EXPLAIN ${evento.query}`, ...params);
  return filas.map((f) => Object.values(f)[0]).join("\n");
}

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

describeSiHayBase("SL-18 R24/R25 — indices de rutas calientes, contra Postgres real", () => {
  let prisma: PrismaClient;
  const sqlDe = new Map<string, EventoSqlDeTest>();
  const planDe = new Map<string, string>();
  let sqlLogin: EventoSqlDeTest | undefined;
  let planLogin = "";
  let indices: { tablename: string; indexname: string; indexdef: string }[] = [];

  beforeAll(async () => {
    const espia = crearPrismaDeTestConEspia();
    prisma = espia.prisma;
    const app = conAislamientoPorEmpresa(prisma, async () => null);

    // 1. El SQL real, por el cliente de la app.
    for (const ruta of RUTAS) {
      espia.eventos.length = 0;
      await conEmpresa(EMPRESA_DE_CAPTURA, () => ruta.capturar(app));
      // El evento `query` llega por callback: se cede el turno antes de leer la lista.
      await new Promise((r) => setTimeout(r, 30));
      const evento = espia.eventos.find((e) => e.query.includes(`"${ruta.tabla}"`) && ruta.esLaConsulta(e.query));
      if (evento) sqlDe.set(ruta.indice, evento);
    }
    espia.eventos.length = 0;
    await comoPlataforma("SL-18", "test R25: la busqueda del login", () =>
      new UserRepository(app).findCuentasPorEmailConHash("sl18-t53-7@ejemplo.test"),
    );
    await new Promise((r) => setTimeout(r, 30));
    sqlLogin = espia.eventos.find((e) => /FROM "public"\."usuario"/.test(e.query) && e.query.includes('"email" = $'));

    indices = await prisma.$queryRawUnsafe(
      `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    );

    // 2. Los planes, con A y B sembradas, en una transaccion que se revierte.
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
          const a = (await crearOrganizacion(tx)).id;
          const b = (await crearOrganizacion(tx)).id;
          await sembrarDosEmpresas(tx, a, b);
          await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = origin`);
          if (sqlLogin) planLogin = await explicar(tx, sqlLogin, null);
          await comoApp(tx, a);
          for (const [indice, evento] of sqlDe) planDe.set(indice, await explicar(tx, evento, a));
          throw new Revertir(null);
        },
        { timeout: 120_000, maxWait: 30_000 },
      );
    } catch (e) {
      if (!(e instanceof Revertir)) throw e;
    }
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("R24: cada indice elegido existe con `organizacion_id` primero", () => {
    it.each(RUTAS.map((r) => [r.indice, r]))("%s", (_nombre, ruta) => {
      const fila = indices.find((i) => i.indexname === ruta.indice);
      expect(fila, `${ruta.indice} no esta en pg_indexes: corre las migraciones`).toBeDefined();
      expect(fila!.tablename).toBe(ruta.tabla);
      const forma = /USING btree \((.*?)\)(?: WHERE \((.*)\))?$/.exec(fila!.indexdef);
      expect(forma?.[1], `${ruta.indice} no lleva organizacion_id primero: ${fila!.indexdef}`).toBe(ruta.columnas);
      // Un parcial que pierde su `WHERE` (p. ej. recreado desde el datamodel) deja de ser el de la consulta.
      expect(forma?.[2] ?? null, `predicado de ${ruta.indice}: ${fila!.indexdef}`).toBe(ruta.predicado ?? null);
    });
  });

  describe("R24: con dos empresas sembradas, el plan de la consulta real nombra su indice", () => {
    it.each(RUTAS.map((r) => [`${r.origen} -> ${r.indice}`, r]))("%s", (_nombre, ruta) => {
      expect(sqlDe.get(ruta.indice), `no se capturo el SQL de ${ruta.origen}`).toBeDefined();
      const plan = planDe.get(ruta.indice) ?? "";
      // La consulta real lleva la empresa: si no, el indice compuesto no tendria por donde entrar.
      if (ruta.empresaPor === "rls") {
        // SQL a mano: la empresa no esta en el texto, la pone la policy y entra al indice.
        expect(sqlDe.get(ruta.indice)!.query).not.toContain('"organizacion_id" = $');
        expect(plan, plan).toMatch(/Index Cond: \(\(organizacion_id = NULLIF\(current_setting\('app\.organizacion_id'/);
      } else {
        expect(sqlDe.get(ruta.indice)!.query).toContain('"organizacion_id" = $');
      }
      expect(plan, `el plan de ${ruta.origen} no usa ${ruta.indice}:\n${plan}`).toContain(ruta.indice);
    });
  });

  describe("R25: la busqueda por email del login, sin empresa", () => {
    it("va por `usuario_email_idx` y no recorre la tabla", () => {
      expect(sqlLogin, "no se capturo el SQL de findCuentasPorEmailConHash").toBeDefined();
      // Sin empresa: el SQL no filtra por `organizacion_id`.
      expect(sqlLogin!.query).not.toContain('"organizacion_id" = $');
      expect(planLogin, `el login no usa usuario_email_idx:\n${planLogin}`).toContain("usuario_email_idx");
      expect(planLogin, planLogin).not.toMatch(/Seq Scan on usuario\b/);
    });
  });
});
