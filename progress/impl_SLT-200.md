# impl SLT-200 «PWA Reparto: buscador, KPI, tarjeta y leyenda del mapa tras Preview»

Ruta directa, frontend_dev, 2026-11-18. Rama `feature/SLT-200-pwa-reparto-ajustes-preview` (sale de dev `8dad4167`).
Alcance: puntos 1-4 del leader, más el 1 ampliado (Recoger y Recolección), el 6 (Recolección sin cámara) y el 7
(tooltip de la cámara). El 5 (siembra demo QA) va en su sección, al final (T2).

## Archivos

UI:
- `app/(app)/mis-asignaciones/_components/VistaCardsToggle.tsx`: prop `className` y `CONMUTADOR_EN_SU_LINEA_MOVIL`.
- `app/(app)/mis-asignaciones/_components/RepartoModule.tsx`, `RecogerModule.tsx`,
  `app/(app)/recoleccion/_components/RecoleccionModule.tsx`: pasan esa clase al conmutador de la barra. Recolección,
  además, sin `escaneo`.
- `app/(app)/mis-asignaciones/_components/KpisMensajero.tsx`: la cifra y su disposición.
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx`: los tamaños de texto.
- `app/(app)/mis-asignaciones/_components/RutaMapaInner.tsx` y `ruta-mapa-iconos.ts`: la leyenda y el «Tú».
- `components/shared/EscanerModal.tsx`: prop `ayuda` (tooltip del botón de solo icono).
- `components/shared/BuscadorFiltros.tsx`: `AYUDA_CAMARA_BUSCADOR` y la pasa a la cámara. No cambia la fila ni el campo.

Tests:
- `tests/components/KpisMensajero.test.tsx`: ajustado (antes fijaba `text-sm` y prohibía `text-xl`), más 3 casos nuevos.
- `tests/components/RepartoMovil.test.tsx`, `RecogerModule.test.tsx`, `RecoleccionModule.test.tsx`: el caso del conmutador.
  En Recolección se reescribe el bloque SLT-194 R940-R944 (cámara) como «sin cámara».
- `tests/components/PosOrderCardMosaicoLegible.test.tsx` (nuevo).
- `tests/components/RutaMapaInner.test.tsx` y `tests/unit/utils/ruta-mapa-iconos.test.ts`.
- `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts`: Recolección pasa a «sin `escaneo`», citando la decisión.
- `tests/unit/components/buscador-filtros-camara-tooltip.test.tsx` (nuevo).
- E2E:
  - `e2e/_pwa-mensajero-fixture.ts`: `campoConAnchoUtil`;
  - `e2e/pwa-mensajero-reparto.spec.ts`: (a) mide la cifra y el campo; caso (d) nuevo, ₡12.345.678 a 360 px;
  - `e2e/pwa-mensajero-recoger-recoleccion.spec.ts`: Recolección sin cámara y con campo útil; Recoger con campo útil;
  - `e2e/pwa-mensajero-mapa.spec.ts`: la leyenda sin «Gestionada».

## Antes → después

1. **Buscador.** Antes, a 360 px, «Filtros» y el conmutador se comían la fila y el campo se quedaba en la lupa: su
   `flex-1 min-w-0` nunca fuerza el salto. Después, por debajo de `md`, el conmutador va en su propia línea
   (`max-md:basis-full`) con los dos botones a medias (`max-md:[&>button]:flex-1`). Lo hacen Reparto, Recoger y
   Recolección. `BuscadorFiltros` no cambia. El E2E exige un campo de ≥ 160 px y el conmutador debajo, a 360 y 414 px.
2. **KPI.** Antes, la cifra iba a 14 px en una fila propia. Después va a 20 px (`text-xl`), con `md:text-2xl` en
   escritorio.
   - Va a la derecha del icono, bajo el rótulo (canvas D8), cuando cabe: ≤ 7 caracteres, lo que da conteos e
     importes hasta ₡99.999. Las dos tarjetas de una fila deciden juntas.
   - Medido con Archivo 600 a 20 px: «₡12.345.678» ocupa 119 px y junto al icono quedan ~82 px. No cabe al lado, así
     que baja bajo el icono a todo el ancho (~126 px), **sigue a 20 px** y cabe.
   - Solo por encima de 11 caracteres se achica: 12 → 18 px, 13-14 → 16 px y ≥ 15 → 14 px.
   - El E2E (d) lo mide a 360 px: `{texto: "₡12.345.678", px: 20, disposicion: "apilada"}` y nada se sale.
3. **Tarjeta Mosaico.** Antes:
   - guía en `font-mono text-xs`;
   - insignia, «Sin posición · peso», producto (mono), «Intentos», mensajero, aviso y dirección a 11 px;
   - chips, «COBRAR» y «VER DETALLE COMPLETO» a 10 px.

   Después, **solo por debajo de md** (`max-md:`; vuelta 2, review B1), la guía va a `max-md:text-sm max-md:font-sans`
   y todo lo demás a `max-md:text-xs`, con el producto en sans y su icono en `max-md:size-3.5`. Destinatario y monto
   siguen en `text-sm`. **Desde md, las clases de dev** (`8dad4167`) siguen intactas: escritorio = prod, también en
   Novedades. La estructura es la misma.
4. **Leyenda del mapa.**
   - Antes:
     - «Pendiente» medía 1.00:1 en oscuro;
     - «Siguiente» medía 1.37:1 en claro;
     - «Tú» medía 2.36:1 en claro;
     - «Gestionada» salía sin que el mapa la dibujara;
     - el texto «Tú» del marcador era blanco sobre verde (2.54:1).
   - Después, cada punto lleva `ring-2 ring-foreground` (el test mide ≥ 3:1 contra el fondo en los dos temas),
     «Gestionada» sale de la leyenda y el «Tú» va en Negro Servi (≥ 4.5:1, medido en el test). El hueco entre punto y
     texto queda en `gap-1` como en dev; en el móvil, `max-md:gap-2` (review m1).
6. **Recolección sin cámara.** Se quita `escaneo`. **Ojo:** Enter = «buscar ya» y la normalización de la URL del QR o
   de `#n` dependen de `escaneo` (`BuscadorFiltros`, `onKeyDown`). Sin él, lo tecleado o lo que la pistola escribe
   filtra igual, al momento (`debounceMs={0}`). Pero una URL de QR leída por pistola ya no se reduce al número, y
   Enter no hace nada.
