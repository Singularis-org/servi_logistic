// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GestionesPorResultado } from "@/app/(app)/cierres-admin/_components/cierre-factura";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreResultado,
} from "@/lib/interfaces/services/ICierreDiaService";

// FICHA 408 (R8, R9) — la fila de un rechazo AUTOMÁTICO en el detalle del ADMIN, que es la
// superficie donde el marcador de origen SÍ existe.
//
// Lo que este archivo protege:
//   - R9: el renglón «Motivo» dice la causa y NADA más — ni la palabra «automático», ni la frase
//     del marcador. Ahí al lado está el marcador, que ya responde esa pregunta, y repetirla sería
//     la tercera vez que la misma fila cuenta lo mismo.
//   - R8: el marcador de origen NO se ha tocado: sigue diciendo «Automático» y sigue llevando su
//     nota accesible palabra por palabra.
//   - R2 en la pantalla real: el motivo que escribió el mensajero sale INTACTO.
//
// ⚠️ Los literales están tecleados a mano, incluida la nota del marcador. Compararlos contra
// `RECHAZO_SLA_BADGE_NOTA` o contra `motivoGestionLegible` los dejaría verdes aunque el texto se
// rompiera entero.
//
// 📌 FICHA 482 (2026-10-15) — REAPUNTADO. Montaba `DetalleSecciones` (la tabla por resultado del
// detalle de bodega, con su columna «Origen»). La 478 la sustituyó por la lista en pestañas de
// `cierre-factura` (`GestionesPorResultado`, sin `esMensajero`: la vista del admin) y la 482 la
// borró. Las mismas afirmaciones se hacen ahora sobre la FILA DESPLEGADA, donde el marcador va
// junto al renglón del motivo. Un caso cambia de forma y se dice: un motivo AUSENTE ya no es una
// celda con «—», es un renglón que no se pinta (`DatoFila` con `null`).

/** El texto corto de la causa, tal y como lo aprobó la feature 73 el 2026-07-15. */
const DIRECCION_ERRADA = "Dirección errada";

/** La nota accesible del marcador de origen, completa y sin recortar (R8). */
const NOTA_MARCADOR_AUTOMATICO =
  "Devolución a origen automática por vencerse el plazo de la novedad (no lo hizo el mensajero).";

/** El motivo que un mensajero escribió a mano: no es plantilla y no se traduce (R2). */
const MOTIVO_LIBRE = "El cliente no contesta el timbre";

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
    pagos: [],
    motivo: null,
    fechaReprogramacion: null,
    evidenciaUrl: null, evidenciaUrls: [],
    pagoMensajero: null,
    ingresoBodegaRechazo: null,
    tarifaFaltante: false,
    esRechazoSla: false,
    desdeAyudaTienda: false,
    causaIncidente: null,
    indemnizacion: null,
    ingresoEmpresa: null,
    ...over,
  };
}

function emptyGrupos(): CierreGrupos {
  return { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] };
}

/** La gestión sintética del cron de plazos vencidos, con la cadena EXACTA de producción. */
const RECHAZO_AUTOMATICO = makeGestion({
  gestionId: "g-sla",
  resultado: "devolucion_a_origen_por_rechazo",
  numRemision: "REM-SLA",
  esRechazoSla: true,
  motivo: "escalado SLA wrong_address",
});

/** Un rechazo del mensajero, con su motivo escrito a mano. */
const RECHAZO_MANUAL = makeGestion({
  gestionId: "g-manual",
  resultado: "devolucion_a_origen_por_rechazo",
  numRemision: "REM-MAN",
  esRechazoSla: false,
  motivo: MOTIVO_LIBRE,
});

/** Monta la lista del detalle de ADMIN. */
function montar(grupos: CierreGrupos) {
  render(<GestionesPorResultado grupos={grupos} onVerEvidencia={() => {}} />);
}

/** Despliega la fila de esa remisión (sin snapshot de ingreso) y devuelve su contenedor. */
async function fila(numRemision: string): Promise<HTMLElement> {
  const user = userEvent.setup();
  const boton = screen.getByRole("button", {
    name: `Detalle de la orden ${numRemision} · Beto Ruiz`,
  });
  await user.click(boton);
  return boton.parentElement as HTMLElement;
}

