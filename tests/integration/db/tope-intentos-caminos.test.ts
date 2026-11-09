import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { guiaDecisionErrorMessage } from "@/app/(app)/ordenes/_components/guia-decision-error-messages";
import { handleProcesarDevueltasSla } from "@/app/api/cron/procesar-devueltas-sla/route";
import { conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { MODELOS_DE_NEGOCIO } from "@/lib/db/modelos-de-negocio";
import type { ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { AvisoAgregadoRepository } from "@/lib/repositories/AvisoAgregadoRepository";
import { DevolucionSlaRepository } from "@/lib/repositories/DevolucionSlaRepository";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TopeIntentosRepository } from "@/lib/repositories/TopeIntentosRepository";
import { AsignabilidadCoordenadasService } from "@/lib/services/AsignabilidadCoordenadasService";
import { AsignacionSateliteService } from "@/lib/services/AsignacionSateliteService";
import { AvisosDiariosService } from "@/lib/services/AvisosDiariosService";
import { DevolucionSlaService } from "@/lib/services/DevolucionSlaService";
import { GuiaAsignacionService } from "@/lib/services/GuiaAsignacionService";
import { MSG_TOPE_INTENTOS_ASIGNACION } from "@/lib/services/mensajes-bloqueo";
import { NovedadesService } from "@/lib/services/NovedadesService";
import { ReprogramacionTiendaService } from "@/lib/services/ReprogramacionTiendaService";
import { buildReprogramadasRetenidasService } from "@/lib/services/reprogramadas-retenidas-composicion";
import { TopeIntentosService } from "@/lib/services/TopeIntentosService";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { comoApp, crearOrganizacion, datosDeOrganizacionDePrueba, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearEscenario, diaCR, type Escenario, type Mundo } from "./454/_escenario";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  tomarLockDeEscrituraReal,
  type TxDeTest,
} from "./_postgres-real";

// SLT-77 T3.4 (design §3, §6, §10) — CADA PUNTO DECIDE CON EL TOPE DE LA EMPRESA DE LA ORDEN.
//
// ⚠️ ESTA FICHA ACELERA DINERO (276): llegar al tope lleva a un rechazo, y el rechazo cobra. Por eso cada caso afirma
// los DOS lados con la misma orden: la empresa A con tope 2 y la B con tope 4, las dos con 2 intentos. Un `3`
// escrito a mano en un punto cae por uno de los dos, porque 3 no da lo mismo que 2 ni que 4 en las dos preguntas:
// «agotada» (`>= tope`) cae por A y «en el tope» (`>= tope - 1`) cae por B.
//
// Los servicios son los REALES sobre Postgres, y corren como `servi_app` en la empresa, con RLS: sin bajar de rol la
// zona central y las lecturas sin filtro cruzarian empresas, cosa que en produccion no pasa. Los intentos son reales:
// `gestionar`, `solicitarCierre` y `aprobar`, dos veces. Cada caso va en una transaccion revertida, salvo el del cron,
// que abre las suyas y commitea (por eso limpia).
//
// `prepararMundo` de la 454 no sirve aqui: exige una orden ya sembrada en la base y una zona central ajena. Cada empresa
// monta su `Mundo`, y `crearEscenario` hace el resto.
//
// Los topes, los intentos y los importes van a mano: son el contrato. Tarifa de rechazo de las dos zonas: 164,00.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

// El motivo importa: `conflict` tambien lo da «tienes otra orden activa», y un rechazo por otra causa pasaria por tope.
const POR_TOPE = "ya agoto sus intentos de entrega";

function rechazadaPorTope(r: { status: string; motivo?: string }, caso: string): void {
  expect(r.status, caso).toBe("conflict");
  expect(r.motivo ?? "", caso).toContain(POR_TOPE);
}

function loteRechazadoPorTope(r: { status: string; detalle?: { ordenId: string; motivo: string }[] }, lote: string[]): void {
  expect(r.status).toBe("conflict");
  expect(r.detalle?.map((d) => d.ordenId).sort()).toEqual([...lote].sort());
  // El motivo exacto: el de gestion tambien lleva `POR_TOPE`, y el mapper de las pantallas de asignacion no lo reconoce.
  for (const d of r.detalle ?? []) expect(d.motivo).toBe(MSG_TOPE_INTENTOS_ASIGNACION);
}

const COBRO_RECHAZO = "164.00";
// Lejos de cualquier ventana: un `not_found` vence a las 24 horas y un `wrong_*` a los 5 dias.
const EN_40_DIAS = () => new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);

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

/** Lo que se siembra, como dueño y con la empresa fijada: el `DEFAULT` de `organizacion_id` hace el resto. */
async function sembrar<T>(em: Empresa, fn: () => Promise<T>): Promise<T> {
  await fijarEmpresa(em.tx, em.id);
  return fn();
}

/** Lo que se mide: como la aplicacion, `servi_app` con RLS y la empresa en contexto. */
async function como<T>(em: Empresa, fn: () => Promise<T>): Promise<T> {
  await comoApp(em.tx, em.id);
  try {
    return await conEmpresa(em.id, fn);
  } finally {
    await em.tx.$executeRawUnsafe("RESET ROLE");
  }
}

