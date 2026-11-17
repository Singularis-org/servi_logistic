// @vitest-environment jsdom
// SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» (design §4; R1, R3–R12,
// R14–R16) — el formulario de planes guarda cada paso en el borrador del servidor, lo confirma al final y lo
// retoma al abrirse. Se montan el `PlanForm` y el `AbrirPlanForm` REALES con las cuatro actions del borrador
// como dobles (las inyecta la página).
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { PlanForm, type AccionesDelBorrador, type PlanFormProps } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import { AbrirPlanForm } from "@/app/(app)/plataforma/planes/_components/plan-form/AbrirPlanForm";
import { PASOS_DE_EDITAR, type BorradorVista, type GuardarPasoResult, type IdPasoBorrador, type LeerBorradorResult } from "@/lib/types/plan-borrador";
import type { PlanDTO, PlanResult } from "@/lib/types/planes";

const PLAN_ID = "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const B1 = "1a2b3c4d-1111-4e5f-8a9b-0c1d2e3f4a5b";
const B2 = "1a2b3c4d-2222-4e5f-8a9b-0c1d2e3f4a5b";
const GUARDADO_AT = "2026-11-17T15:30:00.000Z";
const MANANA = "2026-11-18";
const RANGO = { hoy: "2026-11-17", min: "2026-10-17", max: "2026-12-17" };
const OK: Extract<PlanResult, { estado: "ok" }> = {
  estado: "ok",
  planId: PLAN_ID,
  cambio: true,
  avisos: [],
  vigenteDesde: null,
};

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

afterEach(() => cleanup());

/** Las cuatro actions como dobles de vitest. */
type Dobles = { [K in keyof AccionesDelBorrador]: Mock<AccionesDelBorrador[K]> };

/** Un servidor del borrador en memoria: cada guardado `ok` suma su paso, con el id `B1`. */
function acciones(sobre: Partial<Dobles> = {}): Dobles {
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
    confirmar: vi.fn<AccionesDelBorrador["confirmar"]>().mockResolvedValue(OK),
    ...sobre,
  };
}

type Acciones = Dobles;

function propsDeCrear(a: Acciones, onGuardado = vi.fn()) {
  return {
    modo: "crear" as const,
    empresas: [],
    inicioCicloPorDefecto: MANANA,
    rangoInicioCiclo: RANGO,
    rangoFechaDeEfecto: RANGO,
    previsualizar: vi.fn().mockResolvedValue({ estado: "ok", avisos: [] }),
    borrador: a,
    onGuardado,
  };
}

function propsDeEditar(a: Acciones, onGuardado = vi.fn()) {
  return {
    modo: "editar" as const,
    plan: PLAN,
    precioDesdePorDefecto: MANANA,
    previsualizarCambio: vi.fn().mockResolvedValue({ estado: "ok", empresas: [], avisos: [] }),
    borrador: a,
    onGuardado,
  };
}

function montarCrear(a = acciones(), onGuardado = vi.fn()) {
  render(<PlanForm {...propsDeCrear(a, onGuardado)} borradorInicial={null} />);
  return { a, onGuardado };
}

function montarEditar(a = acciones(), extra: Partial<PlanFormProps> = {}) {
  const onGuardado = vi.fn();
  render(<PlanForm {...propsDeEditar(a, onGuardado)} borradorInicial={null} {...(extra as object)} />);
  return { a, onGuardado };
}

function diferida<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((r, x) => {
    resolver = r;
    rechazar = x;
  });
  return { promesa, resolver, rechazar };
}

const nav = () => screen.getByRole("navigation", { name: "Pasos" });
const botonDelPaso = (titulo: string | RegExp) => within(nav()).getByRole("button", { name: titulo });
const pasoActual = () => screen.getByRole("heading", { level: 3 }).textContent;
const guardarYContinuar = () => screen.getByRole("button", { name: "Guardar y continuar" });
const nombre = () => screen.getByRole("textbox", { name: "Nombre" });

