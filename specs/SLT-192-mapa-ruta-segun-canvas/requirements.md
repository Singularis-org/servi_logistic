# SLT-192 «Mapa de ruta según el canvas» — requirements (ruta ligera)

Zona frontend · complexity low · ruta **ligera** (`docs/specs.md > Tres rutas`): este archivo es el
spec entero (sin `design.md` ni `tasks.md`). Rango de requisitos reservado: **R880-R909**.

Fuente de verdad: `progress/comparacion-canvas-pwa-2026-11-16.md > SLT-166` (filas M2-M6) y
`specs/SLT-156-pwa-mensajero-tablas/` (`requirements.md` R539-R544, `design.md §11`). Canvas:
artboards **RepartoMapa** (mapa abierto en la página) y **RepartoMapaCompleto** (pantalla completa
con la hoja de la parada 3).

## Alcance

Diseño puntual sobre la pantalla de hoy de Reparto (`/mis-asignaciones`), solo estos puntos:

1. **M2.** Con el mapa abierto, «Ver mapa completo» y «Ocultar mapa» van juntos **bajo el mapa**; la
   fila del aviso de ruta se queda solo con «Ver más».
2. **M3.** La nota «El punto de partida es aproximado (no se usó tu ubicación GPS reciente).» va
   **bajo la leyenda**, no encima del mapa.
3. **M4.** El rótulo «Mapa de ruta» se ve **siempre** sobre el mapa, también cuando hay avisos.
4. **M5 + M6.** Cabecera de la hoja de la parada como el canvas: en una fila «número · remisión ·
   destinatario · estado», y la dirección como «Cantón · Distrito — dirección». La hoja **no** lleva
   botón «Cerrar».

### Lo que NO entra
- **M1**: paradas gestionadas en gris con check. Sigue como deuda: necesitan datos del servidor
  (`progress/features/SLT-166.md > Deudas`).
- **M7** (leyenda a pantalla completa) y **M8** (color de la línea de ruta): no están en la ficha.
- Los marcadores, el centrado con el carrusel, la pantalla completa («Cerrar», «Paradas {n} de
  {total}», «Centrar en mi ubicación»), «Navegar», «Gestionar», «COBRAR» y el asa de la hoja: se
  quedan como hoy (R539-R543 de SLT-156).
- Nada de servidor, esquema, migraciones, dinero ni permisos.

## Lo que ya existe

Buscado `Ocultar mapa`, `Ver mapa completo`, `HojaParadaMapa`, `mapa de ruta` en `feature_list.json`,
`specs/` y el código:
- **SLT-166 «PWA del mensajero: mapa de ruta»** (done) construyó el mapa, la hoja y la pantalla
  completa (spec en `specs/SLT-156-pwa-mensajero-tablas/`, R539-R544). Esta ficha **corrige** su
  pantalla; no la re-crea.
- Código que se reutiliza: `RutaMapaInner.tsx` (leyenda `LeyendaMapa` y botón «Ver mapa completo»,
  l.371-386), `RepartoModule.tsx` (`botonMapa`, l.751-762; rótulo y nota, l.924-959),
  `HojaParadaMapa.tsx` (cabecera, l.107 y l.138-161), y la línea de ubicación «cantón · distrito —
  dirección» que ya arma `pos-card/PosOrderCardDetalle.tsx:69-75`.
- No apareció otra ficha ni spec que cubra lo mismo.

## Decisiones cerradas (no reabrir)