async function nuevaEmpresa(tx: TxDeTest, prisma: PrismaClient): Promise<Empresa> {
  const { id } = await crearOrganizacion(tx);
  await fijarEmpresa(tx, id);
  const cliente = clienteConTransaccionAnidada(tx);
  const e = await crearEscenario(await mundoDe(tx, prisma), tx, cliente);
  return { id, e, tx, cliente };
}

/** El camino de verdad para cambiar el tope: el servicio, con el `maestro`, sin tocar nada mas. */
async function fijarTope(em: Empresa, tope: number): Promise<void> {
  const servicio = new TopeIntentosService(new TopeIntentosRepository(clienteConSavepoint(em.tx)));
  const r = await como(em, () => servicio.guardar({ tope }, { usuarioId: em.e.maestroId, rol: "maestro" }));
  expect(r).toEqual({ status: "ok", tope });
}

type Destino = "en_reparto" | "en_bodega_central" | "en_bodega_satelite" | "novedad";

/** Deja una orden donde la pone el flujo que aqui no se prueba: la liberacion y la asignacion. */
async function colocar(em: Empresa, ordenIds: string[], destino: Destino): Promise<void> {
  const enMano = destino === "en_reparto" || destino === "novedad";
  await sembrar(em, () =>
    em.tx.orden.updateMany({
      where: { id: { in: ordenIds } },
      data: {
        estatusId: em.e.id(destino),
        mensajeroAsignadoId: enMano ? em.e.mensajeroId : null,
        asignadoAt: enMano ? new Date() : null,
        fechaReparto: null,
        prioridad: false,
        // El gate de coordenadas de la asignacion no es lo que se mide aqui.
        latitud: 9.93,
        longitud: -84.08,
      },
    }),
  );
}

const fechaFutura = () => diaCR(30).toISOString().slice(0, 10);

/**
 * `veces` intentos REALES sobre un lote: cada vuelta, un `reprogramado` por el panel, un cierre solicitado y aprobado.
 * Se hace con el tope de partida, 3, que admite los dos: bajarlo despues es justo lo que un `maestro` haria.
 */
async function intentosReales(em: Empresa, ordenIds: string[], veces: number, destino: Destino): Promise<void> {
  for (let i = 0; i < veces; i++) {
    await colocar(em, ordenIds, "en_reparto");
    await como(em, async () => {
      for (const ordenId of ordenIds) {
        await em.e.gestionarOk(ordenId, "reprogramado", { fechaReprogramacion: fechaFutura() });
      }
      const cierreId = await em.e.solicitarCierreOk();
      const aprobacion = await em.e.aprobar(cierreId);
      expect(aprobacion.status).toBe("ok");
    });
  }
  await colocar(em, ordenIds, destino);
}

async function ordenes(em: Empresa, cuantas: number, zona: "central" | "satelite" = "central"): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < cuantas; i++) {
    const o = await sembrar(em, () => em.e.sembrarOrden({ estatus: "en_reparto", zona, montoCobrar: 8000 }));
    ids.push(o.ordenId);
  }
  return ids;
}

/** A con tope 2 y B con tope 4, y en cada una `cuantas` ordenes con 2 intentos, ya comprobados. */
async function dosEmpresas(
  tx: TxDeTest,
  cuantas: number,
  destino: Destino,
  zona: "central" | "satelite" = "central",
): Promise<{ A: Empresa; B: Empresa; deA: string[]; deB: string[] }> {
  await serializarEscriturasReales(tx);
  const A = await nuevaEmpresa(tx, base);
  const B = await nuevaEmpresa(tx, base);
  const deA = await ordenes(A, cuantas, zona);
  const deB = await ordenes(B, cuantas, zona);
  await intentosReales(A, deA, 2, destino);
  await intentosReales(B, deB, 2, destino);
  await fijarTope(A, 2);
  await fijarTope(B, 4);
  for (const [em, ids] of [
    [A, deA],
    [B, deB],
  ] as const) {
    for (const id of ids) {
      expect(await como(em, () => em.e.s.historialService.contarIntentos(id))).toBe(2);
    }
  }
  return { A, B, deA, deB };
}

const enTransaccion = <T>(fn: (tx: TxDeTest) => Promise<T>) => enTransaccionRevertida(base, fn);

/** Una novedad vigente, sin cierre: no suma intento, y lleva la causa que decide la ventana. */
async function ponerNovedad(em: Empresa, ordenId: string, causa: "not_found" | "wrong_number"): Promise<void> {
  await colocar(em, [ordenId], "novedad");
  await sembrar(em, () =>
    em.tx.gestionOrden.create({
      data: { ordenId, mensajeroId: em.e.mensajeroId, resultado: "novedad", causaDevolucion: causa, motivo: "Sin dato" },
    }),
  );
}

function procesoDevoluciones(em: Empresa) {
  return new DevolucionSlaService(
    new DevolucionSlaRepository(em.cliente),
    em.e.s.zonaRepo,
    em.e.s.ordenRepo,
    em.e.s.historialService,
  );
}

/** Rechazos que el sistema escribio sobre una orden. */
const sinteticasDe = (em: Empresa, ordenId: string) =>
  sembrar(em, () =>
    em.tx.gestionOrden.findMany({
      where: { ordenId, resultado: "devolucion_a_origen_por_rechazo" },
      select: { cierreId: true, motivo: true },
    }),
  );

