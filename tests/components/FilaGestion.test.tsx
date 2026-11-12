// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FilaGestion } from "@/components/private/cierres/fila/FilaGestion";
import type { AccionesFila, AudienciaFila } from "@/components/private/cierres/fila/fila-gestion-vista";
import type { CierreDetalleGestion } from "@/lib/interfaces/services/ICierreDiaService";
import type { EvidenciaAbierta } from "@/components/private/cierres/dialogos/VisorEvidencia";
import {
  CONGELADO_AT,
  gestionCanvas,
  gestionFila,
  ingresoNuevo,
  ingresoViejo,
} from "@/tests/fixtures/gestion-cierre-fila";

// SLT-101 «Fila de gestión única y lista con filtros» (T3.3) — la fila única de una gestión, montada
// con dobles para las cuatro audiencias. Los esperados van escritos a mano: son los textos del canvas
// (`Fila2.dc.html`) pasados por el formateador compartido de la app (`money()`, que no pinta «,00»).

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

function montar(
  g: CierreDetalleGestion,
  opciones: {
    audiencia?: AudienciaFila;
    central?: boolean;
    acciones?: AccionesFila;
    onVerEvidencia?: (evidencia: EvidenciaAbierta) => void;
    mensajero?: string;
  } = {},
) {
  const audiencia = opciones.audiencia ?? "central";
  render(
    <FilaGestion
      gestion={g}
      audiencia={audiencia}
      quienMiraEsCentral={opciones.central ?? audiencia === "central"}
      congeladoAt={CONGELADO_AT}
      acciones={opciones.acciones ?? {}}
      onVerEvidencia={opciones.onVerEvidencia}
      mensajeroNombre={opciones.mensajero}
      columnaMensajero={opciones.mensajero !== undefined}
    />,
  );
  return userEvent.setup();
}

async function desplegar(user: ReturnType<typeof userEvent.setup>, g: CierreDetalleGestion) {
  const nombre = g.ingresoEmpresa
    ? `Desglose de ingreso de la orden ${g.numRemision} · ${g.destinatario}`
    : `Detalle de la orden ${g.numRemision} · ${g.destinatario}`;
  await user.click(screen.getByRole("button", { name: nombre }));
}

/** [rótulo, importe] de cada línea de una tarjeta, como se leen. */
function cuenta(nombre: string): string[][] {
  const region = screen.getByRole("region", { name: nombre });
  return Array.from(region.querySelectorAll("[data-tipo]")).map((l) => [
    l.querySelector("[data-rotulo]")?.textContent ?? "",
    l.querySelector("[data-monto]")?.textContent ?? "",
  ]);
}

const DE_CANVAS = "de la orden REM-001 · Beto Ruiz";

describe("R86 — fila cerrada", () => {
  it("central: guía, destinatario · tienda, resultado con su botón de información, importes y señales", () => {
    montar(gestionCanvas());
    expect(screen.getByText("1001")).toBeInTheDocument();
    expect(screen.getByText("· Tienda Norte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Qué significa «Entregado»" })).toBeInTheDocument();
    expect(screen.getByText("₡25.000")).toBeInTheDocument();
    expect(screen.getByText("₡4.520")).toBeInTheDocument();
    expect(screen.getByText("₡1.800")).toBeInTheDocument();
    expect(screen.getByText("Pago ajustado")).toBeInTheDocument();
  });

  it("los importes nulos son «—», nunca ₡0", () => {
    montar(gestionFila({ gestionId: "p", resultado: "novedad", montoRecibido: null, pagoMensajero: null, ingresoEmpresa: null, pagos: [] }));
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText("₡0")).toBeNull();
  });

  it("mensajero: recibido y ganancia, sin cobro a la tienda", () => {
    montar(gestionCanvas(), { audiencia: "mensajero" });
    expect(screen.getByText("₡25.000")).toBeInTheDocument();
    expect(screen.getByText("₡1.800")).toBeInTheDocument();
    expect(screen.queryByText("₡4.520")).toBeNull();
    expect(screen.queryByText("Pago ajustado")).toBeNull();
  });

  it("R24: una gestión sin señales deja la celda vacía", () => {
    montar(gestionFila({ gestionId: "e" }));
    expect(screen.queryByText(/Vuelve a bodega|Pago ajustado|Sin tarifa/)).toBeNull();
  });

  it("R23: con mensajero (bodega), su nombre en la fila", () => {
    montar(gestionFila({ gestionId: "e" }), { audiencia: "solo lectura", mensajero: "Ana Mensajera" });
    expect(screen.getByText("Ana Mensajera")).toBeInTheDocument();
  });
});

