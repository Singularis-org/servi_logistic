// @vitest-environment jsdom
// SLT-48 (T4.1; design §7.3; maqueta T0.2 §1) — EL MODAL «MOVER» DE /plataforma/geografia.
//
// Cubre R36 (antes → después con la ubicación vieja y la nueva, los descendientes por nivel y las órdenes
// que cambian de nombre; la validación corre al abrir el paso 2), R37 (el padre que mostró el modal viaja
// al confirmar y el cambio concurrente cierra sin escribir y avisa), R40/P1 (el bloqueo dice cuántas
// órdenes y de qué empresas, y apaga «Sí, mover»), R35/P4 (el rechazo del destino retirado y los demás
// motivos en el modal) y las reglas 1 y 6 del humano (desglose por nivel; la fila se llama «Ubicación»).
//
// Se monta el diálogo real; lo doblado es el borde: las Server Actions, el router y el toast.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  NodoArbolPlataformaDTO,
  TipoNivelDTO,
  VistaPreviaMoverNodoDTO,
} from "@/lib/types/geografia-nodo";

const routerMock = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

const toastMock = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() };
vi.mock("@/hooks/useToast", () => ({ useToast: () => toastMock }));

const vistaPreviaMock = vi.fn();
const moverMock = vi.fn();
vi.mock("@/lib/actions/geografia-plataforma", () => ({
  vistaPreviaMoverNodoAction: (...a: unknown[]) => vistaPreviaMock(...a),
  moverNodoAction: (...a: unknown[]) => moverMock(...a),
}));

import {
  desgloseDeDescendientes,
  destinosDe,
  MoverNodoDialog,
} from "@/app/(app)/plataforma/geografia/_components/MoverNodoDialog";
import { MENSAJE_DE_MOTIVO_DE_MOVER } from "@/lib/types/geografia-nodo";

function tipo(profundidad: number, nombreSingular: string, nombrePlural: string): TipoNivelDTO {
  return {
    id: `t${profundidad}`,
    clave: `nivel_${profundidad}`,
    profundidad,
    nombreSingular,
    nombrePlural,
    digitosCodigo: null,
    codigoHeredaPrefijo: false,
  };
}

function nodo(
  id: string,
  nombre: string,
  profundidad: number,
  extra: Partial<NodoArbolPlataformaDTO> = {},
): NodoArbolPlataformaDTO {
  return { id, nombre, codigo: null, activo: true, profundidad, tipoId: `t${profundidad}`, hijos: [], ...extra };
}

// Costa Rica, el ejemplo de la maqueta.
const TIPOS_CR = [tipo(1, "Provincia", "Provincias"), tipo(2, "Cantón", "Cantones"), tipo(3, "Distrito", "Distritos")];
const RAICES_CR: NodoArbolPlataformaDTO[] = [
  nodo("sj", "San José", 1, {
    hijos: [
      nodo("escazu", "Escazú", 2, { hijos: [nodo("sanrafael", "San Rafael", 3)] }),
      nodo("santaana", "Santa Ana", 2),
      nodo("mora", "Mora", 2),
      nodo("tibas", "Tibás", 2, { activo: false }),
    ],
  }),
  nodo("al", "Alajuela", 1, { hijos: [nodo("alajuela", "Alajuela", 2)] }),
];
const SAN_RAFAEL = { id: "sanrafael", nombre: "San Rafael", profundidad: 3 };

// Un país de 4 niveles (la maqueta: Recreo bajo Viña, bloqueado por P1).
const TIPOS_4 = [
  tipo(1, "Región", "Regiones"),
  tipo(2, "Provincia", "Provincias"),
  tipo(3, "Comuna", "Comunas"),
  tipo(4, "Barrio", "Barrios"),
];
const RAICES_4: NodoArbolPlataformaDTO[] = [
  nodo("costa", "Costa", 1, {
    hijos: [
      nodo("litoral", "Litoral", 2, { hijos: [nodo("vina", "Viña", 3, { hijos: [nodo("recreo", "Recreo", 4)] })] }),
      nodo("marga", "Marga Marga", 2, { hijos: [nodo("quilpue", "Quilpué", 3)] }),
    ],
  }),
];
const RECREO = { id: "recreo", nombre: "Recreo", profundidad: 4 };