/**
 * 💰 El dinero del rechazo, donde cae de verdad: la gestion sintetica entra en el SIGUIENTE cierre del mensajero, y ese
 * cierre lleva el `cobroRechazado` de la zona. Se pide el cierre por el servicio y se lee lo que quedo en la base.
 */
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

async function camposDeIngreso(em: Empresa, ordenId: string): Promise<string[]> {
  const filas = await sembrar(em, () =>
    em.tx.gestionOrden.findMany({
      where: { ordenId, resultado: "devolucion_a_origen_por_rechazo" },
      select: { ingresoBodegaRechazo: true },
    }),
  );
  return filas.map((f) => f.ingresoBodegaRechazo?.toFixed(2) ?? "null");
}

describeSiHayBase("SLT-77 R18 — el servidor no acepta `reprogramado` ni `novedad` sobre una orden en el tope", () => {
  it("el panel del mensajero: A responde conflict, sin fila; B acepta", async () => {
    await enTransaccion(async (tx) => {
      const { A, B, deA, deB } = await dosEmpresas(tx, 2, "en_reparto");
      for (const [i, resultado] of (["reprogramado", "novedad"] as const).entries()) {
        const opts = { fechaReprogramacion: fechaFutura() };
        const antes = (await A.e.gestionesDe(deA[i])).length;
        const enA = await como(A, () => A.e.gestionar(deA[i], resultado, opts));
        rechazadaPorTope(enA, resultado);
        expect((await A.e.gestionesDe(deA[i])).length, resultado).toBe(antes);

        const antesB = (await B.e.gestionesDe(deB[i])).length;
        const enB = await como(B, () => B.e.gestionar(deB[i], resultado, opts));
        expect(enB.status, resultado).toBe("ok");
        expect((await B.e.gestionesDe(deB[i])).length, resultado).toBe(antesB + 1);
      }
    });
  });

  it("la ayuda de la tienda: A responde conflict, sin fila; B acepta", async () => {
    await enTransaccion(async (tx) => {
      const { A, B, deA, deB } = await dosEmpresas(tx, 1, "en_reparto");
      for (const [em, ordenId] of [
        [A, deA[0]],
        [B, deB[0]],
      ] as const) {
        await como(em, () => em.e.pedirAyuda(ordenId));
      }
      const antes = (await A.e.gestionesDe(deA[0])).length;
      const enA = await como(A, () => A.e.gestionarDesdeAyuda(deA[0], "reprogramado", { fechaReprogramacion: fechaFutura() }));
      rechazadaPorTope(enA, "ayuda");
      expect((await A.e.gestionesDe(deA[0])).length).toBe(antes);

      const antesB = (await B.e.gestionesDe(deB[0])).length;
      const enB = await como(B, () => B.e.gestionarDesdeAyuda(deB[0], "reprogramado", { fechaReprogramacion: fechaFutura() }));
      expect(enB.status).toBe("ok");
      expect((await B.e.gestionesDe(deB[0])).length).toBe(antesB + 1);
    });
  });
});

describeSiHayBase("SLT-77 R19 — la tienda no reprograma desde una devolucion una orden agotada", () => {
  it("A responde conflict y la orden no se mueve; B la reprograma", async () => {
    await enTransaccion(async (tx) => {
      const { A, B, deA, deB } = await dosEmpresas(tx, 1, "en_reparto");
      await ponerNovedad(A, deA[0], "not_found");
      await ponerNovedad(B, deB[0], "not_found");
      const servicio = (em: Empresa) =>
        new ReprogramacionTiendaService(em.e.s.ordenRepo, em.e.s.gestionRepo, em.e.s.historialService);

      const antes = (await A.e.gestionesDe(deA[0])).length;
      const enA = await como(A, () => servicio(A).reprogramar(deA[0], fechaFutura(), "Pide otro dia", A.e.actorTienda));
      rechazadaPorTope(enA, "reprogramar");
      expect(await A.e.estadoDe(deA[0])).toBe("novedad");
      expect((await A.e.gestionesDe(deA[0])).length).toBe(antes);

      const enB = await como(B, () => servicio(B).reprogramar(deB[0], fechaFutura(), "Pide otro dia", B.e.actorTienda));
      expect(enB.status).toBe("ok");
      expect(await B.e.estadoDe(deB[0])).toBe("reprogramado");
    });
  });
});

