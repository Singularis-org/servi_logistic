// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// SLT-101 «Fila de gestión única y lista con filtros» (T3.4) — la lista de gestiones del cierre:
// filtros con la barra de la app (sin buscador, pastillas con conteo), «Descargar» en la misma fila,
// estado vacío con texto y filtrar SIN tocar la URL. Los esperados van escritos a mano.

const replaceMock = vi.fn();
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock, refresh: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams("cierre=aaaaaaaa&estado=solicitado"),
}));

import { GestionesCierre } from "@/components/private/cierres/fila/GestionesCierre";
import { gestionesEnOrden, type AudienciaFila } from "@/components/private/cierres/fila/fila-gestion-vista";
import type { CierreGrupos } from "@/lib/interfaces/services/ICierreDiaService";
import { CONGELADO_AT, gestionCanvas, gestionFila } from "@/tests/fixtures/gestion-cierre-fila";

const GRUPOS: CierreGrupos = {
  entregado: [gestionFila({ gestionId: "e1", numGuia: 1002, numRemision: "REM-002", destinatario: "Carla Mora" }), gestionCanvas()],
  reprogramado: [],
  novedad: [],
  devolucion_a_origen_por_rechazo: [
    gestionFila({
      gestionId: "d1",
      numGuia: 1011,
      numRemision: "REM-011",
      destinatario: "Andrés Mora",
      resultado: "devolucion_a_origen_por_rechazo",
      montoRecibido: null,
      pagos: [],
    }),
  ],
  incidente: [
    gestionFila({
      gestionId: "i1",
      numGuia: 5001,
      numRemision: "REM-501",
      destinatario: "Eva Ruiz",
      resultado: "incidente",
      causaIncidente: "danado",
      montoRecibido: null,
      pagos: [],
    }),
  ],
};

beforeEach(() => {
  replaceMock.mockClear();
  pushMock.mockClear();
});
afterEach(cleanup);

function montar(opciones: { audiencia?: AudienciaFila; columnaMensajero?: boolean; grupos?: CierreGrupos } = {}) {
  render(
    <GestionesCierre
      gestiones={gestionesEnOrden(opciones.grupos ?? GRUPOS).map((gestion) => ({ gestion, mensajeroNombre: "Ana Mensajera" }))}
      audiencia={opciones.audiencia ?? "central"}
      quienMiraEsCentral
      congeladoAt={CONGELADO_AT}
      acciones={{}}
      descargar={<button type="button">Descargar Gestiones del cierre C0FFEE01</button>}
      columnaMensajero={opciones.columnaMensajero}
    />,
  );
  return userEvent.setup();
}

/** Las guías de las filas visibles, en orden. */
function guias(): string[] {
  const region = screen.getByRole("region", { name: "Órdenes del cierre" });
  return Array.from(region.querySelectorAll("[data-gestion]")).map(
    (f) => f.querySelector(".font-mono")?.textContent ?? "",
  );
}

function pulsado(): string[] {
  const grupo = screen.getByRole("group", { name: "Filtrar por resultado" });
  return within(grupo)
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent ?? "");
}

describe("R84, R89 — filtros por resultado con la barra de la app", () => {
  it("sin campo de búsqueda; el grupo con sus 7 opciones y «Todas 4» activa al abrir", () => {
    montar();
    expect(screen.queryByRole("searchbox")).toBeNull();
    const grupo = screen.getByRole("group", { name: "Filtrar por resultado" });
    expect(within(grupo).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Todas 4",
      "Entregado 2",
      "Reprogramado 0",
      "Novedad 0",
      "Devolución a origen por rechazo 1",
      "Incidente 1",
      "Con señales 3",
    ]);
    expect(pulsado()).toEqual(["Todas 4"]);
    // «Todas» por resultado (S3-5) y, dentro, en el orden del servidor.
    expect(guias()).toEqual(["1002", "1001", "1011", "5001"]);
  });

  it("«Entregado 2» y «Con señales 3» filtran; «Todas 4» vuelve a todas", async () => {
    const user = montar();
    await user.click(screen.getByRole("button", { name: "Entregado 2" }));
    expect(pulsado()).toEqual(["Entregado 2"]);
    expect(guias()).toEqual(["1002", "1001"]);
    await user.click(screen.getByRole("button", { name: "Con señales 3" }));
    expect(guias()).toEqual(["1001", "1011", "5001"]);
    await user.click(screen.getByRole("button", { name: "Todas 4" }));
    expect(guias()).toEqual(["1002", "1001", "1011", "5001"]);
  });

  it("un filtro sin gestiones muestra un estado vacío con texto", async () => {
    const user = montar();
    await user.click(screen.getByRole("button", { name: "Reprogramado 0" }));
    expect(screen.getByRole("status")).toHaveTextContent("No hay gestiones con resultado «Reprogramado».");
    expect(guias()).toEqual([]);
  });

  it("filtrar NO navega ni toca la URL de /cierres-admin", async () => {
    const user = montar();
    await user.click(screen.getByRole("button", { name: "Entregado 2" }));
    await user.click(screen.getByRole("button", { name: "Con señales 3" }));
    expect(replaceMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("«Con señales» cuenta por audiencia: el mensajero no ve el ajuste", () => {
    montar({ audiencia: "mensajero" });
    expect(screen.getByRole("button", { name: "Con señales 2" })).toBeInTheDocument();
  });
});

describe("R90, R23 — «Descargar» en la misma fila y columnas", () => {
  it("«Descargar» va en la fila de los filtros, a la derecha", () => {
    montar();
    const grupo = screen.getByRole("group", { name: "Filtrar por resultado" });
    const descargar = screen.getByRole("button", { name: "Descargar Gestiones del cierre C0FFEE01" });
    const fila = descargar.parentElement?.parentElement as HTMLElement;
    expect(fila.contains(grupo)).toBe(true);
    expect(fila.lastElementChild?.contains(descargar)).toBe(true);
  });

  it("cabecera de la central sin «Mensajero»; con `columnaMensajero`, tras «Destinatario · tienda»", () => {
    montar();
    const region = screen.getByRole("region", { name: "Órdenes del cierre" });
    const cabecera = () => Array.from((region.firstElementChild as HTMLElement).children).map((c) => c.textContent);
    expect(cabecera()).toEqual([
      "Guía",
      "Destinatario · tienda",
      "Resultado",
      "Recibido",
      "Cobro a la tienda",
      "Pago al mensajero",
      "Señales",
      "",
    ]);
    cleanup();
    montar({ audiencia: "solo lectura", columnaMensajero: true });
    const region2 = screen.getByRole("region", { name: "Órdenes del cierre" });
    expect(Array.from((region2.firstElementChild as HTMLElement).children).map((c) => c.textContent)).toEqual([
      "Guía",
      "Destinatario · tienda",
      "Mensajero",
      "Resultado",
      "Recibido",
      "Cobro a la tienda",
      "Pago al mensajero",
      "Señales",
      "",
    ]);
    expect(screen.getAllByText("Ana Mensajera")).toHaveLength(4);
  });
});
