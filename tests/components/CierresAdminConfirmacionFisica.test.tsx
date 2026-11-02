// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import { CierresAdminModule } from "@/app/(app)/cierres-admin/_components/CierresAdminModule";
import {
  verCierreDetalle,
  aprobarCierre,
  listarPendientesCierresAdminPaginado,
} from "@/lib/actions/cierres-admin";
import { paginaInicial } from "@/tests/fixtures/pagina-inicial";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreOrdenSinGestion,
  CierreResultado,
  CierreTotales,
  TotalesIngresoEmpresa,
} from "@/lib/interfaces/services/ICierreDiaService";

// Feature 238 (T4.1-T4.7 — R16/R27-R37) — la VENTANA DE CONFIRMACIÓN FÍSICA: antes de aprobar,
// bodega confirma guía a guía que tiene delante cada paquete que vuelve (devoluciones, rechazos
// y reprogramadas).
//
// Lo que protege este archivo, y que ningún test de backend puede proteger:
//   - que un cierre CON paquetes que vuelven no se apruebe sin pasar por la ventana (R7);
//   - que un cierre SIN nada que devolver se apruebe con el payload de siempre (R16) — medido:
//     es 3 de cada 12 cierres, un camino de igual rango y no un `else`;
//   - que los CUATRO desenlaces de una guía leída digan cuatro cosas distintas (R29-R32) y que
//     ninguno de los cuatro marque una fila ni llame a la Server Action;
//   - que el bloqueo se diga con TEXTO y nombre la salida (R27) — se lee el texto, no el
//     `disabled`, porque un botón apagado y mudo se lee como una app rota;
//   - que los incidentes aparezcan NOMBRADOS como excluidos (R34);
//   - que con la ventana cerrada la tarjeta de escaneo no esté en el árbol (R36);
//   - que con incidentes y retornables la confirmación vaya ANTES que los montos (R37).
//
// Todos los textos esperados están escritos A MANO, con sus tildes, y NO importados del módulo
// que los produce: una aserción contra su propia fuente está siempre verde. El 2026-08-07 este
// repo encontró siete etiquetas mal escritas que doce mil tests daban por buenas.
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
}));

const { successMock, errorMock, refreshMock, startMock, decodeCallback } = vi.hoisted(
  () => ({
    successMock: vi.fn(),
    errorMock: vi.fn(),
    refreshMock: vi.fn(),
    startMock: vi.fn(),
    decodeCallback: { current: null as ((texto: string) => void) | null },
  }),
);

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: successMock,
    error: errorMock,
    warning: vi.fn(),
    info: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));

// Sin hardware de cámara en CI: el doble captura el callback de decodificación que `start`
// recibe, exactamente como lo hace `RecogerPaqueteCard.test.tsx`. Es el MISMO `QrScanner`.
vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start = startMock;
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn();
  },
}));

const verDetalleMock = vi.mocked(verCierreDetalle);
const aprobarMock = vi.mocked(aprobarCierre);

const VENTANA = "Confirmar los paquetes que vuelven";
const SUB_MODAL_MONTOS = "Indemnizar los incidentes del cierre";
const BOTON_ESCANEAR = "Escanear con cámara";

const ZERO_TOTALES: CierreTotales = {
  efectivo: "0.00",
  simpe: "0.00",
  transferencia: "0.00",
  general: "0.00",
};

function makeResumen(
  over: Partial<CierreAdminResumen> & { cierreId: string },
): CierreAdminResumen {
  return {
    mensajeroId: `m-${over.cierreId}`,
    mensajeroNombre: "Ana Mensajera",
    estado: "solicitado",
    destinoTipo: "bodega_central",
    destinoZonaId: "z1",
    destinoZonaNombre: "GAM",
    totales: ZERO_TOTALES,
    totalPagoMensajero: "0.00",
    totalIngresoBodegaRechazos: "0.00",
    pendientePagoMensajero: null,
    solicitadoAt: "2026-08-19T10:00:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
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
    pagos: [],
    motivo: null,
    fechaReprogramacion: null,
    evidenciaUrl: null, evidenciaUrls: [],
    pagoMensajero: null,
    ingresoBodegaRechazo: null,
    tarifaFaltante: false,
    esRechazoSla: false,
    desdeAyudaTienda: false, // feature 237 (D6/R41): la registro el mensajero, no la tienda
    causaIncidente: null,
    indemnizacion: null,
    ...over,
  };
}

function emptyGrupos(): CierreGrupos {
  return { entregado: [], reprogramado: [], novedad: [], devolucion_a_origen_por_rechazo: [], incidente: [] };
}

function zeroIngreso(): TotalesIngresoEmpresa {
  return {
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
}

// --- El cierre de referencia: tres paquetes que vuelven, uno entregado y un incidente ---
// Es la forma que la medición del 2026-08-19 encontró en producción: los incidentes conviven
// con retornables en el mismo cierre (2 de 12), así que la línea de exclusión de R34 se ve.
const DEV_1 = makeGestion({
  gestionId: "g-dev-1",
  resultado: "novedad",
  numGuia: 7001,
  numRemision: "REM-DEV-1",
  destinatario: "Delia Vargas",
  tiendaNombre: "Tienda Norte",
});
const REC_1 = makeGestion({
  gestionId: "g-rec-1",
  resultado: "devolucion_a_origen_por_rechazo",
  numGuia: 7002,
  numRemision: "REM-REC-1",
  destinatario: "Rita Solano",
  tiendaNombre: "Tienda Sur",
});
const REP_1 = makeGestion({
  gestionId: "g-rep-1",
  resultado: "reprogramado",
  numGuia: 7003,
  numRemision: "REM-REP-1",
  destinatario: "Rodrigo Pérez",
  tiendaNombre: "Tienda Este",
});
const ENT_1 = makeGestion({
  gestionId: "g-ent-1",
  resultado: "entregado",
  numGuia: 7004,
  numRemision: "REM-ENT-1",
  destinatario: "Elena Castro",
});
const INC_1 = makeGestion({
  gestionId: "g-inc-1",
  resultado: "incidente",
  numGuia: 7005,
  numRemision: "REM-INC-1",
  destinatario: "Iván Mora",
  causaIncidente: "robado",
});

/**
 * Programa el detalle que devolverá `verCierreDetalle` con los grupos indicados y, desde la 451,
 * las órdenes que el corte barrió en ese cierre (por defecto ninguna, como antes).
 */
function conGrupos(
  grupos: Partial<CierreGrupos>,
  ordenesSinGestion: CierreOrdenSinGestion[] = [],
) {
  verDetalleMock.mockResolvedValue({
    ordenesSinGestion,
    sinGestionRegistrado: true,
    rechazosDeTienda: [],
    status: "ok",
    desgloseIngresoBodegaRechazos: { sla: "0.00", manual: "0.00", total: "0.00" },
    cierre: makeResumen({ cierreId: "c1", estado: "solicitado" }),
    grupos: { ...emptyGrupos(), ...grupos },
    totalesIngreso: zeroIngreso(),
    ivaFacturado: "0.00", // SL-39: los conceptos de la fixtura no llevan IVA
    ganancia: "0.00",
    pagoTienda: "0.00",
    cobradoSobreRecaudado: "0.00",
    netoEmpresa: "0.00",
    ganaLaTienda: "0.00",
    fleteRechazoYaCobradoATienda: false,
    // Ficha 396: el desglose por tienda viaja SIEMPRE en el DTO, tambien con una sola
    // tienda. Estas pruebas no lo miran, asi que aqui va vacio; las suyas estan en
    // `tests/unit/utils/partes-por-tienda.test.ts` y en las de la pantalla del desglose.
    partesPorTienda: [],
  });
}

/** Abre el detalle del cierre `c1` y pulsa "Aprobar". */
async function pulsarAprobar(user: ReturnType<typeof userEvent.setup>) {
  const cola = paginaInicial([makeResumen({ cierreId: "c1" })]);
  vi.mocked(listarPendientesCierresAdminPaginado).mockResolvedValue({
    status: "ok",
    page: 1,
    ...cola,
  });
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <CierresAdminModule
        pendientes={cola}
        historico={paginaInicial<CierreAdminResumen>([])}
        sinZona={false}
      />
    </SWRConfig>,
  );
  await user.click(screen.getByRole("button", { name: "Ver / decidir" }));
  const dialog = await screen.findByRole("dialog", { name: "Detalle del cierre" });
  await user.click(within(dialog).getByRole("button", { name: "Aprobar" }));
}

