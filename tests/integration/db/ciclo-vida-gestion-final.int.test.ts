import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { GestionResultado, PrismaClient } from "@prisma/client";

import { CicloVidaRepository } from "@/lib/repositories/CicloVidaRepository";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { ConteoPorStatusRepository } from "@/lib/repositories/ConteoPorStatusRepository";

import { comoApp, crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import { D, D_MAS_1, D_MENOS_1, consultaDe, describeSiHayBase, rangoDe } from "./_cohorte-carga";
import {
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import {
  agregarTransicion,
  crearGestion,
  crearOrden,
  estatusId,
  instanteCR,
  sembrarBase,
  type BaseSembrada,
} from "./_semilla-rollup";

/**
 * SLT-64 / T2.3 — «CERRADA» ES LA GESTION FINAL DEL MENSAJERO, contra Postgres real.
 *
 * Los tests de servicio usan dobles y no ven el SQL; aqui se mide cada pieza del `WHERE` con el
 * repositorio real, en una transaccion que SIEMPRE se revierte. La base es compartida, asi que todo
 * se lee recortado a una tienda sembrada en la misma transaccion (o a una empresa recien creada en el
 * caso de la RLS), y los esperados son exactos: una fila ajena los pone rojos.
 *
 * Cada caso negativo lleva un TESTIGO que si cuenta y cada caso afirma su fixture antes de medir: un
 * cero solo no distingue «la excluyo» de «no habia nada».
 *
 * Los segundos esperados estan calculados a mano, en el comentario de cada caso.
 *
 * R6 y R8 ejercen las escrituras REALES (`resolverCierre`, `corregirResultadoGestionEnCierre`) sobre
 * un fixture sembrado aqui y no sobre `454/_escenario`: aquel necesita ordenes y una zona central
 * previas, y la base de CI solo trae catalogos (`tests/baseline-rojos.json`). Los libros de dinero van
 * con dobles: este archivo mide una lectura, y sus escrituras tienen sus propios tests.
 */

const TESTIGO_SEGUNDOS = 3600; // 08:00 -> 09:00

const ALCANCE_CENTRAL = { destinoTipo: "bodega_central", destinoZonaId: null } as const;

/** Dobles no-op de los libros de dinero que `resolverCierre` invoca al aprobar. */
function repositorioDeCierres(tx: TxDeTest): CierresAdminRepository {
  return new CierresAdminRepository(
    clienteConSavepoint(tx),
    { crearMovimientos: async () => 0 } as never,
    { construirMovimientosDeIngreso: async () => [] } as never,
    { crearMovimientos: async () => 0 } as never,
    { construirMovimientosPorTienda: async () => [] } as never,
    { crearMovimientos: async () => 0 } as never,
    { construirMovimientosDePago: async () => ({ libro: [], egresoCaja: [] }) } as never,
    { construirEgresoIndemnizacion: async () => [] } as never,
  );
}

/**
 * Una orden en reparto con su gestion `entregado` de CALLE (con su evento `gestion_registrada`, como
 * la deja el portal desde la 454) dentro de un cierre abierto. 08:00 -> 12:00 CR = 14 400 s.
 */
async function ordenEntregadaEnCierreAbierto(f: Fixture) {
  const { tx, base } = f;
  const ordenId = await f.orden("en-cierre");
  await tx.orden.update({ where: { id: ordenId }, data: { estatusId: estatusId(base, "en_reparto") } });
  const cierre = await tx.cierreDia.create({
    data: {
      mensajeroId: base.mensajero1,
      estado: "solicitado",
      destinoTipo: "bodega_central",
      destinoZonaId: base.zonaA,
    },
    select: { id: true },
  });
  const gestion = await tx.gestionOrden.create({
    data: {
      ordenId,
      mensajeroId: base.mensajero1,
      resultado: "entregado",
      cierreId: cierre.id,
      createdAt: instanteCR(D, "12:00"),
    },
    select: { id: true },
  });
  await tx.ordenEvento.create({
    data: {
      ordenId,
      tipo: "gestion_registrada",
      gestionOrdenId: gestion.id,
      familiaAplicacion: "gestion",
      resultado: "entregado",
      mensajeroId: base.mensajero1,
      actorUsuarioId: base.mensajero1,
      actorRol: "mensajero",
    },
  });
  return { ordenId, gestionId: gestion.id, cierreId: cierre.id };
}

interface Fixture {
  readonly tx: TxDeTest;
  readonly base: BaseSembrada;
  readonly actor: { usuarioId: string; rol: string };
  /** Orden de la tienda 1 cargada a las 08:00 CR de `fecha` (o donde diga `extra`). */
  orden(clave: string, fecha?: string, extra?: { tiendaId?: string; zonaId?: string; deletedAt?: Date }): Promise<string>;
  /** Gestion del mensajero 1 (o del que diga `extra`) a la hora CR de `fecha`. */
  gestion(
    ordenId: string,
    resultado: GestionResultado,
    hora: string,
    fecha?: string,
    extra?: { mensajeroId?: string; anuladaAt?: Date },
  ): Promise<string>;
  /** Una orden `entregado` que SI cuenta, 3600 s. */
  testigo(): Promise<string>;
  leer(raw?: object, actor?: { usuarioId: string; rol: string; zonaId?: string }): Promise<{ segundosAcum: number; n: number }>;
}

async function montar(tx: TxDeTest): Promise<Fixture> {
  const base = await sembrarBase(tx);
  const actor = { usuarioId: base.tienda1, rol: "adminTienda" };
  const fixture: Fixture = {
    tx,
    base,
    actor,
    orden: (clave, fecha = D, extra = {}) =>
      crearOrden(tx, base, {
        clave,
        zonaId: extra.zonaId ?? base.zonaA,
        tiendaId: extra.tiendaId ?? base.tienda1,
        mensajeroId: base.mensajero1,
        createdAt: instanteCR(fecha, "08:00"),
        deletedAt: extra.deletedAt ?? null,
      }),
    gestion: (ordenId, resultado, hora, fecha = D, extra = {}) =>
      crearGestion(tx, {
        ordenId,
        mensajeroId: extra.mensajeroId ?? base.mensajero1,
        resultado,
        at: instanteCR(fecha, hora),
        anuladaAt: extra.anuladaAt ?? null,
      }),
    testigo: async () => {
      const id = await fixture.orden(`testigo-${randomUUID().slice(0, 8)}`);
      await fixture.gestion(id, "entregado", "09:00");
      return id;
    },
    leer: (raw = {}, quien = actor) =>
      new CicloVidaRepository(tx as unknown as PrismaClient).acumularCiclos(consultaDe(raw, quien)),
  };
  return fixture;
}

/** Afirma que el fixture de una orden existe tal y como el caso lo necesita. */
async function afirmarFixture(
  tx: TxDeTest,
  ordenId: string,
  esperado: { gestiones: number; vigentes: number; transiciones?: number },
): Promise<void> {
  const [gestiones, vigentes, transiciones] = await Promise.all([
    tx.gestionOrden.count({ where: { ordenId } }),
    tx.gestionOrden.count({ where: { ordenId, anuladaAt: null } }),
    tx.ordenHistorialEstado.count({ where: { ordenId } }),
  ]);
  expect({ gestiones, vigentes }, `fixture de ${ordenId}`).toEqual({
    gestiones: esperado.gestiones,
    vigentes: esperado.vigentes,
  });
  expect(transiciones, `historial de ${ordenId}`).toBe(esperado.transiciones ?? 0);
}

describeSiHayBase("SLT-64 — el ciclo de vida lee la gestion final (Postgres real)", () => {
  let prisma: PrismaClient;

  /** Corre el caso en su transaccion revertida, serializada como el resto de escrituras reales. */
  const caso = (fn: (f: Fixture) => Promise<void>) =>
    enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      await fn(await montar(tx));
    });

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  describe("R1 · cierra la ultima gestion vigente, este o no aprobado su cierre", () => {
    it("R1: `entregado` sin historial terminal (el caso de produccion) cuenta", async () => {
      await caso(async (f) => {
        const o1 = await f.orden("o1");
        await f.gestion(o1, "entregado", "12:00");
        await afirmarFixture(f.tx, o1, { gestiones: 1, vigentes: 1, transiciones: 0 });

        // 08:00 -> 12:00 = 4 h = 14 400 s.
        expect(await f.leer()).toEqual({ segundosAcum: 14400, n: 1 });
      });
    });

    it("R1: los tres resultados de cierre cuentan, cada uno con sus segundos", async () => {
      await caso(async (f) => {
        const entregado = await f.orden("entregado");
        const rechazo = await f.orden("rechazo");
        const incidente = await f.orden("incidente");
        await f.gestion(entregado, "entregado", "09:00");
        await f.gestion(rechazo, "devolucion_a_origen_por_rechazo", "10:00");
        await f.gestion(incidente, "incidente", "11:00");
        for (const id of [entregado, rechazo, incidente]) {
          await afirmarFixture(f.tx, id, { gestiones: 1, vigentes: 1 });
        }

        // 1 h + 2 h + 3 h = 6 h = 21 600 s.
        expect(await f.leer()).toEqual({ segundosAcum: 21600, n: 3 });
      });
    });
  });

  describe("R2 · lo que no cierra", () => {
    it("R2: la ultima gestion `reprogramado` con transicion terminal sembrada a mano no cuenta", async () => {
      await caso(async (f) => {
        await f.testigo();
        const o2 = await f.orden("o2");
        await f.gestion(o2, "reprogramado", "12:00");
        await agregarTransicion(f.tx, f.base, o2, { at: instanteCR(D, "12:00"), destino: "entregado" });
        await afirmarFixture(f.tx, o2, { gestiones: 1, vigentes: 1, transiciones: 1 });

        expect(await f.leer()).toEqual({ segundosAcum: TESTIGO_SEGUNDOS, n: 1 });
      });
    });

    it("R2: la ultima gestion `novedad` no cuenta aunque la orden llegue a `devuelta_a_tienda` (Q1)", async () => {
      await caso(async (f) => {
        await f.testigo();
        const o = await f.orden("novedad");
        await f.gestion(o, "novedad", "12:00");
        await agregarTransicion(f.tx, f.base, o, { at: instanteCR(D, "18:00"), destino: "devuelta_a_tienda" });
        await afirmarFixture(f.tx, o, { gestiones: 1, vigentes: 1, transiciones: 1 });

        expect(await f.leer()).toEqual({ segundosAcum: TESTIGO_SEGUNDOS, n: 1 });
      });
    });

    it("R2: sin gestion vigente no cuenta, aunque tenga transicion terminal", async () => {
      await caso(async (f) => {
        await f.testigo();
        const sinGestion = await f.orden("sin-gestion");
        await agregarTransicion(f.tx, f.base, sinGestion, { at: instanteCR(D, "18:00"), destino: "entregado" });
        await afirmarFixture(f.tx, sinGestion, { gestiones: 0, vigentes: 0, transiciones: 1 });

        expect(await f.leer()).toEqual({ segundosAcum: TESTIGO_SEGUNDOS, n: 1 });
      });
    });
  });

  describe("R3 · una contribucion por orden", () => {
    it("R3: dos gestiones de cierre vigentes cuentan una vez, con el instante de la ultima", async () => {
      await caso(async (f) => {
        const o = await f.orden("dos-cierres");
        await f.gestion(o, "entregado", "10:00");
        await f.gestion(o, "incidente", "12:00");
        await afirmarFixture(f.tx, o, { gestiones: 2, vigentes: 2 });

        // 08:00 -> 12:00 = 14 400 s, no la suma con las 2 h de la primera.
        expect(await f.leer()).toEqual({ segundosAcum: 14400, n: 1 });
      });
    });

    it("R3: empate de `created_at` entre dos gestiones de cierre -> n = 1", async () => {
      await caso(async (f) => {
        const o = await f.orden("empate");
        await f.gestion(o, "entregado", "12:00");
        await f.gestion(o, "incidente", "12:00");
        await afirmarFixture(f.tx, o, { gestiones: 2, vigentes: 2 });

        expect(await f.leer()).toEqual({ segundosAcum: 14400, n: 1 });
      });
    });

    it("R3: el empate lo decide el `id` mayor, como en el desglose por status", async () => {
      await caso(async (f) => {
        // Ids con el mismo prefijo: el sufijo fija cual es el mayor.
        const prefijo = randomUUID().slice(0, -2);
        const gestionCon = (ordenId: string, resultado: GestionResultado, sufijo: string) =>
          f.tx.gestionOrden.create({
            data: {
              id: `${prefijo}${sufijo}`,
              ordenId,
              mensajeroId: f.base.mensajero1,
              resultado,
              createdAt: instanteCR(D, "12:00"),
            },
            select: { id: true },
          });
        const ganaElCierre = await f.orden("gana-cierre");
        await gestionCon(ganaElCierre, "reprogramado", "01");
        await gestionCon(ganaElCierre, "entregado", "02");
        // Cargada un dia antes: si el desempate se invierte, cuenta ESTA orden y la cifra lo delata.
        const pierdeElCierre = await f.orden("pierde-cierre", D_MENOS_1);
        await gestionCon(pierdeElCierre, "entregado", "03");
        await gestionCon(pierdeElCierre, "reprogramado", "04");
        await afirmarFixture(f.tx, ganaElCierre, { gestiones: 2, vigentes: 2 });
        await afirmarFixture(f.tx, pierdeElCierre, { gestiones: 2, vigentes: 2 });

        // Solo `ganaElCierre`: 08:00 -> 12:00 = 14 400 s. Con el `id` menor contaria `pierdeElCierre`,
        // de D-1 08:00 a D 12:00 = 28 h = 100 800 s.
        expect(await f.leer()).toEqual({ segundosAcum: 14400, n: 1 });
      });
    });
  });

  describe("R4 · la ventana cae sobre la gestion final", () => {
    it("R4: una orden cargada fuera y cerrada dentro cuenta, con su duracion entera", async () => {
      await caso(async (f) => {
        const o = await f.orden("cargada-antes", D_MENOS_1);
        await f.gestion(o, "entregado", "08:00", D);
        await afirmarFixture(f.tx, o, { gestiones: 1, vigentes: 1 });

        // 24 h = 86 400 s.
        expect(await f.leer(rangoDe(D, D))).toEqual({ segundosAcum: 86400, n: 1 });
      });
    });

    it("R4: una orden cargada dentro y cerrada fuera no cuenta en esa ventana", async () => {
      await caso(async (f) => {
        const o = await f.orden("cerrada-despues", D);
        await f.gestion(o, "entregado", "08:00", D_MAS_1);
        await afirmarFixture(f.tx, o, { gestiones: 1, vigentes: 1 });

        expect(await f.leer(rangoDe(D, D))).toEqual({ segundosAcum: 0, n: 0 });
        expect(await f.leer(rangoDe(D_MAS_1, D_MAS_1))).toEqual({ segundosAcum: 86400, n: 1 });
      });
    });

    it("R4: la ventana es `[desde, hasta)`: entra el borde de abajo y no el de arriba", async () => {
      await caso(async (f) => {
        const enElDesde = await f.orden("en-desde", D_MENOS_1);
        const enElHasta = await f.orden("en-hasta", D_MENOS_1);
        const antesDelDesde = await f.orden("antes-desde", D_MENOS_1);
        await f.gestion(enElDesde, "entregado", "00:00", D);
        await f.gestion(enElHasta, "entregado", "00:00", D_MAS_1);
        await f.gestion(antesDelDesde, "entregado", "23:59", D_MENOS_1);
        for (const id of [enElDesde, enElHasta, antesDelDesde]) {
          await afirmarFixture(f.tx, id, { gestiones: 1, vigentes: 1 });
        }

        // Solo `enElDesde`: de D-1 08:00 a D 00:00 = 16 h = 57 600 s.
        expect(await f.leer(rangoDe(D, D))).toEqual({ segundosAcum: 57600, n: 1 });
      });
    });

    it("R4: sin rango cuentan todas las cerradas del recorte", async () => {
      await caso(async (f) => {
        const a = await f.orden("a", D_MENOS_1);
        const b = await f.orden("b", D_MAS_1);
        await f.gestion(a, "entregado", "09:00", D_MENOS_1);
        await f.gestion(b, "incidente", "10:00", D_MAS_1);
        await afirmarFixture(f.tx, a, { gestiones: 1, vigentes: 1 });
        await afirmarFixture(f.tx, b, { gestiones: 1, vigentes: 1 });

        // 1 h + 2 h = 10 800 s.
        expect(await f.leer()).toEqual({ segundosAcum: 10800, n: 2 });
      });
    });
  });

  describe("R5 · la ultima se elige entre todas las vigentes, no solo las de la ventana", () => {
    it("R5: `entregado` dentro y `reprogramado` vigente despues de la ventana no cuenta", async () => {
      await caso(async (f) => {
        await f.testigo();
        const o3 = await f.orden("o3");
        await f.gestion(o3, "entregado", "12:00", D);
        await f.gestion(o3, "reprogramado", "10:00", D_MAS_1);
        await afirmarFixture(f.tx, o3, { gestiones: 2, vigentes: 2 });

        expect(await f.leer(rangoDe(D, D))).toEqual({ segundosAcum: TESTIGO_SEGUNDOS, n: 1 });
      });
    });

    it("R5: una gestion de cierre posterior a la ventana mueve la orden a su propia ventana", async () => {
      await caso(async (f) => {
        const o = await f.orden("cierra-luego");
        await f.gestion(o, "entregado", "12:00", D);
        await f.gestion(o, "incidente", "08:00", D_MAS_1);
        await afirmarFixture(f.tx, o, { gestiones: 2, vigentes: 2 });

        expect(await f.leer(rangoDe(D, D))).toEqual({ segundosAcum: 0, n: 0 });
        // D 08:00 -> D+1 08:00 = 86 400 s.
        expect(await f.leer(rangoDe(D_MAS_1, D_MAS_1))).toEqual({ segundosAcum: 86400, n: 1 });
      });
    });
  });

  describe("R6 · aprobar el cierre no mueve la cifra", () => {
    it("R6: `n` y segundos son los mismos antes y despues de la aprobacion real", async () => {
      await caso(async (f) => {
        const { base, tx } = f;
        await f.testigo();
        const { ordenId, gestionId, cierreId } = await ordenEntregadaEnCierreAbierto(f);
        await afirmarFixture(tx, ordenId, { gestiones: 1, vigentes: 1, transiciones: 0 });

        // Sin aprobar no hay transicion terminal: es el caso de produccion. Testigo + 14 400 s.
        const antes = await f.leer();
        expect(antes).toEqual({ segundosAcum: TESTIGO_SEGUNDOS + 14400, n: 2 });

        const salida = await repositorioDeCierres(tx).resolverCierre({
          cierreId,
          alcance: ALCANCE_CENTRAL,
          nuevoEstado: "aprobado",
          resueltoPor: base.tienda2,
          motivoRechazo: null,
          aplicacionGestiones: {
            enRepartoId: estatusId(base, "en_reparto"),
            destinoPorResultado: {
              entregado: estatusId(base, "entregado"),
              reprogramado: estatusId(base, "reprogramado"),
              devolucion_a_origen_por_rechazo: estatusId(base, "devolucion_a_origen_por_rechazo"),
              novedad: estatusId(base, "novedad"),
              incidente: estatusId(base, "incidente"),
            },
          },
          indemnizaciones: [],
          confirmacionFisica: [],
        });
        expect(salida).toBe("updated");

        // La aprobacion escribio de verdad la transicion terminal, ahora: otro instante, otra tabla.
        const transiciones = await tx.ordenHistorialEstado.findMany({
          where: { ordenId, estatusDestinoId: estatusId(base, "entregado") },
          select: { gestionOrdenId: true, createdAt: true },
        });
        expect(transiciones.map((h) => h.gestionOrdenId)).toEqual([gestionId]);
        expect(transiciones[0]?.createdAt.getTime()).not.toBe(instanteCR(D, "12:00").getTime());
        const orden = await tx.orden.findUniqueOrThrow({ where: { id: ordenId }, select: { estatusId: true } });
        expect(orden.estatusId).toBe(estatusId(base, "entregado"));

        expect(await f.leer()).toEqual(antes);
      });
    });
  });

  describe("R7 · anular mueve la cifra a la nueva ultima gestion vigente", () => {
    const anular = (f: Fixture, gestionId: string) =>
      f.tx.gestionOrden.update({ where: { id: gestionId }, data: { anuladaAt: instanteCR(D_MAS_1, "09:00") } });

    it("R7: anulado el `entregado` de D2, queda `reprogramado` de D1 y la orden deja de contar", async () => {
      await caso(async (f) => {
        await f.testigo();
        const o4 = await f.orden("o4", D_MENOS_1);
        await f.gestion(o4, "reprogramado", "10:00", D_MENOS_1);
        const g2 = await f.gestion(o4, "entregado", "10:00", D);
        // Testigo + D-1 08:00 -> D 10:00 = 26 h = 93 600 s.
        expect(await f.leer()).toEqual({ segundosAcum: TESTIGO_SEGUNDOS + 93600, n: 2 });

        await anular(f, g2);
        await afirmarFixture(f.tx, o4, { gestiones: 2, vigentes: 1 });

        expect(await f.leer()).toEqual({ segundosAcum: TESTIGO_SEGUNDOS, n: 1 });
      });
    });

    it("R7: anulada la `novedad` de D2, queda `entregado` de D1 y la orden cuenta con el instante de D1", async () => {
      await caso(async (f) => {
        await f.testigo();
        const o5 = await f.orden("o5", D_MENOS_1);
        await f.gestion(o5, "entregado", "10:00", D_MENOS_1);
        const g2 = await f.gestion(o5, "novedad", "10:00", D);
        expect(await f.leer()).toEqual({ segundosAcum: TESTIGO_SEGUNDOS, n: 1 });

        await anular(f, g2);
        await afirmarFixture(f.tx, o5, { gestiones: 2, vigentes: 1 });

        // Testigo + D-1 08:00 -> D-1 10:00 = 7 200 s.
        expect(await f.leer()).toEqual({ segundosAcum: TESTIGO_SEGUNDOS + 7200, n: 2 });
      });
    });

    it("R7: anulada la final de cierre, cuenta con la de cierre anterior", async () => {
      await caso(async (f) => {
        const o = await f.orden("cierre-sobre-cierre", D_MENOS_1);
        await f.gestion(o, "entregado", "10:00", D_MENOS_1);
        const g2 = await f.gestion(o, "incidente", "10:00", D);
        expect(await f.leer()).toEqual({ segundosAcum: 93600, n: 1 });

        await anular(f, g2);
        await afirmarFixture(f.tx, o, { gestiones: 2, vigentes: 1 });

        expect(await f.leer()).toEqual({ segundosAcum: 7200, n: 1 });
      });
    });

    it("R7: anulada la unica gestion, la orden deja de contar", async () => {
      await caso(async (f) => {
        await f.testigo();
        const o = await f.orden("unica");
        const g = await f.gestion(o, "entregado", "12:00");
        await anular(f, g);
        await afirmarFixture(f.tx, o, { gestiones: 1, vigentes: 0 });

        expect(await f.leer()).toEqual({ segundosAcum: TESTIGO_SEGUNDOS, n: 1 });
      });
    });
  });

  describe("R8 · corregir el resultado no mueve el fin del reloj", () => {
    it("R8: corregida de `entregado` a `devolucion_a_origen_por_rechazo` sigue contando con los mismos segundos", async () => {
      await caso(async (f) => {
        const { base, tx } = f;
        const { ordenId, gestionId } = await ordenEntregadaEnCierreAbierto(f);
        await afirmarFixture(tx, ordenId, { gestiones: 1, vigentes: 1, transiciones: 0 });
        const antes = await f.leer();
        // 08:00 -> 12:00 = 14 400 s.
        expect(antes).toEqual({ segundosAcum: 14400, n: 1 });

        const correccion = await repositorioDeCierres(tx).corregirResultadoGestionEnCierre({
          gestionId,
          alcance: ALCANCE_CENTRAL,
          motivo: "El cliente no la recibio",
          corregidoPor: base.tienda2,
          estatusEntregadaId: estatusId(base, "entregado"),
          estatusRechazadaId: estatusId(base, "devolucion_a_origen_por_rechazo"),
        });
        expect(correccion.status).toBe("updated");

        const corregida = await tx.gestionOrden.findUniqueOrThrow({
          where: { id: gestionId },
          select: { resultado: true, createdAt: true },
        });
        expect(corregida.resultado).toBe("devolucion_a_origen_por_rechazo");
        expect(corregida.createdAt.getTime()).toBe(instanteCR(D, "12:00").getTime());
        // El evento de la correccion existe con su propio instante: es el que NO debe parar el reloj.
        const evento = await tx.ordenEvento.findFirstOrThrow({
          where: { gestionOrdenId: gestionId, tipo: "gestion_corregida" },
          select: { createdAt: true },
        });
        expect(evento.createdAt.getTime()).not.toBe(corregida.createdAt.getTime());

        expect(await f.leer()).toEqual(antes);
      });
    });
  });

  describe("R9 · los recortes de hoy se conservan", () => {
    it("R9: una orden de otra tienda no cuenta con alcance de tienda", async () => {
      await caso(async (f) => {
        await f.testigo();
        const ajena = await f.orden("otra-tienda", D, { tiendaId: f.base.tienda2 });
        await f.gestion(ajena, "entregado", "12:00");
        await afirmarFixture(f.tx, ajena, { gestiones: 1, vigentes: 1 });

        expect(await f.leer()).toEqual({ segundosAcum: TESTIGO_SEGUNDOS, n: 1 });
      });
    });

    it("R9: una orden de otra zona no cuenta con alcance de zona", async () => {
      await caso(async (f) => {
        await f.testigo();
        const ajena = await f.orden("otra-zona", D, { zonaId: f.base.zonaB });
        await f.gestion(ajena, "entregado", "12:00");
        await afirmarFixture(f.tx, ajena, { gestiones: 1, vigentes: 1 });

        const satelite = { usuarioId: f.base.mensajero1, rol: "adminSatelite", zonaId: f.base.zonaA };
        expect(await f.leer({}, satelite)).toEqual({ segundosAcum: TESTIGO_SEGUNDOS, n: 1 });
      });
    });

    // `recortarFiltroConteoEntregas` copia el alcance dentro del filtro, asi que por la puerta real la
    // faceta tapa a `condicionDeAlcance`: una mutacion que la quita paso en verde los dos casos de
    // arriba. Se vacia el filtro para medir la condicion sola, que es la que sostiene la frontera
    // si el recorte del filtro falla.
    it("R9: `condicionDeAlcance` recorta por si sola, sin la faceta que el borde escribe en el filtro", async () => {
      await caso(async (f) => {
        await f.testigo();
        const otraTienda = await f.orden("otra-tienda", D, { tiendaId: f.base.tienda2 });
        await f.gestion(otraTienda, "entregado", "12:00");
        const otraZona = await f.orden("otra-zona", D, { zonaId: f.base.zonaB, tiendaId: f.base.tienda2 });
        await f.gestion(otraZona, "entregado", "12:00");
        await afirmarFixture(f.tx, otraTienda, { gestiones: 1, vigentes: 1 });
        await afirmarFixture(f.tx, otraZona, { gestiones: 1, vigentes: 1 });
        const repo = new CicloVidaRepository(f.tx as unknown as PrismaClient);

        const deTienda = consultaDe({}, f.actor);
        expect(deTienda.filtro.tienda_id).toEqual([f.base.tienda1]);
        expect(await repo.acumularCiclos({ ...deTienda, filtro: {} })).toEqual({
          segundosAcum: TESTIGO_SEGUNDOS,
          n: 1,
        });

        const deZona = consultaDe({}, { usuarioId: f.base.mensajero1, rol: "adminSatelite", zonaId: f.base.zonaB });
        expect(deZona.filtro.zona_id).toEqual([f.base.zonaB]);
        // Solo `otraZona`: 08:00 -> 12:00 = 14 400 s.
        expect(await repo.acumularCiclos({ ...deZona, filtro: {} })).toEqual({ segundosAcum: 14400, n: 1 });
      });
    });

    it("R9: una orden borrada no cuenta", async () => {
      await caso(async (f) => {
        await f.testigo();
        const borrada = await f.orden("borrada", D, { deletedAt: instanteCR(D_MAS_1, "08:00") });
        await f.gestion(borrada, "entregado", "12:00");
        await afirmarFixture(f.tx, borrada, { gestiones: 1, vigentes: 1 });
        expect(await f.tx.orden.count({ where: { id: borrada, deletedAt: { not: null } } })).toBe(1);

        expect(await f.leer()).toEqual({ segundosAcum: TESTIGO_SEGUNDOS, n: 1 });
      });
    });

    it("R9: con filtro de mensajero, cuenta si ese mensajero tiene alguna gestion vigente de la orden", async () => {
      await caso(async (f) => {
        const { mensajero1, mensajero2 } = f.base;
        const suya = await f.orden("suya");
        await f.gestion(suya, "entregado", "09:00");
        const ajena = await f.orden("ajena");
        await f.gestion(ajena, "entregado", "10:00", D, { mensajeroId: mensajero2 });
        const anulada = await f.orden("su-gestion-anulada");
        await f.gestion(anulada, "reprogramado", "09:00", D, { anuladaAt: instanteCR(D, "09:30") });
        await f.gestion(anulada, "entregado", "11:00", D, { mensajeroId: mensajero2 });
        const compartida = await f.orden("final-de-otro");
        await f.gestion(compartida, "reprogramado", "09:00");
        await f.gestion(compartida, "entregado", "12:00", D, { mensajeroId: mensajero2 });
        await afirmarFixture(f.tx, ajena, { gestiones: 1, vigentes: 1 });
        await afirmarFixture(f.tx, anulada, { gestiones: 2, vigentes: 1 });
        await afirmarFixture(f.tx, compartida, { gestiones: 2, vigentes: 2 });

        // `suya` 1 h + `compartida` 4 h = 18 000 s.
        expect(await f.leer({ mensajero_id: [mensajero1] })).toEqual({ segundosAcum: 18000, n: 2 });
      });
    });

    it("R9: las facetas de zona, provincia, canton y distrito recortan", async () => {
      await caso(async (f) => {
        const o = await f.orden("zona-a");
        await f.gestion(o, "entregado", "09:00");
        const otra = await f.orden("zona-b", D, { zonaId: f.base.zonaB });
        await f.gestion(otra, "entregado", "10:00");
        await afirmarFixture(f.tx, o, { gestiones: 1, vigentes: 1 });
        await afirmarFixture(f.tx, otra, { gestiones: 1, vigentes: 1 });
        const ajeno = randomUUID();

        expect(await f.leer({ zona_id: [f.base.zonaA] })).toEqual({ segundosAcum: 3600, n: 1 });
        expect(await f.leer({ provincia_id: [f.base.provinciaId] })).toEqual({ segundosAcum: 10800, n: 2 });
        expect(await f.leer({ provincia_id: [ajeno] })).toEqual({ segundosAcum: 0, n: 0 });
        expect(await f.leer({ canton_id: [f.base.cantonId] })).toEqual({ segundosAcum: 10800, n: 2 });
        expect(await f.leer({ canton_id: [ajeno] })).toEqual({ segundosAcum: 0, n: 0 });
        expect(await f.leer({ distrito_id: [ajeno] })).toEqual({ segundosAcum: 0, n: 0 });
      });
    });

    it("R9: la faceta de tienda recorta con alcance global", async () => {
      await caso(async (f) => {
        const o = await f.orden("tienda-1");
        await f.gestion(o, "entregado", "09:00");
        const otra = await f.orden("tienda-2", D, { tiendaId: f.base.tienda2 });
        await f.gestion(otra, "entregado", "10:00");
        await afirmarFixture(f.tx, o, { gestiones: 1, vigentes: 1 });
        await afirmarFixture(f.tx, otra, { gestiones: 1, vigentes: 1 });
        const maestro = { usuarioId: f.base.mensajero1, rol: "maestro" };

        expect(await f.leer({ tienda_id: [f.base.tienda2] }, maestro)).toEqual({ segundosAcum: 7200, n: 1 });
      });
    });

    it("R9: una orden de otra empresa no cuenta con alcance global: la frontera es la RLS", async () => {
      await enTransaccionRevertida(prisma, async (tx) => {
        await serializarEscriturasReales(tx);
        const [{ empresa }] = await tx.$queryRaw<{ empresa: string }[]>`
          SELECT current_setting('app.organizacion_id') AS empresa`;

        const a = await montar(tx);
        const dePropia = await a.orden("propia");
        await a.gestion(dePropia, "entregado", "12:00");

        const otra = await crearOrganizacion(tx);
        await fijarEmpresa(tx, otra.id);
        const b = await montar(tx);
        const deOtra = await b.orden("ajena");
        await b.gestion(deOtra, "entregado", "12:00");
        await fijarEmpresa(tx, empresa);

        // El fixture, leido como dueno de las tablas: las dos filas existen, cada una en su empresa.
        const empresas = await tx.gestionOrden.findMany({
          where: { ordenId: { in: [dePropia, deOtra] } },
          select: { ordenId: true, organizacionId: true },
        });
        expect(new Map(empresas.map((g) => [g.ordenId, g.organizacionId]))).toEqual(
          new Map([
            [dePropia, empresa],
            [deOtra, otra.id],
          ]),
        );

        await comoApp(tx, empresa);

        // Alcance global: `condicionDeAlcance` es `TRUE`. Solo la propia, 08:00 -> 12:00 = 14 400 s.
        const maestro = { usuarioId: a.base.mensajero1, rol: "maestro" };
        expect(await a.leer({}, maestro)).toEqual({ segundosAcum: 14400, n: 1 });
      });
    });
  });

  describe("R11 · coherente con el desglose por status", () => {
    it("R11: sin rango, `n` es la suma de los buckets de cierre de `ConteoPorStatusRepository`", async () => {
      await caso(async (f) => {
        const r = async (clave: string, ...gestiones: [GestionResultado, string][]) => {
          const id = await f.orden(clave);
          for (const [resultado, hora] of gestiones) await f.gestion(id, resultado, hora);
          return id;
        };
        await r("entregado", ["entregado", "09:00"]);
        await r("rechazo", ["devolucion_a_origen_por_rechazo", "10:00"]);
        await r("incidente", ["incidente", "11:00"]);
        await r("reprogramado", ["reprogramado", "09:00"]);
        await r("novedad", ["novedad", "09:00"]);
        await r("cierra-tras-reprogramar", ["reprogramado", "09:00"], ["entregado", "12:00"]);
        await r("reprograma-tras-cerrar", ["entregado", "09:00"], ["reprogramado", "12:00"]);
        const conAnulada = await r("cierra-con-anulada", ["incidente", "09:00"]);
        await f.gestion(conAnulada, "novedad", "12:00", D, { anuladaAt: instanteCR(D, "12:30") });
        await afirmarFixture(f.tx, conAnulada, { gestiones: 2, vigentes: 1 });
        await r("empate", ["entregado", "13:00"], ["incidente", "13:00"]);

        const consulta = consultaDe({}, f.actor);
        const porStatus = await new ConteoPorStatusRepository(f.tx as unknown as PrismaClient).contarPorStatus(consulta);
        const buckets = new Map(porStatus.map((b) => [b.status, b.conteo]));
        const suma =
          (buckets.get("entregado") ?? 0) +
          (buckets.get("devolucion_a_origen_por_rechazo") ?? 0) +
          (buckets.get("incidente") ?? 0);

        // A mano: `entregado`, `rechazo`, `incidente`, `cierra-tras-reprogramar`,
        // `cierra-con-anulada` y `empate` = 6. Las 9 ordenes tienen gestion vigente.
        // Segundos: 1 h + 2 h + 3 h + 4 h + 1 h + 5 h = 16 h = 57 600 s.
        expect(await f.leer()).toEqual({ segundosAcum: 57600, n: 6 });
        expect(suma).toBe(6);
      });
    });
  });
});
