import { describe, expect, it } from "vitest";

import {
  MODELO_NEGOCIO_NULABLE,
  MODELOS_DE_NEGOCIO,
  MODELOS_DE_PLATAFORMA,
  MODELOS_DIFERIDOS,
  type ModeloClasificado,
} from "@/lib/db/modelos-de-negocio";

import { leer } from "./_aislamiento-por-empresa";

/**
 * SL-17 · R2, R4, R5, R23 — GUARDIA: CADA MODELO DEL ESQUEMA ESTÁ CLASIFICADO Y LLEVA (O NO)
 * `organizacion_id` SEGÚN SU CLASE.
 *
 * `lib/db/modelos-de-negocio.ts` es la única lista que leen la extensión, la RLS y las demás
 * guardias. Si un modelo nuevo no entra en ella, la extensión no lo filtra y nadie se entera
 * (R5). Si un modelo de negocio pierde la columna o el índice, el filtro deja de servir (R2).
 * Si uno de plataforma la gana, se está aislando algo que es de todos (R4).
 *
 * `Organizacion` es la raíz: la tabla de las empresas. No es negocio, plataforma ni diferida;
 * por eso queda fuera de la suma (88 clasificados + la raíz = modelos del esquema).
 */

const MODELO_RAIZ = "Organizacion";

type ModeloDelEsquema = { modelo: string; tabla: string; cuerpo: string };

function modelosDelEsquema(esquema: string): ModeloDelEsquema[] {
  const salida: ModeloDelEsquema[] = [];
  for (const m of esquema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, modelo, cuerpo] = m;
    const map = /@@map\(\s*"([^"]+)"\s*\)/.exec(cuerpo);
    salida.push({ modelo, tabla: map ? map[1] : modelo, cuerpo });
  }
  return salida;
}

type Clasificacion = {
  negocio: readonly ModeloClasificado[];
  plataforma: readonly ModeloClasificado[];
  diferidos: readonly ModeloClasificado[];
  nulable: string;
};

