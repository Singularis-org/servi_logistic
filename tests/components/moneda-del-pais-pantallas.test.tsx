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
import { RecepcionDetalle } from "@/app/(app)/recepcion-satelite/_components/RecepcionDetalle";
import { SateliteOrderCard } from "@/app/(app)/recepcion-satelite/_components/SateliteOrderCard";
import type { RecepcionSateliteDTO } from "@/lib/interfaces/services/IRecepcionSateliteService";
import { CAMPOS_BASE_ORDEN } from "@/tests/fixtures/fila-bodega-satelite";
import { EnviarPlantillaWhatsappButton } from "@/components/shared/EnviarPlantillaWhatsappButton";
import { SinpeMensajePreview } from "@/components/shared/SinpeMensajePreview";
import { segmentosDelMensaje } from "@/components/shared/sinpe-preview-segmentos";
import {
  listarPlantillasActivasParaEnvio,
  listarPlantillasParaEnvio,
} from "@/lib/actions/whatsapp-envio";
import { DATOS_PLANTILLA_EJEMPLO, resolverValoresPlantilla, type DatosPlantilla } from "@/lib/types/plantilla-datos";
import { extraerVariables, renderPlantilla } from "@/lib/utils/plantilla-mensaje";
import { datosPlantillaDesdeAsignacion } from "@/lib/utils/whatsapp-envio-valores";
import type { PlantillaTextoDTO } from "@/lib/types/whatsapp-envio";
import type { EtiquetaGuiaDTO } from "@/lib/types/etiqueta-guia";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import type { PaisDTO } from "@/lib/types/pais";
import { PaisService } from "@/lib/services/PaisService";
import { MemoPaisEmpresa } from "@/lib/services/pais-para-pantallas";
import { paisDelAltaFijo } from "@/tests/fabricas/reglas-pais";
import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
  // `/paquete/[numGuia]` (T3.5) los llama solo en sus caminos de error; aquí no deben saltar.
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (destino: string) => {
    throw new Error(`redirect ${destino}`);
  },
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
  listarPlantillasParaEnvio: vi.fn().mockResolvedValue({ status: "ok", items: [] }),
  listarPlantillasParaEnvioTienda: vi.fn().mockResolvedValue({ status: "ok", items: [] }),
}));
// `/paquete/[numGuia]` (T3.5): la sesión, la etiqueta y el composition root del país se doblan; el
// `page.tsx`, `paisParaPantallasDelActor` y `PaisService` (con su memo) son los REALES.
const { resolveActorMock, obtenerEtiquetaMock, construirPaisServiceMock } = vi.hoisted(() => ({
  resolveActorMock: vi.fn(),
  obtenerEtiquetaMock: vi.fn(),
  construirPaisServiceMock: vi.fn(),
}));
vi.mock("@/lib/auth/resolve-actor", () => ({
  resolveActorFromSession: () => resolveActorMock(),
}));
vi.mock("@/lib/actions/etiquetas-guia", () => ({
  obtenerEtiquetaPorGuia: (...a: unknown[]) => obtenerEtiquetaMock(...a),
}));
vi.mock("@/lib/actions/_shared/paises-plataforma", () => ({
  construirPaisService: () => construirPaisServiceMock(),
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

describe("SLT-235/T3.3 — recepcion-satelite", () => {
  const ORDEN_SATELITE = {
    ...CAMPOS_BASE_ORDEN,
    id: "r1",
    numGuia: 1001,
    numRemision: "REM-R1",
    estatusValue: "en_ruta_bodega_satelite",
    destinatario: "Ana Pérez",
    telefonoDest: "88880000",
    direccion: "Calle 1",
    producto: "Caja",
    montoCobrar: IMPORTE,
    tiendaNombre: "Tienda X",
    zonaNombre: "Zona",
    provinciaNombre: "Provincia",
    cantonNombre: "Cantón",
    distritoNombre: "Distrito",
  } as RecepcionSateliteDTO;

  it("R11, R16: RecepcionDetalle", () => {
    compruebaMonedaDelPais(<RecepcionDetalle orden={ORDEN_SATELITE} />, (m) => conRaya(m));
  });

  it("R11: RecepcionDetalle conserva la raya larga sin monto", () => {
    const sinMonto = { ...ORDEN_SATELITE, montoCobrar: null } as RecepcionSateliteDTO;
    expect(textoPintado(<RecepcionDetalle orden={sinMonto} />, MONEDA_DE_PRUEBA)).toContain(SIN_MONTO_RAYA);
  });

  it("R11, R16: SateliteOrderCard (fila «A cobrar» y el detalle desplegable)", () => {
    compruebaMonedaDelPais(<SateliteOrderCard orden={ORDEN_SATELITE} />, (m) => conRaya(m));
  });
});

// ── Vistas previas de plantilla (T3.4, R13) ──────────────────────────────────────────────────

/** Una plantilla con un importe: lo único que cambia de una moneda a otra. */
const PLANTILLA_CON_MONTO: PlantillaTextoDTO = {
  id: "p-monto",
  nombre: "cobro",
  cuerpo: "Su pedido llega hoy. Total a pagar: {{monto}}.",
  variables: ["monto"],
};

/** Lo que el servidor enviaría para esos datos (SL-21 R10): el mismo par de llamadas. */
function comoElServidor(plantilla: PlantillaTextoDTO, datos: DatosPlantilla, moneda: FormatoMoneda): string {
  return renderPlantilla(plantilla.cuerpo, resolverValoresPlantilla(plantilla.variables, datos, undefined, moneda));
}

describe("SLT-235/T3.4 — vistas previas de plantilla", () => {
  it("R13, R16: EnviarPlantillaWhatsappButton pinta y pega el mensaje con los importes en la moneda del país", async () => {
    vi.mocked(listarPlantillasParaEnvio).mockResolvedValue({ status: "ok", items: [PLANTILLA_CON_MONTO] });
    const orden = makeOrden();
    const datos = datosPlantillaDesdeAsignacion(orden);

    async function vistaPrevia(moneda?: FormatoMoneda): Promise<{ pintado: string; pegado: string }> {
      const user = userEvent.setup();
      const onElegir = vi.fn();
      const { unmount } = render(
        <ToastProvider>
          <EnviarPlantillaWhatsappButton orden={orden} onElegirPlantilla={onElegir} />
        </ToastProvider>,
        moneda ? { wrapper: conPais(moneda) } : undefined,
      );
      await user.click(screen.getByRole("button", { name: `Usar plantilla en el chat con ${orden.destinatario}` }));
      const opcion = await screen.findByRole("button", { name: new RegExp(PLANTILLA_CON_MONTO.nombre) });
      const pintado = opcion.querySelector("p")?.textContent ?? "";
      await user.click(opcion);
      const pegado = (onElegir.mock.calls[0]?.[0] as { textoRenderizado: string }).textoRenderizado;
      unmount();
      return { pintado, pegado };
    }

    try {
      const esperado = comoElServidor(PLANTILLA_CON_MONTO, datos, MONEDA_DE_PRUEBA);
      expect(esperado).toContain(formatearMontoEn(MONEDA_DE_PRUEBA, IMPORTE));
      expect(await vistaPrevia(MONEDA_DE_PRUEBA)).toEqual({ pintado: esperado, pegado: esperado });

      const sinProveedor = await vistaPrevia();
      const dePlataforma = comoElServidor(PLANTILLA_CON_MONTO, datos, MONEDA_PLATAFORMA);
      expect(sinProveedor).toEqual({ pintado: dePlataforma, pegado: dePlataforma });
      expect(await vistaPrevia(MONEDA_CR)).toEqual(sinProveedor);
    } finally {
      vi.mocked(listarPlantillasParaEnvio).mockResolvedValue({ status: "ok", items: [] });
    }
  });

  it("R13, R16: ChatConversacion arma la vista previa de cada plantilla en la moneda del país", async () => {
    vi.mocked(listarPlantillasActivasParaEnvio).mockResolvedValue({ status: "ok", items: [PLANTILLA_CON_MONTO] });
    const orden = makeOrden();
    const datos = datosPlantillaDesdeAsignacion(orden);

    async function vistaPrevia(moneda?: FormatoMoneda): Promise<string> {
      const { unmount } = render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}>
          <ToastProvider>
            <ChatConversacion orden={orden} onVolver={() => {}} />
          </ToastProvider>
        </SWRConfig>,
        moneda ? { wrapper: conPais(moneda) } : undefined,
      );
      const grupo = await screen.findByRole("group", { name: "Plantillas disponibles" });
      const texto = within(grupo).getAllByRole("button")[0].getAttribute("title") ?? "";
      unmount();
      return texto;
    }

    try {
      expect(await vistaPrevia(MONEDA_DE_PRUEBA)).toBe(comoElServidor(PLANTILLA_CON_MONTO, datos, MONEDA_DE_PRUEBA));
      const sinProveedor = await vistaPrevia();
      expect(sinProveedor).toBe(comoElServidor(PLANTILLA_CON_MONTO, datos, MONEDA_PLATAFORMA));
      expect(await vistaPrevia(MONEDA_CR)).toBe(sinProveedor);
    } finally {
      vi.mocked(listarPlantillasActivasParaEnvio).mockResolvedValue({ status: "ok", items: [] });
    }
  });

  it("R13: segmentosDelMensaje da el texto del servidor con la moneda que se le pasa; sin ella, la de la plataforma", () => {
    const cuerpo = "Total a pagar: {{monto}}.";
    const vars = extraerVariables(cuerpo);
    const texto = (moneda?: FormatoMoneda) =>
      segmentosDelMensaje(cuerpo, "80000000", "Titular", moneda).map((s) => s.texto).join("");
    expect(texto(MONEDA_DE_PRUEBA)).toBe(
      renderPlantilla(cuerpo, resolverValoresPlantilla(vars, DATOS_PLANTILLA_EJEMPLO, undefined, MONEDA_DE_PRUEBA)),
    );
    expect(texto()).toBe(
      renderPlantilla(cuerpo, resolverValoresPlantilla(vars, DATOS_PLANTILLA_EJEMPLO, undefined, MONEDA_PLATAFORMA)),
    );
    expect(texto(MONEDA_CR)).toBe(texto());
  });

  it("R13, R16: SinpeMensajePreview pinta el importe en la moneda del país junto al par resaltado", () => {
    const cuerpo = "Pague {{monto}} al {{sinpe}} a nombre de {{sinpe_nombre}}.";
    const numero = "80001111";
    const nombre = "Titular de Prueba";
    const datos: DatosPlantilla = {
      ...DATOS_PLANTILLA_EJEMPLO,
      negocio: { ...DATOS_PLANTILLA_EJEMPLO.negocio, sinpeNumero: numero, sinpeNombre: nombre },
    };
    // El par se pinta tal cual se teclea (ficha 429); lo demás, como lo enviaría el servidor.
    const esperado = (moneda: FormatoMoneda) =>
      renderPlantilla(cuerpo, {
        ...resolverValoresPlantilla(extraerVariables(cuerpo), datos, undefined, moneda),
        sinpe: numero,
        sinpe_nombre: nombre,
      });
    function mensaje(moneda?: FormatoMoneda): string {
      const { unmount } = render(
        <SinpeMensajePreview cuerpoPlantilla={cuerpo} numero={numero} nombre={nombre} />,
        moneda ? { wrapper: conPais(moneda) } : undefined,
      );
      const texto = screen.getByTestId("sinpe-preview-mensaje").textContent ?? "";
      unmount();
      return texto;
    }
    expect(mensaje(MONEDA_DE_PRUEBA)).toBe(esperado(MONEDA_DE_PRUEBA));
    expect(mensaje(MONEDA_DE_PRUEBA)).not.toBe(esperado(MONEDA_PLATAFORMA));
    const sinProveedor = mensaje();
    expect(sinProveedor).toBe(esperado(MONEDA_PLATAFORMA));
    expect(mensaje(MONEDA_CR)).toBe(sinProveedor);
  });
});

// ── /paquete/[numGuia] (T3.5, R14) ───────────────────────────────────────────────────────────

describe("SLT-235/T3.5 — /paquete/[numGuia]", () => {
  const ETIQUETA: EtiquetaGuiaDTO = {
    ordenId: "orden-235",
    numGuia: 4021,
    numRemision: "REM-235",
    destinatario: "María Solís",
    telefonoDest: "0999888777",
    direccion: "Calle 1",
    producto: "Caja",
    montoCobrar: IMPORTE,
    tiendaNombre: "Tienda Central",
    zonaNombre: "Zona",
    provinciaNombre: "Provincia",
    cantonNombre: "Cantón",
    distritoNombre: "Distrito",
    fechaCreacion: "2026-08-27",
    qrValue: "4021",
    barcodeValue: "4021",
  };
  const PAIS_XA = paisDelAltaFijo({ id: "XA", nombre: "País XA", moneda: MONEDA_DE_PRUEBA, impuestoNombre: IMPUESTO_DE_PRUEBA }).pais;
  const PAIS_CR = paisDelAltaFijo().pais;

  const deLaEmpresa = vi.fn<(organizacionId: string) => Promise<PaisDTO | null>>();

  beforeEach(() => {
    resolveActorMock.mockReset();
    obtenerEtiquetaMock.mockReset().mockResolvedValue({ status: "ok", etiqueta: ETIQUETA });
    deLaEmpresa.mockReset();
    // Un memo nuevo por servicio: el de producción es de proceso y el país de otro caso no debe colarse.
    construirPaisServiceMock
      .mockReset()
      .mockImplementation(() => new PaisService({ deLaEmpresa } as unknown as IPaisRepository, new MemoPaisEmpresa()));
  });

  /** El texto del campo «Monto a cobrar» de la página real. */
  async function montoDelPaquete(organizacionId?: string): Promise<string> {
    resolveActorMock.mockResolvedValue({ usuarioId: "u1", rol: "mensajero", organizacionId });
    const { default: PaquetePage } = await import("@/app/paquete/[numGuia]/page");
    const { unmount } = render(await PaquetePage({ params: Promise.resolve({ numGuia: String(ETIQUETA.numGuia) }) }));
    const texto = screen.getByText("Monto a cobrar").nextElementSibling?.textContent ?? "";
    unmount();
    return texto;
  }

  it("R14: con empresa, el monto a cobrar sale en la moneda del país de su empresa", async () => {
    deLaEmpresa.mockResolvedValue(PAIS_XA);
    expect(await montoDelPaquete("org-xa")).toBe(formatearMontoEn(MONEDA_DE_PRUEBA, IMPORTE));
    expect(deLaEmpresa).toHaveBeenCalledWith("org-xa");
  });

  it("R14: sin empresa, en la moneda de la plataforma y sin consultar ningún país", async () => {
    expect(await montoDelPaquete(undefined)).toBe(formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE));
    expect(construirPaisServiceMock).not.toHaveBeenCalled();
    expect(deLaEmpresa).not.toHaveBeenCalled();
  });

  it("R14, R16: con una empresa de CR, el mismo texto que sin empresa", async () => {
    deLaEmpresa.mockResolvedValue(PAIS_CR);
    expect(await montoDelPaquete("org-cr")).toBe(await montoDelPaquete(undefined));
  });

  it("R14 (caída de R3): país sin moneda, la de la plataforma, un aviso en el log y la página se pinta", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      deLaEmpresa.mockResolvedValue({ ...PAIS_XA, moneda: null });
      expect(await montoDelPaquete("org-xa")).toBe(formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("org-xa"));
    } finally {
      warn.mockRestore();
    }
  });

  it("R14 (caída de R5): si la lectura del país falla, la de la plataforma, el error en el log y la página se pinta", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      deLaEmpresa.mockRejectedValue(new Error("base caída"));
      expect(await montoDelPaquete("org-xa")).toBe(formatearMontoEn(MONEDA_PLATAFORMA, IMPORTE));
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});

