// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, act, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Feature 316 (E1) — EL COMPOSER CON ADJUNTO.
//
// Lo que se fija aqui es el ORDEN DE OPERACIONES del navegador, que es contraintuitivo y por
// eso se prueba: normalizar -> clasificar -> validar tamano -> subir (design 2.1). El limite
// de la imagen se mide sobre el RESULTADO de la conversion, no sobre el archivo original;
// esa es la razon por la que una foto de iPhone de 8 MB se puede enviar (R30) y por la que un
// HEIC de 200 KB TAMBIEN tiene que convertirse (R29) aunque "comprimir" no aporte nada.
//
// `comprimirImagen` se MOCKEA a proposito: su propio comportamiento (canvas, EXIF, toBlob nulo)
// esta cubierto en `tests/unit/utils/comprimir-imagen.test.ts`. Aqui lo que se prueba es que el
// composer lo llama con las opciones correctas y que interpreta bien lo que devuelve — incluido
// el caso en que devuelve el ORIGINAL, que es como el helper dice "no pude" (R31).
const listarHiloChatMock = vi.fn();
const enviarMensajeChatMock = vi.fn();
const enviarPlantillaChatMock = vi.fn();
const enviarMediaChatMock = vi.fn();
vi.mock("@/lib/actions/chat-whatsapp", () => ({
  listarHiloChat: (...a: unknown[]) => listarHiloChatMock(...a),
  enviarMensajeChat: (...a: unknown[]) => enviarMensajeChatMock(...a),
  enviarPlantillaChat: (...a: unknown[]) => enviarPlantillaChatMock(...a),
  enviarMediaChat: (...a: unknown[]) => enviarMediaChatMock(...a),
}));

const comprimirImagenMock = vi.fn();
vi.mock("@/lib/utils/comprimir-imagen", () => ({
  comprimirImagen: (...a: unknown[]) => comprimirImagenMock(...a),
}));

const listarPlantillasActivasParaEnvioMock = vi.fn();
vi.mock("@/lib/actions/whatsapp-envio", () => ({
  listarPlantillasActivasParaEnvio: (...a: unknown[]) =>
    listarPlantillasActivasParaEnvioMock(...a),
}));

vi.mock("@/lib/audio/tono-notificacion", () => ({
  reproducirTono: vi.fn(),
  prepararAudio: vi.fn(),
  reiniciarAudioParaTests: vi.fn(),
}));

vi.mock("@/app/(app)/mis-asignaciones/_components/UbicacionMapa", () => ({
  UbicacionMapa: () => null,
}));

// SLT-88 R18: el `mutate` real de SWR absorbe el fallo del fetcher y nunca rechaza, asi que por si
// solo no distingue si la revalidacion quedo dentro del `try` de la accion. Este doble la hace
// rechazar en el unico test que lo activa; en el resto del archivo SWR es el de verdad.
const dobleSwr = vi.hoisted(() => ({
  mutateDelHilo: null as (() => Promise<unknown>) | null,
}));
vi.mock("swr", async (importOriginal) => {
  const real = await importOriginal<typeof import("swr")>();
  const swrReal = real.default as unknown as (...a: unknown[]) => object;
  return {
    ...real,
    default: (...a: unknown[]) => {
      const resultado = swrReal(...a);
      const clave = a[0];
      const esHilo = Array.isArray(clave) && clave[0] === "chat-hilo";
      if (!esHilo || dobleSwr.mutateDelHilo === null) return resultado;
      // Proxy y no spread: SWR registra que campos se leen a traves de getters.
      return new Proxy(resultado, {
        get: (destino, campo) =>
          campo === "mutate" ? dobleSwr.mutateDelHilo : Reflect.get(destino, campo),
      });
    },
  };
});

import { ChatConversacion } from "@/app/(app)/mis-asignaciones/_components/chat/ChatConversacion";
import { MAX_CAPTION } from "@/lib/config/chat-media-envio";
import { okHilo, ORDEN, renderChat } from "./_chat-hilo-harness";

const MB = 1024 * 1024;

/** SLT-88: literal escrito a mano, no la constante del componente. */
const TEXTO_FALLO_ENVIO = "No se pudo enviar. Inténtalo de nuevo";
const NOMBRE_FOTO = "puerta.jpg";

