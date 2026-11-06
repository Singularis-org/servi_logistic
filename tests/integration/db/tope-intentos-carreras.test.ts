import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { leerTopeIntentosDeLaEmpresa } from "@/lib/repositories/_shared/tope-intentos-empresa";
import { DevolucionSlaRepository } from "@/lib/repositories/DevolucionSlaRepository";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { TopeIntentosRepository } from "@/lib/repositories/TopeIntentosRepository";
import { AsignabilidadCoordenadasService } from "@/lib/services/AsignabilidadCoordenadasService";
import { DevolucionSlaService } from "@/lib/services/DevolucionSlaService";
import { GuiaAsignacionService } from "@/lib/services/GuiaAsignacionService";
import { TopeIntentosService } from "@/lib/services/TopeIntentosService";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearEscenario, diaCR, type Escenario, type Mundo } from "./454/_escenario";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// SLT-77 T4.2 (design §6) — QUE PASA SI EL TOPE CAMBIA MIENTRAS ALGO CORRE. La direccion segura es NO COBRAR, asi que
// cada caso afirma con literales que no hay gestion sintetica, ni rastro del rechazo, ni importe: el estado de la orden
// solo no lo prueba, porque el cobro nace de la gestion sintetica y no del estado.
//
// El cambio a mitad de ejecucion lo hace un doble de la LECTURA, que lee de verdad y justo despues guarda por el servicio
// real. El resto es real sobre Postgres, como `servi_app` en la empresa, con RLS. Va todo en una transaccion revertida, y
// la relectura ve el valor nuevo porque es la misma conexion: la carrera se reproduce sin depender de tiempos.
//
// LO QUE ESTE ARCHIVO NO PRUEBA, porque no se puede sin cerrojo y `design §7.5` lo descarta: que el tope suba entre la
// relectura y el `COMMIT`. Ahi la orden se rechaza y cobra con el tope anterior. Es la ventana residual de `design §6.2`.
//
// La lectura se envuelve sin cambiarla, para contar las consultas reales (R37) y no las llamadas a un doble.
//
// Los helpers son los de `tope-intentos-caminos.test.ts`, recortados a lo que aqui hace falta.

vi.mock("@/lib/repositories/_shared/tope-intentos-empresa", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/repositories/_shared/tope-intentos-empresa")>();
  return { ...real, leerTopeIntentosDeLaEmpresa: vi.fn(real.leerTopeIntentosDeLaEmpresa) };
});

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const lecturasDelTope = vi.mocked(leerTopeIntentosDeLaEmpresa);

// Tarifa de rechazo sembrada en la zona: un rechazo la cobra en el siguiente cierre; sin rechazo, nada.
const COBRO_RECHAZO = "164.00";
const SIN_COBRO = "0.00";
const POR_TOPE = "ya agoto sus intentos de entrega";
const ESTADO_RECHAZO = "devolucion_a_origen_por_rechazo";
// Lejos de cualquier ventana: un `not_found` vence a las 24 horas y un `wrong_*` a los 5 dias.
const EN_40_DIAS = () => new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
const TIEMPO_CON_50_ORDENES = 120_000;

interface Empresa {
  id: string;
  e: Escenario;
  tx: TxDeTest;
  cliente: PrismaClient;
}

let base: PrismaClient;

beforeAll(() => {
  if (!HAY_BASE_DE_DATOS) return;
  base = crearPrismaDeTest();
});

afterAll(async () => {
  if (base) await base.$disconnect();
});

beforeEach(() => {
  lecturasDelTope.mockClear();
});

async function mundoDe(tx: TxDeTest, prisma: PrismaClient): Promise<Mundo> {
  const canton = await tx.canton.findFirstOrThrow({
    where: { nombre: "Cartago", provincia: { nombre: "Cartago" } },
    select: { id: true, provinciaId: true },
  });
  const tipo = await tx.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
  const roles = await tx.rol.findMany({ select: { id: true, value: true } });
  const catalogo = await tx.orderStatus.findMany({ select: { id: true, value: true } });
  const central = await tx.zona.create({
    data: { nombre: `Central ${randomUUID().slice(0, 12)}`, esCentral: true, sinpeNumero: "80000000", sinpeNombre: "Titular" },
    select: { id: true },
  });
  await tx.tarifaZonaMensajero.create({
    data: { zonaId: central.id, vehiculoId: null, cobroEntregado: "1500.00", cobroRechazado: COBRO_RECHAZO },
  });
  return {
    prisma,
    fks: { tiendaId: "", zonaId: central.id, provinciaId: canton.provinciaId, cantonId: canton.id },
    tipoIdentificacionId: tipo.id,
    rolId: new Map(roles.map((r) => [r.value as string, r.id])),
    estatus: new Map(catalogo.map((c) => [c.value, c.id])),
    valorDeEstatus: new Map(catalogo.map((c) => [c.id, c.value])),
    centralZonaId: central.id,
  };
}