// ── Censo de R18 (T4.1) ──────────────────────────────────────────────────────────────────────

/**
 * Los archivos que ya pintan con la moneda del país (design §7). La lista SOLO CRECE: SLT-240 a
 * SLT-246 añaden los suyos. `servidor` marca la página que lee el país en el servidor por su cuenta
 * (design §7): la única a la que se le permite importar de `@/lib/actions/` algo del país.
 */
const CENSO_MONEDA_DEL_PAIS: readonly { archivo: string; servidor?: true }[] = [
  { archivo: "components/shared/PriceLabel.tsx" },
  { archivo: "components/shared/KpiValorAnimado.tsx" },
  { archivo: "components/shared/DesglosePagoField.tsx" },
  { archivo: "components/shared/EnviarPlantillaWhatsappButton.tsx" },
  { archivo: "components/shared/sinpe-preview-segmentos.ts" },
  { archivo: "components/shared/SinpeMensajePreview.tsx" },
  { archivo: "app/(app)/mis-asignaciones/_components/GestionarOrdenPanel.tsx" },
  { archivo: "app/(app)/mis-asignaciones/_components/AsignacionDetalle.tsx" },
  { archivo: "app/(app)/mis-asignaciones/_components/KpisMensajero.tsx" },
  { archivo: "app/(app)/mis-asignaciones/_components/pos-card/pos-format.ts" },
  { archivo: "app/(app)/mis-asignaciones/_components/pos-card/PosAmountRow.tsx" },
  { archivo: "app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx" },
  { archivo: "app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx" },
  { archivo: "app/(app)/mis-asignaciones/_components/chat/ChatConversacion.tsx" },
  { archivo: "app/(app)/recepcion-satelite/_components/RecepcionDetalle.tsx" },
  { archivo: "app/(app)/recepcion-satelite/_components/SateliteOrderCard.tsx" },
  { archivo: "app/paquete/[numGuia]/page.tsx", servidor: true },
];

