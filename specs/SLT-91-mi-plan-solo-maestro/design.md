# SLT-91 — mi-plan-solo-maestro · design.md

## Lo que ya existe

**Términos buscados:** en `feature_list.json`, `specs/` y el código, `Mi plan`, `mi-plan`, `ROLES_MI_PLAN`, `MiPlan`,
`solo el maestro`. El grafo no tiene proyecto para este worktree (`list_projects`): el código se exploró con Grep y Read.

Ninguna ficha ni spec cierra «Mi plan» al `admin`. Las fichas que nombran «Mi plan» (SLT-58, SLT-66, SLT-83, SLT-86) lo
construyen; esta enmienda a SLT-58. No es `BLOQUEADO`. Se reutiliza:

| Apareció | Qué se hace |
|---|---|
| `ROLES_MI_PLAN` (`lib/auth/menu-visibility.ts:338`) | Se cambia la lista. Es el único cambio de comportamiento. |
| `MiPlanService.ver`, `notFound()` de la página | Sin cambio de código: heredan la lista. |
| `ROLES_HISTORIAL_ACCIONES = ["maestro"]` (`menu-visibility.ts:309`) | Precedente de la misma forma. |
| `tests/integration/db/planes-cambio-correos.test.ts:153-175` | Ya prueba contra Postgres que el `admin` activo no recibe el correo. Se usa para R7. |

**Corrección a lo medido antes del spec.** La constante la leen el ítem del menú (`:698`) y `MiPlanService.ts:14`. La
página no la lee: la nombra en un comentario y pregunta al servicio (`page.tsx:19-20`). El resultado es el mismo.

## 1. Forma de la solución

Una línea de producción:

```ts
export const ROLES_MI_PLAN = ["maestro"] as const satisfies readonly RolValue[];
```

Menú, servicio y página cambian con ella. El resto son comentarios que quedarían falsos, documentación y tests. Sin
pantalla nueva: no pasa por `/design`. Sin dependencias.

## 2. Modelo de datos: sin migración

No se toca ninguna tabla, RLS ni función. `plan_de_la_empresa` sigue leyendo por `organizacion_id` del contexto, y solo
la llama `MiPlanRepository`. No hay dato que dependa del país. «Mi plan» sigue siendo núcleo: `lib/modulos/reparto.ts:49`
no cambia.

## 3. Autorización

Sigue en `MiPlanService.ver`, antes del repositorio. La empresa la pone la sesión. `forbidden` se vuelve `notFound()`
en la página, que ya responde 404 real a los roles sin acceso (SLT-58 R8, enmienda del 2026-10-29).

## 4. Avisos del plan: qué hay hoy y qué cambia

**Hoy el `admin` no recibe ningún correo ni notificación del plan.** Solo le llegan las marcas en pantalla, y las pierde
con la ruta.

| Aviso | Dónde vive | Quién lo recibe hoy | Qué cambia |
|---|---|---|---|
| Correo de cambio guardado o cancelado | Lo encola `PlanesRepository.ts:450, 787, 1201, 1294` (`plan_aviso_correo`); lo envía `lib/planes/jobs-cambio-plan.ts:279-295`, cableado en `app/api/cron/procesar-jobs/route.ts:267` | `maestro` activos: `PlanesRepository.ts:1327`, `rol: { value: "maestro" }` | Nada |
| Recordatorio a 7 días y a 1 día | `plan_recordatorio_cambio` (`PlanesRepository.ts:1192`, `route.ts:266`) reparte `plan_aviso_correo` por empresa | Los mismos | Nada |
| Aplicar el cambio (`plan_aplicar_cambio`, `plan_aplicar_cambio_empresa`, `plan_cambios_vencidos`) | `jobs-cambio-plan.ts:66-181` | Nadie: no envían nada | Nada |
| Campana | El enum `NotificacionEvento` no tiene ningún evento del plan, y ninguna migración inserta en `notificacion` | Nadie | Nada; R9 lo ata |
| Marcas al 80 % y al 100 % | `components/shared/ConsumoDelPlan.tsx:59-60, 96-97`, calculadas en `lib/planes/consumo.ts:31-36` | En pantalla: `maestro` y `admin` por `MiPlanModule.tsx:30`; superadmin por `PlanEmpresa.tsx:637` | **El `admin` deja de verlas** |
| Cambio programado en pantalla | El mismo `ConsumoDelPlan` | Los mismos | **El `admin` deja de verlo** |
| `AvisosDeTopes` | `PlanForm.tsx:906`, `PlanesModule.tsx:156`, `PlanEmpresa.tsx:721, 953` | Solo superadmin | Nada |