async function sembrar<T>(em: Empresa, fn: () => Promise<T>): Promise<T> {
  await fijarEmpresa(em.tx, em.id);
  return fn();
}

async function como<T>(em: Empresa, fn: () => Promise<T>): Promise<T> {
  await comoApp(em.tx, em.id);
  try {
    return await conEmpresa(em.id, fn);
  } finally {
    await em.tx.$executeRawUnsafe("RESET ROLE");
  }
}

async function nuevaEmpresa(tx: TxDeTest): Promise<Empresa> {
  await serializarEscriturasReales(tx);
  const { id } = await crearOrganizacion(tx);
  await fijarEmpresa(tx, id);
  const cliente = clienteConTransaccionAnidada(tx);
  const e = await crearEscenario(await mundoDe(tx, base), tx, cliente);
  return { id, e, tx, cliente };
}

/** Guarda por el servicio real. Sin `como`: lo llama tambien el doble, que ya corre como la app. */
async function guardarTope(em: Empresa, tope: number): Promise<void> {
  const servicio = new TopeIntentosService(new TopeIntentosRepository(clienteConSavepoint(em.tx)));
  const r = await servicio.guardar({ tope }, { usuarioId: em.e.maestroId, rol: "maestro" });
  expect(r).toEqual({ status: "ok", tope });
}

const fijarTope = (em: Empresa, tope: number) => como(em, () => guardarTope(em, tope));
const topeVigente = (em: Empresa) => como(em, () => em.e.s.historialService.topeIntentos());

type Destino = "en_reparto" | "en_bodega_central" | "novedad";

async function colocar(em: Empresa, ordenIds: string[], destino: Destino): Promise<void> {
  const enMano = destino !== "en_bodega_central";
  await sembrar(em, () =>
    em.tx.orden.updateMany({
      where: { id: { in: ordenIds } },
      data: {
        estatusId: em.e.id(destino),
        mensajeroAsignadoId: enMano ? em.e.mensajeroId : null,
        asignadoAt: enMano ? new Date() : null,
        fechaReparto: null,
        prioridad: false,
        latitud: 9.93,
        longitud: -84.08,
      },
    }),
  );
}

async function ordenes(em: Empresa, cuantas: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < cuantas; i++) {
    const o = await sembrar(em, () => em.e.sembrarOrden({ estatus: "en_reparto", zona: "central", montoCobrar: 8000 }));
    ids.push(o.ordenId);
  }
  return ids;
}

const fechaFutura = () => diaCR(30).toISOString().slice(0, 10);

/** Dos intentos reales por lote, comprobados: un `reprogramado` por el panel, un cierre solicitado y aprobado. */
async function dosIntentosReales(em: Empresa, ordenIds: string[]): Promise<void> {
  for (let i = 0; i < 2; i++) {
    await colocar(em, ordenIds, "en_reparto");
    await como(em, async () => {
      for (const ordenId of ordenIds) {
        await em.e.gestionarOk(ordenId, "reprogramado", { fechaReprogramacion: fechaFutura() });
      }
      const cierreId = await em.e.solicitarCierreOk();
      expect((await em.e.aprobar(cierreId)).status).toBe("ok");
    });
  }
  for (const id of ordenIds) {
    expect(await como(em, () => em.e.s.historialService.contarIntentos(id))).toBe(2);
  }
}

/** Una empresa con el tope dado, y `cuantas` ordenes con 2 intentos, sacadas ya de donde las deja el flujo. */
async function empresaConOrdenes(tx: TxDeTest, tope: number, cuantas: number): Promise<{ em: Empresa; ids: string[] }> {
  const em = await nuevaEmpresa(tx);
  const ids = await ordenes(em, cuantas);
  await dosIntentosReales(em, ids);
  await colocar(em, ids, "en_reparto");
  await fijarTope(em, tope);
  return { em, ids };
}