/** Pulsa «Guardar y continuar» y espera a que el formulario llegue al paso `titulo`. */
async function guardarHasta(user: UserEvent, titulo: string) {
  for (let i = 0; i < 8 && pasoActual() !== titulo; i++) {
    const antes = pasoActual();
    await user.click(guardarYContinuar());
    await waitFor(() => expect(pasoActual()).not.toBe(antes));
  }
  expect(pasoActual()).toBe(titulo);
}

describe("R1 — Guardar y continuar guarda el paso en el borrador", () => {
  it("R1: crear guarda General sin borrador y el resto con su id", async () => {
    const user = userEvent.setup();
    const { a } = montarCrear();
    await user.type(nombre(), "Pro");
    await user.click(guardarYContinuar());

    await waitFor(() => expect(pasoActual()).toBe("Precio y descuentos"));
    expect(a.guardarPaso).toHaveBeenCalledTimes(1);
    expect(a.guardarPaso).toHaveBeenLastCalledWith({
      modo: "crear",
      borradorId: null,
      paso: "general",
      valores: { nombre: "Pro", visibilidad: "publico", organizacionId: null },
    });

    await user.click(guardarYContinuar());
    await waitFor(() => expect(pasoActual()).toBe("Cobro por orden"));
    expect(a.guardarPaso).toHaveBeenCalledTimes(2);
    expect(a.guardarPaso).toHaveBeenLastCalledWith({
      modo: "crear",
      borradorId: B1,
      paso: "precio",
      valores: { precio: { tipo: "sin_precio" } },
    });
  });

  it("R1: editar guarda cada paso con el plan", async () => {
    const user = userEvent.setup();
    const { a } = montarEditar();
    await guardarHasta(user, "Cobro por orden");

    expect(a.guardarPaso).toHaveBeenCalledTimes(2);
    expect(a.guardarPaso.mock.calls[0]![0]).toEqual({
      modo: "editar",
      planId: PLAN_ID,
      paso: "general",
      valores: { nombre: "Básico" },
    });
    expect(a.guardarPaso.mock.calls[1]![0]).toEqual({
      modo: "editar",
      planId: PLAN_ID,
      paso: "precio",
      valores: { precio: { tipo: "monto", mensual: "10", descuentos: [] } },
    });
  });

  it("R1: un paso con error no llama a guardar", async () => {
    const user = userEvent.setup();
    const { a } = montarCrear();
    await user.click(guardarYContinuar());

    expect(a.guardarPaso).not.toHaveBeenCalled();
    expect(pasoActual()).toBe("General");
    await waitFor(() => expect(nombre()).toHaveAttribute("aria-invalid", "true"));
  });
});

describe("R3 — un guardado rechazado no avanza", () => {
  it("R3: validation_error de un tope se pinta en Topes", async () => {
    const user = userEvent.setup();
    const a = acciones();
    const base = a.guardarPaso.getMockImplementation()!;
    a.guardarPaso.mockImplementation(async (input) =>
      input.paso === "topes"
        ? { estado: "validation_error", fieldErrors: { "topes.porRol.mensajero": ["Debe ser un entero."] } }
        : base(input),
    );
    montarEditar(a);
    await guardarHasta(user, "Topes");
    await user.click(guardarYContinuar());

    const campo = screen.getByLabelText("Usuarios activos con el rol Mensajero");
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(campo).toHaveFocus();
    expect(screen.getByText("Debe ser un entero.")).toBeInTheDocument();
    expect(pasoActual()).toBe("Topes");
    expect(botonDelPaso(/^Topes/)).not.toHaveAccessibleName("Topes (guardado)");
  });

  it("R3: archivado se pinta en el aviso del paso", async () => {
    const user = userEvent.setup();
    const a = acciones({ guardarPaso: vi.fn<AccionesDelBorrador["guardarPaso"]>().mockResolvedValue({ estado: "archivado" }) });
    montarEditar(a);
    await user.click(guardarYContinuar());

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("El plan está archivado.");
    await waitFor(() => expect(aviso).toHaveFocus());
    expect(pasoActual()).toBe("General");
    expect(screen.getByText("Aún sin guardar")).toBeInTheDocument();
  });

  it("R3: un fallo de red no avanza", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const a = acciones({ guardarPaso: vi.fn<AccionesDelBorrador["guardarPaso"]>().mockRejectedValue(new Error("red")) });
    montarCrear(a);
    await user.type(nombre(), "Pro");
    await user.click(guardarYContinuar());

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar el paso. Inténtalo de nuevo.");
    expect(pasoActual()).toBe("General");
    expect(nombre()).toHaveValue("Pro");
    expect(botonDelPaso("General")).toBeInTheDocument();
  });
});

