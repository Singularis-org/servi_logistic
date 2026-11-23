// @vitest-environment jsdom
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { CierreDiaModule } from "@/app/(app)/cierre-dia/_components/CierreDiaModule";
import { AjustarPagoMensajeroDialog } from "@/app/(app)/cierres-admin/_components/AjustarPagoMensajeroDialog";
import { CierresAdminModule } from "@/app/(app)/cierres-admin/_components/CierresAdminModule";
import { ConsolidacionBodegaModule } from "@/app/(app)/cierres-admin/_components/ConsolidacionBodegaModule";
import { CorregirPagosDialog } from "@/app/(app)/cierres-admin/_components/CorregirPagosDialog";
import { MarcaAjustado } from "@/app/(app)/cierres-admin/_components/MarcaAjustado";
import { PendienteLiquidarBadge } from "@/app/(app)/cierres-admin/_components/PendienteLiquidarBadge";
import { RegistrarPagoMensajeroDialog } from "@/app/(app)/cierres-admin/_components/RegistrarPagoMensajeroDialog";
import { TotalesPanel } from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import { PAGO_MENSAJERO_TEXTO } from "@/app/(app)/cierres-admin/_components/pago-mensajero-labels";
import { mensajeDeCuadre } from "@/components/shared/DesglosePagoField";
import { montoValido } from "@/components/shared/monto-cliente";
import { listarCierresPasadosPaginado } from "@/lib/actions/cierre-dia";
import {
  ajustarPagoMensajeroGestion,
  aprobarCierre,
  listarPendientesCierresAdminPaginado,
  verCierreDetalle,
} from "@/lib/actions/cierres-admin";
import { registrarPagoMensajeroAction } from "@/lib/actions/liquidacion";
import {
  formatearMontoEn,
  formatearTopeEn,
  MONEDA_PLATAFORMA,
  SIN_MONTO_RAYA,
  type FormatoMoneda,
} from "@/lib/config/moneda";
import type { CierreConsolidableCola } from "@/lib/interfaces/services/ICierreBodegaService";
import type {
  AjustePagoGestionDTO,
  CierreDetalleGestion,
  CierreTotales,
  TotalesIngresoEmpresa,
} from "@/lib/interfaces/services/ICierreDiaService";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";
import { INDEMNIZACION_MONTO_MAX } from "@/lib/types/cierres-admin";
import type { RegistrarPagoResult } from "@/lib/types/liquidacion";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { MonedaDelPaisProvider } from "@/providers/MonedaDelPaisProvider";
import { MONEDA_CR, MONEDA_DE_PRUEBA } from "@/tests/fabricas/reglas-pais";
import { gestion478, grupos478 } from "@/tests/fixtures/gestion-detalle-478";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DescargarCierresButton,
  NIVEL_DETALLE_LABEL,
  NIVEL_LEGEND,
  SELECTOR_DISPARADOR,
  type DescargaResumenCierres,
} from "@/app/(app)/cierres-admin/_components/DescargarCierresButton";
import { columnasCierresBodegaModeloNuevoPara } from "@/app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga-columnas";
import { COLUMNAS_DESCARGA_GESTIONES_FUNDIDA } from "@/app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas";
import { columnasGestionesModeloNuevoPara } from "@/app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga-columnas";
import { columnasCierresModeloNuevoPara } from "@/app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga-columnas";
import {
  ENCABEZADO_CON_IMPUESTO,
  conImpuestoEnColumnas,
  conImpuestoEnHojas,
  conImpuestoEnResultado,
  encabezadoBase,
  impuestoEntreParentesis,
  type ClaveConImpuesto,
} from "@/app/(app)/cierres-admin/_components/encabezados-con-impuesto";
import type { DescargaFilasResult } from "@/components/shared/DataTable";
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";
import type { DescargaColumna, DescargaHoja } from "@/lib/types/descarga";
import { CATALOGO_FILTROS_CIERRES_VACIO } from "@/lib/types/filtros-cierres";
import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

// SLT-243 — Moneda e impuesto del pais en pantallas: cierres del admin.
//
// Un `describe` por requisito, con el `R<n>` en el nombre. Cada bloque de tasks.md AÑADE los suyos al
// final del archivo; no se reordena lo de los demas. Cada caso de pantalla se monta tres veces: con
// `MONEDA_DE_PRUEBA` + «IGV», con `MONEDA_CR` + «IVA» y sin proveedor. Con CR el texto debe ser,
// caracter a caracter, el mismo que sin proveedor (R12, R13).
//
// Las acciones se doblan como en los tests que ya existen de cada pantalla
// (`CierreDiaModule.test.tsx`, `ConsolidacionBodegaRefresco.test.tsx`,
// `AjustarPagoMensajeroDialog.test.tsx`, `CierresAdminPagoMensajero.test.tsx`,
// `CierresAdminIndemnizacion.test.tsx`, `CorregirPagosCierre.test.tsx`). Un solo doble por modulo
// para todo el archivo: lleva la union de lo que importa cada pantalla.

const dobles = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  refresh: vi.fn(),
  consolidables: vi.fn(),
  solicitados: vi.fn(),
}));

vi.mock("@/lib/actions/cierres-admin", () => ({
  listarGestionesCierresAdminCompleto: vi.fn(),
  verCierreDetalle: vi.fn(),
  aprobarCierre: vi.fn(),
  rechazarCierre: vi.fn(),
  listarCierresAdmin: vi.fn(),
  forzarSolicitudVencido: vi.fn(),
  listarHistoricoCierresAdminPaginado: vi.fn(async () => ({
    status: "ok" as const,
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  })),
  listarPendientesCierresAdminPaginado: vi.fn(),
  ajustarPagoMensajeroGestion: vi.fn(),
  actualizarPagosGestion: vi.fn(),
}));

vi.mock("@/lib/actions/cierre-dia", () => ({
  solicitarCierre: vi.fn(),
  listarCierreDia: vi.fn(),
  deshacerGestion: vi.fn(),
  verCierrePasado: vi.fn(),
  listarCierresPasadosPaginado: vi.fn(),
}));

