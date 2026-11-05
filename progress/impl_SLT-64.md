# SLT-64 · bitácora de implementación

Alcance R1–R17. T1 → T2 hechas por `backend_dev`; consolidado por el leader, porque el implementer
fue cortado por el hook `handback-send-enforce` mientras esperaba a su subagente.

## T1 → T2 (hasta 99abb72d)

### Archivos

- **Creados:** `tests/integration/db/ciclo-vida-gestion-final.int.test.ts`,
  `tests/unit/analytics/ciclo-vida-resultados-de-cierre.guardia.test.ts`.
- **Lógica o contrato:** `lib/repositories/CicloVidaRepository.ts`, `lib/types/conteo-ciclo-vida.ts`.
- **Solo comentarios:** `lib/interfaces/repositories/ICicloVidaRepository.ts`,
  `lib/actions/ciclo-vida.ts`, `lib/analytics/entregas-conteo.ts`,
  `lib/repositories/CohorteCargaRepository.ts`, `lib/repositories/ventana-de-carga.ts`,
  `app/(app)/analitica/_components/entregas/CicloVidaKpi.tsx`,
  `tests/integration/db/cohorte-carga-ventana.int.test.ts`,
  `tests/integration/db/cohorte-carga-reloj.int.test.ts`,
  `tests/unit/analytics/cohorte-terminales.guardia.test.ts`.
- **Tests actualizados:** `tests/unit/analytics/ciclo-vida.test.ts`,
  `tests/integration/db/455/caracterizacion/sql-crudo-conteos.test.ts`.

### Mapa R → test

Los casos de R1–R9 y R11 están en `ciclo-vida-gestion-final.int.test.ts`; sus nombres empiezan por
el requisito. R10 está en `ciclo-vida-resultados-de-cierre.guardia.test.ts`.

### Mutaciones (17/17 matadas)

| Mutación | Caso que la mató |
|---|---|
| a. leer historial | R1 `entregado` sin historial |
| b. sin filtro de resultados | R2 `reprogramado` |
| c. sin `NOT EXISTS` | R5 `entregado` dentro |
| d. ventana en el `NOT EXISTS` | R5 `entregado` dentro |
| e. sin `anulada_at` en el `NOT EXISTS` | R7 `novedad` de D2 |
| f. sin `anulada_at` externo | R7 `entregado` de D2 |
| g. fin = instante de la corrección | R8 |
| h. sacar la devolución de la lista | R8 (también R1 y R11) |
| i. sin `g2.id` | R3 empate |
| j. sin `condicionDeAlcance` | R9 «recorta por si sola». Sobrevivió la primera vez; se reforzó el test |
| k. sin `deleted_at` | R9 borrada |
| l. sin `EXISTS` de mensajero | R9 mensajero |
| m1. sin `comoApp` | R9 otra empresa |
| m2. RLS desactivada en la tx | R9 otra empresa |
| extra: ventana sobre `o.created_at` | R4 cargada fuera |
| extra: `<=` arriba | R4 `[desde, hasta)` |
| guardia T1: literal a mano | «no contiene ninguno de los valores como literal» |

g y h se midieron con un parche local, nunca commiteado, porque el cliente Prisma era anterior a
SLT-52. Repetirlas sin parche forma parte de T3 → T4.

**Actualización (T3 → T4):** repetidas sin parche, con el cliente regenerado y 29 casos ejecutados, 0
saltados. Las dos mueren por aserción; el detalle está en la tabla de T3 → T4.

### Tests

Medido por el leader tras `prisma generate`, sin parche: `ciclo-vida-gestion-final.int` 29/29, 0 saltados.
`prisma migrate status`: base local al día.

Medido por `backend_dev` antes de regenerar (pasados/fallados/saltados):
`ciclo-vida-resultados-de-cierre.guardia` 8/0/0, `ciclo-vida` 28/0/0, `cohorte-terminales.guardia` 8/0/0,
`cohorte-carga-ventana.int` 2/0/0, `cohorte-carga-reloj.int` 4/0/0, `sql-crudo-conteos` 4/0/0,
`censo-order-status-rename` 14/0/0.

`conteo-productos.int` y `dinero-productos.int` dan archivo `failed` con todo saltado también en
`origin/dev`, y están en el baseline: no es regresión.

### Aritmética de `sql-crudo-conteos`

