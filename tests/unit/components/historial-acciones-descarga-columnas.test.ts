import { describe, it, expect } from "vitest";

import {
  columnasHistorialAcciones,
  fechaCR,
} from "@/app/(app)/historico/acciones/_components/historial-acciones-columnas";
import {
  COLUMNAS_DESCARGA_HISTORIAL_ACCIONES,
  filaDescargaHistorialAccion,
} from "@/app/(app)/historico/acciones/_components/historial-acciones-descarga-columnas";
import { mensajeLimiteHistorial } from "@/app/(app)/historico/acciones/_components/historial-acciones-descarga";
import { accionesDeCategoria, type HistorialAccionDTO } from "@/lib/types/historial-accion";
import { aDTO } from "@/lib/services/HistorialAccionService";

// FICHA 362 / T6.2 (design §4.6, R30/R38) — las columnas del ARCHIVO y su adaptador.

function fila(extra: Partial<HistorialAccionDTO> = {}): HistorialAccionDTO {
  return {
    id: "3f0a1c62-6b7e-4a51-9f3d-2a1b4c5d6e7f",
    fecha: "2026-09-02T05:30:00.000Z",
    accion: "orden_eliminada",
    accionLabel: "Eliminó una orden",
    categoria: "hace_desaparecer",
    entidadTipo: "orden",
    entidadEtiqueta: "Guía 1234",
    actorNombre: "Ana Mora",
    actorRol: "admin",
    monto: "1234.50",
    valorAnterior: null,
    valorNuevo: null,
    loteId: "9c8b7a65-4321-4d0e-8f1a-0b1c2d3e4f50",
    ...extra,
  };
}

describe("R38 — las diez columnas del archivo, en su orden y sin identificadores internos", () => {
  it("las claves son exactamente las diez de design §4.6, en su orden", () => {
    expect(COLUMNAS_DESCARGA_HISTORIAL_ACCIONES.map((c) => c.clave)).toEqual([
      "fecha",
      "actor",
      "rol",
      "categoria",
      "accion",
      "entidadTipo",
      "entidad",
      "monto",
      "anterior",
      "nuevo",
    ]);
  });

  it("los encabezados son los del contrato", () => {
    expect(COLUMNAS_DESCARGA_HISTORIAL_ACCIONES.map((c) => c.encabezado)).toEqual([
      "Fecha",
      "Quién",
      "Rol",
      "Categoría",
      "Qué",
      "Tipo",
      "Sobre qué",
      "Importe",
      "Valor anterior",
      "Valor nuevo",
    ]);
  });

  it("no sale `id`, ni `entidadId`, ni `loteId`", () => {
    const claves = Object.keys(filaDescargaHistorialAccion(fila()));
    expect(claves).not.toContain("id");
    expect(claves).not.toContain("entidadId");
    expect(claves).not.toContain("loteId");

    // Y ninguna celda emite un uuid, que es lo que la guardia de columnas sensibles caza.
    const valores = Object.values(filaDescargaHistorialAccion(fila())).join(" ");
    expect(valores).not.toMatch(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
    );
  });

  it("la fila del archivo indexa por la clave de las columnas declaradas", () => {
    // Una columna declarada cuya clave la proyección no produce sale VACÍA en la hoja, sin
    // que nada falle. Se afirma el emparejamiento entero.
    const proyectada = filaDescargaHistorialAccion(fila());
    for (const columna of COLUMNAS_DESCARGA_HISTORIAL_ACCIONES) {
      expect(proyectada, `falta la clave ${columna.clave}`).toHaveProperty(columna.clave);
    }
    expect(Object.keys(proyectada)).toHaveLength(
      COLUMNAS_DESCARGA_HISTORIAL_ACCIONES.length,
    );
  });
});

describe("pantalla y archivo dicen LO MISMO", () => {
  it("las diez columnas de la tabla son las diez del archivo, en el mismo orden", () => {
    // Si divergieran, quien audita tendría dos versiones de un mismo hecho y ninguna forma de
    // saber cuál vale.
    expect(columnasHistorialAcciones.map((c) => c.id)).toEqual(
      COLUMNAS_DESCARGA_HISTORIAL_ACCIONES.map((c) => c.clave),
    );
  });
});

describe("R6 — el importe cruza el archivo como STRING, sin pasar por número", () => {
  it("`monto` sale TAL CUAL, con su escala 2", () => {
    const celda = filaDescargaHistorialAccion(fila({ monto: "1234.50" })).monto;
    expect(celda).toBe("1234.50");
    expect(typeof celda).toBe("string");
  });

  it("un importe con céntimos que un `Number` estropearía sale intacto", () => {
    expect(filaDescargaHistorialAccion(fila({ monto: "0.10" })).monto).toBe("0.10");
    expect(filaDescargaHistorialAccion(fila({ monto: "13331832.72" })).monto).toBe(
      "13331832.72",
    );
  });

  it("sin importe, la celda es `null` y no una raya", () => {
    // Una celda vacía en una hoja de cálculo es ordenable y filtrable; una raya es texto.
    expect(filaDescargaHistorialAccion(fila({ monto: null })).monto).toBeNull();
  });
});

