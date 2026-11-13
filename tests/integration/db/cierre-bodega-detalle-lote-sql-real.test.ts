import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import type { CierreGestionPendienteRow } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { AlcanceLecturaBodega } from "@/lib/interfaces/repositories/ICierresBodegaAdminRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import { CierreDetalleFaltanteError } from "@/lib/utils/cierre-detalle";
import { ZONA_CR } from "@/lib/utils/fecha-cr";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTestConEspia,
  enTransaccionRevertida,
  parametrosDe,
  serializarEscriturasReales,
  type EventoSqlDeTest,
  type TxDeTest,
} from "./_postgres-real";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";

/**
 * SLT-148 «Detalle del cierre de bodega sin N+1» (T0-T2; R420-R429) — `CierresBodegaAdminRepository
 * .findCierreBodegaConDetalle` contra Postgres real, en una transaccion que SIEMPRE se revierte.
 *
 * Los tests de unidad usan dobles de Prisma: no ven el `WHERE` que acota gestiones y filas congeladas a
 * los cierres del dia del cierre de bodega pedido, ni cuantas sentencias cuesta la lectura. Aqui solo
 * pasa lo que Postgres devuelve, y el contador es el espia del cliente (`crearPrismaDeTestConEspia`).
 *
 * EL CORPUS (`design.md > Verificacion`), sembrado entero por el test (la base solo trae catalogos):
 * zona C (alcance de la satelite S) y zona N. Una tienda «Tienda Uno».
 *   - BX (C), solicitado, con tres cierres del dia insertados D1, D2, D3 y leidos D2, D3, D1
 *     (`solicitadoAt` 17:00, 16:00, 15:00 UTC del 2026-11-06). Gestiones con `createdAt` INTERCALADOS
 *     entre cierres del dia: G2b 13:00 (D2), G1b 12:00 (D1), G2a 11:00 (D2), G1a 10:00 (D1), G3a 09:00
 *     (D3).
 *       G1a O1 en D1, entregada, NUEVO, pedido 20 000,00, flete 3 000,00 + IVA 13 %; efectivo.
 *       G1b O2 en D1, rechazo, VIEJO (tarifa 2 000 / 1 500 devuelto, IVA 13 %), pedido 15 000,00.
 *       G2a O1 en D2 (la MISMA orden que G1a, con otra fila congelada: `direccion` «Calle 1, D2»).
 *       G2b O3 en D2, entregada, NUEVO, pedido 25 000,00 con comision: flete 3 500,00, comision 2 %,
 *           fulfillment 600,00, todo + IVA 13 %; pagos efectivo 15 000,00 + SINPE 10 000,00; pago
 *           congelado del mensajero 2 500,00 y un ajuste 2 500,00 -> 1 800,00.
 *       G3a O4 en D3, entregada, NUEVO, pedido 10 000,00, flete 3 000,00 + IVA 13 %; SINPE.
 *     Fulfillment: O1 con cargo vigente (2026-11-05 15:00 UTC); O4 con cargo y luego reverso.
 *   - B1 (C) con un solo cierre del dia D4 y una gestion (caso N = 1).
 *   - BZ (N) con DZ y una gestion de O1 (fila congelada «Calle 1, DZ»): señuelo de alcance y de R426.
 *   - B0 (C) sin cierres del dia (R428).
 *   - BF (C) con DF y una gestion de O5 SIN fila congelada (R427).
 *
 * CIFRAS ESCRITAS A MANO (memoria «asercion contra su propia fuente»; el calculo, junto a cada literal
 * y en `progress/impl_SLT-148.md > T1`). Ninguna se copio de la salida.
 *
 * Sin base se SALTA (`describe.skip`, visible); con base y sin catalogos, FALLA ruidosamente.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/**
 * T0.1 (R421) — sentencias de `findCierreBodegaConDetalle` para B1 (N = 1) medidas con el codigo
 * ANTERIOR a esta ficha (`progress/impl_SLT-148.md > T0`). El caso de un cierre del dia no puede costar
 * mas que antes.
 */
const CONSULTAS_DETALLE_UNO_LINEA_BASE = 24;

/**
 * T0.1 (R428) — sentencias para B0 (N = 0) medidas con el codigo anterior a esta ficha: la cabecera (4,
 * ver `TABLAS_DE_LA_CABECERA`), los cierres del dia con su relacion `mensajero` (2) y la marca de modelo
 * nuevo de la cabecera (1). Sin cierres del dia no se lee nada mas; el test exige como mucho este numero.
 */
const CONSULTAS_DETALLE_SIN_DIAS = 7;

/**
 * T0.1 (R425) — lo que emite la lectura de la cabecera (`findFirst` con `BODEGA_RESUMEN_SELECT`): su
 * sentencia y una por relacion (zona, quien solicito, quien concilio), haya fila o no.
 */
const TABLAS_DE_LA_CABECERA = ["cierre_bodega", "zona", "usuario", "usuario"];

const ESCRITURA = /^\s*(INSERT|UPDATE|DELETE)\b/i;

/** La tabla del primer `FROM` de una sentencia (la tabla principal de un `findMany` de Prisma). */
function tablaPrincipal(sql: string): string | null {
  const m = /\bFROM\s+(?:"\w+"\.)?"(\w+)"/i.exec(sql);
  return m === null ? null : m[1];
}

const TODA: AlcanceLecturaBodega = { lectura: "toda_la_empresa" };

interface Corpus {
  repo: CierresBodegaAdminRepository;
  sufijo: string;
  zona: { C: string; N: string };
  satelite: string;
  tienda: string;
  tarifaVieja: string;
  mensajero: { M1: string; M2: string; M3: string; M4: string };
  bodega: { BX: string; B1: string; BZ: string; B0: string; BF: string };
  dia: { D1: string; D2: string; D3: string; D4: string; DZ: string; DF: string };
  orden: { O1: string; O2: string; O3: string; O4: string; O5: string; O6: string };
  gestion: { G1a: string; G1b: string; G2a: string; G2b: string; G3a: string; G4: string; GZ: string };
}

