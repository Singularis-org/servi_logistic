// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  INDEMNIZACION_PENDIENTE_NOTA,
  ORDEN_RESULTADOS,
  RESULTADO_LABEL,
  RESULTADO_VACIO,
  RECHAZO_MANUAL_BADGE_LABEL,
  RECHAZO_SLA_BADGE_LABEL,
  INGRESO_BODEGA_RECHAZOS_LABEL,
} from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import { GestionesPorResultado } from "@/app/(app)/cierres-admin/_components/cierre-factura";
import { CAUSA_INCIDENTE_LABEL } from "@/app/(app)/mis-asignaciones/_components/causa-incidente-options";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreResultado,
  IngresoEmpresaDTO,
} from "@/lib/interfaces/services/ICierreDiaService";

// Feature 158 (T2.3 — R18/R17/R34/R19) — el grupo "Incidente" en el detalle de ADMIN. Lo que
// protege:
//   - el grupo existe, está etiquetado en español y va AL FINAL del orden fijo (R18);
//   - el incidente NO hereda lo que es propio de un rechazo: ni ingreso de bodega ni marca de
//     origen SLA/manual (R17);
//   - la evidencia se abre con la URL FIRMADA, como en el resto;
//   - la CAUSA se pinta traducida y nunca como slug del enum (R34/R9);
//   - el MONTO se pinta TAL CUAL (STRING) y su "—" lleva la nota de que se captura al aprobar,
//     porque un "—" pelado se leería como «esta orden no se indemniza» (R19).
//
// 📌 FICHA 482 (2026-10-15) — REAPUNTADO. Hasta hoy este archivo montaba `DetalleSecciones`, la
// tabla por resultado del detalle de bodega. La 478 la sustituyó por la lista en pestañas de
// `cierre-factura` (`GestionesPorResultado`, la misma del comprobante de mensajero) y la 482 la
// borró. Los requisitos de la 158 siguen vivos en esa lista, así que los casos se mudan a ella con
// la misma afirmación; cambia la FORMA: lo que era una columna es ahora un renglón de la fila
// desplegada. Tres casos no tenían a dónde ir y se retiraron (detalle en `progress/impl_482.md`):
// «el grupo vacío NO se pinta» (las pestañas enseñan las cinco SIEMPRE —478/R1— y su texto vacío
// —478/R3—), y los dos que afirmaban sobre los ids de `columnasPara`, que ya no existe; lo que
// esos dos protegían (causa e indemnización solo en el incidente) se afirma abajo sobre la fila.
//
// 📌 Historia de este archivo, que explica dos de sus casos: nació con la causa y el monto SIN
// pintar, porque el DTO no los traía, y dejó un candado de compilación + un caso que afirmaba
// el hueco. El backend extendió el DTO (el candado se puso rojo y se INVIRTIÓ) y esta fase
// pintó las columnas (el caso del hueco se puso rojo y se INVIRTIÓ también). Ninguno de los
// dos se borró: los dos siguen protegiendo el invariante, ahora en su sentido correcto.

function ingreso(over: Partial<IngresoEmpresaDTO> = {}): IngresoEmpresaDTO {
  return {
    montoCobrar: "150.00",
    cobraComision: true,
    esCentral: true,
    esZonaEspecial: false,
    fleteOrigen: "normal",
    fleteDevolucionOrigen: "normal",
    flete: null,
    ivaFlete: null,
    fleteDevolucion: null,
    ivaFleteDevolucion: null,
    comisionCod: null,
    ivaComisionCod: null,
    fleteConIva: null,
    fleteDevolucionConIva: null,
    comisionConIva: null,
    total: "0.00",
    tarifa: null,
    ...over,
  };
}

function makeGestion(
  over: Partial<CierreDetalleGestion> & { gestionId: string; resultado: CierreResultado },
): CierreDetalleGestion {
  return {
    ordenId: `o-${over.gestionId}`,
    fechaGestion: "2026-07-11",
    numGuia: 1001,
    numRemision: "REM-001",
    destinatario: "Beto Ruiz",
    direccion: "Calle 1",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    producto: "Caja",
    tiendaNombre: "Tienda X",
    montoRecibido: null,
    metodoPago: null,
    // Feature 212/R31: el DTO gana el desglose y CONSERVA el escalar de arriba.
    pagos: [],
    motivo: null,
    fechaReprogramacion: null,
    evidenciaUrl: null, evidenciaUrls: [],
    pagoMensajero: null,
    ingresoBodegaRechazo: null,
    tarifaFaltante: false,
    esRechazoSla: false,
    desdeAyudaTienda: false, // feature 237 (D6/R41): la registro el mensajero, no la tienda
    // Feature 158/R9/R19: campos POR RAMA del incidente; los casos del incidente los
    // sobreescriben.
    causaIncidente: null,
    indemnizacion: null,
    ingresoEmpresa: ingreso(),
    ...over,
  };
}

