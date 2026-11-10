// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// `next/link` como `<a>` plano que pasa el `onClick`: aquí se afirma el `href` y que pulsar llama a
// `onVerSuCierre`, no la navegación de Next.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { DetalleCierre } from "@/components/private/cierres/detalle/DetalleCierre";
import { Cuenta } from "@/components/private/cierres/detalle/Cuenta";
import { ConciliacionCierreBodega } from "@/components/private/cierres/detalle/ConciliacionCierreBodega";
import { MensajerosCierreBodega } from "@/components/private/cierres/detalle/MensajerosCierreBodega";
import {
  filasMensajeros,
  vistaBodegaDesdeAdmin,
  type DetalleBodegaVista,
} from "@/components/private/cierres/detalle/detalle-cierre-vista";
import type { CierreBodegaDetalleServiceResult } from "@/lib/interfaces/services/ICierresBodegaAdminService";
import type { CierreDetalleGestion } from "@/lib/interfaces/services/ICierreDiaService";

// SLT-104 «Detalle de cierre de bodega en el detalle único (central)» (T3.2; R42, R43, R114, R115,
// R117, R121) — el detalle de bodega con sus dos pestañas nuevas, «Mensajeros» y «Conciliación», con
// dobles del servidor. Los importes son los del canvas («Central 8», `Main.dc.html`) y lo que pinta
// `money()` va ESCRITO A MANO (derivado en `progress/impl_SLT-104.md > T0.3`): miles «.», decimales
// «,», sin cola con céntimos cero.

afterEach(cleanup);

type Ok = Extract<CierreBodegaDetalleServiceResult, { status: "ok" }>;
type CierreDia = Ok["cierres"][number];

function g(id: string, resultado: CierreDetalleGestion["resultado"]): CierreDetalleGestion {
  return { gestionId: id, resultado, indemnizacion: null, ajustesPago: [], ingresoEmpresa: null } as unknown as CierreDetalleGestion;
}
const VACIOS = { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] };

const ANA = {
  cierreDiaId: "cd-ana",
  mensajeroId: "m-ana",
  mensajeroNombre: "Ana Mensajera",
  totales: { efectivo: "80000.10", simpe: "0.00", transferencia: "0.00", general: "80000.10" },
  totalPagoMensajero: "9000.30",
  totalIngresoBodegaRechazos: "250.25",
  paraLaCentral: "70749.55",
  gestionesAjustadas: 2,
  grupos: { ...VACIOS, entregado: [g("a1", "entregado"), g("a2", "entregado")], incidente: [g("a3", "incidente")] },
} as unknown as CierreDia;

const BETO = {
  cierreDiaId: "cd-beto",
  mensajeroId: "m-beto",
  mensajeroNombre: "Beto Mensajero",
  totales: { efectivo: "46089.07", simpe: "0.00", transferencia: "0.00", general: "46089.07" },
  totalPagoMensajero: "5000.25",
  totalIngresoBodegaRechazos: "0.00",
  paraLaCentral: "41088.82",
  grupos: { ...VACIOS, entregado: [g("b1", "entregado")], reprogramado: [g("b2", "reprogramado")] },
} as unknown as CierreDia;

function resultado(cierres: CierreDia[], marca: Partial<Ok["cierre"]> = {}): Ok {
  return {
    status: "ok",
    cierre: {
      cierreBodegaId: "11111111-2222-4333-8444-0000c07b3e19",
      zonaNombre: "Limón",
      solicitadoPorNombre: "Sara Satélite",
      solicitadoAt: "2026-11-08T01:05:00.000Z",
      conciliado: false,
      desmarcable: false,
      montoRecibido: null,
      faltaPorRecibir: "111838.37",
      conciliadoAt: null,
      conciliadoPorNombre: null,
      conciliadoNota: null,
      totales: { efectivo: "126089.17", simpe: "0.00", transferencia: "0.00", general: "126089.17" },
      totalPagoMensajero: "14000.55",
      totalIngresoBodegaRechazos: "250.25",
      paraLaCentral: "111838.37",
      ...marca,
    },
    cierres,
    totalesIngreso: { fleteConIva: "0.00", comisionConIva: "0.00", fleteDevolucionConIva: "0.00", total: "0.00" },
    ivaFacturado: "0.00",
    pagoTienda: "0.00",
    cobradoSobreRecaudado: "0.00",
    netoEmpresa: "0.00",
    partesPorTienda: [],
    paraLaCentral: "111838.37",
    efectivoCubreDescuentos: true,
  } as unknown as Ok;
}