O1 14 400 s + O4 19 800 s + O6 22 200 s = 56 400 s, n = 3 (antes 69 000).
No cuentan O2 y O3 (`novedad`), O5 (`reprogramado`), O7 (sin gestión) ni O8 (solo transición terminal).

### Desviaciones del spec

1. R6 y R8 no usan `454/_escenario`, porque esos tests están en el baseline: necesitan órdenes y zona
   central, y la base de CI solo trae catálogos. Siembran el cierre en el test y llaman a los métodos
   reales `resolverCierre` y `corregirResultadoGestionEnCierre`.
2. `condicionesDeCiclo`: cambió su comentario de cabecera, no su cuerpo.
3. Mutación g: `gestion_orden` no tiene `updated_at`; se usó el evento `gestion_corregida` de `orden_evento`.
4. Añadidos: aserción en la guardia de que el repositorio ya no nombra `ESTADOS_TERMINALES` ni
   `orden_historial_estado`; caso en `ciclo-vida.test.ts` sobre los resultados como parámetros.

## T3 → T4

### Archivos

- **Creados:** `lib/analytics/tags-entregas.ts`,
  `tests/unit/analytics/tags-entregas-fuente-unica.test.ts`,
  `tests/unit/actions/deshacer-gestion-invalida-analitica.test.ts`,
  `tests/unit/actions/corregir-resultado-invalida-analitica.test.ts`,
  `tests/unit/analytics/cache-invalidacion-correccion-cableado.test.ts`.
- **Lógica o contrato:** `lib/actions/analitica-refrescar.ts`, `lib/actions/cierre-dia.ts`,
  `lib/actions/cierres-admin.ts`, `lib/interfaces/external/IAnaliticaCache.ts`.
- **Solo comentarios:** `lib/cache/next-analitica-cache.ts`, `lib/config/conteo-entregas-cache.ts`,
  `lib/repositories/ConteoCargadasPorDiaRepository.ts` (el comentario falso sobre `CicloVidaRepository`).

Sin tocar, y en verde: `refrescar-cache-analitica.test.ts`,
`cierres-admin-corregir-resultado-action.test.ts` y `cierre-dia-action.test.ts`.

### Mapa R → test

| R | Test |
|---|---|
| R12 | `deshacer-gestion-invalida-analitica`: «una vez, con origen…», «R12: invalida después…» |
| R13 | `corregir-resultado-invalida-analitica`: «una vez, con origen…», «R13: invalida después…» |
| R12, R13 (cableado) | los casos «cableado» de esos dos archivos (conducta), y `cache-invalidacion-correccion-cableado` (estático) |
| R14 | los dos archivos, bloque «si no se aplica, no invalida» |
| R15 | los dos archivos: «una caché que lanza» y «si falla CONSTRUIR el puerto» |
| R16 | los dos archivos: «R16: el puerto con registro deja una línea…» |
| R17 | `tags-entregas-fuente-unica` |

**Lo que no cubren.** Los tests de R12 usan un servicio doble, así que no distinguen las tres vías:
miden que un `ok` invalida. En el navegador solo se ejerció la vía de la gestión pendiente sin cierre.
Que las otras dos devuelven `ok` sale de design §3; no se midió aquí.

### Mutaciones (28/28 matadas)

Cada una se aplicó, se corrió y se revirtió con un script. Base sin mutar: 71 casos, 71 pasados, 0
saltados. Al terminar, `git status --porcelain` y `git diff` eran idénticos a los de antes.
Ninguna dio rojo de compilación. d3, d8, c3 y c8 fallan porque la acción rechaza con el error de la
caché, que es justo la conducta que R15 prohíbe; el resto falla por `AssertionError`.

`dN` es `deshacerGestion` y `cN` es `corregirResultadoGestion`.

