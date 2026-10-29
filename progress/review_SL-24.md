# review SL-24 «Planes con límites contados en el servidor» — vuelta 1

- **Revisado:** HEAD `ae27fe9` contra `origin/dev` (29 commits, 110 archivos).
- **Fecha:** 2026-10-28.
- **Contra qué:** `specs/SL-24-planes-y-limites/{requirements,design,tasks}.md` (§16 es la enmienda), `CHECKPOINTS.md`,
  `docs/checkpoints-proyecto.md`, `docs/perfil-agentes.md > reviewer`.
- **MCP del grafo:** no lo usé. La revisión se hizo con Grep, Read y ejecución.

## Verificación que corrí yo

| Qué | Resultado |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` | sin errores |
| `pnpm exec eslint` sobre los `.ts/.tsx` añadidos o modificados de `lib/`, `app/` y `scripts/` | sin errores ni avisos |
| Unit de SL-24 (11 archivos: `planes-service`, `planes-schema`, `procesar-jobs-plan-cambio`, `bulk-orden-service.tope-plan`, `api-key-carga-tope-plan`, `carga-composition-root-cupo`, `tests/unit/planes/*`, `plantilla-cambio-plan` y las dos guardias de planes) | 11 archivos, 200 tests en verde |
| Integración de SL-24 contra Postgres real (`servi_logistic_sl24`), 12 archivos: `planes-cambio-programado`, `plan-topes-ordenes`, `planes-acceso-servi-app`, `plan-topes-concurrencia`, `planes-cambio-correos`, `planes-historial`, `planes-asignacion`, `plan-topes-usuarios`, `plan-topes-api-keys`, `plan-ciclo`, `planes-catalogo` y `planes-edicion-en-uso` | 12 archivos, 115 tests en verde y 0 saltados |
| `git diff origin/dev...HEAD -- package.json pnpm-lock.yaml` | vacío (R34) |
| `.skip`, `.only` o `.todo` en los tests añadidos o modificados | ninguno |

No corrí la suite completa, el E2E ni `./init.sh`: el leader dio `init OK` y E2E 18/18 ×2 para esta HEAD.

## Checklist

### CHECKPOINTS.md
- [x] `requirements.md` en EARS, con R1–R45 numerados. No hay hueco de numeración: R37–R45 son la enmienda.
- [x] `design.md` con alternativas descartadas: §12 y la «lectura por fecha» de §16.3.
- [x] `tasks.md`: 15 tasks, todas `[x]` y ninguna `[ ]`.
- [x] `design.md` abre con `## Lo que ya existe`, con la búsqueda hecha. El diff no re-crea nada de esa lista:
  - no toca `UserRepository`, `ApiKeyRepository` ni `tests/fabricas/`;
  - extrae `modulos-en-tx` y `sqlstate` tal como prevé la lista.
- [x] Equipo: assignee Camilo y rama `feature/SL-24-planes-y-limites` (`progress/features/SL-24.md`).
- [x] Trazabilidad: el mapa R1–R45 → test está en `progress/impl_SL-24.md > T10`. Lo verifiqué abajo.
- [x] Typecheck y lint en verde.
- [ ] `gate-completo` de CI: aún no hay PR. Es condición del merge, no de esta revisión.
- [x] Flujo crítico «aislamiento entre empresas»: se amplió `e2e/dos-empresas-humo.spec.ts` (R33) y su salida 18/18 está en la bitácora (T9).
- [x] Sin dependencias nuevas.
- [x] Sin secretos hardcodeados. No hay webhooks nuevos.
- [x] Configuración: el único literal que cambia con el entorno es el desfase −06:00. Es la decisión humana P8 («hasta SL-21»).
- [ ] `./init.sh` en verde: lo da el leader (ver el menor m5). Revisión `OK`: este archivo. Cierre y desmontaje del worktree: pendientes del leader tras el merge.

### docs/checkpoints-proyecto.md
- [x] Las tablas nuevas tienen RLS: `plan`, `plan_tope_rol`, `plan_modulo`, `plan_rastro` y `plan_cambio_programado`.
  - Las cinco son de plataforma: `ENABLE ROW LEVEL SECURITY` sin políticas y `REVOKE ALL … FROM servi_app`.
  - Las cinco están en `MODELOS_DE_PLATAFORMA`.
  - La asignación vive en `organizacion`, como en SL-40.
- [x] Queries por empresa con test de dos empresas:
  - `PlanesRepository` está en `EXCEPCIONES_DE_PLATAFORMA` con su motivo, y `destinatariosDelAviso` filtra a mano por `organizacionId`.
  - `plan_cupo_ordenes` lanza `42501` con otra empresa (`plan-topes-ordenes` R8). R30 tiene A al tope y B con el mismo plan.
- [x] Las 5 migraciones traen `down.sql`. La ida y vuelta se prueba en `migracion-sl24-ida-y-vuelta`. Ver el menor m4 sobre la edición de `20261028130200`.
- [x] Nada de Ordenex en el diff.
- [x] Sin `console.log` de PII. El handler del aviso no mete emails en `last_error`.
- [x] Capas: action → `PlanesService` → `PlanesRepository`, y zod en el borde: `lib/types/planes.ts` y los payloads de los jobs.
- [x] País y moneda:
  - el precio va sin moneda (decisión, deuda D28);
  - no hay «colones», «₡» ni «SINPE» en el código nuevo;
  - «Costa Rica» y el −06:00 solo aparecen como la decisión P8.
- [x] Autorización en el servidor: `PlanesService` corta con `forbidden` antes de zod y del repositorio. R5 lo prueba con cero llamadas al repositorio.
- [x] Puertas de módulo: `planes` y los 4 tipos de job son `"nucleo"` en `lib/modulos/reparto.ts` (R44).

### docs/perfil-agentes.md > reviewer
- [x] No hay tabla de negocio sin `organizacion_id`: las tablas nuevas son de plataforma y están clasificadas.
- [x] No hay tabla sin RLS ni migración sin `down.sql`.
- [x] No hay literal de país o moneda fuera de la decisión P8.
- [x] Sin recursos de Ordenex. Sin dependencias nuevas.
- [x] Comentarios: explican el porqué (cerrojos, UTC, outbox, residuos). Son largos, pero no repiten el qué.

## Trazabilidad R → test (verificada)

Para cada R comprobé que el archivo existe y que el caso citado está, buscando el texto del `it` o del `describe`. Los archivos de integración y unit de la tabla los ejecuté: 0 rojos y 0 saltados.

| R | Test (verificado) |
|---|---|
| R1–R3 | `planes-service.test.ts` y `planes-schema.test.ts` (unit); `planes-catalogo.test.ts` (int: los `CHECK` dan 23514 y el `DECIMAL(12,2)`) |
| R4 | `planes-asignacion.test.ts` «R4: asignar un plan con precio no crea cobros…» |
| R5 | `planes-service.test.ts` describe «R5: solo el superadmin…», con cero llamadas al repo |
| R6 | `planes-service`, `planes-catalogo`, `plan-topes-ordenes` «R6…», `planes-asignacion`, `planes-edicion-en-uso` y la guardia `planes-sin-borrado` |
| R7 | `planes-catalogo.test.ts` «R7 — públicos…; asignables de A…» |
| R8 | `planes-acceso-servi-app.test.ts` (42501 en SELECT, INSERT, UPDATE y DELETE); `plan-topes-ordenes` (el cupo de otra empresa da 42501) |
| R9–R13 | `planes-asignacion.test.ts`, que incluye R11 «la excepción de SL-23 sobrevive…» y R12 «igual al tope no impide» |
| R14 | `plan-topes-ordenes`, `plan-topes-usuarios`, `plan-topes-api-keys`, `planes-catalogo`, `migracion-sl24-ida-y-vuelta` y `bulk-orden-service.tope-plan` |
| R15–R17 | `planes-edicion-en-uso.test.ts`; `planes-cambio-programado` «R38/R17» |
| R18 | `plan-topes-ordenes` «R18: un INSERT a mano con servi_app…» |
| R19, R20 | `plan-topes-ordenes` (anular por pantalla y por API, ciclo anterior, recuperar, zona horaria); `plan-ciclo` (Postgres, `it.each`); `ciclo-plan` (TS) |
| R21–R23 | `bulk-orden-service.tope-plan.test.ts` (con guía y sin guía, vista previa y real); `api-key-carga-tope-plan.test.ts` «409 con la forma del cuerpo» |
| R24 | `plan-topes-concurrencia.test.ts`: dos altas con cupo 1, alta frente a bajada en los dos órdenes |
| R25–R27 | `planes-schema`, `planes-catalogo`, `plan-topes-usuarios` (cuatro vías más SQL a mano), `usuario-service-tope-plan` y `aprobacion-postulacion-tope-plan` |
| R28 | `UsuariosTopePlan.test.tsx` y `PostulacionesTopePlan.test.tsx` |
| R29 | `planes-historial.test.ts`: el rastro sin empresas, `historial_accion` y el fallo que no deja nada persistido |
| R30 | `plan-topes-ordenes` «R30…»; `planes-acceso-servi-app` «R30 — …» |
| R31 | `migracion-sl24-ida-y-vuelta.test.ts` (catálogos de Postgres) |
| R32 | guardia `planes-sin-seed` |
| R33 | `e2e/dos-empresas-humo.spec.ts` «SL-24: la tienda de A, al tope de su plan…». No lo re-ejecuté: la bitácora da 18/18 ×2 |
| R34 | guardia de dependencias y `package.json` sin diff |
| R35, R36 | `plan-topes-api-keys`, `api-key-service-tope-plan` y `ApiKeysTopePlan.test.tsx` |
| R37 | `planes-schema` (fecha y −06:00); `planes-service` (hoy no vale); `planes-cambio-programado` «R37: programado a mañana…» y «R37: una fecha que no es posterior…» |
| R38 | `planes-cambio-programado` (aplica, el ciclo intacto, barrido); `procesar-jobs-plan-cambio` |
| R39 | `planes-cambio-programado` (mutación 8); `planes-cambio-correos` (mutación 9); `planes-historial` |
| R40 | `planes-cambio-programado` «R40…»; `planes-historial` «R40…» |
| R41, R42, R45 | `planes-cambio-correos.test.ts` (emisor doble: 10 días → 2, 3 días → 1, doble ejecución → uno por empresa, reemplazo con un solo correo, fallo del emisor); `plantilla-cambio-plan.test.ts` |
| R43 | `planes-historial` «R43: programar, reemplazar, cancelar y aplicar…» |
| R44 | `procesar-jobs-plan-cambio` «R44: los dos son de núcleo» y «R44: los dos de correo son de núcleo». `requirements.md` ya cita este archivo (`9024073`) |

Ningún R queda sin test, y ningún test citado está vacío ni saltado.

## Decisiones de los subagentes (validación una por una)

| Decisión | Veredicto |
|---|---|
| T5: el texto «La fecha de vigencia tiene que ser posterior a hoy.» | **Aceptable.** La regla es que las 00:00 a −06:00 de esa fecha caigan después de ahora, así que «hoy» nunca vale y «mañana» sí. El texto describe la regla con exactitud |
| T5: `cancelarCambio` adelantado a T4 | **Aceptable.** Es orden de trabajo, sin efecto en el contrato |
| T5: el JSON de `cambio_cancelado` es `{vigenteDesde:{antes,despues:null}}` | **Aceptable.** Tiene la misma forma `antes/despues` que el resto del rastro y es coherente con `cambio_reemplazado` |
| T5: `plan_rastro.actor_nombre` queda en `''` si el actor no es un usuario | **Aceptable.** La columna es NOT NULL y el superadmin siempre resuelve. Es un caso límite |
| T5: un plan custom de una empresa inexistente responde `not_found` | **Aceptable.** R2 solo exige rechazar sin escribir. Es coherente con `asignar` |
| T5: las seis actions llevan `@sin-superficie` (la pantalla llega en SL-26) | **Aceptable.** Es la decisión «Pantalla» del humano |
| T6: `CupoPlanRepository` lee `current_setting('app.organizacion_id')` en vez de `contextoActual()` | **Aceptable.** Comprobé que la extensión envuelve el `$queryRaw` con `set_config` en contexto de empresa (`extension-empresa.ts:218-224`). Además `plan_cupo_ordenes` exige que el argumento sea esa empresa (42501). Lo prueba la integración «T6: CupoPlanRepository lee el cupo…». Sin empresa, el cupo es `null` y el trigger sigue mandando |
| T6: en la API el cupo se compara contra `conTarifa.length` | **Aceptable.** Es lo que de verdad se inserta: las filas sin tarifa ya salieron. Comparar con `toCreate` rechazaría de más |
| T6: los residuos de una carga a medias | **Aceptable.** Están dentro de §6.1, aceptado el 2026-10-27, y el tope nunca se pasa (R24) |
| T11: se tocó `scripts/siembra-jobs-recurrentes.ts` | **Aceptable.** Es una entrada nueva en `SIEMBRAS_RECURRENTES`, que exige la guardia 313. §16.5 no lo lista (menor m3) |
| T11: el payload de `plan_aplicar_cambio` es `{planId, cambioId}` y no `{cambioId}` (§16.3) | **Aceptable y mejor que el spec.** Permite cerrar el plan antes de leer el cambio, que es el orden de §4.4. No lleva PII. §16.3 no se actualizó (menor m3) |
| T11: el barrido de vencidos corre cada hora en punto UTC, en plataforma, una sola vez | **Aceptable.** «Por empresa» repetiría el barrido N veces, o no correría nunca con 0 empresas |
| T11: programar un cambio igual a la versión vigente reemplaza el pendiente | **Aceptable.** Sigue §16.2 paso 2 al pie de la letra. En la práctica deja el plan como está con un solo correo. Ver el menor m1 para el caso cercano |
| T12: reutiliza `fechaCortaCR` de `lib/whatsapp-envios/informes/formato.ts` | **Aceptable**, porque no inventa un formateador, que es lo que pedía §16.4. Acopla una plantilla de correo a un módulo de WhatsApp (menor m2) |
| T12: un reintento del emisor puede reenviar a quien ya recibió | **Aceptable.** Es el residuo «al menos una vez» de §16.4, anotado |
| T9: `tope-error.ts` cambia `declare details` por un getter `detalle` | **Aceptable.** El motivo (Babel en Playwright) está en el comentario, el getter no pisa `details` y typecheck y tests están en verde |

## Lo ya decidido por el humano (comprobado)

- Los textos del tope y de `{cosa}` están en `lib/planes/mensajes.ts`, y la plantilla los consume de ahí.
- Los textos de los correos de T12 están en `mensajes.ts` (`lineaReemplazo`, `SIN_LINEAS_DE_CAMBIO`, `mensajeCambioCancelado`, etc.).
  - El tipo `cancelado` lleva solo el texto de R45.
- La fecha se pinta con `fechaCortaCR`.
- El precio va sin símbolo de moneda: deuda D28 en `progress/deudas.md`.
- El ciclo y el ancla se calculan en UTC en la base:
  - `now() AT TIME ZONE 'UTC'` en `plan_cupo_ordenes` y en el trigger `plan_tope_ordenes` (`20261028130200`, líneas 101 y 129);
  - `PlanesRepository.usoDe` (línea 159) y el ancla de `asignar` (línea 575) también lo usan;
  - ya no queda ningún `now()::timestamp`. `design.md §3/§4.3` está al día.

## Hallazgos

### Bloqueantes
Ninguno.

### Menores
- **m1 (menor) — Repetir la misma programación vuelve a avisar.** Si el superadmin programa exactamente la misma versión y fecha que ya están pendientes (por ejemplo, un doble clic en la pantalla de SL-26), `programarCambio` no lo trata como «sin cambios». Lo compara con la versión vigente, no con la pendiente. El efecto:
  - borra y re-crea el pendiente;
  - escribe `cambio_reemplazado` y `cambio_programado` en el rastro;
  - re-encola los trabajos y envía otro correo de guardado a todos los maestros, con «reemplaza al previsto para <la misma fecha>».

  R41 («una edición sin cambios no envía nada») no define contra qué se compara, así que esto no incumple el texto. Pero es ruido para el cliente. Propuesta: si la versión y la fecha son iguales a las del pendiente, responder `ok` con `cambio: false`. Puede ir en SL-26 o en una ficha corta.
- **m2 (menor) — Acoplamiento y duplicación de utilidades de fecha.**
  - `plantillas/cambio-plan.ts` importa `fechaCortaCR` de `lib/whatsapp-envios/informes/formato.ts`. Un correo depende así de un módulo de WhatsApp.
  - `lib/planes/ciclo.ts > inicioDelDiaPlataforma` repite el cálculo de `lib/utils/fecha-cr.ts > inicioDelDiaCREnUtc`: `${fecha}T06:00:00.000Z`. Ya hay tres constantes `6` sueltas en el repo (`OFFSET_CR_HORAS`, `DESFASE_CR_HORAS`, `DESFASE_PLATAFORMA_HORAS`).

  §16.1 pedía la función en `ciclo.ts`, así que esto no bloquea. Conviene que SL-21 junte las tres en una sola fuente.
- **m3 (menor) — El spec va por detrás del código en dos puntos.**
  - `design.md §16.3` sigue diciendo que el payload de `plan_aplicar_cambio` es `{ cambioId }`; el código usa `{ planId, cambioId }`.
  - `§16.5` no lista `scripts/siembra-jobs-recurrentes.ts`, que el diff sí toca.

  Lo corrige el spec_author.
- **m4 (menor, informativo) — Se editó una migración que ya existía en la rama.** `577eb90` cambia la migración `20261028130200_plan_topes_triggers` después de aplicarla en las bases locales `servi_logistic_sl24` y `_sl24_e2e`.
  - La migración nunca llegó a `dev`, así que no se rompe la regla «no editar una migración ya aplicada» en una base compartida.
  - Quien la tenga aplicada en local tendrá un desajuste de checksum y debe resetear.
  - Conviene anotarlo en el PR.
- **m5 (menor, proceso) — El gate local del worktree puede no cubrir la integración.** El worktree no tiene `.env`, e `init.sh` solo carga `DATABASE_URL` desde el entorno o desde un `.env` local. Si el leader no la exportó, el `init OK` de esta HEAD habrá saltado los tests de Postgres en silencio.
  - Yo los corrí contra `servi_logistic_sl24`: 12 archivos y 115 tests en verde, sin saltos.
  - Es una nota para el `gate-completo` de CI, que sí tiene base.

## El residuo de `orden.created_at` (pregunta del leader)

**Sí merece deuda (prioridad baja).**

`orden.created_at` toma su `DEFAULT` en la zona de la sesión, mientras que el trigger y el cupo comparan contra `now() AT TIME ZONE 'UTC'`.
- En producción no afecta: Supabase va en UTC.
- En una base no UTC sí afecta. La de desarrollo local lo es: el E2E necesitó `options=-c TimeZone=UTC`. Ahí, una orden insertada sin `created_at` cae hasta 6 h fuera de su ciclo, y la frontera del ciclo se mueve.

La deuda debería proponer una de dos salidas, y no reabre nada de SL-24:
- fijar `ALTER DATABASE … SET timezone = 'UTC'` en las bases del proyecto (documentado en `docs/verification.md`);
- o añadir una guardia o comprobación en `gate-proyecto.sh` que avise si la sesión de la base de pruebas no está en UTC.

## Veredicto

**OK** (aprobado). 0 bloqueantes y 5 menores (m1–m5). Además, una recomendación de deuda para el residuo de `orden.created_at`.
