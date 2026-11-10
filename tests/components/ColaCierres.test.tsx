// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ColaCierres,
  type AccionesCola,
  type ColaCierresProps,
} from "@/components/private/cierres/cola/ColaCierres";
import type { PestanaCola, RolCola } from "@/components/private/cierres/cola/cola-cierres-vista";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";

// SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (T3.2) — la cola montada con dobles.
// Los esperados van escritos a mano: los textos del canvas (`ColaCierres.dc.html`, rama mensajero)
// pasados por el formateador compartido (`money()`, que omite «,00») y los nombres de hoy (R104, R105).

afterEach(cleanup);

function cierre(over: Partial<CierreAdminResumen> & { cierreId: string }): CierreAdminResumen {
  return {
    mensajeroId: `m-${over.cierreId}`,
    mensajeroNombre: "Ana Mensajera",
    estado: "solicitado",
    destinoTipo: "bodega_central",
    destinoZonaId: "z1",
    destinoZonaNombre: "GAM",
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    totalPagoMensajero: "0.00",
    totalIngresoBodegaRechazos: "0.00",
    pendientePagoMensajero: null,
    solicitadoAt: "2026-11-08T00:42:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
    ...over,
  };
}

const PENDIENTES: CierreAdminResumen[] = [
  cierre({
    cierreId: "0f3c9a2e-1b44-4d0a-9e77-5b2c8f2a11c4",
    mensajeroNombre: "Diego Mensajero",
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "285275.00" },
    totalPagoMensajero: "45000.55",
    senalesCola: { incidentesSinIndemnizar: 1, pagosAjustados: 0, vuelvenABodega: 6 },
  }),
  cierre({
    cierreId: "aa11bb22-0000-4000-8000-00071d0e3f2f",
    mensajeroNombre: "Fabio Mensajero",
    estado: "vencido",
    bloqueoMensajero: { bloqueado: true, cierresAbiertos: 1, cierresPorReenviar: 0 },
  }),
];

const RESUELTOS: CierreAdminResumen[] = [
  cierre({
    cierreId: "cc33dd44-0000-4000-8000-00005e11a0b3",
    mensajeroNombre: "Diego Mensajero",
    estado: "aprobado",
    resueltoAt: "2026-11-07T01:30:00.000Z",
    pendientePagoMensajero: "47500.00",
  }),
  cierre({
    cierreId: "ee55ff66-0000-4000-8000-00009a0c5512",
    mensajeroNombre: "Fabio Mensajero",
    estado: "aprobado",
    resueltoAt: "2026-11-07T01:12:00.000Z",
    pendientePagoMensajero: "0.00",
  }),
  cierre({
    cierreId: "1a2b3c4d-0000-4000-8000-0000b40c7d21",
    mensajeroNombre: "Elena Mensajera",
    estado: "rechazado",
    resueltoAt: "2026-11-07T01:44:00.000Z",
  }),
];

function acciones(conPago: boolean): AccionesCola {
  return {
    abrir: vi.fn(),
    destrabar: vi.fn(),
    ...(conPago ? { registrarPago: vi.fn() } : {}),
  };
}

function props(over: Partial<ColaCierresProps> = {}): ColaCierresProps {
  const pestana = over.pestanaActiva ?? "pendientes";
  return {
    tipo: "mensajero",
    rol: "central",
    descripcion: "Bodega central. Revisa el cierre de cada mensajero y apruébalo o recházalo.",
    pestanas: [
      { id: "pendientes", label: "Pendientes", conteo: 37 },
      { id: "resueltos", label: "Resueltos", conteo: 12 },
    ],
    pestanaActiva: pestana,
    onPestana: vi.fn(),
    barra: <input aria-label="Buscar" />,
    descargar: <button type="button">Descargar</button>,
    filas: pestana === "pendientes" ? PENDIENTES : RESUELTOS,
    cargando: false,
    error: null,
    vacio: pestana === "pendientes" ? "No hay cierres pendientes de decisión." : "Aún no hay cierres resueltos.",
    region: pestana === "pendientes" ? "Pendientes de decisión" : "Histórico",
    acciones: acciones(true),
    pie: pestana === "pendientes" ? "Un cierre vencido se puede destrabar como excepción." : undefined,
    paginacion: <nav aria-label="Paginación doble" />,
    ...over,
  };
}

/** Texto de cada celda de la fila de un mensajero, en orden. */
function celdas(region: HTMLElement, mensajero: string): string[] {
  const fila = within(region)
    .getAllByRole("row")
    .find((r) => within(r).queryByText(mensajero) !== null);
  if (!fila) throw new Error(`sin fila de ${mensajero}`);
  return within(fila)
    .getAllByRole("cell")
    .map((c) => c.textContent ?? "");
}

