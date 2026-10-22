// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { BotonesEvidencia } from "@/app/(app)/cierres-admin/_components/botones-evidencia";
import {
  CierreFacturaDetalle,
  GestionesPorResultado,
  type CierreFacturaCabecera,
} from "@/app/(app)/cierres-admin/_components/cierre-factura";
import { CierreDiaModule } from "@/app/(app)/cierre-dia/_components/CierreDiaModule";
import { listarCierresPasadosPaginado, verCierrePasado } from "@/lib/actions/cierre-dia";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierrePasadoDTO,
} from "@/lib/interfaces/services/ICierreDiaService";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { gestion478, grupos478 } from "@/tests/fixtures/gestion-detalle-478";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";

/**
 * FICHA 486 — una gestión con varias fotos enseña TODAS en los cierres (R12-R16).
 *
 * El servidor ya entrega `evidenciaUrls` (firmadas, en orden de `indice`). Aquí se prueba lo que
 * ve el usuario: 1 foto → «Ver evidencia» como siempre; N → «Ver evidencia 1..N» en orden; cada
 * botón abre SU url; sin fotos, ningún botón. Y en cada superficie que hoy ofrece «Ver evidencia»:
 *
 *  - S1 detalle de cierre de mensajero (admin/maestro): `CierreFacturaDetalle` audiencia admin.
 *  - S2 detalle de cierre de bodega: `GestionesPorResultado` con `contexto`, el componente que
 *    `CierresBodegaAdminModule` monta una vez por mensajero (478).
 *  - S3 vistas del mensajero: el cierre pasado (comprobante en variante `mensajero`, abierto por
 *    el flujo real con su visor) y las tablas de rechazo e incidente del cierre en vivo.
 *
 * Nota: el panel de corrección del cierre rechazado (477) NO ofrece «Ver evidencia» hoy (lista
 * sin columna de evidencia), así que no hay superficie que cambiar ahí; R16 se limita a «donde hoy
 * se ofrece».
 *
 * Todos los rótulos se comparan contra LITERALES escritos a mano, nunca contra la constante que
 * los emite.
 */

