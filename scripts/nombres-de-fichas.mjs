/**
 * Una key de ficha nunca va sola en lo que lee el humano: siempre `<key> «<title>»`
 * (`docs/jira.md > Cómo se nombra una ficha`, `CLAUDE.md` regla 9).
 *
 * Lo usa el hook Stop (`.claude/hooks/fin-de-turno.mjs`) sobre el último mensaje del agente. Si
 * nombra una key sin su título, el hook añade debajo del mensaje una nota con los títulos de la
 * copia del board. El 2026-11-07 el humano pidió que fuera obligatoria porque «ya hice la SL-50» no
 * le decía qué tarea era; el 2026-11-10 pidió que dejara de bloquear porque cada bloqueo le
 * duplicaba la respuesta.
 *
 * Qué NO cuenta como mención suelta, a propósito:
 *   - lo que va en código (bloques ``` y `inline`): rutas, comandos y ramas (`specs/PROY-14-x`);
 *   - una key pegada a `/` o seguida de `-<palabra>`: es parte de una ruta o una rama, no una
 *     mención (`feature/PROY-14-modelo`);
 *   - una key que no es de este board: `UTF-8`, `SHA-256` o `ISO-8601` tienen la misma forma. Se
 *     reconoce por estar en la copia del board o por llevar uno de los prefijos del tracker.
 *
 * Sin dependencias y sin efectos: lo importan el hook y su guardia.
 */

const KEY = /[A-Z][A-Z0-9]*-\d+/g;

/** El texto sin bloques de código ni código en línea: lo que va ahí es literal, no prosa. */
export function sinCodigo(texto) {
  return String(texto ?? '')
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
}

/**
 * Keys de este board que no llevan su título en NINGUNA mención de `texto`. Basta con una mención
 * `<key> «<title>»` por mensaje: las siguientes de esa key pueden ir solas (decisión del humano,
 * 2026-11-10: el hook corre cuando el humano ya ve el mensaje y cada bloqueo se lo duplicaba).
 * @param {string} texto el mensaje del agente
 * @param {{ titulos?: Map<string, string>, prefijos?: string[] }} board
 *   `titulos`: key -> title de la copia del board; `prefijos`: los del tracker (`tracker.prefijo`,
 *   `prefijos_historicos` o `jira.project`).
 * @returns {string[]} las keys sueltas, sin repetir y en orden de aparición
 */
export function keysSinTitulo(texto, { titulos = new Map(), prefijos = [] } = {}) {
  const prosa = sinCodigo(texto);
  const esDelBoard = (k) => titulos.has(k) || prefijos.includes(k.slice(0, k.lastIndexOf('-')));
  const sueltas = [];
  const conTitulo = new Set();
  for (const m of prosa.matchAll(KEY)) {
    const key = m[0];
    const antes = prosa[m.index - 1] ?? '';
    const despues = prosa.slice(m.index + key.length);
    if (/[A-Za-z0-9/_.-]/.test(antes)) continue; // parte de una palabra, ruta o rama
    if (/^-[A-Za-z]/.test(despues) || /^[A-Za-z0-9]/.test(despues)) continue; // rama o carpeta
    if (!esDelBoard(key)) continue;
    if (/^\s*«/.test(despues)) conTitulo.add(key); // va como `<key> «<title>»`
    else if (!sueltas.includes(key)) sueltas.push(key);
  }
  return sueltas.filter((k) => !conTitulo.has(k));
}

/**
 * La nota que el hook deja debajo del mensaje cuando faltan títulos: el humano la lee y sabe de qué
 * ficha se habla sin abrir el board. No bloquea (2026-11-10): el hook corre cuando el humano ya ve
 * el mensaje y un bloqueo se lo duplicaba entero.
 */
export function notaDeTitulos(sueltas, titulos = new Map()) {
  const lineas = sueltas.map((k) => (titulos.has(k) ? `${k} «${titulos.get(k)}»` : `${k} (sin título en feature_list.json)`));
  return `Fichas nombradas sin título (regla 9): ${lineas.join('; ')}.`;
}
