// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReporteBugBoton } from "@/components/shared/ReporteBugBoton";
import { enviarReporteBugAction, prepararSubidaImagenesReporteAction } from "@/lib/actions/reporte-bug";

/**
 * SLT-87 (T7, T8; R3–R10) — el botón «Reportar un problema», su panel y el borrador.
 *
 * Lo del servidor (sesión, validación, quién reporta, correo) vive en los tests de la action y del
 * servicio. Aquí, lo que solo se ve montando el componente. Los textos esperados son LITERALES escritos
 * a mano (design §8.4), nunca leídos de la constante que los pinta.
 */

vi.mock("@/lib/actions/reporte-bug", () => ({
  enviarReporteBugAction: vi.fn(),
  prepararSubidaImagenesReporteAction: vi.fn(),
}));

const { rutaMock } = vi.hoisted(() => ({ rutaMock: vi.fn(() => "/dashboard") }));
vi.mock("next/navigation", () => ({ usePathname: () => rutaMock() }));

const action = vi.mocked(enviarReporteBugAction);
const permisosAction = vi.mocked(prepararSubidaImagenesReporteAction);
const fetchMock = vi.fn();
const crearVista = vi.fn<(archivo: Blob) => string>();
const revocarVista = vi.fn<(url: string) => void>();
const USUARIO = "usuario-a";
const CLAVE = `servi:reporte-bug:borrador:${USUARIO}`;