function filaDe(region: HTMLElement, mensajero: string): HTMLElement {
  const fila = within(region)
    .getAllByRole("row")
    .find((r) => within(r).queryByText(mensajero) !== null);
  if (!fila) throw new Error(`sin fila de ${mensajero}`);
  return fila;
}

describe("ColaCierres — pestañas y barra (R99, R100)", () => {
  it("un tablist «Cierres del día por estado» con «Pendientes 37» / «Resueltos 12»", () => {
    render(<ColaCierres {...props()} />);
    const lista = screen.getByRole("tablist", { name: "Cierres del día por estado" });
    const tabs = within(lista).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Pendientes 37", "Resueltos 12"]);
    expect(within(lista).getByRole("tab", { name: "Pendientes 37" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("cambiar de pestaña llama a `onPestana` y no desmonta la barra (conserva su estado)", async () => {
    const onPestana = vi.fn();
    function BarraConEstado() {
      const [v, setV] = useState("");
      return <input aria-label="Buscar" value={v} onChange={(e) => setV(e.target.value)} />;
    }
    function Montaje() {
      const [pestana, setPestana] = useState<PestanaCola>("pendientes");
      return (
        <ColaCierres
          {...props({ pestanaActiva: pestana })}
          barra={<BarraConEstado />}
          onPestana={(id) => {
            onPestana(id);
            setPestana(id);
          }}
        />
      );
    }
    render(<Montaje />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Buscar" }), "Diego");

    await user.click(screen.getByRole("tab", { name: "Resueltos 12" }));

    expect(onPestana).toHaveBeenCalledWith("resueltos");
    expect(screen.getByRole("region", { name: "Histórico" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Pendientes de decisión" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Buscar" })).toHaveValue("Diego");
  });

  it("la descarga y la paginación que llegan por props se pintan", () => {
    render(<ColaCierres {...props()} />);
    expect(screen.getByRole("button", { name: "Descargar" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Paginación doble" })).toBeInTheDocument();
  });
});

describe("ColaCierres — fila (R101, R102, R33)", () => {
  it("central · Pendientes: columnas y celdas en el orden del canvas", () => {
    render(<ColaCierres {...props()} />);
    const region = screen.getByRole("region", { name: "Pendientes de decisión" });
    const tabla = within(region).getByRole("table", { name: "Pendientes de decisión" });
    expect(within(tabla).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Folio",
      "Mensajero",
      "Solicitado",
      "Estado",
      "Recaudado",
      "Pago al mensajero",
      "Señales",
      "Acciones",
    ]);
    expect(celdas(region, "Diego Mensajero")).toEqual([
      "#8F2A11C4",
      "Diego Mensajero",
      "2026-11-07 18:42",
      "Solicitado",
      "₡285.275",
      "₡45.000,55",
      "1 incidente sin indemnizar · 6 vuelven a bodega",
      "Ver / decidir",
    ]);
  });

  it("el folio va en letra monoespaciada", () => {
    render(<ColaCierres {...props()} />);
    expect(screen.getByText("#8F2A11C4")).toHaveClass("font-mono");
  });

  it("una señal con nota la conserva como nombre accesible y `title`", () => {
    render(<ColaCierres {...props()} />);
    const region = screen.getByRole("region", { name: "Pendientes de decisión" });
    const nota =
      "Este mensajero arrastra 1 cierre sin aprobar. Mientras tanto no puede entregar, cobrar ni recibir trabajo nuevo. Aprueba el más antiguo para desbloquearlo.";
    const senal = within(filaDe(region, "Fabio Mensajero")).getByLabelText(nota);
    expect(senal).toHaveTextContent("Mensajero bloqueado · 1");
    expect(senal).toHaveAttribute("title", nota);
  });

  it("una fila sin señales deja la celda vacía", () => {
    render(<ColaCierres {...props({ pestanaActiva: "resueltos" })} />);
    const region = screen.getByRole("region", { name: "Histórico" });
    expect(celdas(region, "Fabio Mensajero")[7]).toBe("");
  });
});

describe("ColaCierres — Pago entregado y Registrar pago (R34, R103)", () => {
  it("central · Resueltos: «Pendiente ₡47.500», «Liquidado» y «—»", () => {
    render(<ColaCierres {...props({ pestanaActiva: "resueltos" })} />);
    const region = screen.getByRole("region", { name: "Histórico" });
    expect(within(region).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Folio",
      "Mensajero",
      "Resuelto",
      "Estado",
      "Recaudado",
      "Pago al mensajero",
      "Pago entregado",
      "Señales",
      "Acciones",
    ]);
    expect(celdas(region, "Diego Mensajero")[6]).toBe("Pendiente ₡47.500");
    expect(celdas(region, "Fabio Mensajero")[6]).toBe("Liquidado");
    expect(celdas(region, "Elena Mensajera")[6]).toBe("—");
    expect(celdas(region, "Elena Mensajera")[7]).toBe("Bloqueante hasta re-solicitud");
  });

  it("«Registrar pago» solo en el aprobado con pendiente, y pasa ese cierre y ese pendiente", async () => {
    const a = acciones(true);
    render(<ColaCierres {...props({ pestanaActiva: "resueltos", acciones: a })} />);
    const region = screen.getByRole("region", { name: "Histórico" });
    expect(
      within(region).getAllByRole("button", { name: /^Registrar pago del cierre de / }),
    ).toHaveLength(1);
    await userEvent
      .setup()
      .click(within(region).getByRole("button", { name: "Registrar pago del cierre de Diego Mensajero" }));
    expect(a.registrarPago).toHaveBeenCalledWith(RESUELTOS[0], "47500.00");
  });

  it("satélite: ni «Pago entregado» ni «Registrar pago», aunque le llegara el callback", () => {
    const rol: RolCola = "satelite";
    render(
      <ColaCierres {...props({ rol, pestanaActiva: "resueltos", acciones: acciones(true) })} />,
    );
    const region = screen.getByRole("region", { name: "Histórico" });
    expect(within(region).queryByRole("columnheader", { name: "Pago entregado" })).toBeNull();
    expect(within(region).queryByText("Pendiente ₡47.500")).toBeNull();
    expect(within(region).queryByRole("button", { name: /Registrar pago/ })).toBeNull();
  });
});

describe("ColaCierres — botones de la fila (R105, R36)", () => {
  it("Pendientes: «Ver / decidir» abre; el vencido tiene «Ver» y «Destrabar» con sus nombres de hoy", async () => {
    const a = acciones(true);
    render(<ColaCierres {...props({ acciones: a })} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Ver / decidir" }));
    expect(a.abrir).toHaveBeenCalledWith("0f3c9a2e-1b44-4d0a-9e77-5b2c8f2a11c4");

    const ver = screen.getByRole("button", { name: "Ver el cierre de Fabio Mensajero" });
    expect(ver).toHaveTextContent("Ver");
    await user.click(ver);
    expect(a.abrir).toHaveBeenLastCalledWith("aa11bb22-0000-4000-8000-00071d0e3f2f");

    const destrabar = screen.getByRole("button", {
      name: "Destrabar cierre vencido abandonado de Fabio Mensajero",
    });
    expect(destrabar).toHaveTextContent(/^Destrabar$/);
    await user.click(destrabar);
    expect(a.destrabar).toHaveBeenCalledWith(PENDIENTES[1]);
  });

  it("Resueltos: «Ver» se llama «Ver el cierre resuelto de <mensajero>»", () => {
    render(<ColaCierres {...props({ pestanaActiva: "resueltos" })} />);
    expect(
      screen.getByRole("button", { name: "Ver el cierre resuelto de Elena Mensajera" }),
    ).toHaveTextContent("Ver");
  });
});

describe("ColaCierres — carga, error, vacío, descripción y pie (R104, R106)", () => {
  it("carga: la tabla anuncia «Cargando»", () => {
    render(<ColaCierres {...props({ cargando: true, filas: [] })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
  });

  it("error: el texto de hoy", () => {
    render(
      <ColaCierres {...props({ error: "No se pudieron cargar los cierres pendientes." })} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudieron cargar los cierres pendientes.",
    );
  });

  it("vacío: los textos de hoy en cada pestaña", () => {
    render(<ColaCierres {...props({ filas: [] })} />);
    expect(screen.getByText("No hay cierres pendientes de decisión.")).toBeInTheDocument();
    cleanup();
    render(<ColaCierres {...props({ pestanaActiva: "resueltos", filas: [] })} />);
    expect(screen.getByText("Aún no hay cierres resueltos.")).toBeInTheDocument();
  });

  it("la descripción va encima de las pestañas y el pie de Pendientes debajo de la tabla", () => {
    render(<ColaCierres {...props()} />);
    const descripcion = screen.getByText(
      "Bodega central. Revisa el cierre de cada mensajero y apruébalo o recházalo.",
    );
    const tablist = screen.getByRole("tablist");
    const pie = screen.getByText("Un cierre vencido se puede destrabar como excepción.");
    const tabla = screen.getByRole("table");
    expect(descripcion.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tabla.compareDocumentPosition(pie) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
