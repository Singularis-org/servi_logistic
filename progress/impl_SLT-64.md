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
