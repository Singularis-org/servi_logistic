// @vitest-environment jsdom
/**
 * SL-44 (defecto destapado por el E2E `e2e/cierre-bodega-satelite.spec.ts`) — tras «Solicitar
 * cierre de bodega», las DOS listas de la consolidación se vuelven a leer sin recargar.
 *
 * El defecto: `confirmarSolicitud` solo llamaba a `router.refresh()`. Las dos listas son `useSWR`
 * con la página del Server Component como `fallbackData`, que SWR usa una sola vez; con la caché
 * ya llena, la consolidación recién creada no salía en «Solicitados» (medido en el E2E: «Aún no
 * has solicitado ningún cierre de bodega.» después del aviso de éxito) y lo consolidado seguía en
 * «A consolidar». Mismo defecto y mismo arreglo que ya tienen `CierreDiaModule` y
 * `CierresAdminModule` (pedido humano del 2026-08-19).
 *
 * Mutación que lo tumba: quitar el `mutate(...)` de `confirmarSolicitud`.
 *
 * SLT-106 «Bodega satélite: A consolidar con la cola única» (T3.2): el módulo monta la cola única.
 * Se suman el diálogo con su resumen (R48, R207), el aviso, toast y refresco (R205), la rama sin
 * zona (R202) y lo que ya no se pinta (R204). Importes escritos a mano con el formato de `money()`
 * («₡9.000», «₡1.500», «₡250», «₡7.250», «₡500»).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import type { CierreConsolidableCola } from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreTotales } from "@/lib/interfaces/services/ICierreDiaService";

const { consolidables, solicitados, solicitar, refresh, push, toastOk } = vi.hoisted(() => ({
  consolidables: vi.fn(),
  solicitados: vi.fn(),
  solicitar: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  toastOk: vi.fn(),
}));

vi.mock("@/lib/actions/cierre-bodega", () => ({
  listarGestionesCierresBodegaCompleto: vi.fn(),
  verCierreBodegaDetalle: vi.fn(),
  aprobarCierreBodega: vi.fn(),
  rechazarCierreBodega: vi.fn(),
  solicitarCierreBodega: (...a: unknown[]) => solicitar(...a),
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
  useRouter: () => ({ refresh, push, replace: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: toastOk, error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));

import { ConsolidacionBodegaModule } from "@/app/(app)/cierres-admin/_components/ConsolidacionBodegaModule";

const TOTALES: CierreTotales = { efectivo: "9000.00", simpe: "0.00", transferencia: "0.00", general: "9000.00" };

const CONSOLIDABLE: CierreConsolidableCola = {
  cierreDiaId: "cd-1",
  mensajeroId: "m-1",
  mensajeroNombre: "Mensajero Uno",
  totales: TOTALES,
  totalPagoMensajero: "1500.00",
  totalIngresoBodegaRechazos: "0.00",
  paraLaCentral: "7500.00",
  aprobadoAt: "2026-11-08T01:10:00.000Z",
  gestionesAjustadas: 0,
};

function pagina<T>(items: T[]) {
  return { status: "ok" as const, items, page: 1, pageSize: 10, total: items.length };
}

type Props = Parameters<typeof ConsolidacionBodegaModule>[0];

function montar(over: Partial<Props> = {}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ConsolidacionBodegaModule
        consolidables={{ items: [CONSOLIDABLE], total: 1, pageSize: 10 }}
        totalesAgregados={TOTALES}
        totalPagoMensajeroAgregado="1500.00"
        totalIngresoBodegaRechazosAgregado="0.00"
        incluyeModeloNuevoAgregado={false}
        totalCentralDebeAgregado="0.00"
        puedesSolicitar
        motivoBloqueo={null}
        paraLaCentralAgregado="7500.00"
        cierresAConsolidar={1}
        mensajerosAConsolidar={1}
        bloqueo={null}
        zonaNombre="Limón"
        cierresBodegaPasados={{ items: [], total: 0, pageSize: 10 }}
        sinZona={false}
        {...over}
      />
    </SWRConfig>,
  );
}

describe("ConsolidacionBodegaModule — refresco tras solicitar el cierre de bodega (SL-44)", () => {
  beforeEach(() => {
    consolidables.mockReset();
    solicitados.mockReset();
    solicitar.mockReset();
  });

  it("vuelve a leer «A consolidar» y «Solicitados» y pinta lo que devuelve el servidor", async () => {
    // Antes de solicitar: un consolidable y ningún solicitado. Después: al revés.
    let solicitado = false;
    consolidables.mockImplementation(async () => pagina(solicitado ? [] : [CONSOLIDABLE]));
    solicitados.mockImplementation(async () => pagina([]));
    solicitar.mockImplementation(async () => {
      solicitado = true;
      return { status: "ok", cierreBodegaId: "b-1", totales: TOTALES };
    });
    montar();
    await waitFor(() => expect(consolidables).toHaveBeenCalled());
    await waitFor(() => expect(solicitados).toHaveBeenCalled());
    const lecturasConsolidables = consolidables.mock.calls.length;
    const lecturasSolicitados = solicitados.mock.calls.length;

    const usuario = userEvent.setup();
    // SLT-106: el botón vive en el pie de la cola (R197), ya no en una región propia (R204).
    await usuario.click(screen.getByRole("button", { name: "Solicitar cierre de bodega" }));
    await usuario.click(
      within(screen.getByRole("dialog", { name: "Solicitar cierre de bodega" })).getByRole("button", {
        name: "Solicitar cierre de bodega",
      }),
    );

    expect(solicitar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(consolidables.mock.calls.length).toBeGreaterThan(lecturasConsolidables));
    await waitFor(() => expect(solicitados.mock.calls.length).toBeGreaterThan(lecturasSolicitados));
    // Lo que ve el usuario: el consolidado ya no está en «A consolidar».
    await waitFor(() =>
      expect(screen.getByText("No hay cierres del día aprobados para consolidar.")).toBeTruthy(),
    );
  });
});

describe("ConsolidacionBodegaModule — la cola de la satélite (SLT-106)", () => {
  beforeEach(() => {
    consolidables.mockReset();
    solicitados.mockReset();
    solicitar.mockReset();
    refresh.mockReset();
    push.mockReset();
    toastOk.mockReset();
    consolidables.mockImplementation(async () => pagina([CONSOLIDABLE]));
    solicitados.mockImplementation(async () => pagina([]));
  });

  it("R205: tras `ok`, toast, diálogo cerrado y ruta refrescada", async () => {
    solicitar.mockResolvedValue({ status: "ok", cierreBodegaId: "b-1", totales: TOTALES });
    montar();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Solicitar cierre de bodega" }));
    await usuario.click(
      within(screen.getByRole("dialog", { name: "Solicitar cierre de bodega" })).getByRole("button", {
        name: "Solicitar cierre de bodega",
      }),
    );
    await waitFor(() =>
      expect(toastOk).toHaveBeenCalledWith("Cierre de bodega solicitado correctamente."),
    );
    expect(refresh).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Solicitar cierre de bodega" })).toBeNull(),
    );
  });

  it("R48/R207: el diálogo resume las cuatro cifras de las tarjetas, y título y descripción de hoy", async () => {
    montar({
      totalPagoMensajeroAgregado: "1500.00",
      totalIngresoBodegaRechazosAgregado: "250.00",
      paraLaCentralAgregado: "7250.00",
    });
    // Las tarjetas, antes de abrir (el diálogo deja el resto de la página fuera del árbol accesible).
    const tarjetas = screen.getByRole("group", { name: "Cifras a consolidar" });
    expect(within(tarjetas).getByRole("group", { name: "Gana la bodega satélite" })).toHaveTextContent(
      "₡250",
    );
    expect(within(tarjetas).getByRole("group", { name: "Debe llegar a la central" })).toHaveTextContent(
      "₡7.250",
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Solicitar cierre de bodega" }));
    const dialogo = screen.getByRole("dialog", { name: "Solicitar cierre de bodega" });
    expect(dialogo).toHaveAccessibleDescription(
      "Se consolidarán todos los cierres del día aprobados de tu zona en una solicitud a la bodega central. Esta acción no se puede deshacer.",
    );
    const resumen = within(dialogo).getByLabelText("Resumen del cierre de bodega a solicitar");
    expect(resumen.tagName).toBe("DL");
    const pares = Array.from(resumen.querySelectorAll("dt")).map((dt) => [
      dt.textContent,
      dt.nextElementSibling?.textContent,
    ]);
    expect(pares).toEqual([
      ["Recaudado", "₡9.000"],
      ["Pago a mensajeros", "₡1.500"],
      ["Gana la bodega satélite", "₡250"],
      ["Debe llegar a la central", "₡7.250"],
    ]);
    expect(
      within(dialogo).getByRole("button", { name: "Solicitar cierre de bodega" }),
    ).toBeInTheDocument();
  });

  it("R46/R47: bloqueada, el aviso nombra al mensajero y el botón está deshabilitado", () => {
    const motivo =
      "Todavía no puedes consolidar: Carla Mensajera tiene un cierre sin resolver. Apruébalo o recházalo primero.";
    montar({ puedesSolicitar: false, motivoBloqueo: motivo, bloqueo: "sin_resolver" });
    expect(screen.getByText(motivo)).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Solicitar cierre de bodega" })).toBeDisabled();
    expect(
      screen.getByText("Se habilita cuando no quede ningún cierre de mensajero por resolver."),
    ).toBeInTheDocument();
  });

  it("R190/R203: la cola con su descripción, pestañas con conteo y la región de la tabla", () => {
    montar({ cierresBodegaPasados: { items: [], total: 8, pageSize: 10 } });
    expect(
      screen.getByText(
        "Bodega satélite · Limón. Junta los cierres aprobados de tus mensajeros y envíalos a la central.",
      ),
    ).toBeInTheDocument();
    const lista = screen.getByRole("tablist", { name: "Cierre de bodega por etapa" });
    expect(within(lista).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "A consolidar 1",
      "Solicitados 8",
    ]);
    expect(screen.getByRole("region", { name: "Cierres del día a consolidar" })).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Paginación de los cierres del día a consolidar" }),
    ).toBeInTheDocument();
  });

  it("R193: «Ver su cierre» navega al enlace del detalle del cierre del día", async () => {
    montar();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Ver el cierre de Mensajero Uno" }));
    expect(push).toHaveBeenCalledWith("/cierres-admin?cierre=cd-1");
  });

  it("R201: «Solicitados» pinta la lista de hoy, sin tarjetas ni botón", async () => {
    montar();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Solicitados 0" }));
    expect(screen.getByRole("region", { name: "Cierres de bodega solicitados" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Cifras a consolidar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Solicitar cierre de bodega" })).toBeNull();
  });

  it("R202: sin zona, el aviso de hoy y la lista de solicitados, sin cola, tarjetas ni botón", () => {
    montar({ sinZona: true, puedesSolicitar: false, bloqueo: "sin_zona" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No tenés una zona asignada; contactá a tu administrador.",
    );
    expect(screen.getByRole("region", { name: "Cierres de bodega solicitados" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("group", { name: "Cifras a consolidar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Solicitar cierre de bodega" })).toBeNull();
  });

  it("R204: ya no pinta los totales sueltos, «Central debe» ni los comprobantes", () => {
    montar({ totalCentralDebeAgregado: "500.00" });
    expect(screen.queryByRole("region", { name: "Totales a consolidar" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Solicitar cierre de bodega" })).toBeNull();
    expect(screen.queryByText(/Comprobante del cierre de/)).toBeNull();
    expect(screen.queryByText(/\bCentral debe\b/)).toBeNull();
    // Lo que la sustituye: la tarjeta «La central debe» (R196).
    expect(screen.getByRole("group", { name: "La central debe" })).toHaveTextContent("₡500");
  });
});
