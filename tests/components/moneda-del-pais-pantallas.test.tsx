// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import type { ReactElement, ReactNode } from "react";
import { MonedaDelPaisProvider } from "@/providers/MonedaDelPaisProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import { useImpuestoDelPais, useMonedaDelPais } from "@/hooks/use-moneda-del-pais";
import {
  formatearMontoEn,
  MONEDA_PLATAFORMA,
  SIN_MONTO_RAYA,
  type FormatoMoneda,
} from "@/lib/config/moneda";
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import { MONEDA_CR, MONEDA_DE_PRUEBA } from "@/tests/fabricas/reglas-pais";
import { PriceLabel } from "@/components/shared/PriceLabel";
import { KpiValorAnimado } from "@/components/shared/KpiValorAnimado";
import {
  DESGLOSE_TEXTOS,
  DesglosePagoField,
  mensajeDeCuadre,
} from "@/components/shared/DesglosePagoField";
import { PosAmountRow } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosAmountRow";
import { PosOrderCardDetalle } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle";
import { PosOrderCardMosaico } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico";
import { formatMonto as formatMontoPos } from "@/app/(app)/mis-asignaciones/_components/pos-card/pos-format";
import { AsignacionDetalle } from "@/app/(app)/mis-asignaciones/_components/AsignacionDetalle";
import { KpisMensajero } from "@/app/(app)/mis-asignaciones/_components/KpisMensajero";
import { GestionarOrdenPanel } from "@/app/(app)/mis-asignaciones/_components/GestionarOrdenPanel";
import { ChatConversacion } from "@/app/(app)/mis-asignaciones/_components/chat/ChatConversacion";

// ── Dobles de lo que las pantallas del mensajero arrastran y no es de esta ficha ──────────────

/**
 * El doble de `react-countup` del setup pinta `formattingFn(end)`; este hace lo mismo y además
 * GUARDA las props, porque R12 se mide sobre el `decimals` y el formateador que recibe el contador.
 */
