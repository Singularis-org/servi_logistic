// @vitest-environment jsdom
// SLT-97 (T8; design §8.3, §9) — EL DETALLE DE UN REPORTE, en el cliente.
//
// Se monta el componente real con la action doblada por props y el router de Next doblado. Los textos
// van LITERALES: son el contrato de pantalla (design §9).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CambioEstadoDTO, ReporteDetalleDTO } from "@/lib/types/reporte-bug";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: nav.refresh, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/plataforma/reportes/x",
  useSearchParams: () => new URLSearchParams(),
}));

// El componente importa el tipo de resultado de la action; el módulo real arrastra Prisma.
vi.mock("@/lib/actions/reportes-bug-plataforma", () => ({}));

import { ReporteDetalle, type ReporteDetalleProps } from "@/app/(app)/plataforma/reportes/[reporteId]/_components/ReporteDetalle";

const ID = "33333333-3333-4333-8333-333333333333";

function reporte(extra: Partial<ReporteDetalleDTO> = {}): ReporteDetalleDTO {
  return {
    id: ID,
    descripcion: "Primera línea\nSegunda línea\n\nCuarta línea",
    empresa: "Acme",
    usuario: "Ana Pérez",
    correo: "ana@acme.test",
    rol: "admin",
    pagina: "/ordenes/123",
    navegador: "Mozilla/5.0 (X11; Linux x86_64)",
    ventana: { ancho: 390, alto: 844 },
    appInstalada: true,
    creadoEn: "2026-11-09T14:05:33.000Z",
    estado: "new",
    imagenes: [],
    destinosPermitidos: ["in_review", "resolved", "dismissed"],
    ...extra,
  };
}

function cambio(n: number, extra: Partial<CambioEstadoDTO> = {}): CambioEstadoDTO {
  return {
    id: `c-${n}`,
    desde: "new",
    hacia: "in_review",
    nota: null,
    actor: "Sofía Admin",
    creadoEn: "2026-11-09T15:00:00.000Z",
    ...extra,
  };
}

function montar(props: Partial<ReporteDetalleProps> = {}) {
  const cambiarEstado = props.cambiarEstado ?? vi.fn().mockResolvedValue({ status: "ok", estado: "in_review" });
  render(<ReporteDetalle reporte={reporte()} historial={[]} {...props} cambiarEstado={cambiarEstado} />);
  return { cambiarEstado, user: userEvent.setup() };
}

/** El valor (`dd`) de un rótulo (`dt`) del contexto. */
function dato(rotulo: string): string | null | undefined {
  const region = screen.getByRole("region", { name: "Contexto" });
  return within(region).getByText(rotulo, { selector: "dt" }).nextElementSibling?.textContent;
}