interface Snap {
  efectivo: string;
  simpe: string;
  general: string;
  pago: string;
  bodega: string;
}

function snapDb(s: Snap) {
  return {
    totalEfectivo: new Prisma.Decimal(s.efectivo),
    totalSimpe: new Prisma.Decimal(s.simpe),
    totalTransferencia: new Prisma.Decimal("0.00"),
    totalGeneral: new Prisma.Decimal(s.general),
    totalPagoMensajero: new Prisma.Decimal(s.pago),
    totalIngresoBodegaRechazos: new Prisma.Decimal(s.bodega),
  };
}

/** Snapshots de cada cierre del dia de BX (lo sembrado; la lectura solo los formatea). */
const S_D1: Snap = { efectivo: "20000.00", simpe: "0.00", general: "20000.00", pago: "2500.00", bodega: "500.00" };
const S_D2: Snap = { efectivo: "35000.00", simpe: "10000.00", general: "45000.00", pago: "3300.00", bodega: "0.00" };
const S_D3: Snap = { efectivo: "0.00", simpe: "10000.00", general: "10000.00", pago: "1500.00", bodega: "0.00" };
/** BX = suma de los tres: efectivo 55 000, SINPE 20 000, general 75 000, pago 7 300, bodega 500. */
const S_BX: Snap = { efectivo: "55000.00", simpe: "20000.00", general: "75000.00", pago: "7300.00", bodega: "500.00" };
const S_CERO: Snap = { efectivo: "0.00", simpe: "0.00", general: "0.00", pago: "0.00", bodega: "0.00" };
const S_DIEZ: Snap = { efectivo: "10000.00", simpe: "0.00", general: "10000.00", pago: "1500.00", bodega: "0.00" };