describe("R25 — fila desplegada: solo los datos de la orden", () => {
  it("Orden, Producto y Dirección; nada de indemnización, ingreso de bodega, nueva fecha ni motivo", async () => {
    const g = gestionFila({
      gestionId: "i",
      resultado: "incidente",
      causaIncidente: "danado",
      indemnizacion: "5000.00",
      ingresoBodegaRechazo: "450.00",
      motivo: "Cliente ausente",
      fechaReprogramacion: "2026-11-09",
      montoRecibido: null,
      pagos: [],
      ingresoEmpresa: ingresoViejo(),
    });
    const user = montar(g);
    await desplegar(user, g);
    const terminos = Array.from(document.querySelectorAll("dt")).map((d) => d.textContent);
    expect(terminos).toEqual(["Orden", "Producto", "Dirección"]);
    expect(Array.from(document.querySelectorAll("dd")).map((d) => d.textContent)).toEqual([
      "REM-001",
      "Caja",
      "Calle 1, Barrio Amón, San José",
    ]);
    for (const retirado of [/Indemnización/, /Ingreso de bodega/, /Nueva fecha/, /Motivo/, /Cliente ausente/]) {
      expect(screen.queryByText(retirado)).toBeNull();
    }
  });
});

describe("R25, R27, R30, R93-R98 — tarjetas del canvas (central)", () => {
  it("las cuatro tarjetas en cascada, con las cifras del servidor", async () => {
    const g = gestionCanvas();
    const user = montar(g);
    await desplegar(user, g);
    expect(cuenta(`Recibió el mensajero ${DE_CANVAS}`)).toEqual([
      ["Efectivo", "₡15.000"],
      ["+ SINPE", "₡10.000"],
      ["Recibió", "₡25.000"],
    ]);
    expect(cuenta(`Se le cobra a la tienda ${DE_CANVAS}`)).toEqual([
      ["Flete por entregado + IVA", "₡3.955"],
      ["+ Comisión COD + IVA", "₡565"],
      ["Se le cobra", "₡4.520"],
    ]);
    const cobro = screen.getByRole("region", { name: `Se le cobra a la tienda ${DE_CANVAS}` });
    expect(cobro.querySelector("[data-aparte]")?.textContent).toBe("de eso, IVA (no es de la empresa)₡520");
    expect(cuenta(`Se le paga al mensajero ${DE_CANVAS}`)).toEqual([
      ["Por tarifa · precio propio del mensajero", "₡2.500"],
      ["− Ajuste", "₡700"],
      ["Se le paga", "₡1.800"],
    ]);
    const pago = screen.getByRole("region", { name: `Se le paga al mensajero ${DE_CANVAS}` });
    // La insignia «Ajustado» es la marca de hoy (SLT-56), que abre el historial.
    const marca = within(pago).getByRole("button", { name: "Pago ajustado: ver el ajuste" });
    expect(marca).toHaveTextContent("Ajustado");
    expect(pago.className).toMatch(/border-warning/);
    expect(within(pago).getByText("Motivo: «Entrega compartida con Luis»")).toBeInTheDocument();
    expect(within(pago).getByText("Ajustó Carlos R. · 07/11 19:02")).toBeInTheDocument();
    expect(cuenta(`Fulfillment · se cobró al crear la orden ${DE_CANVAS}`)).toEqual([
      ["Fulfillment", "₡600"],
      ["+ IVA 13 %", "₡78"],
      ["Se cobró", "₡678"],
    ]);
    expect(
      screen.getByText(
        "Se cargó al saldo de la tienda el 06/11/2026, una vez por paquete. No depende de esta gestión ni de este cierre.",
      ),
    ).toBeInTheDocument();
  });

  it("R27: sin snapshot ni pago, «Sin dato» en lugar de ₡0", async () => {
    const g = gestionFila({ gestionId: "p", resultado: "novedad", montoRecibido: null, pagoMensajero: null, ingresoEmpresa: null, pagos: [] });
    const user = montar(g);
    await desplegar(user, g);
    expect(screen.getAllByText("Sin dato")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Ver cómo se calculó" })).toBeNull();
  });

  it("R93: sin IVA incluido no hay «de eso, IVA»", async () => {
    const g = gestionCanvas({ ingresoEmpresa: ingresoNuevo({ ivaIncluido: null }) });
    const user = montar(g);
    await desplegar(user, g);
    expect(screen.queryByText("de eso, IVA (no es de la empresa)")).toBeNull();
  });

  it("R94: sin fecha de cargo, la nota sin la primera frase", async () => {
    const g = gestionCanvas({ ingresoEmpresa: ingresoNuevo({ fulfillmentCargadoAt: null }) });
    const user = montar(g);
    await desplegar(user, g);
    expect(screen.getByText("No depende de esta gestión ni de este cierre.")).toBeInTheDocument();
    expect(screen.queryByText(/Se cargó al saldo/)).toBeNull();
  });
});

describe("R25, R30 — tarjetas por audiencia", () => {
  it.each([
    ["satelite", false, ["Recibió el mensajero", "Se le cobra a la tienda", "Se le paga al mensajero"]],
    ["mensajero", false, ["Recibió el mensajero", "Tu ganancia"]],
    ["solo lectura", true, ["Recibió el mensajero", "Se le cobra a la tienda", "Se le paga al mensajero", "Fulfillment · se cobró al crear la orden"]],
    ["solo lectura", false, ["Recibió el mensajero", "Se le cobra a la tienda", "Se le paga al mensajero"]],
  ] as const)("%s (mira la central: %s)", async (audiencia, central, titulos) => {
    const g = gestionCanvas();
    const user = montar(g, { audiencia, central });
    await desplegar(user, g);
    expect(Array.from(document.querySelectorAll("section h3")).map((h) => h.textContent)).toEqual(titulos);
  });
});

describe("R28, R29, R97 — «Ver cómo se calculó»", () => {
  it("nuevo: abre y pliega, con una tarjeta por concepto y la nota con fecha y hora", async () => {
    const g = gestionCanvas();
    const user = montar(g);
    await desplegar(user, g);
    const boton = screen.getByRole("button", { name: "Ver cómo se calculó" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    await user.click(boton);
    expect(screen.getByRole("button", { name: "Ocultar cómo se calculó" })).toHaveAttribute("aria-expanded", "true");
    const calculo = screen.getByRole("region", { name: "Cómo se calculó el cobro a la tienda" });
    expect(within(calculo).getByText("Tarifa: grupo «San José centro» de la zona GAM")).toBeInTheDocument();
    expect(cuenta(`Flete por entregado ${DE_CANVAS}`)).toEqual([
      ["Monto fijo", "₡3.500"],
      ["+ IVA 13 %", "₡455"],
      ["Flete por entregado", "₡3.955"],
    ]);
    expect(within(calculo).getByText("Tarifa: valor base de la zona GAM")).toBeInTheDocument();
    expect(cuenta(`Comisión COD ${DE_CANVAS}`)).toEqual([
      ["2 % de ₡25.000", "₡500"],
      ["+ IVA 13 %", "₡65"],
      ["Comisión COD", "₡565"],
    ]);
    expect(
      within(calculo).getByText(
        "Tarifas tal como estaban al crear el cierre (07/11/2026 18:42). Si después cambian, aquí no cambia nada.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ocultar cómo se calculó" }));
    expect(screen.queryByRole("region", { name: "Cómo se calculó el cobro a la tienda" })).toBeNull();
  });

  it("viejo GAM: la columna aplicada con los rótulos de hoy", async () => {
    const g = gestionFila({ gestionId: "v", ingresoEmpresa: ingresoViejo() });
    const user = montar(g);
    await desplegar(user, g);
    await user.click(screen.getByRole("button", { name: "Ver cómo se calculó" }));
    expect(cuenta(`Flete por entregado ${DE_CANVAS}`)).toEqual([
      ["tarifa GAM", "₡4.000"],
      ["+ IVA flete (13 % de ₡4.000)", "₡520"],
      ["Flete por entregado", "₡4.520"],
    ]);
    expect(cuenta(`Comisión COD ${DE_CANVAS}`)).toEqual([
      ["Comisión COD (4 % de ₡25.000)", "₡1.000"],
      ["+ IVA comisión (13 % de ₡1.000)", "₡130"],
      ["Comisión COD", "₡1.130"],
    ]);
  });

  it("paridad: pacto especial", async () => {
    const ing = ingresoViejo({
      fleteOrigen: "especial",
      esZonaEspecial: true,
      flete: "5000.00",
      ivaFlete: "650.00",
      fleteConIva: "5650.00",
      tarifa: { ...ingresoViejo().tarifa!, tarifaEspecial: "5000.00" },
    });
    const g = gestionFila({ gestionId: "v", ingresoEmpresa: ing });
    const user = montar(g);
    await desplegar(user, g);
    await user.click(screen.getByRole("button", { name: "Ver cómo se calculó" }));
    expect(cuenta(`Flete por entregado ${DE_CANVAS}`)[0]).toEqual(["tarifa especial pactada", "₡5.000"]);
    expect(
      screen.getByText("El flete salió de la tarifa especial pactada para el distrito, no de la tabla de precios normal."),
    ).toBeInTheDocument();
  });

  it("paridad: especial sin pacto (columna normal y su aviso)", async () => {
    const g = gestionFila({
      gestionId: "v",
      ingresoEmpresa: ingresoViejo({ fleteOrigen: "especial_sin_pacto", esZonaEspecial: true }),
    });
    const user = montar(g);
    await desplegar(user, g);
    await user.click(screen.getByRole("button", { name: "Ver cómo se calculó" }));
    expect(cuenta(`Flete por entregado ${DE_CANVAS}`)[0]).toEqual(["tarifa GAM", "₡4.000"]);
    expect(screen.getByRole("note")).toHaveTextContent(/se cobró la tarifa normal/);
  });

  it("paridad: sin comisión", async () => {
    const g = gestionFila({
      gestionId: "v",
      ingresoEmpresa: ingresoViejo({ cobraComision: false, comisionCod: null, ivaComisionCod: null, comisionConIva: null, total: "4520.00" }),
    });
    const user = montar(g);
    await desplegar(user, g);
    await user.click(screen.getByRole("button", { name: "Ver cómo se calculó" }));
    expect(screen.getByText("Esta orden no cobra comisión COD.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: `Comisión COD ${DE_CANVAS}` })).toBeNull();
  });

  it("paridad: sin tarifa congelada", async () => {
    const g = gestionFila({ gestionId: "v", ingresoEmpresa: ingresoViejo({ tarifa: null }) });
    const user = montar(g);
    await desplegar(user, g);
    await user.click(screen.getByRole("button", { name: "Ver cómo se calculó" }));
    expect(
      screen.getByText(
        "La tienda no tenía tarifa vigente al solicitar el cierre: no se derivó ningún ingreso para esta orden.",
      ),
    ).toBeInTheDocument();
  });
});

describe("R26, R89 — acciones con los nombres de hoy y sus callbacks", () => {
  it("central: corregir métodos, ajustar pago, corregir el resultado y ver evidencia", async () => {
    const acciones = { corregirMetodos: vi.fn(), ajustarPago: vi.fn(), corregirResultado: vi.fn() };
    const onVerEvidencia = vi.fn();
    const g = gestionCanvas({ evidenciaUrls: ["https://firmada/1"] });
    const user = montar(g, { acciones, onVerEvidencia });
    await desplegar(user, g);
    await user.click(screen.getByRole("button", { name: `Corregir métodos de pago ${DE_CANVAS}` }));
    expect(acciones.corregirMetodos).toHaveBeenCalledWith(g);
    await user.click(screen.getByRole("button", { name: "Ajustar pago al mensajero de la orden REM-001 · Beto Ruiz" }));
    expect(acciones.ajustarPago).toHaveBeenCalledWith(g);
    await user.click(screen.getByRole("button", { name: `Corregir el resultado ${DE_CANVAS}` }));
    expect(acciones.corregirResultado).toHaveBeenCalledWith(g);
    await user.click(screen.getByRole("button", { name: `Ver evidencia ${DE_CANVAS}` }));
    // SLT-103 (R137): el visor recibe las URL y el contexto «Orden <remisión> · <destinatario>».
    expect(onVerEvidencia).toHaveBeenCalledWith({
      urls: ["https://firmada/1"],
      contexto: "Orden REM-001 · Beto Ruiz",
    });
  });

  it("satélite: solo ajustar pago, aunque le pasaran los demás callbacks", async () => {
    const g = gestionCanvas();
    const user = montar(g, {
      audiencia: "satelite",
      acciones: { corregirMetodos: vi.fn(), ajustarPago: vi.fn(), corregirResultado: vi.fn() },
    });
    await desplegar(user, g);
    expect(screen.getByRole("button", { name: /Ajustar pago al mensajero/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Corregir métodos de pago/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Corregir el resultado/ })).toBeNull();
  });

  it("solo lectura: ninguna acción salvo la evidencia", async () => {
    const g = gestionCanvas({ evidenciaUrls: ["https://firmada/1"] });
    const user = montar(g, {
      audiencia: "solo lectura",
      central: true,
      acciones: { corregirMetodos: vi.fn(), ajustarPago: vi.fn(), corregirResultado: vi.fn(), devolver: vi.fn() },
      onVerEvidencia: vi.fn(),
    });
    await desplegar(user, g);
    expect(screen.queryByRole("button", { name: /Corregir|Ajustar|Devolver/ })).toBeNull();
    expect(screen.getByRole("button", { name: `Ver evidencia ${DE_CANVAS}` })).toBeInTheDocument();
  });

  it("mensajero: «Devolver a gestión» en la fila cerrada, con su callback", async () => {
    const devolver = vi.fn();
    const g = gestionCanvas();
    const user = montar(g, { audiencia: "mensajero", acciones: { devolver } });
    await user.click(screen.getByRole("button", { name: "Devolver a gestión la orden REM-001 · Beto Ruiz" }));
    expect(devolver).toHaveBeenCalledWith(g);
  });

  it("SLT-103 (R54, R138): varias evidencias, UN botón «Ver evidencia (2)» con todas las fotos", async () => {
    const onVerEvidencia = vi.fn();
    const g = gestionCanvas({ evidenciaUrls: ["https://firmada/1", "https://firmada/2"] });
    const user = montar(g, { onVerEvidencia });
    await desplegar(user, g);
    expect(screen.getAllByRole("button", { name: /Ver evidencia/ })).toHaveLength(1);
    const boton = screen.getByRole("button", { name: "Ver evidencia (2) de la orden REM-001 · Beto Ruiz" });
    expect(boton).toHaveTextContent(/^Ver evidencia \(2\)$/);
    await user.click(boton);
    expect(onVerEvidencia).toHaveBeenCalledWith({
      urls: ["https://firmada/1", "https://firmada/2"],
      contexto: "Orden REM-001 · Beto Ruiz",
    });
  });

  it("sin snapshot, el botón de desplegar se llama «Detalle de la orden …»", () => {
    montar(gestionFila({ gestionId: "p", ingresoEmpresa: null }));
    expect(screen.getByRole("button", { name: "Detalle de la orden REM-001 · Beto Ruiz" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
