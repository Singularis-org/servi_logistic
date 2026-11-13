// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ColaCierres,
  type ColaCierresConsolidarProps,
  type PanelSolicitadosProps,
} from "@/components/private/cierres/cola/ColaCierres";
import {
  tarjetasAConsolidar,
  tarjetasSolicitados,
  type TarjetasAConsolidarEntrada,
} from "@/components/private/cierres/cola/cola-cierres-vista";
import { descripcionColaSatelite } from "@/components/private/cierres/cola/cola-cierres-labels";
import type {
  CierreBodegaResumen,
  CierreConsolidableCola,
} from "@/lib/interfaces/services/ICierreBodegaService";

// SLT-106 «Bodega satélite: A consolidar con la cola única» (T3.1) — `ColaCierres` con `tipo` bodega
// y `rol` satélite, montada con dobles. Los esperados van ESCRITOS A MANO (canvas, rama bodega ·
// satélite, y `requirements.md` R190-R203):
// - importes: lo que `money()` da hoy ("100000.00" → «₡100.000», "3000.00" → «₡3.000», "500.00" →
//   «₡500», "96500.00" → «₡96.500», "-2000.00" → «-₡2.000», "12500.00" → «₡12.500», "0.00" → «₡0»),
//   el mismo formato que copian a mano `ColaCierresBodega.test.tsx` y el detalle;
// - fechas: `fechaHora` en hora de Costa Rica ("2026-11-08T01:10Z" → «2026-11-07 19:10»).
// Ninguno se compara contra la función que lo genera.

afterEach(cleanup);

const ID_ANA = "0f3c9a2e-1b44-4d0a-9e77-5b2c8f2ab7c9";
const ID_BETO = "1a2b3c4d-0000-4000-8000-00000d4e5f60";

function fila(over: Partial<CierreConsolidableCola> & { cierreDiaId: string }): CierreConsolidableCola {
  return {
    mensajeroId: `m-${over.cierreDiaId}`,
    mensajeroNombre: "Ana Mensajera",
    totales: { efectivo: "100000.00", simpe: "0.00", transferencia: "0.00", general: "100000.00" },
    totalPagoMensajero: "3000.00",
    totalIngresoBodegaRechazos: "500.00",
    incluyeModeloNuevo: false,
    paraLaCentral: "96500.00",
    aprobadoAt: "2026-11-08T01:10:00.000Z",
    gestionesAjustadas: 1,
    ...over,
  };
}

const FILAS: CierreConsolidableCola[] = [
  fila({ cierreDiaId: ID_ANA }),
  // Nada recaudado y un pago: «A la central» negativo, con su signo. Sin fecha ni ajustes.
  fila({
    cierreDiaId: ID_BETO,
    mensajeroNombre: "Beto Mensajero",
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    totalPagoMensajero: "2000.00",
    totalIngresoBodegaRechazos: "0.00",
    paraLaCentral: "-2000.00",
    aprobadoAt: null,
    gestionesAjustadas: 0,
  }),
];

const ENTRADA_TARJETAS: TarjetasAConsolidarEntrada = {
  totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
  pagoMensajeros: "3000.00",
  ganaBodega: "500.00",
  paraLaCentral: "96500.00",
  centralDebe: "0.00",
  mensajeros: 3,
  incluyeModeloNuevo: false,
};

const REGION = "Cierres del día a consolidar";

// SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» (T3.2) — la fila de
// «Solicitados». Importes con el formato de `money()` de hoy, escritos a mano: "987654.32" →
// «₡987.654,32», "349100.00" → «₡349.100», "334100.00" → «₡334.100», "15000.00" → «₡15.000»,
// "-1200.00" → «-₡1.200», "0.00" → «₡0», "436963.27" → «₡436.963,27», "53500.00" → «₡53.500».
function solicitado(
  over: Partial<CierreBodegaResumen> & { cierreBodegaId: string },
): CierreBodegaResumen {
  return {
    zonaId: "z-limon",
    // R288: ni Bodega ni Solicitó; valores imposibles de encontrar por casualidad.
    zonaNombre: "BODEGA-NO-SE-PINTA-QK4",
    solicitadoPorId: "u1",
    solicitadoPorNombre: "SOLICITO-NO-SE-PINTA-QK4",
    estado: "solicitado",
    totales: { efectivo: "987654.32", simpe: "0.00", transferencia: "0.00", general: "987654.32" },
    totalPagoMensajero: "45678.91",
    totalIngresoBodegaRechazos: "0.00",
    cantidadCierres: 3,
    solicitadoAt: "2026-11-08T01:55:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
    paraLaCentral: "349100.00",
    efectivoCubreDescuentos: true,
    conciliado: false,
    desmarcable: false,
    montoRecibido: null,
    faltaPorRecibir: "349100.00",
    conciliadoAt: null,
    conciliadoPorNombre: null,
    conciliadoNota: null,
    incluyeModeloNuevo: true,
    ...over,
  };
}