function emptyGrupos(): CierreGrupos {
  return { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] };
}

function unIncidente(over: Partial<CierreDetalleGestion> = {}): CierreDetalleGestion {
  return makeGestion({
    gestionId: "gi1",
    resultado: "incidente",
    numRemision: "REM-INC",
    motivo: "Paquete robado en la parada",
    evidenciaUrl: "https://signed.example/inc.jpg?token=abc", evidenciaUrls: ["https://signed.example/inc.jpg?token=abc"],
    ...over,
  });
}

/** Monta la lista en pestañas del detalle de ADMIN (sin `esMensajero`). */
function montar(grupos: CierreGrupos, onVerEvidencia: (url: string) => void = () => {}) {
  return render(<GestionesPorResultado grupos={grupos} onVerEvidencia={onVerEvidencia} />);
}

/**
 * Despliega la fila de una gestión y devuelve su contenedor. La lista abre en la primera
 * pestaña con gestiones, que en cada caso es la de la gestión que se mira.
 */
async function desplegar(g: CierreDetalleGestion): Promise<HTMLElement> {
  const user = userEvent.setup();
  const boton = screen.getByRole("button", {
    name: `Desglose de ingreso de la orden ${g.numRemision} · ${g.destinatario}`,
  });
  await user.click(boton);
  return boton.parentElement as HTMLElement;
}

/** El valor de un renglón «<rótulo>: <valor>» de la fila desplegada, o `null` si no está. */
function renglon(fila: HTMLElement, rotulo: string): string | null {
  const etiqueta = within(fila).queryByText(`${rotulo}:`);
  if (etiqueta === null) return null;
  return (etiqueta.parentElement?.textContent ?? "").replace(`${rotulo}:`, "").trim();
}

afterEach(() => {
  cleanup();
});

describe("R18 — `incidente` es un grupo propio del detalle de admin", () => {
  it("está etiquetado en español y va AL FINAL del orden fijo de secciones", () => {
    expect(RESULTADO_LABEL.incidente).toBe("Incidente");
    // ⏳ 2026-09-24 (FICHA 455, R5): el vacío nombra el resultado exacto.
    expect(RESULTADO_VACIO.incidente).toBe("No hay gestiones con resultado «Incidente».");
    expect(ORDEN_RESULTADOS).toContain("incidente");
    expect(ORDEN_RESULTADOS[ORDEN_RESULTADOS.length - 1]).toBe("incidente");
    // Los cuatro previos conservan su orden exacto (no regresión, R35).
    expect(ORDEN_RESULTADOS.slice(0, 4)).toEqual([
      "entregado",
      "reprogramado",
      "novedad",
      "devolucion_a_origen_por_rechazo",
    ]);
  });

  it("se pinta como pestaña propia con su conteo, y su fila lleva el motivo", async () => {
    const g = unIncidente();
    montar({ ...emptyGrupos(), incidente: [g] });

    const pestana = screen.getByRole("tab", { name: /Incidente/ });
    expect(pestana).toHaveTextContent("1");
    expect(pestana).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("region", { name: "Incidente" });
    expect(within(panel).getByText(/REM-INC/)).toBeInTheDocument();

    const fila = await desplegar(g);
    expect(renglon(fila, "Motivo")).toBe("Paquete robado en la parada");
  });

  it("el grupo vacío conserva su pestaña en cero y dice que no hay gestiones", async () => {
    const user = userEvent.setup();
    montar(emptyGrupos());

    const pestana = screen.getByRole("tab", { name: /Incidente/ });
    expect(pestana).toHaveTextContent("0");
    await user.click(pestana);
    const panel = screen.getByRole("region", { name: "Incidente" });
    expect(within(panel).getByText(RESULTADO_VACIO.incidente)).toBeInTheDocument();
  });

  it("la evidencia se abre con la URL FIRMADA que llega del servidor", async () => {
    const user = userEvent.setup();
    let abierta: string | null = null;
    const g = unIncidente();
    montar({ ...emptyGrupos(), incidente: [g] }, (url) => {
      abierta = url;
    });

    const fila = await desplegar(g);
    await user.click(
      within(fila).getByRole("button", { name: "Ver evidencia de la orden REM-INC · Beto Ruiz" }),
    );

    expect(abierta).toBe("https://signed.example/inc.jpg?token=abc");
  });
});