7. **Tooltip de la cámara.** El texto es «Buscar escaneando la guía». Usa el `Tooltip` de la app con el patrón de
   `ContactoButtons` (el disparador es el botón) y el `aria-label` «Escanear con cámara» no cambia.
   - Afecta a todas las pantallas con `escaneo`.
   - Vuelta 2 (review m2): Base UI no enlaza el tooltip con `aria-describedby`. El botón lleva ahora
     `aria-describedby` hacia un `sr-only` con el mismo texto (`useId`, sin dependencias), así que el lector de
     pantalla oye «Escanear con cámara, Buscar escaneando la guía».
   - **Límite:** el Tooltip de Base UI se abre con hover o foco, no al tocar. En el teléfono la ayuda visible sigue
     siendo la línea bajo el campo, que ya nombra la cámara.

## R → test

| Punto | Test |
|---|---|
| 1 | `RepartoMovil.test.tsx` «SLT-200: en el móvil el conmutador…»; idem en `RecogerModule.test.tsx` y `RecoleccionModule.test.tsx`; E2E `campoConAnchoUtil` en reparto (a) a 360/414, en Recolección a 360 y en Recoger a 360 |
| 2 | `KpisMensajero.test.tsx` (3 casos «SLT-200» + R492 ajustado); E2E reparto (a) y (d) |
| 3 | `PosOrderCardMosaicoLegible.test.tsx`: 4 casos del móvil (tamaño efectivo = `max-md:` o base) y 3 de «desde md, como antes» (guía mono 12 px, 10-11 px, sin `md:` de tamaño, icono `size-3`); E2E `pwa-mensajero-botones-44` |
| 4 | `RutaMapaInner.test.tsx` (leyenda sin «Gestionada» + anillo y contraste); `ruta-mapa-iconos.test.ts` («Tú» ≥ 4.5:1); E2E mapa (a) |
| 5 | `tests/integration/db/demo-qa.test.ts` «SLT-200 (punto 5): las órdenes en reparto del mensajero-reposo llegan a su tarjeta con parada, peso y monto» |
| 6 | `buscadores-con-escaneo.guardia.test.ts` («SLT-200: `/recoleccion` … sin `escaneo`»); `RecoleccionModule.test.tsx` bloque «SLT-200 — Recolección: el buscador sin cámara»; E2E «SLT-200 Recolección a 360 px» |
| 7 | `buscador-filtros-camara-tooltip.test.tsx` (3 casos, uno con la descripción accesible) |

