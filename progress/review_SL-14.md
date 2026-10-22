# Review SL-14 «Dominio de origen a configuración»

Reviewer, 2026-10-22. Worktree `.worktrees/SL-14-dominio-a-configuracion`, rama
`feature/SL-14-dominio-a-configuracion`, HEAD revisado `e3cb12a`, diff `dev...HEAD` (42 archivos).
En esta sesión no tenía el MCP del grafo: trabajé con Grep, Read y corridas.

## Corridas propias

| Corrida | Resultado |
|---|---|
| `vitest run` sobre la guardia nueva, `push-config`, `plantilla-datos`, `informe-aviso-interno`, `openapi-406`, `openapi-webhook-estado-actualizado` (paridad TS↔YAML), `webhook-estado-service`, `no-embalaje`, `env-example-sin-valores`, `pwa-push` y `linkificar` | 11 archivos, 241 passed, EXIT=0 |
| `vitest run` sobre `push-action`, `jobs-handler-por-tipo` y `push-web-service` (ponen claves VAPID sin subject) | 3 archivos, 52 passed |
| `pnpm run typecheck` | TC_EXIT=0 |
| `eslint` sobre los `.ts/.tsx` del diff | 0 errores, 14 warnings heredados (`_u`, `_owner`…) en líneas que el diff no toca |
| **Mutación 1:** añado a `lib/utils/linkificar.ts` una línea con el email de soporte en mayúsculas | la guardia sale roja: «1 archivo(s)… `lib/utils/linkificar.ts:134`». Revertido, árbol limpio |
| **Mutación 2:** `VAPID_SUBJECT` vuelve a ser opcional en `push.ts`, sale de `piezasVapidAusentes` y cae a un subject fijo | `push-config` da 3 failed (R1 ×2, R2). Revertido, árbol limpio |
| CRLF en los archivos del diff | ninguno; `i/lf w/lf` |
| Valores en `.env.example` (`^NOMBRE=.+`) | 0 líneas |

## Checklist

### Trazabilidad
- [x] R1: `push-config.test.ts` > «SL-14/R1: con las dos claves pero SIN `VAPID_SUBJECT`…» (`pushConfigurado` false, `clavePublicaPush` null, `["VAPID_SUBJECT"]`, también en blanco) y «…nombra las tres, en orden». La mutación 2 los mata.
- [x] R2: «SL-14/R2: `loadPushConfig` sin `VAPID_SUBJECT` lanza nombrándola». La mutación 2 lo mata.
- [x] R3: «SL-14/R3: hay canal SOLO con las tres…»: literal escrito a mano, `"mailto:ops@example.com"` a partir de una entrada con espacios.
- [x] R4: `informe-aviso-interno.test.ts`, base `null`, encadenado con `ejecucion-envio-service.test.ts` (T8).
- [x] R5: `plantilla-datos.test.ts`, `urlBase: ""`.
- [x] R6: `webhook-estado-service.test.ts`, «268/R24 (2)», `WEBHOOK_APP_ORIGIN: null`.
- [x] R7: `plantilla-datos.test.ts` (ejemplo = valor resuelto), `informe-aviso-interno.test.ts`, la línea 63 de `openapi-406` y la paridad TS↔YAML. Los 4 ejemplos de `lib/` pasan a `example.com` y conservan subdominio y ruta.
- [x] R8: caso de la guardia: las tres `NOMBRE=` sin valor y «VAPID_SUBJECT es OBLIGATORIA para que haya push».
- [x] R9: barrido de la guardia. Muerde (mutación 1). El universo es `git ls-files` + `.env.example`, sin `progress/` (línea 107) y sin binarios.
- [x] R10: hay 13 entradas `{ruta, ficha, motivo}`, todas con `^SL-\d+$` y distintas de SL-14. Ninguna es permanente. Hay un caso de poda sintético y otro real («ninguna entrada sobra»). Un archivo que ya no existe se queda fuera del mapa y la poda lo marca. La poda real la comprobó el implementer en T9 con `specs/426…`.
- [x] R11: tres casos sintéticos, construidos por concatenación: mayúsculas mezcladas con subdominio, email (también con CRLF), y los que no deben marcar (`example.com`, la regex con barra, `ingresoOrdenex.comision`).
- [x] R12: el diff no toca `.gitignore`, `app/`, `scripts/` ni `arnes.manifest`. En `specs/` solo toca SL-14 y las 4 líneas de SL-10. En `docs/api/`, solo la línea 961 del YAML (+1 −1). Las dos ampliaciones del leader se respetan.
- [x] R13: `package.json` y lockfile sin cambios. `.env.example` solo suma `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_SITE_URL`, que el código ya leía.
- [x] R14 (con la decisión del leader): el log `_trabajo/gate-completo-SL-14.log` trae `INIT_EXIT=1` y 234 rojos fuera del baseline. **Ninguno viene del diff.** Lo comprobé cruzando:
  - todos son de integración con base: 232 de `tests/integration/db/`, 1 de `actions/` y 1 de `repositories/`;
  - con el diff solo se cruzan `455/caracterizacion/webhook-estado` y `webhook-evidencias-url-resuelve-sql-real`. Los dos caen en `prepararMundo`/`fksDeOrden` con «tabla `orden` vacia», antes de llegar a la aserción del origen;
  - de los 234, solo `455/caracterizacion/plantilla-estatus` importa un módulo tocado (`plantilla-datos`). Cae igual, con «tabla `orden` vacia»;
  - muestra al azar: `cierre-sin-gestion`, `cierre-bloqueo-nv`, `cierre-sin-gestion-tope` y `cierres-filtro-estado`. Los cuatro dan «la tabla `orden` esta vacia»;
  - `conCorpus is not a function` (×26): el `beforeAll` hace `if (!fks) return;` y `conCorpus` nunca se asigna. Misma causa, la base vacía;
  - `analitica-financiera-action`: «expected null not to be null» sobre el contexto de dos usuarios. `financiera-cubo-temporal`: «no hay ningun usuario en la base».

  El gate rápido no lo corrí (consigna del leader). Las piezas que corrí están arriba.