async function sembrar(tx: TxDeTest): Promise<Corpus> {
  await serializarEscriturasReales(tx);
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
  const estatus = await tx.orderStatus.findUnique({ where: { value: "en_reparto" }, select: { id: true } });
  const canton = await tx.canton.findFirst({ select: { id: true, provinciaId: true } });
  if (estatus === null || canton === null) {
    throw new Error("faltan catalogos (`order_status` o `canton`): corre `prisma migrate deploy` y `pnpm run db:seed`.");
  }

  const nuevaZona = async (nombre: string) =>
    (
      await tx.zona.create({
        data: { nombre: `${nombre} ${sufijo}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba" },
        select: { id: true },
      })
    ).id;
  const zona = { C: await nuevaZona("Centro"), N: await nuevaZona("Norte") };

  const usuario = async (rol: Parameters<typeof crearUsuarioDePrueba>[1], nombre: string, apellido: string) => {
    const id = (await crearUsuarioDePrueba(tx, rol)).id;
    await tx.usuario.update({ where: { id }, data: { nombre, primerApellido: apellido, segundoApellido: null } });
    return id;
  };
  const tienda = await usuario("adminTienda", "Tienda", "Uno");
  const ana = await usuario("maestro", "Ana", "Admin");
  const satelite = await usuario("adminSatelite", "Sara", "Satelite");
  await tx.usuario.update({ where: { id: satelite }, data: { zonaId: zona.C } });
  const mensajero = {
    M1: await usuario("mensajero", "Mario", "Uno"),
    M2: await usuario("mensajero", "Marta", "Dos"),
    M3: await usuario("mensajero", "Mateo", "Tres"),
    M4: await usuario("mensajero", "Mia", "Cuatro"),
  };
  const mz = await usuario("mensajero", "Mauro", "Norte");
  const mf = await usuario("mensajero", "Mina", "Falta");

  const tarifaVieja = (
    await tx.tarifa.create({
      data: {
        tiendaId: tienda,
        zonaId: null,
        valorFlete: new Prisma.Decimal("2000.00"),
        valorFleteGam: new Prisma.Decimal("2500.00"),
        valorFleteDevuelto: new Prisma.Decimal("1500.00"),
        valorFleteDevueltoGam: new Prisma.Decimal("1800.00"),
        fulfillment: new Prisma.Decimal("0.00"),
        comisionCod: new Prisma.Decimal("3.00"),
        ivaFlete: new Prisma.Decimal("13.00"),
        ivaComisionCod: new Prisma.Decimal("13.00"),
      },
      select: { id: true },
    })
  ).id;

  const nuevaBodega = async (zonaId: string, s: Snap) =>
    (
      await tx.cierreBodega.create({
        data: {
          zonaId,
          solicitadoPor: satelite,
          solicitadoAt: new Date("2026-11-06T22:00:00.000Z"),
          estado: "solicitado",
          ...snapDb(s),
        },
        select: { id: true },
      })
    ).id;
  const bodega = {
    BX: await nuevaBodega(zona.C, S_BX),
    B1: await nuevaBodega(zona.C, S_DIEZ),
    BZ: await nuevaBodega(zona.N, S_DIEZ),
    B0: await nuevaBodega(zona.C, S_CERO),
    BF: await nuevaBodega(zona.C, S_DIEZ),
  };

  const nuevoDia = async (bodegaId: string, zonaId: string, mensajeroId: string, solicitadoAt: string, s: Snap) =>
    (
      await tx.cierreDia.create({
        data: {
          mensajeroId,
          estado: "aprobado",
          destinoTipo: "bodega_satelite",
          destinoZonaId: zonaId,
          pagoIndependienteEfectivo: false,
          cierreBodegaId: bodegaId,
          solicitadoAt: new Date(solicitadoAt),
          resueltoAt: new Date("2026-11-06T20:00:00.000Z"),
          ...snapDb(s),
        },
        select: { id: true },
      })
    ).id;
  // Insercion D1, D2, D3; lectura (solicitadoAt desc) D2, D3, D1.
  const dia = {
    D1: await nuevoDia(bodega.BX, zona.C, mensajero.M1, "2026-11-06T15:00:00.000Z", S_D1),
    D2: await nuevoDia(bodega.BX, zona.C, mensajero.M2, "2026-11-06T17:00:00.000Z", S_D2),
    D3: await nuevoDia(bodega.BX, zona.C, mensajero.M3, "2026-11-06T16:00:00.000Z", S_D3),
    D4: await nuevoDia(bodega.B1, zona.C, mensajero.M4, "2026-11-06T15:30:00.000Z", S_DIEZ),
    DZ: await nuevoDia(bodega.BZ, zona.N, mz, "2026-11-06T15:45:00.000Z", S_DIEZ),
    DF: await nuevoDia(bodega.BF, zona.C, mf, "2026-11-06T15:50:00.000Z", S_DIEZ),
  };

  const nuevaOrden = async (clave: string, montoCobrar: string, cobraComision: boolean, mensajeroId: string) =>
    (
      await tx.orden.create({
        data: {
          numRemision: `R-${sufijo}-${clave}`,
          destinatario: `Dest ${clave}`,
          telefonoDest: "88880000",
          producto: `Prod ${clave}`,
          montoCobrar: new Prisma.Decimal(montoCobrar),
          cobraComision,
          estatusId: estatus.id,
          mensajeroAsignadoId: mensajeroId,
          tiendaId: tienda,
          zonaId: zona.C,
          provinciaId: canton.provinciaId,
          cantonId: canton.id,
        },
        select: { id: true },
      })
    ).id;
  const orden = {
    O1: await nuevaOrden("O1", "20000.00", false, mensajero.M1),
    O2: await nuevaOrden("O2", "15000.00", false, mensajero.M1),
    O3: await nuevaOrden("O3", "25000.00", true, mensajero.M2),
    O4: await nuevaOrden("O4", "10000.00", false, mensajero.M3),
    O5: await nuevaOrden("O5", "10000.00", false, mf),
    O6: await nuevaOrden("O6", "10000.00", false, mensajero.M4),
  };

  /** La fila congelada de `ordenId` en `cierreId`; devuelve su id para colgarle conceptos. */
  const congelar = async (args: {
    cierreId: string;
    ordenId: string;
    clave: string;
    direccion: string;
    montoCobrar: string;
    cobraComision: boolean;
    modelo: "viejo" | "nuevo";
  }) =>
    (
      await tx.cierreDetail.create({
        data: {
          cierreId: args.cierreId,
          ordenId: args.ordenId,
          montoCobrar: new Prisma.Decimal(args.montoCobrar),
          cobraComision: args.cobraComision,
          zonaId: zona.C,
          tiendaId: tienda,
          esCentral: false,
          esZonaEspecial: false,
          tarifaModelo: args.modelo,
          ...(args.modelo === "viejo"
            ? {
                tarifaId: tarifaVieja,
                tarifaValorFlete: new Prisma.Decimal("2000.00"),
                tarifaValorFleteGam: new Prisma.Decimal("2500.00"),
                tarifaValorFleteDevuelto: new Prisma.Decimal("1500.00"),
                tarifaValorFleteDevueltoGam: new Prisma.Decimal("1800.00"),
                tarifaComisionCod: new Prisma.Decimal("3.00"),
                tarifaIvaFlete: new Prisma.Decimal("13.00"),
                tarifaIvaComisionCod: new Prisma.Decimal("13.00"),
                tarifaFulfillment: new Prisma.Decimal("0.00"),
              }
            : {}),
          numRemision: `R-${sufijo}-${args.clave}`,
          destinatario: `Dest ${args.clave}`,
          direccion: args.direccion,
          producto: `Prod ${args.clave}`,
          tiendaNombre: "Tienda Uno",
          zonaNombre: "Centro",
          provinciaNombre: "Provincia",
          cantonNombre: "Canton",
        },
        select: { id: true },
      })
    ).id;
  const concepto = (
    cierreDetailId: string,
    c: "tienda_flete_entregado" | "tienda_comision_cod" | "tienda_fulfillment",
    modo: "monto" | "porcentaje",
    valor: string,
  ) =>
    tx.cierreDetailConcepto.create({
      data: {
        cierreDetailId,
        concepto: c,
        modo,
        valor: new Prisma.Decimal(valor),
        ivaPct: new Prisma.Decimal("13.00"),
        nivel: c === "tienda_fulfillment" ? "tienda_general" : "zona",
        tarifaValorId: null,
      },
      select: { id: true },
    });
  const nuevoSoloFlete = async (cierreId: string, ordenId: string, clave: string, direccion: string, monto: string) => {
    const id = await congelar({ cierreId, ordenId, clave, direccion, montoCobrar: monto, cobraComision: false, modelo: "nuevo" });
    await concepto(id, "tienda_flete_entregado", "monto", "3000.00");
  };
  await nuevoSoloFlete(dia.D1, orden.O1, "O1", "Calle 1, D1", "20000.00");
  await nuevoSoloFlete(dia.D2, orden.O1, "O1", "Calle 1, D2", "20000.00");
  await nuevoSoloFlete(dia.DZ, orden.O1, "O1", "Calle 1, DZ", "20000.00");
  await congelar({
    cierreId: dia.D1,
    ordenId: orden.O2,
    clave: "O2",
    direccion: "Calle 2",
    montoCobrar: "15000.00",
    cobraComision: false,
    modelo: "viejo",
  });
  const detO3 = await congelar({
    cierreId: dia.D2,
    ordenId: orden.O3,
    clave: "O3",
    direccion: "Calle 3",
    montoCobrar: "25000.00",
    cobraComision: true,
    modelo: "nuevo",
  });
  await concepto(detO3, "tienda_flete_entregado", "monto", "3500.00");
  await concepto(detO3, "tienda_comision_cod", "porcentaje", "2.00");
  await concepto(detO3, "tienda_fulfillment", "monto", "600.00");
  await nuevoSoloFlete(dia.D3, orden.O4, "O4", "Calle 4", "10000.00");
  await nuevoSoloFlete(dia.D4, orden.O6, "O6", "Calle 6", "10000.00");
  // O5 (BF) SIN fila congelada, a proposito (R427).

  const nuevaGestion = async (args: {
    ordenId: string;
    mensajeroId: string;
    cierreId: string;
    createdAt: string;
    resultado: "entregado" | "devolucion_a_origen_por_rechazo";
    pagos: Array<{ metodo: "efectivo" | "SINPE"; monto: string }>;
    montoRecibido: string | null;
    pagoMensajero: string;
    ingresoBodegaRechazo: string;
  }) => {
    const id = (
      await tx.gestionOrden.create({
        data: {
          ordenId: args.ordenId,
          mensajeroId: args.mensajeroId,
          resultado: args.resultado,
          cierreId: args.cierreId,
          createdAt: new Date(args.createdAt),
          ...(args.montoRecibido !== null
            ? { montoRecibido: new Prisma.Decimal(args.montoRecibido), metodoPago: args.pagos[0].metodo }
            : {}),
          pagoMensajero: new Prisma.Decimal(args.pagoMensajero),
          ingresoBodegaRechazo: new Prisma.Decimal(args.ingresoBodegaRechazo),
        },
        select: { id: true },
      })
    ).id;
    for (const p of args.pagos) {
      await tx.gestionOrdenPago.create({
        data: { gestionId: id, metodo: p.metodo, monto: new Prisma.Decimal(p.monto) },
        select: { id: true },
      });
    }
    return id;
  };
  const entregaEfectivo = (ordenId: string, mensajeroId: string, cierreId: string, createdAt: string, monto: string) =>
    nuevaGestion({
      ordenId,
      mensajeroId,
      cierreId,
      createdAt,
      resultado: "entregado",
      pagos: [{ metodo: "efectivo", monto }],
      montoRecibido: monto,
      pagoMensajero: "1500.00",
      ingresoBodegaRechazo: "0.00",
    });
  const gestion = {
    // Orden de insercion distinto del de lectura.
    G1a: await entregaEfectivo(orden.O1, mensajero.M1, dia.D1, "2026-11-06T10:00:00.000Z", "20000.00"),
    G3a: await nuevaGestion({
      ordenId: orden.O4,
      mensajeroId: mensajero.M3,
      cierreId: dia.D3,
      createdAt: "2026-11-06T09:00:00.000Z",
      resultado: "entregado",
      pagos: [{ metodo: "SINPE", monto: "10000.00" }],
      montoRecibido: "10000.00",
      pagoMensajero: "1500.00",
      ingresoBodegaRechazo: "0.00",
    }),
    G2a: await entregaEfectivo(orden.O1, mensajero.M2, dia.D2, "2026-11-06T11:00:00.000Z", "20000.00"),
    G1b: await nuevaGestion({
      ordenId: orden.O2,
      mensajeroId: mensajero.M1,
      cierreId: dia.D1,
      createdAt: "2026-11-06T12:00:00.000Z",
      resultado: "devolucion_a_origen_por_rechazo",
      pagos: [],
      montoRecibido: null,
      pagoMensajero: "1000.00",
      ingresoBodegaRechazo: "500.00",
    }),
    G2b: await nuevaGestion({
      ordenId: orden.O3,
      mensajeroId: mensajero.M2,
      cierreId: dia.D2,
      createdAt: "2026-11-06T13:00:00.000Z",
      resultado: "entregado",
      // Insertados SINPE primero: el orden de salida (efectivo, SINPE) es el del enum, no el fisico.
      pagos: [
        { metodo: "SINPE", monto: "10000.00" },
        { metodo: "efectivo", monto: "15000.00" },
      ],
      montoRecibido: "25000.00",
      pagoMensajero: "1800.00",
      ingresoBodegaRechazo: "0.00",
    }),
    G4: await entregaEfectivo(orden.O6, mensajero.M4, dia.D4, "2026-11-06T10:30:00.000Z", "10000.00"),
    GZ: await entregaEfectivo(orden.O1, mz, dia.DZ, "2026-11-06T14:00:00.000Z", "20000.00"),
  };
  await entregaEfectivo(orden.O5, mf, dia.DF, "2026-11-06T14:30:00.000Z", "10000.00");
  // G2b: metodoPago escalar = el del primer pago sembrado (SINPE); se corrige a efectivo, el principal.
  await tx.gestionOrden.update({ where: { id: gestion.G2b }, data: { metodoPago: "efectivo" }, select: { id: true } });

  await tx.gestionPagoCongelado.create({
    data: {
      gestionOrdenId: gestion.G2b,
      actor: "mensajero",
      concepto: "mensajero_entregado",
      modo: "monto",
      valor: new Prisma.Decimal("2500.00"),
      nivel: "mensajero",
      tarifaValorId: null,
      importe: new Prisma.Decimal("2500.00"),
    },
    select: { id: true },
  });
  await tx.gestionPagoMensajeroAjuste.create({
    data: {
      gestionId: gestion.G2b,
      cierreId: dia.D2,
      pagoAnterior: new Prisma.Decimal("2500.00"),
      pagoNuevo: new Prisma.Decimal("1800.00"),
      actorUsuarioId: ana,
      actorRol: "maestro",
      motivo: "Entrega fuera de ruta",
      createdAt: new Date("2026-11-06T20:00:00.000Z"),
    },
    select: { id: true },
  });

  // Movimientos de fulfillment: la app no los escribe (REVOKE, SLT-94); se insertan como el trigger.
  const movimiento = (ordenId: string, secuencia: number, tipo: "cargo" | "reverso", ocurridoAt: string) =>
    tx.$executeRawUnsafe(
      `INSERT INTO "orden_fulfillment_movimiento" ("id", "orden_id", "tienda_id", "secuencia", "tipo",
         "causa", "monto", "iva_pct", "iva", "ocurrido_at")
       VALUES ($1, $2, $3, $4, $5::"orden_fulfillment_movimiento_tipo",
         $6::"orden_fulfillment_movimiento_causa", 600, 13, 78, $7::timestamp)`,
      randomUUID(),
      ordenId,
      tienda,
      secuencia,
      tipo,
      tipo === "cargo" ? "creacion" : "eliminacion",
      ocurridoAt,
    );
  await movimiento(orden.O1, 1, "cargo", "2026-11-05 15:00:00");
  await movimiento(orden.O4, 1, "cargo", "2026-11-05 16:00:00");
  await movimiento(orden.O4, 2, "reverso", "2026-11-06 16:00:00");

  // Autocomprobacion: lo sembrado, leido en la misma transaccion (un corpus vacio no prueba nada).
  const diasBX = await tx.cierreDia.count({ where: { cierreBodegaId: bodega.BX } });
  if (diasBX !== 3) throw new Error(`corpus incompleto: ${diasBX} cierres del dia en BX de 3`);
  const gestionesBX = await tx.gestionOrden.count({ where: { cierreId: { in: [dia.D1, dia.D2, dia.D3] } } });
  if (gestionesBX !== 5) throw new Error(`corpus incompleto: ${gestionesBX} gestiones en BX de 5`);
  const detallesO1 = await tx.cierreDetail.count({ where: { ordenId: orden.O1 } });
  if (detallesO1 !== 3) throw new Error(`corpus incompleto: ${detallesO1} filas congeladas de O1 de 3`);
  const movimientos = await tx.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM "orden_fulfillment_movimiento" WHERE "orden_id" = ANY($1::text[])`,
    [orden.O1, orden.O4],
  );
  if (movimientos[0]?.n !== 3) throw new Error(`corpus incompleto: ${movimientos[0]?.n} movimientos de 3`);
  const sinFila = await tx.cierreDetail.count({ where: { ordenId: orden.O5 } });
  if (sinFila !== 0) throw new Error("corpus incorrecto: O5 no debe tener fila congelada");

  return {
    repo: new CierresBodegaAdminRepository(tx as unknown as PrismaClient),
    sufijo,
    zona,
    satelite,
    tienda,
    tarifaVieja,
    mensajero,
    bodega,
    dia,
    orden,
    gestion,
  };
}

// ── La respuesta esperada, A MANO ───────────────────────────────────────────────────────────────

/** Lo que ninguna gestion del corpus tiene: ni evidencias, ni historial de SLA/tienda, ni incidente. */
const SIN_EXTRAS = {
  numGuia: null,
  distritoNombre: null,
  zonaNombre: "Centro",
  provinciaNombre: "Provincia",
  cantonNombre: "Canton",
  tiendaNombre: "Tienda Uno",
  motivo: null,
  fechaReprogramacion: null,
  evidenciaStoragePath: null,
  evidenciaStoragePaths: [],
  esRechazoSla: false,
  desdeAyudaTienda: false,
  causaIncidente: null,
  indemnizacion: null,
  // Todas las gestiones del corpus son del 2026-11-06 entre 09:00 y 13:00 UTC = 03:00-07:00 en Costa Rica.
  fechaGestion: "2026-11-06",
};

/**
 * Modelo NUEVO, entrega, solo flete 3 000,00 monto + IVA 13 % (nivel zona, sin valor de origen):
 * IVA = 3 000 × 13 / 100 = 390,00; flete con IVA = total = 3 390,00. Sin comision (no cobra), sin
 * fulfillment (sin concepto: 0,00 y su % null).
 */
function ingresoSoloFlete(montoCobrar: string, fulfillmentCargadoAt: string | null) {
  return {
    montoCobrar,
    cobraComision: false,
    esCentral: false,
    esZonaEspecial: false,
    fleteOrigen: "normal",
    fleteDevolucionOrigen: "normal",
    flete: "3000.00",
    ivaFlete: "390.00",
    fleteDevolucion: null,
    ivaFleteDevolucion: null,
    comisionCod: null,
    ivaComisionCod: null,
    fleteConIva: "3390.00",
    fleteDevolucionConIva: null,
    comisionConIva: null,
    total: "3390.00",
    fulfillment: "0.00",
    ivaFulfillment: "0.00",
    tarifa: null,
    tarifaModelo: "nuevo",
    ivaIncluido: "390.00",
    fulfillmentConIva: "0.00",
    ivaPctFulfillment: null,
    fulfillmentCargadoAt,
    conceptosTarifa: [
      {
        concepto: "flete",
        modo: "monto",
        valor: "3000.00",
        ivaPct: "13.00",
        base: null,
        nivel: "zona",
        zonaNombre: null,
        grupoNombre: null,
        vehiculoNombre: null,
      },
    ],
  };
}

/** O1 en el cierre del dia `dia`: lo de la gestion y la fila congelada de ESE cierre del dia. */
function gestionO1(c: Corpus, gestionId: string, direccion: string): CierreGestionPendienteRow {
  return {
    ...SIN_EXTRAS,
    gestionId,
    ordenId: c.orden.O1,
    numRemision: `R-${c.sufijo}-O1`,
    destinatario: "Dest O1",
    direccion,
    producto: "Prod O1",
    tiendaId: c.tienda,
    resultado: "entregado",
    montoRecibido: "20000.00",
    metodoPago: "efectivo",
    pagos: [{ metodo: "efectivo", monto: "20000.00" }],
    pagoMensajero: "1500.00",
    ingresoBodegaRechazo: "0.00",
    // Cargo vigente de O1 (unico movimiento, un cargo): 2026-11-05 15:00 UTC, en los dos cierres del dia.
    ingresoEmpresa: ingresoSoloFlete("20000.00", "2026-11-05T15:00:00.000Z"),
    ajustesPago: [],
    pagoPorTarifa: null,
    // Nuevo + entrega (hay `mensajero_entregado` en el catalogo) + sin fila congelada del mensajero.
    tarifaFaltante: true,
  } as CierreGestionPendienteRow;
}

function esperadoBX(c: Corpus) {
  const G2b = {
    ...SIN_EXTRAS,
    gestionId: c.gestion.G2b,
    ordenId: c.orden.O3,
    numRemision: `R-${c.sufijo}-O3`,
    destinatario: "Dest O3",
    direccion: "Calle 3",
    producto: "Prod O3",
    tiendaId: c.tienda,
    resultado: "entregado",
    montoRecibido: "25000.00",
    metodoPago: "efectivo",
    // Orden del enum (efectivo, SINPE), no el de insercion.
    pagos: [
      { metodo: "efectivo", monto: "15000.00" },
      { metodo: "SINPE", monto: "10000.00" },
    ],
    pagoMensajero: "1800.00",
    ingresoBodegaRechazo: "0.00",
    ingresoEmpresa: {
      montoCobrar: "25000.00",
      cobraComision: true,
      esCentral: false,
      esZonaEspecial: false,
      fleteOrigen: "normal",
      fleteDevolucionOrigen: "normal",
      flete: "3500.00",
      ivaFlete: "455.00", // 3 500 × 13 %
      fleteDevolucion: null,
      ivaFleteDevolucion: null,
      comisionCod: "500.00", // 25 000 × 2 %
      ivaComisionCod: "65.00", // 500 × 13 %
      fleteConIva: "3955.00", // 3 500 + 455
      fleteDevolucionConIva: null,
      comisionConIva: "565.00", // 500 + 65
      total: "4520.00", // 3 500 + 455 + 500 + 65
      fulfillment: "600.00",
      ivaFulfillment: "78.00", // 600 × 13 %
      tarifa: null,
      tarifaModelo: "nuevo",
      ivaIncluido: "520.00", // 455 + 65
      fulfillmentConIva: "678.00", // 600 + 78
      ivaPctFulfillment: "13.00",
      fulfillmentCargadoAt: null, // O3 sin movimientos
      conceptosTarifa: [
        {
          concepto: "flete",
          modo: "monto",
          valor: "3500.00",
          ivaPct: "13.00",
          base: null,
          nivel: "zona",
          zonaNombre: null,
          grupoNombre: null,
          vehiculoNombre: null,
        },
        {
          concepto: "comisionCod",
          modo: "porcentaje",
          valor: "2.00",
          ivaPct: "13.00",
          base: "25000.00",
          nivel: "zona",
          zonaNombre: null,
          grupoNombre: null,
          vehiculoNombre: null,
        },
      ],
    },
    ajustesPago: [
      {
        creadoAt: "2026-11-06T20:00:00.000Z",
        actorNombre: "Ana Admin",
        actorRol: "maestro",
        pagoAnterior: "2500.00",
        pagoNuevo: "1800.00",
        motivo: "Entrega fuera de ruta",
      },
    ],
    // Pago congelado 2 500,00; pagado 1 800,00 -> ajuste que RESTA 700,00.
    pagoPorTarifa: {
      importe: "2500.00",
      modo: "monto",
      valor: "2500.00",
      base: null,
      ajuste: { signo: "resta", monto: "700.00" },
      nivel: "mensajero",
      zonaNombre: null,
      grupoNombre: null,
      vehiculoNombre: null,
    },
    tarifaFaltante: false,
  };
  const G1b = {
    ...SIN_EXTRAS,
    gestionId: c.gestion.G1b,
    ordenId: c.orden.O2,
    numRemision: `R-${c.sufijo}-O2`,
    destinatario: "Dest O2",
    direccion: "Calle 2",
    producto: "Prod O2",
    tiendaId: c.tienda,
    resultado: "devolucion_a_origen_por_rechazo",
    montoRecibido: null,
    metodoPago: null,
    pagos: [],
    pagoMensajero: "1000.00",
    ingresoBodegaRechazo: "500.00",
    // VIEJO, rechazo, no central ni especial: flete devuelto 1 500,00; IVA 1 500 × 13 % = 195,00;
    // con IVA = total = 1 695,00. Fulfillment de la columna (0,00); IVA del fulfillment siempre 0.
    ingresoEmpresa: {
      montoCobrar: "15000.00",
      cobraComision: false,
      esCentral: false,
      esZonaEspecial: false,
      fleteOrigen: "normal",
      fleteDevolucionOrigen: "normal",
      flete: null,
      ivaFlete: null,
      fleteDevolucion: "1500.00",
      ivaFleteDevolucion: "195.00",
      comisionCod: null,
      ivaComisionCod: null,
      fleteConIva: null,
      fleteDevolucionConIva: "1695.00",
      comisionConIva: null,
      total: "1695.00",
      fulfillment: "0.00",
      ivaFulfillment: "0.00",
      tarifa: {
        tarifaId: c.tarifaVieja,
        valorFlete: "2000.00",
        valorFleteGam: "2500.00",
        valorFleteDevuelto: "1500.00",
        valorFleteDevueltoGam: "1800.00",
        comisionCod: "3.00",
        ivaFlete: "13.00",
        ivaComisionCod: "13.00",
        fulfillment: "0.00",
        tarifaEspecial: null,
        tarifaEspecialDevuelta: null,
      },
      tarifaModelo: "viejo",
      ivaIncluido: "195.00",
      fulfillmentConIva: "0.00",
      ivaPctFulfillment: null,
      fulfillmentCargadoAt: null, // O2 sin movimientos
      conceptosTarifa: [],
    },
    ajustesPago: [],
    pagoPorTarifa: null,
    tarifaFaltante: false, // viejo: nunca
  };
  const G3a = {
    ...SIN_EXTRAS,
    gestionId: c.gestion.G3a,
    ordenId: c.orden.O4,
    numRemision: `R-${c.sufijo}-O4`,
    destinatario: "Dest O4",
    direccion: "Calle 4",
    producto: "Prod O4",
    tiendaId: c.tienda,
    resultado: "entregado",
    montoRecibido: "10000.00",
    metodoPago: "SINPE",
    pagos: [{ metodo: "SINPE", monto: "10000.00" }],
    pagoMensajero: "1500.00",
    ingresoBodegaRechazo: "0.00",
    // O4: cargo y despues reverso -> sin cargo vigente.
    ingresoEmpresa: ingresoSoloFlete("10000.00", null),
    ajustesPago: [],
    pagoPorTarifa: null,
    tarifaFaltante: true,
  };
  const resumen = (cierreDiaId: string, mensajeroId: string, nombre: string, s: Snap, ajustadas: number, at: string) => ({
    cierreDiaId,
    mensajeroId,
    mensajeroNombre: nombre,
    totales: { efectivo: s.efectivo, simpe: s.simpe, transferencia: "0.00", general: s.general },
    totalPagoMensajero: s.pago,
    totalIngresoBodegaRechazos: s.bodega,
    gestionesAjustadas: ajustadas,
    solicitadoAt: at,
  });
  return {
    cierre: cabecera(c, c.bodega.BX, S_BX, {
      cantidadCierres: 3,
      incluyeModeloNuevo: true,
      // 75 000 − 7 300 − 500 = 67 200; sin monto recibido falta todo.
      paraLaCentral: "67200.00",
      faltaPorRecibir: "67200.00",
      efectivoCubreDescuentos: true, // 55 000 ≥ 7 300 + 500
    }),
    // solicitadoAt desc: D2 (17:00), D3 (16:00), D1 (15:00). Dentro de cada uno, createdAt desc.
    cierresDia: [
      {
        resumen: resumen(c.dia.D2, c.mensajero.M2, "Marta Dos", S_D2, 1, "2026-11-06T17:00:00.000Z"),
        gestiones: [G2b, gestionO1(c, c.gestion.G2a, "Calle 1, D2")], // 13:00, 11:00
      },
      {
        resumen: resumen(c.dia.D3, c.mensajero.M3, "Mateo Tres", S_D3, 0, "2026-11-06T16:00:00.000Z"),
        gestiones: [G3a], // 09:00
      },
      {
        resumen: resumen(c.dia.D1, c.mensajero.M1, "Mario Uno", S_D1, 0, "2026-11-06T15:00:00.000Z"),
        gestiones: [G1b, gestionO1(c, c.gestion.G1a, "Calle 1, D1")], // 12:00, 10:00
      },
    ],
  };
}

/** La cabecera de un cierre de bodega SOLICITADO de la zona C (sin conciliar, sin resolver). */
function cabecera(
  c: Corpus,
  id: string,
  s: Snap,
  derivados: {
    cantidadCierres: number;
    incluyeModeloNuevo: boolean;
    paraLaCentral: string;
    faltaPorRecibir: string;
    efectivoCubreDescuentos: boolean;
  },
) {
  return {
    cierreBodegaId: id,
    zonaId: c.zona.C,
    zonaNombre: `Centro ${c.sufijo}`,
    solicitadoPorId: c.satelite,
    solicitadoPorNombre: "Sara", // solo `usuario.nombre`
    estado: "solicitado",
    totales: { efectivo: s.efectivo, simpe: s.simpe, transferencia: "0.00", general: s.general },
    totalPagoMensajero: s.pago,
    totalIngresoBodegaRechazos: s.bodega,
    solicitadoAt: "2026-11-06T22:00:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
    conciliado: false,
    desmarcable: false,
    montoRecibido: null,
    conciliadoAt: null,
    conciliadoPorNombre: null,
    conciliadoNota: null,
    ...derivados,
  };
}

describeSiHayBase("SLT-148 — detalle del cierre de bodega en lote, contra Postgres real", () => {
  let prisma: PrismaClient;
  let eventos: EventoSqlDeTest[];
  let conCorpus: <T>(fn: (c: Corpus) => Promise<T>) => Promise<T>;

  /** Corre `fn` y devuelve su resultado con las sentencias SQL que emitio. */
  async function medir<T>(fn: () => Promise<T>): Promise<{ r: T; ev: EventoSqlDeTest[] }> {
    const desde = eventos.length;
    const r = await fn();
    return { r, ev: eventos.slice(desde) };
  }

  beforeAll(() => {
    ({ prisma, eventos } = crearPrismaDeTestConEspia());
    conCorpus = (fn) => enTransaccionRevertida(prisma, async (tx) => fn(await sembrar(tx)));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("R422/R423/R424: BX entero, para la central y para S, igual a lo escrito a mano", async () => {
    await conCorpus(async (c) => {
      const zonaC: AlcanceLecturaBodega = { lectura: "zona", zonaId: c.zona.C };
      for (const alcance of [TODA, zonaC]) {
        const r = await c.repo.findCierreBodegaConDetalle(c.bodega.BX, ZONA_CR, alcance);
        expect(r).toEqual(esperadoBX(c));
      }
    });
  });

  it("R425: BZ con S y un id inexistente con la central -> null tras la UNICA lectura de la cabecera", async () => {
    await conCorpus(async (c) => {
      // La cabecera es UNA lectura (`findFirst`), pero Prisma la emite como su sentencia mas una por
      // relacion de `BODEGA_RESUMEN_SELECT` (zona, quien solicito, quien concilio), aunque no haya fila
      // (T0.1). R425 = nada fuera de esa lectura: ni cierres del dia, ni gestiones, ni filas, ni cargos.
      for (const [id, alcance] of [
        [c.bodega.BZ, { lectura: "zona", zonaId: c.zona.C }],
        [randomUUID(), TODA],
      ] as const) {
        const { r, ev } = await medir(() => c.repo.findCierreBodegaConDetalle(id, ZONA_CR, alcance));
        expect(r).toBeNull();
        expect(ev.map((e) => tablaPrincipal(e.query))).toEqual(TABLAS_DE_LA_CABECERA);
        // SLT-107 R280: la zona de S va EN el `where` de la cabecera (no se lee y se descarta).
        if (alcance.lectura === "zona") expect(parametrosDe(ev[0])).toContain(alcance.zonaId);
      }
      // Y BZ con la central SI existe: el null de arriba es el alcance, no un id roto.
      expect(await c.repo.findCierreBodegaConDetalle(c.bodega.BZ, ZONA_CR, TODA)).not.toBeNull();
    });
  });

  it("R426: gestiones y filas congeladas acotadas en la sentencia a los cierres del dia de BX", async () => {
    await conCorpus(async (c) => {
      const { r, ev } = await medir(() => c.repo.findCierreBodegaConDetalle(c.bodega.BX, ZONA_CR, TODA));
      if (r === null) throw new Error("BX no se encontro");
      const gestiones = r.cierresDia.flatMap((cd) => cd.gestiones);
      expect(gestiones.map((g) => g.gestionId)).not.toContain(c.gestion.GZ);
      expect(gestiones.map((g) => g.direccion)).not.toContain("Calle 1, DZ");

      const diasBX = new Set([c.dia.D1, c.dia.D2, c.dia.D3]);
      const acotadas = ev.filter((e) => {
        const t = tablaPrincipal(e.query);
        return t === "gestion_orden" || t === "cierre_detail";
      });
      expect(acotadas.map((e) => tablaPrincipal(e.query)).sort()).toEqual(
        expect.arrayContaining(["cierre_detail", "gestion_orden"]),
      );
      for (const e of acotadas) {
        const ids = parametrosDe(e).filter((p): p is string => typeof p === "string");
        expect(ids.length).toBeGreaterThan(0);
        for (const id of ids) expect(diasBX.has(id), `${tablaPrincipal(e.query)}: parametro ajeno ${id}`).toBe(true);
      }
    });
  });

  it("R427: BF (gestion sin fila congelada) rechaza nombrando su cierre del dia y su orden", async () => {
    await conCorpus(async (c) => {
      const error: unknown = await c.repo.findCierreBodegaConDetalle(c.bodega.BF, ZONA_CR, TODA).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(CierreDetalleFaltanteError);
      expect(error).toMatchObject({ cierreId: c.dia.DF, ordenId: c.orden.O5 });
      expect((error as Error).message).toContain(c.dia.DF);
      expect((error as Error).message).toContain(c.orden.O5);
    });
  });

  it("R428: B0 sin cierres del dia -> la cabecera y una lista vacia, sin leer gestiones ni filas", async () => {
    await conCorpus(async (c) => {
      const { r, ev } = await medir(() => c.repo.findCierreBodegaConDetalle(c.bodega.B0, ZONA_CR, TODA));
      expect(r).toEqual({
        cierre: cabecera(c, c.bodega.B0, S_CERO, {
          cantidadCierres: 0,
          incluyeModeloNuevo: false,
          paraLaCentral: "0.00",
          faltaPorRecibir: "0.00",
          efectivoCubreDescuentos: true, // 0 ≥ 0 + 0
        }),
        cierresDia: [],
      });
      const tablas = ev.map((e) => tablaPrincipal(e.query));
      expect(tablas).not.toContain("gestion_orden");
      expect(tablas).not.toContain("cierre_detail");
      expect(tablas).not.toContain("orden_fulfillment_movimiento");
      // Como mucho lo de antes (T0.1); desde SLT-148 el corte va antes de leer `cierre_dia` (5: cabecera + marca de modelo nuevo).
      expect(ev.length).toBeLessThanOrEqual(CONSULTAS_DETALLE_SIN_DIAS);
    });
  });

  it("R420: mismas sentencias con N = 3 (BX, 2 + 2 + 1 gestiones) que con N = 1 (B1, 1 gestion)", async () => {
    await conCorpus(async (c) => {
      const uno = await medir(() => c.repo.findCierreBodegaConDetalle(c.bodega.B1, ZONA_CR, TODA));
      const tres = await medir(() => c.repo.findCierreBodegaConDetalle(c.bodega.BX, ZONA_CR, TODA));
      if (uno.r === null || tres.r === null) throw new Error("B1 o BX no se encontro");
      expect(uno.r.cierresDia).toHaveLength(1);
      expect(tres.r.cierresDia.map((cd) => cd.gestiones.length)).toEqual([2, 1, 2]);
      expect(uno.ev.length).toBeGreaterThan(0);
      expect(tres.ev.length).toBe(uno.ev.length);
    });
  });

  it("R421: B1 (un cierre del dia) no cuesta mas sentencias que la linea base de T0", async () => {
    await conCorpus(async (c) => {
      const uno = await medir(() => c.repo.findCierreBodegaConDetalle(c.bodega.B1, ZONA_CR, TODA));
      if (uno.r === null) throw new Error("B1 no se encontro");
      expect(uno.r.cierresDia.map((cd) => cd.gestiones.map((g) => g.gestionId))).toEqual([[c.gestion.G4]]);
      expect(uno.ev.length).toBeGreaterThan(0);
      expect(uno.ev.length).toBeLessThanOrEqual(CONSULTAS_DETALLE_UNO_LINEA_BASE);
    });
  });

  it("R429: ninguna sentencia de escritura al leer ningun detalle (BX, B1, B0, BZ, BF, fuera de alcance)", async () => {
    await conCorpus(async (c) => {
      const { ev } = await medir(async () => {
        await c.repo.findCierreBodegaConDetalle(c.bodega.BX, ZONA_CR, TODA);
        await c.repo.findCierreBodegaConDetalle(c.bodega.B1, ZONA_CR, TODA);
        await c.repo.findCierreBodegaConDetalle(c.bodega.B0, ZONA_CR, TODA);
        await c.repo.findCierreBodegaConDetalle(c.bodega.BZ, ZONA_CR, TODA);
        await c.repo.findCierreBodegaConDetalle(c.bodega.BZ, ZONA_CR, { lectura: "zona", zonaId: c.zona.C });
        await c.repo.findCierreBodegaConDetalle(c.bodega.BF, ZONA_CR, TODA).catch(() => undefined);
      });
      expect(ev.length).toBeGreaterThan(0);
      for (const e of ev) expect(e.query).not.toMatch(ESCRITURA);
    });
  });
});