function montar(r: Ok, onVerSuCierre?: (href: string) => void) {
  const vista: DetalleBodegaVista = vistaBodegaDesdeAdmin(r);
  return render(
    <DetalleCierre
      tipo="bodega"
      marco="modal"
      audiencia="central"
      modo={r.cierre.conciliado ? "solo lectura" : "decidir"}
      detalle={vista}
      pestanas={{
        gestiones: <p>Gestiones del doble</p>,
        mensajeros: <MensajerosCierreBodega filas={filasMensajeros(r.cierres)} onVerSuCierre={onVerSuCierre} />,
        conciliacion: <ConciliacionCierreBodega detalle={vista} />,
      }}
      acciones={{}}
      onCerrar={() => {}}
    />,
  );
}

const celdas = (fila: HTMLElement) => within(fila).getAllByRole("cell").map((c) => c.textContent);

describe("R42, R114 — «Mensajeros»: una fila por cierre del día, con los importes de `money()`", () => {
  it("columnas del canvas y las dos filas en el orden del servidor, señales y «Ver su cierre»", async () => {
    const user = userEvent.setup();
    montar(resultado([ANA, BETO]));
    await user.click(await screen.findByRole("tab", { name: "Mensajeros (2)" }));
    const tabla = screen.getByRole("table", { name: "Mensajeros del cierre de bodega" });
    const [cabecera, ...filas] = within(tabla).getAllByRole("row");
    expect(within(cabecera!).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Mensajero",
      "Gestiones",
      "Recaudado",
      "Pago",
      "A la central",
      "Señales",
      "",
    ]);
    expect(filas.map(celdas)).toEqual([
      ["Ana Mensajera", "3", "₡80.000,10", "₡9.000,30", "₡70.749,55", "2 pagos ajustados", "Ver su cierre"],
      ["Beto Mensajero", "2", "₡46.089,07", "₡5.000,25", "₡41.088,82", "—", "Ver su cierre"],
    ]);
  });

  it("los cuatro números van a la derecha", async () => {
    const user = userEvent.setup();
    montar(resultado([ANA]));
    await user.click(await screen.findByRole("tab", { name: "Mensajeros (1)" }));
    const [, fila] = within(screen.getByRole("table")).getAllByRole("row");
    const c = within(fila!).getAllByRole("cell");
    for (const i of [1, 2, 3, 4]) expect(c[i]!.className).toContain("text-right");
    expect(c[0]!.className).not.toContain("text-right");
  });

  it("A la central negativo sale con su signo", async () => {
    const user = userEvent.setup();
    montar(resultado([{ ...BETO, paraLaCentral: "-500.25" } as CierreDia]));
    await user.click(await screen.findByRole("tab", { name: "Mensajeros (1)" }));
    const [, fila] = within(screen.getByRole("table")).getAllByRole("row");
    expect(celdas(fila!)[4]).toBe("-₡500,25");
  });
});

describe("R115 — «Ver su cierre»: nombre único y enlace al detalle de ese cierre del día", () => {
  it("cada enlace se llama «Ver el cierre de <mensajero>», apunta a ?cierre=<id> y pulsarlo llama a onVerSuCierre", async () => {
    const user = userEvent.setup();
    const onVerSuCierre = vi.fn();
    montar(resultado([ANA, BETO]), onVerSuCierre);
    await user.click(await screen.findByRole("tab", { name: "Mensajeros (2)" }));
    const enlace = screen.getByRole("link", { name: "Ver el cierre de Beto Mensajero" });
    expect(enlace.getAttribute("href")).toBe("/cierres-admin?cierre=cd-beto");
    expect(screen.getByRole("link", { name: "Ver el cierre de Ana Mensajera" }).getAttribute("href")).toBe(
      "/cierres-admin?cierre=cd-ana",
    );
    await user.click(enlace);
    expect(onVerSuCierre).toHaveBeenCalledTimes(1);
    expect(onVerSuCierre).toHaveBeenCalledWith("/cierres-admin?cierre=cd-beto");
  });
});