| # | Decisión | Fuente | Requisitos |
|---|---|---|---|
| DC1 | «Ocultar mapa» baja al pie del mapa junto a «Ver mapa completo». Revierte la desviación de R541 que aceptó el leader el 2026-11-15 (`progress/features/SLT-166.md:32`): R541 ya pedía lo mismo que el canvas, así que no contradice el spec de SLT-156; lo decide la ficha. | ficha SLT-192; informe M2; SLT-156 R541 | R880, R881, R882 |
| DC2 | Con el mapa cerrado, «Mostrar mapa» sigue donde está hoy (fila del primer aviso o junto al rótulo; R509/R544 de SLT-156). Solo cambia el sitio del control con el mapa abierto. | SLT-156 R509, R544; canvas solo dibuja el mapa abierto | R883 |
| DC3 | Nota del punto de partida bajo la leyenda, encima de los botones del pie. | canvas RepartoMapa (leyenda → nota → «Ver mapa completo», «Ocultar mapa»); `design.md §11` | R885 |
| DC4 | Rótulo «Mapa de ruta» siempre que haya mapa. | ficha; informe M4 | R884 |
| DC5 | Cabecera de la hoja: número, remisión (mono), destinatario y chip de estado en una fila; dirección «Cantón · Distrito — dirección». Sin «Parada {n} de {total}» visible; el nombre accesible de la hoja es «Parada {n}», como el `aria-label` del canvas. | canvas RepartoMapaCompleto; informe M5 | R887, R888, R890 |
| DC6 | La hoja no tiene botón «Cerrar»: se cierra con el asa, con Escape o tocando fuera (lo que ya da la `Sheet`). | ficha; informe M6 | R889 |
| DC7 | Paradas gestionadas en gris: fuera de alcance (deuda). | ficha | — |

## Requisitos (EARS)

### Pie del mapa (M2)

- **R880** — MIENTRAS el mapa de ruta esté abierto en la página (no a pantalla completa), el sistema
  DEBE mostrar bajo el mapa y su leyenda los botones «Ver mapa completo» y «Ocultar mapa», cada uno
  con área táctil de al menos 44 px de alto.
- **R881** — MIENTRAS el mapa de ruta esté abierto, el sistema DEBE mostrar un único botón
  «Ocultar mapa» en la página (el del pie): la fila del primer aviso de ruta queda solo con su
  título y «Ver más», y la fila del rótulo «Mapa de ruta» no lleva control.
- **R882** — CUANDO el mensajero pulsa «Ocultar mapa» en el pie, el sistema DEBE plegar el mapa y
  mostrar «Mostrar mapa» en su sitio de hoy (R883), con `aria-expanded="false"`.
- **R883** — MIENTRAS el mapa de ruta esté cerrado, el sistema DEBE mostrar «Mostrar mapa» (44 px)
  en la fila del primer aviso de ruta si hay avisos, y si no, junto al rótulo «Mapa de ruta»; CUANDO
  el mensajero lo pulsa, DEBE abrir el mapa.
- **R886** — MIENTRAS el mapa esté a pantalla completa, el sistema NO DEBE mostrar «Ocultar mapa» ni
  la nota del punto de partida (el canvas RepartoMapaCompleto no los dibuja); al cerrar la pantalla
  completa, ambos DEBEN volver al pie del mapa.

### Rótulo (M4)

- **R884** — MIENTRAS la ruta tenga al menos una parada con coordenadas, el sistema DEBE mostrar el
  rótulo visible «Mapa de ruta» encima del mapa, haya o no avisos de ruta, con el mapa abierto o
  cerrado.

### Nota del punto de partida (M3)

- **R885** — MIENTRAS el mapa esté abierto y el punto de partida sea aproximado, el sistema DEBE
  mostrar «El punto de partida es aproximado (no se usó tu ubicación GPS reciente).» después de la
  leyenda y antes de «Ver mapa completo» / «Ocultar mapa», y NO DEBE mostrarla encima del mapa.

### Hoja de la parada (M5, M6)

- **R887** — CUANDO se abre la hoja de una parada, el sistema DEBE mostrar en su cabecera, en una
  misma fila que puede partirse en líneas sin recortar ningún dato, y en este orden: el número de
  parada («·» si no tiene posición), la remisión en tipografía mono, el destinatario y el chip de
  estado; y NO DEBE mostrar el texto «Parada {n} de {total}».
- **R888** — CUANDO se abre la hoja de una parada, el sistema DEBE mostrar su dirección como
  «{cantón} · {distrito} — {dirección}», omitiendo la parte que falte (sin separador sobrante); SI
  no hay ninguna de las tres, ENTONCES DEBE mostrar «Sin dirección».
