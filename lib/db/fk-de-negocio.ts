// SL-17 M3 (design §3 M3, D15, R37–R39): las claves ajenas de un modelo de negocio a otro y el nombre
// determinista de su trigger de «misma empresa». Lo usan el generador
// (`scripts/generar-misma-empresa.ts`) y la guardia R39: si los dos no calculan lo mismo, la guardia
// no prueba nada.
//
// Por que se parsea el TEXTO de `db/schema.prisma` y no `Prisma.dmmf`: el DMMF de Prisma 7 en
// ejecucion no trae `relationFromFields` (0 de 88 modelos, medido en la tanda 1), y
// `@prisma/internals` seria una dependencia nueva. El parser cubre solo lo que el esquema usa:
// `model`, `@@map`, `@map` y `@relation(… fields: […], references: […] …)`.
//
// Modulo puro (sin Prisma ni fs): recibe el texto, para poder probarlo con un esquema inventado.

import { createHash } from "node:crypto";

import { MODELOS_DE_NEGOCIO } from "./modelos-de-negocio";

export type FkDeNegocio = {
  readonly tabla: string;
  readonly columna: string;
  readonly tablaRef: string;
  readonly columnaRef: string;
  /** Modelo de Prisma de origen (p. ej. "Orden"). */
  readonly modelo: string;
  /** Campo de relacion de Prisma (p. ej. "tienda"): lo que nombra la guardia. */
  readonly campo: string;
};

type CampoParseado = {
  readonly nombre: string;
  readonly tipo: string;
  readonly columna: string;
  readonly relacion: { readonly fields: string[]; readonly references: string[] } | null;
};

type ModeloParseado = {
  readonly nombre: string;
  readonly tabla: string;
  readonly campos: ReadonlyMap<string, CampoParseado>;
};

/** Limite de identificadores de Postgres (NAMEDATALEN - 1). */
export const LIMITE_IDENTIFICADOR = 63;

function md5Hex(texto: string): string {
  return createHash("md5").update(texto).digest("hex");
}

/** `sme_` + 40 primeros de `<tabla>_<col>` + `_` + 8 del md5 de `<tabla>.<col>`: siempre ≤ 53. */
export function nombreTrigger(tabla: string, columna: string): string {
  return `sme_${`${tabla}_${columna}`.slice(0, 40)}_${md5Hex(`${tabla}.${columna}`).slice(0, 8)}`;
}

/**
 * `<tabla>_sin_cambio_de_empresa`. Hoy los 74 caben; si una tabla futura lo pasa de 63, Postgres lo
 * truncaria en silencio y la guardia buscaria un nombre que no existe: se recorta aqui, igual para
 * generador y guardia.
 */
export function nombreTriggerSinCambio(tabla: string): string {
  const nombre = `${tabla}_sin_cambio_de_empresa`;
  if (nombre.length <= LIMITE_IDENTIFICADOR) return nombre;
  return `${nombre.slice(0, LIMITE_IDENTIFICADOR - 9)}_${md5Hex(tabla).slice(0, 8)}`;
}

// Quita `// …` fuera de cadenas: los comentarios del esquema citan `@relation` y corchetes.
function sinComentario(linea: string): string {
  let enCadena = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === "\\" && enCadena) {
      i++;
      continue;
    }
    if (c === '"') enCadena = !enCadena;
    else if (!enCadena && c === "/" && linea[i + 1] === "/") return linea.slice(0, i);
  }
  return linea;
}

// Contenido entre los parentesis balanceados que abren en `desde` (indice del `(`).
function entreParentesis(texto: string, desde: number): string {
  let profundidad = 0;
  let enCadena = false;
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') enCadena = !enCadena;
    if (enCadena) continue;
    if (c === "(") profundidad++;
    else if (c === ")") {
      profundidad--;
      if (profundidad === 0) return texto.slice(desde + 1, i);
    }
  }
  throw new Error(`parentesis sin cerrar en: ${texto}`);
}

function listaDeCampos(argumentos: string, clave: "fields" | "references"): string[] | null {
  const m = new RegExp(`\\b${clave}\\s*:\\s*\\[([^\\]]*)\\]`).exec(argumentos);
  if (!m) return null;
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function nombreMapeado(atributos: string, prefijo: "@map" | "@@map"): string | null {
  const re = prefijo === "@@map"
    ? /@@map\(\s*(?:name\s*:\s*)?"([^"]+)"/
    : /(?<!@)@map\(\s*(?:name\s*:\s*)?"([^"]+)"/;
  const m = re.exec(atributos);
  return m ? m[1] : null;
}