/** Abre la ventana de confirmación física y la devuelve. */
async function abrirVentana(
  user: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> {
  await pulsarAprobar(user);
  return screen.findByRole("dialog", { name: VENTANA });
}

/** URL del paquete tal como la codifica el QR de la etiqueta. */
function qrDeGuia(numGuia: number): string {
  return `https://ejemplo.app/paquete/${numGuia}`;
}

/** Abre la cámara dentro de la ventana y simula que decodifica el texto dado. */
async function escanear(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  texto: string,
) {
  await user.click(within(dialog).getByRole("button", { name: BOTON_ESCANEAR }));
  await vi.waitFor(() => expect(decodeCallback.current).not.toBeNull());
  await act(async () => {
    decodeCallback.current?.(texto);
  });
}

/** Teclea el número de guía en la ventana y confirma con Enter (submit del formulario). */
async function teclear(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  texto: string,
) {
  await user.type(within(dialog).getByLabelText("Número de guía"), `${texto}{Enter}`);
}

/** El texto de la fila de una gestión (guía, remisión, destinatario, resultado y estado). */
function fila(dialog: HTMLElement, gestionId: string): string {
  const li = dialog.querySelector(`[data-gestion="${gestionId}"]`);
  expect(li, `no se pintó la fila de ${gestionId}`).not.toBeNull();
  return li?.textContent ?? "";
}

/** El progreso, que vive en la barra de estado de la ventana. */
function progreso(dialog: HTMLElement): string {
  return within(dialog).getByRole("status").textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  decodeCallback.current = null;
  startMock.mockImplementation(
    async (_config: unknown, _opciones: unknown, onDecode: (texto: string) => void) => {
      decodeCallback.current = onDecode;
    },
  );
  aprobarMock.mockResolvedValue({
    status: "ok",
    cierreId: "c1",
    estado: "aprobado",
    pendientePagoMensajero: "0.00",
  });
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------------------------
// T4.1 — las TRES ramas de `pedirAprobacion()`
// ---------------------------------------------------------------------------------------------

describe("T4.1/R16 — un cierre SIN nada que devolver se aprueba de un click, como hoy", () => {
  it("no abre ninguna ventana y manda `{ cierreId }` sin campos nuevos", async () => {
    const user = userEvent.setup();
    conGrupos({ entregado: [ENT_1] });
    await pulsarAprobar(user);

    expect(screen.queryByRole("dialog", { name: VENTANA })).toBeNull();
    expect(screen.queryByRole("dialog", { name: SUB_MODAL_MONTOS })).toBeNull();
    await vi.waitFor(() => expect(aprobarMock).toHaveBeenCalledWith({ cierreId: "c1" }));
    // Ni una clave nueva: el contrato de la 38 queda intacto (R16).
    expect(Object.keys(aprobarMock.mock.calls[0][0] as object)).toEqual(["cierreId"]);
    await vi.waitFor(() => expect(successMock).toHaveBeenCalled());
  });

  it("PAREJA de la ausencia: el MISMO cierre con una devolución SÍ abre la ventana", async () => {
    // Sin esta pareja, el caso de arriba estaría verde también si la ventana no existiera o si
    // el módulo hubiera dejado de renderizar. Es la lección de la marca de ruta de la 235.
    const user = userEvent.setup();
    conGrupos({ entregado: [ENT_1], novedad: [DEV_1] });
    await pulsarAprobar(user);

    expect(await screen.findByRole("dialog", { name: VENTANA })).toBeInTheDocument();
    expect(aprobarMock).not.toHaveBeenCalled();
  });
});

describe("T4.1/R7 — con paquetes que vuelven, aprobar pasa SIEMPRE por la ventana", () => {
  it("abre la ventana y NO aprueba todavía", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], devolucion_a_origen_por_rechazo: [REC_1], reprogramado: [REP_1] });
    const dialog = await abrirVentana(user);

    expect(dialog).toBeInTheDocument();
    expect(aprobarMock).not.toHaveBeenCalled();
  });

  it("sin retornables pero CON incidentes va directo a los montos (rama de la 158 intacta)", async () => {
    const user = userEvent.setup();
    conGrupos({ incidente: [INC_1] });
    await pulsarAprobar(user);

    expect(await screen.findByRole("dialog", { name: SUB_MODAL_MONTOS })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: VENTANA })).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// T4.2 — la ventana: qué muestra (R33) y la cámara desmontada (R36)
// ---------------------------------------------------------------------------------------------

describe("T4.2 — la ventana dice, con palabras, qué acto físico se está pidiendo", () => {
  it("la descripción del diálogo es su texto exacto y es lo que se anuncia al abrirla", async () => {
    // Este texto no es decoración: es la INSTRUCCIÓN de un acto físico («tené delante cada
    // paquete»), y quien la lee está de pie en el mostrador con la caja en la mano. Era el único
    // string de la feature sin aserción, o sea justo el que un refactor reescribe sin que nadie
    // se entere.
    //
    // El literal va ESCRITO A MANO, con sus tildes, y NO importado de `CONFIRMACION_DETALLE`:
    // compararlo contra la constante que lo produce estaría siempre verde y no vigilaría nada.
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] });
    const dialog = await abrirVentana(user);

    const DESCRIPCION =
      "Antes de aprobar, tené delante cada paquete que vuelve a bodega y confirmá su guía: escaneá el código o escribí el número.";
    const nodo = within(dialog).getByText(DESCRIPCION);
    // Y no es un párrafo suelto en cualquier sitio: es la DESCRIPCIÓN ACCESIBLE del diálogo, que
    // es lo que un lector de pantalla anuncia al abrirlo. Si mañana el texto se mudara al cuerpo
    // seguiría viéndose, pero dejaría de anunciarse — una regresión muda para quien no ve.
    expect(nodo.id).not.toBe("");
    expect(dialog.getAttribute("aria-describedby")).toBe(nodo.id);
  });

  it("la tarjeta de captura se presenta con SUS textos, y el acierto nombra la guía", async () => {
    // El barrido de textos sin aserción no encontró sólo la descripción del diálogo: los cuatro
    // textos con los que esta feature configura `EscanerGuiaCard` —el nombre accesible de la
    // tarjeta, su título, su descripción y la etiqueta del botón— tampoco tenían literal, y son
    // tan visibles como los demás. Todos escritos a mano, ninguno importado.
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] });
    const dialog = await abrirVentana(user);

    // El nombre accesible dice que escanear y teclear son EL MISMO acto en la misma tarjeta; si
    // se leyera como dos superficies, quien no ve buscaría la segunda.
    const tarjeta = within(dialog).getByRole("region", {
      name: "Confirmar por número de guía o escaneo",
    });
    expect(
      within(tarjeta).getByRole("heading", { name: "Confirmar paquete recibido" }),
    ).toBeInTheDocument();
    expect(tarjeta).toHaveTextContent("Escaneá el código de la guía o escribí su número");
    expect(within(tarjeta).getByRole("button", { name: "Confirmar" })).toBeInTheDocument();

    // Y el acierto se dice CON EL NÚMERO: «confirmada» a secas no distingue cuál de las catorce
    // acaba de entrar, que es justo lo que se necesita saber escaneando una tanda seguida.
    expect(tarjeta.textContent).not.toContain("confirmada.");
    await teclear(user, dialog, "7001");
    expect(tarjeta.textContent).toContain("Guía 7001 confirmada.");
  });
});

describe("T4.2/R33 — cada fila muestra guía, remisión, destinatario, resultado y estado", () => {
  it("las tres filas del conjunto esperado, agrupadas por resultado", async () => {
    const user = userEvent.setup();
    conGrupos({
      novedad: [DEV_1],
      devolucion_a_origen_por_rechazo: [REC_1],
      reprogramado: [REP_1],
      entregado: [ENT_1],
    });
    const dialog = await abrirVentana(user);

    for (const g of [DEV_1, REC_1, REP_1]) {
      const texto = fila(dialog, g.gestionId);
      expect(texto).toContain(`Nº Guía ${g.numGuia}`);
      expect(texto).toContain(g.numRemision);
      expect(texto).toContain(g.destinatario);
      expect(texto).toContain("Pendiente");
    }
    // El resultado de cada una, en singular y traducido (nunca el value del enum).
    expect(fila(dialog, DEV_1.gestionId)).toContain("Novedad");
    expect(fila(dialog, REC_1.gestionId)).toContain("Devolución a origen por rechazo");
    expect(fila(dialog, REP_1.gestionId)).toContain("Reprogramado");
    // Y los encabezados de grupo. ⏳ 2026-09-24 (FICHA 455, R4/R5): con el nombre exacto del
    // resultado, sin plural.
    for (const seccion of ["Reprogramado (1)", "Novedad (1)", "Devolución a origen por rechazo (1)"]) {
      expect(within(dialog).getByText(seccion)).toBeInTheDocument();
    }
    // La `entregada` NO entra en el conjunto esperado: su paquete se quedó con el cliente.
    expect(dialog.querySelector(`[data-gestion="${ENT_1.gestionId}"]`)).toBeNull();
    expect(dialog.textContent).not.toContain("REM-ENT-1");
  });

  it("una fila confirmada cambia su estado a «Confirmada» (la otra sigue pendiente)", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], devolucion_a_origen_por_rechazo: [REC_1] });
    const dialog = await abrirVentana(user);

    await teclear(user, dialog, "7001");

    expect(fila(dialog, DEV_1.gestionId)).toContain("Confirmada");
    expect(fila(dialog, REC_1.gestionId)).toContain("Pendiente");
  });
});

