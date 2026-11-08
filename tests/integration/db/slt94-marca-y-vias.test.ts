import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { handleCargaMasivaChunk } from "@/app/api/ordenes/carga-masiva/chunk/route";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { RawRow } from "@/lib/parsers/spreadsheet";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PickingRepository } from "@/lib/repositories/PickingRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { BulkOrdenService } from "@/lib/services/BulkOrdenService";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import {
  activar,
  crearOrdenes,
  estatusId,
  fijarFulfillment,
  limpiarEmpresas,
  resumenDe,
  saldoTienda,
  sembrarEmpresa,
  sembrarUsuario,
  type EmpresaDePrueba,
} from "./_fixtures/fulfillment-94";

// SLT-94 (T2) — la marca «se recoge en tienda» y las tres VÍAS DE CREACIÓN de verdad, contra Postgres:
//
//   · R5/R6/R18 + R15 por servicio: la pantalla (route handler `handleCargaMasivaChunk`), la carga
//     masiva (`BulkOrdenService.cargarMasiva`) y la API key (`cargarViaApi`) deciden el estado de
//     nacimiento SOLO con la marca de la tienda dueña, y el trigger de 20261108120300 cobra el
//     fulfillment una vez por orden en las tres (hueco 6 de T1: R15 por la vía masiva).
//   · R33: la API publica el MISMO importe que se cobra.
//   · R23 por servicio: reintentar la misma remisión por API no crea orden ni cobro.
//   · R7: el picking (repositorio real) trata como «con paquetes en bodega» a las tiendas con la marca
//     en «no», y no a las de «sí».
//   · R8: cambiar la marca deja UNA fila de historial con el valor anterior y el nuevo; re-enviar la
//     misma no deja ninguna.
//
// Todo con empresas propias (`sembrarEmpresa`): no depende de datos previos de la base. Limpieza por
// catálogo en el `afterAll`, acotada a esas empresas.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);

interface GeoTexto {
  provinciaId: string;
  provincia: string;
  cantonId: string;
  canton: string;
  distritoId: string;
  distrito: string;
}

let base: PrismaClient;
let app: PrismaClient;
let geo: GeoTexto;
let A: EmpresaDePrueba;
/** TS: marca «sí» (se recoge en tienda), fulfillment 1000.00 + 13 %. */
let TS: string;
/** TN: marca «no» (paquetes en bodega), fulfillment 1000.00 + 13 %. */
let TN: string;
/** TK: tienda real a la que apunta una API key (302), marca «sí», flete y fulfillment. */
let TK: string;

const rem = (n: string) => `SLT94V-${n}-${RUN}`;

function bulk(): BulkOrdenService {
  return new BulkOrdenService(new OrdenRepository(app), new TarifaVigenteRepository(app));
}

function filaPantalla(numRemision: string): RawRow {
  return {
    num_remision: numRemision,
    destinatario: `Cliente SLT94 ${RUN}`,
    telefono: "88887777",
    provincia: geo.provincia,
    canton_distrito: `${geo.canton} (${geo.distrito})`,
    direccion: "",
    producto: "Caja",
    notas: "",
    monto_cobrar: "",
  };
}

function filaApi(numRemision: string): RawRow {
  return {
    num_remision: numRemision,
    destinatario: `Cliente SLT94 ${RUN}`,
    telefono: "88887777",
    producto: "Caja",
    provincia: geo.provincia,
    canton: geo.canton,
    distrito: geo.distrito,
  } as unknown as RawRow;
}

const tienda = (usuarioId: string): Actor => ({ usuarioId, rol: "adminTienda", organizacionId: A.id });

/** La orden recién creada, leída como dueño: id, estado y guía. */
async function ordenDe(numRemision: string) {
  const o = await base.orden.findFirstOrThrow({
    where: { numRemision, organizacionId: A.id },
    select: { id: true, numGuia: true, estatus: { select: { value: true } } },
  });
  return { id: o.id, estado: o.estatus.value, numGuia: o.numGuia };
}

