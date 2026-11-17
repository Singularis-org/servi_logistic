# Review — SLT-159 «Escaneo continuo en recepciones y recogidas», rebanada (b)

Reviewer, 2026-11-16. Ruta **completa**. Diff `origin/dev...HEAD` (rama
`feature/SLT-159-escaneo-continuo-recepciones`, PR #192, HEAD `0680038b`). Grafo no consultado:
Grep/Read sobre el worktree.

## Veredicto: **RECHAZADO (CAMBIOS)**

Dos bloqueantes: (1) el E2E `e2e/recepcion-satelite.spec.ts:44` falla en CI de forma intermitente
por culpa de este diff, y (2) no hay constancia de los E2E afectados corridos en local
(`docs/perfil-agentes.md > reviewer`, `CHECKPOINTS.md > Flujos críticos`), con T8 y T9 sin marcar. El
código del escaneo continuo en sí está bien: ver checklist.

## Checklist

| # | Punto | Resultado |
| --- | --- | --- |
| Ruta | Completa; sin dinero, permisos nuevos en servidor, auth ni webhooks | OK |
| Spec | requirements (EARS R580-R594, R610-R613, R615), design con `## Lo que ya existe` y alternativas, tasks | OK |
| Lo que ya existe | El diff reutiliza `useEntradaEscaneo`, `EscanerModal`, `QrScanner encendidaAlMontar`, `AppPage`, `leerGuia`, `ResumenRecepcion`; no re-crea nada de la lista | OK |
| Tasks | T1-T7, T10, T11 `[x]`; **T8 y T9 `[ ]`** (E2E local y Preview) | **NO** (B2) |
| Tamaño | `node scripts/tamano-pr.mjs`: 31/40 archivos, 1182/1000 producción, 1397/3000 tests; aceptado por Carlos en `progress/features/SLT-159.md:18` | OK |
| Trazabilidad | Cada R con test que lo verifica; mapa en `progress/impl_SLT-159.md:30-53` | OK (ver m1) |
| Typecheck | `tsc --noEmit -p .` → `TSC_EXIT=0` | OK |
| Lint | `eslint` de los .ts/.tsx del diff → `LINT_EXIT=0` | OK |
| Tests del diff | 14 archivos, 228 tests en verde | OK |
| Otros usos (SLT-157/158/160, C5, M1/M2) | 15 archivos más (EscanerModal, buscadores con escaneo, Recoger*, Recoleccion*, Reparto*, RecepcionSateliteModule, guardias de escaneo y diálogos): 425 tests en verde | OK |
| E2E flujo crítico (recepción) | Existe `e2e/recibir-paquetes.spec.ts`, pero sin salida local en la bitácora; y `recepcion-satelite.spec.ts` sale rojo en CI | **NO** (B1, B2) |
| Servidor / acciones / guardas | Ningún archivo de `lib/actions`, `lib/services`, `lib/repositories`, `db/`. `tienda_ajena`, `zona_ajena`, `sin_zona`, `estado_invalido`, `conflict`: mismos textos, ahora en `desenlace*` puro | OK |
| Multi-empresa / RLS / migraciones / Ordenex / país | Nada nuevo | OK |
| Dependencias | Ninguna | OK |
| Comentarios | Dicen el porqué | OK |

### Lo que se pidió comprobar con cuidado

1. **Nunca dos recepciones ni lecturas perdidas.** La fila nace en `alLlegar` (síncrono, sobre una
   ref) y se clasifica en el acto: una relectura de una guía en «Recibiendo…/Recibida/Ya recibida» no
   llama a la acción (`lib/utils/sesion-escaneo.ts:70-77`, `hooks/useSesionEscaneo.ts:109`). Cola
   FIFO de ids alineada con la de SLT-158 (cada lectura pasa una vez por `alLlegar` y una por
   `procesar`, `hooks/useEntradaEscaneo.ts:226-230`); una sola cadena de promesas para cola y
   «Reintentar» (`useSesionEscaneo.ts:76-91`). «Código inválido» no llama a la acción. «Código
   inválido» y «No se pudo recibir» no suman (`sesion-escaneo.ts:112-121`). OK, con los matices m2-m4.
2. **Permisos.** `/ordenes/recibir`: maestro/admin → central, adminTienda → tienda, resto y sin
   sesión → `notFound()` antes de nada; adminSatelite no entra. `/recepcion-satelite/recibir`: solo
   adminSatelite. `desde` con lista blanca `{por-recibir, en-bodega}` y destino siempre
   `/recepcion-satelite/<valor>`: sin open redirect. Coincide con los flags de `/ordenes/page.tsx:92-97`. OK.
3. **Acciones y guardas.** Sin cambios de servidor; las tres superficies siguen llamando a la misma
   acción con `{ numGuia }`. OK.
4. **Un solo refresh.** Diálogo: `alCerrarConRecepcion` una vez al desmontar si hubo `recibida`/
   `ya_recibida`. Página: «Terminar recepción» hace `push(volverA)` + `refresh()` una vez. OK (m4).
5. **Cámara continua y C5.** Ni `EscanerGuiaCard` ni la página pasan `disabled` a `QrScanner`; el
   pestillo `entregado` solo sigue en modo suelto. C5 solo gana `continuo` (una línea); conserva
   `exito`, barra, faltantes y aviso; la relectura de una guía ya confirmada ya era inocua en C5. OK.
6. **Otros usos.** `alLlegar` y `continuo` son opcionales y por defecto no cambian nada; tests de
   SLT-157/158/160 y de las recogidas en verde (ver checklist). OK.
7. **`lib/modulos/reparto.ts`.** Dos rutas `"nucleo"`, exigidas por la guardia `modulos-reparto`;
   coherentes con sus hermanas. OK.
8. **Mutaciones del reviewer** (script en el scratchpad, cada una restaurada con `git checkout --`,
   árbol limpio al final, sin `git stash`):

| Mutación | Resultado |
| --- | --- |
| Doble recepción: una relectura en sesión vuelve a la acción (`sesion-escaneo.ts:75`) | ROJO (2 tests) |
| «Código inválido» suma a «No encontradas» (`:118`) | ROJO (2) |
| «No se pudo recibir» suma a «Recibidas» (`:115`) | ROJO (1) |
| `desde` sin lista blanca (`recepcion-satelite/recibir/page.tsx:12`) | ROJO (1) |
| `EscanerGuiaCard` no pasa `continuo` a la cámara | ROJO (2: C5 y diálogo) |
| adminTienda recibe en bodega central en `/ordenes/recibir` | ROJO (1) |
| refresco del listado en cada lectura del diálogo | ROJO (2) |
| `OrdenesListado.tsx:1414`: rol cruzado en el diálogo continuo | **VERDE** (sobrevive, m1) |

## Hallazgos

### B1 — BLOQUEANTE (mayor): dos botones «Recibir paquete…» antes de hidratar; `recepcion-satelite.spec.ts:44` falla en CI

Dato del leader: CI del PR #192 (run 44011770449, job `e2e (reparto)`) falla en el primer intento
`e2e/recepcion-satelite.spec.ts:44` con «strict mode violation: getByRole('button', { name: 'Recibir
paquete' }) resolved to 2 elements»; pasa al reintento y `failOnFlakyTests` deja el job rojo.

Causa, verificada en el código:
- `components/shared/RecibirPaquetesEntrada.tsx:31-43`: `usePunteroFino()` da **táctil** en el
  snapshot de servidor y en la hidratación, así que la entrada nace como `EscanerModal` con
  `label="Recibir paquetes"` (un **botón**) y solo tras el primer render del cliente con puntero fino
  pasa a **enlace**. El comentario de `:17-19` lo acepta como «un frame de parpadeo».
- En la satélite la monta `app/(app)/recepcion-satelite/_components/EscanerRecepcion.tsx:194-199`
  junto al disparador de siempre, `EscanerModal` con `ESCANER_LABEL_POR_DEFECTO = "Recibir paquete"`
  (`components/shared/EscanerModal.tsx:49`).
- Playwright compara `name` por **subcadena** sin `exact`: en esa ventana «Recibir paquete» casa con
  «Recibir paquete» y con «Recibir paquetes». Los dos elementos son el disparador de guía suelta y el
  botón de la recepción continua aún sin hidratar. Pasa igual en `/ordenes` (`OrdenesListado.tsx:1418-1430`).

¿Contradice el spec? Los nombres los fija R611 («Recibir paquetes» junto a «Recibir paquete») y son
distintos si se comparan exactos, así que no rompe R611 al pie de la letra. Pero (a) el rol del
elemento cambia de botón a enlace después de cargar, y (b) un nombre accesible que es prefijo de otro
es frágil para tests y lectores de pantalla. Y deja el CI en rojo: es bloqueante.

Corrección propuesta (para el implementer):
1. `e2e/recepcion-satelite.spec.ts:44` → `getByRole("button", { name: "Recibir paquete", exact: true })`,
   y revisar con `grep -rn 'name: "Recibir paquete"' e2e/ tests/` cualquier otro localizador del
   disparador sin `exact` (`tests/components/EscanerModal.test.tsx:61,91` usan `/Recibir paquete/`;
   hoy montan un solo modal, pero conviene `exact`).
2. Que el elemento no cambie de rol al hidratar: hasta saber el puntero (por ejemplo, un
   `useSyncExternalStore` con un tercer estado «desconocido» en servidor) no pintar la entrada, o pintar
   siempre un único tipo de elemento. Así el E2E no depende del momento de hidratación y no hay
   «frame» con dos botones.
3. Un test de componente que monte `EscanerRecepcion` con el snapshot de servidor (táctil) y
   compruebe `getAllByRole("button", { name: "Recibir paquete", exact: true })` de longitud 1.

### B2 — BLOQUEANTE: sin constancia de los E2E afectados corridos en local; T8 y T9 abiertas

`docs/perfil-agentes.md > reviewer`: «PR que toca … pantallas … sin constancia de los E2E afectados
corridos en local» es bloqueante; `CHECKPOINTS.md > Calidad de código` exige la salida local del E2E de
un flujo crítico (recepción) en `progress/impl_SLT-159.md`. La bitácora dice «**No corrido** … lo corre
CI» (`progress/impl_SLT-159.md:65-66`) y `tasks.md:53,60` deja T8 y T9 en `[ ]`. Faltan en local:
`e2e/recibir-paquetes.spec.ts`, `e2e/recepcion-satelite.spec.ts`, `e2e/cierres-admin*.spec.ts` (C5) y
los de `/ordenes` que abren «Recibir paquete», con su salida en la bitácora. B1 es justo lo que esa
corrida habría cazado. La parte de Preview de T8 (pistola y teléfono) es de Carlos y no bloquea el
review si se deja anotada como pendiente.

### m1 — menor: el cableado del diálogo continuo en `/ordenes` no tiene test

`app/(app)/ordenes/_components/OrdenesListado.tsx:1414`: invertir `puedeRecibirBodegaCentral` (adminTienda
abre la recepción central en el diálogo táctil y viceversa) deja todo en verde. El servidor lo
rechazaría (`forbidden` en cada fila), así que no es un agujero, pero R580 («llega a la acción de hoy
de esa superficie») queda sin probar en este punto. Falta un caso en `OrdenesPage.test.tsx` con puntero
táctil: adminTienda abre «Recibir paquetes» y una lectura llega a `recibirEnOrigenPorQr`; maestro, a
`recibirEnBodegaCentralPorQr`.

### m2 — menor: «Reintentar» no mira si la guía ya está en curso en otra fila

`lib/utils/sesion-escaneo.ts:99-107` y `hooks/useSesionEscaneo.ts:121-129`: guía 1024 → «No se pudo
recibir» (fila A); se relee 1024 → fila B «Recibiendo…» (correcto: el error no frena); luego
«Reintentar» en A → la acción se llama otra vez para 1024. No hay doble cambio de estado (el servidor
responde `ya_recibida`), pero son dos llamadas para la misma guía, contra el espíritu de R585. Propuesta:
en `reintentar`, si hay otra fila de la misma guía en un estado de `FRENAN_RELECTURA`, no reenviar.

### m3 — menor (pregunta de spec): una relectura durante «Recibiendo…» queda «Ya recibida» aunque la original falle

`sesion-escaneo.ts:70-77`: la segunda lectura de una guía que aún está «Recibiendo…» nace
`repetida_en_sesion` («Ya recibida», suma a «Repetidas»). Si la primera termina «No encontrada» o «No
se pudo recibir», la lista dice «Ya recibida» de un paquete que no se recibió, y esa fila suma a
«Repetidas». Es lo que dice R585 al pie de la letra, por eso no bloquea; se propone que la fila
repetida tome el desenlace de la original al resolverse (o que no sume si la original falla). Para el
spec_author/Carlos.

### m4 — menor: cerrar el diálogo con lecturas en vuelo

`hooks/useSesionEscaneo.ts:63-68`: el refresco se decide al desmontar con `huboRecepcion` de ese
momento. Si se cierra con lecturas «Recibiendo…» que luego responden `ok`, el listado de fondo no se
refresca. Además, la cola de `useEntradaEscaneo` sigue drenando tras desmontar y manda a la acción las
lecturas pendientes con la sesión ya descartada (comportamiento heredado de SLT-158, más visible ahora
con tandas). Al menos documentarlo; idealmente, refrescar también cuando una respuesta llega después
del desmontaje.

### m5 — menor (anotado, aceptable): `desde` por `window.location` y no `usePathname()`

`EscanerRecepcion.tsx:115-122` se aparta del design (`design.md:25,160`) por los dobles de
`next/navigation`; está explicado en la bitácora (`impl_SLT-159.md:101-103`). En servidor da
«por-recibir», así que el enlace cambia de `href` al hidratar en «En bodega». Sin efecto funcional
porque con puntero fino el enlace solo existe en cliente.

## Qué falta para OK

1. B1: localizadores exactos en E2E y entrada sin cambio de rol al hidratar, con su test.
2. B2: correr en local (base desechable) los E2E afectados, pegar la salida en
   `progress/impl_SLT-159.md` y marcar T9 (T8 con Preview pendiente de Carlos, anotado).
3. Recomendado: m1 (test del cableado) y m2.
