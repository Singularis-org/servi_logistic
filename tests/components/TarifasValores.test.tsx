// @vitest-environment jsdom
// SLT-54 (R20, R24, R33-R40, R61) — la rejilla de valores. Se afirma el payload espiado: es lo que llega a
// dinero, y una pantalla correcta a la vista puede mandar otra cosa.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TarifasValores, type TarifasValoresProps } from "@/app/(app)/configuracion/tarifas/_components/TarifasValores";
import { conceptosDeActor, etiquetaConcepto } from "@/app/(app)/configuracion/tarifas/_components/tarifas-textos";
import { CATALOGO_CONCEPTOS } from "@/lib/tarifas/catalogo";
import { monedaConfig } from "@/lib/config/moneda";
import type { TarifaConcepto } from "@prisma/client";

import { referenciaUniforme, valor } from "../fixtures/tarifas-pantalla";

const { guardarMock, toast } = vi.hoisted(() => ({
  guardarMock: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/actions/tarifas", () => ({ guardarValoresTarifa: (i: unknown) => guardarMock(i) }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => toast }));

const HOY = referenciaUniforme({ tipo: "monto", valor: "2800.00", ivaPct: "13.00" });

function props(extra: Partial<TarifasValoresProps> = {}): TarifasValoresProps {
  return {
    zonaId: "z1",
    nivel: { tipo: "zona" },
    valores: [],
    referencia: HOY,
    vehiculos: [{ id: "v1", nombre: "Moto", activo: true }],
    activada: false,
    puedeEscribir: true,
    actor: "tienda",
    onActor: vi.fn(),
    onGuardado: vi.fn(),
    onSucioChange: vi.fn(),
    ...extra,
  };
}

function okDe(...claves: string[]) {
  return { status: "ok", resultados: claves.map((clave) => ({ clave, status: "ok" })) };
}

/** El único envío, ya desempaquetado. */
function cambiosEnviados() {
  expect(guardarMock).toHaveBeenCalledTimes(1);
  return guardarMock.mock.calls[0][0].cambios;
}

const guardarBoton = () => screen.getByRole("button", { name: "Guardar borrador" });

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SLT-54 — referencia «Hoy rige»", () => {
  it("R20: la referencia no entra en el campo, y un campo vacío no se guarda", () => {
    render(<TarifasValores {...props()} />);

    expect(screen.getAllByText("₡2.800 + 13 % IVA")).toHaveLength(7);
    const campo = screen.getByRole("textbox", { name: "Valor de Flete por entregado" });
    expect(campo).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "IVA de Flete por entregado" })).toHaveValue("");
    expect(guardarBoton()).toBeDisabled();
  });

  it("R20: guardar solo manda lo digitado; lo demás no copia nada de «Hoy rige»", async () => {
    guardarMock.mockResolvedValue(okDe("tienda_flete_entregado:todos"));
    const u = userEvent.setup();
    render(<TarifasValores {...props()} />);

    await u.type(screen.getByRole("textbox", { name: "Valor de Flete por entregado" }), "3000");
    await u.type(screen.getByRole("textbox", { name: "IVA de Flete por entregado" }), "13");
    await u.click(guardarBoton());

    await waitFor(() => expect(guardarMock).toHaveBeenCalled());
    const cambios = cambiosEnviados();
    expect(cambios).toHaveLength(1);
    expect(cambios[0].datos.valor).toBe("3000");
  });

  it("R24: sin Hoy rige tras activar: ni columna ni texto, aunque llegara algo", () => {
    render(<TarifasValores {...props({ activada: true, referencia: null })} />);
    expect(screen.queryByRole("columnheader", { name: "Hoy rige" })).toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
  });
});

