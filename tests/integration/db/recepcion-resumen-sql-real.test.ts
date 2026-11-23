import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import type { ResumenRecepcion } from "@/lib/interfaces/repositories/IOrdenRepository";

/**
 * SLT-167 (R713, R714) — `OrdenRepository.resumenRecepcion` contra Postgres REAL y con dos empresas.
 *
 * QUE SE MIDE. La RLS ya esconde las filas de otra empresa; aqui se prueba la SEGUNDA barrera, el
 * `organizacion_id` explicito del SQL. Por eso el repositorio corre como DUENO (el `tx` del cliente
 * base, sin RLS) con la empresa A fijada: si el filtro faltara, nada mas lo taparia.
 *
 * SIN DATOS FALLA. La siembra va por `crearFksDeOrden`, que lanza sin catalogos ni geografia, y el
 * caso de A es un control positivo: espera el destinatario y la tienda sembrados, no un vacio.
 *
 * Todo dentro de `enTransaccionRevertida`: no deja ni una fila. Mutacion (progress/impl_SLT-167.md):
 * quitar el `AND o."organizacion_id" = ...` del SQL pone rojo el caso de B.
 *
 * ⚠️ Solo `DATABASE_URL` del entorno y solo con host `localhost`/`127.0.0.1`. Los modulos que pueden
 * leer `.env` se importan dentro de `beforeAll`. Contra una base remota, jamas: se salta.
 */

/** La URL tal cual llega al proceso. Se lee AQUI, antes de que nada pueda cargar `.env`. */
const URL_DEL_ENTORNO = process.env.DATABASE_URL;

function esHostLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false; // una URL que no se puede leer no es una base local demostrada
  }
}

const HAY_BASE_LOCAL =
  URL_DEL_ENTORNO !== undefined && URL_DEL_ENTORNO !== "" && esHostLocal(URL_DEL_ENTORNO);

const describeSiBaseLocal = HAY_BASE_LOCAL ? describe : describe.skip;

type PostgresReal = typeof import("./_postgres-real");
type OrdenMinima = typeof import("./_fixtures/orden-minima");
type Organizaciones = typeof import("../../fabricas/organizaciones");
type Repos = typeof import("@/lib/repositories/OrdenRepository");

/** Valores sembrados que NO pueden aparecer en el resumen (R713). Imposibles por casualidad. */
const TELEFONO_SEMBRADO = "87651234";
const DIRECCION_SEMBRADA = "Calle Zafiro 4471 casa celeste";
const ID_INEXISTENTE = "00000000-0000-0000-0000-00000000dead";

describeSiBaseLocal("SLT-167 — resumen de recepcion por empresa (Postgres real, dos empresas)", () => {
  let pg: PostgresReal;
  let fx: OrdenMinima;
  let orgs: Organizaciones;
  let repos: Repos;
  let prisma: PrismaClient;

  beforeAll(async () => {
    pg = await import("./_postgres-real");
    fx = await import("./_fixtures/orden-minima");
    orgs = await import("../../fabricas/organizaciones");
    repos = await import("@/lib/repositories/OrdenRepository");
    prisma = pg.crearPrismaDeTest();
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R714/R713: A ve su orden (destinatario y tienda, solo esas dos claves); la de B y un id inexistente no dan datos", async () => {
    const r = await pg.enTransaccionRevertida(prisma, async (tx) => {
      await pg.serializarEscriturasReales(tx);
      const A = (await orgs.crearOrganizacion(tx, { nombre: "Empresa A SLT167" })).id;
      const B = (await orgs.crearOrganizacion(tx, { nombre: "Empresa B SLT167" })).id;

      /** Una tienda con `nombre` y una orden suya, con la empresa `org` fijada para los DEFAULT. */
      async function sembrar(org: string, tienda: string, destinatario: string): Promise<string> {
        await orgs.fijarEmpresa(tx, org);
        const fks = await fx.crearFksDeOrden(tx);
        await tx.usuario.update({ where: { id: fks.tiendaId }, data: { nombre: tienda } });
        const distrito = await tx.distrito.findFirst({
          where: { cantonId: fks.cantonId },
          select: { id: true },
          orderBy: { id: "asc" },
        });
        if (!distrito) throw new Error("falta un distrito de Cartago/Cartago: aplica las migraciones");
        const o = await tx.orden.create({
          data: {
            numRemision: `SLT167-${org.slice(0, 8)}`,
            estatusId: fks.estatusId,
            destinatario,
            telefonoDest: TELEFONO_SEMBRADO,
            direccion: DIRECCION_SEMBRADA,
            tiendaId: fks.tiendaId,
            zonaId: fks.zonaId,
            provinciaId: fks.provinciaId,
            cantonId: fks.cantonId,
            distritoId: distrito.id,
            producto: "Caja",
          },
          select: { id: true },
        });
        return o.id;
      }

      const ordenA = await sembrar(A, "Tienda Prueba Norte", "Ana Quesada Mora");
      const ordenB = await sembrar(B, "Tienda Prueba Sur", "Bruno Vargas Solis");

      // Las dos ordenes existen, cada una en su empresa (medido como dueno, sin filtro).
      const sembradas = await tx.orden.findMany({
        where: { id: { in: [ordenA, ordenB] } },
        select: { id: true, organizacionId: true },
      });

      // Se lee como la empresa A.
      await orgs.fijarEmpresa(tx, A);
      const repo = new repos.OrdenRepository(tx as unknown as PrismaClient);
      return {
        A,
        B,
        ordenA,
        ordenB,
        sembradas,
        deA: await repo.resumenRecepcion(ordenA),
        deB: await repo.resumenRecepcion(ordenB),
        inexistente: await repo.resumenRecepcion(ID_INEXISTENTE),
      };
    });

    // Control de la siembra: si no hay datos, el test cae aqui, no pasa.
    expect(r.sembradas.map((s) => [s.id === r.ordenA ? "A" : "B", s.organizacionId === r.A ? "A" : "B"]).sort())
      .toEqual([
        ["A", "A"],
        ["B", "B"],
      ]);

    // R714 control positivo: la orden de A devuelve lo sembrado.
    expect(r.deA).toEqual({ destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" });
    // R713: exactamente dos claves, y nada del telefono ni la direccion sembrados.
    expect(Object.keys(r.deA as ResumenRecepcion).sort()).toEqual(["destinatario", "tienda"]);
    const serializado = JSON.stringify(r.deA);
    expect(serializado).not.toContain(TELEFONO_SEMBRADO);
    expect(serializado).not.toContain(DIRECCION_SEMBRADA);

    // R714: la orden de B (otra empresa) y un id inexistente no devuelven datos.
    expect(r.deB).toBeNull();
    expect(r.inexistente).toBeNull();
  }, 60_000);
});
