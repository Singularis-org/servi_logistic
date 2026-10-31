import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomInt, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

import { GestionOrdenRepository } from "@/lib/repositories/GestionOrdenRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { loadRouteOptimizationConfig } from "@/lib/config/route-optimization";

/**
 * SLT-59 (review m7) — las tres lecturas nuevas de «primera ruta pendiente» filtran por empresa,
 * contra Postgres REAL y con dos empresas:
 *   - recogida (R57, R58, R76; design §12.2): `EXISTS orden` y `calculada_at`, en `recogerLote`;
 *   - gestion  (R59; design §12.3): la subselect `calculada_at` de la re-lectura de gestionable;
 *   - traspaso (R60; design §12.4): `SELECT ... FROM ruta_optimizada` de `traspasarMensajeroLote`.
 *
 * QUE SE MIDE. La RLS ya esconde las filas de otra empresa; lo que este archivo prueba es la SEGUNDA
 * barrera, el `organizacion_id` explicito del SQL. Por eso los repositorios corren como DUENO (sin
 * RLS) con la empresa A fijada para los `DEFAULT`: si el filtro faltara, nada mas lo taparia.
 *
 * COMO EXISTE UNA FILA DE B QUE «ENCAJA» CON A. Los triggers de misma empresa impiden que una ruta u
 * orden de B apunte a un mensajero de A. Para sembrar ese caso imposible (el que el filtro defiende),
 * la siembra apaga los triggers de usuario de `orden` y `ruta_optimizada` durante dos `INSERT` y los
 * vuelve a encender. Va dentro de la transaccion revertida: no deja rastro. Las FK siguen activas.
 *
 * ⚠️ MISMA REGLA QUE `ruta-optimizada-reduccion-sql-real.test.ts`: solo `DATABASE_URL` del entorno y
 * solo con host `localhost`/`127.0.0.1`. Los modulos que pueden leer `.env` se importan dentro de
 * `beforeAll`. Contra una base remota, jamas: se salta.
 */

/** La URL tal cual llega al proceso. Se lee AQUI, antes de que nada pueda cargar `.env`. */
const URL_DEL_ENTORNO = process.env.DATABASE_URL;

function esHostLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false; // una URL que no se puede leer no es una base local demostrada
  }
}

const HAY_BASE_LOCAL =
  URL_DEL_ENTORNO !== undefined && URL_DEL_ENTORNO !== "" && esHostLocal(URL_DEL_ENTORNO);

const describeSiBaseLocal = HAY_BASE_LOCAL ? describe : describe.skip;

type Tx = Prisma.TransactionClient;
type PostgresReal = typeof import("./_postgres-real");
type DosEmpresas = typeof import("./_jobs-dos-empresas");
type Organizaciones = typeof import("../../fabricas/organizaciones");

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
/** El dia de reparto del test (`@db.Date`, medianoche UTC) y un instante de ese dia en CR. */
const HOY = new Date("2026-10-30T00:00:00.000Z");
const AHORA = new Date("2026-10-30T18:00:00.000Z"); // 12:00 de CR
/** Calculada HOY en CR (09:00): para quien la lea, la primera ruta ya NO esta pendiente. */
const CALCULADA_HOY = new Date("2026-10-30T15:00:00.000Z");

/** Cola de jobs en memoria: lo que se mide es la DECISION de encolar, que sale de las lecturas. */
function colaFake() {
  return {
    enqueue: vi.fn(async () => null),
    encolarOMoverPendiente: vi.fn(async () => null),
    claimBatch: vi.fn(async () => []),
    complete: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    findByDedupeKeys: vi.fn(async () => []),
  };
}

interface Mundo {
  zonaId: string;
  tiendaId: string;
  mensajeroId: string;
  /** Un segundo mensajero de la misma empresa (destino del traspaso). */
  otroMensajeroId: string;
}

