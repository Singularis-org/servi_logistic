import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient, RolValue } from "@prisma/client";

import { esPlataforma } from "@/lib/auth/plataforma";
import { BovedaIntegraciones } from "@/lib/crypto/boveda-integraciones";
import type { IEmpresasPlataformaRepository } from "@/lib/interfaces/repositories/IEmpresasPlataformaRepository";
import { EmpresasPlataformaRepository } from "@/lib/repositories/EmpresasPlataformaRepository";
import { EmpresasPlataformaService } from "@/lib/services/EmpresasPlataformaService";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  clienteConTransaccionAnidada,
  crearPrismaDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SL-36 T3.4 (design §11; R37) — el estado de las integraciones para el superadmin, con el
// repositorio REAL contra Postgres: por empresa y servicio solo «conectada», «error» o
// «sin configurar», con los servicios sin fila completados; nunca credenciales, datos públicos ni el
// código del error. Y el servicio rechaza a quien no es de la plataforma sin leer nada.
//
// La base puede tener otras organizaciones: los casos miran solo las dos que siembran, en una
// transacción revertida.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let prisma: PrismaClient;

const boveda = new BovedaIntegraciones(() => ({ activa: "v1", claves: new Map([["v1", Buffer.alloc(32, 0x5a)]]) }));

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

async function revertida<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

const servicio = (repo: IEmpresasPlataformaRepository) =>
  new EmpresasPlataformaService(repo, (rol) => esPlataforma(rol as RolValue));

describeSiHayBase("SL-36 T3.4 — estado de integraciones del superadmin contra Postgres (R37)", () => {
  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("superadmin: solo el estado por empresa y servicio; los que no tienen fila salen sin_configurar", async () => {
    const r = await revertida(async (tx) => {
      const A = (await crearOrganizacion(tx)).id;
      const B = (await crearOrganizacion(tx)).id;
      await fijarEmpresa(tx, A);
      const idMaps = randomUUID();
      const claveMaps = await boveda.cifrar("clave-maps-en-claro", { organizacionId: A, integracionId: idMaps, campo: "clave_api" });
      const idRutas = randomUUID();
      const claveRutas = await boveda.cifrar("{}", { organizacionId: A, integracionId: idRutas, campo: "clave_cuenta_servicio" });
      await tx.$executeRawUnsafe(
        `INSERT INTO integracion (id, servicio, estado, secretos) VALUES ($1, 'google_maps', 'conectada', $2::jsonb)`,
        idMaps,
        JSON.stringify({ clave_api: claveMaps }),
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO integracion (id, servicio, estado, secretos, datos_publicos, ultimo_error_codigo)
         VALUES ($1, 'optimizacion_rutas', 'error', $2::jsonb, $3::jsonb, 'optimizacion_rutas.permiso')`,
        idRutas,
        JSON.stringify({ clave_cuenta_servicio: claveRutas }),
        JSON.stringify({ proyectoId: "proyecto-visible-sl36", cuentaServicio: "cuenta-de-servicio-visible-sl36" }),
      );
      const resultado = await servicio(new EmpresasPlataformaRepository(clienteConTransaccionAnidada(tx))).estadoIntegraciones({
        rol: "superadmin",
      });
      return { A, B, resultado, sensibles: [claveMaps, claveRutas, "proyecto-visible-sl36", "optimizacion_rutas.permiso", idMaps, idRutas] };
    });

    expect(r.resultado.status).toBe("ok");
    if (r.resultado.status !== "ok") return;
    const mias = r.resultado.estados.filter((e) => e.organizacionId === r.A || e.organizacionId === r.B);
    expect(mias.filter((e) => e.organizacionId === r.A)).toEqual([
      { organizacionId: r.A, servicio: "whatsapp", estado: "sin_configurar" },
      { organizacionId: r.A, servicio: "google_maps", estado: "conectada" },
      { organizacionId: r.A, servicio: "optimizacion_rutas", estado: "error" },
      { organizacionId: r.A, servicio: "asistente", estado: "sin_configurar" },
    ]);
    expect(mias.filter((e) => e.organizacionId === r.B)).toEqual(
      ["whatsapp", "google_maps", "optimizacion_rutas", "asistente"].map((s) => ({
        organizacionId: r.B,
        servicio: s,
        estado: "sin_configurar",
      })),
    );
    for (const e of r.resultado.estados) expect(Object.keys(e).sort()).toEqual(["estado", "organizacionId", "servicio"]);
    const texto = JSON.stringify(r.resultado);
    for (const s of r.sensibles) expect(texto).not.toContain(s);
  });

  it.each([["maestro"], ["admin"], ["mensajero"]])("%s: forbidden sin leer el repositorio", async (rol) => {
    const estadoIntegraciones = vi.fn<IEmpresasPlataformaRepository["estadoIntegraciones"]>(async () => []);
    const listar = vi.fn<IEmpresasPlataformaRepository["listar"]>(async () => []);
    expect(await servicio({ listar, estadoIntegraciones }).estadoIntegraciones({ rol })).toEqual({ status: "forbidden" });
    expect(estadoIntegraciones).not.toHaveBeenCalled();
  });

  it("sin sesión: forbidden sin leer el repositorio", async () => {
    const estadoIntegraciones = vi.fn<IEmpresasPlataformaRepository["estadoIntegraciones"]>(async () => []);
    const listar = vi.fn<IEmpresasPlataformaRepository["listar"]>(async () => []);
    expect(await servicio({ listar, estadoIntegraciones }).estadoIntegraciones(null)).toEqual({ status: "forbidden" });
    expect(estadoIntegraciones).not.toHaveBeenCalled();
  });
});
