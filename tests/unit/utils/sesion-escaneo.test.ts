import { describe, expect, it } from "vitest";

import {
  SESION_VACIA,
  contadores,
  horaLectura,
  lineaDeEstado,
  reducirSesion,
  textoEstado,
  ultimaRespondida,
  TEXTOS_RECOGIDA,
  TEXTOS_RECOLECCION,
  type AccionSesion,
  type FilaLectura,
  type SesionEscaneo,
} from "@/lib/utils/sesion-escaneo";

// SLT-159 «Escaneo continuo en recepciones y recogidas» — la sesión pura. Los textos van a
// mano, nunca leídos de la función que los produce.

const HORA = new Date(2026, 10, 16, 17, 42, 8);

function aplicar(...acciones: AccionSesion[]): SesionEscaneo {
  return acciones.reduce(reducirSesion, SESION_VACIA);
}

const llegar = (texto: string): AccionSesion => ({ tipo: "llegar", texto, hora: HORA });

function fila(estado: FilaLectura["estado"], numGuia: number | null = 1024, leido = "1024"): FilaLectura {
  return { id: 1, hora: HORA, leido, numGuia, estado };
}

describe("sesion-escaneo — contadores (R586)", () => {
  it("cuenta Recibidas, Repetidas (ya recibida + relectura) y No encontradas: 0, 1, 2", () => {
    const sesion = aplicar(
      llegar("1024"),
      llegar("7777777"),
      llegar("8888888"),
      { tipo: "resolver", id: 1, desenlace: { tipo: "ya_recibida" } },
      { tipo: "resolver", id: 2, desenlace: { tipo: "no_encontrada" } },
      { tipo: "resolver", id: 3, desenlace: { tipo: "no_encontrada" } },
    );
    expect(contadores(sesion.filas)).toEqual({ recibidas: 0, repetidas: 1, noEncontradas: 2 });
  });

  it("una relectura en la sesión suma a Repetidas; la recibida, a Recibidas", () => {
    const sesion = aplicar(
      llegar("1024"),
      { tipo: "resolver", id: 1, desenlace: { tipo: "recibida" } },
      llegar("1024"),
    );
    expect(contadores(sesion.filas)).toEqual({ recibidas: 1, repetidas: 1, noEncontradas: 0 });
  });

  it("«Código inválido» y «No se pudo recibir» dejan los tres en 0 (DC6)", () => {
    const sesion = aplicar(llegar("1024abc"), llegar("2048"), {
      tipo: "resolver",
      id: 2,
      desenlace: { tipo: "no_se_pudo", motivo: "Esta orden es de otra tienda." },
    });
    expect(sesion.filas.map((f) => textoEstado(f.estado))).toEqual([
      "No se pudo recibir",
      "Código inválido",
    ]);
    expect(contadores(sesion.filas)).toEqual({ recibidas: 0, repetidas: 0, noEncontradas: 0 });
  });
});

describe("sesion-escaneo — filas (R581, R582, R584, R585)", () => {
  it("la más reciente arriba y en «Recibiendo…» hasta responder", () => {
    const sesion = aplicar(llegar("1024"), llegar("2048"));
    expect(sesion.filas.map((f) => f.leido)).toEqual(["2048", "1024"]);
    expect(sesion.filas.map((f) => textoEstado(f.estado))).toEqual(["Recibiendo…", "Recibiendo…"]);
  });

  it("una guía cuya fila anterior falló NO cuenta como repetida", () => {
    const sesion = aplicar(
      llegar("7777777"),
      { tipo: "resolver", id: 1, desenlace: { tipo: "no_encontrada" } },
      llegar("7777777"),
    );
    expect(textoEstado(sesion.filas[0].estado)).toBe("Recibiendo…");
  });

  it("reintentar pone la MISMA fila en «Recibiendo…» sin añadir otra", () => {
    const sesion = aplicar(
      llegar("1024"),
      { tipo: "resolver", id: 1, desenlace: { tipo: "no_se_pudo", motivo: "x" } },
      { tipo: "reintentar", id: 1 },
    );
    expect(sesion.filas).toHaveLength(1);
    expect(textoEstado(sesion.filas[0].estado)).toBe("Recibiendo…");
  });
});