describe("R17 — el incidente NO trae lo que es propio de un rechazo", () => {
  it("sin ingreso de bodega ni marca de origen, aunque el DTO los trajera", async () => {
    // Datos INCOHERENTES a propósito: si la fila decidiera por el dato y no por el resultado,
    // un incidente con `ingresoBodegaRechazo` y `esRechazoSla` pintaría las dos cosas.
    const g = unIncidente({ ingresoBodegaRechazo: "5.00", esRechazoSla: true });
    montar({ ...emptyGrupos(), incidente: [g] });

    const fila = await desplegar(g);
    expect(renglon(fila, INGRESO_BODEGA_RECHAZOS_LABEL)).toBeNull();
    expect(within(fila).queryByText(RECHAZO_SLA_BADGE_LABEL)).toBeNull();
    expect(within(fila).queryByText(RECHAZO_MANUAL_BADGE_LABEL)).toBeNull();
    // Lo que SÍ está: el rastro del reporte.
    expect(renglon(fila, "Motivo")).toBe("Paquete robado en la parada");
  });

  it("un RECHAZO con esos mismos datos sí los lleva (no regresión, R35)", async () => {
    const g = makeGestion({
      gestionId: "gr",
      resultado: "devolucion_a_origen_por_rechazo",
      numRemision: "REM-RCH",
      ingresoBodegaRechazo: "5.00",
      esRechazoSla: true,
    });
    montar({ ...emptyGrupos(), devolucion_a_origen_por_rechazo: [g] });

    const fila = await desplegar(g);
    expect(renglon(fila, INGRESO_BODEGA_RECHAZOS_LABEL)).toBe("₡5");
    expect(within(fila).getByText(RECHAZO_SLA_BADGE_LABEL)).toBeInTheDocument();
  });
});

// --- El candado de la deuda, INVERTIDO el 2026-07-30 (no borrado) ---
//
// La fase frontend dejó aquí un candado de compilación: mientras `CierreDetalleGestion` NO
// trajera `causaIncidente` ni `indemnizacion`, dos alias de tipo valían `true`; el día que el
// DTO los ganara pasaban a `never` y `pnpm run typecheck` ROMPÍA, para que nadie añadiera el
// dato al backend y lo dejara invisible.
//
// **Ese día llegó y el candado hizo exactamente su trabajo**: al extender el DTO, `typecheck`
// se puso en rojo. Aquí se INVIERTE, no se borra — pasa a exigir lo contrario con la misma
// fuerza: los dos campos DEBEN estar en el DTO. Si alguien los quitara (por ejemplo
// "simplificando" el `select` del repo), estos alias vuelven a `never` y el build rompe.
type _ConCausaEnElDto = "causaIncidente" extends keyof CierreDetalleGestion ? true : never;
type _ConMontoEnElDto = "indemnizacion" extends keyof CierreDetalleGestion ? true : never;
const _conCausa: _ConCausaEnElDto = true;
const _conMonto: _ConMontoEnElDto = true;

describe("El dato viaja en el DTO y AHORA SÍ se pinta (T2.3 cerrada el 2026-07-30)", () => {
  it("`CierreDetalleGestion` lleva la causa y el monto (si se quitan, el build rompe)", () => {
    expect(_conCausa).toBe(true);
    expect(_conMonto).toBe(true);
  });

  it("una gestión `incidente` del detalle puede llevar causa y monto con sus tipos correctos", () => {
    // Money-safe: el monto cruza como STRING, igual que `montoRecibido` y `pagoMensajero`.
    const g = unIncidente({ causaIncidente: "robado", indemnizacion: "12500.75" });
    expect(g.causaIncidente).toBe("robado");
    expect(typeof g.indemnizacion).toBe("string");
    // `null` cuando no aplica (cierre aún sin aprobar) o cuando el resultado no es incidente.
    expect(unIncidente().indemnizacion).toBeNull();
    expect(makeGestion({ gestionId: "ge", resultado: "entregado" }).causaIncidente).toBeNull();
  });

  // Este caso nació afirmando lo contrario («las columnas aún NO se pintan»), a propósito, para
  // ponerse ROJO el día que se añadieran y obligar a revisarlas en vez de cerrar el hueco en
  // silencio. **Ese día llegó**: se INVIERTE, con la misma fuerza y sin borrar nada — ahora
  // exige que los dos datos ESTÉN. Quitarlos vuelve a poner esto en rojo. (482: eran columnas
  // de la tabla vieja; hoy son renglones de la fila desplegada.)
  it("T2.3: la causa y el monto SÍ se pintan (antes exigía lo contrario)", async () => {
    const g = unIncidente({ causaIncidente: "robado", indemnizacion: "12500.75" });
    montar({ ...emptyGrupos(), incidente: [g] });

    const fila = await desplegar(g);
    expect(renglon(fila, "Causa")).not.toBeNull();
    expect(renglon(fila, "Indemnización")).not.toBeNull();
  });
});

