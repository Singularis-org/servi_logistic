# SL-10 «Gate en verde: CRLF y guardias rojas heredadas» — Review

Reviewer, 2026-10-21. Rama `feature/SL-10-gate-verde-heredado`, HEAD `1fc5eb4`, merge-base con `dev`
`bb2d983`. El diff se leyó con `git diff dev...HEAD` (tres puntos). `dev` avanzó a `60befb1`, que solo
toca `docs/plan-saas.md`. La rama no toca ese archivo: con dos puntos parecía que borraba las
decisiones 4 a 6, pero no es así, y al integrar no hay conflicto.

MCP del grafo: no se usó. El diff es de tests, config y SQL, y se revisó con Grep/Read.

## Verificación ejecutada por el reviewer

- `pnpm run typecheck` → exit 0.
- `pnpm exec eslint` sobre los 9 archivos de test y fixture tocados → exit 0.
- `pnpm exec vitest run` sobre las 3 guardias nuevas, las 6 adaptadas, `push-alta-punto-unico`,
  `push-config`, `sinpe-sin-variables-de-entorno` y las dos de `tests/guards/` (R2, R6) →
  `Test Files 13 passed (13)`, `Tests 135 passed (135)`.
- Logs del implementer leídos en `_trabajo/`:
  - `gate-worktree-despues.log`: `✓ todas las migraciones tienen down.sql`, `== init OK ==` e
    `INIT_EXIT=0`.
  - `gate-worktree-rojo-forzado.log`: `rojos NUEVOS (fuera del baseline): tests/unit/guards/html-lang.guardia.test.ts`
    e `INIT_EXIT=1`.
  - `gate-worktree-antes.log`: los 4 archivos del baseline salen `FAIL`. Son entradas medidas.
- R17: crucé las rutas del diff con `arnes.manifest` y no hay ninguna coincidencia.
- R16: crucé el diff con `specs/` y solo aparece `specs/SL-10-gate-verde-heredado/`. Fuera de
  `.env.example`, `specs/` y `progress/`, el diff no añade ni quita ningún literal de SINPE, colones,
  Costa Rica o provincia.
- `.env.example`, comprobado línea a línea:
  - 35 líneas `NOMBRE=` sin valor;
  - fuera de las líneas vacías, los comentarios y los `NOMBRE=`, no queda ninguna;
  - es idéntico a la copia del checkout principal, salvo la cabecera de 7 líneas y una línea en blanco;
  - el blob es `i/lf`.
- Recursos de Ordenex: los refs Supabase `scfnwx…` y `uyqzq…` no aparecen ni en el diff ni en los
  `.env*` del checkout principal.
- `down.sql` contra `migration.sql`: comparados sentencia a sentencia.
  - `ruta_optimizada_trazado`: 4 `ADD COLUMN` y 4 `DROP COLUMN` en orden inverso.
  - `ruta_parada_tramo`: 3 y 3, en orden inverso.
  - `ruta_tramo_vivo_at`: 1 y 1.
  - Ningún `migration.sql` cambia.
  - No queda ninguna migración sin `down.sql`.

## Checklist

### Trazabilidad (R → test)
- [x] R1: `finales-de-linea-lf.guardia.test.ts`. Tiene un caso sintético que muerde y el barrido de
  `init.sh`, `scripts/*.sh` y `scripts/*.mjs`. Como el nombre contiene «guard», la selecciona `gate.siempre`.
- [x] R2: las dos guardias de `tests/guards/` pasan en LF sin que se toque su código. Están en verde
  en mi corrida.
- [x] R3, R4: `gate-cableado-arnes-v2.guardia.test.ts`. Los dos scripts se afirman como literales de
  contrato, y `git check-ignore` cubre los dos archivos.
- [x] R5, R21 (baseline): `erroresDelBaseline` exige motivo de 40 caracteres o más con `SL-<n>`,
  `desde` en `AAAA-MM-DD` y una ruta que exista, y tiene un fixture que muerde. No fija la lista.
- [x] R6: `guard-test-rapido-rojos-heredados` más el rojo forzado, con log e `INIT_EXIT=1` nombrando
  el archivo.
- [x] R7: los tres archivos están borrados y nada los importa. `test-citado-desaparecido` sigue en
  verde. Quedan dos comentarios que los citan (ver m4).
- [x] R8: se mantienen las autocomprobaciones del derivador y del lector, y el bucle. Se quitaron solo
  las tres aserciones de suficiencia, y el comentario cita SL-30.
- [x] R9: `perfiles` está en `INVENTARIO_DE_RAICES`, y el censo espera exactamente 11 entradas
  (10 raíces más `(raiz)`).
- [x] R10: los literales coinciden con `public/manifest.json`: «Servi Logistic», la descripción,
  `#111111` y `#F7F7F5`. Ninguno dice «Ordenex».
- [x] R11: se añaden a la lista blanca `docs/limpieza-ordenex.md`, por archivo, y
  `specs/SL-10-gate-verde-heredado/`, por prefijo. Las dos altas citan SL-27, y fuera de ellas la
  guardia sigue mordiendo.
- [x] R12: la guardia ignora la carpeta `.worktrees` y el archivo `.vitest-rojos.json` por nombre.
  Que muerde lo demostró la corrida del implementer.
- [x] R13: `desaparecidas()` es pura y tiene un conocido-positivo con mapa sintético.
  `quejaDeClonSuperficial()` muerde con `"true"`. `gate.yml` usa `fetch-depth: 0`.
