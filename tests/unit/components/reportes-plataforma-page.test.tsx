// @vitest-environment jsdom
// SLT-97 (T7, T8; design §8.2, §8.3, §9) — LAS PÁGINAS `/plataforma/reportes` Y SU DETALLE.
//
// Se monta la página REAL con su módulo real; lo único doblado es el borde: la sesión, las actions
// (por los `deps` de la página) y el router de Next. Los textos van LITERALES: son el contrato de
// pantalla (design §9).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ReporteDetalleDTO, ReporteFilaDTO } from "@/lib/types/reporte-bug";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: nav.push, refresh: nav.refresh, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/plataforma/reportes",
  useSearchParams: () => new URLSearchParams(),
}));

// Las actions reales arrastran Prisma; la página las recibe dobladas por `deps`.
vi.mock("@/lib/actions/reportes-bug-plataforma", () => ({
  listarReportesBugAction: vi.fn(),
  verReporteBugAction: vi.fn(),
  cambiarEstadoReporteBugAction: vi.fn(),
}));
vi.mock("@/lib/actions/_shared/empresas-plataforma", () => ({ listarEmpresasPlataforma: vi.fn() }));
vi.mock("@/lib/auth/resolve-actor", () => ({ resolveActorFromSession: vi.fn() }));

// El encabezado de `AppPage` monta el botón de salir, que pide el toast.
const toastMock = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() };
vi.mock("@/hooks/useToast", () => ({ useToast: () => toastMock }));

import ReportesPage, { type ReportesPageDeps } from "@/app/(app)/plataforma/reportes/page";
import ReporteDetallePage, { type ReporteDetallePageDeps } from "@/app/(app)/plataforma/reportes/[reporteId]/page";

const ROLES_DE_EMPRESA = ["maestro", "admin", "adminTienda", "adminSatelite", "mensajero", "apiKey"];

const ACME = "11111111-1111-4111-8111-111111111111";
const BETA = "22222222-2222-4222-8222-222222222222";

const LARGA = "a".repeat(120);

function fila(n: number, extra: Partial<ReporteFilaDTO> = {}): ReporteFilaDTO {
  return {
    id: `r-${n}`,
    creadoEn: "2026-11-09T14:05:33.000Z",
    estado: "new",
    empresa: "Acme",
    usuario: `Usuario ${n}`,
    rol: "admin",
    resumen: "Algo falla",
    ...extra,
  };
}

const ID_REPORTE = "33333333-3333-4333-8333-333333333333";

const DETALLE: ReporteDetalleDTO = {
  id: ID_REPORTE,
  descripcion: "La tabla no carga",
  empresa: "Acme",
  usuario: "Ana",
  correo: "ana@acme.test",
  rol: "admin",
  pagina: "/ordenes",
  navegador: "Mozilla/5.0",
  ventana: null,
  appInstalada: null,
  creadoEn: "2026-11-09T14:05:00.000Z",
  estado: "new",
  destinosPermitidos: ["in_review", "resolved", "dismissed"],
};

const deps = {
  getActor: vi.fn(),
  listar: vi.fn(),
  listarEmpresas: vi.fn(),
  ver: vi.fn(),
};

function actorDe(rol: string) {
  return { usuarioId: "u-1", rol };
}

async function montarListado(searchParams: Record<string, string | string[] | undefined> = {}) {
  const ui = await ReportesPage({ searchParams: Promise.resolve(searchParams) }, deps as unknown as ReportesPageDeps);
  return render(ui);
}

async function montarDetalle(reporteId: string) {
  const ui = await ReporteDetallePage(
    { params: Promise.resolve({ reporteId }) },
    deps as unknown as ReporteDetallePageDeps,
  );
  return render(ui);
}

/** Las opciones de un `Select`, en orden, abriéndolo y cerrándolo. */
async function opcionesDe(user: ReturnType<typeof userEvent.setup>, nombre: string): Promise<string[]> {
  await user.click(screen.getByRole("combobox", { name: nombre }));
  const lista = await screen.findByRole("listbox");
  const opciones = within(lista)
    .getAllByRole("option")
    .map((o) => o.textContent ?? "");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  return opciones;
}