- [x] El mapa `R<n> → test` está en `progress/impl_SL-14.md` (cierre de backend_dev y T10).

### Tasks
- [ ] **Todas `[x]`:** no. **T1** y **T10** siguen `[ ]` en `tasks.md` (ver H1).

### CHECKPOINTS.md
- [x] `requirements.md` con EARS numerados R1–R14.
- [x] `design.md` con alternativas descartadas y su porqué: dos en D1 y una en D2.
- [ ] Todas las tasks `[x]`: ver H1.
- [x] `design.md > ## Lo que ya existe`: es la primera sección, tras la nota de escritura, y lista la búsqueda. El diff no re-crea nada: reutiliza `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_SITE_URL` y sus consumidores, y no añade una variable ni un resolutor nuevos.
- [ ] Assignee en Jira y `wt.sh new`: no lo puedo verificar desde aquí. Es del leader.
- [x] Trazabilidad y mapa en la bitácora.
- [x] Typecheck y lint sin errores (corridos).
- [ ] `gate-completo` en CI: pendiente del PR.
- [x] Flujo crítico con E2E: no aplica. Push y ejemplos no están en la lista.
- [x] Dependencias: ninguna.
- [x] Secretos: ninguno. `.env.example` solo lleva nombres.
- [x] Configuración: desaparece el único valor de verdad con dominio fijo (`DEFAULT_SUBJECT`) y no entra otro.
- [ ] `./init.sh` rápido verde, cierre de `progress/features/SL-14.md` y desmontar el worktree: del leader, tras el OK.

### docs/checkpoints-proyecto.md
- [x] Typecheck y lint.
- [x] Tablas, RLS, migraciones y queries: no aplica (D «Modelo de datos»).
- [x] Ningún recurso de Ordenex en el diff. Al contrario, el diff saca el dominio. La base de T10 es local (`localhost`), no un Supabase de Ordenex.
- [x] Ningún `console.log` de secretos.
- [x] Capas: el cambio vive en `lib/config/`. El borde (`push-web-handler.ts:49`) ya pregunta a `pushConfigurado()` antes de llamar a `loadPushConfig()`, así que la nueva excepción de R2 no revienta el registro de jobs (`jobs-handler-por-tipo` en verde).
- [x] País y moneda: el diff no añade literales nuevos. «Ordenex S.A.» y los textos de Costa Rica se quedan, por la regla de no tocar el nombre (SL-15).

### docs/perfil-agentes.md > reviewer
- [x] Sin tabla ni query sin `organizacion_id`, sin migraciones y sin literal nuevo de país o moneda.
- [x] Ninguna referencia a recursos de Ordenex.
- [x] Sin dependencias nuevas.
- [x] Los comentarios explican el porqué: `push.ts` dice por qué no hay default, `.env.example` qué pasa si falta cada variable, y la guardia por qué compone la regex.