beforeEach(() => {
  window.localStorage.clear();
  action.mockReset();
  permisosAction.mockReset();
  fetchMock.mockReset();
  rutaMock.mockReturnValue("/dashboard");
  // SLT-98: jsdom no trae object URLs; cada vista previa es `blob:vista-<n>`, en orden de creación.
  let n = 0;
  crearVista.mockReset().mockImplementation(() => `blob:vista-${++n}`);
  revocarVista.mockReset();
  URL.createObjectURL = crearVista;
  URL.revokeObjectURL = revocarVista;
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function botonFlotante() {
  return screen.getByRole("button", { name: "Reportar un problema" });
}

async function abrir(usuarioId = USUARIO) {
  const user = userEvent.setup();
  const vista = render(<ReporteBugBoton usuarioId={usuarioId} />);
  await user.click(botonFlotante());
  return { user, ...vista };
}

function campo() {
  return screen.getByRole("textbox", { name: "Describe el problema" });
}

/** Escribe de golpe: teclear 500 caracteres uno a uno con `userEvent` es lento y no prueba nada más. */
function escribir(texto: string) {
  fireEvent.change(campo(), { target: { value: texto } });
}

describe("R3 — la posición del botón", () => {
  it("en `/mis-asignaciones` y sus subrutas se apila encima del chat; en el resto va en la esquina", () => {
    const casos: [string, "sobre-chat" | "esquina"][] = [
      ["/mis-asignaciones", "sobre-chat"],
      ["/mis-asignaciones/reparto", "sobre-chat"],
      ["/mis-asignaciones/recoger", "sobre-chat"],
      ["/dashboard", "esquina"],
      ["/ordenes", "esquina"],
      // Un prefijo que no es la ruta no cuenta: no hay chat ahí.
      ["/mis-asignaciones-viejas", "esquina"],
    ];
    for (const [ruta, posicion] of casos) {
      rutaMock.mockReturnValue(ruta);
      const { unmount } = render(<ReporteBugBoton usuarioId={USUARIO} />);
      const boton = botonFlotante();
      expect(boton.getAttribute("data-posicion"), ruta).toBe(posicion);
      // El chat ocupa `bottom-5` con 56 px; encima de él, `bottom-24` no se solapa.
      expect(boton.className.split(" "), ruta).toContain(posicion === "sobre-chat" ? "bottom-24" : "bottom-5");
      unmount();
    }
  });
});

describe("R4 — el panel", () => {
  // SLT-98 «Reporte de bugs: imágenes» (R1; specs/SLT-98-reporte-bugs-imagenes) sustituye la viñeta «sin
  // campo de archivos» de este R4: el panel ya adjunta imágenes, y lo prueban los casos de SLT-98 abajo.
  it("abre un panel con descripción, Enviar y Descartar", async () => {
    await abrir();
    const panel = screen.getByRole("dialog", { name: "Reportar un problema" });
    expect(panel).toBeTruthy();
    expect(campo()).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Descartar" })).toBeTruthy();
    expect(botonFlotante().getAttribute("aria-expanded")).toBe("true");
  });

  it('el contador muestra exactamente "0/500" vacío, "120/500" con 120 caracteres y "500/500" en el máximo, y el campo no admite el carácter 501', async () => {
    await abrir();
    expect(screen.getByText("0/500")).toBeTruthy();
    escribir("a".repeat(120));
    expect(screen.getByText("120/500")).toBeTruthy();
    escribir("b".repeat(500));
    expect(screen.getByText("500/500")).toBeTruthy();
    expect(campo().getAttribute("maxLength") ?? campo().getAttribute("maxlength")).toBe("500");
    // El navegador corta al teclear: con el campo lleno, una tecla más no entra.
    const user = userEvent.setup();
    await user.type(campo(), "c");
    expect((campo() as HTMLTextAreaElement).value).toHaveLength(500);
    expect(screen.getByText("500/500")).toBeTruthy();
  });

  it("Escape y el botón de cerrar lo cierran sin tocar el borrador", async () => {
    const { user } = await abrir();
    escribir("se cae al guardar");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(botonFlotante());
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.localStorage.getItem(CLAVE)).toBe("se cae al guardar");
  });

  // Review M4: Escape cierra aunque el foco esté fuera del panel, solo mientras está abierto, y respeta
  // un Escape que ya consumió otro.
  it("Escape lo cierra con el foco fuera del panel, sin tocar el borrador ni robar el foco", async () => {
    const user = userEvent.setup();
    render(
      <>
        <input aria-label="Otro campo de la página" />
        <ReporteBugBoton usuarioId={USUARIO} />
      </>,
    );
    await user.click(botonFlotante());
    escribir("no guarda la zona");
    const otro = screen.getByRole("textbox", { name: "Otro campo de la página" });
    otro.focus();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(false);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(botonFlotante().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(otro);
    expect(window.localStorage.getItem(CLAVE)).toBe("no guarda la zona");
  });

  it("un Escape ya consumido (`defaultPrevented`) no lo cierra, y cerrado no escucha", async () => {
    const consumir = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    const quitar = vi.spyOn(document, "removeEventListener");
    const { user } = await abrir();
    document.addEventListener("keydown", consumir, { capture: true });
    try {
      await user.keyboard("{Escape}");
      expect(screen.getByRole("dialog")).toBeTruthy();
    } finally {
      document.removeEventListener("keydown", consumir, { capture: true });
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    // Al cerrar, el listener del panel se quita.
    expect(quitar.mock.calls.some(([tipo, fn]) => tipo === "keydown" && fn !== consumir)).toBe(true);
    quitar.mockRestore();
  });
});

describe("R5 — Enviar deshabilitado", () => {
  it("Enviar está deshabilitado con la descripción vacía o solo con espacios", async () => {
    await abrir();
    const enviar = () => screen.getByRole("button", { name: "Enviar" }) as HTMLButtonElement;
    expect(enviar().disabled).toBe(true);
    escribir("   \n  ");
    expect(enviar().disabled).toBe(true);
    escribir("  algo  ");
    expect(enviar().disabled).toBe(false);
  });
});

describe("R6–R8 — el borrador", () => {
  it("el texto sobrevive a cerrar el panel y a montar de nuevo el componente", async () => {
    const { user, unmount } = await abrir();
    escribir("no carga el mapa");
    expect(window.localStorage.getItem(CLAVE)).toBe("no carga el mapa");
    await user.click(botonFlotante());
    await user.click(botonFlotante());
    expect((campo() as HTMLTextAreaElement).value).toBe("no carga el mapa");
    unmount();

    await abrir();
    expect((campo() as HTMLTextAreaElement).value).toBe("no carga el mapa");
  });

  it("el borrador de un usuario no aparece con otro usuarioId", async () => {
    const { unmount } = await abrir("usuario-a");
    escribir("borrador de A");
    unmount();

    await abrir("usuario-b");
    expect((campo() as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByText("0/500")).toBeTruthy();
    expect(window.localStorage.getItem("servi:reporte-bug:borrador:usuario-a")).toBe("borrador de A");
  });

  it("Descartar borra el borrador y no llama a la action", async () => {
    const { user } = await abrir();
    escribir("lo pienso mejor");
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect((campo() as HTMLTextAreaElement).value).toBe("");
    expect(window.localStorage.getItem(CLAVE)).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("sin localStorage el panel sigue funcionando en memoria", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cuota", "QuotaExceededError");
    });
    try {
      // Otro usuario: la copia en memoria vive en el módulo y no debe mezclarse con los demás casos.
      await abrir("usuario-sin-almacenamiento");
      escribir("sin almacenamiento");
      expect((campo() as HTMLTextAreaElement).value).toBe("sin almacenamiento");
      expect(screen.getByText("18/500")).toBeTruthy();
    } finally {
      setItem.mockRestore();
    }
  });
});

describe("R9, R10 — el envío", () => {
  it("tras enviar muestra Gracias, vacía el panel y borra el borrador", async () => {
    action.mockResolvedValue({ status: "enviado" });
    const { user } = await abrir();
    escribir("  el botón de guardar no responde  ");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByText("Gracias, recibimos tu reporte")).toBeTruthy();
    expect((campo() as HTMLTextAreaElement).value).toBe("");
    expect(window.localStorage.getItem(CLAVE)).toBeNull();
    expect(screen.getByText("0/500")).toBeTruthy();

    expect(action).toHaveBeenCalledTimes(1);
    const entrada = action.mock.calls[0][0] as Record<string, unknown>;
    // Solo el contrato: la ruta sin query, la ventana y el modo. Quién reporta lo pone el servidor.
    expect(Object.keys(entrada).sort()).toEqual(["appInstalada", "descripcion", "pagina", "ventana"]);
    expect(entrada.descripcion).toBe("  el botón de guardar no responde  ");
    expect(entrada.pagina).toBe(window.location.pathname);
    expect(entrada.ventana).toEqual({ ancho: window.innerWidth, alto: window.innerHeight });
    expect(entrada.appInstalada).toBe(false);

    // Al volver a escribir, el «Gracias» se va.
    escribir("otro");
    expect(screen.queryByText("Gracias, recibimos tu reporte")).toBeNull();
  });

  // Review M3: el aviso es de esa apertura. Al cerrar y reabrir, el panel vuelve al formulario vacío.
  it("cerrar y reabrir tras un envío bueno muestra el formulario vacío, sin «Gracias»", async () => {
    action.mockResolvedValue({ status: "enviado" });
    const { user } = await abrir();
    escribir("el mapa no carga");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("Gracias, recibimos tu reporte")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await user.click(botonFlotante());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText("Gracias, recibimos tu reporte")).toBeNull();
    expect((campo() as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByText("0/500")).toBeTruthy();

    // Lo mismo cerrando con Escape.
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await user.click(botonFlotante());
    escribir("otro fallo");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("Gracias, recibimos tu reporte")).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(botonFlotante());
    expect(screen.queryByText("Gracias, recibimos tu reporte")).toBeNull();
  });

  it("si la action responde error, avisa y conserva el texto", async () => {
    for (const respuesta of [
      { status: "error" as const },
      { status: "forbidden" as const },
      { status: "unauthenticated" as const },
      { status: "validation_error" as const, fieldErrors: { descripcion: ["x"] } },
    ]) {
      action.mockReset();
      action.mockResolvedValue(respuesta);
      const { user, unmount } = await abrir();
      escribir("falla la impresión de etiquetas");
      await user.click(screen.getByRole("button", { name: "Enviar" }));

      expect(await screen.findByText("No pudimos enviar tu reporte. Inténtalo de nuevo."), respuesta.status).toBeTruthy();
      expect((campo() as HTMLTextAreaElement).value).toBe("falla la impresión de etiquetas");
      expect(window.localStorage.getItem(CLAVE)).toBe("falla la impresión de etiquetas");
      expect(screen.queryByText("Gracias, recibimos tu reporte")).toBeNull();
      unmount();
      window.localStorage.clear();
    }
  });

  it("si la llamada se cae (red), avisa igual y conserva el texto", async () => {
    action.mockRejectedValue(new Error("red caída"));
    const { user } = await abrir();
    escribir("no abre el chat");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(screen.getByText("No pudimos enviar tu reporte. Inténtalo de nuevo.")).toBeTruthy());
    expect((campo() as HTMLTextAreaElement).value).toBe("no abre el chat");
  });
});

