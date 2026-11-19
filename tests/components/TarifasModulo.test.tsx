// @vitest-environment jsdom
// SLT-54 (R8, R17, R33, R40, R55, R57, R58) — el marco de la pantalla, con las actions dobladas.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TarifasErrorCarga, TarifasModule, type PantallaOk } from "@/app/(app)/configuracion/tarifas/_components/TarifasModule";
import { ETIQUETAS_NEUTRAS } from "@/lib/types/pais";
import { EtiquetasGeograficasProvider } from "@/providers/EtiquetasGeograficasProvider";

import { mensajeroPantalla, referenciaUniforme, valor, valorPropio, zonaOk, zonaResumen } from "../fixtures/tarifas-pantalla";

const { cargarZonaMock, guardarMock, activarMock, refreshMock, toast } = vi.hoisted(() => ({
  cargarZonaMock: vi.fn(),
  guardarMock: vi.fn(),
  activarMock: vi.fn(),
  refreshMock: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/lib/actions/tarifas", () => ({
  cargarZonaTarifas: (i: unknown) => cargarZonaMock(i),
  guardarValoresTarifa: (i: unknown) => guardarMock(i),
  guardarTopeIntentos: vi.fn(),
  activarTarifasNuevas: (i: unknown) => activarMock(i),
  crearGrupoDistritos: vi.fn(),
  renombrarGrupoDistritos: vi.fn(),
  cambiarDistritosDeGrupo: vi.fn(),
  borrarGrupoDistritos: vi.fn(),
}));
vi.mock("@/hooks/useToast", () => ({ useToast: () => toast }));

const REF = referenciaUniforme({ tipo: "no_cobra" });

const PANTALLA: PantallaOk = {
  status: "ok",
  activacion: null,
  zonas: [
    zonaResumen({ id: "z1", nombre: "Norte", esCentral: true, estado: "completa" }),
    zonaResumen({ id: "z2", nombre: "Sur", estado: "faltan", faltantes: [{ concepto: "tienda_flete_rechazo" }] }),
    zonaResumen({
      id: "z3",
      nombre: "Este",
      estado: "sin_empezar",
      faltantes: [{ concepto: "tienda_flete_entregado" }, { concepto: "tienda_flete_rechazo" }, { concepto: "mensajero_entregado" }],
    }),
  ],
  vehiculos: [],
  tiendas: [{ id: "t1", nombre: "Tienda Uno" }],
  preciosTienda: [],
  mensajeros: [],
  valoresMensajero: [],
  topeIntentos: 3,
  puedeEscribir: true,
};

function montar(pantalla: Partial<PantallaOk> = {}, zonaInicial: Parameters<typeof TarifasModule>[0]["zonaInicial"] = zonaOk({ referencia: REF })) {
  const p = { ...PANTALLA, ...pantalla };
  return render(
    <TarifasModule pantalla={p} zonaInicialId={p.zonas[0]?.id ?? null} zonaInicial={p.zonas.length === 0 ? null : zonaInicial} nombresDeGrupo={{}} />,
  );
}

const zonaBoton = (nombre: RegExp) => within(screen.getByRole("region", { name: "Zonas" })).getByRole("button", { name: nombre });

beforeEach(() => {
  vi.clearAllMocks();
  cargarZonaMock.mockResolvedValue(zonaOk({ referencia: REF }));
});
afterEach(() => cleanup());

