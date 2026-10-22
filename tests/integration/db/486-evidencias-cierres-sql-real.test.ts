import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import type { Alcance } from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { CierreGestionPendienteRow } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { ITarifaVigenteRepository } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTestConEspia,
  enTransaccionRevertida,
  fksDeOrden,
  serializarEscriturasReales,
  type EventoSqlDeTest,
} from "./_postgres-real";

/**
 * FEATURE 486 — las proyecciones de cierre leen TODAS las evidencias de una gestion, EJECUTADO
 * CONTRA POSTGRES.
 *
 * Los tests de servicio usan dobles de la fila: no ven el `select` ni el `orderBy`. Aqui la unica
 * forma de que un caso pase es que Postgres devuelva de verdad las filas de
 * `gestion_orden_evidencia` por la relacion anidada de las DOS proyecciones (`GESTION_ADMIN_SELECT`
 * y `WITH_DETALLE`), en orden de `indice`.
 *
 * EL CORPUS (por cada conjunto: el del cierre y el de la vista en vivo):
 *   - gestion A: 3 hijas insertadas en orden de `indice` 2, 0, 1 (portada = la de indice 0). Sin
 *     el `orderBy` Postgres las devuelve en orden de insercion, y el caso se pone rojo.
 *   - gestion B: portada en la columna antigua y SIN hijas (rama retro-compat del escritor) -> R5.
 *   - gestion C: sin nada -> R6.
 *
 * Todo dentro de una transaccion que SIEMPRE se revierte. Sin base se SALTA; con base y sin
 * catalogo, FALLA ruidosamente (nada de `return` temprano).
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `486-${Date.now().toString(36)}`;
const GUIA_BASE = 960_000_000 + (Date.now() % 30_000_000);

type Clave = "A" | "B" | "C";
type Rutas = Record<Clave, string[]>;

/** Rutas de cada gestion del conjunto `prefijo`, en el ORDEN DE INDICE esperado. */
function rutasEsperadas(prefijo: string): Rutas {
  return {
    A: [0, 1, 2].map((i) => `evidencias/${SUFIJO}/${prefijo}-A-${i}.jpg`),
    B: [`evidencias/${SUFIJO}/${prefijo}-B-portada.jpg`],
    C: [],
  };
}

interface Ctx {
  cierreId: string;
  cierreBodegaId: string;
  mensajeroId: string;
  alcance: Alcance;
  /** gestionId -> clave del corpus, por conjunto. */
  delCierre: Record<string, Clave>;
  enVivo: Record<string, Clave>;
  /** Un segundo cierre del mismo mensajero con MAS gestiones con fotos (R8). */
  cierreGrandeId: string;
  admin: CierresAdminRepository;
  bodega: CierresBodegaAdminRepository;
  mensajero: CierreDiaRepository;
  /** Cuantas filas de evidencia hay sembradas en la tx (control positivo). */
  contarEvidencias: () => Promise<number>;
}

