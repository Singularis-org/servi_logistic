// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecoleccionModule } from "@/app/(app)/recoleccion/_components/RecoleccionModule";
import { recolectarEnTiendaPorQr } from "@/lib/actions/recoleccion-tienda";
import { TOPE_RECOLECTADAS_HOY } from "@/lib/constants/recoleccion-tienda";
import type {
  RecolectadaHoyDTO,
  RecoleccionOrdenDTO,
} from "@/lib/types/recoleccion-tienda";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import {
  bloqueoConVencido,
  bloqueoDe,
  bloqueoMixtoElMasViejoEsSuyo,
  bloqueoPorAcumular,
  bloqueoTodosPorEnviar,
} from "@/tests/fixtures/bloqueo-cierre";

// Feature 157 (R13-R24) + 167 — apartado propio del mensajero para lo que recoge EN LA
// TIENDA. Este archivo viene de `RecoleccionTiendaPanel.test.tsx` (renombrado con el
// componente) y protege tanto lo que el apartado MUESTRA —agrupado por tienda, con su
// contacto, más lo ya recolectado hoy— como lo que NO ofrece: aquí no hay gestión, ni cobro,
// ni evidencia, ni resultado que elegir. Un apartado que empiece a parecerse al de gestión es
// un apartado equivocado.
//
// DOS casos de la 157 quedaron INVALIDADOS por la 167 y están sustituidos (design §9):
//   · "sin nada que recolectar el apartado no se muestra"  ->  contradecía R7. Ahora:
//     "R7/R8: con la lista VACÍA el escáner sigue montado y el vacío se explica".
//   · "R21: una guía que NO es suya se rechaza en cliente" ->  contradecía R12. Ahora:
//     "R12: una guía que NO está en la lista cargada SÍ llega al servidor".
// Ningún otro assert de la 157 se perdió.

vi.mock("@/lib/actions/recoleccion-tienda", () => ({
  recolectarEnTiendaPorQr: vi.fn(),
}));

// El módulo ya no recibe `onRecolectada` por props: es el componente de cliente que la página
// (Server Component) monta, así que revalida por su cuenta con `router.refresh()`.
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastInfo = vi.fn();
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    error: toastError,
    success: toastSuccess,
    info: toastInfo,
    warning: vi.fn(),
  }),
}));

