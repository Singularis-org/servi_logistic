import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { handleCargaApi } from "@/app/api/ordenes/api-key/carga/route";
import { handleCotizacionApi } from "@/app/api/ordenes/api-key/cotizacion/route";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { ApiKeyAuthResult } from "@/lib/interfaces/services/IApiKeyAuthService";
import type { IEtiquetasDescargaService } from "@/lib/interfaces/services/IEtiquetasDescargaService";
import type { IManifiestoService } from "@/lib/interfaces/services/IManifiestoService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { usaModeloNuevo } from "@/lib/repositories/_shared/resolver-tarifas";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { OrganizacionRepository } from "@/lib/repositories/OrganizacionRepository";
import { TarifaActivacionRepository } from "@/lib/repositories/TarifaActivacionRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "@/lib/repositories/TarifaZonaMensajeroRepository";
import { BulkOrdenService } from "@/lib/services/BulkOrdenService";
import { CierreDiaService } from "@/lib/services/CierreDiaService";
import { CotizacionOrdenService } from "@/lib/services/CotizacionOrdenService";
import { MSG_COTIZACION_SIN_TARIFA } from "@/lib/services/mensajes-cotizacion";
import { MSG_CARGA_SIN_TARIFA } from "@/lib/services/mensajes-tarifa";
import { OrganizacionService } from "@/lib/services/OrganizacionService";
import { WalletFeedService } from "@/lib/services/WalletFeedService";
import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
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

// SLT-54 T3.4 (R31, R32) — UNA EMPRESA DADA DE ALTA, SIN TARIFAS, ANTES Y DESPUES DE ACTIVAR.
//
// La misma regla que las demas: sigue el mismo camino, y activarla no hace que cobre algo que no tiene.
// Nace por el alta real, no por la fabrica, porque R31 habla de lo que el alta deja escrito. El resolver,
// los bordes de API y el cierre corren reales y como `servi_app`; los dobles solo cubren lo ajeno a la
// ficha: la autenticacion de la key, los PDF y el manifiesto.
//
// Todo en una transaccion que siempre se revierte. Cada caso afirma lo sembrado antes de medir, y hay
// contraprueba: un valor que cubre el cobro hace responder 200, asi que el 409 no sale de un montaje roto.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

beforeAll(() => {
  if (!HAY_BASE_DE_DATOS) return;
  base = crearPrismaDeTest();
});

afterAll(async () => {
  if (base) await base.$disconnect();
});

interface Empresa {
  A: string;
  maestro: string;
  fks: FksDeOrden;
  mensajero: string;
  key: string;
  distritoId: string;
  distritoNombre: string;
}

let siguienteGuia = 945_000_000 + Math.floor(Math.random() * 4_000_000);

async function altaDeEmpresa(tx: TxDeTest): Promise<Empresa> {
  await serializarEscriturasReales(tx);
  const sufijo = randomUUID().slice(0, 8);
  const r = await new OrganizacionService(new OrganizacionRepository(clienteConTransaccionAnidada(tx))).altaEmpresa({
    nombre: `Empresa nueva ${sufijo}`,
    slug: `nueva-${sufijo}`,
    paisId: "CR",
    maestro: {
      nombre: "Maestra de prueba",
      email: `nueva-${sufijo}@example.test`,
      telefono: "88887777",
      documento: `doc-${sufijo}`,
      tipoDocumento: "cedula",
    },
  });
  if (r.estado !== "creada") throw new Error(`el alta no creo la empresa: ${JSON.stringify(r)}`);
  await fijarEmpresa(tx, r.organizacionId);
  const fks = await crearFksDeOrden(tx);
  const mensajero = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const key = (await crearUsuarioDePrueba(tx, "apiKey")).id;
  const distrito = await tx.distrito.findFirstOrThrow({
    where: { cantonId: fks.cantonId },
    select: { id: true, nombre: true },
    orderBy: { id: "asc" },
  });
  await tx.zonaDistrito.create({ data: { zonaId: fks.zonaId, distritoId: distrito.id } });
  return {
    A: r.organizacionId,
    maestro: r.maestroId,
    fks,
    mensajero,
    key,
    distritoId: distrito.id,
    distritoNombre: distrito.nombre,
  };
}

