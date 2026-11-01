// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CierreBodegaFacturaResumen,
  CierreFacturaDetalle,
  CierreFacturaResumen,
  CierreFacturaResumenPropio,
  type CierreFacturaCabecera,
} from "@/app/(app)/cierres-admin/_components/cierre-factura";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";
import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreGrupos, CierrePasadoDTO } from "@/lib/interfaces/services/ICierreDiaService";

/**
 * SLT-76 (R1) — LAS FECHAS DEL COMPROBANTE DE CIERRE SE LEEN EN EL CALENDARIO DE COSTA RICA.
 *
 * El instante es el de la observación de SLT-73 (tanda 12): `2026-11-01T05:03:00.000Z` son las
 * 23:03 del 31 de octubre en Costa Rica. Recortar el texto daba `2026-11-01`, el día UTC.
 *
 * Los dos literales (`2026-10-31` y `2026-11-01`) están escritos A MANO y no salen de
 * `fechaCalendarioCR`: compararlos contra la función que produce el texto estaría siempre verde.
 *
 * Superficies (design.md §1): la tarjeta compacta (cabecera y, desplegada, «Solicitado» /
 * «Resuelto»), «Conciliado el» del cierre de bodega, el comprobante propio del mensajero (texto y
 * nombre accesible) y la cabecera del detalle. Los datos son sintéticos.
 */

const INSTANTE = "2026-11-01T05:03:00.000Z";
/** 23:30 del 31 en Costa Rica: mismo día de negocio que `INSTANTE`. */
const INSTANTE_RESUELTO = "2026-11-01T05:30:00.000Z";
const DIA_CR = "2026-10-31";
const DIA_UTC = "2026-11-01";

const TOTALES = {
  efectivo: "5000.00",
  simpe: "0.00",
  transferencia: "3000.00",
  general: "8000.00",
};

function resumenAdmin(over: Partial<CierreAdminResumen> = {}): CierreAdminResumen {
  return {
    cierreId: "c7600001",
    mensajeroId: "m1",
    mensajeroNombre: "Mensajero Prueba",
    estado: "aprobado",
    destinoTipo: "bodega_central",
    destinoZonaId: "z1",
    destinoZonaNombre: "Zona Prueba",
    totales: TOTALES,
    totalPagoMensajero: "1200.00",
    totalIngresoBodegaRechazos: "0.00",
    pendientePagoMensajero: null,
    solicitadoAt: INSTANTE,
    resueltoAt: INSTANTE_RESUELTO,
    motivoRechazo: null,
    ...over,
  };
}

const CIERRE_BODEGA = {
  cierreBodegaId: "b7600001-1111-4111-8111-b1b1b1b1b1b1",
  zonaId: "z1",
  zonaNombre: "Zona Prueba",
  solicitadoPorId: "u1",
  solicitadoPorNombre: "Usuario Prueba",
  estado: "aprobado",
  totales: TOTALES,
  totalPagoMensajero: "1200.00",
  totalIngresoBodegaRechazos: "0.00",
  cantidadCierres: 1,
  solicitadoAt: INSTANTE,
  resueltoAt: INSTANTE_RESUELTO,
  motivoRechazo: null,
  paraLaCentral: "3800.00",
  efectivoCubreDescuentos: true,
  conciliado: true,
  montoRecibido: "3800.00",
  faltaPorRecibir: "0.00",
  conciliadoAt: INSTANTE,
  conciliadoPorNombre: "Usuario Central",
  conciliadoNota: null,
} as CierreBodegaResumen;

const PROPIO = {
  cierreId: "d7600001-1111-4111-8111-d1d1d1d1d1d1",
  estado: "aprobado",
  destinoTipo: "bodega_central",
  totales: TOTALES,
  totalPagoMensajero: "1200.00",
  totalIngresoBodegaRechazos: "0.00",
  solicitadoAt: INSTANTE,
  resueltoAt: INSTANTE_RESUELTO,
  motivoRechazo: null,
} as CierrePasadoDTO;

const CABECERA: CierreFacturaCabecera = {
  cierreId: "c7600001",
  estado: "aprobado",
  destinoTipo: "bodega_central",
  destinoZonaNombre: "Zona Prueba",
  mensajeroNombre: "Mensajero Prueba",
  totales: TOTALES,
  totalPagoMensajero: "1200.00",
  totalIngresoBodegaRechazos: "0.00",
  solicitadoAt: INSTANTE,
  resueltoAt: INSTANTE_RESUELTO,
  motivoRechazo: null,
};

