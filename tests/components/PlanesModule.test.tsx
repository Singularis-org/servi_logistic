// @vitest-environment jsdom
// SLT-58 (design §6.3; R13) — el catálogo de planes del superadmin.
//
// Se lee lo que pinta la tabla con el catálogo que baja de la página: nombre, visibilidad («Público»
// o «Custom de <empresa>»), precio sin moneda, topes, cuántas empresas lo tienen y la fecha del cambio
// programado. Los archivados se esconden por defecto y, al mostrarlos, llevan la marca «Archivado».
//
// SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» (design §6; R13,
// R24–R27): la sección «Borradores», la marca «Cambio en borrador», «Retomar», «Descartar» y el aviso al cerrar.
// El alta ya no llama a `crearPlan`: guarda por pasos y confirma el borrador. Las cuatro actions son un borrador
// en memoria, y la petición que llegaría a crear se reconstruye con `peticionDeCrear` (la del servidor), así que
// los casos de hoy siguen comprobando la misma carga útil.
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { AccionesDelBorrador } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import { peticionDeCrear } from "@/lib/planes/borrador";
import {
  PASOS_DE_EDITAR,
  type BorradorResumen,
  type BorradorVista,
  type IdPasoBorrador,
  type PasosDeCrear,
  type ValoresDelPaso,
} from "@/lib/types/plan-borrador";
import type { PlanDelCatalogo, PlanResult } from "@/lib/types/planes";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

import { PlanesModule } from "@/app/(app)/plataforma/planes/_components/PlanesModule";

import { tituloDelPasoActual } from "./plan-form-pasos";

const PUBLICO: PlanDelCatalogo = {
  id: "0b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { porRol: { mensajero: 5 }, apiKeys: 2 },
  modulos: ["analitica"],
  // SLT-86 (R24): el costo base con un descuento por período.
  precio: { tipo: "monto", mensual: "10.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10.00" } } },
  costoPorOrden: null, // SLT-66 R8: campo nuevo del PlanDTO
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
  archivado: false,
  empresaNombre: null,
  empresas: 1200,
  vigenteDesdePendiente: "2030-01-15",
};

const CUSTOM: PlanDelCatalogo = {
  id: "1b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
  nombre: "Norte a medida",
  visibilidad: "custom",
  organizacionId: "6f1c2a4e-7b1d-4c3e-9a2f-1b2c3d4e5f60",
  topes: { porRol: {}, apiKeys: null },
  modulos: [],
  precio: { tipo: "sin_precio" }, // Ajuste planes-custom (D1): sin «negociable».
  costoPorOrden: null, // SLT-66 R8: campo nuevo del PlanDTO
  costoPorOrdenPorcentual: null, // SLT-83: campo nuevo del tipo
  archivado: false,
  empresaNombre: "Envíos Norte",
  empresas: 1,
  vigenteDesdePendiente: null,
};

const ARCHIVADO: PlanDelCatalogo = {
  ...PUBLICO,
  id: "2b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
  nombre: "Viejo",
  precio: { tipo: "sin_precio" },
  archivado: true,
  empresas: 0,
  vigenteDesdePendiente: null,
};

const OK: PlanResult = { estado: "ok", planId: PUBLICO.id, cambio: true, avisos: [], vigenteDesde: null };

const B_CREA = "1a2b3c4d-1111-4e5f-8a9b-0c1d2e3f4a5b";
const B_CAMBIO = "1a2b3c4d-2222-4e5f-8a9b-0c1d2e3f4a5b";
const B_NUEVO = "1a2b3c4d-3333-4e5f-8a9b-0c1d2e3f4a5b";