describe("R4 — un solo guardado o confirmación en vuelo", () => {
  it("R4: con un guardado en vuelo no se puede confirmar ni guardar otra vez", async () => {
    const user = userEvent.setup();
    const a = acciones();
    const base = a.guardarPaso.getMockImplementation()!;
    const enVuelo = diferida<GuardarPasoResult>();
    a.guardarPaso.mockImplementationOnce(async (input) => {
      await enVuelo.promesa;
      return base(input);
    });
    montarCrear(a);
    await user.type(nombre(), "Pro");
    await user.click(guardarYContinuar());

    // Guardando General: ni otro guardado (botón o Enter) ni cambiar de paso.
    expect(guardarYContinuar()).toBeDisabled();
    for (const boton of within(nav()).getAllByRole("button")) expect(boton).toBeDisabled();
    await user.type(nombre(), "{Enter}");
    expect(a.guardarPaso).toHaveBeenCalledTimes(1);

    enVuelo.resolver({ estado: "ok", borradorId: B1, pasosGuardados: [], actualizadoAt: GUARDADO_AT });
    await waitFor(() => expect(pasoActual()).toBe("Precio y descuentos"));
    await guardarHasta(user, "Revisar y crear");

    // Confirmando: el botón final, «Anterior» y la lista quedan deshabilitados y un segundo clic no confirma.
    const confirmacion = diferida<PlanResult>();
    a.confirmar.mockReturnValueOnce(confirmacion.promesa);
    const final = screen.getByRole("button", { name: "Crear plan" });
    await user.click(final);
    expect(final).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    for (const boton of within(nav()).getAllByRole("button")) expect(boton).toBeDisabled();
    await user.click(final);
    expect(a.confirmar).toHaveBeenCalledTimes(1);
    confirmacion.resolver(OK);
  });
});

describe("R5, R6 — navegación, ✓ y Sin guardar", () => {
  it("R5: no se salta a Topes sin guardar Cobro por orden", async () => {
    const user = userEvent.setup();
    const { a } = montarCrear();
    await user.type(nombre(), "Pro");
    await guardarHasta(user, "Precio y descuentos");
    expect(botonDelPaso("Cobro por orden")).toBeDisabled();
    expect(botonDelPaso("Topes")).toBeDisabled();

    await guardarHasta(user, "Cobro por orden");
    expect(botonDelPaso("Topes")).toBeDisabled();
    await user.click(botonDelPaso("Topes"));
    expect(pasoActual()).toBe("Cobro por orden");

    // «Anterior» cambia de paso sin guardar.
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(pasoActual()).toBe("Precio y descuentos");
    expect(a.guardarPaso).toHaveBeenCalledTimes(2);
  });

  it("R6: tocar un paso guardado lo deja Sin guardar", async () => {
    const user = userEvent.setup();
    montarCrear();
    await user.type(nombre(), "Pro");
    await guardarHasta(user, "Precio y descuentos");
    await user.click(botonDelPaso("General (guardado)"));
    expect(pasoActual()).toBe("General");

    await user.type(nombre(), "x");
    const general = botonDelPaso(/^General/);
    expect(general).not.toHaveAccessibleName("General (guardado)");
    expect(within(general).getByText("Sin guardar")).toBeInTheDocument();

    // Volver al valor guardado le devuelve el ✓.
    await user.type(nombre(), "{Backspace}");
    expect(botonDelPaso("General (guardado)")).toBeInTheDocument();
  });
});