describeSiHayBase("SLT-77 R20 — una orden agotada para su empresa frena el lote entero", () => {
  async function mensajeroConVehiculo(em: Empresa, usuarioId: string): Promise<void> {
    await sembrar(em, async () => {
      const v = await em.tx.vehiculo.create({ data: { name: `Moto ${randomUUID().slice(0, 12)}` }, select: { id: true } });
      await em.tx.usuario.update({ where: { id: usuarioId }, data: { vehiculoId: v.id } });
    });
  }

  it("bodega central, con un lote mixto: en A nada se asigna; en B, todo", async () => {
    await enTransaccion(async (tx) => {
      const { A, B, deA, deB } = await dosEmpresas(tx, 1, "en_bodega_central");
      const mixtoDe = async (em: Empresa, agotada: string) => {
        const [limpia] = await ordenes(em, 1);
        await colocar(em, [limpia], "en_bodega_central");
        return [agotada, limpia];
      };
      const servicio = (em: Empresa) =>
        new GuiaAsignacionService(
          em.e.s.ordenRepo,
          em.e.s.zonaRepo,
          new AsignabilidadCoordenadasService(new JobRepository(em.cliente)),
          em.e.s.historialService,
          reglasPaisFijas(),
        );

      const loteA = await mixtoDe(A, deA[0]);
      const mA = await sembrar(A, () => A.e.mensajeroCentral());
      await mensajeroConVehiculo(A, mA.mensajeroId);
      const enA = await como(A, () =>
        servicio(A).asignarDesdeBodega(
          { ordenIds: loteA, mensajeroId: mA.mensajeroId },
          A.e.actorMaestro,
        ),
      );
      loteRechazadoPorTope(enA as never, loteA);
      // R42: lo que emite el servicio real, por el mapper de la central, hasta el texto de pantalla.
      expect(guiaDecisionErrorMessage(enA)).toBe(
        "Alguna orden de la selección ya agotó sus intentos de entrega y no puede volver a salir a reparto. Quítala de la selección.",
      );
      for (const id of loteA) expect(await A.e.estadoDe(id)).toBe("en_bodega_central");

      const loteB = await mixtoDe(B, deB[0]);
      const mB = await sembrar(B, () => B.e.mensajeroCentral());
      await mensajeroConVehiculo(B, mB.mensajeroId);
      const enB = await como(B, () =>
        servicio(B).asignarDesdeBodega(
          { ordenIds: loteB, mensajeroId: mB.mensajeroId },
          B.e.actorMaestro,
        ),
      );
      expect(enB.status, JSON.stringify(enB)).toBe("ok");
      for (const id of loteB) expect(await B.e.estadoDe(id)).not.toBe("en_bodega_central");
    });
  });

  it("bodega satelite, con un lote mixto: en A nada se asigna; en B, todo", async () => {
    await enTransaccion(async (tx) => {
      const { A, B, deA, deB } = await dosEmpresas(tx, 1, "en_bodega_satelite", "satelite");
      const mixtoDe = async (em: Empresa, agotada: string) => {
        const [limpia] = await ordenes(em, 1, "satelite");
        await colocar(em, [limpia], "en_bodega_satelite");
        return [agotada, limpia];
      };
      const servicio = (em: Empresa) =>
        new AsignacionSateliteService(
          em.e.s.ordenRepo,
          new AsignabilidadCoordenadasService(new JobRepository(em.cliente)),
          em.e.s.historialService,
          reglasPaisFijas(),
        );

      const loteA = await mixtoDe(A, deA[0]);
      await mensajeroConVehiculo(A, A.e.mensajero2Id);
      const enA = await como(A, () =>
        servicio(A).asignar(
          { ordenIds: loteA, mensajeroId: A.e.mensajero2Id },
          A.e.actorAdminSatelite,
        ),
      );
      loteRechazadoPorTope(enA as never, loteA);
      for (const id of loteA) expect(await A.e.estadoDe(id)).toBe("en_bodega_satelite");

      const loteB = await mixtoDe(B, deB[0]);
      await mensajeroConVehiculo(B, B.e.mensajero2Id);
      const enB = await como(B, () =>
        servicio(B).asignar(
          { ordenIds: loteB, mensajeroId: B.e.mensajero2Id },
          B.e.actorAdminSatelite,
        ),
      );
      expect(enB.status, JSON.stringify(enB)).toBe("ok");
      for (const id of loteB) expect(await B.e.estadoDe(id)).not.toBe("en_bodega_satelite");
    });
  });
});

describeSiHayBase("SLT-77 R21 — al aprobar, una orden barrida se rechaza o vuelve a bodega segun su empresa", () => {
  it("en A, rechazo con gestion sintetica y cobro en el siguiente cierre; en B, a bodega sin cobro", async () => {
    await enTransaccion(async (tx) => {
      const { A, B, deA, deB } = await dosEmpresas(tx, 1, "en_reparto");
      const barrerYAprobar = (em: Empresa) =>
        como(em, async () => {
          await em.e.correrCorte(new Date());
          const vencido = await em.tx.cierreDia.findFirstOrThrow({
            where: { mensajeroId: em.e.mensajeroId, estado: "vencido" },
            select: { id: true },
          });
          await em.e.solicitarCierre();
          return em.e.aprobar(vencido.id);
        });

      expect((await barrerYAprobar(A)).status).toBe("ok");
      expect(await sinteticasDe(A, deA[0])).toEqual([
        { cierreId: null, motivo: expect.any(String) as unknown as string },
      ]);
      // Rechazada y, en la misma transaccion, de vuelta a la tienda: la orden es de la bodega central.
      expect(await A.e.estadoDe(deA[0])).toBe("por_devolver_a_tienda");
      expect(await cobroDelSiguienteCierre(A)).toBe(COBRO_RECHAZO);
      expect(await camposDeIngreso(A, deA[0])).toEqual([COBRO_RECHAZO]);

      expect((await barrerYAprobar(B)).status).toBe("ok");
      expect(await sinteticasDe(B, deB[0])).toEqual([]);
      expect(await B.e.estadoDe(deB[0])).toBe("en_bodega_central");
      expect((await B.e.ordenDe(deB[0])).prioridad).toBe(true);
      expect(await cobroDelSiguienteCierre(B)).toBe("sin cierre");
    });
  });
});