describeSiBaseLocal("SLT-59 m7 — primera ruta pendiente: lecturas por empresa (Postgres real, dos empresas)", () => {
  let pg: PostgresReal;
  let dos: DosEmpresas;
  let orgs: Organizaciones;
  let prisma: PrismaClient;
  let catalogo: {
    rolMensajero: string;
    rolTienda: string;
    tipoIdentificacion: string;
    porRecoger: string;
    enReparto: string;
    provinciaId: string;
    cantonId: string;
    distritoId: string;
  };

  beforeAll(async () => {
    pg = await import("./_postgres-real");
    dos = await import("./_jobs-dos-empresas");
    orgs = await import("../../fabricas/organizaciones");
    prisma = pg.crearPrismaDeTest();

    const [rolMensajero, rolTienda, tipo, estados, distrito] = await Promise.all([
      prisma.rol.findFirst({ where: { value: "mensajero" }, select: { id: true } }),
      prisma.rol.findFirst({ where: { value: "adminTienda" }, select: { id: true } }),
      prisma.tipoIdentificacion.findFirst({ select: { id: true } }),
      prisma.orderStatus.findMany({
        where: { value: { in: ["mensajero_recogiendo_en_bodega", "en_reparto"] } },
        select: { id: true, value: true },
      }),
      prisma.distrito.findFirst({
        select: { id: true, canton: { select: { id: true, provinciaId: true } } },
        orderBy: { id: "asc" },
      }),
    ]);
    const porRecoger = estados.find((e) => e.value === "mensajero_recogiendo_en_bodega")?.id;
    const enReparto = estados.find((e) => e.value === "en_reparto")?.id;
    // Fallo CERRADO: sin catalogos no se siembra nada, y un test que no siembra mide cero.
    if (!rolMensajero || !rolTienda || !tipo || !porRecoger || !enReparto || !distrito) {
      throw new Error(
        "faltan catalogos (rol mensajero/adminTienda, tipo_identificacion, order_status " +
          "`mensajero_recogiendo_en_bodega`/`en_reparto`, distrito): corre las migraciones y `pnpm run db:seed`.",
      );
    }
    catalogo = {
      rolMensajero: rolMensajero.id,
      rolTienda: rolTienda.id,
      tipoIdentificacion: tipo.id,
      porRecoger,
      enReparto,
      provinciaId: distrito.canton.provinciaId,
      cantonId: distrito.canton.id,
      distritoId: distrito.id,
    };
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /** Zona, tienda y dos mensajeros de `org`, como dueno y con la empresa explicita. */
  async function sembrarMundo(tx: Tx, org: string, letra: string): Promise<Mundo> {
    const marca = `${letra}-${RUN}-${randomInt(0, 1_000_000)}`;
    const zona = await tx.zona.create({
      data: { nombre: `Zona SLT59m7 ${marca}`, sinpeNumero: "88880000", sinpeNombre: "Zona", organizacionId: org },
      select: { id: true },
    });
    const usuario = (rolId: string, prefijo: string, zonaId?: string) =>
      tx.usuario.create({
        data: {
          nombre: `${prefijo} ${marca}`,
          email: `${prefijo}-${marca}@slt59m7.test`,
          telefono: "88880000",
          passwordHash: "no-es-una-credencial",
          cedula: `SLT59M7-${prefijo}-${marca}`,
          tipoIdentificacionId: catalogo.tipoIdentificacion,
          rolId,
          estado: "activo",
          zonaId,
          organizacionId: org,
        },
        select: { id: true },
      });
    const mensajero = await usuario(catalogo.rolMensajero, "mensajero", zona.id);
    const otro = await usuario(catalogo.rolMensajero, "mensajero2", zona.id);
    const tienda = await usuario(catalogo.rolTienda, "tienda");
    return { zonaId: zona.id, tiendaId: tienda.id, mensajeroId: mensajero.id, otroMensajeroId: otro.id };
  }

  /** Una orden de `org` con la tienda y la zona de `mundo`, asignada a `mensajeroId`. */
  async function sembrarOrden(
    tx: Tx,
    org: string,
    mundo: Mundo,
    mensajeroId: string,
    estatusId: string,
  ): Promise<string> {
    const marca = `${RUN}-${randomInt(0, 1_000_000_000)}`;
    const o = await tx.orden.create({
      data: {
        numRemision: `SLT59M7-${marca}`,
        numGuia: 1_500_000_000 + randomInt(0, 600_000_000),
        estatusId,
        destinatario: `Cliente ${marca}`,
        telefonoDest: "88887777",
        tiendaId: mundo.tiendaId,
        zonaId: mundo.zonaId,
        provinciaId: catalogo.provinciaId,
        cantonId: catalogo.cantonId,
        distritoId: catalogo.distritoId,
        producto: "Caja",
        mensajeroAsignadoId: mensajeroId,
        asignadoAt: new Date("2026-10-30T12:00:00.000Z"),
        organizacionId: org,
      },
      select: { id: true },
    });
    return o.id;
  }

  /** Cabecera de ruta de `org` para `mensajeroId`, calculada HOY. */
  function sembrarRutaCalculadaHoy(tx: Tx, org: string, mensajeroId: string) {
    return tx.rutaOptimizada.create({
      data: { mensajeroId, estado: "vigente", calculadaAt: CALCULADA_HOY, organizacionId: org },
      select: { id: true },
    });
  }

  /**
   * El caso que el filtro defiende: filas de B que apuntan a un mensajero de A. Los triggers de
   * misma empresa lo hacen inescribible; aqui se apagan SOLO para sembrarlo.
   */
  async function conTriggersApagados(tx: Tx, fn: () => Promise<void>): Promise<void> {
    await tx.$executeRawUnsafe(`ALTER TABLE "orden" DISABLE TRIGGER USER`);
    await tx.$executeRawUnsafe(`ALTER TABLE "ruta_optimizada" DISABLE TRIGGER USER`);
    await fn();
    await tx.$executeRawUnsafe(`ALTER TABLE "ruta_optimizada" ENABLE TRIGGER USER`);
    await tx.$executeRawUnsafe(`ALTER TABLE "orden" ENABLE TRIGGER USER`);
  }

  /** Dueno de las tablas (sin RLS) con la empresa `org` fijada para los `DEFAULT` y los registros. */
  async function comoDuenoEn(tx: Tx, org: string): Promise<PrismaClient> {
    await dos.comoDueno(tx as unknown as Parameters<DosEmpresas["comoDueno"]>[0]);
    await orgs.fijarEmpresa(tx, org);
    return pg.clienteConSavepoint(tx as unknown as Parameters<PostgresReal["clienteConSavepoint"]>[0]);
  }

  /** Las filas de B sembradas para `mensajeroId` de A, contadas como dueno (anti-vacuidad). */
  async function filasDeBParaElMensajero(tx: Tx, b: string, mensajeroId: string) {
    const [fila] = await tx.$queryRawUnsafe<{ rutas: number; ordenes: number }[]>(
      `SELECT
         (SELECT COUNT(*)::int FROM "ruta_optimizada" WHERE "mensajero_id" = $1 AND "organizacion_id" = $2) AS "rutas",
         (SELECT COUNT(*)::int FROM "orden" WHERE "mensajero_asignado_id" = $1 AND "organizacion_id" = $2) AS "ordenes"`,
      mensajeroId,
      b,
    );
    return fila;
  }

  function conDosEmpresas<T>(fn: (tx: Tx, a: string, b: string) => Promise<T>): Promise<T> {
    return dos.conDosEmpresas(prisma, (tx, a, b) => fn(tx as unknown as Tx, a, b));
  }

  it("R57/R58/R76: la recogida no cuenta la orden por recoger ni la ruta de OTRA empresa", async () => {
    const r = await conDosEmpresas(async (tx, a, b) => {
      const mundoA = await sembrarMundo(tx, a, "A");
      const mundoB = await sembrarMundo(tx, b, "B");
      const mA = mundoA.mensajeroId;
      // A: dos ordenes por recoger, y se recogen las dos. A no tiene ruta: su primera esta pendiente.
      const idsA = [
        await sembrarOrden(tx, a, mundoA, mA, catalogo.porRecoger),
        await sembrarOrden(tx, a, mundoA, mA, catalogo.porRecoger),
      ];
      // B, apuntando al mensajero de A: una orden por recoger y una ruta calculada hoy.
      await conTriggersApagados(tx, async () => {
        await sembrarOrden(tx, b, mundoB, mA, catalogo.porRecoger);
        await sembrarRutaCalculadaHoy(tx, b, mA);
      });
      const deB = await filasDeBParaElMensajero(tx, b, mA);

      const cliente = await comoDuenoEn(tx, a);
      const cola = colaFake();
      const repo = new GestionOrdenRepository(
        cliente as unknown as ConstructorParameters<typeof GestionOrdenRepository>[0],
        cola as unknown as ConstructorParameters<typeof GestionOrdenRepository>[1],
        () => AHORA,
      );
      const recogidas = await repo.recogerLote(idsA, mA, catalogo.porRecoger, catalogo.enReparto, HOY);
      return { mA, deB, recogidas, llamadas: cola.encolarOMoverPendiente.mock.calls };
    });

    // Anti-vacuidad: las filas de B existen y apuntan al mensajero de A.
    expect(r.deB).toEqual({ rutas: 1, ordenes: 1 });
    expect(r.recogidas).toBe(2);
    // Con el filtro: no quedan por recoger EN A (-> `recogida`, no `recogida_parcial`) y la ruta de A
    // no existe (-> primera pendiente, se encola). Sin el filtro, la ruta de B la daria por
    // calculada y no se encolaria nada; la orden de B daria `recogida_parcial`.
    expect(r.llamadas).toHaveLength(1);
    const [tipo, payload, opts] = r.llamadas[0] as unknown as [string, unknown, { runAfter: Date }];
    expect(tipo).toBe("optimizacion_ruta");
    expect(payload).toEqual({ mensajeroId: r.mA, origen: "recogida" });
    expect(opts.runAfter.getTime()).toBe(
      AHORA.getTime() + loadRouteOptimizationConfig().RUTA_DEBOUNCE_S * 1000,
    );
  });

  it("R59: la gestion no toma el `calculada_at` de la ruta de OTRA empresa", async () => {
    const r = await conDosEmpresas(async (tx, a, b) => {
      const mundoA = await sembrarMundo(tx, a, "A");
      const mA = mundoA.mensajeroId;
      // Orden de A en reparto y SIN coordenadas: solo se encola si la primera ruta esta pendiente.
      const ordenId = await sembrarOrden(tx, a, mundoA, mA, catalogo.enReparto);
      await conTriggersApagados(tx, async () => {
        await sembrarRutaCalculadaHoy(tx, b, mA);
      });
      const deB = await filasDeBParaElMensajero(tx, b, mA);

      const cliente = await comoDuenoEn(tx, a);
      const cola = colaFake();
      const repo = new GestionOrdenRepository(
        cliente as unknown as ConstructorParameters<typeof GestionOrdenRepository>[0],
        cola as unknown as ConstructorParameters<typeof GestionOrdenRepository>[1],
        () => AHORA,
      );
      const registrada = await repo.registrarGestionPendiente({
        ordenId,
        mensajeroId: mA,
        gestion: { resultado: "novedad", causaDevolucion: "wrong_address", motivo: "SLT-59 m7" },
      });
      return { mA, deB, registrada, llamadas: cola.enqueue.mock.calls };
    });

    expect(r.deB.rutas).toBe(1); // anti-vacuidad: la ruta de B existe y apunta al mensajero de A
    expect(r.registrada).not.toBeNull();
    // Con el filtro, A no tiene ruta -> primera pendiente -> se encola aunque no haya coordenadas.
    // Sin el filtro, la ruta de B (calculada hoy) la daria por hecha y no se encolaria nada.
    expect(r.llamadas).toHaveLength(1);
    const [tipo, payload] = r.llamadas[0] as unknown as [string, unknown];
    expect(tipo).toBe("optimizacion_ruta");
    expect(payload).toEqual({ mensajeroId: r.mA, origen: "gestion" });
  });

  it("R60: el traspaso no decide con la ruta de OTRA empresa", async () => {
    const r = await conDosEmpresas(async (tx, a, b) => {
      const mundoA = await sembrarMundo(tx, a, "A");
      const origenId = mundoA.mensajeroId;
      const destinoId = mundoA.otroMensajeroId;
      const ordenId = await sembrarOrden(tx, a, mundoA, origenId, catalogo.enReparto);
      // Origen: su ruta de A ya calculada hoy -> se encola (anti-vacuidad del caso positivo).
      await sembrarRutaCalculadaHoy(tx, a, origenId);
      // Destino: sin ruta en A (primera pendiente -> no se encola); la de B diria «calculada hoy».
      await conTriggersApagados(tx, async () => {
        await sembrarRutaCalculadaHoy(tx, b, destinoId);
      });
      const deB = await filasDeBParaElMensajero(tx, b, destinoId);

      const cliente = await comoDuenoEn(tx, a);
      const cola = colaFake();
      const repo = new OrdenRepository(
        cliente as unknown as ConstructorParameters<typeof OrdenRepository>[0],
        cola as unknown as ConstructorParameters<typeof OrdenRepository>[1],
        () => AHORA,
      );
      const aplicado = await repo.traspasarMensajeroLote({
        loteId: randomUUID(),
        mensajeroOrigenId: origenId,
        mensajeroDestinoId: destinoId,
        ordenes: [{ ordenId, estatusIdEsperado: catalogo.enReparto }],
        actor: { usuarioId: mundoA.tiendaId, rol: "maestro" },
        motivo: "SLT-59 m7",
      });
      return { origenId, deB, aplicado, llamadas: cola.enqueue.mock.calls };
    });

    expect(r.deB.rutas).toBe(1); // anti-vacuidad: la ruta de B existe y apunta al destino de A
    expect(r.aplicado.movidas).toBe(1);
    // Solo el origen. Sin el filtro, la ruta de B haria encolar tambien al destino.
    expect(r.llamadas.map((c) => (c as unknown as [string, { mensajeroId: string }])[1].mensajeroId)).toEqual([
      r.origenId,
    ]);
  });
});