describe("R7 — estado del borrador", () => {
  it("R7: estado y hora tras guardar General", async () => {
    const user = userEvent.setup();
    montarCrear();
    expect(screen.getByText("Borrador · 0 de 5 pasos guardados")).toBeInTheDocument();
    expect(screen.getByText("Aún sin guardar")).toBeInTheDocument();
    expect(
      screen.getByText("Borrador: se guarda al continuar, pero no se aplica a ninguna empresa hasta el último paso."),
    ).toBeInTheDocument();

    await user.type(nombre(), "Pro");
    await guardarHasta(user, "Precio y descuentos");
    expect(screen.getByText("Borrador · 1 de 5 pasos guardados")).toBeInTheDocument();
    // 15:30 UTC son las 09:30 en la hora de la plataforma.
    expect(screen.getByText("Borrador guardado el 2026-11-17 09:30")).toBeInTheDocument();
    expect(screen.queryByText("Aún sin guardar")).not.toBeInTheDocument();
  });
});

describe("R8, R9 — confirmar", () => {
  it("R8: con Topes sin guardar no se confirma y el enlace lleva a Topes", async () => {
    const user = userEvent.setup();
    const { a } = montarCrear();
    await user.type(nombre(), "Pro");
    await guardarHasta(user, "Revisar y crear");
    await user.click(botonDelPaso("Topes (guardado)"));
    await user.type(screen.getByLabelText("Usuarios activos con el rol Mensajero"), "4");
    await user.click(botonDelPaso(/^Revisar y crear/));

    const final = screen.getByRole("button", { name: "Crear plan" });
    expect(final).toBeDisabled();
    expect(final).toHaveAccessibleDescription("Faltan pasos por guardar: Topes. Ir a Topes");
    await user.click(screen.getByRole("button", { name: "Ir a Topes" }));
    expect(pasoActual()).toBe("Topes");
    expect(a.confirmar).not.toHaveBeenCalled();
  });

  it("R8: confirmar llama una vez con el borrador y entrega el ok", async () => {
    const user = userEvent.setup();
    const sinCambios = { ...OK, cambio: false };
    const a = acciones({ confirmar: vi.fn<AccionesDelBorrador["confirmar"]>().mockResolvedValue(sinCambios) });
    const { onGuardado } = montarCrear(a);
    await user.type(nombre(), "Pro");
    await guardarHasta(user, "Revisar y crear");
    expect(screen.queryByText(/Faltan pasos por guardar/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(onGuardado).toHaveBeenCalledWith(sinCambios, "Pro"));
    expect(a.confirmar).toHaveBeenCalledTimes(1);
    expect(a.confirmar).toHaveBeenCalledWith({ borradorId: B1 });
  });

  it("R9: pasos_pendientes lleva al primero que falta", async () => {
    const user = userEvent.setup();
    const a = acciones({
      confirmar: vi
        .fn<AccionesDelBorrador["confirmar"]>()
        .mockResolvedValue({ estado: "pasos_pendientes", pasos: ["topes", "precio"] }),
    });
    montarCrear(a);
    await user.type(nombre(), "Pro");
    await guardarHasta(user, "Revisar y crear");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(pasoActual()).toBe("Precio y descuentos"));
    expect(botonDelPaso("General (guardado)")).toBeInTheDocument();
    expect(botonDelPaso("Precio y descuentos")).toBeInTheDocument();
    expect(botonDelPaso("Topes")).toBeInTheDocument();
    expect(screen.getByText("Borrador · 3 de 5 pasos guardados")).toBeInTheDocument();
  });

  it("R9: una fecha pasada al programar lleva a Cuándo rige", async () => {
    const user = userEvent.setup();
    const a = acciones({
      confirmar: vi.fn<AccionesDelBorrador["confirmar"]>().mockResolvedValue({
        estado: "validation_error",
        fieldErrors: { vigenteDesde: ["La fecha no puede ser anterior a hoy."] },
      }),
    });
    montarEditar(a);
    await guardarHasta(user, "Precio y descuentos");
    // Un cambio de precio pide «Rige desde» en Cuándo rige.
    const mensual = screen.getByLabelText("Costo base mensual");
    await user.clear(mensual);
    await user.type(mensual, "12");
    await guardarHasta(user, "Revisar y programar");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(pasoActual()).toBe("Cuándo rige"));
    expect(screen.getByText("La fecha no puede ser anterior a hoy.")).toBeInTheDocument();
  });

  it("R9: borrador_no_encontrado", async () => {
    const user = userEvent.setup();
    const a = acciones({
      confirmar: vi.fn<AccionesDelBorrador["confirmar"]>().mockResolvedValue({ estado: "borrador_no_encontrado" }),
    });
    montarCrear(a);
    await user.type(nombre(), "Pro");
    await guardarHasta(user, "Revisar y crear");
    await user.click(screen.getByRole("button", { name: "Crear plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este borrador ya no existe: se confirmó o se descartó en otra pantalla.",
    );
    expect(pasoActual()).toBe("Revisar y crear");
  });
});

describe("R10–R12 — guardado tardío y borrador compartido", () => {
  it("R10: un id nuevo al guardar avisa y deja solo ese paso guardado", async () => {
    const user = userEvent.setup();
    const guardarPaso = vi
      .fn<AccionesDelBorrador["guardarPaso"]>()
      .mockResolvedValueOnce({ estado: "ok", borradorId: B1, pasosGuardados: ["general"], actualizadoAt: GUARDADO_AT })
      .mockResolvedValueOnce({ estado: "ok", borradorId: B2, pasosGuardados: ["precio"], actualizadoAt: GUARDADO_AT });
    const a = acciones({ guardarPaso });
    montarEditar(a);
    await guardarHasta(user, "Cobro por orden");

    expect(
      screen.getByText(
        "El borrador que tenías abierto ya se programó o se descartó en otra pantalla. Lo que acabas de guardar abrió un borrador nuevo.",
      ),
    ).toBeInTheDocument();
    expect(botonDelPaso("General")).toBeInTheDocument();
    expect(botonDelPaso("Precio y descuentos (guardado)")).toBeInTheDocument();
    expect(screen.getByText("Borrador · 1 de 6 pasos guardados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descartar y empezar de nuevo" })).toBeInTheDocument();
  });

  it("R11: crear con el borrador borrado no guarda en otro", async () => {
    const user = userEvent.setup();
    const guardarPaso = vi
      .fn<AccionesDelBorrador["guardarPaso"]>()
      .mockResolvedValueOnce({ estado: "ok", borradorId: B1, pasosGuardados: ["general"], actualizadoAt: GUARDADO_AT })
      .mockResolvedValue({ estado: "borrador_no_encontrado" });
    const a = acciones({ guardarPaso });
    montarCrear(a);
    await user.type(nombre(), "Pro");
    await guardarHasta(user, "Precio y descuentos");
    await user.click(guardarYContinuar());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este borrador ya no existe: se confirmó o se descartó en otra pantalla.",
    );
    expect(pasoActual()).toBe("Precio y descuentos");
    await user.click(guardarYContinuar());
    await waitFor(() => expect(guardarPaso).toHaveBeenCalledTimes(3));
    // Nunca vuelve a guardar sin borrador: eso crearía otro plan nuevo.
    for (const [input] of guardarPaso.mock.calls.slice(1)) expect(input).toMatchObject({ borradorId: B1 });
  });

  it("R12: pasos ajenos se cargan y se avisa", async () => {
    const user = userEvent.setup();
    const ajeno: BorradorVista = {
      id: B1,
      modo: "editar",
      planId: PLAN_ID,
      pasos: { general: { nombre: "Básico" }, topes: { topes: { porRol: { mensajero: 9 }, apiKeys: null } } },
      pasosGuardados: ["general", "topes"],
      iniciadoPor: "Marta",
      iniciadoAt: GUARDADO_AT,
      actualizadoAt: GUARDADO_AT,
    };
    const a = acciones({
      guardarPaso: vi.fn<AccionesDelBorrador["guardarPaso"]>().mockResolvedValue({
        estado: "ok",
        borradorId: B1,
        pasosGuardados: ["general", "topes"],
        actualizadoAt: GUARDADO_AT,
      }),
      leer: vi.fn<AccionesDelBorrador["leer"]>().mockResolvedValue({ estado: "ok", borrador: ajeno }),
    });
    montarEditar(a);
    await user.clear(nombre());
    await user.type(nombre(), "Básico");
    await guardarHasta(user, "Precio y descuentos");

    expect(a.leer).toHaveBeenCalledWith({ borradorId: B1 });
    expect(
      screen.getByText("Otro superadmin guardó pasos de este borrador: se cargaron sus valores."),
    ).toBeInTheDocument();
    // Lo escrito en el paso actual se conserva.
    await user.type(screen.getByLabelText("Costo base mensual"), "5");
    expect(screen.getByLabelText("Costo base mensual")).toHaveValue("105");
    await user.click(botonDelPaso("Topes (guardado)"));
    expect(screen.getByLabelText("Usuarios activos con el rol Mensajero")).toHaveValue("9");
    expect(botonDelPaso("Topes (guardado)")).toBeInTheDocument();
  });
});