describeSiHayBase("SLT-77 R22 — el proceso de devoluciones decide con el tope de la empresa", () => {
  it("`wrong_number` sin vencer: A escala, con cobro en el siguiente cierre; B sigue esperando su ventana", async () => {
    await enTransaccion(async (tx) => {
      const { A, B, deA, deB } = await dosEmpresas(tx, 1, "en_reparto");
      await ponerNovedad(A, deA[0], "wrong_number");
      await ponerNovedad(B, deB[0], "wrong_number");
      const ahora = new Date();

      const enA = await como(A, () => procesoDevoluciones(A).ejecutar(ahora));
      expect(enA).toMatchObject({ evaluadas: 0, liberadas: 0, escaladas: 1, omitidas: 0 });
      expect(await A.e.estadoDe(deA[0])).toBe("devolucion_a_origen_por_rechazo");
      expect(await cobroDelSiguienteCierre(A)).toBe(COBRO_RECHAZO);
      expect(await camposDeIngreso(A, deA[0])).toEqual([COBRO_RECHAZO]);

      const enB = await como(B, () => procesoDevoluciones(B).ejecutar(ahora));
      expect(enB).toMatchObject({ evaluadas: 1, liberadas: 0, escaladas: 0, omitidas: 0 });
      expect(await B.e.estadoDe(deB[0])).toBe("novedad");
      expect(await sinteticasDe(B, deB[0])).toEqual([]);
    });
  });

  it("`not_found` vencida: A escala, con cobro; B la libera a bodega", async () => {
    await enTransaccion(async (tx) => {
      const { A, B, deA, deB } = await dosEmpresas(tx, 1, "en_reparto");
      await ponerNovedad(A, deA[0], "not_found");
      await ponerNovedad(B, deB[0], "not_found");
      const vencida = EN_40_DIAS();

      const enA = await como(A, () => procesoDevoluciones(A).ejecutar(vencida));
      expect(enA).toMatchObject({ liberadas: 0, escaladas: 1 });
      expect(await A.e.estadoDe(deA[0])).toBe("devolucion_a_origen_por_rechazo");
      expect(await cobroDelSiguienteCierre(A)).toBe(COBRO_RECHAZO);

      const enB = await como(B, () => procesoDevoluciones(B).ejecutar(vencida));
      expect(enB).toMatchObject({ liberadas: 1, escaladas: 0 });
      expect(await B.e.estadoDe(deB[0])).toBe("en_bodega_central");
      expect(await sinteticasDe(B, deB[0])).toEqual([]);
    });
  });

  it("bajar el tope escala la orden en la corrida siguiente, sin ningun otro clic, y guardar no la toca", async () => {
    await enTransaccion(async (tx) => {
      await serializarEscriturasReales(tx);
      const A = await nuevaEmpresa(tx, base);
      const [orden] = await ordenes(A, 1);
      await intentosReales(A, [orden], 2, "en_reparto");
      await ponerNovedad(A, orden, "wrong_number");
      const ahora = new Date();

      const conTres = await como(A, () => procesoDevoluciones(A).ejecutar(ahora));
      expect(conTres).toMatchObject({ evaluadas: 1, escaladas: 0 });
      expect(await A.e.estadoDe(orden)).toBe("novedad");

      await fijarTope(A, 2);
      expect(await A.e.estadoDe(orden)).toBe("novedad");

      const conDos = await como(A, () => procesoDevoluciones(A).ejecutar(ahora));
      expect(conDos).toMatchObject({ evaluadas: 0, escaladas: 1 });
      expect(await A.e.estadoDe(orden)).toBe("devolucion_a_origen_por_rechazo");
      expect(await cobroDelSiguienteCierre(A)).toBe(COBRO_RECHAZO);
    });
  });
});

describeSiHayBase("SLT-77 R23 — el aviso diario evalua «en el tope» con el tope de la empresa", () => {
  it("con la misma novedad, A habla sin plazo y B promete sus cinco dias", async () => {
    await enTransaccion(async (tx) => {
      const { A, B, deA, deB } = await dosEmpresas(tx, 1, "en_reparto");
      await ponerNovedad(A, deA[0], "wrong_number");
      await ponerNovedad(B, deB[0], "wrong_number");
      const plazoDe = async (em: Empresa) => {
        const notificar = vi.fn(async () => {});
        const servicio = new AvisosDiariosService(
          new AvisoAgregadoRepository(em.cliente, new OrdenRepository(em.cliente)),
          em.e.s.historialService,
          buildReprogramadasRetenidasService(em.cliente),
          3,
          notificar as never,
          undefined,
          undefined,
          undefined,
          reglasPaisFijas(),
        );
        await como(em, () => servicio.ejecutar(new Date()));
        expect(notificar).toHaveBeenCalledTimes(1);
        return (notificar.mock.calls as unknown as [{ plazo: string }][])[0][0].plazo;
      };
      expect(await plazoDe(A)).toBe("mezclado");
      expect(await plazoDe(B)).toBe("cinco_dias");
    });
  });
});