- **R889** — La hoja de la parada NO DEBE tener un botón «Cerrar»; CUANDO el mensajero pulsa Escape,
  toca fuera de la hoja o arrastra el asa hacia abajo con la hoja plegada, el sistema DEBE cerrarla
  y volver al mapa.
- **R890** — CUANDO se abre la hoja de una parada, el sistema DEBE darle el nombre accesible
  «Parada {n}» (o «Parada sin posición» si la parada no tiene posición en la ruta).

## Tasks

Orden: T1 → T2 → T3; T4 [P] con T1-T3 (otro archivo). T5 al final.

- [x] **T1 — Pie del mapa y nota (R880, R881, R885, R886).** `RutaMapaInner` (y su paso por
  `RutaMapa`) recibe dos props opcionales: la acción de ocultar y la nota del punto de partida.
  Bajo `LeyendaMapa` pinta la nota y, en una fila, «Ver mapa completo» + «Ocultar mapa»
  (`size="touch"`); a pantalla completa no pinta ninguno de los dos. Sin la prop de ocultar, el pie
  queda como hoy (compatibilidad).
  *Hecho:* `tests/components/RutaMapaInner.test.tsx` comprueba el orden leyenda → nota → botones,
  que los dos botones tienen `size="touch"` (clase de 44 px) y que a pantalla completa no están ni
  la nota ni «Ocultar mapa» y vuelven al salir.
- [x] **T2 — Rótulo y control en `RepartoModule` (R881-R884).** El rótulo «Mapa de ruta» se pinta
  siempre que `hayMapa`. Con el mapa abierto, `botonMapa` no se pinta ni en el aviso ni junto al
  rótulo, y `RutaMapa` recibe `mapa.cerrar` y la nota (que sale de encima del mapa). Con el mapa
  cerrado, «Mostrar mapa» en su sitio de hoy.
  *Hecho:* `tests/components/RepartoMapa.test.tsx` (con `RutaMapa` mockeado): abierto → ningún
  botón «Ocultar mapa» en el módulo y `RutaMapa` recibe la acción y la nota; llamar la acción
  pliega el mapa y aparece «Mostrar mapa» con `aria-expanded="false"`; rótulo visible con y sin
  avisos, abierto y cerrado; con avisos y mapa abierto, la fila del aviso no tiene control.
  Ajustar el `describe` de R544 del mismo archivo y lo que choque en
  `tests/components/RepartoMovil.test.tsx` y `tests/components/RepartoModule.test.tsx`.
- [ ] **T3 — E2E del mapa (R880, R882, R883, R884, R885 de extremo a extremo).** En
  `e2e/pwa-mensajero-mapa.spec.ts (a)`: con el mapa abierto, «Ocultar mapa» está dentro del grupo
  «Mapa de ruta», debajo del mapa, y mide ≥ 44 px; al pulsarlo aparece «Mostrar mapa» en su sitio y
  lo vuelve a abrir; el rótulo «Mapa de ruta» es visible.
  *Hecho:* el spec pasa en local a 360 px y en el ancho de escritorio que ya usa.
- [x] **T4 [P] — Cabecera de la hoja (R887-R890).** En `HojaParadaMapa.tsx`: fila
  `flex-wrap` con número, remisión mono (`TEXTO_ENTERO`), destinatario y `EstadoConInfo`; dirección
  con el mismo armado que `PosOrderCardDetalle.tsx:69-75` (extraerlo a `pos-card/pos-format.ts`
  como función pura y usarla en los dos sitios); quitar el botón «Cerrar» y la constante
  `CERRAR_HOJA`; `SheetTitle` = «Parada {n}» / «Parada sin posición» (visualmente oculto si el
  número ya se ve en la fila).
  *Hecho:* `tests/components/HojaParadaMapa.test.tsx`: orden de la fila, «Parada 3 de» ausente,
  nombre accesible del diálogo, dirección con y sin cantón/distrito y «Sin dirección», ningún botón
  «Cerrar», Escape cierra (`onOpenChange(false)`); `tests/unit/utils/pos-format.test.ts` (nuevo)
  para la función de ubicación; los tests de
  `PosOrderCardDetalle` siguen verdes. En `e2e/pwa-mensajero-mapa.spec.ts (b)`: la hoja se abre con
  nombre «Parada {n}» y se cierra con Escape.
