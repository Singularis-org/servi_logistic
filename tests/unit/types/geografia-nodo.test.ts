import { describe, it, expect } from "vitest";

import {
  GEO_NOMBRE_MAX,
  GEO_NOMBRE_MIN,
  NIVELES_GEOGRAFICOS,
  cambiarActivacionGeograficaSchema,
  crearNodoGeograficoSchema,
  nodoGeograficoSchema,
  normalizarNombreGeografico,
  renombrarNodoGeograficoSchema,
  CAMPO_DE_FORMATO,
  DESTINO_SIN_DECIDIR,
  mensajeDeFormatoNoValido,
} from "@/lib/types/geografia-nodo";
import { normalizeName } from "@/lib/utils/normalize";

// FICHA 374 (R16/R25) — el nombre que se PERSISTE y el borde que decide que entra.
//
// LA DISTINCION QUE ESTE ARCHIVO EXISTE PARA FIJAR: se GUARDA recortado y con los espacios
// colapsados, pero CON sus mayusculas y CON sus acentos; se COMPARA con `normalizeName`, que
// ademas baja a minusculas y quita acentos. Confundirlas escribiria «san jose» en el catalogo, y
// eso es lo que se lee en toda la app y lo que dice la DTA del IGN.
//
// SLT-46 (T4.4, design §4.1): un esquema por operacion. Los casos de SL-20 que miraban el alta
// discriminada por `nivel` (provincia/canton/distrito con `provinciaId`/`cantonId`) se conservan
// pasados a la forma por nodo (`paisId` de la raiz o `padreId` del hijo), con el mismo desenlace.

describe("374/R16 — el nombre se persiste recortado y colapsado, sin tocar mayusculas ni acentos", () => {
  it("«  San   José  » se guarda como «San José»", () => {
    // Literal, y el literal ES el contrato: es lo que va a la columna.
    expect(normalizarNombreGeografico("  San   José  ")).toBe("San José");
  });

  it("respeta mayusculas y acentos: no baja a minusculas ni pliega diacriticos", () => {
    expect(normalizarNombreGeografico("PÉREZ ZELEDÓN")).toBe("PÉREZ ZELEDÓN");
    expect(normalizarNombreGeografico("Cañas")).toBe("Cañas");
  });

  it("colapsa tabuladores y saltos, no solo espacios", () => {
    expect(normalizarNombreGeografico("San\t\tJosé\n de la Montaña")).toBe(
      "San José de la Montaña",
    );
  });

  it("⚠️ NO es `normalizeName`: guardar y comparar son cosas distintas", () => {
    // Si alguien «unificara» las dos funciones, el catalogo se llenaria de nombres en minusculas
    // y sin acentos. Este caso es el que lo impide.
    expect(normalizarNombreGeografico("San José")).not.toBe(normalizeName("San José"));
    expect(normalizeName("San José")).toBe("san jose");
  });

  it("el schema del alta persiste la forma normalizada, no la cruda", () => {
    const r = crearNodoGeograficoSchema.safeParse({
      nombre: "  San   José  ",
      paisId: "CR",
    });
    expect(r.success).toBe(true);
    if (!r.success) throw new Error("el schema rechazo un alta valida");
    expect(r.data.nombre).toBe("San José");
  });
});

