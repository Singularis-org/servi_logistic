# CHECKPOINTS.md — Criterios de "estado final correcto"

Una feature solo pasa a `done` si TODO esto se cumple **y** todo lo de
`docs/checkpoints-proyecto.md`, que son los criterios propios del proyecto (perfil). El reviewer
valida contra las dos listas, punto por punto.

## Especificacion
- [ ] Existe `specs/<feature>/requirements.md` con requisitos EARS numerados `R1`, `R2`…
- [ ] Existe `specs/<feature>/design.md` con al menos una alternativa descartada y su porqué.
- [ ] Existe `specs/<feature>/tasks.md` y todas las tasks estan marcadas `[x]`.
- [ ] `specs/<feature>/design.md` abre con `## Lo que ya existe` (busqueda hecha) y el diff no
      re-crea nada de lo listado ahi. Specs escritos desde 2026-10-06
      (`docs/specs.md > Antes de especificar: lo que ya existe`).

## Equipo
- [ ] La feature tiene assignee en Jira y su rama se publico con `wt.sh new` (candado).

## Trazabilidad
- [ ] Cada `R<n>` de requirements.md mapea a al menos un test concreto.
- [ ] `progress/impl_<key>.md` contiene el mapa `R<n> -> test`.

## Calidad de codigo
- [ ] El typecheck pasa sin errores (comando: `docs/checkpoints-proyecto.md > Calidad de codigo`).
- [ ] El lint pasa sin errores.
- [ ] El check `gate-completo` del CI esta en verde en el PR: suite completa sin rojos NUEVOS
      respecto de `tests/baseline-rojos.json` (`docs/gate.md`).
- [ ] Si la feature toca un flujo critico (la lista: `docs/checkpoints-proyecto.md > Flujos
      criticos`), hay al menos un test E2E que lo cubre, y su salida local esta en
      `progress/impl_<key>.md`.
- [ ] Si la feature añadió dependencias, cada una tiene su fila en `docs/dependencias.md`
      con los cuatro checks y la aprobacion humana citada en el `design.md`.

## Seguridad
- [ ] Ningun secreto quedo hardcodeado; todo va por variables de entorno.
- [ ] Webhooks nuevos validan firma/token y son idempotentes.

## Configuracion
- [ ] Nada que cambie entre entornos (URLs, credenciales, limites) quedo hardcodeado;
      todo se resuelve por configuracion o variables de entorno.

## Verificacion final
- [ ] `./init.sh` (rapido) termina en verde en el worktree, y `gate-completo` en verde en CI.
- [ ] `progress/review_<key>.md` existe y su veredicto es OK.
- [ ] `progress/features/<key>.md > Cierre` esta completo (resumen, PR, deudas que deja).
- [ ] El worktree de la feature se desmonto (`./scripts/wt.sh done <key>-<slug>`), o
      quedo anotado en `progress/deudas.md` con la razon
      del HOLD. Lo que no vale es dejarlo ahi en silencio.
