import { describe, it, expect } from "vitest";

import {
  GEO_NOMBRE_MAX,
  GEO_NOMBRE_MIN,
  NIVELES_GEOGRAFICOS,
  altaDeNodoSchema,
  cambiarActivacionGeograficaSchema,
  cambiarActivacionNodoSchema,
  crearNodoGeograficoSchema,
  nodoGeograficoSchema,
  nodoPorIdSchema,
  normalizarNombreGeografico,
  padreDeAlta,
  renombrarNodoSchema,
} from "@/lib/types/geografia-nodo";
import { normalizeName } from "@/lib/utils/normalize";

// FICHA 374 (R16/R25) — el nombre que se PERSISTE y el borde que decide que entra.
//
// LA DISTINCION QUE ESTE ARCHIVO EXISTE PARA FIJAR: se GUARDA recortado y con los espacios
// colapsados, pero CON sus mayusculas y CON sus acentos; se COMPARA con `normalizeName`, que
// ademas baja a minusculas y quita acentos. Confundirlas escribiria «san jose» en el catalogo, y
// eso es lo que se lee en toda la app y lo que dice la DTA del IGN.

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
      nivel: "provincia",
      nombre: "  San   José  ",
      paisId: "CR",
    });
    expect(r.success).toBe(true);
    if (!r.success) throw new Error("el schema rechazo un alta valida");
    expect(r.data.nombre).toBe("San José");
  });
});

describe("374/R25 — el borde del alta es una union DISCRIMINADA y estricta", () => {
  it("provincia no exige padre", () => {
    expect(
      crearNodoGeograficoSchema.safeParse({ nivel: "provincia", nombre: "Puntarenas", paisId: "CR" })
        .success,
    ).toBe(true);
  });

  it("SL-20/R29: la provincia exige su pais, en ISO alfa-2", () => {
    expect(crearNodoGeograficoSchema.safeParse({ nivel: "provincia", nombre: "Puntarenas" }).success).toBe(
      false,
    );
    for (const paisId of ["cr", "CRI", "", "C1"]) {
      expect(
        crearNodoGeograficoSchema.safeParse({ nivel: "provincia", nombre: "Puntarenas", paisId }).success,
        paisId,
      ).toBe(false);
    }
    // Canton y distrito heredan el pais del padre: un `paisId` ahi es una clave de mas.
    expect(
      crearNodoGeograficoSchema.safeParse({
        nivel: "canton",
        nombre: "Buenos Aires",
        provinciaId: "p1",
        paisId: "CR",
      }).success,
    ).toBe(false);
  });

  it("SL-20/R29: el codigo es opcional en los tres niveles, se recorta y vacio es «sin codigo»", () => {
    const con = crearNodoGeograficoSchema.safeParse({
      nivel: "distrito",
      nombre: "Cabagra",
      cantonId: "c1",
      codigo: "  60301  ",
    });
    expect(con.success && con.data.codigo).toBe("60301");

    const vacio = crearNodoGeograficoSchema.safeParse({
      nivel: "provincia",
      nombre: "Puntarenas",
      paisId: "CR",
      codigo: "   ",
    });
    expect(vacio.success).toBe(true);
    expect(vacio.success && vacio.data.codigo).toBeUndefined();
  });

  it("canton exige `provinciaId` y distrito exige `cantonId`", () => {
    expect(crearNodoGeograficoSchema.safeParse({ nivel: "canton", nombre: "Buenos Aires" }).success).toBe(
      false,
    );
    expect(crearNodoGeograficoSchema.safeParse({ nivel: "distrito", nombre: "Cabagra" }).success).toBe(
      false,
    );
    expect(
      crearNodoGeograficoSchema.safeParse({
        nivel: "canton",
        nombre: "Buenos Aires",
        provinciaId: "p1",
      }).success,
    ).toBe(true);
    expect(
      crearNodoGeograficoSchema.safeParse({
        nivel: "distrito",
        nombre: "Cabagra",
        cantonId: "c1",
      }).success,
    ).toBe(true);
  });

  it("un `cantonId` en un alta de PROVINCIA es error, no un campo ignorado", () => {
    // Es la mitad que `.strict()` compra: un campo que se descarta en silencio le enseña al
    // usuario que hizo algo que no hizo.
    const r = crearNodoGeograficoSchema.safeParse({
      nivel: "provincia",
      nombre: "Puntarenas",
      paisId: "CR",
      cantonId: "c1",
    });
    expect(r.success).toBe(false);
  });

  it("un nivel desconocido no entra", () => {
    expect(crearNodoGeograficoSchema.safeParse({ nivel: "region", nombre: "Chorotega" }).success).toBe(
      false,
    );
  });

  it("un nombre demasiado corto o demasiado largo no entra", () => {
    const corto = "a".repeat(GEO_NOMBRE_MIN - 1);
    const largo = "a".repeat(GEO_NOMBRE_MAX + 1);
    expect(crearNodoGeograficoSchema.safeParse({ nivel: "provincia", nombre: corto, paisId: "CR" }).success).toBe(
      false,
    );
    expect(crearNodoGeograficoSchema.safeParse({ nivel: "provincia", nombre: largo, paisId: "CR" }).success).toBe(
      false,
    );
    // Y la cota se mide DESPUES de recortar: «  ab  » son dos caracteres, no seis.
    expect(
      crearNodoGeograficoSchema.safeParse({ nivel: "provincia", nombre: "   a   ", paisId: "CR" }).success,
    ).toBe(false);
  });
});

