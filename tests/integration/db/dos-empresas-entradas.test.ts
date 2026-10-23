import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { MODELOS_DE_NEGOCIO } from "@/lib/db/modelos-de-negocio";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { ApiKeyRepository } from "@/lib/repositories/ApiKeyRepository";
import { ApiKeyService } from "@/lib/services/ApiKeyService";
import type { IEtiquetasDescargaService } from "@/lib/interfaces/services/IEtiquetasDescargaService";
import { handleCorteDiario } from "@/app/api/cron/corte-diario/route";
import { handleGenerarGastosFijos } from "@/app/api/cron/generar-gastos-fijos/route";
import { handleLiberarReprogramadas } from "@/app/api/cron/liberar-reprogramadas/route";
import { handleProcesarDevueltasSla } from "@/app/api/cron/procesar-devueltas-sla/route";
import { handleSnapshotRanking } from "@/app/api/cron/snapshot-ranking/route";
import { handleProcesarJobs } from "@/app/api/cron/procesar-jobs/route";
import { handleCargaApi } from "@/app/api/ordenes/api-key/carga/route";
import { handleListadoApi } from "@/app/api/ordenes/api-key/route";
import { handleConsultaOrdenApi } from "@/app/api/ordenes/api-key/orden/[id]/route";
import { handleCancelarApi } from "@/app/api/ordenes/api-key/[numGuia]/cancelar/route";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

import { datosDeOrganizacionDePrueba, fijarEmpresa } from "../../fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SL-17 / T3.8 (design §7.9, D20; R16, R42, R13) — las entradas SIN sesión TRABAJAN con dos
// empresas con datos, cada una en la suya. «B no ve A» no basta: un cron que solo corriera en la
// primera empresa, o un drenador que ejecutara todo en plataforma, pasarian los tests de fuga.
//
// Se ejercita el codigo REAL contra Postgres: las rutas (`handle*`), sus composition roots y el
// singleton extendido de `getPrismaClient()`. Solo se inyecta lo externo: el secreto del cron, el
// reloj y el storage de etiquetas. La unica dependencia «interna» que se inyecta es `empresas`, y
// llama al `organizacion.findMany` REAL: se acota a A y B porque la base de CI es compartida, y un
// cron que recorriera las empresas de otros archivos les cambiaria los datos a mitad de su test.
//
// Las rutas abren sus propias transacciones, asi que nada cabe en una transaccion revertida: todo
// se commitea con marcas de esta ejecucion y se borra en `afterAll`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const SECRETO = `secreto-cron-${RUN}`;

// Reloj del drenador: muy en el pasado, para que el reclamo (`run_after <= now`) solo alcance los
// jobs que este archivo encola con ese `run_after`, y no los que otros dejen pendientes en la base.
const T0_JOBS = new Date("2001-01-01T18:00:00.000Z");
const RELOJ_JOBS = () => new Date(T0_JOBS.getTime() + 60_000);
// Fecha de reprogramacion anterior a cualquier «hoy» que use este archivo (reloj real o T0_JOBS).
const REPROGRAMADA_PARA = new Date("2000-12-01T00:00:00.000Z");

interface Empresa {
  id: string;
  etiqueta: string;
  tiendaId: string;
  mensajeroId: string;
  maestroId: string;
  zonaId: string;
  provinciaId: string;
  cantonId: string;
  /** Distrito de Cartago que cubre la zona de la empresa (uno distinto en A y en B, ver R13). */
  distrito: string;
}

let base: PrismaClient;
let app: PrismaClient;
let A: Empresa;
let B: Empresa;
const jobsEncolados: string[] = [];

function peticionCron(url: string): Request {
  return new Request(url, { headers: { authorization: `Bearer ${SECRETO}` } });
}

/** La lista real de organizaciones, acotada a las de este archivo (ver cabecera). */
function soloAyB(): ClienteDeOrganizaciones {
  const permitidas = new Set([A.id, B.id]);
  const real = app as unknown as ClienteDeOrganizaciones;
  return {
    organizacion: {
      findMany: async (args) => (await real.organizacion.findMany(args)).filter((o) => permitidas.has(o.id)),
    },
  };
}