## Puntos que pidió el leader
- **Guardia del dominio:** muerde (mutación 1). Sus 13 excepciones son temporales, cada una atada a `SL-8`, `SL-11`, `SL-16` o `SL-27`, y un test lo exige (`^SL-\d+$`, distinta de SL-14). No recorre `progress/`. La poda está cubierta.
- **`VAPID_SUBJECT` obligatoria:** sí, en `pushConfigurado`, `clavePublicaPush`, `piezasVapidAusentes` y `loadPushConfig` (mutación 2). Ningún consumidor la daba por opcional, y no aparece en `e2e/` ni en `.github/`.
- **`.env.example` sin valores:** 0 líneas `NOMBRE=valor`, y `env-example-sin-valores` en verde.

## Hallazgos

- **H1 — BLOQUEANTE.** `specs/SL-14-dominio-a-configuracion/tasks.md`: **T1** y **T10** siguen `[ ]`.
  - T1 está hecha: la medida está en la bitácora y su bloqueo se resolvió con la ampliación de R12.
  - T10 está hecha salvo R14, que ahora se da por cumplido con la decisión del leader y la muestra cruzada de arriba.
  - Para cerrarlo, el implementer marca las dos `[x]` y añade a la bitácora, bajo T10, una línea con la decisión del leader sobre R14 (rojos de base vacía, deuda de SL-31, ajenos al diff). CHECKPOINTS exige todas las tasks marcadas.
- **H2 — menor.** `design.md` D2 dice todavía «El YAML espejo de `docs/api/` conserva su ejemplo hasta SL-16. Ningún test compara ese valor entre TS y YAML». La decisión del 2026-10-22 lo contradice: el caso de paridad de `openapi-webhook-estado-actualizado` sí lo compara, y el YAML cambió. Conviene corregir la frase para que el spec no mienta.
- **H3 — menor.** `feature_list.json`, la copia local, llega hasta SL-26, y no aparece SL-27, la ficha que retira 6 excepciones de la guardia. SL-10 ya la citaba, así que puede ser solo una importación vieja. Conviene que el leader confirme que SL-27 existe en el board. Si no, esas 6 entradas apuntan a una ficha que no existe, y la guardia no lo detecta: solo valida la forma `SL-n`.
- **H4 — menor.** La cabecera de `.env.example` cambia «fase 3» por «SL-20, SL-21 y SL-22». No está en D5, pero es la deuda D3 de `progress/deudas.md`. Las tres fichas existen. Basta con anotarlo como resuelto en `progress/deudas.md` al cerrar.
- **H5 — menor.** La bitácora dice que lint da «235 warnings, ninguno en los archivos tocados». Pero `WebhookEventoOrdenService.test.ts` y `webhook-estado-service.test.ts`, que están en el diff, traen 14 warnings heredados. No son de las líneas cambiadas, solo la frase es inexacta.

## Veredicto

**RECHAZADO**: 1 bloqueante (H1, solo de marcado). Basta con marcar T1 y T10 y anotar la decisión de R14 en la bitácora, y no hace falta tocar código. Para la vuelta 2, revisaré solo ese diff.

## Vuelta 2 (acotada a 6b572a5..d625eac)

Diff de un commit (`d625eac`) y 4 archivos, todos docs: `tasks.md`, `design.md`, `progress/impl_SL-14.md` y `progress/deudas.md`. No toca código ni tests.

| Hallazgo | Estado | Comprobación |
|---|---|---|
| H1 (BLOQUEANTE) | cerrado | T1 y T10 pasan a `[x]`, y `tasks.md` ya no tiene ninguna `- [ ]`. La decisión del leader sobre R14 está bajo T10 en la bitácora y remite a esta review. |
| H2 | cerrado | D2 sustituye la frase falsa por la corrección del 2026-10-22: la paridad TS↔YAML sí compara el ejemplo, y el YAML cambia con el TS. |
| H3 | cerrado | La bitácora anota que el leader confirma SL-27 en el board. No lo verifiqué en Jira: queda a cuenta del leader. |
| H4 | cerrado | D3 de `progress/deudas.md` queda «RESUELTA en SL-14 (`a1e9e1b`)». |
| H5 | cerrado | La frase de lint de la bitácora nombra los 14 warnings heredados. |

Regresiones:
- `design.md` cambió y lo leen dos guardias. `vitest run` de `dominio-ordenex-fuera` y `no-embalaje`: 2 archivos, 10 passed.
- El diff no trae el literal del dominio ni URLs nuevas. Los archivos están en LF (`i/lf w/lf`).

**Veredicto vuelta 2: OK**, sin bloqueantes. Quedan del leader el `./init.sh` rápido, el `gate-completo` del CI, el cierre de `progress/features/SL-14.md` y el desmontaje del worktree.