describe("T4.2/R36 — la cámara no se queda montada detrás de nada", () => {
  it("con la ventana CERRADA la tarjeta de escaneo no está en el árbol; abierta, sí", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] });
    const cola = paginaInicial([makeResumen({ cierreId: "c1" })]);
    vi.mocked(listarPendientesCierresAdminPaginado).mockResolvedValue({
      status: "ok",
      page: 1,
      ...cola,
    });
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <CierresAdminModule
          pendientes={cola}
          historico={paginaInicial<CierreAdminResumen>([])}
          sinZona={false}
        />
      </SWRConfig>,
    );

    // 1) Con el detalle abierto pero la ventana cerrada: nada de cámara.
    await user.click(screen.getByRole("button", { name: "Ver / decidir" }));
    const detalle = await screen.findByRole("dialog", { name: "Detalle del cierre" });
    expect(screen.queryByRole("button", { name: BOTON_ESCANEAR })).toBeNull();

    // 2) Al abrir la ventana, aparece: la ausencia de arriba es del cierre de la ventana y no
    //    de un componente que nunca se montó.
    await user.click(within(detalle).getByRole("button", { name: "Aprobar" }));
    const dialog = await screen.findByRole("dialog", { name: VENTANA });
    expect(within(dialog).getByRole("button", { name: BOTON_ESCANEAR })).toBeInTheDocument();

    // 3) Y al cerrarla, se va otra vez.
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: BOTON_ESCANEAR })).toBeNull(),
    );
  });

  it("el montaje es CONDICIONAL y no depende de lo que el diálogo haga con su contenido", async () => {
    // MEDIDO, y por eso este caso existe: montar la tarjeta incondicionalmente (`{true ? …}`)
    // deja el caso de arriba EN VERDE. La propiedad se cumple hoy por DOS mecanismos —el
    // ternario y el desmontaje del portal de Base UI— y desde el árbol renderizado sólo se ve
    // el de fuera. Si mañana el Modal gana una animación de salida o un `keepMounted`, el de
    // fuera desaparece sin que ningún test se entere y la cámara se queda encendida detrás de
    // algo invisible.
    //
    // Se vigila el mecanismo de dentro leyendo la fuente, que es lo que este repo ya hace con
    // el `satisfies` de `RETORNA_A_BODEGA`: una red que no se ve en runtime se vigila donde se
    // escribe. El censo va en un archivo de test y nunca por `node -e`.
    const { readFileSync } = await import("node:fs");
    const modulo = readFileSync(
      "app/(app)/cierres-admin/_components/CierresAdminModule.tsx",
      "utf8",
    );
    expect(modulo).toMatch(/\{confirmando \? \(\s*<ConfirmacionFisicaCuerpo/);
  });
});

// ---------------------------------------------------------------------------------------------
// T4.3 — los CUATRO desenlaces de una guía leída (R29-R32), un caso por mensaje
// ---------------------------------------------------------------------------------------------

describe("T4.3/R29 — un código que no se puede interpretar como guía", () => {
  it("avisa, no marca ninguna fila y no manda nada al servidor", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], devolucion_a_origen_por_rechazo: [REC_1] });
    const dialog = await abrirVentana(user);

    await escanear(user, dialog, "esto-no-es-una-url");

    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "No se pudo leer un número de guía en ese código. Escaneá de nuevo o escribí el número.",
    );
    expect(progreso(dialog)).toBe("Paquetes confirmados: 0 de 2.");
    expect(fila(dialog, DEV_1.gestionId)).toContain("Pendiente");
    expect(aprobarMock).not.toHaveBeenCalled();
  });
});

describe("T4.3/R30 — una guía que no pertenece a este cierre", () => {
  it("lo dice con su mensaje propio, no marca nada y no manda nada", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], devolucion_a_origen_por_rechazo: [REC_1] });
    const dialog = await abrirVentana(user);

    await escanear(user, dialog, qrDeGuia(9999));

    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Esa guía no pertenece a este cierre.",
    );
    expect(progreso(dialog)).toBe("Paquetes confirmados: 0 de 2.");
    expect(fila(dialog, DEV_1.gestionId)).toContain("Pendiente");
    expect(fila(dialog, REC_1.gestionId)).toContain("Pendiente");
    expect(aprobarMock).not.toHaveBeenCalled();
  });
});

describe("T4.3/R31 — una guía del cierre cuyo paquete NO vuelve a bodega", () => {
  it("el incidente recibe un mensaje PROPIO, distinto del de la guía ajena", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], incidente: [INC_1] });
    const dialog = await abrirVentana(user);

    await escanear(user, dialog, qrDeGuia(INC_1.numGuia ?? 0));

    const aviso = within(dialog).getAllByRole("alert")[0];
    expect(aviso).toHaveTextContent(
      "Esa guía es de este cierre, pero ese paquete no vuelve a bodega. Resultado: Incidente.",
    );
    // La diferencia con R30 no es cosmética: «no pertenece» manda a buscar el paquete, y el
    // incidente no hay dónde buscarlo (se perdió, se robó o se dañó: se indemniza).
    expect(aviso.textContent).not.toContain("Esa guía no pertenece a este cierre.");
    expect(progreso(dialog)).toBe("Paquetes confirmados: 0 de 1.");
    expect(fila(dialog, DEV_1.gestionId)).toContain("Pendiente");
    expect(aprobarMock).not.toHaveBeenCalled();
  });

  it("una `entregada` del cierre recibe el mismo mensaje, con su resultado", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], entregado: [ENT_1] });
    const dialog = await abrirVentana(user);

    await teclear(user, dialog, String(ENT_1.numGuia));

    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Esa guía es de este cierre, pero ese paquete no vuelve a bodega. Resultado: Entregado.",
    );
    expect(progreso(dialog)).toBe("Paquetes confirmados: 0 de 1.");
  });
});

describe("T4.3/R32 — una guía ya confirmada en esta sesión", () => {
  it("lo dice y NO la cuenta dos veces", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], devolucion_a_origen_por_rechazo: [REC_1] });
    const dialog = await abrirVentana(user);

    await teclear(user, dialog, "7001");
    expect(progreso(dialog)).toBe("Paquetes confirmados: 1 de 2.");

    await teclear(user, dialog, "7001");

    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Esa guía ya está confirmada. No se cuenta dos veces.",
    );
    // El contador NO avanza: dos lecturas de la misma guía no cubren dos paquetes.
    expect(progreso(dialog)).toBe("Paquetes confirmados: 1 de 2.");
    expect(
      within(dialog).getByRole("button", { name: "Confirmar y aprobar" }),
    ).toBeDisabled();
    expect(aprobarMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// T4.4 — los DOS caminos de captura (R28)
// ---------------------------------------------------------------------------------------------

describe("T4.4/R28 — se confirma por cámara o por número tecleado", () => {
  it("por CÁMARA: el QR de la etiqueta confirma esa gestión", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] });
    const dialog = await abrirVentana(user);

    await escanear(user, dialog, qrDeGuia(7001));

    expect(fila(dialog, DEV_1.gestionId)).toContain("Confirmada");
    expect(progreso(dialog)).toBe("Paquetes confirmados: 1 de 1.");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar y aprobar" }));
    await vi.waitFor(() =>
      expect(aprobarMock).toHaveBeenCalledWith({
        cierreId: "c1",
        confirmacionFisica: [{ origen: "gestion", gestionId: "g-dev-1", numGuia: 7001 }],
      }),
    );
  });

  it("por NÚMERO TECLEADO: el mismo número confirma la misma gestión", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] });
    const dialog = await abrirVentana(user);

    await teclear(user, dialog, "7001");

    expect(fila(dialog, DEV_1.gestionId)).toContain("Confirmada");
    expect(progreso(dialog)).toBe("Paquetes confirmados: 1 de 1.");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar y aprobar" }));
    await vi.waitFor(() =>
      expect(aprobarMock).toHaveBeenCalledWith({
        cierreId: "c1",
        confirmacionFisica: [{ origen: "gestion", gestionId: "g-dev-1", numGuia: 7001 }],
      }),
    );
  });

  it("un número tecleado que no son dígitos se queda en el campo para corregirlo", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] });
    const dialog = await abrirVentana(user);

    await teclear(user, dialog, "70O1"); // una «O» donde va un cero

    expect(within(dialog).getByLabelText("Número de guía")).toHaveValue("70O1");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "No se pudo leer un número de guía en ese código.",
    );
    expect(progreso(dialog)).toBe("Paquetes confirmados: 0 de 1.");
  });
});