/** Un borrador de creación sin General guardado (sin nombre) y el de cambio de «Básico». */
const CREACION: BorradorResumen = {
  id: B_CREA,
  modo: "crear",
  planId: null,
  nombre: null,
  iniciadoPor: "Ana",
  // 15:30 UTC son las 09:30 en la hora de la plataforma.
  iniciadoAt: "2026-11-16T15:30:00.000Z",
  actualizadoAt: "2026-11-17T15:30:00.000Z",
};
const CAMBIO: BorradorResumen = {
  id: B_CAMBIO,
  modo: "editar",
  planId: PUBLICO.id,
  nombre: "Básico",
  iniciadoPor: "Marta",
  iniciadoAt: "2026-11-15T14:00:00.000Z",
  actualizadoAt: "2026-11-16T14:05:00.000Z",
};

type Dobles = { [K in keyof AccionesDelBorrador]: Mock<AccionesDelBorrador[K]> };

/**
 * Un servidor del borrador en memoria: cada guardado `ok` suma su paso con sus valores, y `confirmar` responde
 * `alConfirmar`. `peticionConfirmada` reconstruye la petición de crear con lo que se confirmaría.
 */
function borradorEnMemoria(alConfirmar: PlanResult = OK, sobre: Partial<Dobles> = {}) {
  const pasos: Partial<Record<IdPasoBorrador, ValoresDelPaso>> = {};
  const acciones: Dobles = {
    guardarPaso: vi.fn<AccionesDelBorrador["guardarPaso"]>(async (input) => {
      pasos[input.paso] = input.valores;
      return {
        estado: "ok",
        borradorId: B_NUEVO,
        pasosGuardados: PASOS_DE_EDITAR.filter((p) => p in pasos),
        actualizadoAt: "2026-11-17T15:30:00.000Z",
      };
    }),
    leer: vi.fn<AccionesDelBorrador["leer"]>().mockResolvedValue({ estado: "ok", borrador: null }),
    descartar: vi.fn<AccionesDelBorrador["descartar"]>().mockResolvedValue({ estado: "ok" }),
    confirmar: vi.fn<AccionesDelBorrador["confirmar"]>().mockResolvedValue(alConfirmar),
    ...sobre,
  };
  return { acciones, peticionConfirmada: () => peticionDeCrear(pasos as PasosDeCrear) };
}