const GRUPOS_VACIOS: CierreGrupos = {
  entregado: [],
  reprogramado: [],
  novedad: [],
  devolucion_a_origen_por_rechazo: [],
  incidente: [],
};

/** Valor de una línea `rótulo / valor` de las columnas del desplegable. */
function valorDeLinea(contenedor: HTMLElement, rotulo: string): string {
  const etiqueta = within(contenedor).getByText(rotulo, { exact: true });
  const fila = etiqueta.parentElement;
  expect(fila, `la línea «${rotulo}» no tiene fila`).not.toBeNull();
  return (fila!.textContent ?? "").replace(rotulo, "").trim();
}

afterEach(() => {
  cleanup();
});

describe("SLT-76 (R1) — el comprobante de cierre fecha en el calendario de Costa Rica", () => {
  it("tarjeta compacta del admin: la cabecera dice el 31, no el 1", () => {
    render(<CierreFacturaResumen cierre={resumenAdmin()} />);
    const hoja = screen.getByRole("region", {
      name: "Comprobante del cierre de Mensajero Prueba",
    });
    expect(within(hoja).getByText(DIA_CR)).toBeTruthy();
    expect(hoja.textContent).not.toContain(DIA_UTC);
  });

  it("tarjeta compacta del admin, desplegada: «Solicitado» y «Resuelto» dicen el 31", async () => {
    const user = userEvent.setup();
    render(<CierreFacturaResumen cierre={resumenAdmin()} />);
    await user.click(
      screen.getByRole("button", { name: "Ver detalles del cierre de Mensajero Prueba" }),
    );
    const fechas = screen.getByRole("region", { name: "Fechas" });
    expect(valorDeLinea(fechas, "Solicitado")).toBe(DIA_CR);
    expect(valorDeLinea(fechas, "Resuelto")).toBe(DIA_CR);
    const hoja = screen.getByRole("region", {
      name: "Comprobante del cierre de Mensajero Prueba",
    });
    expect(hoja.textContent).not.toContain(DIA_UTC);
  });

  it("cierre de bodega conciliado: «Conciliado el» dice el 31", async () => {
    const user = userEvent.setup();
    render(<CierreBodegaFacturaResumen cierre={CIERRE_BODEGA} />);
    await user.click(
      screen.getByRole("button", {
        name: "Ver detalles del cierre de bodega de Zona Prueba",
      }),
    );
    const conciliacion = screen.getByRole("region", { name: "Conciliación" });
    expect(valorDeLinea(conciliacion, "Conciliado el")).toBe(DIA_CR);
    const hoja = screen.getByRole("region", {
      name: "Comprobante del cierre de bodega de Zona Prueba",
    });
    expect(hoja.textContent).not.toContain(DIA_UTC);
  });

  it("comprobante propio del mensajero: el texto y el nombre accesible dicen el 31", () => {
    render(<CierreFacturaResumenPropio cierre={PROPIO} />);
    const hoja = screen.getByRole("region", { name: `Comprobante de tu cierre del ${DIA_CR}` });
    expect(within(hoja).getByText(DIA_CR)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: `Ver detalles de tu cierre del ${DIA_CR}` }),
    ).toBeTruthy();
    expect(hoja.textContent).not.toContain(DIA_UTC);
    expect(hoja.getAttribute("aria-label")).not.toContain(DIA_UTC);
  });

  it("cabecera del detalle: «Solicitado» y «Resuelto» dicen el 31", () => {
    render(<CierreFacturaDetalle cierre={CABECERA} grupos={GRUPOS_VACIOS} />);
    const hoja = screen.getByRole("region", {
      name: "Comprobante detallado del cierre de Mensajero Prueba",
    });
    expect(
      within(hoja).getByText(`Solicitado ${DIA_CR} · Resuelto ${DIA_CR}`, { exact: true }),
    ).toBeTruthy();
    expect(hoja.textContent).not.toContain(DIA_UTC);
  });

  it("una fecha ausente o que no es un instante se sigue pintando «—»", async () => {
    const user = userEvent.setup();
    // `solicitadoAt` es `string` en el DTO; el `null` se fuerza para probar la rama de `fecha()`
    // que la columna «Fechas» alcanza si el dato no llega.
    render(
      <CierreFacturaResumen
        cierre={resumenAdmin({
          solicitadoAt: null as unknown as string,
          resueltoAt: "no-es-un-instante",
        })}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Ver detalles del cierre de Mensajero Prueba" }),
    );
    const fechas = screen.getByRole("region", { name: "Fechas" });
    expect(valorDeLinea(fechas, "Solicitado")).toBe("—");
    expect(valorDeLinea(fechas, "Resuelto")).toBe("—");
  });
});