| Mutación | Caso que la mató |
|---|---|
| t3-a. `analitica-refrescar` escribe su propia lista | «la importa de `tags-entregas`…», «no importa ni nombra ninguna `TAG_*`» |
| t3-b. la constante pierde una etiqueta | «contiene exactamente las ocho etiquetas» |
| t3-c. literal a mano en `lib/` | «fuera de los permitidos no aparece ningún literal» |
| d1, c1. borrar la llamada a `invalidar` | «una vez, con origen…» y otros cuatro de conducta, más el estático |
| d2, c2. invalidar sin mirar el `status` | R14: cada estado no-ok del servicio |
| d3, c3. propagar el error de la caché | R15: «una caché que lanza», «si falla CONSTRUIR» |
| d4, c4. default `cacheNula()` | «cableado: sin caché inyectada…», «si falla CONSTRUIR», y los dos estáticos |
| d5, c5. origen `manual` | «una vez, con origen…», R16, «cableado…», estático |
| d6, c6. sin `await` | «R12/R13: invalida después…», estático |
| d7, c7. no pasar `deps.cache` | «una vez, con origen…», R12/R13, R16, estático |
| d8, c8. construir el puerto fuera del `try` | R15: «si falla CONSTRUIR el puerto» |
| d9, c9. registrar el error crudo | R15: «una caché que lanza» (el log traía el id de la empresa) |
| d10, c10. sin línea en el log | R15: los dos casos |
| d11, c11. invalidar antes del servicio | «R12/R13: invalida después…», R14, estático |
| x. la constante pierde otra etiqueta, medida por las acciones | «una vez, con origen…» y R16, en los dos archivos |
| g. fin = instante de la corrección (T2, sin parche) | R8: `{ segundosAcum: 801202711, n: 1 }` contra `{ 14400, 1 }` |
| h. sacar la devolución de la lista (T2, sin parche) | R1 (`n` 2 contra 3), R8 (`n` 0 contra 1), R11 (`n` 5 contra 6) |

### Tests

- `pnpm typecheck`: 0 errores.
- `eslint` sobre los archivos tocados: 0 problemas.
- `pnpm exec vitest related --run <archivos tocados>`: 3544 pasados, 17 fallados, 17 saltados.
- Los 17 fallados son todos de `tests/integration/db/premio-ranking-idempotencia.test.ts`
  (`referencia a otra empresa: cierre_dia.destino_zona_id -> zona`). Ese archivo está en
  `tests/baseline-rojos.json`.
- `pnpm run test:guardias`: 4571 pasados, 4 fallados, 1 saltado. Los 4 son de
  `dependencias-declaradas-presentes.guardia` (marcadores de `init.sh`). Ese archivo está en el baseline
  y esta tanda no toca `init.sh`.

### Lo que ve el usuario

**Se vio en el navegador**: Chromium con Playwright, un solo `next dev` en el puerto 3064, y el maestro
entrando por `/login`. Datos locales creados por los servicios reales: 4 gestiones `entregado`,
1 `reprogramado` y 1 orden en reparto sin gestión, con 0 cierres del mensajero. Filtro por defecto.

| Paso | Rótulo del ciclo de vida | Tarjeta «Entregado» |
|---|---|---|
| 1. Inicial | (4 órdenes cerradas), 4 s | 4 |
| 2. Control: se anula una gestión por SQL, sin pasar por la acción | (4 órdenes cerradas) | 4 |
| 3. El mensajero deshace otra por `/cierre-dia`; primera lectura | (4 órdenes cerradas) | 4 |
| 4. Segunda lectura | (2 órdenes cerradas) | 2 |
| 5. Tercera lectura, 8 s después | (2 órdenes cerradas) | 2 |

El paso 1 cumple el criterio del cierre: N > 0 y coherente con «Entregado N». El paso 2 demuestra que la
caché estaba viva, y por tanto que lo que movió la cifra en el paso 4 fue la invalidación, no el TTL.
El log del servidor registró una línea `[analitica_cache_invalidacion]` con origen
`correccion_gestion` y las ocho etiquetas, sin ningún fallo de invalidación. La secuencia se corrió dos
veces; en la primera solo se llegó al paso 3, con el mismo resultado.

**Hallazgo abierto, para decidir (no se tocó).** La **primera lectura tras invalidar todavía sirve la
cifra vieja** (paso 3), y la siguiente ya trae la nueva.
- **Causa probable.** `NextAnaliticaCache.invalidar` usa `revalidateTag(tag, "max")`, y el comentario de
  `unstable-cache.js` dice que una entrada caducada se devuelve y se revalida en segundo plano. Lo medido
  es la secuencia de arriba; la causa sale de leer el código de Next.
- **Consecuencia.** Quien deshace y recarga una vez puede seguir viendo el número anterior. R12 y R13
  se cumplen tal como están escritos (se invalida antes de responder), pero D2 dice que el dato se mueve
  con la corrección, y aquí se mueve en la segunda lectura.
