# Review SL-12 «Fuera backfills de Ordenex»

Rama `feature/SL-12-fuera-backfills-ordenex`, HEAD `a42787b`, diff `dev...HEAD` (8 commits, 18 archivos).
Reviewer, 2026-10-21. MCP del grafo no usado: el cambio es borrado de archivos y censos por ruta; todo se
verificó con Grep/Read y ejecutando tests.

Respuestas del humano al spec (vía leader): `contraste-454`, `medir-462`, `rollup-analitica-manual` y
`drenar-jobs` no se tocan; `bench` se queda; los servicios sin ejecutable se quedan; se retira
`backfill-analitica.ts`. El diff es coherente con las cuatro.

## Verificación que corrí yo

- `vitest run` sobre `backfills-retirados.guardia`, `backfill-guards`, `caja-173-alcance.guardia`,
  `test-citado-desaparecido.guardia`, `cache-invalidacion-backfill`, `fallo-config-geocode` y
  `export-financiero-frontera.guardia`: 7 archivos, 123 tests, todos verdes.
- `pnpm run typecheck`: exit 0.
- eslint sobre los 5 archivos tocados: 0 errores, 1 warning previo (`_opts`, línea 64 de
  `cache-invalidacion-backfill.test.ts`), no introducido aquí.
- Mutación R3/R11: `lib/mutacion-review-sl12.ts` con `import … from "@/scripts/backfill-caja-tesoreria"`
  pone en rojo el caso 2 de la guardia nueva nombrando el archivo. Revertida.
- Mutación R7: import de `AnaliticaBackfillService` en `lib/services/AnaliticaOperativaService.ts` pone
  en rojo «un consumidor externo solo puede importar el planificador puro, nunca el servicio»
  (1 failed | 20 passed). Revertida; `git status` limpio.
- Grep de las rutas retiradas fuera de `specs/` y `progress/`: solo `docs/limpieza-ordenex.md` §2/§3
  (inventario medido que el design manda no reescribir) y `app/api/cron/backfill-analitica/route.ts`
  en un test de export, que no contiene `scripts/backfill-…` ni es uno de los scripts.
- `tests/baseline-rojos.json`, `package.json`, configs de vitest y `.github/`: ninguna referencia a los
  archivos borrados.
- Cruce del diff con `arnes.manifest`: 0 coincidencias.
- Diff de `lib/geo/fallo-config-geocode.ts`: solo líneas de comentario JSDoc.
- Ninguno de los seis scripts hermanos ni de los módulos de `lib/` de «Lo que NO entra» (salvo el
  comentario anterior) aparece en el diff. Ningún `specs/` fuera de SL-12.
- `@test-desaparecido`: solo aparece en prosa del spec y la bitácora; ninguna anotación nueva.
- Finales de línea: LF en los seis archivos nuevos o tocados de texto.
- `git merge-base --is-ancestor 50e0930 HEAD` = 0 (SL-10 integrada antes de empezar).

## Trazabilidad

| Req | Test | Verificado |
|---|---|---|
| R1 | `backfills-retirados.guardia` › caso 1 | sí, verde; mutación de T6 en bitácora |
| R2 | `backfills-retirados.guardia` › caso 3 | sí, verde; no vacuidad > 10 migraciones |
| R3 | `backfills-retirados.guardia` › caso 2 | sí, verde; mutación propia en rojo |
| R4 | `backfills-retirados.guardia` › caso 2 (texto crudo, comentarios incluidos) | sí |
| R5 | `caja-173-alcance.guardia` › insumos y CIERRE | sí, verde; mutación de T4 en bitácora |
| R6 | `backfill-guards` › «las tres rutas censadas existen» y R2–R33 | sí, verde |
| R7 | `backfill-guards` › consumidor externo | sí, mutación propia en rojo |
| R8 | diff contra `dev` | sí, solo comentario en `lib/geo/fallo-config-geocode.ts` |
| R9 | diff contra `dev` | sí, ningún hermano tocado |
| R10 | diff contra `dev` + `arnes.manifest` | sí |
| R11 | `backfills-retirados.guardia` › casos 1 y 2 | sí |
| R12 | `test-citado-desaparecido.guardia` con el borrado commiteado | sí, verde |
| R13 | diff de `docs/limpieza-ordenex.md` | sí, una fila, «Hecho (SL-12)» + comprobación |
| R14 | `./init.sh` en el worktree | bitácora: `INIT_EXIT=0`, 283 archivos / 3797 tests. No lo corrí (instrucción del leader) |