describe("SLT-54 — filas y columnas", () => {
  it("R33: las filas salen del catálogo, 7, 5 y 5, en el orden de la maqueta", () => {
    render(<TarifasValores {...props()} />);
    const nombres = screen.getAllByRole("row").slice(1).map((f) => within(f).getAllByRole("cell")[0].textContent);
    expect(nombres).toEqual([
      "Flete por entregado",
      "Flete por devolución a origen",
      "Flete por reprogramado",
      "Flete por novedad",
      "Flete por incidente",
      "Fulfillment",
      "Comisión COD",
    ]);
    expect(conceptosDeActor("mensajero")).toHaveLength(5);
    expect(conceptosDeActor("satelite")).toHaveLength(5);
  });

  it("R33: un concepto nuevo del catálogo aparece sin tocar la pantalla", () => {
    const catalogo = {
      ...CATALOGO_CONCEPTOS,
      mensajero_recoleccion: { actor: "mensajero", resultado: "recoleccion_nueva", base: "flete" },
    } as never;
    const conceptos = conceptosDeActor("mensajero", catalogo);
    expect(conceptos).toHaveLength(6);
    expect(conceptos.at(-1)).toBe("mensajero_recoleccion");
    expect(etiquetaConcepto("mensajero_recoleccion" as TarifaConcepto, catalogo)).toBe("Por recoleccion nueva");
  });

  it("R34: cobro con IVA; las pestañas de pago sin campo de IVA", () => {
    const { rerender } = render(<TarifasValores {...props()} />);
    expect(screen.getByRole("columnheader", { name: "IVA" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /^IVA de/ })).toHaveLength(7);

    for (const actor of ["mensajero", "satelite"] as const) {
      rerender(<TarifasValores {...props({ actor })} />);
      expect(screen.queryByRole("columnheader", { name: "IVA" })).toBeNull();
      expect(screen.queryAllByRole("textbox", { name: /^IVA de/ })).toHaveLength(0);
    }
  });

  it("R34, R61: el modo se elige por concepto, con el símbolo de la configuración", async () => {
    guardarMock.mockResolvedValue(okDe("mensajero_entregado:todos"));
    const u = userEvent.setup();
    render(<TarifasValores {...props({ actor: "mensajero" })} />);

    await u.click(screen.getByRole("combobox", { name: "Modo de Por entregado" }));
    expect(screen.getByRole("option", { name: `Monto ${monedaConfig.simbolo}` })).toBeInTheDocument();
    await u.click(screen.getByRole("option", { name: "%" }));
    await u.type(screen.getByRole("textbox", { name: "Valor de Por entregado" }), "50");
    await u.click(guardarBoton());

    await waitFor(() => expect(guardarMock).toHaveBeenCalled());
    expect(cambiosEnviados()[0].datos).toMatchObject({ modo: "porcentaje", valor: "50" });
  });

  it("La comisión COD nace en %: un 3,5 en monto cobraría 3,5 de moneda por orden", () => {
    render(<TarifasValores {...props()} />);
    expect(screen.getByRole("combobox", { name: "Modo de Comisión COD" })).toHaveTextContent("%");
    expect(screen.getByRole("combobox", { name: "Modo de Fulfillment" })).toHaveTextContent("Monto");
  });
});

