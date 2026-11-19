import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import type { Alcance } from "@/lib/interfaces/repositories/ICierresAdminRepository";
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
 * SLT-101 «Fila de gestión única y lista con filtros» (T1.2; R64-R66, R92-R96) — las cifras nuevas de
 * la fila que emite `findCierreByIdEnAlcance`, contra Postgres real.
 *
 * Los tests de servicio usan dobles de la fila: no ven el `where` de `pagosCongelados` ni la consulta
 * de los movimientos de fulfillment. Aqui la unica forma de que un caso pase es que Postgres devuelva
 * de verdad la fila congelada del MENSAJERO (no la de la satelite) y el ultimo movimiento de
 * fulfillment de las ordenes de ESTE cierre.
 *
 * EL CORPUS (una empresa propia, dentro de una transaccion que SIEMPRE se revierte):
 *   - cierre 1 (el que se lee), bodega satelite de la zona «GAM …»:
 *     · gestion A (modelo NUEVO, entrega, pedido 25 000,00 con comision): flete por entregado 3 500,00
 *       monto + IVA 13 % (nivel grupo «San José centro» de la zona), comision COD 2 % (nivel zona) +
 *       IVA 13 %, fulfillment 600,00 + IVA 13 %, y un flete por rechazo congelado que NO se cobra en
 *       una entrega (señuelo). Pago congelado del mensajero 2 500,00 (precio propio) y de la satelite
 *       900,00 (señuelo). Ajuste 2 500,00 -> 1 800,00. Un cargo de fulfillment el 2026-11-06.
 *     · gestion B (modelo NUEVO, entrega, pedido 10 000,00 sin comision): flete 3 000,00 + IVA 13 %;
 *       SOLO la fila de la satelite (950,00); su fulfillment se cobro el 2026-11-05 y se revirtio el
 *       2026-11-07 (el ultimo movimiento es un reverso).
 *     · gestion C (modelo VIEJO, entrega, pedido 10 000,00 con comision): tarifa 2 000,00 + IVA 13 %,
 *       comision 3 % + IVA 13 %.
 *   - cierre 2 (otro cierre del mismo mensajero): orden D con un cargo POSTERIOR (2026-11-08).
 *
 * Sin base se SALTA (`describe.skip`, visible en la salida); con base y sin catalogos, FALLA
 * ruidosamente. Nada de `return` temprano que se lea como `passed`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `slt101-${Date.now().toString(36)}`;
const ZONA = `GAM ${SUFIJO}`;
const GRUPO = "San José centro";

interface Sembrados {
  movimientos: Array<{ orden_id: string; secuencia: number; tipo: string }>;
  pagosCongelados: Array<{ gestionOrdenId: string; actor: string; importe: string }>;
  conceptos: number;
  ajustes: number;
}

interface Ctx {
  repo: CierresAdminRepository;
  alcance: Alcance;
  cierreId: string;
  gestion: { A: string; B: string; C: string };
  orden: { A: string; B: string; C: string; D: string };
  sembrados: Sembrados;
  /** Corre una consulta capturada por el espia, en la MISMA transaccion (ve lo sembrado). */
  reejecutar: (e: EventoSqlDeTest) => Promise<Array<Record<string, unknown>>>;
}

