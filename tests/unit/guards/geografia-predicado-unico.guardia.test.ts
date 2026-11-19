import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { codigoSinComentarios } from "../../fixtures/sin-comentarios";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// FICHA 374 / G2 (R11) — EL PREDICADO DE DISPONIBILIDAD NO SE REIMPLEMENTA.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// LA REGLA, en una frase mecanicamente comprobable:
//
//   NINGUN archivo GEOGRAFICO de `lib/` fuera de `_shared/geografia-activa.ts` puede escribir el
//   literal `activo: true` ni `activo: false` (ni su forma SQL `activo = true|false`,
//   `activo IS [NOT] true|false`).
//
// Un archivo es GEOGRAFICO si su codigo (sin comentarios) cumple CUALQUIERA de estas:
//   - llama a un delegado Prisma de la geografia: `.provincia.<op>(`, `.canton.<op>(`,
//     `.distrito.<op>(`, `.distritoZonaEspecial.<op>(` o `.nodoGeografico.<op>(`;
//   - abre un objeto bajo una relacion geografica: `provincia: {`, `canton: {`, `distrito: {` o
//     sus plurales (`provincias`, `cantones`, `distritos`) —es como se filtra o proyecta la
//     geografia anidada desde OTRO modelo (`orden`, `zona_distrito`, ...)—;
//   - nombra una tabla geografica en SQL: `FROM|JOIN|UPDATE|INTO "provincia"|"canton"|"distrito"`;
//   - importa el modulo compartido `geografia-activa`.
//
// El veredicto es por ARCHIVO, no por consulta, y eso es a proposito: errar del lado estricto. Un
// archivo que toca geografia no puede escribir el literal ni siquiera para OTRA tabla; si lo
// necesita, esa consulta se va a un repositorio que no toque geografia. Adivinar a que tabla
// pertenece cada `{ activo: true }` dentro de un archivo geografico es justo la inferencia que
// acabaria callandose.
//
// POR QUE ASI Y NO «no reimplementes el predicado». Porque hay que poder MEDIRLO. Un `where` y un
// `select` se parecen demasiado en el texto —los dos son `{ activo: true }`— y una guardia que
// tuviera que adivinar cual es cual acabaria callandose. Prohibiendo el LITERAL, las dos formas
// pasan por el modulo compartido: los `WHERE_*_DISPONIBLE` para lo que recorta y los
// `SELECT_*`/`SELECT_FLAG_PROPIO` para lo que proyecta. El nombre del simbolo dice cual es cual,
// que es informacion que el literal no da.
//
// QUE SE PIERDE SI ESTO NO EXISTE. Un `where: { activo: true }` escrito a mano en un repositorio
// es una SEGUNDA definicion de «disponible». La que divergiera dejaria fuera —o dentro— filas del
// catalogo sin romper ningun test: exactamente el argumento que ya justifica a
// `_shared/zona-colapso.ts`, escrito por su ficha.
//
// DOS COSAS QUE ESTA GUARDIA NO HACE, y se dicen para que no se supongan:
//   - NO barre `app/`. Ahi no hay Prisma: la pantalla recibe el arbol con el flag ya proyectado y
//     un componente puede escribir `activo: true` legitimamente al montar su estado.
//   - NO mira el `activo` de OTRAS tablas en archivos que no tocan geografia. Hasta SLT-42 el unico
//     `activo` booleano del esquema era el geografico y la guardia prohibia el literal en todo
//     `lib/`. SLT-42 añade `tipo_identificacion.activo`, y su lectura filtra por el (R5,
//     `UserRepository.listTiposIdentificacion`). Decision humana del 2026-11-04
//     (`progress/features/SLT-42.md > Decisiones`, punto 1; design de SLT-42 > «Desvios aceptados
//     en implementacion», punto 4): la guardia se acota a geografia y deja pasar `activo: true`
//     en las demas tablas.
//
// SL-42 — `vehiculos.activo` (R18). No es geografia: un vehiculo no tiene ascendientes y su
// disponibilidad es su propio flag, asi que no pasa por `_shared/geografia-activa.ts`. Sigue la
// MISMA disciplina con su propia fuente unica, `_shared/vehiculo-activo.ts`, que queda fuera del
// barrido y acotada abajo: un solo literal, `activo: true`, y nada mas. La regla de la geografia
// no cambia.
//
// La selecciona `pnpm exec vitest run guard` por el nombre del archivo.

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOL = path.join(RAIZ, "lib");
const FUENTE_UNICA = "lib/repositories/_shared/geografia-activa.ts";
/** SL-42: la fuente unica del flag de `vehiculos`, otro modelo. Ver la cabecera. */
const FUENTE_UNICA_VEHICULOS = "lib/repositories/_shared/vehiculo-activo.ts";