/** Escritura de siembra con la empresa fijada; el `DEFAULT` pone `organizacion_id` en cada fila. */
async function enEmpresa<T>(organizacionId: string, fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  return base.$transaction(
    async (tx) => {
      // Primera sentencia: serializa con los tests que escriben en `usuario`/`orden` (feature 227).
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
      await fijarEmpresa(tx, organizacionId);
      return fn(tx);
    },
    { timeout: 30_000, maxWait: 15_000 },
  );
}

async function estatusId(tx: TxDeTest, value: string): Promise<string> {
  const fila = await tx.orderStatus.findUnique({ where: { value }, select: { id: true } });
  if (fila === null) throw new Error(`falta el estado «${value}»: corre \`pnpm run db:seed\``);
  return fila.id;
}

async function sembrarEmpresa(etiqueta: string, distritoNombre: string): Promise<Empresa> {
  const org = await base.organizacion.create({
    data: datosDeOrganizacionDePrueba(`T38 ${etiqueta} ${RUN}`),
    select: { id: true },
  });
  return enEmpresa(org.id, async (tx) => {
    const fks = await crearFksDeOrden(tx);
    const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
    await tx.usuario.update({ where: { id: mensajero.id }, data: { zonaId: fks.zonaId } });
    const maestro = await crearUsuarioDePrueba(tx, "maestro");
    // La carga por API resuelve la zona por `zona_distrito` y la tarifa por la cascada (nivel 3:
    // tarifa de la zona, sin tienda). Las dos son de la empresa: sin ellas la carga no crea nada.
    const distrito = await tx.distrito.findFirst({
      where: { cantonId: fks.cantonId, nombre: distritoNombre },
      select: { id: true },
    });
    if (distrito === null) throw new Error(`falta el distrito ${distritoNombre} de Cartago: corre las migraciones`);
    await tx.zonaDistrito.create({ data: { zonaId: fks.zonaId, distritoId: distrito.id } });
    await tx.tarifa.create({
      data: {
        zonaId: fks.zonaId,
        tiendaId: null,
        valorFlete: "3.50",
        valorFleteDevuelto: "1.00",
        valorFleteGam: "5.00",
        valorFleteDevueltoGam: "2.00",
        comisionCod: "5.00",
        ivaFlete: "12.00",
        ivaComisionCod: "12.00",
      },
    });
    return {
      id: org.id,
      etiqueta,
      tiendaId: fks.tiendaId,
      mensajeroId: mensajero.id,
      maestroId: maestro.id,
      zonaId: fks.zonaId,
      provinciaId: fks.provinciaId,
      cantonId: fks.cantonId,
      distrito: distritoNombre,
    };
  });
}

async function sembrarOrden(
  e: Empresa,
  estado: string,
  extra: { mensajeroAsignado?: boolean } = {},
): Promise<string> {
  return enEmpresa(e.id, async (tx) => {
    const orden = await tx.orden.create({
      data: {
        numRemision: `T38-${e.etiqueta}-${randomUUID().slice(0, 8)}`,
        destinatario: `Destino ${e.etiqueta}`,
        telefonoDest: "88880000",
        producto: "Caja",
        estatusId: await estatusId(tx, estado),
        tiendaId: e.tiendaId,
        zonaId: e.zonaId,
        provinciaId: e.provinciaId,
        cantonId: e.cantonId,
        montoCobrar: 0,
        ...(extra.mensajeroAsignado ? { mensajeroAsignadoId: e.mensajeroId, asignadoAt: new Date() } : {}),
      },
      select: { id: true },
    });
    return orden.id;
  });
}

/** Una orden reprogramada para una fecha ya pasada: liberable por el reloj (feature 46). */
async function sembrarReprogramada(e: Empresa): Promise<string> {
  const ordenId = await sembrarOrden(e, "reprogramado");
  await enEmpresa(e.id, (tx) =>
    tx.gestionOrden.create({
      data: {
        ordenId,
        mensajeroId: e.mensajeroId,
        resultado: "reprogramado",
        motivo: "El cliente pide otro dia",
        fechaReprogramacion: REPROGRAMADA_PARA,
      },
    }),
  );
  return ordenId;
}

async function estadoDe(ordenId: string): Promise<string> {
  const o = await base.orden.findUniqueOrThrow({
    where: { id: ordenId },
    select: { estatus: { select: { value: true } } },
  });
  return o.estatus.value;
}