// La empresa nueva en la base (RLS) y en el contexto (`contextoActual`), como en produccion, donde la
// extension fija una desde la otra. `enTransaccionRevertida` deja en el contexto su empresa por
// defecto: sin el `conEmpresa`, lo que pregunta por la empresa del contexto (el catalogo geografico,
// SLT-44) buscaria una que la RLS de esta no deja ver.
async function comoEmpresa<T>(tx: TxDeTest, org: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, org);
  try {
    return await conEmpresa(org, fn);
  } finally {
    await tx.$executeRawUnsafe("RESET ROLE");
  }
}

/** Lo que tiene la empresa, con la RLS actuando: es lo que este archivo supone en cada medida. */
async function tablasDeTarifas(tx: TxDeTest, e: Empresa) {
  return comoEmpresa(tx, e.A, async () => ({
    activacion: await tx.tarifaActivacion.count(),
    tarifas: await tx.tarifa.count(),
    pagos: await tx.tarifaZonaMensajero.count(),
    valores: await tx.tarifaValor.count(),
    modeloNuevo: await usaModeloNuevo(clienteConSavepoint(tx)),
  }));
}

const VACIA_SIN_ACTIVAR = { activacion: 0, tarifas: 0, pagos: 0, valores: 0, modeloNuevo: false };
const VACIA_ACTIVADA = { activacion: 1, tarifas: 0, pagos: 0, valores: 0, modeloNuevo: true };

function activar(tx: TxDeTest, e: Empresa) {
  return comoEmpresa(tx, e.A, () => new TarifaActivacionRepository(clienteConSavepoint(tx)).activar(e.maestro, 3));
}

// --------------------------------------------------------------------------------------------
// El cierre
// --------------------------------------------------------------------------------------------

function servicioCierre(cli: PrismaClient, e: Empresa) {
  return new CierreDiaService(
    new CierreDiaRepository(cli, new TarifaVigenteRepository(cli)),
    { findCentralZonaId: async () => e.fks.zonaId } as never,
    {
      findUsuarioZonaId: async () => e.fks.zonaId,
      findUsuarioVehiculoId: async () => null,
      findEstatusIdByValue: async () => null,
      findOrdenesEnCorreccion: async () => new Set<string>(),
      findBloqueoDetalle: async () => ({
        bloqueado: false,
        cierresAbiertos: 0,
        cierresPorReenviar: 0,
        aResolverPrimero: null,
        resolicitableMasViejo: null,
      }),
    } as never,
    {} as never,
    new TarifaZonaMensajeroRepository(cli),
  );
}

async function ordenEntregada(tx: TxDeTest, e: Empresa) {
  siguienteGuia += 1;
  const orden = await tx.orden.create({
    data: {
      numGuia: siguienteGuia,
      numRemision: `R-SLT54N-${randomUUID().slice(0, 12)}`,
      destinatario: "Empresa nueva SLT-54",
      telefonoDest: "88880000",
      producto: "caja",
      estatusId: e.fks.estatusId,
      tiendaId: e.fks.tiendaId,
      zonaId: e.fks.zonaId,
      provinciaId: e.fks.provinciaId,
      cantonId: e.fks.cantonId,
      distritoId: e.distritoId,
      montoCobrar: new Prisma.Decimal("10000.00"),
      cobraComision: true,
    },
    select: { id: true },
  });
  await tx.gestionOrden.create({
    data: {
      ordenId: orden.id,
      mensajeroId: e.mensajero,
      resultado: "entregado",
      montoRecibido: new Prisma.Decimal("10000.00"),
      pagos: { create: [{ metodo: "efectivo", monto: new Prisma.Decimal("10000.00") }] },
    },
  });
}

