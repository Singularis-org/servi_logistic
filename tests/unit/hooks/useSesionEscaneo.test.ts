// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useEntradaEscaneo } from "@/hooks/useEntradaEscaneo";
import { useSesionEscaneo } from "@/hooks/useSesionEscaneo";
import type { DesenlaceRecepcion } from "@/lib/utils/sesion-escaneo";

// SLT-159 «Escaneo continuo en recepciones y recogidas» — la sesión montada sobre la cola REAL
// de SLT-158 (`useEntradaEscaneo`), como la usa `EscanerGuiaCard continuo`.

function montar(
  recibir: (numGuia: number) => Promise<DesenlaceRecepcion>,
  alCerrarConRecepcion?: () => void,
) {
  return renderHook(() => {
    const sesion = useSesionEscaneo(recibir, { alCerrarConRecepcion });
    const entrada = useEntradaEscaneo({
      procesar: sesion.procesar,
      alLlegar: sesion.registrar,
      campoRef: { current: null },
      enfocarTrasLectura: false,
      motivoFalloInesperado: "fallo",
    });
    return { sesion, entrada };
  });
}

type Hook = ReturnType<typeof montar>;

async function leer(hook: Hook, ...textos: string[]) {
  await act(async () => {
    for (const t of textos) hook.result.current.entrada.recibirLectura(t, "campo");
  });
}

/** Promesa que el test resuelve a mano: la acción «en vuelo». */
function diferida() {
  let resolver!: (d: DesenlaceRecepcion) => void;
  const promesa = new Promise<DesenlaceRecepcion>((r) => (resolver = r));
  return { promesa, resolver };
}

const estados = (hook: Hook) => hook.result.current.sesion.filas.map((f) => [f.leido, f.estado.tipo]);

describe("useSesionEscaneo — relecturas (R585)", () => {
  it("1024 dos veces: la acción se llama una vez y la segunda fila es «Ya recibida»", async () => {
    const recibir = vi.fn(async (): Promise<DesenlaceRecepcion> => ({ tipo: "recibida" }));
    const hook = montar(recibir);

    await leer(hook, "1024", "1024");
    await vi.waitFor(() => expect(estados(hook)[1]).toEqual(["1024", "recibida"]));

    expect(recibir).toHaveBeenCalledTimes(1);
    expect(estados(hook)[0]).toEqual(["1024", "repetida_en_sesion"]);
    expect(hook.result.current.sesion.contadores).toEqual({
      recibidas: 1,
      repetidas: 1,
      noEncontradas: 0,
    });
  });

  it("7777777 no encontrada y otra vez 7777777: la acción se llama dos veces", async () => {
    const recibir = vi.fn(async (): Promise<DesenlaceRecepcion> => ({ tipo: "no_encontrada" }));
    const hook = montar(recibir);

    await leer(hook, "7777777");
    await vi.waitFor(() => expect(estados(hook)[0][1]).toBe("no_encontrada"));
    await leer(hook, "7777777");
    await vi.waitFor(() => expect(recibir).toHaveBeenCalledTimes(2));
  });
});

describe("useSesionEscaneo — una a una y en orden (R587)", () => {
  it("tres lecturas seguidas: 1024, 2048, 4096, de una en una y cada fila con su respuesta", async () => {
    const vuelos = [diferida(), diferida(), diferida()];
    let n = 0;
    const recibir = vi.fn(() => vuelos[n++].promesa);
    const hook = montar(recibir);

    await leer(hook, "1024", "2048", "4096");
    expect(estados(hook)).toEqual([
      ["4096", "recibiendo"],
      ["2048", "recibiendo"],
      ["1024", "recibiendo"],
    ]);
    expect(recibir.mock.calls).toEqual([[1024]]);

    await act(async () => vuelos[0].resolver({ tipo: "recibida" }));
    await vi.waitFor(() => expect(recibir.mock.calls).toEqual([[1024], [2048]]));
    await act(async () => vuelos[1].resolver({ tipo: "no_encontrada" }));
    await vi.waitFor(() => expect(recibir.mock.calls).toEqual([[1024], [2048], [4096]]));
    await act(async () => vuelos[2].resolver({ tipo: "ya_recibida" }));

    await vi.waitFor(() =>
      expect(estados(hook)).toEqual([
        ["4096", "ya_recibida"],
        ["2048", "no_encontrada"],
        ["1024", "recibida"],
      ]),
    );
  });

  it("un «Reintentar» pulsado con otra en curso espera a que esa responda", async () => {
    const enCurso = diferida();
    const recibir = vi
      .fn<(numGuia: number) => Promise<DesenlaceRecepcion>>()
      .mockResolvedValueOnce({ tipo: "no_se_pudo", motivo: "La orden cambió de estado." })
      .mockReturnValueOnce(enCurso.promesa)
      .mockResolvedValue({ tipo: "recibida" });
    const hook = montar(recibir);

    await leer(hook, "1024");
    await vi.waitFor(() => expect(estados(hook)[0][1]).toBe("no_se_pudo"));
    await leer(hook, "2048");
    const filaId = hook.result.current.sesion.filas[1].id;
    act(() => hook.result.current.sesion.reintentar(filaId));

    expect(estados(hook)).toEqual([
      ["2048", "recibiendo"],
      ["1024", "recibiendo"],
    ]);
    await Promise.resolve();
    expect(recibir).toHaveBeenCalledTimes(2);

    await act(async () => enCurso.resolver({ tipo: "recibida" }));
    await vi.waitFor(() => expect(recibir.mock.calls).toEqual([[1024], [2048], [1024]]));
    await vi.waitFor(() =>
      expect(estados(hook)).toEqual([
        ["2048", "recibida"],
        ["1024", "recibida"],
      ]),
    );
  });

  it("una acción que lanza deja su fila en «No se pudo recibir» y la cola sigue", async () => {
    const recibir = vi
      .fn<(numGuia: number) => Promise<DesenlaceRecepcion>>()
      .mockRejectedValueOnce(new Error("sin red"))
      .mockResolvedValue({ tipo: "recibida" });
    const hook = montar(recibir);

    await leer(hook, "1024", "2048");
    await vi.waitFor(() =>
      expect(estados(hook)).toEqual([
        ["2048", "recibida"],
        ["1024", "no_se_pudo"],
      ]),
    );
  });
});

describe("useSesionEscaneo — refresco único al cerrar (R592)", () => {
  it("con una recibida, alCerrarConRecepcion se llama una vez y solo al desmontar", async () => {
    const alCerrar = vi.fn();
    const hook = montar(async () => ({ tipo: "recibida" }), alCerrar);

    await leer(hook, "1024", "2048");
    await vi.waitFor(() => expect(estados(hook)[0][1]).toBe("recibida"));
    expect(alCerrar).not.toHaveBeenCalled();

    hook.unmount();
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("sin ninguna recibida, no se llama", async () => {
    const alCerrar = vi.fn();
    const hook = montar(async () => ({ tipo: "no_encontrada" }), alCerrar);

    await leer(hook, "7777777");
    await vi.waitFor(() => expect(estados(hook)[0][1]).toBe("no_encontrada"));

    hook.unmount();
    expect(alCerrar).not.toHaveBeenCalled();
  });
});