function montar({
  acciones,
  borradores = [],
  planes = [PUBLICO, CUSTOM, ARCHIVADO],
}: { acciones?: Dobles; borradores?: BorradorResumen[] | null; planes?: PlanDelCatalogo[] } = {}) {
  const a = acciones ?? borradorEnMemoria().acciones;
  render(
    <PlanesModule
      planes={planes}
      empresas={[{ id: CUSTOM.organizacionId!, nombre: "Envíos Norte", tienePlan: true, fechaDeEfectoPorDefecto: "2026-11-01" }]}
      inicioCicloPorDefecto="2026-10-30"
      rangoInicioCiclo={{ hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" }}
      rangoFechaDeEfecto={{ hoy: "2026-10-29", min: "2026-10-29", max: "2027-10-29" }}
      borradores={borradores}
      borrador={a}
      previsualizarCustom={vi.fn().mockResolvedValue({ estado: "ok", avisos: [] })}
    />,
  );
  return { acciones: a };
}

const guardarYContinuar = () => screen.queryByRole("button", { name: "Guardar y continuar" });

/** Pulsa «Guardar y continuar» hasta que el paso actual es `titulo`; cada guardado responde antes de seguir. */
async function guardarHasta(user: UserEvent, titulo: string) {
  for (let i = 0; i < 8 && tituloDelPasoActual() !== titulo; i++) {
    const antes = tituloDelPasoActual();
    await user.click(guardarYContinuar()!);
    await waitFor(() => expect(tituloDelPasoActual()).not.toBe(antes));
  }
  expect(tituloDelPasoActual()).toBe(titulo);
}

/** Guarda los pasos que quedan hasta «Revisar» y pulsa «Crear plan» cuando se habilita. */
async function terminar(user: UserEvent) {
  for (let i = 0; i < 8 && guardarYContinuar() !== null; i++) {
    const antes = tituloDelPasoActual();
    await user.click(guardarYContinuar()!);
    await waitFor(() => expect(tituloDelPasoActual()).not.toBe(antes));
  }
  const crear = screen.getByRole("button", { name: "Crear plan" });
  await waitFor(() => expect(crear).toBeEnabled());
  await user.click(crear);
}

const filaDe = (nombre: string) => screen.getByRole("link", { name: `Ver el plan ${nombre}` }).closest("tr")!;
const celdas = (fila: HTMLElement) => within(fila).getAllByRole("cell").map((c) => c.textContent);

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SLT-58 R13 — el catálogo de planes", () => {
  it("R13: una fila por plan con visibilidad, precio sin moneda, topes, nº de empresas y fecha del cambio", () => {
    montar();

    expect(celdas(filaDe("Básico"))).toEqual([
      "Básico",
      "Público",
      // SLT-66 R9, R24: la columna «Costo» lleva el costo base y el costo por orden.
      // SLT-86 (R24): «{mensual} / mes» y el descuento de cada período que lo tiene; sin tope de órdenes.
      "Costo base: 10.00 / mes · Descuento anual: 10.00 %Costo por orden: se aplica el valor global",
      "Usuarios activos con el rol Mensajero: 5API keys activas: 2",
      "Sin beneficios", // SLT-214 (R20)
      "Sin niveles", // SLT-215 (R21)
      "1.200",
      "Desde 2030-01-15",
    ]);
    expect(celdas(filaDe("Norte a medida"))).toEqual([
      "Norte a medida",
      "Custom de Envíos Norte",
      "Costo base: sin precioCosto por orden: se aplica el valor global", // SLT-66 R9, R24
      "Usuarios: sin límite por rolAPI keys activas: sin límite",
      "Sin beneficios", // SLT-214 (R20)
      "Sin niveles", // SLT-215 (R21)
      "1",
      "Ninguno",
    ]);
    expect(filaDe("Básico").querySelector("a")).toHaveAttribute("href", `/plataforma/planes/${PUBLICO.id}`);
  });

  it("R13: los archivados no salen por defecto; con «Mostrar archivados» salen con la marca «Archivado»", async () => {
    const user = userEvent.setup();
    montar();

    expect(screen.queryByRole("link", { name: "Ver el plan Viejo" })).toBeNull();
    expect(screen.queryByText("Archivado")).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Mostrar archivados" }));

    const fila = filaDe("Viejo");
    expect(within(fila).getByText("Archivado")).toBeInTheDocument();
    expect(celdas(fila)[2]).toBe("Costo base: sin precioCosto por orden: se aplica el valor global"); // SLT-66 R9, R24
    // Solo el archivado lleva la marca.
    expect(screen.getAllByText("Archivado")).toHaveLength(1);
    // Archivar es un estado inactivo, no una alerta: badge neutro, no `warning`.
    expect(within(fila).getByText("Archivado")).toHaveClass("bg-secondary");
    expect(within(fila).getByText("Archivado")).not.toHaveClass("bg-warning-soft");
  });

  it("R13: el precio no lleva símbolo ni código de moneda", () => {
    montar();
    const tabla = screen.getByRole("table");
    expect(tabla.textContent).not.toMatch(/[$₡€]|USD|CRC/);
  });

  it("R14: «Nuevo plan» abre el formulario; al crear, cierra, avisa y relee", async () => {
    const user = userEvent.setup();
    const { acciones } = montar();

    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByRole("textbox", { name: "Nombre" }), "Libre");
    await terminar(user);

    await waitFor(() => expect(acciones.confirmar).toHaveBeenCalledTimes(1));
    expect(acciones.confirmar).toHaveBeenCalledWith({ borradorId: B_NUEVO });
    expect(await screen.findByRole("status")).toHaveTextContent("Plan «Libre» creado.");
    expect(refreshMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("SLT-118 R32: crear un custom para una empresa con plan avisa con la fecha real del servidor y no la elegida", async () => {
    const user = userEvent.setup();
    const memoria = borradorEnMemoria({ ...OK, vigenteDesde: "2026-12-01" } satisfies PlanResult);
    const { acciones } = montar({ acciones: memoria.acciones });

    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByRole("textbox", { name: "Nombre" }), "Norte a medida");
    await user.click(within(panel).getByRole("radio", { name: "Custom" }));
    await user.click(within(panel).getByRole("combobox", { name: "Empresa" }));
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "Envíos Norte" }));
    await guardarHasta(user, "Precio y descuentos");
    await user.click(within(panel).getByRole("radio", { name: "Con monto" }));
    await user.type(within(panel).getByLabelText("Costo base mensual"), "50000");
    await guardarHasta(user, "Cobro por orden");
    await user.type(within(panel).getByLabelText("Costo por orden"), "100");
    await terminar(user);

    // La elegida es la propuesta por defecto de la empresa (2026-11-01); el servidor devuelve la real.
    await waitFor(() => expect(acciones.confirmar).toHaveBeenCalledTimes(1));
    expect(memoria.peticionConfirmada()).toMatchObject({ vigenteDesde: "2026-11-01" });
    const aviso = await screen.findByRole("status");
    expect(aviso).toHaveTextContent("Plan «Norte a medida» creado. Cambio programado desde 2026-12-01.");
    expect(aviso).not.toHaveTextContent("2026-11-01");
  });

  it("SLT-118 R32: un plan que rige ya (sin `vigenteDesde`) no menciona ningún cambio programado", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByRole("textbox", { name: "Nombre" }), "Libre");
    await terminar(user);

    const aviso = await screen.findByRole("status");
    expect(aviso).toHaveTextContent("Plan «Libre» creado.");
    expect(aviso).not.toHaveTextContent(/Cambio programado/);
  });

  it("R6: el panel abre el formulario por pasos", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    const panel = await screen.findByRole("dialog");
    // El Sheet ancho de la maqueta (design §7), sin el tope de ancho por defecto. jsdom descarta el
    // `width: min(…)`, así que se mide el `maxWidth` que lo acompaña.
    expect(panel.style.maxWidth).toBe("none");
    // Dentro, el componente de pasos con los pasos de crear, abierto en General.
    const pasos = within(panel).getByRole("navigation", { name: "Pasos" });
    expect(within(pasos).getAllByRole("button").map((b) => b.textContent?.replace(/^\d+/, ""))).toEqual([
      "General",
      "Precio y descuentos",
      "Cobro por orden",
      "Topes",
      "Módulos",
      "Beneficios", // SLT-214 «Planes: beneficios de texto con ícono» (R7)
      "Niveles", // SLT-215 «Planes: niveles de beneficio por volumen de órdenes» (R7)
      "Revisar y crear",
    ]);
    expect(tituloDelPasoActual()).toBe("General");
    expect(within(panel).getByText("Paso 1 de 8")).toBeInTheDocument();
    // SLT-144 (R1): el botón de avance guarda el paso.
    expect(within(panel).getByRole("button", { name: "Guardar y continuar" })).toBeInTheDocument();
  });

  it("SLT-83 (texto aprobado 2026-11-04): el panel «Nuevo plan» explica cuándo se cobra el costo por orden fijo y el porcentual", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    const panel = await screen.findByRole("dialog");
    expect(panel).toHaveAccessibleDescription(
      "Los topes vacíos no tienen límite. El costo base es informativo. El costo por orden fijo se cobra al crear cada orden; el porcentual, cuando la orden llega a un estado final.",
    );
  });
});