async function elegirDestino(user: ReturnType<typeof userEvent.setup>, etiqueta: string) {
  await user.click(screen.getByRole("combobox", { name: "Nuevo estado" }));
  await user.click(await screen.findByRole("option", { name: etiqueta }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("R14 — descripción y contexto", () => {
  it("muestra la descripción con sus saltos de línea y cada dato del contexto, el dispositivo o «Sin datos», y el estado", () => {
    montar();
    const descripcion = within(screen.getByRole("region", { name: "Descripción" })).getByText(/Primera línea/);
    expect(descripcion.textContent).toBe("Primera línea\nSegunda línea\n\nCuarta línea");
    expect(descripcion).toHaveClass("whitespace-pre-wrap");

    expect(dato("Empresa")).toBe("Acme");
    expect(dato("Usuario")).toBe("Ana Pérez");
    expect(dato("Correo")).toBe("ana@acme.test");
    expect(dato("Rol")).toBe("Administrador");
    expect(dato("Página")).toBe("/ordenes/123");
    expect(dato("Navegador")).toBe("Mozilla/5.0 (X11; Linux x86_64)");
    expect(dato("Dispositivo")).toBe("390 × 844 · app instalada: sí");
    expect(dato("Fecha")).toBe("2026-11-09 14:05 UTC");
    expect(dato("Reporte")).toBe(ID);
    expect(within(screen.getByRole("region", { name: "Estado" })).getByText("Nuevo")).toBeInTheDocument();
    cleanup();

    render(
      <ReporteDetalle
        reporte={reporte({ ventana: { ancho: 1280, alto: 720 }, appInstalada: false })}
        historial={[]}
        cambiarEstado={vi.fn()}
      />,
    );
    expect(dato("Dispositivo")).toBe("1280 × 720 · app instalada: no");
    cleanup();

    render(<ReporteDetalle reporte={reporte({ ventana: null, appInstalada: null })} historial={[]} cambiarEstado={vi.fn()} />);
    expect(dato("Dispositivo")).toBe("Sin datos");
  });
});

describe("R17 — los destinos", () => {
  it("el selector ofrece solo los destinos permitidos", async () => {
    const { user } = montar({ reporte: reporte({ estado: "in_review", destinosPermitidos: ["resolved", "dismissed"] }) });
    await user.click(screen.getByRole("combobox", { name: "Nuevo estado" }));
    const opciones = within(await screen.findByRole("listbox"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(opciones).toEqual(["Resuelto", "Descartado"]);
  });

  it("el botón está deshabilitado sin destino; con uno, manda el reporte, el destino y la nota, y tras el ok dice «Estado actualizado.», vacía la nota y relee", async () => {
    const { user, cambiarEstado } = montar();
    const boton = screen.getByRole("button", { name: "Cambiar estado" });
    expect(boton).toBeDisabled();

    await elegirDestino(user, "Resuelto");
    await user.type(screen.getByLabelText("Nota interna (opcional)"), "Arreglado en v2");
    await user.click(boton);

    expect(cambiarEstado).toHaveBeenCalledWith({ reporteId: ID, estado: "resolved", nota: "Arreglado en v2" });
    expect(await screen.findByRole("status")).toHaveTextContent("Estado actualizado.");
    expect(screen.getByLabelText("Nota interna (opcional)")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Cambiar estado" })).toBeDisabled();
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("R18 — transición inválida y otros fallos", () => {
  it("con transicion_invalida muestra el aviso con el estado actual", async () => {
    const { user } = montar({
      cambiarEstado: vi.fn().mockResolvedValue({ status: "transicion_invalida", actual: "dismissed" }),
    });
    await elegirDestino(user, "En revisión");
    await user.click(screen.getByRole("button", { name: "Cambiar estado" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este reporte ya está en «Descartado» y no puede pasar a ese estado. Se muestra su estado actual.",
    );
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(["validation_error", "forbidden", "not_found", "error"])(
    "con %s dice «No se pudo cambiar el estado. Inténtalo de nuevo.» y deja la nota",
    async (status) => {
      const { user } = montar({ cambiarEstado: vi.fn().mockResolvedValue({ status, fieldErrors: {} }) });
      await elegirDestino(user, "En revisión");
      await user.type(screen.getByLabelText("Nota interna (opcional)"), "mi nota");
      await user.click(screen.getByRole("button", { name: "Cambiar estado" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cambiar el estado. Inténtalo de nuevo.");
      expect(screen.getByLabelText("Nota interna (opcional)")).toHaveValue("mi nota");
      expect(nav.refresh).not.toHaveBeenCalled();
    },
  );
});

describe("R19 — reporte cerrado", () => {
  it.each(["resolved", "dismissed"] as const)(
    "en resolved y en dismissed no hay selector, nota ni botón, y se ve el texto de cerrado (%s)",
    (estado) => {
      montar({ reporte: reporte({ estado, destinosPermitidos: [] }) });
      expect(screen.queryByRole("combobox")).toBeNull();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByRole("button", { name: "Cambiar estado" })).toBeNull();
      expect(
        screen.getByText(
          "Este reporte está cerrado y ya no cambia de estado. Si el problema vuelve, entrará como un reporte nuevo.",
        ),
      ).toBeInTheDocument();
    },
  );
});

describe("R20 — la nota", () => {
  it("el contador muestra «0/500», «120/500» y «500/500», y el campo no admite el carácter 501", async () => {
    const { user } = montar();
    const nota = screen.getByLabelText("Nota interna (opcional)");
    expect(screen.getByText("0/500")).toBeInTheDocument();

    await user.click(nota);
    await user.paste("b".repeat(120));
    expect(screen.getByText("120/500")).toBeInTheDocument();

    await user.paste("c".repeat(381));
    expect(screen.getByText("500/500")).toBeInTheDocument();
    expect((nota as HTMLTextAreaElement).value).toHaveLength(500);
    expect(nota).toHaveAttribute("maxLength", "500");
  });
});

describe("R22, R23 — el historial", () => {
  it("el historial va del más reciente al más antiguo, con «Sin nota» cuando no la hay, y vacío dice «Todavía no hay cambios de estado.»", () => {
    montar({
      historial: [
        cambio(1, { creadoEn: "2026-11-09T15:00:00.000Z", nota: null }),
        cambio(2, {
          desde: "in_review",
          hacia: "resolved",
          creadoEn: "2026-11-10T09:30:00.000Z",
          nota: "Arreglado\nen v2",
          actor: "Luis Plataforma",
        }),
      ],
    });
    const entradas = within(screen.getByRole("region", { name: "Historial" })).getAllByRole("listitem");
    expect(entradas.map((e) => Array.from(e.children).map((p) => p.textContent))).toEqual([
      ["En revisión → Resuelto", "Luis Plataforma · 2026-11-10 09:30 UTC", "Arreglado\nen v2"],
      ["Nuevo → En revisión", "Sofía Admin · 2026-11-09 15:00 UTC", "Sin nota"],
    ]);
    expect(screen.queryByText("Todavía no hay cambios de estado.")).toBeNull();
    cleanup();

    montar({ historial: [] });
    expect(screen.getByText("Todavía no hay cambios de estado.")).toBeInTheDocument();
  });

  it("el historial no tiene botones de editar ni de borrar", () => {
    montar({ historial: [cambio(1, { nota: "una nota" })] });
    const historial = screen.getByRole("region", { name: "Historial" });
    expect(within(historial).queryAllByRole("button")).toHaveLength(0);
    expect(within(historial).queryAllByRole("textbox")).toHaveLength(0);
    expect(within(historial).queryAllByRole("link")).toHaveLength(0);
  });
});

describe("accesibilidad del formulario", () => {
  it("el contador avisa con aria-live y describe el campo de la nota", async () => {
    montar();
    const nota = screen.getByLabelText("Nota interna (opcional)");
    const contador = screen.getByText("0/500");
    expect(contador).toHaveAttribute("aria-live", "polite");
    expect(nota).toHaveAttribute("aria-describedby", contador.id);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Nuevo estado" })).toBeInTheDocument());
  });
});
