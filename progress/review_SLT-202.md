# Review SLT-202 «Escritorio igual a prod: tamaños de controles y un solo botón de recibir»

PR #229. Ruta directa, con review completa a petición del leader. Alcance: solo lo propio,
`git diff 1190373c..HEAD` (HEAD c23e7a54), sin lo que viene de SLT-200 (d016b9c9).
Reviewer, 2026-11-18.

## Checklist

- [x] **Tasks / alcance:** los 5 puntos de `progress/features/SLT-202.md > Decisiones` están implementados.
- [x] **Regla de clases desde `md`:** se comparó control por control contra `git show origin/prod:<archivo>`.
  El script es `scratchpad/clases-vs-prod.cjs` (tokens de clase sin `max-md:` + `size=`/`variant=`), y se
  revisaron a mano los controles que no tienen par.
- [x] **44 px en el móvil:** todos los tests que se tocaron siguen pidiendo `max-md:h-11` / `max-md:size-11` /
  `max-md:min-h-11` y además niegan el `h-11` sin prefijo. El móvil no se debilitó.
- [x] **E2E `escritorio-igual-a-prod`:** mide `height` y `top` de verdad y no puede quedar verde por vacío.
- [ ] **Un solo «Recibir paquete» sin perder funcionalidad:** se pierde el aviso «queda por devolver a la tienda»
  (B1).
- [ ] **Tests borrados:** cubrían los motivos de los tres receptores, que siguen vivos en la continua y ahora
  no los prueba nadie (B2).
- [ ] **Tamaño del PR:** 62/40 archivos sin la línea `tamano-pr-aceptado` (B3).
- [x] typecheck: `tsc --noEmit` exit 0. Con el heap por defecto se queda sin memoria (exit 134); con
  `--max-old-space-size=8192` sale verde.
- [x] eslint de los archivos tocados: exit 0.
- [x] vitest de los 21 tests tocados + `EscaneoContinuo` + `sesion-escaneo` (con `con-desechable.cjs`): 26 archivos,
  497/497, VEXIT=0.
- [x] E2E: constan en la bitácora (proyecto `reparto` 50 ok + 1 caída del worker, verde al repetir). No los
  volví a correr.
- [x] Reglas del perfil: no hay país/moneda, Ordenex, `db/` ni dependencias nuevas. Los comentarios dicen el porqué.
- [x] Guardias tocadas (`lectura-guia-unica`, `escaner-un-solo-cierre`): el ajuste es legítimo. Las tres
  recepciones entran en `DELEGAN_EN_LA_SESION`, que exige montar la tarjeta continua, y el mínimo de montajes
  baja de 7 a 5 porque Órdenes y la satélite ya no montan `EscanerModal`.

## 1. Regla «desde md, las clases de prod»

| Control | prod | HEAD desde `md` | ¿Igual? |
|---|---|---|---|
| `BuscadorFiltros` campo y «Filtros» (`escaneo`) | `h-8` | `h-8` (+`max-md:h-11`) | sí |
| «Limpiar todo» | `size="sm"` (h-7) | `sm` (+`max-md:h-11`) | sí |
| Cámara del buscador | no existe en prod (SLT-160) | `icon` 32 px (+`max-md:size-11`) | sin par: 32, alineada |
| «Gestionar» / `MarcarLuegoToggle` / `RecuperarAyudaButton` | `sm` + `w-fit`/`shrink-0` | idéntico + `BOTON_TACTIL_MOVIL` | sí |
| «Conversación» (Reparto) | `secondary` `sm` | idéntico | sí |
| «Mostrar mapa» | `ghost` `xs` | idéntico | sí |
| Contenedor de Reparto | `flex flex-col gap-8` | `gap-8` | sí |
| Confirmación de gestión (botones y `gap-2`) | default, `gap-2`, `max-w-sm` | idéntico (+`max-md:gap-3`) | sí |
| Pestañas de Recoger | `TabsTrigger` sin clase | `max-md:min-h-11` | sí |
| «Ver detalle completo» (Mosaico) | `flex w-full … text-[10px] …` | idéntico (+`max-md:min-h-11`, `max-md:text-xs`) | sí |
| Campo de `VerificarGuiaGate` | `Input` default | `max-md:h-11` | sí |
| Disparador «Recibir paquete» (Órdenes y satélite) | `Button outline` + `ScanLine`, fila `flex w-full flex-wrap items-center gap-2`, carga masiva en `ms-auto flex gap-2` | `buttonVariants outline` + `ScanLine` (enlace con puntero fino), misma fila | sí |
| Sin par en prod: «Volver a la lista», «Ver más», «Navegar», asa de la hoja, «Cerrar»/«Centrar»/«Ver mapa completo»/«Ocultar mapa», «Confirmar guía», filas de `PosOrderCardDetalle` | — | default (32) / `h-8` / `icon` | por defecto de la casa, como se decidió |