describe("374/R25 — el borde del alta es estricto (SLT-46: raiz de un pais o hijo de un nodo)", () => {
  it("la raiz no exige padre", () => {
    expect(crearNodoGeograficoSchema.safeParse({ nombre: "Puntarenas", paisId: "CR" }).success).toBe(true);
  });

  it("SL-20/R29: la raiz exige su pais, en ISO alfa-2", () => {
    expect(crearNodoGeograficoSchema.safeParse({ nombre: "Puntarenas" }).success).toBe(false);
    for (const paisId of ["cr", "CRI", "", "C1"]) {
      expect(crearNodoGeograficoSchema.safeParse({ nombre: "Puntarenas", paisId }).success, paisId).toBe(false);
    }
    // El hijo hereda el pais del padre: un `paisId` ahi es una clave de mas.
    expect(
      crearNodoGeograficoSchema.safeParse({
        nombre: "Buenos Aires",
        padreId: "p1",
        paisId: "CR",
      }).success,
    ).toBe(false);
  });

  it("SL-20/R29: el codigo es opcional en la raiz y en el hijo, se recorta y vacio es «sin codigo»", () => {
    const con = crearNodoGeograficoSchema.safeParse({
      nombre: "Cabagra",
      padreId: "c1",
      codigo: "  60301  ",
    });
    expect(con.success && con.data.codigo).toBe("60301");

    const vacio = crearNodoGeograficoSchema.safeParse({
      nombre: "Puntarenas",
      paisId: "CR",
      codigo: "   ",
    });
    expect(vacio.success).toBe(true);
    expect(vacio.success && vacio.data.codigo).toBeUndefined();
  });

  it("el hijo exige su `padreId`", () => {
    expect(crearNodoGeograficoSchema.safeParse({ nombre: "Buenos Aires" }).success).toBe(false);
    expect(crearNodoGeograficoSchema.safeParse({ nombre: "Buenos Aires", padreId: "p1" }).success).toBe(true);
    expect(crearNodoGeograficoSchema.safeParse({ nombre: "Cabagra", padreId: "c1" }).success).toBe(true);
  });

  it("un `cantonId` en un alta de raiz es error, no un campo ignorado", () => {
    // Es la mitad que `.strict()` compra: un campo que se descarta en silencio le enseña al
    // usuario que hizo algo que no hizo.
    const r = crearNodoGeograficoSchema.safeParse({
      nombre: "Puntarenas",
      paisId: "CR",
      cantonId: "c1",
    });
    expect(r.success).toBe(false);
  });

  it("un nombre demasiado corto o demasiado largo no entra", () => {
    const corto = "a".repeat(GEO_NOMBRE_MIN - 1);
    const largo = "a".repeat(GEO_NOMBRE_MAX + 1);
    expect(crearNodoGeograficoSchema.safeParse({ nombre: corto, paisId: "CR" }).success).toBe(false);
    expect(crearNodoGeograficoSchema.safeParse({ nombre: largo, paisId: "CR" }).success).toBe(false);
    // Y la cota se mide DESPUES de recortar: «  ab  » son dos caracteres, no seis.
    expect(crearNodoGeograficoSchema.safeParse({ nombre: "   a   ", paisId: "CR" }).success).toBe(false);
  });
});

describe("374/R25 — el borde de la activacion y el del conteo", () => {
  it("`activo` es obligatorio y booleano: el estado DESEADO, no un toggle", () => {
    expect(cambiarActivacionGeograficaSchema.safeParse({ id: "d1", activo: false }).success).toBe(true);
    expect(cambiarActivacionGeograficaSchema.safeParse({ id: "d1" }).success).toBe(false);
    expect(cambiarActivacionGeograficaSchema.safeParse({ id: "d1", activo: "no" }).success).toBe(false);
  });

  it("una clave desconocida se rechaza en los dos schemas", () => {
    expect(
      cambiarActivacionGeograficaSchema.safeParse({
        id: "d1",
        activo: true,
        cascada: true,
      }).success,
    ).toBe(false);
    expect(nodoGeograficoSchema.safeParse({ id: "d1", activo: true }).success).toBe(false);
  });

  it("el schema del conteo NO admite `activo`: es solo lectura", () => {
    expect(nodoGeograficoSchema.safeParse({ id: "c1" }).success).toBe(true);
  });

  it("un id vacio no entra en ninguno de los dos", () => {
    expect(cambiarActivacionGeograficaSchema.safeParse({ id: "", activo: true }).success).toBe(false);
    expect(nodoGeograficoSchema.safeParse({ id: "" }).success).toBe(false);
  });
});

describe("374 — el vocabulario del nivel", () => {
  it("son exactamente tres, en orden de jerarquia", () => {
    expect(NIVELES_GEOGRAFICOS).toEqual(["provincia", "canton", "distrito"]);
  });
});

// SLT-46 (design §4.1) — el borde por nodo, a cualquier profundidad. Sin `nivel`: lo dice la base.

