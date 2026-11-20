// @vitest-environment jsdom
// SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» (design §5; R17–R20) —
// al editar, «Cuándo rige» y «Revisar y programar» muestran cuándo recibe el cambio cada empresa del plan y los
// topes que ya pasa. Se monta el `PlanForm` REAL con las actions del borrador y `previsualizarCambio` como dobles.
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import {
  PlanForm,
  type AccionesDelBorrador,
  type PrevisualizarCambioInput,
} from "@/app/(app)/plataforma/planes/_components/PlanForm";
import { PASOS_DE_EDITAR, type IdPasoBorrador } from "@/lib/types/plan-borrador";
import type { FechaDeEmpresa, PlanDTO, VistaPreviaCambioResult } from "@/lib/types/planes";

const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const B1 = "1a2b3c4d-1111-4e5f-8a9b-0c1d2e3f4a5b";
const E1 = "2b3c4d5e-1111-4e5f-8a9b-0c1d2e3f4a5b";
const E2 = "2b3c4d5e-2222-4e5f-8a9b-0c1d2e3f4a5b";
const GUARDADO_AT = "2026-11-17T15:30:00.000Z";
const MANANA = "2026-11-18";

const PLAN: PlanDTO = {
  id: PLAN_ID,
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { porRol: { mensajero: 5 }, apiKeys: null },
  modulos: ["analitica"],
  precio: { tipo: "monto", mensual: "10.00", descuentos: {} },
  costoPorOrden: null,
  costoPorOrdenPorcentual: null,
  archivado: false,
};

const EMPRESAS: FechaDeEmpresa[] = [
  { empresaId: E1, empresa: "Acme", tipoCobro: "mensual", recibeEl: "2026-12-01" },
  { empresaId: E2, empresa: "Beta", tipoCobro: "quincenal", recibeEl: "2026-12-16" },
];

afterEach(() => cleanup());

/** Un servidor del borrador en memoria: cada guardado `ok` suma su paso. */
function acciones(): AccionesDelBorrador {
  const guardados = new Set<IdPasoBorrador>();
  return {
    guardarPaso: vi.fn<AccionesDelBorrador["guardarPaso"]>(async (input) => {
      guardados.add(input.paso);
      return {
        estado: "ok",
        borradorId: B1,
        pasosGuardados: PASOS_DE_EDITAR.filter((p) => guardados.has(p)),
        actualizadoAt: GUARDADO_AT,
      };
    }),
    leer: vi.fn<AccionesDelBorrador["leer"]>().mockResolvedValue({ estado: "ok", borrador: null }),
    descartar: vi.fn<AccionesDelBorrador["descartar"]>().mockResolvedValue({ estado: "ok" }),
    confirmar: vi.fn<AccionesDelBorrador["confirmar"]>(),
  };
}

type Previsualizar = Mock<(input: PrevisualizarCambioInput) => Promise<VistaPreviaCambioResult>>;

function montar(previsualizarCambio: Previsualizar) {
  render(
    <PlanForm
      modo="editar"
      plan={PLAN}
      precioDesdePorDefecto={MANANA}
      previsualizarCambio={previsualizarCambio}
      borrador={acciones()}
      borradorInicial={null}
      onGuardado={vi.fn()}
    />,
  );
}

function ok(empresas: FechaDeEmpresa[], avisos: Extract<VistaPreviaCambioResult, { estado: "ok" }>["avisos"] = []) {
  return { estado: "ok" as const, empresas, avisos };
}

