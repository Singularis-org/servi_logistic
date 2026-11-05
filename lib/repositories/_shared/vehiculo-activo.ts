/**
 * SL-42 (design §4.5; R18) — «el tipo de vehiculo se puede elegir», EN UN SOLO SITIO.
 *
 * `vehiculos.activo` es el segundo `activo` booleano del esquema, despues del de los tres niveles
 * geograficos. No comparte regla con ellos: un vehiculo no tiene ascendientes, asi que su
 * disponibilidad es su propio flag y nada mas. Por eso no pasa por `_shared/geografia-activa.ts`.
 *
 * Sigue la misma disciplina que aquel: el recorte vive aqui y los repositorios lo importan
 * (`VehiculoRepository.findMany({ soloActivos })`, la validacion de la postulacion). Dos copias
 * serian dos reglas que un dia divergen. Lo vigila
 * `tests/unit/guards/geografia-predicado-unico.guardia.test.ts`, que admite este archivo como la
 * fuente del flag de vehiculos y nada mas.
 *
 * Sin `@prisma/client`, como su hermano: el fragmento es un literal que Prisma acepta
 * estructuralmente.
 */

/** El `where` de los tipos que se pueden ofrecer para una eleccion nueva (R18). */
export const WHERE_VEHICULO_ELEGIBLE = { activo: true } as const;