## Checklist `CHECKPOINTS.md`

- [x] requirements.md con R1–R14 en EARS.
- [x] design.md con alternativas descartadas (A–D) y su porqué.
- [x] tasks.md con T0–T8 en `[x]`.
- [x] design.md abre con `## Lo que ya existe`; el diff no re-crea nada de esa lista (solo borra y acota
      dos guardias existentes; la guardia nueva no duplica ninguna).
- [~] Equipo: assignee en Jira y rama por `wt.sh new`: no verificable desde el worktree (no hay remoto
      publicado; el repo trabaja sin push). Lo comprueba el leader.
- [x] Cada R<n> mapea a un test o comprobación concreta.
- [x] `progress/impl_SL-12.md` tiene el mapa R<n> → test.
- [x] Typecheck sin errores.
- [x] Lint sin errores (en archivos tocados; el gate de la bitácora da `lint paso`).
- [ ] `gate-completo` en CI: pendiente del PR. Riesgo bajo: se borran 5 tests y ninguno está en el
      baseline.
- [x] Flujo crítico: no toca ninguno; no aplica E2E.
- [x] Dependencias: ninguna.
- [x] Secretos y configuración: nada nuevo.
- [x] `./init.sh` verde en el worktree (según bitácora, con `INIT_EXIT` dentro del log).
- [ ] Cierre en `progress/features/SL-12.md` y desmontar el worktree: tarea del leader.

## Checklist `docs/checkpoints-proyecto.md`

- [x] Typecheck, lint, init en verde (ver arriba).
- [x] Flujos críticos: no aplica.
- [x] Datos y seguridad: sin tablas, queries ni migraciones nuevas. Ningún recurso de Ordenex en el
      diff: el diff RETIRA código de Ordenex; el texto «Ordenex» que añade es prosa del spec y el aviso
      de la guardia, no un recurso (Supabase, Vercel, llaves, dominio).
- [x] Sin `console.log` nuevo.
- [x] Arquitectura y permisos: no aplica (no hay lógica nueva).

## Reglas de `docs/perfil-agentes.md > reviewer`

- [x] Sin `organizacion_id`/RLS/`down.sql` que aplicar; sin literales de país en código nuevo.
- [x] Sin dependencia nueva.
- [x] Comentarios: explican el porqué (idempotencia en `fallo-config-geocode`, no vacuidad y alcance en
      la guardia nueva).

## Hallazgos

1. **menor — el commit `c9b03a7` deja rojo el árbol de la rama.** En ese commit fallan
   `backfill-guards` (ENOENT del script en el censo), `caja-173-alcance` (misma causa) y el caso 2 de la
   guardia nueva (citas de D2–D4), hasta `d91ba76` (T5). Contradice la letra del «Hecho» de T1 («para que
   ningún commit de la rama la deje en rojo»), que está marcado `[x]`. No es bloqueante:
   - ninguna regla del proyecto exige verde por commit (`docs/conventions.md > Commits` pide un commit por
     task, y el orden T2 → T3/T4/T5 del propio tasks.md hace inevitable el intermedio rojo);
   - se integra con `merge --no-ff`, así que la primera línea de `dev` solo ve el merge, que está verde, y
     un `git bisect --first-parent` no cae nunca en `c9b03a7`;
   - el implementer lo declaró en la bitácora en vez de ocultarlo.
   Para la próxima ficha de este tipo: el spec debería agrupar el borrado con el ajuste de los censos que
   lo leen por ruta, o no prometer «ningún commit en rojo».
2. **menor — las preguntas abiertas siguen abiertas en el spec.** `requirements.md > Preguntas abiertas`
   no recoge las respuestas del humano (hermanos se quedan, `bench` se queda, servicios se quedan,
   `backfill-analitica.ts` se retira). Conviene pasarlas a «Decisiones cerradas» o a
   `progress/features/SL-12.md` para que la ficha no parezca pendiente de decisión.
3. **menor — comentario con referencia a la ficha.** `caja-173-alcance.guardia.test.ts` dice «(su
   ejecutable lo retiro SL-12)». Es historia, no porqué; el git log ya lo cuenta. No afecta a nada.

## Veredicto

**OK** — 0 bloqueantes, 3 menores.
