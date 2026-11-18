# SLT-135 «Planes: sin «De inmediato» al editar un plan» — T4 (tests de integración) · bitácora backend_dev

**Estado:** T4.1 sigue PARADO por un fallo de producción que ya está escalado (ver «Bloqueo»). T4.2 y T4.3 están
hechos y en verde (ver «T4.2–T4.3»).

## Archivos tocados

- `tests/integration/db/planes-cambio-por-empresa.test.ts`: R16 (SLT-128) sustituido por R4 y R8;
  `programar(vigenteDesde: string)`; comentario P9 del caso R13 actualizado.
- `tests/integration/db/planes-cambio-programado.test.ts`: «R37: no posterior a ahora» pasa a «anterior a hoy»
  (SLT-135 R2, F = ayer); nuevo R5.
- `tests/integration/db/plan-precio-historial.test.ts`: helper `programar` (servicio con reloj fijo) en lugar de
  `repo.editar`; caso base de R15 y «00:00 exactas» programados y recibidos/promovidos por la cola; «hoy en el
  acto» pasa a R6; «dos ediciones del mismo día» con dos programaciones F = hoy aplicadas por la cola; R22 sin
  fecha omitiendo el campo (sin `vigenteDesde: null`). Fuera `HOY` y `precioDelPeriodo` (sin uso).

## Mapa R<n> → test (lo hecho)

| R | Archivo | it |
|---|---|---|
| R4 | planes-cambio-por-empresa.test.ts | «R4: F hoy: la quincenal lo recibe en la siguiente pasada y la mensual el 1 de diciembre» |
| R8 | planes-cambio-por-empresa.test.ts | «R8: con el plan partido, editar programa y reemplaza» |
| R5 | planes-cambio-programado.test.ts | «R5: plan sin empresas con F hoy: lo promueve la siguiente pasada» |
| R6 | plan-precio-historial.test.ts | «R6: precio con F hoy: la quincenal que empieza hoy lo paga desde hoy y la mensual desde el 1» |
| R3, R6 (descuento), R11, R12 | — | pendientes (T4.2, T4.3) |

## Salida real

```
planes-cambio-por-empresa   Test Files 1 passed (1) · Tests 18 passed (18)
planes-cambio-programado    Test Files 1 passed (1) · Tests 14 passed (14)
plan-precio-historial       Test Files 1 failed (1) · Tests 1 failed | 8 passed (9)
  × dos ediciones del mismo día dejan la última; una edición sin cambio de precio no añade fila; ...
    historial en 2026-11-16 06:00: esperado 36000.00 + descuento bimestral, recibido 35000.00 sin descuentos
eslint (3 archivos): 0 errores, 0 avisos
```
Base: `servi_logistic_slt135`.

## Bloqueo (cambio de producción necesario)

`lib/repositories/PlanesRepository.ts > escribirPrecioDelCambio` llama a `escribirPrecioDelHistorial(..., "dejar")`
(`ON CONFLICT ("plan_id","desde_at") DO NOTHING`). Con SLT-135, F = hoy hace alcanzable esto: dos ediciones
del precio el mismo día, cada una ya aplicada por la cola antes de guardar la siguiente, escriben en el
mismo `desde_at` (las 00:00 de hoy). La segunda no pisa la fila: el plan queda en 36 000 y el historial
dice 35 000 desde hoy. Así se rompe la coherencia «la última fila = precio vigente» (SLT-86 §1.2), y el período que empieza hoy
cobraría el precio viejo. Antes, `PlanesRepository.editar` usaba `"pisar"`.

Posible arreglo (decisión del leader o del spec): «dejar» solo frente a una fila escrita por el MISMO cambio
(la recepción de otra empresa); frente a una fila de un cambio anterior, pisar.

## T4.2–T4.3 (backend_dev, 2026-11-18)

No toqué `lib/`, `app/`, `tests/components`, `tests/unit` ni los 3 archivos de T4.1. Ningún test de esta tanda
cayó por el fallo escalado de `escribirPrecioDelCambio`: ninguno escribe dos precios con el mismo `desde_at`.

### Archivos (11, todos en `tests/integration/db/`)

- `plan-descuento-periodo.test.ts`: nuevo R6. «R10, R31» y «R11» programan con F = hoy y la pasada de la cola
  los promueve (`aplicarCambioProgramado`). El diff del descuento se comprueba en `cambio_aplicado`; la edición
  igual va con fecha.