function diferida<T>() {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

const pasoActual = () => screen.getByRole("heading", { level: 3 }).textContent;
const guardarYContinuar = () => screen.getByRole("button", { name: "Guardar y continuar" });

async function guardarHasta(user: UserEvent, titulo: string) {
  for (let i = 0; i < 8 && pasoActual() !== titulo; i++) {
    const antes = pasoActual();
    await user.click(guardarYContinuar());
    await waitFor(() => expect(pasoActual()).not.toBe(antes));
  }
  expect(pasoActual()).toBe(titulo);
}

/** En «Cuándo rige», «A partir de» con esa fecha. SLT-135 (R14): el campo ya está, sin elegir nada antes. */
async function programarEl(_user: UserEvent, fecha: string) {
  fireEvent.change(screen.getByLabelText("A partir de"), { target: { value: fecha } });
}

/** Las filas de la tabla, sin la cabecera, como texto por celda. */
function filas() {
  const [, ...cuerpo] = within(screen.getByRole("table")).getAllByRole("row");
  return cuerpo.map((f) => within(f).getAllByRole("cell").map((c) => c.textContent));
}

describe("R17 — la fecha en que cada empresa recibe el cambio", () => {
  it("R17: una fila por empresa con su fecha", async () => {
    const user = userEvent.setup();
    const previsualizar: Previsualizar = vi.fn().mockResolvedValue(ok(EMPRESAS));
    montar(previsualizar);
    await guardarHasta(user, "Cuándo rige");
    await programarEl(user, "2026-12-01");

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(previsualizar).toHaveBeenLastCalledWith({
      planId: PLAN_ID,
      vigenteDesde: "2026-12-01",
      topes: PLAN.topes,
    });
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Empresa",
      "Período",
      "Recibe el cambio el",
    ]);
    expect(filas()).toEqual([
      ["Acme", "Mensual", "2026-12-01"],
      ["Beta", "Quincenal", "2026-12-16"],
    ]);

    // «Revisar y programar» pinta lo mismo.
    await guardarHasta(user, "Revisar y programar");
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(filas()).toEqual([
      ["Acme", "Mensual", "2026-12-01"],
      ["Beta", "Quincenal", "2026-12-16"],
    ]);
  });

  // SLT-135 (R19): sustituye «R17: De inmediato no muestra la tabla»; sin tocar nada, la fecha es mañana.
  it("R19: con la fecha por defecto se pide y se muestra la tabla", async () => {
    const user = userEvent.setup();
    const previsualizar: Previsualizar = vi.fn().mockResolvedValue(ok(EMPRESAS));
    montar(previsualizar);
    await guardarHasta(user, "Cuándo rige");
    expect(screen.getByLabelText("A partir de")).toHaveValue(MANANA);

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(previsualizar).toHaveBeenCalledWith({ planId: PLAN_ID, vigenteDesde: MANANA, topes: PLAN.topes });
    expect(filas()).toEqual([
      ["Acme", "Mensual", "2026-12-01"],
      ["Beta", "Quincenal", "2026-12-16"],
    ]);

    // «Revisar y programar» también la pinta.
    await guardarHasta(user, "Revisar y programar");
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
  });

  it("R17: los pasos de antes no piden la fecha", async () => {
    const user = userEvent.setup();
    const previsualizar: Previsualizar = vi.fn().mockResolvedValue(ok(EMPRESAS));
    montar(previsualizar);
    await guardarHasta(user, "Módulos");
    await new Promise((r) => setTimeout(r, 400));
    expect(previsualizar).not.toHaveBeenCalled();
  });
});

describe("R18 — los topes que cada empresa ya pasa", () => {
  it("R18: aviso por empresa y el botón final sigue habilitado", async () => {
    const user = userEvent.setup();
    const previsualizar: Previsualizar = vi.fn().mockResolvedValue(
      ok(EMPRESAS, [
        { organizacionId: E1, empresa: "Acme", tope: "mensajero", usados: 7, maximo: 5 },
        { organizacionId: E2, empresa: "Beta", tope: "api_keys", usados: 3, maximo: 1 },
      ]),
    );
    montar(previsualizar);
    await guardarHasta(user, "Cuándo rige");
    await programarEl(user, "2026-12-01");

    const acme = await screen.findByRole("region", { name: "Acme" });
    expect(acme).toHaveTextContent("La empresa ya tiene 7 de 5");
    expect(screen.getByRole("region", { name: "Beta" })).toHaveTextContent("La empresa ya tiene 3 de 1 API keys activas");

    await guardarHasta(user, "Revisar y programar");
    expect(await screen.findByRole("region", { name: "Acme" })).toHaveTextContent("La empresa ya tiene 7 de 5");
    expect(screen.getByRole("button", { name: "Programar cambio" })).toBeEnabled();
  });
});