- **Mismo adaptador.** El botón «Actualizar» pasa por ese `invalidar`, y el comentario de
  `analitica-refrescar.ts` dice que la siguiente lectura falla en caché. Por el código no sería así; el
  botón **no se midió**.
- **Por qué no se tocó.** Cambiar el perfil afecta también al job del rollup y al botón, y queda fuera
  de este alcance.

También apareció, 3 veces en la primera corrida y 0 en la segunda, `Unable to start a transaction in the
given time` en lecturas de otros paneles del servidor de desarrollo. No se investigó la causa.

**Limpieza.** Se comparó el conteo de filas de las 111 tablas antes y después: `SIN DIFERENCIAS`. Además
de las dos empresas de prueba, se borraron cinco filas creadas durante la corrida (cuatro notificaciones
de otras empresas y un job de mantenimiento) y las sesiones, dispositivos e intentos de login de esos
usuarios. Dev server parado, puertos libres, spec y config temporales borrados.

### Veredicto

T3 → T4 terminadas, con R12–R17 cubiertos y 28/28 mutaciones matadas; queda abierta la decisión sobre la primera lectura tras invalidar.

## Cierre del hallazgo: la primera lectura tras invalidar

**Causa.** Con `"max"`, `revalidateTag` solo marca la entrada como obsoleta (`revalidateTag.md:20`) y
la lectura siguiente la sirve mientras revalida en segundo plano. Con `{ expire: 0 }`, el manifiesto
guarda `expired = ahora` y `areTagsExpired` hace que `IncrementalCache.get` devuelva `null`
(`incremental-cache/index.js:373`): la lectura va a la base.

**Cambio.** `PERFIL_INVALIDACION = { expire: 0 }` en `lib/cache/next-analitica-cache.ts`, con su
comentario reescrito. `tests/unit/cache/cache-por-empresa.test.ts` lo fija como literal.

**Comprobado en el código de Next instalado.** `revalidateTag` acepta el objeto
(`revalidate.d.ts:9`) y `revalidate()` no distingue entre Server Action y route handler
(`revalidate.js:102-213`). `updateTag` sí los distingue, y por eso no sirve aquí. El route handler lo
vacía en `app-route/module.js:224`.

### Medición

Misma receta del paso 3: Chromium con Playwright, un solo `next dev` en el 3064 y datos creados por
los servicios reales (4 `entregado`, 1 `reprogramado`, 1 en reparto sin gestión, 0 cierres). El spec
se reescribió, porque el anterior se borró. Por eso se corrió primero con `"max"`: reproduce la tabla
del paso 3, así que la receta distingue los dos perfiles. Cada corrida usó una empresa nueva. Las
cifras son `rótulo / tarjeta «Entregado»`.

| Paso | `"max"` (antes) | `{ expire: 0 }` (después) |
|---|---|---|
| 1. Inicial | 4 / 4 | 4 / 4 |
| 2. Control: se anula una gestión por SQL, sin invalidar | 4 / 4 | 4 / 4 |
| 3. El mensajero deshace otra por `/cierre-dia`; **primera lectura** | **4 / 4** | **2 / 2** |
| 4. Segunda lectura | 2 / 2 | 2 / 2 |
| 5. Tercera lectura, 8 s después | 2 / 2 | 2 / 2 |
| 6. Control: se anula otra por SQL, sin invalidar | 2 / 2 | 2 / 2 |
| 7. Clic en «Actualizar»; **primera lectura**, la del propio clic | **2 / 2** | **1 / 1** |
| 7b. Misma pantalla, 3 s después, sin navegar | 2 / 2 | 1 / 1 |
| 8. Se navega de nuevo a `/analitica` | 1 / 1 | 1 / 1 |

Los pasos 2 y 6 demuestran que la caché estaba viva: lo que movió la cifra fue la invalidación, no el
TTL.

### Efectos

- **Botón «Actualizar»: medido.** Con `"max"` el botón no traía la cifra nueva: el usuario pulsaba y
  seguía viendo la vieja. Ahora la trae en el propio clic, y lo que dice `analitica-refrescar.ts` («la
  siguiente lectura falla en caché») pasa a ser cierto. El servidor registró origen `manual`.
