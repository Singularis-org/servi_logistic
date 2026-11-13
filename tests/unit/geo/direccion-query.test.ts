import { describe, it, expect } from "vitest";
import { construirQueryDireccion, hashDireccion } from "@/lib/geo/direccion-query";

// Feature 91 (R15/R16/R17) — construccion de la consulta y de la huella de cache. Las DOS
// normalizaciones son DISTINTAS a proposito (design §4): la consulta conserva acentos y
// capitalizacion (Google los usa como senal); la huella los normaliza para que dos
// escrituras equivalentes compartan entrada de cache.

// SLT-125 (design §4.5): la entrada es la ruta del catalogo (del nivel 1 al lugar) y el nombre del
// pais de la empresa. Lo que se espera de Costa Rica no cambia (R33).
const BASE = {
  direccion: "Av. Central 100",
  ruta: ["San José", "San José", "Carmen"],
  paisNombre: "Costa Rica",
};

describe("R15 — construccion de la consulta", () => {
  it("concatena direccion, distrito, canton, provincia y pais omitiendo los ausentes", () => {
    expect(construirQueryDireccion(BASE)).toBe(
      "Av. Central 100, Carmen, San José, San José, Costa Rica",
    );
  });

  it("no deja separadores vacios cuando un componente de catalogo viene en blanco", () => {
    const query = construirQueryDireccion({
      ...BASE,
      ruta: ["San José", "", "   "],
    });
    expect(query).toBe("Av. Central 100, San José, Costa Rica");
    expect(query).not.toMatch(/,\s*,/);
    expect(query).not.toMatch(/,\s*$/);
  });

  it("conserva acentos y capitalizacion (son senal para el proveedor)", () => {
    const query = construirQueryDireccion(BASE);
    expect(query).toContain("San José");
    expect(query).not.toContain("san jose");
  });

  it("colapsa espacios redundantes de la direccion libre", () => {
    expect(
      construirQueryDireccion({ ...BASE, direccion: "  Av.   Central   100  " }),
    ).toBe("Av. Central 100, Carmen, San José, San José, Costa Rica");
  });
});

describe("R16 — orden sin distrito", () => {
  it("construye la consulta sin distrito cuando la orden no lo tiene", () => {
    expect(construirQueryDireccion({ ...BASE, ruta: ["San José", "San José"] })).toBe(
      "Av. Central 100, San José, San José, Costa Rica",
    );
  });
});

describe("R9/Q5 — sin direccion libre no hay consulta", () => {
  it.each([
    ["null", null],
    ["vacia", ""],
    ["solo espacios", "    "],
  ])("devuelve null cuando la direccion es %s", (_caso, direccion) => {
    expect(construirQueryDireccion({ ...BASE, direccion })).toBeNull();
  });
});

describe("robustez en el borde del writer", () => {
  // Esta funcion se llama DENTRO de la transaccion de creacion de ordenes. Un campo
  // AUSENTE (undefined, no null) en la fila proyectada debe comportarse como vacio y
  // NUNCA lanzar: una excepcion aqui abortaria la creacion de la orden entera.
  it("un componente undefined se omite en vez de reventar", () => {
    expect(() =>
      construirQueryDireccion({
        direccion: "Av. Central 100",
        ruta: [undefined, undefined, undefined],
        paisNombre: "Costa Rica",
      }),
    ).not.toThrow();
    expect(
      construirQueryDireccion({
        direccion: "Av. Central 100",
        ruta: [undefined, undefined, undefined],
        paisNombre: "Costa Rica",
      }),
    ).toBe("Av. Central 100, Costa Rica");
  });

  it("direccion undefined -> null (no geocodificable), sin lanzar", () => {
    expect(
      construirQueryDireccion({ ...BASE, direccion: undefined }),
    ).toBeNull();
  });
});