async function ponerNovedad(em: Empresa, ordenIds: string[], causa: "not_found" | "wrong_number"): Promise<void> {
  await colocar(em, ordenIds, "novedad");
  await sembrar(em, () =>
    em.tx.gestionOrden.createMany({
      data: ordenIds.map((ordenId) => ({
        ordenId,
        mensajeroId: em.e.mensajeroId,
        resultado: "novedad" as const,
        causaDevolucion: causa,
        motivo: "Sin dato",
      })),
    }),
  );
}

/** El historial real, salvo que su PRIMERA lectura del tope, justo despues de leer, deja guardado otro valor. */
function historialQueCambiaElTopeTrasLeer(em: Empresa, nuevo: number) {
  const real = em.e.s.historialService;
  let pendiente = true;
  return {
    contarIntentosEnLote: (ids: string[]) => real.contarIntentosEnLote(ids),
    topeIntentos: vi.fn(async () => {
      const leido = await real.topeIntentos();
      if (pendiente) {
        pendiente = false;
        await guardarTope(em, nuevo);
      }
      return leido;
    }),
  };
}

function proceso(em: Empresa, historial: ConstructorParameters<typeof DevolucionSlaService>[3] = em.e.s.historialService) {
  return new DevolucionSlaService(new DevolucionSlaRepository(em.cliente), em.e.s.zonaRepo, em.e.s.ordenRepo, historial);
}

const correr = (em: Empresa, ahora: Date, historial?: ConstructorParameters<typeof DevolucionSlaService>[3]) =>
  como(em, () => proceso(em, historial).ejecutar(ahora));

/** Barre lo que el mensajero tiene en la mano y deja el cierre vencido listo para aprobar. */
async function barrer(em: Empresa): Promise<string> {
  return como(em, async () => {
    await em.e.correrCorte(new Date());
    const vencido = await em.tx.cierreDia.findFirstOrThrow({
      where: { mensajeroId: em.e.mensajeroId, estado: "vencido" },
      select: { id: true },
    });
    await em.e.solicitarCierre();
    return vencido.id;
  });
}

/** Aprueba con la lectura del servicio real, y justo despues de leer deja guardado otro valor. */
async function aprobarCambiandoElTope(em: Empresa, cierreId: string, nuevo: number): Promise<void> {
  const repo = em.e.s.adminRepo;
  const leer = repo.leerTopeIntentos.bind(repo);
  const espia = vi.spyOn(repo, "leerTopeIntentos").mockImplementationOnce(async () => {
    const leido = await leer();
    await guardarTope(em, nuevo);
    return leido;
  });
  try {
    const r = await como(em, () => em.e.aprobar(cierreId));
    expect(r.status).toBe("ok");
    expect(espia).toHaveBeenCalledTimes(1);
  } finally {
    espia.mockRestore();
  }
}

// ─── Lo que un rechazo deja detras. Los tres, porque el cobro sale de la gestion y no del estado. ───

const sinteticasDe = (em: Empresa, ordenId: string) =>
  sembrar(em, () =>
    em.tx.gestionOrden.findMany({
      where: { ordenId, resultado: ESTADO_RECHAZO },
      select: { cierreId: true, motivo: true, ingresoBodegaRechazo: true },
    }),
  );

const rastroDeRechazoDe = (em: Empresa, ordenId: string) =>
  sembrar(em, () =>
    em.tx.ordenHistorialEstado.count({
      where: { ordenId, origenTipo: { in: ["escalado_devuelta_sla", "rechazo_tope_intentos"] } },
    }),
  );

async function afirmarQueNoSeRechazoNiSeCobro(em: Empresa, ordenId: string): Promise<void> {
  expect(await sinteticasDe(em, ordenId)).toEqual([]);
  expect(await rastroDeRechazoDe(em, ordenId)).toBe(0);
}

