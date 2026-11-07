import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { codigoSinComentarios } from "../../fixtures/sin-comentarios";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// FICHA 375 — EL CATALOGO GEOGRAFICO SE RENOMBRA POR UN SOLO SITIO.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// SUSTITUYE A `geografia-sin-renombrado.guardia.test.ts` (ficha 374 / R49), que exigia que NADIE
// escribiera `nombre` sobre `provincia`, `canton` ni `distrito`. Aquella prohibicion tenia una
// causa medida y no un principio: `scripts/seed-zonas.ts` resolvia la geografia POR NOMBRE y creaba
// lo que no encontraba, asi que un renombrado producia un duplicado ACTIVO en la siguiente corrida
// del seed y, a partir de ahi, «distrito ambiguo en el canton» en toda carga que lo mencionara.
//
// La ficha 375 quita la causa —`codigo_dta`, clave estable, y el seed cruzando por codigo— y con
// ella la prohibicion. Lo que NO desaparece es el riesgo de que el renombrado entre por la puerta
// de atras, y por eso la guardia se INVIERTE en vez de borrarse:
//
//   ⚠️ ESCRIBIR `nombre` SOBRE ESAS TRES TABLAS SOLO ES LEGAL EN `GeoRepository.renombrar`.
//
// Que protege, exactamente. Un `update` con `nombre` en cualquier otro punto de `lib/`:
//   * se saltaria la comprobacion de unicidad por clave NORMALIZADA, que vive en
//     `GeografiaService.renombrar`. El `@@unique([canton_id, nombre])` de la base compara
//     LITERALES, asi que dejaria convivir «San José» y «San Jose» — dos filas legales para Postgres
//     y UNA SOLA COSA AMBIGUA para `resolveGeo`, que indexa por `normalizeName`;
//   * y no dejaria fila en el registro de acciones, asi que nadie sabria quien cambio el nombre de
//     un territorio que aparece en ordenes y en descargas.
//
// Ninguna de las dos cosas rompe un test que no exista.
//
// COMO SE MIDE. Se recortan los argumentos de toda escritura de Prisma sobre las tres tablas
// (`update`, `updateMany`, `upsert`) en `lib/` y se exige que las que llevan `nombre` en su
// argumento esten TODAS en el archivo y el metodo declarados aqui. Con CONTRAPRUEBA sobre texto
// mutado en memoria y con CONTROL POSITIVO: si el renombrado legitimo desapareciera, el barrido
// tambien se pondria rojo (una guardia que sale verde por no encontrar nada es una guardia rota).
//
// ⚠️ EL `create` NO ENTRA, y es deliberado: dar de alta SI escribe el nombre. Lo que esta guardia
// acota es CAMBIARLO en una fila que ya existe.
//
// SLT-46 (R43, design §9) — EL PUNTO UNICO PASA AL NODO. La app ya no escribe `provincia`, `canton`
// ni `distrito` (`geografia-vieja-sin-escritor`): el nombre vive en `nodo_geografico` y el trigger lo
// copia a la fila vieja. Lo que se acota ahora es `nodoGeografico.update|updateMany|upsert` con
// `nombre`: solo `GeoRepository.renombrar` lo cambia (el alta lo escribe con `create`, que no entra).
// Y dentro de `GeoRepository`, solo el cuerpo del renombre: otro metodo del mismo archivo que
// escribiera `nombre` seria el mismo atajo.
//
// La selecciona `pnpm exec vitest run guard` por el nombre del archivo.

const RAIZ = path.resolve(__dirname, "../../..");
const ARBOL = path.join(RAIZ, "lib");

/** El UNICO punto legal. */
const PUNTO_UNICO = "lib/repositories/GeoRepository.ts";

/**
 * SLT-46: el cuerpo del renombre dentro del punto unico. Desde T4 es el propio metodo publico: la
 * firma por nivel que delegaba en un `renombrarNodo` privado se retiro.
 */
const CUERPO_DEL_RENOMBRE = "async renombrar(id: string,";