**Lo que sigue distinto de prod en escritorio, en las pantallas de la auditoría.** Ninguna de estas diferencias es de tamaño de control:
- Texto de ayuda bajo el buscador con cámara: Carlos decidió que se queda.
- Barra del `EscanerModal` con título y «Cerrar» (`icon-sm`, icono `size-5`), donde prod usa la X de
  `DialogContent`. Lo pidió SLT-193 y el tamaño ya es el de prod.
- Con puntero fino, «Recibir paquete» lleva a la página `/ordenes/recibir` o `/recepcion-satelite/recibir`;
  en prod abría un diálogo. Es la decisión de Carlos (un solo botón que abre la continua).
- `VerificarGuiaGate`: el campo y el botón van apilados con separador y el botón es «Confirmar guía», donde prod
  tenía «Gestionar» en línea. Es diseño de otra ficha y queda fuera del alcance.
- El E2E no mide el botón de columnas (icono naranja junto a «Descargar», en la captura de dev). Ver m4.

## 2. ¿El continuo cubre a la suelta?

- **Acción:** es la misma en los tres casos (`recibirEnBodegaCentralPorQr`, `recibirEnOrigenPorQr`, `recibirPorQr`).
- **Permisos:** `/ordenes` decide por rol, y los dos casos se excluyen: `puedeRecibirBodegaCentral = esAccesoTotal(rol)`,
  `puedeEscanearQr = rol === adminTienda`. La suelta montaba un receptor u otro y la página `/ordenes/recibir`
  aplica el mismo reparto (`esAccesoTotal` → central, `adminTienda` → origen, el resto → `notFound`).
  `/recepcion-satelite/recibir` exige `adminSatelite`, igual que `por-recibir` y `en-bodega`. No se pierde ningún
  permiso.
- **Motivos de error:** los textos son los mismos, salen de `desenlace*` (la suelta también los usaba en el
  `default`). «Código inválido» lo corta la sesión (`leerGuia`).
- **Diferencias conocidas:** la continua no saca toast (R590) y el listado se relee una vez al cerrar (R592).
- **Se pierde el destino del `ok` en bodega central:** ver B1.

## Hallazgos

### B1 — BLOQUEANTE: se pierde «queda por devolver a la tienda» en la recepción en bodega central
En prod (y en dev, hasta este PR) la suelta distinguía el destino del `ok`:
`result.estado === "por_devolver_a_tienda" ? "Guía N recibida; queda por devolver a la tienda." : "Guía N recibida en bodega central."`
(prod `EscanerRecepcionBodegaCentral.tsx:62-65`; feature 139, R17, que tenía su test).

La continua lo descarta:
- `desenlaceBodegaCentral` convierte `ok` en `{ tipo: "recibida", resumen }` y no guarda `result.estado`.
- La fila de `EscaneoContinuo.tsx:126-170` solo pinta «Recibida», destinatario y tienda.

El operador de la central ya no ve que la devolución tiene que ir aparte, hacia la tienda. Al quitar la
suelta, este era el único sitio donde se veía, así que es funcionalidad de prod que desaparece.

Hay dos salidas:
- **(a)** Llevar el destino al desenlace y a la fila (por ejemplo, «Recibida · por devolver a la tienda»), con su test.
- **(b)** Que Carlos acepte por escrito perder el aviso, anotado en `progress/features/SLT-202.md > Decisiones`.

### B2 — BLOQUEANTE (mayor): los tests borrados cubrían los motivos de los tres receptores, y ya no los cubre nadie
Los ~1000 líneas borradas incluían, por receptor, un test por cada `status` de la acción. Esos textos
siguen en producción a través de `desenlace*`, que usan la continua y la página. Hoy:
- `grep` de `desenlaceBodegaCentral|desenlaceOrigen|desenlaceSatelite` en `tests/` y `e2e/`: 0 resultados.
- `"No tienes permiso para recibir"`: 0 tests.
- **`desenlaceBodegaCentral`:** se quedan sin test `estado_invalido` (con `estatusLabel`), `forbidden`,
  `unauthenticated`, `conflict`, `validation_error` y el `por_devolver_a_tienda` de B1. Ninguna de sus
  ramas de error está probada.