## Salida

Rojo (código de dev, tests nuevos):
- puntos 1-4: `vitest run` de los 5 archivos → `Test Files 5 failed (5) · Tests 12 failed | 43 passed (55)`.
  - Uno de los 12 falló por la consulta del test, no por el código: «Found multiple elements»; se corrigió.
- punto 1 en Recoger y Recolección (sin el arreglo en los módulos): `Tests 2 failed | 159 skipped`.
- punto 6 (con `escaneo` repuesto): `Tests 5 failed | 83 passed (88)`. Fallan la guardia (2) y el bloque de
  Recolección (3).
- punto 7 (sin `ayuda`): `Tests 1 failed | 2 passed (3)`. Falla «al enfocar la cámara sale…».

Verde:
- los 5 archivos: `Tests 55 passed (55)`;
- `vitest related` de los fuentes del mapa, KPI y tarjeta: `Test Files 40 passed (40) · Tests 753 passed (753)`;
- Recolección, Recoger, la guardia y el buscador: `Tests 200 passed (200)`;
- tooltip, escaneo y EscanerModal: `Tests 43 passed (43)`;
- `pnpm run typecheck` → exit 0; `eslint` de los 23 archivos tocados → exit 0;
- E2E tras `next build` (base desechable, puerto 3047), `pwa-mensajero-reparto`, `-mapa` y `-recoger-recoleccion`:
  `16 passed (1.0m)`.
  - La primera pasada dio 3 rojos: el test medía la cifra mientras el contador aún contaba. Se arregló con
    `expect.poll` hasta el valor final.

Gate rápido (`bash ./init.sh` vía `con-desechable`, base `servi_slt200_desechable`):
- 1.ª pasada: `INIT_EXIT=1`. La guardia `pwa-mensajero-sin-recorte` (escala de 4 px, R494) rechazó `gap-1.5` en la leyenda y `mt-0.5` en el icono del producto. Pasan a `gap-2` y sin margen.
- 2.ª pasada: `INIT_EXIT=0`, con lotes de 1453, 1683, 1699 y 1017 tests en verde (1 skipped). Ese cambio de clases llegó después del E2E; no mueve medidas que el E2E compruebe.

## Punto 5 — demo QA: órdenes en reparto completas (backend_dev, 2026-11-18)

Causa (`progress/investigacion-SLT-200.md`, punto 3): las 2 órdenes en reparto del `mensajero-reposo` nacían por la
carga masiva (sin peso, feature 15/R4), sin monto y sin ruta calculada → «·», «Sin posición · —» y «–» en COBRAR.

