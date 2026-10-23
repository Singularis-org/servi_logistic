import { describe, it, expect, vi } from "vitest";

import { contextoActual } from "@/lib/db/contexto-empresa";

// SL-17 / T2.8 — EL COMPOSITION ROOT, EJERCITADO DE VERDAD (memoria «el composition root que no
// inyecta»). Que `lib/actions/organizaciones.ts` IMPORTE `OrganizacionRepository` no prueba que
// lo PASE. Aquí se abre la puerta de autorización (hoy cerrada para todos) solo en este archivo,
// se llama a la action SIN `deps.service`, y se exige que el repositorio real llegue al cliente
// de `getPrismaClient` y que lo haga dentro del contexto de plataforma citando SL-17.

vi.mock("@/lib/auth/exigir-superadmin", () => ({ exigirSuperadmin: () => true }));

const contextos: unknown[] = [];
const creados: unknown[] = [];
const tx = {
  $executeRaw: vi.fn(async () => {
    contextos.push(contextoActual());
    return 1;
  }),
  organizacion: {
    findUnique: vi.fn(async () => null),
    create: vi.fn(async (args: unknown) => {
      creados.push(args);
      return { id: "org-nueva" };
    }),
  },
  tipoIdentificacion: { findUnique: vi.fn(async () => ({ id: "ti-1" })) },
  rol: { findUnique: vi.fn(async () => ({ id: "rol-maestro" })) },
  usuario: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async (args: unknown) => {
      creados.push(args);
      return { id: "u-maestro" };
    }),
  },
};
const $transaction = vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({ $transaction }),
  PRISMA_OMIT: {},
}));

const { altaEmpresaAction } = await import("@/lib/actions/organizaciones");

describe("SL-17 — la action pasa un OrganizacionRepository real y corre en plataforma", () => {
  it("sin deps.service, el alta llega al cliente de la app con la ficha SL-17", async () => {
    const r = await altaEmpresaAction(
      {
        nombre: "Envíos del Sur",
        slug: "envios-del-sur",
        maestro: { nombre: "Lucía", email: "lucia@ejemplo.test", telefono: "8888", documento: "1122", tipoDocumento: "cedula" },
      },
      { getActor: async () => ({ usuarioId: "u-super", rol: "maestro" }) },
    );

    expect(r).toEqual({ estado: "creada", organizacionId: "org-nueva", maestroId: "u-maestro" });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(creados).toHaveLength(2);
    // Cada SQL a mano del repositorio (cerrojo y set_config) corrió en el contexto de plataforma.
    expect(contextos.length).toBeGreaterThanOrEqual(2);
    for (const c of contextos) {
      expect(c).toEqual({ tipo: "plataforma", ficha: "SL-17", motivo: "alta de empresa por el superadmin" });
    }
    expect(tx.usuario.create.mock.calls[0][0]).toMatchObject({
      data: { organizacionId: "org-nueva", rolId: "rol-maestro", estado: "activo", email: "lucia@ejemplo.test" },
    });
  });
});