describe("SLT-46 R22 — renombre y cambio de estado no aceptan un padre (mover es SLT-48)", () => {
  // SLT-46 (2026-11-09, §4.1): el renombre lleva `nombreAnterior` (obligatorio); aquí siempre válido.
  it("el renombre acepta `{id, nombre}` y rechaza un `padreId`", () => {
    expect(renombrarNodoGeograficoSchema.safeParse({ id: "n1", nombreAnterior: "Antes", nombre: "Barrio Amón" }).success).toBe(true);
    expect(renombrarNodoGeograficoSchema.safeParse({ id: "n1", nombreAnterior: "Antes", nombre: "Barrio Amón", padreId: "n0" }).success).toBe(
      false,
    );
  });

  it("el cambio de estado acepta `{id, activo}` y rechaza un `padreId`", () => {
    expect(cambiarActivacionGeograficaSchema.safeParse({ id: "n1", activo: false }).success).toBe(true);
    expect(cambiarActivacionGeograficaSchema.safeParse({ id: "n1", activo: false, padreId: "n0" }).success).toBe(
      false,
    );
  });

  it("ninguno de los dos acepta ya `nivel`: la profundidad no viaja en la entrada", () => {
    expect(renombrarNodoGeograficoSchema.safeParse({ id: "n1", nombreAnterior: "Antes", nombre: "Carmen", nivel: "distrito" }).success).toBe(false);
    expect(cambiarActivacionGeograficaSchema.safeParse({ id: "n1", activo: true, nivel: "distrito" }).success).toBe(
      false,
    );
    expect(nodoGeograficoSchema.safeParse({ id: "n1", nivel: "distrito" }).success).toBe(false);
  });

  it("el renombre aplica el mismo contrato de nombre que el alta y un id vacio no entra", () => {
    expect(renombrarNodoGeograficoSchema.parse({ id: "n1", nombreAnterior: "Antes", nombre: "  San   José " }).nombre).toBe("San José");
    expect(renombrarNodoGeograficoSchema.safeParse({ id: "n1", nombreAnterior: "Antes", nombre: "a" }).success).toBe(false);
    expect(renombrarNodoGeograficoSchema.safeParse({ id: "", nombreAnterior: "Antes", nombre: "Carmen" }).success).toBe(false);
    expect(nodoGeograficoSchema.safeParse({ id: "" }).success).toBe(false);
    expect(nodoGeograficoSchema.safeParse({ id: "n1" }).success).toBe(true);
  });
});

describe("SLT-46 R14/R16 — el alta es raiz de un pais o hijo de un nodo, sin elegir tipo", () => {
  it("acepta la raiz por `paisId` y el hijo por `padreId`, con codigo opcional recortado", () => {
    expect(crearNodoGeograficoSchema.safeParse({ paisId: "CR", nombre: "Puntarenas" }).success).toBe(true);
    const hijo = crearNodoGeograficoSchema.parse({ padreId: "n9", nombre: "Barrio Uno", codigo: "  B-1 " });
    expect(hijo).toEqual({ padreId: "n9", nombre: "Barrio Uno", codigo: "B-1" });
  });

  it("rechaza las dos claves a la vez, ninguna, un `tipoId` o un `nivel`", () => {
    expect(crearNodoGeograficoSchema.safeParse({ paisId: "CR", padreId: "n9", nombre: "Uno" }).success).toBe(false);
    expect(crearNodoGeograficoSchema.safeParse({ nombre: "Uno" }).success).toBe(false);
    expect(crearNodoGeograficoSchema.safeParse({ padreId: "n9", nombre: "Uno", tipoId: "t4" }).success).toBe(false);
    expect(crearNodoGeograficoSchema.safeParse({ padreId: "n9", nombre: "Uno", nivel: "canton" }).success).toBe(false);
  });

  it("el pais de una raiz es un codigo ISO alfa-2", () => {
    expect(crearNodoGeograficoSchema.safeParse({ paisId: "cr", nombre: "Puntarenas" }).success).toBe(false);
  });
});

// SLT-46 (2026-11-09, design §4.1, §4.7) — el «antes» del renombre (R61) y los errores del alta
// (decisión del humano: sin `nombre` → `fieldErrors.nombre`; forma vieja → formato no válido).