describe("R35/R36 — lo que dice cada celda", () => {
  it("la fecha sale en el reloj de Costa Rica, no en UTC", () => {
    // 05:30 UTC = 23:30 del día ANTERIOR en CR. El archivo tiene que decir el 1, no el 2.
    const celda = String(filaDescargaHistorialAccion(fila()).fecha);
    expect(celda).toBe(fechaCR("2026-09-02T05:30:00.000Z"));
    expect(celda).toContain("1 sept");
    expect(celda).not.toContain("2 sept");
  });

  it("sin actor, la celda dice «Sistema» y no queda en blanco", () => {
    const proyectada = filaDescargaHistorialAccion(
      fila({ actorNombre: null, actorRol: null }),
    );
    expect(proyectada.actor).toBe("Sistema");
    expect(proyectada.rol).toBeNull();
  });

  it("`accionLabel` y `entidadEtiqueta` se copian CONGELADOS, sin re-derivar", () => {
    const proyectada = filaDescargaHistorialAccion(
      fila({ accionLabel: "Etiqueta de entonces", entidadEtiqueta: "Guía 999" }),
    );
    expect(proyectada.accion).toBe("Etiqueta de entonces");
    expect(proyectada.entidad).toBe("Guía 999");
  });
});

describe("el mensaje del tope", () => {
  it("es accionable: dice el tope y qué hacer", () => {
    expect(mensajeLimiteHistorial(5000)).toContain("5000");
    expect(mensajeLimiteHistorial(5000)).toContain("Acota los filtros");
  });

  it("no pinta un `undefined` donde el contrato no da total", () => {
    // ⚠️ Es la razón por la que este texto existe en vez de pasar por `mensajeLimite` del
    // adaptador común, que exige `(total, limite)`: el `limite_excedido` de esta ficha lleva
    // sólo `maximo`. El resto del camino SÍ va al adaptador común; se prueba de punta a punta
    // en `tests/components/HistorialAccionesModule.test.tsx`.
    expect(mensajeLimiteHistorial(5000)).not.toContain("undefined");
    expect(mensajeLimiteHistorial(5000)).not.toContain("NaN");
  });
});

describe("SLT-76 (R11) — la fila del rastro de distritos, en pantalla y en descarga", () => {
  // La fila tal como la escribe `ZonaRepository.update` para un distrito QUITADO y uno AÑADIDO,
  // pasada por el mismo `aDTO` que usa el listado. Los textos esperados van escritos a mano.
  const cruda = (valorAnterior: string | null, valorNuevo: string | null) =>
    aDTO({
      id: "5b1f7c2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
      createdAt: new Date("2026-11-02T15:00:00.000Z"),
      accion: "zona_distrito_cambiado",
      entidadTipo: "zona",
      entidadEtiqueta: "Zona Norte",
      actorUsuarioId: null,
      actorNombre: "Ana Mora",
      actorRol: "maestro",
      monto: null,
      valorAnterior,
      valorNuevo,
      loteId: "6c2a8d3f-2b3c-4d4e-9f0a-1b2c3d4e5f60",
    });

  // Las diez columnas de esta tabla pintan con una funcion; una que no lo hiciera revienta aqui.
  const pantalla = (fila: HistorialAccionDTO) =>
    Object.fromEntries(
      columnasHistorialAcciones.map((c) => {
        if (typeof c.render !== "function") throw new Error(`la columna ${c.id} no pinta con una funcion`);
        return [c.id, c.render(fila)];
      }),
    );

  it("quitado: etiqueta, categoria y el distrito en «Valor anterior», igual en las dos", () => {
    const fila = cruda("D1 (C1)", null);
    const descarga = filaDescargaHistorialAccion(fila);
    const vista = pantalla(fila);

    expect(descarga.accion).toBe("Cambió los distritos de una zona");
    expect(descarga.categoria).toBe("Mueve dinero");
    expect(descarga.entidad).toBe("Zona Norte");
    expect(descarga.anterior).toBe("D1 (C1)");
    expect(descarga.nuevo).toBeNull();

    expect(vista.accion).toBe("Cambió los distritos de una zona");
    expect(vista.categoria).toBe("Mueve dinero");
    expect(vista.anterior).toBe("D1 (C1)");
    expect(vista.nuevo).toBe("—");
  });

  it("añadido: el distrito en «Valor nuevo», igual en las dos", () => {
    const fila = cruda(null, "D3 (C3)");
    expect(filaDescargaHistorialAccion(fila).nuevo).toBe("D3 (C3)");
    expect(filaDescargaHistorialAccion(fila).anterior).toBeNull();
    expect(pantalla(fila).nuevo).toBe("D3 (C3)");
    expect(pantalla(fila).anterior).toBe("—");
  });

  it("el filtro por categoria «Mueve dinero» la encuentra", () => {
    expect(accionesDeCategoria("mueve_dinero")).toContain("zona_distrito_cambiado");
  });
});
