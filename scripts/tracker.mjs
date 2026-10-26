/**
 * El tracker del repo, resuelto en un solo sitio (`docs/jira.md`, `docs/trello.md`).
 *
 * `arnes.config.json > tracker` manda. Si existe, el bloque `jira` NO se lee: mezclar los dos
 * daria un prefijo de un tracker con los estados del otro. Sin `tracker`, el bloque `jira`
 * antiguo equivale a `tipo: "jira"` con `prefijo = jira.project` y `estados = jira.estados`,
 * asi que un perfil anterior a la 2.8.0 se valida exactamente igual que antes.
 *
 * Lo importan el validador, el chequeo del perfil, el sync, el hook de arranque y el cliente de
 * Trello. Antes cada uno tenia su copia y ya divergian (`estados` `{}` en una, `undefined` en otra).
 * Sin dependencias y sin efectos: se puede importar desde cualquier script del arnes.
 */

// Los trackers que el arnes sabe importar.
export const TIPOS_TRACKER = ['jira', 'trello'];

// La identidad local que escribe `/tracker-connect` en `.arnes.local.json`, segun el tipo.
export const CAMPO_IDENTIDAD = { jira: 'jira_account_id', trello: 'trello_member_id' };

/**
 * `etiqueta` es la ruta que se nombra en los mensajes (`tracker` o `jira`), para que un error
 * apunte a lo que esta escrito en el perfil. `respaldoJira` es el bloque `jira` de un
 * `feature_list.json` anterior a v2, solo para el validador. `estados` queda `undefined` si el
 * perfil no lo declara: el validador distingue "no declarado" de "declarado vacio".
 */
export function resolverTracker(config, respaldoJira) {
  const t = config?.tracker;
  if (t !== undefined && t !== null) {
    return {
      etiqueta: 'tracker',
      tipo: t.tipo,
      site: t.site,
      board: t.board,
      prefijo: t.prefijo,
      historicos: Array.isArray(t.prefijos_historicos) ? t.prefijos_historicos : [],
      estados: t.estados,
    };
  }
  const j = config?.jira ?? respaldoJira;
  return {
    etiqueta: 'jira',
    tipo: 'jira',
    site: j?.site,
    board: undefined,
    prefijo: j?.project,
    historicos: [],
    estados: j?.estados,
  };
}

/** Campo de `.arnes.local.json` que identifica a la persona en este tracker. */
export const campoIdentidad = (tipo) => CAMPO_IDENTIDAD[tipo] ?? CAMPO_IDENTIDAD.jira;

/** Nombre del tracker para los mensajes al humano. */
export const nombreTracker = (tipo) => (tipo === 'trello' ? 'Trello' : 'Jira');