- **`desenlaceSatelite`:** se quedan sin test `zona_ajena`, `sin_zona`, `estado_invalido`, `validation_error`,
  `forbidden`, `unauthenticated` y `conflict`. `grep zona_ajena|sin_zona` en los tests de recepción: 0.
- **`desenlaceOrigen`:** conserva `tienda_ajena` y `estado_invalido` (`EscanerRecepcionOrigen.test.tsx:94,109`).
  Pierde `forbidden`, `unauthenticated`, `conflict` y `validation_error`.
- **`EscaneoContinuo.test.tsx`:** prueba la fila con un motivo inyectado a mano, no el mapeo de cada receptor.

Si se cambia o se cruza un motivo, la suite sigue en verde.

**Qué falta:** un test por receptor que recorra cada `status` de su `Result` y fije el `DesenlaceRecepcion`
exacto. Son funciones puras y exportadas, así que basta un `it.each` en unit. Tiene que incluir el destino de
B1 si se elige la salida (a).

Lo demás borrado sí lo cubre la continua:
- QR / CODE128 / tecleado → `sesion-escaneo.test.ts` y `EscaneoContinuo.test.tsx`.
- Cámara que se apaga al cerrar → `EscanerModal.test.tsx`.
- Título único → los R927 que quedan.
- R594 «la suelta cierra la cámara» → ya no aplica (la enmienda está citada).
- R576, la línea de error persistente → la fila «No se pudo recibir» con el motivo.

### B3 — BLOQUEANTE: tamaño del PR sin aceptar
`node scripts/tamano-pr.mjs`: 62/40 archivos, 877/1000 líneas de producción y 2124/3000 de tests.
`progress/features/SLT-202.md` no tiene la línea `<!-- tamano-pr-aceptado: … -->`. Solo lo propio ya son 46
archivos. Hace falta el OK escrito de Carlos con el desglose de la bitácora: unas 1000 líneas son borrado de
tests y 25 archivos vienen de SLT-200.

### Menores
- **m1:** la ruta es directa pero hay cambio de comportamiento: en escritorio, «Recibir paquete» navega a una
  página en vez de abrir un diálogo, y se quita la guía suelta. No toca dinero, permisos ni auth, así que no
  obliga a subir de ruta. Conviene que el PR lo diga claro.
- **m2:** `RecibirPaquetesEntrada` devuelve `null` hasta hidratar, así que el HTML del servidor de `/ordenes` y de
  la satélite ya no trae el disparador que prod sí pintaba. Hay salto de maquetación en la fila. El test de
  `EscanerRecepcion` (HTML del servidor) lo fija como intencionado; conviene anotarlo.
- **m3:** `"suelta"` sigue en `ModoRecepcion` (`lib/utils/sesion-escaneo.ts`) sin uso, y los comentarios de
  `EscanerModal.tsx:49,97` y de `OrdenesListado` mencionan «guía suelta» y un «Cerrar de 44 × 44». Hay que
  limpiarlos o abrir deuda.
- **m4:** el E2E solo mide `/ordenes` como maestro. No incluye el botón de columnas junto a «Descargar» ni las
  otras 9 pantallas de la barra; como el componente es compartido, el riesgo es bajo. Lo bueno: cada control
  pasa por `toBeVisible()` y `boundingBox() != null` y se compara su `top` con el del campo (±1 px) y su
  `height` con 32, así que no queda verde por vacío.
- **m5:** `BOTON_TACTIL_MOVIL` sobre `sm`/`xs` deja en el móvil `has-data-[icon=inline-*]:pr-1.5/pl-1.5` y el
  `rounded-[…]` de esos tamaños, que `touch` no tenía. Solo cambia algo con `data-icon`; es una diferencia
  mínima frente al móvil de antes.
- **m6:** la bitácora dice «`gap-6` → `gap-8`» y la ficha «`gap-8`→`gap-6`». El código deja `gap-8`, que es lo
  que tiene prod, así que el código está bien; hay que corregir el texto de la ficha.
- **m7:** `pnpm run typecheck` se queda sin memoria con el heap por defecto en este worktree. No es de este diff,
  pero el gate local puede caer por eso.

