// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReporteBugBoton } from "@/components/shared/ReporteBugBoton";
import { enviarReporteBugAction } from "@/lib/actions/reporte-bug";

/**
 * SLT-87 (T7, T8; R3–R10) — el botón «Reportar un problema», su panel y el borrador.
 *
 * Lo del servidor (sesión, validación, quién reporta, correo) vive en los tests de la action y del
 * servicio. Aquí, lo que solo se ve montando el componente. Los textos esperados son LITERALES escritos
 * a mano (design §8.4), nunca leídos de la constante que los pinta.
 */

vi.mock("@/lib/actions/reporte-bug", () => ({ enviarReporteBugAction: vi.fn() }));

const { rutaMock } = vi.hoisted(() => ({ rutaMock: vi.fn(() => "/dashboard") }));
vi.mock("next/navigation", () => ({ usePathname: () => rutaMock() }));

const action = vi.mocked(enviarReporteBugAction);
const USUARIO = "usuario-a";
const CLAVE = `servi:reporte-bug:borrador:${USUARIO}`;

beforeEach(() => {
  window.localStorage.clear();
  action.mockReset();
  rutaMock.mockReturnValue("/dashboard");
});

afterEach(() => {
  cleanup();
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
  it("abre un panel con descripción, Enviar y Descartar, sin campo de archivos", async () => {
    const { container } = await abrir();
    const panel = screen.getByRole("dialog", { name: "Reportar un problema" });
    expect(panel).toBeTruthy();
    expect(campo()).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Descartar" })).toBeTruthy();
    expect(container.querySelector('input[type="file"]')).toBeNull();
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