describeSiHayBase("486 — evidencias de una gestion en los cierres, contra Postgres", () => {
  let prisma: PrismaClient;
  let eventos: EventoSqlDeTest[];
  let conCorpus: <T>(fn: (ctx: Ctx) => Promise<T>) => Promise<T>;

  beforeAll(async () => {
    ({ prisma, eventos } = crearPrismaDeTestConEspia());

    const fks = await fksDeOrden(prisma);
    if (fks === null) {
      throw new Error(
        "hay DATABASE_URL pero la tabla `orden` esta vacia: sin FKs no se puede sembrar el corpus. " +
          "Corre `pnpm run db:seed` antes de esta suite.",
      );
    }
    const plantilla = await prisma.usuario.findFirst({
      select: { tipoIdentificacionId: true, rolId: true, passwordHash: true },
    });
    if (plantilla === null) throw new Error("la tabla `usuario` esta vacia: corre las semillas.");
    const estatus = await prisma.orderStatus.findFirst({
      where: { value: "en_reparto" },
      select: { id: true },
    });
    if (estatus === null) throw new Error("falta el estatus «en_reparto»: corre `pnpm run db:seed`.");

    conCorpus = (fn) =>
      enTransaccionRevertida(prisma, async (tx) => {
        await serializarEscriturasReales(tx);

        const nuevoUsuario = async (clave: string, nombre: string) =>
          (
            await tx.usuario.create({
              data: {
                nombre,
                email: `u-${clave}-${SUFIJO}@ejemplo.test`,
                telefono: "88880000",
                passwordHash: plantilla.passwordHash,
                cedula: `C-${clave}-${SUFIJO}`,
                tipoIdentificacionId: plantilla.tipoIdentificacionId,
                rolId: plantilla.rolId,
              },
              select: { id: true },
            })
          ).id;

        const tienda = await nuevoUsuario("tienda", "Tienda 486");
        const mensajero = await nuevoUsuario("mensajero", "Mensajero 486");

        const tarifa = await tx.tarifa.create({
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

        const cierreBodega = await tx.cierreBodega.create({
          data: {
            zonaId: fks.zonaId,
            solicitadoPor: mensajero,
            estado: "solicitado",
            totalEfectivo: new Prisma.Decimal("0.00"),
            totalSimpe: new Prisma.Decimal("0.00"),
            totalTransferencia: new Prisma.Decimal("0.00"),
            totalGeneral: new Prisma.Decimal("0.00"),
            totalPagoMensajero: new Prisma.Decimal("0.00"),
            totalIngresoBodegaRechazos: new Prisma.Decimal("0.00"),
          },
          select: { id: true },
        });

        const nuevoCierreDia = async (cierreBodegaId: string | null) =>
          (
            await tx.cierreDia.create({
              data: {
                mensajeroId: mensajero,
                estado: "aprobado",
                destinoTipo: "bodega_satelite",
                destinoZonaId: fks.zonaId,
                cierreBodegaId,
              },
              select: { id: true },
            })
          ).id;
        const cierreId = await nuevoCierreDia(cierreBodega.id);
        const cierreGrandeId = await nuevoCierreDia(null);

        let guia = 0;
        /** Orden + gestion (+ snapshot si va a un cierre). Devuelve el id de la gestion. */
        const sembrarGestion = async (
          cierreDeLaGestion: string | null,
          clave: string,
          portada: string | null,
        ) => {
          guia += 1;
          const numRemision = `R-${SUFIJO}-${clave}`;
          const orden = await tx.orden.create({
            data: {
              numGuia: GUIA_BASE + guia,
              numRemision,
              destinatario: `Dest ${clave}`,
              telefonoDest: "88880000",
              producto: `Prod ${clave}`,
              montoCobrar: new Prisma.Decimal("1000.00"),
              cobraComision: true,
              estatusId: estatus.id,
              mensajeroAsignadoId: mensajero,
              tiendaId: tienda,
              zonaId: fks.zonaId,
              provinciaId: fks.provinciaId,
              cantonId: fks.cantonId,
            },
            select: { id: true },
          });
          const gestion = await tx.gestionOrden.create({
            data: {
              ordenId: orden.id,
              mensajeroId: mensajero,
              resultado: "reprogramado",
              motivo: "cliente ausente",
              cierreId: cierreDeLaGestion,
              evidenciaStoragePath: portada,
              evidenciaContentType: portada === null ? null : "image/jpeg",
            },
            select: { id: true },
          });
          if (cierreDeLaGestion !== null) {
            await tx.cierreDetail.create({
              data: {
                cierreId: cierreDeLaGestion,
                ordenId: orden.id,
                montoCobrar: new Prisma.Decimal("1000.00"),
                cobraComision: true,
                zonaId: fks.zonaId,
                tiendaId: tienda,
                esCentral: false,
                esZonaEspecial: false,
                tarifaId: tarifa.id,
                tarifaValorFlete: new Prisma.Decimal("2000.00"),
                tarifaValorFleteGam: new Prisma.Decimal("2500.00"),
                tarifaValorFleteDevuelto: new Prisma.Decimal("1500.00"),
                tarifaValorFleteDevueltoGam: new Prisma.Decimal("1800.00"),
                tarifaComisionCod: new Prisma.Decimal("3.00"),
                tarifaIvaFlete: new Prisma.Decimal("13.00"),
                tarifaIvaComisionCod: new Prisma.Decimal("13.00"),
                tarifaFulfillment: new Prisma.Decimal("0.00"),
                numGuia: GUIA_BASE + guia,
                numRemision,
                destinatario: `Dest ${clave}`,
                producto: `Prod ${clave}`,
                tiendaNombre: "Tienda 486",
                zonaNombre: "Zona 486",
                provinciaNombre: "Provincia 486",
                cantonNombre: "Canton 486",
              },
              select: { id: true },
            });
          }
          return gestion.id;
        };

        const hija = (gestionId: string, storagePath: string, indice: number) =>
          tx.gestionOrdenEvidencia.create({
            data: { gestionId, storagePath, contentType: "image/jpeg", indice },
            select: { id: true },
          });

        /** El corpus A/B/C. Las hijas de A se insertan en orden de indice 2, 0, 1 (R4). */
        const sembrarConjunto = async (cierreDelConjunto: string | null, prefijo: string) => {
          const r = rutasEsperadas(prefijo);
          const a = await sembrarGestion(cierreDelConjunto, `${prefijo}-A`, r.A[0]!);
          await hija(a, r.A[2]!, 2);
          await hija(a, r.A[0]!, 0);
          await hija(a, r.A[1]!, 1);
          const b = await sembrarGestion(cierreDelConjunto, `${prefijo}-B`, r.B[0]!);
          const c = await sembrarGestion(cierreDelConjunto, `${prefijo}-C`, null);
          return { [a]: "A", [b]: "B", [c]: "C" } as Record<string, Clave>;
        };

        const delCierre = await sembrarConjunto(cierreId, "cierre");
        const enVivo = await sembrarConjunto(null, "vivo");

        // R8: el cierre GRANDE tiene 6 gestiones con 2 fotos cada una.
        for (let i = 0; i < 6; i += 1) {
          const g = await sembrarGestion(cierreGrandeId, `grande-${i}`, `evidencias/${SUFIJO}/grande-${i}-0.jpg`);
          await hija(g, `evidencias/${SUFIJO}/grande-${i}-0.jpg`, 0);
          await hija(g, `evidencias/${SUFIJO}/grande-${i}-1.jpg`, 1);
        }

        const cliente = tx as unknown as PrismaClient;
        const nada = {} as never;
        const tarifaRepo = {} as unknown as ITarifaVigenteRepository;
        return fn({
          cierreId,
          cierreBodegaId: cierreBodega.id,
          mensajeroId: mensajero,
          alcance: { destinoTipo: "bodega_satelite", destinoZonaId: fks.zonaId },
          delCierre,
          enVivo,
          cierreGrandeId,
          admin: new CierresAdminRepository(cliente, nada, nada, nada, nada, nada, nada, nada),
          bodega: new CierresBodegaAdminRepository(cliente),
          mensajero: new CierreDiaRepository(cliente, tarifaRepo),
          contarEvidencias: () =>
            tx.gestionOrdenEvidencia.count({
              where: { storagePath: { startsWith: `evidencias/${SUFIJO}/` } },
            }),
        });
      });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Afirma A -> 3 rutas en orden de indice, B -> [portada], C -> []. */
  function afirmarConjunto(
    gestiones: CierreGestionPendienteRow[],
    claves: Record<string, Clave>,
    prefijo: string,
  ) {
    const esperadas = rutasEsperadas(prefijo);
    const delConjunto = gestiones.filter((g) => g.gestionId in claves);
    // Control positivo: las TRES gestiones del corpus llegaron. Sin esto un filtro que no
    // devolviera nada dejaria el resto del caso verde.
    expect(delConjunto).toHaveLength(3);
    const porClave = Object.fromEntries(
      delConjunto.map((g) => [claves[g.gestionId]!, g.evidenciaStoragePaths]),
    );
    expect(porClave).toEqual(esperadas);
  }

  it("CONTROL POSITIVO: el corpus existe (3+3 fotos de A, 12 del cierre grande)", async () => {
    const n = await conCorpus((ctx) => ctx.contarEvidencias());
    expect(n).toBe(3 + 3 + 12);
  });

  it("R1/R4/R5/R6: el detalle de cierre de mensajero (admin) trae las 3 rutas de A en orden, B=[portada], C=[]", async () => {
    await conCorpus(async (ctx) => {
      const r = await ctx.admin.findCierreByIdEnAlcance(ctx.cierreId, ctx.alcance);
      expect(r).not.toBeNull();
      afirmarConjunto(r!.gestiones, ctx.delCierre, "cierre");
    });
  });

  it("R2/R4/R5/R6: el detalle de cierre de bodega trae las 3 rutas de A en orden", async () => {
    await conCorpus(async (ctx) => {
      const r = await ctx.bodega.findCierreBodegaConDetalle(ctx.cierreBodegaId);
      expect(r).not.toBeNull();
      expect(r!.cierresDia).toHaveLength(1);
      afirmarConjunto(r!.cierresDia[0]!.gestiones, ctx.delCierre, "cierre");
    });
  });

  it("R3/R4/R5/R6: el cierre pasado del mensajero (y la correccion 477) trae las 3 rutas", async () => {
    await conCorpus(async (ctx) => {
      const r = await ctx.mensajero.findCierrePropioConGestiones(ctx.cierreId, ctx.mensajeroId);
      expect(r).not.toBeNull();
      afirmarConjunto(r!.gestiones, ctx.delCierre, "cierre");
    });
  });

  it("R3/R4/R5/R6: la vista en vivo del mensajero trae las 3 rutas", async () => {
    await conCorpus(async (ctx) => {
      const r = await ctx.mensajero.findGestionesPendientes(ctx.mensajeroId);
      afirmarConjunto(r, ctx.enVivo, "vivo");
    });
  });

  it("R8: las evidencias de N gestiones se leen sin una consulta por gestion (3 vs 6 gestiones)", async () => {
    await conCorpus(async (ctx) => {
      const medir = async (cierreId: string) => {
        const antes = eventos.length;
        const r = await ctx.admin.findCierreByIdEnAlcance(cierreId, ctx.alcance);
        const consultas = eventos.slice(antes).filter((e) => /gestion_orden_evidencia/.test(e.query));
        return { r, total: eventos.length - antes, deEvidencia: consultas.length };
      };
      const chico = await medir(ctx.cierreId);
      const grande = await medir(ctx.cierreGrandeId);
      // Control positivo: el grande de verdad tiene mas gestiones, y con fotos.
      expect(chico.r!.gestiones).toHaveLength(3);
      expect(grande.r!.gestiones).toHaveLength(6);
      expect(grande.r!.gestiones.every((g) => g.evidenciaStoragePaths.length === 2)).toBe(true);
      // UNA consulta de evidencias por lectura, la misma con 3 que con 6 gestiones.
      expect(chico.deEvidencia).toBe(1);
      expect(grande.deEvidencia).toBe(1);
      expect(grande.total).toBe(chico.total);
    });
  });
});