async function cobroDelSiguienteCierre(em: Empresa): Promise<string> {
  return como(em, async () => {
    const r = await em.e.solicitarCierre();
    if (r.status !== "ok" || r.via !== "creado" || r.cierreId === undefined) return "sin cierre";
    const c = await em.tx.cierreDia.findUniqueOrThrow({
      where: { id: r.cierreId },
      select: { totalIngresoBodegaRechazos: true },
    });
    return c.totalIngresoBodegaRechazos.toFixed(2);
  });
}

const enTransaccion = <T>(fn: (tx: TxDeTest) => Promise<T>) => enTransaccionRevertida(base, fn);

describeSiHayBase("SLT-77 R34 — una ejecucion decide todas sus ordenes con un solo valor", () => {
  it("el tope baja tras la lectura: las dos ordenes esperan su ventana con el leido, ninguna escala con el nuevo", async () => {
    await enTransaccion(async (tx) => {
      const { em, ids } = await empresaConOrdenes(tx, 4, 2);
      await ponerNovedad(em, ids, "wrong_number");
      const historial = historialQueCambiaElTopeTrasLeer(em, 2);

      const r = await correr(em, new Date(), historial);

      expect(r).toEqual({ evaluadas: 2, liberadas: 0, escaladas: 0, omitidas: 0, legadas: 2 });
      expect(historial.topeIntentos).toHaveBeenCalledTimes(1);
      expect(await topeVigente(em)).toBe(2);
      for (const id of ids) {
        expect(await em.e.estadoDe(id)).toBe("novedad");
        await afirmarQueNoSeRechazoNiSeCobro(em, id);
      }
    });
  });

  it("el tope sube tras la lectura: las dos ordenes parten del leido y las dos quedan vetadas, sin ninguna a medias", async () => {
    await enTransaccion(async (tx) => {
      const { em, ids } = await empresaConOrdenes(tx, 2, 2);
      await ponerNovedad(em, ids, "wrong_number");
      const historial = historialQueCambiaElTopeTrasLeer(em, 4);

      const r = await correr(em, new Date(), historial);

      expect(r).toEqual({ evaluadas: 0, liberadas: 0, escaladas: 0, omitidas: 2, legadas: 2 });
      expect(historial.topeIntentos).toHaveBeenCalledTimes(1);
      for (const id of ids) {
        expect(await em.e.estadoDe(id)).toBe("novedad");
        await afirmarQueNoSeRechazoNiSeCobro(em, id);
      }
    });
  });
});