// ---------------------------------------------------------------------------------------------
// T4.5 — el bloqueo CON PALABRAS (R27) y la exclusión NOMBRADA (R34)
// ---------------------------------------------------------------------------------------------

describe("T4.5/R27 — el bloqueo se dice con texto, no sólo con un botón apagado", () => {
  it("dice cuántas faltan y qué hacer si un paquete no llegó", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], devolucion_a_origen_por_rechazo: [REC_1], reprogramado: [REP_1] });
    const dialog = await abrirVentana(user);

    // Se lee el TEXTO, no el `disabled`: un botón apagado y mudo se lee como una app rota.
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Faltan 3 paquetes por confirmar. Si alguno no llegó, rechazá el cierre indicando cuáles faltan.",
    );
    expect(progreso(dialog)).toBe("Paquetes confirmados: 0 de 3.");

    await teclear(user, dialog, "7001");
    await teclear(user, dialog, "7002");

    // Con una sola pendiente, el texto pasa al singular y sigue nombrando la salida.
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Falta 1 paquete por confirmar. Si no llegó, rechazá el cierre indicando cuál falta.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Confirmar y aprobar" }),
    ).toBeDisabled();

    await teclear(user, dialog, "7003");

    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Están todos. Ya se puede aprobar el cierre.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Confirmar y aprobar" }),
    ).toBeEnabled();
  });

  it("con una guía sin confirmar, forzar el botón no llama a la Server Action", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], devolucion_a_origen_por_rechazo: [REC_1] });
    const dialog = await abrirVentana(user);

    await teclear(user, dialog, "7001");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar y aprobar" }));

    expect(aprobarMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: VENTANA })).toBeInTheDocument();
  });

  it("una gestión sin número de guía se nombra como no confirmable, en su fila", async () => {
    // R13, la mitad del cliente: medido el 2026-08-19 esa población no existe, pero si
    // apareciera, el cierre no se podría aprobar y bodega tiene que saber por qué en vez de
    // escanear las otras trece y chocar con un botón apagado.
    const user = userEvent.setup();
    const sinGuia = makeGestion({
      gestionId: "g-dev-2",
      resultado: "novedad",
      numGuia: null,
      numRemision: "REM-DEV-2",
      destinatario: "Sara Vega",
    });
    conGrupos({ novedad: [DEV_1, sinGuia] });
    const dialog = await abrirVentana(user);

    expect(fila(dialog, "g-dev-2")).toContain(
      "Sin número de guía: no se puede confirmar. Avisá a un administrador.",
    );
    // Y la que SÍ tiene guía no lleva ese aviso: la línea es de la fila, no del bloque.
    expect(fila(dialog, DEV_1.gestionId)).not.toContain("Sin número de guía");
  });
});

describe("T4.5/R34 — los incidentes aparecen nombrados como excluidos, con su razón", () => {
  it("los nombra uno a uno y dice por qué no se escanean", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], incidente: [INC_1] });
    const dialog = await abrirVentana(user);

    const seccion = within(dialog).getByRole("region", {
      name: "Incidentes excluidos de la confirmación",
    });
    expect(seccion).toHaveTextContent(
      "1 incidente de este cierre no se escanea: ese paquete no vuelve a bodega, se indemniza.",
    );
    // «Nombradas» de verdad: con su guía, su remisión y su destinatario, para que bodega pueda
    // contar los paquetes del estante y no busque el que «falta».
    expect(seccion).toHaveTextContent("Nº Guía 7005");
    expect(seccion).toHaveTextContent("REM-INC-1");
    expect(seccion).toHaveTextContent("Iván Mora");
    // Y NO entra en el conjunto esperado: no hay fila suya que confirmar.
    expect(dialog.querySelector(`[data-gestion="${INC_1.gestionId}"]`)).toBeNull();
    expect(progreso(dialog)).toBe("Paquetes confirmados: 0 de 1.");
  });

  it("PAREJA de la ausencia: sin incidentes, la línea de exclusión no se pinta", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] });
    const dialog = await abrirVentana(user);

    expect(
      within(dialog).queryByRole("region", {
        name: "Incidentes excluidos de la confirmación",
      }),
    ).toBeNull();
    expect(dialog.textContent).not.toContain("no se escanea");
    // Pero la ventana SÍ está pintada: la ausencia es de la línea, no del componente.
    expect(fila(dialog, DEV_1.gestionId)).toContain("Nº Guía 7001");
  });
});

// ---------------------------------------------------------------------------------------------
// T4.6 — cerrar sin completar (R35) y el orden de los dos pasos (R37)
// ---------------------------------------------------------------------------------------------

describe("T4.6/R35 — cerrar la ventana sin completarla no envía nada", () => {
  it("cancelar no llama a `aprobarCierre` y conserva lo ya escaneado al reabrir", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], devolucion_a_origen_por_rechazo: [REC_1] });
    const dialog = await abrirVentana(user);
    await teclear(user, dialog, "7001");

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: VENTANA })).toBeNull());

    expect(aprobarMock).not.toHaveBeenCalled();

    // Reabrir NO obliga a re-escanear lo ya leído: no existe una confirmación a medias
    // persistida, así que lo confirmado vive mientras el detalle siga abierto.
    const detalle = screen.getByRole("dialog", { name: "Detalle del cierre" });
    await user.click(within(detalle).getByRole("button", { name: "Aprobar" }));
    const dos = await screen.findByRole("dialog", { name: VENTANA });
    expect(progreso(dos)).toBe("Paquetes confirmados: 1 de 2.");
  });

  it("cerrar el DETALLE descarta lo confirmado: el siguiente cierre arranca de cero", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], devolucion_a_origen_por_rechazo: [REC_1] });
    const dialog = await abrirVentana(user);
    await teclear(user, dialog, "7001");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await user.click(
      within(screen.getByRole("dialog", { name: "Detalle del cierre" })).getAllByRole(
        "button",
        { name: "Cerrar" },
      )[0],
    );

    await user.click(screen.getByRole("button", { name: "Ver / decidir" }));
    const detalle = await screen.findByRole("dialog", { name: "Detalle del cierre" });
    await user.click(within(detalle).getByRole("button", { name: "Aprobar" }));
    const dos = await screen.findByRole("dialog", { name: VENTANA });
    expect(progreso(dos)).toBe("Paquetes confirmados: 0 de 2.");
    expect(aprobarMock).not.toHaveBeenCalled();
  });
});

describe("T4.6/R37 — con incidentes y retornables, la confirmación va ANTES que los montos", () => {
  it("primero la ventana, después el sub-modal de montos, y el payload lleva las dos listas", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], incidente: [INC_1] });
    const dialog = await abrirVentana(user);

    // Paso 1: la confirmación física. Los montos todavía no se piden — si falta un paquete, no
    // tiene sentido teclear dinero que se va a descartar.
    expect(screen.queryByRole("dialog", { name: SUB_MODAL_MONTOS })).toBeNull();
    // Y el botón no promete aprobar: queda un paso.
    expect(within(dialog).getByRole("button", { name: "Continuar" })).toBeDisabled();

    await teclear(user, dialog, "7001");
    // Con todo confirmado, el texto NO promete aprobar: nombra el paso que queda. Prometerlo
    // junto a un botón que dice «Continuar» deja a bodega buscando un botón que no existe.
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Están todos. Queda indicar los montos de los incidentes.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Continuar" }));

    // Paso 2: los montos. Y todavía no se aprobó nada.
    const montos = await screen.findByRole("dialog", { name: SUB_MODAL_MONTOS });
    expect(aprobarMock).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: VENTANA })).toBeNull());

    const campo = document.getElementById("indemnizacion-g-inc-1") as HTMLInputElement;
    await user.type(campo, "12500.00");
    await user.click(
      within(montos).getByRole("button", { name: "Aprobar e indemnizar" }),
    );

    await vi.waitFor(() =>
      expect(aprobarMock).toHaveBeenCalledWith({
        cierreId: "c1",
        indemnizaciones: [{ gestionId: "g-inc-1", monto: "12500.00" }],
        confirmacionFisica: [{ origen: "gestion", gestionId: "g-dev-1", numGuia: 7001 }],
      }),
    );
  });
});

