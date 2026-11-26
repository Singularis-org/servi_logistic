# SLT-268 «Integraciones: pasar las credenciales de v1 a v9 desde servi» — review

Reviewer, 2026-11-26. Ruta **completa**. Diff `origin/dev...66e4725b` (6 commits, 12 archivos).
Spec: `specs/SLT-268-integraciones-recifrar-v1-a-v9/`. Bitácora: `progress/impl_SLT-268.md`.

## Verificación que corrí (no solo la bitácora)

Base desechable `servi_slt268` exportada como `DATABASE_URL`/`DIRECT_URL` antes de vitest (URL armada
en un archivo temporal, sin imprimir valores). No corrí `./init.sh` (lo corría el leader).

| Qué | Resultado |
|---|---|
| `vitest run` de los 3 tests de la feature + `recifrado-integraciones.test.ts` + guardias `sin-credenciales-de-entorno`, `modulos-reparto`, `cron-hora-cr` | `Test Files 7 passed (7)`, `Tests 128 passed (128)`, **0 skipped** (el de integración corrió de verdad) |
| `pnpm run test:guardias` | `361 passed`, `5463 passed / 1 skipped`, exit 0 |
| `pnpm run typecheck` (`--max-old-space-size=8192`) | `TC_EXIT=0`, 0 `error TS` |
| `eslint` de los 7 archivos de código/test tocados | `LINT_EXIT=0` |
| `node scripts/tamano-pr.mjs` | 7/40 archivos, 202/1000 prod, 727/3000 tests |
| Cherry-pick a prod: `git merge-tree --write-tree --merge-base=295cc664 origin/prod(4e4f7b39) HEAD` | **limpio** (exit 0, sin conflictos). `git diff --stat origin/prod <árbol resultante>` = exactamente los 12 archivos de la feature |
| Paridad con prod de lo que importan la ruta y los tests (`cron.ts`, `boveda-integraciones.ts`, `prisma-client.ts`, repositorio, servicio, interfaz, `_postgres-real.ts`, `fabricas/organizaciones.ts`, guardias `modulos-reparto`/`_modulos-reparto`/`cron-hora-cr`, `vercel.json`, `middleware.ts`, `contexto-empresa.ts`) | idénticos entre `origin/prod` y la base de la rama. Solo difieren `lib/db/para-cada-empresa.ts` (+4/-1, `permitidoEnMora` de SLT-121, firma exportada igual) y `lib/modulos/reparto.ts` (bloques fuera de `MODULO_POR_CRON`). `db/schema.prisma` difiere, pero no en `Integracion` ni en `ServicioIntegracion` |

## Checklist

### Proceso
- [x] Ruta completa: correcta (toca credenciales de integraciones externas y un endpoint con auth propio).
- [x] `requirements.md` EARS R1-R17; `design.md` con `## Lo que ya existe` no vacía y 6 alternativas descartadas; `tasks.md` T0-T5 todas `[x]`.
- [x] El diff no re-crea nada de «Lo que ya existe»: `RecifradoIntegracionesService`, su repositorio, `paraCadaEmpresa`, `BovedaIntegraciones` y `loadCronConfig` se reutilizan sin tocar.
- [x] D12 respetada: no toca `scripts/recifrar-integraciones.ts`, `tests/integration/db/recifrado-integraciones.test.ts`, `.env.example`, `vercel.json`, `db/`, `middleware.ts`, servicio ni repositorio.
- [x] Tamaño del PR bajo el máximo.
- [x] Assignee (Carlos Restrepo) en `progress/features/SLT-268.md`.
- [x] Mapa R -> test en `progress/impl_SLT-268.md`.
- [ ] **E2E de flujo crítico (aislamiento) con salida local en la bitácora** — falta (B1).