vi.mock("@/lib/actions/cierre-bodega", () => ({
  listarGestionesCierresBodegaCompleto: vi.fn(),
  verCierreBodegaDetalle: vi.fn(),
  aprobarCierreBodega: vi.fn(),
  rechazarCierreBodega: vi.fn(),
  solicitarCierreBodega: vi.fn(),
  listarCierresBodegaAdmin: vi.fn(),
  listarConsolidacion: vi.fn(),
  listarPendientesCierresBodegaCompleto: vi.fn(),
  listarPendientesCierresBodegaPaginado: vi.fn(),
  listarHistoricoCierresBodegaPaginado: vi.fn(),
  listarConsolidablesPaginado: (...a: unknown[]) => dobles.consolidables(...a),
  listarCierresBodegaSolicitadosPaginado: (...a: unknown[]) => dobles.solicitados(...a),
  listarConsolidablesCompleto: vi.fn(),
  listarCierresBodegaSolicitadosCompleto: vi.fn(),
}));

vi.mock("@/lib/actions/liquidacion", () => ({
  registrarPagoMensajeroAction: vi.fn(),
  listarPagosDeCierreAction: vi.fn(),
  anularPagoAction: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: dobles.success,
    error: dobles.error,
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: dobles.refresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

/** Los tres montajes de cada caso de pantalla (R12, R13). */
type Montaje = "prueba" | "cr" | "sin proveedor";
const MONTAJES: readonly Montaje[] = ["prueba", "cr", "sin proveedor"];

/** La moneda con la que cada montaje debe pintar. Sin proveedor, la de la plataforma (R13). */
const MONEDA_DEL_MONTAJE: Record<Montaje, FormatoMoneda> = {
  prueba: MONEDA_DE_PRUEBA,
  cr: MONEDA_CR,
  "sin proveedor": MONEDA_PLATAFORMA,
};

function montar(montaje: Montaje, ui: ReactElement): ReactElement {
  if (montaje === "prueba") {
    return (
      <MonedaDelPaisProvider moneda={MONEDA_DE_PRUEBA} impuestoNombre="IGV">
        {ui}
      </MonedaDelPaisProvider>
    );
  }
  if (montaje === "cr") {
    return (
      <MonedaDelPaisProvider moneda={MONEDA_CR} impuestoNombre="IVA">
        {ui}
      </MonedaDelPaisProvider>
    );
  }
  return ui;
}

const conRaya = (moneda: FormatoMoneda, valor: string): string =>
  formatearMontoEn(moneda, valor, SIN_MONTO_RAYA);

const colapsar = (texto: string): string => texto.replace(/\s+/g, " ").trim();

/**
 * Lee el texto de una pantalla en los tres montajes, desmontando entre uno y otro. `leer` monta,
 * interactua y devuelve el texto que interesa; aqui solo se limpia.
 */
async function enLosTresMontajes(leer: (m: Montaje) => Promise<string>): Promise<Record<Montaje, string>> {
  const textos = {} as Record<Montaje, string>;
  for (const m of MONTAJES) {
    textos[m] = await leer(m);
    cleanup();
  }
  return textos;
}

/** R12 y R13 en una linea: CR = sin proveedor, y con la de prueba sale otra cosa. */
function compruebaCostaRicaYCaida(textos: Record<Montaje, string>): void {
  expect(textos.cr).toBe(textos["sin proveedor"]);
  expect(textos.prueba).not.toBe(textos["sin proveedor"]);
  expect(textos.prueba).toContain("€");
  expect(textos.prueba).not.toContain("₡");
}

// ---------------------------------------------------------------------------------------------
// Bloque 1 — aviso de cuadre con la moneda obligatoria (R7, R8)
// ---------------------------------------------------------------------------------------------

/** Un `monto_recibido` con centimos: el aviso de cuadre dice que no puede cuadrar (feature 300). */
const RECIBIDO_CON_CENTIMOS = "11898.81";

const GESTION_CON_CENTIMOS: CierreDetalleGestion = gestion478({
  gestionId: "g-centimos",
  resultado: "entregado",
  numRemision: "REM-C1",
  destinatario: "Carla Centimos",
  montoRecibido: RECIBIDO_CON_CENTIMOS,
  pagos: [{ metodo: "efectivo", monto: "11898.00" }],
});

async function avisoDeCorregirPagos(montaje: Montaje): Promise<string> {
  render(
    montar(
      montaje,
      <CorregirPagosDialog gestion={GESTION_CON_CENTIMOS} onOpenChange={vi.fn()} onCorregido={vi.fn()} />,
    ),
  );
  const dialogo = await screen.findByRole("dialog", { name: "Corregir métodos de pago" });
  const aviso = within(dialogo)
    .getAllByRole("alert")
    .find((a) => (a.textContent ?? "").startsWith("El monto a cobrar es"));
  return aviso?.textContent ?? "";
}

describe("SLT-243 R7 — el aviso de cuadre de CorregirPagosDialog va en la moneda del pais", () => {
  it.each(MONTAJES)("%s: el aviso es `mensajeDeCuadre` con la moneda del montaje", async (montaje) => {
    const aviso = await avisoDeCorregirPagos(montaje);
    // Con centimos el aviso no depende de las lineas: solo del monto (feature 300).
    expect(aviso).toBe(mensajeDeCuadre([], Number(RECIBIDO_CON_CENTIMOS), MONEDA_DEL_MONTAJE[montaje]));
  });

  it("con la de prueba dice «€»; con CR, lo mismo que sin proveedor (R12, R13)", async () => {
    const textos = await enLosTresMontajes(avisoDeCorregirPagos);
    compruebaCostaRicaYCaida(textos);
    // Escrito a mano: el importe con la moneda de prueba (0 decimales, espacio de miles).
    expect(textos.prueba).toContain("€11 899");
    expect(textos["sin proveedor"]).toContain("₡11.898,81");
  });
});

describe("SLT-243 R8 — el typecheck rechaza el aviso de cuadre y los avisos de pago sin moneda", () => {
  it("mensajeDeCuadre, registrado y anulado piden la moneda (lo comprueba `pnpm run typecheck`)", () => {
    // Las funciones no se llaman: lo que se afirma es que NO compilan sin la moneda. Si alguna
    // vuelve a aceptar la llamada, el `@ts-expect-error` sobra y el typecheck falla.
    const sinMoneda = [
      // @ts-expect-error SLT-243 R8: `mensajeDeCuadre` exige la moneda (sin default).
      () => mensajeDeCuadre([], 1),
      // @ts-expect-error SLT-243 R8: el aviso de pago registrado exige la moneda.
      () => PAGO_MENSAJERO_TEXTO.registrado("1.00"),
      // @ts-expect-error SLT-243 R8: el aviso de pago anulado exige la moneda.
      () => PAGO_MENSAJERO_TEXTO.anulado("1.00"),
    ];
    expect(sinMoneda).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------------------------
// Bloque 2 — importes de las pantallas (R1-R5)
// ---------------------------------------------------------------------------------------------

const TOTALES_DIA: CierreTotales = {
  efectivo: "12345.00",
  simpe: "0.00",
  transferencia: "0.00",
  general: "12345.00",
};

/** Monta `/cierre-dia` con una gestion, abre «Solicitar cierre del dia» y lee su resumen. */
async function resumenDeCierreDia(montaje: Montaje, totalPagoMensajero: string): Promise<string> {
  const pagina = paginaInicial([]);
  vi.mocked(listarCierresPasadosPaginado).mockResolvedValue({ status: "ok", page: 1, ...pagina });
  render(
    montar(
      montaje,
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <CierreDiaModule
          grupos={grupos478({ entregado: [gestion478({ gestionId: "g1", resultado: "entregado" })] })}
          totales={TOTALES_DIA}
          totalPagoMensajero={totalPagoMensajero}
          puedesSolicitar
          motivoBloqueo={null}
          cierresPasados={pagina}
          bloqueo={SIN_BLOQUEO}
        />
      </SWRConfig>,
    ),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^Solicitar cierre del día/ }));
  const dialogo = await screen.findByRole("dialog", { name: "Solicitar cierre del día" });
  return colapsar(within(dialogo).getByLabelText("Resumen del cierre a solicitar").textContent ?? "");
}

describe("SLT-243 R1 — /cierre-dia pinta el total general y el pago al mensajero en la moneda del pais", () => {
  it.each(MONTAJES)("%s: los dos totales del resumen, con la moneda del montaje", async (montaje) => {
    const texto = await resumenDeCierreDia(montaje, "4500.00");
    const moneda = MONEDA_DEL_MONTAJE[montaje];
    expect(texto).toContain(`Recaudado${conRaya(moneda, "12345.00")}`);
    expect(texto).toContain(`Tu ganancia${conRaya(moneda, "4500.00")}`);
  });

  it("con la de prueba, «€12 345» y «€4 500»; con CR, lo mismo que sin proveedor (R12, R13)", async () => {
    const textos = await enLosTresMontajes((m) => resumenDeCierreDia(m, "4500.00"));
    compruebaCostaRicaYCaida(textos);
    expect(textos.prueba).toContain("Recaudado€12 345");
    expect(textos.prueba).toContain("Tu ganancia€4 500");
    expect(textos["sin proveedor"]).toContain("Recaudado₡12.345");
  });

  it("sin importe pinta la raya larga en los tres montajes", async () => {
    const textos = await enLosTresMontajes((m) => resumenDeCierreDia(m, ""));
    for (const m of MONTAJES) expect(textos[m], m).toContain(`Tu ganancia${SIN_MONTO_RAYA}`);
  });
});

const GESTION_A_AJUSTAR: CierreDetalleGestion = gestion478({
  gestionId: "22222222-2222-4222-8222-222222222222",
  resultado: "entregado",
  numRemision: "REM-E1",
  destinatario: "Carla Entregada",
  pagoMensajero: "12345.00",
});

const AJUSTE: AjustePagoGestionDTO = {
  creadoAt: "2026-10-29T14:30:00.000Z",
  actorNombre: "Marta Maestra",
  actorRol: "maestro",
  pagoAnterior: "12345.00",
  pagoNuevo: "15000.00",
  motivo: "Entrega en zona lejana",
};

/** Abre el dialogo de ajustar; con `confirmar`, ajusta (accion doblada) y lee el «hecho». */
async function textoDeAjustar(montaje: Montaje, confirmar: boolean): Promise<string> {
  vi.mocked(ajustarPagoMensajeroGestion).mockResolvedValue({
    status: "ok",
    gestionId: GESTION_A_AJUSTAR.gestionId,
    pagoMensajero: "15000.00",
    totalPagoMensajero: "40000.00",
    ajuste: AJUSTE,
  });
  render(
    montar(
      montaje,
      <AjustarPagoMensajeroDialog gestion={GESTION_A_AJUSTAR} onOpenChange={vi.fn()} onAjustado={vi.fn()} />,
    ),
  );
  const dialogo = screen.getByRole("dialog", { name: "Ajustar el pago al mensajero" });
  if (confirmar) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Valor nuevo"), "15000");
    await user.type(screen.getByLabelText("Motivo del ajuste"), "Entrega en zona lejana");
    await user.click(screen.getByRole("button", { name: "Guardar ajuste" }));
    await screen.findByRole("button", { name: "Cerrar" });
  }
  return colapsar(dialogo.textContent ?? "");
}

describe("SLT-243 R2 — el dialogo de ajustar el pago pinta sus importes en la moneda del pais", () => {
  it.each(MONTAJES)("%s: el pago vigente", async (montaje) => {
    const texto = await textoDeAjustar(montaje, false);
    expect(texto).toContain(`Pago vigente${conRaya(MONEDA_DEL_MONTAJE[montaje], "12345.00")}`);
  });

  it.each(MONTAJES)("%s: tras ajustar, el pago nuevo y el total del cierre", async (montaje) => {
    const texto = await textoDeAjustar(montaje, true);
    const moneda = MONEDA_DEL_MONTAJE[montaje];
    expect(texto).toContain(`Pago de esta orden${conRaya(moneda, "15000.00")}`);
    expect(texto).toContain(`Total de pago al mensajero del cierre${conRaya(moneda, "40000.00")}`);
  });

  it("con la de prueba, «€12 345», «€15 000» y «€40 000»; con CR, lo mismo que sin proveedor", async () => {
    const vigente = await enLosTresMontajes((m) => textoDeAjustar(m, false));
    compruebaCostaRicaYCaida(vigente);
    expect(vigente.prueba).toContain("Pago vigente€12 345");
    const hecho = await enLosTresMontajes((m) => textoDeAjustar(m, true));
    compruebaCostaRicaYCaida(hecho);
    expect(hecho.prueba).toContain("Pago de esta orden€15 000");
    expect(hecho.prueba).toContain("Total de pago al mensajero del cierre€40 000");
    expect(hecho["sin proveedor"]).toContain("Pago de esta orden₡15.000");
  });
});

/** Abre la marca «ajustado» y lee su lista de ajustes. */
async function textoDeLaMarca(montaje: Montaje): Promise<string> {
  render(montar(montaje, <MarcaAjustado ajustes={[AJUSTE]} />));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Pago ajustado: ver el ajuste" }));
  const lista = await screen.findByRole("list", { name: "Ajustes del pago al mensajero" });
  return colapsar(lista.textContent ?? "");
}

describe("SLT-243 R3 — la marca «ajustado» pinta el pago anterior y el nuevo en la moneda del pais", () => {
  it.each(MONTAJES)("%s: «anterior → nuevo» con la moneda del montaje", async (montaje) => {
    const texto = await textoDeLaMarca(montaje);
    const moneda = MONEDA_DEL_MONTAJE[montaje];
    expect(texto).toContain(`${conRaya(moneda, "12345.00")} → ${conRaya(moneda, "15000.00")}`);
  });

  it("con la de prueba, «€12 345 → €15 000»; con CR, lo mismo que sin proveedor (R12, R13)", async () => {
    const textos = await enLosTresMontajes(textoDeLaMarca);
    compruebaCostaRicaYCaida(textos);
    expect(textos.prueba).toContain("€12 345 → €15 000");
    expect(textos["sin proveedor"]).toContain("₡12.345 → ₡15.000");
  });
});

const TOTALES_BODEGA: CierreTotales = {
  efectivo: "90000.00",
  simpe: "0.00",
  transferencia: "0.00",
  general: "90000.00",
};

const CONSOLIDABLE: CierreConsolidableCola = {
  cierreDiaId: "cd-1",
  mensajeroId: "m-1",
  mensajeroNombre: "Mensajero Uno",
  totales: TOTALES_BODEGA,
  totalPagoMensajero: "15000.00",
  totalIngresoBodegaRechazos: "2500.00",
  paraLaCentral: "77500.00",
  aprobadoAt: "2026-11-08T01:10:00.000Z",
  gestionesAjustadas: 0,
};

/** Monta la consolidacion, abre «Solicitar cierre de bodega» y lee el resumen del dialogo. */
async function resumenDeConsolidacion(montaje: Montaje): Promise<string> {
  const vacia = { status: "ok" as const, items: [], page: 1, pageSize: 10, total: 0 };
  dobles.consolidables.mockResolvedValue({ ...vacia, items: [CONSOLIDABLE], total: 1 });
  dobles.solicitados.mockResolvedValue(vacia);
  render(
    montar(
      montaje,
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ConsolidacionBodegaModule
          consolidables={{ items: [CONSOLIDABLE], total: 1, pageSize: 10 }}
          totalesAgregados={TOTALES_BODEGA}
          totalPagoMensajeroAgregado="15000.00"
          totalIngresoBodegaRechazosAgregado="2500.00"
          incluyeModeloNuevoAgregado={false}
          totalCentralDebeAgregado="0.00"
          puedesSolicitar
          motivoBloqueo={null}
          paraLaCentralAgregado="77500.00"
          cierresAConsolidar={1}
          mensajerosAConsolidar={1}
          bloqueo={null}
          zonaNombre="Limón"
          cierresBodegaPasados={{ items: [], total: 0, pageSize: 10 }}
          solicitadosResumen={{
            porLlegar: { monto: "0.00", cierres: 0 },
            recibido30Dias: { monto: "0.00", cierres: 0 },
            faltaPorRecibir: { monto: "0.00", cierres: 0 },
          }}
          sinZona={false}
        />
      </SWRConfig>,
    ),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Solicitar cierre de bodega" }));
  const dialogo = await screen.findByRole("dialog", { name: "Solicitar cierre de bodega" });
  return colapsar(
    within(dialogo).getByLabelText("Resumen del cierre de bodega a solicitar").textContent ?? "",
  );
}

describe("SLT-243 R4 — la consolidacion de bodega pinta sus 4 totales agregados en la moneda del pais", () => {
  it.each(MONTAJES)("%s: recaudado, pago a mensajeros, ingreso de la bodega y lo de la central", async (montaje) => {
    const texto = await resumenDeConsolidacion(montaje);
    const moneda = MONEDA_DEL_MONTAJE[montaje];
    expect(texto).toContain(`Recaudado${conRaya(moneda, "90000.00")}`);
    expect(texto).toContain(`Pago a mensajeros${conRaya(moneda, "15000.00")}`);
    expect(texto).toContain(`Gana la bodega satélite${conRaya(moneda, "2500.00")}`);
    expect(texto).toContain(`Debe llegar a la central${conRaya(moneda, "77500.00")}`);
  });

  it("con la de prueba, «€90 000»… «€77 500»; con CR, lo mismo que sin proveedor (R12, R13)", async () => {
    const textos = await enLosTresMontajes(resumenDeConsolidacion);
    compruebaCostaRicaYCaida(textos);
    expect(textos.prueba).toBe(
      "Recaudado€90 000Pago a mensajeros€15 000Gana la bodega satélite€2 500Debe llegar a la central€77 500",
    );
    expect(textos["sin proveedor"]).toBe(
      "Recaudado₡90.000Pago a mensajeros₡15.000Gana la bodega satélite₡2.500Debe llegar a la central₡77.500",
    );
  });
});

const TOTALES_PANEL: CierreTotales = {
  efectivo: "10000.00",
  simpe: "20000.00",
  transferencia: "30000.00",
  general: "60000.00",
};

async function textoDelPanel(montaje: Montaje): Promise<string> {
  render(
    montar(
      montaje,
      <TotalesPanel totales={TOTALES_PANEL} ariaLabel="Totales del cierre" title="Totales" neto="55000.00" />,
    ),
  );
  return colapsar(screen.getByRole("region", { name: "Totales del cierre" }).textContent ?? "");
}

describe("SLT-243 R5 — el panel de totales de la correccion pinta sus importes en la moneda del pais", () => {
  it.each(MONTAJES)("%s: efectivo, SINPE, transferencia, general y neto", async (montaje) => {
    const texto = await textoDelPanel(montaje);
    const moneda = MONEDA_DEL_MONTAJE[montaje];
    for (const [rotulo, valor] of [
      ["Efectivo", "10000.00"],
      ["SINPE", "20000.00"],
      ["Transferencia", "30000.00"],
      ["Total general", "60000.00"],
      ["Total neto", "55000.00"],
    ] as const) {
      expect(texto, rotulo).toContain(`${rotulo}${conRaya(moneda, valor)}`);
    }
  });

  it("con la de prueba, «€10 000»… «€55 000»; con CR, lo mismo que sin proveedor (R12, R13)", async () => {
    const textos = await enLosTresMontajes(textoDelPanel);
    compruebaCostaRicaYCaida(textos);
    for (const literal of ["€10 000", "€20 000", "€30 000", "€60 000", "€55 000"]) {
      expect(textos.prueba).toContain(literal);
    }
    expect(textos["sin proveedor"]).toContain("₡60.000");
  });
});

// ---------------------------------------------------------------------------------------------
// Bloque 3 — pago al mensajero e indemnizacion (R6, R9)
// ---------------------------------------------------------------------------------------------

async function textoDeLaInsignia(montaje: Montaje): Promise<string> {
  const { container } = render(montar(montaje, <PendienteLiquidarBadge pendiente="50000.00" />));
  return colapsar(container.textContent ?? "");
}

const PAGO_OK: RegistrarPagoResult = {
  status: "ok",
  pago: {
    id: "3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c",
    monto: "50000.00",
    metodo: "efectivo",
    referencia: null,
    nota: null,
    fechaPago: "2026-07-31",
    registradoPorNombre: "Ana Maestra",
    registradoAt: "2026-08-02T15:04:05.000Z",
    esDeReparto: false,
    anulacion: null,
  },
  restante: "0.00",
};

/** Registra un pago desde el dialogo (accion doblada) y devuelve el aviso de exito. */
async function avisoDePagoRegistrado(montaje: Montaje): Promise<string> {
  vi.mocked(registrarPagoMensajeroAction).mockResolvedValue(PAGO_OK);
  render(
    montar(
      montaje,
      <RegistrarPagoMensajeroDialog
        open
        onOpenChange={vi.fn()}
        cierreId="c1"
        mensajeroNombre="Ana Mensajera"
        pendiente="50000.00"
      />,
    ),
  );
  const dialogo = await screen.findByRole("dialog", { name: "Registrar pago a Ana Mensajera" });
  const user = userEvent.setup();
  await user.click(within(dialogo).getByRole("button", { name: "Registrar pago" }));
  await waitFor(() => expect(dobles.success).toHaveBeenCalled());
  return String(dobles.success.mock.calls.at(-1)?.[0] ?? "");
}

describe("SLT-243 R6 — el pago al mensajero escribe sus importes en la moneda del pais", () => {
  it.each(MONTAJES)("%s: la insignia del pendiente de liquidar", async (montaje) => {
    expect(await textoDeLaInsignia(montaje)).toBe(conRaya(MONEDA_DEL_MONTAJE[montaje], "50000.00"));
  });

  it("insignia: «€50 000» con la de prueba; con CR, lo mismo que sin proveedor (R12, R13)", async () => {
    const textos = await enLosTresMontajes(textoDeLaInsignia);
    compruebaCostaRicaYCaida(textos);
    expect(textos.prueba).toBe("€50 000");
    expect(textos["sin proveedor"]).toBe("₡50.000");
  });

  it("los avisos de pago registrado y anulado, con la moneda que se les pasa", () => {
    expect(PAGO_MENSAJERO_TEXTO.registrado("50000.00", MONEDA_DE_PRUEBA)).toBe("Pago de €50 000 registrado.");
    expect(PAGO_MENSAJERO_TEXTO.anulado("25000.00", MONEDA_DE_PRUEBA)).toBe(
      "Pago anulado. Pendiente de liquidar: €25 000.",
    );
    // Con CR, el mismo texto que con la de la plataforma (R12, R13).
    expect(PAGO_MENSAJERO_TEXTO.registrado("50000.00", MONEDA_CR)).toBe(
      PAGO_MENSAJERO_TEXTO.registrado("50000.00", MONEDA_PLATAFORMA),
    );
    expect(PAGO_MENSAJERO_TEXTO.registrado("50000.00", MONEDA_PLATAFORMA)).toBe("Pago de ₡50.000 registrado.");
    expect(PAGO_MENSAJERO_TEXTO.anulado("25000.00", MONEDA_CR)).toBe(
      PAGO_MENSAJERO_TEXTO.anulado("25000.00", MONEDA_PLATAFORMA),
    );
    expect(PAGO_MENSAJERO_TEXTO.anulado("25000.00", MONEDA_PLATAFORMA)).toBe(
      "Pago anulado. Pendiente de liquidar: ₡25.000.",
    );
  });

  it.each(MONTAJES)("%s: el dialogo de registrar avisa del pago con la moneda del montaje", async (montaje) => {
    expect(await avisoDePagoRegistrado(montaje)).toBe(
      PAGO_MENSAJERO_TEXTO.registrado("50000.00", MONEDA_DEL_MONTAJE[montaje]),
    );
  });

  it("aviso del dialogo: «€50 000» con la de prueba; con CR, lo mismo que sin proveedor", async () => {
    const textos = await enLosTresMontajes(avisoDePagoRegistrado);
    compruebaCostaRicaYCaida(textos);
    expect(textos.prueba).toBe("Pago de €50 000 registrado.");
  });
});

// R9 — el sub-modal de indemnizacion, con los dobles de `CierresAdminIndemnizacion.test.tsx`.

const SUB_MODAL = "Indemnizar los incidentes del cierre";
const APROBAR_PIE = /^(Aprobar|Revisar paquetes y aprobar)$/;
const CEROS: CierreTotales = { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" };

function resumenCierre(): CierreAdminResumen {
  return {
    cierreId: "c1",
    mensajeroId: "m-c1",
    mensajeroNombre: "Ana Mensajera",
    estado: "solicitado",
    destinoTipo: "bodega_central",
    destinoZonaId: "z1",
    destinoZonaNombre: "GAM",
    totales: CEROS,
    totalPagoMensajero: "0.00",
    totalIngresoBodegaRechazos: "0.00",
    pendientePagoMensajero: null,
    solicitadoAt: "2026-07-30T10:00:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
  };
}

const INGRESO_EN_CERO: TotalesIngresoEmpresa = {
  montoCobrar: "0.00",
  fleteConIva: "0.00",
  fleteDevolucionConIva: "0.00",
  comisionConIva: "0.00",
  total: "0.00",
  flete: "0.00",
  ivaFlete: "0.00",
  fleteDevolucion: "0.00",
  ivaFleteDevolucion: "0.00",
  comisionCod: "0.00",
  ivaComisionCod: "0.00",
};

/** Abre el detalle de `c1`, pulsa aprobar y deja abierto el sub-modal de indemnizacion. */
async function abrirIndemnizacion(montaje: Montaje): Promise<HTMLElement> {
  vi.mocked(verCierreDetalle).mockResolvedValue({
    ordenesSinGestion: [],
    sinGestionRegistrado: true,
    rechazosDeTienda: [],
    status: "ok",
    desgloseIngresoBodegaRechazos: { sla: "0.00", manual: "0.00", total: "0.00" },
    cierre: resumenCierre(),
    grupos: grupos478({
      incidente: [
        gestion478({
          gestionId: "gi1",
          resultado: "incidente",
          numRemision: "REM-INC-1",
          destinatario: "Beto Ruiz",
          causaIncidente: "danado",
        }),
      ],
    }),
    totalesIngreso: INGRESO_EN_CERO,
    ivaFacturado: "0.00",
    ganancia: "0.00",
    pagoTienda: "0.00",
    cobradoSobreRecaudado: "0.00",
    netoEmpresa: "0.00",
    fleteRechazoYaCobradoATienda: false,
    partesPorTienda: [],
  });
  vi.mocked(aprobarCierre).mockResolvedValue({
    status: "ok",
    cierreId: "c1",
    estado: "aprobado",
    pendientePagoMensajero: "0.00",
  });
  const cola = paginaInicial([resumenCierre()]);
  vi.mocked(listarPendientesCierresAdminPaginado).mockResolvedValue({ status: "ok", page: 1, ...cola });
  render(
    montar(
      montaje,
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <CierresAdminModule pendientes={cola} historico={paginaInicial<CierreAdminResumen>([])} sinZona={false} />
      </SWRConfig>,
    ),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Ver / decidir" }));
  const detalle = await screen.findByRole("dialog", { name: /^Detalle del cierre · / });
  await user.click(within(detalle).getByRole("button", { name: APROBAR_PIE }));
  return screen.findByRole("dialog", { name: SUB_MODAL });
}

/** La ayuda del campo y el error de exceso, tras teclear un monto de 11 digitos. */
async function textosDelTope(montaje: Montaje): Promise<string> {
  await abrirIndemnizacion(montaje);
  const ayuda = document.getElementById("indemnizacion-gi1-ayuda")?.textContent ?? "";
  fireEvent.change(document.getElementById("indemnizacion-gi1") as HTMLInputElement, {
    target: { value: "10000000000.00" },
  });
  const error = document.getElementById("indemnizacion-gi1-error")?.textContent ?? "";
  return `${ayuda} | ${error}`;
}

describe("SLT-243 R9 — el tope de la indemnizacion se anuncia en la moneda del pais, sin cuadrarlo al alza", () => {
  it.each(MONTAJES)("%s: la ayuda y el error de exceso llevan el tope con la moneda del montaje", async (montaje) => {
    const tope = formatearTopeEn(MONEDA_DEL_MONTAJE[montaje], INDEMNIZACION_MONTO_MAX, SIN_MONTO_RAYA);
    const [ayuda, error] = (await textosDelTope(montaje)).split(" | ");
    expect(ayuda).toBe(`Mayor que 0 y hasta ${tope}, con hasta 2 decimales (por ejemplo 12500.00).`);
    expect(error).toBe(
      `El monto no puede superar ${tope} (10 dígitos y 2 decimales). Revisa si sobra un dígito.`,
    );
    // El tope anunciado, tecleado sin separadores de miles (y con punto decimal), lo acepta el
    // validador del monto.
    const moneda = MONEDA_DEL_MONTAJE[montaje];
    const tecleado = tope
      .replace(moneda.simbolo, "")
      .split(moneda.separadorMiles)
      .join("")
      .replace(moneda.separadorDecimal, ".");
    expect(montoValido(tecleado, INDEMNIZACION_MONTO_MAX), tecleado).toBe(true);
  });

  it("con la de prueba, «€9 999 999 999» (nunca al alza); con CR, lo mismo que sin proveedor", async () => {
    const textos = await enLosTresMontajes(textosDelTope);
    compruebaCostaRicaYCaida(textos);
    expect(textos.prueba).toContain("€9 999 999 999");
    expect(textos.prueba).not.toContain("€10 000 000 000");
    expect(textos["sin proveedor"]).toContain("₡9.999.999.999");
  });
});

// ---------------------------------------------------------------------------------------------
// Bloque 4 — encabezados con impuesto de las descargas (R10, R11; la parte de descargas de R12–R13)
// ---------------------------------------------------------------------------------------------

/** Columna «Perú» de design §6.0, escrita a mano: lo que leería quien abre el archivo. */
const ENCABEZADOS_PERU: Record<ClaveConImpuesto, string> = {
  fleteConIva: "Flete + impuesto (IGV)",
  comisionConIva: "Comisión + impuesto (IGV)",
  fleteDevolucionConIva: "Flete por devolución a origen + impuesto (IGV)",
  ivaFlete: "Impuesto (IGV) del flete",
  ivaComisionCod: "Impuesto (IGV) de la comisión",
  ivaFleteDevolucion: "Impuesto (IGV) del flete de gestiones no entregadas",
  ivaIncluido: "De eso, impuesto (IGV)",
  ivaFulfillment: "Impuesto (IGV) de fulfillment",
  ivaFacturado: "Impuesto (IGV) facturado",
};

/** Columna «Costa Rica» de design §6.0, escrita a mano (R12). Es también la caída sin país (R13). */
const ENCABEZADOS_COSTA_RICA: Record<ClaveConImpuesto, string> = {
  fleteConIva: "Flete + impuesto (IVA)",
  comisionConIva: "Comisión + impuesto (IVA)",
  fleteDevolucionConIva: "Flete por devolución a origen + impuesto (IVA)",
  ivaFlete: "Impuesto (IVA) del flete",
  ivaComisionCod: "Impuesto (IVA) de la comisión",
  ivaFleteDevolucion: "Impuesto (IVA) del flete de gestiones no entregadas",
  ivaIncluido: "De eso, impuesto (IVA)",
  ivaFulfillment: "Impuesto (IVA) de fulfillment",
  ivaFacturado: "Impuesto (IVA) facturado",
};

const CLAVES_CON_IMPUESTO = Object.keys(ENCABEZADOS_PERU) as ClaveConImpuesto[];

/** Las cuatro declaraciones de columnas de design §6.1, en la audiencia que las trae todas. */
const DECLARACIONES: Record<string, DescargaColumna[]> = {
  "hoja fundida de gestiones": COLUMNAS_DESCARGA_GESTIONES_FUNDIDA,
  "gestiones del modelo nuevo": columnasGestionesModeloNuevoPara("admin"),
  "resumen de cierres de mensajero": columnasCierresModeloNuevoPara("admin"),
  "resumen de cierres de bodega": columnasCierresBodegaModeloNuevoPara("admin"),
};

const esClaveConImpuesto = (clave: string): clave is ClaveConImpuesto =>
  (CLAVES_CON_IMPUESTO as string[]).includes(clave);

describe("SLT-243 R10 — los encabezados con impuesto de las descargas de cierres dicen «impuesto (<nombre del país>)»", () => {
  it("(a) con «IGV», las 9 claves dan la columna «Perú» de la tabla, letra a letra", () => {
    for (const clave of CLAVES_CON_IMPUESTO) {
      expect(ENCABEZADO_CON_IMPUESTO[clave]("IGV"), clave).toBe(ENCABEZADOS_PERU[clave]);
    }
    expect(Object.keys(ENCABEZADO_CON_IMPUESTO).sort()).toEqual([...CLAVES_CON_IMPUESTO].sort());
    expect(impuestoEntreParentesis("IGV")).toBe("impuesto (IGV)");
  });

  it("(a) R12: con «IVA», las 9 dan la columna «Costa Rica»; y es el encabezado base (R13)", () => {
    for (const clave of CLAVES_CON_IMPUESTO) {
      expect(ENCABEZADO_CON_IMPUESTO[clave]("IVA"), clave).toBe(ENCABEZADOS_COSTA_RICA[clave]);
      expect(encabezadoBase(clave), clave).toBe(ENCABEZADOS_COSTA_RICA[clave]);
    }
  });

  it.each(Object.entries(DECLARACIONES))(
    "(a) %s: con «IGV» cambia solo el encabezado de las columnas con impuesto; claves, orden y lo demás, igual",
    (_nombre, columnas) => {
      const conIgv = conImpuestoEnColumnas(columnas, "IGV");
      // Las claves y su orden no cambian: son el contrato de la preferencia de columnas guardada.
      expect(conIgv.map((c) => c.clave)).toEqual(columnas.map((c) => c.clave));
      const conImpuesto = columnas.filter((c) => esClaveConImpuesto(c.clave));
      expect(conImpuesto.length).toBeGreaterThan(0); // no-vacuidad
      columnas.forEach((original, i) => {
        const nueva = conIgv[i]!;
        if (esClaveConImpuesto(original.clave)) {
          // La declaración trae el base (la forma de Costa Rica) y el país lo cambia.
          expect(original.encabezado).toBe(ENCABEZADOS_COSTA_RICA[original.clave]);
          expect(nueva).toEqual({ ...original, encabezado: ENCABEZADOS_PERU[original.clave] });
        } else {
          expect(nueva).toBe(original);
        }
      });
    },
  );

  it("(a) entre las cuatro declaraciones están las 9 claves de la tabla", () => {
    const claves = new Set(
      Object.values(DECLARACIONES)
        .flat()
        .map((c) => c.clave)
        .filter(esClaveConImpuesto),
    );
    expect([...claves].sort()).toEqual([...CLAVES_CON_IMPUESTO].sort());
  });

  it("(a) una columna con clave conocida y otro rótulo no se toca", () => {
    const ajena: DescargaColumna = { clave: "ivaFlete", encabezado: "Otro rótulo", formato: "monto" };
    const [resultado] = conImpuestoEnColumnas([ajena], "IGV");
    expect(resultado).toBe(ajena);
  });

  it("(b) con el rótulo de la plataforma devuelve el MISMO arreglo y las MISMAS hojas", () => {
    const columnas = DECLARACIONES["gestiones del modelo nuevo"]!;
    expect(conImpuestoEnColumnas(columnas, IMPUESTO_ROTULO)).toBe(columnas);
    const hojas: [DescargaHoja, ...DescargaHoja[]] = [{ titulo: "Gestiones", columnas, filas: [] }];
    expect(conImpuestoEnHojas(hojas, IMPUESTO_ROTULO)).toBe(hojas);
  });

  it("(c) sobre un resultado con libro cambia solo los encabezados; sin libro o con error, el mismo objeto", () => {
    const filasCierres = [{ folio: "C-1", ivaFacturado: "130.00" }];
    const filasGestiones = [{ folio: "C-1", ivaFlete: "26.00" }];
    const hojaCierres: DescargaHoja = {
      titulo: "Cierres",
      columnas: DECLARACIONES["resumen de cierres de mensajero"]!,
      filas: filasCierres,
      filasDestacadas: [0],
    };
    const hojaGestiones: DescargaHoja = {
      titulo: "Gestiones",
      columnas: DECLARACIONES["gestiones del modelo nuevo"]!,
      filas: filasGestiones,
    };
    const conLibro: DescargaFilasResult = {
      status: "ok",
      filas: filasCierres,
      libro: { hojas: [hojaCierres, hojaGestiones] },
    };

    const r = conImpuestoEnResultado(conLibro, "IGV");
    if (r.status !== "ok" || r.libro === undefined) throw new Error("se esperaba el libro");
    expect(r.filas).toBe(filasCierres);
    const [cierres, gestiones] = r.libro.hojas;
    expect(cierres.titulo).toBe("Cierres");
    expect(cierres.filas).toBe(filasCierres);
    expect(cierres.filasDestacadas).toEqual([0]);
    expect(cierres.columnas.find((c) => c.clave === "ivaFacturado")?.encabezado).toBe("Impuesto (IGV) facturado");
    expect(gestiones!.filas).toBe(filasGestiones);
    expect(gestiones!.columnas.find((c) => c.clave === "ivaFlete")?.encabezado).toBe("Impuesto (IGV) del flete");
    // Ningún encabezado del libro sigue diciendo el impuesto de la plataforma.
    const encabezados = r.libro.hojas.flatMap((h) => h.columnas.map((c) => c.encabezado));
    expect(encabezados.filter((e) => e.includes("(IVA)"))).toEqual([]);

    const sinLibro: DescargaFilasResult = { status: "ok", filas: filasCierres };
    expect(conImpuestoEnResultado(sinLibro, "IGV")).toBe(sinLibro);
    const conError: DescargaFilasResult = { status: "error", mensaje: "No se pudo." };
    expect(conImpuestoEnResultado(conError, "IGV")).toBe(conError);
  });

  /** El selector del botón de descarga en el nivel «Detalle»: las columnas que lista. */
  async function columnasDelDetalle(montaje: Montaje): Promise<string> {
    const resumen: DescargaResumenCierres = {
      titulo: "Cierres de prueba",
      columnas: [{ clave: "folio", encabezado: "Folio" }],
      ambitoColumnas: "slt-243-prueba",
      obtenerFilas: async () => ({ status: "ok", filas: [] }),
    };
    const user = userEvent.setup();
    render(
      montar(
        montaje,
        <DescargarCierresButton
          resumen={resumen}
          catalogo={CATALOGO_FILTROS_CIERRES_VACIO}
          accion={vi.fn()}
          audiencia="admin"
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: SELECTOR_DISPARADOR }));
    await screen.findByRole("radiogroup", { name: NIVEL_LEGEND });
    await user.click(screen.getByRole("radio", { name: NIVEL_DETALLE_LABEL }));
    const etiquetas = screen.getAllByRole("checkbox").map((casilla) => {
      const id = casilla.getAttribute("aria-labelledby");
      return (id && document.getElementById(id)?.textContent) || "";
    });
    return etiquetas.join(" | ");
  }

  it("(d) R12, R13: el selector del «Detalle» lista «Flete + impuesto (IGV)» con el país; «(IVA)» con CR y sin proveedor", async () => {
    const textos = await enLosTresMontajes(columnasDelDetalle);
    expect(textos.prueba).toContain("Flete + impuesto (IGV)");
    expect(textos.prueba).toContain("Comisión + impuesto (IGV)");
    expect(textos.prueba).toContain("Flete por devolución a origen + impuesto (IGV)");
    expect(textos.prueba).not.toContain("(IVA)");
    expect(textos["sin proveedor"]).toContain("Flete + impuesto (IVA)");
    expect(textos.cr).toBe(textos["sin proveedor"]);
  });
});

/**
 * Los archivos que declaran las columnas de las descargas de cierres del admin (design §6.1) y su
 * fuente única. Ninguno escribe el nombre del impuesto.
 */
const CENSO_SIN_IVA_CIERRES = [
  "app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga-columnas.ts",
  "app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga-columnas.ts",
  "app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga-columnas.ts",
  "app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts",
  "app/(app)/cierres-admin/_components/encabezados-con-impuesto.ts",
];

/** Los rótulos de PANTALLA con impuesto de `cierre-labels.ts` (SLT-244): la descarga no los usa. */
const ROTULOS_DE_PANTALLA = /\b(FLETE_CON_IVA_LABEL|COMISION_CON_IVA_LABEL|FLETE_DEV_CON_IVA_LABEL|IVA_FACTURADO_LABEL)\b/;

/** ¿Escribe el código (sin comentarios) la palabra «IVA»? */
const escribeIvaCierres = (fuente: string): boolean => /\bIVA\b/.test(quitarComentarios(fuente));
/** ¿Usa el código (sin comentarios) un rótulo de pantalla con impuesto? */
const usaRotuloDePantalla = (fuente: string): boolean => ROTULOS_DE_PANTALLA.test(quitarComentarios(fuente));

describe("SLT-243 R11 — censo «sin IVA» de las declaraciones de columnas de las descargas de cierres", () => {
  it.each(CENSO_SIN_IVA_CIERRES)("%s no escribe «IVA» ni usa un rótulo de pantalla con impuesto", (archivo) => {
    const fuente = readFileSync(join(process.cwd(), archivo), "utf8");
    expect(fuente.length).toBeGreaterThan(500); // no-vacuidad
    expect(escribeIvaCierres(fuente)).toBe(false);
    expect(usaRotuloDePantalla(fuente)).toBe(false);
  });

  it("las cuatro declaraciones toman sus encabezados con impuesto de `encabezadoBase`", () => {
    for (const archivo of CENSO_SIN_IVA_CIERRES.slice(0, 4)) {
      const fuente = quitarComentarios(readFileSync(join(process.cwd(), archivo), "utf8"));
      expect(fuente, archivo).toMatch(/import \{ encabezadoBase \} from "\.\/encabezados-con-impuesto";/);
      expect(fuente, archivo).toMatch(/encabezado: encabezadoBase\("\w+"\)/);
    }
  });

  it("contraprueba: un «IVA» o un rótulo de pantalla en el código se detectan; en un comentario o en una clave, no", () => {
    expect(escribeIvaCierres('{ clave: "ivaFlete", encabezado: "IVA del flete" }')).toBe(true);
    expect(escribeIvaCierres("const e = `IVA del ${LABEL}`;")).toBe(true);
    expect(escribeIvaCierres('// «IVA facturado»\n/* De eso, IVA */\nconst c = { clave: "ivaFacturado" };')).toBe(false);
    expect(escribeIvaCierres("const v = fila.fleteConIva;")).toBe(false);
    expect(usaRotuloDePantalla('import { FLETE_CON_IVA_LABEL } from "./cierre-labels";')).toBe(true);
    expect(usaRotuloDePantalla("const e = IVA_FACTURADO_LABEL;")).toBe(true);
    expect(usaRotuloDePantalla("// antes era FLETE_DEV_CON_IVA_LABEL\nconst e = 1;")).toBe(false);
  });
});

describe("SLT-243 R16 — la lista de excepciones de `pais-sin-literales` no tiene nada a nombre de SLT-243", () => {
  it("ninguna excepcion esta a nombre de SLT-243", async () => {
    const { EXCEPCIONES_PAIS_SIN_LITERALES } = await import("@/tests/unit/guards/_pais-sin-literales-excepciones");
    expect(EXCEPCIONES_PAIS_SIN_LITERALES.filter((e) => e.ficha === "SLT-243")).toEqual([]);
  });

  it("el tope queda en 12 o menos y la lista no lo supera", async () => {
    const { EXCEPCIONES_PAIS_SIN_LITERALES, TOPE_EXCEPCIONES } = await import(
      "@/tests/unit/guards/_pais-sin-literales-excepciones"
    );
    // Rebanadas posteriores de SLT-235 bajan el tope: se fija como maximo, no exacto.
    expect(TOPE_EXCEPCIONES).toBeLessThanOrEqual(12);
    expect(EXCEPCIONES_PAIS_SIN_LITERALES.length).toBeLessThanOrEqual(TOPE_EXCEPCIONES);
  });
});