// ---------------------------------------------------------------------------------------------
// T4.7 — los errores del servidor, por fila
// ---------------------------------------------------------------------------------------------

describe("T4.7 — un `validation_error` con clave de gestión se pinta en SU fila", () => {
  it("la ventana sigue abierta y el error aparece en la fila de esa gestión", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], devolucion_a_origen_por_rechazo: [REC_1] });
    // El servidor discute UNA de las dos: es su mensaje real (`MSG_CONFIRMACION_GUIA_DISTINTA`).
    aprobarMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { "g-rec-1": ["La guía leída no es la de este paquete."] },
    });
    const dialog = await abrirVentana(user);
    await teclear(user, dialog, "7001");
    await teclear(user, dialog, "7002");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar y aprobar" }));

    await vi.waitFor(() => expect(aprobarMock).toHaveBeenCalledTimes(1));
    // Sigue abierta: cerrarla obligaría a re-escanear todo lo ya leído.
    const abierta = await screen.findByRole("dialog", { name: VENTANA });
    await vi.waitFor(() =>
      expect(document.getElementById("confirmacion-g-rec-1-error")).not.toBeNull(),
    );
    expect(fila(abierta, "g-rec-1")).toContain("La guía leída no es la de este paquete.");
    // Y NO se pinta en la fila de la otra gestión.
    expect(fila(abierta, "g-dev-1")).not.toContain("La guía leída no es la de este paquete.");
    // Nada se aprobó.
    expect(successMock).not.toHaveBeenCalled();
  });

  it("un error de un INCIDENTE no abre la ventana: se pinta donde se teclean los montos", async () => {
    // Las dos coberturas devuelven sus errores con la MISMA forma (clave = id de gestión), así
    // que el módulo tiene que repartirlos. El criterio es «¿está en el conjunto esperado?», y
    // los dos conjuntos son disjuntos por construcción: un incidente no vuelve a bodega.
    // Sin el reparto, un error de monto reabriría la ventana de escaneo, que no arregla nada.
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1], incidente: [INC_1] });
    aprobarMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { "g-inc-1": ["Falta el monto de indemnización de este incidente."] },
    });
    const dialog = await abrirVentana(user);
    await teclear(user, dialog, "7001");
    await user.click(within(dialog).getByRole("button", { name: "Continuar" }));

    const montos = await screen.findByRole("dialog", { name: SUB_MODAL_MONTOS });
    await user.type(
      document.getElementById("indemnizacion-g-inc-1") as HTMLInputElement,
      "10.00",
    );
    await user.click(within(montos).getByRole("button", { name: "Aprobar e indemnizar" }));

    await vi.waitFor(() =>
      expect(document.getElementById("indemnizacion-g-inc-1")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    // La ventana de confirmación NO vuelve: el paquete ya está confirmado, lo que falta es un
    // monto.
    expect(screen.queryByRole("dialog", { name: VENTANA })).toBeNull();
    expect(await screen.findByRole("dialog", { name: SUB_MODAL_MONTOS })).toBeInTheDocument();
    expect(successMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// La GUÍA REPETIDA — el bloqueo duro encontrado conduciendo la app (T5.6, 2026-08-19)
// ---------------------------------------------------------------------------------------------
//
// Un cierre puede traer DOS gestiones vivas de la MISMA orden y, por tanto, con la MISMA guía.
// Medido contra producción ese mismo día (sólo lectura): 1 de 48 pares (cierre, orden) vivos está
// así, y es justo del tipo que dispara el bloqueo (la gestión que vuelve, repetida).
//
// Con la resolución por `find` —la primera fila que case— pasaba esto: la primera lectura
// confirmaba la primera fila; la segunda lectura de la MISMA guía volvía a caer en esa fila y
// respondía «ya está confirmada»; y la segunda fila se quedaba `Pendiente` para siempre, con el
// contador clavado en `N-1 de N` y el botón apagado. El cierre no se podía aprobar por ninguna vía
// y nada en la pantalla decía por qué. Visto en pantalla: «Paquetes confirmados: 11 de 12».
//
// La decisión: **una lectura confirma TODAS las filas pendientes de esa guía**, porque hay UN solo
// paquete físico. Pedir dos escaneos de la misma caja es pedir que se atestigüe dos veces un único
// acto. El servidor lo admite sin cambios: dedupe por `gestionId` (no por guía) y compara la guía
// contra la de CADA gestión.

/** Dos gestiones vivas de la misma orden: una guía, un bulto, dos filas. */
const DUP_A = makeGestion({
  gestionId: "g-dup-a",
  ordenId: "o-dup",
  resultado: "novedad",
  numGuia: 7010,
  numRemision: "REM-DUP",
  destinatario: "Dora Quesada",
});
const DUP_B = makeGestion({
  gestionId: "g-dup-b",
  ordenId: "o-dup",
  resultado: "novedad",
  numGuia: 7010,
  numRemision: "REM-DUP",
  destinatario: "Dora Quesada",
});

describe("guía repetida — una lectura confirma TODAS las filas de ese paquete", () => {
  it("las dos filas quedan confirmadas, el botón se habilita y el cierre se aprueba", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DUP_A, DUP_B], devolucion_a_origen_por_rechazo: [REC_1] });
    const dialog = await abrirVentana(user);

    // Dos bultos: el repetido (dos filas) y el rechazo. Las TRES filas están en la lista.
    expect(progreso(dialog)).toBe("Paquetes confirmados: 0 de 2.");
    expect(fila(dialog, "g-dup-a")).toContain("Pendiente");
    expect(fila(dialog, "g-dup-b")).toContain("Pendiente");

    await teclear(user, dialog, "7010");

    // El corazón del arreglo: UNA lectura, las DOS filas de esa guía confirmadas.
    expect(fila(dialog, "g-dup-a")).toContain("Confirmada");
    expect(fila(dialog, "g-dup-b")).toContain("Confirmada");
    expect(fila(dialog, "g-rec-1")).toContain("Pendiente");
    expect(progreso(dialog)).toBe("Paquetes confirmados: 1 de 2.");
    expect(
      within(dialog).getByRole("button", { name: "Confirmar y aprobar" }),
    ).toBeDisabled();

    await teclear(user, dialog, "7002");

    // Antes del arreglo esto se quedaba en «1 de 3» para siempre: la segunda fila del bulto
    // repetido no había forma de confirmarla, y el botón nunca se habilitaba.
    expect(progreso(dialog)).toBe("Paquetes confirmados: 2 de 2.");
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Están todos. Ya se puede aprobar el cierre.",
    );
    const boton = within(dialog).getByRole("button", { name: "Confirmar y aprobar" });
    expect(boton).toBeEnabled();

    await user.click(boton);

    // Y el payload lleva UNA ENTRADA POR GESTIÓN con la misma guía repetida: es lo que el
    // servicio exige (cobertura exacta del conjunto esperado, dedupe por `gestionId`).
    await vi.waitFor(() =>
      expect(aprobarMock).toHaveBeenCalledWith({
        cierreId: "c1",
        confirmacionFisica: [
          { origen: "gestion", gestionId: "g-dup-a", numGuia: 7010 },
          { origen: "gestion", gestionId: "g-dup-b", numGuia: 7010 },
          { origen: "gestion", gestionId: "g-rec-1", numGuia: 7002 },
        ],
      }),
    );
  });

  it("R32 SIGUE VIVO: con las dos filas ya confirmadas, otra lectura avisa y no cuenta de más", async () => {
    // R32 no se ablanda, se corrige: el aviso es para cuando esa guía YA NO CUBRE NADA. Antes
    // saltaba con una fila todavía pendiente, y ahí era donde mentía.
    const user = userEvent.setup();
    conGrupos({ novedad: [DUP_A, DUP_B], devolucion_a_origen_por_rechazo: [REC_1] });
    const dialog = await abrirVentana(user);

    await teclear(user, dialog, "7010");
    expect(progreso(dialog)).toBe("Paquetes confirmados: 1 de 2.");

    await teclear(user, dialog, "7010");

    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Esa guía ya está confirmada. No se cuenta dos veces.",
    );
    expect(progreso(dialog)).toBe("Paquetes confirmados: 1 de 2.");
    expect(fila(dialog, "g-rec-1")).toContain("Pendiente");
    expect(
      within(dialog).getByRole("button", { name: "Confirmar y aprobar" }),
    ).toBeDisabled();
    expect(aprobarMock).not.toHaveBeenCalled();
  });

  it("una `entregada` que comparte guía con una `devuelta` no roba la lectura (R31 sigue siendo suyo)", async () => {
    // El mismo `find` mirado desde el otro lado: si la primera fila que casa no vuelve a bodega,
    // la lectura contestaba «ese paquete no vuelve» y la `devuelta` quedaba imposible. Basta con
    // que UNA de las filas de esa guía vuelva para que haya un bulto delante que confirmar.
    const user = userEvent.setup();
    const ENT_DUP = makeGestion({
      gestionId: "g-ent-dup",
      ordenId: "o-mix",
      resultado: "entregado",
      numGuia: 7020,
      numRemision: "REM-MIX",
      destinatario: "Eva Mixta",
    });
    const DEV_DUP = makeGestion({
      gestionId: "g-dev-dup",
      ordenId: "o-mix",
      resultado: "novedad",
      numGuia: 7020,
      numRemision: "REM-MIX",
      destinatario: "Eva Mixta",
    });
    conGrupos({ entregado: [ENT_DUP], novedad: [DEV_DUP] });
    const dialog = await abrirVentana(user);

    await teclear(user, dialog, "7020");

    expect(fila(dialog, "g-dev-dup")).toContain("Confirmada");
    expect(dialog.textContent).not.toContain("ese paquete no vuelve a bodega");
    expect(progreso(dialog)).toBe("Paquetes confirmados: 1 de 1.");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar y aprobar" }));
    await vi.waitFor(() =>
      expect(aprobarMock).toHaveBeenCalledWith({
        cierreId: "c1",
        confirmacionFisica: [{ origen: "gestion", gestionId: "g-dev-dup", numGuia: 7020 }],
      }),
    );
  });
});

