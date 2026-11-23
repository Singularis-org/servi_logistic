import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { Alcance } from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { WalletTiendaMovimientoRepository } from "@/lib/repositories/WalletTiendaMovimientoRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { WalletFeedService } from "@/lib/services/WalletFeedService";
import { WalletIndemnizacionFeedService } from "@/lib/services/WalletIndemnizacionFeedService";
import { WalletMensajeroFeedService } from "@/lib/services/WalletMensajeroFeedService";
import { WalletTiendaFeedService } from "@/lib/services/WalletTiendaFeedService";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// SLT-169 «Se le paga hoy a la tienda con todos los cobros restados» · T3.3 · R632 (y R620, R621,
// R624 contra Postgres) — LA CIFRA DE LA PANTALLA ES LA QUE EL LIBRO DE LA TIENDA DEJA AL APROBAR.
//
// Desde SLT-169 «Se le paga hoy a la tienda» resta TODO lo facturado, flete por rechazo incluido.
// Es solo presentacion: el dinero lo mueve `WalletTiendaFeedService` al aprobar, que acredita el COD
// recibido y debita cada concepto de `derivarIngresoOrden`. Este test aprueba un cierre con el
// SERVICIO REAL que escribe el libro y compara, por tienda, `ParteDeTienda.pagoTienda` del detalle
// con Σ creditos − Σ debitos de `wallet_tienda_movimiento` de ESE cierre y ESA tienda, filtrando
// por `organizacion_id`. Y lo mismo para el `pagoTienda` del cierre entero.
//
// El interruptor `TIENDA_DEBITA_FLETE_DEVOLUCION` se inyecta ENCENDIDO (es su default y lo que rige
// en produccion, P1 de SLT-169): R632 es la promesa para ese estado.
//
// EL CORPUS (cifras A MANO; son el contrato). Tarifa congelada del modelo viejo: flete 2.500,00 ·
// flete devuelto 2.000,00 · comision COD 3,50 % · IVA 13 % sobre los dos.
//
//   Tienda A — UNA entrega de 20.000,00 en efectivo y DOS rechazos
//     entrega   flete 2.500,00 + IVA 325,00 · comision 700,00 + IVA 91,00   = 3.616,00
//     rechazos  2 × (flete devuelto 2.000,00 + IVA 260,00)                  = 4.520,00
//     se le paga hoy: 20.000,00 − 8.136,00 = 11.864,00   (con la definicion anterior: 16.384,00)
//   Tienda B — UNA entrega de 10.000,00 en efectivo, sin rechazos
//     flete 2.500,00 + IVA 325,00 · comision 350,00 + IVA 45,50 = 3.220,50
//     se le paga hoy: 10.000,00 − 3.220,50 = 6.779,50
//   Cierre: recaudado 30.000,00 · facturado 11.356,50 · se le paga hoy 18.643,50
//     reparto 62,145 % / 37,855 % → [62, 38]
//
// Todo corre en una transaccion que SIEMPRE se revierte. Sin base se SALTA; con base y sin
// catalogos, la siembra LANZA. Nada de `return` temprano: sin filas en el libro, el test falla.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const URLS_NO_USADAS: ISignedUrlProvider = {
  createSignedUrl: async (ruta: string) => ruta,
  createSignedUrls: async (rutas: string[]) => Object.fromEntries(rutas.map((r) => [r, r])),
};

const ALCANCE_CENTRAL: Alcance = { destinoTipo: "bodega_central", destinoZonaId: null };

const A_PAGO = "11864.00";
const B_PAGO = "6779.50";
const CIERRE_PAGO = "18643.50";

async function idEstatus(tx: TxDeTest, value: string): Promise<string> {
  const fila = await tx.orderStatus.findUnique({ where: { value }, select: { id: true } });
  if (fila === null) throw new Error(`falta el estado «${value}»: aplica las migraciones`);
  return fila.id;
}