Archivos:
- `scripts/demo-qa/receta.ts`:
  - `enReparto`: la 1.ª con `MONTO_A_COBRAR` (8000), las demás sin cobro. El mensajero no entrega: no mueve saldos.
  - `ponerPeso`: `CorregirDatosClienteService.corregir` como admin (montado como en
    `lib/actions/corregir-datos-cliente.ts`, mismo `schema.parse`), con `PESOS_EN_REPARTO` = 1.5 y 0.8 kg.
    Corregir el peso no deja rastro (312/D4).
  - `sincronizarRuta`: la secuencia NO se escribe a mano. `buildOptimizacionRutaService().ejecutar(m, { motivo: "manual" })`,
    la misma fábrica que «Sincronizar ruta» (`lib/actions/ruta-mensajero.ts`). La demo no tiene integración de rutas:
    el servicio cae solo a Haversine, sin red.
  - Orden en `enReposo`: peso → reparto → sincronizar → asignar las «por recoger». Si se asignaran antes, la guarda
    SLT-79 (80 % recogido para la 1.ª ruta del día) omitiría el cálculo. Ni asignar ni recoger encolan
    `optimizacion_ruta` (solo gestión y traspaso), así que el «0 jobs de ruta» de R22 sigue en pie.
  - Coordenadas: ya venían (`ubicar`, R20 de SL-43). No se tocan.
- `tests/integration/db/demo-qa.test.ts`: caso nuevo «SLT-200 (punto 5)…», y el comentario de R22 al día.

E2E: ningún test de `tests/` ni `e2e/` usa las guías `DEMO-A-0xx` ni el `mensajero-reposo` de la demo (grep). Los
recuentos por estado (`ORDENES_POR_ESTADO`) no cambian.

Test (punto 5 → test): `demo-qa.test.ts` «SLT-200 (punto 5): las órdenes en reparto del mensajero-reposo llegan a su
tarjeta con parada, peso y monto». Lee por `MisAsignacionesService.listarMisAsignaciones` con el actor del mensajero,
que es lo que pinta la tarjeta. En A y en B fija: 2 tarjetas (control positivo); `secuenciaRuta` [1, 2]; 0 paradas
sin optimizar; ruta `vigente`; peso {0.8, 1.5}; montos {0, 8000}; KPI `porCobrar` 8000; coordenadas.

Salida (`vitest run tests/integration/db/demo-qa.test.ts -t "(primera ejecución|SLT-200)"`, base desechable):
- Rojo, receta de dev: `Tests 1 failed | 1 passed | 12 skipped` — `posición en la ruta: expected [ null, null ] to deeply equal [ 1, 2 ]`.
- Verde: `Tests 2 passed | 12 skipped`, `EXIT=0`.
- Mutación 1 (sin `ponerPeso`): `1 failed` — `peso: expected [ null, null ] to deeply equal [ 0.8, 1.5 ]`.
- Mutación 2 (`enReparto: plan("central", n)`): `1 failed` — `montos: expected [ +0, +0 ] to deeply equal [ +0, 8000 ]`.
- Receta restaurada (diff contra la copia del cambio: idéntica).

La siembra completa corrió en la desechable dentro de ese test: «la primera ejecución» es `ejecutarDemo` con
`cargarPasosReales`, A y B completas, `codigo 0`. Va contra el Storage falso del test. `pnpm demo:qa` a pelo habría
subido evidencias al Supabase del `.env`, que no es desechable.

`npx tsc --noEmit` → sin salida (exit 0).

Gate rápido (`bash ./init.sh` vía `con-desechable`, `servi_slt200_desechable`): `INIT_EXIT=0`. typecheck y lint pasan.
Lotes de 1453, 1683, 1699 y 1017 tests en verde (1 skipped). `demo-qa.test.ts` no entró en el `related` del gate;
lo cubre la corrida dirigida de arriba.

Veredicto (punto 5): hecho. La tarjeta del mensajero-reposo trae parada, peso y cobro, por los servicios de la app.

## Vuelta 2 (review `progress/review_SLT-200.md`: B1, B2, m1-m4)

- B1: ver el punto 3. Rojo contra la versión anterior de la tarjeta (`d8bf6e62`):
  `vitest run PosOrderCardMosaicoLegible` → `Tests 5 failed | 2 passed (7)`. Fallan los 3 casos de escritorio y los 2
  que piden `max-md:`. Verde con el arreglo, junto con el tooltip, `RutaMapaInner` y `KpisMensajero`:
  `Tests 36 passed (36)`.