- `plan-borrador-confirmar.test.ts`: R11 sustituye al caso «cambio_a_medias / De inmediato». El borrador antiguo
  se escribe a mano con `vigencia: { vigenteDesde: null }`. Nuevo R12. «R18 sin diferencias» va con fecha.
- `planes-edicion-en-uso.test.ts`: nuevo R3. Las ediciones van con F = hoy y `recibirTodo` (recepción de cada
  empresa con su reloj y promoción). «R6 archivado» por el repositorio pasa a `programarCambio`.
- `planes-cambio-correos.test.ts`: R41 pasa a «editar con F hoy»: guardado el 1 de noviembre, la mensual lo
  recibe hoy, el correo sale con su fecha y no hay recordatorios. Sin cambios con fecha. R41/R45: recibe por la
  cola antes de leer el tope.
- `planes-historial.test.ts`: R29 con `cambio_programado` + `cambio_aplicado` en vez de `editado`. «plan_rastro
  falla» pasa a `programarCambio` (no deja pendiente).
- `plan-costo-porcentual-escritura.test.ts` y `planes-costeo-escritura.test.ts`: `editarYAplicar` (F = hoy, que
  la cola aplica). El rastro se mira en `cambio_aplicado`.
- `planes-periodicidad-ordenes.test.ts`: F por defecto = hoy (10 de noviembre) y `recibirTodo` donde el caso
  necesita el cambio ya aplicado.
- `factura-plataforma-cambio-plan.test.ts`: los tres R36 que editaban en el acto escriben a mano
  `plan.periodicidad_ordenes` (solo preparan datos; lo medido es el cierre de la factura). Programar movería la
  recepción de la mensual al 1 de diciembre y cambiaría las aserciones de SLT-118. Las ediciones programadas
  siguen por `PlanesService`.
- `planes-asignacion.test.ts`: R11 con F = hoy (1 de noviembre). La mensual lo recibe por la cola.
- `cobro-plataforma-plan.test.ts`: este archivo commitea. Cada «edición» de P es un pendiente que ya rige,
  escrito a mano sin recepciones (el mismo patrón que ya tenía su caso «cambio programado») y promovido por
  `aplicarCambioProgramado`. Así no quedan trabajos en `jobs`.

### Mapa R<n> → test (esta tanda)

| R | Archivo | it |
|---|---|---|
| R3 | planes-edicion-en-uso.test.ts | «R3: los topes y los módulos llegan por la recepción, no al guardar» |
| R6 | plan-descuento-periodo.test.ts | «R6: un descuento con F hoy se programa» |
| R11 | plan-borrador-confirmar.test.ts | «R11: una vigencia sin fecha guardada antes queda pendiente al confirmar» |
| R12 | plan-borrador-confirmar.test.ts | «R12: confirmar con F hoy programa» |

### Salida real (base `servi_logistic_slt135`, `--no-file-parallelism`)

```
pnpm exec vitest run --no-file-parallelism <los 11 archivos>
 Test Files  11 passed (11)
      Tests  128 passed (128)          (0 skipped)
pnpm exec tsc --noEmit -p .            0 errores (tests/integration incluido)
pnpm exec eslint <los 11 archivos>     exit 0, sin avisos
grep -rn "vigenteDesde: null" tests/integration/   ninguna entrada de editar; quedan respuestas de asignar,
                                                   crear, cambiarTipoCobro y R7 (`cambio: false`)
pnpm run test:guardias                 2 archivos rojos, 5 tests; ninguno es de esta tanda:
  · dependencias-declaradas-presentes.guardia (4): está en tests/baseline-rojos.json.
  · superficie-de-uso.guardia (1): «lib/actions/planes.ts crearPlanAction / editarPlanAction sin superficie».
    Viene de SLT-144 (`editarPlanAction ya no baja` a la página): ya en HEAD, ninguna página importa esas actions.
    No está en el baseline. Lo decide el leader: anotar `@sin-superficie` o quitar las actions (es `lib/`, fuera
    de mi alcance).
```

**Veredicto T4.2–T4.3:** los 11 archivos en verde (128/128, 0 saltados), con typecheck y lint limpios. Queda
abierto el rojo de superficie de SLT-144 y el fallo escalado de T4.1.
