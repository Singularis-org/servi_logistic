// SL-34 (R23) — detector por hash de terminos de una a tres palabras. Lo comparten
// `recursos-origen-fuera.guardia.test.ts` (clases `integrador` y `cliente`) y
// la guardia del integrador heredado (SL-13). Este modulo NO es un test (no casa `*.test.*`):
// importarlo no registra los casos de ninguna guardia.
//
// Ningun valor vive aqui ni en quien lo usa: solo `{ largo, sha256 }` de la forma del termino. Un hash
// de una palabra se puede confirmar con un diccionario: no es cifrado, solo evita publicar el literal.

import { createHash } from "node:crypto";

export interface Termino {
  /** Largo de la forma del termino (`formaDeTermino`). Es un dato inocuo y evita hashear de mas. */
  largo: number;
  /** Hex del SHA-256 de la forma del termino; nunca el valor. */
  sha256: string;
  /** Cuantas palabras tiene la forma, de 1 a `MAX_PALABRAS`. Sin el dato, 1. */
  palabras?: number;
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Los dos tokens `[a-z0-9_-]+` del slug de la ficha SL-13: el slug suelto y `sl-13-<slug>`, que es
 * como sale en la ruta de su spec y en su rama. Es la unica excepcion de R23 (SL-34), temporal hasta
 * que el leader renombre la ficha; la usan las dos guardias.
 */
export const SLUG_SL13: readonly Termino[] = [
  { largo: 12, sha256: "dedc1fd385b538804c40d2fb03a7387a08758573787fcc4eb3884721f1a378d8" },
  { largo: 18, sha256: "403bdb370805bc75e2c5f2b26900cfb92a3dbac27b6aee54dca151ddd07e861d" },
];

/** Hasta cuantas palabras puede tener un termino. */
export const MAX_PALABRAS = 3;

/**
 * La forma con la que se hashea un termino: sus palabras (tramos de `[a-z0-9]` en minusculas; los
 * guiones, puntos, espacios y signos las cortan), unidas por un espacio.
 */
export function formaDeTermino(texto: string): string {
  return (texto.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(" ");
}

/** Cache de hashes por cadena: el universo repite las mismas palabras miles de veces. */
const CACHE = new Map<string, string>();
function hashDe(s: string): string {
  let h = CACHE.get(s);
  if (h === undefined) {
    h = sha256(s);
    CACHE.set(s, h);
  }
  return h;
}

const ES_TOKEN = /[a-z0-9_-]/;

/**
 * Por lista de terminos (su firma), lo que da cada palabra sola: los terminos de una palabra que casan
 * con ella entera o con su principio o su final. Una palabra se repite miles de veces en el universo,
 * y asi se mira una vez.
 */
const POR_PALABRA = new Map<string, Map<string, readonly number[]>>();
const NINGUNO: readonly number[] = [];

export interface AparicionDeTermino {
  /** Linea, desde 1. */
  linea: number;
  /** Indice del termino en la lista recibida. */
  termino: number;
  /** Indice en `exceptuados` del token que la cubre, o -1. */
  exceptuada: number;
}

/**
 * Busca cada termino como n-grama de 1 a `MAX_PALABRAS` palabras consecutivas de una misma linea
 * (`Uno  Dos`, `uno-dos`, `(Uno ~ Dos)` y `Uno. Dos` dan la forma `uno dos`). Un termino de una
 * palabra tambien cuenta pegado al principio o al final de otra (`<termino>test`, `x<termino>`); en
 * medio de una palabra no. Si el token `[a-z0-9_-]+` entero que contiene la aparicion es uno de
 * `exceptuados` (un slug, por ejemplo), sale marcada con su indice. Devuelve
 * `{linea, termino, exceptuada}` unicos y en orden; nunca el valor.
 */
export function aparicionesDeTerminos(
  texto: string,
  terminos: readonly Termino[],
  exceptuados: readonly Termino[] = [],
): AparicionDeTermino[] {
  const salida: AparicionDeTermino[] = [];
  if (terminos.length === 0) return salida;
  // porLargo[n - 1]: largo -> sha256 -> indice, para los terminos de n palabras.
  const porLargo = Array.from({ length: MAX_PALABRAS }, () => new Map<number, Map<string, number>>());
  terminos.forEach((t, i) => {
    const n = t.palabras ?? 1;
    if (n < 1 || n > MAX_PALABRAS) throw new Error(`termino ${i}: palabras fuera de 1..${MAX_PALABRAS}`);
    const m = porLargo[n - 1];
    if (!m.has(t.largo)) m.set(t.largo, new Map());
    m.get(t.largo)!.set(t.sha256, i);
  });
  const [deUna, deDos, deTres] = porLargo;
  const largosDeUna = [...deUna.keys()];
  const minimoDeUna = largosDeUna.length > 0 ? Math.min(...largosDeUna) : Infinity;
  const min = texto.toLowerCase();
  const vistos = new Set<string>();

  const exceptuadaEn = (inicio: number, fin: number) => {
    if (exceptuados.length === 0) return -1;
    let a = inicio;
    while (a > 0 && ES_TOKEN.test(min[a - 1])) a--;
    let b = fin;
    while (b < min.length && ES_TOKEN.test(min[b])) b++;
    const token = min.slice(a, b);
    return exceptuados.findIndex((e) => e.largo === token.length && e.sha256 === hashDe(token));
  };
  const anotar = (termino: number, inicio: number, fin: number, linea: number) => {
    const a = { linea, termino, exceptuada: exceptuadaEn(inicio, fin) };
    const k = `${a.linea}\0${a.termino}\0${a.exceptuada}`;
    if (vistos.has(k)) return;
    vistos.add(k);
    salida.push(a);
  };

  const firma = terminos.map((t) => `${t.palabras ?? 1}:${t.largo}:${t.sha256}`).join(",");
  if (!POR_PALABRA.has(firma)) POR_PALABRA.set(firma, new Map());
  const porPalabra = POR_PALABRA.get(firma)!;
  const deLaPalabra = (palabra: string): readonly number[] => {
    let r = porPalabra.get(palabra);
    if (r !== undefined) return r;
    const casan = new Set<number>();
    const probar = (forma: string) => {
      const t = deUna.get(forma.length)?.get(hashDe(forma));
      if (t !== undefined) casan.add(t);
    };
    if (deUna.has(palabra.length)) probar(palabra);
    for (const l of largosDeUna) {
      if (l >= palabra.length) continue;
      probar(palabra.slice(0, l));
      probar(palabra.slice(-l));
    }
    r = casan.size === 0 ? NINGUNO : [...casan];
    porPalabra.set(palabra, r);
    return r;
  };

  // Barrido a mano, caracter a caracter: es el bucle caliente de las guardias sobre todo el arbol.
  // [p1i, p1f) y [p2i, p2f) son las dos palabras anteriores de la misma linea (-1 si no hay), para
  // los n-gramas. Las palabras se recortan del texto solo cuando su largo puede casar.
  let p1i = -1;
  let p1f = -1;
  let p2i = -1;
  let p2f = -1;
  let linea = 1;
  let inicio = -1;
  for (let i = 0; i <= min.length; i++) {
    const c = i < min.length ? min.charCodeAt(i) : 10;
    if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
      if (inicio === -1) inicio = i;
      continue;
    }
    if (inicio !== -1) {
      const largo1 = i - inicio;
      // Una palabra mas corta que todos los terminos de una palabra no casa sola ni pegada.
      if (largo1 >= minimoDeUna) for (const t of deLaPalabra(min.slice(inicio, i))) anotar(t, inicio, i, linea);
      if (p1i !== -1) {
        const largo2 = p1f - p1i + 1 + largo1;
        const de2 = deDos.get(largo2);
        if (de2) {
          const t = de2.get(hashDe(`${min.slice(p1i, p1f)} ${min.slice(inicio, i)}`));
          if (t !== undefined) anotar(t, p1i, i, linea);
        }
        const de3 = p2i === -1 ? undefined : deTres.get(p2f - p2i + 1 + largo2);
        if (de3) {
          const t = de3.get(hashDe(`${min.slice(p2i, p2f)} ${min.slice(p1i, p1f)} ${min.slice(inicio, i)}`));
          if (t !== undefined) anotar(t, p2i, i, linea);
        }
      }
      p2i = p1i;
      p2f = p1f;
      p1i = inicio;
      p1f = i;
      inicio = -1;
    }
    // Un salto de linea corta el n-grama.
    if (c === 10) {
      linea++;
      p1i = -1;
      p2i = -1;
    }
  }
  return salida.sort((a, b) => a.linea - b.linea || a.termino - b.termino || a.exceptuada - b.exceptuada);
}