- [ ] **T5 — Gate.** `./init.sh` en verde y los E2E de `e2e/pwa-mensajero-mapa.spec.ts` en local
  (base desechable, `docs/perfil-agentes.md > Todos los agentes`).

### Trazabilidad prevista

| Req. | Test |
|---|---|
| R880 | `tests/components/RutaMapaInner.test.tsx`; `e2e/pwa-mensajero-mapa.spec.ts (a)` |
| R881 | `tests/components/RepartoMapa.test.tsx` |
| R882 | `tests/components/RepartoMapa.test.tsx`; `e2e/pwa-mensajero-mapa.spec.ts (a)` |
| R883 | `tests/components/RepartoMapa.test.tsx`; `e2e/pwa-mensajero-mapa.spec.ts (a)` |
| R884 | `tests/components/RepartoMapa.test.tsx`; `e2e/pwa-mensajero-mapa.spec.ts (a)` |
| R885 | `tests/components/RutaMapaInner.test.tsx`; `tests/components/RepartoMapa.test.tsx` |
| R886 | `tests/components/RutaMapaInner.test.tsx` |
| R887 | `tests/components/HojaParadaMapa.test.tsx` |
| R888 | `tests/components/HojaParadaMapa.test.tsx`; `tests/unit/utils/pos-format.test.ts` |
| R889 | `tests/components/HojaParadaMapa.test.tsx`; `e2e/pwa-mensajero-mapa.spec.ts (b)` |
| R890 | `tests/components/HojaParadaMapa.test.tsx`; `e2e/pwa-mensajero-mapa.spec.ts (b)` |

## Archivos esperados

Producción:
- `app/(app)/mis-asignaciones/_components/RutaMapaInner.tsx`
- `app/(app)/mis-asignaciones/_components/RutaMapa.tsx`
- `app/(app)/mis-asignaciones/_components/RepartoModule.tsx`
- `app/(app)/mis-asignaciones/_components/HojaParadaMapa.tsx`
- `app/(app)/mis-asignaciones/_components/pos-card/pos-format.ts`
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx`

Tests:
- `tests/components/RutaMapaInner.test.tsx`
- `tests/components/RepartoMapa.test.tsx`
- `tests/components/RepartoMovil.test.tsx`
- `tests/components/RepartoModule.test.tsx`
- `tests/components/HojaParadaMapa.test.tsx`
- `tests/unit/utils/pos-format.test.ts`
- `e2e/pwa-mensajero-mapa.spec.ts`

Choque con SLT-190 «Recoger y Recolección según el canvas»: ninguno de estos archivos es de Recoger,
Recolección ni del diálogo del escáner. El único compartido posible es
`pos-card/PosOrderCardDetalle.tsx` / `pos-format.ts` si SLT-190 toca la fila Detalle; el leader lo
cruza con `scripts/archivos-en-vuelo.mjs` cuando SLT-190 tenga su lista.

## Tamaño

13 archivos (6 de producción, 7 de tests), bajo el 80% del tope de 40. Estimado: ~90 líneas de
producción y ~220 de tests.

## Preguntas abiertas

1. Con el mapa **cerrado** y avisos de ruta, el rótulo «Mapa de ruta» queda solo en su fila y
   «Mostrar mapa» sigue en la fila del aviso (DC2, R883-R884). El canvas solo dibuja el mapa
   abierto: ¿se acepta así o, cerrado, «Mostrar mapa» baja junto al rótulo? Se implementa DC2 y se
   revisa con Carlos en Preview.