describeSiHayBase("SLT-77 R24 — `enElTope` de las listas sale del tope de la empresa", () => {
  it("MisAsignaciones: la misma orden da true en A y false en B", async () => {
    await enTransaccion(async (tx) => {
      const { A, B, deA, deB } = await dosEmpresas(tx, 1, "en_reparto");
      const enElTope = async (em: Empresa, ordenId: string) => {
        const r = await como(em, () => em.e.s.misAsignaciones.listarMisAsignaciones(em.e.actorMensajero));
        if (r.status !== "ok") throw new Error(`lista: ${r.status}`);
        const fila = r.porGestionar.find((o) => o.id === ordenId);
        if (fila === undefined) throw new Error("la orden no esta en la lista");
        return fila.enElTope;
      };
      expect(await enElTope(A, deA[0])).toBe(true);
      expect(await enElTope(B, deB[0])).toBe(false);
    });
  });

  it("Novedades: la misma orden da true en A y false en B", async () => {
    await enTransaccion(async (tx) => {
      const { A, B, deA, deB } = await dosEmpresas(tx, 1, "en_reparto");
      await ponerNovedad(A, deA[0], "wrong_number");
      await ponerNovedad(B, deB[0], "wrong_number");
      const enElTope = async (em: Empresa, ordenId: string) => {
        const servicio = new NovedadesService(em.e.s.ordenRepo, em.e.s.historialService);
        const r = await como(em, () =>
          servicio.listar({ page: 1, pageSize: 20, grupo: "devolucion" }, em.e.actorTienda),
        );
        if (r.status !== "ok") throw new Error(`lista: ${r.status}`);
        const fila = r.items.find((o) => o.id === ordenId);
        if (fila === undefined) throw new Error("la orden no esta en la lista");
        return fila.enElTope;
      };
      expect(await enElTope(A, deA[0])).toBe(true);
      expect(await enElTope(B, deB[0])).toBe(false);
    });
  });
});

describeSiHayBase("SLT-77 R25, R32 — la linea de tiempo da el tope a quien lo ve, y al mensajero ni el numero", () => {
  it("`maestro`, `admin`, `adminTienda` y `adminSatelite` reciben 2 en A y 4 en B", async () => {
    await enTransaccion(async (tx) => {
      const { A, B, deA, deB } = await dosEmpresas(tx, 1, "en_bodega_satelite", "satelite");
      for (const [em, ordenId, esperado] of [
        [A, deA[0], 2],
        [B, deB[0], 4],
      ] as const) {
        const adminId = await sembrar(em, () => em.e.crearUsuario("admin", null));
        const actores = [
          em.e.actorMaestro,
          { usuarioId: adminId, rol: "admin", zonaId: null } as const,
          em.e.actorTienda,
          em.e.actorAdminSatelite,
        ];
        for (const actor of actores) {
          const r = await como(em, () => em.e.s.historialService.obtenerHistorial(ordenId, actor));
          expect(r.status, actor.rol).toBe("ok");
          if (r.status !== "ok") return;
          expect(r.intentos, actor.rol).toBe(2);
          expect(r.umbral, actor.rol).toBe(esperado);
        }
      }
    });
  });

  it("al `mensajero` le llega `null` en la linea de tiempo, y sus listas no traen ni `umbral` ni el tope", async () => {
    await enTransaccion(async (tx) => {
      const { A, B, deA, deB } = await dosEmpresas(tx, 1, "en_reparto");
      for (const [em, ordenId] of [
        [A, deA[0]],
        [B, deB[0]],
      ] as const) {
        const linea = await como(em, () => em.e.s.historialService.obtenerHistorial(ordenId, em.e.actorMensajero));
        expect(linea.status).toBe("ok");
        if (linea.status !== "ok") return;
        expect(linea.intentos).toBe(2);
        expect(linea.umbral).toBeNull();

        const lista = await como(em, () => em.e.s.misAsignaciones.listarMisAsignaciones(em.e.actorMensajero));
        expect(lista.status).toBe("ok");
        if (lista.status !== "ok") return;
        const fila = lista.porGestionar.find((o) => o.id === ordenId);
        expect(fila).toBeDefined();
        const claves = Object.keys(fila as object);
        expect(claves).toContain("enElTope");
        expect(claves.filter((c) => /umbral|^tope|topeIntentos/i.test(c))).toEqual([]);
        expect(JSON.stringify(lista)).not.toMatch(/umbral|topeIntentos|tope_intentos/i);
      }
    });
  });
});

describeSiHayBase("SLT-77 R27 — sin la empresa, la operacion falla sin efectos y sin un valor por defecto", () => {
  it("una gestion que dependeria del tope no se registra, ni aunque la fila exista", async () => {
    await enTransaccion(async (tx) => {
      await serializarEscriturasReales(tx);
      const A = await nuevaEmpresa(tx, base);
      const [orden] = await ordenes(A, 1);
      await sembrar(A, () => A.e.s.misAsignaciones.escogerParaGestion(orden, A.e.actorMensajero));
      const antes = (await A.e.gestionesDe(orden)).length;
      // Como dueño de las tablas, sin RLS: es el contexto en el que una lectura sin `WHERE` daria la fila de otra.
      await fijarEmpresa(tx, "");
      await expect(A.e.s.historialService.topeIntentos()).rejects.toBeInstanceOf(EmpresaNoResuelta);
      await expect(A.e.gestionar(orden, "reprogramado", { escoger: false, fechaReprogramacion: fechaFutura() })).rejects.toBeInstanceOf(
        EmpresaNoResuelta,
      );
      expect((await A.e.gestionesDe(orden)).length).toBe(antes);
    });
  });
});

