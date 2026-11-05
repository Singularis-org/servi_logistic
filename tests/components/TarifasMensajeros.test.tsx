// @vitest-environment jsdom
// SLT-55 (R27-R36, R38) — la sección «Mensajeros con valor propio», con las actions dobladas.
//
// Lo que este archivo NO prueba: que el servidor guarde, autorice o aísle por empresa (Tandas A y C, contra Postgres),
// ni que la petición llegue de verdad a la action, ni medidas reales de 390 px o modo oscuro: jsdom no pinta. Todo eso
// lo recorre el E2E de la Tanda E. Aquí se prueba lo que la pantalla enseña y el payload que le pasa a la action.
//
// Los textos y los payloads van escritos a mano: son contrato, y compararlos con `TEXTOS` siempre daría verde.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { planDeGuardado, type Celda } from "@/app/(app)/configuracion/tarifas/_components/tarifas-borrador";
import {
  filasDeMensajeros,
  TarifasMensajeros,
  type TarifasMensajerosProps,
} from "@/app/(app)/configuracion/tarifas/_components/TarifasMensajeros";
import type { MensajeroDePantalla } from "@/lib/interfaces/repositories/ITarifasPantallaRepository";
import type { TarifaValorDTO } from "@/lib/types/tarifa-flexible";

import { mensajeroPantalla, valor, valorPropio } from "../fixtures/tarifas-pantalla";