vi.mock("@/lib/actions/cierre-dia", () => ({
  solicitarCierre: vi.fn(),
  listarCierreDia: vi.fn(),
  deshacerGestion: vi.fn(),
  verCierrePasado: vi.fn(),
  listarCierresPasadosPaginado: vi.fn(),
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const URL_1 = "https://signed.example/evidencias/g1-0.jpg?token=uno";
const URL_2 = "https://signed.example/evidencias/g1-1.jpg?token=dos";
const URL_3 = "https://signed.example/evidencias/g1-2.jpg?token=tres";
const TRES = [URL_1, URL_2, URL_3];
const UNA = "https://signed.example/evidencias/g2-0.jpg?token=sola";

function rechazo(
  gestionId: string,
  numRemision: string,
  destinatario: string,
  urls: string[],
): CierreDetalleGestion {
  return gestion478({
    gestionId,
    resultado: "devolucion_a_origen_por_rechazo",
    numRemision,
    destinatario,
    motivo: "Cliente ausente",
    evidenciaUrl: urls[0] ?? null,
    evidenciaUrls: urls,
  });
}

function incidente(
  gestionId: string,
  numRemision: string,
  destinatario: string,
  urls: string[],
): CierreDetalleGestion {
  return gestion478({
    gestionId,
    resultado: "incidente",
    numRemision,
    destinatario,
    causaIncidente: "robado",
    motivo: "Robo en la parada",
    evidenciaUrl: urls[0] ?? null,
    evidenciaUrls: urls,
  });
}

/** Tres gestiones de rechazo: con 3 fotos, con 1 y sin ninguna. */
function gruposMixtos(): CierreGrupos {
  return grupos478({
    devolucion_a_origen_por_rechazo: [
      rechazo("g1", "REM-TRES", "Tere Tres", TRES),
      rechazo("g2", "REM-UNA", "Úrsula Una", [UNA]),
      rechazo("g3", "REM-NADA", "Nico Nada", []),
    ],
  });
}

const CABECERA: CierreFacturaCabecera = {
  cierreId: "c486",
  estado: "solicitado",
  destinoTipo: "bodega_central",
  destinoZonaNombre: "GAM",
  mensajeroNombre: "Ana Mensajera",
  totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
  totalPagoMensajero: "0.00",
  totalIngresoBodegaRechazos: "0.00",
  solicitadoAt: "2026-10-20T10:00:00.000Z",
  resueltoAt: null,
  motivoRechazo: null,
};

type Usuario = ReturnType<typeof userEvent.setup>;

/** Despliega la fila por su botón y devuelve el contenedor completo de la fila. */
async function desplegar(user: Usuario, ambito: HTMLElement, nombre: string) {
  const boton = within(ambito).getByRole("button", { name: nombre });
  await user.click(boton);
  expect(boton).toHaveAttribute("aria-expanded", "true");
  return boton.parentElement as HTMLElement;
}

/** Nombres VISIBLES de los botones de evidencia de un ámbito, en orden de documento. */
function rotulosEvidencia(ambito: HTMLElement): string[] {
  return within(ambito)
    .queryAllByRole("button", { name: /Ver evidencia/ })
    .map((b) => b.textContent ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// El componente, aislado (R12-R15)
// ---------------------------------------------------------------------------

describe("486 · BotonesEvidencia", () => {
  it("R12: una evidencia → un único botón «Ver evidencia», con el aria-label de siempre", () => {
    render(
      <BotonesEvidencia urls={[UNA]} onVer={vi.fn()} ariaSufijo="de la orden REM-UNA · Úrsula Una" />,
    );
    const botones = screen.getAllByRole("button");
    expect(botones).toHaveLength(1);
    expect(botones[0]).toHaveTextContent(/^Ver evidencia$/);
    expect(botones[0]).toHaveAccessibleName("Ver evidencia de la orden REM-UNA · Úrsula Una");
  });

  it("R13: tres evidencias → «Ver evidencia 1», «2» y «3», en el orden recibido", () => {
    render(
      <BotonesEvidencia urls={TRES} onVer={vi.fn()} ariaSufijo="de la orden REM-TRES · Tere Tres" />,
    );
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Ver evidencia 1",
      "Ver evidencia 2",
      "Ver evidencia 3",
    ]);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Ver evidencia 1 de 3 de la orden REM-TRES · Tere Tres",
      "Ver evidencia 2 de 3 de la orden REM-TRES · Tere Tres",
      "Ver evidencia 3 de 3 de la orden REM-TRES · Tere Tres",
    ]);
  });

  it("R14: pulsar «Ver evidencia 2» entrega la URL 2 (y cada botón la suya)", async () => {
    const user = userEvent.setup();
    const onVer = vi.fn();
    render(<BotonesEvidencia urls={TRES} onVer={onVer} />);
    await user.click(screen.getByRole("button", { name: "Ver evidencia 2" }));
    expect(onVer).toHaveBeenLastCalledWith(URL_2);
    await user.click(screen.getByRole("button", { name: "Ver evidencia 3" }));
    expect(onVer).toHaveBeenLastCalledWith(URL_3);
    await user.click(screen.getByRole("button", { name: "Ver evidencia 1" }));
    expect(onVer).toHaveBeenLastCalledWith(URL_1);
    expect(onVer).toHaveBeenCalledTimes(3);
  });

  it("R15: sin evidencias no pinta ningún botón", () => {
    const { container } = render(<BotonesEvidencia urls={[]} onVer={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});

// ---------------------------------------------------------------------------
// R16 — S1: detalle de cierre de mensajero de admin/maestro
// ---------------------------------------------------------------------------

describe("486 · R16 · S1 detalle de cierre de mensajero (admin)", () => {
  function montar(onVerEvidencia = vi.fn()) {
    render(
      <CierreFacturaDetalle
        cierre={CABECERA}
        grupos={gruposMixtos()}
        onVerEvidencia={onVerEvidencia}
      />,
    );
    return { user: userEvent.setup(), onVerEvidencia };
  }

  it("3 fotos → tres botones numerados; 1 foto → «Ver evidencia»; 0 → ninguno", async () => {
    const { user } = montar();
    const hoja = screen.getByRole("region", {
      name: "Comprobante detallado del cierre de Ana Mensajera",
    });

    const tres = await desplegar(user, hoja, "Detalle de la orden REM-TRES · Tere Tres");
    expect(rotulosEvidencia(tres)).toEqual(["Ver evidencia 1", "Ver evidencia 2", "Ver evidencia 3"]);

    const una = await desplegar(user, hoja, "Detalle de la orden REM-UNA · Úrsula Una");
    expect(
      within(una).getByRole("button", { name: "Ver evidencia de la orden REM-UNA · Úrsula Una" }),
    ).toHaveTextContent(/^Ver evidencia$/);

    const nada = await desplegar(user, hoja, "Detalle de la orden REM-NADA · Nico Nada");
    expect(rotulosEvidencia(nada)).toEqual([]);
  });

  it("pulsar «Ver evidencia 2» abre el visor con la URL 2 de ESA gestión", async () => {
    const { user, onVerEvidencia } = montar();
    const hoja = screen.getByRole("region", {
      name: "Comprobante detallado del cierre de Ana Mensajera",
    });
    const tres = await desplegar(user, hoja, "Detalle de la orden REM-TRES · Tere Tres");
    await user.click(
      within(tres).getByRole("button", {
        name: "Ver evidencia 2 de 3 de la orden REM-TRES · Tere Tres",
      }),
    );
    expect(onVerEvidencia).toHaveBeenCalledTimes(1);
    expect(onVerEvidencia).toHaveBeenCalledWith(URL_2);
  });
});

// ---------------------------------------------------------------------------
// R16 — S2: detalle de cierre de bodega (la lista por mensajero)
// ---------------------------------------------------------------------------

describe("486 · R16 · S2 detalle de cierre de bodega", () => {
  it("la lista de un mensajero ofrece una evidencia por foto y abre la que se pulsa", async () => {
    const user = userEvent.setup();
    const onVerEvidencia = vi.fn();
    render(
      <GestionesPorResultado
        grupos={grupos478({
          incidente: [incidente("g9", "REM-INC", "Iván Incidente", TRES)],
        })}
        contexto="Ana Mensajera"
        onVerEvidencia={onVerEvidencia}
      />,
    );
    const region = screen.getByRole("region", { name: "Órdenes del cierre · Ana Mensajera" });
    const fila = await desplegar(user, region, "Detalle de la orden REM-INC · Iván Incidente");
    expect(rotulosEvidencia(fila)).toEqual(["Ver evidencia 1", "Ver evidencia 2", "Ver evidencia 3"]);

    await user.click(
      within(fila).getByRole("button", {
        name: "Ver evidencia 3 de 3 de la orden REM-INC · Iván Incidente",
      }),
    );
    expect(onVerEvidencia).toHaveBeenCalledWith(URL_3);
  });
});

// ---------------------------------------------------------------------------
// R16 — S3: vistas del mensajero (cierre pasado y tablas del cierre en vivo)
// ---------------------------------------------------------------------------

const CIERRE_PASADO: CierrePasadoDTO = {
  cierreId: "c-pasado",
  estado: "aprobado",
  destinoTipo: "bodega_central",
  destinoZonaId: "z1",
  totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
  totalPagoMensajero: "0.00",
  totalIngresoBodegaRechazos: "0.00",
  solicitadoAt: "2026-10-19T10:00:00.000Z",
  resueltoAt: "2026-10-20T09:00:00.000Z",
  motivoRechazo: null,
};

function montarCierreDia(grupos: CierreGrupos, cierresPasados: CierrePasadoDTO[] = []) {
  const pagina = paginaInicial(cierresPasados);
  vi.mocked(listarCierresPasadosPaginado).mockResolvedValue({ status: "ok", page: 1, ...pagina });
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierreDiaModule
        grupos={grupos}
        totales={{ efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" }}
        totalPagoMensajero="0.00"
        puedesSolicitar
        motivoBloqueo={null}
        cierresPasados={pagina}
        bloqueo={SIN_BLOQUEO}
      />
    </SWRConfig>,
  );
  return userEvent.setup();
}

async function srcDelVisor(): Promise<string | null> {
  const dialogo = await screen.findByRole("dialog", { name: "Evidencia de la gestión" });
  return within(dialogo)
    .getByRole("img", { name: "Evidencia fotográfica de la gestión" })
    .getAttribute("src");
}

describe("486 · R16 · S3 vistas del mensajero", () => {
  it("cierre pasado: el comprobante ofrece una evidencia por foto y el visor abre la 2", async () => {
    vi.mocked(verCierrePasado).mockResolvedValue({
      status: "ok",
      cierre: CIERRE_PASADO,
      grupos: grupos478({
        devolucion_a_origen_por_rechazo: [rechazo("g1", "REM-TRES", "Tere Tres", TRES)],
      }),
      ordenesSinGestion: [],
      sinGestionRegistrado: true,
      rechazosDeTienda: [],
    });
    const user = montarCierreDia(grupos478(), [CIERRE_PASADO]);

    const region = screen.getByRole("region", { name: "Cierres solicitados" });
    await user.click(within(region).getByRole("button", { name: /^Ver del cierre/ }));
    const comprobante = await screen.findByRole("region", {
      name: "Comprobante detallado de tu cierre",
    });
    const fila = await desplegar(user, comprobante, "Detalle de la orden REM-TRES · Tere Tres");
    expect(rotulosEvidencia(fila)).toEqual(["Ver evidencia 1", "Ver evidencia 2", "Ver evidencia 3"]);

    await user.click(
      within(fila).getByRole("button", {
        name: "Ver evidencia 2 de 3 de la orden REM-TRES · Tere Tres",
      }),
    );
    expect(await srcDelVisor()).toBe(URL_2);
  });

  it("en vivo, tabla de rechazos: 3 fotos → 3 botones, 1 → «Ver evidencia», 0 → «—»", async () => {
    const user = montarCierreDia(gruposMixtos());
    const tabla = screen.getByRole("region", { name: "Devolución a origen por rechazo" });

    const filaDe = (remision: string) =>
      within(tabla).getByText(remision).closest("tr") as HTMLElement;

    expect(rotulosEvidencia(filaDe("REM-TRES"))).toEqual([
      "Ver evidencia 1",
      "Ver evidencia 2",
      "Ver evidencia 3",
    ]);
    expect(rotulosEvidencia(filaDe("REM-UNA"))).toEqual(["Ver evidencia"]);
    expect(rotulosEvidencia(filaDe("REM-NADA"))).toEqual([]);
    // La celda de la columna «Evidencia» de esa fila dice «—», como hoy.
    const encabezados = within(tabla)
      .getAllByRole("columnheader")
      .map((th) => th.textContent?.trim() ?? "");
    const col = encabezados.indexOf("Evidencia");
    expect(col).toBeGreaterThanOrEqual(0);
    expect(within(filaDe("REM-NADA")).getAllByRole("cell")[col]).toHaveTextContent(/^—$/);

    await user.click(within(filaDe("REM-TRES")).getByRole("button", { name: "Ver evidencia 3" }));
    expect(await srcDelVisor()).toBe(URL_3);
  });

  it("en vivo, tabla de incidentes: un botón por foto y el visor abre la 2", async () => {
    const user = montarCierreDia(
      grupos478({ incidente: [incidente("g7", "REM-INC", "Iván Incidente", TRES)] }),
    );
    const tabla = screen.getByRole("region", { name: "Incidente" });
    const fila = within(tabla).getByText("REM-INC").closest("tr") as HTMLElement;
    expect(rotulosEvidencia(fila)).toEqual(["Ver evidencia 1", "Ver evidencia 2", "Ver evidencia 3"]);

    await user.click(within(fila).getByRole("button", { name: "Ver evidencia 2" }));
    expect(await srcDelVisor()).toBe(URL_2);
  });
});
