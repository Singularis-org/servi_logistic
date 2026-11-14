// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// SLT-165 «PWA del mensajero: Cierre del día en tarjetas» (D2; R526, R527, R538) — la pestaña
// «Gestiones» en el teléfono: barra fija con buscador («Guía, remisión o nombre»), el resultado como
// filtro de «Filtros», «Descargar» a la derecha y la lista de 25 en 25 con `Pagination`. En escritorio,
// lo de hoy. `useIsMobile` se simula: el corte de 768 px no existe en jsdom. Los esperados, a mano.

const movil = vi.hoisted(() => ({ valor: true }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => movil.valor }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/cierre-dia",
  useSearchParams: () => new URLSearchParams(),
}));

import { GestionesCierre } from "@/components/private/cierres/fila/GestionesCierre";
import type { CierreDetalleGestion } from "@/lib/interfaces/services/ICierreDiaService";
import { gestionFila } from "@/tests/fixtures/gestion-cierre-fila";

afterEach(() => {
  cleanup();
  movil.valor = true;
});

/** 30 gestiones: 26 entregadas (guías 2001-2026) y 4 incidentes (guías 3001-3004). */
function treinta(): CierreDetalleGestion[] {
  const entregadas = Array.from({ length: 26 }, (_, i) =>
    gestionFila({
      gestionId: `e${i + 1}`,
      numGuia: 2001 + i,
      numRemision: `REM-${100 + i}`,
      destinatario: i === 0 ? "José Ángel Pérez" : `Destinatario ${i + 1}`,
    }),
  );
  const incidentes = Array.from({ length: 4 }, (_, i) =>
    gestionFila({
      gestionId: `i${i + 1}`,
      numGuia: 3001 + i,
      numRemision: `REM-9${i}`,
      destinatario: `Incidente ${i + 1}`,
      resultado: "incidente",
      montoRecibido: null,
      pagos: [],
    }),
  );
  return [...entregadas, ...incidentes];
}

const DESCARGAR = <button type="button">Descargar Gestiones de hoy</button>;

function montar(gestiones: CierreDetalleGestion[] = treinta()) {
  render(
    <GestionesCierre
      gestiones={gestiones.map((gestion) => ({ gestion }))}
      audiencia="mensajero"
      quienMiraEsCentral={false}
      congeladoAt={null}
      acciones={{}}
      descargar={DESCARGAR}
    />,
  );
  return userEvent.setup();
}

/** Las guías de las tarjetas visibles, en orden. */
function guias(): string[] {
  const region = screen.getByRole("region", { name: "Órdenes del cierre" });
  return Array.from(region.querySelectorAll('[data-gestion] [data-columna="guia"]')).map((c) => c.textContent ?? "");
}

const paginacion = () => screen.queryByRole("navigation", { name: "Páginas de las gestiones" });

async function buscarTexto(user: ReturnType<typeof userEvent.setup>, texto: string) {
  const campo = screen.getByRole("searchbox", { name: "Buscar gestión" });
  await user.clear(campo);
  if (texto) await user.type(campo, texto);
}

describe("SLT-165 R526 — de 25 en 25 en el teléfono", () => {
  it("30 gestiones: 25 en la página 1 y las 5 restantes en la 2, con `Pagination`", async () => {
    const user = montar();
    expect(guias()).toHaveLength(25);
    expect(guias()[0]).toBe("2001");
    expect(guias()[24]).toBe("2025");
    const nav = paginacion();
    expect(nav).not.toBeNull();
    expect(within(nav!).getByText("1-25 de 30")).toBeInTheDocument();
    await user.click(within(nav!).getByRole("button", { name: "Página siguiente" }));
    expect(guias()).toEqual(["2026", "3001", "3002", "3003", "3004"]);
    expect(within(paginacion()!).getByText("26-30 de 30")).toBeInTheDocument();
  });

  it("con 25 o menos no hay paginación", () => {
    montar(treinta().slice(0, 25));
    expect(guias()).toHaveLength(25);
    expect(paginacion()).toBeNull();
  });

  it("cambiar el término vuelve a la página 1", async () => {
    const user = montar();
    await user.click(within(paginacion()!).getByRole("button", { name: "Página siguiente" }));
    expect(guias()[0]).toBe("2026");
    // «REM-1» casa con REM-100…REM-125 (26): sigue habiendo dos páginas, y se vuelve a la primera.
    await buscarTexto(user, "REM-1");
    await waitFor(() => expect(guias()[0]).toBe("2001"));
    expect(guias()).toHaveLength(25);
    expect(within(paginacion()!).getByText("1-25 de 26")).toBeInTheDocument();
  });

  it("cambiar el resultado vuelve a la página 1", async () => {
    const user = montar();
    await user.click(within(paginacion()!).getByRole("button", { name: "Página siguiente" }));
    expect(guias()[0]).toBe("2026");
    await user.click(screen.getByRole("button", { name: /^Filtros/ }));
    await user.click(await screen.findByRole("option", { name: "Resultado" }));
    await user.click(screen.getByRole("button", { name: "Entregado (26)" }));
    expect(guias()[0]).toBe("2001");
    expect(guias()).toHaveLength(25);
  });
});