describe("SLT-54 — guardar", () => {
  it("R36: un pago no lleva la clave ivaPct, ni siquiera vacía", async () => {
    guardarMock.mockResolvedValue(okDe("mensajero_entregado:todos"));
    const u = userEvent.setup();
    render(<TarifasValores {...props({ actor: "mensajero" })} />);

    await u.type(screen.getByRole("textbox", { name: "Valor de Por entregado" }), "1500");
    await u.click(guardarBoton());

    await waitFor(() => expect(guardarMock).toHaveBeenCalled());
    const { datos } = cambiosEnviados()[0];
    expect(datos).not.toHaveProperty("ivaPct");
    expect(datos).toEqual({
      concepto: "mensajero_entregado",
      modo: "monto",
      valor: "1500",
      zonaId: "z1",
      grupoId: null,
      tiendaId: null,
      vehiculoId: null,
    });
  });

  it("R34: un cobro lleva su IVA y su nivel", async () => {
    guardarMock.mockResolvedValue(okDe("tienda_flete_entregado:todos"));
    const u = userEvent.setup();
    render(<TarifasValores {...props({ nivel: { tipo: "grupo", grupoId: "g1" } })} />);

    await u.type(screen.getByRole("textbox", { name: "Valor de Flete por entregado" }), "3200,5");
    await u.type(screen.getByRole("textbox", { name: "IVA de Flete por entregado" }), "13");
    await u.click(guardarBoton());

    await waitFor(() => expect(guardarMock).toHaveBeenCalled());
    expect(cambiosEnviados()[0]).toEqual({
      accion: "fijar",
      clave: "tienda_flete_entregado:todos",
      datos: {
        concepto: "tienda_flete_entregado",
        modo: "monto",
        valor: "3200.5",
        ivaPct: "13",
        zonaId: "z1",
        grupoId: "g1",
        tiendaId: null,
        vehiculoId: null,
      },
    });
  });

  it("R41: el nivel de tienda en todas sus zonas no lleva zona", async () => {
    guardarMock.mockResolvedValue(okDe("tienda_flete_entregado:todos"));
    const u = userEvent.setup();
    render(<TarifasValores {...props({ nivel: { tipo: "tienda", tiendaId: "t1", alcance: { tipo: "todas" } } })} />);

    await u.type(screen.getByRole("textbox", { name: "Valor de Flete por entregado" }), "2200");
    await u.type(screen.getByRole("textbox", { name: "IVA de Flete por entregado" }), "13");
    await u.click(guardarBoton());

    await waitFor(() => expect(guardarMock).toHaveBeenCalled());
    expect(cambiosEnviados()[0].datos).toMatchObject({ zonaId: null, grupoId: null, tiendaId: "t1" });
  });

  it("R35: vaciar un valor guardado lo quita; no lo fija en 0", async () => {
    guardarMock.mockResolvedValue(okDe("tienda_flete_entregado:todos"));
    const u = userEvent.setup();
    render(<TarifasValores {...props({ valores: [valor("tienda_flete_entregado", { id: "guardado-1" })] })} />);

    const campo = screen.getByRole("textbox", { name: "Valor de Flete por entregado" });
    expect(campo).toHaveValue("1500");
    await u.clear(campo);
    await u.click(guardarBoton());

    await waitFor(() => expect(guardarMock).toHaveBeenCalled());
    expect(cambiosEnviados()).toEqual([{ accion: "quitar", clave: "tienda_flete_entregado:todos", id: "guardado-1" }]);
  });

  it("R35, R39: un vacío sin valor guardado no manda nada; un 0 escrito sí es un 0", async () => {
    guardarMock.mockResolvedValue(okDe("mensajero_novedad:todos"));
    const u = userEvent.setup();
    render(<TarifasValores {...props({ actor: "mensajero" })} />);

    const entregado = screen.getByRole("textbox", { name: "Valor de Por entregado" });
    await u.type(entregado, "5");
    await u.clear(entregado);
    expect(guardarBoton()).toBeDisabled();

    await u.type(screen.getByRole("textbox", { name: "Valor de Por novedad" }), "0");
    await u.click(guardarBoton());

    await waitFor(() => expect(guardarMock).toHaveBeenCalled());
    const cambios = cambiosEnviados();
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ accion: "fijar", clave: "mensajero_novedad:todos" });
    expect(cambios[0].datos.valor).toBe("0");
  });

  it("R35: lo que no cambió no se envía, tampoco con otra escritura del mismo número", async () => {
    guardarMock.mockResolvedValue(okDe("x"));
    const u = userEvent.setup();
    render(
      <TarifasValores
        {...props({ valores: [valor("tienda_flete_entregado", { valor: "1500.50" }), valor("tienda_flete_rechazo")] })}
      />,
    );

    await u.clear(screen.getByRole("textbox", { name: "Valor de Flete por entregado" }));
    await u.type(screen.getByRole("textbox", { name: "Valor de Flete por entregado" }), "1500,5");
    expect(guardarBoton()).toBeDisabled();
    expect(guardarMock).not.toHaveBeenCalled();

    await u.clear(screen.getByRole("textbox", { name: "IVA de Flete por devolución a origen" }));
    await u.type(screen.getByRole("textbox", { name: "IVA de Flete por devolución a origen" }), "4");
    await u.click(guardarBoton());
    await waitFor(() => expect(guardarMock).toHaveBeenCalled());
    expect(cambiosEnviados().map((c: { clave: string }) => c.clave)).toEqual(["tienda_flete_rechazo:todos"]);
  });

  it("R61: el IVA nace vacío y es obligatorio al digitar un cobro: esa fila no sale", async () => {
    guardarMock.mockResolvedValue(okDe("tienda_flete_rechazo:todos"));
    const u = userEvent.setup();
    render(<TarifasValores {...props()} />);

    await u.type(screen.getByRole("textbox", { name: "Valor de Flete por entregado" }), "2800");
    await u.click(guardarBoton());
    expect(await screen.findByText("Digita el IVA de este cobro. Si no lleva, escribe 0.")).toBeInTheDocument();
    expect(guardarMock).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Valor de Flete por entregado" })).toHaveValue("2800");

    // El resto del borrador sí sale, y el error se queda en su fila.
    await u.type(screen.getByRole("textbox", { name: "Valor de Flete por devolución a origen" }), "100");
    await u.type(screen.getByRole("textbox", { name: "IVA de Flete por devolución a origen" }), "13");
    await u.click(guardarBoton());
    await waitFor(() => expect(guardarMock).toHaveBeenCalled());
    expect(cambiosEnviados().map((c: { clave: string }) => c.clave)).toEqual(["tienda_flete_rechazo:todos"]);
    expect(await screen.findByText("Digita el IVA de este cobro. Si no lleva, escribe 0.")).toBeInTheDocument();
  });

  it("R37, R38: la carrera se pinta en su fila, lo digitado se conserva y lo demás queda guardado", async () => {
    const CARRERA = "Otro cambio fijó este concepto en el mismo nivel al mismo tiempo. Recarga y vuelve a intentarlo.";
    guardarMock.mockResolvedValue({
      status: "ok",
      resultados: [
        { clave: "mensajero_entregado:todos", status: "ok" },
        { clave: "mensajero_novedad:todos", status: "validation_error", fieldErrors: { concepto: [CARRERA] } },
      ],
    });
    const u = userEvent.setup();
    const onGuardado = vi.fn();
    render(<TarifasValores {...props({ actor: "mensajero", onGuardado })} />);

    await u.type(screen.getByRole("textbox", { name: "Valor de Por entregado" }), "1500");
    await u.type(screen.getByRole("textbox", { name: "Valor de Por novedad" }), "700");
    await u.click(guardarBoton());

    const error = await screen.findByText(CARRERA);
    const fila = error.closest("tr");
    expect(fila).not.toBeNull();
    expect(within(fila as HTMLElement).getByRole("textbox", { name: "Valor de Por novedad" })).toHaveValue("700");
    expect(toast.warning).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(screen.getByRole("textbox", { name: "Valor de Por entregado" })).toHaveValue("");
  });

  it("R38: un fallo del guardado entero no borra lo digitado", async () => {
    guardarMock.mockResolvedValue({ status: "error" });
    const u = userEvent.setup();
    render(<TarifasValores {...props({ actor: "mensajero" })} />);

    await u.type(screen.getByRole("textbox", { name: "Valor de Por entregado" }), "1500");
    await u.click(guardarBoton());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No se pudo guardar. Lo digitado sigue aquí: vuelve a intentarlo."));
    expect(screen.getByRole("textbox", { name: "Valor de Por entregado" })).toHaveValue("1500");
  });

  it("R58: mientras guarda, el botón no admite un segundo envío", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    guardarMock.mockImplementation(() => new Promise((r) => (soltar = r)));
    const u = userEvent.setup();
    render(<TarifasValores {...props({ actor: "mensajero" })} />);

    await u.type(screen.getByRole("textbox", { name: "Valor de Por entregado" }), "1500");
    const boton = guardarBoton();
    await u.click(boton);
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute("aria-busy", "true");
    await u.click(boton);
    expect(guardarMock).toHaveBeenCalledTimes(1);
    soltar(okDe("mensajero_entregado:todos"));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("R38: lo digitado mientras guarda no se envió y no se pierde (lo destapó el E2E)", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    guardarMock.mockImplementation(() => new Promise((r) => (soltar = r)));
    const u = userEvent.setup();
    render(<TarifasValores {...props({ actor: "mensajero" })} />);

    await u.type(screen.getByRole("textbox", { name: "Valor de Por entregado" }), "1500");
    await u.click(guardarBoton());
    const otra = screen.getByRole("textbox", { name: "Valor de Por novedad" });
    await u.type(otra, "250");
    soltar(okDe("mensajero_entregado:todos"));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    expect(otra).toHaveValue("250");
    // Sigue pendiente: el botón se puede volver a pulsar, y solo lleva lo que faltó por enviar.
    await waitFor(() => expect(guardarBoton()).toBeEnabled());
    guardarMock.mockResolvedValue(okDe("mensajero_novedad:todos"));
    await u.click(guardarBoton());
    expect(guardarMock).toHaveBeenCalledTimes(2);
    expect(guardarMock.mock.calls[1][0].cambios).toEqual([
      {
        accion: "fijar",
        clave: "mensajero_novedad:todos",
        datos: expect.objectContaining({ concepto: "mensajero_novedad", valor: "250" }),
      },
    ]);
  });

  it("R40: en borrador dice que no rige; en vigor, que aplica desde el siguiente cierre", async () => {
    guardarMock.mockResolvedValue(okDe("mensajero_entregado:todos"));
    const u = userEvent.setup();
    const { unmount } = render(<TarifasValores {...props({ actor: "mensajero" })} />);
    await u.type(screen.getByRole("textbox", { name: "Valor de Por entregado" }), "1");
    await u.click(guardarBoton());
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Borrador guardado. No cambia ningún cobro ni pago hasta que actives."),
    );
    unmount();
    toast.success.mockClear();

    render(<TarifasValores {...props({ actor: "mensajero", activada: true, referencia: null })} />);
    await u.type(screen.getByRole("textbox", { name: "Valor de Por entregado" }), "1");
    await u.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Guardado. El cambio aplica desde el siguiente cierre; los cierres ya hechos no cambian.",
      ),
    );
  });

  it("Avisa al padre de que hay algo sin guardar, para que no se pierda al cambiar de nivel", async () => {
    const onSucioChange = vi.fn();
    const u = userEvent.setup();
    render(<TarifasValores {...props({ actor: "mensajero", onSucioChange })} />);
    expect(onSucioChange).toHaveBeenLastCalledWith(false);
    await u.type(screen.getByRole("textbox", { name: "Valor de Por entregado" }), "1");
    expect(onSucioChange).toHaveBeenLastCalledWith(true);
  });
});

