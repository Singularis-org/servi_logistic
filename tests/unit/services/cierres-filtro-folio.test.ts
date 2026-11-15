import { describe, it, expect, vi } from "vitest";

import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { CierresBodegaAdminService } from "@/lib/services/CierresBodegaAdminService";
import { CierreBodegaService } from "@/lib/services/CierreBodegaService";
import type { ICierresBodegaAdminRepository } from "@/lib/interfaces/repositories/ICierresBodegaAdminRepository";
import type { ICierreBodegaRepository } from "@/lib/interfaces/repositories/ICierreBodegaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import {
  listarHistoricoCierresAdminSchema,
  listarPendientesCierresAdminSchema,
  listarHistoricoCierresAdminCompletoSchema,
  listarPendientesCierresAdminCompletoSchema,
} from "@/lib/types/cierres-admin";
import {
  listarCierresBodegaPaginadoSchema,
  listarConsolidablesSchema,
  listarCierresBodegaSolicitadosCompletoSchema,
  listarConsolidablesCompletoSchema,
  listarPendientesCierresBodegaCompletoSchema,
  listarHistoricoCierresBodegaCompletoSchema,
} from "@/lib/types/cierre-bodega";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";
import { dobleCierresAdmin } from "@/tests/fixtures/dobles/cierres-admin-repository";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

/**
 * SLT-153 «Cabecera del detalle del cierre con rótulos y folio buscable» (R456, R457, R459) — el
 * folio en la capa de SERVICIO de las tres pantallas de `/cierres-admin`.
 *
 * QUÉ MIDE: que los doce caminos (cuatro por servicio: dos páginas y dos archivos) normalizan el
 * folio con la regla de `/cierre-dia` antes del repositorio, y que uno IMPOSIBLE da cero cierres
 * SIN consultar la base (contador de llamadas al repositorio y a la zona horaria). Qué filas salen
 * lo mide el `WHERE` contra Postgres: `tests/integration/db/cierres-filtro-folio-sql-real.test.ts`.
 *
 * Los textos normalizados se escriben a mano («3F2A»), nunca con `normalizarFolio`.
 */

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const SATELITE: Actor = { usuarioId: "u-sat", rol: "adminSatelite" };
const ZONA_SAT = "zona-sat-1";

/** La zona horaria contada: un folio imposible no debe ni leerla. */
function reglasContadas(contador: { n: number }): IReglasPaisEmpresa {
  const base = reglasPaisFijas();
  return {
    ...base,
    zonaHoraria: async () => {
      contador.n += 1;
      return base.zonaHoraria();
    },
  };
}

/** Las llamadas a cada método de un doble, por nombre. Todo lo que el doble expone se cuenta. */
function contados<T extends Record<string, (...args: never[]) => unknown>>(metodos: T) {
  const llamadas: Array<{ metodo: string; args: unknown[] }> = [];
  const doble = Object.fromEntries(
    Object.entries(metodos).map(([nombre, impl]) => [
      nombre,
      vi.fn(async (...args: unknown[]) => {
        llamadas.push({ metodo: nombre, args });
        return (impl as (...a: unknown[]) => unknown)(...args);
      }),
    ]),
  );
  return { doble, llamadas };
}

const pagina = async () => ({ items: [], total: 0 });
const conjunto = async () => [];

/** Un camino de lectura: lo llama, y dice en qué posición viajan los filtros al repositorio. */
interface Camino {
  nombre: string;
  /** Llama al camino con `folio` en el bloque de filtros (y opcionalmente otro recorte). */
  llamar: (filtros: Record<string, unknown>) => Promise<{ status: string; items?: unknown[]; total?: number }>;
  metodoRepo: string;
  posicionFiltros: number;
}