describeSiHayBase("SLT-77 R35 — si el tope vigente deja a la orden por debajo, no se rechaza ni se cobra", () => {
  it("proceso, `wrong_number` sin vencer: queda en novedad, omitida, sin gestion sintetica y sin cobro", async () => {
    await enTransaccion(async (tx) => {
      const { em, ids } = await empresaConOrdenes(tx, 2, 1);
      await ponerNovedad(em, ids, "wrong_number");
      const ahora = new Date();

      const r = await correr(em, ahora, historialQueCambiaElTopeTrasLeer(em, 4));

      expect(r).toEqual({ evaluadas: 0, liberadas: 0, escaladas: 0, omitidas: 1, legadas: 1 });
      expect(await topeVigente(em)).toBe(4);
      expect(await em.e.estadoDe(ids[0])).toBe("novedad");
      await afirmarQueNoSeRechazoNiSeCobro(em, ids[0]);

      // La corrida siguiente decide con el nuevo: por debajo del tope, la ventana sigue corriendo.
      expect(await correr(em, ahora)).toEqual({ evaluadas: 1, liberadas: 0, escaladas: 0, omitidas: 0, legadas: 1 });
      expect(await em.e.estadoDe(ids[0])).toBe("novedad");
      await afirmarQueNoSeRechazoNiSeCobro(em, ids[0]);
      expect(await cobroDelSiguienteCierre(em)).toBe(SIN_COBRO);
    });
  });

  it("proceso, `not_found` vencida: vetada, tampoco se libera; la corrida siguiente la libera, sin cobro", async () => {
    await enTransaccion(async (tx) => {
      const { em, ids } = await empresaConOrdenes(tx, 2, 1);
      await ponerNovedad(em, ids, "not_found");
      const vencida = EN_40_DIAS();

      const r = await correr(em, vencida, historialQueCambiaElTopeTrasLeer(em, 4));

      expect(r).toEqual({ evaluadas: 0, liberadas: 0, escaladas: 0, omitidas: 1, legadas: 1 });
      expect(await em.e.estadoDe(ids[0])).toBe("novedad");
      await afirmarQueNoSeRechazoNiSeCobro(em, ids[0]);

      expect(await correr(em, vencida)).toEqual({ evaluadas: 0, liberadas: 1, escaladas: 0, omitidas: 0, legadas: 1 });
      expect(await em.e.estadoDe(ids[0])).toBe("en_bodega_central");
      await afirmarQueNoSeRechazoNiSeCobro(em, ids[0]);
    });
  });

  it("proceso, `wrong_number` con la ventana vencida: escala igual y cobra, porque no se debe al tope", async () => {
    await enTransaccion(async (tx) => {
      const { em, ids } = await empresaConOrdenes(tx, 2, 1);
      await ponerNovedad(em, ids, "wrong_number");

      const r = await correr(em, EN_40_DIAS(), historialQueCambiaElTopeTrasLeer(em, 4));

      expect(r).toEqual({ evaluadas: 0, liberadas: 0, escaladas: 1, omitidas: 0, legadas: 1 });
      expect(await topeVigente(em)).toBe(4);
      expect(await em.e.estadoDe(ids[0])).toBe(ESTADO_RECHAZO);
      expect(await rastroDeRechazoDe(em, ids[0])).toBe(1);
      expect(await cobroDelSiguienteCierre(em)).toBe(COBRO_RECHAZO);
    });
  });

  it("proceso: si el tope sube pero la orden sigue agotada con el nuevo, escala y cobra", async () => {
    await enTransaccion(async (tx) => {
      const { em, ids } = await empresaConOrdenes(tx, 1, 1);
      await ponerNovedad(em, ids, "wrong_number");

      const r = await correr(em, new Date(), historialQueCambiaElTopeTrasLeer(em, 2));

      expect(r).toEqual({ evaluadas: 0, liberadas: 0, escaladas: 1, omitidas: 0, legadas: 1 });
      expect(await em.e.estadoDe(ids[0])).toBe(ESTADO_RECHAZO);
      expect(await cobroDelSiguienteCierre(em)).toBe(COBRO_RECHAZO);
    });
  });

  it("aprobacion: las dos barridas van a bodega con el mayor, sin gestion sintetica y sin cobro", async () => {
    await enTransaccion(async (tx) => {
      const { em, ids } = await empresaConOrdenes(tx, 2, 2);
      const cierreId = await barrer(em);

      await aprobarCambiandoElTope(em, cierreId, 4);

      expect(await topeVigente(em)).toBe(4);
      for (const id of ids) {
        expect(await em.e.estadoDe(id)).toBe("en_bodega_central");
        expect((await em.e.ordenDe(id)).prioridad).toBe(true);
        await afirmarQueNoSeRechazoNiSeCobro(em, id);
      }
      expect(await cobroDelSiguienteCierre(em)).toBe("sin cierre");
    });
  });
});