describe("SLT-54 — qué significa vacío", () => {
  it.each([
    [{ tipo: "zona" } as const, "Sin definir", "Un campo vacío queda sin definir. Un 0 escrito cobra 0."],
    [{ tipo: "grupo", grupoId: "g1" } as const, "Usa la zona", "Un campo vacío usa el valor de la zona. Un 0 escrito cobra 0."],
    [
      { tipo: "tienda", tiendaId: "t1", alcance: { tipo: "zona" } } as const,
      "Usa general",
      "Un campo vacío usa el valor general. Un 0 escrito cobra 0.",
    ],
  ])("R39: %j", (nivel, placeholder, nota) => {
    render(<TarifasValores {...props({ nivel })} />);
    expect(screen.getByRole("textbox", { name: "Valor de Flete por entregado" })).toHaveAttribute("placeholder", placeholder);
    expect(screen.getByText(nota)).toBeInTheDocument();
  });

  it("R39: el pago dice que un 0 paga 0", () => {
    render(<TarifasValores {...props({ actor: "satelite" })} />);
    expect(screen.getByText(/Un 0 escrito paga 0\./)).toBeInTheDocument();
  });

  it("R33: una tienda no tiene pagos, y sin elegirla no hay campos", () => {
    const { rerender } = render(
      <TarifasValores {...props({ actor: "mensajero", nivel: { tipo: "tienda", tiendaId: "t1", alcance: { tipo: "zona" } } })} />,
    );
    expect(screen.getByText(/Una tienda solo tiene cobro/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();

    rerender(<TarifasValores {...props({ nivel: { tipo: "tienda", tiendaId: null, alcance: { tipo: "zona" } } })} />);
    expect(screen.getByText("Elige la tienda para digitar su precio.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("SLT-54 — solo lectura", () => {
  it("R55: `admin` ve los datos como texto, sin controles ni llamada de escritura", () => {
    render(
      <TarifasValores
        {...props({ puedeEscribir: false, valores: [valor("tienda_comision_cod", { modo: "porcentaje", valor: "3.50", ivaPct: "13.00" })] })}
      />,
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Guardar/ })).toBeNull();
    const fila = screen.getByRole("row", { name: /Comisión COD/ });
    expect(within(fila).getByText("3,5 %")).toBeInTheDocument();
    expect(within(fila).getByText("13 %")).toBeInTheDocument();
    expect(guardarMock).not.toHaveBeenCalled();
  });
});