- B2: tras `next build` (base desechable, puerto 3047), `npx playwright test --project=reparto` →
  `48 passed (2.0m)`, `E2E_EXIT=0`. Por spec:
  - `pwa-mensajero-botones-44` 5;
  - `pwa-mensajero-reparto` 5, `-recoger-recoleccion` 8, `-mapa` 3, `-ranking` 6;
  - `mis-asignaciones` 4, `retiro-satelite-central` 3, `reprogramacion-liberacion` 3;
  - `devolucion-origen`, `historial-orden`, `recibir-paquetes` y `reintentos-escalado` 2 cada uno;
  - `asignacion-satelite`, `recepcion-satelite` y `etiquetas-lote-tienda` 1 cada uno.
- m1: la leyenda va en `gap-1 max-md:gap-2`.
- m2: la descripción accesible del tooltip, ver el punto 7.
- m3: los comentarios ya no llevan el símbolo de moneda.
- m4: la fila del punto 5 está en la tabla.
- `git merge origin/dev`: «Already up to date». SLT-144 (#209, `ede99e23`) ya estaba en la rama.
- Gate rápido (`con-desechable`, base `servi_slt200_desechable`):
  - 1.ª pasada: `INIT_EXIT=1`. La guardia `ancla-de-carga` rechazó un `waitFor` del test del tooltip anclado solo a
    un conteo. Ahora espera el texto visible (`findByText` con `:not(.sr-only)`).
  - 2.ª pasada: `INIT_EXIT=0`.

## CI rojo del #226 (run 44405827100, sobre `b9bd54de`): la guía oculta en «Recoger en bodega»

- **Síntoma:** cinco tests de `e2e (reparto)` fallan con la guía de la tarjeta `hidden`: `asignacion-satelite:45` y
  `mis-asignaciones:119/140/157/175`.
- **Causa medida:** la cabecera de la tarjeta Mosaico era `flex` sin `wrap`. La columna de los chips es `shrink-0` y
  la de la guía, `min-w-0`. Con los chips a 12 px (versión `d8bf6e62`, en todos los anchos), en la tarjeta estrecha de
  Recoger (1280 px, escritorio) los chips se comían la fila y la guía quedaba en 0 px de ancho. No había ningún nodo
  duplicado.
- **Comprobación (con `next build` en cada paso):**
  - con la tarjeta de `d8bf6e62` tal cual, `mis-asignaciones` + `asignacion-satelite` dan **rojo**: `Received: hidden`
    ×3 en el resumen y `E2E=1`;
  - con la misma tarjeta más solo `flex-wrap` en la cabecera, `5 passed`. La causa es esa.
- **Arreglo:** la cabecera lleva `flex flex-wrap` (`PosOrderCardMosaico.tsx`). Si los chips no caben, bajan de línea y
  la guía conserva su ancho. Con eso queda protegido también el móvil, donde los chips siguen a 12 px (`max-md:`).
  Desde md, la tarjeta ya volvía a los tamaños de dev (B1).
- **Test:** `PosOrderCardMosaicoLegible.test.tsx` «la cabecera de la tarjeta envuelve…», que exige además un solo nodo
  con la guía. Resultado: `8 passed`.
- **E2E en HEAD**, tras `next build`, `npx playwright test --project=reparto`: `48 passed (2.0m)`, `E2E=0`. Incluye
  `mis-asignaciones` 4/4, `asignacion-satelite` 1/1, `pwa-mensajero-botones-44` 5/5, `-reparto` 5,
  `-recoger-recoleccion` 8, `-mapa` 3 y `-ranking` 6, más los demás specs del proyecto.

Gate rápido tras el arreglo: `INIT_EXIT=0`.

## No verificado

- El aspecto real en modo oscuro (captura). Las medidas salen del E2E (tamaños, disposición, desborde) y el contraste
  de los tests sobre los tokens.
- El tooltip en el teléfono: Base UI no lo abre al tocar.
