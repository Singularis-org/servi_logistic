/**
 * Una key de ficha nunca va sola en lo que lee el humano: siempre `<key> «<title>»`
 * (`docs/jira.md > Cómo se nombra una ficha`, `CLAUDE.md` regla 9).
 *
 * Lo usa el hook Stop (`.claude/hooks/fin-de-turno.mjs`) sobre el último mensaje del agente. Si
 * nombra una key sin su título, el hook bloquea el cierre del turno y le pide reescribir el mensaje,
 * dándole ya los títulos de la copia del board. Es una regla con verificador, no una nota: el
 * 2026-11-07 el humano pidió que fuera obligatoria porque «ya hice la SL-50» no le decía qué tarea
 * era.
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
 * Keys de este board nombradas sin su título en `texto`.
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
  for (const m of prosa.matchAll(KEY)) {
    const key = m[0];
    const antes = prosa[m.index - 1] ?? '';
    const despues = prosa.slice(m.index + key.length);
    if (/[A-Za-z0-9/_.-]/.test(antes)) continue; // parte de una palabra, ruta o rama
    if (/^-[A-Za-z]/.test(despues) || /^[A-Za-z0-9]/.test(despues)) continue; // rama o carpeta
    if (!esDelBoard(key)) continue;
    if (/^\s*«/.test(despues)) continue; // ya va como `<key> «<title>»`
    if (!sueltas.includes(key)) sueltas.push(key);
  }
  return sueltas;
}

/** El motivo que lee el agente cuando el hook bloquea: con los títulos que se conocen. */
export function motivoDeBloqueo(sueltas, titulos = new Map()) {
  const lineas = sueltas.map((k) => (titulos.has(k) ? `${k} «${titulos.get(k)}»` : `${k} «<su title en feature_list.json>»`));
  return (
    `Nombraste ${sueltas.join(', ')} sin su título. Regla 9 de CLAUDE.md: una key nunca va sola en lo que lee ` +
    `el humano, va como <key> «<title>». Reescribe tu último mensaje entero usando: ${lineas.join('; ')}.`
  );
}
