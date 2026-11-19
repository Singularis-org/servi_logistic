// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// SLT-160 «Buscar escaneando en los listados» — la prop `escaneo` de `BuscadorFiltros`: Enter busca
// en el acto (una guía queda como el número), el texto queda seleccionado y la siguiente lectura lo
// sustituye (R601-R603); sin Enter, la barra de siempre (R609).

// Sin cámara en CI: el doble de `html5-qrcode` captura el callback de lectura para simularla.
const { errorMock, startMock, decodeCallback } = vi.hoisted(() => ({
  errorMock: vi.fn(),
  startMock: vi.fn(),
  decodeCallback: { current: null as ((texto: string) => void) | null },
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: errorMock,
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start = startMock;
    stop = vi.fn().mockResolvedValue(undefined);
    clear = vi.fn();
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ordenes",
  useSearchParams: () => new URLSearchParams(""),
}));

import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";

function montar(props: { minChars?: number; escaneo?: boolean } = {}) {
  const onChange = vi.fn();
  render(
    <BuscadorFiltros
      onChange={onChange}
      leerDeUrl={false}
      escaneo={props.escaneo ?? true}
      minChars={props.minChars}
    />,
  );
  const campo = screen.getByRole("searchbox", { name: "Buscar" }) as HTMLInputElement;
  return { onChange, campo };
}

function pulsarEnter(campo: HTMLInputElement) {
  fireEvent.keyDown(campo, { key: "Enter", code: "Enter" });
}

