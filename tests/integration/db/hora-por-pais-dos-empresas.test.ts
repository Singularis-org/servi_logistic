import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { handleLiberarReprogramadas } from "@/app/api/cron/liberar-reprogramadas/route";
import { contextoActual } from "@/lib/db/contexto-empresa";
import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import type { ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import type { ILiberacionReprogramadaService } from "@/lib/interfaces/services/ILiberacionReprogramadaService";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { ReglasPaisEmpresaService } from "@/lib/services/ReglasPaisEmpresaService";
import {
  crearLiberarReprogramadasHandler,
  recurrenciaLiberarReprogramadas,
} from "@/lib/services/jobs/liberar-reprogramadas-handler";
import { conSuEmpresa } from "@/app/api/cron/procesar-jobs/route";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { crearOrganizacionEnPais, crearPaisDePrueba } from "@/tests/fabricas/paises";
import { revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-42 (T6.3; R24, R25, R28, R31) — DOS EMPRESAS EN DOS PAISES y una tercera en un pais sin zona,
// con el pais LEIDO DE LA BASE (`PaisRepository` + `ReglasPaisEmpresaService` reales):
//
//   · A en `XA` (America/Bogota, UTC-5), C en Costa Rica (la de la migracion, UTC-6) y B en `XB`,
//     un pais sin zona horaria (como uno dado de alta por la pantalla de SL-20).
//   · R24/R28: el cron `liberar-reprogramadas` calcula «hoy» de cada empresa con la zona de SU pais;
//     B falla sola y A y C corren.
//   · R25: las zonas con empresas salen de la base, la serie diaria agenda la de Bogota primero y esa
//     corrida solo procesa la empresa de Bogota.
//
// Todo en una transaccion del dueño que se revierte. El servicio de liberacion es un doble que
// anota la empresa del contexto y el dia que recibe: lo que se mide aqui es la zona, no la
// liberacion (la miden los tests de la 46/90).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

// 05:30 UTC del 20 de julio: en Bogota ya es el 20 (00:30); en Costa Rica todavia el 19 (23:30).
const AHORA = new Date("2026-07-20T05:30:00.000Z");

let base: PrismaClient;

beforeAll(() => {
  base = crearPrismaDeTest();
});

afterAll(async () => {
  await base?.$disconnect();
});

interface Mundo {
  A: string;
  B: string;
  C: string;
}

async function sembrarMundo(tx: TxDeTest): Promise<Mundo> {
  await crearPaisDePrueba(tx, "XA", { zonaHoraria: "America/Bogota" });
  await crearPaisDePrueba(tx, "XB");
  const A = (await crearOrganizacionEnPais(tx, "XA")).id;
  const B = (await crearOrganizacionEnPais(tx, "XB")).id;
  const C = (await crearOrganizacion(tx)).id; // Costa Rica, por el DEFAULT 'CR'
  return { A, B, C };
}

/** Doble del servicio: anota `empresa -> dia` de cada liberacion. */
function liberacionQueAnota(): { service: ILiberacionReprogramadaService; dias: Map<string, string> } {
  const dias = new Map<string, string>();
  const service: ILiberacionReprogramadaService = {
    ejecutarLiberacion: vi.fn(async (hoy: Date) => {
      const ctx = contextoActual();
      if (ctx?.tipo === "empresa") dias.set(ctx.organizacionId, hoy.toISOString().slice(0, 10));
      return { evaluadas: 0, liberadas: 0, omitidas: 0 };
    }),
    liberarPorCierreAprobado: vi.fn(),
    liberarOrdenCorregida: vi.fn(),
  };
  return { service, dias };
}

function soloEstas(ids: string[]): ClienteDeOrganizaciones {
  return { organizacion: { findMany: vi.fn(async () => ids.map((id) => ({ id }))) } };
}

function reglasDelPaisEn(tx: TxDeTest): ReglasPaisEmpresaService {
  return new ReglasPaisEmpresaService({ repo: new PaisRepository(clienteConSavepoint(tx)) });
}

describeSiHayBase("SLT-42 — hora por pais con dos empresas en dos paises (R24, R25, R28, R31)", () => {
  it("R24/R28: el cron calcula «hoy» con la zona del pais de cada empresa; la que no tiene zona falla sola", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await sembrarMundo(tx);
      const { service, dias } = liberacionQueAnota();
      const errores = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const res = await handleLiberarReprogramadas(
          new Request("https://app.test/api/cron/liberar-reprogramadas", {
            headers: { authorization: "Bearer s3cr3t" },
          }),
          {
            getSecret: () => "s3cr3t",
            service,
            now: () => AHORA,
            empresas: soloEstas([m.A, m.B, m.C]),
            reglasPais: reglasDelPaisEn(tx),
          },
        );
        const fallos = errores.mock.calls.map((c) => c[1]);
        return { m, status: res.status, body: (await res.json()) as { empresas: { procesadas: number; fallidas: string[] } }, dias, fallos };
      } finally {
        errores.mockRestore();
      }
    });

    expect(r.status).toBe(200);
    expect(r.dias.get(r.m.A)).toBe("2026-07-20"); // Bogota
    expect(r.dias.get(r.m.C)).toBe("2026-07-19"); // Costa Rica
    expect(r.dias.has(r.m.B)).toBe(false); // sin zona: no se libero nada
    expect(r.body.empresas).toEqual({ procesadas: 2, fallidas: [r.m.B] });
    expect(r.fallos.some((e) => e instanceof PaisSinZonaHoraria)).toBe(true);
  });

  it("R25: las zonas con empresas salen de la base, la serie agenda Bogota primero y esa corrida solo procesa la empresa de Bogota", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await sembrarMundo(tx);
      const zonas = await new PaisRepository(clienteConSavepoint(tx)).zonasConEmpresas();
      const siguiente = recurrenciaLiberarReprogramadas.siguiente(new Date("2026-07-19T18:00:00.000Z"), zonas);

      const { service, dias } = liberacionQueAnota();
      const job: JobDTO = {
        id: "j-slt42",
        tipo: "liberar_reprogramadas",
        payload: {},
        estado: "processing",
        intentos: 1,
        maxIntentos: 5,
        runAfter: siguiente.runAfter,
        lockedAt: siguiente.runAfter,
        lastError: null,
        dedupeKey: siguiente.dedupeKey,
        createdAt: siguiente.runAfter,
        updatedAt: siguiente.runAfter,
      };
      const handler = conSuEmpresa(
        crearLiberarReprogramadasHandler(service, () => siguiente.runAfter, reglasDelPaisEn(tx)),
        true,
        { empresas: soloEstas([m.A, m.C]) },
      );
      await handler(job);
      return { m, zonas, siguiente, dias };
    });

    expect(r.zonas).toEqual(expect.arrayContaining(["America/Bogota", "America/Costa_Rica"]));
    expect(r.siguiente.runAfter.toISOString()).toBe("2026-07-20T05:00:00.000Z");
    expect(r.siguiente.dedupeKey).toBe("liberar_reprogramadas:America/Bogota:2026-07-20");
    expect([...r.dias.entries()]).toEqual([[r.m.A, "2026-07-20"]]);
  });
});
