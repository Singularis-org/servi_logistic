// @vitest-environment jsdom
// SLT-121 (design §7.2; R3, R22, R31, R32) — la sección «Plazo de pago y mora» del detalle de una empresa en
// Plataforma > Empresas. Se monta el componente real con dobles de las dos actions (ya ligadas a la empresa, como
// en la página) y se lee lo que pinta. Los textos van escritos a mano; los importes, con el `money` de la pantalla
// (es el formato de la moneda, no el texto que se mide).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { money } from "@/lib/config/moneda";
import type {
  DescongelarResult,
  EstadoMora,
  FijarGraciaResult,
  FilaHistorialMora,
  MoraEmpresaVista,
} from "@/lib/types/mora";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { MoraEmpresa } from "@/app/(app)/plataforma/empresas/[organizacionId]/_components/MoraEmpresa";

const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const F2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const VENCIDA_1 = { facturaId: F1, numero: 3, fechaLimite: "2026-11-08", saldo: "50000.00" };
const VENCIDA_2 = { facturaId: F2, numero: 4, fechaLimite: "2026-11-15", saldo: "25000.00" };

const HISTORIAL: FilaHistorialMora[] = [
  {
    id: "h2",
    accion: "empresa_congelada",
    createdAt: new Date("2026-11-19T07:00:00Z"),
    actorNombre: null,
    actorRol: null,
    monto: "75000.00",
    valorAnterior: null,
    valorNuevo: "3, 4",
  },
  {
    id: "h1",
    accion: "factura_dias_gracia_cambiada",
    createdAt: new Date("2026-11-02T16:00:00Z"),
    actorNombre: "Sofía Plataforma",
    actorRol: null,
    monto: null,
    valorAnterior: "7 (global)",
    valorNuevo: "15",
  },
];

const CONGELADA: EstadoMora = {
  estado: "congelada",
  // 19 nov 2026, 01:00 de la plataforma.
  desde: new Date("2026-11-19T07:00:00Z"),
  facturas: [VENCIDA_1, VENCIDA_2],
  saldoVencido: "75000.00",
};

function vista(parcial: Partial<MoraEmpresaVista> = {}): MoraEmpresaVista {
  return {
    gracia: { dias: 15, origen: "propia", propia: 15, global: 7 },
    estado: CONGELADA,
    facturas: [
      { ...VENCIDA_1, vencida: true },
      { ...VENCIDA_2, vencida: true },
    ],
    facturasVencidas: [VENCIDA_1, VENCIDA_2],
    descongelar: { desde: "2026-11-21", hasta: "2027-01-20", porDefecto: "2026-11-28" },
    historial: HISTORIAL,
    ...parcial,
  };
}

type Fijar = (i: { dias: number | null }) => Promise<FijarGraciaResult>;
type Descongelar = (i: { motivo: string; hasta: string }) => Promise<DescongelarResult>;

function montar(
  datos: MoraEmpresaVista | null = vista(),
  {
    fijarGracia = vi.fn<Fijar>().mockResolvedValue({ estado: "ok" }),
    descongelar = vi.fn<Descongelar>().mockResolvedValue({ estado: "ok" }),
  } = {},
) {
  render(<MoraEmpresa datos={datos} fijarGracia={fijarGracia} descongelar={descongelar} />);
  return { fijarGracia, descongelar };
}

function seccion() {
  return within(screen.getByRole("region", { name: "Plazo de pago y mora" }));
}

function campoGracia() {
  return seccion().getByLabelText("Días de gracia propios");
}

async function abrirDescongelar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(seccion().getByRole("button", { name: "Descongelar…" }));
  return within(await screen.findByRole("dialog"));
}