describe("sesion-escaneo — hora y línea de estado (R581, R615)", () => {
  it("la hora es HH:mm:ss en 24 h", () => {
    expect(horaLectura(HORA)).toBe("17:42:08");
    expect(horaLectura(new Date(2026, 10, 16, 7, 5, 3))).toBe("07:05:03");
  });

  it("dice cada estado con los textos aprobados", () => {
    const resumen = { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" };
    expect(lineaDeEstado(fila({ tipo: "recibida", resumen }))).toBe(
      "Guía 1024 recibida · Ana Quesada Mora",
    );
    expect(lineaDeEstado(fila({ tipo: "recibida" }))).toBe("Guía 1024 recibida");
    expect(lineaDeEstado(fila({ tipo: "ya_recibida", resumen }))).toBe("Guía 1024 · Ya recibida");
    expect(lineaDeEstado(fila({ tipo: "repetida_en_sesion" }))).toBe("Guía 1024 · Ya recibida");
    expect(lineaDeEstado(fila({ tipo: "no_encontrada" }, 7777777))).toBe(
      "Guía 7777777 · No encontrada",
    );
    expect(lineaDeEstado(fila({ tipo: "codigo_invalido" }, null, "1024abc"))).toBe(
      "1024abc · Código inválido",
    );
    expect(
      lineaDeEstado(fila({ tipo: "no_se_pudo", motivo: "Esta orden es de otra tienda." })),
    ).toBe("Guía 1024 · No se pudo recibir: Esta orden es de otra tienda.");
  });

  it("la línea es de la lectura más reciente que ya respondió", () => {
    const sesion = aplicar(llegar("1024"), llegar("2048"), {
      tipo: "resolver",
      id: 1,
      desenlace: { tipo: "recibida" },
    });
    expect(ultimaRespondida(sesion.filas)?.leido).toBe("1024");
    expect(ultimaRespondida(aplicar(llegar("1024")).filas)).toBeUndefined();
  });
});

// SLT-168 «Escaneo continuo en las recogidas del mensajero» — el verbo de cada superficie.
// Literales a mano (aprobados por Carlos el 2026-11-17).
describe("sesion-escaneo — textos de M1 y M2 (R596, R597, R830, R831)", () => {
  it("R830: «recibiendo» dice «Recogiendo…» en M1 y «Recolectando…» en M2", () => {
    expect(textoEstado({ tipo: "recibiendo" }, TEXTOS_RECOGIDA)).toBe("Recogiendo…");
    expect(textoEstado({ tipo: "recibiendo" }, TEXTOS_RECOLECCION)).toBe("Recolectando…");
  });

  it("R596: éxito, ya hecha, no encontrada y no se pudo con el verbo de M1", () => {
    expect(textoEstado({ tipo: "recibida" }, TEXTOS_RECOGIDA)).toBe("Recogida");
    expect(textoEstado({ tipo: "no_encontrada" }, TEXTOS_RECOGIDA)).toBe(
      "No está entre tus órdenes",
    );
    expect(textoEstado({ tipo: "no_se_pudo", motivo: "x" }, TEXTOS_RECOGIDA)).toBe(
      "No se pudo recoger",
    );
    expect(textoEstado({ tipo: "codigo_invalido" }, TEXTOS_RECOGIDA)).toBe("Código inválido");
  });

  it("R596: éxito, ya recolectada, no encontrada y no se pudo con el verbo de M2", () => {
    expect(textoEstado({ tipo: "recibida" }, TEXTOS_RECOLECCION)).toBe("Recolectada");
    expect(textoEstado({ tipo: "ya_recibida" }, TEXTOS_RECOLECCION)).toBe("Ya recolectada");
    expect(textoEstado({ tipo: "no_encontrada" }, TEXTOS_RECOLECCION)).toBe(
      "No está entre tus órdenes",
    );
    expect(textoEstado({ tipo: "no_se_pudo", motivo: "x" }, TEXTOS_RECOLECCION)).toBe(
      "No se pudo recolectar",
    );
  });

  it("R831: la relectura en la sesión dice «Ya recogida» en M1 y «Ya recolectada» en M2", () => {
    const repetida = { tipo: "repetida_en_sesion" } as const;
    expect(textoEstado(repetida, TEXTOS_RECOGIDA)).toBe("Ya recogida");
    expect(textoEstado(repetida, TEXTOS_RECOLECCION)).toBe("Ya recolectada");
  });

  it("R597: rótulo del primer contador «Recogidas» / «Recolectadas»", () => {
    expect(TEXTOS_RECOGIDA.contadorExitos).toBe("Recogidas");
    expect(TEXTOS_RECOLECCION.contadorExitos).toBe("Recolectadas");
  });

  it("R597: «No se pudo recolectar» y «Código inválido» no suman; la relectura suma a Repetidas", () => {
    const sesion = aplicar(
      llegar("1024"),
      llegar("1024"),
      llegar("2048"),
      llegar("abc"),
      { tipo: "resolver", id: 1, desenlace: { tipo: "recibida" } },
      { tipo: "resolver", id: 3, desenlace: { tipo: "no_se_pudo", motivo: "Sin red." } },
    );
    expect(contadores(sesion.filas)).toEqual({ recibidas: 1, repetidas: 1, noEncontradas: 0 });
  });

  it("R834: sin textos, «recibiendo» sigue diciendo «Recibiendo…»", () => {
    expect(textoEstado({ tipo: "recibiendo" })).toBe("Recibiendo…");
    expect(textoEstado({ tipo: "repetida_en_sesion" })).toBe("Ya recibida");
  });
});