- **Job puntual `analitica_invalidacion_cache`: medido a medias.** Se insertó el job a mano y se llamó
  al cron `procesar-jobs` por su ruta real. Terminó `done`, con 1 intento y sin error, y el log trae
  la línea con origen `backfill`. Eso prueba que `{ expire: 0 }` no lanza en el route handler. No prueba
  la cifra: las lecturas de `analitica:operativa` no se pintan hoy en la pantalla.
- **Job del rollup `analitica_rollup_diario`: solo por lectura de código, no se midió.** Usa el mismo
  adaptador y la misma ruta (`procesar-jobs/route.ts:209-218`, `analitica-rollup-diario-handler.ts:119`).
  Tras el rollup, la primera lectura de `TAGS_OPERATIVA` irá a la base en vez de servir la entrada
  anterior, y esa lectura tarda lo que tarde la consulta.
- **Coste nuevo en las tres acciones: medido en parte.** `{ expire: 0 }` activa
  `pathWasRevalidated` (`revalidate.js:209-212`), así que la respuesta lleva
  `x-action-revalidated: 1` y la página en curso renderizada de nuevo. Medido en `next dev`: 65 416
  bytes en deshacer y 102 674 en «Actualizar». Las dos pantallas siguieron funcionando, sin error en el
  log. No se capturó el tamaño con `"max"`, así que no hay diferencia medida. `corregirResultadoGestion`
  tiene el mismo cambio, pero no se ejerció en el navegador.

**No medido.**
- `next start` ni el despliegue: todo es en `next dev` con una sola instancia.
- Las otras dos vías de deshacer y `corregirResultadoGestion`, en el navegador.
- Que «Actualizar» conserve un filtro distinto del de por defecto tras el nuevo render.

**En el log de las dos corridas:** `Error: aborted` aparece 1 vez con cada perfil. `Unable to start a
transaction in the given time` aparece 2 veces con `"max"` y 0 con `{ expire: 0 }`. Ninguno se investigó.

### Mutación

Volver a `"max"` la mata «invalida la misma etiqueta con la que se escribió, y no la de otra empresa»:
1 fallado y 13 pasados, por `AssertionError`. Sin la mutación, 14/14.

### Limpieza

Se comparó el contenido de las 110 tablas (hash por fila; `_prisma_migrations` no entra) antes y
después. Quedan **sin filas de prueba**: se borraron las dos empresas de prueba con sus datos, sus
sesiones, dispositivos e intentos de login, y 4 notificaciones `alert` de otras empresas que creó
el cron durante la corrida.

**Sí queda una diferencia, y no se pudo revertir:** 12 jobs `geocodificacion` que ya estaban en la base
local, de otras empresas, avanzaron sus reintentos porque el cron los procesó. Siguen `pending`, con 4
intentos. La foto guardaba hashes, no el contenido, así que no hay de dónde restaurarlos.

Dev server parado, puertos libres; spec y config temporales borrados; `.next/dev` borrado.

### Tests

- `pnpm typecheck`: 0 errores.
- `eslint` sobre los dos archivos de código: 0 problemas.
- `pnpm exec vitest related --run lib/cache/next-analitica-cache.ts tests/unit/cache/cache-por-empresa.test.ts`:
  3381 pasados, 17 fallados, 17 saltados.
- Los 17 fallados son todos de `tests/integration/db/premio-ranking-idempotencia.test.ts`, el mismo
  archivo y el mismo número que en T3 → T4. Ese archivo está en `tests/baseline-rojos.json`.
- No se corrieron `pnpm run test:guardias` ni `./init.sh`: quedan para el gate de la feature.

### Veredicto

Hallazgo cerrado: con `{ expire: 0 }` la primera lectura trae la cifra nueva, tanto al deshacer como con «Actualizar».

## Vuelta 2

Responde a `progress/review_SLT-64.md`: B1, B2, m1, m2, m5, m6 y m7. No se hizo m3. m4 y
`progress/features/SLT-64.md` quedan para el leader. El código de producción solo cambia en dos
comentarios (m5).

### Archivos

- `tests/integration/db/ciclo-vida-gestion-final.int.test.ts`: B1.
- `e2e/cierres-admin.spec.ts`: caso (c) nuevo (B2, parte 2).
- `tests/unit/actions/deshacer-gestion-invalida-analitica.test.ts`: m1.
- `lib/types/cohorte-carga.ts`, `app/(app)/analitica/_components/entregas/base-del-kpi.ts`: m5.
- `specs/…/requirements.md` (m2), `design.md` (m6), `tasks.md` (m7).

