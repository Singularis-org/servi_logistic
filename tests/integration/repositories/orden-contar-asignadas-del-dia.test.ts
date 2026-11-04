import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import type { IJobRepository } from "@/lib/interfaces/repositories/IJobRepository";

// SLT-59 T7.5 (R64, R67; glosario «Asignadas del dia», design §12.5) — la lectura de conteo del
// boton con la primera ruta pendiente. Prisma va mockeado (patron de tests/integration/
// repositories): se fija el `where` —el predicado del dia es el de la recogida— y que es UNA
// lectura. La empresa la pone la extension del cliente (docs/architecture.md, «Multi-empresa»),
// igual que en `findParadasEnReparto`.

const DIA = new Date("2026-10-29T00:00:00.000Z"); // convencion `@db.Date` (startOfDayCR)

function build(filas: { estatus: { value: string } }[]) {
  const findMany = vi.fn<(args: unknown) => Promise<typeof filas>>(async () => filas);
  const prisma = { orden: { findMany } };
  const repo = new OrdenRepository(prisma as unknown as PrismaClient, {} as IJobRepository);
  return { repo, findMany };
}

describe("SLT-59 R64 — OrdenRepository.contarAsignadasDelDia", () => {
  it("cuenta asignadas (por recoger del dia + en_reparto) y recogidas (en_reparto) en una sola lectura", async () => {
    const { repo, findMany } = build([
      { estatus: { value: "en_reparto" } },
      { estatus: { value: "en_reparto" } },
      { estatus: { value: "en_reparto" } },
      { estatus: { value: "mensajero_recogiendo_en_bodega" } },
    ]);
    const r = await repo.contarAsignadasDelDia("m-1", DIA);
    expect(r).toEqual({ asignadas: 4, recogidas: 3 });
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("el `where`: del mensajero, sin borrar, `en_reparto` o por recoger con `fecha_reparto` nula o <= dia", async () => {
    const { repo, findMany } = build([]);
    await repo.contarAsignadasDelDia("m-1", DIA);
    expect(findMany.mock.calls[0][0]).toEqual({
      where: {
        mensajeroAsignadoId: "m-1",
        deletedAt: null,
        OR: [
          { estatus: { value: "en_reparto" } },
          {
            estatus: { value: "mensajero_recogiendo_en_bodega" },
            // El MISMO predicado que `recogerLote` y el corte: una reservada para mañana no cuenta.
            OR: [{ fechaReparto: null }, { fechaReparto: { lte: DIA } }],
          },
        ],
      },
      select: { estatus: { select: { value: true } } },
    });
  });

  it("sin ordenes -> 0 de 0 (el servicio no corta con `asignadas = 0`)", async () => {
    const { repo } = build([]);
    expect(await repo.contarAsignadasDelDia("m-1", DIA)).toEqual({ asignadas: 0, recogidas: 0 });
  });
});

// SLT-79 — la ultima recogida del dia, para la espera de 5 min del boton (sustituye al job de la
// primera ruta). Con Prisma mockeado se fija la FORMA del SQL; que Postgres no vea la fila de otra
// empresa lo mide `tests/integration/db/ruta-primera-pendiente-dos-empresas-sql-real.test.ts`.
describe("SLT-79 — OrdenRepository.ultimaRecogidaDelDia", () => {
  const DESDE = new Date("2026-10-29T06:00:00.000Z"); // inicio del dia de CR (columna `timestamp`)

  function buildRaw(filas: { ultima: Date | null }[]) {
    const $queryRaw = vi.fn(async (..._args: unknown[]) => filas);
    const repo = new OrdenRepository({ $queryRaw } as unknown as PrismaClient, {} as IJobRepository);
    return { repo, $queryRaw };
  }

  it("UNA lectura: la fila `recoleccion` mas reciente del mensajero desde el inicio del dia", async () => {
    const at = new Date("2026-10-29T15:00:00.000Z");
    const { repo, $queryRaw } = buildRaw([{ ultima: at }]);
    expect(await repo.ultimaRecogidaDelDia("m-1", DESDE)).toEqual(at);
    expect($queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...valores] = $queryRaw.mock.calls[0] as [string[], ...unknown[]];
    const sql = strings.join(" ");
    expect(sql).toMatch(/MAX\(h\."created_at"\)/);
    expect(sql).toMatch(/"orden_historial_estado"/);
    expect(sql).toMatch(/h\."actor_usuario_id" =/);
    expect(sql).toMatch(/h\."origen_tipo" = 'recoleccion'/);
    expect(sql).toMatch(/h\."created_at" >=/);
    // Las mismas que cuenta `contarAsignadasDelDia`: asignada a el y sin borrar.
    expect(sql).toMatch(/o\."mensajero_asignado_id" =/);
    expect(sql).toMatch(/o\."deleted_at" IS NULL/);
    expect(valores).toContain("m-1");
    expect(valores).toContain(DESDE);
  });

  it("acota por la empresa del propio mensajero (segunda barrera, no depende de la RLS)", async () => {
    const { repo, $queryRaw } = buildRaw([{ ultima: null }]);
    await repo.ultimaRecogidaDelDia("m-1", DESDE);
    const sql = (($queryRaw.mock.calls[0] as unknown[])[0] as string[]).join(" ");
    expect(sql).toMatch(
      /h\."organizacion_id" = \(SELECT u\."organizacion_id" FROM "usuario" u WHERE u\."id" =/,
    );
    expect(sql).toMatch(/o\."organizacion_id" = h\."organizacion_id"/);
  });

  it("sin recogidas -> null", async () => {
    expect(await buildRaw([{ ultima: null }]).repo.ultimaRecogidaDelDia("m-1", DESDE)).toBeNull();
    expect(await buildRaw([]).repo.ultimaRecogidaDelDia("m-1", DESDE)).toBeNull();
  });
});