const ID_PENDIENTE = "11111111-0000-4000-8000-00000ab1c2d3";
const ID_INCOMPLETO = "22222222-0000-4000-8000-00000ef4a5b6";
const ID_NEGATIVO = "33333333-0000-4000-8000-000007c8d9e0";

const SOLICITADOS_FILAS: CierreBodegaResumen[] = [
  solicitado({ cierreBodegaId: ID_PENDIENTE }),
  solicitado({
    cierreBodegaId: ID_INCOMPLETO,
    estado: "aprobado",
    conciliado: true,
    conciliadoAt: "2026-11-08T03:00:00.000Z",
    montoRecibido: "334100.00",
    faltaPorRecibir: "15000.00",
  }),
  // Debe llegar negativo (con su signo), recibido completo: Falta «₡0» sin resaltar.
  solicitado({
    cierreBodegaId: ID_NEGATIVO,
    estado: "aprobado",
    cantidadCierres: 1,
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    paraLaCentral: "-1200.00",
    conciliado: true,
    conciliadoAt: "2026-11-08T03:00:00.000Z",
    montoRecibido: "0.00",
    faltaPorRecibir: "0.00",
  }),
];

function panelSolicitados(over: Partial<PanelSolicitadosProps> = {}): PanelSolicitadosProps {
  return {
    tarjetas: tarjetasSolicitados({
      porLlegar: { monto: "436963.27", cierres: 3 },
      recibido30Dias: { monto: "53500.00", cierres: 2 },
      faltaPorRecibir: { monto: "15000.00", cierres: 1 },
    }),
    filas: SOLICITADOS_FILAS,
    acciones: { ver: vi.fn() },
    cargando: false,
    error: null,
    paginacion: <nav aria-label="Paginación de los cierres de bodega solicitados" />,
    ...over,
  };
}
const MOTIVO =
  "Todavía no puedes consolidar: Carla Mensajera tiene un cierre sin resolver. Apruébalo o recházalo primero.";

function props(over: Partial<ColaCierresConsolidarProps> = {}): ColaCierresConsolidarProps {
  return {
    tipo: "bodega",
    rol: "satelite",
    descripcion: descripcionColaSatelite("Limón"),
    pestanas: [
      { id: "aConsolidar", label: "A consolidar", conteo: 3 },
      { id: "solicitados", label: "Solicitados", conteo: 8 },
    ],
    pestanaActiva: "aConsolidar",
    onPestana: vi.fn(),
    barra: <input aria-label="Buscar" />,
    descargar: <button type="button">Descargar</button>,
    filas: FILAS,
    cargando: false,
    error: null,
    vacio: "No hay cierres del día aprobados para consolidar.",
    region: REGION,
    acciones: { verSuCierre: vi.fn() },
    tarjetas: tarjetasAConsolidar(ENTRADA_TARJETAS),
    totales: ENTRADA_TARJETAS.totales,
    aviso: null,
    botonPie: { deshabilitado: false, onClick: vi.fn() },
    pie: "Se enviarán los 3 cierres aprobados a la central. No se puede deshacer.",
    paginacion: <nav aria-label="Paginación de los cierres del día a consolidar" />,
    solicitados: panelSolicitados(),
    ...over,
  };
}