const { guardarMock, toast } = vi.hoisted(() => ({
  guardarMock: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/actions/tarifas", () => ({ guardarValoresTarifa: (i: unknown) => guardarMock(i) }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => toast }));

const ANA = mensajeroPantalla({ id: "m1", nombre: "Ana Torres" });
const BETO = mensajeroPantalla({ id: "m2", nombre: "Beto Rojas" });
const CARO = mensajeroPantalla({ id: "m3", nombre: "Caro Mena" });
const DADO_DE_BAJA = mensajeroPantalla({ id: "m4", nombre: "Dario Paz", elegible: false });
const OTRO_DE_BAJA = mensajeroPantalla({ id: "m5", nombre: "Elsa Rey", elegible: false });

const VALORES_ANA = [
  valorPropio("mensajero_entregado", "m1", { id: "v-ent", valor: "2900.00" }),
  valorPropio("mensajero_rechazo", "m1", { id: "v-rec", modo: "porcentaje", valor: "15.00" }),
];
const VALOR_DARIO = valorPropio("mensajero_entregado", "m4", { id: "v-dar", valor: "1800.00" });

interface Datos extends Partial<TarifasMensajerosProps> {
  valores?: readonly TarifaValorDTO[];
}

function props({ valores = VALORES_ANA, mensajeros = [ANA, BETO, CARO, DADO_DE_BAJA, OTRO_DE_BAJA], ...extra }: Datos = {}) {
  return {
    filas: filasDeMensajeros(valores, mensajeros),
    mensajeros,
    activada: false,
    puedeEscribir: true,
    onCambio: vi.fn(),
    ...extra,
  } satisfies TarifasMensajerosProps;
}

function montar(datos: Datos = {}) {
  const p = props(datos);
  return { p, ...render(<TarifasMensajeros {...p} />) };
}

const seccion = () => screen.getByRole("region", { name: "Mensajeros con valor propio" });
const filaDe = (nombre: RegExp) => within(seccion()).getByRole("row", { name: nombre });
const campo = (d: HTMLElement, concepto: string) => within(d).getByRole("textbox", { name: `Valor de ${concepto}` });

async function abrirEdicion(u: UserEvent, nombre: string): Promise<HTMLElement> {
  await u.click(screen.getByRole("button", { name: `Editar valor propio de ${nombre}` }));
  return screen.findByRole("dialog");
}

async function elegirMensajero(u: UserEvent, d: HTMLElement, nombre: string) {
  await u.click(within(d).getByRole("combobox", { name: "Mensajero" }));
  await u.click(await screen.findByRole("option", { name: nombre }));
}

async function abrirAnadirYElegir(u: UserEvent, nombre: string): Promise<HTMLElement> {
  await u.click(screen.getByRole("button", { name: "Añadir mensajero" }));
  const d = await screen.findByRole("dialog");
  await elegirMensajero(u, d, nombre);
  return d;
}

async function guardarYEsperarEnvio(u: UserEvent, d: HTMLElement, boton = "Guardar borrador") {
  await u.click(within(d).getByRole("button", { name: boton }));
  await waitFor(() => expect(guardarMock).toHaveBeenCalledTimes(1));
}

const cambiosEnviados = () => guardarMock.mock.calls[0][0].cambios as Record<string, unknown>[];

beforeEach(() => {
  vi.clearAllMocks();
  guardarMock.mockResolvedValue({ status: "ok", resultados: [] });
});
afterEach(() => cleanup());

const CELDA = (valorCelda: string, extra: Partial<Celda> = {}): Celda => ({ valor: valorCelda, modo: "monto", ivaPct: "", ...extra });

describe("SLT-55 T4.1 — planDeGuardado", () => {
  const COLUMNAS_PROPIO = { zonaId: null, grupoId: null, tiendaId: null, mensajeroId: "m1" };

  it("R29: el plan del propio lleva `mensajeroId` y no lleva la clave `ivaPct`", () => {
    const { cambios } = planDeGuardado(
      [{ clave: "mensajero_entregado:todos", concepto: "mensajero_entregado", vehiculoId: null, guardado: undefined, celda: CELDA("2900") }],
      COLUMNAS_PROPIO,
    );
    expect(cambios).toEqual([
      {
        accion: "fijar",
        clave: "mensajero_entregado:todos",
        datos: {
          concepto: "mensajero_entregado",
          modo: "monto",
          valor: "2900",
          zonaId: null,
          grupoId: null,
          tiendaId: null,
          vehiculoId: null,
          mensajeroId: "m1",
        },
      },
    ]);
    const unico = cambios[0];
    expect(unico !== undefined && unico.accion === "fijar" && "ivaPct" in unico.datos).toBe(false);
  });

  it("R29: aunque la celda traiga un IVA, el pago no lo manda", () => {
    const { cambios } = planDeGuardado(
      [{ clave: "mensajero_novedad:todos", concepto: "mensajero_novedad", vehiculoId: null, guardado: undefined, celda: CELDA("10", { ivaPct: "13" }) }],
      COLUMNAS_PROPIO,
    );
    const unico = cambios[0];
    expect(unico !== undefined && unico.accion === "fijar" && "ivaPct" in unico.datos).toBe(false);
  });

  it("El plan de la zona sigue sin la clave `mensajeroId`: su payload no cambia", () => {
    const { cambios } = planDeGuardado(
      [{ clave: "mensajero_entregado:todos", concepto: "mensajero_entregado", vehiculoId: null, guardado: undefined, celda: CELDA("2200") }],
      { zonaId: "z1", grupoId: null, tiendaId: null },
    );
    expect(cambios).toEqual([
      {
        accion: "fijar",
        clave: "mensajero_entregado:todos",
        datos: { concepto: "mensajero_entregado", modo: "monto", valor: "2200", zonaId: "z1", grupoId: null, tiendaId: null, vehiculoId: null },
      },
    ]);
  });

  it("El cobro de una tienda sigue con su `ivaPct` y sin `mensajeroId`", () => {
    const { cambios } = planDeGuardado(
      [{ clave: "tienda_flete_entregado:todos", concepto: "tienda_flete_entregado", vehiculoId: null, guardado: undefined, celda: CELDA("3000", { ivaPct: "13" }) }],
      { zonaId: "z1", grupoId: null, tiendaId: null },
    );
    expect(cambios).toEqual([
      {
        accion: "fijar",
        clave: "tienda_flete_entregado:todos",
        datos: { concepto: "tienda_flete_entregado", modo: "monto", valor: "3000", ivaPct: "13", zonaId: "z1", grupoId: null, tiendaId: null, vehiculoId: null },
      },
    ]);
  });
});

describe("SLT-55 — filasDeMensajeros", () => {
  it("R27: agrupa por mensajero aunque la lectura los traiga intercalados, y ordena por nombre", () => {
    const filas = filasDeMensajeros(
      [
        valorPropio("mensajero_novedad", "m2", { id: "b1" }),
        valorPropio("mensajero_entregado", "m1", { id: "a1" }),
        valorPropio("mensajero_entregado", "m2", { id: "b2" }),
        valorPropio("mensajero_rechazo", "m1", { id: "a2" }),
      ],
      [BETO, ANA],
    );
    expect(filas.map((f) => [f.nombre, f.valores.map((v) => v.id).sort()])).toEqual([
      ["Ana Torres", ["a1", "a2"]],
      ["Beto Rojas", ["b1", "b2"]],
    ]);
  });

  it("R27: un mensajero sin valores no tiene fila, ni un dado de baja sin valor", () => {
    expect(filasDeMensajeros(VALORES_ANA, [ANA, BETO, DADO_DE_BAJA]).map((f) => f.mensajeroId)).toEqual(["m1"]);
  });

  it("R32: `elegible: false` es la marca de inactivo; sin nombre conocido, «Cuenta retirada» e inactivo", () => {
    const filas = filasDeMensajeros(
      [VALOR_DARIO, valorPropio("mensajero_novedad", "ya-no", { id: "x" }), VALORES_ANA[0] as TarifaValorDTO],
      [ANA, DADO_DE_BAJA],
    );
    expect(filas.map((f) => [f.nombre, f.inactivo])).toEqual([
      ["Ana Torres", false],
      ["Cuenta retirada", true],
      ["Dario Paz", true],
    ]);
  });

  it("Un valor sin mensajero no se cuela como fila", () => {
    expect(filasDeMensajeros([valor("mensajero_entregado")], [ANA])).toEqual([]);
  });
});

describe("SLT-55 — lista", () => {
  it("R27: una columna por resultado del catálogo; el valor de cada uno, y «Usa la zona» en el que no tiene", () => {
    montar();
    expect(within(seccion()).getByRole("heading", { level: 2 })).toHaveTextContent("Mensajeros con valor propio");
    expect(within(seccion()).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Mensajero",
      "Por entregado",
      "Por devolución a origen",
      "Por reprogramado",
      "Por novedad",
      "Por incidente",
      "Acciones",
    ]);
    const celdas = within(filaDe(/Ana Torres/)).getAllByRole("cell").map((c) => c.textContent);
    expect(celdas.slice(0, 6)).toEqual(["Ana Torres", "₡2.900", "15 %", "Usa la zona", "Usa la zona", "Usa la zona"]);
  });

  it("R15, R27: un valor propio de 0 se ve como 0, no como «Usa la zona»", () => {
    montar({ valores: [valorPropio("mensajero_entregado", "m1", { valor: "0.00" })] });
    expect(within(filaDe(/Ana Torres/)).getAllByRole("cell")[1]).toHaveTextContent("₡0");
  });

  it("R27: la sección dice qué gana, y sobre qué se calcula el %", () => {
    montar();
    expect(within(seccion()).getByText("Gana sobre el grupo y la zona, en cualquier zona donde trabaje. Lo que no digites usa el valor de la zona.")).toBeInTheDocument();
    expect(within(seccion()).getByText("En % se calcula sobre el flete sin IVA que se le cobra a la tienda por esa gestión.")).toBeInTheDocument();
  });

  it("R34: sin activar dice que no cambia ningún pago, y no habla del siguiente cierre", () => {
    montar({ activada: false });
    expect(within(seccion()).getByText("Lo que digites aquí no cambia ningún pago hasta que actives las tarifas nuevas.")).toBeInTheDocument();
    expect(within(seccion()).queryByText(/siguiente cierre/)).toBeNull();
  });

  it("R34: activada dice que aplica desde el siguiente cierre y que los hechos no cambian", () => {
    montar({ activada: true });
    expect(within(seccion()).getByText("Un cambio aplica desde el siguiente cierre. Los cierres ya hechos no cambian.")).toBeInTheDocument();
    expect(within(seccion()).queryByText(/hasta que actives/)).toBeNull();
  });

  it("R36: sin ninguno, un estado vacío que enseña el siguiente paso, con el botón de añadir", () => {
    montar({ valores: [] });
    expect(screen.getByText("Ningún mensajero tiene valor propio")).toBeInTheDocument();
    expect(screen.getByText("Todos usan el valor de su zona. Añade un mensajero si pactaste otro pago con él.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Añadir mensajero" })).toHaveLength(1);
  });

  it("R32: el inactivo sale marcado, y el activo no", () => {
    montar({ valores: [...VALORES_ANA, VALOR_DARIO] });
    expect(within(filaDe(/Dario Paz/)).getByText("Inactivo")).toBeInTheDocument();
    expect(within(filaDe(/Ana Torres/)).queryByText("Inactivo")).toBeNull();
  });

  it("R32: el inactivo se puede editar y quitar", () => {
    montar({ valores: [VALOR_DARIO] });
    expect(screen.getByRole("button", { name: "Editar valor propio de Dario Paz" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Quitar valor propio de Dario Paz" })).toBeEnabled();
  });
});

describe("SLT-55 R35 — el `admin` solo lee", () => {
  it("Ve los mismos datos, sin columna de acciones ni ningún control de escritura", () => {
    montar({ puedeEscribir: false, valores: [...VALORES_ANA, VALOR_DARIO] });
    expect(within(filaDe(/Ana Torres/)).getByText("₡2.900")).toBeInTheDocument();
    expect(within(filaDe(/Dario Paz/)).getByText("Inactivo")).toBeInTheDocument();
    expect(within(seccion()).getAllByRole("columnheader").map((c) => c.textContent)).not.toContain("Acciones");
    expect(within(seccion()).queryAllByRole("button")).toEqual([]);
    expect(within(seccion()).queryAllByRole("textbox")).toEqual([]);
    expect(within(seccion()).queryAllByRole("combobox")).toEqual([]);
  });

  it("Con la lista vacía tampoco se le ofrece añadir ni se le enseña el paso", () => {
    montar({ puedeEscribir: false, valores: [] });
    expect(screen.getByText("Ningún mensajero tiene valor propio")).toBeInTheDocument();
    expect(screen.queryByText(/Añade un mensajero/)).toBeNull();
    expect(within(seccion()).queryAllByRole("button")).toEqual([]);
  });

  it("El `maestro`, con los mismos datos, sí tiene añadir, editar y quitar", () => {
    montar();
    for (const nombre of ["Añadir mensajero", "Editar valor propio de Ana Torres", "Quitar valor propio de Ana Torres"]) {
      expect(within(seccion()).getByRole("button", { name: nombre })).toBeInTheDocument();
    }
  });
});

describe("SLT-55 R28 — el diálogo", () => {
  it("Una fila por resultado con modo y valor, sin IVA ni «Hoy rige»", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    expect(within(d).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Concepto", "Modo", "Valor"]);
    expect(within(d).getAllByRole("row").slice(1).map((f) => within(f).getAllByRole("cell")[0]?.textContent)).toEqual([
      "Por entregado",
      "Por devolución a origen",
      "Por reprogramado",
      "Por novedad",
      "Por incidente",
    ]);
    expect(within(d).queryByRole("textbox", { name: /IVA/ })).toBeNull();
    expect(within(d).queryByText(/Hoy rige/)).toBeNull();
    expect(within(d).getAllByRole("textbox")).toHaveLength(5);
  });

  it("Dice qué significa vacío, que un 0 escrito paga 0 y sobre qué va el %", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    expect(
      within(d).getByText(
        "Sin IVA. Un campo vacío usa el valor de la zona. Un 0 escrito paga 0. En % se calcula sobre el flete sin IVA que se le cobra a la tienda por esa gestión.",
      ),
    ).toBeInTheDocument();
    expect(campo(d, "Por novedad")).toHaveAttribute("placeholder", "Usa la zona");
  });

  it("Al editar, enseña al mensajero y lo guardado, sin selector de mensajero", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    expect(within(d).getByRole("heading", { name: "Valor propio de Ana Torres" })).toBeInTheDocument();
    expect(within(d).queryByRole("combobox", { name: "Mensajero" })).toBeNull();
    expect(campo(d, "Por entregado")).toHaveValue("2900");
    expect(campo(d, "Por devolución a origen")).toHaveValue("15");
    expect(within(d).getByRole("combobox", { name: "Modo de Por devolución a origen" })).toHaveTextContent("%");
    expect(campo(d, "Por novedad")).toHaveValue("");
  });

  it("Cerrar descarta lo digitado", async () => {
    const u = userEvent.setup();
    montar();
    let d = await abrirEdicion(u, "Ana Torres");
    await u.clear(campo(d, "Por entregado"));
    await u.type(campo(d, "Por entregado"), "1");
    await u.click(within(d).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(guardarMock).not.toHaveBeenCalled();

    d = await abrirEdicion(u, "Ana Torres");
    expect(campo(d, "Por entregado")).toHaveValue("2900");
  });
});

describe("SLT-55 R29 — qué se envía", () => {
  it("Fija solo lo cambiado, y sin la clave `ivaPct`", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.type(campo(d, "Por novedad"), "500");
    await guardarYEsperarEnvio(u, d);
    expect(cambiosEnviados()).toEqual([
      {
        accion: "fijar",
        clave: "mensajero_novedad:todos",
        datos: {
          concepto: "mensajero_novedad",
          modo: "monto",
          valor: "500",
          zonaId: null,
          grupoId: null,
          tiendaId: null,
          vehiculoId: null,
          mensajeroId: "m1",
        },
      },
    ]);
    expect("ivaPct" in (cambiosEnviados()[0]?.datos as object)).toBe(false);
  });

  it("Vaciar quita ese valor por su id; lo demás no se toca", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.clear(campo(d, "Por entregado"));
    await guardarYEsperarEnvio(u, d);
    expect(cambiosEnviados()).toEqual([{ accion: "quitar", clave: "mensajero_entregado:todos", id: "v-ent" }]);
  });

  it("Un 0 escrito se fija como 0: no es lo mismo que vacío", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.clear(campo(d, "Por entregado"));
    await u.type(campo(d, "Por entregado"), "0");
    await guardarYEsperarEnvio(u, d);
    expect(cambiosEnviados()).toEqual([
      expect.objectContaining({ accion: "fijar", clave: "mensajero_entregado:todos", datos: expect.objectContaining({ valor: "0", mensajeroId: "m1" }) }),
    ]);
  });

  it("Enfocar y salir sin cambiar nada no escribe: el botón sigue apagado", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.click(campo(d, "Por entregado"));
    await u.click(campo(d, "Por novedad"));
    await u.tab();
    expect(within(d).getByRole("button", { name: "Guardar borrador" })).toBeDisabled();
    expect(guardarMock).not.toHaveBeenCalled();
  });

  it("Reescribir el mismo importe no envía nada", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.clear(campo(d, "Por entregado"));
    await u.type(campo(d, "Por entregado"), "2900.00");
    expect(within(d).getByRole("button", { name: "Guardar borrador" })).toBeDisabled();
  });

  it("Cambiar solo el modo de un valor guardado sí lo fija", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.click(within(d).getByRole("combobox", { name: "Modo de Por entregado" }));
    await u.click(await screen.findByRole("option", { name: "%" }));
    await guardarYEsperarEnvio(u, d);
    expect(cambiosEnviados()).toEqual([
      expect.objectContaining({ accion: "fijar", datos: expect.objectContaining({ concepto: "mensajero_entregado", modo: "porcentaje", valor: "2900" }) }),
    ]);
  });

  it("Cambiar el modo de una fila vacía no escribe: no hay valor que fijar", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.click(within(d).getByRole("combobox", { name: "Modo de Por novedad" }));
    await u.click(await screen.findByRole("option", { name: "%" }));
    expect(within(d).getByRole("button", { name: "Guardar borrador" })).toBeDisabled();
  });

  it("Con todo bien: cierra, avisa con el efecto en borrador y recarga", async () => {
    guardarMock.mockResolvedValue({ status: "ok", resultados: [{ clave: "mensajero_novedad:todos", status: "ok" }] });
    const u = userEvent.setup();
    const { p } = montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.type(campo(d, "Por novedad"), "500");
    await guardarYEsperarEnvio(u, d);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast.success).toHaveBeenCalledWith("Borrador guardado. No cambia ningún cobro ni pago hasta que actives.");
    expect(p.onCambio).toHaveBeenCalledTimes(1);
  });

  it("R34: activada, el botón y el aviso hablan del siguiente cierre", async () => {
    guardarMock.mockResolvedValue({ status: "ok", resultados: [{ clave: "mensajero_novedad:todos", status: "ok" }] });
    const u = userEvent.setup();
    montar({ activada: true });
    const d = await abrirEdicion(u, "Ana Torres");
    await u.type(campo(d, "Por novedad"), "500");
    await guardarYEsperarEnvio(u, d, "Guardar cambios");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Guardado. El cambio aplica desde el siguiente cierre; los cierres ya hechos no cambian."));
  });
});