describe("R17 — huella de deduplicacion", () => {
  it("dos variantes con acentos, mayusculas y espacios extra producen la misma huella", () => {
    const a = hashDireccion("Av. Central 100, San José, Costa Rica");
    const b = hashDireccion("  AV. CENTRAL   100,   SAN JOSE,  COSTA RICA ");
    expect(a).toBe(b);
  });

  it("dos direcciones DISTINTAS producen huellas distintas", () => {
    expect(hashDireccion("Av. Central 100")).not.toBe(hashDireccion("Av. Central 200"));
  });

  it("es determinista y hexadecimal de 64 caracteres (SHA-256)", () => {
    const h = hashDireccion("Av. Central 100");
    expect(h).toBe(hashDireccion("Av. Central 100"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

// SLT-125 (R32, R33) — la ruta a cualquier profundidad, del mas hondo al nivel 1, y el pais de la
// empresa. Los paises de prueba son inventados: lo que se prueba es la forma, no un pais real.
describe("SLT-125 R32 — ruta de N niveles y pais de la empresa", () => {
  it("2 niveles: direccion, nivel 2, nivel 1 y pais", () => {
    expect(
      construirQueryDireccion({ direccion: "Calle 5", ruta: ["Norte", "Villa Alta"], paisNombre: "Pais Dos" }),
    ).toBe("Calle 5, Villa Alta, Norte, Pais Dos");
  });

  it("4 niveles: del mas hondo al nivel 1", () => {
    expect(
      construirQueryDireccion({
        direccion: "Pasaje 7",
        ruta: ["Region Sur", "Comuna Uno", "Barrio Alto", "Sector 3"],
        paisNombre: "Pais Cuatro",
      }),
    ).toBe("Pasaje 7, Sector 3, Barrio Alto, Comuna Uno, Region Sur, Pais Cuatro");
  });

  it("10 niveles: todos los tramos, invertidos, sin perder ninguno", () => {
    const ruta = Array.from({ length: 10 }, (_, i) => `L${i + 1}`);
    expect(construirQueryDireccion({ direccion: "Km 1", ruta, paisNombre: "Pais Diez" })).toBe(
      "Km 1, L10, L9, L8, L7, L6, L5, L4, L3, L2, L1, Pais Diez",
    );
  });

  it("no invierte la ruta del llamador (la lee, no la muta)", () => {
    const ruta = ["A", "B", "C"];
    construirQueryDireccion({ direccion: "Calle 1", ruta, paisNombre: "P" });
    expect(ruta).toEqual(["A", "B", "C"]);
  });

  it("ruta vacia (lugar fuera del catalogo) y pais ausente: solo la direccion", () => {
    expect(construirQueryDireccion({ direccion: "Calle 1", ruta: [], paisNombre: null })).toBe("Calle 1");
  });

  it("con la direccion vacia sigue sin consulta, a cualquier profundidad", () => {
    expect(
      construirQueryDireccion({ direccion: "  ", ruta: ["A", "B", "C", "D"], paisNombre: "Pais Cuatro" }),
    ).toBeNull();
  });
});

describe("SLT-125 R33 — Costa Rica: cadena y huella literales de hoy", () => {
  // Las huellas se calcularon con `construirQueryDireccion` y `hashDireccion` de antes de SLT-125
  // (tres nombres fijos y el pais constante). Si cambian, `GeocodeCache` deja de servir lo que tiene.
  it("con distrito", () => {
    const q = construirQueryDireccion({
      direccion: "Av. Central 100",
      ruta: ["San José", "San José", "Carmen"],
      paisNombre: "Costa Rica",
    });
    expect(q).toBe("Av. Central 100, Carmen, San José, San José, Costa Rica");
    expect(hashDireccion(q as string)).toBe("8915f1ae60fa20ab5c20efb773ffcd6d0bc30b92920f4842adc0264a4f17959c");
  });

  it("sin distrito", () => {
    const q = construirQueryDireccion({
      direccion: "Av. Central 100",
      ruta: ["San José", "San José"],
      paisNombre: "Costa Rica",
    });
    expect(q).toBe("Av. Central 100, San José, San José, Costa Rica");
    expect(hashDireccion(q as string)).toBe("44c83aa6c34eb32400478a225f1343f1814031503fc30ebf3116d9f876d06d83");
  });
});
