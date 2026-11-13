// @vitest-environment jsdom
/**
 * SLT-54 (R71, tanda H2) — el rótulo del ingreso de bodega en la TARJETA del listado y en la CONSOLIDACIÓN.
 *
 * Con alguna gestión del modelo nuevo ese total incluye entregas, así que nombrar la devolución es falso. El
 * campo sale de `cierre_detail.tarifa_modelo` (`tests/integration/db/cierre-incluye-modelo-nuevo.test.ts`); aquí
 * se mide lo que la pantalla hace con él. Los textos van literales a propósito: compararlos con sus constantes
 * dejaría pasar que alguien cambie la constante.
 *
 * SLT-106 «Bodega satélite: A consolidar con la cola única» (R196): en la consolidación, el total por modelo
 * pasa de la región «… a consolidar» a la tarjeta «Gana la bodega satélite», con la nota «por devoluciones a
 * origen» solo si ningún cierre del conjunto es del modelo nuevo. El comprobante de cada consolidable sale de
 * esa pantalla (lo sigue usando su propio componente, probado arriba); la fila de la cola pinta el importe.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";
import type { CierreConsolidableCola } from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreTotales } from "@/lib/interfaces/services/ICierreDiaService";

const { consolidables, solicitados } = vi.hoisted(() => ({
  consolidables: vi.fn(),
  solicitados: vi.fn(),
}));

vi.mock("@/lib/actions/cierre-bodega", () => ({
  listarGestionesCierresBodegaCompleto: vi.fn(),
  verCierreBodegaDetalle: vi.fn(),
  aprobarCierreBodega: vi.fn(),
  rechazarCierreBodega: vi.fn(),
  solicitarCierreBodega: vi.fn(),
  listarCierresBodegaAdmin: vi.fn(),
  listarConsolidacion: vi.fn(),
  listarPendientesCierresBodegaCompleto: vi.fn(),
  listarPendientesCierresBodegaPaginado: vi.fn(),
  listarHistoricoCierresBodegaPaginado: vi.fn(),
  listarConsolidablesPaginado: (...a: unknown[]) => consolidables(...a),
  listarCierresBodegaSolicitadosPaginado: (...a: unknown[]) => solicitados(...a),
  listarConsolidablesCompleto: vi.fn(),
  listarCierresBodegaSolicitadosCompleto: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));

import {
  CierreConsolidableFacturaResumen,
  CierreFacturaResumen,
} from "@/app/(app)/cierres-admin/_components/cierre-factura";
import { ConsolidacionBodegaModule } from "@/app/(app)/cierres-admin/_components/ConsolidacionBodegaModule";

afterEach(() => cleanup());

const VIEJO = "Ingreso de bodega por devoluciones a origen";
const NUEVO = "Ingreso de bodega";
const SUBLINEAS = ["Automático (por plazo vencido)", "Manual (mensajero)"];

const TOTALES: CierreTotales = { efectivo: "9000.00", simpe: "0.00", transferencia: "0.00", general: "9000.00" };

const RESUMEN: CierreAdminResumen = {
  cierreId: "c1c1c1c1-1111-4111-8111-c1c1c1c1c1c1",
  mensajeroId: "m1",
  mensajeroNombre: "Ana Mensajera",
  estado: "aprobado",
  destinoTipo: "bodega_central",
  destinoZonaNombre: "GAM",
  totales: TOTALES,
  totalPagoMensajero: "1500.00",
  totalIngresoBodegaRechazos: "570.00",
  solicitadoAt: "2026-09-01T10:00:00.000Z",
  resueltoAt: "2026-09-02T10:00:00.000Z",
  motivoRechazo: null,
} as CierreAdminResumen;

function consolidable(nombre: string, over: Partial<CierreConsolidableCola> = {}): CierreConsolidableCola {
  return {
    cierreDiaId: `cd-${nombre}`,
    mensajeroId: `m-${nombre}`,
    mensajeroNombre: nombre,
    totales: TOTALES,
    totalPagoMensajero: "1500.00",
    totalIngresoBodegaRechazos: "570.00",
    paraLaCentral: "6930.00",
    aprobadoAt: null,
    gestionesAjustadas: 0,
    ...over,
  };
}

/** Las líneas de «Ajustes» de un comprobante, con su desplegable abierto. */
async function ajustesDe(nombre: string): Promise<HTMLElement> {
  const comprobante = screen.getByRole("region", { name: `Comprobante del cierre de ${nombre}` });
  await userEvent.click(within(comprobante).getByRole("button", { name: `Ver detalles del cierre de ${nombre}` }));
  return within(comprobante).getByRole("region", { name: "Ajustes" });
}

function afirmaRotuloNuevo(ajustes: HTMLElement) {
  expect(within(ajustes).getByText(NUEVO, { exact: true })).toBeInTheDocument();
  expect(ajustes.textContent).toContain("₡570");
  expect(ajustes.textContent).not.toContain("devoluciones a origen");
  for (const s of SUBLINEAS) expect(ajustes.textContent).not.toContain(s);
}

function afirmaRotuloViejo(ajustes: HTMLElement) {
  expect(within(ajustes).getByText(VIEJO, { exact: true })).toBeInTheDocument();
  expect(ajustes.textContent).toContain("₡570");
  expect(within(ajustes).queryByText(NUEVO, { exact: true })).toBeNull();
}