### Trazabilidad R1-R17 (cada test leído; ninguno vacío)
| R | Test | ¿Lo verifica? |
|---|---|---|
| R1 | `tests/unit/config/integraciones-config.test.ts` «R1: el anillo tiene las entradas de las dos variables…» | Sí: orden `v1,v9,v8` y cada Buffer |
| R2 | mismo archivo, «R2: EXTRA %s = el mismo anillo…» y «…los mismos mensajes de error de hoy» (ausente/vacía/espacios) | Sí: mensajes contra **literales**, no contra la función |
| R3 | «R3: EXTRA mal formada (%s)…» (5 formas) y «R3: EXTRA con una clave de %s…» (16/33 bytes) | Sí: nombra EXTRA y la posición, sin base64 ni versión |
| R4 | «R4: una version de la principal repetida en EXTRA…» y «…repetida dentro de EXTRA…» | Sí |
| R5 | tres casos R5 (activa en EXTRA, activa fuera de las dos, cifra con la de EXTRA y descifra la principal) | Sí |
| R6 | `tests/unit/api/cron-recifrar-integraciones.test.ts` bloque R6 (sin cabecera, secreto erróneo, sin `Bearer`, `Bearer ` vacío, `CRON_SECRET` null/vacío, y por defecto con `CRON_SECRET` ausente y anillo roto) | Sí: 401 y la fábrica del servicio/`getPrismaClient` no se llaman. Mover la autorización detrás daría 500, no 401 |
| R7 | «el modulo exporta POST y no GET» | Sí (también PUT/PATCH/DELETE ausentes) |
| R8 | 7 variantes -> 400 sin eco ni ejecución, y `soloContar: true/false` | Sí |
| R9 | `tests/integration/db/recifrado-integraciones-extra.test.ts` «R9: ?solo-contar=1…» | Sí: Postgres real, foto completa igual con `updated_at` |
| R10 | mismo archivo, caso R10/R12/R17/R11 | Sí: `recifrados: 4`, `porVersion {v9: 4}` |
| R11 | mismo caso, segunda corrida | Sí: `recifrados: 0` y foto idéntica, `updated_at` incluido |
| R12 | mismo caso | Sí: columna a columna salvo `secretos`/`updatedAt`, con control de ≥11 columnas; fila ilegible entera igual; `organizacion` igual |
| R13 | unit «copia el resumen campo a campo…» + integración (prohibidos en cada respuesta) | Sí: 7 claves exactas; el doble mete clave, cifrado, id y secreto extra y no salen |
| R14 | «empresasConError > 0 -> 500 con las 7 claves…» | Sí |
| R15 | tres casos (composición real con EXTRA repetida sin recorrer empresas; `ConfiguracionBovedaError`; otro error con cifrado en el mensaje) | Sí: body y log espiado sin claves ni `vN` |
| R16 | «vercel.json no tiene un cron con el path…» | Sí, con control de `crons` no vacío |
| R17 | caso R10: cada valor `v9:` y descifrado con `BovedaIntegraciones(() => soloV9)` al claro sembrado | Sí |

### Puntos pedidos por el leader
1. **Trazabilidad:** completa (tabla de arriba).
2. **Sin fugas en respuesta ni logs:** la respuesta se copia campo a campo (`respuestaDe`), sin spread. Los únicos `console.error` de la ruta llevan un texto fijo o `nombre + código` (código filtrado por `/^[A-Z0-9_]{1,12}$/`), nunca `message`. El servicio no loguea y captura todo error por empresa, así que el `console.error` de `paraCadaEmpresa` (que sí imprime el id de empresa y el error) no se alcanza desde aquí; el `console.info` de módulos apagados no aplica (no se pasa `modulo`). El log de consultas de Prisma está `off` en producción (`lib/db/prisma-client.ts:116`). Errores de 400/401/500 sin eco. `porVersion` lleva etiquetas de versión (`v1`, `v9`): lo permite R13 (versión -> número).
3. **Sin EXTRA, idéntico:** `extra` se lee con `?.trim()`; ausente/vacía/espacios no entra en `sumarEntradas`, y el sufijo «ni de EXTRA» del mensaje de la activa solo se añade con `hayExtra`. Los mensajes de la principal son los de antes carácter por carácter (comprobado contra literales y con los casos SL-36 previos sin editar, en verde).
4. **CRON_SECRET primero:** la comprobación es lo primero en `handleRecifrarIntegraciones` (`route.ts:114-118`); `construirServicioRecifrado` además es perezosa (el anillo se lee en `ejecutar`, no al construir). Secreto ausente o vacío = 401.
5. **Idempotencia y solo `secretos`/`updated_at`:** demostrado contra Postgres (R11, R12). El repositorio está tipado `Pick<PrismaClient, "integracion">`.
6. **Cherry-pick a prod:** limpio (ver tabla de verificación).
7. **`lib/modulos/reparto.ts`:** +2 líneas, `"recifrar-integraciones": "nucleo"` en `MODULO_POR_CRON`. Es necesaria: la guardia `modulos-reparto` (idéntica en prod) exige destino para toda carpeta de `app/api/cron/`; sin ella el gate de prod saldría rojo. `nucleo` es correcto (plataforma, sin módulo). Está justificada en la bitácora. Aceptada.

