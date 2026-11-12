import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import type { CierreGestionPendienteRow } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import { ZONA_CR } from "@/lib/utils/fecha-cr";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTestConEspia,
  enTransaccionRevertida,
  parametrosDe,
  serializarEscriturasReales,
  type EventoSqlDeTest,
} from "./_postgres-real";

/**
 * SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment» (T3.1; R64-R66,
 * R210-R213, R216) — las cifras de la fila que emite `CierresBodegaAdminRepository
 * .findCierreBodegaConDetalle`, contra Postgres real.
 *
 * Los tests unitarios del repositorio usan dobles: no ven el `where` de la consulta de movimientos
 * de fulfillment ni el de `pagosCongelados`. Aqui un caso solo pasa si Postgres devuelve de verdad
 * el ultimo movimiento de las ordenes de los cierres del dia de ESTE cierre de bodega y la fila
 * congelada del MENSAJERO (no la de la satelite).
 *
 * EL CORPUS (una empresa propia, dentro de una transaccion que SIEMPRE se revierte):
 *   - cierre de bodega X de la zona satelite «GAM …», con DOS cierres del dia:
 *     · del mensajero M1, gestion A (modelo NUEVO, entrega, pedido 25 000,00 con comision): flete por
 *       entregado 3 500,00 monto + IVA 13 % (nivel grupo), comision COD 2 % (nivel zona) + IVA 13 %,
 *       fulfillment 600,00 + IVA 13 %. Pago congelado del mensajero 2 500,00 y de la satelite 900,00
 *       (señuelo). Ajuste 2 500,00 -> 1 800,00. Un cargo de fulfillment el 2026-11-06.
 *     · del mensajero M2, gestion B (modelo NUEVO, entrega, pedido 10 000,00 sin comision): flete
 *       3 000,00 + IVA 13 %; SOLO la fila congelada de la satelite; cargo el 2026-11-05 y reverso el
 *       2026-11-07 (el ultimo movimiento es un reverso). Y gestion C (modelo VIEJO, entrega, pedido
 *       10 000,00 con comision): tarifa 2 000,00 + IVA 13 %, comision 3 % + IVA 13 %.
 *   - señuelo: cierre de bodega Y, con un cierre del dia que lleva la orden D y un cargo POSTERIOR
 *     (2026-11-08).
 *
 * Sin base se SALTA (`describe.skip`, visible en la salida); con base y sin catalogos, FALLA
 * ruidosamente. Nada de `return` temprano que se lea como `passed`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `slt110-${Date.now().toString(36)}`;
const ZONA = `GAM ${SUFIJO}`;
const GRUPO = "San José centro";

interface Sembrados {
  movimientos: Array<{ orden_id: string; secuencia: number; tipo: string }>;
  pagosCongelados: Array<{ gestionOrdenId: string; actor: string; importe: string }>;
  cierresDiaDeX: number;
  conceptos: number;
  ajustes: number;
}

interface Ctx {
  repo: CierresBodegaAdminRepository;
  repoAdmin: CierresAdminRepository;
  cierreBodegaId: string;
  cierreDia: { M1: string; M2: string };
  gestion: { A: string; B: string; C: string };
  orden: { A: string; B: string; C: string; D: string };
  sembrados: Sembrados;
  /** Corre una consulta capturada por el espia, en la MISMA transaccion (ve lo sembrado). */
  reejecutar: (e: EventoSqlDeTest) => Promise<Array<Record<string, unknown>>>;
}