function montar() {
  const zona = { n: 0 };

  // ── Cierres de mensajeros (CierresAdminService) ──────────────────────────────────────────
  const admin = contados({
    findHistoricoPaginado: pagina,
    findColaPaginada: pagina,
    findHistoricoCompleto: conjunto,
    findColaCompleta: conjunto,
  });
  const svcAdmin = new CierresAdminService(
    dobleCierresAdmin(admin.doble as never),
    { findCentralZonaId: vi.fn(async () => "z-central") } as unknown as IZonaRepository,
    {
      contarCierresAbiertosPorMensajero: vi.fn(async () => new Map()),
      findUsuarioZonaId: vi.fn(async () => null),
      findEstatusIdByValue: vi.fn(async () => null),
    } as unknown as IOrdenRepository,
    { createSignedUrls: vi.fn(async () => ({})) } as unknown as ISignedUrlProvider,
    {
      sumarVigentesPorCierre: vi.fn(async () => ({})),
      obtenerCierreParaPago: vi.fn(async () => null),
    },
    { sumarPremiosVivosPorCierre: vi.fn(async () => ({})) },
    sinRetenidas(),
    undefined,
    undefined,
    undefined,
    undefined,
    reglasContadas(zona),
  );

  // ── Cierres de bodega de la central (CierresBodegaAdminService) ──────────────────────────
  const bodegaAdmin = contados({
    findHistoricoPaginado: pagina,
    findColaPaginada: pagina,
    findHistoricoCompleto: conjunto,
    findColaCompleta: conjunto,
  });
  const svcBodegaAdmin = new CierresBodegaAdminService(
    bodegaAdmin.doble as unknown as ICierresBodegaAdminRepository,
    { createSignedUrls: vi.fn(async () => ({})) } as unknown as ISignedUrlProvider,
    reglasContadas(zona),
  );

  // ── Consolidación de la satélite (CierreBodegaService) ───────────────────────────────────
  const satelite = contados({
    findCierresBodegaByZonaPaginado: pagina,
    findCierresDiaConsolidablesPaginado: pagina,
    findCierresBodegaByZona: conjunto,
    findCierresDiaConsolidables: conjunto,
  });
  const svcSatelite = new CierreBodegaService(
    satelite.doble as unknown as ICierreBodegaRepository,
    { findUsuarioZonaId: vi.fn(async () => ZONA_SAT) } as unknown as IOrdenRepository,
    reglasContadas(zona),
  );

  const p = { page: 1, pageSize: 25 };
  const caminos: Array<Camino & { llamadas: Array<{ metodo: string; args: unknown[] }> }> = [
    { nombre: "mensajeros · resueltos (página)", llamadas: admin.llamadas, metodoRepo: "findHistoricoPaginado", posicionFiltros: 2,
      llamar: (f) => svcAdmin.listarHistoricoCierresAdminPaginado({ ...p, filtros: f }, MAESTRO) },
    { nombre: "mensajeros · pendientes (página)", llamadas: admin.llamadas, metodoRepo: "findColaPaginada", posicionFiltros: 2,
      llamar: (f) => svcAdmin.listarPendientesCierresAdminPaginado({ ...p, filtros: f }, MAESTRO) },
    { nombre: "mensajeros · resueltos (archivo)", llamadas: admin.llamadas, metodoRepo: "findHistoricoCompleto", posicionFiltros: 1,
      llamar: (f) => svcAdmin.listarHistoricoCierresAdminCompleto(MAESTRO, f) },
    { nombre: "mensajeros · pendientes (archivo)", llamadas: admin.llamadas, metodoRepo: "findColaCompleta", posicionFiltros: 1,
      llamar: (f) => svcAdmin.listarPendientesCierresAdminCompleto(MAESTRO, f) },
    { nombre: "bodega central · resueltos (página)", llamadas: bodegaAdmin.llamadas, metodoRepo: "findHistoricoPaginado", posicionFiltros: 1,
      llamar: (f) => svcBodegaAdmin.listarHistoricoCierresBodegaPaginado({ ...p, filtros: f }, MAESTRO) },
    { nombre: "bodega central · cola (página)", llamadas: bodegaAdmin.llamadas, metodoRepo: "findColaPaginada", posicionFiltros: 1,
      llamar: (f) => svcBodegaAdmin.listarPendientesCierresBodegaPaginado({ ...p, filtros: f }, MAESTRO) },
    { nombre: "bodega central · resueltos (archivo)", llamadas: bodegaAdmin.llamadas, metodoRepo: "findHistoricoCompleto", posicionFiltros: 0,
      llamar: (f) => svcBodegaAdmin.listarHistoricoCierresBodegaCompleto(MAESTRO, f) },
    { nombre: "bodega central · cola (archivo)", llamadas: bodegaAdmin.llamadas, metodoRepo: "findColaCompleta", posicionFiltros: 0,
      llamar: (f) => svcBodegaAdmin.listarPendientesCierresBodegaCompleto(MAESTRO, f) },
    { nombre: "satélite · solicitados (página)", llamadas: satelite.llamadas, metodoRepo: "findCierresBodegaByZonaPaginado", posicionFiltros: 2,
      llamar: (f) => svcSatelite.listarCierresBodegaSolicitadosPaginado({ ...p, filtros: f }, SATELITE) },
    { nombre: "satélite · a consolidar (página)", llamadas: satelite.llamadas, metodoRepo: "findCierresDiaConsolidablesPaginado", posicionFiltros: 2,
      llamar: (f) => svcSatelite.listarConsolidablesPaginado({ ...p, filtros: f }, SATELITE) },
    { nombre: "satélite · solicitados (archivo)", llamadas: satelite.llamadas, metodoRepo: "findCierresBodegaByZona", posicionFiltros: 1,
      llamar: (f) => svcSatelite.listarCierresBodegaSolicitadosCompleto(SATELITE, f) },
    { nombre: "satélite · a consolidar (archivo)", llamadas: satelite.llamadas, metodoRepo: "findCierresDiaConsolidables", posicionFiltros: 1,
      llamar: (f) => svcSatelite.listarConsolidablesCompleto(SATELITE, f) },
  ];
  return { caminos, zona };
}

