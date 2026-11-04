// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

import { useRecogerPorGuia } from "@/app/(app)/mis-asignaciones/_components/useRecogerPorGuia";
import {
  listarMisAsignaciones,
  recogerAsignaciones,
} from "@/lib/actions/mis-asignaciones";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

// SLT-69 (hotfix) — el escáner de Recoger en bodega rechazaba en el teléfono una guía asignada
// DESPUÉS de abrir la pantalla: comparaba contra la lista `porRecoger` cargada al abrir y no
// preguntaba al servidor. Ahora, ante una guía que no está en la lista cargada, relee UNA vez la
// lista vigente (`listarMisAsignaciones`) y sigue el flujo de siempre con esa orden.
//
// Todos los datos y textos de estas aserciones están escritos a mano: ninguna compara contra la
// función que genera el texto.
vi.mock("@/lib/actions/mis-asignaciones", () => ({
  recogerAsignaciones: vi.fn(),
  listarMisAsignaciones: vi.fn(),
}));

const { successMock, errorMock } = vi.hoisted(() => ({
  successMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: successMock,
    error: errorMock,
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

const recogerMock = vi.mocked(recogerAsignaciones);
const listarMock = vi.mocked(listarMisAsignaciones);

type ListarResult = Awaited<ReturnType<typeof listarMisAsignaciones>>;

function makeAsignacion(
  over: Partial<MiAsignacionDTO> & { id: string; numGuia: number },
): MiAsignacionDTO {
  return {
    secuenciaRuta: null,
    numRemision: "REM-001",
    estatusValue: "mensajero_recogiendo_en_bodega",
    destinatario: "Ana Pérez",
    telefonoDest: "88880000",
    direccion: "Calle 1, casa 2",
    producto: "Caja mediana",
    peso: 1.5,
    montoCobrar: 150,
    latitud: 9.9281244,
    longitud: -84.0907246,
    notas: null,
    tiendaNombre: "Tienda X",
    zonaNombre: "GAM",
    provinciaNombre: "San José",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    ...over,
  };
}

/** Respuesta `ok` de la relectura con la lista vigente dada (el resto no lo lee el hook). */
function listaVigente(porRecoger: MiAsignacionDTO[]): ListarResult {
  return {
    status: "ok",
    porRecoger,
    porGestionar: [],
    conAyuda: [],
    ordenEnGestionId: null,
  } as unknown as ListarResult;
}

/** Lo que la pantalla tenía al abrir: una sola orden, la 1001. */
const cargada = [makeAsignacion({ id: "ord-1001", numGuia: 1001 })];
/** La orden asignada DESPUÉS de abrir la pantalla (el caso real del bug). */
const nueva = makeAsignacion({ id: "ord-nueva", numGuia: 34991060 });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("useRecogerPorGuia — guía que no está en la lista cargada (SLT-69)", () => {
  it("R1/R2: relee la lista UNA vez y recoge la guía asignada después de abrir la pantalla", async () => {
    listarMock.mockResolvedValue(listaVigente([...cargada, nueva]));
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-nueva"] });
    const { result } = renderHook(() => useRecogerPorGuia(cargada));

    let ok = false;
    await act(async () => {
      ok = await result.current.recoger(34991060);
    });

    expect(errorMock).not.toHaveBeenCalled();
    expect(listarMock).toHaveBeenCalledTimes(1);
    expect(recogerMock).toHaveBeenCalledTimes(1);
    expect(recogerMock).toHaveBeenCalledWith({ ordenIds: ["ord-nueva"] });
    expect(successMock).toHaveBeenCalledTimes(1);
    expect(successMock).toHaveBeenCalledWith("Guía 34991060 recogida.");
    expect(ok).toBe(true);
    expect(result.current.procesando).toBe(false);
  });

  it("R3: si el servidor tampoco la tiene, un solo aviso y sin llamar a la recogida", async () => {
    listarMock.mockResolvedValue(listaVigente(cargada));
    const { result } = renderHook(() => useRecogerPorGuia(cargada));

    let ok = true;
    await act(async () => {
      ok = await result.current.recoger(9999);
    });

    expect(ok).toBe(false);
    expect(listarMock).toHaveBeenCalledTimes(1);
    expect(recogerMock).not.toHaveBeenCalled();
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalledWith(
      "La guía 9999 no está entre tus órdenes para recoger.",
    );
    expect(successMock).not.toHaveBeenCalled();
  });

  it("R4: si la orden releída está reservada para otro día, aviso de reserva con su fecha y sin recoger", async () => {
    listarMock.mockResolvedValue(
      listaVigente([
        ...cargada,
        makeAsignacion({
          id: "ord-manana",
          numGuia: 34991060,
          esParaManana: true,
          fechaRepartoISO: "2026-10-31",
        }),
      ]),
    );
    const { result } = renderHook(() => useRecogerPorGuia(cargada));

    let ok = true;
    await act(async () => {
      ok = await result.current.recoger(34991060);
    });

    expect(ok).toBe(false);
    expect(recogerMock).not.toHaveBeenCalled();
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalledWith(
      "Esta orden es para el reparto del 31 de octubre. Ese día podrás recogerla y gestionarla.",
    );
  });

  it("R5: relectura `unauthenticated` → aviso de sesión expirada y sin recoger", async () => {
    listarMock.mockResolvedValue({ status: "unauthenticated" });
    const { result } = renderHook(() => useRecogerPorGuia(cargada));

    let ok = true;
    await act(async () => {
      ok = await result.current.recoger(34991060);
    });

    expect(ok).toBe(false);
    expect(recogerMock).not.toHaveBeenCalled();
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalledWith("Tu sesión expiró. Inicia sesión de nuevo.");
    expect(result.current.procesando).toBe(false);
  });

  it("R5: relectura `error` → aviso de reintento y sin recoger", async () => {
    listarMock.mockResolvedValue({ status: "error" });
    const { result } = renderHook(() => useRecogerPorGuia(cargada));

    let ok = true;
    await act(async () => {
      ok = await result.current.recoger(34991060);
    });

    expect(ok).toBe(false);
    expect(recogerMock).not.toHaveBeenCalled();
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalledWith(
      "No se pudo registrar la recogida. Intentá de nuevo.",
    );
    expect(result.current.procesando).toBe(false);
  });

  it("R5: relectura que LANZA → aviso de reintento (no se traga), sin recoger y `procesando` vuelve a false", async () => {
    listarMock.mockRejectedValue(new Error("red caída"));
    const { result } = renderHook(() => useRecogerPorGuia(cargada));

    let ok = true;
    await act(async () => {
      ok = await result.current.recoger(34991060);
    });

    expect(ok).toBe(false);
    expect(recogerMock).not.toHaveBeenCalled();
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalledWith(
      "No se pudo registrar la recogida. Intentá de nuevo.",
    );
    expect(result.current.procesando).toBe(false);
  });

  it("R9: con la relectura en curso, un segundo envío no relee ni recoge", async () => {
    let resolver: (r: ListarResult) => void = () => {};
    listarMock.mockReturnValue(
      new Promise<ListarResult>((res) => {
        resolver = res;
      }),
    );
    const { result } = renderHook(() => useRecogerPorGuia(cargada));

    let primera: Promise<boolean> = Promise.resolve(false);
    act(() => {
      primera = result.current.recoger(34991060);
    });
    expect(result.current.procesando).toBe(true);

    let segunda = true;
    await act(async () => {
      segunda = await result.current.recoger(34991060);
    });

    expect(segunda).toBe(false);
    expect(listarMock).toHaveBeenCalledTimes(1);
    expect(recogerMock).not.toHaveBeenCalled();

    // Se cierra la primera para no dejar la promesa colgando.
    await act(async () => {
      resolver(listaVigente(cargada));
      await primera;
    });
    expect(result.current.procesando).toBe(false);
  });
});

describe("useRecogerPorGuia — guía que SÍ está en la lista cargada (R10)", () => {
  it("R10: no relee la lista y recoge con la acción de siempre", async () => {
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-1001"] });
    const { result } = renderHook(() => useRecogerPorGuia(cargada));

    let ok = false;
    await act(async () => {
      ok = await result.current.recoger(1001);
    });

    expect(ok).toBe(true);
    expect(listarMock).not.toHaveBeenCalled();
    expect(recogerMock).toHaveBeenCalledTimes(1);
    expect(recogerMock).toHaveBeenCalledWith({ ordenIds: ["ord-1001"] });
    expect(successMock).toHaveBeenCalledWith("Guía 1001 recogida.");
  });

  it("R10: la decisión final es del servidor — un `conflict` pinta el aviso de conflicto de siempre", async () => {
    recogerMock.mockResolvedValue({ status: "conflict", detalle: [] });
    const { result } = renderHook(() => useRecogerPorGuia(cargada));

    let ok = true;
    await act(async () => {
      ok = await result.current.recoger(1001);
    });

    expect(ok).toBe(false);
    expect(listarMock).not.toHaveBeenCalled();
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalledWith(
      "La orden ya no está en «Mensajero recogiendo en la bodega». Actualiza y vuelve a intentar.",
    );
  });
});