/** Lo que incumple R2, R4, R5 y R23. Vacío = el esquema y la clasificación cuadran. */
function problemasDeClasificacion(esquema: string, c: Clasificacion): string[] {
  const problemas: string[] = [];
  const modelos = modelosDelEsquema(esquema);
  const porNombre = new Map(modelos.map((m) => [m.modelo, m]));
  const clasificados = [...c.negocio, ...c.plataforma, ...c.diferidos];

  const vistos = new Set<string>();
  for (const e of clasificados) {
    if (vistos.has(e.modelo)) problemas.push(`${e.modelo}: clasificado dos veces`);
    vistos.add(e.modelo);
    const real = porNombre.get(e.modelo);
    if (!real) {
      problemas.push(`${e.modelo}: clasificado pero no existe en el esquema`);
    } else if (real.tabla !== e.tabla) {
      problemas.push(`${e.modelo}: la lista dice tabla «${e.tabla}» y el @@map es «${real.tabla}»`);
    }
  }
  for (const m of modelos) {
    if (m.modelo !== MODELO_RAIZ && !vistos.has(m.modelo)) {
      problemas.push(`${m.modelo}: sin clasificar en lib/db/modelos-de-negocio.ts (R5)`);
    }
  }
  const sinRaiz = modelos.filter((m) => m.modelo !== MODELO_RAIZ).length;
  if (clasificados.length !== sinRaiz) {
    problemas.push(
      `negocio + plataforma + diferidos = ${clasificados.length}, el esquema tiene ${sinRaiz} (sin ${MODELO_RAIZ})`,
    );
  }

  for (const e of c.negocio) {
    const real = porNombre.get(e.modelo);
    if (!real) continue;
    const campo = /^\s*organizacionId\s+String(\?)?\s[^\n]*@map\(\s*"organizacion_id"\s*\)/m.exec(
      real.cuerpo,
    );
    if (!campo) {
      problemas.push(`${e.modelo}: sin \`organizacionId … @map("organizacion_id")\` (R2)`);
    } else {
      const opcional = campo[1] === "?";
      if (e.modelo === c.nulable && !opcional) {
        problemas.push(`${e.modelo}: debe ser la única con organizacionId opcional (R3)`);
      }
      if (e.modelo !== c.nulable && opcional) {
        problemas.push(`${e.modelo}: organizacionId opcional; solo ${c.nulable} puede serlo`);
      }
    }
    if (!/@@index\(\s*\[\s*organizacionId\b/.test(real.cuerpo)) {
      problemas.push(`${e.modelo}: sin \`@@index([organizacionId…])\` (R2)`);
    }
  }

  for (const e of c.plataforma) {
    const real = porNombre.get(e.modelo);
    if (!real) continue;
    if (/^\s*organizacionId\b/m.test(real.cuerpo) || /"organizacion_id"/.test(real.cuerpo)) {
      problemas.push(`${e.modelo}: es de plataforma y tiene organizacion_id (R4)`);
    }
  }
  return problemas;
}

const CLASIFICACION_REAL: Clasificacion = {
  negocio: MODELOS_DE_NEGOCIO,
  plataforma: MODELOS_DE_PLATAFORMA,
  diferidos: MODELOS_DIFERIDOS,
  nulable: MODELO_NEGOCIO_NULABLE,
};

describe("SL-17 · organizacion_id en los modelos (R2, R4, R5, R23)", () => {
  const esquema = leer("db/schema.prisma");

  it("control positivo: el esquema se lee entero y la raíz existe", () => {
    const modelos = modelosDelEsquema(esquema);
    // Si el parser dejara de ver modelos, todas las comprobaciones de abajo pasarían en vacío.
    expect(modelos.length).toBeGreaterThanOrEqual(89);
    expect(modelos.some((m) => m.modelo === MODELO_RAIZ)).toBe(true);
    expect(MODELOS_DE_NEGOCIO.length + MODELOS_DE_PLATAFORMA.length + MODELOS_DIFERIDOS.length).toBe(
      modelos.length - 1,
    );
  });

  it("el esquema real cumple la clasificación", () => {
    expect(problemasDeClasificacion(esquema, CLASIFICACION_REAL)).toEqual([]);
  });

  it("autocomprobación sobre el esquema real: sin el índice de Orden, falla nombrándola", () => {
    const orden = modelosDelEsquema(esquema).find((m) => m.modelo === "Orden")!;
    const sinIndice = orden.cuerpo.replace(/^\s*@@index\(\s*\[\s*organizacionId\b[^\n]*\n/m, "");
    expect(sinIndice).not.toBe(orden.cuerpo);
    const mutado = esquema.replace(orden.cuerpo, sinIndice);
    expect(problemasDeClasificacion(mutado, CLASIFICACION_REAL)).toEqual([
      expect.stringMatching(/^Orden: sin `@@index/),
    ]);
  });

  describe("autocomprobación con un esquema inventado", () => {
    const negocio = [
      { modelo: "Usuario", tabla: "usuario" },
      { modelo: "Orden", tabla: "orden" },
    ];
    const plataforma = [{ modelo: "Rol", tabla: "rol" }];
    const base = (cuerpoOrden: string, extra = "", cuerpoRol = "id Int @id") => `
model Organizacion {
  id String @id
}
model Usuario {
  id String @id
  organizacionId String? @default(dbgenerated()) @map("organizacion_id")
  @@index([organizacionId])
  @@map("usuario")
}
model Orden {
${cuerpoOrden}
}
model Rol {
  ${cuerpoRol}
  @@map("rol")
}
${extra}`;
    const ordenBien = `  id String @id
  organizacionId String @default(dbgenerated()) @map("organizacion_id")
  @@index([organizacionId, id])
  @@map("orden")`;
    const c: Clasificacion = { negocio, plataforma, diferidos: [], nulable: "Usuario" };

    it("el esquema inventado correcto no da problemas (si diera, los casos rojos no valdrían)", () => {
      expect(problemasDeClasificacion(base(ordenBien), c)).toEqual([]);
    });

    it("un modelo nuevo sin clasificar falla (R5)", () => {
      const p = problemasDeClasificacion(base(ordenBien, "model Nuevo {\n  id Int @id\n}"), c);
      expect(p.join("\n")).toMatch(/Nuevo: sin clasificar/);
    });

    it("un modelo de negocio sin la columna falla (R2, R23)", () => {
      const p = problemasDeClasificacion(base(`  id String @id\n  @@map("orden")`), c);
      expect(p.join("\n")).toMatch(/Orden: sin `organizacionId/);
      expect(p.join("\n")).toMatch(/Orden: sin `@@index/);
    });

    it("un modelo de negocio sin el índice falla (R2)", () => {
      const p = problemasDeClasificacion(base(ordenBien.replace(/@@index[^\n]*\n/, "")), c);
      expect(p).toEqual([expect.stringMatching(/Orden: sin `@@index/)]);
    });

    it("una columna opcional fuera de Usuario falla", () => {
      const p = problemasDeClasificacion(base(ordenBien.replace("String @default", "String? @default")), c);
      expect(p).toEqual([expect.stringMatching(/Orden: organizacionId opcional/)]);
    });

    it("un modelo de plataforma con la columna falla (R4)", () => {
      const p = problemasDeClasificacion(
        base(ordenBien, "", 'id Int @id\n  organizacionId String @map("organizacion_id")'),
        c,
      );
      expect(p).toEqual([expect.stringMatching(/Rol: es de plataforma/)]);
    });

    it("una tabla que no coincide con el @@map falla", () => {
      const p = problemasDeClasificacion(base(ordenBien.replace('"orden"', '"ordenes"')), c);
      expect(p).toEqual([expect.stringMatching(/Orden: la lista dice tabla «orden»/)]);
    });
  });
});