/**
 * EL DETECTOR DEL LITERAL. Devuelve cada `activo: <booleano>` (forma Prisma) y cada
 * `activo = <booleano>` / `activo IS [NOT] <booleano>` (forma SQL) encontrado.
 */
export function literalesDeActivoEn(codigo: string): string[] {
  const prisma = [...codigo.matchAll(/\bactivo\s*:\s*(true|false)\b/g)].map((m) => `activo: ${m[1]}`);
  const sql = [...codigo.matchAll(/\bactivo"?\s*(=|IS(?:\s+NOT)?)\s*(true|false)\b/gi)].map(
    (m) => `activo ${m[1].toUpperCase()} ${m[2].toLowerCase()}`,
  );
  return [...prisma, ...sql];
}

const DISCRIMINADORES_GEOGRAFICOS: readonly RegExp[] = [
  /\.\s*(provincia|canton|distrito|distritoZonaEspecial|nodoGeografico)\s*\.\s*[A-Za-z]+\s*\(/,
  /\b(provincia|canton|distrito|provincias|cantones|distritos)\s*:\s*\{/,
  /\b(FROM|JOIN|UPDATE|INTO)\s+"?(provincia|canton|distrito|distrito_zona_especial)"?(\s|$|;)/i,
  /geografia-activa["']/,
];

/** ¿Toca este codigo la geografia? Ver la cabecera: cualquiera de los discriminadores basta. */
export function esCodigoGeografico(codigo: string): boolean {
  return DISCRIMINADORES_GEOGRAFICOS.some((re) => re.test(codigo));
}

/** Los literales que la regla prohibe: los de un archivo geografico. Fuera de ellos, ninguno. */
export function hallazgosGeograficosEn(codigo: string): string[] {
  return esCodigoGeografico(codigo) ? literalesDeActivoEn(codigo) : [];
}

function fuentes(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
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
// 0 — El detector, contra respuestas conocidas
// ---------------------------------------------------------------------------------------------

describe("374/G2 — el detector se prueba a si mismo", () => {
  const CUERPO_SANO = `
    async listDistritosLite() {
      const rows = await this.prisma.distrito.findMany({
        select: { id: true, nombre: true, ...SELECT_CADENA_DISTRITO },
      });
      return rows.map((r) => ({ id: r.id, disponible: disponibleDesdeCadena(r) }));
    }`;

  it("CONTRAPRUEBA (control positivo): el cuerpo que usa el fragmento compartido NO produce hallazgos", () => {
    expect(esCodigoGeografico(CUERPO_SANO)).toBe(true);
    expect(hallazgosGeograficosEn(CUERPO_SANO)).toEqual([]);
  });

  it("CONTRAPRUEBA: un `where: { activo: true }` escrito A MANO se detecta", () => {
    // Es la mutacion que el design nombra: alguien «mejora» la lectura recortando en el `WHERE`.
    // El resultado compila, pasa los tests de servicio y esconde los nodos retirados.
    const mutado = CUERPO_SANO.replace(
      "select: { id: true, nombre: true, ...SELECT_CADENA_DISTRITO },",
      "where: { activo: true },\n        select: { id: true, nombre: true },",
    );
    expect(hallazgosGeograficosEn(mutado)).toEqual(["activo: true"]);
  });

  it("CONTRAPRUEBA: un `select` con el literal tambien se detecta", () => {
    expect(
      hallazgosGeograficosEn("prisma.canton.findMany({ select: { activo: true, nombre: true } })"),
    ).toEqual(["activo: true"]);
  });

  it("CONTRAPRUEBA: `activo: false` tambien", () => {
    expect(hallazgosGeograficosEn("tx.provincia.updateMany({ where: { activo: false } })")).toEqual([
      "activo: false",
    ]);
  });

  it("CONTRAPRUEBA: el literal en una relacion geografica ANIDADA en otro modelo se detecta", () => {
    // `orden` no es geografia, pero filtrar por la disponibilidad de su distrito SI lo es.
    const codigo = "prisma.orden.findMany({ where: { distrito: { activo: true } } })";
    expect(hallazgosGeograficosEn(codigo)).toEqual(["activo: true"]);
  });

  it("CONTRAPRUEBA: la forma SQL en un `$queryRaw` sobre una tabla geografica se detecta", () => {
    const codigo =
      'prisma.$queryRaw`SELECT d."id" FROM "distrito" d JOIN "canton" k ON k."id" = d."canton_id" WHERE d."activo" = true AND k.activo IS NOT FALSE`';
    expect(hallazgosGeograficosEn(codigo)).toEqual(["activo = true", "activo IS NOT false"]);
  });

  it("CONTRAPRUEBA: un archivo que importa el modulo compartido es geografico aunque no consulte", () => {
    const codigo = `import { SELECT_FLAG_PROPIO } from "./_shared/geografia-activa";\nconst x = { activo: true };`;
    expect(hallazgosGeograficosEn(codigo)).toEqual(["activo: true"]);
  });

  it("ESTRICTO: en un archivo geografico, el literal sobre OTRA tabla tambien falla", () => {
    // El veredicto es por archivo: no se adivina a que tabla pertenece cada literal.
    const codigo = `
      await this.prisma.distrito.findMany({ select: SELECT_CADENA_DISTRITO });
      await this.prisma.tipoIdentificacion.findMany({ where: { activo: true } });`;
    expect(hallazgosGeograficosEn(codigo)).toEqual(["activo: true"]);
  });

  it("SLT-42 (R5): `activo: true` sobre `tipo_identificacion` en un archivo sin geografia NO se detecta", () => {
    const codigo = `
      async listTiposIdentificacion(paisId: string) {
        return this.prisma.tipoIdentificacion.findMany({
          where: { paisId, activo: true },
          select: { id: true, value: true, label: true },
          orderBy: { orden: "asc" },
        });
      }`;
    expect(literalesDeActivoEn(codigo)).toEqual(["activo: true"]);
    expect(esCodigoGeografico(codigo)).toBe(false);
    expect(hallazgosGeograficosEn(codigo)).toEqual([]);
  });

  it("no confunde una DECLARACION de tipo con un literal", () => {
    // `activo: boolean` en una interfaz es lo normal y no es una reimplementacion del predicado.
    expect(literalesDeActivoEn("export interface X { activo: boolean }")).toEqual([]);
    expect(literalesDeActivoEn("activo: z.boolean(),")).toEqual([]);
  });

  it("no confunde el mapeo de un DTO ni una comparacion con un literal", () => {
    expect(literalesDeActivoEn("return { id: d.id, activo: d.activo };")).toEqual([]);
    expect(literalesDeActivoEn("if (previo.activo === activo) return;")).toEqual([]);
  });

  it("no toca `activa` (femenino), que es de OTRAS tablas", () => {
    expect(literalesDeActivoEn("where: { activa: true }")).toEqual([]);
  });

  it("no toma por geografico un acceso a propiedad ni un nombre de campo suelto", () => {
    expect(esCodigoGeografico("const n = fila.canton.provincia.nombre;")).toBe(false);
    expect(esCodigoGeografico("select: { provinciaId: true, cantonId: true }")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// 1 — Anti-vacuidad
// ---------------------------------------------------------------------------------------------

describe("374/G2 — el barrido lee de verdad", () => {
  it("la FUENTE UNICA existe y SI contiene los literales: son suyos", () => {
    // Control positivo sobre el arbol real. Si el modulo compartido dejara de tener literales, o
    // el detector dejara de encontrarlos, el caso de abajo estaria verde por no ver nada.
    const propios = literalesDeActivoEn(codigoSinComentarios(FUENTE_UNICA));
    expect(propios.length).toBeGreaterThanOrEqual(8);
  });

  it("SL-42: la fuente de vehiculos existe y lleva EXACTAMENTE un `activo: true` (la excepcion no crece)", () => {
    // Si alguien metiera aqui un `activo: false` o una segunda forma del predicado, la excepcion
    // dejaria de ser la de un recorte y pasaria a esconder una regla: sale rojo.
    expect(literalesDeActivoEn(codigoSinComentarios(FUENTE_UNICA_VEHICULOS))).toEqual(["activo: true"]);
    // Y no se cuela geografia: el archivo no nombra ningun nivel geografico.
    expect(codigoSinComentarios(FUENTE_UNICA_VEHICULOS)).not.toMatch(/provincia|canton|distrito/i);
  });

  it("`lib/` tiene un numero razonable de fuentes", () => {
    expect(fuentes(ARBOL).length).toBeGreaterThan(200);
  });

  it("el discriminador reconoce como geograficos los repositorios que tocan geografia", () => {
    // Si un discriminador se rompiera, estos archivos saldrian del barrido y la guardia callaria.
    for (const rel of [
      "lib/repositories/GeoRepository.ts",
      "lib/repositories/CoberturaRepository.ts",
      "lib/repositories/OrdenRepository.ts",
      "lib/repositories/InformeTransitoRepository.ts",
    ]) {
      expect(esCodigoGeografico(codigoSinComentarios(rel)), rel).toBe(true);
    }
  });

  it("CONTRAPRUEBA sobre el arbol real: un literal inyectado en `GeoRepository.ts` se detecta", () => {
    const real = codigoSinComentarios("lib/repositories/GeoRepository.ts");
    expect(hallazgosGeograficosEn(real)).toEqual([]);
    expect(hallazgosGeograficosEn(`${real}\nconst x = { where: { activo: true } };`)).toEqual([
      "activo: true",
    ]);
  });

  it("`UserRepository.ts` (tipos de documento, R5 de SLT-42) NO es geografico", () => {
    expect(esCodigoGeografico(codigoSinComentarios("lib/repositories/UserRepository.ts"))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// 2 — R11: el arbol real
// ---------------------------------------------------------------------------------------------

describe("374/R11 — toda referencia al flag geografico pasa por `_shared/geografia-activa.ts`", () => {
  it("ningun otro archivo geografico de `lib/` escribe `activo: true` ni `activo: false`", () => {
    const hallazgos: string[] = [];
    for (const archivo of fuentes(ARBOL)) {
      const rel = relativo(archivo);
      if (rel === FUENTE_UNICA || rel === FUENTE_UNICA_VEHICULOS) continue;
      for (const literal of hallazgosGeograficosEn(codigoSinComentarios(rel))) {
        hallazgos.push(`${rel}: ${literal}`);
      }
    }
    expect(
      hallazgos,
      "el predicado de disponibilidad geografica vive en `lib/repositories/_shared/geografia-activa.ts` " +
        "y en ningun otro sitio: usa `WHERE_*_DISPONIBLE` si la consulta RECORTA, o " +
        "`SELECT_FLAG_PROPIO`/`SELECT_CADENA_*` si solo PROYECTA. Dos copias son dos reglas que un " +
        "dia divergen, y la que divergiera dejaria fuera filas del catalogo sin romper ningun test. " +
        "Si el literal es de OTRA tabla, saca esa consulta a un archivo que no toque geografia",
    ).toEqual([]);
  });
});