describe("374/R25 — el borde de la activacion y el del conteo", () => {
  it("`activo` es obligatorio y booleano: el estado DESEADO, no un toggle", () => {
    expect(
      cambiarActivacionGeograficaSchema.safeParse({ nivel: "distrito", id: "d1", activo: false })
        .success,
    ).toBe(true);
    expect(
      cambiarActivacionGeograficaSchema.safeParse({ nivel: "distrito", id: "d1" }).success,
    ).toBe(false);
    expect(
      cambiarActivacionGeograficaSchema.safeParse({ nivel: "distrito", id: "d1", activo: "no" })
        .success,
    ).toBe(false);
  });

  it("una clave desconocida se rechaza en los dos schemas", () => {
    expect(
      cambiarActivacionGeograficaSchema.safeParse({
        nivel: "distrito",
        id: "d1",
        activo: true,
        cascada: true,
      }).success,
    ).toBe(false);
    expect(
      nodoGeograficoSchema.safeParse({ nivel: "distrito", id: "d1", activo: true }).success,
    ).toBe(false);
  });

  it("el schema del conteo NO admite `activo`: es solo lectura", () => {
    expect(nodoGeograficoSchema.safeParse({ nivel: "canton", id: "c1" }).success).toBe(true);
  });

  it("un id vacio no entra en ninguno de los dos", () => {
    expect(
      cambiarActivacionGeograficaSchema.safeParse({ nivel: "canton", id: "", activo: true }).success,
    ).toBe(false);
    expect(nodoGeograficoSchema.safeParse({ nivel: "canton", id: "" }).success).toBe(false);
  });
});

describe("374 — el vocabulario del nivel", () => {
  it("son exactamente tres, en orden de jerarquia", () => {
    expect(NIVELES_GEOGRAFICOS).toEqual(["provincia", "canton", "distrito"]);
  });

  it("`padreDeAlta` devuelve el padre de cada nivel y `null` para provincia", () => {
    expect(padreDeAlta({ nivel: "provincia", nombre: "Puntarenas", paisId: "CR" })).toBeNull();
    expect(padreDeAlta({ nivel: "canton", nombre: "Buenos Aires", provinciaId: "p1" })).toBe("p1");
    expect(padreDeAlta({ nivel: "distrito", nombre: "Cabagra", cantonId: "c1" })).toBe("c1");
  });
});

// SLT-46 (design §4.1) — el borde por nodo, a cualquier profundidad. Sin `nivel`: lo dice la base.

describe("SLT-46 R22 — renombre y cambio de estado no aceptan un padre (mover es SLT-48)", () => {
  it("el renombre acepta `{id, nombre}` y rechaza un `padreId`", () => {
    expect(renombrarNodoSchema.safeParse({ id: "n1", nombre: "Barrio Amón" }).success).toBe(true);
    expect(renombrarNodoSchema.safeParse({ id: "n1", nombre: "Barrio Amón", padreId: "n0" }).success).toBe(
      false,
    );
  });

  it("el cambio de estado acepta `{id, activo}` y rechaza un `padreId`", () => {
    expect(cambiarActivacionNodoSchema.safeParse({ id: "n1", activo: false }).success).toBe(true);
    expect(cambiarActivacionNodoSchema.safeParse({ id: "n1", activo: false, padreId: "n0" }).success).toBe(
      false,
    );
  });

  it("ninguno de los dos acepta ya `nivel`: la profundidad no viaja en la entrada", () => {
    expect(renombrarNodoSchema.safeParse({ id: "n1", nombre: "Carmen", nivel: "distrito" }).success).toBe(false);
    expect(cambiarActivacionNodoSchema.safeParse({ id: "n1", activo: true, nivel: "distrito" }).success).toBe(
      false,
    );
    expect(nodoPorIdSchema.safeParse({ id: "n1", nivel: "distrito" }).success).toBe(false);
  });

  it("el renombre aplica el mismo contrato de nombre que el alta y un id vacio no entra", () => {
    expect(renombrarNodoSchema.parse({ id: "n1", nombre: "  San   José " }).nombre).toBe("San José");
    expect(renombrarNodoSchema.safeParse({ id: "n1", nombre: "a" }).success).toBe(false);
    expect(renombrarNodoSchema.safeParse({ id: "", nombre: "Carmen" }).success).toBe(false);
    expect(nodoPorIdSchema.safeParse({ id: "" }).success).toBe(false);
    expect(nodoPorIdSchema.safeParse({ id: "n1" }).success).toBe(true);
  });
});

describe("SLT-46 R14/R16 — el alta es raiz de un pais o hijo de un nodo, sin elegir tipo", () => {
  it("acepta la raiz por `paisId` y el hijo por `padreId`, con codigo opcional recortado", () => {
    expect(altaDeNodoSchema.safeParse({ paisId: "CR", nombre: "Puntarenas" }).success).toBe(true);
    const hijo = altaDeNodoSchema.parse({ padreId: "n9", nombre: "Barrio Uno", codigo: "  B-1 " });
    expect(hijo).toEqual({ padreId: "n9", nombre: "Barrio Uno", codigo: "B-1" });
  });

  it("rechaza las dos claves a la vez, ninguna, un `tipoId` o un `nivel`", () => {
    expect(altaDeNodoSchema.safeParse({ paisId: "CR", padreId: "n9", nombre: "Uno" }).success).toBe(false);
    expect(altaDeNodoSchema.safeParse({ nombre: "Uno" }).success).toBe(false);
    expect(altaDeNodoSchema.safeParse({ padreId: "n9", nombre: "Uno", tipoId: "t4" }).success).toBe(false);
    expect(altaDeNodoSchema.safeParse({ padreId: "n9", nombre: "Uno", nivel: "canton" }).success).toBe(false);
  });

  it("el pais de una raiz es un codigo ISO alfa-2", () => {
    expect(altaDeNodoSchema.safeParse({ paisId: "cr", nombre: "Puntarenas" }).success).toBe(false);
  });
});
