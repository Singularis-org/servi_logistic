# Reparto del mensajero y mapa de ruta: qué cambió entre prod y dev

Investigación de solo lectura, 2026-11-18. No se ejecutaron tests ni servidores y no se leyó ningún `.env*`.

- **Prod:** `origin/prod` = `0891b054`. Su merge-base con dev es `14e38c28`.
- **Dev:** `8dad4167`, el commit que probó Carlos (y el `HEAD` local). `origin/dev` ya va por
  `ede99e23`, pero lo que añade es SLT-144 (planes) y no toca estas pantallas.
- **Diffs:** `git diff origin/prod 8dad4167 -- <archivo>`. La atribución sale de `git log -S`.

Abreviatura: `C/` = `app/(app)/mis-asignaciones/_components/`.

---

## A. Tamaños de texto en Reparto (KPI y tarjeta de orden)

### A.0 Nada global cambió

- `app/globals.css`, la config de Tailwind (v4.3.2, `@import "tailwindcss"`), `app/layout.tsx`,
  `components/ui/card.tsx` y `AppPage`: **sin diff** entre prod y dev.
- `app/(app)/layout.tsx`: solo cambia la hamburguesa a 44 px (`TACTIL_MOVIL`, SLT-193 R911).
- `components/ui/select.tsx` cambió, pero Reparto no lo usa para texto.
- `components/shared/CarruselCards.tsx`: solo añade `onIndiceChange` (SLT-166). No tiene clases nuevas.
- `components/shared/texto-entero.ts`: añade `CLASE_INFO_TACTIL` (`[&_button]:after:-inset-3.5`).
  Agranda el pseudo-elemento del (i), no su caja, y el botón ya es `relative`
  (`components/shared/EstadoInfo.tsx:86`). No mueve nada.

**Conclusión:** no hay ningún token, escala ni componente compartido que achique todo. Los cambios
son locales, en `KpisMensajero` y en la fila compacta de `PosOrderCardDetalle`.

### A.1 KPI: `C/KpisMensajero.tsx`

| Línea (dev) | Antes (prod) | Después (dev) | Commit | ¿Lo pedía alguien? |
|---|---|---|---|---|
| :18 + :110 (`CIFRA_KPI`) | cifra `text-2xl` (24 px) en todos los anchos | `shrink-0 whitespace-nowrap tabular-nums text-sm md:text-2xl`: **14 px por debajo de 768 px**, 24 px desde `md` | `5715a4df` fix(SLT-163) review B3 | **Nadie.** El canvas dibuja 20 px (`progress/comparacion-canvas-pwa-2026-11-16.md:50`, fila D8: `font-size: 20px`). SLT-156 R502 solo pide 2×2. R492 pide «una línea, columna fija», no un tamaño. La review dice que `text-sm` es «decisión del leader» (`progress/review_SLT-163.md:160-165`). SLT-189 dejó D8 **fuera** de alcance (`specs/SLT-189-reparto-segun-canvas/requirements.md:59`). |
| :70 sección | `grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4` | `grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4` | `add28800` SLT-163 tanda 1 | **Sí:** R502 (2×2 en móvil). El gap de 12 px es del canvas v35. |
| :88 Card | `relative overflow-hidden …` | `relative …` (sin `overflow-hidden`) | SLT-163 | No pedido (efecto lateral). |
| :94 CardContent | `flex items-center gap-3 py-4` (icono a la izquierda, columna con rótulo + cifra) | `grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 py-4 max-md:px-4` | `add28800` | No. El canvas pone la cifra **a la derecha del icono, bajo el rótulo** (D8). |
| :99 icono | `size-14` | `size-9 … md:row-span-2 md:size-14` | `add28800` | No. |
| :101 svg | `size-7` | `size-5 md:size-7` | `add28800` | No. |
| :103 rótulo | `text-xs` en una columna flex | `self-end text-xs … max-md:self-center` | `add28800` | No (el `text-xs` es el de siempre). |
| :110 cifra | en la columna del rótulo | `col-span-2 self-start md:col-span-1 md:col-start-2`: en móvil, **fila propia a todo el ancho, bajo el icono** | `add28800` | No. Contradice el canvas (D8). |

Además, el test `tests/components/KpisMensajero.test.tsx:136-138` fija `text-sm` y `md:text-2xl`
y **prohíbe** `text-base` y `text-xl`. Cualquier subida de tamaño lo pone en rojo.

