import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { GuiaAsignacionService } from "@/lib/services/GuiaAsignacionService";
import { RecepcionBodegaCentralService } from "@/lib/services/RecepcionBodegaCentralService";
import type { UpdateZonaResult } from "@/lib/interfaces/repositories/IZonaRepository";
import type { IAsignabilidadCoordenadasService } from "@/lib/interfaces/services/IAsignabilidadCoordenadasService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { OrderStatusValue } from "@/lib/types/order-status";
import { fakeIntentosEnLote } from "@/tests/fixtures/intentos-entrega";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

/**
 * SLT-198 «Cerrar una bodega: dejar una zona sin distritos» — el flujo de D4 contra Postgres real.
 *
 * Cartago (satelite) con dos distritos, Quebradilla y Dulce Nombre; GAM (central) con uno propio.
 * Se vacia Cartago, se guarda GAM con Quebradilla y se retira el estante con la accion de SLT-197.
 * Dulce Nombre queda sin zona (la otra rama de R1224).
 *
 * SIEMBRA PROPIA: cada caso corre en una transaccion que se revierte siempre, con su empresa. Las
 * aserciones de «no cambio» comparan contra lo leido ANTES, no contra la funcion que lo produce.
 *
 * MUTACION DE CONTROL (anotada en `progress/impl_SLT-198.md`): quitar la guarda
 * `central_sin_distritos` de `ZonaRepository.update` pone rojo el caso de R1222.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `198-${Date.now().toString(36)}`;
const GUIA_BASE = 930_000_000 + (Date.now() % 20_000_000);
let contador = 0;
function unico(): string {
  contador += 1;
  return `${SUFIJO}-${contador.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const ACCION_DISTRITO = "zona_distrito_cambiado";

function soloOk(res: UpdateZonaResult): Extract<UpdateZonaResult, { estado: "ok" }> {
  if (res.estado !== "ok") throw new Error(`se esperaba \`ok\` y llego \`${res.estado}\``);
  return res;
}

interface Zona {
  id: string;
  nombre: string;
}

interface Escenario {
  tx: TxDeTest;
  fks: FksDeOrden;
  maestro: Actor;
  gam: Zona;
  cartago: Zona;
  cantonId: string;
  cantonNombre: string;
  d: { quebradilla: string; dulceNombre: string; gamPropio: string };
  zonaRepo: ZonaRepository;
  ordenRepo: OrdenRepository;
  guias: GuiaAsignacionService;
  crearOrden: (o: { zonaId: string; estado: OrderStatusValue; distritoId: string }) => Promise<{
    id: string;
    numGuia: number;
  }>;
  zonaDe: (ordenId: string) => Promise<string | null>;
  estadoDe: (ordenId: string) => Promise<string>;
  distritosDe: (zonaId: string) => Promise<string[]>;
  filasHistorialDistrito: () => Promise<
    { entidadId: string | null; valorAnterior: string | null; valorNuevo: string | null }[]
  >;
}

describeSiHayBase("SLT-198 — zona sin distritos, contra Postgres real", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function conEscenario<T>(fn: (e: Escenario) => Promise<T>): Promise<T> {
    return enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const fks = await crearFksDeOrden(tx);
      const maestroUsr = await crearUsuarioDePrueba(tx, "maestro");
      const maestro: Actor = { usuarioId: maestroUsr.id, rol: "maestro" };

      // Geografia propia del caso: un canton con nombre unico y tres distritos.
      const cantonNombre = `Canton 198 ${unico()}`;
      const canton = await tx.canton.create({
        data: { nombre: cantonNombre, provinciaId: fks.provinciaId },
        select: { id: true },
      });
      const distrito = async (nombre: string) =>
        (await tx.distrito.create({ data: { nombre, cantonId: canton.id }, select: { id: true } })).id;
      const d = {
        quebradilla: await distrito("Quebradilla"),
        dulceNombre: await distrito("Dulce Nombre"),
        gamPropio: await distrito("Carmen"),
      };

      // La central que trae `crearFksDeOrden` (si la trae) deja de serlo: el indice unico admite
      // una sola por empresa y GAM tiene que ser ESA.
      await tx.zona.updateMany({ where: { esCentral: true }, data: { esCentral: false } });
      const zona = async (prefijo: string, esCentral: boolean): Promise<Zona> => {
        const nombre = `${prefijo} ${unico()}`;
        const z = await tx.zona.create({
          data: { nombre, esCentral, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
          select: { id: true },
        });
        return { id: z.id, nombre };
      };
      const gam = await zona("198 GAM", true);
      const cartago = await zona("198 Cartago", false);
      await tx.zonaDistrito.create({ data: { zonaId: gam.id, distritoId: d.gamPropio } });
      await tx.zonaDistrito.create({ data: { zonaId: cartago.id, distritoId: d.quebradilla } });
      await tx.zonaDistrito.create({ data: { zonaId: cartago.id, distritoId: d.dulceNombre } });

      const idEstado = async (value: OrderStatusValue) =>
        (await tx.orderStatus.findUniqueOrThrow({ where: { value }, select: { id: true } })).id;

      const ordenRepo = new OrdenRepository(clienteConSavepoint(tx));
      const guias = new GuiaAsignacionService(
        ordenRepo,
        new ZonaRepository(clienteConTransaccionAnidada(tx)),
        {
          evaluar: () => {
            throw new Error("el gate de coordenadas no deberia ejecutarse en esta suite");
          },
        } as unknown as IAsignabilidadCoordenadasService,
        fakeIntentosEnLote(),
        reglasPaisFijas(),
      );

      return fn({
        tx,
        fks,
        maestro,
        gam,
        cartago,
        cantonId: canton.id,
        cantonNombre,
        d,
        // SAVEPOINT real: el borrado con ordenes falla por FK y su rollback tiene que ser de verdad.
        zonaRepo: new ZonaRepository(clienteConSavepoint(tx)),
        ordenRepo,
        guias,
        crearOrden: async ({ zonaId, estado, distritoId }) => {
          contador += 1;
          const numGuia = GUIA_BASE + contador;
          const o = await tx.orden.create({
            data: {
              numGuia,
              numRemision: `R-${unico()}`,
              destinatario: "Destinataria 198",
              telefonoDest: "8888-0000",
              producto: "caja",
              estatusId: await idEstado(estado),
              tiendaId: fks.tiendaId,
              zonaId,
              provinciaId: fks.provinciaId,
              cantonId: canton.id,
              distritoId,
              direccion: "100 m norte de la iglesia",
              montoCobrar: 10_000,
            },
            select: { id: true },
          });
          return { id: o.id, numGuia };
        },
        zonaDe: async (id) =>
          (await tx.orden.findUniqueOrThrow({ where: { id }, select: { zonaId: true } })).zonaId,
        estadoDe: async (id) =>
          (
            await tx.orden.findUniqueOrThrow({
              where: { id },
              select: { estatus: { select: { value: true } } },
            })
          ).estatus.value,
        distritosDe: async (zonaId) =>
          (
            await tx.zonaDistrito.findMany({
              where: { zonaId },
              select: { distritoId: true },
              orderBy: { distritoId: "asc" },
            })
          ).map((f) => f.distritoId),
        filasHistorialDistrito: () =>
          tx.historialAccion.findMany({
            where: { accion: ACCION_DISTRITO },
            select: { entidadId: true, valorAnterior: true, valorNuevo: true },
            orderBy: { valorAnterior: "asc" },
          }),
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R1220 / R1223 / R1225 — vaciar Cartago
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  it("R1220/R1223/R1225: vaciar una satelite conserva sus datos, deja rastro por distrito y no mueve sus ordenes", async () => {
    const m = await conEscenario(async (e) => {
      // Pagos, SINPE y tarifas de Cartago: tienen que seguir iguales tras vaciarla (R1220).
      await e.tx.zona.update({ where: { id: e.cartago.id }, data: { cobroVehiculo: false } });
      await e.tx.tarifaZonaMensajero.create({
        data: { zonaId: e.cartago.id, vehiculoId: null, cobroEntregado: "1500.00", cobroRechazado: "300.00" },
      });
      await e.tx.tarifa.create({
        data: {
          tiendaId: e.fks.tiendaId,
          zonaId: e.cartago.id,
          valorFlete: new Prisma.Decimal("2000.00"),
          valorFleteGam: new Prisma.Decimal("2500.00"),
          valorFleteDevuelto: new Prisma.Decimal("1500.00"),
          valorFleteDevueltoGam: new Prisma.Decimal("1800.00"),
          fulfillment: new Prisma.Decimal("0.00"),
          comisionCod: new Prisma.Decimal("3.00"),
          ivaFlete: new Prisma.Decimal("13.00"),
          ivaComisionCod: new Prisma.Decimal("13.00"),
        },
      });
      const enEstante = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite", distritoId: e.d.quebradilla });
      const enTransito = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_ruta_bodega_satelite", distritoId: e.d.quebradilla });

      const leerZona = () =>
        e.tx.zona.findUniqueOrThrow({
          where: { id: e.cartago.id },
          select: { nombre: true, esCentral: true, cobroVehiculo: true, sinpeNumero: true, sinpeNombre: true },
        });
      const leerPagos = () =>
        e.tx.tarifaZonaMensajero.findMany({
          where: { zonaId: e.cartago.id },
          select: { id: true, vehiculoId: true, cobroEntregado: true, cobroRechazado: true },
          orderBy: { id: "asc" },
        });
      const leerTarifas = () =>
        e.tx.tarifa.findMany({
          where: { zonaId: e.cartago.id },
          select: { id: true, valorFlete: true, valorFleteGam: true },
          orderBy: { id: "asc" },
        });

      const antes = {
        zona: await leerZona(),
        pagos: await leerPagos(),
        tarifas: await leerTarifas(),
        distritos: await e.distritosDe(e.cartago.id),
        historial: await e.filasHistorialDistrito(),
      };

      // Payload del formulario: sin marca ni pagos (ausente = no se toca).
      const res = await e.zonaRepo.update(
        e.cartago.id,
        { nombre: e.cartago.nombre, distritoIds: [] },
        e.maestro.usuarioId,
      );

      return {
        cartagoId: e.cartago.id,
        res,
        antes,
        despues: {
          zona: await leerZona(),
          pagos: await leerPagos(),
          tarifas: await leerTarifas(),
          distritos: await e.distritosDe(e.cartago.id),
          historial: await e.filasHistorialDistrito(),
        },
        zonas: { enEstante: await e.zonaDe(enEstante.id), enTransito: await e.zonaDe(enTransito.id) },
        cantonNombre: e.cantonNombre,
      };
    });

    // Premisas.
    expect(m.antes.distritos).toHaveLength(2);
    expect(m.antes.pagos).toHaveLength(1);
    expect(m.antes.tarifas).toHaveLength(1);
    expect(m.antes.historial).toEqual([]);

    // R1220: guardada sin distritos y lo demas igual que antes.
    const ok = soloOk(m.res);
    expect(m.despues.distritos).toEqual([]);
    expect(m.despues.zona).toEqual(m.antes.zona);
    expect(m.despues.zona.esCentral).toBe(false);
    expect(m.despues.pagos).toEqual(m.antes.pagos);
    expect(m.despues.tarifas).toEqual(m.antes.tarifas);

    // R1223: una fila por distrito quitado, ninguna anadida.
    expect(m.despues.historial).toEqual([
      { entidadId: m.cartagoId, valorAnterior: `Dulce Nombre (${m.cantonNombre})`, valorNuevo: null },
      { entidadId: m.cartagoId, valorAnterior: `Quebradilla (${m.cantonNombre})`, valorNuevo: null },
    ]);

    // R1225: ninguna orden cambia de zona.
    expect(m.zonas).toEqual({ enEstante: m.cartagoId, enTransito: m.cartagoId });
    expect(ok.ordenesReconciliadas).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R1222 — la central no se vacia
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  it("R1222: vaciar la central (marca ausente) se rechaza sin escribir nada", async () => {
    const m = await conEscenario(async (e) => {
      const leer = async () => ({
        zona: await e.tx.zona.findUniqueOrThrow({
          where: { id: e.gam.id },
          select: { nombre: true, esCentral: true },
        }),
        distritos: await e.distritosDe(e.gam.id),
        historial: await e.tx.historialAccion.count(),
      });
      const antes = await leer();
      const res = await e.zonaRepo.update(
        e.gam.id,
        { nombre: `Otro nombre ${unico()}`, distritoIds: [] },
        e.maestro.usuarioId,
      );
      return { res, antes, despues: await leer() };
    });

    expect(m.antes.zona.esCentral).toBe(true);
    expect(m.antes.distritos).toHaveLength(1);
    expect(m.res).toEqual({ estado: "central_sin_distritos" });
    expect(m.despues).toEqual(m.antes);
  });

  it("R1222: marcar central una satelite y vaciarla en el mismo guardado se rechaza sin escribir nada", async () => {
    const m = await conEscenario(async (e) => {
      const leer = async () => ({
        cartago: await e.tx.zona.findUniqueOrThrow({ where: { id: e.cartago.id }, select: { esCentral: true } }),
        gam: await e.tx.zona.findUniqueOrThrow({ where: { id: e.gam.id }, select: { esCentral: true } }),
        distritos: await e.distritosDe(e.cartago.id),
        historial: await e.tx.historialAccion.count(),
      });
      const antes = await leer();
      const res = await e.zonaRepo.update(
        e.cartago.id,
        { nombre: e.cartago.nombre, distritoIds: [], esCentral: true },
        e.maestro.usuarioId,
      );
      return { res, antes, despues: await leer() };
    });

    expect(m.antes.distritos).toHaveLength(2);
    expect(m.res).toEqual({ estado: "central_sin_distritos" });
    expect(m.despues).toEqual(m.antes);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R1224 / R1226 / R1227 / R1228 / R1232 — el flujo de D4 entero
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  it("R1224/R1226/R1227/R1228/R1232: vaciar Cartago, guardar GAM con Quebradilla, retirar y recibir", async () => {
    const m = await conEscenario(async (e) => {
      const enEstante = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite", distritoId: e.d.quebradilla });
      const enTransito = await e.crearOrden({ zonaId: e.cartago.id, estado: "en_ruta_bodega_satelite", distritoId: e.d.quebradilla });

      const resolver = async () => {
        const porCanton = await e.ordenRepo.findDistritosByCantonIds([e.cantonId]);
        const zonaPorCanton = (id: string) => porCanton.find((r) => r.id === id)?.zonaId;
        return {
          quebradilla: {
            canton: zonaPorCanton(e.d.quebradilla),
            correccion: (await e.ordenRepo.findDistritoParaCorreccion(e.d.quebradilla))?.zonaId,
          },
          dulceNombre: {
            canton: zonaPorCanton(e.d.dulceNombre),
            correccion: (await e.ordenRepo.findDistritoParaCorreccion(e.d.dulceNombre))?.zonaId,
          },
        };
      };

      const resolucionInicial = await resolver();
      const vaciar = soloOk(
        await e.zonaRepo.update(e.cartago.id, { nombre: e.cartago.nombre, distritoIds: [] }, e.maestro.usuarioId),
      );
      const resolucionVacia = await resolver();
      const listLite = await e.zonaRepo.listLite();

      // D4 paso 2: GAM con su distrito y Quebradilla (sin «ya esta en otra zona»).
      const guardarGam = await e.zonaRepo.update(
        e.gam.id,
        { nombre: e.gam.nombre, distritoIds: [e.d.gamPropio, e.d.quebradilla] },
        e.maestro.usuarioId,
      );
      const resolucionFinal = await resolver();
      const zonasTrasGam = { enEstante: await e.zonaDe(enEstante.id), enTransito: await e.zonaDe(enTransito.id) };

      // D4 paso 3: retirar el estante de Cartago (ya vacia) y recibirlo en la central.
      const retiro = await e.guias.retirarABodegaCentral({ ordenIds: [enEstante.id] }, e.maestro);
      const estadoTrasRetiro = await e.estadoDe(enEstante.id);
      const recepcion = await new RecepcionBodegaCentralService(e.ordenRepo).recibirEnBodegaCentral(
        enEstante.numGuia,
        e.maestro,
      );
      const estadoTrasRecepcion = await e.estadoDe(enEstante.id);
      const zonaTrasRecepcion = await e.zonaDe(enEstante.id);

      // R1228: re-guardar GAM sin cambios la pasa a GAM.
      const reGuardar = soloOk(
        await e.zonaRepo.update(
          e.gam.id,
          { nombre: e.gam.nombre, distritoIds: [e.d.gamPropio, e.d.quebradilla] },
          e.maestro.usuarioId,
        ),
      );

      return {
        gam: e.gam.id,
        cartago: e.cartago.id,
        resolucionInicial,
        vaciar,
        resolucionVacia,
        listLite,
        guardarGam,
        resolucionFinal,
        zonasTrasGam,
        retiro: retiro.status,
        estadoTrasRetiro,
        recepcion: recepcion.status,
        estadoTrasRecepcion,
        zonaTrasRecepcion,
        reGuardar,
        zonaFinal: await e.zonaDe(enEstante.id),
      };
    });

    // Premisa: antes de vaciar, los dos distritos resuelven Cartago.
    expect(m.resolucionInicial).toEqual({
      quebradilla: { canton: m.cartago, correccion: m.cartago },
      dulceNombre: { canton: m.cartago, correccion: m.cartago },
    });

    // R1224: con Cartago vacia nada resuelve a ella; sin otra zona -> null.
    expect(m.resolucionVacia).toEqual({
      quebradilla: { canton: null, correccion: null },
      dulceNombre: { canton: null, correccion: null },
    });

    // R1232: la zona vacia sigue en la lista ligera.
    expect(m.listLite.map((z) => z.id)).toContain(m.cartago);

    // R1226: GAM acepta Quebradilla; la de transito pasa a GAM, la del estante se queda y se cuenta.
    const gamOk = soloOk(m.guardarGam);
    expect(gamOk.ordenesReconciliadas).toBe(1);
    expect(gamOk.ordenesRetenidasEnBodegaSatelite).toBe(1);
    expect(m.zonasTrasGam).toEqual({ enEstante: m.cartago, enTransito: m.gam });

    // R1224 (otra rama): el distrito que ya esta en otra zona resuelve esa otra; el que no, null.
    expect(m.resolucionFinal).toEqual({
      quebradilla: { canton: m.gam, correccion: m.gam },
      dulceNombre: { canton: null, correccion: null },
    });

    // R1227: el retiro de SLT-197 admite la orden del estante de la zona vacia.
    expect(m.retiro).toBe("ok");
    expect(m.estadoTrasRetiro).toBe("en_ruta_bodega_central");

    // R1228, ENMENDADO por SLT-224/R1700: al recibirla en la central ya toma la zona de su distrito
    // (GAM); antes seguia de Cartago hasta re-guardar GAM, que es el defecto que SLT-224 cierra. El
    // re-guardado ya no tiene nada que mover.
    expect(m.recepcion).toBe("ok");
    expect(m.estadoTrasRecepcion).toBe("en_bodega_central");
    expect(m.zonaTrasRecepcion).toBe(m.gam);
    expect(m.reGuardar.ordenesReconciliadas).toBe(0);
    expect(m.reGuardar.ordenesRetenidasEnBodegaSatelite).toBe(0);
    expect(m.zonaFinal).toBe(m.gam);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R1229 — borrar una zona sin distritos
  // ─────────────────────────────────────────────────────────────────────────────────────────────
  it("R1229: borrar una zona vacia con ordenes -> referenced; sin nada -> se borra", async () => {
    const m = await conEscenario(async (e) => {
      await e.crearOrden({ zonaId: e.cartago.id, estado: "en_bodega_satelite", distritoId: e.d.quebradilla });
      soloOk(await e.zonaRepo.update(e.cartago.id, { nombre: e.cartago.nombre, distritoIds: [] }, e.maestro.usuarioId));
      const conOrdenes = await e.zonaRepo.hardDelete(e.cartago.id, e.maestro.usuarioId);
      const cartagoSigue = (await e.tx.zona.count({ where: { id: e.cartago.id } })) === 1;

      const vacia = await e.tx.zona.create({
        data: { nombre: `198 Vacia ${unico()}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
        select: { id: true },
      });
      const sinNada = await e.zonaRepo.hardDelete(vacia.id, e.maestro.usuarioId);
      const vaciaSigue = (await e.tx.zona.count({ where: { id: vacia.id } })) === 1;
      return { conOrdenes, cartagoSigue, sinNada, vaciaSigue };
    });

    expect(m).toEqual({ conOrdenes: "referenced", cartagoSigue: true, sinNada: "ok", vaciaSigue: false });
  });
});
