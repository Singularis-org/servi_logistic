import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { codigoSinComentarios } from "../../fixtures/sin-comentarios";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// FICHA 374 / G1 (R5) — SIN BORRADO FISICO EN EL CATALOGO GEOGRAFICO.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// QUE PROTEGE, Y POR QUE NO BASTA CON QUE HOY NO EXISTA. Quitar un nodo del catalogo es
// DESACTIVARLO. Un `delete` sobre `provincia`, `canton` o `distrito` es irreversible y arrastra
// consecuencias que no se ven al escribirlo:
//
//   - `orden` lleva su terna geografica CONGELADA (`provincia_id`, `canton_id`, `distrito_id`), y
//     los tres son FK. Un borrado deja ordenes historicas apuntando a la nada — o, con un
//     `ON DELETE SET NULL`, vacia `distrito_id` en silencio;
//   - `zona_distrito` va en CASCADE, asi que borrar un distrito borra ademas su cobertura sin que
//     nadie lo pida;
//   - y no hay a quien preguntar despues: la fila es el unico sitio donde estaba el nombre.
//
// El humano lo fijo como frontera el 2026-09-05: «quitar es desactivar, nunca borrado fisico».
//
// COMO SE MIDE. Barrido ESTATICO sobre `lib/`, con el quitador de comentarios del repo —la prosa
// de este arbol NOMBRA a proposito lo que el codigo tiene prohibido, y sin quitarla la guardia
// denunciaria la explicacion—. Con CONTRAPRUEBA sobre un cuerpo MUTADO EN MEMORIA: si al detector
// se le quita la proteccion, tiene que FALLAR. Una guardia estatica rota no falla, CALLA.
//
// SLT-46 (R42, R50; design §9) — LA FRONTERA SE AMPLIA AL MODELO JERARQUICO. Desde SLT-46 la app
// escribe `nodo_geografico` y `tipo_nivel_geografico`, y tampoco se borran: retirar un nodo es
// `activo = false` (R19) y un pais no pierde niveles (R50; quitar un tipo dejaria nodos sin tipo). El
// detector suma esos dos delegados y los `DELETE FROM` SQL sobre las cinco tablas, y el barrido suma
// `app/` y `components/` (R42 los nombra).
//
// La selecciona `pnpm exec vitest run guard` por el nombre del archivo.

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOL = path.join(RAIZ, "lib");
/** SLT-46 (R42): los otros dos arboles de la app. */
const OTROS_ARBOLES = [path.join(RAIZ, "app"), path.join(RAIZ, "components")];

/**
 * EL DETECTOR, en una sola funcion, para que la contraprueba pueda ejercerlo sobre texto en
 * memoria y no solo sobre el arbol real.
 *
 * Busca `<lo que sea>.provincia|canton|distrito|nodoGeografico|tipoNivelGeografico.delete(` y
 * `.deleteMany(`, y (SLT-46) `DELETE FROM` SQL sobre sus cinco tablas.
 *
 * ⚠️ EL `(?<![A-Za-z])` NO ES DECORATIVO: sin el, `zonaDistrito.deleteMany(` —que es LEGITIMO y lo
 * hace `ZonaRepository.update` al reemplazar la puente— casaria con `distrito` y esta guardia
 * gritaria en falso. Se acota a minusculas porque los delegados de Prisma para estas tres tablas
 * se llaman exactamente asi. En el SQL, el `(?!_)` deja fuera `distrito_zona_especial`.
 */
export function borradosFisicosEn(codigo: string): string[] {
  const prisma =
    /(?<![A-Za-z])(provincia|canton|distrito|nodoGeografico|tipoNivelGeografico)\s*\??\.\s*(delete|deleteMany)\s*\(/g;
  const sql =
    /\bDELETE\s+FROM\s+(?:"?public"?\.)?"?(provincia|canton|distrito|nodo_geografico|tipo_nivel_geografico)\b(?!_)/gi;
  return [
    ...[...codigo.matchAll(prisma)].map((m) => `${m[1]}.${m[2]}`),
    ...[...codigo.matchAll(sql)].map((m) => `DELETE FROM ${m[1].toLowerCase()}`),
  ];
}

/** Todos los `.ts`/`.tsx` bajo `dir`, recursivo. */
function fuentes(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const completo = path.join(dir, entrada);
    if (statSync(completo).isDirectory()) fuentes(completo, acc);
    else if (/\.tsx?$/.test(entrada)) acc.push(completo);
  }
  return acc;
}