describe("R19 — plan sin empresas", () => {
  it("R19: plan sin empresas", async () => {
    const user = userEvent.setup();
    const previsualizar: Previsualizar = vi.fn().mockResolvedValue(ok([]));
    montar(previsualizar);
    await guardarHasta(user, "Cuándo rige");
    await programarEl(user, "2026-12-01");

    expect(
      await screen.findByText("Este plan no tiene empresas: el cambio pasa al plan el 2026-12-01."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("R20 — cargando, error y respuestas viejas", () => {
  it("R20: cargando", async () => {
    const user = userEvent.setup();
    const lectura = diferida<VistaPreviaCambioResult>();
    const previsualizar: Previsualizar = vi.fn().mockReturnValue(lectura.promesa);
    montar(previsualizar);
    await guardarHasta(user, "Cuándo rige");
    await programarEl(user, "2026-12-01");
    await guardarHasta(user, "Revisar y programar");

    await waitFor(() => expect(previsualizar).toHaveBeenCalled());
    expect(screen.getByText("Calculando la fecha de cada empresa…")).toHaveAttribute("role", "status");
    // La carga no bloquea el botón final (design §5.4).
    expect(screen.getByRole("button", { name: "Programar cambio" })).toBeEnabled();

    lectura.resolver(ok(EMPRESAS));
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(screen.queryByText("Calculando la fecha de cada empresa…")).not.toBeInTheDocument();
  });

  it("R20: error con Reintentar", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const previsualizar: Previsualizar = vi
      .fn()
      .mockRejectedValueOnce(new Error("red"))
      .mockResolvedValueOnce({ estado: "forbidden" })
      .mockResolvedValue(ok(EMPRESAS));
    montar(previsualizar);
    await guardarHasta(user, "Cuándo rige");
    await programarEl(user, "2026-12-01");
    // Lanza: el error.
    expect(await screen.findByText("No se pudo calcular la fecha de cada empresa.")).toBeInTheDocument();
    // Una respuesta que no es `ok` también es un error.
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(previsualizar).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No se pudo calcular la fecha de cada empresa.")).toBeInTheDocument();

    // Misma entrada en «Revisar y programar»: el mismo error, sin releer.
    await guardarHasta(user, "Revisar y programar");
    expect(screen.getByText("No se pudo calcular la fecha de cada empresa.")).toBeInTheDocument();
    // El error no bloquea el botón final (design §5.4).
    expect(screen.getByRole("button", { name: "Programar cambio" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(screen.queryByText("No se pudo calcular la fecha de cada empresa.")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("R20: una respuesta vieja no se pinta", async () => {
    const user = userEvent.setup();
    const vieja = diferida<VistaPreviaCambioResult>();
    const nueva = diferida<VistaPreviaCambioResult>();
    const previsualizar: Previsualizar = vi
      .fn()
      .mockImplementation((input: PrevisualizarCambioInput) =>
        input.vigenteDesde === "2026-12-01" ? vieja.promesa : nueva.promesa,
      );
    montar(previsualizar);
    await guardarHasta(user, "Cuándo rige");
    await programarEl(user, "2026-12-01");
    await waitFor(() => expect(previsualizar).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("A partir de"), { target: { value: "2026-12-05" } });
    await waitFor(() => expect(previsualizar).toHaveBeenCalledTimes(2));
    nueva.resolver(ok([{ ...EMPRESAS[0]!, recibeEl: "2026-12-05" }]));
    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

    vieja.resolver(ok([{ ...EMPRESAS[1]!, recibeEl: "2026-12-16" }]));
    await new Promise((r) => setTimeout(r, 50));
    expect(filas()).toEqual([["Acme", "Mensual", "2026-12-05"]]);
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });
});