describe("el contador dice PAQUETES y cuenta paquetes, no filas", () => {
  it("dos filas de la misma guía son UN bulto, y la fila lo explica", async () => {
    // El rótulo decía «Paquetes confirmados: X de N» con N = filas. En el cierre medido eran
    // doce filas para once bultos: el rótulo ya mentía antes del arreglo. Y contando filas, una
    // sola lectura movería el contador de dos en dos, que a quien escanea se le lee como un
    // error de la app.
    const user = userEvent.setup();
    conGrupos({ novedad: [DUP_A, DUP_B], devolucion_a_origen_por_rechazo: [REC_1] });
    const dialog = await abrirVentana(user);

    expect(progreso(dialog)).toBe("Paquetes confirmados: 0 de 2.");
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Faltan 2 paquetes por confirmar. Si alguno no llegó, rechazá el cierre indicando cuáles faltan.",
    );
    // Pero las TRES filas siguen ahí: R33 pide una fila por gestión, y agrupar el conteo no es
    // esconder ninguna.
    expect(fila(dialog, "g-dup-a")).toContain("Nº Guía 7010");
    expect(fila(dialog, "g-dup-b")).toContain("Nº Guía 7010");
    expect(fila(dialog, "g-rec-1")).toContain("Nº Guía 7002");

    // Y la guía repetida se NOMBRA en sus dos filas: sin esto, ver la misma guía dos veces y que
    // las dos cambien de golpe se lee como un error.
    const explicacion =
      "Este paquete aparece en 2 filas de esta lista: una sola lectura las confirma todas.";
    expect(fila(dialog, "g-dup-a")).toContain(explicacion);
    expect(fila(dialog, "g-dup-b")).toContain(explicacion);
    // La fila que no comparte bulto NO lleva la línea.
    expect(fila(dialog, "g-rec-1")).not.toContain("Este paquete aparece en");
  });

  it("dos filas SIN guía no se funden en un bulto: cada una cuenta, y siguen bloqueando", async () => {
    // Sin guía no hay forma de saber si dos filas son el mismo bulto. Colapsarlas rebajaría el
    // total —el número de paquetes que bodega tiene que poner delante— y esas filas además no se
    // pueden confirmar nunca (R13), así que el bloqueo tiene que seguir contándolas.
    const user = userEvent.setup();
    const SIN_GUIA_1 = makeGestion({
      gestionId: "g-sin-1",
      resultado: "novedad",
      numGuia: null,
      numRemision: "REM-SIN-1",
      destinatario: "Sara Vega",
    });
    const SIN_GUIA_2 = makeGestion({
      gestionId: "g-sin-2",
      resultado: "novedad",
      numGuia: null,
      numRemision: "REM-SIN-2",
      destinatario: "Saúl Ruiz",
    });
    conGrupos({ novedad: [DEV_1, SIN_GUIA_1, SIN_GUIA_2] });
    const dialog = await abrirVentana(user);

    expect(progreso(dialog)).toBe("Paquetes confirmados: 0 de 3.");

    await teclear(user, dialog, "7001");

    expect(progreso(dialog)).toBe("Paquetes confirmados: 1 de 3.");
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Faltan 2 paquetes por confirmar.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Confirmar y aprobar" }),
    ).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------------------------
// FICHA 451 / SLT-72 (T5.5 — R29-R36 y la mitad cliente de R19) — las órdenes BARRIDAS
// ---------------------------------------------------------------------------------------------
//
// El corte del día barre las órdenes que un cierre vencido dejó en reparto sin gestionar
// (`cierre_sin_gestion`). Su paquete también está en la mano del mensajero y vuelve, así que desde
// la 451 el servidor exige confirmarlas igual que las gestiones que vuelven. Esta parte protege la
// mitad de pantalla: que se vean en la MISMA lista (cuarta sección, al final), que cuenten en el
// MISMO contador, que una lectura las confirme, que el envío lleve su `origen` y que un cierre con
// SÓLO barridas no se apruebe de un click.
//
// El rótulo es el nombre VIGENTE del estado al que el corte las pasa («Novedad interna»): el spec
// (2026-09-21) decía «Sin gestionar», nombre que la 455 retiró el 2026-09-24. Escrito a mano.

const ROTULO_BARRIDA = "Novedad interna";

function makeBarrida(
  over: Partial<CierreOrdenSinGestion> & { ordenId: string },
): CierreOrdenSinGestion {
  return {
    numGuia: 8001,
    numRemision: "REM-BAR",
    destinatario: "Bruno Barrido",
    producto: "Caja",
    tiendaNombre: "Tienda Oeste",
    zonaNombre: "GAM",
    estatusOrigen: "en_reparto",
    ...over,
  };
}

const BAR_1 = makeBarrida({
  ordenId: "o-bar-1",
  numGuia: 8001,
  numRemision: "REM-BAR-1",
  destinatario: "Bea Barrantes",
  tiendaNombre: "Tienda Oeste",
});
const BAR_2 = makeBarrida({
  ordenId: "o-bar-2",
  numGuia: 8002,
  numRemision: "REM-BAR-2",
  destinatario: "Blas Bonilla",
  tiendaNombre: "Tienda Centro",
});

/** La fila de una orden barrida (su clave es el `ordenId`, no un id de gestión). */
function filaBarrida(dialog: HTMLElement, ordenId: string): HTMLElement {
  const li = dialog.querySelector<HTMLElement>(`[data-barrida="${ordenId}"]`);
  expect(li, `no se pintó la fila de la barrida ${ordenId}`).not.toBeNull();
  return li as HTMLElement;
}

describe("451/R29-R30 — las barridas, en la MISMA lista, como cuarta sección y con su rótulo", () => {
  it("cada barrida muestra guía, remisión, destinatario, estado y se nombra con su rótulo", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] }, [BAR_1, BAR_2]);
    const dialog = await abrirVentana(user);

    for (const b of [BAR_1, BAR_2]) {
      const texto = filaBarrida(dialog, b.ordenId).textContent ?? "";
      expect(texto).toContain(`Nº Guía ${b.numGuia}`);
      expect(texto).toContain(b.numRemision);
      expect(texto).toContain(b.destinatario);
      expect(texto).toContain(b.tiendaNombre);
      expect(texto).toContain("Pendiente");
      // R29: NOMBRADA como lo que es, en el hueco donde la gestión lleva su resultado.
      expect(texto).toContain(ROTULO_BARRIDA);
    }
    // La sección, rotulada con su cifra como las otras tres.
    const seccion = within(dialog).getByRole("region", { name: ROTULO_BARRIDA });
    expect(within(seccion).getByText("Novedad interna (2)")).toBeInTheDocument();
    expect(within(seccion).getAllByRole("listitem")).toHaveLength(2);
  });

  it("va AL FINAL, dentro del MISMO contenedor desplazable y con la MISMA fila que las gestiones", async () => {
    const user = userEvent.setup();
    conGrupos(
      { novedad: [DEV_1], devolucion_a_origen_por_rechazo: [REC_1], reprogramado: [REP_1] },
      [BAR_1],
    );
    const dialog = await abrirVentana(user);

    const deGestion = dialog.querySelector<HTMLElement>(`[data-gestion="${REC_1.gestionId}"]`);
    const barrida = filaBarrida(dialog, BAR_1.ordenId);
    expect(deGestion).not.toBeNull();
    // Al final: la fila de la barrida va DESPUÉS de todas las de gestión.
    for (const g of [DEV_1, REC_1, REP_1]) {
      const li = dialog.querySelector(`[data-gestion="${g.gestionId}"]`) as HTMLElement;
      expect(li.compareDocumentPosition(barrida) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // En la MISMA lista: comparten el contenedor con desplazamiento acotado (no una caja aparte,
    // que la leería como opcional — design §6.2).
    const contenedor = (el: HTMLElement) => el.closest(".overflow-y-auto");
    expect(contenedor(barrida)).not.toBeNull();
    expect(contenedor(barrida)).toBe(contenedor(deGestion as HTMLElement));
    // Mismo peso visual (R30): la misma caja de fila.
    expect(barrida.className).toBe((deGestion as HTMLElement).className);
  });

  it("PAREJA de la ausencia: sin barridas no aparece la sección", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] });
    const dialog = await abrirVentana(user);

    expect(within(dialog).queryByRole("region", { name: ROTULO_BARRIDA })).toBeNull();
    expect(dialog.querySelector("[data-barrida]")).toBeNull();
    // La ventana sí está: la ausencia es de la sección.
    expect(fila(dialog, DEV_1.gestionId)).toContain("Nº Guía 7001");
  });
});

