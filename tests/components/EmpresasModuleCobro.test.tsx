// @vitest-environment jsdom
// SL-40 (R9–R11, design §9.1 y §11.3) — EL COBRO POR ORDEN EN «EMPRESAS».
//
// Se monta el `EmpresasModule` real con las actions como dobles: el bloque del valor global, la
// columna de cada fila con «del plan» o «global», los errores del global junto al campo o genéricos,
// que lo escrito se conserva tras un fallo y que un éxito refresca la página.
// SLT-126 (R1, R3, R4): la fila ya no tiene editor (ni «Cambiar», ni «Usar el global», ni campo), la
// fuente «propio» desaparece y la ayuda del global cambia de texto.
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
  // SLT-126 (R3): lo vigente sale de su plan, que fija 300,00 por orden.
  cobroVigente: { modo: "fijo", monto: "300.00", fuente: "plan" },
  plan: { id: "plan-1", nombre: "Plan Norte", tipoCobro: "mensual" },
  // SL-45 (R28): el Record del listado exige la deuda; aquí, al día.
  deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
  pagadoPlataforma: "0.00",
  // SL-20 (R9): toda empresa tiene país; no es de este test.
  pais: { id: "CR", nombre: "Costa Rica" },
};
const SUR: EmpresaListada = {
  id: "org-1",
  nombre: "Reparto Sur",
  slug: "reparto-sur",
  creadaEn: new Date("2026-09-05T12:00:00Z"),
  maestros: [],
  // SLT-66 R31/R32: sin plan, el global de `montar` (500).
  cobroVigente: { modo: "fijo", monto: "500.00", fuente: "global" },
  plan: null,
  // SL-45 (R28): el Record del listado exige la deuda; aquí, al día.
  deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
  pagadoPlataforma: "0.00",
  // SL-20 (R9): toda empresa tiene país; no es de este test.
  pais: { id: "CR", nombre: "Costa Rica" },
};

const SIN_CONFIGURAR = "Sin configurar (0,00)";
const GUARDADO = "Cobro guardado.";
const ERROR_MONTO = "Escribe un importe mayor o igual que cero, con dos decimales como máximo.";
const ERROR_GENERICO = "No se pudo guardar el cobro. Inténtalo de nuevo.";
// SLT-126 (R4, P1): escrito a mano, no importado del componente, para que un cambio de texto no pase en verde.
const AYUDA_GLOBAL =
  "Se aplica a cada orden de las empresas cuyo plan no fija un cobro por orden. Las órdenes ya creadas conservan su importe.";

type Fijar = ReturnType<typeof vi.fn<(input: unknown) => Promise<FijarCobroResult>>>;