describe("SLT-77 — la sección del tope en el módulo", () => {
  const seccion = () => screen.getByRole("region", { name: "Intentos de entrega" });

  it("R12: la empresa con zonas ve el valor que da la pantalla", () => {
    montar({ topeIntentos: 7 });
    expect(within(seccion()).getByRole("combobox", { name: "Intentos de entrega" })).toHaveTextContent("7");
  });

  it("R12: una empresa sin zonas también la ve: el tope no depende de ellas", () => {
    montar({ zonas: [], topeIntentos: 4 });
    expect(screen.getByText("Aún no hay zonas")).toBeInTheDocument();
    expect(within(seccion()).getByRole("combobox", { name: "Intentos de entrega" })).toHaveTextContent("4");
  });

  it("R12: con la zona abierta borrada en otra sesión, también", () => {
    const zonas = [zonaResumen({ id: "z9", nombre: "Otra" })];
    render(<TarifasModule pantalla={{ ...PANTALLA, zonas, topeIntentos: 5 }} zonaInicialId="borrada" zonaInicial={null} nombresDeGrupo={{}} />);
    expect(screen.getByText("No se pudieron cargar los valores de esta zona.")).toBeInTheDocument();
    expect(within(seccion()).getByRole("combobox", { name: "Intentos de entrega" })).toHaveTextContent("5");
  });

  it("R13: `puedeEscribir` falso llega a la sección: solo lectura, sin control ni botón", () => {
    montar({ topeIntentos: 6, puedeEscribir: false });
    expect(within(seccion()).getByText("6")).toBeInTheDocument();
    expect(within(seccion()).queryByRole("combobox")).toBeNull();
    expect(within(seccion()).queryByRole("button")).toBeNull();
  });
});

describe("SLT-54 — estados de zona", () => {
  it("R17: «Completa», «Faltan N», «Sin empezar» y «M de T zonas completas» con esos mismos estados", () => {
    montar();
    expect(zonaBoton(/Norte/)).toHaveTextContent("Completa");
    expect(zonaBoton(/Sur/)).toHaveTextContent("Faltan 1");
    expect(zonaBoton(/Este/)).toHaveTextContent("Sin empezar");
    expect(screen.getByText("1 de 3 zonas completas")).toBeInTheDocument();
  });

  it("R17: la zona abierta se marca, y la central se distingue", () => {
    montar();
    expect(zonaBoton(/Norte/)).toHaveAttribute("aria-current", "true");
    expect(zonaBoton(/Sur/)).not.toHaveAttribute("aria-current");
    expect(zonaBoton(/Norte/)).toHaveTextContent("Bodega principal");
  });
});

