// @vitest-environment jsdom
// SLT-48 (R43, R17, P2; reglas 2 y 3 de la maqueta aprobada) — CORREGIR UBICACIÓN EN UN PAÍS DE N NIVELES.
//
// La ventana pide un lugar por cada nivel del país, con el nombre de su tipo, hasta llegar a una hoja
// (un lugar sin hijos activos). Lo que viaja es UN nodo (`nodoId`), la hoja elegida. Se mide en países
// de 2, 3 (Costa Rica), 4 y 10 niveles, y el aviso del importe con la hoja más arriba que el último
// nivel («Barrio: Las Acacias») y con la orden a medias («Sin distrito»).
//
// La Server Action va mockeada (módulo `"use server"`); el catálogo pasa por el `useSWR` real, con una
// caché nueva por test para que la geografía de un país no se cuele en el siguiente.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";

import {
  CorregirDatosClienteModal,
  CORREGIR_CONFIRMAR,
  CORREGIR_NIVEL_SOBRANTE,
  CORREGIR_UBICACION_CARGANDO,
  corregirElegirNivel,
  corregirSinNivel,
  corregirUbicacionIncompleta,
} from "@/app/(app)/ordenes/_components/CorregirDatosClienteModal";
import {
  AVISO_TITULO,
  CorregirUbicacionAviso,
  avisoLugarConTipo,
  avisoSinNivel,
} from "@/app/(app)/ordenes/_components/CorregirUbicacionAviso";
import type { AvisoCambioUbicacion, UbicacionConCostos } from "@/lib/interfaces/services/ICorregirDatosClienteService";
import type { LugarDeFiltroDTO, NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";

import { NIVELES_CR, NIVELES_XA } from "../fabricas/etiquetas-geograficas";

const obtenerUbicacionOrdenMock = vi.fn();
vi.mock("@/lib/actions/corregir-datos-cliente", () => ({
  obtenerUbicacionOrden: (...args: unknown[]) => obtenerUbicacionOrdenMock(...args),
}));

const obtenerCatalogoMock = vi.fn();
vi.mock("@/lib/actions/filtros-ordenes", () => ({
  obtenerCatalogoFiltrosOrdenes: (...args: unknown[]) => obtenerCatalogoMock(...args),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}));

const ORDEN_ID = "0f1e2d3c-4b5a-4c7d-8e9f-0a1b2c3d4e5f";
const ORDEN = {
  id: ORDEN_ID,
  numRemision: "REM-048",
  numGuia: null,
  destinatario: "Rosa Pérez",
  telefonoDest: "987654321",
  producto: "Camiseta",
  notas: null,
};

// --- Geografías de prueba -------------------------------------------------------------------------

function nivel(profundidad: number, singular: string, plural: string): NivelDeFiltroDTO {
  return { profundidad, singular, plural };
}

function lugar(id: string, nombre: string, padreId: string | null, profundidad: number): LugarDeFiltroDTO {
  return { id, nombre, padreId, profundidad, disponible: true };
}

const NIVELES_2 = [nivel(1, "Departamento", "Departamentos"), nivel(2, "Municipio", "Municipios")];
const LUGARES_2 = [
  lugar("bolivar", "Bolívar", null, 1),
  lugar("turbaco", "Turbaco", "bolivar", 2),
  lugar("arjona", "Arjona", "bolivar", 2),
];

const LUGARES_CR = [
  lugar("sj", "San José", null, 1),
  lugar("escazu", "Escazú", "sj", 2),
  lugar("san-rafael", "San Rafael", "escazu", 3),
  lugar("san-antonio", "San Antonio", "escazu", 3),
  // Un cantón sin distritos: es hoja (P2) y se puede guardar.
  lugar("isla", "Isla del Coco", "sj", 2),
];

const LUGARES_4 = [
  lugar("costa", "Costa", null, 1),
  lugar("litoral", "Litoral", "costa", 2),
  lugar("vina", "Viña", "litoral", 3),
  lugar("miraflores", "Miraflores", "vina", 4),
  lugar("belloto", "Belloto", "vina", 4),
];

const NIVELES_10 = [
  nivel(1, "Región", "Regiones"),
  nivel(2, "Subregión", "Subregiones"),
  nivel(3, "Provincia", "Provincias"),
  nivel(4, "Departamento", "Departamentos"),
  nivel(5, "Municipio", "Municipios"),
  nivel(6, "Comuna", "Comunas"),
  nivel(7, "Sector", "Sectores"),
  nivel(8, "Barrio", "Barrios"),
  nivel(9, "Manzana", "Manzanas"),
  nivel(10, "Lote", "Lotes"),
];
const RUTA_10_HASTA_SECTOR = [
  ["norte", "Norte"],
  ["alto-norte", "Alto Norte"],
  ["andina", "Andina"],
  ["cordillera", "Cordillera"],
  ["san-pedro", "San Pedro"],
  ["la-loma", "La Loma"],
  ["sector-5", "Sector 5"],
] as const;
const LUGARES_10 = [
  ...RUTA_10_HASTA_SECTOR.map(([id, nombre], i) => lugar(id, nombre, i === 0 ? null : RUTA_10_HASTA_SECTOR[i - 1][0], i + 1)),
  // «Las Acacias» no tiene manzanas: es la hoja de su rama en el nivel 8.
  lugar("las-acacias", "Las Acacias", "sector-5", 8),
  lugar("el-mirador", "El Mirador", "sector-5", 8),
  lugar("manzana-12", "Manzana 12", "el-mirador", 9),
  lugar("lote-7", "Lote 7", "manzana-12", 10),
];

function ruta(lugares: readonly LugarDeFiltroDTO[], hojaId: string): { id: string; nombre: string }[] {
  const salida: { id: string; nombre: string }[] = [];
  let actual = lugares.find((l) => l.id === hojaId);
  while (actual) {
    salida.unshift({ id: actual.id, nombre: actual.nombre });
    const padre = actual.padreId;
    actual = padre === null ? undefined : lugares.find((l) => l.id === padre);
  }
  return salida;
}

function preparar(niveles: readonly NivelDeFiltroDTO[], lugares: readonly LugarDeFiltroDTO[], nodoId: string) {
  obtenerCatalogoMock.mockResolvedValue({
    status: "ok",
    catalogo: { zonas: [], tiendas: [], mensajeros: [], provincias: [], cantones: [], distritos: [], niveles, lugares },
  });
  obtenerUbicacionOrdenMock.mockResolvedValue({
    status: "ok",
    orden: {
      ordenId: ORDEN_ID,
      destinatario: ORDEN.destinatario,
      telefonoDest: ORDEN.telefonoDest,
      producto: ORDEN.producto,
      notas: null,
      direccion: "Av. Libertad 1120",
      peso: 1.5,
      nodoId,
      ruta: ruta(lugares, nodoId),
      provinciaId: "",
      cantonId: "",
      distritoId: null,
      zonaNombre: "Costa Norte",
      distritoNombre: null,
      numGuia: null,
      yaEnUnCierre: false,
    },
  });
}

async function abrir(corregir = vi.fn().mockResolvedValue({ status: "ok", cambios: ["nodoId"] })) {
  const user = userEvent.setup();
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <CorregirDatosClienteModal open orden={ORDEN} onOpenChange={() => {}} corregir={corregir} onSuccess={() => {}} />
    </SWRConfig>,
  );
  await waitFor(() => expect(screen.queryByText(CORREGIR_UBICACION_CARGANDO)).toBeNull());
  return { user, corregir };
}