describe("SLT-153 — el folio en los doce caminos de /cierres-admin (servicio)", () => {
  it("R457: un folio imposible («ZZ», «123456789») da cero cierres y total 0 sin consultar la base", async () => {
    for (const folio of ["ZZ", "123456789", "#3F2A-"]) {
      const { caminos, zona } = montar();
      for (const c of caminos) {
        const antes = c.llamadas.length;
        const r = await c.llamar({ folio, desde: "2026-11-01" });
        expect(r.status, `${c.nombre} · ${folio}`).toBe("ok");
        expect(r.items, `${c.nombre} · ${folio}`).toEqual([]);
        expect(r.total, `${c.nombre} · ${folio}`).toBe(0);
        // El contador: ni una llamada al repositorio de cierres desde este camino.
        expect(c.llamadas.length - antes, `${c.nombre} consultó la base con «${folio}»`).toBe(0);
      }
      // Ni siquiera la zona horaria del rango `desde`: el folio se mira antes.
      expect(zona.n, `«${folio}» leyó la zona horaria`).toBe(0);
    }
  });

  it("R456: « #3f2a » llega al repositorio normalizado como «3F2A», junto a los demás recortes", async () => {
    const { caminos } = montar();
    for (const c of caminos) {
      await c.llamar({ folio: " #3f2a ", destinoZonaIds: ["11111111-1111-4111-8111-111111111111"] });
      const llamada = c.llamadas.at(-1);
      expect(llamada?.metodo, c.nombre).toBe(c.metodoRepo);
      expect(llamada?.args[c.posicionFiltros], c.nombre).toEqual({
        destinoZonaIds: ["11111111-1111-4111-8111-111111111111"],
        folio: "3F2A",
      });
    }
  });

  it("R457: un folio vacío tras normalizar («», «  », «#») no recorta: la clave no llega al repositorio", async () => {
    for (const folio of ["", "  ", "#"]) {
      const { caminos } = montar();
      for (const c of caminos) {
        await c.llamar({ folio });
        const llamada = c.llamadas.at(-1);
        expect(llamada?.metodo, `${c.nombre} · «${folio}»`).toBe(c.metodoRepo);
        expect(llamada?.args[c.posicionFiltros], `${c.nombre} · «${folio}»`).toEqual({});
      }
    }
  });

  it("R459: sin folio el repositorio recibe lo de antes (el bloque sin `folio`, o `undefined`)", async () => {
    const { caminos } = montar();
    for (const c of caminos) {
      await c.llamar({ destinoZonaIds: ["11111111-1111-4111-8111-111111111111"] });
      expect(c.llamadas.at(-1)?.args[c.posicionFiltros], c.nombre).toEqual({
        destinoZonaIds: ["11111111-1111-4111-8111-111111111111"],
      });
    }
  });
});

describe("SLT-153 — el borde del folio (R457)", () => {
  const PAGINAS = [
    ["mensajeros · resueltos (página)", listarHistoricoCierresAdminSchema],
    ["mensajeros · pendientes (página)", listarPendientesCierresAdminSchema],
    ["mensajeros · resueltos (archivo)", listarHistoricoCierresAdminCompletoSchema],
    ["mensajeros · pendientes (archivo)", listarPendientesCierresAdminCompletoSchema],
    ["bodega · página", listarCierresBodegaPaginadoSchema],
    ["consolidables · página", listarConsolidablesSchema],
    ["satélite · solicitados (archivo)", listarCierresBodegaSolicitadosCompletoSchema],
    ["satélite · a consolidar (archivo)", listarConsolidablesCompletoSchema],
    ["bodega central · cola (archivo)", listarPendientesCierresBodegaCompletoSchema],
    ["bodega central · resueltos (archivo)", listarHistoricoCierresBodegaCompletoSchema],
  ] as const;

  it("21 caracteres dan `validation_error`; 20 entran (aunque luego sean imposibles)", () => {
    const veinte = "#3F2A 3F2A 3F2A 3F2A"; // 20 caracteres, escrito a mano
    const veintiuno = "#3F2A 3F2A 3F2A 3F2A "; // 21
    expect(veinte).toHaveLength(20);
    expect(veintiuno).toHaveLength(21);
    for (const [nombre, schema] of PAGINAS) {
      expect(schema.safeParse({ filtros: { folio: veintiuno } }).success, nombre).toBe(false);
      const r = schema.safeParse({ filtros: { folio: veinte } });
      expect(r.success, nombre).toBe(true);
      if (r.success) expect(r.data.filtros?.folio, nombre).toBe(veinte);
    }
  });
});