describeSiHayBase("SLT-110 — cifras de la fila en el detalle del cierre de bodega, contra Postgres real", () => {
  let prisma: PrismaClient;
  let eventos: EventoSqlDeTest[];
  let conCorpus: <T>(fn: (ctx: Ctx) => Promise<T>) => Promise<T>;

  beforeAll(async () => {
    ({ prisma, eventos } = crearPrismaDeTestConEspia());
    const rol = await prisma.rol.findFirst({ where: { value: "mensajero" }, select: { id: true } });
    const tipo = await prisma.tipoIdentificacion.findFirst({ select: { id: true } });
    const estatus = await prisma.orderStatus.findFirst({
      where: { value: "en_reparto" },
      select: { id: true },
    });
    const canton = await prisma.canton.findFirst({ select: { id: true, provinciaId: true } });
    if (rol === null || tipo === null || estatus === null || canton === null) {
      throw new Error(
        "faltan catalogos (`rol`, `tipo_identificacion`, `order_status` o `canton`): corre " +
          "`pnpm exec prisma migrate deploy` y `pnpm run db:seed` antes de esta suite.",
      );
    }

    conCorpus = (fn) =>
      enTransaccionRevertida(prisma, async (tx) => {
        await serializarEscriturasReales(tx);

        const zonaId = (
          await tx.zona.create({
            data: { nombre: ZONA, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba" },
            select: { id: true },
          })
        ).id;
        const grupoId = (
          await tx.grupoDistritos.create({ data: { zonaId, nombre: GRUPO }, select: { id: true } })
        ).id;

        const nuevoUsuario = async (clave: string, nombre: string, primerApellido: string) =>
          (
            await tx.usuario.create({
              data: {
                nombre,
                primerApellido,
                email: `u-${clave}-${SUFIJO}@ejemplo.test`,
                telefono: "88880000",
                passwordHash: "x",
                cedula: `C-${clave}-${SUFIJO}`,
                tipoIdentificacionId: tipo.id,
                rolId: rol.id,
              },
              select: { id: true },
            })
          ).id;
        const tienda = await nuevoUsuario("tienda", "Tienda", "Fila");
        const m1 = await nuevoUsuario("m1", "Mario", "Uno");
        const m2 = await nuevoUsuario("m2", "Marta", "Dos");
        const admin = await nuevoUsuario("admin", "Ana", "Admin");
        const satelite = await nuevoUsuario("satelite", "Sara", "Satelite");

        const valor = async (data: Prisma.TarifaValorUncheckedCreateInput) =>
          (await tx.tarifaValor.create({ data, select: { id: true } })).id;
        const tvFleteGrupo = await valor({
          concepto: "tienda_flete_entregado",
          modo: "monto",
          valor: new Prisma.Decimal("3500.00"),
          ivaPct: new Prisma.Decimal("13.00"),
          zonaId,
          grupoId,
        });
        const tvComisionZona = await valor({
          concepto: "tienda_comision_cod",
          modo: "porcentaje",
          valor: new Prisma.Decimal("2.00"),
          ivaPct: new Prisma.Decimal("13.00"),
          zonaId,
        });
        const tvMensajero = await valor({
          concepto: "mensajero_entregado",
          modo: "monto",
          valor: new Prisma.Decimal("2500.00"),
          mensajeroId: m1,
        });
        const tvSatelite = await valor({
          concepto: "satelite_entregado",
          modo: "monto",
          valor: new Prisma.Decimal("900.00"),
          zonaId,
        });

        const tarifaVieja = await tx.tarifa.create({
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
        });

        const nuevoCierreBodega = async () =>
          (
            await tx.cierreBodega.create({
              data: {
                zonaId,
                solicitadoPor: satelite,
                estado: "solicitado",
                totalEfectivo: new Prisma.Decimal("0.00"),
                totalSimpe: new Prisma.Decimal("0.00"),
                totalTransferencia: new Prisma.Decimal("0.00"),
                totalGeneral: new Prisma.Decimal("0.00"),
                totalPagoMensajero: new Prisma.Decimal("0.00"),
                totalIngresoBodegaRechazos: new Prisma.Decimal("0.00"),
              },
              select: { id: true },
            })
          ).id;
        const cierreBodegaX = await nuevoCierreBodega();
        const cierreBodegaY = await nuevoCierreBodega();

        const nuevoCierreDia = async (mensajeroId: string, cierreBodegaId: string) =>
          (
            await tx.cierreDia.create({
              data: {
                mensajeroId,
                estado: "aprobado",
                destinoTipo: "bodega_satelite",
                destinoZonaId: zonaId,
                cierreBodegaId,
              },
              select: { id: true },
            })
          ).id;
        const cierreDia = {
          M1: await nuevoCierreDia(m1, cierreBodegaX),
          M2: await nuevoCierreDia(m2, cierreBodegaX),
        };
        const cierreDiaY = await nuevoCierreDia(m1, cierreBodegaY);

        const nuevaOrden = async (
          clave: string,
          montoCobrar: string,
          cobraComision: boolean,
          mensajero: string,
        ) =>
          (
            await tx.orden.create({
              data: {
                numRemision: `R-${SUFIJO}-${clave}`,
                destinatario: `Dest ${clave}`,
                telefonoDest: "88880000",
                producto: `Prod ${clave}`,
                montoCobrar: new Prisma.Decimal(montoCobrar),
                cobraComision,
                estatusId: estatus.id,
                mensajeroAsignadoId: mensajero,
                tiendaId: tienda,
                zonaId,
                provinciaId: canton.provinciaId,
                cantonId: canton.id,
              },
              select: { id: true },
            })
          ).id;
        const orden = {
          A: await nuevaOrden("A", "25000.00", true, m1),
          B: await nuevaOrden("B", "10000.00", false, m2),
          C: await nuevaOrden("C", "10000.00", true, m2),
          D: await nuevaOrden("D", "10000.00", false, m1),
        };

        const nuevoDetalle = async (
          cierre: string,
          ordenId: string,
          clave: string,
          montoCobrar: string,
          cobraComision: boolean,
          modelo: "viejo" | "nuevo",
        ) =>
          (
            await tx.cierreDetail.create({
              data: {
                cierreId: cierre,
                ordenId,
                montoCobrar: new Prisma.Decimal(montoCobrar),
                cobraComision,
                zonaId,
                tiendaId: tienda,
                esCentral: false,
                esZonaEspecial: false,
                tarifaModelo: modelo,
                ...(modelo === "viejo"
                  ? {
                      tarifaId: tarifaVieja.id,
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
                numRemision: `R-${SUFIJO}-${clave}`,
                destinatario: `Dest ${clave}`,
                producto: `Prod ${clave}`,
                tiendaNombre: "Tienda Fila",
                zonaNombre: ZONA,
                provinciaNombre: "Provincia",
                cantonNombre: "Canton",
              },
              select: { id: true },
            })
          ).id;
        const detA = await nuevoDetalle(cierreDia.M1, orden.A, "A", "25000.00", true, "nuevo");
        const detB = await nuevoDetalle(cierreDia.M2, orden.B, "B", "10000.00", false, "nuevo");
        await nuevoDetalle(cierreDia.M2, orden.C, "C", "10000.00", true, "viejo");
        await nuevoDetalle(cierreDiaY, orden.D, "D", "10000.00", false, "nuevo");

        const concepto = (data: Prisma.CierreDetailConceptoUncheckedCreateInput) =>
          tx.cierreDetailConcepto.create({ data, select: { id: true } });
        await concepto({
          cierreDetailId: detA,
          concepto: "tienda_flete_entregado",
          modo: "monto",
          valor: new Prisma.Decimal("3500.00"),
          ivaPct: new Prisma.Decimal("13.00"),
          nivel: "grupo",
          tarifaValorId: tvFleteGrupo,
        });
        await concepto({
          cierreDetailId: detA,
          concepto: "tienda_comision_cod",
          modo: "porcentaje",
          valor: new Prisma.Decimal("2.00"),
          ivaPct: new Prisma.Decimal("13.00"),
          nivel: "zona",
          tarifaValorId: tvComisionZona,
        });
        await concepto({
          cierreDetailId: detA,
          concepto: "tienda_fulfillment",
          modo: "monto",
          valor: new Prisma.Decimal("600.00"),
          ivaPct: new Prisma.Decimal("13.00"),
          nivel: "tienda_general",
          tarifaValorId: null,
        });
        await concepto({
          cierreDetailId: detB,
          concepto: "tienda_flete_entregado",
          modo: "monto",
          valor: new Prisma.Decimal("3000.00"),
          ivaPct: new Prisma.Decimal("13.00"),
          nivel: "zona",
          tarifaValorId: null,
        });

        const nuevaGestion = async (
          ordenId: string,
          mensajeroId: string,
          cierreId: string,
          montoRecibido: string,
          pagoMensajero: string,
        ) =>
          (
            await tx.gestionOrden.create({
              data: {
                ordenId,
                mensajeroId,
                resultado: "entregado",
                montoRecibido: new Prisma.Decimal(montoRecibido),
                metodoPago: "efectivo",
                cierreId,
                pagoMensajero: new Prisma.Decimal(pagoMensajero),
                ingresoBodegaRechazo: new Prisma.Decimal("0.00"),
              },
              select: { id: true },
            })
          ).id;
        const gestion = {
          A: await nuevaGestion(orden.A, m1, cierreDia.M1, "25000.00", "1800.00"),
          B: await nuevaGestion(orden.B, m2, cierreDia.M2, "10000.00", "0.00"),
          C: await nuevaGestion(orden.C, m2, cierreDia.M2, "10000.00", "1500.00"),
        };

        const pago = (data: Prisma.GestionPagoCongeladoUncheckedCreateInput) =>
          tx.gestionPagoCongelado.create({ data, select: { id: true } });
        // La fila de la satelite de A va PRIMERO: sin el filtro por actor, `pagosCongelados[0]`
        // podria ser ella.
        await pago({
          gestionOrdenId: gestion.A,
          actor: "satelite",
          concepto: "satelite_entregado",
          modo: "monto",
          valor: new Prisma.Decimal("900.00"),
          nivel: "zona",
          tarifaValorId: tvSatelite,
          importe: new Prisma.Decimal("900.00"),
        });
        await pago({
          gestionOrdenId: gestion.A,
          actor: "mensajero",
          concepto: "mensajero_entregado",
          modo: "monto",
          valor: new Prisma.Decimal("2500.00"),
          nivel: "mensajero",
          tarifaValorId: tvMensajero,
          importe: new Prisma.Decimal("2500.00"),
        });
        await pago({
          gestionOrdenId: gestion.B,
          actor: "satelite",
          concepto: "satelite_entregado",
          modo: "monto",
          valor: new Prisma.Decimal("950.00"),
          nivel: "zona",
          tarifaValorId: null,
          importe: new Prisma.Decimal("950.00"),
        });

        await tx.gestionPagoMensajeroAjuste.create({
          data: {
            gestionId: gestion.A,
            cierreId: cierreDia.M1,
            pagoAnterior: new Prisma.Decimal("2500.00"),
            pagoNuevo: new Prisma.Decimal("1800.00"),
            actorUsuarioId: admin,
            actorRol: "admin",
            motivo: "Entrega fuera de ruta",
          },
          select: { id: true },
        });

        // Movimientos de fulfillment: la app no los puede escribir (REVOKE, SLT-94); este `tx` es el
        // del dueño de las tablas, asi que se insertan como lo haria el trigger.
        const movimiento = (
          ordenId: string,
          secuencia: number,
          tipo: "cargo" | "reverso",
          causa: "creacion" | "eliminacion",
          ocurridoAt: string,
        ) =>
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
            causa,
            ocurridoAt,
          );
        // El cargo de B se inserta ANTES que su reverso: sin el `orderBy` por secuencia el orden
        // fisico pondria primero el cargo (patron de SLT-101).
        await movimiento(orden.B, 1, "cargo", "creacion", "2026-11-05 15:00:00");
        await movimiento(orden.B, 2, "reverso", "eliminacion", "2026-11-07 16:00:00");
        await movimiento(orden.A, 1, "cargo", "creacion", "2026-11-06 15:00:00");
        await movimiento(orden.D, 1, "cargo", "creacion", "2026-11-08 15:00:00");

        // Autocomprobacion: lo sembrado, leido de la base en la misma transaccion.
        const movimientos = await tx.$queryRawUnsafe<Sembrados["movimientos"]>(
          `SELECT "orden_id", "secuencia", "tipo"::text AS "tipo" FROM "orden_fulfillment_movimiento"
            WHERE "orden_id" = ANY($1::text[]) ORDER BY "orden_id", "secuencia"`,
          [orden.A, orden.B, orden.C, orden.D],
        );
        const pagosCongelados = (
          await tx.gestionPagoCongelado.findMany({
            where: { gestionOrdenId: { in: [gestion.A, gestion.B, gestion.C] } },
            select: { gestionOrdenId: true, actor: true, importe: true },
          })
        ).map((p) => ({ ...p, importe: p.importe.toFixed(2) }));
        const cierresDiaDeX = await tx.cierreDia.count({ where: { cierreBodegaId: cierreBodegaX } });
        const conceptos = await tx.cierreDetailConcepto.count({
          where: { cierreDetailId: { in: [detA, detB] } },
        });
        const ajustes = await tx.gestionPagoMensajeroAjuste.count({
          where: { cierreId: cierreDia.M1 },
        });

        const repo = new CierresBodegaAdminRepository(tx as unknown as PrismaClient);
        const repoAdmin = new CierresAdminRepository(
          tx as unknown as PrismaClient,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
        );
        return fn({
          repo,
          repoAdmin,
          cierreBodegaId: cierreBodegaX,
          cierreDia,
          gestion,
          orden,
          sembrados: { movimientos, pagosCongelados, cierresDiaDeX, conceptos, ajustes },
          reejecutar: (e) =>
            tx.$queryRawUnsafe<Array<Record<string, unknown>>>(e.query, ...parametrosDe(e)),
        });
      });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** El detalle de bodega leido por el repositorio, por gestion y por cierre del dia. */
  const leer = (c: Ctx) =>
    c.repo.findCierreBodegaConDetalle(c.cierreBodegaId, ZONA_CR).then((r) => {
      if (r === null) throw new Error("el cierre de bodega sembrado no se encontro");
      const todas = r.cierresDia.flatMap((cd) => cd.gestiones);
      const porId = new Map(todas.map((g) => [g.gestionId, g]));
      const de = (id: string): CierreGestionPendienteRow => {
        const g = porId.get(id);
        if (g === undefined) throw new Error(`falta la gestion ${id} en el detalle de bodega`);
        return g;
      };
      const gestionesDe = (cierreDiaId: string) => {
        const cd = r.cierresDia.find((x) => x.resumen.cierreDiaId === cierreDiaId);
        if (cd === undefined) throw new Error(`falta el cierre del dia ${cierreDiaId}`);
        return cd.gestiones;
      };
      return {
        cierresDia: r.cierresDia.length,
        total: todas.length,
        A: de(c.gestion.A),
        B: de(c.gestion.B),
        C: de(c.gestion.C),
        gestionesDe,
      };
    });

  it("autocomprobacion: dos cierres del dia en X, movimientos, pagos congelados, conceptos y ajuste", async () => {
    await conCorpus(async (c) => {
      expect(c.sembrados.cierresDiaDeX).toBe(2);
      expect(c.sembrados.movimientos).toHaveLength(4);
      const porOrden = (o: string) =>
        c.sembrados.movimientos.filter((m) => m.orden_id === o).map((m) => [m.secuencia, m.tipo]);
      expect(porOrden(c.orden.A)).toEqual([[1, "cargo"]]);
      expect(porOrden(c.orden.B)).toEqual([
        [1, "cargo"],
        [2, "reverso"],
      ]);
      expect(porOrden(c.orden.D)).toEqual([[1, "cargo"]]);
      expect(
        c.sembrados.pagosCongelados
          .map((p) => [p.gestionOrdenId === c.gestion.A ? "A" : "B", p.actor, p.importe])
          .sort(),
      ).toEqual([
        ["A", "mensajero", "2500.00"],
        ["A", "satelite", "900.00"],
        ["B", "satelite", "950.00"],
      ]);
      expect(c.sembrados.conceptos).toBe(4);
      expect(c.sembrados.ajustes).toBe(1);
    });
  });

  it("R64/R65/R66/R210/R211: gestion A — tarifa por concepto, IVA, fulfillment con fecha y pago con ajuste", async () => {
    const r = await conCorpus(leer);
    expect(r.cierresDia).toBe(2);
    expect(r.total).toBe(3);
    expect(r.A.ingresoEmpresa?.conceptosTarifa).toEqual([
      {
        concepto: "flete",
        modo: "monto",
        valor: "3500.00",
        ivaPct: "13.00",
        base: null,
        nivel: "grupo",
        zonaNombre: ZONA,
        grupoNombre: "San José centro",
        vehiculoNombre: null,
      },
      {
        concepto: "comisionCod",
        modo: "porcentaje",
        valor: "2.00",
        ivaPct: "13.00",
        base: "25000.00",
        nivel: "zona",
        zonaNombre: ZONA,
        grupoNombre: null,
        vehiculoNombre: null,
      },
    ]);
    // 455,00 (13 % de 3 500,00) + 65,00 (13 % de 500,00, el 2 % de 25 000,00).
    expect(r.A.ingresoEmpresa?.ivaIncluido).toBe("520.00");
    expect(r.A.ingresoEmpresa).toMatchObject({
      fulfillmentConIva: "678.00",
      ivaPctFulfillment: "13.00",
      fulfillmentCargadoAt: "2026-11-06T15:00:00.000Z",
    });
    expect(r.A.pagoMensajero).toBe("1800.00");
    expect(r.A.pagoPorTarifa).toEqual({
      importe: "2500.00",
      modo: "monto",
      valor: "2500.00",
      base: null,
      nivel: "mensajero",
      zonaNombre: null,
      grupoNombre: null,
      vehiculoNombre: null,
      ajuste: { signo: "resta", monto: "700.00" },
    });
    expect(r.A.tarifaFaltante).toBe(false);
  });

  it("R210/R211/R66: gestion B — ultimo movimiento reverso = sin fecha; sin fila del mensajero = «Sin tarifa de pago»", async () => {
    const r = await conCorpus(leer);
    expect(r.B.ingresoEmpresa?.fulfillmentCargadoAt).toBeNull();
    expect(r.B.pagoPorTarifa).toBeNull();
    expect(r.B.tarifaFaltante).toBe(true);
  });

  it("R64/R65/R211: gestion C (modelo viejo) — sin conceptos, IVA 299,00, sin pago por tarifa ni señal", async () => {
    const r = await conCorpus(leer);
    expect(r.C.ingresoEmpresa?.conceptosTarifa).toEqual([]);
    // 260,00 (13 % de 2 000,00) + 39,00 (13 % de 300,00, el 3 % de 10 000,00).
    expect(r.C.ingresoEmpresa?.ivaIncluido).toBe("299.00");
    expect(r.C.ingresoEmpresa?.fulfillmentCargadoAt).toBeNull();
    expect(r.C.pagoPorTarifa).toBeNull();
    expect(r.C.tarifaFaltante).toBe(false);
  });

  it("R212: cada gestion de bodega es identica a la del detalle de su cierre del dia en /cierres-admin", async () => {
    const { bodega, admin } = await conCorpus(async (c) => {
      const b = await leer(c);
      const leerAdmin = async (cierreId: string) => {
        const d = await c.repoAdmin.findCierreByIdEnAlcance(
          cierreId,
          { lectura: "toda_la_empresa" },
          ZONA_CR,
        );
        if (d === null) throw new Error(`el cierre del dia ${cierreId} no se encontro en /cierres-admin`);
        return d.gestiones;
      };
      return {
        bodega: { M1: b.gestionesDe(c.cierreDia.M1), M2: b.gestionesDe(c.cierreDia.M2) },
        admin: { M1: await leerAdmin(c.cierreDia.M1), M2: await leerAdmin(c.cierreDia.M2) },
      };
    });
    expect(bodega.M1).toHaveLength(1);
    expect(bodega.M2).toHaveLength(2);
    expect(bodega.M1).toEqual(admin.M1);
    expect(bodega.M2).toEqual(admin.M2);
  });

  it("R216/R210: UNA consulta de movimientos para los dos cierres del dia; solo ordenes de X (D no se cuela)", async () => {
    const filas = await conCorpus(async (c) => {
      const desde = eventos.length;
      await c.repo.findCierreBodegaConDetalle(c.cierreBodegaId, ZONA_CR);
      const consultas = eventos
        .slice(desde)
        .filter((e) => e.query.includes(`"orden_fulfillment_movimiento"`));
      expect(consultas).toHaveLength(1);
      // Se re-ejecuta el SQL REAL que emitio el repositorio (no uno escrito aqui), en la misma tx.
      const vistas = await c.reejecutar(consultas[0]!);
      return { vistas: vistas.map((v) => v.orden_id), orden: c.orden };
    });
    expect(filas.vistas.length).toBeGreaterThan(0);
    expect(new Set(filas.vistas)).toEqual(new Set([filas.orden.A, filas.orden.B]));
    expect(filas.vistas).not.toContain(filas.orden.D);
  });

  it("R213: la lectura del detalle no escribe en la base", async () => {
    const escrituras = await conCorpus(async (c) => {
      const desde = eventos.length;
      const r = await c.repo.findCierreBodegaConDetalle(c.cierreBodegaId, ZONA_CR);
      expect(r).not.toBeNull();
      const leidas = eventos.slice(desde);
      expect(leidas.length).toBeGreaterThan(0);
      return leidas
        .map((e) => e.query.trimStart())
        .filter((q) => /^(INSERT|UPDATE|DELETE)\b/i.test(q));
    });
    expect(escrituras).toEqual([]);
  });
});