### Mapa R → test: lo que cambia

| R | Test |
|---|---|
| R1 (desempate por `id`) | `ciclo-vida-gestion-final.int`, «R3: el empate lo decide el `id` mayor», ya con duraciones distintas |
| R12 (las tres vías) | `deshacer-gestion-invalida-analitica`, bloque «las tres vías, con `CierreDiaService` real» |
| R13 (primera lectura, en navegador) | `e2e/cierres-admin.spec.ts`, caso (c) |

### B1: el desempate de R1

Las dos órdenes del caso ya no duran lo mismo: `pierdeElCierre` se carga en `D_MENOS_1`.

| Mutación | Resultado |
|---|---|
| ninguna | 29/29 |
| `(g2."created_at" > g."created_at" OR (g2."created_at" = g."created_at" AND g2."id" < g."id"))` | **Matada**: 1 fallado y 28 pasados, por aserción: `expected { segundosAcum: 100800, n: 1 } to deeply equal { segundosAcum: 14400, n: 1 }` |

100 800 s son las 28 h de la orden que no debía contar. Mutación revertida.

### B2, parte 1: los tres specs

Con la receta de `docs/verification.md > El E2E`: base desechable recreada antes de la primera corrida,
migrada (295) y con `db:seed`; `next build` sobre el código final; `E2E_PUERTO=3044`; `--project=aislamiento
--project=dinero`. `dos-empresas-humo` arrastra `plataforma-vacia` por `dependencies`, de ahí los dos
archivos `superadmin-*`.

| Spec | Corrida 1 | Corrida 2 |
|---|---|---|
| `e2e/cierre-dia.spec.ts` | 2 pasados, 0 fallados, 0 saltados | 2, 0, 0 |
| `e2e/cierres-admin.spec.ts` (con el caso nuevo) | 3, 0, 0 | 3, 0, 0 |
| `e2e/dos-empresas-humo.spec.ts` | 8, 0, 0 | 8, 0, 0 |
| `superadmin-arranque` y `superadmin-empresas` (dependencia) | 10, 0, 0 | 10, 0, 0 |

Corrida 1 (líneas recortadas a 150 caracteres, sin las del servidor):