beforeEach(() => {
  refreshMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SLT-121 R32 — lo que ve el superadmin", () => {
  it("la gracia propia con su valor y el campo con ese valor", () => {
    montar();
    expect(screen.getByRole("heading", { level: 2, name: "Plazo de pago y mora" })).toBeInTheDocument();
    expect(seccion().getByText("15 días (propia)")).toBeInTheDocument();
    expect(campoGracia()).toHaveValue(15);
  });

  it("la gracia global con su valor, el campo vacío y sin «Usar la global»", () => {
    montar(vista({ gracia: { dias: 7, origen: "global", propia: null, global: 7 } }));
    expect(seccion().getByText("7 días (global)")).toBeInTheDocument();
    expect(campoGracia()).toHaveValue(null);
    expect(seccion().queryByRole("button", { name: "Usar la global" })).not.toBeInTheDocument();
  });

  it.each<[string, EstadoMora, string]>([
    ["al día", { estado: "al_dia" }, "Al día"],
    ["en plazo, con su fecha límite", { estado: "en_plazo", fechaLimite: "2026-12-05" }, "En plazo · fecha límite 05/12/2026"],
    ["vencida", { estado: "vencida", facturas: [VENCIDA_1], saldoVencido: "50000.00" }, "Vencida"],
    ["congelada, desde cuándo", CONGELADA, "Congelada desde el 19 nov 2026"],
    ["descongelada a mano, hasta cuándo", { estado: "descongelada_a_mano", hasta: "2026-11-30" }, "Descongelada a mano hasta el 30/11/2026"],
  ])("el estado %s", (_caso, estado, texto) => {
    montar(vista({ estado }));
    expect(seccion().getByText(texto)).toBeInTheDocument();
  });

  it("las facturas vencidas con número, fecha límite y saldo, y el saldo vencido", () => {
    montar();
    const tabla = within(seccion().getByRole("table", { name: "Facturas vencidas" }));
    const filas = tabla.getAllByRole("row").slice(1);
    expect(filas).toHaveLength(2);
    expect(within(filas[0]).getByText("N.º 3")).toBeInTheDocument();
    expect(within(filas[0]).getByText("08/11/2026")).toBeInTheDocument();
    expect(within(filas[0]).getByText(money("50000.00"))).toBeInTheDocument();
    expect(within(filas[1]).getByText("N.º 4")).toBeInTheDocument();
    expect(seccion().getByText(`Saldo vencido: ${money("75000.00")}`)).toBeInTheDocument();
  });

  it("descongelada a mano también enseña las vencidas (el estado no las trae)", () => {
    montar(vista({ estado: { estado: "descongelada_a_mano", hasta: "2026-11-30" } }));
    const tabla = within(seccion().getByRole("table", { name: "Facturas vencidas" }));
    expect(tabla.getAllByRole("row").slice(1)).toHaveLength(2);
  });

  it("sin vencidas dice «No hay facturas vencidas»", () => {
    montar(vista({ estado: { estado: "al_dia" }, facturas: [], facturasVencidas: [] }));
    expect(seccion().getByText("No hay facturas vencidas")).toBeInTheDocument();
    expect(seccion().queryByRole("table", { name: "Facturas vencidas" })).not.toBeInTheDocument();
  });

  it("una lectura fallida (`null`) dice «No se pudo cargar la mora» sin controles", () => {
    montar(null);
    expect(seccion().getByText("No se pudo cargar la mora")).toBeInTheDocument();
    expect(seccion().queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("SLT-121 R31 — el historial de la mora", () => {
  it("una fila por movimiento: fecha, acción, quién (o «Sistema») y el detalle", () => {
    montar();
    const tabla = within(seccion().getByRole("table", { name: "Historial de la mora" }));
    const [congelo, gracia] = tabla.getAllByRole("row").slice(1);
    expect(within(congelo).getByText("19 nov 2026")).toBeInTheDocument();
    expect(within(congelo).getByText("Congeló la operación por mora")).toBeInTheDocument();
    expect(within(congelo).getByText("Sistema")).toBeInTheDocument();
    expect(within(congelo).getByText(`3, 4 · ${money("75000.00")}`)).toBeInTheDocument();
    expect(within(gracia).getByText("Cambió los días de gracia para pagar las facturas")).toBeInTheDocument();
    expect(within(gracia).getByText("Sofía Plataforma")).toBeInTheDocument();
    expect(within(gracia).getByText("7 (global) → 15")).toBeInTheDocument();
  });

  it("sin movimientos dice «Sin movimientos de mora»", () => {
    montar(vista({ historial: [] }));
    expect(seccion().getByText("Sin movimientos de mora")).toBeInTheDocument();
  });
});

describe("SLT-121 R3, R32 — cambiar o quitar la gracia propia", () => {
  it("«Guardar» manda el entero y refresca", async () => {
    const user = userEvent.setup();
    const { fijarGracia } = montar();
    await user.clear(campoGracia());
    await user.type(campoGracia(), "30");
    await user.click(seccion().getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(fijarGracia).toHaveBeenCalledWith({ dias: 30 }));
    expect(refreshMock).toHaveBeenCalled();
  });

  it("«Usar la global» manda `null` y refresca", async () => {
    const user = userEvent.setup();
    const { fijarGracia } = montar();
    await user.click(seccion().getByRole("button", { name: "Usar la global" }));
    await waitFor(() => expect(fijarGracia).toHaveBeenCalledWith({ dias: null }));
    expect(refreshMock).toHaveBeenCalled();
  });

  it.each(["0", "61", "", "-3", "7.5"])("«%s» no llega al servidor y marca el campo", async (valor) => {
    const user = userEvent.setup();
    const { fijarGracia } = montar();
    await user.clear(campoGracia());
    if (valor !== "") await user.type(campoGracia(), valor);
    await user.click(seccion().getByRole("button", { name: "Guardar" }));
    expect(await seccion().findByText("La gracia debe ser un número entero de 1 a 60 días.")).toBeInTheDocument();
    expect(campoGracia()).toHaveAttribute("aria-invalid", "true");
    expect(fijarGracia).not.toHaveBeenCalled();
  });

  it("el `validation_error` del servidor se pinta bajo el campo y no refresca", async () => {
    const user = userEvent.setup();
    const { fijarGracia } = montar(vista(), {
      fijarGracia: vi.fn<Fijar>().mockResolvedValue({ estado: "validation_error", errores: { dias: "Del servidor." } }),
    });
    await user.clear(campoGracia());
    await user.type(campoGracia(), "20");
    await user.click(seccion().getByRole("button", { name: "Guardar" }));
    expect(await seccion().findByText("Del servidor.")).toBeInTheDocument();
    expect(fijarGracia).toHaveBeenCalledOnce();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("`forbidden` muestra «No tienes permiso…» como alerta", async () => {
    const user = userEvent.setup();
    montar(vista(), { fijarGracia: vi.fn<Fijar>().mockResolvedValue({ estado: "forbidden" }) });
    await user.click(seccion().getByRole("button", { name: "Guardar" }));
    expect(await seccion().findByRole("alert")).toHaveTextContent(
      "No tienes permiso para cambiar la mora de una empresa.",
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("SLT-121 R22, R32 — descongelar a mano", () => {
  it.each<[string, EstadoMora]>([
    ["al día", { estado: "al_dia" }],
    ["en plazo", { estado: "en_plazo", fechaLimite: "2026-12-05" }],
    ["vencida", { estado: "vencida", facturas: [VENCIDA_1], saldoVencido: "50000.00" }],
    ["descongelada a mano", { estado: "descongelada_a_mano", hasta: "2026-11-30" }],
  ])("«Descongelar…» no aparece si está %s", (_caso, estado) => {
    montar(vista({ estado }));
    expect(seccion().queryByRole("button", { name: "Descongelar…" })).not.toBeInTheDocument();
  });

  it("el diálogo propone hoy + 7, acota la fecha y limita el motivo a 200", async () => {
    const user = userEvent.setup();
    montar();
    const dialogo = await abrirDescongelar(user);
    const hasta = dialogo.getByLabelText(/Habilitada hasta/);
    expect(hasta).toHaveValue("2026-11-28");
    expect(hasta).toHaveAttribute("min", "2026-11-21");
    expect(hasta).toHaveAttribute("max", "2027-01-20");
    expect(dialogo.getByLabelText(/Motivo/)).toHaveAttribute("maxLength", "200");
  });

  it("con motivo y fecha manda el motivo recortado y la fecha, cierra y refresca", async () => {
    const user = userEvent.setup();
    const { descongelar } = montar();
    const dialogo = await abrirDescongelar(user);
    await user.type(dialogo.getByLabelText(/Motivo/), "  Acuerdo de pago  ");
    await user.click(dialogo.getByRole("button", { name: "Descongelar" }));
    await waitFor(() => expect(descongelar).toHaveBeenCalledWith({ motivo: "Acuerdo de pago", hasta: "2026-11-28" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(refreshMock).toHaveBeenCalled();
  });

  it("sin motivo no llega al servidor y marca el campo", async () => {
    const user = userEvent.setup();
    const { descongelar } = montar();
    const dialogo = await abrirDescongelar(user);
    await user.type(dialogo.getByLabelText(/Motivo/), "   ");
    await user.click(dialogo.getByRole("button", { name: "Descongelar" }));
    expect(
      await dialogo.findByText("El motivo es obligatorio y tiene como máximo 200 caracteres."),
    ).toBeInTheDocument();
    expect(descongelar).not.toHaveBeenCalled();
  });

  it("una fecha fuera del rango no llega al servidor", async () => {
    const user = userEvent.setup();
    const { descongelar } = montar();
    const dialogo = await abrirDescongelar(user);
    await user.type(dialogo.getByLabelText(/Motivo/), "Acuerdo");
    const hasta = dialogo.getByLabelText(/Habilitada hasta/);
    await user.clear(hasta);
    await user.type(hasta, "2027-02-01");
    await user.click(dialogo.getByRole("button", { name: "Descongelar" }));
    expect(
      await dialogo.findByText("La fecha hasta debe estar entre hoy y dentro de 60 días."),
    ).toBeInTheDocument();
    expect(descongelar).not.toHaveBeenCalled();
  });

  it.each<[DescongelarResult, string]>([
    [{ estado: "no_congelada" }, "La empresa no está congelada."],
    [{ estado: "not_found" }, "La empresa no existe."],
    [{ estado: "forbidden" }, "No tienes permiso para cambiar la mora de una empresa."],
  ])("un resultado %o se muestra en el diálogo, que sigue abierto", async (resultado, mensaje) => {
    const user = userEvent.setup();
    montar(vista(), { descongelar: vi.fn<Descongelar>().mockResolvedValue(resultado) });
    const dialogo = await abrirDescongelar(user);
    await user.type(dialogo.getByLabelText(/Motivo/), "Acuerdo");
    await user.click(dialogo.getByRole("button", { name: "Descongelar" }));
    expect(await dialogo.findByRole("alert")).toHaveTextContent(mensaje);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("el `validation_error` del servidor se pinta bajo su campo", async () => {
    const user = userEvent.setup();
    montar(vista(), {
      descongelar: vi
        .fn<Descongelar>()
        .mockResolvedValue({ estado: "validation_error", errores: { hasta: "Fecha del servidor." } }),
    });
    const dialogo = await abrirDescongelar(user);
    await user.type(dialogo.getByLabelText(/Motivo/), "Acuerdo");
    await user.click(dialogo.getByRole("button", { name: "Descongelar" }));
    expect(await dialogo.findByText("Fecha del servidor.")).toBeInTheDocument();
    expect(dialogo.getByLabelText(/Habilitada hasta/)).toHaveAttribute("aria-invalid", "true");
  });
});