describeSiHayBase("SLT-77 R36 — si el tope baja mientras corre, termina con el mayor y se resuelve despues", () => {
  it("proceso: no rechaza en esa corrida, y la siguiente si, con su cobro", async () => {
    await enTransaccion(async (tx) => {
      const { em, ids } = await empresaConOrdenes(tx, 4, 1);
      await ponerNovedad(em, ids, "wrong_number");
      const ahora = new Date();

      const r = await correr(em, ahora, historialQueCambiaElTopeTrasLeer(em, 2));

      expect(r).toEqual({ evaluadas: 1, liberadas: 0, escaladas: 0, omitidas: 0, legadas: 1 });
      expect(await topeVigente(em)).toBe(2);
      expect(await em.e.estadoDe(ids[0])).toBe("novedad");
      await afirmarQueNoSeRechazoNiSeCobro(em, ids[0]);

      expect(await correr(em, ahora)).toEqual({ evaluadas: 0, liberadas: 0, escaladas: 1, omitidas: 0, legadas: 1 });
      expect(await em.e.estadoDe(ids[0])).toBe(ESTADO_RECHAZO);
      expect(await cobroDelSiguienteCierre(em)).toBe(COBRO_RECHAZO);
    });
  });

  it("aprobacion: va a bodega con el mayor, sin cobro, y su siguiente paso ya la frena por el tope nuevo", async () => {
    await enTransaccion(async (tx) => {
      const { em, ids } = await empresaConOrdenes(tx, 4, 1);
      const cierreId = await barrer(em);

      await aprobarCambiandoElTope(em, cierreId, 2);

      expect(await topeVigente(em)).toBe(2);
      expect(await em.e.estadoDe(ids[0])).toBe("en_bodega_central");
      await afirmarQueNoSeRechazoNiSeCobro(em, ids[0]);
      expect(await cobroDelSiguienteCierre(em)).toBe("sin cierre");

      const m = await sembrar(em, () => em.e.mensajeroCentral());
      await sembrar(em, async () => {
        const v = await em.tx.vehiculo.create({ data: { name: `Moto ${randomUUID().slice(0, 12)}` }, select: { id: true } });
        await em.tx.usuario.update({ where: { id: m.mensajeroId }, data: { vehiculoId: v.id } });
      });
      const asignacion = new GuiaAsignacionService(
        em.e.s.ordenRepo,
        em.e.s.zonaRepo,
        new AsignabilidadCoordenadasService(new JobRepository(em.cliente)),
        em.e.s.historialService,
      );
      const r = await como(em, () =>
        asignacion.asignarDesdeBodega({ ordenIds: ids, mensajeroId: m.mensajeroId }, em.e.actorMaestro),
      );
      expect(r.status).toBe("conflict");
      expect(JSON.stringify(r)).toContain(POR_TOPE);
      expect(await em.e.estadoDe(ids[0])).toBe("en_bodega_central");
    });
  });
});

describeSiHayBase("SLT-77 R37 — las lecturas del tope no crecen con las candidatas", () => {
  async function lecturasDeUnaCorridaCon(tx: TxDeTest, candidatas: number): Promise<number> {
    const em = await nuevaEmpresa(tx);
    const ids = await ordenes(em, candidatas);
    await ponerNovedad(em, ids, "wrong_number");
    lecturasDelTope.mockClear();

    const r = await correr(em, new Date());

    expect(r).toEqual({ evaluadas: candidatas, liberadas: 0, escaladas: 0, omitidas: 0, legadas: candidatas });
    return lecturasDelTope.mock.calls.length;
  }

  it(
    "con 1 y con 50 candidatas que no se rechazan, la corrida lee el tope 1 vez",
    async () => {
      await enTransaccion(async (tx) => {
        expect(await lecturasDeUnaCorridaCon(tx, 1)).toBe(1);
        expect(await lecturasDeUnaCorridaCon(tx, 50)).toBe(1);
      });
    },
    TIEMPO_CON_50_ORDENES,
  );

  it("con 3 rechazos por tope: 1 de la corrida y 1 por rechazo, 4", async () => {
    await enTransaccion(async (tx) => {
      const { em, ids } = await empresaConOrdenes(tx, 2, 3);
      await ponerNovedad(em, ids, "wrong_number");
      lecturasDelTope.mockClear();

      const r = await correr(em, new Date());

      expect(r).toEqual({ evaluadas: 0, liberadas: 0, escaladas: 3, omitidas: 0, legadas: 3 });
      expect(lecturasDelTope).toHaveBeenCalledTimes(4);
    });
  });

  it("una ventana vencida de `wrong_number` no es rechazo por tope, y no relee: 1", async () => {
    await enTransaccion(async (tx) => {
      const { em, ids } = await empresaConOrdenes(tx, 4, 1);
      await ponerNovedad(em, ids, "wrong_number");
      lecturasDelTope.mockClear();

      const r = await correr(em, EN_40_DIAS());

      expect(r).toEqual({ evaluadas: 0, liberadas: 0, escaladas: 1, omitidas: 0, legadas: 1 });
      expect(lecturasDelTope).toHaveBeenCalledTimes(1);
    });
  });

  it("la aprobacion lee 2 veces, con 1 y con 3 barridas: al empezar y en la transaccion", async () => {
    await enTransaccion(async (tx) => {
      for (const barridas of [1, 3]) {
        const { em } = await empresaConOrdenes(tx, 4, barridas);
        const cierreId = await barrer(em);
        lecturasDelTope.mockClear();

        expect((await como(em, () => em.e.aprobar(cierreId))).status).toBe("ok");

        expect(lecturasDelTope).toHaveBeenCalledTimes(2);
      }
    });
  });
});