// ── SLT-98 «Reporte de bugs: imágenes» (T9; R1–R8, R11) ─────────────────────────────────────────────
// Las actions y `fetch` son dobles: aquí se prueba el panel y el orden de los tres pasos de design §4.2.

const ID_1 = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-8222-222222222222";
const ID_3 = "33333333-3333-4333-8333-333333333333";
const URL_1 = "https://almacen.test/subir/1";
const URL_2 = "https://almacen.test/subir/2";
const URL_3 = "https://almacen.test/subir/3";

function archivo(nombre: string, tipo: string, bytes = 8): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

/** Un archivo con el `size` que haga falta, sin reservar los megas. */
function archivoDeTamano(nombre: string, tipo: string, size: number): File {
  const f = archivo(nombre, tipo, 1);
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function inputArchivos(): HTMLInputElement {
  return screen.getByLabelText("Elegir imágenes del reporte") as HTMLInputElement;
}

function elegir(...archivos: File[]) {
  fireEvent.change(inputArchivos(), { target: { files: archivos } });
}

function botonEnviar(): HTMLButtonElement {
  return screen.getByRole("button", { name: /^(Enviar|Subiendo imágenes…)$/ }) as HTMLButtonElement;
}

function agregar(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Agregar imágenes" }) as HTMLButtonElement;
}

function listas(...permisos: [string, string][]) {
  return { status: "listas" as const, permisos: permisos.map(([imagenId, url]) => ({ imagenId, url })) };
}

function cuerpoDelPut(n: number): unknown {
  return (fetchMock.mock.calls[n][1] as RequestInit).body;
}

const OK = { ok: true, status: 200 } as Response;
const FALLO_500 = { ok: false, status: 500 } as Response;

describe("SLT-98 R1 — la sección de imágenes", () => {
  it("el panel muestra «Imágenes (opcional, máximo 5)», «Agregar imágenes» y «0/5 imágenes · PNG, JPG o WebP · hasta 5 MB cada una»", async () => {
    await abrir();
    expect(screen.getByRole("region", { name: "Imágenes (opcional, máximo 5)" })).toBeTruthy();
    expect(agregar().disabled).toBe(false);
    expect(screen.getByText("0/5 imágenes")).toBeTruthy();
    const ayuda = screen.getByText(
      (_, el) => el?.tagName === "P" && el.textContent === "0/5 imágenes · PNG, JPG o WebP · hasta 5 MB cada una",
    );
    expect(ayuda).toBeTruthy();
    expect(inputArchivos().type).toBe("file");
    expect(inputArchivos().multiple).toBe(true);
    expect(inputArchivos().accept).toBe("image/png,image/jpeg,image/webp");
  });
});

describe("SLT-98 R2–R5 — elegir y quitar imágenes", () => {
  it("elegir una PNG la añade con su miniatura y «Quitar», sin llamar a la action de permisos ni a fetch", async () => {
    await abrir();
    const png = archivo("captura.png", "image/png");
    elegir(png);
    const img = screen.getByRole("img", { name: "Imagen 1" });
    expect(img.getAttribute("src")).toBe("blob:vista-1");
    expect(crearVista).toHaveBeenCalledWith(png);
    const quitar = screen.getByRole("button", { name: "Quitar imagen 1" });
    expect(quitar.textContent).toBe("Quitar");
    expect(screen.getByText("1/5 imágenes")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Reintentar/ })).toBeNull();
    expect(permisosAction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(inputArchivos().value).toBe("");
  });

  it("con 5 imágenes «Agregar imágenes» está deshabilitado y el contador dice «5/5 imágenes»", async () => {
    await abrir();
    elegir(...[1, 2, 3, 4, 5].map((n) => archivo(`${n}.png`, "image/png")));
    expect(screen.getByText("5/5 imágenes")).toBeTruthy();
    expect(agregar().disabled).toBe(true);
    expect(inputArchivos().disabled).toBe(true);
    expect(screen.getAllByRole("img")).toHaveLength(5);
    expect(screen.queryByText(/Solo caben/)).toBeNull();
  });

  it("elegir 7 con 3 en el panel añade 2 y avisa «Solo caben 5 imágenes: 5 no se agregaron.»", async () => {
    await abrir();
    elegir(...[1, 2, 3].map((n) => archivo(`${n}.png`, "image/png")));
    elegir(...[4, 5, 6, 7, 8, 9, 10].map((n) => archivo(`${n}.png`, "image/png")));
    expect(screen.getByText("5/5 imágenes")).toBeTruthy();
    expect(screen.getAllByRole("img")).toHaveLength(5);
    expect(screen.getByText("Solo caben 5 imágenes: 5 no se agregaron.")).toBeTruthy();
    expect(agregar().disabled).toBe(true);
    // Solo se crearon vistas para las que entraron.
    expect(crearVista).toHaveBeenCalledTimes(5);
  });

  it("Quitar saca la imagen, baja el contador y no la manda al enviar", async () => {
    const { user } = await abrir();
    const a = archivo("a.png", "image/png", 10);
    const b = archivo("b.webp", "image/webp", 20);
    elegir(a, b);
    expect(screen.getByText("2/5 imágenes")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Quitar imagen 1" }));
    expect(screen.getByText("1/5 imágenes")).toBeTruthy();
    expect(revocarVista).toHaveBeenCalledWith("blob:vista-1");
    // La que queda se renumera.
    expect(screen.getByRole("img", { name: "Imagen 1" }).getAttribute("src")).toBe("blob:vista-2");
    expect(screen.queryByRole("img", { name: "Imagen 2" })).toBeNull();

    permisosAction.mockResolvedValue(listas([ID_2, URL_2]));
    fetchMock.mockResolvedValue(OK);
    action.mockResolvedValue({ status: "enviado" });
    escribir("la foto de la guía sale cortada");
    await user.click(botonEnviar());
    expect(await screen.findByText("Gracias, recibimos tu reporte")).toBeTruthy();

    expect(permisosAction).toHaveBeenCalledWith({ imagenes: [{ tipo: "image/webp", tamano: 20 }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cuerpoDelPut(0)).toBe(b);
    const entrada = action.mock.calls[0][0] as { imagenes: unknown };
    expect(entrada.imagenes).toEqual([{ id: ID_2, tipo: "image/webp" }]);
  });

  it("un GIF, un archivo vacío y uno de 5 MB + 1 byte quedan marcados con su motivo, sin pedir subida y solo con «Quitar»", async () => {
    await abrir();
    escribir("no carga la tabla");
    elegir(
      archivo("anim.gif", "image/gif"),
      archivo("vacia.png", "image/png", 0),
      archivoDeTamano("grande.jpg", "image/jpeg", 5 * 1024 * 1024 + 1),
    );
    expect(screen.getByText("Solo PNG, JPG o WebP.")).toBeTruthy();
    expect(screen.getByText("El archivo está vacío.")).toBeTruthy();
    expect(screen.getByText("Pesa más de 5 MB.")).toBeTruthy();
    for (const n of [1, 2, 3]) {
      expect(screen.getByRole("button", { name: `Quitar imagen ${n}` })).toBeTruthy();
      expect(screen.queryByRole("button", { name: `Reintentar imagen ${n}` })).toBeNull();
    }
    expect(screen.getByText("3/5 imágenes")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Quita o reintenta las imágenes marcadas para poder enviar.");
    expect(botonEnviar().disabled).toBe(true);
    // El GIF no tiene vista previa (no hay nada que pintar), pero sigue nombrado.
    expect(screen.getByRole("img", { name: "Imagen 1" })).toBeTruthy();
    expect(crearVista).toHaveBeenCalledTimes(2);
    fireEvent.click(botonEnviar());
    expect(permisosAction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });
});

describe("SLT-98 R6, R7, R11 — el envío con imágenes", () => {
  it("Enviar con dos imágenes pide los dos permisos en una llamada, en orden, hace un PUT por imagen con el archivo y su content-type, muestra «Subiendo imágenes…» mientras tanto, y solo después llama a enviarReporteBugAction con los imagenId en orden", async () => {
    const { user } = await abrir();
    const a = archivo("a.png", "image/png", 11);
    const b = archivo("b.jpg", "image/jpeg", 22);
    elegir(a, b);
    escribir("la etiqueta sale en blanco");

    permisosAction.mockResolvedValue(listas([ID_1, URL_1], [ID_2, URL_2]));
    const respuestas: ((r: Response) => void)[] = [];
    fetchMock.mockImplementation(() => new Promise<Response>((resolver) => respuestas.push(resolver)));
    action.mockResolvedValue({ status: "enviado" });

    await user.click(botonEnviar());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(botonEnviar().textContent).toBe("Subiendo imágenes…");
    expect(botonEnviar().disabled).toBe(true);
    expect(screen.getAllByText("Subiendo…")).toHaveLength(2);
    expect(action).not.toHaveBeenCalled();

    expect(permisosAction).toHaveBeenCalledTimes(1);
    expect(permisosAction).toHaveBeenCalledWith({
      imagenes: [
        { tipo: "image/png", tamano: 11 },
        { tipo: "image/jpeg", tamano: 22 },
      ],
    });
    expect(fetchMock.mock.calls[0]).toEqual([
      URL_1,
      { method: "PUT", body: a, headers: { "content-type": "image/png", "x-upsert": "false" } },
    ]);
    expect(fetchMock.mock.calls[1]).toEqual([
      URL_2,
      { method: "PUT", body: b, headers: { "content-type": "image/jpeg", "x-upsert": "false" } },
    ]);

    respuestas.forEach((r) => r(OK));
    expect(await screen.findByText("Gracias, recibimos tu reporte")).toBeTruthy();
    expect(action).toHaveBeenCalledTimes(1);
    const entrada = action.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(entrada).sort()).toEqual(["appInstalada", "descripcion", "imagenes", "pagina", "ventana"]);
    expect(entrada.imagenes).toEqual([
      { id: ID_1, tipo: "image/png" },
      { id: ID_2, tipo: "image/jpeg" },
    ]);
  });

  it("si un PUT responde 500 o falla la red, no se llama a enviarReporteBugAction, la imagen dice «No se pudo subir.» con «Reintentar» y «Quitar», el texto sigue y «Enviar» queda deshabilitado con «Quita o reintenta las imágenes marcadas para poder enviar.»", async () => {
    const fallos: [string, () => Promise<Response>][] = [
      ["500", () => Promise.resolve(FALLO_500)],
      ["red", () => Promise.reject(new TypeError("Failed to fetch"))],
    ];
    for (const [caso, fallo] of fallos) {
      action.mockReset();
      permisosAction.mockReset().mockResolvedValue(listas([ID_1, URL_1], [ID_2, URL_2]));
      fetchMock.mockReset().mockResolvedValueOnce(OK).mockImplementationOnce(fallo);
      const { user, unmount } = await abrir();
      escribir("no imprime el manifiesto");
      elegir(archivo("a.png", "image/png"), archivo("b.png", "image/png"));
      await user.click(botonEnviar());

      expect(await screen.findByText("No se pudo subir."), caso).toBeTruthy();
      expect(action, caso).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Reintentar imagen 2" }).textContent).toBe("Reintentar");
      expect(screen.getByRole("button", { name: "Quitar imagen 2" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Reintentar imagen 1" }), caso).toBeNull();
      expect(screen.getAllByRole("img")).toHaveLength(2);
      expect((campo() as HTMLTextAreaElement).value).toBe("no imprime el manifiesto");
      expect(botonEnviar().textContent).toBe("Enviar");
      expect(botonEnviar().disabled, caso).toBe(true);
      expect(screen.getByText("Quita o reintenta las imágenes marcadas para poder enviar.")).toBeTruthy();
      expect(screen.queryByText("No pudimos enviar tu reporte. Inténtalo de nuevo.")).toBeNull();
      unmount();
      window.localStorage.clear();
    }
  });

  it("si la action de permisos no responde listas, no hay ningún PUT ni envío", async () => {
    for (const respuesta of [
      { status: "error" as const },
      { status: "forbidden" as const },
      { status: "unauthenticated" as const },
      { status: "validation_error" as const, fieldErrors: { imagenes: ["x"] } },
    ]) {
      action.mockReset();
      fetchMock.mockReset();
      permisosAction.mockReset().mockResolvedValue(respuesta);
      const { user, unmount } = await abrir();
      escribir("no guarda la ruta");
      elegir(archivo("a.png", "image/png"), archivo("b.png", "image/png"));
      await user.click(botonEnviar());

      // Ancla con contenido: las dos marcadas y el aviso de bloqueo, que no existe a media subida.
      await waitFor(() => {
        expect(screen.getByText("Quita o reintenta las imágenes marcadas para poder enviar.")).toBeTruthy();
        expect(screen.getAllByText("No se pudo subir."), respuesta.status).toHaveLength(2);
      });
      expect(fetchMock, respuesta.status).not.toHaveBeenCalled();
      expect(action, respuesta.status).not.toHaveBeenCalled();
      expect((campo() as HTMLTextAreaElement).value).toBe("no guarda la ruta");
      expect(botonEnviar().disabled).toBe(true);
      unmount();
      window.localStorage.clear();
    }
  });

  it("«Reintentar» pide permiso solo para la que falló, reutiliza el imagenId de la que subió y manda el reporte con las dos", async () => {
    const { user } = await abrir();
    const a = archivo("a.png", "image/png", 5);
    const b = archivo("b.webp", "image/webp", 7);
    elegir(a, b);
    escribir("el mapa se queda gris");
    permisosAction.mockResolvedValueOnce(listas([ID_1, URL_1], [ID_2, URL_2]));
    fetchMock.mockResolvedValueOnce(OK).mockResolvedValueOnce(FALLO_500);
    await user.click(botonEnviar());
    await screen.findByText("No se pudo subir.");

    permisosAction.mockResolvedValueOnce(listas([ID_3, URL_3]));
    fetchMock.mockResolvedValueOnce(OK);
    action.mockResolvedValue({ status: "enviado" });
    await user.click(screen.getByRole("button", { name: "Reintentar imagen 2" }));
    expect(await screen.findByText("Gracias, recibimos tu reporte")).toBeTruthy();

    expect(permisosAction).toHaveBeenCalledTimes(2);
    expect(permisosAction.mock.calls[1][0]).toEqual({ imagenes: [{ tipo: "image/webp", tamano: 7 }] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe(URL_3);
    expect(cuerpoDelPut(2)).toBe(b);
    expect(action).toHaveBeenCalledTimes(1);
    expect((action.mock.calls[0][0] as { imagenes: unknown }).imagenes).toEqual([
      { id: ID_1, tipo: "image/png" },
      { id: ID_3, tipo: "image/webp" },
    ]);
  });

  it("con imagenes_invalidas marca esas imágenes «No pudimos aceptar esta imagen. Quítala para enviar.» y conserva el texto", async () => {
    const { user } = await abrir();
    elegir(archivo("a.png", "image/png"), archivo("b.png", "image/png"));
    escribir("la factura no cuadra");
    permisosAction.mockResolvedValue(listas([ID_1, URL_1], [ID_2, URL_2]));
    fetchMock.mockResolvedValue(OK);
    action.mockResolvedValue({ status: "imagenes_invalidas", imagenes: [ID_2] });
    await user.click(botonEnviar());

    expect(await screen.findByText("No pudimos aceptar esta imagen. Quítala para enviar.")).toBeTruthy();
    expect(screen.getAllByText("No pudimos aceptar esta imagen. Quítala para enviar.")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Reintentar imagen 2" })).toBeNull();
    expect(screen.getByRole("button", { name: "Quitar imagen 2" })).toBeTruthy();
    expect((campo() as HTMLTextAreaElement).value).toBe("la factura no cuadra");
    expect(window.localStorage.getItem(CLAVE)).toBe("la factura no cuadra");
    expect(screen.queryByText("No pudimos enviar tu reporte. Inténtalo de nuevo.")).toBeNull();
    expect(screen.getByText("Quita o reintenta las imágenes marcadas para poder enviar.")).toBeTruthy();
    expect(botonEnviar().disabled).toBe(true);

    // Quitada la no aceptada, el siguiente envío reutiliza la que sí subió sin pedir nada más.
    action.mockResolvedValue({ status: "enviado" });
    await user.click(screen.getByRole("button", { name: "Quitar imagen 2" }));
    expect(botonEnviar().disabled).toBe(false);
    await user.click(botonEnviar());
    expect(await screen.findByText("Gracias, recibimos tu reporte")).toBeTruthy();
    expect(permisosAction).toHaveBeenCalledTimes(1);
    expect((action.mock.calls[1][0] as { imagenes: unknown }).imagenes).toEqual([{ id: ID_1, tipo: "image/png" }]);
  });
});

describe("SLT-98 R28–R30 — el tope diario de imágenes", () => {
  const SIN_CUPO = { status: "sin_cupo_imagenes" as const };

  it("R28 — «Reintentar» tras un PUT fallido pide permiso solo para la que falló: la que ya subió no vuelve a la action de permisos", async () => {
    const { user } = await abrir();
    const a = archivo("a.png", "image/png", 3);
    const b = archivo("b.jpg", "image/jpeg", 4);
    const c = archivo("c.webp", "image/webp", 6);
    elegir(a, b, c);
    escribir("el resumen no suma");
    permisosAction.mockResolvedValueOnce(listas([ID_1, URL_1], [ID_2, URL_2], [ID_3, URL_3]));
    fetchMock.mockResolvedValueOnce(OK).mockResolvedValueOnce(FALLO_500).mockResolvedValueOnce(OK);
    await user.click(botonEnviar());
    await screen.findByText("No se pudo subir.");

    permisosAction.mockResolvedValueOnce(listas(["44444444-4444-4444-8444-444444444444", URL_2]));
    fetchMock.mockResolvedValueOnce(OK);
    action.mockResolvedValue({ status: "enviado" });
    await user.click(screen.getByRole("button", { name: "Reintentar imagen 2" }));
    expect(await screen.findByText("Gracias, recibimos tu reporte")).toBeTruthy();

    expect(permisosAction).toHaveBeenCalledTimes(2);
    // El segundo pedido es solo de la que falló: ni la 1 ni la 3, que ya subieron, vuelven a contar.
    expect(permisosAction.mock.calls[1][0]).toEqual({ imagenes: [{ tipo: "image/jpeg", tamano: 4 }] });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(cuerpoDelPut(3)).toBe(b);
  });

  it("R29 — con sin_cupo_imagenes no hay PUT, se llama a enviarReporteBugAction con el texto e imagenes: [], no hay ningún role=\"alert\" y sale «Gracias, recibimos tu reporte» con 0/5 imágenes", async () => {
    const { user } = await abrir();
    elegir(archivo("a.png", "image/png"), archivo("b.png", "image/png"));
    escribir("no carga el detalle del envío");
    permisosAction.mockResolvedValue(SIN_CUPO);
    action.mockResolvedValue({ status: "enviado" });
    await user.click(botonEnviar());

    expect(await screen.findByText("Gracias, recibimos tu reporte")).toBeTruthy();
    expect(permisosAction).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
    const entrada = action.mock.calls[0][0] as { descripcion: string; imagenes: unknown };
    expect(entrada.descripcion).toBe("no carga el detalle del envío");
    expect(entrada.imagenes).toEqual([]);
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(screen.queryByText("No se pudo subir.")).toBeNull();
    expect(screen.getByText("0/5 imágenes")).toBeTruthy();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(revocarVista).toHaveBeenCalledWith("blob:vista-1");
    expect(revocarVista).toHaveBeenCalledWith("blob:vista-2");
    expect(window.localStorage.getItem(CLAVE)).toBeNull();
  });

  it("R29 — en un reintento sin cupo, el reporte lleva solo las imágenes ya subidas, en orden, y no la que falló", async () => {
    const { user } = await abrir();
    elegir(archivo("a.png", "image/png"), archivo("b.jpg", "image/jpeg"), archivo("c.webp", "image/webp"));
    escribir("la ruta sale duplicada");
    permisosAction.mockResolvedValueOnce(listas([ID_1, URL_1], [ID_2, URL_2], [ID_3, URL_3]));
    fetchMock.mockResolvedValueOnce(OK).mockResolvedValueOnce(FALLO_500).mockResolvedValueOnce(OK);
    await user.click(botonEnviar());
    await screen.findByText("No se pudo subir.");

    permisosAction.mockResolvedValueOnce(SIN_CUPO);
    action.mockResolvedValue({ status: "enviado" });
    await user.click(screen.getByRole("button", { name: "Reintentar imagen 2" }));
    expect(await screen.findByText("Gracias, recibimos tu reporte")).toBeTruthy();

    expect(permisosAction).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(action).toHaveBeenCalledTimes(1);
    expect((action.mock.calls[0][0] as { imagenes: unknown }).imagenes).toEqual([
      { id: ID_1, tipo: "image/png" },
      { id: ID_3, tipo: "image/webp" },
    ]);
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(screen.getByText("0/5 imágenes")).toBeTruthy();
  });

  it("R29 — sin cupo y con el envío respondiendo error, las imágenes siguen en pendiente y ninguna pasa a error_subida", async () => {
    const { user } = await abrir();
    const a = archivo("a.png", "image/png", 9);
    const b = archivo("b.png", "image/png", 12);
    elegir(a, b);
    escribir("no aparece el botón de cobrar");
    permisosAction.mockResolvedValue(SIN_CUPO);
    action.mockResolvedValue({ status: "error" });
    await user.click(botonEnviar());

    // El fallo es el de cualquier envío (SLT-87), no uno del tope.
    expect(await screen.findByText("No pudimos enviar tu reporte. Inténtalo de nuevo.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((action.mock.calls[0][0] as { imagenes: unknown }).imagenes).toEqual([]);
    // Pendientes: sin motivo, sin «Reintentar», sin el aviso de bloqueo y con «Enviar» habilitado.
    expect(screen.queryByText("No se pudo subir.")).toBeNull();
    expect(screen.queryByText("Subiendo…")).toBeNull();
    expect(screen.queryByRole("button", { name: /Reintentar imagen/ })).toBeNull();
    expect(screen.queryByText("Quita o reintenta las imágenes marcadas para poder enviar.")).toBeNull();
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.getByText("2/5 imágenes")).toBeTruthy();
    expect((campo() as HTMLTextAreaElement).value).toBe("no aparece el botón de cobrar");
    expect(botonEnviar().disabled).toBe(false);

    // Un «Enviar» después vuelve a pedir permisos para las dos (§16.5).
    action.mockResolvedValue({ status: "enviado" });
    await user.click(botonEnviar());
    expect(await screen.findByText("Gracias, recibimos tu reporte")).toBeTruthy();
    expect(permisosAction).toHaveBeenCalledTimes(2);
    expect(permisosAction.mock.calls[1][0]).toEqual({
      imagenes: [
        { tipo: "image/png", tamano: 9 },
        { tipo: "image/png", tamano: 12 },
      ],
    });
  });
});

describe("SLT-98 R8 — las imágenes no van al borrador", () => {
  it("el borrador guardado no lleva imágenes; al montar de nuevo el panel tiene el texto y 0/5 imágenes; Descartar y el envío bueno vacían las imágenes y revocan sus vistas previas", async () => {
    // Al desmontar (recargar), el texto queda y las imágenes se van; sus vistas se revocan.
    const primera = await abrir();
    escribir("el botón de pagar no aparece");
    elegir(archivo("a.png", "image/png"));
    expect(window.localStorage.getItem(CLAVE)).toBe("el botón de pagar no aparece");
    primera.unmount();
    expect(revocarVista).toHaveBeenCalledWith("blob:vista-1");

    const { user } = await abrir();
    expect((campo() as HTMLTextAreaElement).value).toBe("el botón de pagar no aparece");
    expect(screen.getByText("0/5 imágenes")).toBeTruthy();
    expect(screen.queryAllByRole("img")).toHaveLength(0);

    // Descartar.
    elegir(archivo("b.png", "image/png"), archivo("c.png", "image/png"));
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.getByText("0/5 imágenes")).toBeTruthy();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(revocarVista).toHaveBeenCalledWith("blob:vista-2");
    expect(revocarVista).toHaveBeenCalledWith("blob:vista-3");

    // Envío bueno.
    escribir("otra vez");
    elegir(archivo("d.png", "image/png"));
    permisosAction.mockResolvedValue(listas([ID_1, URL_1]));
    fetchMock.mockResolvedValue(OK);
    action.mockResolvedValue({ status: "enviado" });
    await user.click(botonEnviar());
    expect(await screen.findByText("Gracias, recibimos tu reporte")).toBeTruthy();
    expect(screen.getByText("0/5 imágenes")).toBeTruthy();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(revocarVista).toHaveBeenCalledWith("blob:vista-4");
    expect(window.localStorage.getItem(CLAVE)).toBeNull();
  });
});