beforeEach(() => {
  deps.getActor.mockResolvedValue(actorDe("superadmin"));
  deps.listar.mockResolvedValue({ status: "ok", items: [fila(1)], total: 1, pagina: 1 });
  deps.ver.mockResolvedValue({ status: "ok", reporte: DETALLE, historial: [] });
  deps.listarEmpresas.mockResolvedValue({
    status: "ok",
    empresas: [
      { id: BETA, nombre: "Zeta Envíos" },
      { id: ACME, nombre: "Acme" },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("R2 — la puerta, antes de leer", () => {
  it("sin sesión y con cada rol de empresa, el listado y el detalle dan notFound sin llamar a la action", async () => {
    for (const actor of [null, ...ROLES_DE_EMPRESA.map(actorDe)]) {
      deps.getActor.mockResolvedValue(actor);
      await expect(montarListado()).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(montarDetalle(ID_REPORTE)).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(deps.listar).not.toHaveBeenCalled();
    expect(deps.listarEmpresas).not.toHaveBeenCalled();
    expect(deps.ver).not.toHaveBeenCalled();
  });
});

describe("R14, R15 — el detalle", () => {
  it("un id que no es uuid, que no existe o borrado da notFound", async () => {
    // Que no es uuid: la action responde `validation_error`; que no existe o está borrado, `not_found`.
    deps.ver.mockResolvedValueOnce({ status: "validation_error", fieldErrors: { reporteId: ["x"] } });
    await expect(montarDetalle("no-es-uuid")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(deps.ver).toHaveBeenLastCalledWith({ reporteId: "no-es-uuid" });

    deps.ver.mockResolvedValueOnce({ status: "not_found" });
    await expect(montarDetalle(ID_REPORTE)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(deps.ver).toHaveBeenLastCalledWith({ reporteId: ID_REPORTE });
  });

  it("un reporte que existe se pinta con su título y el enlace de vuelta al listado", async () => {
    await montarDetalle(ID_REPORTE);
    expect(screen.getByRole("heading", { level: 1, name: "Reporte" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a reportes" })).toHaveAttribute("href", "/plataforma/reportes");
    expect(screen.getByText("La tabla no carga")).toBeInTheDocument();
  });
});

describe("R5, R7, R8 — los filtros", () => {
  it("sin searchParams, el estado está en Pendientes, la empresa en Todas las empresas y las fechas vacías", async () => {
    await montarListado();
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveTextContent("Pendientes");
    expect(screen.getByRole("combobox", { name: "Empresa" })).toHaveTextContent("Todas las empresas");
    expect(screen.getByLabelText("Desde")).toHaveValue("");
    expect(screen.getByLabelText("Hasta")).toHaveValue("");
    expect(deps.listar).toHaveBeenCalledWith({});
  });

  it("el filtro de estado ofrece las seis opciones en orden", async () => {
    const user = userEvent.setup();
    await montarListado();
    expect(await opcionesDe(user, "Estado")).toEqual([
      "Pendientes",
      "Todos",
      "Nuevo",
      "En revisión",
      "Resuelto",
      "Descartado",
    ]);
  });

  it("el filtro de empresa ofrece Todas las empresas y las empresas por nombre", async () => {
    const user = userEvent.setup();
    await montarListado();
    expect(await opcionesDe(user, "Empresa")).toEqual(["Todas las empresas", "Acme", "Zeta Envíos"]);
  });

  it("si las empresas no se pudieron leer, el filtro ofrece solo Todas las empresas", async () => {
    deps.listarEmpresas.mockResolvedValue({ status: "forbidden" });
    const user = userEvent.setup();
    await montarListado();
    expect(await opcionesDe(user, "Empresa")).toEqual(["Todas las empresas"]);
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });
});

describe("R6 — las filas", () => {
  it("cada fila muestra fecha UTC, empresa, usuario, rol, resumen de 120 con «…» y estado, y enlaza a su detalle", async () => {
    deps.listar.mockResolvedValue({
      status: "ok",
      items: [
        fila(1, { resumen: `${LARGA}…`, estado: "in_review" }),
        fila(2, { empresa: "Zeta Envíos", rol: "mensajero", estado: "new", creadoEn: "2026-01-02T03:04:00.000Z" }),
      ],
      total: 2,
      pagina: 1,
    });
    await montarListado();

    const [, primera, segunda] = screen.getAllByRole("row");
    const celdas = (f: HTMLElement) => within(f).getAllByRole("cell").map((c) => c.textContent);
    expect(celdas(primera)).toEqual(["2026-11-09 14:05 UTC", "Acme", "Usuario 1", "Administrador", `${LARGA}…`, "En revisión"]);
    expect(celdas(segunda)).toEqual(["2026-01-02 03:04 UTC", "Zeta Envíos", "Usuario 2", "Mensajero", "Algo falla", "Nuevo"]);
    expect(within(primera).getByRole("link", { name: "Ver reporte de Acme del 2026-11-09 14:05 UTC" })).toHaveAttribute(
      "href",
      "/plataforma/reportes/r-1",
    );
    expect(within(segunda).getByRole("link")).toHaveAttribute("href", "/plataforma/reportes/r-2");
  });

  it("el enlace de cada fila anuncia «Ver reporte de {empresa} del {fecha}» con la fecha en UTC", async () => {
    // 02:05 UTC del 9 es 20:05 del 8 en Costa Rica (UTC-6): si la fecha saliera en hora local, cambiarían
    // el día y la hora.
    const creadoEn = "2026-11-09T02:05:00.000Z";
    const tzOriginal = process.env.TZ;
    process.env.TZ = "America/Costa_Rica";
    try {
      expect(new Date(creadoEn).getHours()).not.toBe(new Date(creadoEn).getUTCHours());
      deps.listar.mockResolvedValue({
        status: "ok",
        items: [fila(1, { empresa: "Envíos Rápidos", creadoEn })],
        total: 1,
        pagina: 1,
      });
      await montarListado();

      const [, primera] = screen.getAllByRole("row");
      expect(within(primera).getByRole("link")).toHaveAccessibleName("Ver reporte de Envíos Rápidos del 2026-11-09 02:05 UTC");
      expect(within(primera).getByRole("link")).toHaveAttribute("href", "/plataforma/reportes/r-1");
      // El texto visible sigue siendo la fecha, y va dentro del nombre (WCAG 2.5.3).
      expect(within(primera).getByRole("link")).toHaveTextContent("2026-11-09 02:05 UTC");
    } finally {
      if (tzOriginal === undefined) delete process.env.TZ;
      else process.env.TZ = tzOriginal;
    }
  });
});

describe("R9 — fechas inválidas", () => {
  it("con validation_error muestra el aviso de fechas y ninguna fila", async () => {
    deps.listar.mockResolvedValue({ status: "validation_error", fieldErrors: { hasta: ["x"] } });
    await montarListado({ desde: "2026-11-10", hasta: "2026-11-01" });
    expect(screen.getByRole("alert")).toHaveTextContent("Revisa las fechas: «Desde» no puede ser posterior a «Hasta».");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Ningún reporte coincide con los filtros.")).toBeNull();
    // La barra sigue mostrando lo que se pidió, para corregirlo.
    expect(screen.getByLabelText("Desde")).toHaveValue("2026-11-10");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-11-01");
  });
});

describe("R10 — los filtros en la dirección", () => {
  it("cambiar un filtro navega a la URL con el filtro y sin pagina; los valores por defecto no van en la URL", async () => {
    deps.listar.mockResolvedValue({ status: "ok", items: [fila(1)], total: 60, pagina: 2 });
    const user = userEvent.setup();
    await montarListado({ estado: "todos", pagina: "2" });

    await user.click(screen.getByRole("combobox", { name: "Empresa" }));
    await user.click(await screen.findByRole("option", { name: "Acme" }));
    expect(nav.push).toHaveBeenLastCalledWith(`/plataforma/reportes?estado=todos&empresa=${ACME}`);

    await user.click(screen.getByRole("combobox", { name: "Estado" }));
    await user.click(await screen.findByRole("option", { name: "Pendientes" }));
    expect(nav.push).toHaveBeenLastCalledWith("/plataforma/reportes");

    await user.type(screen.getByLabelText("Desde"), "2026-11-01");
    expect(nav.push).toHaveBeenLastCalledWith("/plataforma/reportes?estado=todos&desde=2026-11-01");

    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(nav.push).toHaveBeenLastCalledWith("/plataforma/reportes");
  });

  it("los searchParams llegan a la action como filtros", async () => {
    await montarListado({
      estado: ["resolved", "new"],
      empresa: ACME,
      desde: "2026-11-01",
      hasta: "",
      pagina: "3",
      otra: "x",
    });
    expect(deps.listar).toHaveBeenCalledWith({ estado: "resolved", empresa: ACME, desde: "2026-11-01", pagina: "3" });
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveTextContent("Resuelto");
    expect(screen.getByRole("combobox", { name: "Empresa" })).toHaveTextContent("Acme");
  });
});

describe("R11 — la paginación", () => {
  it("la paginación muestra «26-50 de 60» y al pasar de página navega con pagina", async () => {
    deps.listar.mockResolvedValue({ status: "ok", items: [fila(1)], total: 60, pagina: 2 });
    const user = userEvent.setup();
    await montarListado({ pagina: "2", empresa: ACME });

    const paginacion = screen.getByRole("navigation", { name: "Paginación de reportes" });
    expect(paginacion).toHaveTextContent("26-50 de 60");
    await user.click(within(paginacion).getByRole("button", { name: "Página siguiente" }));
    expect(nav.push).toHaveBeenLastCalledWith(`/plataforma/reportes?empresa=${ACME}&pagina=3`);
    await user.click(within(paginacion).getByRole("button", { name: "Página anterior" }));
    expect(nav.push).toHaveBeenLastCalledWith(`/plataforma/reportes?empresa=${ACME}`);
  });
});

describe("R12 — vacío y fallo", () => {
  it("sin filas, con los filtros por defecto dice «No hay reportes pendientes.» y con otros «Ningún reporte coincide con los filtros.»", async () => {
    deps.listar.mockResolvedValue({ status: "ok", items: [], total: 0, pagina: 1 });
    await montarListado();
    expect(screen.getByText("No hay reportes pendientes.")).toBeInTheDocument();
    expect(screen.queryByText("Ningún reporte coincide con los filtros.")).toBeNull();
    cleanup();

    for (const sp of [{ estado: "todos" }, { empresa: ACME }, { desde: "2026-11-01" }, { hasta: "2026-11-01" }]) {
      await montarListado(sp);
      expect(screen.getByText("Ningún reporte coincide con los filtros.")).toBeInTheDocument();
      expect(screen.queryByText("No hay reportes pendientes.")).toBeNull();
      cleanup();
    }
  });

  it("si la action responde error, muestra «No se pudo cargar el listado de reportes.» y no el vacío", async () => {
    deps.listar.mockResolvedValue({ status: "error" });
    await montarListado();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el listado de reportes.");
    expect(screen.queryByText("No hay reportes pendientes.")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