## 5. Otras vías por las que el `admin` podría leer el plan

| Vía | Medido | Decisión |
|---|---|---|
| Enlaces a `/mi-plan` | Solo el ítem del menú (`menu-visibility.ts:696`) y el reparto de módulos (`reparto.ts:49`). Ni el correo (`cambio-plan.ts`), ni el inicio (`AdminMaestroDashboard`), ni el manifiesto PWA | Ningún enlace queda roto. R10 lo ata |
| Ayuda | `docs/ayuda` no nombra «Mi plan». Solo `oficina/wallet-caja.md:176, 183` habla del costo por orden | Sin cambios |
| Texto del tope | `mensajes.ts:28-41` no manda a «Mi plan». Se lo muestra al `admin` solo aprobar postulaciones: `AprobacionPostulacionService.ts:26, 100-101` → `PostulacionesPendientesPanel.tsx:142`, montado en `AdminMaestroDashboard.tsx:51`. Usuarios y API keys son solo del `maestro` (`UsuarioService.ts:52`, `ApiKeyService.ts:34`) | Se queda (R11, P1) |
| Deuda en la wallet | `DeudaPlataformaService.ts:21` (`esAccesoTotal`: `maestro` y `admin`). La pista de `wallet-labels.ts:128` dice «con plan porcentual», sin datos del plan ni enlace | Se queda: la wallet no cambia (R12) |
| Historial de acciones (`plan_asignado` y compañía) | Solo `maestro`: `ROLES_HISTORIAL_ACCIONES`, `HistorialAccionService.ts:52` | Ya cerrado (R13) |
| Lecturas de planes de plataforma | `PlanesService.ts:69, 183…`: solo superadmin | Ya cerrado (R13) |

## 6. Comentarios y documentación que quedarían falsos

- `lib/auth/menu-visibility.ts:333`, `:691-692`. `lib/actions/_shared/mi-plan.ts:17`.
- `docs/architecture.md:251`.
- SLT-58. El encargo cita R1 y §3.1, pero la misma afirmación está también en R8, R10 y otras líneas:
  - `requirements.md`: líneas 7, 35 (R1), 42 (R8), 44 (R10), 124 y 163.
  - `design.md`: líneas 33, 125 y 174-179.
  - Se añade una nota de enmienda arriba de cada archivo y en esas filas. Lo histórico se conserva. El argumento de
    `design.md:176-177` para no meterlo en «Configuración» pasa a ser historia; la posición no se mueve.

## 7. Tests que cambian

Con la regex `ROLES_MI_PLAN|mi-plan|MiPlan|Mi plan` aparecen 31 archivos en `tests/` y `e2e/`, no 29. Los que entran con
`admin` en «Mi plan» o fijan su menú son estos seis:

