# CHECKPOINTS.md — Criterios de "estado final correcto"

Una feature solo pasa a `done` si TODO esto se cumple **y** todo lo de
`docs/checkpoints-proyecto.md`, que son los criterios propios del proyecto (perfil). El reviewer
valida contra las dos listas, punto por punto.

## Ruta
- [ ] La ruta de la feature (`ruta:` en la tarjeta; sin label, la completa) respeta el suelo de
      `docs/specs.md > Tres rutas`. Si el diff toca dinero, permisos, autenticacion,
      integraciones externas o webhooks, o la `complexity` es `high`, la ruta es la completa.

## Especificacion
Segun la ruta (`docs/specs.md > Tres rutas`):
- **Directa:** sin spec. El PR dice que cambio y con que test se prueba, y ese test fallaba antes
  del arreglo.
- **Ligera:** existe `specs/<feature>/requirements.md` con alcance, requisitos EARS `R1`…,
  `## Tasks` (todas `[x]`) y `## Archivos esperados`.
- **Completa:**
  - [ ] Existe `specs/<feature>/requirements.md` con requisitos EARS numerados `R1`, `R2`…
  - [ ] Existe `specs/<feature>/design.md` con al menos una alternativa descartada y su porqué.
  - [ ] Existe `specs/<feature>/tasks.md` y todas las tasks estan marcadas `[x]`.
  - [ ] `specs/<feature>/design.md` abre con `## Lo que ya existe` (busqueda hecha) y el diff no
        re-crea nada de lo listado ahi. Specs escritos desde 2026-10-06
        (`docs/specs.md > Antes de especificar: lo que ya existe`).

## Tamano del PR
- [ ] `node scripts/tamano-pr.mjs` no pasa del maximo de `gate.tamano_pr`, o `progress/features/<key>.md`
      lleva la aceptacion humana `<!-- tamano-pr-aceptado: AAAA-MM-DD · <motivo> -->`
      (`docs/gate.md > Tamaño del PR`).

## Equipo
- [ ] La feature tiene assignee en el tracker y su rama se publico con `wt.sh new` (candado).

## Trazabilidad
- [ ] Cada `R<n>` de requirements.md mapea a al menos un test concreto (en la ruta directa: el
      test que reproduce el fallo).
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
- [ ] `progress/review_<key>.md` existe y su veredicto es OK (rutas ligera y completa; en la directa
      revisa el humano en el PR).
- [ ] `progress/features/<key>.md > Cierre` esta completo (resumen, PR, deudas que deja).
- [ ] El worktree de la feature se desmonto (`./scripts/wt.sh done <key>-<slug>`), o
      quedo anotado en `progress/deudas.md` con la razon
      del HOLD. Lo que no vale es dejarlo ahi en silencio.