```
Running 23 tests using 1 worker
  ok  1 [plataforma-vacia] › e2e\superadmin-arranque.spec.ts:53:5 › el comando de arranque deja un superadmin sin empresa y no imprime sus datos (
  ok  2 [plataforma-vacia] › e2e\superadmin-arranque.spec.ts:71:5 › entra con OTP y aterriza en «Empresas», con «Empresas», «Planes» y «Geo
  ok  3 [plataforma-vacia] › e2e\superadmin-arranque.spec.ts:88:5 › /configuracion no le deja entrar (R6, R5) (331ms)
  ok  4 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:206:5 › 1. «Empresas» abre con el formulario de alta y sin aviso (R29) (175ms)
  ok  5 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:214:5 › 2. crea A y B desde el formulario y las dos salen en el listado con su maestr
  ok  6 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:254:5 › 3. repetir el slug de A marca su campo y no crea nada (R31) (680ms)
  ok  7 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:272:5 › 4. un slug inválido marca el campo sin crear nada (R34) (623ms)
  ok  8 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:322:7 › 5-6. el maestro de A crea su contraseña con el enlace de bienvenida, «Empre
  ok  9 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:322:7 › 5-6. el maestro de B crea su contraseña con «¿Olvidaste tu contraseña?»,
  ok 10 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:348:5 › 7. con las dos contraseñas creadas, ni la fila de A ni la de B ofrecen «Ree
  ok 11 [dinero] › e2e\cierre-dia.spec.ts:55:7 › Cierre del día — el mensajero solicita y deshace › (a) totales por método y ganancia → So
  ok 12 [dinero] › e2e\cierre-dia.spec.ts:98:7 › Cierre del día — el mensajero solicita y deshace › (b) Devolver a gestión → la fila sale,
  ok 13 [dinero] › e2e\cierres-admin.spec.ts:75:7 › Cierres del día — el admin aprueba o rechaza › (a) detalle con totales y evidencia → Ap
  ok 14 [dinero] › e2e\cierres-admin.spec.ts:118:7 › Cierres del día — el admin aprueba o rechaza › (b) Rechazar exige motivo → con motivo
  ok 15 [dinero] › e2e\cierres-admin.spec.ts:163:7 › Cierres del día — corregir el resultado mueve Analítica en la primera lectura › (c) el
  ok 16 [aislamiento] › e2e\dos-empresas-humo.spec.ts:217:5 › alta de A y B desde «Empresas» por el superadmin, y el correo de recuperación de
  ok 17 [aislamiento] › e2e\dos-empresas-humo.spec.ts:242:7 › el maestro de A recorre todas las rutas de su menú sin error ni datos de B (20.1s)
  ok 18 [aislamiento] › e2e\dos-empresas-humo.spec.ts:242:7 › el maestro de B recorre todas las rutas de su menú sin error ni datos de A (17.8s)
  ok 19 [aislamiento] › e2e\dos-empresas-humo.spec.ts:287:5 › cada maestro abre el webhook de su API key y ve su URL, no la de la otra empresa (2.
  ok 20 [aislamiento] › e2e\dos-empresas-humo.spec.ts:308:5 › B abriendo los detalles de A ve «no encontrado», y A los ve con su marcador (3.3s)
  ok 21 [aislamiento] › e2e\dos-empresas-humo.spec.ts:336:5 › SL-23: el superadmin dejó A con los 3 módulos y B sin «Ranking»; B no lo ve ni l
  ok 22 [aislamiento] › e2e\dos-empresas-humo.spec.ts:408:5 › vehículos carga y escribir desde la pantalla falla cerrado (R40); geografía le da
  ok 23 [aislamiento] › e2e\dos-empresas-humo.spec.ts:474:5 › SL-24: la tienda de A, al tope de su plan, no crea por la carga masiva y la de B, si
  23 passed (1.7m)
```

Corrida 2, sobre la misma base:

```
Running 23 tests using 1 worker
  23 passed (1.6m)
PW_EXIT=0
```

**Un rojo por el camino, y no es de esta rama.** La primera corrida dio 9 pasados, 1 fallado y 13 sin
correr: `superadmin-empresas` caso 2 esperaba «El correo no está configurado en este entorno», y al caer
impidió correr `dos-empresas-humo`, que depende de ese proyecto.
- **Causa medida.** El log del servidor dice `[bienvenida] no se envio: falta NEXT_PUBLIC_APP_URL`. CI la
  fija antes de `next build` (`.github/workflows/gate.yml:372`); el `.env` del worktree no la trae.
- **Arreglo de la corrida.** Exportar `NEXT_PUBLIC_APP_URL=http://localhost:3044` antes de la build, como
  CI, sin tocar el `.env`. Con eso, el caso pasa con el mismo código.
- **`origin/dev` no se corrió:** no hizo falta para atribuirlo, porque hay causa medida y
  `git diff origin/dev...HEAD` no toca ese spec, `BienvenidaMaestroService` ni `lib/config/email.ts`.
- **Aviso para el leader:** `docs/verification.md > El E2E` no menciona esta variable. Quien siga la receta
  con un `.env` sin ella tropezará con este mismo rojo. No se tocó el doc.

### B2, parte 2: `corregirResultadoGestion` en navegador

Encajó de forma natural, así que queda como **caso E2E**: `e2e/cierres-admin.spec.ts`, (c). Corre en
`next start`, con una empresa propia, dos entregas (6.000 y 2.500) y un cierre solicitado.

**Tras la respuesta con render, el diálogo y el detalle siguen funcionando:**
- el diálogo no se cierra y enseña el aviso y los totales del servidor: Total general 6.000;
- «Cerrar» lo cierra y el detalle de detrás sigue abierto, releído: 6.000;
- la orden corregida aparece en la pestaña «Devolución a origen por rechazo».

**La cifra de la primera lectura.** Medido con un spec temporal, ya borrado, en `next start` y con tres
entregas en un cierre solicitado. Las cifras son las de la tarjeta «Entregado» ya asentada.

| Paso | `"max"` | `{ expire: 0 }` |
|---|---|---|
| 1. Inicial | 3 | 3 |
| 2. Control: se anula una por SQL, sin invalidar | 3 | 3 |
| 3. Corrección por el diálogo; **primera lectura** | **3** | **1** |
| 4. Segunda lectura | 1 | 1 |