describe("451/R31 — las barridas cuentan en el MISMO contador y en el MISMO «faltan»", () => {
  it("un solo progreso y un solo bloqueo, que suman gestiones y barridas", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] }, [BAR_1, BAR_2]);
    const dialog = await abrirVentana(user);

    expect(within(dialog).getAllByRole("status")).toHaveLength(1);
    expect(within(dialog).getAllByRole("note")).toHaveLength(1);
    expect(progreso(dialog)).toBe("Paquetes confirmados: 0 de 3.");
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Faltan 3 paquetes por confirmar. Si alguno no llegó, rechazá el cierre indicando cuáles faltan.",
    );

    // Terminar las gestiones NO dice «están todos» con barridas pendientes detrás.
    await teclear(user, dialog, "7001");
    expect(progreso(dialog)).toBe("Paquetes confirmados: 1 de 3.");
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Faltan 2 paquetes por confirmar.",
    );
    expect(dialog.textContent).not.toContain("Están todos.");
  });
});

describe("451/R32 — leer la guía de una barrida pendiente la confirma", () => {
  it("por número tecleado", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] }, [BAR_1, BAR_2]);
    const dialog = await abrirVentana(user);

    await teclear(user, dialog, "8001");

    expect(filaBarrida(dialog, BAR_1.ordenId).textContent).toContain("Confirmada");
    expect(filaBarrida(dialog, BAR_2.ordenId).textContent).toContain("Pendiente");
    expect(fila(dialog, DEV_1.gestionId)).toContain("Pendiente");
    expect(progreso(dialog)).toBe("Paquetes confirmados: 1 de 3.");
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("por CÁMARA, con el QR de la etiqueta", async () => {
    const user = userEvent.setup();
    conGrupos({}, [BAR_1]);
    const dialog = await abrirVentana(user);

    await escanear(user, dialog, qrDeGuia(8001));

    expect(filaBarrida(dialog, BAR_1.ordenId).textContent).toContain("Confirmada");
    expect(progreso(dialog)).toBe("Paquetes confirmados: 1 de 1.");
  });

  it("una segunda lectura de la misma barrida avisa y no cuenta de más (R32 de la 238 vale igual)", async () => {
    const user = userEvent.setup();
    conGrupos({}, [BAR_1, BAR_2]);
    const dialog = await abrirVentana(user);

    await teclear(user, dialog, "8001");
    await teclear(user, dialog, "8001");

    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Esa guía ya está confirmada. No se cuenta dos veces.",
    );
    expect(progreso(dialog)).toBe("Paquetes confirmados: 1 de 2.");
  });
});

describe("451/R33 — una guía que no es de ninguna gestión NI de ninguna barrida del cierre", () => {
  it("avisa que no es de este cierre y no marca nada", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] }, [BAR_1]);
    const dialog = await abrirVentana(user);

    await teclear(user, dialog, "9999");

    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Esa guía no pertenece a este cierre.",
    );
    expect(progreso(dialog)).toBe("Paquetes confirmados: 0 de 2.");
    expect(fila(dialog, DEV_1.gestionId)).toContain("Pendiente");
    expect(filaBarrida(dialog, BAR_1.ordenId).textContent).toContain("Pendiente");
    expect(aprobarMock).not.toHaveBeenCalled();
  });
});

describe("451/T5.4 — el envío lleva cada entrada con su `origen`, y un cierre SÓLO con barridas abre la ventana", () => {
  it("un cierre sin gestiones que vuelvan pero CON barridas NO se aprueba de un click", async () => {
    // Antes de la 451 la ventana se abría con `retornables.length > 0`: este cierre se aprobaba
    // directo contra un servidor que ahora lo rechaza — un bloqueo mudo.
    const user = userEvent.setup();
    conGrupos({ entregado: [ENT_1] }, [BAR_1]);
    await pulsarAprobar(user);

    expect(await screen.findByRole("dialog", { name: VENTANA })).toBeInTheDocument();
    expect(aprobarMock).not.toHaveBeenCalled();
  });

  it("al completar, manda la barrida como `{ origen: \"barrida\", ordenId, numGuia }`", async () => {
    const user = userEvent.setup();
    conGrupos({ entregado: [ENT_1] }, [BAR_1]);
    const dialog = await abrirVentana(user);

    await teclear(user, dialog, "8001");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar y aprobar" }));

    await vi.waitFor(() =>
      expect(aprobarMock).toHaveBeenCalledWith({
        cierreId: "c1",
        confirmacionFisica: [{ origen: "barrida", ordenId: "o-bar-1", numGuia: 8001 }],
      }),
    );
  });

  it("mixto: gestiones primero y barridas después, cada una con SU origen y SU clave", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] }, [BAR_1, BAR_2]);
    const dialog = await abrirVentana(user);

    await teclear(user, dialog, "8002");
    await teclear(user, dialog, "7001");
    await teclear(user, dialog, "8001");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar y aprobar" }));

    await vi.waitFor(() =>
      expect(aprobarMock).toHaveBeenCalledWith({
        cierreId: "c1",
        confirmacionFisica: [
          { origen: "gestion", gestionId: "g-dev-1", numGuia: 7001 },
          { origen: "barrida", ordenId: "o-bar-1", numGuia: 8001 },
          { origen: "barrida", ordenId: "o-bar-2", numGuia: 8002 },
        ],
      }),
    );
  });

  it("con incidentes y SÓLO barridas: primero la ventana, después los montos, y viajan las dos listas", async () => {
    const user = userEvent.setup();
    conGrupos({ incidente: [INC_1] }, [BAR_1]);
    const dialog = await abrirVentana(user);
    expect(screen.queryByRole("dialog", { name: SUB_MODAL_MONTOS })).toBeNull();

    await teclear(user, dialog, "8001");
    await user.click(within(dialog).getByRole("button", { name: "Continuar" }));
    const montos = await screen.findByRole("dialog", { name: SUB_MODAL_MONTOS });
    await user.type(
      document.getElementById("indemnizacion-g-inc-1") as HTMLInputElement,
      "500.00",
    );
    await user.click(within(montos).getByRole("button", { name: "Aprobar e indemnizar" }));

    await vi.waitFor(() =>
      expect(aprobarMock).toHaveBeenCalledWith({
        cierreId: "c1",
        indemnizaciones: [{ gestionId: "g-inc-1", monto: "500.00" }],
        confirmacionFisica: [{ origen: "barrida", ordenId: "o-bar-1", numGuia: 8001 }],
      }),
    );
  });
});

describe("451/R19 (mitad cliente) — con una barrida pendiente no hay forma de aprobar", () => {
  it("el botón sigue bloqueado, forzarlo no llama al servidor, y no existe ninguna puerta de escape", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] }, [BAR_1]);
    const dialog = await abrirVentana(user);

    // Todas las gestiones confirmadas; la barrida, no.
    await teclear(user, dialog, "7001");
    const boton = within(dialog).getByRole("button", { name: "Confirmar y aprobar" });
    expect(boton).toBeDisabled();
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "Falta 1 paquete por confirmar. Si no llegó, rechazá el cierre indicando cuál falta.",
    );
    await user.click(boton);
    expect(aprobarMock).not.toHaveBeenCalled();

    // Sin «marcar como faltante», sin «aprobar de todas formas», sin «omitir» (D2, 2026-10-31).
    const nombres = within(dialog)
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
    for (const nombre of nombres) {
      expect(nombre).not.toMatch(/faltante|todas formas|omitir|parcial/i);
    }

    // PAREJA: confirmada la barrida, el MISMO botón se habilita. La ausencia de arriba es del
    // candado, no de un botón que nunca se habilita.
    await teclear(user, dialog, "8001");
    expect(within(dialog).getByRole("button", { name: "Confirmar y aprobar" })).toBeEnabled();
  });
});