// El escáner monta la cámara vía html5-qrcode, que jsdom no puede abrir. Se sustituye por un
// disparador manual del MISMO callback (`onDecoded`) para poder ejercer la vía cámara (R10):
// lo que se prueba es el camino del componente, no la librería (que tiene su propio test).
const TEXTO_QR = (numGuia: number) => `https://ejemplo.test/paquete/${numGuia}`;
let textoEscaneado = TEXTO_QR(1001);
vi.mock("@/components/shared/QrScanner", () => ({
  QrScanner: ({
    onDecoded,
    disabled,
  }: {
    onDecoded: (texto: string) => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={() => onDecoded(textoEscaneado)}>
      Simular escaneo
    </button>
  ),
}));

const recolectarMock = vi.mocked(recolectarEnTiendaPorQr);

function makeOrden(over: Partial<RecoleccionOrdenDTO> = {}): RecoleccionOrdenDTO {
  return {
    id: "o1",
    numGuia: 1001,
    numRemision: "REM-1",
    producto: "Caja",
    destinatario: "Ana",
    tiendaNombre: "Tienda Norte",
    tiendaTelefono: "88880000",
    // 2026-08-11: el DTO dejó de ser pobre — extiende `MiAsignacionDTO` para alimentar la
    // MISMA card que «Por recoger», entera. El fixture trae valores REALES en los campos que
    // antes iban recortados, que es lo que permite verificar que la card los pinta.
    estatusValue: "recolectando",
    telefonoDest: "70001111",
    direccion: "200m sur de la iglesia",
    peso: 1.2,
    montoCobrar: 25000,
    latitud: 9.93,
    longitud: -84.08,
    notas: null,
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Escazú",
    distritoNombre: "San Rafael",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    secuenciaRuta: null,
    marcarLuego: false,
    intentosEntrega: 0,
    ...over,
  };
}

// 2026-08-11: «Recolectadas hoy» pinta la MISMA card, así que su DTO es el de la orden más el
// instante de la recolección. `ordenId` pasó a ser el `id` de la orden.
function makeRecolectada(over: Partial<RecolectadaHoyDTO> = {}): RecolectadaHoyDTO {
  return {
    ...makeOrden({ id: "h1", numGuia: 5001, numRemision: "REM-H1" }),
    recolectadaAt: new Date("2026-07-31T15:30:00.000Z"), // 09:30 hora CR
    ...over,
  };
}

/** Monta el módulo con lo mínimo: las dos listas vacías salvo lo que el caso declare. */
function renderModule(props: Partial<Parameters<typeof RecoleccionModule>[0]> = {}) {
  return render(
    <RecoleccionModule
      porRecolectar={props.porRecolectar ?? []}
      recolectadasHoy={props.recolectadasHoy ?? []}
      recolectadasHoyRecortada={props.recolectadasHoyRecortada ?? false}
      bloqueo={props.bloqueo ?? SIN_BLOQUEO}
    />,
  );
}

const escaner = () =>
  screen.queryByRole("region", { name: "Recolectar por número de guía o escaneo" });

/** El disparador del desplegable: el acceso al escaneo, esté la tarjeta abierta o no. */
const disparador = () =>
  screen.queryByRole("button", { name: "Escanear o escribir guía" });

/**
 * Despliega la tarjeta de escaneo. El escáner arranca PLEGADO en toda la app (decisión del
 * humano del 2026-07-31): dejarlo desplegado significaba la cámara encendida detrás de la
 * pantalla, en un teléfono y en la calle. Todo caso que ejerza el escaneo abre primero, que
 * es lo que hace el mensajero.
 */
async function abrirEscaner(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Escanear o escribir guía" }));
}

/**
 * R31 — el aviso de recorte NOMBRA el tope, y el tope tiene UNA sola fuente
 * (`lib/constants/recoleccion-tienda.ts`, la misma que el service usa para recortar). El patrón
 * se DERIVA de esa constante: si el humano cambia el tope y la UI se queda con el número
 * escrito a mano, el caso falla aquí en vez de dejar un aviso que miente en la calle.
 */
const avisoRecorte = new RegExp(
  `se muestran las ${TOPE_RECOLECTADAS_HOY} más recientes de hoy`,
  "i",
);

beforeEach(() => {
  vi.clearAllMocks();
  textoEscaneado = TEXTO_QR(1001);
  recolectarMock.mockResolvedValue({
    status: "ok",
    ordenId: "o1",
    estado: "en_ruta_bodega_central",
  });
});

afterEach(() => cleanup());

describe("RecoleccionModule — qué muestra (R17/R18/R19/R20/R22)", () => {
  // 2026-08-11 (decisión del humano): «las cards van fuera, ese envoltorio no va». La caja
  // por tienda (R17) se retira, y con ella su cabecera y los botones de contacto de la tienda
  // (R19/R20): las cards quedan sueltas, exactamente como en «Por recoger». Los tres casos que
  // vigilaban la agrupación y el contacto se sustituyen por este, que fija lo contrario.
  it("las cards van SUELTAS: sin caja por tienda ni contacto de tienda", () => {
    renderModule({
      porRecolectar: [
        makeOrden({ id: "a", numGuia: 1, numRemision: "REM-A", tiendaNombre: "Tienda Norte" }),
        makeOrden({ id: "b", numGuia: 2, numRemision: "REM-B", tiendaNombre: "Tienda Norte" }),
        makeOrden({ id: "c", numGuia: 3, numRemision: "REM-C", tiendaNombre: "Tienda Sur" }),
      ],
    });

    // Ninguna cabecera de grupo: la tienda ya no organiza la pantalla.
    expect(screen.queryByRole("heading", { name: "Tienda Norte" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Tienda Sur" })).toBeNull();
    // Ni botones de contacto de la tienda, que vivían en esa cabecera.
    expect(screen.queryByRole("button", { name: /^Llamar a/ })).toBeNull();
    // Las órdenes siguen ahí, en un solo listado.
    expect(screen.getAllByText("REM-A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("REM-C").length).toBeGreaterThan(0);
  });

  it("R22: NO ofrece ningún control de gestión (ni cobro, ni evidencia, ni resultados)", () => {
    renderModule({ porRecolectar: [makeOrden()] });

    // Los 4 resultados de la gestión, el método de pago y la evidencia son de OTRO flujo.
    for (const nombre of [/entregada/i, /reprogramar/i, /devolver/i, /rechazar/i]) {
      expect(screen.queryByRole("button", { name: nombre })).toBeNull();
    }
    expect(screen.queryByText(/método de pago/i)).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    // «Valor a cobrar» SÍ aparece desde el 2026-08-11: es el `<dt>` del detalle plegable de la
    // card compartida —un DATO de la orden, el mismo que ve «Por recoger»—, no un control de
    // gestión. Lo que este caso protege es que no haya con qué GESTIONAR, y sigue en pie.
  });

  // 2026-08-11 (decisión del humano): «la recolección debe usar la MISMA card que Por recoger».
  // Este caso era el opuesto —afirmaba que el monto NO se veía y que el DTO no lo transportaba
  // (R18/R38)— y se da vuelta: el recorte era la única razón por la que las dos pantallas
  // hermanas del portal mostraban distinto de la misma orden.
  it("muestra la orden con sus datos, monto incluido, igual que «Por recoger»", () => {
    renderModule({ porRecolectar: [makeOrden()] });

    // Feature 196: producto y destinatario ya NO comparten un `<p>` con «·». Los pinta la
    // card compartida en elementos separados, así que se afirman por separado.
    // `getAllByText`: el detalle plegable de la card (`keepMounted`) repite producto y
    // destinatario en el DOM aunque esté cerrado, igual que en «Por recoger».
    expect(screen.getAllByText("REM-1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Caja").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
    // El importe SÍ se pinta: el DTO lo transporta y la card lo lee.
    expect(screen.getAllByText(/₡/).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------
// Feature 196 + decisión del humano del 2026-08-11 — la recolección pinta la MISMA card que
// «Por recoger» (`PosOrderCardMosaico` / `PosOrderCardDetalle`), ENTERA: sin compuertas.
//
// Estos casos eran los que vigilaban las cuatro secciones APAGADAS (196). Se dan vuelta: lo
// que hay que impedir ahora es que el recorte vuelva por la puerta de atrás y las dos
// pantallas hermanas del portal vuelvan a mostrar distinto de la misma orden.
//
// Por qué se prueba en las DOS vistas y no solo en la que arranca: las dos cards son
// implementaciones PARALELAS —solo comparten `PosOrderCardProps`—, así que un cambio puede
// quedarse sin replicar en una de ellas y el apartado seguiría verde.
// ---------------------------------------------------------------------------------------
describe("RecoleccionModule — las dos vistas pintan la card completa", () => {
  /** Lo que las dos vistas comparten con «Por recoger». */
  function esperarSeccionesEncendidas() {
    // Cobro: etiqueta e importe, con el monto real del DTO.
    expect(screen.getAllByText(/cobrar/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/₡/).length).toBeGreaterThan(0);
    // Navegación: el control de ubicación de la card (`UbicacionTrigger`), que con coordenadas
    // abre el minimapa y sin ellas cae al enlace a Maps. Se busca por su nombre accesible para
    // no atarse a cuál de las dos formas toca en este fixture.
    expect(
      screen.getAllByRole("button", { name: /ver en el mapa/i }).length,
    ).toBeGreaterThan(0);
    // Intentos de entrega: dato de la orden, `0` incluido.
    expect(screen.getAllByText(/intentos/i).length).toBeGreaterThan(0);
  }

  /**
   * Lo que sí sale, en las dos vistas: los datos que identifican la orden. Producto NO entra
   * aquí porque la vista de FILA no lo pinta en la línea principal —igual que en «Por
   * recoger»—, y esa es justamente la paridad que estos casos vigilan.
   */
  function esperarDatosDeLaOrden() {
    expect(screen.getAllByText("REM-1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
  }

  it("vista MOSAICO (la de entrada): cobro, navegación, intentos y detalle completo", () => {
    renderModule({ porRecolectar: [makeOrden()] });

    esperarDatosDeLaOrden();
    esperarSeccionesEncendidas();
    // El desplegable del detalle es propio del mosaico (la vista de fila nunca lo llevó).
    expect(screen.getByText(/ver detalle completo/i)).toBeInTheDocument();
  });

  it("vista DETALLE: las mismas secciones siguen encendidas tras conmutar", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: [makeOrden()] });

    await user.click(screen.getByRole("button", { name: "Detalle" }));
    // El conmutador anima: sostiene la vista vieja durante el tramo de salida
    // (`useTransicionVista`), así que se espera a que la nueva esté montada.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Detalle" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    await waitFor(() => esperarDatosDeLaOrden());

    esperarSeccionesEncendidas();
  });

  it("el conmutador es UNO para todo el apartado, no uno por tienda", () => {
    renderModule({
      porRecolectar: [
        makeOrden({ id: "a", numGuia: 1, numRemision: "REM-A", tiendaNombre: "Tienda Norte" }),
        makeOrden({ id: "c", numGuia: 3, numRemision: "REM-C", tiendaNombre: "Tienda Sur" }),
      ],
    });

    // Dos tiendas, un solo control: la vista es una preferencia de quien mira, no una
    // propiedad de cada grupo.
    expect(screen.getAllByRole("group", { name: "Vista de las órdenes" })).toHaveLength(1);
  });

  // SLT-190 (R860, DS4): sustituye a «sin nada por recolectar no hay conmutador». El conmutador
  // gobierna también «Recogidos en tienda hoy», así que con «Por recolectar» vacía sigue en la
  // barra: antes desaparecía con la lista de arriba y dejaba la de abajo sin mando.
  it("R860: con «Por recolectar» vacía el único conmutador sigue en la barra", () => {
    renderModule({ porRecolectar: [], recolectadasHoy: [makeRecolectada()] });

    const conmutadores = screen.getAllByRole("group", { name: "Vista de las órdenes" });
    expect(conmutadores).toHaveLength(1);
    const barra = screen.getByRole("searchbox", { name: "Buscar guías" }).closest(".sticky");
    expect(barra?.contains(conmutadores[0])).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
// Feature 167 (R7/R8) — LA CAUSA RAÍZ. El panel de la 157 hacía `if (porRecolectar.length
// === 0) return null`, así que el bloque de escaneo desaparecía justo cuando el mensajero
// lo buscaba ("no veo la forma de recolectar"). Estos casos son la razón de existir de la
// feature entera y NO se borran.
//
// 2026-07-31 — R7 cambia de FORMA, no de fondo (decisión del humano). El escáner pasa de
// "SIEMPRE MONTADO" a "SIEMPRE ACCESIBLE": vive tras el disparador de `EscanerModal` —en
// modal desde el 2026-08-10—, cerrado de entrada como en el resto de la app, porque montado
// significaba la cámara
// encendida todo el rato que el mensajero tuviera la pantalla abierta. Lo que la 167 vino a
// impedir sigue impedido y se sigue verificando aquí:
//   · con la lista vacía el ACCESO al escaneo no desaparece (el disparador está ahí);
//   · abrirlo da un escáner que funciona de verdad, no un adorno;
//   · el vacío se sigue explicando (R8).
// ---------------------------------------------------------------------------------------
describe("RecoleccionModule — el escáner está SIEMPRE accesible (R7/R8)", () => {
  it("R7/R8: con la lista VACÍA el acceso al escáner sigue ahí y el vacío se explica", () => {
    renderModule({ porRecolectar: [] });

    // SUSTITUYE al caso de la 157 "sin nada que recolectar el apartado no se muestra".
    expect(disparador()).toBeInTheDocument();
    // El vacío se DICE (R8): una pantalla muda es lo que hacía que el mensajero se perdiera.
    expect(
      screen.getByText(/no tienes órdenes por recolectar en tienda ahora mismo/i),
    ).toBeInTheDocument();
  });

  it("R7/R8: con la lista VACÍA, al abrirlo aparece el escáner completo", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: [] });

    await abrirEscaner(user);

    expect(escaner()).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirmar recolección" }),
    ).toBeInTheDocument();
  });

  it("R7: con lista vacía el escaneo SÍ se puede confirmar (el escáner no es decorativo)", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: [] });

    await abrirEscaner(user);
    await user.type(screen.getByRole("textbox"), "1001");
    await user.click(screen.getByRole("button", { name: "Confirmar recolección" }));

    await waitFor(() => expect(recolectarMock).toHaveBeenCalledWith({ numGuia: 1001 }));
  });

  it("R7: con órdenes asignadas el acceso al escáner es EXACTAMENTE el mismo", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: [makeOrden()] });

    expect(disparador()).toBeInTheDocument();
    expect(screen.queryByText(/no tienes órdenes por recolectar/i)).toBeNull();

    await abrirEscaner(user);
    expect(escaner()).toBeInTheDocument();
  });

  it("cerrado, la CÁMARA no está montada; al cerrar se vuelve a desmontar", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: [makeOrden()] });

    // Lo que apaga la cámara es el DESMONTAJE del contenido, no un `hidden`: el doble de
    // `QrScanner` solo existe en el DOM mientras el modal está abierto.
    expect(screen.queryByRole("button", { name: "Simular escaneo" })).toBeNull();

    await abrirEscaner(user);
    expect(screen.getByRole("button", { name: "Simular escaneo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Simular escaneo" })).toBeNull(),
    );
    expect(escaner()).toBeNull();
    // Y el acceso sigue ahí para volver a abrirlo: cerrar no es perder el escáner.
    expect(disparador()).toBeInTheDocument();
  });
});

// SLT-168 «Escaneo continuo en las recogidas del mensajero»: el diálogo es la sesión continua de
// SLT-159. Cada lectura es una fila con su desenlace (R596) y NO hay toasts (R590); la lista se
// relee UNA vez al cerrar si hubo alguna recolectada o ya recolectada (R598). Textos a mano.

/** Las filas de la lista de la sesión, la más reciente primero. */
function filas(): HTMLElement[] {
  return within(screen.getByRole("log", { name: "Lecturas" })).queryAllByRole("listitem");
}

/** Espera a que la última lectura diga `estado` y la devuelve. */
async function lecturaQueDice(estado: string): Promise<HTMLElement> {
  await waitFor(() => expect(within(filas()[0]).getByText(estado)).toBeInTheDocument());
  return filas()[0];
}

/** «Recogidas en tienda1»: el rótulo y su valor, tal como se leen. */
function contador(rotulo: string): string {
  return screen.getByText(rotulo).parentElement?.textContent ?? "";
}

function sinToasts() {
  expect(toastSuccess).not.toHaveBeenCalled();
  expect(toastError).not.toHaveBeenCalled();
  expect(toastInfo).not.toHaveBeenCalled();
}

async function teclear(user: ReturnType<typeof userEvent.setup>, ...guias: string[]) {
  for (const g of guias) await user.type(screen.getByRole("textbox"), `${g}{Enter}`);
}

async function cerrarEscaner(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Cerrar" }));
  await waitFor(() => expect(escaner()).toBeNull());
}

describe("RecoleccionModule — confirmar la recolección (R10/R11/R12/R13/R14 + SLT-168)", () => {
  it("R10 + R596: la vía manual confirma la guía y la fila dice «Recogida en tienda», sin toast", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await user.type(screen.getByRole("textbox"), "1001");
    await user.click(screen.getByRole("button", { name: "Confirmar recolección" }));

    await waitFor(() => expect(recolectarMock).toHaveBeenCalledWith({ numGuia: 1001 }));
    await lecturaQueDice("Recogida en tienda");
    sinToasts();
  });

  it("R10: la vía CÁMARA confirma exactamente igual (mismo action, mismo resultado)", async () => {
    const user = userEvent.setup();
    textoEscaneado = TEXTO_QR(1001);
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await user.click(screen.getByRole("button", { name: "Simular escaneo" }));

    await waitFor(() => expect(recolectarMock).toHaveBeenCalledWith({ numGuia: 1001 }));
    await lecturaQueDice("Recogida en tienda");
  });

  it("R11: un código que no son dígitos no llega a la action (vía manual)", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await user.type(screen.getByRole("textbox"), "abc");
    await user.click(screen.getByRole("button", { name: "Confirmar recolección" }));

    expect(recolectarMock).not.toHaveBeenCalled();
  });

  it("R11 + R597: un QR que no es guía es una fila «Código inválido» que no suma (vía cámara)", async () => {
    const user = userEvent.setup();
    textoEscaneado = "esto-no-es-una-url";
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await user.click(screen.getByRole("button", { name: "Simular escaneo" }));

    await lecturaQueDice("Código inválido");
    expect(recolectarMock).not.toHaveBeenCalled();
    expect(contador("Recogidas en tienda")).toBe("Recogidas en tienda0");
    expect(contador("Repetidas")).toBe("Repetidas0");
    expect(contador("No encontradas")).toBe("No encontradas0");
    sinToasts();
  });

  it("R12 + R596: una guía que NO está en la lista cargada SÍ llega al servidor; `no_encontrada` → «No está entre tus órdenes»", async () => {
    const user = userEvent.setup();
    // SUSTITUYE al caso de la 157 "una guía que NO es suya se rechaza en cliente". El
    // servidor es la autoridad: con la lista vacía o desactualizada, el corte local
    // convertía el escáner en un botón que no funciona nunca.
    recolectarMock.mockResolvedValue({ status: "no_encontrada" });
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await teclear(user, "7777777");

    await waitFor(() => expect(recolectarMock).toHaveBeenCalledWith({ numGuia: 7777777 }));
    const fila = await lecturaQueDice("No está entre tus órdenes");
    expect(within(fila).getByText(/^— · — · /)).toBeInTheDocument();
    await cerrarEscaner(user);
    // No hubo transición: no hay nada que revalidar.
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R13 + R596: `ya_recolectada` → «Ya recogida en tienda», no un error", async () => {
    const user = userEvent.setup();
    recolectarMock.mockResolvedValue({ status: "ya_recolectada" });
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await teclear(user, "1001");

    await lecturaQueDice("Ya recogida en tienda");
    expect(screen.queryByText("No se pudo recolectar")).toBeNull();
    sinToasts();
  });

  it("R13: un estado inválido dice EN QUÉ estado está, no un error genérico", async () => {
    const user = userEvent.setup();
    recolectarMock.mockResolvedValue({
      status: "estado_invalido",
      estado: "en_bodega_central",
    });
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await teclear(user, "1001");

    // ⏳ 2026-09-24 (FICHA 455, R3): el estado se nombra con su nombre visible, no con el código.
    const fila = await lecturaQueDice("No se pudo recolectar");
    expect(
      within(fila).getByText("La guía 1001 ya no está por recolectar (está en «En bodega central»)."),
    ).toBeInTheDocument();
  });

  it("R13: un conflicto (bloqueo o carrera) traslada el MOTIVO que da el servidor", async () => {
    const user = userEvent.setup();
    recolectarMock.mockResolvedValue({
      status: "conflict",
      motivo: "Tienes un cierre pendiente.",
    });
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await teclear(user, "1001");

    const fila = await lecturaQueDice("No se pudo recolectar");
    expect(within(fila).getByText("Tienes un cierre pendiente.")).toBeInTheDocument();
  });

  it("R13 + R596: `forbidden` → «No se pudo recolectar» + «No tienes permiso para recolectar órdenes.» con «Reintentar»", async () => {
    const user = userEvent.setup();
    recolectarMock.mockResolvedValue({ status: "forbidden" });
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await teclear(user, "1001");

    const fila = await lecturaQueDice("No se pudo recolectar");
    expect(within(fila).getByText("No tienes permiso para recolectar órdenes.")).toBeInTheDocument();
    expect(within(fila).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByText(/recolectada correctamente/i)).toBeNull();
    sinToasts();
  });

  it("R13: `unauthenticated` manda a iniciar sesión de nuevo (no dice que la guía esté mal)", async () => {
    const user = userEvent.setup();
    recolectarMock.mockResolvedValue({ status: "unauthenticated" });
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await teclear(user, "1001");

    const fila = await lecturaQueDice("No se pudo recolectar");
    expect(within(fila).getByText("Tu sesión expiró. Inicia sesión de nuevo.")).toBeInTheDocument();
  });

  it("R13: `validation_error` del SERVIDOR también dice que el código es inválido", async () => {
    const user = userEvent.setup();
    recolectarMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { numGuia: ["Número de guía inválido"] },
    });
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await teclear(user, "1001");

    // A diferencia del corte de R11, aquí el viaje al servidor SÍ ocurrió: el rechazo lo dio el
    // borde (zod) y el mensajero lee el mismo texto, sin jerga de validación.
    await waitFor(() => expect(recolectarMock).toHaveBeenCalledWith({ numGuia: 1001 }));
    const fila = await lecturaQueDice("No se pudo recolectar");
    expect(within(fila).getByText("Código inválido.")).toBeInTheDocument();
  });
});