describe("SLT-54 — borrador y en vigor", () => {
  it("R40: en borrador, la banda y el botón de activar", () => {
    montar();
    const banda = screen.getByRole("region", { name: "Estado de las tarifas" });
    expect(within(banda).getByText("Borrador: aún rigen las tarifas actuales")).toBeInTheDocument();
    expect(within(banda).getByRole("button", { name: "Activar tarifas nuevas" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Hoy rige" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar borrador" })).toBeInTheDocument();
  });

  it("R40: en vigor, sin banda ni activar, con la nota, y se sigue editando", () => {
    montar({ activacion: { activadaAt: new Date("2026-11-12T18:00:00Z") } }, zonaOk({ referencia: null }));
    expect(screen.queryByRole("region", { name: "Estado de las tarifas" })).toBeNull();
    expect(screen.queryByText(/Borrador/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Activar tarifas nuevas" })).toBeNull();
    expect(screen.getByText("Cada cambio aplica desde el siguiente cierre. Los cierres ya hechos no cambian.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Valor de Flete por entregado" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeInTheDocument();
    expect(screen.getByText("1 de 3 zonas completas")).toBeInTheDocument();
  });

  it("R8: sin desactivar: ninguna pantalla ofrece volver atrás", () => {
    montar({ activacion: { activadaAt: new Date("2026-11-12T18:00:00Z") } }, zonaOk({ referencia: null }));
    for (const nombre of [/desactivar/i, /revertir/i, /volver atr/i, /deshacer/i]) {
      expect(screen.queryByRole("button", { name: nombre })).toBeNull();
    }
  });

  it("R18: activar abre el diálogo y, activada, recarga la pantalla", async () => {
    activarMock.mockResolvedValue({ status: "ok", activadaAt: new Date() });
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Activar tarifas nuevas" }));
    const d = await screen.findByRole("dialog");
    await u.click(within(d).getByRole("checkbox"));
    await u.click(within(d).getByRole("button", { name: "Activar con lo que falta" }));

    await waitFor(() => expect(activarMock).toHaveBeenCalledWith({ confirmaFaltantes: true }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("R18: «Completar» lleva a esa zona", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: "Activar tarifas nuevas" }));
    const d = await screen.findByRole("dialog");
    await u.click(within(d).getAllByRole("link", { name: "Completar" })[1]);

    await waitFor(() => expect(cargarZonaMock).toHaveBeenCalledWith({ zonaId: "z3" }));
    await waitFor(() => expect(zonaBoton(/Este/)).toHaveAttribute("aria-current", "true"));
    expect(screen.getByRole("heading", { level: 2, name: "Este" })).toBeInTheDocument();
  });
});

describe("SLT-54 — permisos", () => {
  it("R55: `admin` ve los mismos datos, sin controles de escritura ni de activar", () => {
    montar(
      { puedeEscribir: false },
      zonaOk({ referencia: REF, valores: [valor("tienda_flete_entregado", { valor: "2800.00" })] }),
    );
    expect(screen.getByText("₡2.800")).toBeInTheDocument();
    expect(screen.getByText("Borrador: aún rigen las tarifas actuales")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activar tarifas nuevas" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Guardar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Crear grupo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Añadir precio de tienda" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("R55: el `admin` también cambia de zona para leer", async () => {
    const u = userEvent.setup();
    montar({ puedeEscribir: false });
    await u.click(zonaBoton(/Sur/));
    await waitFor(() => expect(cargarZonaMock).toHaveBeenCalledWith({ zonaId: "z2" }));
  });
});

describe("SLT-54 — estados de carga", () => {
  it("R57: sin zonas enseña a crearlas y enlaza a Zonas", () => {
    montar({ zonas: [] });
    expect(screen.getByText("Aún no hay zonas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Zonas" })).toHaveAttribute("href", "/configuracion/zonas");
    expect(screen.queryByTestId("tarifas-panel")).toBeNull();
  });

  it("R58: mientras carga una zona, esqueleto en el panel", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    cargarZonaMock.mockImplementation(() => new Promise((r) => (soltar = r)));
    const u = userEvent.setup();
    montar();
    await u.click(zonaBoton(/Sur/));

    expect(await screen.findByTestId("tarifas-esqueleto")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Valor de Flete por entregado" })).toBeNull();
    soltar(zonaOk({ referencia: REF }));
    expect(await screen.findByRole("textbox", { name: "Valor de Flete por entregado" })).toBeInTheDocument();
    expect(screen.queryByTestId("tarifas-esqueleto")).toBeNull();
  });

  it("R57: si la lectura de una zona falla, error con reintento y no un vacío", async () => {
    cargarZonaMock.mockResolvedValueOnce({ status: "error" });
    const u = userEvent.setup();
    montar();
    await u.click(zonaBoton(/Sur/));

    expect(await screen.findByText("No se pudieron cargar los valores de esta zona.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Valor de Flete por entregado" })).toBeNull();
    expect(screen.queryByText("Esta zona no tiene grupos")).toBeNull();

    await u.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("textbox", { name: "Valor de Flete por entregado" })).toBeInTheDocument();
    expect(cargarZonaMock).toHaveBeenLastCalledWith({ zonaId: "z2" });
  });

  it("R57: la primera lectura fallida también da error, y una excepción igual", async () => {
    montar({}, { status: "error" });
    expect(screen.getByText("No se pudieron cargar los valores de esta zona.")).toBeInTheDocument();
    cleanup();

    cargarZonaMock.mockRejectedValueOnce(new Error("red"));
    const u = userEvent.setup();
    montar();
    await u.click(zonaBoton(/Sur/));
    expect(await screen.findByText("No se pudieron cargar los valores de esta zona.")).toBeInTheDocument();
  });

  it("R57: el reintento de la pantalla entera vuelve a pedirla", async () => {
    const u = userEvent.setup();
    render(<TarifasErrorCarga />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las tarifas");
    await u.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("Una respuesta lenta de otra zona no pisa a la que se está viendo", async () => {
    const soltar: Record<string, (v: unknown) => void> = {};
    cargarZonaMock.mockImplementation(({ zonaId }: { zonaId: string }) => new Promise((r) => (soltar[zonaId] = r)));
    const u = userEvent.setup();
    montar();
    await u.click(zonaBoton(/Sur/));
    await u.click(zonaBoton(/Este/));

    soltar.z3(zonaOk({ referencia: null, valores: [valor("tienda_flete_entregado", { zonaId: "z3", valor: "333.00" })] }));
    expect(await screen.findByRole("textbox", { name: "Valor de Flete por entregado" })).toHaveValue("333");
    soltar.z2(zonaOk({ referencia: null, valores: [valor("tienda_flete_entregado", { zonaId: "z2", valor: "222.00" })] }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole("textbox", { name: "Valor de Flete por entregado" })).toHaveValue("333");
  });
});

describe("SLT-54 — el detalle de la lista de zonas, como la maqueta", () => {
  const LISTA: PantallaOk["zonas"] = [
    zonaResumen({ id: "z0", nombre: "Principal", esCentral: true, grupos: [{ nombre: "Centro", distritos: 3 }] }),
    zonaResumen({ id: "z1", nombre: "Libre", grupos: [] }),
    zonaResumen({ id: "z2", nombre: "Uno", grupos: [{ nombre: "Zona especial", distritos: 8 }] }),
    zonaResumen({ id: "z3", nombre: "Singular", grupos: [{ nombre: "Costa", distritos: 1 }] }),
    zonaResumen({ id: "z4", nombre: "Vacio", grupos: [{ nombre: "Pendiente", distritos: 0 }] }),
    zonaResumen({
      id: "z5",
      nombre: "Varios",
      grupos: [
        { nombre: "A", distritos: 2 },
        { nombre: "B", distritos: 2 },
      ],
    }),
  ];

  const etiquetas = (singular: string, plural: string) => ({
    ...ETIQUETAS_NEUTRAS,
    distrito: { singular, plural },
  });
  const montarLista = (singular: string, plural: string) => {
    const p = { ...PANTALLA, zonas: LISTA };
    return render(
      <EtiquetasGeograficasProvider etiquetas={etiquetas(singular, plural)}>
        <TarifasModule pantalla={p} zonaInicialId={p.zonas[0]?.id ?? null} zonaInicial={null} nombresDeGrupo={{}} />
      </EtiquetasGeograficasProvider>,
    );
  };

  it("sale del loader, sin abrir ninguna zona", () => {
    montarLista("Distrito", "Distritos");
    expect(zonaBoton(/Principal/)).toHaveTextContent("Bodega principal");
    expect(zonaBoton(/Libre/)).toHaveTextContent("Sin grupos");
    expect(zonaBoton(/Uno/)).toHaveTextContent("Zona especial: 8 distritos");
    expect(zonaBoton(/Singular/)).toHaveTextContent("Costa: 1 distrito");
    expect(zonaBoton(/Vacio/)).toHaveTextContent("1 grupo");
    expect(zonaBoton(/Varios/)).toHaveTextContent("2 grupos");
    expect(cargarZonaMock).not.toHaveBeenCalled();
  });

  it("R61: el nivel lo nombra el país, en singular y en plural", () => {
    montarLista("Municipio", "Municipios");
    expect(zonaBoton(/Uno/)).toHaveTextContent("Zona especial: 8 municipios");
    expect(zonaBoton(/Singular/)).toHaveTextContent("Costa: 1 municipio");
    expect(screen.getByRole("region", { name: "Zonas" }).textContent).not.toMatch(/distrito/i);
  });

  it("al abrir una zona, manda lo recién leído: un grupo nuevo se ve sin recargar", async () => {
    cargarZonaMock.mockResolvedValue(
      zonaOk({
        referencia: REF,
        grupos: [
          {
            id: "g9",
            zonaId: "z1",
            nombre: "Recien",
            distritos: [
              { id: "d1", nombre: "Alfa" },
              { id: "d2", nombre: "Beta" },
            ],
          },
        ],
      }),
    );
    const u = userEvent.setup();
    montarLista("Distrito", "Distritos");
    await u.click(zonaBoton(/Libre/));
    await waitFor(() => expect(zonaBoton(/Libre/)).toHaveTextContent("Recien: 2 distritos"));
  });
});

describe("SLT-54 — selector de nivel", () => {
  const CON_GRUPO = zonaOk({
    referencia: REF,
    grupos: [{ id: "g1", zonaId: "z1", nombre: "Costa", distritos: [{ id: "d1", nombre: "Alfa" }] }],
    distritos: [{ id: "d1", nombre: "Alfa", zonaEspecial: false, grupoId: "g1" }],
    valores: [
      valor("tienda_flete_entregado", { id: "z", valor: "1000.00" }),
      valor("tienda_flete_entregado", { id: "g", grupoId: "g1", nivel: "grupo", valor: "2000.00" }),
      valor("tienda_flete_entregado", { id: "t", tiendaId: "t1", nivel: "tienda_zona", valor: "3000.00" }),
    ],
  });
  const nivel = () => screen.getByRole("combobox", { name: "Editando" });
  const flete = () => screen.getByRole("textbox", { name: "Valor de Flete por entregado" });
  // El popup puede abrirse un instante después del clic: sin carga en la máquina, leerlo en seguida salía rojo
  // según el orden de los tests, también sin los cambios de la Tanda G.
  const abrirNivel = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.click(nivel());
    await screen.findAllByRole("option");
  };

  it("R33: zona, cada grupo y tienda, y cada nivel enseña SOLO sus valores", async () => {
    const u = userEvent.setup();
    montar({}, CON_GRUPO);
    expect(flete()).toHaveValue("1000");

    await abrirNivel(u);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Toda la zona",
      expect.stringMatching(/^Grupo: Costa \(1 /),
      "Tienda con precio propio…",
    ]);
    await u.click(screen.getByRole("option", { name: /Grupo: Costa/ }));
    expect(flete()).toHaveValue("2000");
  });

  it("R33, R41: al elegir la tienda se pide su referencia, y solo se ofrecen las cuentas que llegan", async () => {
    cargarZonaMock.mockResolvedValue(CON_GRUPO);
    const u = userEvent.setup();
    montar({ preciosTienda: CON_GRUPO.valores.filter((v) => v.tiendaId !== null) }, CON_GRUPO);

    await abrirNivel(u);
    await u.click(screen.getByRole("option", { name: "Tienda con precio propio…" }));
    expect(screen.getByText("Elige la tienda para digitar su precio.")).toBeInTheDocument();

    await u.click(screen.getByRole("combobox", { name: "Tienda" }));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Tienda Uno"]);
    await u.click(screen.getByRole("option", { name: "Tienda Uno" }));

    await waitFor(() => expect(cargarZonaMock).toHaveBeenCalledWith({ zonaId: "z1", tiendaId: "t1" }));
    expect(await screen.findByRole("textbox", { name: "Valor de Flete por entregado" })).toHaveValue("3000");
  });

  it("Cambiar de zona con algo sin guardar pregunta antes; seguir editando lo conserva", async () => {
    const u = userEvent.setup();
    montar();
    await u.type(flete(), "2800");
    await u.click(zonaBoton(/Sur/));

    const d = await screen.findByRole("dialog");
    expect(within(d).getByText(/se pierde lo digitado/)).toBeInTheDocument();
    expect(cargarZonaMock).not.toHaveBeenCalled();
    await u.click(within(d).getByRole("button", { name: "Seguir editando" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(flete()).toHaveValue("2800");

    await u.click(zonaBoton(/Sur/));
    const d2 = await screen.findByRole("dialog");
    await u.click(within(d2).getByRole("button", { name: "Descartar y seguir" }));
    await waitFor(() => expect(cargarZonaMock).toHaveBeenCalledWith({ zonaId: "z2" }));
  });

  it("R35: tras guardar se recarga la zona y la pantalla, sin pasar por el esqueleto", async () => {
    guardarMock.mockResolvedValue({ status: "ok", resultados: [{ clave: "mensajero_entregado:todos", status: "ok" }] });
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("tab", { name: "Pago al mensajero" }));
    await u.type(screen.getByRole("textbox", { name: "Valor de Por entregado" }), "1500");
    await u.click(screen.getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => expect(cargarZonaMock).toHaveBeenCalledWith({ zonaId: "z1" }));
    expect(refreshMock).toHaveBeenCalled();
    expect(screen.queryByTestId("tarifas-esqueleto")).toBeNull();
  });
});

describe("SLT-55 — la sección de valor propio dentro del módulo", () => {
  const CON_PROPIO: Partial<PantallaOk> = {
    mensajeros: [mensajeroPantalla()],
    valoresMensajero: [valorPropio("mensajero_entregado", "m1", { valor: "2900.00" })],
  };
  const seccion = () => screen.getByRole("region", { name: "Mensajeros con valor propio" });

  it("R27: enseña lo que da la lectura", () => {
    montar(CON_PROPIO);
    expect(within(seccion()).getByRole("row", { name: /Ana Torres/ })).toHaveTextContent("₡2.900");
  });

  it("R23: un valor propio no mueve «M de T zonas completas»", () => {
    montar(CON_PROPIO);
    expect(screen.getByText("1 de 3 zonas completas")).toBeInTheDocument();
  });

  it("R29: guarda con `mensajeroId`, sin `ivaPct` ni zona, y recarga sin esqueleto", async () => {
    guardarMock.mockResolvedValue({ status: "ok", resultados: [{ clave: "mensajero_novedad:todos", status: "ok" }] });
    const u = userEvent.setup();
    montar(CON_PROPIO);
    await u.click(within(seccion()).getByRole("button", { name: "Editar valor propio de Ana Torres" }));
    const d = await screen.findByRole("dialog");
    await u.type(within(d).getByRole("textbox", { name: "Valor de Por novedad" }), "500");
    await u.click(within(d).getByRole("button", { name: "Guardar borrador" }));

    await waitFor(() => expect(guardarMock).toHaveBeenCalledTimes(1));
    expect(guardarMock.mock.calls[0]?.[0]).toEqual({
      cambios: [
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
      ],
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(screen.queryByTestId("tarifas-esqueleto")).toBeNull();
  });

  it("R35: con `puedeEscribir` falso, el módulo la pinta sin controles", () => {
    montar({ ...CON_PROPIO, puedeEscribir: false });
    expect(within(seccion()).getByRole("row", { name: /Ana Torres/ })).toHaveTextContent("₡2.900");
    expect(within(seccion()).queryAllByRole("button")).toEqual([]);
  });

  it("design §7.2: sin zonas no sale: esa rama enseña a crearlas", () => {
    montar({ ...CON_PROPIO, zonas: [] });
    expect(screen.getByText("Aún no hay zonas")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mensajeros con valor propio" })).toBeNull();
  });

  it("Si la zona no carga, la sección sigue: sus datos no dependen de esa lectura", () => {
    montar(CON_PROPIO, { status: "error" });
    expect(screen.getByText("No se pudieron cargar los valores de esta zona.")).toBeInTheDocument();
    expect(within(seccion()).getByRole("row", { name: /Ana Torres/ })).toBeInTheDocument();
  });
});
