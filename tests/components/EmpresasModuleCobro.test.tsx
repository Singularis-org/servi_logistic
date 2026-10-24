// @vitest-environment jsdom
// SL-40 (R9–R11, design §9.1 y §11.3) — EL COBRO POR ORDEN EN «EMPRESAS».
//
// Se monta el `EmpresasModule` real con las actions como dobles: el bloque del valor global, la
// columna de cada fila con «propio» o «global», fijar y quitar la excepción, los errores junto al
// campo o genéricos, que lo escrito se conserva tras un fallo y que un éxito refresca la página.
// Los importes de las aserciones son distintos entre sí (500, 300, 0) para que pintar el de otra
// fila no pueda pasar en verde.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { EmpresaListada } from "@/lib/types/empresas-plataforma";
import type { CobroGlobalDTO, FijarCobroResult } from "@/lib/types/cobro-plataforma";
import { money } from "@/lib/config/moneda";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { EmpresasModule } from "@/app/(app)/plataforma/empresas/_components/EmpresasModule";

const NORTE: EmpresaListada = {
  id: "org-2",
  nombre: "Envíos Norte",
  slug: "envios-norte",
  creadaEn: new Date("2026-10-20T12:00:00Z"),
  maestros: [{ nombre: "Ana Pérez", email: "ana@norte.test" }],
  cobroPorOrden: "300.00",
  // SL-45 (R28): el Record del listado exige la deuda; aquí, al día.
  deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
  pagadoPlataforma: "0.00",
};
const SUR: EmpresaListada = {
  id: "org-1",
  nombre: "Reparto Sur",
  slug: "reparto-sur",
  creadaEn: new Date("2026-09-05T12:00:00Z"),
  maestros: [],
  cobroPorOrden: null,
  // SL-45 (R28): el Record del listado exige la deuda; aquí, al día.
  deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
  pagadoPlataforma: "0.00",
};

const SIN_CONFIGURAR = "Sin configurar (0,00)";
const GUARDADO = "Cobro guardado.";
const ERROR_MONTO = "Escribe un importe mayor o igual que cero, con dos decimales como máximo.";
const ERROR_GENERICO = "No se pudo guardar el cobro. Inténtalo de nuevo.";
const ERROR_NO_EXISTE = "Esa empresa ya no existe.";

type Fijar = ReturnType<typeof vi.fn<(input: unknown) => Promise<FijarCobroResult>>>;

function montar(opts: {
  cobroGlobal?: CobroGlobalDTO | null;
  empresas?: EmpresaListada[];
  fijarCobroGlobal?: Fijar;
  fijarCobroEmpresa?: Fijar;
} = {}) {
  const fijarCobroGlobal = opts.fijarCobroGlobal ?? vi.fn().mockResolvedValue({ status: "ok" });
  const fijarCobroEmpresa = opts.fijarCobroEmpresa ?? vi.fn().mockResolvedValue({ status: "ok" });
  const props = {
    empresas: opts.empresas ?? [NORTE, SUR],
    tiposDocumento: [{ id: "t-1", value: "cedula" }],
    altaEmpresa: vi.fn(),
    cobroGlobal: opts.cobroGlobal === undefined ? { monto: "500.00" } : opts.cobroGlobal,
    fijarCobroGlobal,
    fijarCobroEmpresa,
  };
  const utils = render(<EmpresasModule {...props} />);
  return { ...utils, props, fijarCobroGlobal, fijarCobroEmpresa };
}

const bloque = () => within(screen.getByRole("region", { name: "Cobro por orden" }));
const campoGlobal = () => bloque().getByRole("textbox", { name: "Valor global" }) as HTMLInputElement;