/** El nodo, como delegado de Prisma. */
const ESCRITURAS = /\b(nodoGeografico)\s*\??\.\s*(update|updateMany|upsert)\s*\(/g;

/** El bloque `{ … }` que empieza en `desde`, cerrado por llaves balanceadas. `null` si no cierra. */
function bloqueBalanceado(codigo: string, desde: number): string | null {
  const abre = codigo.indexOf("{", desde);
  if (abre === -1) return null;
  let profundidad = 0;
  for (let i = abre; i < codigo.length; i++) {
    if (codigo[i] === "{") profundidad++;
    else if (codigo[i] === "}") {
      profundidad--;
      if (profundidad === 0) return codigo.slice(abre, i + 1);
    }
  }
  return null;
}

/** El cuerpo `{ … }` del metodo que empieza en `firma`, o `null` si no esta o no cierra. */
function cuerpoDe(codigo: string, firma: string): { desde: number; hasta: number } | null {
  const inicio = codigo.indexOf(firma);
  if (inicio === -1) return null;
  // La primera llave tras el tipo de retorno: la del cuerpo, no la de un parametro.
  const cierreFirma = codigo.indexOf("): Promise<", inicio);
  if (cierreFirma === -1) return null;
  const desde = codigo.indexOf("{", cierreFirma);
  const cuerpo = bloqueBalanceado(codigo, cierreFirma);
  return cuerpo === null ? null : { desde, hasta: desde + cuerpo.length };
}

/**
 * EL DETECTOR. Devuelve una entrada por cada escritura sobre el nodo cuyo argumento mencione
 * `nombre`.
 */
export function renombradosEn(codigo: string): string[] {
  const hallazgos: string[] = [];
  for (const encontrado of codigo.matchAll(ESCRITURAS)) {
    const desde = encontrado.index + encontrado[0].length - 1;
    const argumento = bloqueBalanceado(codigo, desde);
    if (argumento === null) {
      // Un argumento que no cierra es un detector roto, no una escritura sana: se REPORTA. Una
      // guardia que en la duda calla es justo la que falla.
      hallazgos.push(`${encontrado[1]}.${encontrado[2]}: el argumento no cierra`);
      continue;
    }
    if (/\bnombre\b/.test(argumento)) {
      hallazgos.push(`${encontrado[1]}.${encontrado[2]} escribe \`nombre\``);
    }
  }
  return hallazgos;
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

describe("375 / SLT-46 — el detector se prueba a si mismo", () => {
  it("CONTRAPRUEBA (control positivo): el `update` del flag NO produce hallazgos", () => {
    expect(renombradosEn(`await tx.nodoGeografico.update({ where: { id }, data: { activo } });`)).toEqual(
      [],
    );
  });

  it("CONTRAPRUEBA: un `update` que escribe `nombre` SE DETECTA", () => {
    expect(renombradosEn(`await tx.nodoGeografico.update({ where: { id }, data: { nombre } });`)).toEqual([
      "nodoGeografico.update escribe `nombre`",
    ]);
  });

  it("CONTRAPRUEBA: tambien en `updateMany` y en `upsert`", () => {
    expect(
      renombradosEn(`prisma.nodoGeografico.updateMany({ where: {}, data: { nombre: "X" } });`),
    ).toEqual(["nodoGeografico.updateMany escribe `nombre`"]);
    expect(
      renombradosEn(`prisma.nodoGeografico.upsert({ where: {}, create: {}, update: { nombre } });`),
    ).toEqual(["nodoGeografico.upsert escribe `nombre`"]);
  });

  it("el `create` y el `createMany` del ALTA no se denuncian: dar de alta SI escribe el nombre", () => {
    expect(renombradosEn(`await tx.nodoGeografico.create({ data: { nombre, padreId } });`)).toEqual([]);
    expect(renombradosEn(`await tx.nodoGeografico.createMany({ data: [{ nombre }] });`)).toEqual([]);
  });

  it("completar el codigo (`updateMany` sin `nombre`) no se denuncia", () => {
    expect(
      renombradosEn(`await tx.nodoGeografico.updateMany({ where: { id, codigoOficial: null }, data: { codigoOficial } });`),
    ).toEqual([]);
  });

  it("un argumento que no cierra se REPORTA en vez de darse por sano", () => {
    expect(renombradosEn(`prisma.nodoGeografico.update({ where: { id `)).toEqual([
      "nodoGeografico.update: el argumento no cierra",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// 1 — Anti-vacuidad: el barrido SI encuentra escrituras sobre estas tablas
// ---------------------------------------------------------------------------------------------

describe("375 / SLT-46 — el barrido alcanza escrituras reales", () => {
  it("hay al menos TRES escrituras del nodo en `lib/` (el flag, el codigo y el nombre)", () => {
    // Control positivo: si el detector no encontrara ninguna escritura, el caso de abajo estaria
    // verde por no mirar nada.
    let escrituras = 0;
    for (const archivo of fuentes(ARBOL)) {
      escrituras += [...codigoSinComentarios(relativo(archivo)).matchAll(ESCRITURAS)].length;
    }
    expect(escrituras).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------------------------
// 2 — El renombrado existe, y esta EXACTAMENTE donde tiene que estar
// ---------------------------------------------------------------------------------------------

describe("375 / SLT-46 — renombrar un nodo se escribe por un solo sitio", () => {
  it("el punto unico SI renombra (si dejara de hacerlo, la ficha estaria rota)", () => {
    const codigo = codigoSinComentarios(PUNTO_UNICO);
    expect(codigo.length, `${PUNTO_UNICO} se leyo vacio`).toBeGreaterThan(200);
    expect(
      renombradosEn(codigo).length,
      "GeoRepository ya no escribe `nombre`: o se movio el renombrado, o desaparecio",
    ).toBeGreaterThanOrEqual(1);
    expect(codigo).toMatch(/async renombrar\(/);
  });

  it("SLT-46: dentro de GeoRepository, `nombre` solo se escribe en el cuerpo del renombre", () => {
    const codigo = codigoSinComentarios(PUNTO_UNICO);
    const cuerpo = cuerpoDe(codigo, CUERPO_DEL_RENOMBRE);
    expect(cuerpo, `no se encontro \`${CUERPO_DEL_RENOMBRE}\` en ${PUNTO_UNICO}`).not.toBeNull();
    const { desde, hasta } = cuerpo as { desde: number; hasta: number };
    expect(renombradosEn(codigo.slice(desde, hasta))).toEqual(["nodoGeografico.update escribe `nombre`"]);
    // El resto del archivo, sin ese cuerpo, no cambia el nombre de ningun nodo existente.
    expect(renombradosEn(codigo.slice(0, desde) + codigo.slice(hasta))).toEqual([]);
  });

  it("CONTRAPRUEBA: otro metodo de GeoRepository que escribiera `nombre` SE DETECTA", () => {
    const codigo = codigoSinComentarios(PUNTO_UNICO);
    const { desde, hasta } = cuerpoDe(codigo, CUERPO_DEL_RENOMBRE) as { desde: number; hasta: number };
    const resto = codigo.slice(0, desde) + codigo.slice(hasta);
    const mutado = resto.replace("data: { activo } }", "data: { activo, nombre } }");
    expect(mutado, "la contraprueba no encontro el `update` del flag").not.toBe(resto);
    expect(renombradosEn(mutado)).toEqual(["nodoGeografico.update escribe `nombre`"]);
  });

  it("NINGUN otro archivo de `lib/` escribe `nombre` sobre el nodo", () => {
    const hallazgos: string[] = [];
    for (const archivo of fuentes(ARBOL)) {
      const rel = relativo(archivo);
      if (rel === PUNTO_UNICO) continue;
      for (const hallazgo of renombradosEn(codigoSinComentarios(rel))) {
        hallazgos.push(`${rel}: ${hallazgo}`);
      }
    }
    expect(
      hallazgos,
      "un renombrado fuera de `GeoRepository.renombrar` se salta la unicidad por clave " +
        "NORMALIZADA (el UNIQUE de la base compara literales, y `resolveGeo` compara normalizado) " +
        "y ademas no deja fila en el registro de acciones",
    ).toEqual([]);
  });

  it("CONTRAPRUEBA: un renombrado colado en otro repositorio SE DETECTA", () => {
    // El mismo detector, sobre el cuerpo REAL de otro repositorio con una escritura inyectada.
    const real = codigoSinComentarios("lib/repositories/ZonaRepository.ts");
    expect(renombradosEn(real)).toEqual([]);
    const mutado = `${real}\nawait tx.nodoGeografico.update({ where: { id }, data: { nombre } });`;
    expect(renombradosEn(mutado)).toContain("nodoGeografico.update escribe `nombre`");
  });
});

// ---------------------------------------------------------------------------------------------
// 3 — La otra mitad: la superficie declarada
// ---------------------------------------------------------------------------------------------

describe("375 — el renombrado esta declarado en las tres capas y en ninguna mas", () => {
  it("la interfaz, el servicio y la accion lo declaran; el repositorio lo implementa", () => {
    const esperado: [string, RegExp][] = [
      ["lib/interfaces/repositories/IGeoRepository.ts", /\brenombrar\(/],
      ["lib/interfaces/services/IGeografiaService.ts", /\brenombrar\(/],
      ["lib/services/GeografiaService.ts", /async renombrar\(/],
      // SL-20 (design §4): la accion se mudo al borde del superadmin, dentro de `comoPlataforma`.
      ["lib/actions/geografia-plataforma.ts", /export async function renombrarNodoAction\(/],
      ["lib/repositories/GeoRepository.ts", /async renombrar\(/],
    ];
    for (const [rel, patron] of esperado) {
      const codigo = codigoSinComentarios(rel);
      expect(codigo.length, `${rel} se leyo vacio`).toBeGreaterThan(200);
      expect(codigo, `${rel} no declara el renombrado`).toMatch(patron);
    }
  });

  it("SL-20: el borde viejo de la empresa (`lib/actions/geografia.ts`) ya no renombra", () => {
    const codigo = codigoSinComentarios("lib/actions/geografia.ts");
    expect(codigo.length, "lib/actions/geografia.ts se leyo vacio").toBeGreaterThan(200);
    expect(codigo).not.toMatch(/\brenombrar\w*\s*\(/);
  });

  it("el renombrado NO toca el codigo: la clave estable no se reescribe al cambiar la etiqueta", () => {
    // SLT-46: el codigo del nodo es `codigoOficial` (la copia a `codigo_dta` es del trigger).
    const codigo = codigoSinComentarios(PUNTO_UNICO);
    const { desde, hasta } = cuerpoDe(codigo, CUERPO_DEL_RENOMBRE) as { desde: number; hasta: number };
    const cuerpo = codigo.slice(desde, hasta);
    expect(cuerpo.length, "no se pudo recortar el cuerpo del renombre").toBeGreaterThan(200);
    expect(
      cuerpo,
      "si el renombre escribiera el codigo, la siguiente corrida del seed volveria a no " +
        "reconocer el nodo y lo duplicaria: es exactamente el defecto que esta ficha cierra",
    ).not.toMatch(/\b(codigoDta|codigoOficial)\b/);
  });
});