const combo = (nombre: string) => screen.getByRole("combobox", { name: nombre });
const combos = () => screen.getAllByRole("combobox");
const guardar = () => screen.getByRole("button", { name: CORREGIR_CONFIRMAR });

async function elegir(user: ReturnType<typeof userEvent.setup>, nombre: string, opcion: string) {
  await user.click(combo(nombre));
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByRole("option", { name: opcion }));
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

// --- R43: un selector por nivel, con el tipo del país -----------------------------------------------

describe("SLT-48 / R43 — un selector por nivel del país, hasta una hoja", () => {
  it("Costa Rica: tres selectores, Provincia, Cantón y Distrito, precargados como hoy", async () => {
    preparar(NIVELES_CR, LUGARES_CR, "san-rafael");
    await abrir();
    expect(combos()).toHaveLength(3);
    expect(combo("Provincia").textContent).toContain("San José");
    expect(combo("Cantón").textContent).toContain("Escazú");
    expect(combo("Distrito").textContent).toContain("San Rafael");
    expect(guardar()).toBeEnabled();
  });

  it("Costa Rica: un cantón sin distritos es hoja (P2): el distrito se apaga con «Sin distritos» y viaja el cantón", async () => {
    preparar(NIVELES_CR, LUGARES_CR, "san-rafael");
    const { user, corregir } = await abrir();
    await elegir(user, "Cantón", "Isla del Coco");

    expect(combo("Distrito")).toBeDisabled();
    expect(combo("Distrito").textContent).toContain(corregirSinNivel("Distritos"));
    await user.click(guardar());
    await waitFor(() => expect(corregir).toHaveBeenCalledTimes(1));
    expect(corregir.mock.calls[0][0].nodoId).toBe("isla");
  });

  it("Costa Rica: un cantón con distritos exige el distrito; «Guardar» se apaga y dice qué falta", async () => {
    preparar(NIVELES_CR, LUGARES_CR, "escazu"); // una orden vieja guardada a medias
    await abrir();
    expect(combo("Distrito")).toBeEnabled();
    expect(combo("Distrito").textContent).toContain(corregirElegirNivel("Distrito"));
    // SLT-48: decisión del humano del 2026-11-18, un solo mensaje: «Ubicación incompleta» reemplaza a «Falta completar: <nivel>.»
    expect(screen.getByText(corregirUbicacionIncompleta("Escazú", "Distritos"))).toBeInTheDocument();
    expect(screen.queryByText(/Falta completar/)).toBeNull();
    expect(guardar()).toBeDisabled();
  });

  it("país de 2 niveles: dos selectores con sus tipos, y viaja el municipio", async () => {
    preparar(NIVELES_2, LUGARES_2, "turbaco");
    const { user, corregir } = await abrir();
    expect(combos()).toHaveLength(2);
    expect(combo("Departamento").textContent).toContain("Bolívar");
    expect(combo("Municipio").textContent).toContain("Turbaco");

    await elegir(user, "Municipio", "Arjona");
    await user.click(guardar());
    await waitFor(() => expect(corregir).toHaveBeenCalledTimes(1));
    expect(corregir.mock.calls[0][0].nodoId).toBe("arjona");
    // La terna vieja ya no viaja (R16).
    expect(corregir.mock.calls[0][0]).not.toHaveProperty("distritoId");
  });

  it("país de 4 niveles sin llegar a la hoja: pide el barrio y no deja guardar hasta elegirlo", async () => {
    preparar(NIVELES_XA, LUGARES_4, "vina");
    const { user, corregir } = await abrir();
    expect(combos()).toHaveLength(4);
    expect(combo("Barrio").textContent).toContain(corregirElegirNivel("Barrio"));
    // SLT-48: decisión del humano del 2026-11-18, un solo mensaje: «Ubicación incompleta» reemplaza a «Falta completar: <nivel>.»
    expect(screen.getByText(corregirUbicacionIncompleta("Viña", "Barrios"))).toBeInTheDocument();
    expect(screen.queryByText(/Falta completar/)).toBeNull();
    expect(guardar()).toBeDisabled();

    await elegir(user, "Barrio", "Miraflores");
    expect(screen.queryByText(/Ubicación incompleta/)).toBeNull();
    expect(screen.queryByText(/Falta completar/)).toBeNull();
    await user.click(guardar());
    await waitFor(() => expect(corregir).toHaveBeenCalledTimes(1));
    expect(corregir.mock.calls[0][0].nodoId).toBe("miraflores");
  });

  it("país de 10 niveles: la hoja en el nivel 8 deja los de abajo apagados, no ocultos", async () => {
    preparar(NIVELES_10, LUGARES_10, "las-acacias");
    const { user, corregir } = await abrir();
    expect(combos()).toHaveLength(10);
    expect(combo("Barrio").textContent).toContain("Las Acacias");
    expect(combo("Manzana")).toBeDisabled();
    expect(combo("Manzana").textContent).toContain(corregirSinNivel("Manzanas"));
    expect(combo("Lote")).toBeDisabled();
    expect(combo("Lote").textContent).toContain(CORREGIR_NIVEL_SOBRANTE);

    await user.click(guardar());
    await waitFor(() => expect(corregir).toHaveBeenCalledTimes(1));
    expect(corregir.mock.calls[0][0].nodoId).toBe("las-acacias");
  });

  it("elegir un lugar recorta todo lo de debajo: cambiar de barrio a uno con manzanas abre la manzana", async () => {
    preparar(NIVELES_10, LUGARES_10, "las-acacias");
    const { user } = await abrir();
    await elegir(user, "Barrio", "El Mirador");
    expect(combo("Manzana")).toBeEnabled();
    expect(combo("Lote")).toBeDisabled();
    // SLT-48: decisión del humano del 2026-11-18, un solo mensaje: «Ubicación incompleta» reemplaza a «Falta completar: <nivel>.»
    expect(screen.getByText(corregirUbicacionIncompleta("El Mirador", "Manzanas"))).toBeInTheDocument();
    expect(screen.queryByText(/Falta completar/)).toBeNull();
  });

  it("ningún nombre de nivel sale de un literal: un país con otros tipos no muestra los de Costa Rica (R47)", async () => {
    preparar(NIVELES_2, LUGARES_2, "turbaco");
    await abrir();
    expect(screen.queryByRole("combobox", { name: "Provincia" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Distrito" })).toBeNull();
  });
});

// --- «Ubicación incompleta» antes de guardar (decisión del humano 2026-11-18, f) ---------------------
//
// Como en la maqueta «País de 4 niveles · no se llegó a la hoja»: el aviso sale junto al selector que
// falta, ANTES de guardar, y «Guardar cambios» sigue apagado hasta llegar a la hoja. El rechazo del
// servidor (R17) queda como red de seguridad: lo cubre «327/R34» en `CorregirDatosCliente.ordenes`.

describe("SLT-48 / R43, R17 — «Ubicación incompleta» antes de guardar", () => {
  it("país de 4 niveles: «Viña» tiene barrios debajo; el aviso va en el barrio y Guardar se apaga hasta la hoja", async () => {
    preparar(NIVELES_XA, LUGARES_4, "vina");
    const { user, corregir } = await abrir();
    const texto = "Ubicación incompleta: «Viña» tiene barrios debajo; elige el último nivel.";
    expect(corregirUbicacionIncompleta("Viña", "Barrios")).toBe(texto);
    expect(screen.getByText(texto)).toBeInTheDocument();
    expect(combo("Barrio")).toHaveAttribute("aria-invalid", "true");
    expect(combo("Barrio")).toHaveAccessibleDescription(texto);
    expect(combo("Comuna")).not.toHaveAttribute("aria-invalid");
    expect(guardar()).toBeDisabled();
    expect(corregir).not.toHaveBeenCalled();

    await elegir(user, "Barrio", "Belloto");
    expect(screen.queryByText(/Ubicación incompleta/)).toBeNull();
    expect(combo("Barrio")).not.toHaveAttribute("aria-invalid");
    expect(guardar()).toBeEnabled();
  });

  it("país de 4 niveles: elegir otra comuna desde una hoja vuelve a pedir el barrio", async () => {
    preparar(NIVELES_XA, LUGARES_4, "miraflores");
    const { user } = await abrir();
    expect(screen.queryByText(/Ubicación incompleta/)).toBeNull();
    await elegir(user, "Comuna", "Viña");
    expect(screen.getByText(corregirUbicacionIncompleta("Viña", "Barrios"))).toBeInTheDocument();
    expect(guardar()).toBeDisabled();
  });

  it("Costa Rica: un cantón con distritos dice «Escazú» tiene distritos debajo; el distrito lo resuelve", async () => {
    preparar(NIVELES_CR, LUGARES_CR, "escazu");
    const { user, corregir } = await abrir();
    const texto = corregirUbicacionIncompleta("Escazú", "Distritos");
    expect(texto).toBe("Ubicación incompleta: «Escazú» tiene distritos debajo; elige el último nivel.");
    expect(screen.getByText(texto)).toBeInTheDocument();
    expect(combo("Distrito")).toHaveAccessibleDescription(texto);
    // SLT-48: decisión del humano del 2026-11-18, un solo mensaje: «Ubicación incompleta» reemplaza a «Falta completar: <nivel>.»
    expect(screen.queryByText(/Falta completar/)).toBeNull();
    expect(guardar()).toBeDisabled();

    await elegir(user, "Distrito", "San Antonio");
    expect(screen.queryByText(/Ubicación incompleta/)).toBeNull();
    await user.click(guardar());
    await waitFor(() => expect(corregir).toHaveBeenCalledTimes(1));
    expect(corregir.mock.calls[0][0].nodoId).toBe("san-antonio");
  });

  it("Costa Rica: un cantón sin distritos es hoja y no lleva el aviso", async () => {
    preparar(NIVELES_CR, LUGARES_CR, "isla");
    await abrir();
    expect(screen.queryByText(/Ubicación incompleta/)).toBeNull();
    expect(guardar()).toBeEnabled();
  });
});

// --- El aviso del importe con N niveles -----------------------------------------------------------

function ubicacion(nombre: string | null): UbicacionConCostos {
  return {
    zonaId: "z",
    zonaNombre: "Costa Norte",
    distritoNombre: nombre,
    esCentral: false,
    esZonaEspecial: false,
    tarifa: "resuelta",
    fleteConIva: "4200.00",
    comisionConIva: "840.00",
    fleteOrigen: "normal",
  };
}

function avisoDe(actual: string | null, propuesta: string | null): AvisoCambioUbicacion {
  return { actual: ubicacion(actual), propuesta: ubicacion(propuesta), yaEnUnCierre: false };
}

function filaDelLugar(): HTMLElement {
  const filas = screen.getAllByRole("row");
  const fila = filas[2]; // cabecera, zona, lugar
  if (!fila) throw new Error("sin fila del lugar");
  return fila;
}

describe("SLT-48 / R43 — el aviso «Confirma el cambio de ubicación» con N niveles (regla 3 de la maqueta)", () => {
  it("la fila del lugar se rotula con el tipo del último nivel y pinta las dos hojas (4 niveles)", () => {
    render(
      <CorregirUbicacionAviso
        aviso={avisoDe("Viña", "Viña")}
        onConfirmar={() => {}}
        niveles={NIVELES_XA}
        lugares={{
          actual: { nombre: "Miraflores", profundidad: 4, hoja: true },
          propuesta: { nombre: "Belloto", profundidad: 4, hoja: true },
        }}
      />,
    );
    const fila = filaDelLugar();
    expect(within(fila).getByRole("rowheader")).toHaveTextContent("Barrio");
    expect(within(fila).getByText("Miraflores")).toBeInTheDocument();
    expect(within(fila).getByText("Belloto")).toBeInTheDocument();
  });

  it("la hoja más arriba que el último nivel se pinta con su tipo («Barrio: Las Acacias»)", () => {
    render(
      <CorregirUbicacionAviso
        aviso={avisoDe(null, null)}
        onConfirmar={() => {}}
        niveles={NIVELES_10}
        lugares={{
          actual: { nombre: "Lote 7", profundidad: 10, hoja: true },
          propuesta: { nombre: "Las Acacias", profundidad: 8, hoja: true },
        }}
      />,
    );
    const fila = filaDelLugar();
    expect(within(fila).getByRole("rowheader")).toHaveTextContent("Lote");
    expect(within(fila).getByText("Lote 7")).toBeInTheDocument();
    expect(within(fila).getByText(avisoLugarConTipo("Barrio", "Las Acacias"))).toBeInTheDocument();
    expect(screen.queryByText(avisoSinNivel("Lote"))).toBeNull();
  });

  it("«Sin <nivel>» queda para la orden a medias: Costa Rica en un cantón con distritos dice «Sin distrito»", () => {
    render(
      <CorregirUbicacionAviso
        aviso={avisoDe(null, "San Rafael")}
        onConfirmar={() => {}}
        niveles={NIVELES_CR}
        lugares={{
          actual: { nombre: "Escazú", profundidad: 2, hoja: false },
          propuesta: { nombre: "San Rafael", profundidad: 3, hoja: true },
        }}
      />,
    );
    const fila = filaDelLugar();
    expect(within(fila).getByRole("rowheader")).toHaveTextContent("Distrito");
    expect(within(fila).getByText("Sin distrito")).toBeInTheDocument();
    expect(within(fila).getByText("San Rafael")).toBeInTheDocument();
  });

  it("desde la ventana: el aviso de un país de 10 niveles muestra la hoja propuesta con su tipo", async () => {
    preparar(NIVELES_10, LUGARES_10, "lote-7");
    const corregir = vi.fn().mockResolvedValueOnce({
      status: "confirmacion_requerida",
      aviso: avisoDe("Andina", "Las Acacias"),
    });
    const { user } = await abrir(corregir);
    await elegir(user, "Barrio", "Las Acacias");
    await user.click(guardar());
    expect(await screen.findByText(AVISO_TITULO)).toBeInTheDocument();

    const fila = filaDelLugar();
    expect(within(fila).getByRole("rowheader")).toHaveTextContent("Lote");
    expect(within(fila).getByText("Lote 7")).toBeInTheDocument();
    expect(within(fila).getByText(avisoLugarConTipo("Barrio", "Las Acacias"))).toBeInTheDocument();
    expect(corregir.mock.calls[0][0].nodoId).toBe("las-acacias");
  });
});