El paso 2 demuestra que la caché estaba viva. 1 = 3, menos la anulada del control, menos la corregida. En
el caso E2E, sin control, la frase de desenlaces pasa de `Entregado: 2` a `Entregado: 1` en la primera
lectura, y «(2 órdenes cerradas)» no baja (R8). El log trae `[analitica_cache_invalidacion]` con origen
`correccion_gestion` y las ocho etiquetas.

**Mutación, y un falso verde que destapó.** La primera versión del caso leía la tarjeta y **sobrevivió** a
`"max"`: la cifra se anima desde 0, así que al subir a 2 pasa por el 1 y la espera de Playwright lo daba
por bueno. Ahora lee la frase de desenlaces, que no se anima. Con `"max"` el caso cae en la lectura final,
por aserción: `locator('p').filter({ hasText: /^Entregado: 1( ·|$)/ })`, no visible. Sin la mutación, verde.

**Lo que esto mide y lo que no.** Es la primera medición de `{ expire: 0 }` en `next start`, y confirma lo
de `next dev`, con una sola instancia. Vercel sigue sin medirse (m4). Solo se ejerció la vía de deshacer
pendiente en navegador (`cierre-dia` (b)); las otras dos las cubre m1, con repositorio doble.

Al medir se vieron peticiones RSC a `/analitica` después de corregir y antes de navegar: 2 con
`{ expire: 0 }` y 1 con `"max"`. No se investigó su origen. Es dato para m3.

### m1: las tres vías con el servicio real

Bloque `it.each` en `deshacer-gestion-invalida-analitica.test.ts`: `deshacerGestion`, `CierreDiaService`
real, repositorio doble y caché espía. Cada vía comprueba que escribe solo por la suya, que invalida una vez
con las ocho etiquetas, y que si la escritura pierde la carrera da `conflict` y cero invalidaciones.

| Mutación en `CierreDiaService` | Resultado |
|---|---|
| la vía del cierre rechazado no da `ok` | matada: 1 fallado, 16 pasados, solo su caso |
| la vía pendiente no da `ok` | matada: 1 fallado, 16 pasados, solo su caso |
| la vía legada no da `ok` | matada: 1 fallado, 16 pasados, solo su caso |

### m2, m5, m6 y m7

- **m2.** R12 y R13 ya dicen que la primera lectura tras responder trae la cifra nueva, con evidencia aquí.
- **m5.** Los dos comentarios hablan de la gestión final, no del estado terminal. Solo comentarios.
- **m6.** `design.md` dice que `id` es `text` y que el orden sigue la collation.
- **m7.** `tasks.md`: marcado `./init.sh` por el `INIT_EXIT=0` que midió el leader en `0060494a`, que repetirá
  el gate tras esta vuelta. «Archivos esperados» suma los cuatro pedidos y `e2e/cierres-admin.spec.ts`.

### Tests

Todo contra la base desechable, nunca la del `.env`.

- `pnpm typecheck` (`NODE_OPTIONS=--max-old-space-size=8192`): exit 0, 0 errores.
- `eslint` sobre los archivos de código y test tocados: exit 0.
- `pnpm exec vitest related --run <los dos de m5 y los dos tests>`: 18 archivos pasados; 318 pasados, 0
  fallados, 17 saltados, exit 0. No se identificó de qué archivos son los 17 saltados, porque el reportero
  no los nombra. `ciclo-vida-gestion-final.int` (29/29) y el test de m1 (17/17) se corrieron además por su
  cuenta, sin saltos.
- No se corrieron `./init.sh` ni la suite completa, por instrucción.

### Limpieza

Base desechable borrada (`existe: false`). Puertos 3044 y 54329 libres. `test-results/` y los archivos
temporales borrados; las mutaciones revertidas. No se corrió a mano el cron de jobs y no se tocó la base del
`.env`. `.next` queda con la build de la corrida, con `NEXT_PUBLIC_APP_URL` a `localhost:3044`, y está en
`.gitignore`.

### Veredicto

B1 y B2 cerrados con mutaciones que muerden: los tres specs en verde en dos corridas y `corregirResultadoGestion` probado en navegador, con la cifra nueva a la primera.
