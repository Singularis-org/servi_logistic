// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

import { useRecogerPorGuia } from "@/app/(app)/mis-asignaciones/_components/useRecogerPorGuia";
import {
  listarMisAsignaciones,
  recogerAsignaciones,
} from "@/lib/actions/mis-asignaciones";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";
import type { DesenlaceRecepcion } from "@/lib/utils/sesion-escaneo";

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

const { successMock, errorMock, infoMock } = vi.hoisted(() => ({
  successMock: vi.fn(),
  errorMock: vi.fn(),
  infoMock: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: successMock,
    error: errorMock,
    info: infoMock,
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

// SLT-168 «Escaneo continuo en las recogidas del mensajero»: `recoger` devuelve el desenlace de
// la fila (R596) y NO lanza toasts (R590). Los motivos son los de siempre, escritos a mano.

function sinToasts() {
  expect(successMock).not.toHaveBeenCalled();
  expect(errorMock).not.toHaveBeenCalled();
  expect(infoMock).not.toHaveBeenCalled();
}

async function recogerCon(
  lista: MiAsignacionDTO[],
  numGuia: number,
): Promise<{ desenlace: DesenlaceRecepcion | undefined; procesando: boolean }> {
  const { result } = renderHook(() => useRecogerPorGuia(lista));
  let desenlace: DesenlaceRecepcion | undefined;
  await act(async () => {
    desenlace = await result.current.recoger(numGuia);
  });
  return { desenlace, procesando: result.current.procesando };
}

describe("useRecogerPorGuia — guía que no está en la lista cargada (SLT-69)", () => {
  it("R1/R2 + R832: relee la lista UNA vez, recoge y el éxito trae destinatario y tienda de la relectura", async () => {
    listarMock.mockResolvedValue(
      listaVigente([
        ...cargada,
        { ...nueva, destinatario: "Beto Ruiz", tiendaNombre: "Tienda Prueba Sur" },
      ]),
    );
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-nueva"] });

    const { desenlace, procesando } = await recogerCon(cargada, 34991060);

    expect(desenlace).toEqual({
      tipo: "recibida",
      resumen: { destinatario: "Beto Ruiz", tienda: "Tienda Prueba Sur" },
    });
    expect(listarMock).toHaveBeenCalledTimes(1);
    expect(recogerMock).toHaveBeenCalledTimes(1);
    expect(recogerMock).toHaveBeenCalledWith({ ordenIds: ["ord-nueva"] });
    expect(procesando).toBe(false);
    sinToasts();
  });

  it("R3 + R596: si el servidor tampoco la tiene → `no_encontrada`, sin llamar a la recogida", async () => {
    listarMock.mockResolvedValue(listaVigente(cargada));

    const { desenlace } = await recogerCon(cargada, 7777777);

    expect(desenlace).toEqual({ tipo: "no_encontrada" });
    expect(listarMock).toHaveBeenCalledTimes(1);
    expect(recogerMock).not.toHaveBeenCalled();
    sinToasts();
  });

  it("R4 + R599: orden releída reservada para otro día → `no_se_pudo` con el aviso de reserva y sin recoger", async () => {
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

    const { desenlace } = await recogerCon(cargada, 34991060);

    expect(desenlace).toEqual({
      tipo: "no_se_pudo",
      motivo:
        "Esta orden es para el reparto del 31 de octubre. Ese día podrás recogerla y gestionarla.",
    });
    expect(recogerMock).not.toHaveBeenCalled();
    sinToasts();
  });

  it("R5: relectura `unauthenticated` → sesión expirada y sin recoger", async () => {
    listarMock.mockResolvedValue({ status: "unauthenticated" });

    const { desenlace, procesando } = await recogerCon(cargada, 34991060);

    expect(desenlace).toEqual({
      tipo: "no_se_pudo",
      motivo: "Tu sesión expiró. Inicia sesión de nuevo.",
    });
    expect(recogerMock).not.toHaveBeenCalled();
    expect(procesando).toBe(false);
  });

  it("R5: relectura `error` → reintento y sin recoger", async () => {
    listarMock.mockResolvedValue({ status: "error" });

    const { desenlace, procesando } = await recogerCon(cargada, 34991060);

    expect(desenlace).toEqual({
      tipo: "no_se_pudo",
      motivo: "No se pudo registrar la recogida. Intentá de nuevo.",
    });
    expect(recogerMock).not.toHaveBeenCalled();
    expect(procesando).toBe(false);
  });

  it("R5: relectura que LANZA → reintento (no se traga), sin recoger y `procesando` vuelve a false", async () => {
    listarMock.mockRejectedValue(new Error("red caída"));

    const { desenlace, procesando } = await recogerCon(cargada, 34991060);

    expect(desenlace).toEqual({
      tipo: "no_se_pudo",
      motivo: "No se pudo registrar la recogida. Intentá de nuevo.",
    });
    expect(recogerMock).not.toHaveBeenCalled();
    expect(procesando).toBe(false);
  });

  it("R9: con la relectura en curso, un segundo envío no relee ni recoge", async () => {
    let resolver: (r: ListarResult) => void = () => {};
    listarMock.mockReturnValue(
      new Promise<ListarResult>((res) => {
        resolver = res;
      }),
    );
    const { result } = renderHook(() => useRecogerPorGuia(cargada));

    let primera: Promise<unknown> = Promise.resolve();
    act(() => {
      primera = result.current.recoger(34991060);
    });
    expect(result.current.procesando).toBe(true);

    let segunda: DesenlaceRecepcion | undefined;
    await act(async () => {
      segunda = await result.current.recoger(34991060);
    });

    expect(segunda).toEqual({ tipo: "no_se_pudo", motivo: "Hay otra recogida en curso." });
    expect(listarMock).toHaveBeenCalledTimes(1);
    expect(recogerMock).not.toHaveBeenCalled();

    await act(async () => {
      resolver(listaVigente(cargada));
      await primera;
    });
    expect(result.current.procesando).toBe(false);
  });
});

describe("useRecogerPorGuia — guía que SÍ está en la lista cargada (R10)", () => {
  it("R10 + R832: no relee, recoge y el éxito trae destinatario y tienda de la orden cargada", async () => {
    recogerMock.mockResolvedValue({ status: "ok", recogidas: ["ord-1001"] });
    const lista = [
      makeAsignacion({
        id: "ord-1001",
        numGuia: 1001,
        destinatario: "Ana Quesada Mora",
        tiendaNombre: "Tienda Prueba Norte",
      }),
    ];

    const { desenlace } = await recogerCon(lista, 1001);

    expect(desenlace).toEqual({
      tipo: "recibida",
      resumen: { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" },
    });
    expect(listarMock).not.toHaveBeenCalled();
    expect(recogerMock).toHaveBeenCalledTimes(1);
    expect(recogerMock).toHaveBeenCalledWith({ ordenIds: ["ord-1001"] });
    sinToasts();
  });

  it("R599: orden cargada reservada para otro día → aviso de reserva y la acción NO se llama", async () => {
    const lista = [
      makeAsignacion({
        id: "ord-1001",
        numGuia: 1001,
        esParaManana: true,
        fechaRepartoISO: "2026-12-02",
      }),
    ];

    const { desenlace } = await recogerCon(lista, 1001);

    expect(desenlace).toEqual({
      tipo: "no_se_pudo",
      motivo:
        "Esta orden es para el reparto del 2 de diciembre. Ese día podrás recogerla y gestionarla.",
    });
    expect(recogerMock).not.toHaveBeenCalled();
  });
});

type RespuestaRecoger = Awaited<ReturnType<typeof recogerAsignaciones>>;

describe("useRecogerPorGuia — cada `status` de `recogerAsignaciones` → su desenlace (R596)", () => {
  const casos: Array<[string, RespuestaRecoger, string]> = [
    [
      "conflict sin código",
      { status: "conflict", detalle: [] } as unknown as RespuestaRecoger,
      "La orden ya no está en «Mensajero recogiendo en la bodega». Actualiza y vuelve a intentar.",
    ],
    [
      "forbidden",
      { status: "forbidden" } as unknown as RespuestaRecoger,
      "No tienes permiso para recoger esta orden.",
    ],
    [
      "unauthenticated",
      { status: "unauthenticated" } as unknown as RespuestaRecoger,
      "Tu sesión expiró. Inicia sesión de nuevo.",
    ],
    [
      "validation_error",
      { status: "validation_error" } as unknown as RespuestaRecoger,
      "Código inválido.",
    ],
    [
      "error",
      { status: "error" } as unknown as RespuestaRecoger,
      "No se pudo registrar la recogida. Intentá de nuevo.",
    ],
  ];

  it.each(casos)("%s → «No se pudo recoger» con su motivo de siempre", async (_n, resp, motivo) => {
    recogerMock.mockResolvedValue(resp);

    const { desenlace } = await recogerCon(cargada, 1001);

    expect(desenlace).toEqual({ tipo: "no_se_pudo", motivo });
    expect(listarMock).not.toHaveBeenCalled();
    sinToasts();
  });

  it("conflict con `reservada_para_otro_dia` → el aviso de reserva con la fecha de la orden", async () => {
    recogerMock.mockResolvedValue({
      status: "conflict",
      detalle: [{ codigo: "reservada_para_otro_dia" }],
    } as unknown as RespuestaRecoger);
    const lista = [
      makeAsignacion({ id: "ord-1001", numGuia: 1001, fechaRepartoISO: "2026-10-31" }),
    ];

    const { desenlace } = await recogerCon(lista, 1001);

    expect(desenlace).toEqual({
      tipo: "no_se_pudo",
      motivo:
        "Esta orden es para el reparto del 31 de octubre. Ese día podrás recogerla y gestionarla.",
    });
  });
});