describe("SLT-58 — revisión de diseño del catálogo", () => {
  it("sin cambio programado la celda dice «Ninguno» (no una raya muda)", () => {
    montar();
    expect(within(filaDe("Norte a medida")).getByText("Ninguno")).toBeInTheDocument();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("por debajo de md se ocultan «Visibilidad», «Beneficios», «Niveles» y «Cambio programado» (cabecera y celdas)", () => {
    montar();
    // SLT-214 (design §4.4): «Beneficios» también, para que la tabla no se rompa en móvil. SLT-215 (design §4.3):
    // y «Niveles».
    for (const nombre of ["Visibilidad", "Beneficios", "Niveles", "Cambio programado"]) {
      expect(screen.getByRole("columnheader", { name: nombre })).toHaveClass("hidden", "md:table-cell");
    }
    const [, visibilidad, precio, , beneficios, niveles, , cambio] = within(filaDe("Básico")).getAllByRole("cell");
    expect(visibilidad).toHaveClass("hidden", "md:table-cell");
    expect(beneficios).toHaveClass("hidden", "md:table-cell");
    expect(niveles).toHaveClass("hidden", "md:table-cell");
    expect(cambio).toHaveClass("hidden", "md:table-cell");
    expect(precio).not.toHaveClass("hidden");
  });

  it("«Mostrar archivados» toma su nombre del <label> visible, sin aria-label duplicado", () => {
    montar();
    const casilla = screen.getByRole("checkbox", { name: "Mostrar archivados" });
    expect(casilla).not.toHaveAttribute("aria-label");
  });

  it("si el catálogo no se pudo leer: solo el aviso de error con «Reintentar», sin tabla ni estado vacío", async () => {
    const user = userEvent.setup();
    render(
      <PlanesModule
        errorDeCarga
        planes={[]}
        empresas={[]}
        inicioCicloPorDefecto="2026-10-30"
        rangoInicioCiclo={{ hoy: "2026-10-29", min: "2026-09-29", max: "2026-11-29" }}
        rangoFechaDeEfecto={{ hoy: "2026-10-29", min: "2026-10-29", max: "2027-10-29" }}
        borradores={[]}
        borrador={borradorEnMemoria().acciones}
        previsualizarCustom={vi.fn().mockResolvedValue({ estado: "ok", avisos: [] })}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el catálogo de planes.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Aún no hay planes.")).toBeNull();
    expect(screen.queryByText(/Crea el primero/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Nuevo plan" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-144 R24 — la sección «Borradores»", () => {
  const seccion = () => screen.getByRole("region", { name: "Borradores" });
  const filaDelBorrador = (texto: string) => within(seccion()).getByText(texto).closest("tr")!;

  it("R24: un borrador de creación y uno de cambio", () => {
    montar({ borradores: [CREACION, CAMBIO] });

    expect(within(seccion()).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Nombre",
      "Tipo",
      "Empezado por",
      "Empezado el",
      "Guardado el",
      "Acciones",
    ]);
    const creacion = filaDelBorrador("Sin nombre");
    expect(celdas(creacion).slice(0, 5)).toEqual(["Sin nombre", "Plan nuevo", "Ana", "2026-11-16 09:30", "2026-11-17 09:30"]);
    expect(within(creacion).getByRole("button", { name: "Retomar" })).toBeInTheDocument();
    expect(within(creacion).getByRole("button", { name: "Descartar" })).toBeInTheDocument();

    const cambio = filaDelBorrador("Cambio de Básico");
    expect(celdas(cambio).slice(0, 5)).toEqual(["Básico", "Cambio de Básico", "Marta", "2026-11-15 08:00", "2026-11-16 08:05"]);
    expect(within(cambio).getByRole("link", { name: "Retomar" })).toBeInTheDocument();
    expect(within(cambio).getByRole("button", { name: "Descartar" })).toBeInTheDocument();

    // La sección va sobre el catálogo.
    const catalogo = screen.getByRole("link", { name: "Ver el plan Básico" });
    expect(seccion().compareDocumentPosition(catalogo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("R24: sin borradores no hay sección", () => {
    montar({ borradores: [] });
    expect(screen.queryByRole("region", { name: "Borradores" })).toBeNull();
    expect(screen.queryByText("No se pudieron cargar los borradores.")).toBeNull();
  });

  it("R24: error de lectura con el catálogo", () => {
    montar({ borradores: null });
    expect(within(seccion()).getByText("No se pudieron cargar los borradores.")).toBeInTheDocument();
    expect(within(seccion()).queryByRole("table")).toBeNull();
    // El catálogo sigue, sin la marca: no se sabe qué plan tiene borrador.
    expect(filaDe("Básico")).toBeInTheDocument();
    expect(screen.queryByText("Cambio en borrador")).toBeNull();
  });
});

describe("SLT-144 R25 — la marca «Cambio en borrador»", () => {
  it("R25: la marca solo en el plan con borrador", () => {
    montar({ borradores: [CREACION, CAMBIO] });

    expect(within(filaDe("Básico")).getByText("Cambio en borrador")).toBeInTheDocument();
    expect(within(filaDe("Norte a medida")).queryByText("Cambio en borrador")).toBeNull();
    expect(screen.getAllByText("Cambio en borrador")).toHaveLength(1);
  });
});

describe("SLT-144 R26 — retomar desde la lista", () => {
  it("R26: retomar una creación abre el panel con su id", async () => {
    const user = userEvent.setup();
    const retomado: BorradorVista = {
      id: B_CREA,
      modo: "crear",
      planId: null,
      pasos: { general: { nombre: "Pro", visibilidad: "publico", organizacionId: null } },
      pasosGuardados: ["general"],
      iniciadoPor: "Ana",
      iniciadoAt: CREACION.iniciadoAt,
      actualizadoAt: CREACION.actualizadoAt,
    };
    const { acciones } = borradorEnMemoria(OK, {
      leer: vi.fn<AccionesDelBorrador["leer"]>().mockResolvedValue({ estado: "ok", borrador: retomado }),
    });
    montar({ acciones, borradores: [CREACION, CAMBIO] });

    // El de cambio va al detalle de su plan con el formulario de editar abierto.
    expect(within(screen.getByText("Cambio de Básico").closest("tr")!).getByRole("link", { name: "Retomar" })).toHaveAttribute(
      "href",
      `/plataforma/planes/${PUBLICO.id}?editar=1`,
    );

    await user.click(within(screen.getByText("Sin nombre").closest("tr")!).getByRole("button", { name: "Retomar" }));

    const panel = await screen.findByRole("dialog");
    expect(acciones.leer).toHaveBeenCalledWith({ borradorId: B_CREA });
    expect(await within(panel).findByText("Borrador de Ana, guardado el 2026-11-17 09:30")).toBeInTheDocument();
    // Sigue donde se dejó (R15): el primer paso sin guardar.
    expect(tituloDelPasoActual()).toBe("Precio y descuentos");
  });
});

describe("SLT-144 R27 — descartar desde la lista", () => {
  const TEXTO = "¿Descartar el borrador «Sin nombre»? Se borran todos sus pasos guardados. No se puede deshacer.";
  const descartarDeLaFila = () =>
    within(screen.getByText("Sin nombre").closest("tr")!).getByRole("button", { name: "Descartar" });

  async function descartarCreacion(user: UserEvent) {
    await user.click(descartarDeLaFila());
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveAccessibleDescription(TEXTO);
    await user.click(within(dialogo).getByRole("button", { name: "Descartar" }));
    return dialogo;
  }

  it("R27: descartar con confirmación", async () => {
    const user = userEvent.setup();
    const { acciones } = montar({ borradores: [CREACION] });

    // Cancelar no descarta.
    await user.click(descartarDeLaFila());
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(acciones.descartar).not.toHaveBeenCalled();

    await descartarCreacion(user);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(acciones.descartar).toHaveBeenCalledTimes(1);
    expect(acciones.descartar).toHaveBeenCalledWith({ borradorId: B_CREA });
    expect(screen.getByRole("status")).toHaveTextContent("Borrador descartado.");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("R27: ya no existe", async () => {
    const user = userEvent.setup();
    const { acciones } = borradorEnMemoria(OK, {
      descartar: vi.fn<AccionesDelBorrador["descartar"]>().mockResolvedValue({ estado: "borrador_no_encontrado" }),
    });
    montar({ acciones, borradores: [CREACION] });

    await descartarCreacion(user);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status")).toHaveTextContent("Ese borrador ya no existe.");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("R27: un fallo deja la fila", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { acciones } = borradorEnMemoria(OK, {
      descartar: vi.fn<AccionesDelBorrador["descartar"]>().mockRejectedValue(new Error("red")),
    });
    montar({ acciones, borradores: [CREACION] });

    const dialogo = await descartarCreacion(user);

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "No se pudo descartar el borrador. Inténtalo de nuevo.",
    );
    expect(screen.getByRole("dialog")).toBe(dialogo);
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Borrador descartado.")).toBeNull();
    expect(screen.getByText("Plan nuevo")).toBeInTheDocument();
  });
});

describe("SLT-144 R13 — cerrar el panel con el borrador guardado", () => {
  it("R13: cerrar con un paso guardado avisa", async () => {
    const user = userEvent.setup();
    const { acciones } = montar();

    // Sin guardar nada, cerrar no avisa.
    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("status")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Nuevo plan" }));
    const panel = await screen.findByRole("dialog");
    await user.type(within(panel).getByRole("textbox", { name: "Nombre" }), "Libre");
    await guardarHasta(user, "Precio y descuentos");
    expect(acciones.guardarPaso).toHaveBeenCalledTimes(1);

    await user.click(within(panel).getByRole("button", { name: "Cerrar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status")).toHaveTextContent("El borrador queda guardado. Puedes retomarlo luego.");
    expect(acciones.confirmar).not.toHaveBeenCalled();
    // Relee para que la sección «Borradores» traiga el que se acaba de guardar.
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});

// SLT-214 «Planes: beneficios de texto con ícono» (design §4.4; R20, R21): la columna «Beneficios» del listado, con
// los 3 primeros en orden y «Mostrar más» por fila.
describe("SLT-214 R20, R21 — la columna «Beneficios» del listado", () => {
  const CINCO: NonNullable<PlanDelCatalogo["beneficios"]> = [
    { icono: "equipo", texto: "Equipo dedicado" },
    { icono: "soporte", texto: "Soporte prioritario" },
    { icono: "reloj_24h", texto: "Atención 24 h" },
    { icono: "rayo", texto: "Alta rápida" },
    { icono: "estrella", texto: "Reportes premium" },
  ];
  const CON_CINCO: PlanDelCatalogo = { ...PUBLICO, beneficios: CINCO };
  const CON_TRES: PlanDelCatalogo = { ...CUSTOM, beneficios: CINCO.slice(0, 3) };
  const OTRO_CON_CINCO: PlanDelCatalogo = {
    ...PUBLICO,
    id: "3b6f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
    nombre: "Pro",
    beneficios: CINCO,
  };

  const celdaDeBeneficios = (nombre: string) => within(filaDe(nombre)).getAllByRole("cell")[4]!;
  const textos = (celda: HTMLElement) =>
    within(within(celda).getByRole("list", { name: "Beneficios" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);

  it("R20: la columna va después de «Topes»; cada fila muestra los 3 primeros con su ícono y en orden", () => {
    montar({ planes: [CON_CINCO, CON_TRES] });

    const cabeceras = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(cabeceras.indexOf("Beneficios")).toBe(cabeceras.indexOf("Topes") + 1);

    const celda = celdaDeBeneficios("Básico");
    expect(textos(celda)).toEqual(["Equipo dedicado", "Soporte prioritario", "Atención 24 h"]);
    // R5: el ícono es decorativo, al lado del texto.
    const iconos = celda.querySelectorAll("svg[data-icono]");
    expect([...iconos].map((i) => i.getAttribute("data-icono"))).toEqual(["equipo", "soporte", "reloj_24h"]);
    for (const i of iconos) expect(i).toHaveAttribute("aria-hidden", "true");
  });

  it("R20: sin beneficios, la celda dice «Sin beneficios»", () => {
    montar({ planes: [PUBLICO] });

    expect(celdaDeBeneficios("Básico")).toHaveTextContent("Sin beneficios");
    expect(within(celdaDeBeneficios("Básico")).queryByRole("list")).toBeNull();
  });

  it("R21: con 3 o menos no hay «Mostrar más»; con más de 3, sí, con `aria-expanded=false`", () => {
    montar({ planes: [CON_CINCO, CON_TRES] });

    expect(within(celdaDeBeneficios("Norte a medida")).queryByRole("button")).toBeNull();
    const boton = within(celdaDeBeneficios("Básico")).getByRole("button", { name: "Mostrar más" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
  });

  it("R21: «Mostrar más» despliega todos en su fila y pasa a «Mostrar menos»; al pulsarlo, vuelven los 3", async () => {
    const user = userEvent.setup();
    montar({ planes: [CON_CINCO] });

    await user.click(within(celdaDeBeneficios("Básico")).getByRole("button", { name: "Mostrar más" }));
    expect(textos(celdaDeBeneficios("Básico"))).toEqual(CINCO.map((b) => b.texto));
    const menos = within(celdaDeBeneficios("Básico")).getByRole("button", { name: "Mostrar menos" });
    expect(menos).toHaveAttribute("aria-expanded", "true");

    await user.click(menos);
    expect(textos(celdaDeBeneficios("Básico"))).toHaveLength(3);
    expect(within(celdaDeBeneficios("Básico")).getByRole("button", { name: "Mostrar más" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("R21: cada fila se despliega por su cuenta", async () => {
    const user = userEvent.setup();
    montar({ planes: [CON_CINCO, OTRO_CON_CINCO] });

    await user.click(within(celdaDeBeneficios("Pro")).getByRole("button", { name: "Mostrar más" }));

    expect(textos(celdaDeBeneficios("Pro"))).toHaveLength(5);
    expect(textos(celdaDeBeneficios("Básico"))).toHaveLength(3);
    expect(within(celdaDeBeneficios("Básico")).getByRole("button", { name: "Mostrar más" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

// SLT-215 «Planes: niveles de beneficio por volumen de órdenes» (design §4.3; R21): la columna «Niveles» del listado,
// después de «Beneficios», con todos los niveles, uno por línea y en su orden.
describe("SLT-215 R21 — la columna «Niveles» del listado", () => {
  const CON_NIVELES: PlanDelCatalogo = {
    ...PUBLICO,
    niveles: [
      { meta: 100, descuento: { tipo: "porcentaje", porcentaje: "5" } },
      { meta: 500, descuento: { tipo: "monto", monto: "1500" } },
      { meta: 15000, descuento: { tipo: "porcentaje", porcentaje: "12.5" } },
    ],
  };
  const celdaDeNiveles = (nombre: string) => within(filaDe(nombre)).getAllByRole("cell")[5]!;

  it("R21: va después de «Beneficios»; una línea por nivel, en orden, en porcentaje y en monto sin moneda", () => {
    montar({ planes: [CON_NIVELES, CUSTOM] });
    const cabeceras = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(cabeceras.indexOf("Niveles")).toBe(cabeceras.indexOf("Beneficios") + 1);
    const lineas = within(celdaDeNiveles("Básico"))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(lineas).toEqual([
      "Nivel 1: desde 100 órdenes, −5.00 %",
      "Nivel 2: desde 500 órdenes, −1500.00",
      "Nivel 3: desde 15000 órdenes, −12.50 %",
    ]);
  });

  it("R21: sin niveles, la celda dice «Sin niveles»", () => {
    montar({ planes: [CON_NIVELES, { ...CUSTOM, niveles: [] }] });
    expect(celdaDeNiveles("Norte a medida")).toHaveTextContent(/^Sin niveles$/);
  });
});