function vistaCR(extra: Partial<VistaPreviaMoverNodoDTO> = {}): VistaPreviaMoverNodoDTO {
  return {
    nodo: { id: "sanrafael", nombre: "San Rafael", profundidad: 3, tipoSingular: "Distrito" },
    padreIdAnterior: "escazu",
    rutaActual: [
      { id: "sj", nombre: "San José" },
      { id: "escazu", nombre: "Escazú" },
      { id: "sanrafael", nombre: "San Rafael" },
    ],
    rutaNueva: [
      { id: "sj", nombre: "San José" },
      { id: "santaana", nombre: "Santa Ana" },
      { id: "sanrafael", nombre: "San Rafael" },
    ],
    descendientes: { total: 0, porNivel: [] },
    ordenesQueCambianDeNombre: 1284,
    bloqueo: null,
    ...extra,
  };
}

function montar(props: {
  nodo?: typeof SAN_RAFAEL | null;
  tipos?: TipoNivelDTO[];
  raices?: NodoArbolPlataformaDTO[];
  paisNombre?: string;
} = {}) {
  const onCerrar = vi.fn();
  render(
    <MoverNodoDialog
      nodo={props.nodo === undefined ? SAN_RAFAEL : props.nodo}
      onCerrar={onCerrar}
      paisNombre={props.paisNombre ?? "Costa Rica"}
      tipos={props.tipos ?? TIPOS_CR}
      raices={props.raices ?? RAICES_CR}
    />,
  );
  return { onCerrar, user: userEvent.setup() };
}

/** Filas de la tabla antes → después, sin el encabezado: [dato, antes, después]. */
function filasDelModal(dialogo: HTMLElement): string[][] {
  return within(dialogo)
    .getAllByRole("row")
    .slice(1)
    .map((r) => Array.from(r.children).map((c) => c.textContent ?? ""));
}

async function elegirYVer(user: ReturnType<typeof userEvent.setup>, destino: RegExp) {
  await user.click(screen.getByRole("radio", { name: destino }));
  await user.click(screen.getByRole("button", { name: "Ver el cambio" }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("paso 1 — elegir el padre nuevo (design §7.3)", () => {
  it("ofrece solo nodos de la profundidad del padre actual, de todo el país, con su cadena y sus insignias", () => {
    montar();
    const dialogo = screen.getByRole("dialog", { name: "Mover «San Rafael»" });
    expect(dialogo).toHaveAccessibleDescription(
      "Elige el lugar al que pasa. Solo se ofrecen cantones de Costa Rica.",
    );
    const grupo = within(dialogo).getByRole("radiogroup", { name: "Cantón de destino" });
    const nombres = within(grupo).getAllByRole("radio").map((r) => r.closest("label")?.textContent ?? "");
    expect(nombres).toEqual([
      "Escazú· San JoséPadre actual",
      "Santa Ana· San José",
      "Mora· San José",
      "Tibás· San JoséRetirado",
      "Alajuela· Alajuela",
    ]);
    // Ni una provincia ni un distrito.
    expect(within(grupo).queryByRole("radio", { name: /^San José/ })).toBeNull();
    expect(within(grupo).queryByRole("radio", { name: /^San Rafael/ })).toBeNull();
  });

  it("«Ver el cambio» no se puede pulsar sin destino ni con el padre actual", async () => {
    const { user } = montar();
    const ver = screen.getByRole("button", { name: "Ver el cambio" });
    expect(ver).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /^Escazú/ }));
    expect(ver).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /^Santa Ana/ }));
    expect(ver).toBeEnabled();
  });

  it("el buscador filtra por nombre sin acentos ni mayúsculas", async () => {
    const { user } = montar();
    await user.type(screen.getByRole("searchbox", { name: "Buscar por nombre…" }), "tibas");
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /^Tibás/ })).toBeInTheDocument();
  });

  it("cancelar cierra sin llamar a ninguna action", async () => {
    const { user, onCerrar } = montar();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(vistaPreviaMock).not.toHaveBeenCalled();
    expect(moverMock).not.toHaveBeenCalled();
  });
});