describe("R61 — el renombre lleva `nombreAnterior`, obligatorio", () => {
  it("sin `nombreAnterior`, o vacío, no entra; con él, entra tal cual (no se normaliza: es el de la base)", () => {
    const sin = renombrarNodoGeograficoSchema.safeParse({ id: "n1", nombre: "Carmen" });
    expect(sin.success).toBe(false);
    if (!sin.success) expect(Object.keys(sin.error.flatten().fieldErrors)).toEqual(["nombreAnterior"]);
    expect(renombrarNodoGeograficoSchema.safeParse({ id: "n1", nombre: "Carmen", nombreAnterior: "" }).success).toBe(false);
    expect(renombrarNodoGeograficoSchema.parse({ id: "n1", nombre: "Carmen", nombreAnterior: "El  Carmen" })).toEqual({
      id: "n1",
      nombre: "Carmen",
      nombreAnterior: "El  Carmen",
    });
  });
});

describe("Decisión 2026-11-09 — los errores del alta de un nodo van a su campo, no a `entrada`", () => {
  const errores = (entrada: unknown) => {
    const r = crearNodoGeograficoSchema.safeParse(entrada);
    if (r.success) throw new Error("se esperaba un rechazo");
    // `formato` no es una clave de la entrada (la añade el refinamiento): el tipo de zod no la conoce.
    return r.error.flatten() as { formErrors: string[]; fieldErrors: Record<string, string[] | undefined> };
  };

  it("sin `nombre`, el error va en `fieldErrors.nombre` (raíz y hijo), sin `formErrors`", () => {
    for (const entrada of [{ paisId: "CR" }, { padreId: "n1" }]) {
      const e = errores(entrada);
      expect(Object.keys(e.fieldErrors)).toEqual(["nombre"]);
      expect(e.formErrors).toEqual([]);
    }
  });

  it("un nombre de un carácter y un país mal escrito dan su error en su campo", () => {
    expect(Object.keys(errores({ paisId: "CR", nombre: "a" }).fieldErrors)).toEqual(["nombre"]);
    expect(Object.keys(errores({ paisId: "cr", nombre: "Puntarenas" }).fieldErrors)).toEqual(["paisId"]);
  });

  it("la forma vieja (`nivel` + `provinciaId`) da «Formato no válido» en `fieldErrors.formato`, nombrando los campos", () => {
    const e = errores({ nivel: "canton", provinciaId: "p1", nombre: "Buenos Aires" });
    expect(Object.keys(e.fieldErrors)).toEqual([CAMPO_DE_FORMATO]);
    expect(e.fieldErrors[CAMPO_DE_FORMATO]).toEqual([mensajeDeFormatoNoValido(["nivel", "provinciaId"])]);
    expect(mensajeDeFormatoNoValido(["nivel", "provinciaId"])).toMatch(
      /^Formato no válido: no se admiten los campos nivel, provinciaId\./,
    );
    expect(e.formErrors).toEqual([]);
  });

  it("la forma vieja sin nombre dice las dos cosas: el nombre y el formato", () => {
    const e = errores({ nivel: "distrito", cantonId: "c1" });
    expect(Object.keys(e.fieldErrors).sort()).toEqual([CAMPO_DE_FORMATO, "nombre"]);
  });

  it("país y padre a la vez, o ninguno de los dos, es formato no válido con su mensaje", () => {
    expect(errores({ paisId: "CR", padreId: "n1", nombre: "Puntarenas" }).fieldErrors[CAMPO_DE_FORMATO]).toEqual([
      DESTINO_SIN_DECIDIR,
    ]);
    expect(errores({ nombre: "Puntarenas" }).fieldErrors[CAMPO_DE_FORMATO]).toEqual([DESTINO_SIN_DECIDIR]);
  });

  it("CONTRAPRUEBA: la forma de hoy entra y la raíz sale sin la clave del hijo (y al revés)", () => {
    expect(crearNodoGeograficoSchema.parse({ paisId: "CR", nombre: " Puntarenas " })).toEqual({
      paisId: "CR",
      nombre: "Puntarenas",
    });
    expect("padreId" in crearNodoGeograficoSchema.parse({ paisId: "CR", nombre: "Puntarenas" })).toBe(false);
    expect("paisId" in crearNodoGeograficoSchema.parse({ padreId: "n1", nombre: "Cabagra" })).toBe(false);
  });
});