/** Las filas de historial que dejo un origen sobre esas ordenes, con su empresa. */
async function historialDe(ordenIds: string[], origenTipo: string) {
  return base.ordenHistorialEstado.findMany({
    where: { ordenId: { in: ordenIds }, origenTipo: origenTipo as never },
    select: { ordenId: true, organizacionId: true },
  });
}

async function jobPorId(id: string) {
  const filas = await base.$queryRawUnsafe<{ estado: string; organizacion_id: string | null }[]>(
    `SELECT "estado"::text AS estado, "organizacion_id" FROM "jobs" WHERE "id" = $1`,
    id,
  );
  return filas[0] ?? null;
}

async function encolarLiberar(): Promise<string> {
  const job = await new JobRepository(app).enqueue("liberar_reprogramadas", {}, { runAfter: T0_JOBS });
  if (job === null) throw new Error("el encolado no devolvio fila");
  jobsEncolados.push(job.id);
  return job.id;
}

async function drenar() {
  const res = await handleProcesarJobs(peticionCron("http://localhost/api/cron/procesar-jobs"), {
    getSecret: () => SECRETO,
    now: RELOJ_JOBS,
    empresas: soloAyB(),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { procesados: number; ok: number; fallidos: number };
}

/** Borra todo lo de A y B. Las FK `RESTRICT` y los triggers se saltan en modo replica. */
async function limpiar(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
        for (const { tabla } of MODELOS_DE_NEGOCIO) {
          await tx.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, ids);
        }
        await tx.$executeRawUnsafe(
          `DELETE FROM "jobs" WHERE "organizacion_id" = ANY($1::text[]) OR "id" = ANY($2::text[])
             OR ("tipo" = 'liberar_reprogramadas' AND "run_after" < '2002-01-01')`,
          ids,
          jobsEncolados,
        );
        await tx.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE "id" = ANY($1::text[])`, ids);
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    // Sin permiso para el modo replica quedan filas de A y B: no rompe otros tests (ninguno las
    // conoce), pero se dice para que no pase desapercibido.
    console.warn("[dos-empresas-entradas] limpieza incompleta:", error);
  }
}

describeSiHayBase("SL-17 — entradas sin sesion con dos empresas con datos (Postgres real)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);
    // Distritos distintos, para que cada caso mida una sola cosa. Que las dos puedan cubrir el
    // MISMO distrito lo prueba el ultimo caso de R13.
    A = await sembrarEmpresa("A", "Carmen");
    B = await sembrarEmpresa("B", "Occidental");
  }, 60_000);

  afterAll(async () => {
    await limpiar([A?.id, B?.id].filter((x): x is string => typeof x === "string"));
    await base?.$disconnect();
  }, 60_000);

  /* ------------------------------------------------------------------------------------------ */
  /* R16 — crons                                                                                 */
  /* ------------------------------------------------------------------------------------------ */

  it("R16 corte-diario: un cierre vencido en cada empresa, cada uno con la suya, y el resumen cuenta las dos", async () => {
    const ordenA = await sembrarOrden(A, "en_reparto", { mensajeroAsignado: true });
    const ordenB = await sembrarOrden(B, "en_reparto", { mensajeroAsignado: true });

    const res = await handleCorteDiario(peticionCron("http://localhost/api/cron/corte-diario"), {
      getSecret: () => SECRETO,
      empresas: soloAyB(),
    });

    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo).toMatchObject({ vencidosCreados: 2, mensajerosEvaluados: 2, empresas: { procesadas: 2, fallidas: [] } });
    const cierres = await base.cierreDia.findMany({
      where: { mensajeroId: { in: [A.mensajeroId, B.mensajeroId] }, estado: "vencido" },
      select: { mensajeroId: true, organizacionId: true, destinoZonaId: true },
    });
    expect(cierres).toHaveLength(2);
    expect(cierres.find((c) => c.mensajeroId === A.mensajeroId)).toMatchObject({ organizacionId: A.id, destinoZonaId: A.zonaId });
    expect(cierres.find((c) => c.mensajeroId === B.mensajeroId)).toMatchObject({ organizacionId: B.id, destinoZonaId: B.zonaId });
    // El barrido de las que quedaron en reparto tambien corrio en cada empresa.
    expect(await estadoDe(ordenA)).not.toBe("en_reparto");
    expect(await estadoDe(ordenB)).not.toBe("en_reparto");
  }, 60_000);

  it("R16 generar-gastos-fijos: un egreso en cada empresa, con su empresa, y el resumen cuenta las dos", async () => {
    const hoy = new Date();
    const fecha = fechaCalendarioCR(hoy);
    const plantilla = async (e: Empresa) =>
      enEmpresa(e.id, (tx) =>
        tx.gastoFijoPlantilla.create({
          data: {
            concepto: `Alquiler ${e.etiqueta} ${RUN}`,
            monto: "100.00",
            periodicidadUnidad: "dias",
            periodicidadCantidad: 1,
            fechaCobro: new Date(`${fecha}T00:00:00.000Z`),
            requiereAprobacion: false,
          },
          select: { id: true },
        }),
      );
    const pA = await plantilla(A);
    const pB = await plantilla(B);

    const res = await handleGenerarGastosFijos(peticionCron("http://localhost/api/cron/generar-gastos-fijos"), {
      getSecret: () => SECRETO,
      now: () => hoy,
      empresas: soloAyB(),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      plantillasActivas: 2,
      egresosGenerados: 2,
      empresas: { procesadas: 2, fallidas: [] },
    });
    const movs = await base.walletMovimiento.findMany({
      where: { origenId: { in: [`${pA.id}:${fecha}`, `${pB.id}:${fecha}`] } },
      select: { origenId: true, organizacionId: true },
    });
    expect(movs).toHaveLength(2);
    expect(movs.find((m) => m.origenId?.startsWith(pA.id))?.organizacionId).toBe(A.id);
    expect(movs.find((m) => m.origenId?.startsWith(pB.id))?.organizacionId).toBe(B.id);
  }, 60_000);

  it("R16 generar-gastos-fijos: un fallo provocado en A no impide que B termine, y A sale en `fallidas`", async () => {
    // Un dia despues del caso anterior: las plantillas diarias vuelven a disparar.
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const fecha = fechaCalendarioCR(manana);
    // El fallo: un cobro pendiente con monto 0 viola `CHECK (monto > 0)` de `gasto_fijo_cobro`, y la
    // corrida de A entera se revierte (una transaccion por corrida, ficha 333).
    await enEmpresa(A.id, (tx) =>
      tx.gastoFijoPlantilla.create({
        data: {
          concepto: `Rota ${RUN}`,
          monto: "0.00",
          periodicidadUnidad: "dias",
          periodicidadCantidad: 1,
          fechaCobro: new Date(`${fecha}T00:00:00.000Z`),
          requiereAprobacion: true,
        },
      }),
    );

    const res = await handleGenerarGastosFijos(peticionCron("http://localhost/api/cron/generar-gastos-fijos"), {
      getSecret: () => SECRETO,
      now: () => manana,
      empresas: soloAyB(),
    });

    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.empresas).toEqual({ procesadas: 1, fallidas: [A.id] });
    expect(cuerpo.egresosGenerados).toBe(1);
    const delDia = await base.walletMovimiento.findMany({
      where: { categoria: "egreso_gasto_fijo", origenId: { endsWith: `:${fecha}` }, organizacionId: { in: [A.id, B.id] } },
      select: { organizacionId: true },
    });
    expect(delDia.map((m) => m.organizacionId)).toEqual([B.id]);
  }, 60_000);

  it("R16 liberar-reprogramadas: libera la reprogramada de cada empresa y el historial lleva la suya", async () => {
    const oA = await sembrarReprogramada(A);
    const oB = await sembrarReprogramada(B);

    const res = await handleLiberarReprogramadas(peticionCron("http://localhost/api/cron/liberar-reprogramadas"), {
      getSecret: () => SECRETO,
      empresas: soloAyB(),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ evaluadas: 2, liberadas: 2, empresas: { procesadas: 2, fallidas: [] } });
    expect(await estadoDe(oA)).toMatch(/^en_bodega_/);
    expect(await estadoDe(oB)).toMatch(/^en_bodega_/);
    const historial = await historialDe([oA, oB], "liberacion_reprogramada");
    expect(historial).toHaveLength(2);
    expect(historial.find((h) => h.ordenId === oA)?.organizacionId).toBe(A.id);
    expect(historial.find((h) => h.ordenId === oB)?.organizacionId).toBe(B.id);
  }, 60_000);

  it("R16 procesar-devueltas-sla: libera la devuelta vencida de cada empresa, cada una en la suya", async () => {
    const devuelta = async (e: Empresa) => {
      const ordenId = await sembrarOrden(e, "novedad");
      await enEmpresa(e.id, (tx) =>
        tx.gestionOrden.create({
          data: {
            ordenId,
            mensajeroId: e.mensajeroId,
            resultado: "novedad",
            causaDevolucion: "not_found",
            motivo: "No estaba",
          },
        }),
      );
      return ordenId;
    };
    const oA = await devuelta(A);
    const oB = await devuelta(B);

    const res = await handleProcesarDevueltasSla(peticionCron("http://localhost/api/cron/procesar-devueltas-sla"), {
      getSecret: () => SECRETO,
      // Lejos de la ventana de reintento de `not_found`: las dos vencen.
      now: () => new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
      empresas: soloAyB(),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ liberadas: 2, empresas: { procesadas: 2, fallidas: [] } });
    expect(await estadoDe(oA)).toMatch(/^en_bodega_/);
    expect(await estadoDe(oB)).toMatch(/^en_bodega_/);
    const historial = await historialDe([oA, oB], "liberacion_devuelta_sla");
    expect(historial.find((h) => h.ordenId === oA)?.organizacionId).toBe(A.id);
    expect(historial.find((h) => h.ordenId === oB)?.organizacionId).toBe(B.id);
  }, 60_000);

  it("R16 snapshot-ranking: congela el dia en las dos empresas, cada cabecera con la suya", async () => {
    // Un dia lejano y propio de esta ejecucion: la cabecera es unica por (empresa, fecha).
    const dias = 3650 + Math.floor(Math.random() * 3650);
    const ahora = new Date(Date.UTC(2090, 0, 1, 18) + dias * 24 * 60 * 60 * 1000);

    const res = await handleSnapshotRanking(peticionCron("http://localhost/api/cron/snapshot-ranking"), {
      getSecret: () => SECRETO,
      now: () => ahora,
      empresas: soloAyB(),
    });

    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo).toMatchObject({ estado: "creado", empresas: { procesadas: 2, fallidas: [] } });
    const cabeceras = await base.rankingSnapshotDia.findMany({
      where: { fecha: new Date(`${cuerpo.fecha}T00:00:00.000Z`), organizacionId: { in: [A.id, B.id] } },
      select: { organizacionId: true },
    });
    expect(cabeceras.map((c) => c.organizacionId).sort()).toEqual([A.id, B.id].sort());
  }, 60_000);

  /* ------------------------------------------------------------------------------------------ */
  /* R42 — drenador                                                                              */
  /* ------------------------------------------------------------------------------------------ */

  it("R42: un job encolado en A guarda A, uno en B guarda B, y cada uno libera solo lo de su empresa", async () => {
    const oA = await sembrarReprogramada(A);
    const oB = await sembrarReprogramada(B);

    const jobA = await conEmpresa(A.id, () => encolarLiberar());
    expect((await jobPorId(jobA))?.organizacion_id).toBe(A.id);

    const r1 = await drenar();
    expect(r1).toMatchObject({ procesados: 1, ok: 1, fallidos: 0 });
    expect((await jobPorId(jobA))?.estado).toBe("done");
    // El job de A corrio con A en contexto: libero la de A y no toco la de B.
    expect(await estadoDe(oA)).toMatch(/^en_bodega_/);
    expect(await estadoDe(oB)).toBe("reprogramado");
    expect((await historialDe([oA], "liberacion_reprogramada"))[0]?.organizacionId).toBe(A.id);

    const jobB = await conEmpresa(B.id, () => encolarLiberar());
    expect((await jobPorId(jobB))?.organizacion_id).toBe(B.id);

    const r2 = await drenar();
    expect(r2).toMatchObject({ procesados: 1, ok: 1, fallidos: 0 });
    expect(await estadoDe(oB)).toMatch(/^en_bodega_/);
    expect((await historialDe([oB], "liberacion_reprogramada"))[0]?.organizacionId).toBe(B.id);
  }, 60_000);

  it("R42/R16: un job recurrente sin empresa itera las dos", async () => {
    const oA = await sembrarReprogramada(A);
    const oB = await sembrarReprogramada(B);

    const job = await comoPlataforma("SL-17", "test: job recurrente sin empresa", () => encolarLiberar());
    expect((await jobPorId(job))?.organizacion_id).toBeNull();

    const r = await drenar();
    expect(r).toMatchObject({ procesados: 1, ok: 1, fallidos: 0 });
    expect(await estadoDe(oA)).toMatch(/^en_bodega_/);
    expect(await estadoDe(oB)).toMatch(/^en_bodega_/);
    const historial = await historialDe([oA, oB], "liberacion_reprogramada");
    expect(historial.find((h) => h.ordenId === oA)?.organizacionId).toBe(A.id);
    expect(historial.find((h) => h.ordenId === oB)?.organizacionId).toBe(B.id);
  }, 60_000);

  /* ------------------------------------------------------------------------------------------ */
  /* R13 — API key                                                                               */
  /* ------------------------------------------------------------------------------------------ */

  describe("R13 — API key", () => {
    const keys: Record<string, string> = {};
    // El PDF de etiquetas va a Supabase Storage: es lo externo, y aqui no se mide.
    const sinStorage: IEtiquetasDescargaService = {
      generarYPersistir: async () => ({ consolidado: null, porOrden: new Map() }),
    };

    async function generarKey(e: Empresa): Promise<string> {
      const servicio = new ApiKeyService(new ApiKeyRepository(app));
      const r = await conEmpresa(e.id, () =>
        servicio.generar({ identificador: `t38 ${e.etiqueta} ${RUN}`, tiendaDestinoId: undefined }, {
          usuarioId: e.maestroId,
          rol: "maestro",
        }),
      );
      if (r.status !== "ok") throw new Error(`no se pudo sembrar la key de ${e.etiqueta}: ${r.status}`);
      return r.plainKey;
    }

    function conKey(e: Empresa, url: string, init: RequestInit = {}): Request {
      return new Request(url, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${keys[e.id]}` },
      });
    }

    async function cargar(e: Empresa): Promise<{ id: string; numGuia: number; organizacionId: string }> {
      const numRemision = `T38-API-${e.etiqueta}-${RUN}`;
      const res = await handleCargaApi(
        conKey(e, "http://localhost/api/ordenes/api-key/carga", {
          method: "POST",
          body: JSON.stringify({
            ordenes: [
              {
                num_remision: numRemision,
                destinatario: `Cliente ${e.etiqueta}`,
                telefono: "88887777",
                provincia: "Cartago",
                canton: "Cartago",
                distrito: e.distrito,
                producto: "Caja",
              },
            ],
          }),
        }),
        { descargaService: sinStorage },
      );
      const cuerpo = await res.json();
      expect(res.status, JSON.stringify(cuerpo)).toBe(200);
      expect(cuerpo.creadas, JSON.stringify(cuerpo)).toBe(1);
      const orden = await base.orden.findFirstOrThrow({
        where: { numRemision },
        select: { id: true, numGuia: true, organizacionId: true },
      });
      if (orden.numGuia === null) throw new Error("la carga por API no asigno num_guia");
      return { id: orden.id, numGuia: orden.numGuia, organizacionId: orden.organizacionId };
    }

    let ordenA: { id: string; numGuia: number; organizacionId: string };
    let ordenB: { id: string; numGuia: number; organizacionId: string };

    beforeAll(async () => {
      keys[A.id] = await generarKey(A);
      keys[B.id] = await generarKey(B);
    }, 60_000);

    it("R13: con la key de A se crea una orden y queda en A; con la de B, en B", async () => {
      ordenA = await cargar(A);
      ordenB = await cargar(B);
      expect(ordenA.organizacionId).toBe(A.id);
      expect(ordenB.organizacionId).toBe(B.id);
    }, 60_000);

    it("R13: con la key de B no se ve la orden de A (listado y consulta), y B si ve la suya", async () => {
      const listar = async (e: Empresa, numGuia: number) => {
        const res = await handleListadoApi(conKey(e, `http://localhost/api/ordenes/api-key?num_guia=${numGuia}`));
        expect(res.status).toBe(200);
        return ((await res.json()) as { items: { numGuia: number }[] }).items.map((i) => i.numGuia);
      };
      expect(await listar(B, ordenA.numGuia)).toEqual([]);
      expect(await listar(B, ordenB.numGuia)).toEqual([ordenB.numGuia]);
      expect(await listar(A, ordenA.numGuia)).toEqual([ordenA.numGuia]);

      const consultar = (e: Empresa, numGuia: number) =>
        handleConsultaOrdenApi(conKey(e, `http://localhost/api/ordenes/api-key/orden/${numGuia}`), String(numGuia));
      expect((await consultar(B, ordenA.numGuia)).status).toBe(404);
      expect((await consultar(A, ordenA.numGuia)).status).toBe(200);
    }, 60_000);

    it("R13: una key de B no puede cancelar la guia de A: 404 y la orden de A intacta", async () => {
      const antes = await base.orden.findUniqueOrThrow({
        where: { id: ordenA.id },
        select: { estatusId: true, updatedAt: true, organizacionId: true },
      });

      const res = await handleCancelarApi(
        conKey(B, `http://localhost/api/ordenes/api-key/${ordenA.numGuia}/cancelar`, { method: "PUT" }),
        String(ordenA.numGuia),
      );

      expect(res.status).toBe(404);
      const despues = await base.orden.findUniqueOrThrow({
        where: { id: ordenA.id },
        select: { estatusId: true, updatedAt: true, organizacionId: true },
      });
      expect(despues).toEqual(antes);
      // Control: con la key de A la misma guia SI se encuentra, asi que el 404 de B era por la
      // empresa. Recien cargada no esta en un estado cancelable (409, R20 de la 106): lo que se mide
      // es que el camino la ve, no que se pueda cancelar.
      const propia = await handleCancelarApi(
        conKey(A, `http://localhost/api/ordenes/api-key/${ordenA.numGuia}/cancelar`, { method: "PUT" }),
        String(ordenA.numGuia),
      );
      expect(propia.status).toBe(409);
    }, 60_000);

    // `OrdenRepository.findDistritosByCantonIds` lee `distrito` (plataforma) con su relacion
    // `zonas` (`zona_distrito`, negocio) anidada. La extension no filtra lo anidado bajo un modelo
    // de plataforma, pero lo envuelve con `servi_app` (T3.10) y la RLS deja solo las filas de A.
    // Sin la envoltura, el distrito tenia «dos zonas», `zonaUnicaDeDistrito` lo trataba como
    // ambiguo y la fila se rechazaba («no tiene zona asignada»).
    it("R13: A y B cubren el MISMO distrito y la carga por API de A crea la orden en la zona de A", async () => {
      await enEmpresa(B.id, async (tx) => {
        const distrito = await tx.distrito.findFirstOrThrow({
          where: { cantonId: B.cantonId, nombre: A.distrito },
          select: { id: true },
        });
        await tx.zonaDistrito.create({ data: { zonaId: B.zonaId, distritoId: distrito.id } });
      });

      const res = await handleCargaApi(
        conKey(A, "http://localhost/api/ordenes/api-key/carga", {
          method: "POST",
          body: JSON.stringify({
            ordenes: [
              {
                num_remision: `T38-API-A2-${RUN}`,
                destinatario: "Cliente A2",
                telefono: "88887777",
                provincia: "Cartago",
                canton: "Cartago",
                distrito: A.distrito,
                producto: "Caja",
              },
            ],
          }),
        }),
        { descargaService: sinStorage },
      );

      expect(res.status).toBe(200);
      const cuerpo = await res.json();
      expect(cuerpo, JSON.stringify(cuerpo)).toMatchObject({ creadas: 1, conError: 0 });
      // El mismo distrito esta en una zona de cada empresa (medido como dueno): no es un distrito
      // que solo cubra A.
      const zonasDelDistrito = await base.zonaDistrito.findMany({
        where: { distrito: { cantonId: A.cantonId, nombre: A.distrito }, zonaId: { in: [A.zonaId, B.zonaId] } },
        select: { zonaId: true },
      });
      expect(zonasDelDistrito.map((z) => z.zonaId).sort()).toEqual([A.zonaId, B.zonaId].sort());
      expect(
        await base.orden.findFirstOrThrow({
          where: { numRemision: `T38-API-A2-${RUN}` },
          select: { organizacionId: true, zonaId: true },
        }),
      ).toEqual({ organizacionId: A.id, zonaId: A.zonaId });
    }, 60_000);
  });
});