## 6. ¿Hay cambios fuera de la auditoría?
Fuera de la lista de la auditoría solo hay soporte:
- `texto-entero.ts` (las constantes nuevas);
- `playwright.config.ts` (registra el spec);
- las dos guardias (ajuste legítimo, ver arriba);
- los E2E de recepción, adaptados al enlace.

No hay cambios de comportamiento fuera de los 5 puntos, salvo lo que arrastra el punto 5 (B1, m2).

## Veredicto: RECHAZADO
Falta, para OK:
1. **B1:** el destino `por_devolver_a_tienda` visible en la continua, o la aceptación escrita de Carlos.
2. **B2:** tests unitarios de `desenlaceBodegaCentral`, `desenlaceSatelite` y `desenlaceOrigen` para cada `status`.
3. **B3:** la línea `tamano-pr-aceptado` con el OK de Carlos.

El resto (la regla de tamaños desde `md`, los 44 px del móvil y el E2E de alineación) está bien.

## Vuelta 2 (acotada a 5f4d6eec..18e8a596)

### Checklist
- [x] **B1 resuelto.** `desenlaceBodegaCentral` devuelve `aviso: "Queda por devolver a la tienda."` cuando
  `ok.estado === "por_devolver_a_tienda"`, y `EscaneoContinuo` lo pinta bajo «Recibida». Es la misma frase de
  destino que el toast de prod (`EscanerRecepcionBodegaCentral.tsx:62-65` en origin/prod: «Guía N recibida; queda
  por devolver a la tienda.»); la fila ya dice «Recibida» y la guía, así que no se repiten. `aviso` es opcional
  y solo lo pone la central: origen y satélite no lo producen y la fila sin `aviso` se pinta igual que antes.
  Lo fijan el unit (`desenlace-recepcion.test.ts`, caso B1 frente al «ok en bodega central, sin aviso») y el de
  componente (`EscanerRecepcionBodegaCentral.test.tsx`, «B1: …», positivo y negativo en la misma sesión).
  Mutación propia: anular el render del aviso en `EscaneoContinuo.tsx` pone en rojo el test B1 (1 failed).
- [x] **B2 resuelto.** `tests/unit/components/desenlace-recepcion.test.ts` recorre cada `status` de cada `Result`
  (contrastado con `lib/types/`): central 8 status (+ la variante B1), satélite 10, origen 9. Los textos están
  escritos a mano y coinciden letra por letra con `git show origin/prod:` de los tres receptores (incluido
  «Vuelve a intentar.» de la central frente a «Vuelve a escanear.» de las otras dos). No se compara la
  función consigo misma. Mutación propia: cruzar `forbidden`↔`unauthenticated` en la central y
  `zona_ajena`↔`sin_zona` en la satélite → 4 failed (los 4 casos cruzados). Restaurado con `git checkout --`.
- [x] **B3 resuelto.** `progress/features/SLT-202.md > Cierre` tiene
  `<!-- tamano-pr-aceptado: 2026-11-18 · <motivo> · Carlos: «acepto» -->`, con el formato de
  `docs/gate.md` (fecha · motivo y frase del humano). `node scripts/tamano-pr.mjs` lo da como AVISO aceptado
  (49/40 archivos, 691/1000 producción, 1575/3000 tests).
- [x] **m3 resuelto.** `ModoRecepcion = "continua" | "pagina"` (sin `"suelta"`); los `Exclude<…, "suelta">`
  pasan a `ModoRecepcion`; `grep '"suelta"'` en app/components/lib/tests/e2e: solo un test ajeno (un valor de
  filtro). Los comentarios de `EscanerModal` y `OrdenesListado` ya dicen 44 × 44 «en el móvil» y que la guía
  suelta se quitó.
- [x] **m6 resuelto.** La ficha dice ahora «el `gap-6` de Reparto (dev) vuelve al `gap-8` de prod», igual que
  la bitácora y el código.
- [x] **Verificación:** `tsc --noEmit` (heap 8 GB, ver m7) 0 errores; eslint de los 8 archivos tocados limpio;
  `desenlace-recepcion`, `EscanerRecepcionBodegaCentral`, `EscaneoContinuo` y `sesion-escaneo` en verde
  (52 tests) contra la base desechable.

### Hallazgos
Ningún bloqueante y ninguna regresión en el rango. Siguen abiertos, sin cambios, los menores m1, m2, m4, m5
y m7 de la vuelta 1 (no se pedía arreglarlos).

## Veredicto vuelta 2: OK