function parsearModelos(textoEsquema: string): Map<string, ModeloParseado> {
  const modelos = new Map<string, ModeloParseado>();
  let actual: { nombre: string; tabla: string | null; campos: Map<string, CampoParseado> } | null =
    null;

  for (const bruta of textoEsquema.split(/\r?\n/)) {
    const linea = sinComentario(bruta).trim();
    if (actual === null) {
      const inicio = /^model\s+(\w+)\s*\{$/.exec(linea);
      if (inicio) actual = { nombre: inicio[1], tabla: null, campos: new Map() };
      continue;
    }
    if (linea === "}") {
      modelos.set(actual.nombre, {
        nombre: actual.nombre,
        tabla: actual.tabla ?? actual.nombre,
        campos: actual.campos,
      });
      actual = null;
      continue;
    }
    if (linea.startsWith("@@")) {
      const tabla = nombreMapeado(linea, "@@map");
      if (tabla) actual.tabla = tabla;
      continue;
    }
    const campo = /^(\w+)\s+(\w+)(\[\])?\??\s*(.*)$/.exec(linea);
    if (!campo) continue;
    const [, nombre, tipo, , atributos] = campo;
    let relacion: CampoParseado["relacion"] = null;
    const posRelacion = atributos.indexOf("@relation(");
    if (posRelacion >= 0) {
      const args = entreParentesis(atributos, posRelacion + "@relation".length);
      const fields = listaDeCampos(args, "fields");
      const references = listaDeCampos(args, "references");
      // Sin `fields` es el lado inverso (la lista o el 1:1 sin columna): no hay FK en esta tabla.
      if (fields !== null) relacion = { fields, references: references ?? [] };
    }
    actual.campos.set(nombre, {
      nombre,
      tipo,
      columna: nombreMapeado(atributos, "@map") ?? nombre,
      relacion,
    });
  }
  if (actual !== null) throw new Error(`model ${actual.nombre} sin cerrar en el esquema`);
  return modelos;
}

/**
 * Las FK cuyo modelo de origen y de destino son de negocio. Las que van a plataforma, a
 * `Organizacion` (la propia `organizacion_id`) o a `Job` quedan fuera porque su destino no esta en la
 * lista. Lanza si una FK de negocio es compuesta: el trigger generico compara una sola columna, y
 * omitirla en silencio dejaria la referencia sin garantia (design §3 M3).
 */
export function fkDeNegocio(
  textoEsquema: string,
  modelosDeNegocio: readonly string[] = MODELOS_DE_NEGOCIO.map((m) => m.modelo),
): FkDeNegocio[] {
  const deNegocio = new Set(modelosDeNegocio);
  const modelos = parsearModelos(textoEsquema);
  const resultado: FkDeNegocio[] = [];
  const vistas = new Map<string, string>();

  for (const modelo of modelos.values()) {
    if (!deNegocio.has(modelo.nombre)) continue;
    for (const campo of modelo.campos.values()) {
      if (campo.relacion === null || !deNegocio.has(campo.tipo)) continue;
      const destino = modelos.get(campo.tipo);
      if (!destino) throw new Error(`${modelo.nombre}.${campo.nombre}: el modelo ${campo.tipo} no esta en el esquema`);
      const { fields, references } = campo.relacion;
      if (fields.length !== 1 || references.length !== 1) {
        throw new Error(
          `FK compuesta entre modelos de negocio: ${modelo.nombre}.${campo.nombre} ` +
            `(fields: [${fields.join(", ")}], references: [${references.join(", ")}])`,
        );
      }
      const escalar = modelo.campos.get(fields[0]);
      const referido = destino.campos.get(references[0]);
      if (!escalar || !referido) {
        throw new Error(`${modelo.nombre}.${campo.nombre}: campo de la FK no encontrado`);
      }
      // Dos relaciones sobre la misma columna darian dos triggers con el mismo nombre.
      const clave = `${modelo.tabla}.${escalar.columna}`;
      const previa = vistas.get(clave);
      if (previa) throw new Error(`la columna ${clave} es FK de ${previa} y de ${modelo.nombre}.${campo.nombre}`);
      vistas.set(clave, `${modelo.nombre}.${campo.nombre}`);
      resultado.push({
        tabla: modelo.tabla,
        columna: escalar.columna,
        tablaRef: destino.tabla,
        columnaRef: referido.columna,
        modelo: modelo.nombre,
        campo: campo.nombre,
      });
    }
  }
  return resultado.sort((a, b) =>
    a.tabla === b.tabla ? a.columna.localeCompare(b.columna) : a.tabla.localeCompare(b.tabla),
  );
}

// ── Lectura de las migraciones (la usan la guardia R39 y `--faltantes` del generador) ────────────

export type TriggerVivo = {
  readonly nombre: string;
  readonly tabla: string;
  readonly funcion: string;
  /** Argumentos literales del `EXECUTE FUNCTION f('a', 'b', 'c')`. */
  readonly argumentos: readonly string[];
  /** Columnas del `UPDATE OF …`, sin comillas. */
  readonly columnasUpdate: readonly string[];
};

function sinComentariosSql(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");
}

function sinComillas(identificador: string): string {
  return identificador.trim().replace(/^"(.*)"$/, "$1");
}

/**
 * Los triggers que quedan en pie tras aplicar, en orden, los `migration.sql` dados. Sigue
 * `CREATE [OR REPLACE] TRIGGER`, `DROP TRIGGER … ON` y `DROP FUNCTION` (que se lleva, con CASCADE,
 * los triggers que la usan). Los comentarios SQL no cuentan: un trigger comentado no protege.
 */
export function triggersVivos(sqlsEnOrden: readonly string[]): Map<string, TriggerVivo> {
  const vivos = new Map<string, TriggerVivo>();
  const clave = (tabla: string, nombre: string) => `${tabla}.${nombre}`;
  const sentencia =
    /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+("[^"]+"|\w+)([\s\S]*?)\bON\s+((?:\w+\.)?(?:"[^"]+"|\w+))[\s\S]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+((?:\w+\.)?\w+)\s*\(([^)]*)\)|DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?("[^"]+"|\w+)\s+ON\s+((?:\w+\.)?(?:"[^"]+"|\w+))|DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?((?:\w+\.)?\w+)/gi;
  const ultimo = (calificado: string) => sinComillas(calificado.split(".").pop() ?? calificado);

  for (const sql of sqlsEnOrden) {
    for (const m of sinComentariosSql(sql).matchAll(sentencia)) {
      if (m[1] !== undefined) {
        const nombre = sinComillas(m[1]);
        const tabla = ultimo(m[3]);
        const updateOf = /UPDATE\s+OF\s+([\s\S]*?)$/i.exec(m[2]);
        const columnasUpdate = updateOf
          ? updateOf[1]
              .replace(/\s+OR\s+[\s\S]*$/i, "")
              .split(",")
              .map(sinComillas)
              .filter((c) => c.length > 0)
          : [];
        const argumentos = m[5]
          .split(",")
          .map((a) => a.trim().replace(/^'(.*)'$/, "$1"))
          .filter((a) => a.length > 0);
        vivos.set(clave(tabla, nombre), {
          nombre,
          tabla,
          funcion: ultimo(m[4]),
          argumentos,
          columnasUpdate,
        });
      } else if (m[6] !== undefined) {
        vivos.delete(clave(ultimo(m[7]), sinComillas(m[6])));
      } else if (m[8] !== undefined) {
        const funcion = ultimo(m[8]);
        for (const [k, t] of vivos) if (t.funcion === funcion) vivos.delete(k);
      }
    }
  }
  return vivos;
}

export const FUNCION_MISMA_EMPRESA = "verificar_misma_empresa";
export const FUNCION_SIN_CAMBIO = "impedir_cambio_de_empresa";

/** La FK tiene su trigger vivo, en su tabla, con sus argumentos y su `UPDATE OF`. */
export function fkCubierta(fk: FkDeNegocio, vivos: ReadonlyMap<string, TriggerVivo>): boolean {
  const t = vivos.get(`${fk.tabla}.${nombreTrigger(fk.tabla, fk.columna)}`);
  return (
    t !== undefined &&
    t.funcion === FUNCION_MISMA_EMPRESA &&
    t.argumentos.join("|") === [fk.tablaRef, fk.columna, fk.columnaRef].join("|") &&
    t.columnasUpdate.includes(fk.columna) &&
    t.columnasUpdate.includes("organizacion_id")
  );
}

export function tablaSinCambioCubierta(tabla: string, vivos: ReadonlyMap<string, TriggerVivo>): boolean {
  const t = vivos.get(`${tabla}.${nombreTriggerSinCambio(tabla)}`);
  return t !== undefined && t.funcion === FUNCION_SIN_CAMBIO && t.columnasUpdate.includes("organizacion_id");
}