describe("SLT-55 R30 — fallos al guardar", () => {
  const CON_FALLO = {
    status: "ok",
    resultados: [
      { clave: "mensajero_novedad:todos", status: "ok" },
      { clave: "mensajero_incidente:todos", status: "validation_error", fieldErrors: { valor: ["El valor no es válido."] } },
    ],
  };

  it("El error sale en su fila, lo digitado sigue ahí y lo demás se da por guardado", async () => {
    guardarMock.mockResolvedValue(CON_FALLO);
    const u = userEvent.setup();
    const { p } = montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.type(campo(d, "Por novedad"), "500");
    await u.type(campo(d, "Por incidente"), "700");
    await guardarYEsperarEnvio(u, d);

    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith("Lo demás se guardó. Revisa las filas marcadas: conservan lo que digitaste."));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const fila = within(d).getByRole("row", { name: /Por incidente/ });
    expect(within(fila).getByText("El valor no es válido.")).toBeInTheDocument();
    expect(campo(d, "Por incidente")).toHaveValue("700");
    expect(campo(d, "Por incidente")).toHaveAttribute("aria-invalid", "true");
    expect(within(d).getByRole("row", { name: /Por novedad/ })).not.toHaveTextContent("El valor no es válido.");
    expect(p.onCambio).toHaveBeenCalled();
  });

  it("El reintento, ya con lo guardado recargado, solo manda la fila que falló", async () => {
    guardarMock.mockResolvedValueOnce(CON_FALLO);
    const u = userEvent.setup();
    const { p, rerender } = montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.type(campo(d, "Por novedad"), "500");
    await u.type(campo(d, "Por incidente"), "700");
    await guardarYEsperarEnvio(u, d);
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());

    const recargados = [...VALORES_ANA, valorPropio("mensajero_novedad", "m1", { id: "v-nov", valor: "500.00" })];
    rerender(<TarifasMensajeros {...p} filas={filasDeMensajeros(recargados, p.mensajeros)} />);
    expect(campo(d, "Por novedad")).toHaveValue("500");

    guardarMock.mockResolvedValueOnce({ status: "ok", resultados: [{ clave: "mensajero_incidente:todos", status: "ok" }] });
    await u.click(within(d).getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(guardarMock).toHaveBeenCalledTimes(2));
    expect(guardarMock.mock.calls[1]?.[0].cambios.map((c: { clave: string }) => c.clave)).toEqual(["mensajero_incidente:todos"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("El reintento antes de que llegue la recarga tampoco reenvía lo ya guardado: duplicaría su historial", async () => {
    guardarMock.mockResolvedValueOnce(CON_FALLO);
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.type(campo(d, "Por novedad"), "500");
    await u.type(campo(d, "Por incidente"), "700");
    await guardarYEsperarEnvio(u, d);
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());

    guardarMock.mockResolvedValueOnce({ status: "ok", resultados: [{ clave: "mensajero_incidente:todos", status: "ok" }] });
    await u.click(within(d).getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(guardarMock).toHaveBeenCalledTimes(2));
    expect(guardarMock.mock.calls[1]?.[0].cambios.map((c: { clave: string }) => c.clave)).toEqual(["mensajero_incidente:todos"]);
  });

  it("Un error de la petición entera no cierra ni pierde nada", async () => {
    guardarMock.mockResolvedValue({ status: "error" });
    const u = userEvent.setup();
    const { p } = montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.type(campo(d, "Por novedad"), "500");
    await guardarYEsperarEnvio(u, d);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No se pudo guardar. Lo digitado sigue aquí: vuelve a intentarlo."));
    expect(campo(d, "Por novedad")).toHaveValue("500");
    expect(p.onCambio).not.toHaveBeenCalled();
  });

  it("Si la action lanza, tampoco", async () => {
    guardarMock.mockRejectedValue(new Error("red"));
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.type(campo(d, "Por novedad"), "500");
    await guardarYEsperarEnvio(u, d);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No se pudo guardar. Lo digitado sigue aquí: vuelve a intentarlo."));
    expect(campo(d, "Por novedad")).toHaveValue("500");
  });

  it("Mientras guarda, el diálogo está ocupado y no se puede guardar dos veces", async () => {
    let soltar: (r: unknown) => void = () => undefined;
    guardarMock.mockReturnValue(new Promise((resolver) => { soltar = resolver; }));
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    await u.type(campo(d, "Por novedad"), "500");
    await u.click(within(d).getByRole("button", { name: /Guardar borrador/ }));
    await waitFor(() => expect(d).toHaveAttribute("aria-busy", "true"));
    expect(within(d).getByRole("button", { name: /Guardar borrador/ })).toBeDisabled();
    expect(within(d).getByRole("button", { name: "Cancelar" })).toBeDisabled();
    soltar({ status: "ok", resultados: [{ clave: "mensajero_novedad:todos", status: "ok" }] });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(guardarMock).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-55 R31 — añadir", () => {
  it("Ofrece solo elegibles sin valor propio", async () => {
    const u = userEvent.setup();
    montar({ valores: [...VALORES_ANA, VALOR_DARIO] });
    await u.click(screen.getByRole("button", { name: "Añadir mensajero" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByRole("heading", { name: "Añadir mensajero con valor propio" })).toBeInTheDocument();
    await u.click(within(d).getByRole("combobox", { name: "Mensajero" }));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Beto Rojas", "Caro Mena"]);
  });

  it("Sin elegir mensajero no se puede guardar, aunque haya valores digitados", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Añadir mensajero" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByRole("combobox", { name: "Mensajero" })).toHaveTextContent("Elige el mensajero");
    await u.type(campo(d, "Por entregado"), "2900");
    expect(within(d).getByRole("button", { name: "Guardar borrador" })).toBeDisabled();
    expect(guardarMock).not.toHaveBeenCalled();
  });

  it("Lo guardado va con el mensajero elegido", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirAnadirYElegir(u, "Caro Mena");
    await u.type(campo(d, "Por entregado"), "2900");
    await guardarYEsperarEnvio(u, d);
    expect(cambiosEnviados()).toEqual([
      expect.objectContaining({ accion: "fijar", datos: expect.objectContaining({ concepto: "mensajero_entregado", valor: "2900", mensajeroId: "m3" }) }),
    ]);
  });

  it.each([
    ["no queda ninguno elegible sin valor", [ANA, DADO_DE_BAJA]],
    ["no hay ningún mensajero", []],
  ] as [string, MensajeroDePantalla[]][])("Si %s lo dice, sin selector vacío ni tabla ni guardar", async (_caso, mensajeros) => {
    const u = userEvent.setup();
    montar({ mensajeros, valores: mensajeros.length === 0 ? [] : VALORES_ANA });
    await u.click(screen.getByRole("button", { name: "Añadir mensajero" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText("No hay mensajeros para añadir. Todos los activos ya tienen valor propio, o aún no hay ninguno: se crean en Usuarios.")).toBeInTheDocument();
    expect(within(d).queryByRole("combobox")).toBeNull();
    expect(within(d).queryByRole("table")).toBeNull();
    expect(within(d).queryByRole("button", { name: /Guardar/ })).toBeNull();
    expect(within(d).getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
  });

  it("R30: tras guardar parte, el mensajero queda fijo aunque la recarga lo saque de los disponibles", async () => {
    guardarMock.mockResolvedValue({
      status: "ok",
      resultados: [
        { clave: "mensajero_entregado:todos", status: "ok" },
        { clave: "mensajero_incidente:todos", status: "not_found" },
      ],
    });
    const u = userEvent.setup();
    const { p, rerender } = montar();
    const d = await abrirAnadirYElegir(u, "Caro Mena");
    await u.type(campo(d, "Por entregado"), "2900");
    await u.type(campo(d, "Por incidente"), "700");
    await guardarYEsperarEnvio(u, d);
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());

    const recargados = [...VALORES_ANA, valorPropio("mensajero_entregado", "m3", { id: "v-caro", valor: "2900.00" })];
    rerender(<TarifasMensajeros {...p} filas={filasDeMensajeros(recargados, p.mensajeros)} />);

    expect(within(d).queryByRole("combobox", { name: "Mensajero" })).toBeNull();
    expect(within(d).getByText("Caro Mena")).toBeInTheDocument();
    expect(campo(d, "Por entregado")).toHaveValue("2900");
    expect(campo(d, "Por incidente")).toHaveValue("700");
    expect(within(d).getByText("Este valor ya no existe. Recarga la pantalla.")).toBeInTheDocument();
  });
});

describe("SLT-55 R32 — el inactivo en el diálogo", () => {
  it("Sus filas con valor se editan y las vacías van deshabilitadas, con el porqué", async () => {
    const u = userEvent.setup();
    montar({ valores: [VALOR_DARIO] });
    const d = await abrirEdicion(u, "Dario Paz");
    expect(within(d).getByText("Inactivo")).toBeInTheDocument();
    expect(within(d).getByText("Este mensajero está inactivo: puedes cambiar o quitar sus valores, pero no añadir otros.")).toBeInTheDocument();
    expect(campo(d, "Por entregado")).toBeEnabled();
    expect(within(d).getByRole("combobox", { name: "Modo de Por entregado" })).not.toBeDisabled();
    for (const concepto of ["Por devolución a origen", "Por reprogramado", "Por novedad", "Por incidente"]) {
      expect(campo(d, concepto)).toBeDisabled();
      expect(within(d).getByRole("combobox", { name: `Modo de ${concepto}` })).toBeDisabled();
    }
  });

  it("Puede cambiar el valor que ya tiene", async () => {
    const u = userEvent.setup();
    montar({ valores: [VALOR_DARIO] });
    const d = await abrirEdicion(u, "Dario Paz");
    await u.clear(campo(d, "Por entregado"));
    await u.type(campo(d, "Por entregado"), "1900");
    await guardarYEsperarEnvio(u, d);
    expect(cambiosEnviados()).toEqual([
      expect.objectContaining({ accion: "fijar", datos: expect.objectContaining({ valor: "1900", mensajeroId: "m4" }) }),
    ]);
  });

  it("Un activo no tiene filas deshabilitadas ni la nota", async () => {
    const u = userEvent.setup();
    montar();
    const d = await abrirEdicion(u, "Ana Torres");
    expect(campo(d, "Por novedad")).toBeEnabled();
    expect(within(d).queryByText(/está inactivo/)).toBeNull();
  });
});

describe("SLT-55 R33 — quitar", () => {
  it("Pregunta cuántos valores se quitan y a qué pasa; al confirmar, quita solo los suyos", async () => {
    guardarMock.mockResolvedValue({ status: "ok", resultados: [] });
    const u = userEvent.setup();
    const { p } = montar({ valores: [...VALORES_ANA, VALOR_DARIO] });
    await u.click(screen.getByRole("button", { name: "Quitar valor propio de Ana Torres" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByRole("heading", { name: "Quitar el valor propio de Ana Torres" })).toBeInTheDocument();
    expect(within(d).getByText("Se quitan 2 valores. El mensajero pasa a usar el valor de la zona.")).toBeInTheDocument();
    expect(guardarMock).not.toHaveBeenCalled();

    await guardarYEsperarEnvio(u, d, "Quitar");
    expect(cambiosEnviados().map((c) => [c.accion, c.clave, c.id]).sort()).toEqual([
      ["quitar", "mensajero_entregado:todos", "v-ent"],
      ["quitar", "mensajero_rechazo:todos", "v-rec"],
    ]);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Valor propio quitado."));
    expect(p.onCambio).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Con un solo valor lo dice en singular", async () => {
    const u = userEvent.setup();
    montar({ valores: [VALOR_DARIO] });
    await u.click(screen.getByRole("button", { name: "Quitar valor propio de Dario Paz" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText("Se quita 1 valor. El mensajero pasa a usar el valor de la zona.")).toBeInTheDocument();
  });

  it("Cancelar no quita nada", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Quitar valor propio de Ana Torres" }));
    const d = await screen.findByRole("dialog");
    await u.click(within(d).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(guardarMock).not.toHaveBeenCalled();
  });

  it("Si falla uno lo dice, sigue abierto, y el reintento pide solo lo que queda", async () => {
    guardarMock.mockResolvedValueOnce({
      status: "ok",
      resultados: [
        { clave: "mensajero_entregado:todos", status: "ok" },
        { clave: "mensajero_rechazo:todos", status: "error" },
      ],
    });
    const u = userEvent.setup();
    const { p, rerender } = montar();
    await u.click(screen.getByRole("button", { name: "Quitar valor propio de Ana Torres" }));
    const d = await screen.findByRole("dialog");
    await guardarYEsperarEnvio(u, d, "Quitar");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No se pudo guardar. Lo digitado sigue aquí: vuelve a intentarlo."));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(p.onCambio).toHaveBeenCalled();

    rerender(<TarifasMensajeros {...p} filas={filasDeMensajeros([VALORES_ANA[1] as TarifaValorDTO], p.mensajeros)} />);
    expect(within(d).getByText("Se quita 1 valor. El mensajero pasa a usar el valor de la zona.")).toBeInTheDocument();
    guardarMock.mockResolvedValueOnce({ status: "ok", resultados: [{ clave: "mensajero_rechazo:todos", status: "ok" }] });
    await u.click(within(d).getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(guardarMock).toHaveBeenCalledTimes(2));
    expect(guardarMock.mock.calls[1]?.[0].cambios.map((c: { id: string }) => c.id)).toEqual(["v-rec"]);
  });

  it("Si la action lanza lo dice y no da nada por hecho", async () => {
    guardarMock.mockRejectedValue(new Error("red"));
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Quitar valor propio de Ana Torres" }));
    const d = await screen.findByRole("dialog");
    await guardarYEsperarEnvio(u, d, "Quitar");
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