**Nuevo en dev:** los KPI también se pintan en el modo foco (`C/RepartoModule.tsx:816-820`,
SLT-189 R798). Es la misma cifra de 14 px, ahora también encima del panel de gestión.

### A.2 Tarjeta de orden

**Mosaico** (`C/pos-card/PosOrderCardMosaico.tsx`). Es la vista por defecto en prod y en dev
(`useTransicionVista("mosaico")`, `C/RepartoModule.tsx:273`).

- Los tamaños son los mismos que en prod: 5× `text-[10px]`, 6× `text-[11px]`, 2× `text-xs`, 2× `text-sm`.
- Dev añade un `text-[11px]` en `:109` (posición sin ruta, SLT-190). No sale en Reparto.
- La única clase nueva que toca medidas es `min-h-11` en «Ver detalle completo» (`:290`, SLT-193 R493).
- El resto del diff es `CLASE_INFO_TACTIL`.
- **Los 9-11 px del Mosaico ya estaban en prod.**

**Detalle** (`C/pos-card/PosOrderCardDetalle.tsx`). Prod pintaba la tarjeta completa. Dev pinta una
**fila compacta desplegable** (`compacta`, `C/RepartoModule.tsx:623`, `add28800` SLT-163, R508)
**en todos los anchos, también en escritorio**.

| Dato | Prod (tarjeta completa) | Dev (fila compacta, plegada) | Línea dev | Commit | Spec |
|---|---|---|---|---|---|
| Identificador | remisión `font-mono text-[11px]` | guía `font-mono text-xs` (12 px) | :214 | `add28800`; contenido `ec496833` (SLT-189) | R508, R790-R791 |
| Destinatario | `text-sm font-bold` | «destinatario · dirección» `text-sm font-bold` | :217 | SLT-189 | R792 |
| Rótulo del cobro | «VALOR A COBRAR» `text-[9px] uppercase tracking-wide` | «Valor a cobrar» `text-[10px]` | :236 | `add28800` | R508 (no fija tamaño) |
| Monto | `font-mono text-sm` | igual | :239 | — | — |
| Ubicación, chips (`text-[9px]`), intentos (`text-[11px]`) | visibles | pasan al **despliegue** (dirección a `text-xs`) | :269-282 | `add28800` | R508, R793 |
| Fila | `flex items-center gap-3` | `flex min-h-11 items-start gap-3 p-3`; insignia de parada `size-5 text-[10px]`, chevron `mt-1` | :210, :82, :245 | `add28800` | R508 |

«Con ayuda solicitada» también pasa a fila compacta, en Mosaico y en Detalle
(`C/RepartoModule.tsx:715-716`, `ec496833`/`d8681b1e`, SLT-189 R800). Esa fila no lleva insignia de
parada (R15 de la feature 235).

**Qué explica el «súper pequeño».**

1. **Medido y nuevo: la cifra del KPI pasa de 24 px a 14 px por debajo de 768 px** (`KpisMensajero.tsx:18`),
   con el icono de 56 a 36 px. Es el número más grande de la pantalla y se reduce un 42 %. Nadie lo
   pidió: el canvas dice 20 px.
2. **No es nuevo:** en las tarjetas, chips de 9-10 px y textos de 11 px ya estaban en prod. Dev no los achica.
3. **En escritorio a 768 px o más, el diff no achica nada en Reparto:** la cifra sigue en `md:text-2xl`.
   Si Carlos lo ve pequeño en escritorio, hay dos posibilidades: su ventana mide menos de 768 px de
   ancho (con media pantalla en un portátil se cumple), o está comparando la fila compacta de Detalle
   con la tarjeta completa de prod. **No lo puedo confirmar sin su captura y el ancho de la ventana**
   (dato abierto).

**Qué explica el «desalineado».**

- **KPI en móvil** (`KpisMensajero.tsx:94-110`, `add28800`):
  - icono y rótulo comparten la fila 1 y la cifra va sola en la fila 2, empezando bajo el icono, no
    bajo el rótulo. Es la diferencia D8 con el canvas;
  - si un rótulo («Total a cobrar») se parte en dos líneas en una tarjeta de unos 160 px, su cifra baja
    respecto a la de la tarjeta vecina. Es una hipótesis que sale del código; no la he medido.