/** Crea el cierre por la solicitud real y lee lo que cobra y paga, con el rol de la app. */
async function cerrar(tx: TxDeTest, e: Empresa) {
  await ordenEntregada(tx, e);
  return comoEmpresa(tx, e.A, async () => {
    const cli = clienteConSavepoint(tx);
    const actor: Actor = { usuarioId: e.mensajero, rol: "mensajero" };
    const r = await servicioCierre(cli, e).solicitarCierre(actor);
    if (r.status !== "ok" || r.via !== "creado" || r.cierreId === undefined) {
      throw new Error(`la solicitud no creo el cierre: ${JSON.stringify(r)}`);
    }
    const cierre = await tx.cierreDia.findUniqueOrThrow({
      where: { id: r.cierreId },
      select: { totalPagoMensajero: true, totalIngresoBodegaRechazos: true },
    });
    const detalle = await tx.cierreDetail.findFirstOrThrow({
      where: { cierreId: r.cierreId },
      select: { tarifaId: true, tarifaModelo: true, _count: { select: { conceptos: true } } },
    });
    const admin = await new CierresAdminRepository(cli, ...([{}, {}, {}, {}, {}, {}, {}] as [never, never, never, never, never, never, never])).findCierreByIdEnAlcance(
      r.cierreId,
      { destinoTipo: "bodega_central", destinoZonaId: null },
    );
    const ingreso = admin?.gestiones[0].ingresoEmpresa ?? null;
    return {
      pago: cierre.totalPagoMensajero.toFixed(2),
      ingresoBodega: cierre.totalIngresoBodegaRechazos.toFixed(2),
      tarifaId: detalle.tarifaId,
      modeloCongelado: detalle.tarifaModelo,
      conceptos: detalle._count.conceptos,
      total: ingreso?.total ?? null,
      modeloDelDto: ingreso?.tarifaModelo,
      movimientos: await new WalletFeedService().construirMovimientosDeIngreso(r.cierreId, tx),
    };
  });
}

// --------------------------------------------------------------------------------------------
// Los dos bordes de API por key
// --------------------------------------------------------------------------------------------

function filaApi(e: Empresa, numRemision: string): Record<string, string> {
  return {
    num_remision: numRemision,
    destinatario: "Ana",
    telefono: "88880000",
    provincia: "Cartago",
    canton: "Cartago",
    distrito: e.distritoNombre,
    direccion: "Frente al parque",
    producto: "Caja",
    monto_cobrar: "25900",
  };
}