/** La celda «Cobro por orden» de una fila, buscada por el nombre de la empresa. */
function celdaCobro(nombre: string) {
  const cabeceras = screen.getAllByRole("columnheader").map((c) => c.textContent);
  const indice = cabeceras.indexOf("Cobro por orden");
  expect(indice).toBeGreaterThan(-1);
  const fila = screen.getAllByRole("row").find((f) => within(f).queryByText(nombre) !== null);
  if (!fila) throw new Error(`no hay fila de ${nombre}`);
  return within(within(fila).getAllByRole("cell")[indice]);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SL-40 (R9) — el bloque del valor global", () => {
  it("sin valor global dice «Sin configurar (0,00)» y ofrece el formulario para fijarlo", () => {
    montar({ cobroGlobal: { monto: null } });

    expect(screen.getByRole("heading", { level: 2, name: "Cobro por orden" })).toBeInTheDocument();
    expect(bloque().getByText(/Valor global:/).textContent).toBe(`Valor global: ${SIN_CONFIGURAR}`);
    expect(campoGlobal()).toHaveAttribute("inputmode", "decimal");
    expect(bloque().getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("con valor global pinta ese importe y no «Sin configurar»", () => {
    montar({ cobroGlobal: { monto: "500.00" } });

    expect(bloque().getByText(/Valor global:/).textContent).toBe(`Valor global: ${money("500.00")}`);
    expect(bloque().queryByText(SIN_CONFIGURAR)).toBeNull();
  });

  it("el bloque va antes del formulario «Crear empresa»", () => {
    montar();
    const region = screen.getByRole("region", { name: "Cobro por orden" });
    const alta = screen.getByRole("form", { name: "Crear empresa" });
    expect(region.compareDocumentPosition(alta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("SL-40 (R10) — la columna «Cobro por orden» de cada fila", () => {
  it("la empresa con excepción pinta la suya y «propio»; la otra, el global y «global»", () => {
    montar({ cobroGlobal: { monto: "500.00" } });

    const norte = celdaCobro("Envíos Norte");
    expect(norte.getByText(money("300.00"))).toBeInTheDocument();
    expect(norte.getByText("propio")).toBeInTheDocument();
    expect(norte.queryByText("global")).toBeNull();

    const sur = celdaCobro("Reparto Sur");
    expect(sur.getByText(money("500.00"))).toBeInTheDocument();
    expect(sur.getByText("global")).toBeInTheDocument();
    expect(sur.queryByText("propio")).toBeNull();
  });

  it("sin valor global, la empresa sin excepción pinta 0,00 y «global»", () => {
    montar({ cobroGlobal: { monto: null } });

    const sur = celdaCobro("Reparto Sur");
    expect(sur.getByText(money("0.00"))).toBeInTheDocument();
    expect(sur.getByText("global")).toBeInTheDocument();
  });

  it("«Cambiar» abre el editor con lo vigente y «Guardar» fija la excepción de ESA empresa", async () => {
    const user = userEvent.setup();
    const { fijarCobroEmpresa } = montar();

    await user.click(screen.getByRole("button", { name: "Cambiar · Envíos Norte" }));
    const campo = celdaCobro("Envíos Norte").getByRole("textbox", {
      name: "Cobro por orden · Envíos Norte",
    }) as HTMLInputElement;
    expect(campo.value).toBe("300.00");

    await user.clear(campo);
    await user.type(campo, "250.50");
    await user.click(celdaCobro("Envíos Norte").getByRole("button", { name: "Guardar" }));

    expect(fijarCobroEmpresa).toHaveBeenCalledTimes(1);
    expect(fijarCobroEmpresa).toHaveBeenCalledWith({ organizacionId: "org-2", monto: "250.50" });
  });

  it("«Usar el global» quita la excepción (monto null) y solo aparece si la empresa tiene la suya", async () => {
    const user = userEvent.setup();
    const { fijarCobroEmpresa } = montar();

    await user.click(screen.getByRole("button", { name: "Cambiar · Reparto Sur" }));
    expect(celdaCobro("Reparto Sur").queryByRole("button", { name: "Usar el global" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Cambiar · Envíos Norte" }));
    await user.click(celdaCobro("Envíos Norte").getByRole("button", { name: "Usar el global" }));

    expect(fijarCobroEmpresa).toHaveBeenCalledTimes(1);
    expect(fijarCobroEmpresa).toHaveBeenCalledWith({ organizacionId: "org-2", monto: null });
  });
});

describe("SL-40 (R11) — tras un éxito, los valores nuevos sin recargar a mano", () => {
  it("guardar el global llama a la action, refresca y avisa; con las props nuevas pinta el valor nuevo", async () => {
    const user = userEvent.setup();
    const { fijarCobroGlobal, props, rerender } = montar({ cobroGlobal: { monto: null } });

    await user.type(campoGlobal(), "650.00");
    await user.click(bloque().getByRole("button", { name: "Guardar" }));

    expect(fijarCobroGlobal).toHaveBeenCalledWith({ monto: "650.00" });
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(bloque().getByRole("status")).toHaveTextContent(GUARDADO);

    // Lo que hace `router.refresh()`: el Server Component vuelve a leer y baja las props nuevas.
    rerender(<EmpresasModule {...props} cobroGlobal={{ monto: "650.00" }} />);
    expect(bloque().getByText(/Valor global:/).textContent).toBe(`Valor global: ${money("650.00")}`);
    expect(celdaCobro("Reparto Sur").getByText(money("650.00"))).toBeInTheDocument();
  });

  it("fijar la excepción refresca, cierra el editor y avisa", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Cambiar · Reparto Sur" }));
    await user.type(celdaCobro("Reparto Sur").getByRole("textbox"), "120");
    await user.click(celdaCobro("Reparto Sur").getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(celdaCobro("Reparto Sur").queryByRole("textbox")).toBeNull();
    expect(celdaCobro("Reparto Sur").getByRole("status")).toHaveTextContent(GUARDADO);
  });

  it("«Usar el global» con éxito también refresca", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Cambiar · Envíos Norte" }));
    await user.click(celdaCobro("Envíos Norte").getByRole("button", { name: "Usar el global" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });
});

describe("SL-40 (R11) — si falla, el error y lo escrito se conservan", () => {
  it("validation_error del servidor: el error bajo el campo, lo escrito intacto, sin refrescar", async () => {
    const user = userEvent.setup();
    const fijarCobroGlobal: Fijar = vi
      .fn()
      .mockResolvedValue({ status: "validation_error", fieldErrors: { monto: [ERROR_MONTO] } });
    montar({ fijarCobroGlobal });

    await user.type(campoGlobal(), "12.50");
    await user.click(bloque().getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(campoGlobal()).toHaveAttribute("aria-invalid", "true"));
    expect(campoGlobal()).toHaveAccessibleDescription(expect.stringContaining(ERROR_MONTO));
    expect(campoGlobal().value).toBe("12.50");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(bloque().queryByRole("status")).toBeNull();
  });

  it("un importe que no pasa el schema se marca sin llamar a la action y se conserva", async () => {
    const user = userEvent.setup();
    const { fijarCobroGlobal } = montar();

    await user.type(campoGlobal(), "1,5");
    await user.click(bloque().getByRole("button", { name: "Guardar" }));

    expect(fijarCobroGlobal).not.toHaveBeenCalled();
    expect(bloque().getByText(ERROR_MONTO)).toBeInTheDocument();
    expect(campoGlobal().value).toBe("1,5");
  });

  it.each([
    ["forbidden", () => Promise.resolve({ status: "forbidden" } as FijarCobroResult)],
    ["una excepción de red", () => Promise.reject(new Error("red"))],
  ])("%s: mensaje genérico sin detalle y lo escrito intacto", async (_caso, respuesta) => {
    const user = userEvent.setup();
    const fijarCobroGlobal: Fijar = vi.fn().mockImplementation(respuesta);
    montar({ fijarCobroGlobal });

    await user.type(campoGlobal(), "75.25");
    await user.click(bloque().getByRole("button", { name: "Guardar" }));

    expect(await bloque().findByText(ERROR_GENERICO)).toBeInTheDocument();
    expect(campoGlobal().value).toBe("75.25");
    expect(campoGlobal()).not.toHaveAttribute("aria-invalid");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("not_found en una fila: «Esa empresa ya no existe.» y el editor sigue abierto con lo escrito", async () => {
    const user = userEvent.setup();
    const fijarCobroEmpresa: Fijar = vi.fn().mockResolvedValue({ status: "not_found" });
    montar({ fijarCobroEmpresa });

    await user.click(screen.getByRole("button", { name: "Cambiar · Reparto Sur" }));
    await user.type(celdaCobro("Reparto Sur").getByRole("textbox"), "99.90");
    await user.click(celdaCobro("Reparto Sur").getByRole("button", { name: "Guardar" }));

    expect(await celdaCobro("Reparto Sur").findByText(ERROR_NO_EXISTE)).toBeInTheDocument();
    expect((celdaCobro("Reparto Sur").getByRole("textbox") as HTMLInputElement).value).toBe("99.90");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("validation_error en una fila: el error bajo su campo y lo escrito intacto", async () => {
    const user = userEvent.setup();
    const fijarCobroEmpresa: Fijar = vi
      .fn()
      .mockResolvedValue({ status: "validation_error", fieldErrors: { monto: [ERROR_MONTO] } });
    montar({ fijarCobroEmpresa });

    await user.click(screen.getByRole("button", { name: "Cambiar · Envíos Norte" }));
    const campo = celdaCobro("Envíos Norte").getByRole("textbox") as HTMLInputElement;
    await user.clear(campo);
    await user.type(campo, "40.10");
    await user.click(celdaCobro("Envíos Norte").getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(campo).toHaveAccessibleDescription(expect.stringContaining(ERROR_MONTO));
    expect(campo.value).toBe("40.10");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("«Usar el global» que falla: genérico y el editor sigue abierto", async () => {
    const user = userEvent.setup();
    const fijarCobroEmpresa: Fijar = vi.fn().mockResolvedValue({ status: "forbidden" });
    montar({ fijarCobroEmpresa });

    await user.click(screen.getByRole("button", { name: "Cambiar · Envíos Norte" }));
    await user.click(celdaCobro("Envíos Norte").getByRole("button", { name: "Usar el global" }));

    expect(await celdaCobro("Envíos Norte").findByText(ERROR_GENERICO)).toBeInTheDocument();
    expect(celdaCobro("Envíos Norte").getByRole("textbox")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("SL-40 — los importes se pintan como texto", () => {
  it("el módulo del cobro no convierte importes a número", () => {
    const fuente = readFileSync(
      path.join(process.cwd(), "app/(app)/plataforma/empresas/_components/CobroPorOrden.tsx"),
      "utf8",
    );
    expect(fuente.length).toBeGreaterThan(500);
    expect(fuente).not.toMatch(/\bNumber\(|parseFloat|parseInt|\+\s*cobro|toFixed/);
  });
});
