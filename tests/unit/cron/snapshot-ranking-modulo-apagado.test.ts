import { describe, expect, it, vi } from "vitest";

import { contextoActual } from "@/lib/db/contexto-empresa";
import type { IRankingSnapshotService } from "@/lib/interfaces/services/IRankingSnapshotService";

// SL-23 · T11 (design §3.8; R30) — la foto diaria del ranking es de cálculo continuo: se toma también
// para la empresa con Ranking apagado, para que al reencender el histórico no tenga huecos. El cron
// no pasa `modulo` a `paraCadaEmpresa`, así que el listado no filtra y la foto corre en todas.

const { handleSnapshotRanking } = await import("@/app/api/cron/snapshot-ranking/route");

describe("SL-23 · snapshot-ranking con Ranking apagado (R30)", () => {
  it("la foto incluye a la empresa con Ranking apagado: el listado no filtra por módulo", async () => {
    const listados: unknown[] = [];
    // `org-sin` no tiene Ranking: si el cron filtrara, el listado con `where` la dejaría fuera.
    const empresas = {
      organizacion: {
        findMany: vi.fn(async (args: { where?: unknown }) => {
          listados.push(args.where ?? null);
          return args.where ? [{ id: "org-con" }] : [{ id: "org-con" }, { id: "org-sin" }];
        }),
      },
    };
    const congeladas: string[] = [];
    const service: IRankingSnapshotService = {
      congelar: async () => {
        const ctx = contextoActual();
        congeladas.push(ctx?.tipo === "empresa" ? ctx.organizacionId : "?");
        return { fecha: "2026-10-25", status: "creado", filas: 3 };
      },
    } as unknown as IRankingSnapshotService;

    const res = await handleSnapshotRanking(
      new Request("http://localhost/api/cron/snapshot-ranking", { headers: { authorization: "Bearer s" } }),
      { getSecret: () => "s", service, empresas, now: () => new Date("2026-10-26T06:30:00.000Z") },
    );

    expect(res.status).toBe(200);
    expect(congeladas).toEqual(["org-con", "org-sin"]);
    expect(listados).toEqual([null]);
  });
});
