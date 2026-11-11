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
import { GestionesCierre } from "@/components/private/cierres/fila/GestionesCierre";
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
    ivaFacturado: "0.00", // SL-39: los conceptos de la fixtura no llevan IVA
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
    ivaFacturado: "0.00", // SL-39: los conceptos de la fixtura no llevan IVA
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
        // Quien abre este detalle es la central (acceso total): ve el fulfillment (ficha 481).
        audiencia="admin"
      />
    </SWRConfig>,
  );

  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Ver / conciliar el cierre de bodega de Limón" }),
  );
  const dialogo = await screen.findByRole("dialog", { name: /^Detalle del cierre de bodega · / });
  // SLT-104: las gestiones viven en la pestaña «Gestiones» del detalle único.
  await user.click(within(dialogo).getByRole("tab", { name: /^Gestiones \(/ }));
  return user;
}

/** SLT-104 (R41, R113): UNA lista con las gestiones de todos los cierres del día. */
const lista = () => screen.getByRole("region", { name: "Órdenes del cierre" });

const FILTRO = /^(Todas|Entregado|Reprogramado|Novedad|Devolución a origen por rechazo|Incidente|Con señales) \d+$/;

/** Los filtros por resultado, como se leen: rótulo y conteo. */
function filtros(): string[] {
  return within(screen.getByRole("dialog"))
    .getAllByRole("button")
    .map((b) => b.textContent ?? "")
    .filter((t) => FILTRO.test(t));
}

async function filtrar(user: ReturnType<typeof userEvent.setup>, rotulo: string) {
  const boton = within(screen.getByRole("dialog"))
    .getAllByRole("button")
    .find((b) => FILTRO.test(b.textContent ?? "") && (b.textContent ?? "").startsWith(`${rotulo} `));
  if (!boton) throw new Error(`sin filtro «${rotulo}»`);
  await user.click(boton);
}

/** Las celdas de una fila (guía, destinatario · tienda, mensajero, resultado, importes, señales). */
function celdasDe(fila: Element): string[] {
  return [...fila.firstElementChild!.children].map((c) => c.textContent ?? "");
}

/** [guía, mensajero] de cada fila visible, en orden. */
function filas(): string[][] {
  return [...lista().querySelectorAll("[data-gestion]")].map((f) => {
    const c = celdasDe(f);
    return [c[0]!, c[2]!];
  });
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
  return boton.closest("[data-gestion]") as HTMLElement;
}

const BOTON_ENTREGA = "Desglose de ingreso de la orden REM-E1 · Carla Entregada";
const BOTON_RECHAZO = "Desglose de ingreso de la orden REM-D1 · Diana Devuelta";

/** Las tarjetas de la fila desplegada: [nombre accesible, texto], para comparar dos pantallas. */
function tarjetas(fila: HTMLElement): string[][] {
  return [...fila.querySelectorAll("section[aria-label]")].map((s) => [
    s.getAttribute("aria-label") ?? "",
    s.textContent ?? "",
  ]);
}

/**
 * Lo que la fila desplegada de la ENTREGA tiene que decir, en literal (importes del fixture pasados
 * por `money()` a mano). SLT-104: ya no es el texto de la fila de la 478 sino el de la fila única de
 * SLT-101 en «solo lectura» (R31, R113; canvas `FilaSoloLectura.dc.html`): tarjetas en cascada en
 * lugar de «Flete + IVA: …» y sin la línea de ubicación (PA6 de SLT-101: solo datos de la orden).
 */
