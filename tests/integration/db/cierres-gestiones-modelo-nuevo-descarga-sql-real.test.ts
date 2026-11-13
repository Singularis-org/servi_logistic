import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import type { Alcance } from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { CierreGestionDescargaRow } from "@/lib/interfaces/services/ICierresAdminService";
import { filtrosConLimites, type FiltrosDescargaGestionesRepo } from "@/lib/types/filtros-cierres";
import { ZONA_CR } from "@/lib/utils/fecha-cr";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTestConEspia,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type EventoSqlDeTest,
} from "./_postgres-real";

/**
 * SLT-113 «Excel del modelo nuevo de cierres» (T3.1; R371, R373, R374, R375) — la hoja fundida
 * («Detalle · una fila por gestion») y la hoja de rechazos de la tienda, leidas por los dos
 * repositorios contra Postgres real.
 *
 * Los tests de servicio usan dobles: no ven ni el WHERE de alcance de los rechazos, ni el criterio
 * «alguna fila nueva» del cierre, ni el filtro `actor = mensajero` de los pagos congelados. Aqui un
 * caso solo pasa si Postgres devuelve de verdad lo que la pantalla ve.
 *
 * EL CORPUS (una empresa propia, dentro de una transaccion que SIEMPRE se revierte). Zona Centro =
 * alcance de la satelite S; zona Norte, fuera de el:
 *   - N1 (id `…0000abcd1234`), mensajero M1, satelite Centro, MIXTO (una fila congelada vieja, la de
 *     D, insertada PRIMERO; A y B nuevas), consolidado en el cierre de bodega X:
 *     · A entrega, pedido 25 000,00 con comision, efectivo 25 000,00: flete 3 500,00 + IVA 13 % (grupo
 *       «San José centro»), comision 2 % (zona) + IVA 13 %, fulfillment 600,00 + IVA 13 %; pago
 *       congelado del mensajero 2 500,00 (zona) y de la satelite 900,00 (señuelo, insertado antes);
 *       ajuste 2 500,00 -> 1 800,00 de «Ana Pérez», «Ruta corta»; cargo de fulfillment el
 *       2026-11-06 20:30 de Costa Rica (02:30 UTC del 07).
 *     · B novedad: flete de no entregadas 1 500,00 + IVA 13 %, sin pago congelado del mensajero.
 *     · D entrega con fila congelada del modelo VIEJO (la que haria «viejo» al cierre si se mirara
 *       solo la primera fila).
 *     · rechazo R1 (2026-11-05 21:00 de Costa Rica, «No lo pidió»).
 *   - V1, mensajero M2, satelite Centro, modelo viejo, consolidado en X: gestion C y rechazo R2
 *     (señuelo: cierre viejo).
 *   - N2, mensajero M3, satelite Norte, nuevo, con gestion y rechazo R3 (señuelo de alcance para S).
 *   - N3, mensajero M1, satelite Centro, nuevo, solicitado el 2026-10-01 (fuera del rango de
 *     noviembre), con gestion y rechazo R4 (señuelo del recorte de fechas).
 *   - N4, mensajero M3, satelite Norte, nuevo, SIN consolidar, con gestion y rechazo R5 (señuelo de
 *     la hoja de bodega).
 *   - N5, mensajero M2, bodega CENTRAL, nuevo, con gestion E y rechazo R6: lo unico que alcanza la
 *     central en `/cierres-admin` (el acceso total ve los `bodega_central`, no los de las satelites,
 *     que salen por la hoja de bodega: conjuntos disjuntos, feature 230 §2.6).
 *   - N6, mensajero M1, satelite Centro, nuevo, SIN gestiones, con rechazo R7 (señuelo: el conjunto
 *     de cierres de la hoja es el de los cierres con gestiones).
 *
 * Sin base se SALTA (`describe.skip`, visible en la salida); con base y sin catalogos, FALLA
 * ruidosamente. Nada de `return` temprano que se lea como `passed`.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `slt113-${Date.now().toString(36)}`;
const ZONA_C = `Centro ${SUFIJO}`;
const ZONA_N = `Norte ${SUFIJO}`;
const GRUPO = "San José centro";
const NOVIEMBRE = { desde: "2026-11-01", hasta: "2026-11-30" } as const;

interface Ctx {
  repo: CierresAdminRepository;
  repoBodega: CierresBodegaAdminRepository;
  alcance: { central: Alcance; satelite: Alcance };
  m: { m1: string; m2: string; m3: string };
  cierre: { N1: string; V1: string; N2: string; N3: string; N4: string; N5: string; N6: string };
  sembrados: { rechazos: number; detalleN1: string[]; cierresDeX: number; pagosA: string[] };
}

describeSiHayBase("SLT-113 — hoja «Gestiones» y rechazos del modelo nuevo, contra Postgres real", () => {
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

        const nuevaZona = async (nombre: string) =>
          (
            await tx.zona.create({
              data: { nombre, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba" },
              select: { id: true },
            })
          ).id;
        const zonaC = await nuevaZona(ZONA_C);
        const zonaN = await nuevaZona(ZONA_N);
        const grupoId = (
          await tx.grupoDistritos.create({ data: { zonaId: zonaC, nombre: GRUPO }, select: { id: true } })
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
        const m3 = await nuevoUsuario("m3", "Mía", "Tres");
        const admin = await nuevoUsuario("admin", "Ana", "Pérez");
        const satelite = await nuevoUsuario("satelite", "Sara", "Satelite");

        const valor = async (data: Prisma.TarifaValorUncheckedCreateInput) =>
          (await tx.tarifaValor.create({ data, select: { id: true } })).id;
        const tvFleteGrupo = await valor({
          concepto: "tienda_flete_entregado",
          modo: "monto",
          valor: new Prisma.Decimal("3500.00"),
          ivaPct: new Prisma.Decimal("13.00"),
          zonaId: zonaC,
          grupoId,
        });
        const tvComisionZona = await valor({
          concepto: "tienda_comision_cod",
          modo: "porcentaje",
          valor: new Prisma.Decimal("2.00"),
          ivaPct: new Prisma.Decimal("13.00"),
          zonaId: zonaC,
        });
        const tvNovedadZona = await valor({
          concepto: "tienda_flete_novedad",
          modo: "monto",
          valor: new Prisma.Decimal("1500.00"),
          ivaPct: new Prisma.Decimal("13.00"),
          zonaId: zonaC,
        });
        const tvMensajeroZona = await valor({
          concepto: "mensajero_entregado",
          modo: "monto",
          valor: new Prisma.Decimal("2500.00"),
          zonaId: zonaC,
        });
        const tvSatelite = await valor({
          concepto: "satelite_entregado",
          modo: "monto",
          valor: new Prisma.Decimal("900.00"),
          zonaId: zonaC,
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

        const cierreBodegaX = (
          await tx.cierreBodega.create({
            data: {
              zonaId: zonaC,
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

        const nuevoCierre = async (args: {
          id?: string;
          mensajeroId: string;
          destinoTipo: "bodega_central" | "bodega_satelite";
          destinoZonaId: string;
          solicitadoAt: string;
          cierreBodegaId?: string;
        }) =>
          (
            await tx.cierreDia.create({
              data: {
                ...(args.id !== undefined ? { id: args.id } : {}),
                mensajeroId: args.mensajeroId,
                estado: "aprobado",
                destinoTipo: args.destinoTipo,
                destinoZonaId: args.destinoZonaId,
                solicitadoAt: new Date(args.solicitadoAt),
                ...(args.cierreBodegaId !== undefined ? { cierreBodegaId: args.cierreBodegaId } : {}),
              },
              select: { id: true },
            })
          ).id;
        const sat = "bodega_satelite" as const;
        const cierre = {
          // El id acaba en `0000abcd1234`: el folio es «ABCD1234» (literal escrito a mano).
          N1: await nuevoCierre({
            id: `${randomUUID().slice(0, 24)}0000abcd1234`,
            mensajeroId: m1,
            destinoTipo: sat,
            destinoZonaId: zonaC,
            solicitadoAt: "2026-11-06T18:00:00.000Z",
            cierreBodegaId: cierreBodegaX,
          }),
          V1: await nuevoCierre({
            mensajeroId: m2,
            destinoTipo: sat,
            destinoZonaId: zonaC,
            solicitadoAt: "2026-11-06T17:00:00.000Z",
            cierreBodegaId: cierreBodegaX,
          }),
          N2: await nuevoCierre({ mensajeroId: m3, destinoTipo: sat, destinoZonaId: zonaN, solicitadoAt: "2026-11-06T16:00:00.000Z" }),
          N3: await nuevoCierre({ mensajeroId: m1, destinoTipo: sat, destinoZonaId: zonaC, solicitadoAt: "2026-10-01T18:00:00.000Z" }),
          N4: await nuevoCierre({ mensajeroId: m3, destinoTipo: sat, destinoZonaId: zonaN, solicitadoAt: "2026-11-06T15:00:00.000Z" }),
          N5: await nuevoCierre({
            mensajeroId: m2,
            destinoTipo: "bodega_central",
            destinoZonaId: zonaC,
            solicitadoAt: "2026-11-06T14:00:00.000Z",
          }),
          N6: await nuevoCierre({ mensajeroId: m1, destinoTipo: sat, destinoZonaId: zonaC, solicitadoAt: "2026-11-06T13:00:00.000Z" }),
        };

        const nuevaOrden = async (
          clave: string,
          montoCobrar: string,
          cobraComision: boolean,
          mensajero: string,
          id?: string,
        ) =>
          (
            await tx.orden.create({
              data: {
                ...(id !== undefined ? { id } : {}),
                numRemision: `R-${SUFIJO}-${clave}`,
                destinatario: `Dest ${clave}`,
                telefonoDest: "88880000",
                producto: `Prod ${clave}`,
                montoCobrar: new Prisma.Decimal(montoCobrar),
                cobraComision,
                estatusId: estatus.id,
                mensajeroAsignadoId: mensajero,
                tiendaId: tienda,
                zonaId: zonaC,
                provinciaId: canton.provinciaId,
                cantonId: canton.id,
              },
              select: { id: true },
            })
          ).id;
        const orden = {
          A: await nuevaOrden("A", "25000.00", true, m1),
          B: await nuevaOrden("B", "10000.00", false, m1),
          // El id MAS BAJO del corpus: en el orden de la lectura (`cierre_id`, `orden_id`) la fila
          // congelada VIEJA de D es la primera de N1.
          D: await nuevaOrden("D", "10000.00", false, m1, `00000000-0000-4000-8000-${randomUUID().slice(-12)}`),
          C: await nuevaOrden("C", "10000.00", true, m2),
          F: await nuevaOrden("F", "10000.00", false, m3), // N2
          G: await nuevaOrden("G", "10000.00", false, m1), // N3
          H: await nuevaOrden("H", "10000.00", false, m3), // N4
          E: await nuevaOrden("E", "10000.00", false, m2), // N5
        };

        const nuevoDetalle = async (
          cierreId: string,
          ordenId: string,
          clave: string,
          montoCobrar: string,
          cobraComision: boolean,
          modelo: "viejo" | "nuevo",
        ) =>
          (
            await tx.cierreDetail.create({
              data: {
                cierreId,
                ordenId,
                montoCobrar: new Prisma.Decimal(montoCobrar),
                cobraComision,
                zonaId: zonaC,
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
                zonaNombre: ZONA_C,
                provinciaNombre: "Provincia",
                cantonNombre: "Canton",
              },
              select: { id: true },
            })
          ).id;
        // La fila VIEJA de N1 es la PRIMERA en el orden de la lectura (orden D, el id mas bajo):
        // clasificar el cierre por su primera fila diria «viejo».
        await nuevoDetalle(cierre.N1, orden.D, "D", "10000.00", false, "viejo");
        const detA = await nuevoDetalle(cierre.N1, orden.A, "A", "25000.00", true, "nuevo");
        const detB = await nuevoDetalle(cierre.N1, orden.B, "B", "10000.00", false, "nuevo");
        await nuevoDetalle(cierre.V1, orden.C, "C", "10000.00", true, "viejo");
        await nuevoDetalle(cierre.N2, orden.F, "F", "10000.00", false, "nuevo");
        await nuevoDetalle(cierre.N3, orden.G, "G", "10000.00", false, "nuevo");
        // La orden de C tambien esta congelada en N3 (nuevo) y tiene un cargo: el mapa de cargos la
        // trae, y aun asi C, de un cierre VIEJO, no debe pintar la fecha (R375: solo cierres nuevos).
        await nuevoDetalle(cierre.N3, orden.C, "C3", "10000.00", false, "nuevo");
        await nuevoDetalle(cierre.N4, orden.H, "H", "10000.00", false, "nuevo");
        await nuevoDetalle(cierre.N5, orden.E, "E", "10000.00", false, "nuevo");
        // N6 tiene fila congelada nueva pero NINGUNA gestion.
        await nuevoDetalle(cierre.N6, orden.G, "G6", "10000.00", false, "nuevo");

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
          concepto: "tienda_flete_novedad",
          modo: "monto",
          valor: new Prisma.Decimal("1500.00"),
          ivaPct: new Prisma.Decimal("13.00"),
          nivel: "zona",
          tarifaValorId: tvNovedadZona,
        });

        const nuevaGestion = async (
          ordenId: string,
          mensajeroId: string,
          cierreId: string | null,
          resultado: "entregado" | "novedad" | "devolucion_a_origen_por_rechazo",
          pagoMensajero: string | null,
          montoRecibido: string | null,
        ) =>
          (
            await tx.gestionOrden.create({
              data: {
                ordenId,
                mensajeroId,
                resultado,
                cierreId,
                ...(montoRecibido !== null
                  ? { montoRecibido: new Prisma.Decimal(montoRecibido), metodoPago: "efectivo" as const }
                  : {}),
                ...(pagoMensajero !== null
                  ? {
                      pagoMensajero: new Prisma.Decimal(pagoMensajero),
                      ingresoBodegaRechazo: new Prisma.Decimal("0.00"),
                    }
                  : {}),
              },
              select: { id: true },
            })
          ).id;
        const gestion = {
          A: await nuevaGestion(orden.A, m1, cierre.N1, "entregado", "1800.00", "25000.00"),
          B: await nuevaGestion(orden.B, m1, cierre.N1, "novedad", "0.00", null),
          D: await nuevaGestion(orden.D, m1, cierre.N1, "entregado", "1500.00", "10000.00"),
          C: await nuevaGestion(orden.C, m2, cierre.V1, "entregado", "1500.00", "10000.00"),
          F: await nuevaGestion(orden.F, m3, cierre.N2, "entregado", "0.00", "10000.00"),
          G: await nuevaGestion(orden.G, m1, cierre.N3, "entregado", "0.00", "10000.00"),
          H: await nuevaGestion(orden.H, m3, cierre.N4, "entregado", "0.00", "10000.00"),
          E: await nuevaGestion(orden.E, m2, cierre.N5, "entregado", "0.00", "10000.00"),
        };

        const pago = (data: Prisma.GestionPagoCongeladoUncheckedCreateInput) =>
          tx.gestionPagoCongelado.create({ data, select: { id: true } });
        // La fila de la satelite de A va PRIMERO: sin el filtro por actor, `pagosCongelados[0]` seria ella.
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
          nivel: "zona",
          tarifaValorId: tvMensajeroZona,
          importe: new Prisma.Decimal("2500.00"),
        });
        // B solo tiene la fila de la SATELITE: sin el filtro por actor dejaria de ser «Sin tarifa de
        // pago» y saldria con el pago de la satelite, sea cual sea el orden fisico.
        await pago({
          gestionOrdenId: gestion.B,
          actor: "satelite",
          concepto: "satelite_novedad",
          modo: "monto",
          valor: new Prisma.Decimal("950.00"),
          nivel: "zona",
          tarifaValorId: null,
          importe: new Prisma.Decimal("950.00"),
        });

        await tx.gestionPagoMensajeroAjuste.create({
          data: {
            gestionId: gestion.A,
            cierreId: cierre.N1,
            pagoAnterior: new Prisma.Decimal("2500.00"),
            pagoNuevo: new Prisma.Decimal("1800.00"),
            actorUsuarioId: admin,
            actorRol: "admin",
            motivo: "Ruta corta",
          },
          select: { id: true },
        });

        // El cargo de fulfillment de A: la app no puede escribir la tabla (REVOKE, SLT-94); este `tx`
        // es el del dueño, asi que se inserta como lo haria el trigger. 02:30 UTC del 07 = 20:30 del 06
        // en Costa Rica.
        const cargo = (ordenId: string, ocurridoAt: string) =>
          tx.$executeRawUnsafe(
            `INSERT INTO "orden_fulfillment_movimiento" ("id", "orden_id", "tienda_id", "secuencia", "tipo",
               "causa", "monto", "iva_pct", "iva", "ocurrido_at")
             VALUES ($1, $2, $3, 1, 'cargo'::"orden_fulfillment_movimiento_tipo",
               'creacion'::"orden_fulfillment_movimiento_causa", 600, 13, 78, $4::timestamp)`,
            randomUUID(),
            ordenId,
            tienda,
            ocurridoAt,
          );
        await cargo(orden.A, "2026-11-07 02:30:00");
        await cargo(orden.C, "2026-11-04 15:00:00"); // señuelo: C es de un cierre viejo

        // Los rechazos de la tienda: cada uno con su gestion de la tienda (sin cierre) y su fila
        // congelada en `cierre_rechazo_tienda`.
        const rechazo = async (
          cierreId: string,
          ordenId: string,
          clave: string,
          numGuia: number,
          rechazadoAt: string,
          motivo: string | null,
        ) => {
          const gestionId = await nuevaGestion(ordenId, m1, null, "devolucion_a_origen_por_rechazo", null, null);
          await tx.cierreRechazoTienda.create({
            data: {
              cierreId,
              gestionId,
              ordenId,
              numGuia,
              numRemision: `R-${SUFIJO}-${clave}`,
              destinatario: `Dest ${clave}`,
              producto: `Prod ${clave}`,
              tiendaNombre: "Tienda Fila",
              zonaNombre: ZONA_C,
              rechazadoAt: new Date(rechazadoAt),
              motivo,
            },
            select: { id: true },
          });
        };
        // 03:00 UTC del 06 = 21:00 del 05 en Costa Rica.
        await rechazo(cierre.N1, orden.A, "R1", 7, "2026-11-06T03:00:00.000Z", "No lo pidió");
        await rechazo(cierre.V1, orden.C, "R2", 8, "2026-11-04T15:00:00.000Z", "señuelo viejo");
        await rechazo(cierre.N2, orden.F, "R3", 9, "2026-11-04T15:00:00.000Z", "señuelo Norte");
        await rechazo(cierre.N3, orden.G, "R4", 10, "2026-09-30T15:00:00.000Z", "señuelo rango");
        await rechazo(cierre.N4, orden.H, "R5", 11, "2026-11-04T15:00:00.000Z", "señuelo sin consolidar");
        await rechazo(cierre.N5, orden.E, "R6", 12, "2026-11-04T15:00:00.000Z", "central");
        await rechazo(cierre.N6, orden.G, "R7", 13, "2026-11-04T15:00:00.000Z", "señuelo sin gestiones");

        // Autocomprobacion: lo sembrado, leido de la base en la misma transaccion.
        const rechazos = await tx.cierreRechazoTienda.count({
          where: { cierreId: { in: Object.values(cierre) } },
        });
        const detalleN1 = (
          await tx.$queryRawUnsafe<Array<{ tarifa_modelo: string }>>(
            `SELECT "tarifa_modelo"::text AS "tarifa_modelo" FROM "cierre_detail" WHERE "cierre_id" = $1
              ORDER BY "orden_id"`,
            cierre.N1,
          )
        ).map((r) => r.tarifa_modelo);
        const cierresDeX = await tx.cierreDia.count({ where: { cierreBodegaId: cierreBodegaX } });
        const pagosA = (
          await tx.$queryRawUnsafe<Array<{ actor: string }>>(
            `SELECT "actor"::text AS "actor" FROM "gestion_pago_congelado" WHERE "gestion_orden_id" = $1
              ORDER BY "actor"`,
            gestion.A,
          )
        ).map((r) => r.actor);

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
        const repoBodega = new CierresBodegaAdminRepository(tx as unknown as PrismaClient);
        return fn({
          repo,
          repoBodega,
          alcance: {
            central: { destinoTipo: "bodega_central", destinoZonaId: null },
            satelite: { destinoTipo: "bodega_satelite", destinoZonaId: zonaC },
          },
          m: { m1, m2, m3 },
          cierre,
          sembrados: { rechazos, detalleN1, cierresDeX, pagosA },
        });
      });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const todos = (c: Ctx): FiltrosDescargaGestionesRepo => ({ mensajeroIds: [c.m.m1, c.m.m2, c.m.m3] });
  const enNoviembre = (c: Ctx): FiltrosDescargaGestionesRepo =>
    filtrosConLimites({ mensajeroIds: [c.m.m1, c.m.m2, c.m.m3], ...NOVIEMBRE }, ZONA_CR);

  /** Las filas de la hoja por `numRemision` (la identidad de negocio de la fila). */
  const porRemision = (filas: CierreGestionDescargaRow[]) => {
    const mapa = new Map(filas.map((f) => [f.numRemision.replace(`R-${SUFIJO}-`, ""), f]));
    return (clave: string): CierreGestionDescargaRow => {
      const f = mapa.get(clave);
      if (f === undefined) throw new Error(`falta la gestion ${clave} en la hoja`);
      return f;
    };
  };
  const claves = (filas: Array<{ numRemision: string }>) =>
    filas.map((f) => f.numRemision.replace(`R-${SUFIJO}-`, "")).sort();
  const destinatarios = (filas: Array<{ destinatario: string }>) =>
    filas.map((f) => f.destinatario.replace("Dest ", ""));

  it("autocomprobacion: siete rechazos, N1 mixto con la fila vieja primero, X con dos cierres, A con dos pagos", async () => {
    const s = await conCorpus(async (c) => c.sembrados);
    expect(s.rechazos).toBe(7);
    expect(s.detalleN1).toEqual(["viejo", "nuevo", "nuevo"]);
    expect(s.cierresDeX).toBe(2);
    expect(s.pagosA).toEqual(["mensajero", "satelite"]);
  });

  it("R371/R374/R375: gestion A — folio, modelo del cierre, cifras, fecha del cargo y pago con ajuste", async () => {
    const filas = await conCorpus((c) => c.repo.findGestionesPorAlcanceCompleto(c.alcance.satelite, todos(c), ZONA_CR));
    const a = porRemision(filas)("A");
    expect(a.folioCierre).toBe("ABCD1234");
    expect(a.cierreModelo).toBe("nuevo");
    expect(a.ingresoEmpresa).toMatchObject({
      flete: "3500.00",
      ivaFlete: "455.00",
      comisionCod: "500.00",
      ivaComisionCod: "65.00",
      total: "4520.00",
      ivaIncluido: "520.00",
      fulfillment: "600.00",
      ivaFulfillment: "78.00",
      fulfillmentCargadoAt: "2026-11-07T02:30:00.000Z",
    });
    expect(a.fulfillmentCargadoDia).toBe("2026-11-06");
    expect(a.pagoPorTarifa).toEqual({
      importe: "2500.00",
      modo: "monto",
      valor: "2500.00",
      base: null,
      nivel: "zona",
      zonaNombre: ZONA_C,
      grupoNombre: null,
      vehiculoNombre: null,
      ajuste: { signo: "resta", monto: "700.00" },
    });
    expect(a.pagoMensajero).toBe("1800.00");
    expect(a.ajustesPago).toHaveLength(1);
    expect(a.ajustesPago.at(-1)).toMatchObject({ motivo: "Ruta corta", actorNombre: "Ana Pérez" });
    expect(a.tarifaFaltante).toBe(false);
  });

  it("R371/R374: gestion B — flete de no entregadas con su IVA y «Sin tarifa de pago»", async () => {
    const filas = await conCorpus((c) => c.repo.findGestionesPorAlcanceCompleto(c.alcance.satelite, todos(c), ZONA_CR));
    const b = porRemision(filas)("B");
    expect(b.cierreModelo).toBe("nuevo");
    expect(b.ingresoEmpresa).toMatchObject({
      fleteDevolucion: "1500.00",
      ivaFleteDevolucion: "195.00",
      total: "1695.00",
      ivaIncluido: "195.00",
    });
    expect(b.pagoPorTarifa).toBeNull();
    expect(b.tarifaFaltante).toBe(true);
    // Sin cargo de fulfillment de su orden: la celda queda vacia, no se inventa.
    expect(b.fulfillmentCargadoDia).toBeNull();
  });

  it("R371: D, con fila congelada VIEJA dentro de un cierre mixto, es del modelo NUEVO (el del cierre)", async () => {
    const filas = await conCorpus((c) => c.repo.findGestionesPorAlcanceCompleto(c.alcance.satelite, todos(c), ZONA_CR));
    expect(porRemision(filas)("D").cierreModelo).toBe("nuevo");
  });

  it("R370/R371: gestion C (cierre viejo) — modelo viejo, sin fecha de cargo ni pago por tarifa, cifras de hoy", async () => {
    const filas = await conCorpus((c) => c.repo.findGestionesPorAlcanceCompleto(c.alcance.satelite, todos(c), ZONA_CR));
    const cc = porRemision(filas)("C");
    expect(cc.cierreModelo).toBe("viejo");
    expect(cc.folioCierre).toHaveLength(8);
    expect(cc.fulfillmentCargadoDia).toBeNull();
    expect(cc.pagoPorTarifa).toBeNull();
    expect(cc.tarifaFaltante).toBe(false);
    // 2 000,00 + 260,00 de IVA + 300,00 (3 % de 10 000,00) + 39,00 de IVA.
    expect(cc.ingresoEmpresa).toMatchObject({
      flete: "2000.00",
      ivaFlete: "260.00",
      comisionCod: "300.00",
      ivaComisionCod: "39.00",
      total: "2599.00",
      fulfillmentCargadoAt: null,
      tarifaModelo: "viejo",
    });
  });

  it("R374: A, B y D salen con las MISMAS cifras que el detalle del cierre en la pantalla", async () => {
    const { hoja, pantalla } = await conCorpus(async (c) => {
      const filas = await c.repo.findGestionesPorAlcanceCompleto(c.alcance.satelite, todos(c), ZONA_CR);
      const detalle = await c.repo.findCierreByIdEnAlcance(c.cierre.N1, { lectura: "toda_la_empresa" }, ZONA_CR);
      if (detalle === null) throw new Error("N1 no se encontro en el detalle");
      return { hoja: filas, pantalla: detalle.gestiones };
    });
    const de = porRemision(hoja);
    const cifras = (g: {
      ingresoEmpresa?: unknown;
      pagoPorTarifa?: unknown;
      ajustesPago?: unknown;
      tarifaFaltante?: unknown;
    }) => ({
      ingresoEmpresa: g.ingresoEmpresa,
      pagoPorTarifa: g.pagoPorTarifa,
      ajustesPago: g.ajustesPago,
      tarifaFaltante: g.tarifaFaltante,
    });
    expect(pantalla).toHaveLength(3);
    for (const g of pantalla) {
      const clave = g.numRemision.replace(`R-${SUFIJO}-`, "");
      expect(cifras(de(clave))).toEqual(cifras(g));
    }
  });

  it("R373: alcance de la gestion — la satelite no ve Norte ni la central; la central solo lo suyo", async () => {
    const { sat, central, satNov } = await conCorpus(async (c) => ({
      sat: await c.repo.findGestionesPorAlcanceCompleto(c.alcance.satelite, todos(c), ZONA_CR),
      central: await c.repo.findGestionesPorAlcanceCompleto(c.alcance.central, todos(c), ZONA_CR),
      satNov: await c.repo.findGestionesPorAlcanceCompleto(c.alcance.satelite, enNoviembre(c), ZONA_CR),
    }));
    expect(claves(sat)).toEqual(["A", "B", "C", "D", "G"]);
    expect(claves(central)).toEqual(["E"]);
    expect(claves(satNov)).toEqual(["A", "B", "C", "D"]);
  });

  it("R373: rechazos — central [R6]; satelite sin rango [R1, R4]; con noviembre [R1]; nunca R2, R3, R5 ni R7", async () => {
    const r = await conCorpus(async (c) => ({
      central: await c.repo.findRechazosTiendaModeloNuevoCompleto(c.alcance.central, todos(c), ZONA_CR),
      sat: await c.repo.findRechazosTiendaModeloNuevoCompleto(c.alcance.satelite, todos(c), ZONA_CR),
      satNov: await c.repo.findRechazosTiendaModeloNuevoCompleto(c.alcance.satelite, enNoviembre(c), ZONA_CR),
      soloM2: await c.repo.findRechazosTiendaModeloNuevoCompleto(c.alcance.satelite, { mensajeroIds: [c.m.m2] }, ZONA_CR),
    }));
    expect(destinatarios(r.central)).toEqual(["R6"]);
    // Orden: el de los cierres del listado (N1, solicitado el 06-11, antes que N3, del 01-10).
    expect(destinatarios(r.sat)).toEqual(["R1", "R4"]);
    expect(destinatarios(r.satNov)).toEqual(["R1"]);
    // M2 en Centro solo tiene V1, que es viejo: R2 no sale.
    expect(r.soloM2).toEqual([]);
    expect(r.satNov[0]).toEqual({
      folioCierre: "ABCD1234",
      numGuia: 7,
      destinatario: "Dest R1",
      motivo: "No lo pidió",
      tiendaNombre: "Tienda Fila",
      fechaRechazo: "2026-11-05",
    });
  });

  it("R373/R374: cierres de bodega — gestiones de X con su modelo y solo el rechazo R1", async () => {
    const r = await conCorpus(async (c) => ({
      gestiones: await c.repoBodega.findGestionesDeCierresBodegaCompleto(todos(c), ZONA_CR),
      rechazos: await c.repoBodega.findRechazosTiendaDeCierresBodegaModeloNuevoCompleto(todos(c), ZONA_CR),
    }));
    expect(claves(r.gestiones)).toEqual(["A", "B", "C", "D"]);
    const de = porRemision(r.gestiones);
    expect(de("A").cierreModelo).toBe("nuevo");
    expect(de("A").fulfillmentCargadoDia).toBe("2026-11-06");
    expect(de("A").pagoPorTarifa?.importe).toBe("2500.00");
    expect(de("C").cierreModelo).toBe("viejo");
    expect(destinatarios(r.rechazos)).toEqual(["R1"]);
  });

  it("R375: con solo cierres viejos no se consulta `orden_fulfillment_movimiento`; con N1, una vez", async () => {
    const consultas = await conCorpus(async (c) => {
      const contar = async (fn: () => Promise<unknown>) => {
        const desde = eventos.length;
        await fn();
        return eventos.slice(desde).filter((e) => e.query.includes(`"orden_fulfillment_movimiento"`)).length;
      };
      return {
        soloViejo: await contar(() =>
          c.repo.findGestionesPorAlcanceCompleto(c.alcance.satelite, { mensajeroIds: [c.m.m2] }, ZONA_CR),
        ),
        soloViejoBodega: await contar(() =>
          c.repoBodega.findGestionesDeCierresBodegaCompleto({ mensajeroIds: [c.m.m2] }, ZONA_CR),
        ),
        conNuevo: await contar(() => c.repo.findGestionesPorAlcanceCompleto(c.alcance.satelite, todos(c), ZONA_CR)),
      };
    });
    expect(consultas).toEqual({ soloViejo: 0, soloViejoBodega: 0, conNuevo: 1 });
  });

  it("la lectura de gestiones y rechazos no escribe en la base", async () => {
    const escrituras = await conCorpus(async (c) => {
      const desde = eventos.length;
      await c.repo.findGestionesPorAlcanceCompleto(c.alcance.satelite, todos(c), ZONA_CR);
      await c.repo.findRechazosTiendaModeloNuevoCompleto(c.alcance.satelite, todos(c), ZONA_CR);
      await c.repoBodega.findGestionesDeCierresBodegaCompleto(todos(c), ZONA_CR);
      await c.repoBodega.findRechazosTiendaDeCierresBodegaModeloNuevoCompleto(todos(c), ZONA_CR);
      const leidas = eventos.slice(desde);
      expect(leidas.length).toBeGreaterThan(0);
      return leidas.map((e) => e.query.trimStart()).filter((q) => /^(INSERT|UPDATE|DELETE)\b/i.test(q));
    });
    expect(escrituras).toEqual([]);
  });
});