- **Fila compacta** (`PosOrderCardDetalle.tsx:210-247`):
  - es `items-start`: la insignia de parada (20 px), la primera línea (12 px, ~16 px de alto), la
    columna «Valor a cobrar» (10 + 14 px) y el chevron (`mt-1`) se alinean por arriba con alturas
    distintas;
  - las filas de «Con ayuda solicitada» no tienen insignia, así que su texto empieza 32 px más a la
    izquierda que en «En reparto». Las dos listas no quedan en la misma columna.
  - Para confirmar cuál de estas ve Carlos hace falta su captura.

---

## B. Mapa

### B.1 Qué cambia SLT-192 y dónde está en dev

Spec: `specs/SLT-192-mapa-ruta-segun-canvas/requirements.md`. Es **solo maquetación**: no cambia
marcadores, colores ni datos («Lo que NO entra»: M1, M7, M8 y los marcadores).

| Req | Cambio | Dónde (dev) |
|---|---|---|
| R880, R881, R886 (M2) | «Ver mapa completo» + «Ocultar mapa» juntos **bajo** el mapa. Con el mapa abierto, el control desaparece del aviso y del rótulo. | `C/RutaMapaInner.tsx:393-420`; `C/RepartoModule.tsx:765-777` (`botonMapa = null` si está abierto), `:968` |
| R882, R883 | Cerrado: «Mostrar mapa» en el aviso o junto al rótulo; foco de vuelta al cerrar | `C/RepartoModule.tsx:244-256`, `:933`, `:954` |
| R884 (M4) | Rótulo «Mapa de ruta» siempre, también con avisos | `C/RepartoModule.tsx:949-955` |
| R885 (M3) | Nota «El punto de partida es aproximado…» bajo la leyenda | `C/RepartoModule.tsx:780-782`, `:969`; `C/RutaMapaInner.tsx:385-391` |
| R887-R890 (M5, M6) | Cabecera de la hoja «n · remisión · destinatario · estado», dirección «Cantón · Distrito — …», sin «Cerrar» | `C/HojaParadaMapa.tsx:103-104`, `:110`, `:136-162` |