const { propsDeCountUp } = vi.hoisted(() => ({
  propsDeCountUp: [] as { end: number; decimals?: number; formattingFn?: (n: number) => string }[],
}));
vi.mock("react-countup", () => ({
  default: (props: { end: number; decimals?: number; formattingFn?: (n: number) => string }) => {
    propsDeCountUp.push(props);
    return props.formattingFn ? props.formattingFn(props.end) : String(props.end);
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
// Leaflet vía `next/dynamic`: jsdom no pinta canvas.
vi.mock("@/app/(app)/mis-asignaciones/_components/UbicacionMapa", () => ({ UbicacionMapa: () => null }));
vi.mock("@/lib/actions/mis-asignaciones", () => ({ gestionar: vi.fn() }));
vi.mock("@/lib/actions/chat-whatsapp", () => ({
  listarHiloChat: vi.fn().mockResolvedValue({
    status: "ok",
    ventanaAbierta: false,
    ultimoEntranteAt: null,
    plantillaBloqueada: false,
    textoLibreHabilitado: false,
    mensajes: [],
  }),
  enviarMensajeChat: vi.fn(),
  enviarPlantillaChat: vi.fn(),
  enviarMediaChat: vi.fn(),
}));
vi.mock("@/lib/actions/whatsapp-envio", () => ({
  listarPlantillasActivasParaEnvio: vi.fn().mockResolvedValue({ status: "ok", items: [] }),
}));
vi.mock("@/lib/audio/tono-notificacion", () => ({
  reproducirTono: vi.fn(),
  prepararAudio: vi.fn(),
  reiniciarAudioParaTests: vi.fn(),
}));

if (typeof Element.prototype.scrollTo !== "function") {
  Element.prototype.scrollTo = function scrollToStub() {};
}

beforeEach(() => {
  propsDeCountUp.length = 0;
});

afterEach(() => {
  cleanup();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-235 — Moneda e impuesto del país en las pantallas de la empresa
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Un archivo para toda la ficha (design §10): primero los hooks (T2.1), y después un `describe` por
// pantalla de design §7 (bloque 3) y el censo de R18. Las piezas comunes van arriba para que cada
// pantalla monte con el mismo proveedor de prueba.

/**
 * El país de prueba: una moneda distinta en todo de la de CR y otro nombre de impuesto, para que un
 * test no pase por casualidad con lo de la plataforma.
 */
const IMPUESTO_DE_PRUEBA = "IGV";

/** Envoltorio con el proveedor del portal; sin argumentos, el país de prueba. */
function conPais(moneda: FormatoMoneda = MONEDA_DE_PRUEBA, impuestoNombre: string = IMPUESTO_DE_PRUEBA) {
  return function Envoltorio({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MonedaDelPaisProvider moneda={moneda} impuestoNombre={impuestoNombre}>
        {children}
      </MonedaDelPaisProvider>
    );
  };
}

describe("SLT-235/T2.1 — hooks de la moneda y el impuesto del país", () => {
  it("R15: sin proveedor, useMonedaDelPais da la moneda de la plataforma y no lanza", () => {
    const { result } = renderHook(() => useMonedaDelPais());
    expect(result.current).toBe(MONEDA_PLATAFORMA);
  });

  it("R15: sin proveedor, useImpuestoDelPais da el rótulo de la plataforma", () => {
    const { result } = renderHook(() => useImpuestoDelPais());
    expect(result.current).toBe(IMPUESTO_ROTULO);
  });

  it("R11: con el proveedor de prueba, useMonedaDelPais da la moneda del país, no la de la plataforma", () => {
    const { result } = renderHook(() => useMonedaDelPais(), { wrapper: conPais() });
    expect(result.current).toEqual(MONEDA_DE_PRUEBA);
    expect(result.current).not.toEqual(MONEDA_PLATAFORMA);
  });

  it("R17: con el proveedor de prueba, useImpuestoDelPais da «IGV», el nombre del impuesto del país", () => {
    const { result } = renderHook(() => useImpuestoDelPais(), { wrapper: conPais() });
    expect(result.current).toBe(IMPUESTO_DE_PRUEBA);
    expect(result.current).not.toBe(IMPUESTO_ROTULO);
  });
});

// ── Piezas de las pantallas (bloque 3) ───────────────────────────────────────────────────────

/**
 * Un importe con cola y miles: con la moneda de prueba (0 decimales, espacio de miles) se pinta
 * redondo y con otro aspecto que con la de CR, así que un caso no pasa por casualidad.
 */
const IMPORTE = 12500.5;

/** Lo que pinta `ui` (su texto entero) con el proveedor de `moneda`, o sin proveedor. */
function textoPintado(ui: ReactElement, moneda?: FormatoMoneda): string {
  const { container, unmount } = render(ui, moneda ? { wrapper: conPais(moneda) } : undefined);
  const texto = container.textContent ?? "";
  unmount();
  return texto;
}

/**
 * Los dos casos que exige el bloque 3 para cada pantalla: con la moneda de prueba aparece el
 * importe en esa moneda y no el de la plataforma (R11), y con la de CR el texto es el mismo que
 * sin proveedor (R16).
 */
function compruebaMonedaDelPais(ui: ReactElement, esperado: (moneda: FormatoMoneda) => string) {
  const conPrueba = textoPintado(ui, MONEDA_DE_PRUEBA);
  expect(conPrueba).toContain(esperado(MONEDA_DE_PRUEBA));
  expect(conPrueba).not.toContain(esperado(MONEDA_PLATAFORMA));

  const sinProveedor = textoPintado(ui);
  expect(sinProveedor).toContain(esperado(MONEDA_PLATAFORMA));
  expect(textoPintado(ui, MONEDA_CR)).toBe(sinProveedor);
}

function makeOrden(over: Partial<MiAsignacionDTO> = {}): MiAsignacionDTO {
  return {
    id: "o1",
    numGuia: 1001,
    numRemision: "REM-001",
    estatusValue: "en_reparto",
    destinatario: "Ana Pérez",
    telefonoDest: "70001111",
    direccion: "Calle 1, casa 2",
    producto: "Caja de prueba",
    peso: 1.5,
    montoCobrar: IMPORTE,
    latitud: null,
    longitud: null,
    notas: null,
    tiendaNombre: "Tienda Norte",
    zonaNombre: "Zona",
    provinciaNombre: "Provincia",
    cantonNombre: "Cantón",
    distritoNombre: "Distrito",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: 1,
    ...over,
  };
}

/** El monto a cobrar como lo pintan las pantallas del mensajero: con la raya larga si no hay. */
const conRaya = (moneda: FormatoMoneda, valor: number | null = IMPORTE) =>
  formatearMontoEn(moneda, valor, SIN_MONTO_RAYA);

/** Un monto a cobrar con céntimos: el que hace que el desglose diga su aviso con importes. */
const CON_CENTIMOS = 11898.81;
const LINEAS_ENTERAS = [{ id: "l1", metodo: "efectivo" as const, monto: "11898" }];

/** El aviso de cuadre imposible de `CON_CENTIMOS`, con sus importes en `moneda`. */
const avisoEn = (moneda: FormatoMoneda) =>
  DESGLOSE_TEXTOS.noCuadraPorCentimos(conRaya(moneda, CON_CENTIMOS), conRaya(moneda, 0.81));

describe("SLT-235/T3.1 — componentes compartidos de monto", () => {
  it("R11, R16: PriceLabel pinta el importe en la moneda del país; con CR, lo mismo que sin proveedor", () => {
    compruebaMonedaDelPais(<PriceLabel value={IMPORTE} />, (m) => formatearMontoEn(m, IMPORTE));
  });

  it("R15: PriceLabel sin proveedor pinta con la moneda de la plataforma, también un valor ausente", () => {
    expect(textoPintado(<PriceLabel value={IMPORTE} />)).toBe(formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE));
    expect(textoPintado(<PriceLabel value={null} />)).toBe(formatearMontoEn(MONEDA_PLATAFORMA, 0));
  });

  it("R11, R16: KpiValorAnimado en modo moneda pinta en la moneda del país; con CR, lo mismo que sin proveedor", () => {
    compruebaMonedaDelPais(<KpiValorAnimado value={IMPORTE} moneda />, (m) => formatearMontoEn(m, IMPORTE));
  });

  it("R12: con una moneda de 0 decimales el contador cuenta a 0 decimales y el último fotograma da el texto del formateador", () => {
    const valor = 13331832.72;
    render(<KpiValorAnimado value={valor} moneda />, { wrapper: conPais(MONEDA_DE_PRUEBA) });
    const { decimals, formattingFn, end } = propsDeCountUp.at(-1)!;
    expect(decimals).toBe(MONEDA_DE_PRUEBA.decimales);
    // countup.js cuadra el último fotograma a `decimals` antes de formatearlo (`countUp.js:73`).
    const ultimoFotograma = Number(end.toFixed(decimals));
    expect(formattingFn!(ultimoFotograma)).toBe(formatearMontoEn(MONEDA_DE_PRUEBA, valor));
  });

  it("R12, R16: con la moneda de CR el contador sigue en su escala y aterriza en el texto de siempre", () => {
    const valor = 13331832.72;
    render(<KpiValorAnimado value={valor} moneda />, { wrapper: conPais(MONEDA_CR) });
    const { decimals, formattingFn, end } = propsDeCountUp.at(-1)!;
    expect(decimals).toBe(MONEDA_PLATAFORMA.decimales);
    expect(formattingFn!(Number(end.toFixed(decimals)))).toBe(formatearMontoEn(MONEDA_PLATAFORMA, valor));
  });

  it("R11, R16: el resumen de DesglosePagoField pinta los tres importes en la moneda del país", () => {
    const ui = (
      <DesglosePagoField
        lineas={[{ id: "l1", metodo: "efectivo", monto: "5000" }]}
        montoACobrar={IMPORTE}
        errores={[]}
        errorCuadre={undefined}
        errorMetodo={undefined}
        errorServidor={undefined}
        onChange={() => {}}
      />
    );
    compruebaMonedaDelPais(ui, (m) => conRaya(m, IMPORTE - 5000));
    render(ui, { wrapper: conPais(MONEDA_DE_PRUEBA) });
    const importes = within(screen.getByLabelText(DESGLOSE_TEXTOS.resumen))
      .getAllByRole("definition")
      .map((d) => d.textContent);
    expect(importes).toEqual([
      conRaya(MONEDA_DE_PRUEBA, IMPORTE),
      conRaya(MONEDA_DE_PRUEBA, 5000),
      conRaya(MONEDA_DE_PRUEBA, IMPORTE - 5000),
    ]);
  });

  it("R11: mensajeDeCuadre dice sus importes en la moneda que se le pasa", () => {
    expect(mensajeDeCuadre(LINEAS_ENTERAS, CON_CENTIMOS, MONEDA_DE_PRUEBA)).toBe(avisoEn(MONEDA_DE_PRUEBA));
  });

  it("R15, R16: mensajeDeCuadre sin moneda usa la de la plataforma, y con la de CR da lo mismo", () => {
    const sinMoneda = mensajeDeCuadre(LINEAS_ENTERAS, CON_CENTIMOS);
    expect(sinMoneda).toBe(avisoEn(MONEDA_PLATAFORMA));
    expect(mensajeDeCuadre(LINEAS_ENTERAS, CON_CENTIMOS, MONEDA_CR)).toBe(sinMoneda);
  });
});

describe("SLT-235/T3.2 — mis-asignaciones", () => {
  it("R11: pos-format.formatMonto pinta con la moneda que se le pasa y conserva la raya larga", () => {
    expect(formatMontoPos(IMPORTE, MONEDA_DE_PRUEBA)).toBe(conRaya(MONEDA_DE_PRUEBA));
    expect(formatMontoPos(null, MONEDA_DE_PRUEBA)).toBe(SIN_MONTO_RAYA);
    expect(formatMontoPos(IMPORTE, MONEDA_CR)).toBe(conRaya(MONEDA_PLATAFORMA));
  });

  it("R11, R16: PosAmountRow", () => {
    compruebaMonedaDelPais(<PosAmountRow montoCobrar={IMPORTE} />, (m) => conRaya(m));
  });

  it("R11, R16: PosOrderCardDetalle", () => {
    compruebaMonedaDelPais(<PosOrderCardDetalle orden={makeOrden()} total={3} />, (m) => conRaya(m));
  });

  it("R11, R16: PosOrderCardMosaico", () => {
    compruebaMonedaDelPais(<PosOrderCardMosaico orden={makeOrden()} total={3} />, (m) => conRaya(m));
  });

  it("R11, R16: AsignacionDetalle", () => {
    compruebaMonedaDelPais(<AsignacionDetalle orden={makeOrden()} />, (m) => conRaya(m));
  });

  it("R11, R16: KpisMensajero pinta los dos importes en la moneda del país", () => {
    const kpis = { pendientes: 3, entregadas: 7, porCobrar: IMPORTE, totalACobrar: 48000 };
    compruebaMonedaDelPais(<KpisMensajero kpis={kpis} />, (m) => formatearMontoEn(m, IMPORTE));
    compruebaMonedaDelPais(<KpisMensajero kpis={kpis} />, (m) => formatearMontoEn(m, 48000));
  });

  it("R11, R16: ChatConversacion pinta el monto a cobrar de la cabecera en la moneda del país", async () => {
    async function cabecera(moneda?: FormatoMoneda): Promise<string> {
      const { unmount } = render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}>
          <ToastProvider>
            <ChatConversacion orden={makeOrden()} onVolver={() => {}} />
          </ToastProvider>
        </SWRConfig>,
        moneda ? { wrapper: conPais(moneda) } : undefined,
      );
      await act(async () => {
        await Promise.resolve();
      });
      // El importe es el párrafo hermano del rótulo «A cobrar» de la cabecera.
      const rotulo = screen.getAllByText("A cobrar").find((el) => el.tagName === "P");
      const texto = rotulo?.previousElementSibling?.textContent ?? "";
      unmount();
      return texto;
    }
    expect(await cabecera(MONEDA_DE_PRUEBA)).toBe(conRaya(MONEDA_DE_PRUEBA));
    const sinProveedor = await cabecera();
    expect(sinProveedor).toBe(conRaya(MONEDA_PLATAFORMA));
    expect(await cabecera(MONEDA_CR)).toBe(sinProveedor);
  });

  it("R11, R16: GestionarOrdenPanel dice el aviso de cuadre en la moneda del país", async () => {
    async function avisoDeCuadre(moneda?: FormatoMoneda): Promise<string | null> {
      const user = userEvent.setup();
      const { unmount } = render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}>
          <ToastProvider>
            <GestionarOrdenPanel
              orden={makeOrden({ montoCobrar: CON_CENTIMOS })}
              yaActiva
              onGestionarPedido={vi.fn().mockResolvedValue(true)}
              onCancelarGestion={vi.fn()}
              onSuccess={vi.fn()}
              onAbrirChat={vi.fn()}
              count={1}
            />
          </ToastProvider>
        </SWRConfig>,
        moneda ? { wrapper: conPais(moneda) } : undefined,
      );
      await user.click(await screen.findByRole("button", { name: "Entregar" }));
      // Los avisos del editor de pago, no los del hilo de notas que el panel monta al lado.
      const editor = screen.getByLabelText(DESGLOSE_TEXTOS.resumen).parentElement as HTMLElement;
      const aviso = within(editor).getByRole("alert").textContent;
      unmount();
      return aviso;
    }
    expect(await avisoDeCuadre(MONEDA_DE_PRUEBA)).toBe(avisoEn(MONEDA_DE_PRUEBA));
    const sinProveedor = await avisoDeCuadre();
    expect(sinProveedor).toBe(avisoEn(MONEDA_PLATAFORMA));
    expect(await avisoDeCuadre(MONEDA_CR)).toBe(sinProveedor);
  });
});
