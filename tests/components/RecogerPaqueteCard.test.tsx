// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecogerPaqueteCard } from "@/app/(app)/mis-asignaciones/_components/RecogerPaqueteCard";
import {
  listarMisAsignaciones,
  recogerAsignaciones,
} from "@/lib/actions/mis-asignaciones";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

// Recoger paquete: la tarjeta con los DOS caminos (cámara y número tecleado), que antes
// eran dos componentes sueltos (`EscanerRecoger` + `InputRecoger`). Ambos resuelven el
// num_guia contra la lista "por recoger" y ACEPTAN la orden con la MISMA action
// `recogerAsignaciones`, así que los casos de resultado se cubren una sola vez y lo que
// se comprueba por separado es el PARSEO de cada camino (URL del paquete vs. número).
// Se mockean la Server Action, el toast y la lib de cámara (sin hardware en CI): el
// doble captura el callback de decodificación que `start` recibe.
//
// SLT-168 «Escaneo continuo en las recogidas del mensajero»: el diálogo es la sesión continua
// de SLT-159. Cada lectura es una fila con su desenlace; sin toasts. Textos escritos a mano.
vi.mock("@/lib/actions/mis-asignaciones", () => ({
  recogerAsignaciones: vi.fn(),
  // SLT-69: ante una guía que no está en la lista cargada, el hook relee la lista vigente.
  listarMisAsignaciones: vi.fn(),
}));

const { successMock, errorMock, infoMock, startMock, stopMock, decodeCallback } = vi.hoisted(() => ({
  successMock: vi.fn(),
  errorMock: vi.fn(),
  infoMock: vi.fn(),
  startMock: vi.fn(),
  stopMock: vi.fn(),
  decodeCallback: { current: null as ((texto: string) => void) | null },
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: successMock,
    error: errorMock,
    info: infoMock,
    warning: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start = startMock;
    stop = stopMock;
    clear = vi.fn();
  },
}));

const recogerMock = vi.mocked(recogerAsignaciones);
const listarMock = vi.mocked(listarMisAsignaciones);

/** Respuesta `ok` de la relectura con la lista vigente dada (el resto no lo lee el hook). */
function listaVigente(
  lista: MiAsignacionDTO[],
): Awaited<ReturnType<typeof listarMisAsignaciones>> {
  return {
    status: "ok",
    porRecoger: lista,
    porGestionar: [],
    conAyuda: [],
    ordenEnGestionId: null,
  } as unknown as Awaited<ReturnType<typeof listarMisAsignaciones>>;
}

function makeAsignacion(
  over: Partial<MiAsignacionDTO> & { id: string; numGuia: number },
): MiAsignacionDTO {
  return {
    // Feature 92/R28: sin posicion en la ruta salvo que el test la fije.
    secuenciaRuta: null,
    numRemision: "REM-001",
    estatusValue: "mensajero_recogiendo_en_bodega",
    destinatario: "Ana Pérez",
    telefonoDest: "88880000",
    direccion: "Calle 1, casa 2",
    producto: "Caja mediana",
    peso: 1.5,
    montoCobrar: 150,
    // Feature 97: coords de la parada (feature 91) para el mapa de ruta.
    latitud: 9.9281244,
    longitud: -84.0907246,
    notas: null,
    tiendaNombre: "Tienda X",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    ...over,
  };
}

/** URL del paquete tal como la codifica el QR de la etiqueta: `/paquete/<numGuia>`. */
function qrDeGuia(numGuia: number): string {
  return `https://ejemplo.app/paquete/${numGuia}`;
}