describeSiHayBase("SLT-77 R28 — con tope 1, una orden sin intentos ya esta en el tope", () => {
  it("su primera gestion no puede ser `reprogramado` ni `novedad`; con tope 2, si", async () => {
    await enTransaccion(async (tx) => {
      await serializarEscriturasReales(tx);
      const A = await nuevaEmpresa(tx, base);
      const [uno, dos, tres] = await ordenes(A, 3);
      await fijarTope(A, 1);
      expect(await como(A, () => A.e.s.historialService.contarIntentos(uno))).toBe(0);

      for (const [ordenId, resultado] of [
        [uno, "reprogramado"],
        [dos, "novedad"],
      ] as const) {
        const r = await como(A, () => A.e.gestionar(ordenId, resultado, { fechaReprogramacion: fechaFutura() }));
        rechazadaPorTope(r, resultado);
        expect(await A.e.gestionesDe(ordenId), resultado).toEqual([]);
      }

      const lista = await como(A, () => A.e.s.misAsignaciones.listarMisAsignaciones(A.e.actorMensajero));
      if (lista.status !== "ok") throw new Error(`lista: ${lista.status}`);
      expect(lista.porGestionar.find((o) => o.id === tres)?.enElTope).toBe(true);

      await fijarTope(A, 2);
      // La orden que el panel dejo escogida en el intento anterior: el rechazo no la suelta.
      await sembrar(A, () => tx.usuario.update({ where: { id: A.e.mensajeroId }, data: { ordenEnGestionId: null } }));
      const r = await como(A, () => A.e.gestionar(tres, "reprogramado", { fechaReprogramacion: fechaFutura() }));
      expect(r.status).toBe("ok");
    });
  });
});

describeSiHayBase("SLT-77 R29 — subir el tope le devuelve a la orden lo que le negaba", () => {
  it("con 2 intentos: en 2 nada; en 3 ya se asigna; en 4 ya admite la gestion", async () => {
    await enTransaccion(async (tx) => {
      await serializarEscriturasReales(tx);
      const A = await nuevaEmpresa(tx, base);
      const [gestion, bodega] = await ordenes(A, 2);
      await intentosReales(A, [gestion, bodega], 2, "en_reparto");
      await colocar(A, [bodega], "en_bodega_central");
      await fijarTope(A, 2);

      const m = await sembrar(A, () => A.e.mensajeroCentral());
      await sembrar(A, async () => {
        const v = await tx.vehiculo.create({ data: { name: `Moto ${randomUUID().slice(0, 12)}` }, select: { id: true } });
        await tx.usuario.update({ where: { id: m.mensajeroId }, data: { vehiculoId: v.id } });
      });
      const asignar = () =>
        como(A, () =>
          new GuiaAsignacionService(
            A.e.s.ordenRepo,
            A.e.s.zonaRepo,
            new AsignabilidadCoordenadasService(new JobRepository(A.cliente)),
            A.e.s.historialService,
            reglasPaisFijas(),
          ).asignarDesdeBodega(
            { ordenIds: [bodega], mensajeroId: m.mensajeroId },
            A.e.actorMaestro,
          ),
        );
      const reprogramar = () =>
        como(A, () => A.e.gestionar(gestion, "reprogramado", { fechaReprogramacion: fechaFutura() }));

      loteRechazadoPorTope((await asignar()) as never, [bodega]);
      rechazadaPorTope(await reprogramar(), "tope 2");

      await fijarTope(A, 3);
      // Con 3, 2 intentos ya no agotan, pero la gestion que se registre ahora seria la que alcanza.
      rechazadaPorTope(await reprogramar(), "tope 3");
      expect((await asignar()).status).toBe("ok");

      await fijarTope(A, 4);
      expect((await reprogramar()).status).toBe("ok");
    });
  });
});

describeSiHayBase("SLT-77 R30 — cambiar el tope no cambia lo que cuenta como intento", () => {
  it("los mismos conteos, en literales, antes y despues de moverlo dos veces", async () => {
    await enTransaccion(async (tx) => {
      await serializarEscriturasReales(tx);
      const A = await nuevaEmpresa(tx, base);
      const [cero, uno, dos] = await ordenes(A, 3);
      await colocar(A, [cero], "en_bodega_central");
      await intentosReales(A, [uno, dos], 1, "en_bodega_central");
      await intentosReales(A, [dos], 1, "en_bodega_central");

      const fotografia = async () => {
        const h = A.e.s.historialService;
        const lote = await como(A, () => h.contarIntentosEnLote([cero, uno, dos]));
        return {
          cero: await como(A, () => h.contarIntentos(cero)),
          uno: await como(A, () => h.contarIntentos(uno)),
          dos: await como(A, () => h.contarIntentos(dos)),
          loteCero: lote.get(cero) ?? 0,
          loteUno: lote.get(uno) ?? 0,
          loteDos: lote.get(dos) ?? 0,
        };
      };
      const esperado = { cero: 0, uno: 1, dos: 2, loteCero: 0, loteUno: 1, loteDos: 2 };
      expect(await fotografia()).toEqual(esperado);
      await fijarTope(A, 1);
      expect(await fotografia()).toEqual(esperado);
      await fijarTope(A, 10);
      expect(await fotografia()).toEqual(esperado);
    });
  });
});