function filaDe(nombre: string): HTMLElement {
  const region = screen.getByRole("region", { name: REGION });
  const encontrada = within(region)
    .getAllByRole("row")
    .find((r) => within(r).queryByText(nombre) !== null);
  if (!encontrada) throw new Error(`sin fila de ${nombre}`);
  return encontrada;
}

const celdas = (nombre: string) =>
  within(filaDe(nombre))
    .getAllByRole("cell")
    .map((c) => c.textContent ?? "");

const boton = () => screen.getByRole("button", { name: "Solicitar cierre de bodega" });

describe("ColaCierres · bodega satélite — pestañas y barra (R190, R191, R203)", () => {
  it("tablist «Cierre de bodega por etapa» con «A consolidar 3» activa y «Solicitados 8»", () => {
    render(<ColaCierres {...props()} />);
    const lista = screen.getByRole("tablist", { name: "Cierre de bodega por etapa" });
    expect(within(lista).getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "A consolidar 3",
      "Solicitados 8",
    ]);
    expect(within(lista).getByRole("tab", { name: "A consolidar 3" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("cambiar de pestaña avisa con el id interno", async () => {
    const onPestana = vi.fn();
    render(<ColaCierres {...props({ onPestana })} />);
    await userEvent.setup().click(screen.getByRole("tab", { name: "Solicitados 8" }));
    expect(onPestana).toHaveBeenCalledWith("solicitados");
  });

  it("la barra y «Descargar» van en la misma fila y fuera del panel (R191)", () => {
    render(<ColaCierres {...props()} />);
    const buscar = screen.getByRole("textbox", { name: "Buscar" });
    const descargar = screen.getByRole("button", { name: "Descargar" });
    expect(buscar.parentElement?.parentElement).toBe(descargar.parentElement?.parentElement);
    const panel = screen.getByRole("tabpanel");
    expect(panel).not.toContainElement(buscar);
    expect(panel).not.toContainElement(descargar);
  });

  it("descripción con la zona y sin ella (R203)", () => {
    const { rerender } = render(<ColaCierres {...props()} />);
    expect(
      screen.getByText(
        "Bodega satélite · Limón. Junta los cierres aprobados de tus mensajeros y envíalos a la central.",
      ),
    ).toBeInTheDocument();
    rerender(<ColaCierres {...props({ descripcion: descripcionColaSatelite(null) })} />);
    expect(
      screen.getByText(
        "Bodega satélite. Junta los cierres aprobados de tus mensajeros y envíalos a la central.",
      ),
    ).toBeInTheDocument();
  });
});

describe("ColaCierres · bodega satélite — fila de «A consolidar» (R192, R193, R71)", () => {
  it("las cabeceras en el orden de R192", () => {
    render(<ColaCierres {...props()} />);
    const tabla = screen.getByRole("table", { name: REGION });
    expect(within(tabla).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Folio",
      "Mensajero",
      "Aprobado",
      "Recaudado",
      "Pago",
      "Gana bodega",
      "A la central",
      "Señales",
      "Acciones",
    ]);
  });

  it("una fila con sus importes, «A la central» en negrita y «1 pago ajustado»", () => {
    render(<ColaCierres {...props()} />);
    expect(celdas("Ana Mensajera")).toEqual([
      "#8F2AB7C9",
      "Ana Mensajera",
      "2026-11-07 19:10",
      "₡100.000",
      "₡3.000",
      "₡500",
      "₡96.500",
      "1 pago ajustado",
      "Ver su cierre",
    ]);
    expect(screen.getByText("#8F2AB7C9")).toHaveClass("font-mono");
    expect(within(filaDe("Ana Mensajera")).getByText("₡96.500")).toHaveClass("font-semibold");
  });

  it("un negativo se pinta con su signo, sin fecha y sin señales", () => {
    render(<ColaCierres {...props()} />);
    expect(celdas("Beto Mensajero")).toEqual([
      "#0D4E5F60",
      "Beto Mensajero",
      "—",
      "₡0",
      "₡2.000",
      "₡0",
      "-₡2.000",
      "",
      "Ver su cierre",
    ]);
    expect(within(filaDe("Beto Mensajero")).getByText("-₡2.000")).toHaveClass(
      "font-semibold",
      "text-danger-strong",
    );
  });

  it("«Ver su cierre» con nombre accesible y el id del cierre del día (R193)", async () => {
    const verSuCierre = vi.fn();
    render(<ColaCierres {...props({ acciones: { verSuCierre } })} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Ver el cierre de Ana Mensajera" }));
    expect(verSuCierre).toHaveBeenCalledWith(ID_ANA);
  });

  it("contraprueba: «A la central» es el `paraLaCentral` de la fila, no una resta del cliente", () => {
    const otra = [fila({ cierreDiaId: ID_ANA, paraLaCentral: "41234.00" })];
    render(<ColaCierres {...props({ filas: otra })} />);
    expect(celdas("Ana Mensajera")[6]).toBe("₡41.234");
  });
});

describe("ColaCierres · bodega satélite — tarjetas (R45, R196)", () => {
  const caja = (nombre: string) =>
    within(screen.getByRole("group", { name: "Cifras a consolidar" })).getByRole("group", {
      name: nombre,
    });

  it("las cuatro tarjetas con sus importes y notas; sin «La central debe» con 0.00", () => {
    render(<ColaCierres {...props()} />);
    const grupo = screen.getByRole("group", { name: "Cifras a consolidar" });
    expect(
      within(grupo)
        .getAllByRole("group")
        // El rótulo de cada caja es el primer `span` (su `aria-labelledby`).
        .map((g) => g.querySelector("span")?.textContent),
    ).toEqual(["Recaudado", "Pago a mensajeros", "Gana la bodega satélite", "Debe llegar a la central"]);
    expect(caja("Recaudado")).toHaveTextContent("₡100.000");
    expect(caja("Pago a mensajeros")).toHaveTextContent("₡3.000");
    // SLT-139 R324: la nota ya no dice «· se paga del efectivo».
    expect(caja("Pago a mensajeros")).toHaveTextContent("3 mensajeros");
    expect(caja("Pago a mensajeros")).not.toHaveTextContent("del efectivo");
    expect(caja("Gana la bodega satélite")).toHaveTextContent("₡500");
    expect(caja("Gana la bodega satélite")).toHaveTextContent("por devoluciones a origen");
    expect(caja("Debe llegar a la central")).toHaveTextContent("₡96.500");
    expect(caja("Debe llegar a la central")).toHaveTextContent("recaudado − mensajeros − bodega");
    expect(screen.queryByRole("group", { name: "La central debe" })).toBeNull();
  });

  it("«Recaudado» lista los métodos que no valen cero (D4)", () => {
    render(<ColaCierres {...props()} />);
    const metodos = within(caja("Recaudado")).getByLabelText("Métodos de pago de lo recaudado");
    expect(metodos).toHaveTextContent("₡70.000");
    expect(metodos).toHaveTextContent("₡30.000");
    expect(within(metodos).queryByText(/Transferencia/)).toBeNull();
  });

  it("«La central debe» con 12500.00: quinta tarjeta, en tono de aviso", () => {
    const tarjetas = tarjetasAConsolidar({ ...ENTRADA_TARJETAS, centralDebe: "12500.00" });
    render(<ColaCierres {...props({ tarjetas })} />);
    const debe = caja("La central debe");
    expect(debe).toHaveTextContent("₡12.500");
    expect(debe).toHaveTextContent("el efectivo no alcanzó para pagar a todos los mensajeros");
    expect(debe).toHaveClass("bg-warning-soft", "border-warning/60");
    expect(debe.querySelector("[data-cifra='centralDebe']")).toHaveClass("text-warning-strong");
    // Las otras cajas no toman el tono de aviso.
    expect(caja("Pago a mensajeros")).not.toHaveClass("bg-warning-soft");
  });
});

describe("ColaCierres · bodega satélite — aviso y pie (R46, R197, R198)", () => {
  it("bloqueada: aviso `status` con el motivo y botón deshabilitado que lo refiere", () => {
    render(
      <ColaCierres
        {...props({
          aviso: MOTIVO,
          botonPie: { deshabilitado: true, onClick: vi.fn() },
          pie: "Se habilita cuando no quede ningún cierre de mensajero por resolver.",
        })}
      />,
    );
    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent(MOTIVO);
    expect(boton()).toBeDisabled();
    expect(boton()).toHaveAttribute("aria-describedby", aviso.id);
    expect(boton()).toHaveAccessibleDescription(MOTIVO);
    expect(
      screen.getByText("Se habilita cuando no quede ningún cierre de mensajero por resolver."),
    ).toBeInTheDocument();
  });

  it("el aviso va entre la barra y las tarjetas (R198)", () => {
    render(<ColaCierres {...props({ aviso: MOTIVO, botonPie: { deshabilitado: true, onClick: vi.fn() } })} />);
    const buscar = screen.getByRole("textbox", { name: "Buscar" });
    const aviso = screen.getByRole("status");
    const tarjetas = screen.getByRole("group", { name: "Cifras a consolidar" });
    expect(buscar.compareDocumentPosition(aviso) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(aviso.compareDocumentPosition(tarjetas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("habilitada: sin aviso, el texto del pie y el clic abre el diálogo", async () => {
    const onClick = vi.fn();
    render(<ColaCierres {...props({ botonPie: { deshabilitado: false, onClick } })} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(boton()).toBeEnabled();
    expect(boton()).not.toHaveAttribute("aria-describedby");
    expect(
      screen.getByText("Se enviarán los 3 cierres aprobados a la central. No se puede deshacer."),
    ).toBeInTheDocument();
    await userEvent.setup().click(boton());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("la paginación va en el pie, junto al botón", () => {
    render(<ColaCierres {...props()} />);
    const pie = boton().closest("footer");
    expect(pie).not.toBeNull();
    expect(
      within(pie as HTMLElement).getByRole("navigation", {
        name: "Paginación de los cierres del día a consolidar",
      }),
    ).toBeInTheDocument();
  });
});

// SLT-107: sustituye a R201 de SLT-106 (R289).
const REGION_SOLICITADOS = "Cierres de bodega solicitados";

function montarSolicitados(over: Partial<PanelSolicitadosProps> = {}, extra: Partial<ColaCierresConsolidarProps> = {}) {
  return render(
    <ColaCierres
      {...props({
        pestanaActiva: "solicitados",
        // Lo de «A consolidar» puesto a propósito: no debe verse en «Solicitados» (R32).
        aviso: MOTIVO,
        botonPie: { deshabilitado: true, onClick: vi.fn() },
        pie: "PIE-A-CONSOLIDAR-NO-SE-VE-QK4",
        paginacion: <nav aria-label="Paginación de los cierres del día a consolidar" />,
        solicitados: panelSolicitados(over),
        ...extra,
      })}
    />,
  );
}

function filaSolicitado(folio: string): HTMLElement {
  const region = screen.getByRole("region", { name: REGION_SOLICITADOS });
  const encontrada = within(region)
    .getAllByRole("row")
    .find((r) => within(r).queryByText(folio) !== null);
  if (!encontrada) throw new Error(`sin fila ${folio}`);
  return encontrada;
}

const celdasSolicitado = (folio: string) =>
  within(filaSolicitado(folio))
    .getAllByRole("cell")
    .map((c) => c.textContent ?? "");

describe("ColaCierres · bodega satélite — «Solicitados»: tarjetas (R49, R286, R32)", () => {
  const caja = (nombre: string) =>
    within(
      screen.getByRole("group", { name: "Cifras de los cierres de bodega solicitados" }),
    ).getByRole("group", { name: nombre });

  it("las tres tarjetas en orden, con montos y notas, «Por llegar» destacada", () => {
    montarSolicitados();
    const grupo = screen.getByRole("group", { name: "Cifras de los cierres de bodega solicitados" });
    expect(
      within(grupo)
        .getAllByRole("group")
        .map((g) => g.querySelector("span")?.textContent),
    ).toEqual(["Por llegar a la central", "Recibido por la central (30 días)", "Falta por recibir"]);
    expect(caja("Por llegar a la central")).toHaveTextContent("₡436.963,27");
    expect(caja("Por llegar a la central")).toHaveTextContent("3 cierres pendientes de conciliar");
    expect(caja("Por llegar a la central")).toHaveClass("bg-brand-soft");
    expect(caja("Recibido por la central (30 días)")).toHaveTextContent("₡53.500");
    expect(caja("Recibido por la central (30 días)")).toHaveTextContent("2 cierres de bodega");
    expect(caja("Falta por recibir")).toHaveTextContent("₡15.000");
    expect(caja("Falta por recibir")).toHaveTextContent("1 llegó incompleto");
    expect(caja("Falta por recibir")).toHaveClass("bg-warning-soft");
  });

  it("sin métodos de pago bajo ninguna tarjeta (D4)", () => {
    montarSolicitados();
    expect(screen.queryByLabelText("Métodos de pago de lo recaudado")).toBeNull();
  });

  it("PA2: también en 0.00, y «Falta por recibir» sin tono de aviso", () => {
    const cero = { monto: "0.00", cierres: 0 };
    montarSolicitados({
      tarjetas: tarjetasSolicitados({ porLlegar: cero, recibido30Dias: cero, faltaPorRecibir: cero }),
    });
    expect(caja("Por llegar a la central")).toHaveTextContent("₡0");
    expect(caja("Por llegar a la central")).toHaveTextContent("0 cierres pendientes de conciliar");
    expect(caja("Recibido por la central (30 días)")).toHaveTextContent("0 cierres de bodega");
    expect(caja("Falta por recibir")).toHaveTextContent("0 llegaron incompletos");
    expect(caja("Falta por recibir")).not.toHaveClass("bg-warning-soft");
  });

  it("R32: ni las tarjetas de «A consolidar», ni el aviso, ni el botón", () => {
    montarSolicitados();
    expect(screen.queryByRole("group", { name: "Cifras a consolidar" })).toBeNull();
    expect(screen.queryByText(MOTIVO)).toBeNull();
    expect(screen.queryByRole("button", { name: "Solicitar cierre de bodega" })).toBeNull();
    expect(screen.queryByRole("region", { name: REGION })).toBeNull();
  });
});

describe("ColaCierres · bodega satélite — «Solicitados»: tabla (R49, R288, R71)", () => {
  it("las cabeceras de R288, sin Bodega ni Solicitó", () => {
    montarSolicitados();
    const tabla = screen.getByRole("table", { name: REGION_SOLICITADOS });
    expect(within(tabla).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Folio",
      "Solicitado",
      "Cierres",
      "Recaudado",
      "Debe llegar",
      "Recibido",
      "Falta",
      "Estado",
      "Acciones",
    ]);
    expect(screen.queryByText("BODEGA-NO-SE-PINTA-QK4")).toBeNull();
    expect(screen.queryByText("SOLICITO-NO-SE-PINTA-QK4")).toBeNull();
  });

  it("pendiente: «—» en Recibido (nunca ₡0), Falta resaltada, folio monoespaciado", () => {
    montarSolicitados();
    expect(celdasSolicitado("#0AB1C2D3")).toEqual([
      "#0AB1C2D3",
      "2026-11-07 19:55",
      "3",
      "₡987.654,32",
      "₡349.100",
      "—",
      "₡349.100",
      "Pendiente de conciliar",
      "Ver",
    ]);
    expect(screen.getByText("#0AB1C2D3")).toHaveClass("font-mono");
    const celdas = within(filaSolicitado("#0AB1C2D3")).getAllByRole("cell");
    expect(celdas[4].firstElementChild).toHaveClass("font-semibold");
    expect(celdas[6].firstElementChild).toHaveClass("text-warning-strong");
  });

  it("recibido incompleto: lo recibido y la Falta resaltada", () => {
    montarSolicitados();
    expect(celdasSolicitado("#0EF4A5B6")).toEqual([
      "#0EF4A5B6",
      "2026-11-07 19:55",
      "3",
      "₡987.654,32",
      "₡349.100",
      "₡334.100",
      "₡15.000",
      "Recibido incompleto",
      "Ver",
    ]);
  });

  it("Debe llegar negativo con su signo; Falta 0 sin resaltar; «Recibido»", () => {
    montarSolicitados();
    expect(celdasSolicitado("#07C8D9E0")).toEqual([
      "#07C8D9E0",
      "2026-11-07 19:55",
      "1",
      "₡0",
      "-₡1.200",
      "₡0",
      "₡0",
      "Recibido",
      "Ver",
    ]);
    const celdas = within(filaSolicitado("#07C8D9E0")).getAllByRole("cell");
    expect(celdas[6].firstElementChild).not.toHaveClass("text-warning-strong");
  });

  it("«Ver» con su nombre accesible y el id del cierre de bodega; ninguna otra acción", async () => {
    const ver = vi.fn();
    montarSolicitados({ acciones: { ver } });
    const fila = filaSolicitado("#0EF4A5B6");
    expect(within(fila).getAllByRole("button").map((b) => b.textContent)).toEqual(["Ver"]);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Ver el cierre de bodega #0EF4A5B6" }));
    expect(ver).toHaveBeenCalledWith(ID_INCOMPLETO);
    expect(screen.queryByRole("button", { name: /conciliar|corregir/i })).toBeNull();
  });
});

describe("ColaCierres · bodega satélite — «Solicitados»: estados y pie (R289)", () => {
  it("región con nombre «Cierres de bodega solicitados»", () => {
    montarSolicitados();
    expect(screen.getByRole("region", { name: REGION_SOLICITADOS })).toBeInTheDocument();
  });

  it("carga: el estado de carga dentro de la región", () => {
    montarSolicitados({ cargando: true, filas: [] });
    const region = screen.getByRole("region", { name: REGION_SOLICITADOS });
    expect(within(region).getByRole("status")).toHaveTextContent("Cargando");
  });

  it("error: el texto de hoy", () => {
    montarSolicitados({
      error: "No se pudieron cargar los cierres de bodega solicitados.",
      filas: [],
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudieron cargar los cierres de bodega solicitados.",
    );
  });

  it("vacío: el texto de hoy", () => {
    montarSolicitados({ filas: [] });
    expect(
      within(screen.getByRole("region", { name: REGION_SOLICITADOS })).getByText(
        "Aún no has solicitado ningún cierre de bodega.",
      ),
    ).toBeInTheDocument();
  });

  it("pie: su texto y su paginación, sin el botón ni lo de «A consolidar»", () => {
    montarSolicitados();
    const pie = screen
      .getByText(
        '"Ver" abre el cierre de bodega con su dinero, sus gestiones, sus mensajeros y lo que marcó la central.',
      )
      .closest("footer") as HTMLElement;
    expect(pie).not.toBeNull();
    expect(
      within(pie).getByRole("navigation", { name: "Paginación de los cierres de bodega solicitados" }),
    ).toBeInTheDocument();
    expect(within(pie).queryByRole("button", { name: "Solicitar cierre de bodega" })).toBeNull();
    expect(screen.queryByText("PIE-A-CONSOLIDAR-NO-SE-VE-QK4")).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Paginación de los cierres del día a consolidar" }),
    ).toBeNull();
  });

  it("en «A consolidar» el panel de «Solicitados» no se ve", () => {
    render(<ColaCierres {...props()} />);
    expect(screen.queryByRole("region", { name: REGION_SOLICITADOS })).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Cifras de los cierres de bodega solicitados" }),
    ).toBeNull();
  });
});

describe("ColaCierres · bodega satélite — estados de la tabla (R203)", () => {
  it("región con nombre «Cierres del día a consolidar»", () => {
    render(<ColaCierres {...props()} />);
    expect(screen.getByRole("region", { name: REGION })).toBeInTheDocument();
  });

  it("carga: el estado de carga dentro de la región", () => {
    render(<ColaCierres {...props({ cargando: true, filas: [] })} />);
    const region = screen.getByRole("region", { name: REGION });
    expect(within(region).getByRole("status")).toHaveTextContent("Cargando");
  });

  it("error: el texto de hoy", () => {
    render(
      <ColaCierres
        {...props({ error: "No se pudieron cargar los cierres a consolidar.", filas: [] })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudieron cargar los cierres a consolidar.",
    );
  });

  it("vacío: el texto de hoy", () => {
    render(<ColaCierres {...props({ filas: [] })} />);
    expect(
      within(screen.getByRole("region", { name: REGION })).getByText(
        "No hay cierres del día aprobados para consolidar.",
      ),
    ).toBeInTheDocument();
  });
});