describe("R36 — paso 2: antes → después", () => {
  it("pide la vista previa del destino y pinta Ubicación (no «Ruta»), el padre, los descendientes y las órdenes", async () => {
    vistaPreviaMock.mockResolvedValue({ status: "ok", vista: vistaCR() });
    const { user } = montar();
    await elegirYVer(user, /^Santa Ana/);

    const dialogo = await screen.findByRole("dialog", { name: "¿Mover «San Rafael» a Santa Ana?" });
    expect(vistaPreviaMock).toHaveBeenCalledWith({ id: "sanrafael", padreIdNuevo: "santaana" });
    expect(dialogo).toHaveAccessibleDescription(/conservan su zona y su precio/);
    expect(filasDelModal(dialogo)).toEqual([
      ["Ubicación", "San José › Escazú › San Rafael", "San José › Santa Ana › San Rafael"],
      ["Cantón", "Escazú", "Santa Ana"],
    ]);
    expect(within(dialogo).queryByText("Ruta")).toBeNull();
    expect(within(dialogo).getByText("Lugares que cuelgan de él: 0.")).toBeInTheDocument();
    expect(
      within(dialogo).getByText(
        "Órdenes que cambian el nombre del lugar que muestran, de todas las empresas: 1284.",
      ),
    ).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Sí, mover" })).toBeEnabled();
    expect(moverMock).not.toHaveBeenCalled();
  });

  it("regla 1 del humano: los descendientes se desglosan por nivel, con el tipo del país", async () => {
    vistaPreviaMock.mockResolvedValue({
      status: "ok",
      vista: vistaCR({
        descendientes: {
          total: 38,
          porNivel: [
            { profundidad: 9, tipoSingular: "Manzana", tipoPlural: "Manzanas", cantidad: 6 },
            { profundidad: 10, tipoSingular: "Lote", tipoPlural: "Lotes", cantidad: 32 },
          ],
        },
      }),
    });
    const { user } = montar();
    await elegirYVer(user, /^Santa Ana/);
    expect(await screen.findByText("Lugares que cuelgan de él: 38 (6 manzanas y 32 lotes).")).toBeInTheDocument();
  });

  it("«Volver» regresa al paso 1 con el destino elegido, sin cerrar ni escribir", async () => {
    vistaPreviaMock.mockResolvedValue({ status: "ok", vista: vistaCR() });
    const { user, onCerrar } = montar();
    await elegirYVer(user, /^Santa Ana/);
    await screen.findByRole("dialog", { name: "¿Mover «San Rafael» a Santa Ana?" });

    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(await screen.findByRole("dialog", { name: "Mover «San Rafael»" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Santa Ana/ })).toBeChecked();
    expect(onCerrar).not.toHaveBeenCalled();
    expect(moverMock).not.toHaveBeenCalled();
  });

  it("«Sí, mover» llama una vez con el padre que mostró el modal (R37), refresca y cierra", async () => {
    vistaPreviaMock.mockResolvedValue({ status: "ok", vista: vistaCR() });
    moverMock.mockResolvedValue({ status: "ok", id: "sanrafael", padreId: "santaana" });
    const { user, onCerrar } = montar();
    await elegirYVer(user, /^Santa Ana/);
    await user.click(await screen.findByRole("button", { name: "Sí, mover" }));

    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
    expect(moverMock).toHaveBeenCalledTimes(1);
    expect(moverMock).toHaveBeenCalledWith({ id: "sanrafael", padreIdNuevo: "santaana", padreIdAnterior: "escazu" });
    expect(toastMock.success).toHaveBeenCalledWith("Se movió «San Rafael» a Santa Ana.");
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("R37 — cambio concurrente", () => {
  it("cierra sin escribir, deja el aviso de siempre en la pantalla y refresca", async () => {
    vistaPreviaMock.mockResolvedValue({ status: "ok", vista: vistaCR() });
    moverMock.mockResolvedValue({ status: "conflict", motivo: "cambio_concurrente" });
    const { user, onCerrar } = montar();
    await elegirYVer(user, /^Santa Ana/);
    await user.click(await screen.findByRole("button", { name: "Sí, mover" }));

    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Este dato cambió mientras tanto; revisa el valor actual.")).toBeInTheDocument();
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});

describe("P1, review vuelta 2 — mover cedió ante las escrituras de una empresa (`ocupado`)", () => {
  it("avisa «intenta de nuevo», no cierra ni refresca y deja «Sí, mover» para reintentar", async () => {
    vistaPreviaMock.mockResolvedValue({ status: "ok", vista: vistaCR() });
    moverMock.mockResolvedValueOnce({ status: "conflict", motivo: "ocupado" });
    const { user, onCerrar } = montar();
    await elegirYVer(user, /^Santa Ana/);
    await user.click(await screen.findByRole("button", { name: "Sí, mover" }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Se están guardando órdenes en ese lugar. Intenta de nuevo en unos segundos."),
    );
    expect(onCerrar).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    // No es el rechazo por un hermano con ese nombre (el otro `conflict`).
    expect(screen.queryByText(/ya tiene un lugar llamado/)).not.toBeInTheDocument();

    moverMock.mockResolvedValueOnce({ status: "ok", id: "sanrafael", padreId: "santaana" });
    await user.click(screen.getByRole("button", { name: "Sí, mover" }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
    expect(moverMock).toHaveBeenCalledTimes(2);
  });
});

describe("R40, P1 — bloqueado por órdenes abiertas", () => {
  const bloqueo = {
    ordenes: 37,
    empresas: [
      { id: "e1", nombre: "Tienda Andes SpA", ordenes: 29 },
      { id: "e2", nombre: "Mercado Sur Ltda.", ordenes: 8 },
    ],
  };

  it("dice cuántas órdenes y de qué empresas, y «Sí, mover» queda apagado", async () => {
    vistaPreviaMock.mockResolvedValue({
      status: "ok",
      vista: {
        nodo: { id: "recreo", nombre: "Recreo", profundidad: 4, tipoSingular: "Barrio" },
        padreIdAnterior: "vina",
        rutaActual: [
          { id: "costa", nombre: "Costa" },
          { id: "litoral", nombre: "Litoral" },
          { id: "vina", nombre: "Viña" },
          { id: "recreo", nombre: "Recreo" },
        ],
        rutaNueva: [
          { id: "costa", nombre: "Costa" },
          { id: "marga", nombre: "Marga Marga" },
          { id: "quilpue", nombre: "Quilpué" },
          { id: "recreo", nombre: "Recreo" },
        ],
        descendientes: { total: 0, porNivel: [] },
        ordenesQueCambianDeNombre: 214,
        bloqueo,
      } satisfies VistaPreviaMoverNodoDTO,
    });
    const onCerrar = vi.fn();
    render(
      <MoverNodoDialog nodo={RECREO} onCerrar={onCerrar} paisNombre="Chile" tipos={TIPOS_4} raices={RAICES_4} />,
    );
    const user = userEvent.setup();
    expect(screen.getByRole("dialog", { name: "Mover «Recreo»" })).toHaveAccessibleDescription(
      "Elige el lugar al que pasa. Solo se ofrecen comunas de Chile.",
    );
    await elegirYVer(user, /^Quilpué/);

    const dialogo = await screen.findByRole("dialog", { name: "¿Mover «Recreo» a Quilpué?" });
    expect(filasDelModal(dialogo)).toEqual([
      ["Ubicación", "Costa › Litoral › Viña › Recreo", "Costa › Marga Marga › Quilpué › Recreo"],
      ["Comuna", "Viña", "Quilpué"],
    ]);
    const alerta = within(dialogo).getByRole("alert");
    expect(alerta).toHaveTextContent(/No se puede mover mientras haya órdenes abiertas/);
    expect(alerta).toHaveTextContent("37 órdenes abiertas, de 2 empresas:");
    expect(within(alerta).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Tienda Andes SpA: 29",
      "Mercado Sur Ltda.: 8",
    ]);
    expect(alerta).toHaveTextContent("Se podrá mover cuando esas órdenes entren en un cierre.");
    const si = within(dialogo).getByRole("button", { name: "Sí, mover" });
    expect(si).toBeDisabled();
    await user.click(si);
    expect(moverMock).not.toHaveBeenCalled();
  });

  it("si el bloqueo aparece entre la vista previa y el «Sí», el modal lo enseña y se apaga", async () => {
    vistaPreviaMock.mockResolvedValue({ status: "ok", vista: vistaCR() });
    moverMock.mockResolvedValue({ status: "validation_error", fieldErrors: { id: ["No se puede mover"] }, bloqueo });
    const { user, onCerrar } = montar();
    await elegirYVer(user, /^Santa Ana/);
    await user.click(await screen.findByRole("button", { name: "Sí, mover" }));

    expect(await screen.findByText("37 órdenes abiertas, de 2 empresas:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí, mover" })).toBeDisabled();
    expect(onCerrar).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

describe("R35, P4 — el destino rechazado se dice al abrir el paso 2", () => {
  it("un destino retirado: «No se puede mover aquí.», con su motivo, y «Sí, mover» apagado", async () => {
    vistaPreviaMock.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { padreIdNuevo: [MENSAJE_DE_MOTIVO_DE_MOVER.destino_retirado] },
    });
    const { user } = montar();
    await elegirYVer(user, /^Tibás/);

    const dialogo = await screen.findByRole("dialog", { name: "¿Mover «San Rafael» a Tibás?" });
    const alerta = within(dialogo).getByRole("alert");
    expect(alerta).toHaveTextContent("No se puede mover aquí.");
    expect(alerta).toHaveTextContent("Tibás está retirado. Reactívalo o elige otro destino.");
    expect(within(dialogo).queryByRole("table")).toBeNull();
    expect(within(dialogo).getByRole("button", { name: "Sí, mover" })).toBeDisabled();
    expect(moverMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "conflict" }, "«Santa Ana» ya tiene un lugar llamado «San Rafael»."],
    [{ status: "not_found" }, "El lugar de destino ya no existe."],
    [
      { status: "validation_error", fieldErrors: { padreIdNuevo: [MENSAJE_DE_MOTIVO_DE_MOVER.destino_es_el_padre_actual] } },
      "«Santa Ana» ya es su cantón.",
    ],
    [
      { status: "validation_error", fieldErrors: { padreIdNuevo: [MENSAJE_DE_MOTIVO_DE_MOVER.destino_de_otra_profundidad] } },
      MENSAJE_DE_MOTIVO_DE_MOVER.destino_de_otra_profundidad,
    ],
  ])("%o → «%s»", async (respuesta, texto) => {
    vistaPreviaMock.mockResolvedValue(respuesta);
    const { user } = montar();
    await elegirYVer(user, /^Santa Ana/);
    expect(await screen.findByText(texto)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí, mover" })).toBeDisabled();
  });

  it("sin permiso (R34): avisa y cierra, sin escribir", async () => {
    vistaPreviaMock.mockResolvedValue({ status: "forbidden" });
    const { user, onCerrar } = montar();
    await elegirYVer(user, /^Santa Ana/);
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
    expect(toastMock.error).toHaveBeenCalledWith("No tienes permiso para esta acción.");
    expect(moverMock).not.toHaveBeenCalled();
  });
});

describe("funciones puras", () => {
  it("destinosDe: la profundidad del padre, la cadena, el padre actual y la disponibilidad en cascada", () => {
    const { destinos, padreActualId } = destinosDe(RAICES_4, RECREO);
    expect(padreActualId).toBe("vina");
    expect(destinos).toEqual([
      { id: "vina", nombre: "Viña", ascendientes: ["Costa", "Litoral"], disponible: true },
      { id: "quilpue", nombre: "Quilpué", ascendientes: ["Costa", "Marga Marga"], disponible: true },
    ]);
    // Una raíz no tiene destinos.
    expect(destinosDe(RAICES_4, { id: "costa", profundidad: 1 }).destinos).toEqual([]);
  });

  it("desgloseDeDescendientes: de arriba abajo, sin los niveles vacíos, con singular y plural", () => {
    expect(
      desgloseDeDescendientes([
        { profundidad: 4, tipoSingular: "Barrio", tipoPlural: "Barrios", cantidad: 12 },
      ]),
    ).toBe("12 barrios");
    expect(
      desgloseDeDescendientes([
        { profundidad: 3, tipoSingular: "Comuna", tipoPlural: "Comunas", cantidad: 1 },
        { profundidad: 4, tipoSingular: "Barrio", tipoPlural: "Barrios", cantidad: 0 },
        { profundidad: 5, tipoSingular: "Sector", tipoPlural: "Sectores", cantidad: 2 },
      ]),
    ).toBe("1 comuna y 2 sectores");
  });
});