interface Medido {
  organizacionId: string;
  tiendaA: string;
  tiendaB: string;
  estadoAprobacion: string;
  estadoCierre: string;
  /** `pagoTienda` por tienda del detalle, despues de aprobar. */
  partes: Record<string, string>;
  pagoCierre: string | null;
  totalFacturado: string | null;
  porcentajes: number[] | null | undefined;
  /** Neto del libro por tienda (creditos − debitos) de ESTE cierre y ESTA empresa. */
  netoLibro: Record<string, string>;
  /** Neto del libro del cierre entero, de ESTA empresa. */
  netoLibroCierre: string;
  filasLibro: number;
  /** Debitos de flete por devolucion de la tienda A: lo que la cifra nueva resta y la vieja no. */
  debitoFleteDevolucionA: string;
}

async function sembrarAprobarYMedir(tx: TxDeTest): Promise<Medido> {
  await serializarEscriturasReales(tx);
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const guiaBase = 960_000_000 + Math.floor(Math.random() * 30_000_000);
  const fks = await crearFksDeOrden(tx);
  const tiendaA = fks.tiendaId;
  const tiendaB = (await crearUsuarioDePrueba(tx, "adminTienda")).id;
  const enReparto = await idEstatus(tx, "en_reparto");
  const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
  const maestro = await crearUsuarioDePrueba(tx, "maestro");

  const tarifa = await tx.tarifa.create({
    data: {
      tiendaId: tiendaA,
      zonaId: null,
      valorFlete: new Prisma.Decimal("2500.00"),
      valorFleteGam: new Prisma.Decimal("2500.00"),
      valorFleteDevuelto: new Prisma.Decimal("2000.00"),
      valorFleteDevueltoGam: new Prisma.Decimal("2000.00"),
      fulfillment: new Prisma.Decimal("0.00"),
      comisionCod: new Prisma.Decimal("3.50"),
      ivaFlete: new Prisma.Decimal("13.00"),
      ivaComisionCod: new Prisma.Decimal("13.00"),
    },
    select: { id: true },
  });

  const cierre = await tx.cierreDia.create({
    data: {
      mensajeroId: mensajero.id,
      estado: "solicitado",
      destinoTipo: "bodega_central",
      destinoZonaId: fks.zonaId,
      totalEfectivo: new Prisma.Decimal("30000.00"),
      totalSimpe: new Prisma.Decimal("0.00"),
      totalTransferencia: new Prisma.Decimal("0.00"),
      totalGeneral: new Prisma.Decimal("30000.00"),
      totalPagoMensajero: new Prisma.Decimal("1500.00"),
      totalIngresoBodegaRechazos: new Prisma.Decimal("0.00"),
    },
    select: { id: true, organizacionId: true },
  });

  let n = 0;
  /** Una orden `en_reparto`, su fila CONGELADA de `cierre_detail` y su gestion de CALLE. */
  const gestion = async (o: {
    tiendaId: string;
    tiendaNombre: string;
    montoCobrar: string;
    resultado: "entregado" | "devolucion_a_origen_por_rechazo";
  }) => {
    n += 1;
    const clave = `${n}-${sufijo}`;
    const numRemision = `SLT169-${clave}`;
    const numGuia = guiaBase + n;
    const orden = await tx.orden.create({
      data: {
        numGuia,
        numRemision,
        destinatario: `Destinatario ${clave}`,
        telefonoDest: "88880000",
        producto: `Producto ${clave}`,
        montoCobrar: new Prisma.Decimal(o.montoCobrar),
        cobraComision: true,
        estatusId: enReparto,
        mensajeroAsignadoId: mensajero.id,
        tiendaId: o.tiendaId,
        zonaId: fks.zonaId,
        provinciaId: fks.provinciaId,
        cantonId: fks.cantonId,
      },
      select: { id: true },
    });
    await tx.cierreDetail.create({
      data: {
        cierreId: cierre.id,
        ordenId: orden.id,
        montoCobrar: new Prisma.Decimal(o.montoCobrar),
        cobraComision: true,
        zonaId: fks.zonaId,
        tiendaId: o.tiendaId,
        esCentral: false,
        esZonaEspecial: false,
        tarifaId: tarifa.id,
        tarifaValorFlete: new Prisma.Decimal("2500.00"),
        tarifaValorFleteGam: new Prisma.Decimal("2500.00"),
        tarifaValorFleteDevuelto: new Prisma.Decimal("2000.00"),
        tarifaValorFleteDevueltoGam: new Prisma.Decimal("2000.00"),
        tarifaComisionCod: new Prisma.Decimal("3.50"),
        tarifaIvaFlete: new Prisma.Decimal("13.00"),
        tarifaIvaComisionCod: new Prisma.Decimal("13.00"),
        tarifaFulfillment: new Prisma.Decimal("0.00"),
        numRemision,
        destinatario: `Destinatario ${clave}`,
        producto: `Producto ${clave}`,
        tiendaNombre: o.tiendaNombre,
        zonaNombre: "Zona SLT-169",
        provinciaNombre: "Cartago",
        cantonNombre: "Cartago",
      },
      select: { id: true },
    });
    const entregada = o.resultado === "entregado";
    const g = await tx.gestionOrden.create({
      data: {
        ordenId: orden.id,
        mensajeroId: mensajero.id,
        resultado: o.resultado,
        cierreId: cierre.id,
        montoRecibido: entregada ? new Prisma.Decimal(o.montoCobrar) : null,
        metodoPago: entregada ? "efectivo" : null,
        motivo: entregada ? null : "La tienda rechazo el paquete",
        ...(entregada
          ? { pagos: { create: [{ metodo: "efectivo", monto: new Prisma.Decimal(o.montoCobrar) }] } }
          : {}),
      },
      select: { id: true },
    });
    await tx.ordenEvento.create({
      data: {
        ordenId: orden.id,
        tipo: "gestion_registrada",
        gestionOrdenId: g.id,
        familiaAplicacion: "gestion",
        resultado: o.resultado,
        mensajeroId: mensajero.id,
        actorUsuarioId: mensajero.id,
        actorRol: "mensajero",
      },
    });
  };

  await gestion({ tiendaId: tiendaA, tiendaNombre: "Tienda A SLT-169", montoCobrar: "20000.00", resultado: "entregado" });
  await gestion({ tiendaId: tiendaA, tiendaNombre: "Tienda A SLT-169", montoCobrar: "15000.00", resultado: "devolucion_a_origen_por_rechazo" });
  await gestion({ tiendaId: tiendaA, tiendaNombre: "Tienda A SLT-169", montoCobrar: "15000.00", resultado: "devolucion_a_origen_por_rechazo" });
  await gestion({ tiendaId: tiendaB, tiendaNombre: "Tienda B SLT-169", montoCobrar: "10000.00", resultado: "entregado" });

  // Los servicios REALES, cableados como su composition root sobre la tx del test. El feed del
  // libro de la tienda, con el interruptor ENCENDIDO (R632, P1).
  const c = clienteConSavepoint(tx);
  const mensajeroRepo = new PagoMensajeroMovimientoRepository(c);
  const repo = new CierresAdminRepository(
    c,
    new WalletMovimientoRepository(c),
    new WalletFeedService(),
    new WalletTiendaMovimientoRepository(c),
    new WalletTiendaFeedService({ TIENDA_DEBITA_FLETE_DEVOLUCION: true }),
    mensajeroRepo,
    new WalletMensajeroFeedService(),
    new WalletIndemnizacionFeedService(),
  );
  const admin = new CierresAdminService(
    repo,
    new ZonaRepository(c),
    new OrdenRepository(c),
    URLS_NO_USADAS,
    new LiquidacionPagoRepository(c),
    mensajeroRepo,
    sinRetenidas(),
    undefined,
    undefined,
    undefined,
    undefined,
    reglasPaisFijas(),
  );
  const actor: Actor = { usuarioId: maestro.id, rol: "maestro", organizacionId: cierre.organizacionId };

  // La confirmacion fisica EXACTA de los dos rechazos, con su guia, como la manda bodega.
  const retornables = await repo.findGestionesRetornablesDelCierre(cierre.id, ALCANCE_CENTRAL);
  const confirmacion = retornables.map((g) => ({
    origen: "gestion" as const,
    gestionId: g.gestionId,
    numGuia: g.numGuia as number,
  }));
  const aprobacion = await admin.aprobarCierre(cierre.id, actor, [], confirmacion);

  const estadoCierre = (
    await tx.cierreDia.findUniqueOrThrow({ where: { id: cierre.id }, select: { estado: true } })
  ).estado;

  const detalle = await admin.verCierreDetalle(cierre.id, actor);
  if (detalle.status !== "ok") throw new Error(`detalle del cierre: ${detalle.status}`);

  // EL LIBRO: Σ creditos − Σ debitos de ESTE cierre, por tienda y de ESTA empresa.
  const filas = await tx.$queryRawUnsafe<{ tienda_id: string; tipo: string; categoria: string; monto: string }[]>(
    `SELECT tienda_id, tipo::text AS tipo, categoria::text AS categoria, monto::text AS monto
       FROM wallet_tienda_movimiento
      WHERE origen_tipo = 'cierre_dia' AND origen_id = $1 AND organizacion_id = $2`,
    cierre.id,
    cierre.organizacionId,
  );
  const neto = (fs: typeof filas) =>
    fs
      .reduce(
        (acc, f) => (f.tipo === "credito" ? acc.plus(f.monto) : acc.minus(f.monto)),
        new Prisma.Decimal(0),
      )
      .toFixed(2);
  const netoLibro: Record<string, string> = {};
  for (const t of [tiendaA, tiendaB]) netoLibro[t] = neto(filas.filter((f) => f.tienda_id === t));
  const debitoFleteDevolucionA = filas
    .filter((f) => f.tienda_id === tiendaA && f.tipo === "debito" && /devolucion/.test(f.categoria))
    .reduce((acc, f) => acc.plus(f.monto), new Prisma.Decimal(0))
    .toFixed(2);

  const partes: Record<string, string> = {};
  for (const p of detalle.partesPorTienda ?? []) partes[p.tiendaId] = p.pagoTienda;

  return {
    organizacionId: cierre.organizacionId,
    tiendaA,
    tiendaB,
    estadoAprobacion: aprobacion.status,
    estadoCierre,
    partes,
    pagoCierre: detalle.pagoTienda,
    totalFacturado: detalle.totalesIngreso?.total ?? null,
    porcentajes: detalle.porcentajesReparto,
    netoLibro,
    netoLibroCierre: neto(filas),
    filasLibro: filas.length,
    debitoFleteDevolucionA,
  };
}