describeSiHayBase("SLT-101 — cifras de la fila en el detalle del cierre, contra Postgres real", () => {
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
        const mensajero = await nuevoUsuario("mensajero", "Mario", "Mensajero");
        const admin = await nuevoUsuario("admin", "Ana", "Admin");

        // Valores de tarifa de origen (sus nombres son lo que la fila pinta en «Tarifa: …»).
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
          mensajeroId: mensajero,
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

        const nuevoCierre = async () =>
          (
            await tx.cierreDia.create({
              data: {
                mensajeroId: mensajero,
                estado: "solicitado",
                destinoTipo: "bodega_satelite",
                destinoZonaId: zonaId,
              },
              select: { id: true },
            })
          ).id;
        const cierreId = await nuevoCierre();
        const otroCierreId = await nuevoCierre();

        const nuevaOrden = async (clave: string, montoCobrar: string, cobraComision: boolean) =>
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
          A: await nuevaOrden("A", "25000.00", true),
          B: await nuevaOrden("B", "10000.00", false),
          C: await nuevaOrden("C", "10000.00", true),
          D: await nuevaOrden("D", "10000.00", false),
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
        const detA = await nuevoDetalle(cierreId, orden.A, "A", "25000.00", true, "nuevo");
        const detB = await nuevoDetalle(cierreId, orden.B, "B", "10000.00", false, "nuevo");
        await nuevoDetalle(cierreId, orden.C, "C", "10000.00", true, "viejo");
        await nuevoDetalle(otroCierreId, orden.D, "D", "10000.00", false, "nuevo");

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
        // Señuelo: congelado, pero una entrega no lo cobra. No puede aparecer en `conceptosTarifa`.
        await concepto({
          cierreDetailId: detA,
          concepto: "tienda_flete_rechazo",
          modo: "monto",
          valor: new Prisma.Decimal("1200.00"),
          ivaPct: new Prisma.Decimal("13.00"),
          nivel: "zona",
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

        const nuevaGestion = async (ordenId: string, montoRecibido: string, pagoMensajero: string) =>
          (
            await tx.gestionOrden.create({
              data: {
                ordenId,
                mensajeroId: mensajero,
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
          A: await nuevaGestion(orden.A, "25000.00", "1800.00"),
          B: await nuevaGestion(orden.B, "10000.00", "0.00"),
          C: await nuevaGestion(orden.C, "10000.00", "1500.00"),
        };

        const pago = (data: Prisma.GestionPagoCongeladoUncheckedCreateInput) =>
          tx.gestionPagoCongelado.create({ data, select: { id: true } });
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
            cierreId,
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
        // El cargo se inserta ANTES que su reverso: sin el `orderBy` por secuencia, el orden fisico
        // pone primero el cargo y el «ultimo evento» saldria mal (medido: con el orden inverso, la
        // mutacion que quita el `orderBy` sobrevivia en verde).
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
        const conceptos = await tx.cierreDetailConcepto.count({
          where: { cierreDetailId: { in: [detA, detB] } },
        });
        const ajustes = await tx.gestionPagoMensajeroAjuste.count({ where: { cierreId } });

        const repo = new CierresAdminRepository(
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
          alcance: { destinoTipo: "bodega_satelite", destinoZonaId: zonaId },
          cierreId,
          gestion,
          orden,
          sembrados: { movimientos, pagosCongelados, conceptos, ajustes },
          reejecutar: (e) =>
            tx.$queryRawUnsafe<Array<Record<string, unknown>>>(e.query, ...parametrosDe(e)),
        });
      });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** El detalle leido por el repositorio, por gestion. */
  const leer = (c: Ctx) =>
    c.repo.findCierreByIdEnAlcance(c.cierreId, c.alcance, ZONA_CR).then((r) => {
      if (r === null) throw new Error("el cierre sembrado no se encontro con su propio alcance");
      const porId = new Map(r.gestiones.map((g) => [g.gestionId, g]));
      const de = (id: string): CierreGestionPendienteRow => {
        const g = porId.get(id);
        if (g === undefined) throw new Error(`falta la gestion ${id} en el detalle`);
        return g;
      };
      return { total: r.gestiones.length, A: de(c.gestion.A), B: de(c.gestion.B), C: de(c.gestion.C) };
    });

  it("autocomprobacion: movimientos, pagos congelados, conceptos y ajuste sembrados", async () => {
    await conCorpus(async (c) => {
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
      expect(c.sembrados.conceptos).toBe(5);
      expect(c.sembrados.ajustes).toBe(1);
    });
  });

  it("R65/R93/R92: IVA incluido = suma de los IVA de los conceptos presentes, string escala 2", async () => {
    const r = await conCorpus(leer);
    expect(r.total).toBe(3);
    // A: 455,00 (13 % de 3 500,00) + 65,00 (13 % de 500,00).
    expect(r.A.ingresoEmpresa?.ivaIncluido).toBe("520.00");
    expect(r.A.ingresoEmpresa?.total).toBe("4520.00");
    // B: 390,00 (13 % de 3 000,00), sin comision.
    expect(r.B.ingresoEmpresa?.ivaIncluido).toBe("390.00");
    // C (viejo): 260,00 (13 % de 2 000,00) + 39,00 (13 % de 300,00, el 3 % de 10 000,00).
    expect(r.C.ingresoEmpresa?.ivaIncluido).toBe("299.00");
  });

  it("R65/R94: «Se cobró», % de IVA y fecha del cargo vigente del fulfillment", async () => {
    const r = await conCorpus(leer);
    expect(r.A.ingresoEmpresa).toMatchObject({
      fulfillment: "600.00",
      ivaFulfillment: "78.00",
      fulfillmentConIva: "678.00",
      ivaPctFulfillment: "13.00",
      fulfillmentCargadoAt: "2026-11-06T15:00:00.000Z",
    });
  });

  it("R94: si el ultimo movimiento de la orden es un reverso, no hay fecha de cargo", async () => {
    const r = await conCorpus(leer);
    expect(r.B.ingresoEmpresa?.fulfillmentCargadoAt).toBeNull();
    // B no tiene concepto de fulfillment congelado: sin % (no se inventa un 13).
    expect(r.B.ingresoEmpresa?.ivaPctFulfillment).toBeNull();
    expect(r.B.ingresoEmpresa?.fulfillmentConIva).toBe("0.00");
  });

  it("R94: el viejo no tiene % de IVA del fulfillment ni movimientos", async () => {
    const r = await conCorpus(leer);
    expect(r.C.ingresoEmpresa).toMatchObject({
      fulfillmentConIva: "0.00",
      ivaPctFulfillment: null,
      fulfillmentCargadoAt: null,
    });
  });

  it("R94: la consulta de movimientos solo trae ordenes de ESTE cierre (la orden D no se cuela)", async () => {
    const filas = await conCorpus(async (c) => {
      const desde = eventos.length;
      await c.repo.findCierreByIdEnAlcance(c.cierreId, c.alcance, ZONA_CR);
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

  it("R64/R97: tarifa congelada de cada concepto COBRADO, con sus nombres de origen", async () => {
    const r = await conCorpus(leer);
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
    // Valor de tarifa borrado (FK SET NULL): el nivel queda, sin nombres.
    expect(r.B.ingresoEmpresa?.conceptosTarifa).toEqual([
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
    ]);
    expect(r.C.ingresoEmpresa?.conceptosTarifa).toEqual([]);
  });

  it("R66/R95: pago por tarifa = la fila del MENSAJERO (2 500,00), con el ajuste que resta 700,00", async () => {
    const r = await conCorpus(leer);
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
  });

  it("R95: sin fila del mensajero (B, solo satelite) y en el viejo (C), el pago por tarifa es null", async () => {
    const r = await conCorpus(leer);
    expect(r.B.pagoPorTarifa).toBeNull();
    expect(r.C.pagoPorTarifa).toBeNull();
  });

  it("R66/R96: «Sin tarifa de pago» solo en el nuevo sin fila del mensajero", async () => {
    const r = await conCorpus(leer);
    expect(r.A.tarifaFaltante).toBe(false);
    expect(r.B.tarifaFaltante).toBe(true);
    expect(r.C.tarifaFaltante).toBe(false);
  });
});