| Archivo | Cambio |
|---|---|
| `tests/unit/auth/menu-mi-plan.test.ts:14, 51-66, 97-102` | `["maestro"]` en literal; `admin` a los que no lo ven. Los aterrizajes (`:75-83`) no cambian |
| `tests/unit/auth/menu-visibility.test.ts:183` | Sale «Mi plan» de la lista exacta del `admin` |
| `tests/unit/auth/menu-historial-acciones.test.ts:173-181` | El bucle exige «Mi plan» en `.at(-2)` a los dos roles. Se separa: `maestro` igual; `admin` con «Histórico» en `.at(-2)` |
| `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts:317` | `admin: 16` → `15` y línea en su bitácora |
| `tests/integration/mi-plan-page.test.tsx:36, 45, 60` | `admin` a sin acceso |
| `tests/unit/services/mi-plan-service.test.ts:75-76, 111, 116, 145` | `admin` a `SIN_ACCESO`; los casos de contenido pasan a `maestro` |

Ningún E2E entra hoy como `admin` en «Mi plan»: `planes-superadmin` usa `maestro` y `mensajero`; `planes-costeo` y
`planes-costo-porcentual`, el `maestro`. Por eso R14 añade el caso. Los demás archivos usan `maestro`, o nombran «Mi plan»
en comentarios o como nombre de un plan (`planes-acceso-servi-app.test.ts:243`).

Tests nuevos, con los esperados en literal:

- **`tests/integration/db/mi-plan-solo-maestro.test.ts`.** Con el molde de `plan-de-la-empresa-periodo.test.ts:47-52`
  (`comoApp`, todo revertido). En la misma empresa con plan: `admin` → `toEqual({ estado: "forbidden" })`; `maestro` →
  `estado: "ok"` con plan no nulo. El `maestro` es el control: sin él, un `forbidden` no probaría nada.
- **`tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts`.**
  - R5: `expect([...ROLES_MI_PLAN]).toEqual(["maestro"])`, escrito a mano; el ítem del menú lee esa constante (`toBe`).
  - R8: solo `MiPlanModule.tsx` y `PlanEmpresa.tsx` importan `ConsumoDelPlan`.
  - R9: ningún valor de `NotificacionEvento` contiene `plan`.
  - R10: en `app/`, `components/`, `lib/` y `public/`, `/mi-plan` como inicio de una ruta entre comillas o backticks solo
    está en `menu-visibility.ts`, `reparto.ts` y `mi-plan/page.tsx` (su comentario). `docs/ayuda` no contiene «Mi plan».
  - R11: `mensajeDelTope` de las dos variantes no contiene «Mi plan».
  - Autocomprobación: el barrido exige encontrar al menos los dos archivos de producción esperados. Una búsqueda vacía
    pone el caso en rojo.
- **`tests/unit/services/aprobacion-postulacion-tope-plan.test.ts`.** Hoy solo prueba con `MAESTRO` (`:15`). Se añade el
  caso de `admin`, con el texto literal de `:19`.

## 8. Alternativas descartadas

- **Comprobar `admin` aparte en el servicio o en la página, y dejar la constante como está.** Menú y servicio volverían
  a divergir, justo lo que la constante evita (SLT-58 R10).
- **Mover «Mi plan» dentro de «Configuración», que ya es solo del `maestro`.** Daría el permiso gratis, y fue el motivo
  por el que SLT-58 lo dejó fuera (`design.md:176`). Pero mueve el ítem al `maestro`, y Carlos no lo pidió. Se queda
  tras «Histórico».
- **Redirigir al `admin` al inicio en vez de dar no encontrado.** La decisión pide no encontrado, y una redirección
  revelaría que la pantalla existe.
- **Cambiar el texto del tope para el `admin`.** Toca los límites, que no cambian. Queda en P1.

## 9. Riesgos

- **Otro test fija el menú del `admin`** por una vía que la búsqueda no vio: lo revelan `vitest related` y las guardias.
  Si aparece, se corrige con literal a mano.
- **Sin base, la integración se salta** (`HAY_BASE_DE_DATOS`) y sale verde. Por eso la T0 copia `.env` y exige 0 saltos.
- **El E2E no corre en el gate local** y en CI solo en el PR a producción. Hay que correrlo a mano en la Tanda C.