describe("RecoleccionModule — escaneo continuo (SLT-168: R595, R597, R598, R830-R833)", () => {
  it("R595: tres lecturas seguidas (cámara y Enter) sin cerrar: tres llamadas en orden, el diálogo sigue y sin toasts; la repetida no se reenvía", async () => {
    const user = userEvent.setup();
    textoEscaneado = TEXTO_QR(1001);
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await user.click(screen.getByRole("button", { name: "Simular escaneo" }));
    textoEscaneado = "1002";
    await user.click(screen.getByRole("button", { name: "Simular escaneo" }));
    await teclear(user, "1003", "1002");

    await waitFor(() => expect(recolectarMock).toHaveBeenCalledTimes(3));
    expect(recolectarMock.mock.calls).toEqual([
      [{ numGuia: 1001 }],
      [{ numGuia: 1002 }],
      [{ numGuia: 1003 }],
    ]);
    await waitFor(() => {
      expect(filas()).toHaveLength(4);
      expect(within(filas()[0]).getByText("Ya recogida en tienda")).toBeInTheDocument();
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simular escaneo" })).toBeInTheDocument();
    sinToasts();
  });

  it("R597: `ok`, `ya_recolectada` y `no_encontrada` → «Recogidas en tienda» 1, «Repetidas» 1, «No encontradas» 1", async () => {
    const user = userEvent.setup();
    recolectarMock
      .mockResolvedValueOnce({ status: "ok", ordenId: "o1", estado: "en_ruta_bodega_central" })
      .mockResolvedValueOnce({ status: "ya_recolectada" })
      .mockResolvedValueOnce({ status: "no_encontrada" });
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await teclear(user, "1001", "5001", "7777777");

    await lecturaQueDice("No está entre tus órdenes");
    expect(contador("Recogidas en tienda")).toBe("Recogidas en tienda1");
    expect(contador("Repetidas")).toBe("Repetidas1");
    expect(contador("No encontradas")).toBe("No encontradas1");
  });

  it("R598: dos recolectadas y cerrar: router.refresh una vez y ninguna antes de cerrar", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await teclear(user, "1001", "1002");
    await waitFor(() => expect(contador("Recogidas en tienda")).toBe("Recogidas en tienda2"));
    expect(refreshMock).not.toHaveBeenCalled();

    await cerrarEscaner(user);

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("R598: un `ya_recolectada` solo también refresca una vez al cerrar", async () => {
    const user = userEvent.setup();
    recolectarMock.mockResolvedValue({ status: "ya_recolectada" });
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await teclear(user, "1001");
    await lecturaQueDice("Ya recogida en tienda");
    expect(refreshMock).not.toHaveBeenCalled();

    await cerrarEscaner(user);

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("R598: solo errores y cerrar: router.refresh no se llama", async () => {
    const user = userEvent.setup();
    recolectarMock.mockResolvedValue({ status: "forbidden" });
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await teclear(user, "1001");
    await lecturaQueDice("No se pudo recolectar");

    await cerrarEscaner(user);

    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("R830: con la acción de 1024 pendiente, la fila dice «Recolectando…»", async () => {
    const user = userEvent.setup();
    let soltar: () => void = () => {};
    recolectarMock.mockImplementationOnce(
      () =>
        new Promise((res) => {
          soltar = () => res({ status: "ok", ordenId: "o1", estado: "en_ruta_bodega_central" });
        }),
    );
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1024 })] });

    await abrirEscaner(user);
    await teclear(user, "1024");

    await lecturaQueDice("Recolectando…");
    expect(screen.queryByText("Recibiendo…")).toBeNull();
    soltar();
    await lecturaQueDice("Recogida en tienda");
  });

  it("R831: 1024 dos veces → la segunda dice «Ya recogida en tienda», la action se llama una vez y suma a Repetidas", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1024 })] });

    await abrirEscaner(user);
    await teclear(user, "1024", "1024");

    await waitFor(() => {
      expect(filas()).toHaveLength(2);
      expect(within(filas()[1]).getByText("Recogida en tienda")).toBeInTheDocument();
    });
    expect(within(filas()[0]).getByText("Ya recogida en tienda")).toBeInTheDocument();
    expect(recolectarMock).toHaveBeenCalledTimes(1);
    expect(contador("Repetidas")).toBe("Repetidas1");
  });

  it("R832: destinatario y tienda de «Por recolectar» (ok), de «Recogidos en tienda hoy» (ya recolectada) y «—» fuera de las listas", async () => {
    const user = userEvent.setup();
    recolectarMock
      .mockResolvedValueOnce({ status: "ok", ordenId: "o1", estado: "en_ruta_bodega_central" })
      .mockResolvedValueOnce({ status: "ya_recolectada" })
      .mockResolvedValueOnce({ status: "ok", ordenId: "o9", estado: "en_ruta_bodega_central" });
    renderModule({
      porRecolectar: [
        makeOrden({
          numGuia: 1001,
          destinatario: "Ana Quesada Mora",
          tiendaNombre: "Tienda Prueba Norte",
        }),
      ],
      recolectadasHoy: [
        makeRecolectada({
          numGuia: 5001,
          destinatario: "Beto Ruiz",
          tiendaNombre: "Tienda Prueba Sur",
        }),
      ],
    });

    await abrirEscaner(user);
    await teclear(user, "1001", "5001", "7777777");

    await waitFor(() => expect(recolectarMock).toHaveBeenCalledTimes(3));
    await lecturaQueDice("Recogida en tienda");
    expect(within(filas()[2]).getByText(/^Ana Quesada Mora · Tienda Prueba Norte · /)).toBeInTheDocument();
    expect(within(filas()[1]).getByText("Ya recogida en tienda")).toBeInTheDocument();
    expect(within(filas()[1]).getByText(/^Beto Ruiz · Tienda Prueba Sur · /)).toBeInTheDocument();
    expect(within(filas()[0]).getByText(/^— · — · /)).toBeInTheDocument();
  });

  it("R833: tras un éxito conserva título, nombre accesible y botón, sin la línea «recolectada correctamente»; un solo disparador", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1001 })] });

    await abrirEscaner(user);
    await teclear(user, "1001");
    await lecturaQueDice("Recogida en tienda");

    expect(escaner()).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Recolectar en tienda");
    expect(screen.getByRole("button", { name: "Confirmar recolección" })).toBeInTheDocument();
    expect(screen.queryByText(/recolectada correctamente/)).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "Escanear o escribir guía", hidden: true }),
    ).toHaveLength(1);
  });
});