### Checkpoints del proyecto
- [x] Typecheck y lint verdes (corridos aquí).
- [ ] `./init.sh` verde: lo afirma la bitácora (`INIT_EXIT=0`) y lo está corriendo el leader; no lo repetí.
- [x] Sin tablas, migraciones ni queries nuevas (`organizacion_id`/RLS no aplica; el repositorio existente ya filtra por `organizacionId`).
- [x] Ningún recurso de Ordenex en el código del diff (el test dice «la copia entregada»; las menciones a Ordenex están solo en `specs/` y `progress/`, como contexto).
- [x] Ningún `console.log` de secretos o PII.
- [x] Capas: la ruta es Controller; la regla sigue en `lib/services/`.
- [x] Entrada externa validada en el borde: los query params se validan con una lista blanca estricta (sin zod; no hay body). Equivalente y más estricto que lo que hacen las demás `/api/cron/*`.
- [x] Sin literales de país/moneda; sin dependencias nuevas.
- [x] Autorización en el route handler (`CRON_SECRET`).
- [ ] **Flujos críticos > Aislamiento entre empresas** — ver B1.

## Hallazgos

### B1 — BLOQUEANTE (solo evidencia, no código): falta la corrida de `e2e/dos-empresas-humo.spec.ts`
- **Regla:** `docs/checkpoints-proyecto.md > Flujos críticos`, «Aislamiento entre empresas»: una feature que toque «una entrada sin sesión (API key, **cron**, job) lo corre». `CHECKPOINTS.md > Calidad de codigo` pide su salida local en `progress/impl_<key>.md`.
- **Por qué aplica:** el diff añade una entrada sin sesión en `app/api/cron/` que recorre todas las empresas. Mismo criterio que en SL-36 (B1, mismo subsistema), SL-40 y SLT-102.
- **Qué falta:** `progress/impl_SLT-268.md` no registra ninguna corrida de E2E.
- **Arreglo:** sobre una base desechable con `migrate deploy` + seed y un `next build`, correr `pnpm exec playwright test e2e/dos-empresas-humo.spec.ts --project=aislamiento --no-deps` y pegar passed/skipped/exit en `progress/impl_SLT-268.md > Salida de la verificación`. No cambia código. No en paralelo con otro dev server o build del mismo `.next`.
- Nota honesta: ese E2E no ejercita esta ruta (la ruta no la invoca nadie automáticamente). El riesgo real de aislamiento lo cubren el repositorio existente (`WHERE organizacionId` + RLS, sin tocar) y el test de integración. Si el humano decide que el checkpoint no aplica a una ruta manual de plataforma, que lo deje escrito en `progress/features/SLT-268.md` y este punto se cierra igual.

### m1 — menor: `progress/features/SLT-268.md > Estado` está desactualizado
Sigue diciendo «esperando aprobación de Carlos (P1-P3)». El spec ya está aprobado (D8-D12) e implementado. Lo actualiza el leader.

### m2 — menor (deuda): composition root duplicado
`construirServicioRecifrado` (`app/api/cron/recifrar-integraciones/route.ts:51-65`) repite el cableado de `scripts/recifrar-integraciones.ts > main`. Es deliberado por D12 (no tocar el script). Cuando SLT-227/SLT-257 cierren, el script podría importar esta función. Anotarlo en `progress/deudas.md` si se quiere seguir.

### m3 — menor (operación): una EXTRA mal pegada tumba todas las integraciones de servi
Es el comportamiento pedido (R3: se rechaza, no se elige). Pero en el paso operativo 2, un error al pegar `v9:<clave>` en Vercel hace que `leerAnilloDeClaves` lance en cada lectura y servi deje de leer y guardar integraciones hasta corregirla. Sugerencia para el runbook: después del redeploy (paso 3), el `solo-contar` del paso 4 es la comprobación; si da `500 configuracion_boveda`, vaciar la variable EXTRA, restaurar `INTEGRACIONES_CLAVE_ACTIVA=v1` y redeploy. Sin cambio de código.

### m4 — menor (ya decidido): comparación del secreto con `!==`
No es en tiempo constante. Descartado explícitamente en `design.md > 6.6` por coherencia con las 12 rutas cron. Solo se anota; no se pide cambio.

## Veredicto

**RECHAZADO** — 1 bloqueante (B1, solo evidencia del E2E de aislamiento; el código no cambia) y 4 menores.

El código, los tests y el cherry-pick a prod están bien: R1-R17 trazados a tests que leí y que miden lo que
dicen (las 12 mutaciones las midió el implementer; no las repetí); sin fugas en respuesta ni logs; sin EXTRA el comportamiento es el de hoy;
401 antes de tocar el anillo o la base; idempotente y solo `secretos`/`updated_at`; `merge-tree` sobre
`origin/prod` limpio. Para la vuelta 2 basta con el commit que añade la salida del E2E a la bitácora
(o la decisión escrita del humano de que no aplica).