/** Abre la cámara y simula que decodifica un QR con el texto dado. */
async function escanear(
  user: ReturnType<typeof userEvent.setup>,
  texto: string,
) {
  await user.click(screen.getByRole("button", { name: "Escanear con cámara" }));
  await vi.waitFor(() => expect(decodeCallback.current).not.toBeNull());
  await act(async () => {
    decodeCallback.current?.(texto);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  decodeCallback.current = null;
  stopMock.mockResolvedValue(undefined);
  // SLT-69: por defecto el servidor tiene la MISMA lista que la tarjeta (sin guías nuevas).
  listarMock.mockResolvedValue(listaVigente(porRecoger));
  startMock.mockImplementation(
    async (
      _config: unknown,
      _opciones: unknown,
      onDecode: (texto: string) => void,
    ) => {
      decodeCallback.current = onDecode;
    },
  );
});

afterEach(() => {
  cleanup();
});

const porRecoger = [
  makeAsignacion({ id: "ord-1", numGuia: 1001 }),
  makeAsignacion({ id: "ord-2", numGuia: 1002, numRemision: "REM-002" }),
];

/**
 * Monta la tarjeta y la ABRE. Desde el 2026-07-31 (decisión del humano) la tarjeta vive tras
 * el disparador de `EscanerModal` —en modal desde el 2026-08-10—, igual que en el resto de
 * la app:
 * montada dejaba `QrScanner` vivo —la cámara encendida— todo el tiempo que el mensajero
 * tuviera la pantalla abierta, en la calle. Cada caso abre primero, que es exactamente lo
 * que hace el mensajero cuando va a recoger.
 */
async function renderAbierta(
  user: ReturnType<typeof userEvent.setup>,
  onRecogida: () => void = vi.fn(),
) {
  render(<RecogerPaqueteCard porRecoger={porRecoger} onRecogida={onRecogida} />);
  await user.click(screen.getByRole("button", { name: "Escanear o escribir guía" }));
}

/** Monta la tarjeta con otra lista «por recoger» (también la de la relectura) y la abre. */
async function renderCon(
  user: ReturnType<typeof userEvent.setup>,
  lista: MiAsignacionDTO[],
  onRecogida: () => void = vi.fn(),
) {
  listarMock.mockResolvedValue(listaVigente(lista));
  render(<RecogerPaqueteCard porRecoger={lista} onRecogida={onRecogida} />);
  await user.click(screen.getByRole("button", { name: "Escanear o escribir guía" }));
}

const tres = [
  ...porRecoger,
  makeAsignacion({ id: "ord-3", numGuia: 1003, numRemision: "REM-003" }),
];

/** Teclea el número de guía y confirma con Enter (submit del form). */
async function tecleaYConfirma(
  user: ReturnType<typeof userEvent.setup>,
  texto: string,
) {
  await user.type(screen.getByLabelText("Número de guía"), `${texto}{Enter}`);
}

/** Las filas de la lista de la sesión, la más reciente primero (R581). */
function filas(): HTMLElement[] {
  return within(screen.getByRole("log", { name: "Lecturas" })).queryAllByRole("listitem");
}

/** «Recogidas1»: el rótulo y su valor, tal como se leen. */
function contador(rotulo: string): string {
  return screen.getByText(rotulo).parentElement?.textContent ?? "";
}

function sinToasts() {
  expect(successMock).not.toHaveBeenCalled();
  expect(errorMock).not.toHaveBeenCalled();
  expect(infoMock).not.toHaveBeenCalled();
}

describe("RecogerPaqueteCard — camino cámara", () => {
  it("al escanear una guía por recoger, recoge esa orden por su id (misma action)", async () => {
    const user = userEvent.setup();
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-2"] });
    await renderAbierta(user);

    await escanear(user, qrDeGuia(1002));

    await vi.waitFor(() =>
      expect(recogerMock).toHaveBeenCalledWith({ ordenIds: ["ord-2"] }),
    );
  });

  it("robusto ante barra final en la URL del paquete", async () => {
    const user = userEvent.setup();
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-1"] });
    await renderAbierta(user);

    await escanear(user, `${qrDeGuia(1001)}/`);

    await vi.waitFor(() =>
      expect(recogerMock).toHaveBeenCalledWith({ ordenIds: ["ord-1"] }),
    );
  });

  it("R596: ok → la fila dice «Recogida», sin toast y sin refrescar mientras sigue abierto", async () => {
    const user = userEvent.setup();
    const onRecogida = vi.fn();
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-1"] });
    await renderAbierta(user, onRecogida);

    await escanear(user, qrDeGuia(1001));

    await vi.waitFor(() => expect(within(filas()[0]).getByText("Recogida")).toBeInTheDocument());
    expect(within(filas()[0]).getByText("1001")).toBeInTheDocument();
    sinToasts();
    expect(onRecogida).not.toHaveBeenCalled();
  });

  it("R596: guía ausente también tras la relectura → «No está entre tus órdenes», sin llamar a la action", async () => {
    const user = userEvent.setup();
    const onRecogida = vi.fn();
    await renderAbierta(user, onRecogida);

    await escanear(user, qrDeGuia(7777777));

    await vi.waitFor(() =>
      expect(within(filas()[0]).getByText("No está entre tus órdenes")).toBeInTheDocument(),
    );
    expect(listarMock).toHaveBeenCalledTimes(1);
    expect(recogerMock).not.toHaveBeenCalled();
    expect(contador("No encontradas")).toBe("No encontradas1");
    sinToasts();
  });

  it("R597: un QR que no es guía es una fila «Código inválido» que no suma, sin llamar a la action", async () => {
    const user = userEvent.setup();
    await renderAbierta(user);

    await escanear(user, "###");

    await vi.waitFor(() => expect(within(filas()[0]).getByText("Código inválido")).toBeInTheDocument());
    expect(recogerMock).not.toHaveBeenCalled();
    expect(contador("Recogidas")).toBe("Recogidas0");
    expect(contador("Repetidas")).toBe("Repetidas0");
    expect(contador("No encontradas")).toBe("No encontradas0");
    sinToasts();
  });

  it("R596: conflict → «No se pudo recoger» con el motivo de siempre", async () => {
    const user = userEvent.setup();
    recogerMock.mockResolvedValue({ status: "conflict", detalle: [] });
    await renderAbierta(user);

    await escanear(user, qrDeGuia(1001));

    await vi.waitFor(() =>
      expect(within(filas()[0]).getByText("No se pudo recoger")).toBeInTheDocument(),
    );
    expect(
      within(filas()[0]).getByText(
        "La orden ya no está en «Mensajero recogiendo en la bodega». Actualiza y vuelve a intentar.",
      ),
    ).toBeInTheDocument();
    sinToasts();
  });

  it("expone el botón de cámara y alterna su estado (aria-pressed)", async () => {
    const user = userEvent.setup();
    await renderAbierta(user);

    const boton = screen.getByRole("button", { name: "Escanear con cámara" });
    expect(boton).toHaveAttribute("aria-pressed", "false");
    await user.click(boton);
    expect(
      screen.getByRole("button", { name: "Cerrar cámara" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("RecogerPaqueteCard — camino manual (número tecleado)", () => {
  it("al teclear una guía por recoger, recoge esa orden por su id (misma action)", async () => {
    const user = userEvent.setup();
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-2"] });
    await renderAbierta(user);

    await tecleaYConfirma(user, "1002");

    await vi.waitFor(() =>
      expect(recogerMock).toHaveBeenCalledWith({ ordenIds: ["ord-2"] }),
    );
  });

  it("ok → fila «Recogida» y el campo queda LIMPIO para la siguiente", async () => {
    const user = userEvent.setup();
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-1"] });
    await renderAbierta(user);

    await tecleaYConfirma(user, "1001");

    await vi.waitFor(() => expect(within(filas()[0]).getByText("Recogida")).toBeInTheDocument());
    expect(screen.getByLabelText("Número de guía")).toHaveValue("");
  });

  it("también recoge con el botón 'Recoger' (no solo con Enter)", async () => {
    const user = userEvent.setup();
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-2"] });
    await renderAbierta(user);

    await user.type(screen.getByLabelText("Número de guía"), "1002");
    await user.click(screen.getByRole("button", { name: "Recoger" }));

    await vi.waitFor(() =>
      expect(recogerMock).toHaveBeenCalledWith({ ordenIds: ["ord-2"] }),
    );
  });

  it("robustez: campo VACÍO no llama a la action (botón deshabilitado y Enter inerte)", async () => {
    const user = userEvent.setup();
    await renderAbierta(user);

    expect(screen.getByRole("button", { name: "Recoger" })).toBeDisabled();
    await user.type(screen.getByLabelText("Número de guía"), "{Enter}");
    expect(recogerMock).not.toHaveBeenCalled();
  });

  it("robustez: entrada NO numérica no llama a la action y queda como fila «Código inválido»", async () => {
    const user = userEvent.setup();
    await renderAbierta(user);

    await tecleaYConfirma(user, "abc");

    expect(recogerMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Número de guía")).toHaveValue("");
    await vi.waitFor(() => expect(filas()).toHaveLength(1));
    expect(within(filas()[0]).getByText("abc")).toBeInTheDocument();
    expect(within(filas()[0]).getByText("Código inválido")).toBeInTheDocument();
  });

  it("R596: forbidden → «No se pudo recoger» + motivo y «Reintentar» vuelve a llamar sin añadir fila", async () => {
    const user = userEvent.setup();
    recogerMock
      .mockResolvedValueOnce({ status: "forbidden" })
      .mockResolvedValueOnce({ status: "ok", recogidas: ["ord-1"] });
    await renderAbierta(user);

    await tecleaYConfirma(user, "1001");

    await vi.waitFor(() =>
      expect(within(filas()[0]).getByText("No se pudo recoger")).toBeInTheDocument(),
    );
    expect(
      within(filas()[0]).getByText("No tienes permiso para recoger esta orden."),
    ).toBeInTheDocument();

    await user.click(within(filas()[0]).getByRole("button", { name: "Reintentar" }));

    await vi.waitFor(() => expect(recogerMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(within(filas()[0]).getByText("Recogida")).toBeInTheDocument());
    expect(filas()).toHaveLength(1);
    expect(recogerMock).toHaveBeenNthCalledWith(2, { ordenIds: ["ord-1"] });
    sinToasts();
  });
});

describe("RecogerPaqueteCard — el diálogo continuo (R595, R833)", () => {
  it("ofrece los DOS caminos en un solo control", async () => {
    const user = userEvent.setup();
    await renderAbierta(user);

    expect(
      screen.getByRole("region", { name: "Recoger por número de guía o escaneo" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escanear con cámara" })).toBeInTheDocument();
    expect(screen.getByLabelText("Número de guía")).toBeInTheDocument();
  });

  it("R595: tres lecturas seguidas (cámara, cámara, Enter) sin cerrar: tres llamadas en orden, cámara abierta y sin toasts; la repetida no se reenvía", async () => {
    const user = userEvent.setup();
    recogerMock.mockImplementation(async (input) => ({
      status: "ok",
      recogidas: (input as { ordenIds: string[] }).ordenIds,
    }));
    render(<RecogerPaqueteCard porRecoger={tres} onRecogida={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Escanear o escribir guía" }));

    await escanear(user, qrDeGuia(1001));
    await act(async () => {
      decodeCallback.current?.("1002");
    });
    await tecleaYConfirma(user, "1003");
    await tecleaYConfirma(user, "1001");

    await vi.waitFor(() => expect(recogerMock).toHaveBeenCalledTimes(3));
    expect(recogerMock.mock.calls).toEqual([
      [{ ordenIds: ["ord-1"] }],
      [{ ordenIds: ["ord-2"] }],
      [{ ordenIds: ["ord-3"] }],
    ]);
    await vi.waitFor(() => expect(filas()).toHaveLength(4));
    expect(stopMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    sinToasts();
  });

  it("R833: tras un éxito conserva título, nombre accesible y botón, sin la línea «recogida correctamente»; un solo disparador", async () => {
    const user = userEvent.setup();
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-1"] });
    await renderAbierta(user);

    await tecleaYConfirma(user, "1001");
    await vi.waitFor(() => expect(within(filas()[0]).getByText("Recogida")).toBeInTheDocument());

    expect(
      screen.getByRole("region", { name: "Recoger por número de guía o escaneo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Recoger paquete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recoger" })).toBeInTheDocument();
    expect(screen.queryByText(/recogida correctamente/)).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "Escanear o escribir guía", hidden: true }),
    ).toHaveLength(1);
  });

  it("R830: con la acción de 1024 pendiente, la fila dice «Recogiendo…»", async () => {
    const user = userEvent.setup();
    let soltar: () => void = () => {};
    recogerMock.mockImplementationOnce(
      () =>
        new Promise((res) => {
          soltar = () => res({ status: "ok", recogidas: ["ord-1024"] });
        }),
    );
    await renderCon(user, [makeAsignacion({ id: "ord-1024", numGuia: 1024 })]);

    await tecleaYConfirma(user, "1024");

    await vi.waitFor(() => expect(within(filas()[0]).getByText("Recogiendo…")).toBeInTheDocument());
    expect(screen.queryByText("Recibiendo…")).toBeNull();
    await act(async () => soltar());
    await vi.waitFor(() => expect(within(filas()[0]).getByText("Recogida")).toBeInTheDocument());
  });

  it("R831: 1024 dos veces → la segunda dice «Ya recogida», la action se llama una vez y suma a Repetidas", async () => {
    const user = userEvent.setup();
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-1024"] });
    await renderCon(user, [makeAsignacion({ id: "ord-1024", numGuia: 1024 })]);

    await tecleaYConfirma(user, "1024");
    await tecleaYConfirma(user, "1024");

    await vi.waitFor(() => expect(filas()).toHaveLength(2));
    await vi.waitFor(() => expect(within(filas()[1]).getByText("Recogida")).toBeInTheDocument());
    expect(within(filas()[0]).getByText("Ya recogida")).toBeInTheDocument();
    expect(recogerMock).toHaveBeenCalledTimes(1);
    expect(contador("Recogidas")).toBe("Recogidas1");
    expect(contador("Repetidas")).toBe("Repetidas1");
  });

  it("R832: destinatario y tienda de la orden cargada, de la relectura, y «—» si no está entre sus órdenes", async () => {
    const user = userEvent.setup();
    const cargadaAna = makeAsignacion({
      id: "ord-1001",
      numGuia: 1001,
      destinatario: "Ana Quesada Mora",
      tiendaNombre: "Tienda Prueba Norte",
    });
    const nuevaBeto = makeAsignacion({
      id: "ord-2002",
      numGuia: 2002,
      destinatario: "Beto Ruiz",
      tiendaNombre: "Tienda Prueba Sur",
    });
    recogerMock.mockImplementation(async (input) => ({
      status: "ok",
      recogidas: (input as { ordenIds: string[] }).ordenIds,
    }));
    await renderCon(user, [cargadaAna]);
    listarMock.mockResolvedValue(listaVigente([cargadaAna, nuevaBeto]));

    await tecleaYConfirma(user, "1001");
    await tecleaYConfirma(user, "2002");
    await tecleaYConfirma(user, "7777777");

    await vi.waitFor(() =>
      expect(within(filas()[0]).getByText("No está entre tus órdenes")).toBeInTheDocument(),
    );
    expect(within(filas()[2]).getByText(/^Ana Quesada Mora · Tienda Prueba Norte · /)).toBeInTheDocument();
    expect(within(filas()[1]).getByText(/^Beto Ruiz · Tienda Prueba Sur · /)).toBeInTheDocument();
    expect(within(filas()[0]).getByText(/^— · — · /)).toBeInTheDocument();
  });

  it("R599: orden cargada reservada para otro día → «No se pudo recoger» con el aviso y sin llamar a la action", async () => {
    const user = userEvent.setup();
    await renderCon(user, [
      makeAsignacion({
        id: "ord-1024",
        numGuia: 1024,
        esParaManana: true,
        fechaRepartoISO: "2026-12-02",
      }),
    ]);

    await tecleaYConfirma(user, "1024");

    await vi.waitFor(() =>
      expect(within(filas()[0]).getByText("No se pudo recoger")).toBeInTheDocument(),
    );
    expect(
      within(filas()[0]).getByText(
        "Esta orden es para el reparto del 2 de diciembre. Ese día podrás recogerla y gestionarla.",
      ),
    ).toBeInTheDocument();
    expect(recogerMock).not.toHaveBeenCalled();
  });
});

describe("RecogerPaqueteCard — refresco único al cerrar (R598)", () => {
  it("dos éxitos y cerrar: onRecogida una vez, ninguna antes de cerrar", async () => {
    const user = userEvent.setup();
    const onRecogida = vi.fn();
    recogerMock.mockImplementation(async (input) => ({
      status: "ok",
      recogidas: (input as { ordenIds: string[] }).ordenIds,
    }));
    await renderAbierta(user, onRecogida);

    await tecleaYConfirma(user, "1001");
    await tecleaYConfirma(user, "1002");
    await vi.waitFor(() => expect(contador("Recogidas")).toBe("Recogidas2"));
    expect(onRecogida).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    await vi.waitFor(() => expect(onRecogida).toHaveBeenCalledTimes(1));
  });

  it("solo errores y cerrar: onRecogida no se llama", async () => {
    const user = userEvent.setup();
    const onRecogida = vi.fn();
    recogerMock.mockResolvedValue({ status: "forbidden" });
    await renderAbierta(user, onRecogida);

    await tecleaYConfirma(user, "1001");
    await tecleaYConfirma(user, "7777777");
    await vi.waitFor(() =>
      expect(within(filas()[0]).getByText("No está entre tus órdenes")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    await vi.waitFor(() =>
      expect(screen.queryByRole("log", { name: "Lecturas" })).toBeNull(),
    );
    expect(onRecogida).not.toHaveBeenCalled();
  });

  it("dos guías fuera de la lista cargada: la relectura ocurre en cada una (dos llamadas)", async () => {
    const user = userEvent.setup();
    listarMock.mockResolvedValue(listaVigente(porRecoger));
    await renderAbierta(user);

    await tecleaYConfirma(user, "7777777");
    await tecleaYConfirma(user, "8888888");

    await vi.waitFor(() => expect(contador("No encontradas")).toBe("No encontradas2"));
    expect(listarMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------------------
// 2026-07-31 (decisión del humano): la tarjeta vive tras un desplegable, plegada de
// entrada. El motivo no es estético — dentro vive `QrScanner`, y montado significaba la
// cámara ENCENDIDA todo el rato que el mensajero tuviera abierta `/mis-asignaciones`.
// ---------------------------------------------------------------------------------------
describe("RecogerPaqueteCard — el desplegable (cámara apagada por defecto)", () => {
  it("arranca PLEGADA: se ofrece el acceso, pero la cámara no está montada", () => {
    render(<RecogerPaqueteCard porRecoger={porRecoger} onRecogida={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Escanear o escribir guía" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Recoger por número de guía o escaneo" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Escanear con cámara" }),
    ).toBeNull();
    expect(startMock).not.toHaveBeenCalled();
  });

  it("al cerrar, la tarjeta se DESMONTA: es lo que apaga la cámara", async () => {
    const user = userEvent.setup();
    await renderAbierta(user);

    await user.click(screen.getByRole("button", { name: "Escanear con cámara" }));
    await vi.waitFor(() => expect(decodeCallback.current).not.toBeNull());

    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    await vi.waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Recoger por número de guía o escaneo" }),
      ).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: "Cerrar cámara" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Escanear o escribir guía" }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------
// SLT-69 (hotfix 2026-10-30, R2): una guía asignada DESPUÉS de abrir la pantalla no está en la
// lista de la tarjeta; el hook relee la lista vigente y la recoge como cualquier otra.
// ---------------------------------------------------------------------------------------
describe("RecogerPaqueteCard — guía asignada después de abrir la pantalla (SLT-69)", () => {
  it("R2: enviada por teclado, se relee la lista, se recoge y la fila dice «Recogida»", async () => {
    const user = userEvent.setup();
    listarMock.mockResolvedValue(
      listaVigente([
        ...porRecoger,
        makeAsignacion({ id: "ord-nueva", numGuia: 34991060 }),
      ]),
    );
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-nueva"] });
    await renderAbierta(user);

    await tecleaYConfirma(user, "34991060");

    await vi.waitFor(() => expect(within(filas()[0]).getByText("Recogida")).toBeInTheDocument());
    expect(listarMock).toHaveBeenCalledTimes(1);
    expect(recogerMock).toHaveBeenCalledWith({ ordenIds: ["ord-nueva"] });
    sinToasts();
  });
});

// SLT-157 «Guía única leída por cámara o pistola»: los dos caminos leen con `leerGuia`. La
// action recibe el id de la orden de esa guía, así que «mismo numGuia» = misma orden.
describe("RecogerPaqueteCard — guía única por cámara o pistola (SLT-157)", () => {
  const conGuia1024 = [makeAsignacion({ id: "ord-1024", numGuia: 1024 })];

  it("R565: el CODE128 por cámara y la URL del QR tecleada recogen la misma orden", async () => {
    const user = userEvent.setup();
    // `forbidden`: un error no frena la relectura de la misma guía (R585).
    recogerMock.mockResolvedValue({ status: "forbidden" });
    await renderCon(user, conGuia1024);

    await escanear(user, "1024");
    await vi.waitFor(() => expect(recogerMock).toHaveBeenCalledTimes(1));
    expect(recogerMock).toHaveBeenNthCalledWith(1, { ordenIds: ["ord-1024"] });

    await tecleaYConfirma(user, "https://app.ejemplo.test/paquete/1024");
    await vi.waitFor(() => expect(recogerMock).toHaveBeenCalledTimes(2));
    expect(recogerMock).toHaveBeenNthCalledWith(2, { ordenIds: ["ord-1024"] });
  });

  it("R566: lo que no es guía es «Código inválido» por los dos caminos y no llama a la action", async () => {
    const user = userEvent.setup();
    await renderCon(user, conGuia1024);

    await escanear(user, "1024abc");
    await tecleaYConfirma(user, "1024abc");

    await vi.waitFor(() => expect(filas()).toHaveLength(2));
    expect(within(filas()[0]).getByText("Código inválido")).toBeInTheDocument();
    expect(within(filas()[1]).getByText("Código inválido")).toBeInTheDocument();
    expect(recogerMock).not.toHaveBeenCalled();
  });
});

// SLT-158 «Entrada de escaneo para pistola» (R574): la tarjeta encola la segunda lectura y la
// envía en cuanto termina la primera. Si la guarda anti-doble envío de `useRecogerPorGuia`
// volviera a ser ESTADO, esa segunda llamada vería todavía el `procesando` del render previo y
// se descartaría: por eso la guarda es un ref. Este caso es el que se pone rojo si vuelve.
describe("RecogerPaqueteCard — dos lecturas seguidas de la pistola (SLT-158)", () => {
  it("dos Enter seguidos con la primera recogida pendiente: se recogen las DOS, en orden", async () => {
    const user = userEvent.setup();
    let soltarPrimera: () => void = () => {};
    recogerMock
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            soltarPrimera = () => res({ status: "ok", recogidas: ["ord-1"] });
          }),
      )
      .mockResolvedValueOnce({ status: "ok", recogidas: ["ord-2"] });
    await renderAbierta(user);

    await tecleaYConfirma(user, "1001");
    await tecleaYConfirma(user, "1002");
    await vi.waitFor(() => expect(recogerMock).toHaveBeenCalledTimes(1));

    // FUERA de `act` a propósito: así React agenda el render como en el navegador (en otra
    // tarea), y la lectura en cola llega ANTES de ese render, con la clausura del anterior.
    // Dentro de `act` el render se vacía antes y una guarda en estado pasaría en verde.
    soltarPrimera();

    await vi.waitFor(() => expect(recogerMock).toHaveBeenCalledTimes(2));
    expect(recogerMock).toHaveBeenNthCalledWith(1, { ordenIds: ["ord-1"] });
    expect(recogerMock).toHaveBeenNthCalledWith(2, { ordenIds: ["ord-2"] });
  });
});

// SLT-190 «Recoger y Recolección según el canvas» (R867, R869, R870, DS7) — el diálogo de Recoger:
// arriba la barra con «Recoger paquete» y un solo «Cerrar» de 44 px; debajo cámara, «o» y campo, sin
// el icono, un segundo título ni «Escanea o ingresa el número de guía». La sesión de SLT-168 sigue.
describe("SLT-190 — barra del diálogo de Recoger", () => {
  it("R867: barra con el título visible «Recoger paquete» y «Cerrar»; debajo cámara, «o» y campo; sin icono, segundo título ni descripción", async () => {
    const user = userEvent.setup();
    await renderAbierta(user);

    const dialogo = screen.getByRole("dialog", { name: "Recoger paquete" });
    const titulos = within(dialogo).getAllByText("Recoger paquete");
    expect(titulos).toHaveLength(1);
    expect(titulos[0]).not.toHaveClass("sr-only");
    const cerrar = within(dialogo).getByRole("button", { name: "Cerrar" });
    expect(titulos[0].parentElement).toBe(cerrar.parentElement);

    const camara = within(dialogo).getByRole("button", { name: "Escanear con cámara" });
    const campo = within(dialogo).getByLabelText("Número de guía");
    expect(within(dialogo).getByText("o")).toBeInTheDocument();
    for (const debajo of [camara, campo]) {
      expect(titulos[0].compareDocumentPosition(debajo) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    }
    expect(within(dialogo).queryByText("Escanea o ingresa el número de guía")).toBeNull();
    // Un solo encabezado: el de la barra (el título del diálogo).
    expect(within(dialogo).getAllByRole("heading")).toEqual([titulos[0]]);
    expect(dialogo.querySelector("svg.lucide-package-check")).toBeNull();
  });

  // SLT-202 «Escritorio igual a prod: tamaños de controles y un solo botón de recibir» (Carlos, 2026-11-18): 44 px solo en el móvil; en escritorio, el tamaño de prod.
  it("R869: un solo «Cerrar», de 44 × 44 px en el móvil (`max-md:size-11`); al pulsarlo se cierra y la cámara se apaga", async () => {
    const user = userEvent.setup();
    await renderAbierta(user);

    const cerrar = screen.getAllByRole("button", { name: "Cerrar" });
    expect(cerrar).toHaveLength(1);
    expect(cerrar[0].className.split(/\s+/)).toEqual(expect.arrayContaining(["size-7", "max-md:size-11"]));

    await user.click(cerrar[0]);
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Cerrar cámara" })).toBeNull();
  });

  it("R870: conserva el nombre de la región, el botón de envío y la sesión continua (contadores y lecturas)", async () => {
    const user = userEvent.setup();
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-1"] });
    await renderAbierta(user);

    expect(screen.getByRole("region", { name: "Recoger por número de guía o escaneo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recoger" })).toBeInTheDocument();
    await tecleaYConfirma(user, "1001");
    await vi.waitFor(() => expect(contador("Recogidas")).toBe("Recogidas1"));
    expect(within(filas()[0]).getByText("Recogida")).toBeInTheDocument();
  });
});