Todo está en `8dad4167` (commit `2b98b576`, PR #199). Ningún cambio va detrás de un flag.

### B.2 Por qué Carlos puede no ver los cambios

Lo que dice el código:

1. **Sin coordenadas no hay mapa.** `hayMapa = paradasMapa.length > 0` (`C/RepartoModule.tsx:761`).
   `paradasMapa` solo toma órdenes «en reparto» del mensajero que tengan `latitud` y `longitud`, y
   además pasen el buscador y los filtros (`:342-354`). Si en Preview las órdenes de ese mensajero no
   tienen coordenadas, no se pinta ni el rótulo ni el mapa. Esto ya era así en prod
   (`RepartoModule.tsx:286` de prod).
2. **En modo foco no hay mapa** (`:808-847`). Si había una gestión activa, Carlos no lo vio.
3. **Los cambios son sutiles o condicionales:**
   - con el mapa abierto, que es como arranca (`useSeccionColapsable(true)`, `:243`), lo único
     visible es que «Ocultar mapa» bajó del rótulo al pie, junto a «Ver mapa completo»;
   - el rótulo «siempre» solo se nota **si hay avisos de ruta**: sin avisos, prod ya lo pintaba;
   - la nota solo sale con `origenFuente` = `centroide` o `ultima_conocida` (`:408-409`);
   - la hoja nueva solo aparece **al tocar un marcador**.
4. **Lo que sí se vería distinto a prod es de SLT-166, no de SLT-192:** marcadores negros con número
   blanco y la siguiente amarilla, frente a los azules `#2563eb` de prod; además, leyenda, «Paradas n de
   total» a pantalla completa y hoja inferior. Si Carlos **no ve ni eso**, lo más probable es que el
   mapa no se pinte (punto 1).
5. **PWA:** la navegación es *network-first* (`public/sw.js:334-351`), pero una pestaña ya abierta
   sigue con el JS de su build hasta que se recarga, porque el SW nuevo espera en `waiting`
   (`sw.js:211-236`). Es menos probable, porque también lo vio en el navegador.

**Datos abiertos** (sin `.env` no puedo comprobarlos):

- si el deployment de Preview que probó es el de `8dad4167`;
- si sus órdenes en reparto tienen lat/lng;
- si había avisos de ruta o un origen aproximado.

### B.3 Contraste del mapa

Valores reales de los tokens:

- `--color-brand-light` `#FFD000`, `--color-brand-dark` `#111111`, `--color-asfalto-4` `#78716c` y
  `--color-success` `#10b981` (`app/globals.css:176-194`, fijos, no giran con el tema);
- `--color-white` `#fff` (tema de Tailwind);
- `--background` `#F7F7F5` en claro y `#111111` en oscuro; `--muted-foreground` `#44403c` en claro y
  `#B2B2B1` en oscuro.

Los colores de los marcadores salen de `C/ruta-mapa-iconos.ts:17-26` (SLT-166, `b5ec4754`). La
leyenda reutiliza esos mismos colores (`C/RutaMapaInner.tsx:161-176`).

**Combinaciones que fallan** (WCAG 2.x; umbral 4.5:1 para texto pequeño y 3:1 para elementos que no
son texto):

| Elemento | Tema | Colores | Razón | Umbral | Dónde |
|---|---|---|---|---|---|
| Punto «Pendiente» de la leyenda | **oscuro** | `#111111` sobre `#111111` | **1.00:1** (invisible) | 3:1 | `RutaMapaInner.tsx:166-170` + `ruta-mapa-iconos.ts:21` |
| Punto «Siguiente» de la leyenda | claro | `#FFD000` sobre `#F7F7F5` | **1.37:1** | 3:1 | `RutaMapaInner.tsx:166-170` + `ruta-mapa-iconos.ts:19` |
| Punto «Tú» de la leyenda | claro | `#10b981` sobre `#F7F7F5` | **2.36:1** | 3:1 | idem + `ruta-mapa-iconos.ts:25` |
| Texto «Tú» del marcador de origen (11 px, 700) | ambos (sobre los tiles) | `#FFFFFF` sobre `#10b981` | **2.54:1** | 4.5:1 | `ruta-mapa-iconos.ts:25`, `:55` |
| Insignia del número en la hoja | oscuro | caja `bg-navy` `#1C1C1A` sobre la hoja `#111111`/`#1C1C1A` | 1.11:1 o 1.00:1 (el borde de la caja desaparece; el número blanco sí se lee, 17.07:1) | 3:1 (no texto) | `HojaParadaMapa.tsx:141` |
| Punto «Gestionada» de la leyenda | oscuro | `#78716c` sobre `#111111` | 3.94:1 (pasa 3:1) | — | Leyenda de un tipo que el mapa **nunca dibuja** (M1 es deuda): confunde la lectura |

**Lo que pasa:**

- Marcador «Pendiente»: texto blanco sobre `#111111`, 18.88:1; sobre los tiles de OSM (`#f2efe9`), 16.45:1.
- Marcador «Siguiente»: número `#111111` sobre `#FFD000`, 12.84:1. El relleno amarillo contra los
  tiles da 1.07-1.36:1, pero lo rescata el anillo `#111111` de 5 px (`ruta-mapa-iconos.ts:64`).
- Línea de la ruta `#2563eb`: 4.5:1 sobre los tiles; ya estaba en prod (`RutaMapaInner.tsx:332`).
  El tramo siguiente `#111111` da 16.45:1.
- Texto de la leyenda: 9.58:1 en claro y 8.9:1 en oscuro.
- «Paradas n de total» (`RutaMapaInner.tsx:309`, `text-sm font-semibold` sobre `bg-background`): 17.6:1 en los dos temas.
- Tooltips: los fija `leaflet.css` (`#222` sobre `#fff`).

**Lectura en oscuro:** los tiles de OSM siempre son claros, así que el mapa queda como un bloque
claro dentro de la página oscura. La leyenda, en cambio, va sobre el fondo oscuro, y ahí es donde se
pierde el punto negro. Los marcadores no giran con el tema (es intencional, `ruta-mapa-iconos.ts:4-12`).

---

## C. Arreglo mínimo propuesto

Criterio: volver a lo de prod salvo lo que el spec pedía de verdad (R502 2×2, R492 cifra en una
línea, R508/R790-R793 fila compacta, R798 KPI en foco).

1. **KPI** (`C/KpisMensajero.tsx:18`, `:94-110`).
   - **Cambio:** volver a la estructura de prod (icono a la izquierda y columna con rótulo y cifra)
     dentro de la rejilla 2×2. La cifra en `text-xl` (20 px, el canvas D8) en el móvil y `md:text-2xl`
     desde 768 px, conservando `COLUMNA_FIJA`. Se quitan `col-span-2`, `md:col-start-2` y
     `max-md:self-center`. Se puede dejar el icono pequeño en el móvil (`size-9`) para que quepa el
     importe.
   - **Riesgo medido por SLT-163:** con un importe de ocho cifras a 360 px, 20 px puede no caber.
     Hay que medirlo con el E2E de 360/414 px (`e2e/pwa-mensajero-reparto.spec.ts`).
   - **Decisión para Carlos:** si no cabe, se elige entre 20 px y un importe más corto. Lo que no
     vale es volver a partir la cifra (R492).
   - **Test:** `tests/components/KpisMensajero.test.tsx:136-138` (fija `text-sm` y prohíbe `text-xl`).
2. **Fila compacta:** no hay tamaño que revertir, porque los textos no se achicaron respecto a prod.
   Antes de tocar nada, pedir captura a Carlos. Si confirma el desalineado:
   - `C/pos-card/PosOrderCardDetalle.tsx:210-247`: alinear la insignia, la primera línea y el chevron
     con la primera línea de texto;
   - opcional: reservar el hueco de la insignia en las filas de ayuda (`:257`, sin número, R15).
   - Subir los chips de 9 px sería una decisión nueva, no una vuelta a prod.
3. **Contraste del mapa:**
   - `C/RutaMapaInner.tsx:166-170`: dar a los puntos de la leyenda un borde que contraste en los dos
     temas, por ejemplo el mismo borde blanco de 2 px del marcador más un anillo `ring-foreground/40`;
   - `C/ruta-mapa-iconos.ts:25`: texto del origen `var(--color-brand-dark)` en vez de blanco
     (`#111111` sobre `#10b981` ≈ 7.4:1);
   - opcional: quitar «Gestionada» de `LEYENDA_MAPA` (`C/RutaMapaInner.tsx:51-56`) mientras M1 siga
     siendo deuda;
   - `C/HojaParadaMapa.tsx:141`: opcional, `dark:` con un borde.
   - **Test:** `tests/unit/utils/ruta-mapa-iconos.test.ts:55` afirma `color:var(--color-white)` y
     hay que ajustarlo; además, `tests/components/RutaMapaInner.test.tsx` si comprueba la leyenda.
4. **Mapa «sin cambios»:** no es código. Hay que comprobar en Preview el SHA desplegado y que las
   órdenes del mensajero de prueba tengan lat/lng. Después, enseñar a Carlos lo que cambió de verdad:
   el pie «Ver mapa completo · Ocultar mapa», la nota (solo con origen aproximado) y la hoja (tocando
   un marcador).

**Archivos:**

- `app/(app)/mis-asignaciones/_components/KpisMensajero.tsx`
- `tests/components/KpisMensajero.test.tsx`
- `app/(app)/mis-asignaciones/_components/RutaMapaInner.tsx`
- `app/(app)/mis-asignaciones/_components/ruta-mapa-iconos.ts`
- `tests/unit/utils/ruta-mapa-iconos.test.ts`
- condicionales:
  - `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx`
  - `app/(app)/mis-asignaciones/_components/HojaParadaMapa.tsx`
  - `tests/components/RutaMapaInner.test.tsx`
- añadidos tras ver las capturas (sección D):
  - `app/(app)/mis-asignaciones/_components/RepartoModule.tsx` (`:886-888`)
  - `components/shared/BuscadorFiltros.tsx` (`:649`), si se prefiere arreglarlo en el componente
  - `e2e/pwa-mensajero-reparto.spec.ts`: hoy comprueba que la barra no desborda (R797), pero no el
    ancho útil del campo

---

## D. Las capturas de Carlos (teléfono, modo oscuro, `mensajero-reposo`)

Imágenes leídas: `images/1.png` (cabecera, KPI y barra) e `images/2.png` (mapa, leyenda y tarjeta del
carrusel).

### D.1 Buscador y «Filtros» se fusionan: el campo se queda en la lupa

- **Dónde:** `components/shared/BuscadorFiltros.tsx:606` (fila `flex w-full flex-wrap items-center gap-2`)
  y `:649` (campo `relative flex min-w-0 flex-1 … sm:min-w-[250px]`). El conmutador entra como
  `trasFiltros` en `:798`, desde `C/RepartoModule.tsx:886-888`.
- **Mecanismo:**
  - `flex-1` da al campo un `flex-basis` de 0 y `min-w-0` le deja encogerse hasta 0. Para decidir si
    salta de línea, el navegador usa ese tamaño base, así que el campo cabe siempre en la primera línea
    y nunca la fuerza a partirse.
  - «Filtros» (`shrink-0`) y el conmutador Mosaico/Detalle (`shrink-0`, botones de 44 px con texto)
    se comen los ~360 px. El campo se queda con ~0 px de texto útil: solo se ve la lupa (absoluta) y
    el borde de «Filtros» pegado a ella.
  - El comentario de `:642-645` («ahí la fila envuelve y el campo ocupa la línea entera») **no se
    cumple** con `flex-1` + `min-w-0`.
- **Antes (prod):** Reparto no usaba `BuscadorFiltros`. Tenía su propio campo en una columna
  `flex flex-col gap-2 sm:flex-row` (diff de `RepartoModule.tsx`, líneas `-664/-667`), con el
  conmutador aparte en la cabecera de la sección.
- **Cómo se llegó aquí:**
  - `add28800` (SLT-163, R495/R496) pasó Reparto a `BuscadorFiltros`. Con «Filtros» solo, el campo
    tenía sitio.
  - `37355796` + `d8681b1e` (SLT-189, **R795**/DS3) metieron el conmutador en la misma fila. Ahí se
    rompe.
- **Qué pedía el spec:**
  - R795: el conmutador dentro de la barra, tras «Filtros»;
  - R797: sin desborde horizontal a 360/414 px y botones de 44 px. **Se cumple, y aun así el campo no
    sirve**, porque ningún requisito ni test exige un ancho mínimo del campo
    (`e2e/pwa-mensajero-reparto.spec.ts:141`, `:172` miden desborde y 44 px).
  - El canvas pone campo → Filtros → conmutador (`RepartoDetalle.txt` l.15-19 citado en el spec). No
    tengo acceso a los archivos del canvas para ver si allí van en una línea o en dos.
- **Arreglo mínimo, en Reparto:** envolver el conmutador para que en el móvil ocupe su propia línea:
  `trasFiltros={<div className="max-md:basis-full">…</div>}` en `C/RepartoModule.tsx:886-888`.
  - El campo y «Filtros» quedan en la línea 1; el conmutador, en la línea 2.
  - Sigue dentro de la barra fija (R795/R796) y sin desborde (R797).
  - Alternativa en el componente: `min-w-0` → un mínimo real en el móvil (`:649`). Afecta a todos los
    consumidores.
  - En los dos casos hay que añadir al E2E una aserción de ancho mínimo del campo.

### D.2 KPI: etiqueta y número pequeños, tarjeta casi vacía

Las capturas confirman A.1:

- rótulo `text-xs` (12 px, igual que en prod, `KpisMensajero.tsx:103`);
- cifra `text-sm` (14 px; en prod, 24 px) por `CIFRA_KPI` en `:18` (commit `5715a4df`);
- icono `size-9`, frente a los 56 px de prod (`:99`, commit `add28800`).

La tarjeta se ve vacía por tres motivos: el `py-4` de `CardContent` se suma al `py-(--card-spacing)`
de la propia `Card` (16 + 16 px arriba y abajo), el contenido mide unos 60 px y la cifra va sola en su
fila (`col-span-2`, `:110`).

- **Canvas (D8):** cifra de 20 px a la derecha del icono, bajo el rótulo.
- **Arreglo:** el de C.1.

### D.3 Tarjeta de la orden (Mosaico, `C/pos-card/PosOrderCardMosaico.tsx`)

**Ninguno de estos elementos cambió entre prod y dev.** El diff de este archivo solo añade la insignia
de posición (`:106-111`, que no sale en Reparto), `CLASE_INFO_TACTIL` y `min-h-11` en
«Ver detalle completo». Lo que se ve es el diseño de prod pintado con **datos de demo incompletos**.

| Lo que se ve | Archivo:línea | Por qué |
|---|---|---|
| «·» suelto delante de `DEMO-A-036` | `:101-103`, `pos-estado.ts:101-103` (`textoParada`: «·» si `secuenciaRuta === null`) | La orden no tiene posición en la ruta. La misma pantalla lo dice: «El orden mostrado no está actualizado» y el badge «Pendiente de optimizar». Es dato, no maqueta. |
| Guía en mono pequeña | `:114` `font-mono text-xs` | Igual que en prod. |
| «Sin posición · —» | `:119` (`text-[11px]`), `:128`, `:137` (`formatPeso` → «—» si `peso === null`, `pos-format.ts:34-36`) | Sin secuencia y sin peso en la orden de demo. |
| «Caja E2E» en mono | `:168` `font-mono text-[11px]` | Igual que en prod. El contenido es dato de fixture E2E. |
| «Intentos: 0» pequeño | `:175` `text-[11px]` | Igual que en prod (feature 160 R19: siempre visible, también el 0). |
| «COBRAR» con «–» | `:269-273` (`formatMonto` → `SIN_MONTO_RAYA` si `montoCobrar === null`) | La orden de demo no tiene monto. |
| «VER DETALLE COMPLETO» en mayúsculas pequeñas | `:289-290` `text-[10px] font-bold uppercase` | Igual que en prod. SLT-193 solo le añadió `min-h-11`. |

- **Canvas o spec:** el informe del canvas no marca estos tamaños como diferencia, salvo D9 (que pide
  44 px en «Ver detalle completo», ya hecho). Ningún R de SLT-189/192/193 pide cambiar el Mosaico.
- **Arreglo:** no hay nada que revertir. Dos opciones:
  - si Carlos quiere textos más grandes en la tarjeta, es una **decisión nueva**: subir el suelo de
    9-11 px a 12 px en `:101`, `:119`, `:146-156`, `:168`, `:175`, `:269` y `:289`;
  - para la revisión en Preview, sembrar en el usuario demo órdenes con secuencia, peso y monto, porque
    con nulos la tarjeta se ve rota aunque el código sea el de prod.

### D.4 Mapa: «el diseño no cambió»; «Pendiente» no se ve; «Gestionada» en gris

- **Los cambios de SLT-192 sí salen en la captura:**
  - el rótulo «Mapa de ruta» se ve **con** el aviso presente (R884, `C/RepartoModule.tsx:949-955`;
    en prod no salía con avisos);
  - «Ver mapa completo» y «Ocultar mapa» van juntos bajo el mapa (R880, `C/RutaMapaInner.tsx:393-420`).
  - No se ven la nota (requiere origen aproximado) ni la hoja (requiere tocar el marcador).
  - SLT-192 no tocaba el aspecto del mapa ni de los marcadores (su spec, «Lo que NO entra»).
- **El marcador amarillo grande con un punto negro:**
  - es el estilo «siguiente» de SLT-166 (`b5ec4754`, `C/ruta-mapa-iconos.ts:19`, `:60-68`): 34 px,
    `#FFD000`, anillo `#111111`;
  - el «punto negro» es el «·» de `secuenciaRuta === null` (`:62`), no un número;
  - prod pintaba círculos azules `#2563eb` de 28 px.
  - Si a Carlos le parece «el de siempre», es porque ya lo vio en Preview desde SLT-166 (15-nov), no
    porque esté en prod.
- **«Pendiente» invisible en la leyenda:** `C/RutaMapaInner.tsx:166-170` pinta el punto con
  `COLOR_MARCADOR.pendiente.fondo` = `#111111` (`ruta-mapa-iconos.ts:21`) sobre el fondo oscuro
  `#111111`. Da **1.00:1** (umbral para elementos que no son texto: 3:1). Confirmado en la captura.
- **«Gestionada» en gris:** `#78716c` (`ruta-mapa-iconos.ts:23`) da 3.94:1 en oscuro, así que pasa.
  Pero la leyenda anuncia un tipo que el mapa **nunca dibuja** (M1 es deuda; `RutaMapaInner.tsx:358-364`
  solo usa «siguiente» y «pendiente»).
- **Arreglo mínimo** (el de C.3):
  - borde o anillo en los puntos de la leyenda (`RutaMapaInner.tsx:166-170`), por ejemplo
    `ring-2 ring-white` (el mismo borde blanco que el marcador) o `ring-foreground/40`;
  - quitar «Gestionada» de `LEYENDA_MAPA` (`:51-56`) mientras M1 no exista;
  - texto «Tú» oscuro en `ruta-mapa-iconos.ts:25`.