describeSiHayBase("SLT-169 R632 — lo que se le paga hoy a cada tienda es el neto que el cierre dejo en su libro", () => {
  let prisma: PrismaClient;
  let medido: Medido;

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    medido = await enTransaccionRevertida(prisma, (tx) => sembrarAprobarYMedir(tx));
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("CONTROL: el cierre se aprobo con el servicio real y dejo filas en el libro de las DOS tiendas", () => {
    expect(medido.estadoAprobacion).toBe("ok");
    expect(medido.estadoCierre).toBe("aprobado");
    // Sin filas no hay nada que comparar: el test FALLA, no pasa por vacio.
    expect(medido.filasLibro).toBeGreaterThan(0);
    expect(Object.keys(medido.partes).sort()).toEqual([medido.tiendaA, medido.tiendaB].sort());
    // Y el libro SI debito el flete por los dos rechazos de A: 2 × (2.000,00 + 260,00).
    expect(medido.debitoFleteDevolucionA).toBe("4520.00");
  });

  it("R621/R632: tienda A (1 entrega + 2 rechazos) — 11.864,00 en pantalla y en su libro", () => {
    expect(medido.partes[medido.tiendaA]).toBe(A_PAGO);
    expect(medido.netoLibro[medido.tiendaA]).toBe(A_PAGO);
  });

  it("R621/R632: tienda B (1 entrega) — 6.779,50 en pantalla y en su libro", () => {
    expect(medido.partes[medido.tiendaB]).toBe(B_PAGO);
    expect(medido.netoLibro[medido.tiendaB]).toBe(B_PAGO);
  });

  it("R620/R632: el «Se le paga hoy» del cierre entero es el neto del libro de ese cierre", () => {
    expect(medido.pagoCierre).toBe(CIERRE_PAGO);
    expect(medido.netoLibroCierre).toBe(CIERRE_PAGO);
  });

  it("R624: el reparto [se le paga hoy, total facturado] suma lo recaudado: [62, 38]", () => {
    expect(medido.totalFacturado).toBe("11356.50");
    expect(medido.porcentajes).toEqual([62, 38]);
  });
});