const TEXTOS_ENTREGA_DESPLEGADA = [
  "REM-E1",
  "Caja mediana",
  "Calle Sol 12",
  "Efectivo₡5.000,25",
  "+ SINPE₡3.000,25",
  "Recibió₡8.000,50",
  "Flete por entregado + IVA₡2.260",
  "+ Comisión COD + IVA₡800",
  "Se le cobra₡3.060",
  "Se le paga₡1.200,40",
  "Fulfillment₡350,50",
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// SLT-104 «Detalle de cierre de bodega en el detalle único (central)»: las cinco pestañas por
// mensajero de la 478 pasan a ser los filtros por resultado, con su conteo, de UNA lista con la
// columna Mensajero (R41, R113). Lo que vigilaban se sigue vigilando sobre esa lista.
describe("478 · gestiones por resultado, con su mensajero (R1-R5 → SLT-104 R41, R113)", () => {
  it("R1: los filtros por resultado llevan el conteo de TODOS los cierres del día", async () => {
    await abrirDetalle();
    expect(filtros()).toEqual([
      "Todas 7",
      "Entregado 3",
      "Reprogramado 1",
      "Novedad 1",
      "Devolución a origen por rechazo 1",
      "Incidente 1",
      // Vuelven a bodega la reprogramada, la novedad y la devolución; el incidente lleva su causa.
      "Con señales 4",
    ]);
  });

  it("R2: abre en «Todas», por resultado y, dentro, en el orden de los cierres del día, cada una con su mensajero", async () => {
    await abrirDetalle();
    expect(filas()).toEqual([
      ["5001", "Ana Mensajera"],
      ["6001", "Beto Mensajero"],
      ["6002", "Beto Mensajero"],
      ["5002", "Ana Mensajera"],
      ["5003", "Ana Mensajera"],
      ["5004", "Ana Mensajera"],
      ["5005", "Ana Mensajera"],
    ]);
  });

  it("R3: un resultado sin gestiones muestra el texto de sección vacía del resultado", async () => {
    const user = await abrirDetalle(grupos478({ entregado: [ENTREGA_478] }));
    await filtrar(user, "Novedad");
    expect(within(lista()).getByText("No hay gestiones con resultado «Novedad».")).toBeInTheDocument();
  });

  it("R4: filtrar un resultado deja las de los dos mensajeros y solo ese resultado", async () => {
    const user = await abrirDetalle();
    await filtrar(user, "Entregado");
    expect(filas()).toEqual([
      ["5001", "Ana Mensajera"],
      ["6001", "Beto Mensajero"],
      ["6002", "Beto Mensajero"],
    ]);
  });

  it("R5: la fila compacta enseña guía, destinatario · tienda, mensajero, resultado, recibido, cobro y pago", async () => {
    await abrirDetalle();
    const fila = within(lista()).getByRole("button", { name: BOTON_ENTREGA }).closest("[data-gestion]")!;
    expect(celdasDe(fila).slice(0, 7)).toEqual([
      "5001",
      "Carla Entregada · Tienda Norte",
      "Ana Mensajera",
      "Entregado",
      "₡8.000,50",
      "₡3.060",
      "₡1.200,40",
    ]);
    expect(lista()).toHaveTextContent("Mensajero");
    expect(lista()).toHaveTextContent("Cobro a la tienda");
  });
});

describe("478 · lo que enseña la fila desplegada (R6-R9)", () => {
  it("R6: al desplegar una entregada enseña la orden, lo recibido por método, el cobro, el pago y el fulfillment", async () => {
    const user = await abrirDetalle();
    const fila = await desplegar(user, lista(), BOTON_ENTREGA);
    for (const texto of TEXTOS_ENTREGA_DESPLEGADA) {
      expect(fila, `falta «${texto}»`).toHaveTextContent(texto);
    }
  });

  it("R6: una reprogramada se lee como tal en su fila", async () => {
    const user = await abrirDetalle();
    await filtrar(user, "Reprogramado");
    expect(filas()).toEqual([["5002", "Ana Mensajera"]]);
    expect(within(lista()).getByText("Raúl Reprogramado")).toBeInTheDocument();
  });

  it("R7: una devolución por rechazo enseña el flete por devolución, su pago y la marca de rechazo automático", async () => {
    const user = await abrirDetalle();
    await filtrar(user, "Devolución a origen por rechazo");
    const fila = await desplegar(user, lista(), BOTON_RECHAZO);
    expect(fila).toHaveTextContent("Flete por devolución a origen + IVA₡1.356");
    expect(fila).toHaveTextContent("Se le paga₡600,10");
    expect(fila).toHaveTextContent("Rechazo automático");
    expect(fila).not.toHaveTextContent("Manual");
  });

  it("R8: al desplegar una gestión con snapshot enseña de qué se compone el cobro a la tienda", async () => {
    const user = await abrirDetalle();
    const fila = await desplegar(user, lista(), BOTON_ENTREGA);
    expect(
      within(fila).getByRole("region", { name: "Se le cobra a la tienda de la orden REM-E1 · Carla Entregada" }),
    ).toBeInTheDocument();
    expect(within(fila).getByRole("button", { name: "Ver cómo se calculó" })).toBeInTheDocument();
  });

  it("R9: la misma gestión enseña las mismas tarjetas en el detalle de bodega y en el del cierre de mensajero", async () => {
    // (1) Detalle de bodega.
    const user = await abrirDetalle();
    const enBodega = tarjetas(await desplegar(user, lista(), BOTON_ENTREGA));
    expect(enBodega).toHaveLength(4);
    cleanup();

    // (2) La lista del detalle del cierre de mensajero, como la monta la central (`CierresAdminModule`).
    render(
      <GestionesCierre
        gestiones={[{ gestion: ENTREGA_478 }]}
        audiencia="central"
        quienMiraEsCentral
        congeladoAt={null}
        acciones={{}}
      />,
    );
    const user2 = userEvent.setup();
    const enMensajero = tarjetas(
      await desplegar(user2, screen.getByRole("region", { name: "Órdenes del cierre" }), BOTON_ENTREGA),
    );
    expect(enMensajero).toEqual(enBodega);
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

  for (const [resultado, boton, g] of CASOS) {
    it(`R10: ofrece Ver evidencia en una gestión «${resultado}» con evidencia`, async () => {
      const user = await abrirDetalle();
      await filtrar(user, resultado);
      const fila = await desplegar(user, lista(), boton);
      expect(
        within(fila).getByRole("button", {
          name: `Ver evidencia de la orden ${g.numRemision} · ${g.destinatario}`,
        }),
      ).toBeInTheDocument();
    });
  }

  it("R11: sin evidencia no hay botón Ver evidencia", async () => {
    const user = await abrirDetalle();
    for (const nombre of [
      "Detalle de la orden REM-B1 · Bea Sin Foto",
      "Detalle de la orden REM-B2 · Bruno Sin Foto",
    ]) {
      const fila = await desplegar(user, lista(), nombre);
      expect(within(fila).queryByRole("button", { name: /Ver evidencia/ })).toBeNull();
    }
  });

  it("R12: Ver evidencia abre el visor con la URL firmada de esa gestión", async () => {
    const user = await abrirDetalle();
    await filtrar(user, "Novedad");
    const fila = await desplegar(user, lista(), "Detalle de la orden REM-N1 · Nora Novedad");
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

describe("478 · solo lectura (R14-R15; SLT-104 R31)", () => {
  it("R14: sin Corregir métodos de pago ni Corregir el resultado, aunque la gestión sea una entregada con pagos", async () => {
    const user = await abrirDetalle();
    const fila = await desplegar(user, lista(), BOTON_ENTREGA);
    expect(within(fila).queryByRole("button", { name: /Corregir métodos de pago/ })).toBeNull();
    expect(within(fila).queryByRole("button", { name: /Corregir el resultado/ })).toBeNull();
    // Y en ninguna parte del detalle.
    expect(screen.queryByText("Corregir métodos de pago")).toBeNull();
    expect(screen.queryByText("Corregir el resultado")).toBeNull();
  });

  it("R15: el detalle de bodega no ofrece Aprobar ni Rechazar en ninguna parte", async () => {
    await abrirDetalle();
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: /Aprobar|Rechazar/ })).toBeNull();
  });
});

// SLT-104: la 478 daba a cada mensajero su región «Órdenes del cierre · <X>» porque el modal montaba N
// listas. El detalle único monta UNA (R41, R113) y el mensajero va en su columna.
describe("478 · accesibilidad (R17 → SLT-104 R41, R113)", () => {
  it("una sola región de gestiones en el detalle, con nombre, y el mensajero en cada fila", async () => {
    await abrirDetalle();
    const nombres = screen
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-label") ?? "")
      .filter((n) => n.startsWith("Órdenes del cierre"));
    expect(nombres).toEqual(["Órdenes del cierre"]);
    expect(new Set(filas().map(([, m]) => m))).toEqual(new Set(["Ana Mensajera", "Beto Mensajero"]));
  });
});