describe("R71 — la tarjeta del listado", () => {
  it("nuevo: «Ingreso de bodega», sin hablar de devoluciones ni partirlo por origen", async () => {
    render(<CierreFacturaResumen cierre={{ ...RESUMEN, incluyeModeloNuevo: true }} />);
    afirmaRotuloNuevo(await ajustesDe("Ana Mensajera"));
  });

  it("mixto: un cierre con gestiones de los dos modelos llega con el campo verdadero y se lee como nuevo", async () => {
    // El campo mixto lo calcula el servidor (integración, «mixto dentro de un cierre»). Aquí, la lista con un
    // cierre de cada lado: cada tarjeta sigue a SU cierre, no al vecino.
    render(
      <>
        <CierreFacturaResumen cierre={{ ...RESUMEN, incluyeModeloNuevo: true }} />
        <CierreFacturaResumen
          cierre={{ ...RESUMEN, cierreId: "c2", mensajeroNombre: "Beto Viejo", incluyeModeloNuevo: false }}
        />
      </>,
    );
    afirmaRotuloNuevo(await ajustesDe("Ana Mensajera"));
    afirmaRotuloViejo(await ajustesDe("Beto Viejo"));
  });

  it.each([
    ["falso", false],
    ["ausente", undefined],
  ])("viejo, con el campo %s: el texto de siempre, literal", async (_nombre, campo) => {
    render(<CierreFacturaResumen cierre={{ ...RESUMEN, incluyeModeloNuevo: campo }} />);
    afirmaRotuloViejo(await ajustesDe("Ana Mensajera"));
  });
});

describe("R71 — la tarjeta de la consolidación", () => {
  it("nuevo: «Ingreso de bodega»", async () => {
    render(<CierreConsolidableFacturaResumen cierre={consolidable("Ana", { incluyeModeloNuevo: true })} />);
    afirmaRotuloNuevo(await ajustesDe("Ana"));
  });

  it.each([
    ["falso", false],
    ["ausente", undefined],
  ])("viejo, con el campo %s: el texto de siempre, literal", async (_nombre, campo) => {
    render(<CierreConsolidableFacturaResumen cierre={consolidable("Ana", { incluyeModeloNuevo: campo })} />);
    afirmaRotuloViejo(await ajustesDe("Ana"));
  });
});

describe("R71/R196 — el total de la consolidación (tarjeta «Gana la bodega satélite»)", () => {
  function montar(items: CierreConsolidableCola[], incluyeModeloNuevoAgregado: boolean) {
    const pagina = <T,>(lista: T[]) => ({ status: "ok" as const, items: lista, page: 1, pageSize: 10, total: lista.length });
    consolidables.mockResolvedValue(pagina(items));
    solicitados.mockResolvedValue(pagina([]));
    return render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ConsolidacionBodegaModule
          consolidables={{ items, total: items.length, pageSize: 10 }}
          totalesAgregados={TOTALES}
          totalPagoMensajeroAgregado="1500.00"
          totalIngresoBodegaRechazosAgregado="870.00"
          incluyeModeloNuevoAgregado={incluyeModeloNuevoAgregado}
          totalCentralDebeAgregado="0.00"
          puedesSolicitar
          motivoBloqueo={null}
          paraLaCentralAgregado="6630.00"
          cierresAConsolidar={items.length}
          mensajerosAConsolidar={items.length}
          bloqueo={null}
          zonaNombre={null}
          // SLT-107: la prop nueva obligatoria (R287); este test no mira las tarjetas de «Solicitados».
          solicitadosResumen={{ porLlegar: { monto: "0.00", cierres: 0 }, recibido30Dias: { monto: "0.00", cierres: 0 }, faltaPorRecibir: { monto: "0.00", cierres: 0 } }}
          cierresBodegaPasados={{ items: [], total: 0, pageSize: 10 }}
          sinZona={false}
        />
      </SWRConfig>,
    );
  }

  const tarjeta = () =>
    within(screen.getByRole("group", { name: "Cifras a consolidar" })).getByRole("group", {
      name: "Gana la bodega satélite",
    });

  it("nuevo: la tarjeta sin la nota de devoluciones, sobre el mismo importe", () => {
    montar([consolidable("Ana", { incluyeModeloNuevo: true })], true);
    expect(tarjeta().textContent).toContain("₡870");
    expect(tarjeta().textContent).not.toContain("devoluciones a origen");
    expect(screen.queryByText("por devoluciones a origen")).toBeNull();
  });

  it("mixto: el total dice lo nuevo y cada fila pinta el importe de su cierre", () => {
    montar(
      [
        consolidable("Ana", { incluyeModeloNuevo: true }),
        consolidable("Beto", { incluyeModeloNuevo: false, totalIngresoBodegaRechazos: "300.00" }),
      ],
      true,
    );
    expect(tarjeta().textContent).not.toContain("devoluciones a origen");
    const region = screen.getByRole("region", { name: "Cierres del día a consolidar" });
    const fila = (n: string) =>
      within(region)
        .getAllByRole("row")
        .find((r) => within(r).queryByText(n) !== null);
    // «Gana bodega» es la 6.ª columna (Folio · Mensajero · Aprobado · Recaudado · Pago · Gana bodega).
    expect(within(fila("Ana")!).getAllByRole("cell")[5].textContent).toBe("₡570");
    expect(within(fila("Beto")!).getAllByRole("cell")[5].textContent).toBe("₡300");
  });

  it("el total sale del conjunto completo, no de la página: una página solo vieja no lo vuelve viejo (R49)", () => {
    montar([consolidable("Beto", { incluyeModeloNuevo: false })], true);
    expect(tarjeta().textContent).not.toContain("devoluciones a origen");
  });

  it("viejo: la nota de siempre, literal", () => {
    montar([consolidable("Beto", { incluyeModeloNuevo: false })], false);
    expect(within(tarjeta()).getByText("por devoluciones a origen", { exact: true })).toBeInTheDocument();
    expect(tarjeta().textContent).toContain("₡870");
  });
});