beforeEach(() => {
  vi.useFakeTimers();
  errorMock.mockClear();
  startMock.mockReset();
  decodeCallback.current = null;
  startMock.mockImplementation(
    async (_c: unknown, _o: unknown, onDecode: (texto: string) => void) => {
      decodeCallback.current = onDecode;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SLT-160 — Enter en el buscador con `escaneo`", () => {
  it("R601 — la URL del QR + Enter: el campo vale el número y se busca sin esperar el debounce", () => {
    const { onChange, campo } = montar();
    fireEvent.change(campo, { target: { value: "https://app.ejemplo.test/paquete/1024" } });
    pulsarEnter(campo);

    expect(campo.value).toBe("1024");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("1024");

    // El debounce que había quedado en vuelo con la URL ya no llega.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("R601 — `#1024` con relleno de pistola en los extremos: queda `1024`", () => {
    const { onChange, campo } = montar();
    fireEvent.change(campo, { target: { value: " #1024\r" } });
    pulsarEnter(campo);

    expect(campo.value).toBe("1024");
    expect(onChange).toHaveBeenCalledWith("1024");
  });

  it("R602 — un texto que no es guía se busca tal cual en el acto", () => {
    const { onChange, campo } = montar();
    fireEvent.change(campo, { target: { value: "Ana Pérez" } });
    pulsarEnter(campo);

    expect(campo.value).toBe("Ana Pérez");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Ana Pérez");
  });

  it("R602 — por debajo de `minChars` Enter no busca", () => {
    const { onChange, campo } = montar({ minChars: 3 });
    fireEvent.change(campo, { target: { value: "ab" } });
    pulsarEnter(campo);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onChange).not.toHaveBeenCalledWith("ab");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("R603 — tras Enter el texto queda seleccionado entero", () => {
    const { campo } = montar();
    fireEvent.change(campo, { target: { value: "1024" } });
    pulsarEnter(campo);

    expect(campo.selectionStart).toBe(0);
    expect(campo.selectionEnd).toBe("1024".length);
  });

  it("R603 — la segunda lectura sustituye a la primera, nunca se le añade", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const { onChange, campo } = montar();

    await user.click(campo);
    await user.keyboard("1024{Enter}");
    expect(campo.value).toBe("1024");

    await user.keyboard("2048{Enter}");
    expect(campo.value).toBe("2048");
    expect(campo.value).not.toBe("10242048");
    expect(onChange).toHaveBeenLastCalledWith("2048");
    expect(onChange).not.toHaveBeenCalledWith("10242048");
  });

  it("R603 — Enter repetido sobre el mismo término no vuelve a emitir", () => {
    const { onChange, campo } = montar();
    fireEvent.change(campo, { target: { value: "1024" } });
    pulsarEnter(campo);
    pulsarEnter(campo);

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-160 — R609: sin Enter, la barra de siempre", () => {
  it("escribir sin Enter emite solo pasados los 500 ms", () => {
    const { onChange, campo } = montar();
    fireEvent.change(campo, { target: { value: "1024" } });

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onChange).toHaveBeenCalledWith("1024");
  });

  it("sin `escaneo`, Enter no adelanta la búsqueda ni toca el texto", () => {
    const { onChange, campo } = montar({ escaneo: false });
    fireEvent.change(campo, { target: { value: "#1024" } });
    pulsarEnter(campo);

    expect(onChange).not.toHaveBeenCalled();
    expect(campo.value).toBe("#1024");
  });

  it("la «X» limpia el campo como siempre", () => {
    const { onChange, campo } = montar();
    fireEvent.change(campo, { target: { value: "1024" } });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.click(screen.getByRole("button", { name: "Limpiar Buscar" }));
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(campo.value).toBe("");
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});

describe("SLT-160 — R600: el botón de cámara aparte, junto al campo (DC2)", () => {
  // SLT-202 «Escritorio igual a prod: tamaños de controles y un solo botón de recibir» (decisión de
  // Carlos del 2026-11-18): los 44 px de R600/R771 valen solo en el móvil; desde `md`, 32 px.
  it("con `escaneo` se muestra con su nombre accesible, fuera del campo; 32 px en escritorio y 44 en el móvil", () => {
    const { campo } = montar();
    const camara = screen.getByRole("button", { name: "Escanear con cámara" });
    expect(camara).toBeInTheDocument();
    // Fuera del contenedor del campo (el de la lupa, el input y la «X»).
    expect(campo.parentElement).not.toContainElement(camara);
    expect(camara).toHaveClass("size-8", "max-md:size-11");
    expect(camara).not.toHaveClass("size-11");
  });

  it("sin `escaneo` no se monta", () => {
    montar({ escaneo: false });
    expect(screen.queryByRole("button", { name: "Escanear con cámara" })).toBeNull();
  });
});

describe("SLT-160 — la cámara del buscador", () => {
  async function abrirCamara() {
    vi.useRealTimers();
    const user = userEvent.setup();
    const montado = montar();
    await user.click(screen.getByRole("button", { name: "Escanear con cámara" }));
    // R604 — el visor arranca sin otro clic: la lib recibe `start` y queda esperando lectura.
    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    return montado;
  }

  it("R604 — abre el visor ya encendido; una guía cierra el diálogo y se busca en el acto", async () => {
    const { onChange, campo } = await abrirCamara();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => {
      decodeCallback.current?.("1024");
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("1024");
    expect(campo.value).toBe("1024");
  });

  // SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» (R925, R927, R929): el diálogo
  // lleva «Escanear con cámara» en la barra de `EscanerModal`, con un solo «Cerrar» de 44 px; la
  // tarjeta de la cámara va sin su `CardHeader`. El disparador (icono de cámara) no cambia.
  it("R927: un solo título «Escanear con cámara», el de la barra; la tarjeta sin encabezado", async () => {
    await abrirCamara();
    const dialogo = screen.getByRole("dialog", { name: "Escanear con cámara" });
    const titulos = within(dialogo).getAllByRole("heading");
    expect(titulos.map((h) => h.textContent)).toEqual(["Escanear con cámara"]);
    expect(dialogo.querySelector('[data-slot="card-header"]')).toBeNull();
    const cerrar = within(dialogo).getAllByRole("button", { name: "Cerrar" });
    expect(cerrar).toHaveLength(1);
    // SLT-202 (Carlos, 2026-11-18): 44 × 44 solo en el móvil; en escritorio, el `icon-sm` de prod.
    expect(cerrar[0]).toHaveClass("size-7", "max-md:size-11");
    expect(cerrar[0]).not.toHaveClass("size-11");
  });

  it("R929: el disparador sigue siendo el icono de cámara (44 px en el móvil, SLT-202), sin texto", () => {
    montar();
    const camara = screen.getByRole("button", { name: "Escanear con cámara" });
    expect(camara).toHaveTextContent("");
    expect(camara.querySelector("svg")).not.toBeNull();
    expect(camara).toHaveClass("max-md:size-11");
  });

  it("R604 — la URL del QR leída por la cámara queda como el número", async () => {
    const { onChange, campo } = await abrirCamara();
    await act(async () => {
      decodeCallback.current?.("https://app.ejemplo.test/paquete/1024");
    });

    expect(onChange).toHaveBeenCalledWith("1024");
    expect(campo.value).toBe("1024");
  });

  it("R605 — lo que no es guía avisa «Código inválido.» y no toca término ni búsqueda", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const { onChange, campo } = montar();
    await user.click(campo);
    await user.keyboard("Ana{Enter}");
    onChange.mockClear();

    await user.click(screen.getByRole("button", { name: "Escanear con cámara" }));
    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      decodeCallback.current?.("ZZ-NO-ES-GUIA");
    });

    expect(errorMock).toHaveBeenCalledWith("Código inválido.");
    expect(onChange).not.toHaveBeenCalled();
    expect(campo.value).toBe("Ana");
  });
});

const AYUDA =
  "Escanea o escribe la guía y pulsa Enter. Lo leído por la pistola o por la cámara (QR o código de barras) se busca igual.";

describe("SLT-160 — R770: la ayuda del escaneo debajo del campo (DC2)", () => {
  it("con `escaneo` está y es la descripción accesible del campo", () => {
    const { campo } = montar();
    expect(screen.getByText(AYUDA)).toBeInTheDocument();
    expect(campo).toHaveAccessibleDescription(AYUDA);
  });

  it("con `escaneo` y por debajo de `minChars`, la descripción lleva la ayuda y el aviso", () => {
    const { campo } = montar({ minChars: 3 });
    fireEvent.change(campo, { target: { value: "ab" } });
    expect(campo.getAttribute("aria-describedby")?.split(" ")).toHaveLength(2);
  });

  it("sin `escaneo` no está", () => {
    const { campo } = montar({ escaneo: false });
    expect(screen.queryByText(AYUDA)).toBeNull();
    expect(campo).not.toHaveAttribute("aria-describedby");
  });
});

// SLT-202 «Escritorio igual a prod: tamaños de controles y un solo botón de recibir»: R771 pedía 44 px
// «en todos los anchos». Por decisión de Carlos del 2026-11-18, solo en el móvil (`max-md:h-11`);
// desde `md`, las clases de prod: el campo y «Filtros» en `h-8`, «Limpiar todo» en el `sm` (`h-7`).
// La altura real a 1280 y a 360 px la fija `e2e/escritorio-igual-a-prod.spec.ts`.
describe("SLT-160 — R771: 44 px de alto con `escaneo`, solo en el móvil (DC2, SLT-202)", () => {
  it("con `escaneo`, el contenedor del campo mide h-8 y h-11 en el móvil", () => {
    const { campo } = montar();
    expect(campo.parentElement).toHaveClass("h-8", "max-md:h-11");
    expect(campo.parentElement).not.toHaveClass("h-11");
  });

  it("con `escaneo`, «Filtros» y «Limpiar todo» tienen el alto de prod y h-11 en el móvil", () => {
    render(
      <BuscadorFiltros
        onChange={vi.fn()}
        leerDeUrl={false}
        escaneo
        filtros={[{ key: "zona", label: "Zona" }]}
        onLimpiarTodo={vi.fn()}
        hayFiltrosAplicados
      />,
    );
    const filtros = screen.getByRole("button", { name: "Filtros" });
    expect(filtros).toHaveClass("h-8", "max-md:h-11");
    expect(filtros).not.toHaveClass("h-11");
    const limpiar = screen.getByRole("button", { name: "Limpiar todo" });
    expect(limpiar).toHaveClass("h-7", "max-md:h-11");
    expect(limpiar).not.toHaveClass("h-11");
  });

  it("sin `escaneo`, el alto de siempre (h-8)", () => {
    const { campo } = montar({ escaneo: false });
    expect(campo.parentElement).toHaveClass("h-8");
    expect(campo.parentElement).not.toHaveClass("h-11");
  });
});