/** Los formateadores que usan la moneda de la plataforma sin nombrarla (R18). */
const FORMATEADORES_IMPLICITOS = ["money", "moneyTope", "formatMonto", "formatMontoString", "formatMontoTope", "montoExacto"];
/**
 * Estos cuatro no tienen copia local con el mismo nombre en los archivos del censo: su llamada es
 * infracción venga de donde venga. `formatMonto` y `montoExacto` sí (`pos-format`, el reexport del
 * desglose), así que esos dos solo cuentan si vienen de `@/lib/config/moneda`.
 */
const SIEMPRE_IMPLICITOS = ["money", "moneyTope", "formatMontoString", "formatMontoTope"];
const MODULO_MONEDA = "@/lib/config/moneda";

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Las importaciones de `modulo`: nombre importado → nombre local, y los alias de `import * as`. */
function importacionesDe(codigo: string, modulo: string): { nombres: Map<string, string>; espacios: string[] } {
  const nombres = new Map<string, string>();
  const espacios: string[] = [];
  const desde = escaparRegex(modulo);
  for (const m of codigo.matchAll(new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*["']${desde}["']`, "g"))) {
    for (const parte of m[1].split(",")) {
      const [importado, local] = parte.replace(/\btype\s+/, "").trim().split(/\s+as\s+/);
      if (importado) nombres.set(importado.trim(), (local ?? importado).trim());
    }
  }
  for (const m of codigo.matchAll(new RegExp(`import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s*["']${desde}["']`, "g"))) {
    espacios.push(m[1]);
  }
  return { nombres, espacios };
}

/** Lo que un archivo del censo hace mal (R18 y design §6, §8); vacío si nada. */
function infraccionesDeMoneda(fuente: string, opciones: { servidor?: boolean } = {}): string[] {
  const codigo = quitarComentarios(fuente);
  const infracciones: string[] = [];
  const llama = (nombre: string) => new RegExp(`(?<![\\w.$])${escaparRegex(nombre)}\\s*\\(`).test(codigo);

  for (const nombre of SIEMPRE_IMPLICITOS) if (llama(nombre)) infracciones.push(`llama a ${nombre}(`);

  const { nombres, espacios } = importacionesDe(codigo, MODULO_MONEDA);
  for (const implicito of FORMATEADORES_IMPLICITOS) {
    const local = nombres.get(implicito);
    if (local && llama(local) && !infracciones.includes(`llama a ${local}(`)) {
      infracciones.push(`llama a ${implicito}( de ${MODULO_MONEDA}`);
    }
    for (const espacio of espacios) {
      if (new RegExp(`\\b${espacio}\\.${implicito}\\s*\\(`).test(codigo)) {
        infracciones.push(`llama a ${espacio}.${implicito}(`);
      }
    }
  }

  if (/\bmonedaConfig\s*(?:\.(?!locale\b)|\[)/.test(codigo)) infracciones.push("lee monedaConfig más allá de .locale");
  if (/\blocalStorage\b/.test(codigo)) infracciones.push("usa localStorage");

  if (!opciones.servidor) {
    for (const m of codigo.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']@\/lib\/actions\/[^"']*["']/g)) {
      if (/pais|moneda|impuesto/i.test(m[1])) infracciones.push(`lee el país por una acción: ${m[1].trim()}`);
    }
  }
  return infracciones;
}

describe("SLT-235/T4.1 — censo de R18: las pantallas en la moneda del país no vuelven a la implícita", () => {
  const leer = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it.each(CENSO_MONEDA_DEL_PAIS)("R18: $archivo no llama a los formateadores implícitos ni lee monedaConfig", ({ archivo, servidor }) => {
    expect(existsSync(join(process.cwd(), archivo)), `${archivo} no existe: ¿se movió sin actualizar el censo?`).toBe(true);
    expect(infraccionesDeMoneda(leer(archivo), { servidor })).toEqual([]);
  });

  describe("contraprueba sobre fuentes inventadas", () => {
    const ROJOS: [string, string][] = [
      ["money( importado", `import { money } from "${MODULO_MONEDA}";\nmoney(1);`],
      ["money( sin importar", `const t = money(1);`],
      ["moneyTope(", `import { moneyTope } from "${MODULO_MONEDA}";\nmoneyTope(1);`],
      ["formatMonto( importado", `import { formatMonto } from "${MODULO_MONEDA}";\nformatMonto(1);`],
      ["formatMonto( con alias", `import { formatMonto as f, SIN_MONTO_RAYA } from "${MODULO_MONEDA}";\nf(1, SIN_MONTO_RAYA);`],
      ["montoExacto( importado", `import {\n  montoExacto,\n} from "${MODULO_MONEDA}";\nmontoExacto(1);`],
      ["formatMontoString(", `formatMontoString("1");`],
      ["import * as", `import * as M from "${MODULO_MONEDA}";\nM.formatMonto(1);`],
      ["monedaConfig.simbolo", `import { monedaConfig } from "${MODULO_MONEDA}";\nconst s = monedaConfig.simbolo;`],
      ["monedaConfig[…]", `const d = monedaConfig["decimales"];`],
      ["localStorage", `const m = localStorage.getItem("moneda");`],
      ["acción que lee el país", `import { leerMonedaDelPais } from "@/lib/actions/pais";`],
    ];
    it.each(ROJOS)("R18: rojo con %s", (_caso, fuente) => {
      expect(infraccionesDeMoneda(fuente)).not.toEqual([]);
    });

    const VERDES: [string, string][] = [
      ["formatearMontoEn con la moneda", `import { formatearMontoEn } from "${MODULO_MONEDA}";\nformatearMontoEn(moneda, 1);`],
      ["un formatMonto local", `function formatMonto(m: number, moneda: FormatoMoneda) { return formatearMontoEn(moneda, m); }\nformatMonto(1, moneda);`],
      ["montoExacto solo reexportado", `import { montoExacto } from "${MODULO_MONEDA}";\nexport { montoExacto };`],
      ["monedaConfig.locale", `new Intl.NumberFormat(monedaConfig.locale);`],
      ["una llamada en un comentario", `// money(1) y formatMonto(2)\n/* localStorage */\nconst x = 1;`],
      ["una acción que no es del país", `import { listarHiloChat } from "@/lib/actions/chat-whatsapp";`],
    ];
    it.each(VERDES)("R18: verde con %s", (_caso, fuente) => {
      expect(infraccionesDeMoneda(fuente)).toEqual([]);
    });

    it("R18: la página de servidor puede leer el país por su composition root; un componente, no", () => {
      const fuente = `import { construirPaisService } from "@/lib/actions/_shared/paises-plataforma";`;
      expect(infraccionesDeMoneda(fuente, { servidor: true })).toEqual([]);
      expect(infraccionesDeMoneda(fuente)).not.toEqual([]);
    });
  });

  it("R18: rojo si un archivo REAL del censo vuelve a un formateador implícito", () => {
    for (const { archivo, servidor } of CENSO_MONEDA_DEL_PAIS) {
      const reescrito = `${leer(archivo)}\nimport { money as dinero } from "${MODULO_MONEDA}";\nexport const _x = dinero(1);\n`;
      expect(infraccionesDeMoneda(reescrito, { servidor }), archivo).not.toEqual([]);
    }
    const posFormat = leer("app/(app)/mis-asignaciones/_components/pos-card/pos-format.ts")
      .replace(`import { formatearMontoEn,`, `import { formatMonto as formatMontoConfigurado, formatearMontoEn,`)
      .replace(`formatearMontoEn(moneda, monto, SIN_MONTO_RAYA)`, `formatMontoConfigurado(monto, SIN_MONTO_RAYA)`);
    expect(infraccionesDeMoneda(posFormat)).toEqual([`llama a formatMonto( de ${MODULO_MONEDA}`]);
  });
});
