// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import type {
  CierreBodegaDetalleCierre,
  CierreBodegaResumen,
} from "@/lib/interfaces/services/ICierreBodegaService";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  TotalesIngresoEmpresa,
} from "@/lib/interfaces/services/ICierreDiaService";
import {
  ENTREGA_478,
  gestion478,
  grupos478,
  ingreso478,
} from "@/tests/fixtures/gestion-detalle-478";

/**
 * FICHA 478 (T4) — EL DETALLE DEL CIERRE DE BODEGA ENSEÑA CADA GESTIÓN COMO EL COMPROBANTE DEL
 * CIERRE DE MENSAJERO: cinco pestañas por mensajero, fila desplegable, «Ver evidencia» en
 * cualquier resultado y SOLO LECTURA (P1).
 *
 * Reglas del archivo:
 * - Los textos esperados son LITERALES escritos a mano (memoria «Aserción contra su propia
 *   fuente»): nunca se leen de la constante o la función que los produce.
 * - Toda búsqueda va `within` la región de SU mensajero (R17): el modal monta N listas y las
 *   pestañas internas se llaman igual en todas.
 */

vi.mock("@/lib/actions/cierre-bodega", () => ({
  verCierreBodegaDetalle: vi.fn(),
  aprobarCierreBodega: vi.fn(),
  rechazarCierreBodega: vi.fn(),
  listarPendientesCierresBodegaPaginado: vi.fn(),
  listarPendientesCierresBodegaCompleto: vi.fn(),
  listarHistoricoCierresBodegaPaginado: vi.fn(),
  listarHistoricoCierresBodegaCompleto: vi.fn(),
  listarGestionesCierresBodegaCompleto: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import {
  listarHistoricoCierresBodegaPaginado,
  listarPendientesCierresBodegaPaginado,
  verCierreBodegaDetalle,
} from "@/lib/actions/cierre-bodega";
import { CierresBodegaAdminModule } from "@/app/(app)/cierres-admin/_components/CierresBodegaAdminModule";
import { CierreFacturaDetalle } from "@/app/(app)/cierres-admin/_components/cierre-factura";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";
import { marcaSinConciliar } from "@/tests/fixtures/marca-conciliacion";

// ---------------------------------------------------------------------------
// Datos: DOS mensajeros. Ana con los cinco resultados (todos con evidencia); Beto con solo
// entregadas SIN evidencia.
// ---------------------------------------------------------------------------

const REPROGRAMADA = gestion478({
  gestionId: "gr1",
  resultado: "reprogramado",
  numGuia: 5002,
  numRemision: "REM-R1",
  destinatario: "Raúl Reprogramado",
  fechaReprogramacion: "2026-09-03",
  evidenciaUrl: "https://signed.example/rep.jpg?token=r1", evidenciaUrls: ["https://signed.example/rep.jpg?token=r1"],
});

const NOVEDAD = gestion478({
  gestionId: "gn1",
  resultado: "novedad",
  numGuia: 5003,
  numRemision: "REM-N1",
  destinatario: "Nora Novedad",
  evidenciaUrl: "https://signed.example/nov.jpg?token=n1", evidenciaUrls: ["https://signed.example/nov.jpg?token=n1"],
});

const RECHAZO = gestion478({
  gestionId: "gd1",
  resultado: "devolucion_a_origen_por_rechazo",
  numGuia: 5004,
  numRemision: "REM-D1",
  destinatario: "Diana Devuelta",
  esRechazoSla: true,
  ingresoBodegaRechazo: "250.25",
  pagoMensajero: "600.10",
  evidenciaUrl: "https://signed.example/rch.jpg?token=d1", evidenciaUrls: ["https://signed.example/rch.jpg?token=d1"],
  ingresoEmpresa: ingreso478({
    montoCobrar: "4000.00",
    fleteDevolucion: "1200.00",
    ivaFleteDevolucion: "156.00",
    fleteDevolucionConIva: "1356.00",
    total: "1356.00",
  }),
});

const INCIDENTE = gestion478({
  gestionId: "gi1",
  resultado: "incidente",
  numGuia: 5005,
  numRemision: "REM-I1",
  destinatario: "Iván Incidente",
  causaIncidente: "robado",
  indemnizacion: null,
  evidenciaUrl: "https://signed.example/inc.jpg?token=i1", evidenciaUrls: ["https://signed.example/inc.jpg?token=i1"],
});

const BETO_E1 = gestion478({
  gestionId: "gb1",
  resultado: "entregado",
  numGuia: 6001,
  numRemision: "REM-B1",
  destinatario: "Bea Sin Foto",
  montoRecibido: "1000.00",
  pagos: [{ metodo: "efectivo", monto: "1000.00" }],
});
const BETO_E2 = gestion478({
  gestionId: "gb2",
  resultado: "entregado",
  numGuia: 6002,
  numRemision: "REM-B2",
  destinatario: "Bruno Sin Foto",
});

const ZONA = "33333333-3333-4333-8333-333333333333";

const CABECERA: CierreBodegaResumen = {
  cierreBodegaId: "b4780000-1111-4111-8111-b1b1b1b1b1b1",
  zonaId: ZONA,
  zonaNombre: "Limón",
  solicitadoPorId: "u1",
  solicitadoPorNombre: "Sara Satélite",
  estado: "solicitado",
  totales: { efectivo: "6000.25", simpe: "3000.25", transferencia: "0.00", general: "9000.50" },
  totalPagoMensajero: "1800.50",
  totalIngresoBodegaRechazos: "250.25",
  cantidadCierres: 2,
  solicitadoAt: "2026-09-01T10:00:00.000Z",
  resueltoAt: null,
  motivoRechazo: null,
  paraLaCentral: "6949.75",
  efectivoCubreDescuentos: true,
  ...marcaSinConciliar("6000.25"),
};

function totalesIngreso(): TotalesIngresoEmpresa {
  return {
    montoCobrar: "0.00",
    flete: "0.00",
    ivaFlete: "0.00",
    fleteDevolucion: "0.00",
    ivaFleteDevolucion: "0.00",
    comisionCod: "0.00",
    ivaComisionCod: "0.00",
    fleteConIva: "0.00",
    comisionConIva: "0.00",
    fleteDevolucionConIva: "0.00",
    total: "0.00",
  };
}

function dia(
  mensajeroId: string,
  mensajeroNombre: string,
  grupos: CierreGrupos,
): CierreBodegaDetalleCierre {
  return {
    cierreDiaId: `cd-${mensajeroId}`,
    mensajeroId,
    mensajeroNombre,
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    totalPagoMensajero: "0.00",
    totalIngresoBodegaRechazos: "0.00",
    grupos,
    totalesIngreso: totalesIngreso(),
    ganancia: "0.00",
    pagoTienda: "0.00",
    cobradoSobreRecaudado: "0.00",
    netoEmpresa: "0.00",
    ganaLaTienda: "0.00",
    partesPorTienda: [],
    paraLaCentral: "0.00",
    efectivoCubreDescuentos: true,
    ...marcaSinConciliar("0.00"),
  };
}

const GRUPOS_ANA = grupos478({
  entregado: [ENTREGA_478],
  reprogramado: [REPROGRAMADA],
  novedad: [NOVEDAD],
  devolucion_a_origen_por_rechazo: [RECHAZO],
  incidente: [INCIDENTE],
});

function detalle(gruposAna: CierreGrupos = GRUPOS_ANA) {
  return {
    status: "ok" as const,
    cierre: CABECERA,
    cierres: [
      dia("m1", "Ana Mensajera", gruposAna),
      dia("m2", "Beto Mensajero", grupos478({ entregado: [BETO_E1, BETO_E2] })),
    ],
    totalesIngreso: totalesIngreso(),
    ganancia: "0.00",
    pagoTienda: "0.00",
    cobradoSobreRecaudado: "0.00",
    netoEmpresa: "0.00",
    ganaLaTienda: "0.00",
    partesPorTienda: [],
    paraLaCentral: "6949.75",
    efectivoCubreDescuentos: true,
    ...marcaSinConciliar("6000.25"),
  };
}

async function abrirDetalle(gruposAna?: CierreGrupos) {
  vi.mocked(listarPendientesCierresBodegaPaginado).mockResolvedValue({
    status: "ok",
    page: 1,
    ...paginaInicial([CABECERA]),
  });
  vi.mocked(listarHistoricoCierresBodegaPaginado).mockResolvedValue({
    status: "ok",
    page: 1,
    ...paginaInicial([]),
  });
  vi.mocked(verCierreBodegaDetalle).mockResolvedValue(detalle(gruposAna));

  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierresBodegaAdminModule
        pendientes={paginaInicial([CABECERA])}
        historico={paginaInicial([])}
      />
    </SWRConfig>,
  );

  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Ver / decidir el cierre de bodega de Limón" }),
  );
  await screen.findByRole("region", { name: "Órdenes del cierre · Ana Mensajera" });
  return user;
}

const gestionesDe = (mensajero: string) =>
  screen.getByRole("region", { name: `Órdenes del cierre · ${mensajero}` });

/** Las pestañas de un mensajero, como se leen: rótulo + conteo pegados. */
function pestanas(mensajero: string): string[] {
  return within(gestionesDe(mensajero))
    .getAllByRole("tab")
    .map((t) => t.textContent ?? "");
}

function pestanaActiva(mensajero: string): string {
  const activa = within(gestionesDe(mensajero))
    .getAllByRole("tab")
    .find((t) => t.getAttribute("aria-selected") === "true");
  return activa?.textContent ?? "";
}

async function irA(user: ReturnType<typeof userEvent.setup>, mensajero: string, rotulo: string) {
  const tab = within(gestionesDe(mensajero))
    .getAllByRole("tab")
    .find((t) => (t.textContent ?? "").startsWith(rotulo));
  if (!tab) throw new Error(`sin pestaña «${rotulo}» en ${mensajero}`);
  await user.click(tab);
}

/** Despliega la fila por su botón y devuelve el contenedor completo de la fila. */
async function desplegar(
  user: ReturnType<typeof userEvent.setup>,
  ambito: HTMLElement,
  nombreBoton: string,
): Promise<HTMLElement> {
  const boton = within(ambito).getByRole("button", { name: nombreBoton });
  await user.click(boton);
  expect(boton).toHaveAttribute("aria-expanded", "true");
  return boton.parentElement as HTMLElement;
}

const BOTON_ENTREGA = "Desglose de ingreso de la orden REM-E1 · Carla Entregada";
const BOTON_RECHAZO = "Desglose de ingreso de la orden REM-D1 · Diana Devuelta";

/**
 * Lo que la fila desplegada de la ENTREGA tiene que decir, en literal. Lo usan R6 y R9: el
 * mismo texto en el detalle de bodega y en el comprobante del cierre de mensajero.
 */
const TEXTOS_ENTREGA_DESPLEGADA = [
  "Calle Sol 12",
  "GAM · San José · Central · Carmen",
  "Recibido: ₡8.000,50 · Efectivo ₡5.000,25 + SINPE ₡3.000,25",
  "Tienda: Tienda Norte",
  "Flete + IVA: ₡2.260",
  "Comisión + IVA: ₡800",
  "Pago al mensajero: ₡1.200,40",
  "Fulfillment: ₡350,50",
  "Desglose de ingreso",
  "Cobros de esta gestión",
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("478 · gestiones en pestañas, por mensajero (R1-R5)", () => {
  it("R1: pinta las cinco pestañas con su conteo dentro del bloque de cada mensajero", async () => {
    await abrirDetalle();
    expect(pestanas("Ana Mensajera")).toEqual([
      "Entregado1",
      "Reprogramado1",
      "Novedad1",
      "Devolución a origen por rechazo1",
      "Incidente1",
    ]);
    expect(pestanas("Beto Mensajero")).toEqual([
      "Entregado2",
      "Reprogramado0",
      "Novedad0",
      "Devolución a origen por rechazo0",
      "Incidente0",
    ]);
  });

  it("R2: abre en la primera pestaña con gestiones", async () => {
    // Ana SIN entregas ni reprogramadas: la primera con gestiones es «Novedad».
    await abrirDetalle(
      grupos478({ novedad: [NOVEDAD], incidente: [INCIDENTE] }),
    );
    expect(pestanaActiva("Ana Mensajera")).toBe("Novedad1");
    expect(pestanaActiva("Beto Mensajero")).toBe("Entregado2");
  });

  it("R3: una pestaña vacía muestra el texto de sección vacía del resultado", async () => {
    const user = await abrirDetalle();
    await irA(user, "Beto Mensajero", "Novedad");
    expect(
      within(gestionesDe("Beto Mensajero")).getByText(
        "No hay gestiones con resultado «Novedad».",
      ),
    ).toBeInTheDocument();
  });

  it("R4: cambiar de pestaña en un mensajero no cambia la del otro", async () => {
    const user = await abrirDetalle();
    await irA(user, "Ana Mensajera", "Reprogramado");
    expect(pestanaActiva("Ana Mensajera")).toBe("Reprogramado1");
    expect(pestanaActiva("Beto Mensajero")).toBe("Entregado2");
    expect(
      within(gestionesDe("Beto Mensajero")).getByRole("button", {
        name: "Detalle de la orden REM-B1 · Bea Sin Foto",
      }),
    ).toBeInTheDocument();
  });

  it("R5: la fila compacta enseña guía, destinatario, remisión·producto, cobrado e ingreso total", async () => {
    await abrirDetalle();
    const boton = within(gestionesDe("Ana Mensajera")).getByRole("button", {
      name: BOTON_ENTREGA,
    });
    expect(boton).toHaveTextContent("5001");
    expect(boton).toHaveTextContent("Carla Entregada");
    expect(boton).toHaveTextContent("REM-E1 · Caja mediana");
    expect(boton).toHaveTextContent("₡8.000,50");
    expect(boton).toHaveTextContent("₡3.060");
    // La cabecera de columnas es la de la vista de admin.
    const region = gestionesDe("Ana Mensajera");
    expect(region).toHaveTextContent("Cobrado");
    expect(region).toHaveTextContent("Total de la empresa");
  });
});

describe("478 · lo que enseña la fila desplegada (R6-R9)", () => {
  it("R6: al desplegar una entregada enseña dirección, ubicación, recibido con método, tienda, flete+IVA, comisión+IVA y pago al mensajero", async () => {
    const user = await abrirDetalle();
    const fila = await desplegar(user, gestionesDe("Ana Mensajera"), BOTON_ENTREGA);
    for (const texto of TEXTOS_ENTREGA_DESPLEGADA) {
      expect(fila, `falta «${texto}»`).toHaveTextContent(texto);
    }
  });

  it("R6: al desplegar una reprogramada enseña la nueva fecha", async () => {
    const user = await abrirDetalle();
    await irA(user, "Ana Mensajera", "Reprogramado");
    const fila = await desplegar(
      user,
      gestionesDe("Ana Mensajera"),
      "Detalle de la orden REM-R1 · Raúl Reprogramado",
    );
    expect(fila).toHaveTextContent("Nueva fecha: 2026-09-03");
  });

  it("R7: al desplegar una devolución por rechazo enseña ingreso de bodega y la marca automático/manual", async () => {
    const user = await abrirDetalle();
    await irA(user, "Ana Mensajera", "Devolución a origen por rechazo");
    const fila = await desplegar(user, gestionesDe("Ana Mensajera"), BOTON_RECHAZO);
    expect(fila).toHaveTextContent("Ingreso de bodega por devoluciones a origen: ₡250,25");
    expect(fila).toHaveTextContent("Flete por devolución a origen + IVA: ₡1.356");
    expect(within(fila).getByText("Automático")).toBeInTheDocument();
    expect(within(fila).queryByText("Manual")).not.toBeInTheDocument();
  });

  it("R8: al desplegar una gestión con snapshot enseña Desglose de ingreso y Cobros de esta gestión", async () => {
    const user = await abrirDetalle();
    const fila = await desplegar(user, gestionesDe("Ana Mensajera"), BOTON_ENTREGA);
    expect(fila).toHaveTextContent("Desglose de ingreso");
    expect(fila).toHaveTextContent("Cobros de esta gestión");
  });

  it("R9: la misma gestión, desplegada en el detalle de bodega y en el comprobante de mensajero, enseña el mismo texto", async () => {
    // (1) Detalle de bodega.
    const user = await abrirDetalle();
    const enBodega = await desplegar(user, gestionesDe("Ana Mensajera"), BOTON_ENTREGA);
    for (const texto of TEXTOS_ENTREGA_DESPLEGADA) {
      expect(enBodega, `bodega: falta «${texto}»`).toHaveTextContent(texto);
    }
    cleanup();

    // (2) Comprobante del cierre de mensajero con la MISMA gestión: el mismo literal.
    render(
      <CierreFacturaDetalle
        cierre={{
          cierreId: "c4780001",
          estado: "solicitado",
          destinoTipo: "bodega_central",
          destinoZonaNombre: "GAM",
          mensajeroNombre: "Ana Mensajera",
          totales: { efectivo: "5000.25", simpe: "3000.25", transferencia: "0.00", general: "8000.50" },
          totalPagoMensajero: "1200.40",
          totalIngresoBodegaRechazos: "0.00",
          solicitadoAt: "2026-09-01T10:00:00.000Z",
          resueltoAt: null,
          motivoRechazo: null,
        }}
        grupos={grupos478({ entregado: [ENTREGA_478] })}
      />,
    );
    const user2 = userEvent.setup();
    const enComprobante = await desplegar(
      user2,
      screen.getByRole("region", { name: "Órdenes del cierre" }),
      BOTON_ENTREGA,
    );
    for (const texto of TEXTOS_ENTREGA_DESPLEGADA) {
      expect(enComprobante, `comprobante: falta «${texto}»`).toHaveTextContent(texto);
    }
  });
});

describe("478 · evidencia (R10-R12)", () => {
  const CASOS: readonly [string, string, CierreDetalleGestion][] = [
    ["Entregado", BOTON_ENTREGA, ENTREGA_478],
    ["Reprogramado", "Detalle de la orden REM-R1 · Raúl Reprogramado", REPROGRAMADA],
    ["Novedad", "Detalle de la orden REM-N1 · Nora Novedad", NOVEDAD],
    ["Devolución a origen por rechazo", BOTON_RECHAZO, RECHAZO],
    ["Incidente", "Detalle de la orden REM-I1 · Iván Incidente", INCIDENTE],
  ];

  for (const [pestana, boton, g] of CASOS) {
    it(`R10: ofrece Ver evidencia en una gestión «${pestana}» con evidencia`, async () => {
      const user = await abrirDetalle();
      await irA(user, "Ana Mensajera", pestana);
      const fila = await desplegar(user, gestionesDe("Ana Mensajera"), boton);
      expect(
        within(fila).getByRole("button", {
          name: `Ver evidencia de la orden ${g.numRemision} · ${g.destinatario}`,
        }),
      ).toBeInTheDocument();
    });
  }

  it("R11: sin evidencia no hay botón Ver evidencia", async () => {
    const user = await abrirDetalle();
    const region = gestionesDe("Beto Mensajero");
    for (const nombre of [
      "Detalle de la orden REM-B1 · Bea Sin Foto",
      "Detalle de la orden REM-B2 · Bruno Sin Foto",
    ]) {
      const fila = await desplegar(user, region, nombre);
      expect(within(fila).queryByRole("button", { name: /Ver evidencia/ })).toBeNull();
    }
  });

  it("R12: Ver evidencia abre el visor con la URL firmada de esa gestión", async () => {
    const user = await abrirDetalle();
    await irA(user, "Ana Mensajera", "Novedad");
    const fila = await desplegar(
      user,
      gestionesDe("Ana Mensajera"),
      "Detalle de la orden REM-N1 · Nora Novedad",
    );
    await user.click(
      within(fila).getByRole("button", {
        name: "Ver evidencia de la orden REM-N1 · Nora Novedad",
      }),
    );
    const imagen = await screen.findByRole("img", {
      name: "Evidencia fotográfica de la gestión",
    });
    expect(imagen).toHaveAttribute("src", "https://signed.example/nov.jpg?token=n1");
  });
});

describe("478 · solo lectura (R14-R15)", () => {
  it("R14: sin Corregir métodos de pago ni Corregir el resultado, aunque la gestión sea una entregada con pagos", async () => {
    const user = await abrirDetalle();
    const fila = await desplegar(user, gestionesDe("Ana Mensajera"), BOTON_ENTREGA);
    expect(within(fila).queryByRole("button", { name: /Corregir métodos de pago/ })).toBeNull();
    expect(within(fila).queryByRole("button", { name: /Corregir el resultado/ })).toBeNull();
    // Y en ninguna parte del modal.
    expect(screen.queryByText("Corregir métodos de pago")).toBeNull();
    expect(screen.queryByText("Corregir el resultado")).toBeNull();
  });

  it("R15: ningún bloque de mensajero ofrece Aprobar ni Rechazar", async () => {
    await abrirDetalle();
    for (const mensajero of ["Ana Mensajera", "Beto Mensajero"]) {
      const bloque = screen.getByRole("region", { name: `Cierre del día · ${mensajero}` });
      expect(within(bloque).queryByRole("button", { name: /Aprobar|Rechazar/ })).toBeNull();
    }
  });
});

describe("478 · accesibilidad (R17)", () => {
  it("cada bloque tiene una región de gestiones con el nombre de su mensajero, y no se repite", async () => {
    await abrirDetalle();
    const ana = gestionesDe("Ana Mensajera");
    const beto = gestionesDe("Beto Mensajero");
    expect(ana).not.toBe(beto);
    // Cada una dentro de SU bloque.
    expect(
      within(screen.getByRole("region", { name: "Cierre del día · Ana Mensajera" })).getByRole(
        "region",
        { name: "Órdenes del cierre · Ana Mensajera" },
      ),
    ).toBe(ana);
    const nombres = screen
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-label") ?? "")
      .filter((n) => n.startsWith("Órdenes del cierre"));
    expect(nombres).toEqual([
      "Órdenes del cierre · Ana Mensajera",
      "Órdenes del cierre · Beto Mensajero",
    ]);
    // Y la sección activa interna también lleva el mensajero (no N «Entregado» iguales).
    expect(within(ana).getByRole("region", { name: "Entregado · Ana Mensajera" })).toBeInTheDocument();
    expect(within(beto).getByRole("region", { name: "Entregado · Beto Mensajero" })).toBeInTheDocument();
  });
});