function peticion(ruta: string, cuerpo: unknown) {
  return new Request(`http://localhost/api/ordenes/api-key/${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer svl_secretovivo1234567890" },
    body: JSON.stringify(cuerpo),
  });
}

/** La cotizacion y la carga reales, y cuantas ordenes dejo la carga: un 409 no escribe. */
async function bordes(tx: TxDeTest, e: Empresa) {
  return comoEmpresa(tx, e.A, async () => {
    const cli = clienteConSavepoint(tx);
    const autenticar = async () =>
      ({ status: "ok", actor: { usuarioId: e.key, rol: "apiKey" }, apiKeyId: "k1" }) as ApiKeyAuthResult;
    const ordenRepo = new OrdenRepository(cli);
    const resolver = new TarifaVigenteRepository(cli);

    const cotizacion = await handleCotizacionApi(
      peticion("cotizacion", { ordenes: [filaApi(e, `COT-${randomUUID().slice(0, 8)}`)] }),
      { autenticar, cotizacionService: new CotizacionOrdenService(ordenRepo, resolver) },
    );
    const antes = await tx.orden.count({ where: { tiendaId: e.key } });
    const carga = await handleCargaApi(peticion("carga", { ordenes: [filaApi(e, `CAR-${randomUUID().slice(0, 8)}`)] }), {
      autenticar,
      bulkService: new BulkOrdenService(ordenRepo, resolver),
      descargaService: {
        generarYPersistir: vi.fn(async () => ({ consolidado: null, porOrden: new Map<string, string>() })),
      } as unknown as IEtiquetasDescargaService,
      manifiestoService: {
        armar: vi.fn(async () => ({ status: "ok", filas: [], omitidas: [] })),
      } as unknown as IManifiestoService,
    });
    return {
      cotizacion: { status: cotizacion.status, cuerpo: (await cotizacion.json()) as Record<string, unknown> },
      carga: { status: carga.status, cuerpo: (await carga.json()) as Record<string, unknown> },
      ordenesCreadas: (await tx.orden.count({ where: { tiendaId: e.key } })) - antes,
    };
  });
}

type Bordes = Awaited<ReturnType<typeof bordes>>;

function afirmar409(b: Bordes) {
  expect(b.cotizacion.status).toBe(409);
  expect(b.cotizacion.cuerpo).toMatchObject({ status: "error", code: "CONFLICT", message: MSG_COTIZACION_SIN_TARIFA });
  expect(b.carga.status).toBe(409);
  expect(b.carga.cuerpo).toMatchObject({ status: "error", code: "CONFLICT", message: MSG_CARGA_SIN_TARIFA });
  expect(b.ordenesCreadas).toBe(0);
}

// --------------------------------------------------------------------------------------------

describeSiHayBase("SLT-54 R31, R32 — empresa dada de alta, sin activación ni tarifas", () => {
  it("R31: el alta no le crea activación ni tarifas, y `usaModeloNuevo` dice viejo", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await altaDeEmpresa(tx);
      return {
        tablas: await tablasDeTarifas(tx, e),
        // Lo que escribio el alta, para que el «no le crea» no sea verde por mirar otra empresa.
        podio: await tx.premioRanking.count({ where: { organizacionId: e.A } }),
        maestros: await tx.usuario.count({ where: { organizacionId: e.A, rol: { value: "maestro" } } }),
      };
    });
    expect(r.podio).toBe(3);
    expect(r.maestros).toBe(1);
    expect(r.tablas).toEqual(VACIA_SIN_ACTIVAR);
  });

  it("R32, sin activar: el cierre registra 0 sin bloquear, y la carga y la cotización responden 409", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await altaDeEmpresa(tx);
      const tablas = await tablasDeTarifas(tx, e);
      return { tablas, cierre: await cerrar(tx, e), bordes: await bordes(tx, e) };
    });
    expect(r.tablas).toEqual(VACIA_SIN_ACTIVAR);
    expect(r.cierre).toEqual({
      pago: "0.00",
      ingresoBodega: "0.00",
      tarifaId: null,
      modeloCongelado: "viejo",
      conceptos: 0,
      total: "0.00",
      modeloDelDto: null,
      movimientos: [],
    });
    afirmar409(r.bordes);
  });

  it("R32, activada: el cierre sigue en 0 sin bloquear y en el modelo nuevo, y la carga y la cotización siguen en 409", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await altaDeEmpresa(tx);
      const activada = await activar(tx, e);
      const tablas = await tablasDeTarifas(tx, e);
      return { activada, tablas, cierre: await cerrar(tx, e), bordes: await bordes(tx, e) };
    });
    expect(r.activada.creada).toBe(true);
    expect(r.tablas).toEqual(VACIA_ACTIVADA);
    expect(r.cierre).toEqual({
      pago: "0.00",
      ingresoBodega: "0.00",
      tarifaId: null,
      modeloCongelado: "nuevo",
      conceptos: 0,
      total: "0.00",
      modeloDelDto: "nuevo",
      movimientos: [],
    });
    afirmar409(r.bordes);
  });

  it("R32: un valor que no cubre el cobro no levanta el 409: la comisión sola sigue sin flete por entregado", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await altaDeEmpresa(tx);
      await activar(tx, e);
      await tx.tarifaValor.create({
        data: { concepto: "tienda_comision_cod", modo: "porcentaje", valor: "2.00", ivaPct: "13.00", zonaId: e.fks.zonaId },
      });
      return { valores: await tx.tarifaValor.count({ where: { organizacionId: e.A } }), bordes: await bordes(tx, e) };
    });
    expect(r.valores).toBe(1);
    afirmar409(r.bordes);
  });

  it("CONTRAPRUEBA: con el flete por entregado responde 200 tras activar; sin activar el valor no rige y sigue en 409", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      const e = await altaDeEmpresa(tx);
      await tx.tarifaValor.create({
        data: { concepto: "tienda_flete_entregado", modo: "monto", valor: "1500.00", ivaPct: "13.00", zonaId: e.fks.zonaId },
      });
      const sinActivar = await bordes(tx, e);
      await activar(tx, e);
      const activada = await bordes(tx, e);
      return { sinActivar, activada };
    });
    // R1: el valor esta guardado, y hasta activar no rige.
    afirmar409(r.sinActivar);
    // 1500.00 de flete. El 200 descarta que el 409 saliera de una geografia o un actor mal montados.
    expect(r.activada.cotizacion.status).toBe(200);
    expect(JSON.stringify(r.activada.cotizacion.cuerpo)).toContain('"1500.00"');
    expect(r.activada.carga.status).toBe(200);
    expect(r.activada.ordenesCreadas).toBe(1);
  });
});