// =================================================================================================
// R9/R23 -> FEATURE 271 (T9.2, R31/R43/R51/R52) — EL AVISO, PALABRA POR PALABRA.
// =================================================================================================
//
// ⚠️ Y ESTE PORTAL ES EL QUE SE DIO LA VUELTA. Hasta el 2026-08-22 el aviso de aquí prometía «Sí
// puedes seguir recogiendo en tiendas», porque la recolección estaba EXENTA del bloqueo. El humano
// lo revirtió el 23 con sus palabras: «un mensajero no puede hacer las dos gestiones, solo una a
// la vez». Recolectar en tienda es COBRAR, y el dinero que cobre no tendría cierre al que ir.
//
// ⚠️ LOS LITERALES VAN A MANO Y COMPLETOS: comparar contra `avisoBloqueo(...)` estaría siempre
// verde, pase lo que pase dentro de la función.
describe("RecoleccionModule — bloqueado por cierres sin resolver (R9/R23 -> 271)", () => {
  it("271/§10.2 caso 2 · sin bloque de captura y CON el aviso completo (N=1, V=1)", () => {
    renderModule({ porRecolectar: [makeOrden()], bloqueo: bloqueoConVencido() });

    // Bloqueado no queda ni el ACCESO: sin disparador no hay forma de abrir la tarjeta.
    expect(disparador()).toBeNull();
    expect(escaner()).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirmar recolección" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Simular escaneo" })).toBeNull();

    // El apartado dice por sí mismo por qué no hay escáner: cuando vivía dentro de Entregas
    // el aviso lo ponía el módulo de al lado y aquí no quedaría ninguno.
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tienes un cierre sin enviar a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Ve a «Cierre del día» para enviarlo a aprobación.",
    );
  });

  it("271/§10.2 caso 1 · bloqueado por ACUMULAR (N=2, V=0), con la fecha de la JORNADA", () => {
    renderModule({
      porRecolectar: [makeOrden()],
      bloqueo: bloqueoPorAcumular("2026-08-21"),
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tienes 2 cierres esperando aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Se desbloquea cuando la bodega apruebe el más antiguo, el del 21 de agosto.",
    );
  });

  it("271/§10.2 caso 3 · las DOS cosas a la vez (N=2, V=1)", () => {
    // ⚠️ EL PUNTERO VA SIN OBJETO desde el 2026-08-23 (corrección aprobada por el humano tras
    // mirar la app): «...para enviarLO» colgaba de «el más antiguo», el cierre que resuelve la
    // BODEGA. La frase anterior ya dice qué enviar; el caso 2 conserva su «para enviarlo».
    renderModule({
      porRecolectar: [makeOrden()],
      bloqueo: bloqueoDe({ n: 2, v: 1, jornadaCR: "2026-08-21" }),
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tienes 2 cierres sin resolver y 1 de ellos no se ha enviado a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Envía el que falta y espera a que la bodega apruebe el más antiguo, el del 21 de agosto. Ve a «Cierre del día».",
    );
  });

  it("271/§10.2 caso 3 con el MÁS VIEJO SUYO · la fecha es la del que él envía", () => {
    // ⚠️ LA CUARTA RAMA (aprobada el 2026-08-23, y el estado se midió en el navegador): el admin
    // rechazó el PRIMERO de sus dos `solicitado`, así que el cierre más viejo es SUYO. Antes decía
    // «espera a que la bodega apruebe el más antiguo» fechando su propio cierre — le mandaba a
    // esperar por el mismo que el botón le ofrece reenviar. Ahora la fecha nombra el que ÉL envía y
    // la espera se corre al RESTO.
    renderModule({
      porRecolectar: [makeOrden()],
      bloqueo: bloqueoMixtoElMasViejoEsSuyo({ jornadaCR: "2026-08-20" }),
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tienes 2 cierres sin resolver y 1 de ellos no se ha enviado a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Envía el que falta, el del 20 de agosto, y después espera a que la bodega apruebe el resto. Ve a «Cierre del día».",
    );
  });

  it("271/§10.2 caso 3 con V = N · TODO en su tejado: ni singular ni esperar a la bodega", () => {
    // Dos `rechazado`: no queda ningún `solicitado` que la bodega pueda aprobar, y los dos por
    // enviar son suyos. Hasta el 2026-08-23 este estado leía el texto de arriba, en singular y
    // mandándole a esperar por un cierre que ya era suyo.
    renderModule({
      porRecolectar: [makeOrden()],
      bloqueo: bloqueoTodosPorEnviar(2, "2026-08-21"),
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tienes 2 cierres sin resolver y ninguno se ha enviado a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Envíalos a aprobación, empezando por el más antiguo, el del 21 de agosto. Ve a «Cierre del día».",
    );
  });

  it("271/R51 · NINGUNA variante promete ya recoger en tiendas ni recibir asignaciones", () => {
    // La aserción NEGATIVA sobre las TRES, que es lo que impide reponer la promesa retirada: era
    // cierta hasta el 2026-08-22 y es falsa desde el 23.
    for (const bloqueo of [
      bloqueoConVencido("2026-08-21"),
      bloqueoPorAcumular("2026-08-21"),
      bloqueoDe({ n: 2, v: 1, jornadaCR: "2026-08-21" }),
    ]) {
      cleanup();
      renderModule({ porRecolectar: [makeOrden()], bloqueo });
      const aviso = screen.getByRole("alert");
      expect(aviso).not.toHaveTextContent(/seguir recogiendo en tiendas/i);
      expect(aviso).not.toHaveTextContent(/seguir recibiendo asignaciones/i);
      expect(aviso).not.toHaveTextContent(/sí puedes/i);
    }
  });

  it("271/R5 · un solo cierre YA enviado (N=1, V=0) NO bloquea: el escáner sigue montado", () => {
    renderModule({ porRecolectar: [makeOrden()], bloqueo: bloqueoDe({ n: 1, v: 0 }) });

    expect(disparador()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("R23: bloqueado, las dos listas se siguen viendo en solo-lectura", () => {
    renderModule({
      porRecolectar: [makeOrden({ numRemision: "REM-A" })],
      recolectadasHoy: [makeRecolectada({ numRemision: "REM-H1" })],
      bloqueo: bloqueoConVencido(),
    });

    expect(screen.getAllByText("REM-A").length).toBeGreaterThan(0);
    // El historial del día es historial, no una acción: sigue visible.
    expect(screen.getAllByText("REM-H1").length).toBeGreaterThan(0);
  });

  it("R8/R9: bloqueado y sin nada asignado, el vacío se explica igual (sin escáner)", () => {
    renderModule({ porRecolectar: [], bloqueo: bloqueoConVencido() });

    expect(disparador()).toBeNull();
    expect(escaner()).toBeNull();
    expect(
      screen.getByText(/no tienes órdenes por recolectar en tienda ahora mismo/i),
    ).toBeInTheDocument();
  });

  it("271: bloqueado, el vacío YA NO promete que escanear sirva — no hay escáner ni permiso", () => {
    // ⚠️ LA CONTRADICCIÓN QUE ENCONTRÓ EL NAVEGADOR el 2026-08-23 (corrección aprobada por el
    // humano): el texto del vacío se pintaba entero, sin mirar `bloqueado`, así que debajo del
    // aviso «no puedes ... recibir trabajo nuevo» venía «Puedes escanear igual: si el maestro
    // acaba de asignarte una, se confirmará aquí». Falso por partida doble: no hay disparador de
    // escaneo en pantalla, y el servidor rechaza la recolección de un mensajero bloqueado
    // (R25/R31). Era previa a la 271; la 271 la volvió falsa.
    renderModule({ porRecolectar: [], bloqueo: bloqueoConVencido() });

    expect(screen.queryByText(/puedes escanear igual/i)).toBeNull();
    expect(screen.queryByText(/se confirmará aquí/i)).toBeNull();
  });

  it("271: LIBRE y sin nada asignado, la promesa SIGUE — ahí sí es cierta (R7/R8)", () => {
    // La otra mitad, que es la que impide «arreglarlo» quitando la frase para todos: sin bloqueo
    // el escáner está en pantalla y escanear funciona. Es la causa raíz que la 167 vino a cerrar.
    renderModule({ porRecolectar: [] });

    expect(disparador()).toBeInTheDocument();
    expect(
      screen.getByText(
        "No tienes órdenes por recolectar en tienda ahora mismo. Puedes escanear igual: si el maestro acaba de asignarte una, se confirmará aquí.",
      ),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------
// Feature 167 (R24/R28/R30/R31) — «Recolectadas hoy». Sale del HISTORIAL, así que sobrevive
// a que la bodega central ya haya recibido el paquete (R26, probado en el service).
// ---------------------------------------------------------------------------------------
describe("RecoleccionModule — «Recolectadas hoy» (R24/R28/R30/R31)", () => {
  const lista = () => screen.getByRole("region", { name: "Recogidos en tienda hoy" });

  it("R24/R28: pinta la MISMA card de la orden, con la hora de la recolección", () => {
    renderModule({
      recolectadasHoy: [
        makeRecolectada({
          id: "h1",
          numGuia: 5001,
          numRemision: "REM-H1",
          tiendaNombre: "Tienda Sur",
          recolectadaAt: new Date("2026-07-31T15:30:00.000Z"), // 09:30 CR
        }),
      ],
    });

    const region = lista();
    // La card compartida: remisión y destinatario, igual que en las otras dos listas.
    expect(within(region).getAllByText("REM-H1").length).toBeGreaterThan(0);
    expect(within(region).getAllByText("Ana").length).toBeGreaterThan(0);
    // Lo ÚNICO propio de esta lista: cuándo se recolectó. Hora FIJA en zona de Costa Rica —no
    // depende de la del dispositivo—, la misma convención con la que el servidor decidió qué
    // es "hoy" (R27).
    expect(within(region).getByText(/9:30/)).toBeInTheDocument();
  });

  it("R28: respeta el orden recibido (más reciente primero) sin reordenar", async () => {
    const user = userEvent.setup();
    renderModule({
      recolectadasHoy: [
        makeRecolectada({ id: "h1", numRemision: "REM-NUEVA", numGuia: 5003 }),
        makeRecolectada({ id: "h2", numRemision: "REM-MEDIA", numGuia: 5002 }),
        makeRecolectada({ id: "h3", numRemision: "REM-VIEJA", numGuia: 5001 }),
      ],
    });

    // 2026-08-11: en MOSAICO las cards van en carrusel (ventana de 3), así que el orden
    // completo se afirma en la vista de DETALLE, que las lista todas. El conmutador de esta
    // sección es el único montado aquí: no hay nada por recolectar.
    await user.click(screen.getByRole("button", { name: "Detalle" }));
    // El ancla NO puede ser solo el conteo: a media carga la lista tambien puede tener 3
    // hijos (esqueleto + `role="status"`) y la espera se daria por cumplida antes de tiempo.
    // Se ancla ADEMAS al contenido de la ultima fila, que solo existe ya montada la vista.
    await waitFor(() => {
      const enCurso = within(lista()).getAllByRole("listitem");
      expect(enCurso).toHaveLength(3);
      expect(enCurso[2]).toHaveTextContent("REM-VIEJA");
    });

    const filas = within(lista()).getAllByRole("listitem");
    expect(filas).toHaveLength(3);
    expect(filas[0]).toHaveTextContent("REM-NUEVA");
    expect(filas[1]).toHaveTextContent("REM-MEDIA");
    expect(filas[2]).toHaveTextContent("REM-VIEJA");
  });

  it("R30: sin recolecciones hoy lo DICE, en lugar de omitir la lista", () => {
    renderModule({ recolectadasHoy: [] });

    expect(lista()).toBeInTheDocument();
    expect(
      within(lista()).getByText(/todavía no has recolectado ninguna orden hoy/i),
    ).toBeInTheDocument();
  });

  it("R31: con la lista recortada avisa de que no está todo, con el TOPE REAL", () => {
    renderModule({
      recolectadasHoy: [makeRecolectada()],
      recolectadasHoyRecortada: true,
    });

    // El número del aviso se DERIVA de la misma constante con la que el servidor recorta: si
    // alguien cambia el tope y la UI se queda con el 100 escrito a mano, este caso falla en vez
    // de dejar al mensajero leyendo un aviso que miente (hallazgo m5 del review).
    expect(within(lista()).getByText(avisoRecorte)).toBeInTheDocument();
    expect(avisoRecorte.source).toContain(String(TOPE_RECOLECTADAS_HOY));
  });

  it("R31: sin recorte NO aparece el aviso (no se alarma de gratis)", () => {
    renderModule({
      recolectadasHoy: [makeRecolectada()],
      recolectadasHoyRecortada: false,
    });

    expect(within(lista()).queryByText(avisoRecorte)).toBeNull();
    // Ni el aviso derivado ni ningún otro recuento de "más recientes" se cuela sin recorte.
    expect(within(lista()).queryByText(/más recientes de hoy/i)).toBeNull();
  });

  it("R24: una orden sin número de guía se pinta igual, sin romper la card", () => {
    // La card se identifica por la REMISIÓN, no por la guía, así que una orden a la que
    // todavía no se le asignó número no deja un hueco: sale entera como cualquier otra.
    renderModule({ recolectadasHoy: [makeRecolectada({ numGuia: null })] });

    expect(within(lista()).getAllByText("REM-H1").length).toBeGreaterThan(0);
    expect(within(lista()).getByText(/9:30/)).toBeInTheDocument();
  });
});

// SLT-157 «Guía única leída por cámara o pistola»: los dos caminos leen con `leerGuia`.
describe("RecoleccionModule — guía única por cámara o pistola (SLT-157)", () => {
  it("R565: el CODE128 por cámara y la URL del QR tecleada llegan con el mismo numGuia", async () => {
    const user = userEvent.setup();
    // `no_encontrada`: sin transición, el escáner sigue igual entre las dos lecturas.
    recolectarMock.mockResolvedValue({ status: "no_encontrada" });
    textoEscaneado = "1024";
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1024 })] });

    await abrirEscaner(user);
    await user.click(screen.getByRole("button", { name: "Simular escaneo" }));
    await waitFor(() => expect(recolectarMock).toHaveBeenCalledTimes(1));
    expect(recolectarMock).toHaveBeenNthCalledWith(1, { numGuia: 1024 });

    await user.type(screen.getByRole("textbox"), "https://app.ejemplo.test/paquete/1024");
    await user.click(screen.getByRole("button", { name: "Confirmar recolección" }));
    await waitFor(() => expect(recolectarMock).toHaveBeenCalledTimes(2));
    expect(recolectarMock).toHaveBeenNthCalledWith(2, { numGuia: 1024 });
  });

  it("R566: lo que no es guía es «Código inválido» por los dos caminos y no llama a la action", async () => {
    const user = userEvent.setup();
    textoEscaneado = "1024abc";
    renderModule({ porRecolectar: [makeOrden({ numGuia: 1024 })] });

    await abrirEscaner(user);
    await user.click(screen.getByRole("button", { name: "Simular escaneo" }));

    // Antes, lo tecleado que no eran dígitos se descartaba EN SILENCIO. SLT-168: cada lectura es
    // una fila «Código inválido».
    await user.type(screen.getByRole("textbox"), "1024abc");
    await user.click(screen.getByRole("button", { name: "Confirmar recolección" }));
    await waitFor(() => {
      expect(filas()).toHaveLength(2);
      expect(within(filas()[0]).getByText("Código inválido")).toBeInTheDocument();
    });
    expect(within(filas()[1]).getByText("Código inválido")).toBeInTheDocument();
    expect(recolectarMock).not.toHaveBeenCalled();
  });
});

// SLT-164 «PWA del mensajero: Recoger en bodega y Recolección» (rebanada C de SLT-156): el escáner
// único bajo el encabezado, UNA barra fija para las dos listas, Mosaico de entrada y Detalle con la
// tarjeta compacta de Reparto.
describe("SLT-156 rebanada C — Recolección en el móvil (R500, R506, R516, R517, R519-R522)", () => {
  /** `true` si `a` va ANTES que `b` en el documento. */
  const antes = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  const buscador = () => screen.getByRole("searchbox", { name: "Buscar guías" });
  const seccionPor = () => screen.getByRole("region", { name: "Por recolectar en tienda" });
  const seccionHoy = () => screen.getByRole("region", { name: "Recogidos en tienda hoy" });
  const VACIO_BUSQUEDA = "Ninguna guía por recolectar coincide con la búsqueda.";

  const DOS_POR_RECOLECTAR = [
    makeOrden({ id: "p1", numGuia: 2001, numRemision: "REM-P1", destinatario: "Ana Gómez" }),
    makeOrden({
      id: "p2",
      numGuia: 2002,
      numRemision: "REM-P2",
      destinatario: "Bruno Solís",
      telefonoDest: "61234567",
    }),
  ];
  const DOS_RECOGIDAS = [
    makeRecolectada({ id: "h1", numGuia: 5001, numRemision: "REM-H1", destinatario: "Ána Torres" }),
    makeRecolectada({ id: "h2", numGuia: 5002, numRemision: "REM-H2", destinatario: "Carla Mora" }),
  ];

  it("R519/R500: «Escanear o escribir guía» (cerrado) → barra fija → «Por recolectar en tienda» → «Recogidos en tienda hoy»", () => {
    renderModule({ porRecolectar: DOS_POR_RECOLECTAR, recolectadasHoy: DOS_RECOGIDAS });

    const boton = disparador();
    expect(boton).not.toBeNull();
    // Arranca cerrado: sin diálogo ni tarjeta montada.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(escaner()).toBeNull();
    expect(antes(boton!, buscador())).toBe(true);
    expect(antes(buscador(), seccionPor())).toBe(true);
    expect(antes(seccionPor(), seccionHoy())).toBe(true);
    // La barra está pegada arriba y su padre llega hasta la última lista (`sticky` se pega
    // dentro de su padre).
    const barra = buscador().closest(".sticky");
    expect(barra).not.toBeNull();
    expect(barra!.className.split(/\s+/)).toEqual(expect.arrayContaining(["sticky", "top-0"]));
    expect(barra!.parentElement!.contains(seccionHoy())).toBe(true);
  });

  it("R493: el disparador mide 44 px (`h-11`) y va a todo el ancho", () => {
    renderModule({ porRecolectar: DOS_POR_RECOLECTAR });
    expect(disparador()!.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["h-11", "w-full"]),
    );
  });

  it("R516/R519: bloqueado no hay disparador; el aviso va primero y la barra sigue", () => {
    renderModule({ porRecolectar: DOS_POR_RECOLECTAR, bloqueo: bloqueoConVencido() });
    expect(disparador()).toBeNull();
    const aviso = screen.getByRole("alert");
    expect(antes(aviso, buscador())).toBe(true);
    expect(antes(buscador(), seccionPor())).toBe(true);
  });

  it("R495/R506: un solo campo, con el placeholder «Guía, remisión, teléfono o nombre», que busca también por teléfono", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: DOS_POR_RECOLECTAR });

    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(buscador()).toHaveAttribute("placeholder", "Guía, remisión, teléfono o nombre");

    await user.type(buscador(), "6123-4567");
    expect(within(seccionPor()).getByText("REM-P2")).toBeInTheDocument();
    expect(within(seccionPor()).queryByText("REM-P1")).toBeNull();
  });

  it("R520: el término filtra las DOS listas y las cabeceras siguen contando el día entero", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: DOS_POR_RECOLECTAR, recolectadasHoy: DOS_RECOGIDAS });

    await user.type(buscador(), "ana");

    // Sin distinguir mayúsculas ni acentos: «Ana Gómez» y «Ána Torres» quedan; las otras no.
    expect(within(seccionPor()).getByText("REM-P1")).toBeInTheDocument();
    expect(within(seccionPor()).queryByText("REM-P2")).toBeNull();
    expect(within(seccionHoy()).getByText("REM-H1")).toBeInTheDocument();
    expect(within(seccionHoy()).queryByText("REM-H2")).toBeNull();
    expect(
      within(seccionPor()).getByText("2 paquetes por recolectar en tienda."),
    ).toBeInTheDocument();
    expect(
      within(seccionHoy()).getByText("2 paquetes recogidos en tienda hoy."),
    ).toBeInTheDocument();
  });

  it("R521: sin coincidencias cada lista dice el vacío de búsqueda, distinto del vacío sin órdenes", async () => {
    const user = userEvent.setup();
    const { unmount } = renderModule({
      porRecolectar: DOS_POR_RECOLECTAR,
      recolectadasHoy: DOS_RECOGIDAS,
    });

    await user.type(buscador(), "zzzz");
    expect(within(seccionPor()).getByText(VACIO_BUSQUEDA)).toBeInTheDocument();
    expect(within(seccionHoy()).getByText(VACIO_BUSQUEDA)).toBeInTheDocument();
    expect(screen.queryByText(/No tienes órdenes por recolectar/)).toBeNull();
    expect(screen.queryByText(/Todavía no has recolectado/)).toBeNull();
    unmount();

    // Sin órdenes, el término no cambia el vacío de siempre.
    renderModule({});
    await user.type(buscador(), "zzzz");
    expect(within(seccionPor()).getByText(/No tienes órdenes por recolectar/)).toBeInTheDocument();
    expect(within(seccionHoy()).getByText(/Todavía no has recolectado/)).toBeInTheDocument();
    expect(screen.queryByText(VACIO_BUSQUEDA)).toBeNull();
  });

  it("R517: arranca en Mosaico (carruseles) y Detalle pinta las tarjetas compactas", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: DOS_POR_RECOLECTAR, recolectadasHoy: DOS_RECOGIDAS });

    // SLT-190 (R860): el conmutador es el ÚNICO de la pantalla, en la barra (ya no en la cabecera).
    const conmutador = screen.getByRole("group", { name: "Vista de las órdenes" });
    expect(within(conmutador).getByRole("button", { name: /Mosaico/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("region", { name: "Órdenes por recolectar" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Paquetes recogidos en tienda hoy" }),
    ).toBeInTheDocument();

    await user.click(within(conmutador).getByRole("button", { name: /Detalle/ }));
    expect(
      await within(seccionPor()).findByRole("button", { expanded: false, name: /REM-P1/ }),
    ).toBeInTheDocument();
    expect(
      within(seccionHoy()).getByRole("button", { expanded: false, name: /REM-H1/ }),
    ).toBeInTheDocument();
  });

  it("R522: la guía confirmada en el escáner se recolecta con el mismo resultado; SLT-168: la fila lo dice y refresca al cerrar", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: DOS_POR_RECOLECTAR });

    await abrirEscaner(user);
    expect(screen.getByRole("dialog")).toHaveTextContent("Recolectar en tienda");
    await user.type(screen.getByRole("textbox"), "2001");
    await user.click(screen.getByRole("button", { name: "Confirmar recolección" }));

    await waitFor(() => expect(recolectarMock).toHaveBeenCalledWith({ numGuia: 2001 }));
    const fila = await lecturaQueDice("Recogida en tienda");
    expect(within(fila).getByText(/^Ana Gómez · Tienda Norte · /)).toBeInTheDocument();
    await cerrarEscaner(user);
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });
});