describe("R121 (PA2) — la pestaña cuenta filas; la cabecera, mensajeros", () => {
  it("dos cierres del día del mismo mensajero: «Mensajeros (2)» y la cabecera dice «1 mensajero»", async () => {
    const user = userEvent.setup();
    montar(resultado([ANA, { ...ANA, cierreDiaId: "cd-ana-2" } as CierreDia]));
    const tab = await screen.findByRole("tab", { name: "Mensajeros (2)" });
    expect(screen.queryByRole("tab", { name: "Mensajeros (1)" })).toBeNull();
    const dialogo = screen.getByRole("dialog");
    expect(dialogo.querySelector("header")!.textContent).toContain("Bodega satélite · lo solicitó Sara Satélite · 1 mensajero");
    await user.click(tab);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3);
  });
});

describe("R43, R117 — «Conciliación»: cuenta en cascada y quién marcó", () => {
  async function abrirConciliacion(r: Ok) {
    const user = userEvent.setup();
    montar(r);
    await user.click(await screen.findByRole("tab", { name: "Conciliación" }));
    return screen.getByRole("region", { name: "Conciliación" });
  }
  const lineas = (cuenta: HTMLElement) =>
    [...cuenta.querySelectorAll("[data-signo]")].map((l) => [
      l.querySelector("[data-rotulo]")!.textContent,
      l.querySelector("[data-monto]")!.textContent,
      l.getAttribute("data-signo"),
      l.getAttribute("data-tipo"),
    ]);

  it("sin marca: «— Recibido» con «—» (nunca ₡0), falta = lo declarado, «Marcó: Aún nadie»", async () => {
    const cuenta = await abrirConciliacion(resultado([ANA, BETO]));
    expect(within(cuenta).getByRole("heading", { name: "Conciliación" })).toBeTruthy();
    expect(lineas(cuenta)).toEqual([
      ["Debe llegar a la central", "₡111.838,37", "neutro", "partida"],
      ["− Recibido", "—", "resta", "partida"],
      ["Falta por recibir", "₡111.838,37", "neutro", "total"],
    ]);
    expect(cuenta.querySelector("[data-sin-importe]")!.textContent).toContain("Recibido");
    expect(cuenta.textContent).not.toContain("₡0");
    expect(cuenta.querySelector("[data-notas]")!.textContent).toBe("Marcó: Aún nadie");
    expect(cuenta.className).toContain("max-w-[520px]");
  });

  it("con marca: lo recibido, falta ₡0 y «Marcó: Carlos R. · 2026-11-08 09:12»", async () => {
    const cuenta = await abrirConciliacion(
      resultado([ANA, BETO], {
        conciliado: true,
        montoRecibido: "111838.37",
        faltaPorRecibir: "0.00",
        conciliadoAt: "2026-11-08T15:12:00.000Z",
        conciliadoPorNombre: "Carlos R.",
      }),
    );
    expect(lineas(cuenta)).toEqual([
      ["Debe llegar a la central", "₡111.838,37", "neutro", "partida"],
      ["− Recibido", "₡111.838,37", "resta", "partida"],
      ["Falta por recibir", "₡0", "neutro", "total"],
    ]);
    expect(cuenta.querySelector("[data-sin-importe]")).toBeNull();
    expect(cuenta.querySelector("[data-notas]")!.textContent).toBe("Marcó: Carlos R. · 2026-11-08 09:12");
  });

  it("llegó de más: «Falta por recibir» negativo con su signo", async () => {
    const cuenta = await abrirConciliacion(
      resultado([ANA, BETO], {
        conciliado: true,
        montoRecibido: "112338.62",
        faltaPorRecibir: "-500.25",
        conciliadoAt: "2026-11-08T15:12:00.000Z",
        conciliadoPorNombre: "Carlos R.",
      }),
    );
    expect(lineas(cuenta)[2]).toEqual(["Falta por recibir", "-₡500,25", "neutro", "total"]);
  });
});

describe("R43 — `Cuenta` con `sinImporte` pinta «—» aunque llegue un importe", () => {
  it("la línea sin importe dice «—» y no el importe; las demás, su importe", () => {
    render(
      <Cuenta
        titulo="Cuenta de prueba"
        lineas={[
          { label: "Con importe", monto: "7000.00", signo: "neutro", tipo: "partida" },
          { label: "Sin importe", monto: "7000.00", signo: "resta", tipo: "partida", sinImporte: true },
        ]}
      />,
    );
    const montos = [...screen.getByRole("region", { name: "Cuenta de prueba" }).querySelectorAll("[data-monto]")].map(
      (m) => m.textContent,
    );
    expect(montos).toEqual(["₡7.000", "—"]);
  });
});