function montar(opts: {
  cobroGlobal?: CobroGlobalDTO | null;
  empresas?: EmpresaListada[];
  fijarCobroGlobal?: Fijar;
} = {}) {
  const fijarCobroGlobal = opts.fijarCobroGlobal ?? vi.fn().mockResolvedValue({ status: "ok" });
  const props = {
    empresas: opts.empresas ?? [NORTE, SUR],
    tiposDocumento: [{ id: "t-1", value: "cedula" }],
    // SL-20 (R9): el `Select` de país no es de este test.
    paises: [{ id: "CR", nombre: "Costa Rica" }],
    altaEmpresa: vi.fn(),
    cobroGlobal: opts.cobroGlobal === undefined ? { monto: "500.00" } : opts.cobroGlobal,
    fijarCobroGlobal,
    // SL-41: la columna «Bienvenida» no es de este test; sin pendientes, ninguna fila lleva el botón.
    reenviarBienvenida: vi.fn(),
    bienvenidaPendiente: [],
  };
  const utils = render(<EmpresasModule {...props} />);
  return { ...utils, props, fijarCobroGlobal };
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

describe("SLT-126 (R4) — la ayuda del valor global", () => {
  it("R4: el campo del global lleva como ayuda exactamente el texto aprobado", () => {
    montar();

    expect(bloque().getByText(AYUDA_GLOBAL)).toBeInTheDocument();
    expect(campoGlobal()).toHaveAccessibleDescription(expect.stringContaining(AYUDA_GLOBAL));
    // La ayuda vieja hablaba del valor propio de la empresa.
    expect(screen.queryByText(/sin valor propio/)).toBeNull();
  });
});

describe("SLT-126 (R1) — ninguna fila permite cambiar su cobro por orden", () => {
  it("R1: sin «Cambiar», sin «Usar el global» y sin campo de importe en ninguna fila", () => {
    montar({ empresas: [NORTE, SUR] });

    expect(screen.queryByRole("button", { name: /Cambiar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Usar el global/ })).toBeNull();
    for (const nombre of ["Envíos Norte", "Reparto Sur"]) {
      const celda = celdaCobro(nombre);
      expect(celda.queryByRole("button")).toBeNull();
      expect(celda.queryByRole("textbox")).toBeNull();
      expect(celda.queryByRole("form")).toBeNull();
    }
    // El único campo de importe del cobro es el del bloque global: la tabla no tiene ninguno.
    const tabla = within(screen.getByRole("table"));
    expect(tabla.queryByRole("textbox")).toBeNull();
    expect(tabla.queryByRole("spinbutton")).toBeNull();
  });
});

describe("SL-40 (R10), SLT-126 (R3) — la columna «Cobro por orden» de cada fila", () => {
  it("R3: la empresa con plan pinta su importe y «del plan»; la otra, el global y «global»", () => {
    montar({ cobroGlobal: { monto: "500.00" } });

    const norte = celdaCobro("Envíos Norte");
    expect(norte.getByText(money("300.00"))).toBeInTheDocument();
    expect(norte.getByText("del plan")).toBeInTheDocument();
    expect(norte.queryByText("global")).toBeNull();

    const sur = celdaCobro("Reparto Sur");
    expect(sur.getByText(money("500.00"))).toBeInTheDocument();
    expect(sur.getByText("global")).toBeInTheDocument();
    expect(sur.queryByText("del plan")).toBeNull();
  });

  it("R3: sin valor global, la empresa sin plan pinta 0,00 y «global»", () => {
    // SLT-66 R31: lo vigente llega del servidor por fila; sin global, la fuente es `sin_configurar` a 0.
    montar({
      cobroGlobal: { monto: null },
      empresas: [NORTE, { ...SUR, cobroVigente: { modo: "fijo", monto: "0.00", fuente: "sin_configurar" } }],
    });

    const sur = celdaCobro("Reparto Sur");
    expect(sur.getByText(money("0.00"))).toBeInTheDocument();
    expect(sur.getByText("global")).toBeInTheDocument();
  });

  it("R3: ninguna fila dice «propio», con cualquiera de las fuentes", () => {
    montar({
      cobroGlobal: { monto: null },
      empresas: [
        NORTE,
        SUR,
        {
          ...SUR,
          id: "org-3",
          nombre: "Mensajería Este",
          slug: "mensajeria-este",
          cobroVigente: { modo: "fijo", monto: "0.00", fuente: "sin_configurar" },
        },
      ],
    });

    const tabla = screen.getByRole("table");
    expect(within(tabla).queryByText(/propio/i)).toBeNull();
    expect(tabla.textContent).not.toMatch(/propio/i);
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
    // SLT-66 R31: el refresco también baja la fila con su `cobroVigente` nuevo (ya no se deriva del global).
    rerender(
      <EmpresasModule
        {...props}
        cobroGlobal={{ monto: "650.00" }}
        empresas={[NORTE, { ...SUR, cobroVigente: { modo: "fijo", monto: "650.00", fuente: "global" } }]}
      />,
    );
    expect(bloque().getByText(/Valor global:/).textContent).toBe(`Valor global: ${money("650.00")}`);
    expect(celdaCobro("Reparto Sur").getByText(money("650.00"))).toBeInTheDocument();
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// SL-45 (R28, design §9; aprobado por Carlos el 2026-10-24, P2 = sí) — LA COLUMNA «PLATAFORMA».
//
// Cada fila dice si la empresa debe, está al día o tiene saldo a favor con la plataforma, con su
// importe, y cuánto lleva pagado. Las palabras van escritas a mano; el importe, con el `money` de la
// pantalla (es el formato de la moneda, no el texto que se mide). Los tres importes son distintos
// entre sí y del pagado, para que pintar el de otra fila o el otro campo no pase en verde.

const DEBE: EmpresaListada = {
  ...NORTE,
  deudaPlataforma: { deuda: "500.00", estado: "debe", importe: "500.00" },
  pagadoPlataforma: "300.00",
};
const AL_DIA: EmpresaListada = {
  ...SUR,
  deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" },
  pagadoPlataforma: "1200.00",
};
const A_FAVOR: EmpresaListada = {
  id: "org-3",
  nombre: "Mensajería Este",
  slug: "mensajeria-este",
  creadaEn: new Date("2026-10-01T12:00:00Z"),
  maestros: [],
  cobroVigente: { modo: "fijo", monto: "500.00", fuente: "global" }, // SLT-66 R31: campo nuevo; no es de este test.
  plan: null, // SLT-66 R32: campo nuevo; no es de este test.
  deudaPlataforma: { deuda: "-250.00", estado: "a_favor", importe: "250.00" },
  pagadoPlataforma: "750.00",
  pais: { id: "CR", nombre: "Costa Rica" },
};

/** La celda «Plataforma» de una fila, buscada por el nombre de la empresa. */
function celdaPlataforma(nombre: string) {
  const cabeceras = screen.getAllByRole("columnheader").map((c) => c.textContent);
  const indice = cabeceras.indexOf("Plataforma");
  expect(indice, "no hay columna «Plataforma»").toBeGreaterThan(-1);
  const fila = screen.getAllByRole("row").find((f) => within(f).queryByText(nombre) !== null);
  if (!fila) throw new Error(`no hay fila de ${nombre}`);
  return within(fila).getAllByRole("cell")[indice];
}

describe("SL-45 (R28) — la columna «Plataforma» de cada empresa", () => {
  it("la columna va justo después de «Cobro por orden»", () => {
    montar({ empresas: [DEBE, AL_DIA, A_FAVOR] });
    const cabeceras = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(cabeceras.indexOf("Plataforma")).toBe(cabeceras.indexOf("Cobro por orden") + 1);
  });

  it("«debe»: «Debe» con su importe y lo pagado", () => {
    montar({ empresas: [DEBE, AL_DIA, A_FAVOR] });
    const celda = celdaPlataforma("Envíos Norte");
    expect(within(celda).getByText(`Debe ${money("500.00")}`)).toBeInTheDocument();
    expect(within(celda).getByText(`Pagado ${money("300.00")}`)).toBeInTheDocument();
    expect(celda.textContent).toBe(`Debe ${money("500.00")}Pagado ${money("300.00")}`);
  });

  it("«al día»: «Al día» sin importe, y lo pagado", () => {
    montar({ empresas: [DEBE, AL_DIA, A_FAVOR] });
    const celda = celdaPlataforma("Reparto Sur");
    expect(within(celda).getByText("Al día")).toBeInTheDocument();
    expect(celda.textContent).toBe(`Al díaPagado ${money("1200.00")}`);
  });

  it("«a favor»: «A favor» con el importe en positivo (el del servidor), y lo pagado", () => {
    montar({ empresas: [DEBE, AL_DIA, A_FAVOR] });
    const celda = celdaPlataforma("Mensajería Este");
    expect(within(celda).getByText(`A favor ${money("250.00")}`)).toBeInTheDocument();
    expect(within(celda).getByText(`Pagado ${money("750.00")}`)).toBeInTheDocument();
    // La `deuda` con signo no se pinta: nada de «-250».
    expect(celda.textContent).not.toContain("-");
  });

  it("sin pagos, «Pagado» con el cero que manda el servidor", () => {
    montar({ empresas: [{ ...DEBE, pagadoPlataforma: "0.00" }] });
    expect(within(celdaPlataforma("Envíos Norte")).getByText(`Pagado ${money("0.00")}`)).toBeInTheDocument();
  });

  it("R14: el módulo no convierte importes a número", () => {
    const fuente = readFileSync(
      path.join(process.cwd(), "app/(app)/plataforma/empresas/_components/EmpresasModule.tsx"),
      "utf8",
    );
    expect(fuente.length).toBeGreaterThan(500);
    expect(fuente).toContain("deudaPlataforma");
    expect(fuente).not.toMatch(/\bNumber\(|parseFloat|parseInt|toFixed/);
  });
});