const RETOMADO: BorradorVista = {
  id: B1,
  modo: "editar",
  planId: PLAN_ID,
  pasos: { general: { nombre: "Básico Plus" }, precio: { precio: { tipo: "monto", mensual: "15.00", descuentos: [] } } },
  pasosGuardados: ["general", "precio"],
  iniciadoPor: "Marta",
  iniciadoAt: "2026-11-16T14:00:00.000Z",
  actualizadoAt: "2026-11-16T14:00:00.000Z",
};

describe("R14, R15 — abrir y retomar", () => {
  it("R14: cargando, error con Reintentar y plan sin borrador", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const primera = diferida<LeerBorradorResult>();
    const leer = vi
      .fn<AccionesDelBorrador["leer"]>()
      .mockImplementationOnce(() => primera.promesa)
      .mockResolvedValue({ estado: "ok", borrador: null });
    const a = acciones({ leer });
    render(<AbrirPlanForm {...propsDeEditar(a)} origen={{ planId: PLAN_ID }} onCerrar={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando el borrador…");
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(leer).toHaveBeenCalledWith({ planId: PLAN_ID });

    primera.rechazar(new Error("red"));
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("No se pudo leer el borrador.");

    await user.click(within(error).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("form")).toBeInTheDocument();
    expect(leer).toHaveBeenCalledTimes(2);
    expect(nombre()).toHaveValue("Básico");
    expect(pasoActual()).toBe("General");
    expect(screen.getByText("Borrador · 0 de 6 pasos guardados")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descartar y empezar de nuevo" })).not.toBeInTheDocument();
  });

  it("R14: retomar una creación que ya no existe ofrece Cerrar", async () => {
    const user = userEvent.setup();
    const onCerrar = vi.fn();
    const a = acciones();
    render(<AbrirPlanForm {...propsDeCrear(a)} origen={{ borradorId: B1 }} onCerrar={onCerrar} />);

    expect(await screen.findByText("Este borrador ya no existe.")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it("R15: editar retoma el borrador de otro superadmin con su aviso", async () => {
    const user = userEvent.setup();
    const a = acciones({ leer: vi.fn<AccionesDelBorrador["leer"]>().mockResolvedValue({ estado: "ok", borrador: RETOMADO }) });
    render(<AbrirPlanForm {...propsDeEditar(a)} origen={{ planId: PLAN_ID }} onCerrar={vi.fn()} />);

    expect(await screen.findByRole("form")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // 14:00 UTC son las 08:00 en la hora de la plataforma.
    expect(screen.getByText("Borrador de Marta, guardado el 2026-11-16 08:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descartar y empezar de nuevo" })).toBeInTheDocument();
    expect(pasoActual()).toBe("Cobro por orden");
    expect(botonDelPaso("General (guardado)")).toBeInTheDocument();
    expect(botonDelPaso("Precio y descuentos (guardado)")).toBeInTheDocument();
    expect(screen.queryByText("Sin guardar")).not.toBeInTheDocument();

    await user.click(botonDelPaso("General (guardado)"));
    expect(nombre()).toHaveValue("Básico Plus");
  });

  it("R15: retomar una creación en Topes", async () => {
    const creacion: BorradorVista = {
      id: B1,
      modo: "crear",
      planId: null,
      pasos: {
        general: { nombre: "Nuevo", visibilidad: "publico", organizacionId: null },
        precio: { precio: { tipo: "sin_precio" } },
        orden: { costoPorOrden: null, costoPorOrdenPorcentual: null, periodicidadOrdenes: "quincenal" },
      },
      pasosGuardados: ["general", "precio", "orden"],
      iniciadoPor: "Ana",
      iniciadoAt: GUARDADO_AT,
      actualizadoAt: GUARDADO_AT,
    };
    const a = acciones({ leer: vi.fn<AccionesDelBorrador["leer"]>().mockResolvedValue({ estado: "ok", borrador: creacion }) });
    render(<AbrirPlanForm {...propsDeCrear(a)} origen={{ borradorId: B1 }} onCerrar={vi.fn()} />);

    expect(await screen.findByRole("form")).toBeInTheDocument();
    expect(a.leer).toHaveBeenCalledWith({ borradorId: B1 });
    expect(pasoActual()).toBe("Topes");
    expect(screen.getByText("Borrador · 3 de 5 pasos guardados")).toBeInTheDocument();
    expect(screen.getByText("Borrador de Ana, guardado el 2026-11-17 09:30")).toBeInTheDocument();
    expect(screen.queryByText("Sin guardar")).not.toBeInTheDocument();
  });
});

describe("R16 — Descartar y empezar de nuevo", () => {
  it("R16: descartar y empezar de nuevo", async () => {
    const user = userEvent.setup();
    const a = acciones();
    render(<PlanForm {...propsDeEditar(a)} borradorInicial={RETOMADO} />);
    await user.click(screen.getByRole("button", { name: "Descartar y empezar de nuevo" }));

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent(
      "¿Descartar el borrador? Se borran todos sus pasos guardados. No se puede deshacer.",
    );
    expect(a.descartar).not.toHaveBeenCalled();
    await user.click(within(dialogo).getByRole("button", { name: "Descartar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(a.descartar).toHaveBeenCalledWith({ borradorId: B1 });
    expect(pasoActual()).toBe("General");
    expect(nombre()).toHaveValue("Básico");
    expect(screen.getByText("Borrador · 0 de 6 pasos guardados")).toBeInTheDocument();
    expect(screen.queryByText(/Borrador de Marta/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descartar y empezar de nuevo" })).not.toBeInTheDocument();
    expect(botonDelPaso("General")).toBeInTheDocument();
  });

  it("R16: borrador_no_encontrado al descartar también empieza de nuevo", async () => {
    const user = userEvent.setup();
    const a = acciones({
      descartar: vi.fn<AccionesDelBorrador["descartar"]>().mockResolvedValue({ estado: "borrador_no_encontrado" }),
    });
    render(<PlanForm {...propsDeEditar(a)} borradorInicial={RETOMADO} />);
    await user.click(screen.getByRole("button", { name: "Descartar y empezar de nuevo" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Descartar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Borrador · 0 de 6 pasos guardados")).toBeInTheDocument();
  });

  it("R16: un fallo al descartar no toca el formulario", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const a = acciones({ descartar: vi.fn<AccionesDelBorrador["descartar"]>().mockRejectedValue(new Error("red")) });
    render(<PlanForm {...propsDeEditar(a)} borradorInicial={RETOMADO} />);
    await user.click(screen.getByRole("button", { name: "Descartar y empezar de nuevo" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Descartar" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "No se pudo descartar el borrador. Inténtalo de nuevo.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Borrador de Marta, guardado el 2026-11-16 08:00")).toBeInTheDocument();
    expect(screen.getByText("Borrador · 2 de 6 pasos guardados")).toBeInTheDocument();
    expect(pasoActual()).toBe("Cobro por orden");
  });
});