/** `File` de un tamano dado sin reservar los bytes de verdad (una foto de 9 MB en jsdom). */
function archivo(nombre: string, tipo: string, bytes: number): File {
  const file = new File(["x"], nombre, { type: tipo });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

async function montar(textoLibreHabilitado = true): Promise<void> {
  listarHiloChatMock.mockResolvedValue({
    ...okHilo([]),
    textoLibreHabilitado,
  });
  renderChat(<ChatConversacion orden={ORDEN} onVolver={() => {}} />);
  await act(async () => {
    await Promise.resolve();
  });
}

const clip = () => screen.getByRole("button", { name: "Adjuntar" });
const textarea = () =>
  screen.getByLabelText("Mensaje para el destinatario") as HTMLTextAreaElement;
const botonEnviar = () => screen.getByRole("button", { name: "Enviar mensaje" });

async function abrirMenu(): Promise<void> {
  await act(async () => {
    clip().click();
  });
}

/** Elige un archivo por la via "archivo del dispositivo" (la que no abre la camara). */
async function elegir(file: File): Promise<void> {
  await abrirMenu();
  const input = screen.getByLabelText("Elegir un archivo del dispositivo");
  await userEvent.upload(input, file);
  await act(async () => {
    await Promise.resolve();
  });
}

/** Elige un documento por su propia via (su `accept` es el de los cinco MIME de oficina). */
async function elegirDocumento(file: File): Promise<void> {
  await abrirMenu();
  const input = screen.getByLabelText("Elegir un documento");
  await userEvent.upload(input, file);
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Entrega un archivo que el `accept` del input NO habria dejado pasar. No es una trampa del
 * test: `accept` es una SUGERENCIA para el selector del sistema —en Android se puede elegir
 * "cualquier archivo"— y por eso la lista blanca se aplica en el codigo, no en el atributo.
 */
async function elegirSaltandoAccept(file: File): Promise<void> {
  await abrirMenu();
  const input = screen.getByLabelText("Elegir un archivo del dispositivo") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    fireEvent.change(input);
    await Promise.resolve();
  });
}