describe("R34/R9 — la CAUSA se pinta traducida, nunca el slug del enum", () => {
  it.each([
    ["danado", "Paquete dañado"],
    ["perdido", "Paquete perdido"],
    ["robado", "Paquete robado"],
  ] as const)("causa `%s` se muestra como «%s»", async (value, etiqueta) => {
    const g = unIncidente({ causaIncidente: value });
    montar({ ...emptyGrupos(), incidente: [g] });

    const fila = await desplegar(g);
    expect(renglon(fila, "Causa")).toBe(etiqueta);
    // El value crudo del enum no aparece por ninguna parte (se comprueba con `danado`, el
    // único que difiere textualmente de su etiqueta acentuada).
    expect(fila.textContent).not.toMatch(/danado/);
    cleanup();
  });

  it("la etiqueta sale del MISMO catálogo que usa el panel del mensajero", async () => {
    // Si las dos pantallas tuvieran cadenas propias, podrían divergir sin que nada avisara.
    expect(CAUSA_INCIDENTE_LABEL.robado).toBe("Paquete robado");
    const g = unIncidente({ causaIncidente: "robado" });
    montar({ ...emptyGrupos(), incidente: [g] });

    const fila = await desplegar(g);
    expect(renglon(fila, "Causa")).toBe(CAUSA_INCIDENTE_LABEL.robado);
  });
});

describe("R19/R22 — el MONTO de la indemnización, y el '—' que NO es cero", () => {
  it("un incidente indemnizado con once dígitos se redondea EXACTO (sin parseFloat)", async () => {
    const g = unIncidente({ indemnizacion: "12345678901.99" });
    montar({ ...emptyGrupos(), incidente: [g] });

    const fila = await desplegar(g);
    // FICHA 359: el caso sigue midiendo lo mismo, por otra vía. El monto no cabe
    // exacto en un `double`; que los once dígitos enteros lleguen intactos Y con
    // su cola sólo pasa si el camino es dígito a dígito.
    expect(renglon(fila, "Indemnización")).toBe("₡12.345.678.901,99");
  });

  it("sin monto todavía muestra '—' CON la nota de que se captura al aprobar", async () => {
    const g = unIncidente({ indemnizacion: null });
    montar({ ...emptyGrupos(), incidente: [g] });

    const fila = await desplegar(g);
    // Un "—" pelado se leería como «esta orden no se indemniza», que es lo contrario de lo
    // que pasa: el monto todavía no se capturó (R19: lo pone el admin AL APROBAR).
    const celda = within(fila).getByLabelText(INDEMNIZACION_PENDIENTE_NOTA);
    expect(celda).toHaveTextContent("—");
    expect(celda).toHaveAttribute("title", INDEMNIZACION_PENDIENTE_NOTA);
    expect(INDEMNIZACION_PENDIENTE_NOTA).toMatch(/aprobar/i);
  });

  it("ni el monto ni la causa aparecen en los otros cuatro resultados", async () => {
    // Datos INCOHERENTES a propósito: la decisión es del resultado, no de que el dato venga.
    for (const resultado of ["entregado", "reprogramado", "novedad", "devolucion_a_origen_por_rechazo"] as const) {
      const g = makeGestion({
        gestionId: `g-${resultado}`,
        resultado,
        causaIncidente: "robado",
        indemnizacion: "100.00",
      });
      montar({ ...emptyGrupos(), [resultado]: [g] });

      const fila = await desplegar(g);
      expect(renglon(fila, "Indemnización"), `${resultado} no debería tener el monto`).toBeNull();
      expect(renglon(fila, "Causa"), `${resultado} no debería tener la causa`).toBeNull();
      cleanup();
    }
  });
});
