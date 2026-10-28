import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { contextoActual } from "@/lib/db/contexto-empresa";
import { paraCadaEmpresa } from "@/lib/db/para-cada-empresa";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, tomarLockDeEscrituraReal } from "./_postgres-real";

// SL-23 · T11 (design §5.4; R21, R25) — `paraCadaEmpresa({ modulo })` contra Postgres real: el
// filtro `modulos: { some: { modulo } }` es SQL de verdad sobre `organizacion_modulo`, y el cliente es
// el de la app (`getPrismaClient()`), como en un cron. La base puede tener otras empresas: se mira
// solo lo que pasa con las dos del archivo.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;
let soltar: () => Promise<void> = async () => {};
let conMonitoreo: string;
let sinMonitoreo: string;

describeSiHayBase("SL-23 — paraCadaEmpresa se salta las empresas con el módulo apagado (R21)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    soltar = await tomarLockDeEscrituraReal();
    conMonitoreo = (await crearOrganizacion(base, { nombre: "SL-23 con monitoreo" })).id;
    sinMonitoreo = (await crearOrganizacion(base, { nombre: "SL-23 sin monitoreo" })).id;
    await base.organizacionModulo.createMany({
      data: [
        { organizacionId: conMonitoreo, modulo: "monitoreo" },
        { organizacionId: sinMonitoreo, modulo: "ranking" },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    try {
      if (base) await base.organizacion.deleteMany({ where: { id: { in: [conMonitoreo, sinMonitoreo].filter(Boolean) } } });
    } finally {
      await soltar();
      await base?.$disconnect();
    }
  }, 60_000);

  it("con modulo: corre la empresa con el módulo, en su contexto, y deja la otra en saltadas", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const contextos = new Map<string, string | undefined>();
    const r = await paraCadaEmpresa(
      async (id) => {
        const ctx = contextoActual();
        contextos.set(id, ctx?.tipo === "empresa" ? ctx.organizacionId : undefined);
      },
      { modulo: "monitoreo" },
    );
    expect(r.ok).toContain(conMonitoreo);
    expect(r.ok).not.toContain(sinMonitoreo);
    expect(r.saltadas).toContain(sinMonitoreo);
    expect(r.saltadas).not.toContain(conMonitoreo);
    expect(contextos.get(conMonitoreo)).toBe(conMonitoreo);
    expect(contextos.has(sinMonitoreo)).toBe(false);
  });

  it("R25 — el módulo de una empresa no decide por otra: con ranking, el resultado se invierte", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const r = await paraCadaEmpresa(async () => {}, { modulo: "ranking" });
    expect(r.ok).toContain(sinMonitoreo);
    expect(r.saltadas).toContain(conMonitoreo);
  });

  it("sin modulo (cálculo continuo, R30): corren las dos y no hay saltadas", async () => {
    const r = await paraCadaEmpresa(async () => {});
    expect(r.ok).toEqual(expect.arrayContaining([conMonitoreo, sinMonitoreo]));
    expect(r.saltadas).toEqual([]);
  });
});