- [x] R14: gate de cierre en el worktree con `INIT_EXIT=0`, según el log.
- [ ] R15: pendiente del leader (T13), después de integrar. No es hallazgo.
- [x] R16, R17: comprobados con el diff (arriba).
- [x] R18: `git ls-files .env.example` está en la guardia. La otra mitad, que el resto de `.env*`
  siga ignorado, solo tiene la corrida manual (m2).
- [x] R19: `lineasConValor` y `mensajeSinValores`. El mensaje da el número de línea sin el valor, y
  un caso lo prueba.
- [x] R20: `push-config.test.ts` y `sinpe-sin-variables-de-entorno` pasan en el worktree.
- [x] R21: el baseline cita SL-29, SL-13 y SL-11; `no-embalaje`, SL-27; la cabecera de
  `.env.example`, SL-14 y SL-11. Lo de Costa Rica dice «fase 3» (m3).
- [x] R22: los tres `down.sql` revierten exactamente su `migration.sql`, el paso 7 está en verde y
  hay verificación en una base temporal.

### CHECKPOINTS.md
- [x] `requirements.md` está en EARS, con R1 a R22 numerados.
- [x] `design.md` tiene alternativas descartadas (A a F) con su porqué.
- [x] `tasks.md`: T0 a T12 están en `[x]`. T13 es del leader después de integrar, y es la misma R15.
- [x] `design.md` abre con `## Lo que ya existe`, con contenido, y el diff no re-crea nada de esa
  lista: conecta `test-rapido.mjs` y el comparador, y reutiliza `.gitattributes`.
- [ ] Assignee en Jira y `wt.sh new`: los verifica el leader. No lo verifiqué aquí.
- [x] `progress/impl_SL-10.md` contiene el mapa R → test.
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: todavía no hay PR. Es del leader.
- [x] No toca ningún flujo crítico, así que no hace falta E2E.
- [x] No entra ninguna dependencia nueva.
- [x] No hay secretos: `.env.example` no lleva valores y lo vigila una guardia.
- [x] No hay nada hardcodeado entre entornos.
- [ ] `progress/features/SL-10.md > Cierre` y el desmontaje del worktree: los hace el leader al cerrar.

### docs/checkpoints-proyecto.md
- [x] Typecheck, lint y `./init.sh` en verde en el worktree (log).
- [x] La feature no trae tablas ni queries de negocio nuevas.
- [x] Migraciones: la feature no crea ninguna. Añade `down.sql` a tres heredadas sin editar su
  `migration.sql`.
- [x] Recursos de Ordenex: no hay ningún Supabase, Vercel ni llave. El email de soporte de origen sí
  entra, como comentario de `.env.example`: es la excepción temporal que pactó el humano, la retira
  SL-14 (m1).
- [x] No hay ningún `console.log` de secretos.
- [x] Las secciones de arquitectura y permisos no aplican: solo se tocan tests, gate y SQL de rollback.

### docs/perfil-agentes.md > reviewer
- [x] No hay ninguna tabla nueva sin `organizacion_id` ni sin RLS. No queda ninguna migración sin `down.sql`.
- [x] El código nuevo no tiene literales de país ni de moneda. Los de `.env.example` son comentarios
  heredados que se conservan por decisión del humano (R16).
- [x] No hay ninguna referencia nueva a recursos de Ordenex. El dominio en un comentario es la
  excepción temporal de m1.
- [x] Ninguna dependencia nueva.
- [x] Los comentarios explican el porqué: el motivo de cada alta, el porqué del bucle sin sujetos, la
  trampa de `.vitest-rojos.json`.

## Hallazgos

Ninguno es BLOQUEANTE.

- **m1 — menor.** `.env.example` (líneas 5 y 172) versiona el email de soporte de origen en un comentario.
  `docs/checkpoints-proyecto.md` dice «ningún dominio de origen en el diff», pero la decisión 6
  del humano y R16/R21 lo admiten como excepción temporal, con SL-14 citada en la cabecera. Se
  registra para que SL-14 lo retire y no se olvide.
- **m2 — menor.** La segunda mitad de R18 («`.gitignore` sigue ignorando cualquier otro `.env*`»)
  solo tiene la corrida manual `git check-ignore .env.local`, como prevé la tabla de trazabilidad del
  spec. Como el repo será público, una regresión en `.gitignore` (por ejemplo, un `!.env*`) no la
  pararía ningún test. Sugerencia barata: que `env-example-sin-valores` afirme también
  `git check-ignore .env .env.local`.
- **m3 — menor.** La cabecera de `.env.example` dice que los comentarios sobre SINPE y Costa Rica
  los retira la «fase 3», y eso no es una ficha `SL-<n>`. R21 solo lo exige para la mención a Ordenex,
  así que cumple el spec. Pero la regla del humano pide la ficha que retira cada excepción: cuando
  exista la ficha de la fase 3, conviene citarla.
- **m4 — menor.** `docs/architecture.md:157-159` todavía dice «Deuda conocida: tres migraciones
  heredadas no traen `down.sql`». R22 la saldó y la frase quedó falsa. Hay que quitarla o pasarla a
  pasado.
- **m5 — menor, informativo.** `tests/fixtures/dto-financiero-servido.ts:59` y
  `tests/unit/guards/tablero-doble-vs-servicio.guardia.test.ts:47` citan en comentarios
  `tablero-lineas-trazabilidad.guardia.test.ts`, que ya está retirada. El spec lo deja fuera a
  propósito (SL-15 / SL-16): solo hay que anotarlo para esas fichas.

## Veredicto

**OK.** No hay bloqueantes. R15 (T13), el CI `gate-completo`, Jira y el Cierre quedan a cargo del leader.