describe("451/R34 — si alguna fila no tiene guía, se dice ANTES de la lista, con cuántas son", () => {
  it("una barrida sin guía: aviso en la barra de estado, antes de la lista, y su fila lo repite", async () => {
    const user = userEvent.setup();
    const BAR_SIN_GUIA = makeBarrida({
      ordenId: "o-bar-sin",
      numGuia: null,
      numRemision: "REM-BAR-SIN",
      destinatario: "Berta Sin Guía",
    });
    conGrupos({ novedad: [DEV_1] }, [BAR_SIN_GUIA]);
    const dialog = await abrirVentana(user);

    const aviso = within(dialog).getByText(
      "1 paquete de esta lista no tiene número de guía: no se puede confirmar, así que este cierre no se va a poder aprobar.",
    );
    // ANTES de la lista: en el DOM precede a la primera fila.
    const primeraFila = dialog.querySelector("[data-gestion], [data-barrida]") as HTMLElement;
    expect(aviso.compareDocumentPosition(primeraFila) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // En la barra de estado, junto al progreso.
    expect(aviso.parentElement).toBe(within(dialog).getByRole("status").parentElement);
    // La advertencia por fila de la 238 se conserva, ahora también en la barrida.
    expect(filaBarrida(dialog, "o-bar-sin").textContent).toContain(
      "Sin número de guía: no se puede confirmar. Avisá a un administrador.",
    );
    // Y el bloqueo sigue diciéndose con UN solo `note` (R27 de la 238).
    expect(within(dialog).getAllByRole("note")).toHaveLength(1);
  });

  it("cuenta los DOS orígenes, en plural", async () => {
    const user = userEvent.setup();
    const GES_SIN_GUIA = makeGestion({
      gestionId: "g-dev-sin",
      resultado: "novedad",
      numGuia: null,
      numRemision: "REM-DEV-SIN",
    });
    const BAR_SIN_GUIA = makeBarrida({ ordenId: "o-bar-sin", numGuia: null });
    conGrupos({ novedad: [DEV_1, GES_SIN_GUIA] }, [BAR_1, BAR_SIN_GUIA]);
    const dialog = await abrirVentana(user);

    expect(
      within(dialog).getByText(
        "2 paquetes de esta lista no tienen número de guía: no se pueden confirmar, así que este cierre no se va a poder aprobar.",
      ),
    ).toBeInTheDocument();
    expect(progreso(dialog)).toBe("Paquetes confirmados: 0 de 4.");
  });

  it("PAREJA de la ausencia: con todas las guías, el aviso no se pinta", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] }, [BAR_1]);
    const dialog = await abrirVentana(user);

    expect(dialog.textContent).not.toContain("no tiene número de guía");
    expect(dialog.textContent).not.toContain("no tienen número de guía");
    expect(filaBarrida(dialog, BAR_1.ordenId).textContent).toContain("Nº Guía 8001");
  });
});

describe("451/R35 — un error del servidor sobre una barrida se pinta en ESA fila", () => {
  it("la ventana sigue abierta y el error aparece en la fila de la barrida, no en otra", async () => {
    const user = userEvent.setup();
    conGrupos({ novedad: [DEV_1] }, [BAR_1, BAR_2]);
    aprobarMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { "o-bar-2": ["La guía leída no es la de este paquete."] },
    });
    const dialog = await abrirVentana(user);
    await teclear(user, dialog, "7001");
    await teclear(user, dialog, "8001");
    await teclear(user, dialog, "8002");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar y aprobar" }));

    await vi.waitFor(() => expect(aprobarMock).toHaveBeenCalledTimes(1));
    const abierta = await screen.findByRole("dialog", { name: VENTANA });
    await vi.waitFor(() =>
      expect(document.getElementById("confirmacion-o-bar-2-error")).not.toBeNull(),
    );
    expect(filaBarrida(abierta, "o-bar-2").textContent).toContain(
      "La guía leída no es la de este paquete.",
    );
    expect(filaBarrida(abierta, "o-bar-1").textContent).not.toContain("La guía leída");
    expect(fila(abierta, DEV_1.gestionId)).not.toContain("La guía leída");
    expect(successMock).not.toHaveBeenCalled();
  });

  it("con incidentes, un error de barrida reabre la ventana de confirmación (no el sub-modal de montos)", async () => {
    const user = userEvent.setup();
    conGrupos({ incidente: [INC_1] }, [BAR_1]);
    aprobarMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { "o-bar-1": ["Falta confirmar la recepción de este paquete."] },
    });
    const dialog = await abrirVentana(user);
    await teclear(user, dialog, "8001");
    await user.click(within(dialog).getByRole("button", { name: "Continuar" }));
    const montos = await screen.findByRole("dialog", { name: SUB_MODAL_MONTOS });
    await user.type(
      document.getElementById("indemnizacion-g-inc-1") as HTMLInputElement,
      "10.00",
    );
    await user.click(within(montos).getByRole("button", { name: "Aprobar e indemnizar" }));

    const ventana = await screen.findByRole("dialog", { name: VENTANA });
    await vi.waitFor(() =>
      expect(filaBarrida(ventana, "o-bar-1").textContent).toContain(
        "Falta confirmar la recepción de este paquete.",
      ),
    );
  });
});

describe("451/R36 — cerrar la ventana sin completarla no envía nada", () => {
  it("con barridas confirmadas a medias, cancelar no llama a `aprobarCierre`", async () => {
    const user = userEvent.setup();
    conGrupos({}, [BAR_1, BAR_2]);
    const dialog = await abrirVentana(user);
    await teclear(user, dialog, "8001");

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: VENTANA })).toBeNull());

    expect(aprobarMock).not.toHaveBeenCalled();
    // El detalle sigue abierto: el cierre no se tocó.
    expect(screen.getByRole("dialog", { name: "Detalle del cierre" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------------
// PREMISA — lo que hace CORRECTO todo el bloque de arriba, y que ningún test de comportamiento ve
// ---------------------------------------------------------------------------------------------
//
// «Una lectura confirma todas las filas de esa guía» sólo es una corrección —y no un agujero—
// porque `orden.numGuia` es `@unique`: una guía identifica UNA orden, una orden es UN paquete
// físico. Si esa unicidad se cayera, la misma lectura daría por confirmados paquetes DISTINTOS y
// bodega estaría firmando que tiene delante algo que no tiene; y en el contador, `guia:<numGuia>`
// fundiría bultos distintos y el total saldría corto.
//
// **Nada del comportamiento lo notaría**: la pantalla haría exactamente lo mismo, el typecheck
// pasaría y los treinta y tantos casos de este archivo seguirían verdes, porque todos parten de
// fixtures donde una guía repetida ES la misma orden. Por eso la premisa se vigila donde se
// escribe, leyendo el esquema — el mismo recurso que ya usa este archivo para vigilar el montaje
// condicional de la cámara, y que la 229 usa para fijar este mismo `@unique` por un motivo suyo.
// No se delega en aquélla: vive dentro de otra feature y se iría con ella.
describe("PREMISA — `orden.numGuia` es @unique, y de eso depende que el arreglo sea correcto", () => {
  it("`db/schema.prisma` declara `numGuia` como `@unique` en el modelo `Orden`", async () => {
    const { readFileSync } = await import("node:fs");
    const schema = readFileSync("db/schema.prisma", "utf8");

    // Se acota al modelo `Orden` a propósito: hay otro `numGuia` en el esquema (una COPIA, sin
    // `@unique`, y así debe seguir), y un barrido del archivo entero lo confundiría con éste.
    const modeloOrden = schema.match(/model Orden \{([\s\S]*?)\n\}/)?.[1] ?? "";
    // Que la extracción no sea vacua: si el modelo se renombrara, `modeloOrden` sería "" y las
    // dos aserciones de abajo pasarían a rojo por la razón correcta, no por un regex mudo.
    expect(modeloOrden).toContain('@@map("orden")');
    expect(modeloOrden).toMatch(/numGuia\s+Int\?\s+@unique\s+@map\("num_guia"\)/);
  });
});