describeSiHayBase("SLT-94 — la marca «se recoge en tienda» y las tres vías de creación (Postgres)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);

    // Un distrito sin zona de NADIE (otra zona en el mismo distrito cambiaría la resolución) y sin
    // paréntesis (la plantilla los usa de separador). Mismo criterio que `cobro-plataforma-cargos`.
    const d = await base.distrito.findFirst({
      where: {
        activo: true,
        zonas: { none: {} },
        NOT: [{ nombre: { contains: "(" } }, { canton: { nombre: { contains: "(" } } }],
        canton: { activo: true, provincia: { activo: true } },
      },
      select: { id: true, nombre: true, canton: { select: { id: true, nombre: true, provincia: { select: { id: true, nombre: true } } } } },
      orderBy: { id: "asc" },
    });
    if (d === null) throw new Error("faltan distritos libres en la base: aplica las migraciones");
    geo = {
      provinciaId: d.canton.provincia.id,
      provincia: d.canton.provincia.nombre,
      cantonId: d.canton.id,
      canton: d.canton.nombre,
      distritoId: d.id,
      distrito: d.nombre,
    };

    await bajoLockDeEscrituraReal(async () => {
      A = await sembrarEmpresa(base, `V ${RUN}`);
      await base.zonaDistrito.create({ data: { zonaId: A.zonaId, distritoId: geo.distritoId, organizacionId: A.id } });
      TS = await sembrarUsuario(base, A.id, "adminTienda", "TS", true);
      TN = await sembrarUsuario(base, A.id, "adminTienda", "TN", false);
      TK = await sembrarUsuario(base, A.id, "adminTienda", "TK", true);
      await activar(base, A.id);
      await fijarFulfillment(base, A.id, TS, "1000.00", "13.00");
      await fijarFulfillment(base, A.id, TN, "1000.00", "13.00");
      await fijarFulfillment(base, A.id, TK, "1000.00", "13.00");
      // La API exige flete por entregado para el par (tienda, zona): sin él la fila sale «sin tarifa».
      await base.tarifaValor.create({
        data: {
          organizacionId: A.id,
          concepto: "tienda_flete_entregado",
          modo: "monto",
          valor: "2000.00",
          ivaPct: "13.00",
          zonaId: A.zonaId,
        },
      });
    });
  }, 120_000);

  afterAll(async () => {
    if (base === undefined) return;
    await bajoLockDeEscrituraReal(() => limpiarEmpresas(base, A === undefined ? [] : [A.id]));
    await base.$disconnect();
  }, 120_000);

  it("SLT-94 R5/R15/R18 (pantalla): marca «sí» → por_recolectar_en_tienda CON guía, y UN cobro de 1000.00 + 130.00", async () => {
    const numRemision = rem("pantalla");
    const req = new Request("http://localhost/api/ordenes/carga-masiva/chunk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows: [filaPantalla(numRemision)] }),
    });
    const saldoAntes = await saldoTienda(base, TS);
    const res = await conEmpresa(A.id, () =>
      handleCargaMasivaChunk(req, { getActor: async () => tienda(TS), bulkService: bulk() }),
    );
    const cuerpo = (await res.json()) as { creadas?: number; filas?: unknown };
    expect(res.status, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo.creadas, JSON.stringify(cuerpo.filas)).toBe(1);

    const o = await ordenDe(numRemision);
    expect(o.estado).toBe("por_recolectar_en_tienda");
    expect(o.numGuia).not.toBeNull();
    expect(await resumenDe(base, o.id)).toEqual(["1 cargo creacion 1000.00 130.00"]);
    // R19: el disponible baja EXACTAMENTE monto + IVA.
    expect(Number(await saldoTienda(base, TS)) - Number(saldoAntes)).toBeCloseTo(-1130, 2);
  });

  it("SLT-94 R5/R15/R18 (carga masiva): marca «no» → en_preparacion SIN guía, y el cobro se escribe igual", async () => {
    const numRemision = rem("masiva");
    const r = await conEmpresa(A.id, () => bulk().cargarMasiva([filaPantalla(numRemision)], tienda(TN)));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error(`cargarMasiva devolvio ${r.status}`);
    expect(r.summary.creadas, JSON.stringify(r.summary.filas)).toBe(1);
    expect(r.summary.filas[0]?.estatus).toBe("en_preparacion");

    const o = await ordenDe(numRemision);
    expect(o.estado).toBe("en_preparacion");
    expect(o.numGuia).toBeNull();
    expect(await resumenDe(base, o.id)).toEqual(["1 cargo creacion 1000.00 130.00"]);
  });

  it("SLT-94 R5/R15/R33 (API key): la tienda apuntada nace donde dice SU marca, se cobra una vez y se publica el MISMO importe", async () => {
    const numRemision = rem("api");
    const actor: Actor = { usuarioId: TK, rol: "apiKey", organizacionId: A.id };
    const r = await conEmpresa(A.id, () => bulk().cargarViaApi([filaApi(numRemision)], actor));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error(`cargarViaApi devolvio ${r.status}`);
    expect(r.summary.creadas, JSON.stringify(r.summary)).toBe(1);
    // R33: lo que la API publica es lo que el trigger cobra.
    expect(r.summary.ordenes[0]).toMatchObject({
      estado: "por_recolectar_en_tienda",
      fulfillment: "1000.00",
      ivaFulfillment: "130.00",
    });

    const o = await ordenDe(numRemision);
    expect(o.estado).toBe("por_recolectar_en_tienda");
    expect(o.numGuia).not.toBeNull();
    expect(await resumenDe(base, o.id)).toEqual(["1 cargo creacion 1000.00 130.00"]);

    // R23 por servicio: reintentar la MISMA remisión no crea orden ni escribe un segundo cobro.
    const otra = await conEmpresa(A.id, () => bulk().cargarViaApi([filaApi(numRemision)], actor));
    expect(otra.status).toBe("ok");
    if (otra.status !== "ok") throw new Error(`cargarViaApi devolvio ${otra.status}`);
    expect(otra.summary.creadas).toBe(0);
    expect(await resumenDe(base, o.id)).toEqual(["1 cargo creacion 1000.00 130.00"]);
    expect(await base.orden.count({ where: { numRemision, organizacionId: A.id } })).toBe(1);
  });

  it("SLT-94 R7: el picking ofrece la tienda con la marca en «no» y sus órdenes en preparación; la de «sí», no", async () => {
    const enPreparacion = await estatusId(base, "en_preparacion");
    // Una orden en preparación de CADA tienda (TS también: la marca, no el estado, decide).
    const deTS = await crearOrdenes(app, base, A, TS, [rem("pick-ts")], { conGuia: false, estatusId: enPreparacion, geo });
    const deTN = await crearOrdenes(app, base, A, TN, [rem("pick-tn")], { conGuia: false, estatusId: enPreparacion, geo });
    const idTS = deTS.ids[rem("pick-ts")];
    const idTN = deTN.ids[rem("pick-tn")];
    expect(idTS).toBeDefined();
    expect(idTN).toBeDefined();

    const picking = new PickingRepository(base);
    const nuestras = new Set([TS, TN, TK]);
    const tiendas = (await picking.tiendasFulfillment()).filter((t) => nuestras.has(t.id)).map((t) => t.id);
    expect(tiendas).toEqual([TN]);

    const ordenesTN = (await picking.ordenesEnPreparacion(TN)).map((f) => f.ordenId);
    expect(ordenesTN).toContain(idTN);
    expect(await picking.ordenesEnPreparacion(TS)).toEqual([]);

    const entradas = (await picking.entradasEnPreparacion()).filter((e) => nuestras.has(e.tiendaId));
    expect(new Set(entradas.map((e) => e.tiendaId))).toEqual(new Set([TN]));

    expect(await picking.tiendaDelPicking(TN)).toMatchObject({ id: TN, fulfillment: true, esTienda: true, activo: true });
    expect(await picking.tiendaDelPicking(TS)).toMatchObject({ id: TS, fulfillment: false });
  });

  it("SLT-94 R8: cambiar la marca deja UNA fila con el valor anterior y el nuevo; re-enviar la misma no deja ninguna", async () => {
    const repo = new UserRepository(app);
    const registro = () =>
      base.historialAccion.findMany({
        where: { entidadId: TK, accion: "usuario_se_recoge_en_tienda_cambiado" },
        select: { valorAnterior: true, valorNuevo: true },
      });
    expect(await registro()).toEqual([]);

    const r1 = await conEmpresa(A.id, () => repo.update(TK, { seRecogeEnTienda: false }, A.maestroId));
    expect(r1?.seRecogeEnTienda).toBe(false);
    expect(await registro()).toEqual([{ valorAnterior: "true", valorNuevo: "false" }]);

    await conEmpresa(A.id, () => repo.update(TK, { seRecogeEnTienda: false }, A.maestroId));
    expect(await registro()).toHaveLength(1);

    // La columna vieja NO se escribe (D4): sigue en su default.
    const fila = await base.usuario.findUniqueOrThrow({ where: { id: TK }, select: { fulfillmentRetirado: true } });
    expect(fila.fulfillmentRetirado).toBe(false);
  });
});
