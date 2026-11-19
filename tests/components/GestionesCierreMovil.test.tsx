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

describe("SLT-209 — el campo de la barra fija tiene su propia línea en el teléfono", () => {
  it("el contenedor del campo lleva `max-md:basis-full`: «Filtros» y «Descargar» bajan a la siguiente", () => {
    montar();
    const campo = screen.getByRole("searchbox", { name: "Buscar gestión" });
    const contenedor = campo.closest(".relative.flex");
    expect(contenedor, "sin el contenedor del campo").not.toBeNull();
    expect(contenedor!.className.split(/\s+/)).toContain("max-md:basis-full");
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

// SLT-191 «Cierre del día del mensajero según el canvas» (R810-R814; DS1-DS4) — la tarjeta de la
// gestión del propio mensajero en el teléfono, como `GestionesVolumen` del canvas. Las clases y los
// textos van escritos a mano: son el contrato de la tarjeta.
describe("SLT-191 R810-R814 — la tarjeta del mensajero en el teléfono", () => {
  const G = gestionFila({
    gestionId: "t1",
    numGuia: 14974806,
    numRemision: "REM-777",
    destinatario: "María Fernanda Rodríguez Villalobos de la Cruz",
    tiendaNombre: "Distribuidora Comercial El Buen Precio del Norte S.A.",
    pagoMensajero: "1500.00",
  });

  function montarUna(
    g: CierreDetalleGestion,
    opciones: { audiencia?: "mensajero" | "central"; devolver?: (g: CierreDetalleGestion) => void } = {},
  ) {
    render(
      <GestionesCierre
        gestiones={[{ gestion: g }]}
        audiencia={opciones.audiencia ?? "mensajero"}
        quienMiraEsCentral={opciones.audiencia === "central"}
        congeladoAt={null}
        acciones={{ devolver: opciones.devolver ?? vi.fn() }}
        descargar={DESCARGAR}
      />,
    );
    return userEvent.setup();
  }

  const tarjeta = () => {
    const el = document.querySelector<HTMLElement>("[data-gestion] [data-tarjeta-mensajero]");
    if (!el) throw new Error("sin tarjeta del mensajero");
    return el;
  };
  const DISPARADOR = "Detalle de la orden REM-777 · María Fernanda Rodríguez Villalobos de la Cruz";
  const DEVOLVER = "Devolver a gestión la orden REM-777 · María Fernanda Rodríguez Villalobos de la Cruz";

  it("R810: a la izquierda guía (mono) → destinatario → tienda, cada uno en su línea; a la derecha resultado, «Ganancia» y monto", () => {
    montarUna(G);
    const t = tarjeta();
    const [izquierda, derecha] = Array.from(t.children).filter((c) => c.tagName === "DIV");
    expect(Array.from(izquierda.children).map((c) => c.getAttribute("data-columna"))).toEqual(["guia", "destinatario", "tienda"]);
    expect(Array.from(izquierda.children).map((c) => c.textContent)).toEqual([
      "14974806",
      "María Fernanda Rodríguez Villalobos de la Cruz",
      "Distribuidora Comercial El Buen Precio del Norte S.A.",
    ]);
    expect(izquierda.className.split(/\s+/)).toContain("flex-col");
    expect(izquierda.querySelector('[data-columna="guia"] > span')?.className.split(/\s+/)).toContain("font-mono");
    // Enteros (R490): el texto envuelve, no se recorta.
    expect(izquierda.querySelector('[data-columna="tienda"] > span')?.className.split(/\s+/)).toContain("whitespace-normal");
    expect(derecha.textContent).toBe("EntregadoGanancia₡1.500");
    expect(within(derecha as HTMLElement).getByRole("button", { name: "Qué significa «Entregado»" })).toBeInTheDocument();
    expect(t.className.split(/\s+/)).toContain("grid-cols-[minmax(0,1fr)_max-content]");
  });

  it("R810: sin guía «—» y sin ganancia «—», nunca ₡0 (R86)", () => {
    montarUna(gestionFila({ gestionId: "t2", numGuia: null, pagoMensajero: null }));
    const t = tarjeta();
    expect(t.querySelector('[data-columna="guia"]')?.textContent).toBe("—");
    expect(t.querySelector('[data-columna="ganancia"]')?.textContent).toBe("—");
  });

  it("R811: plegada NO muestra «Devolver a gestión»; al desplegar va al pie del desplegado y abre el mismo callback", async () => {
    const devolver = vi.fn();
    const user = montarUna(G, { devolver });
    expect(screen.queryByRole("button", { name: DEVOLVER })).toBeNull();
    await user.click(screen.getByRole("button", { name: DISPARADOR }));
    const boton = screen.getByRole("button", { name: DEVOLVER });
    expect(tarjeta().contains(boton)).toBe(false);
    expect(boton.className.split(/\s+/)).toContain("max-md:min-h-11");
    await user.click(boton);
    expect(devolver).toHaveBeenCalledWith(G);
  });

  it("R811 (R244): desde la ayuda de la tienda, deshabilitado con su motivo en el desplegado", async () => {
    const user = montarUna({ ...G, desdeAyudaTienda: true });
    await user.click(screen.getByRole("button", { name: DISPARADOR }));
    const boton = screen.getByRole("button", { name: /^Devolver a gestión la orden REM-777 .* — no disponible: / });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute("title");
  });

  it("R812: el disparador es un botón con `aria-expanded`, el nombre de hoy, estirado sobre toda la tarjeta y de 44 px", async () => {
    const user = montarUna(G);
    const disparador = screen.getByRole("button", { name: DISPARADOR });
    expect(disparador).toHaveAttribute("aria-expanded", "false");
    expect(disparador.parentElement).toBe(tarjeta());
    const clases = disparador.className.split(/\s+/);
    for (const c of ["absolute", "inset-0", "min-h-11", "w-full"]) expect(clases, c).toContain(c);
    expect(tarjeta().className.split(/\s+/)).toContain("relative");
    // El contenido no captura el toque: cae en el disparador.
    for (const bloque of Array.from(tarjeta().children).filter((c) => c !== disparador)) {
      expect(bloque.className.split(/\s+/), bloque.tagName).toContain("pointer-events-none");
    }
    await user.click(disparador);
    expect(disparador).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Orden")).toBeInTheDocument();
    await user.click(disparador);
    expect(disparador).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Orden")).toBeNull();
  });

  // Fallo del E2E en el PR #196: jsdom no hace hit-testing, así que el orden de apilado se fija por sus
  // clases. En el navegador, el punto de un texto de la tarjeta lo recibe el disparador porque está
  // ENCIMA (`z-10`) y el contenido no capta (`pointer-events-none`); solo la información, más arriba.
  it("R812, R813: orden de apilado — disparador encima del contenido, la información encima del disparador, la tarjeta aislada", () => {
    montarUna(G);
    const t = tarjeta();
    expect(t.className.split(/\s+/)).toEqual(expect.arrayContaining(["relative", "isolate"]));
    const disparador = screen.getByRole("button", { name: DISPARADOR });
    expect(disparador.className.split(/\s+/)).toEqual(expect.arrayContaining(["absolute", "inset-0", "z-10"]));
    const info = screen.getByRole("button", { name: "Qué significa «Entregado»" }).closest<HTMLElement>('[data-columna="resultado"]')!;
    expect(info.className.split(/\s+/)).toEqual(expect.arrayContaining(["relative", "z-20", "[&_button]:pointer-events-auto"]));
    // Ningún otro bloque de la tarjeta sube por encima del disparador.
    for (const el of Array.from(t.querySelectorAll<HTMLElement>("*"))) {
      if (el === disparador || el === info) continue;
      expect(el.className.toString().split(/\s+/).some((c) => /^z-/.test(c)), el.outerHTML.slice(0, 80)).toBe(false);
    }
  });

  it("R813: la información del resultado capta su toque y no despliega; ningún botón dentro de otro", async () => {
    const user = montarUna(G);
    const info = screen.getByRole("button", { name: "Qué significa «Entregado»" });
    expect(info.closest('[data-columna="resultado"]')?.className.split(/\s+/)).toContain("[&_button]:pointer-events-auto");
    await user.click(info);
    expect(screen.getByRole("button", { name: DISPARADOR })).toHaveAttribute("aria-expanded", "false");
    for (const b of Array.from(document.querySelectorAll("button"))) {
      expect(b.parentElement?.closest("button"), b.getAttribute("aria-label") ?? b.textContent ?? "").toBeNull();
    }
  });

  it("R814: en escritorio, la fila de hoy: sin tarjeta, «Devolver a gestión» y el chevron en la fila", () => {
    movil.valor = false;
    montarUna(G);
    expect(document.querySelector("[data-tarjeta-mensajero]")).toBeNull();
    const fila = document.querySelector<HTMLElement>("[data-gestion]")!;
    expect(within(fila).getByRole("button", { name: DEVOLVER })).toBeInTheDocument();
    expect(within(fila).getByRole("button", { name: DISPARADOR }).className.split(/\s+/)).toContain("size-8");
  });

  it("R814: la administración en el teléfono, la tarjeta de hoy (R523) sin la del mensajero", () => {
    montarUna(G, { audiencia: "central" });
    expect(document.querySelector("[data-tarjeta-mensajero]")).toBeNull();
    const rejilla = document.querySelector<HTMLElement>("[data-gestion]")?.firstElementChild as HTMLElement;
    expect(rejilla.className.split(/\s+/)).toContain("max-md:grid-cols-[max-content_minmax(0,1fr)_max-content]");
    expect(within(rejilla).getByRole("button", { name: DISPARADOR }).className.split(/\s+/)).toContain("size-8");
  });
});