describeSiHayBase("SLT-77 R26, R27 — una sola ejecucion del cron, por `paraCadaEmpresa` real", () => {
  const SECRETO = `secreto-cron-${randomUUID().slice(0, 10)}`;
  const FANTASMA = randomUUID();
  let soltarLock: (() => Promise<void>) | undefined;
  const empresas: string[] = [];

  interface Sembrada {
    id: string;
    ordenId: string;
    mensajeroId: string;
  }

  async function enEmpresa<T>(organizacionId: string, fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
    return base.$transaction(
      async (tx) => {
        await fijarEmpresa(tx, organizacionId);
        return fn(tx);
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  }

  /** Commitea una empresa con el tope pedido y una novedad `wrong_number` sin vencer, con 2 intentos vigentes. */
  async function sembrarEmpresa(tope: number): Promise<Sembrada> {
    const org = await base.organizacion.create({ data: datosDeOrganizacionDePrueba(), select: { id: true } });
    empresas.push(org.id);
    await base.$executeRawUnsafe(`UPDATE "organizacion" SET "tope_intentos_entrega" = $1 WHERE "id" = $2`, tope, org.id);
    return enEmpresa(org.id, async (tx) => {
      const fks = await crearFksDeOrden(tx);
      const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
      await tx.usuario.update({ where: { id: mensajero.id }, data: { zonaId: fks.zonaId } });
      const estatus = await tx.orderStatus.findUniqueOrThrow({ where: { value: "novedad" }, select: { id: true } });
      const orden = await tx.orden.create({
        data: {
          numRemision: `R-SLT77-${randomUUID().slice(0, 12)}`,
          destinatario: "Tope SLT-77",
          telefonoDest: "88880000",
          producto: "Caja",
          estatusId: estatus.id,
          mensajeroAsignadoId: mensajero.id,
          tiendaId: fks.tiendaId,
          zonaId: fks.zonaId,
          provinciaId: fks.provinciaId,
          cantonId: fks.cantonId,
          montoCobrar: 0,
        },
        select: { id: true },
      });
      for (let i = 0; i < 2; i++) {
        const cierre = await tx.cierreDia.create({
          data: { mensajeroId: mensajero.id, estado: "aprobado", destinoTipo: "bodega_satelite", destinoZonaId: fks.zonaId },
          select: { id: true },
        });
        const gestion = await tx.gestionOrden.create({
          data: { ordenId: orden.id, mensajeroId: mensajero.id, resultado: "reprogramado", cierreId: cierre.id },
          select: { id: true },
        });
        const destino = await tx.orderStatus.findUniqueOrThrow({ where: { value: "reprogramado" }, select: { id: true } });
        await tx.ordenHistorialEstado.create({
          data: { ordenId: orden.id, estatusDestinoId: destino.id, origenTipo: "gestion", gestionOrdenId: gestion.id },
        });
      }
      await tx.gestionOrden.create({
        data: {
          ordenId: orden.id,
          mensajeroId: mensajero.id,
          resultado: "novedad",
          causaDevolucion: "wrong_number",
          motivo: "Numero malo",
        },
      });
      return { id: org.id, ordenId: orden.id, mensajeroId: mensajero.id };
    });
  }

  const estadoDe = async (ordenId: string): Promise<string> =>
    (
      await base.orden.findUniqueOrThrow({
        where: { id: ordenId },
        select: { estatus: { select: { value: true } } },
      })
    ).estatus.value;

  /** La lista real, acotada a las de este caso: la base es compartida. Con una empresa sin fila, para R27. */
  function soloEstas(ids: string[]): ClienteDeOrganizaciones {
    const real = getPrismaClient() as unknown as ClienteDeOrganizaciones;
    return {
      organizacion: {
        findMany: async (args) => {
          const filas = await real.organizacion.findMany(args);
          const permitidas = new Set(ids);
          return [{ id: FANTASMA }, ...filas.filter((o) => permitidas.has(o.id))];
        },
      },
    };
  }

  beforeAll(async () => {
    soltarLock = await tomarLockDeEscrituraReal();
  }, 60_000);

  afterAll(async () => {
    try {
      if (empresas.length === 0) return;
      await base.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
          for (const { tabla } of MODELOS_DE_NEGOCIO) {
            await tx.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, empresas);
          }
          await tx.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE "id" = ANY($1::text[])`, empresas);
        },
        { timeout: 60_000 },
      );
    } finally {
      await soltarLock?.();
    }
  }, 120_000);

  it("A escala y B espera en la misma corrida, y la empresa cuyo tope no se lee no frena a las demas", async () => {
    const A = await sembrarEmpresa(2);
    const B = await sembrarEmpresa(4);
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await handleProcesarDevueltasSla(
        new Request("http://localhost/api/cron/procesar-devueltas-sla", {
          headers: { authorization: `Bearer ${SECRETO}` },
        }),
        { getSecret: () => SECRETO, now: () => new Date(), empresas: soloEstas([A.id, B.id]) },
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        escaladas: 1,
        evaluadas: 1,
        liberadas: 0,
        omitidas: 0,
        empresas: { procesadas: 2, fallidas: [FANTASMA] },
      });
    } finally {
      consola.mockRestore();
    }
    expect(await estadoDe(A.ordenId)).toBe("devolucion_a_origen_por_rechazo");
    expect(await estadoDe(B.ordenId)).toBe("novedad");

    const rechazosDe = (ordenId: string) =>
      base.gestionOrden.count({ where: { ordenId, resultado: "devolucion_a_origen_por_rechazo" } });
    expect(await rechazosDe(A.ordenId)).toBe(1);
    expect(await rechazosDe(B.ordenId)).toBe(0);
  }, 60_000);
});