// =================================================================================================
// SLT-190 «Recoger y Recolección según el canvas» — filtro «Tienda» (R850-R854), numeración (R857),
// un solo conmutador en la barra (R860), fila plegada de Recolección (R862-R865) y la barra del
// diálogo (R868-R870). jsdom no aplica Tailwind: se afirman las clases; la medida a 360/414 px y el
// pegado al desplazar son del E2E `e2e/pwa-mensajero-recoger-recoleccion.spec.ts`.
// =================================================================================================
describe("SLT-190 — Recolección según el canvas", () => {
  const seccionPor = () => screen.getByRole("region", { name: "Por recolectar en tienda" });
  const seccionHoy = () => screen.getByRole("region", { name: "Recogidos en tienda hoy" });
  const buscador = () => screen.getByRole("searchbox", { name: "Buscar guías" });
  const barra = () => buscador().closest(".sticky") as HTMLElement;
  const conmutador = () => screen.getByRole("group", { name: "Vista de las órdenes" });
  const VACIO_BUSQUEDA = "Ninguna guía por recolectar coincide con la búsqueda.";

  const POR = [
    makeOrden({ id: "p1", numGuia: 2001, numRemision: "REM-P1", destinatario: "Ana Gómez", tiendaNombre: "Tienda Sur" }),
    makeOrden({ id: "p2", numGuia: 2002, numRemision: "REM-P2", destinatario: "Bruno Solís", tiendaNombre: "Tienda Norte" }),
    makeOrden({ id: "p3", numGuia: 2003, numRemision: "REM-P3", destinatario: "Carla Mora", tiendaNombre: "Tienda Sur" }),
  ];
  const HOY = [
    makeRecolectada({ id: "h1", numGuia: 5001, numRemision: "REM-H1", destinatario: "Dani Rojas", tiendaNombre: "Tienda Norte" }),
    makeRecolectada({ id: "h2", numGuia: 5002, numRemision: "REM-H2", destinatario: "Eva Vargas", tiendaNombre: "Tienda Este" }),
  ];

  async function ponerTienda(user: ReturnType<typeof userEvent.setup>, tienda: string) {
    await user.click(screen.getByRole("button", { name: /^Filtros/ }));
    const selector = await screen.findByRole("listbox", { name: "Filtros" });
    await user.click(within(selector).getByRole("option", { name: "Tienda" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("combobox", { name: "Filtrar por tienda" }));
    const lista = await screen.findByRole("listbox");
    await user.click(within(lista).getByRole("option", { name: tienda }));
  }

  async function aDetalle(user: ReturnType<typeof userEvent.setup>) {
    await user.click(within(conmutador()).getByRole("button", { name: /Detalle/ }));
    await waitFor(() =>
      expect(within(conmutador()).getByRole("button", { name: /Detalle/ })).toHaveAttribute("aria-pressed", "true"),
    );
  }

  it("R850: las opciones de «Tienda» salen de las dos listas, sin repetir y en orden", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: POR, recolectadasHoy: HOY });
    await user.click(screen.getByRole("button", { name: /^Filtros/ }));
    const selector = await screen.findByRole("listbox", { name: "Filtros" });
    await user.click(within(selector).getByRole("option", { name: "Tienda" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("combobox", { name: "Filtrar por tienda" }));
    const lista = await screen.findByRole("listbox");
    expect(within(lista).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Todas",
      "Tienda Este",
      "Tienda Norte",
      "Tienda Sur",
    ]);
  });

  it("R851/R853: filtra las DOS listas (con el término también); las cabeceras siguen contando todo", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: POR, recolectadasHoy: HOY });
    await ponerTienda(user, "Tienda Norte");

    expect(within(seccionPor()).getByText("REM-P2")).toBeInTheDocument();
    expect(within(seccionPor()).queryByText("REM-P1")).toBeNull();
    expect(within(seccionHoy()).getByText("REM-H1")).toBeInTheDocument();
    expect(within(seccionHoy()).queryByText("REM-H2")).toBeNull();
    expect(within(seccionPor()).getByText("3 paquetes por recolectar en tienda.")).toBeInTheDocument();
    expect(within(seccionHoy()).getByText("2 paquetes recogidos en tienda hoy.")).toBeInTheDocument();

    await user.type(buscador(), "bruno");
    expect(within(seccionPor()).getByText("REM-P2")).toBeInTheDocument();
    expect(within(seccionHoy()).getByText(VACIO_BUSQUEDA)).toBeInTheDocument();
  });

  it("R853: el filtro no cambia lo que acepta el escáner (una guía de otra tienda llega al servidor)", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: POR, recolectadasHoy: HOY });
    await ponerTienda(user, "Tienda Norte");

    await abrirEscaner(user);
    await user.type(screen.getByRole("textbox"), "2001");
    await user.click(screen.getByRole("button", { name: "Confirmar recolección" }));
    await waitFor(() => expect(recolectarMock).toHaveBeenCalledWith({ numGuia: 2001 }));
    const fila = await lecturaQueDice("Recogida en tienda");
    expect(within(fila).getByText(/^Ana Gómez · Tienda Sur · /)).toBeInTheDocument();
  });

  it("R852: «Filtros (1)», «Tienda: {nombre}» a 44 px y «Limpiar todo» que vuelve a todas y vacía el término", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: POR, recolectadasHoy: HOY });
    await ponerTienda(user, "Tienda Sur");
    await user.type(buscador(), "ana");

    expect(within(barra()).getByRole("button", { name: /^Filtros \(1\)/ })).toBeInTheDocument();
    const control = within(barra()).getByRole("combobox", { name: "Filtrar por tienda" });
    expect(control).toHaveTextContent("Tienda: Tienda Sur");
    expect(control.className.split(/\s+/)).toContain("max-md:h-11");

    await user.click(within(barra()).getByRole("button", { name: "Limpiar todo" }));
    expect(buscador()).toHaveValue("");
    for (const rem of ["REM-P1", "REM-P2", "REM-P3"]) {
      expect(within(seccionPor()).getByText(rem)).toBeInTheDocument();
    }
    expect(within(seccionHoy()).getByText("REM-H2")).toBeInTheDocument();
  });

  it("R854: con solo el filtro, la lista que queda vacía dice el vacío de búsqueda, no «sin órdenes»", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: POR, recolectadasHoy: HOY });
    await ponerTienda(user, "Tienda Este");

    expect(within(seccionPor()).getByText(VACIO_BUSQUEDA)).toBeInTheDocument();
    expect(screen.queryByText(/No tienes órdenes por recolectar/)).toBeNull();
    expect(within(seccionHoy()).getByText("REM-H2")).toBeInTheDocument();
  });

  it("R857: cada lista se numera sola sobre lo visible, de 1 a n", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: POR, recolectadasHoy: HOY });
    await aDetalle(user);
    expect(within(seccionPor()).getByText("Orden 3 de 3")).toBeInTheDocument();
    expect(within(seccionHoy()).getByText("Orden 2 de 2")).toBeInTheDocument();

    await ponerTienda(user, "Tienda Sur");
    const fila = within(seccionPor()).getByRole("button", { name: /REM-P3/ });
    expect(within(fila).getByText("Orden 2 de 2")).toBeInTheDocument();
    expect(within(seccionPor()).queryByText(/de 3$/)).toBeNull();
  });

  it("R860: un único conmutador, en la barra tras «Filtros»; las cabeceras no lo llevan y cambia las dos listas a la vez", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: POR, recolectadasHoy: HOY });

    expect(screen.getAllByRole("group", { name: "Vista de las órdenes" })).toHaveLength(1);
    expect(barra().contains(conmutador())).toBe(true);
    const filtros = within(barra()).getByRole("button", { name: /^Filtros/ });
    expect(filtros.compareDocumentPosition(conmutador()) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    for (const nombre of ["Por recolectar en tienda", "Recogidos en tienda hoy"]) {
      const cabecera = screen.getByRole("heading", { name: nombre }).parentElement as HTMLElement;
      expect(within(cabecera).queryByRole("button", { name: /Mosaico|Detalle/ })).toBeNull();
    }

    await aDetalle(user);
    expect(await within(seccionPor()).findByRole("button", { expanded: false, name: /REM-P1/ })).toBeInTheDocument();
    expect(within(seccionHoy()).getByRole("button", { expanded: false, name: /REM-H1/ })).toBeInTheDocument();
  });

  it("R862/R864: en Detalle la fila plegada lleva número, remisión, destinatario, tienda, estado vigente y «Valor a cobrar»", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: POR, recolectadasHoy: HOY });
    await aDetalle(user);

    const fila = await within(seccionPor()).findByRole("button", { expanded: false, name: /REM-P1/ });
    expect(within(fila).getByText("Orden 1 de 3")).toBeInTheDocument();
    expect(within(fila).getByText("REM-P1")).toBeInTheDocument();
    expect(within(fila).getByText("Ana Gómez")).toBeInTheDocument();
    expect(within(fila).getByText("Tienda Sur")).toBeInTheDocument();
    expect(within(fila).getByText("Recolectando")).toBeInTheDocument();
    expect(within(fila).getByText("Valor a cobrar")).toBeInTheDocument();
    expect(fila.textContent).not.toMatch(/Por recolectar|Recolectada|Recolectado/);
  });

  it("R863/R865: en «Recogidos hoy» la hora va plegada tras la tienda y no se repite al desplegar; en Mosaico sigue al pie", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: POR, recolectadasHoy: [HOY[0]] });

    // Mosaico (de entrada): «Recogido a las» al pie de la card, como hoy.
    expect(within(seccionHoy()).getByText(/Recogido a las/)).toBeInTheDocument();
    expect(within(seccionHoy()).getByText(/9:30/)).toBeInTheDocument();

    await aDetalle(user);
    const fila = await within(seccionHoy()).findByRole("button", { expanded: false, name: /REM-H1/ });
    const linea = within(fila).getByText(/^Tienda Norte · Recogido a las/);
    expect(linea.textContent).toMatch(/9:30/);

    await user.click(fila);
    const abierta = within(seccionHoy()).getByRole("button", { expanded: true });
    const despliegue = document.getElementById(abierta.getAttribute("aria-controls") ?? "")!;
    expect(within(despliegue).getByRole("button", { name: "Qué significa «Recolectando»" })).toBeInTheDocument();
    expect(within(despliegue).queryByText(/Recogido a las/)).toBeNull();
    expect(within(seccionHoy()).getAllByText(/Recogido a las/)).toHaveLength(1);
  });

  it("R868/R869/R870: el diálogo lleva la barra «Recolectar en tienda» con un solo «Cerrar» de 44 px; la sesión y los nombres siguen", async () => {
    const user = userEvent.setup();
    renderModule({ porRecolectar: POR });
    await abrirEscaner(user);

    const dialogo = screen.getByRole("dialog", { name: "Recolectar en tienda" });
    const titulos = within(dialogo).getAllByText("Recolectar en tienda");
    expect(titulos).toHaveLength(1);
    expect(titulos[0]).not.toHaveClass("sr-only");
    expect(within(dialogo).queryByText("Escanea o ingresa el número de guía")).toBeNull();
    // Un solo encabezado: el de la barra (el título del diálogo).
    expect(within(dialogo).getAllByRole("heading")).toEqual([titulos[0]]);
    // La cámara es el doble de este archivo («Simular escaneo»): va debajo de la barra.
    expect(within(dialogo).getByRole("button", { name: "Simular escaneo" })).toBeInTheDocument();
    expect(within(dialogo).getByText("o")).toBeInTheDocument();
    const cerrar = within(dialogo).getAllByRole("button", { name: "Cerrar" });
    expect(cerrar).toHaveLength(1);
    expect(cerrar[0].className.split(/\s+/)).toContain("size-11");
    expect(escaner()).not.toBeNull();
    expect(screen.getByRole("button", { name: "Confirmar recolección" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), "2001");
    await user.click(screen.getByRole("button", { name: "Confirmar recolección" }));
    await lecturaQueDice("Recogida en tienda");
    await cerrarEscaner(user);
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });
});
