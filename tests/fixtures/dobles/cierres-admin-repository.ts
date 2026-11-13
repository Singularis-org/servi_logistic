import { vi, type Mock } from "vitest";

import type { ICierresAdminRepository } from "@/lib/interfaces/repositories/ICierresAdminRepository";

/**
 * SLT-149 (D69) · R430-R432 — la UNICA fabrica del doble de `ICierresAdminRepository`.
 *
 * Antes cada suite construia su propio doble y cada metodo nuevo del interfaz obligaba a tocar
 * 12-13 archivos de test. Ahora el interfaz se dobla aqui: un metodo obligatorio nuevo rompe el
 * typecheck SOLO en `porDefecto()` (R433/R434). La guardia
 * `tests/unit/guards/dobles-cierres-admin-a-mano.guardia.test.ts` impide que vuelvan los dobles a mano.
 *
 * Cada metodo es un `vi.fn` con un valor NEUTRO (vacio, `null`, `updated` o `conflict`): el que ya
 * compartian los dobles a mano. Una suite que necesita otro comportamiento lo pasa como
 * sobrescritura; una sobrescritura que no sea ya un mock se envuelve en `vi.fn`, asi que todo
 * metodo del doble se inspecciona con `.mock.calls` sin cast (R431).
 */

type Repo = ICierresAdminRepository;

/** Los metodos que el interfaz declara con `?`. */
type MetodoOpcional = {
  [K in keyof Repo]-?: object extends Pick<Repo, K> ? K : never;
}[keyof Repo];

type MetodoObligatorio = Exclude<keyof Repo, MetodoOpcional>;

type MocksObligatorios = { [K in MetodoObligatorio]: Mock<Repo[K]> };
type MocksOpcionales = { [K in MetodoOpcional]?: Mock<NonNullable<Repo[K]>> };

export type DobleCierresAdmin = MocksObligatorios & MocksOpcionales;

/**
 * Los valores por defecto (tabla D2/D3 del spec). El tipo exige TODOS los obligatorios, sin
 * `Partial` ni cast: el que falte es un error de tipo en esta funcion.
 */
function porDefecto(): MocksObligatorios {
  return {
    leerTopeIntentos: vi.fn<Repo["leerTopeIntentos"]>(async () => 3),
    findCierresByAlcance: vi.fn<Repo["findCierresByAlcance"]>(async () => []),
    findHistoricoPaginado: vi.fn<Repo["findHistoricoPaginado"]>(async () => ({ items: [], total: 0 })),
    findColaPaginada: vi.fn<Repo["findColaPaginada"]>(async () => ({ items: [], total: 0 })),
    findHistoricoCompleto: vi.fn<Repo["findHistoricoCompleto"]>(async () => []),
    findColaCompleta: vi.fn<Repo["findColaCompleta"]>(async () => []),
    findCatalogoFiltros: vi.fn<Repo["findCatalogoFiltros"]>(async () => ({
      zonas: [],
      mensajeros: [],
      mensajerosFiltro: [],
    })),
    findCierreByIdEnAlcance: vi.fn<Repo["findCierreByIdEnAlcance"]>(async () => null),
    // D3: un `Map` vacio y no el `throw` que copiaron los dobles de SLT-140. Aquel `throw` era un
    // marcador, no una asercion; el mapa vacio es el «no hay» que documenta el interfaz. Quien
    // quiera afirmar que no se llama usa `expect(...).not.toHaveBeenCalled()`.
    findGestionesDeCierresEnAlcance: vi.fn<Repo["findGestionesDeCierresEnAlcance"]>(
      async () => new Map(),
    ),
    findGestionesIncidenteDelCierre: vi.fn<Repo["findGestionesIncidenteDelCierre"]>(async () => []),
    findGestionesRetornablesDelCierre: vi.fn<Repo["findGestionesRetornablesDelCierre"]>(
      async () => [],
    ),
    findBarridasDelCierre: vi.fn<Repo["findBarridasDelCierre"]>(async () => []),
    findGestionesPorAlcanceCompleto: vi.fn<Repo["findGestionesPorAlcanceCompleto"]>(async () => []),
    findRechazosTiendaModeloNuevoCompleto: vi.fn<Repo["findRechazosTiendaModeloNuevoCompleto"]>(
      async () => [],
    ),
    findGestionEditableEnCierre: vi.fn<Repo["findGestionEditableEnCierre"]>(async () => null),
    actualizarPagosGestion: vi.fn<Repo["actualizarPagosGestion"]>(async () => ({
      status: "conflict",
    })),
    corregirResultadoGestionEnCierre: vi.fn<Repo["corregirResultadoGestionEnCierre"]>(async () => ({
      status: "conflict",
    })),
    ajustarPagoMensajeroEnCierre: vi.fn<Repo["ajustarPagoMensajeroEnCierre"]>(async () => ({
      status: "conflict",
    })),
    resolverCierre: vi.fn<Repo["resolverCierre"]>(async () => "updated"),
    forzarSolicitudVencido: vi.fn<Repo["forzarSolicitudVencido"]>(async () => "updated"),
  };
}

/**
 * El doble con `sobrescrituras` aplicadas sobre los valores por defecto.
 *
 * D4/R432: los metodos opcionales (hoy `contarSenalesPorCierre`) NO vienen por defecto. Es lo que
 * hacian todos los dobles a mano, y darlos cambiaria el camino del servicio (pinta las senales de
 * la cola) en suites que no lo miden. Solo existen si la suite los pasa.
 */
export function dobleCierresAdmin(sobrescrituras: Partial<Repo> = {}): DobleCierresAdmin {
  const doble: Record<string, unknown> = { ...porDefecto() };
  for (const [nombre, metodo] of Object.entries(sobrescrituras)) {
    if (metodo === undefined) continue;
    doble[nombre] = vi.isMockFunction(metodo) ? metodo : vi.fn(metodo);
  }
  return doble as DobleCierresAdmin;
}