function relativo(archivo: string): string {
  return path.relative(RAIZ, archivo).split(path.sep).join("/");
}

// ---------------------------------------------------------------------------------------------
// 0 — El detector, probado contra respuestas conocidas EN LAS DOS DIRECCIONES
// ---------------------------------------------------------------------------------------------

describe("374/G1 — el detector se prueba a si mismo", () => {
  const CUERPO_SANO = `
    async cambiarActivacion(nivel, id, activo) {
      return this.prisma.$transaction(async (tx) => {
        await tx.distrito.update({ where: { id }, data: { activo } });
        await tx.zonaDistrito.deleteMany({ where: { zonaId: "z" } });
        return "cambiado";
      });
    }`;

  it("CONTRAPRUEBA (control positivo): un cuerpo correcto NO produce hallazgos", () => {
    // Sin esto, todos los `toEqual([])` de abajo podrian estar pasando porque el detector no sabe
    // encontrar nada.
    expect(borradosFisicosEn(CUERPO_SANO)).toEqual([]);
  });

  it("CONTRAPRUEBA (1/3): un `delete` de distrito SE DETECTA", () => {
    const mutado = CUERPO_SANO.replace(
      "await tx.distrito.update({ where: { id }, data: { activo } });",
      "await tx.distrito.delete({ where: { id } });",
    );
    expect(borradosFisicosEn(mutado)).toEqual(["distrito.delete"]);
  });

  it("CONTRAPRUEBA (2/3): un `deleteMany` de provincia o de canton SE DETECTA", () => {
    expect(borradosFisicosEn(`await prisma.provincia.deleteMany({ where: {} });`)).toEqual([
      "provincia.deleteMany",
    ]);
    expect(borradosFisicosEn(`await tx.canton.delete({ where: { id } });`)).toEqual([
      "canton.delete",
    ]);
  });

  it("CONTRAPRUEBA (3/3): `zonaDistrito.deleteMany` NO se denuncia (es legitimo)", () => {
    // `ZonaRepository.update` reemplaza la puente entera al guardar una zona. Si esta guardia lo
    // denunciara, gritaria en falso todos los dias y se acabaria ignorando.
    expect(borradosFisicosEn(`await tx.zonaDistrito.deleteMany({ where: { zonaId } });`)).toEqual(
      [],
    );
  });

  it("tolera espacios y saltos de linea entre el delegado y el metodo", () => {
    expect(borradosFisicosEn("prisma.distrito\n  .deleteMany({})")).toEqual([
      "distrito.deleteMany",
    ]);
  });

  it("SLT-46 CONTRAPRUEBA: un `delete`/`deleteMany` del nodo o de un tipo SE DETECTA", () => {
    const mutado = CUERPO_SANO.replace(
      "await tx.distrito.update({ where: { id }, data: { activo } });",
      "await tx.nodoGeografico.delete({ where: { id } });",
    );
    expect(borradosFisicosEn(mutado)).toEqual(["nodoGeografico.delete"]);
    expect(borradosFisicosEn(`await tx.nodoGeografico?.deleteMany({ where: { paisId } });`)).toEqual([
      "nodoGeografico.deleteMany",
    ]);
    expect(borradosFisicosEn(`await tx.tipoNivelGeografico.deleteMany({ where: { paisId } });`)).toEqual([
      "tipoNivelGeografico.deleteMany",
    ]);
    expect(borradosFisicosEn(`await prisma.tipoNivelGeografico.delete({ where: { id } });`)).toEqual([
      "tipoNivelGeografico.delete",
    ]);
  });

  it("SLT-46 CONTRAPRUEBA: un `DELETE FROM` SQL sobre las cinco tablas SE DETECTA", () => {
    expect(
      borradosFisicosEn(
        [
          'await tx.$executeRaw`DELETE FROM "nodo_geografico" WHERE id = ${id}`;',
          "await tx.$executeRawUnsafe('delete from tipo_nivel_geografico where pais_id = $1', p);",
          'await tx.$executeRaw`DELETE FROM public."distrito" WHERE id = ${id}`;',
          'await tx.$executeRaw`delete from "public"."canton"`;',
          "await tx.$executeRaw`DELETE   FROM provincia`;",
        ].join("\n"),
      ),
    ).toEqual([
      "DELETE FROM nodo_geografico",
      "DELETE FROM tipo_nivel_geografico",
      "DELETE FROM distrito",
      "DELETE FROM canton",
      "DELETE FROM provincia",
    ]);
  });

  it("SLT-46: ni las lecturas del nodo, ni otra tabla con prefijo, ni el retiro se denuncian", () => {
    expect(
      borradosFisicosEn(
        [
          "await tx.nodoGeografico.findMany({ where: { paisId } });",
          "await tx.nodoGeografico.update({ where: { id }, data: { activo } });",
          'await tx.$executeRaw`DELETE FROM "distrito_zona_especial" WHERE id = ${id}`;',
          'await tx.$executeRaw`SELECT * FROM "nodo_geografico"`;',
        ].join("\n"),
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// 1 — Anti-vacuidad: el barrido lee de verdad
// ---------------------------------------------------------------------------------------------

describe("374/G1 — el barrido no esta vacio", () => {
  const archivos = fuentes(ARBOL);

  it("`lib/` tiene un numero razonable de fuentes y ninguna se lee vacia", () => {
    expect(archivos.length).toBeGreaterThan(200);
    const vacios = archivos.filter((a) => codigoSinComentarios(relativo(a)).trim() === "");
    expect(vacios.map(relativo)).toEqual([]);
  });

  it("el barrido SI alcanza al repositorio del catalogo geografico", () => {
    // Control positivo sobre el arbol real: si el recorrido no llegara ahi, el caso de abajo
    // estaria verde por no mirar donde importa.
    expect(archivos.map(relativo)).toContain("lib/repositories/GeoRepository.ts");
  });
});

// ---------------------------------------------------------------------------------------------
// 2 — R5: el arbol real
// ---------------------------------------------------------------------------------------------

describe("374/R5 — ningun archivo de `lib/` borra en fisico provincia, canton ni distrito", () => {
  it("cero hallazgos en todo el arbol", () => {
    const hallazgos: string[] = [];
    for (const archivo of fuentes(ARBOL)) {
      for (const encontrado of borradosFisicosEn(codigoSinComentarios(relativo(archivo)))) {
        hallazgos.push(`${relativo(archivo)}: ${encontrado}`);
      }
    }
    expect(
      hallazgos,
      "quitar un nodo del catalogo geografico es DESACTIVARLO: un borrado fisico deja ordenes " +
        "historicas apuntando a la nada y arrastra `zona_distrito` en cascada, sin que nadie lo pida",
    ).toEqual([]);
  });
});

describe("SLT-46 R42/R50 — ni lib/, ni app/, ni components/ borran nodos, tipos ni la geografia vieja", () => {
  const todos = [ARBOL, ...OTROS_ARBOLES].flatMap((d) => fuentes(d));

  it("control: el barrido alcanza los tres arboles y al escritor del nodo", () => {
    const rutas = todos.map(relativo);
    expect(rutas).toContain("lib/repositories/GeoRepository.ts");
    expect(rutas.some((r) => r.startsWith("app/(app)/plataforma/geografia/"))).toBe(true);
    expect(rutas.some((r) => r.startsWith("components/"))).toBe(true);
  });

  it("CONTRAPRUEBA sobre el escritor real: un `deleteMany` del nodo inyectado en GeoRepository SE DETECTA", () => {
    const real = codigoSinComentarios("lib/repositories/GeoRepository.ts");
    expect(borradosFisicosEn(real)).toEqual([]);
    expect(borradosFisicosEn(`${real}\nawait tx.nodoGeografico.deleteMany({ where: { paisId } });`)).toEqual([
      "nodoGeografico.deleteMany",
    ]);
  });

  it("cero hallazgos en los tres arboles", () => {
    const hallazgos = todos.flatMap((archivo) =>
      borradosFisicosEn(codigoSinComentarios(relativo(archivo))).map((e) => `${relativo(archivo)}: ${e}`),
    );
    expect(
      hallazgos,
      "retirar un nodo es `activo = false` (R19) y un pais no pierde niveles (R50): ningun archivo de " +
        "la app borra nodo_geografico, tipo_nivel_geografico ni la geografia vieja (R42)",
    ).toEqual([]);
  });
});