/** El valor del renglón «Motivo: …» de una fila desplegada, o `null` si no se pinta. */
function motivoDe(contenedor: HTMLElement): string | null {
  const rotulo = within(contenedor).queryByText("Motivo:");
  if (rotulo === null) return null;
  return (rotulo.parentElement?.textContent ?? "").replace("Motivo:", "").trim();
}

afterEach(() => {
  cleanup();
});

describe("R9 — donde está el marcador, el renglón «Motivo» no lo repite", () => {
  it("el motivo de un rechazo automático es exactamente «Dirección errada»", async () => {
    montar({ ...emptyGrupos(), devolucion_a_origen_por_rechazo: [RECHAZO_AUTOMATICO] });

    expect(motivoDe(await fila("REM-SLA"))).toBe(DIRECCION_ERRADA);
  });

  it("ese renglón NO dice «automático» ni repite la nota del marcador", async () => {
    montar({ ...emptyGrupos(), devolucion_a_origen_por_rechazo: [RECHAZO_AUTOMATICO] });

    const motivo = motivoDe(await fila("REM-SLA")) ?? "";
    expect(motivo).not.toBe("");
    expect(motivo.toLowerCase()).not.toContain("automático");
    expect(motivo).not.toContain(NOTA_MARCADOR_AUTOMATICO);
    expect(motivo).not.toContain("plazo");
    // Y tampoco la jerga que abrió la ficha.
    expect(motivo).not.toContain("SLA");
    expect(motivo).not.toContain("wrong_address");
  });

  it("el dato crudo no queda pintado en ninguna parte de la fila", async () => {
    montar({ ...emptyGrupos(), devolucion_a_origen_por_rechazo: [RECHAZO_AUTOMATICO] });

    const contenedor = await fila("REM-SLA");
    expect(contenedor.textContent).not.toContain("escalado SLA wrong_address");
  });
});

describe("R8 — el marcador de origen sigue diciendo lo que decía", () => {
  it("la fila mantiene el badge «Automático» con su nota accesible completa", async () => {
    montar({ ...emptyGrupos(), devolucion_a_origen_por_rechazo: [RECHAZO_AUTOMATICO] });

    const contenedor = await fila("REM-SLA");
    const badge = within(contenedor).getByLabelText(NOTA_MARCADOR_AUTOMATICO);
    expect(badge).toHaveTextContent("Automático");
    expect(badge).toHaveAttribute("title", NOTA_MARCADOR_AUTOMATICO);
  });

  it("un rechazo del mensajero sigue marcado «Manual»", async () => {
    montar({ ...emptyGrupos(), devolucion_a_origen_por_rechazo: [RECHAZO_MANUAL] });

    const contenedor = await fila("REM-MAN");
    expect(within(contenedor).getByText("Manual")).toBeInTheDocument();
    expect(within(contenedor).queryByText("Automático")).toBeNull();
  });
});

describe("R2 — el motivo que escribió el mensajero sale intacto en la misma lista", () => {
  it("las dos filas conviven: una traducida y la otra literal", async () => {
    montar({
      ...emptyGrupos(),
      devolucion_a_origen_por_rechazo: [RECHAZO_AUTOMATICO, RECHAZO_MANUAL],
    });

    expect(motivoDe(await fila("REM-SLA"))).toBe(DIRECCION_ERRADA);
    expect(motivoDe(await fila("REM-MAN"))).toBe(MOTIVO_LIBRE);
  });

  it("una NOVEDAD con motivo libre tampoco se toca (sin marcador de origen)", async () => {
    montar({
      ...emptyGrupos(),
      novedad: [
        makeGestion({
          gestionId: "g-dev",
          resultado: "novedad",
          numRemision: "REM-DEV",
          motivo: MOTIVO_LIBRE,
        }),
      ],
    });

    expect(motivoDe(await fila("REM-DEV"))).toBe(MOTIVO_LIBRE);
  });

  it("un motivo ausente no pinta el renglón (ni el guion ni un texto vacío)", async () => {
    montar({
      ...emptyGrupos(),
      devolucion_a_origen_por_rechazo: [
        makeGestion({
          gestionId: "g-sin",
          resultado: "devolucion_a_origen_por_rechazo",
          numRemision: "REM-SIN",
          motivo: null,
        }),
      ],
    });

    // En la tabla vieja era una celda con «—»; en la fila desplegada, un renglón que no aplica
    // no se pinta (`DatoFila` con `null`). En la hoja descargada esta misma celda va VACÍA (R3).
    expect(motivoDe(await fila("REM-SIN"))).toBeNull();
  });
});