describe("SLT-165 R527 — barra fija con buscador, «Filtros» y «Descargar»", () => {
  it("fija arriba, con el placeholder «Guía, remisión o nombre» y «Descargar» dentro de la barra", () => {
    montar();
    const campo = screen.getByRole("searchbox", { name: "Buscar gestión" });
    expect(campo).toHaveAttribute("placeholder", "Guía, remisión o nombre");
    const barra = campo.closest(".sticky");
    expect(barra, "la barra no es fija").not.toBeNull();
    expect(barra!.classList.contains("top-0")).toBe(true);
    expect(within(barra as HTMLElement).getByRole("button", { name: "Descargar Gestiones de hoy" })).toBeInTheDocument();
    // R495: un único `BuscadorFiltros` en la lista: un solo campo de búsqueda.
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
  });

  it("busca por guía, por remisión y por destinatario (sin acentos ni mayúsculas)", async () => {
    const user = montar();
    await buscarTexto(user, "3002");
    await waitFor(() => expect(guias()).toEqual(["3002"]));
    await buscarTexto(user, "REM-91");
    await waitFor(() => expect(guias()).toEqual(["3002"]));
    await buscarTexto(user, "jose angel");
    await waitFor(() => expect(guias()).toEqual(["2001"]));
    await buscarTexto(user, "no existe");
    await waitFor(() =>
      expect(within(screen.getByRole("region", { name: "Órdenes del cierre" })).getByRole("status")).toHaveTextContent(
        "Ninguna gestión coincide con la búsqueda.",
      ),
    );
  });

  it("el resultado va en «Filtros ({n})» como pastillas con su conteo, en AND con el término; «Limpiar todo» lo quita", async () => {
    const user = montar();
    expect(screen.queryByRole("group", { name: "Filtrar por resultado" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Filtros/ }));
    await user.click(await screen.findByRole("option", { name: "Resultado" }));
    expect(screen.getByRole("button", { name: /^Filtros \(1\)/ })).toBeInTheDocument();
    // R493 (B2 de la review): las pastillas miden 44 px de alto en el teléfono (envoltorio de D).
    const grupoPastillas = screen.getByRole("group", { name: "Filtrar por resultado" });
    expect(grupoPastillas.closest(".max-w-full")?.className.split(/\s+/)).toContain("max-md:[&_button]:min-h-11");
    await user.click(screen.getByRole("button", { name: "Incidente (4)" }));
    expect(guias()).toEqual(["3001", "3002", "3003", "3004"]);
    await buscarTexto(user, "Incidente 3");
    await waitFor(() => expect(guias()).toEqual(["3003"]));
    await user.click(screen.getByRole("button", { name: "Limpiar todo" }));
    // La primera página de todas otra vez: de la 2001 a la 2025 (ancla de contenido, no solo el conteo).
    await waitFor(() => expect([guias()[0], guias()[24], guias().length]).toEqual(["2001", "2025", 25]));
    expect(screen.queryByRole("group", { name: "Filtrar por resultado" })).toBeNull();
  });
});

describe("SLT-165 R524, R538 — en escritorio, lo de hoy", () => {
  it("sin buscador ni paginación, las 30 filas y las pastillas a la vista; «Descargar» el mismo", () => {
    movil.valor = false;
    montar();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(paginacion()).toBeNull();
    expect(guias()).toHaveLength(30);
    expect(screen.getByRole("group", { name: "Filtrar por resultado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar Gestiones de hoy" })).toBeInTheDocument();
  });
});