beforeEach(() => {
  listarHiloChatMock.mockReset();
  enviarMensajeChatMock.mockReset();
  enviarPlantillaChatMock.mockReset();
  enviarMediaChatMock.mockReset();
  enviarMediaChatMock.mockResolvedValue({ status: "ok", mensajeChatId: "m-1" });
  comprimirImagenMock.mockReset();
  comprimirImagenMock.mockImplementation(async (f: File) => f);
  dobleSwr.mutateDelHilo = null;
  listarPlantillasActivasParaEnvioMock.mockReset();
  listarPlantillasActivasParaEnvioMock.mockResolvedValue({ status: "ok", items: [] });
  URL.createObjectURL = vi.fn(() => "blob:adjunto-1");
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

describe("Composer con adjunto (E1)", () => {
  it("R1: el clip ofrece las CUATRO vias de adjuntar, cada una con nombre accesible", async () => {
    await montar();

    await abrirMenu();

    const vias = screen.getAllByRole("menuitem", {
      name: /cámara|archivo|nota de voz|documento/i,
    });
    expect(vias).toHaveLength(4);
    // D8/R10: el tope del video se dice ANTES de abrir la camara, no con el video ya grabado.
    // SLT-88 R9: ese tope ya es el del transporte.
    expect(screen.getByText("El vídeo no puede pasar de 4 MB.")).toBeInTheDocument();
    expect(screen.getByText(/4 MB/)).toBeInTheDocument();
    expect(screen.queryByText(/16 MB/)).not.toBeInTheDocument();
  });

  it("R2: sin texto libre habilitado el clip esta deshabilitado y se explica por que", async () => {
    await montar(false);

    expect(clip()).toBeDisabled();
    expect(
      screen.getByText(
        /Tampoco puedes enviar fotos, vídeos, notas de voz ni documentos hasta que el cliente responda/i,
      ),
    ).toBeInTheDocument();
  });

  it("R4: el adjunto se ve antes de enviarlo y 'Quitar adjunto' lo retira sin enviar nada", async () => {
    await montar();

    await elegir(archivo("puerta.jpg", "image/jpeg", 200 * 1024));

    expect(screen.getByText("puerta.jpg")).toBeInTheDocument();
    const quitar = screen.getByRole("button", { name: "Quitar adjunto" });

    await act(async () => {
      quitar.click();
    });

    expect(screen.queryByText("puerta.jpg")).not.toBeInTheDocument();
    expect(enviarMediaChatMock).not.toHaveBeenCalled();
    // El object URL de la previsualizacion no queda retenido.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:adjunto-1");
  });

  it("R5: con adjunto y texto sale UN SOLO mensaje, con el texto como pie", async () => {
    await montar();
    await elegir(archivo("puerta.jpg", "image/jpeg", 200 * 1024));

    await userEvent.type(textarea(), "La puerta azul");
    await act(async () => {
      botonEnviar().click();
    });

    expect(enviarMediaChatMock).toHaveBeenCalledTimes(1);
    const fd = enviarMediaChatMock.mock.calls[0][0] as FormData;
    expect(fd.get("caption")).toBe("La puerta azul");
    expect(fd.get("ordenId")).toBe(ORDEN.id);
    expect((fd.get("archivo") as File).name).toBe("puerta.jpg");
    // R5: NUNCA los dos caminos. El pie no viaja ademas como mensaje de texto suelto.
    expect(enviarMensajeChatMock).not.toHaveBeenCalled();
  });

  it("R7: con el envio en vuelo, un segundo click y un Enter no mandan el adjunto dos veces", async () => {
    await montar();
    let resolver: (v: unknown) => void = () => {};
    enviarMediaChatMock.mockReturnValue(
      new Promise((res) => {
        resolver = res;
      }),
    );
    await elegir(archivo("puerta.jpg", "image/jpeg", 200 * 1024));

    await act(async () => {
      botonEnviar().click();
      botonEnviar().click();
    });
    await userEvent.type(textarea(), "{Enter}");

    expect(enviarMediaChatMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolver({ status: "ok", mensajeChatId: "m-1" });
      await Promise.resolve();
    });
  });

  it("R12: con adjunto el composer baja su tope al maximo de un pie de adjunto", async () => {
    await montar();

    expect(textarea()).toHaveAttribute("maxlength", "4096");

    await elegir(archivo("puerta.jpg", "image/jpeg", 200 * 1024));

    expect(textarea()).toHaveAttribute("maxlength", String(MAX_CAPTION));
  });

  it("R29: un HEIC de iPhone se sube convertido a JPEG y el ORIGINAL no se sube", async () => {
    await montar();
    comprimirImagenMock.mockResolvedValue(archivo("foto.jpg", "image/jpeg", 900 * 1024));

    await elegir(archivo("foto.heic", "image/heic", 3 * MB));
    await act(async () => {
      botonEnviar().click();
    });

    const fd = enviarMediaChatMock.mock.calls[0][0] as FormData;
    expect((fd.get("archivo") as File).type).toBe("image/jpeg");
    expect((fd.get("archivo") as File).type).not.toBe("image/heic");
  });

  it("R29: un HEIC PEQUENO tambien se convierte — el atajo por tamano se apaga a mano", async () => {
    await montar();
    comprimirImagenMock.mockResolvedValue(archivo("foto.jpg", "image/jpeg", 180 * 1024));

    await elegir(archivo("foto.heic", "image/heic", 200 * 1024));
    await act(async () => {
      botonEnviar().click();
    });

    expect(comprimirImagenMock).toHaveBeenCalledTimes(1);
    const opciones = comprimirImagenMock.mock.calls[0][1] as Record<string, unknown>;
    expect(opciones.saltarSiMenorA).toBe(0);
    expect(opciones.devolverOriginalSiMayor).toBe(false);
    const fd = enviarMediaChatMock.mock.calls[0][0] as FormData;
    expect((fd.get("archivo") as File).type).toBe("image/jpeg");
  });

  it("R30: una foto de 8 MB que al convertir pesa 1 MB SI se envia (el limite mira el resultado)", async () => {
    await montar();
    comprimirImagenMock.mockResolvedValue(archivo("foto.jpg", "image/jpeg", 1 * MB));

    await elegir(archivo("foto.heic", "image/heic", 8 * MB));
    await act(async () => {
      botonEnviar().click();
    });

    expect(enviarMediaChatMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("R32: un JPEG de 9 MB se normaliza y se envia si queda por debajo del limite", async () => {
    await montar();
    comprimirImagenMock.mockResolvedValue(archivo("grande.jpg", "image/jpeg", 1 * MB));

    await elegir(archivo("grande.jpg", "image/jpeg", 9 * MB));
    await act(async () => {
      botonEnviar().click();
    });

    expect(comprimirImagenMock).toHaveBeenCalledTimes(1);
    expect(enviarMediaChatMock).toHaveBeenCalledTimes(1);
  });

  it("R31: si la conversion no se pudo completar, el aviso es propio y NO el de tipo no permitido", async () => {
    await montar();
    // El helper NUNCA lanza: cuando no puede, devuelve el ORIGINAL. Asi se detecta.
    comprimirImagenMock.mockImplementation(async (f: File) => f);

    await elegir(archivo("foto.heic", "image/heic", 3 * MB));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(/No se pudo preparar la foto/i);
    expect(aviso).not.toHaveTextContent(/no se puede enviar por WhatsApp/i);
    expect(enviarMediaChatMock).not.toHaveBeenCalled();
  });

  it("R9: un tipo que no es imagen y no esta en la lista blanca se rechaza con OTRO texto", async () => {
    await montar();

    await elegirSaltandoAccept(archivo("virus.exe", "application/x-msdownload", 1024));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(/no se puede enviar por WhatsApp/i);
    expect(aviso).not.toHaveTextContent(/No se pudo preparar la foto/i);
    // R29 aplica SOLO a imagenes: un ejecutable no pasa por el canvas.
    expect(comprimirImagenMock).not.toHaveBeenCalled();
    expect(enviarMediaChatMock).not.toHaveBeenCalled();
  });

  it("un documento valido no se toca: ni se convierte ni pierde su nombre", async () => {
    await montar();

    await elegirDocumento(archivo("factura-882.pdf", "application/pdf", 2 * MB));
    await act(async () => {
      botonEnviar().click();
    });

    expect(comprimirImagenMock).not.toHaveBeenCalled();
    const fd = enviarMediaChatMock.mock.calls[0][0] as FormData;
    expect((fd.get("archivo") as File).name).toBe("factura-882.pdf");
  });

  it("R19: si el envio falla, el adjunto SIGUE en el composer para reintentar", async () => {
    await montar();
    enviarMediaChatMock.mockResolvedValue({ status: "fallo_subida" });

    await elegir(archivo("puerta.jpg", "image/jpeg", 200 * 1024));
    await act(async () => {
      botonEnviar().click();
    });

    await waitFor(() => {
      expect(screen.getByText("puerta.jpg")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Quitar adjunto" })).toBeInTheDocument();
    // SLT-88 R13: `fallo_subida` se arregla reintentando, y lo dice con el texto comun.
    await verToast(TEXTO_FALLO_ENVIO);
    expect(screen.queryByText(/No se pudo subir/)).not.toBeInTheDocument();
  });

  it("R22: tras el ok el adjunto se limpia y el hilo se revalida (sin recargar)", async () => {
    await montar();

    await elegir(archivo("puerta.jpg", "image/jpeg", 200 * 1024));
    const llamadasIniciales = listarHiloChatMock.mock.calls.length;
    await act(async () => {
      botonEnviar().click();
    });

    await waitFor(() => {
      expect(screen.queryByText("puerta.jpg")).not.toBeInTheDocument();
    });
    expect(listarHiloChatMock.mock.calls.length).toBeGreaterThan(llamadasIniciales);
  });

  it("las cuatro vias siguen ahi tras cerrar y reabrir el menu", async () => {
    await montar();

    await abrirMenu();
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(4);
    await abrirMenu();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

/**
 * Un toast de error: Base UI repite su titulo para anunciarlo con prioridad alta, y por eso el
 * mismo texto aparece mas de una vez en el DOM sin que haya dos toasts.
 */
async function verToast(texto: string): Promise<void> {
  await screen.findAllByText(texto);
}

/** Pulsa enviar y deja resolver lo que dispare. */
async function enviar(): Promise<void> {
  await act(async () => {
    botonEnviar().click();
  });
}

/** Foto valida en el composer, con pie: lo que un fallo de envio tiene que conservar. */
async function fotoConPie(): Promise<File> {
  const foto = archivo(NOMBRE_FOTO, "image/jpeg", 200 * 1024);
  await elegir(foto);
  await userEvent.type(textarea(), "La puerta azul");
  return foto;
}

function expectAdjuntoYPieConservados(): void {
  expect(screen.getByText(NOMBRE_FOTO)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Quitar adjunto" })).toBeInTheDocument();
  expect(textarea()).toHaveValue("La puerta azul");
}

describe("SLT-88: preparar el archivo", () => {
  it("R1: un JPEG de 4 MB + 1 byte se comprime y lo que viaja es el RESULTADO", async () => {
    await montar();
    const original = archivo("grande.jpg", "image/jpeg", 4_194_305);
    const resultado = archivo("grande.jpg", "image/jpeg", 900 * 1024);
    comprimirImagenMock.mockResolvedValue(resultado);

    await elegir(original);
    await enviar();

    expect(comprimirImagenMock).toHaveBeenCalledTimes(1);
    expect(comprimirImagenMock.mock.calls[0][0]).toBe(original);
    const fd = enviarMediaChatMock.mock.calls[0][0] as FormData;
    expect(fd.get("archivo")).toBe(resultado);
  });

  it.each([
    ["JPEG", "foto.jpg", "image/jpeg"],
    ["PNG", "foto.png", "image/png"],
  ])("R2: un %s de 4 MB exactos no se comprime y viaja tal cual", async (_c, nombre, mime) => {
    await montar();
    const original = archivo(nombre, mime, 4_194_304);

    await elegir(original);
    await enviar();

    expect(comprimirImagenMock).not.toHaveBeenCalled();
    const fd = enviarMediaChatMock.mock.calls[0][0] as FormData;
    expect(fd.get("archivo")).toBe(original);
  });

  it.each([
    ["el resultado sigue en 7 MB", async () => archivo("grande.jpg", "image/jpeg", 7 * MB)],
    ["la compresion devolvio el original de 9 MB", async (f: File) => f],
    ["el resultado queda 1 byte por encima", async () => archivo("grande.jpg", "image/jpeg", 4_194_305)],
  ])("R3: si %s, avisa, no queda en el composer y no se sube", async (_c, comprimir) => {
    await montar();
    comprimirImagenMock.mockImplementation(comprimir);

    await elegir(archivo("grande.jpg", "image/jpeg", 9 * MB));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^No se pudo reducir la foto a 4 MB\. Vuelve a tomarla o elige otra imagen\.$/,
    );
    expect(screen.queryByRole("button", { name: "Quitar adjunto" })).not.toBeInTheDocument();
    expect(enviarMediaChatMock).not.toHaveBeenCalled();
  });

  it("R4: si preparar lanza, avisa y deja de decir «Preparando la foto…»", async () => {
    await montar();
    let fallar: (e: Error) => void = () => {};
    comprimirImagenMock.mockReturnValue(
      new Promise((_res, rej) => {
        fallar = rej;
      }),
    );

    await elegir(archivo("grande.jpg", "image/jpeg", 9 * MB));
    expect(screen.getByText("Preparando la foto…")).toBeInTheDocument();

    await act(async () => {
      fallar(new Error("sin memoria"));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^No se pudo preparar el archivo\. Inténtalo de nuevo\.$/,
    );
    expect(screen.queryByText("Preparando la foto…")).not.toBeInTheDocument();
    expect(enviarMediaChatMock).not.toHaveBeenCalled();
  });

  it.each([
    ["video", "clip.mp4", "video/mp4"],
    ["audio", "audio.mp3", "audio/mpeg"],
    ["PDF", "factura.pdf", "application/pdf"],
  ])("R7: un %s de 5 MB se rechaza sin comprimir ni dejarlo en el composer", async (_c, nombre, mime) => {
    await montar();

    await elegirSaltandoAccept(archivo(nombre, mime, 5 * MB));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^Ese archivo supera el límite de 4 MB\. Elige uno más pequeño\.$/,
    );
    expect(comprimirImagenMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Quitar adjunto" })).not.toBeInTheDocument();
    expect(enviarMediaChatMock).not.toHaveBeenCalled();
  });

  it("R5/R7: un PDF de 4 MB exactos SI queda en el composer", async () => {
    await montar();

    await elegirDocumento(archivo("factura.pdf", "application/pdf", 4_194_304));

    expect(screen.getByText("factura.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    [4_194_304, "Ese archivo supera el límite de 4 MB. Elige uno más pequeño."],
    [3 * MB, "Ese archivo supera el límite de 3 MB. Elige uno más pequeño."],
  ])("R10: `demasiado_grande` del servidor (%i) avisa con SU limite y conserva el adjunto", async (limiteBytes, texto) => {
    await montar();
    enviarMediaChatMock.mockResolvedValue({ status: "demasiado_grande", limiteBytes });

    await fotoConPie();
    await enviar();

    await verToast(texto);
    expectAdjuntoYPieConservados();
  });
});

describe("SLT-88: fallo de envio", () => {
  it.each([
    ["rechaza su promesa", () => enviarMediaChatMock.mockRejectedValue(new Error("413"))],
    ["resuelve sin resultado", () => enviarMediaChatMock.mockResolvedValue(undefined)],
  ])("R12: si la accion %s, avisa y conserva adjunto y pie", async (_c, prepararFallo) => {
    await montar();
    prepararFallo();

    await fotoConPie();
    await enviar();

    await verToast(TEXTO_FALLO_ENVIO);
    expect(enviarMediaChatMock).toHaveBeenCalledTimes(1);
    expectAdjuntoYPieConservados();
  });

  it.each([
    [{ status: "fuera_ventana" }, "La ventana de 24 h expiró. Envía una plantilla."],
    [{ status: "tipo_no_permitido" }, "Ese tipo de archivo no se puede enviar por WhatsApp."],
    [{ status: "caption_largo", maximo: 1024 }, "El pie no puede pasar de 1024 caracteres."],
    [
      { status: "permanente", mensajeChatId: "m-1", detalle: "Número inválido" },
      "WhatsApp rechazó el envío: Número inválido",
    ],
    [{ status: "no_configurado" }, "El envío por WhatsApp no está configurado."],
    [{ status: "forbidden" }, "No puedes responder este chat."],
    [{ status: "unauthenticated" }, "Tu sesión expiró. Vuelve a entrar."],
  ])("R14: %j conserva su aviso propio y el adjunto", async (resultado, texto) => {
    await montar();
    enviarMediaChatMock.mockResolvedValue(resultado);

    await fotoConPie();
    await enviar();

    await verToast(texto);
    expect(screen.queryByText(TEXTO_FALLO_ENVIO)).not.toBeInTheDocument();
    expectAdjuntoYPieConservados();
  });

  it.each([
    ["rechaza su promesa", () => enviarMensajeChatMock.mockRejectedValue(new Error("red"))],
    ["resuelve sin resultado", () => enviarMensajeChatMock.mockResolvedValue(undefined)],
  ])("R15: si `enviarMensajeChat` %s, avisa y conserva el borrador", async (_c, prepararFallo) => {
    await montar();
    prepararFallo();

    await userEvent.type(textarea(), "Voy en camino");
    await enviar();

    await verToast(TEXTO_FALLO_ENVIO);
    expect(enviarMensajeChatMock).toHaveBeenCalledTimes(1);
    expect(textarea()).toHaveValue("Voy en camino");
  });

  it.each([
    ["rechaza su promesa", () => enviarPlantillaChatMock.mockRejectedValue(new Error("red"))],
    ["resuelve sin resultado", () => enviarPlantillaChatMock.mockResolvedValue(undefined)],
  ])("R15: si `enviarPlantillaChat` %s, avisa y conserva el borrador", async (_c, prepararFallo) => {
    listarPlantillasActivasParaEnvioMock.mockResolvedValue({
      status: "ok",
      items: [
        { id: "pl-1", nombre: "aviso_entrega", cuerpo: "Tu paquete llega hoy.", variables: [] },
      ],
    });
    await montar(false);
    prepararFallo();

    const chip = await screen.findByRole("button", { name: "Aviso Entrega" });
    await act(async () => {
      chip.click();
    });
    await enviar();

    await verToast(TEXTO_FALLO_ENVIO);
    expect(enviarPlantillaChatMock).toHaveBeenCalledWith("orden-1", "pl-1");
    expect(textarea()).toHaveValue("Tu paquete llega hoy.");
  });

  it("R16: con el envio en vuelo, dos clicks y un Enter hacen UNA llamada, y el rechazo suelta el boton", async () => {
    await montar();
    let rechazar: (e: Error) => void = () => {};
    enviarMediaChatMock.mockReturnValue(
      new Promise((_res, rej) => {
        rechazar = rej;
      }),
    );
    await fotoConPie();

    // En el mismo tick: `enviando` aun no se ha pintado, el unico freno es la ref.
    await act(async () => {
      botonEnviar().click();
      botonEnviar().click();
      fireEvent.keyDown(textarea(), { key: "Enter" });
    });

    expect(enviarMediaChatMock).toHaveBeenCalledTimes(1);
    expect(botonEnviar()).toBeDisabled();

    await act(async () => {
      rechazar(new Error("413"));
    });

    await verToast(TEXTO_FALLO_ENVIO);
    expect(enviarMediaChatMock).toHaveBeenCalledTimes(1);
    expect(botonEnviar()).toBeEnabled();
  });

  it("R17: tras un rechazo, reintentar hace otra llamada con el mismo archivo y pie; el ok limpia", async () => {
    await montar();
    enviarMediaChatMock.mockRejectedValueOnce(new Error("413"));
    const foto = await fotoConPie();

    await enviar();
    await verToast(TEXTO_FALLO_ENVIO);
    expectAdjuntoYPieConservados();

    await enviar();

    expect(enviarMediaChatMock).toHaveBeenCalledTimes(2);
    for (const [fd] of enviarMediaChatMock.mock.calls as [FormData][]) {
      expect(fd.get("archivo")).toBe(foto);
      expect(fd.get("caption")).toBe("La puerta azul");
    }
    await waitFor(() => {
      expect(screen.queryByText(NOMBRE_FOTO)).not.toBeInTheDocument();
    });
    expect(textarea()).toHaveValue("");
  });

  it("R18: `ok` con el fetcher del hilo fallando: ni aviso de fallo ni adjunto (SWR real)", async () => {
    await montar();
    await fotoConPie();
    const llamadasPrevias = listarHiloChatMock.mock.calls.length;
    listarHiloChatMock.mockRejectedValue(new Error("revalidacion"));

    await enviar();

    await waitFor(() => {
      expect(listarHiloChatMock.mock.calls.length).toBeGreaterThan(llamadasPrevias);
    });
    await waitFor(() => {
      expect(screen.queryByText(NOMBRE_FOTO)).not.toBeInTheDocument();
    });
    expect(screen.queryByText(TEXTO_FALLO_ENVIO)).not.toBeInTheDocument();
  });

  it("R18: `ok` con `mutate` rechazando: ni aviso de fallo ni adjunto (doble)", async () => {
    // El rechazo sube por `void enviar()` sin que nadie lo espere, y vitest lo contaria como error
    // de la corrida. Se recoge solo durante este test: lo que se afirma es lo que ve el mensajero.
    const oyentes = process.listeners("unhandledRejection");
    process.removeAllListeners("unhandledRejection");
    const ignorar = () => {};
    process.on("unhandledRejection", ignorar);
    try {
      const mutateQueFalla = vi.fn(() => Promise.reject(new Error("revalidacion")));
      dobleSwr.mutateDelHilo = mutateQueFalla;
      await montar();
      await fotoConPie();

      await enviar();
      await act(async () => {
        await new Promise((resolver) => setTimeout(resolver, 0));
      });

      expect(mutateQueFalla).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(TEXTO_FALLO_ENVIO)).not.toBeInTheDocument();
      expect(screen.queryByText(NOMBRE_FOTO)).not.toBeInTheDocument();
    } finally {
      process.off("unhandledRejection", ignorar);
      for (const oyente of oyentes) process.on("unhandledRejection", oyente);
    }
  });
});
