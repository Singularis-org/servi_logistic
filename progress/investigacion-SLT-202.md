# Tamaños y escáneres repetidos: origin/prod frente a origin/dev (2026-11-18)

Solo lectura. Las rutas `archivo:línea` son de origin/dev salvo que se diga otra cosa. Capturas: prod = 3.png, dev = 4.png (Órdenes, escritorio, Maestro).

Fichas citadas:
- SLT-160 «Buscar escaneando en los listados»
- SLT-159 «Escaneo continuo en recepciones y recogidas»
- SLT-168 (recogidas del mensajero en continuo; rebanada (c) de SLT-159)
- SLT-193 «Botones de 44 px pendientes en la PWA del mensajero»
- SLT-194 «Buscar escaneando en recolección, devoluciones y rechazos»
- SLT-189 «Reparto según el canvas»
- SLT-190 «Recoger y Recolección según el canvas»
- SLT-156 «PWA de los mensajeros: tablas usables en el móvil»
- SLT-163 «Reparto en el móvil, tanda 2»
- SLT-197 «Retirar a bodega central»

---

## 1. Tamaños: qué hizo crecer la barra en escritorio

### La causa es una sola: `ALTO_CONTROL_ESCANEO = "h-11"` sin prefijo de ancho

`components/shared/BuscadorFiltros.tsx`:
- `:49` `ALTO_CONTROL = "h-8"`: el alto de prod.
- `:55` `ALTO_CONTROL_TACTIL = "h-8 max-md:h-11"`: el de `tactil` (SLT-156), que sí se acota al móvil.
- **`:58` `ALTO_CONTROL_ESCANEO = "h-11"`**: 44 px **en todos los anchos**.
- `:336` `const alto = escaneo ? ALTO_CONTROL_ESCANEO : tactil ? … : ALTO_CONTROL;`
- Lo aplica a:
  - `:650` el contenedor del campo;
  - `:735` el disparador «Filtros»;
  - `:811` «Limpiar todo» (`escaneo && ALTO_CONTROL_ESCANEO`);
  - `:715` la cámara, `className="size-11 shrink-0"`: 44 × 44 en todos los anchos.
- **Commit:** `8c3760ff` feat(SLT-160): T4b cámara aparte de 44 px, ayuda del escaneo y campo de 44 px (DC2). El recorte de alcance llegó después, en `e568b3a8` (R771 acotado).

### Lo que NO creció, y por eso se ve desalineado

- **«Vistas»** (`VistasFiltro`) y **los conmutadores de orden** (`SegmentedToggle`, que van como `children`): no leen `alto` y siguen en `h-8`. En móvil tampoco crecen, porque `AltoControlesBarraContext` solo lo leen `FilterComponent`, `MultiSelectFilter` y `DateRangeFilter`. En la captura se ven «más altos» porque la fila mide ahora 44 px y quedan centrados en ella.
- **«Descargar»** (`components/shared/DescargarDatasetButton.tsx:340`): `className="max-md:h-11"`, de SLT-194 (`9eb3e945`, R947, DC3). En escritorio sigue en `h-8` y queda desalineado con «Filtros» (44 px).
- **Los filtros puestos** (Estado, Zona, Fecha…), de SLT-194 R946 y DC4: 44 px solo con `max-md:` (`components/shared/alto-controles-barra.ts:10`, `ALTO_FILTRO_MOVIL_ESCANEO = "max-md:h-11"`). En escritorio siguen en 32 px, otra vez desalineados con el campo.

### ¿Lo pedía el spec? Sí, pero solo el de SLT-160, y es incoherente con SLT-194

- **SLT-160** (`specs/SLT-160-buscar-escaneando-listados/requirements.md`):
  - DC2 (Carlos, 2026-11-16, `:67`): «el campo mide 44 px de alto», «la cámara es un botón aparte de 44 px».
  - **R771** (`:108-109`): «el campo, el botón de cámara, "Filtros" y "Limpiar todo" DEBEN medir 44 px de alto». No dice «solo en móvil».
  - El mismo spec, en `:56-58`, deja **a sabiendas** los filtros y «Descargar» a 32 px «aunque el canvas los dibuje a 44 px». O sea, la desalineación ya estaba aceptada en el spec.
  - El canvas (BKro9B2dap6jrmGejRq6M3) era la referencia, y nadie acotó su 44 px al móvil.
- **SLT-194** (`specs/SLT-194-buscar-escaneando-recoleccion-devoluciones/requirements.md`):
  - DC4 (Carlos, 2026-11-17, `:79`): los filtros a 44 px **solo en móvil** (`max-md:`); «en escritorio se quedan en `h-8` como hoy».
  - DC3 (`:78`): «Descargar», igual, solo en móvil.
  - Se acotó al móvil lo nuevo, pero no se corrigió lo que SLT-160 había dejado en todos los anchos.
- **SLT-193** (`specs/SLT-193-botones-44-pwa-mensajero/requirements.md`): lo hizo bien.
  - Encabezado y menú (R911, R913-R915): `TACTIL_MOVIL = "max-md:min-h-11 max-md:min-w-11"` (`components/shared/texto-entero.ts:19`) e `ITEM_MENU_TACTIL_MOVIL = "max-md:h-11"` (`app/(app)/_components/Sidebar.tsx`).
  - Única excepción en escritorio: el «Cerrar» de 44 × 44 de la barra de **todo** diálogo de escáner (R925: «en todos los anchos»), `components/shared/EscanerModal.tsx:139` `size="icon-touch"`. Es un diálogo, no la barra del listado.
- **SLT-189 y SLT-190:** no tocan la barra de los listados de escritorio. `Select.partirLinea` (`components/ui/select.tsx`) es opcional y solo lo usa la PWA.
- **SLT-159:** la página nueva «Recibir paquetes» (`components/shared/RecepcionContinuaPagina.tsx:90,146`) usa `size="touch"` (44 px) en escritorio. La pidió R610 (canvas Main). No tiene equivalente en prod.

**Conclusión:** el 44 px de escritorio no «se coló» por un descuido de implementación: lo pidieron SLT-160 R771 y DC2, que no distinguieron ancho. Respecto de la decisión de hoy («escritorio = prod»), es un 44 px de móvil que aparece en escritorio, y además choca con DC4 de SLT-194.

### Pantallas afectadas en escritorio

Todas las que montan `BuscadorFiltros` con `escaneo`:

| # | Pantalla | Montaje | Ficha |
|---|---|---|---|
| B1 | `/ordenes` | `app/(app)/ordenes/_components/OrdenesListado.tsx:1488` | SLT-160 |
| B2 | `/recepcion-satelite/en-bodega` | `app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx:715` | SLT-160 |
| B3 | `/novedades`, pestaña Devoluciones | `app/(app)/novedades/_components/NovedadesFiltrosBarra.tsx:70` | SLT-160 |
| B4 | `/historico/conversaciones` | `app/(app)/historico/conversaciones/_components/HistoricoFiltrosBar.tsx:138` | SLT-160 |
| B5 | `/historico/acciones` | `app/(app)/historico/acciones/_components/HistorialAccionesFiltrosBar.tsx:133` | SLT-160 |
| B6 | `/wallet` (libro de caja) | `app/(app)/wallet/_components/LibroCajaBarra.tsx:144` | SLT-160 |
| B7 | Estado de cuenta: `/wallet/tiendas`, `/wallet/mensajeros`, `/wallet/satelites` | `components/shared/estado-cuenta/EstadoCuenta.tsx:762` | SLT-160 |
| B8 | `/mi-wallet` | el mismo `EstadoCuenta` | SLT-160 |
| — | `/novedades`, pestaña Rechazos (buscador nuevo) | `app/(app)/novedades/_components/RechazosSlaModule.tsx:149` | SLT-194 |
| — | `/recoleccion`, PWA del mensajero | `app/(app)/recoleccion/_components/RecoleccionModule.tsx:298` (`tactil` + `escaneo`; manda `escaneo`) | SLT-194 |

En todas ellas, en escritorio:
- el campo, «Filtros», «Limpiar todo» y la cámara miden 44 px;
- los `children`, «Vistas» y «Descargar» siguen en 32 px;
- aparece el texto de ayuda (§3).

---

## 2. Inventario de disparadores de escaneo en dev

Hay dos tipos:
- **ACCIÓN:** cambian el estado de la orden (recibir, recoger, recolectar) o la abren para gestionarla.
- **BUSCAR:** solo ponen la guía en el buscador.

| Pantalla (rol) | Disparador | Tipo | Qué hace | Ficha | ¿En prod? |
|---|---|---|---|---|---|
| **`/ordenes`** (maestro y admin: bodega central; adminTienda: origen) | «Recibir paquete», a la izquierda (`OrdenesListado.tsx:1429`, `EscanerModal`) | ACCIÓN | Guía **suelta**: abre un diálogo con cámara y número; cada lectura recibe una guía y la cámara se cierra tras leer | existía; SLT-193 le puso la barra con título | **Sí** |
| | «Recibir paquetes», a la derecha (`OrdenesListado.tsx:1435`, `RecibirPaquetesEntrada`) | ACCIÓN | **Continua**. Con puntero fino es un enlace a `/ordenes/recibir`: página con campo para la pistola, «Escanear con cámara», lista de lecturas, contadores y «Terminar recepción (n)». Con táctil abre un diálogo continuo. Usa la misma acción del servidor que la suelta | SLT-159 (`da132140`, R611) | No |
| | Cámara del buscador (`BuscadorFiltros.tsx:711`) | BUSCAR | Lee la guía y la busca en el listado | SLT-160 (R600) | No |
| **`/recepcion-satelite/por-recibir`** (adminSatelite) | «Recibir paquete» (`EscanerRecepcion.tsx:190`, montado en `PorRecibirModule.tsx:76`) | ACCIÓN | Suelta | existía | **Sí** |
| | «Recibir paquetes» (`EscanerRecepcion.tsx:194`) | ACCIÓN | Continua; enlace a `/recepcion-satelite/recibir?desde=por-recibir` | SLT-159 | No |
| **`/recepcion-satelite/en-bodega`** (adminSatelite con zona) | «Recibir paquete» (`RecepcionSateliteModule.tsx:478`) | ACCIÓN | Suelta | existía | **Sí** |
| | «Recibir paquetes» | ACCIÓN | Continua (`?desde=en-bodega`) | SLT-159 | No |
| | Cámara del buscador del listado (`SateliteOrdenesListado.tsx:715`) | BUSCAR | Busca | SLT-160 (B2) | No |
| **`/recoleccion`** (mensajero) | «Escanear o escribir guía» (`RecoleccionModule.tsx:258`, `tactil`; diálogo «Recolectar en tienda» con `TarjetaEscaneoContinuo`) | ACCIÓN | Recolecta, en continuo | prod tenía «Recolectar en tienda»; texto de SLT-156 R500 y continuo de SLT-168 (`528e59c9`) | Sí, con otro texto |
| | Cámara del buscador (`RecoleccionModule.tsx:298`) | BUSCAR | Solo busca (SLT-194 D2, R943: «dos accesos distintos») | SLT-194 | No |
| **Recoger en bodega** (`/mis-asignaciones`, mensajero) | «Escanear o escribir guía» (`RecogerPaqueteCard.tsx:55`, diálogo «Recoger paquete», continuo) | ACCIÓN | Recoge, en continuo | prod tenía «Recoger paquete»; continuo de SLT-168 (`c85e6f07`) | Sí, con otro texto |
| | Buscador (`RecogerModule.tsx:361`) | — | `tactil`, **sin** `escaneo`: sin cámara | — | — |
| **Reparto** (`/mis-asignaciones/reparto`) | «Escanear o escribir guía» (`EscanerGuiaReparto.tsx:69`, diálogo «Abrir orden por guía») | ACCIÓN (abre la orden para gestionarla) | Uno a uno | SLT-163 (`0113f39b`) | No (prod no tenía escáner en Reparto) |
| | Buscador (`RepartoModule.tsx:872`) | — | `tactil`, sin `escaneo` | — | — |
| **Gestionar orden** (PWA) | `VerificarGuiaGate` (`GestionarOrdenPanel.tsx:992`) | verificación | Uno a uno (R594 de SLT-159: sigue suelta) | existía | Sí |
| **`/cierres-admin`**, confirmación física | `EscanerGuiaCard` dentro de su diálogo (`cierre-confirmacion-fisica.tsx:684`) | ACCIÓN | Ahora con cámara continua | SLT-159 T6 (`71cef5e2`) | Sí (uno a uno) |
| **`/novedades`** Devoluciones y Rechazos; `/historico/conversaciones` y `/historico/acciones`; `/wallet` (caja); estados de cuenta; `/mi-wallet` | Cámara del buscador | BUSCAR | Busca | SLT-160 (B3-B8) y SLT-194 (Rechazos) | No |

### Pantallas con dos o más disparadores de ACCIÓN que hacen lo mismo

| Pantalla | Repetidos | En qué se diferencian | ¿Cuál cubre al otro? |
|---|---|---|---|
| ⚠ `/ordenes` | «Recibir paquete» (izquierda) + «Recibir paquetes» (derecha), más la cámara de buscar | Suelta: un diálogo y la cámara se cierra tras cada lectura. Continua: página en escritorio o diálogo en táctil; la cámara sigue abierta, hay lista y contadores, y se cierra con «Terminar recepción (n)». Las dos recepciones llaman a la misma acción | **La continua cubre a la suelta.** Tiene campo para pistola y teclado, «Recibir» manual y cámara, y recibir una sola guía es una sesión de una lectura. La suelta no cubre la continua |
| ⚠ `/recepcion-satelite/por-recibir` | «Recibir paquete» + «Recibir paquetes» | Igual | La continua |
| ⚠ `/recepcion-satelite/en-bodega` | «Recibir paquete» + «Recibir paquetes», más la cámara de buscar del listado | Igual | La continua |

**Lo que no es un repetido de acción, aunque Carlos puede verlo como «otro escáner»:**
- `/recoleccion`: «Escanear o escribir guía» recolecta y la cámara del buscador solo busca. Fue una decisión explícita de SLT-194 (D2, R943).
- `/ordenes` y satélite en bodega: la cámara del buscador frente a los botones de recibir. En escritorio la pistola ya funciona en el campo (Enter, R601), así que esa cámara aporta poco en un PC sin webcam.

**Prod tenía exactamente un disparador por pantalla.** El segundo de acción («Recibir paquetes») lo añadió SLT-159 a propósito: R611 dice «junto al disparador de guía suelta», y R594 obliga a que «Recibir paquete» siga siendo suelta.

---

## 3. El texto de ayuda bajo el buscador

- **Texto:** «Escanea o escribe la guía y pulsa Enter. Lo leído por la pistola o por la cámara (QR o código de barras) se busca igual.»
- **Dónde se define:** `components/shared/BuscadorFiltros.tsx:66-68` (`AYUDA_ESCANEO`).
- **Dónde se pinta:** `:823-828`, `<p id={idAyuda} className="mt-1 text-xs text-muted-foreground">`. Se pinta siempre que haya `escaneo`, en todos los anchos, y es además el `aria-describedby` del campo (`:662-666`).
- **Quién lo pidió:** SLT-160, R770 («DEBEN mostrar debajo del campo el texto…», requirements `:105-107`) y DC2 (2). Commit `8c3760ff` (T4b).
- **Dónde aparece:** en las 10 pantallas de la tabla del §1.
- **Ojo:** el aviso de «mínimo de caracteres» sigue reservando su línea `h-4` debajo. Con la ayuda, el bloque bajo la barra crece unos 16 px más que en prod; en la captura de dev se ve que la tabla baja.

---

## 4. Propuesta de arreglo mínimo

### 4a. Tamaños: escritorio como prod y 44 px solo en el teléfono

Es un cambio de clases en un solo archivo de código, `components/shared/BuscadorFiltros.tsx`:

1. `:58`: `ALTO_CONTROL_ESCANEO = "h-8 max-md:h-11"`, el mismo valor que `ALTO_CONTROL_TACTIL`. En escritorio el campo, «Filtros» y «Limpiar todo» vuelven a 32 px; en el teléfono siguen en 44.
2. `:715`: la cámara pasa de `className="size-11 shrink-0"` a `"size-8 shrink-0 max-md:size-11"`.
3. `:811`: «Limpiar todo» ya usa la constante, así que lo arregla el punto 1.
4. Texto de ayuda (§3), dos opciones; **decide Carlos**:
   - (a) Quitarlo de la vista en escritorio sin quitarlo del nombre accesible: `className="sr-only max-md:not-sr-only max-md:mt-1 …"`.
   - (b) Quitarlo en todos los anchos, cambiando R770.
   - La captura de prod no lo tiene; «escritorio = prod» pide al menos la (a).

**Qué se conserva:**
- El 44 px del teléfono: la PWA del mensajero (`/recoleccion`, y Recoger y Reparto con `tactil`, que no se tocan) y los demás listados en móvil.
- `max-md:` de filtros y «Descargar» (SLT-194 R946 y R947) y todo SLT-193 (encabezado, menú, (i), solo móvil).
- `size="touch"`/`"icon-touch"` y `min-h-11` en todos los anchos dentro de pantallas solo del mensajero (SLT-156 design §4 y SLT-193 «entran a 44 en todos los anchos»). En escritorio nadie las abre.
- El «Cerrar» de 44 px de la barra del diálogo del escáner (SLT-193 R925, en todos los anchos). Está dentro de un diálogo, no en la barra; si Carlos lo quiere de 32 en escritorio, sería `size-8 max-md:size-11` en `EscanerModal.tsx:139`.
- La página `/ordenes/recibir` (SLT-159 R610), con botones `size="touch"`: es nueva y no tiene equivalente en prod. Hay que preguntar a Carlos si también la quiere a 32 px.

**Tests y specs que cambian con 4a:**
- `tests/unit/components/buscador-filtros-escaneo.test.tsx`: R600 y R771 hoy esperan `h-11`/`size-11`; pasan a esperar `h-8` + `max-md:h-11`.
- Revisar `tests/components/RecepcionSateliteModule.test.tsx` y `ordenes-listado-buscador.test.tsx` por si comprueban la clase.
- El E2E `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` (R945, a 360 px ≥ 44) debería seguir verde.
- Spec: enmendar R771 y R600 de SLT-160 («44 px solo en móvil; en escritorio 32»), y R770 si se elige (b).

### 4b. Disparadores repetidos: uno de acción por pantalla

**Recomendado: dejar un solo botón de recibir, el continuo, en el sitio y con el estilo del de prod (a la izquierda).**
- Con puntero fino, el botón lleva a la página «Recibir paquetes»; con táctil, abre el diálogo continuo.
- No se pierde nada: la continua recibe una guía igual que la suelta (pistola, teclado o cámara) y además varias seguidas.
- **Cambia de prod:** la suelta abría un diálogo encima del listado; la continua en escritorio cambia de página. Si Carlos prefiere no salir del listado, la alternativa es abrir en escritorio también el diálogo continuo en lugar de la página.

| Pantalla | Quitar | Dejar | Archivo |
|---|---|---|---|
| `/ordenes` | El `EscanerModal` de guía suelta (`OrdenesListado.tsx:1429-1453`). La carga masiva sigue a la derecha. | `RecibirPaquetesEntrada` como único disparador, a la izquierda; ¿con el texto «Recibir paquetes» o «Recibir paquete»? Decide Carlos | `app/(app)/ordenes/_components/OrdenesListado.tsx` |
| `/recepcion-satelite/por-recibir` y `/en-bodega` | La rama suelta `RecepcionSateliteSuelta` como disparador (`EscanerRecepcion.tsx:190-215`) | `RecibirPaquetesEntrada` sola | `app/(app)/recepcion-satelite/_components/EscanerRecepcion.tsx` |
| Cámara del buscador en escritorio (B1-B8 y Rechazos) | Opcional: no pintarla con puntero fino (en un PC busca la pistola en el campo) | En el teléfono, sí | `components/shared/BuscadorFiltros.tsx`; decide Carlos, porque cambia R600 |
| `/recoleccion` | Nada: «Escanear o escribir guía» recolecta y la cámara solo busca (SLT-194 D2, R943) | Las dos | — |

**Alternativa mínima, que pierde funcionalidad:** quitar «Recibir paquetes» y volver a la suelta de prod. Se pierde la recepción continua de SLT-159.

**Lo que hay que revisar con 4b:**
- Las ramas suelta de `EscanerRecepcionBodegaCentral.tsx` y `EscanerRecepcionOrigen.tsx` (`RecepcionOrigenSuelta`) se quedarían sin usos en `/ordenes`. Ver si algún test o guardia las exige; `tests/unit/guards/escaner-un-solo-cierre.guardia.test.ts` lista los usos de `EscanerModal`.
- Spec: enmendar R594 y R611 de SLT-159, porque obligan a mantener la suelta junto a la continua.
- Tests: `tests/components/OrdenesPage.test.tsx`, `tests/components/RecibirPaquetesEntrada.test.tsx`, `tests/components/EscanerRecepcion.test.tsx`, `tests/components/EscanerRecepcionBodegaCentral.test.tsx` y `tests/components/EscanerRecepcionOrigen.test.tsx`, más los E2E de recepción.

### Archivos

| Archivo | Arreglo | Qué cambia |
|---|---|---|
| `components/shared/BuscadorFiltros.tsx` | 4a, y 4b opcional | Alto, cámara y ayuda |
| `app/(app)/ordenes/_components/OrdenesListado.tsx` | 4b | Un solo disparador |
| `app/(app)/recepcion-satelite/_components/EscanerRecepcion.tsx` | 4b | Un solo disparador |
| `components/shared/EscanerModal.tsx` | Solo si Carlos quiere el «Cerrar» a 32 en escritorio | Tamaño del «Cerrar» |
| `components/shared/RecepcionContinuaPagina.tsx` | Solo si Carlos quiere la página a 32 | Botones de la página |
| Tests | 4a y 4b | Los listados arriba |
| Specs | 4a y 4b | Enmiendas a SLT-160 (R600, R770, R771) y SLT-159 (R594, R611) |

---

### 4c. Ampliación por la decisión de Carlos: 44 px en el teléfono de la PWA, escritorio como prod

Las pantallas solo del mensajero llevan hoy `size="touch"`, `"icon-touch"` y `min-h-11` **en todos los anchos**. Lo pidieron SLT-156 design §4 («son pantallas de teléfono»), SLT-193 (R910, R916, R925) y SLT-194 (R940). Para cumplir la decisión de Carlos:

1. **Variante nueva de `Button`.**
   - Crear una variante «táctil solo en móvil» (`h-8 max-md:h-11`, y para el icono `size-8 max-md:size-11`) en `components/ui/button.tsx`.
   - Con ella, sustituir `size="touch"`/`"icon-touch"` en: `GestionarOrdenCardButton.tsx:45`, `MarcarLuegoToggle.tsx:78`, `RecuperarAyudaButton.tsx:80`, `RepartoModule.tsx:737` y `:824-833`, `ConfirmarGestionDialog.tsx:43-54`, `VerificarGuiaGate.tsx:102-146`, `AvisoRutaLinea.tsx`, `RutaMapaInner.tsx:151`, `:305` y `:394-419`, y `HojaParadaMapa.tsx`.
   - Todos están en `app/(app)/mis-asignaciones/_components/`.
   - **Alternativa:** dejar el `size` de prod y añadir `TACTIL_MOVIL`, sin variante nueva.
   - `components/ui/button.tsx` es una primitiva: crear la variante es decisión de diseño.
2. **`min-h-11` sueltos → `max-md:min-h-11`:**
   - `RecogerModule.tsx:402` y `:405` (pestañas);
   - `pos-card/PosOrderCardMosaico.tsx:289` (este también se cuela en `/novedades` de escritorio);
   - `pos-card/PosOrderCardDetalle.tsx:210` y `:257`;
   - `plataforma/planes/_components/plan-form/PasoModulos.tsx:32` (ya estaba así en prod; opcional).
3. **Disparador `tactil` de `EscanerModal`** (`components/shared/EscanerModal.tsx:175-176`):
   - hoy es `size="touch"` + `w-full`;
   - pasaría a `size="default"` con `max-md:h-11 max-md:w-full`.
   - Afecta a Reparto, Recoger y Recolección.
4. **«Cerrar» del diálogo de escáner** (`EscanerModal.tsx:139`): de `icon-touch` a `icon-sm max-md:size-11`. Afecta a todos los diálogos de escáner, también los de Órdenes y recepción en escritorio.
5. **`BuscadorFiltros`:** lo del §4a. Cubre `/recoleccion`, donde hoy `escaneo` le gana a `tactil` y fija `h-11`.
6. **Specs y tests que cambian:**
   - specs: SLT-156 design §4; SLT-193 R910, R916 y R925; SLT-194 R940; SLT-160 R600 y R771;
   - tests que comprueban esas clases sin prefijo: `tests/components/botones-44-pwa-mensajero.test.tsx`, `tests/components/EscanerModal.test.tsx`, `tests/unit/components/buscador-filtros-escaneo.test.tsx` y los E2E de la PWA a 360 px (estos deberían seguir verdes).
7. **Pregunta para Carlos: ¿la decisión es solo de tamaños, o de todo?** Además de los 44 px, en escritorio cambió el **diseño** de las pantallas del mensajero:
   - modo foco y lista sin panel en Reparto;
   - filas compactas;
   - barra fija con filtros;
   - escáner arriba;
   - avisos de ruta en una línea;
   - hoja del mapa.

   Todo eso lo pidió un spec. «Escritorio = prod» al pie de la letra lo revertiría.

---

## 5. Auditoría visual completa origin/prod..origin/dev

**Alcance:**
- Los 105 `.tsx` de `app/` y `components/` que cambiaron, más los `.ts` con clases (`texto-entero.ts`, `alto-controles-barra.ts`, `chat-format.ts`, `ruta-mapa-iconos.ts`).
- No cambió ningún CSS, ni `tailwind`/`postcss` ni `components.json`.
- `components/ui/button.tsx` e `input.tsx` no cambian. `select.tsx` solo gana `partirLinea`, que es opcional (SLT-190).

**Formato de cada línea:** `⚠? | archivo:línea (origin/dev) | cambio | commit · ficha | clasificación`.
- **PEDIDO** = lo pidió el spec, con su R<n>.
- **NO PEDIDO** = nadie lo pidió.
- **SE COLÓ** = algo de móvil o de otra pantalla que aparece en escritorio o en otra pantalla.
- **«PEDIDO, todos los anchos»** = lo pidió el spec, pero choca con la decisión de hoy (escritorio = prod).

**Fichas citadas en esta sección y no en la cabecera** (sin título en la ficha: SLT-163, SLT-164 y SLT-166 son rebanadas de SLT-156 sin spec propio, y SLT-173 no tiene spec):
- SLT-60 «Confirmación del pago a la plataforma por el superadmin»
- SLT-130 «Planes: formulario por pasos compartido en un sheet (crear y editar)»
- SLT-136 «Planes: aviso, correo y descarga de la factura»
- SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa»
- SLT-162 «Ranking del mensajero en tarjetas en el móvil»
- SLT-163 «Reparto en el móvil, tanda 2»
- SLT-164 «Recoger en bodega y Recolección»
- SLT-166 «PWA del mensajero: mapa de ruta»
- SLT-171 «Wallet de satélites: la nota del saldo dice que el dinero entró al aprobar, y entra al conciliar»
- SLT-172 «Limpieza tras el pago neto a la tienda: componentes de cierres sin uso»
- SLT-174 «Quitar el alias ganaLaTienda y los restos de la cascada del mensajero»
- SLT-191 «Cierre del día del mensajero según el canvas»
- SLT-192 (mapa del mensajero; título sin verificar)
- SLT-198 «Cerrar una bodega: dejar una zona sin distritos»

### Barra de los listados con `escaneo`

Afecta a B1-B8 (`/ordenes`, satélite en bodega, novedades Devoluciones, histórico de conversaciones y de acciones, `/wallet`, estados de cuenta, `/mi-wallet`), a Rechazos y a `/recoleccion`.

- ⚠ | BuscadorFiltros.tsx:58, 336, 650, 735, 811 | Campo, «Filtros» y «Limpiar todo» a `h-11` en todos los anchos | 8c3760ff · SLT-160 | PEDIDO (R771, DC2) → **SE COLÓ a escritorio**
- ⚠ | BuscadorFiltros.tsx:711-721 | Botón nuevo de cámara, 44 × 44, aparte y junto al campo | 4b579861, 8c3760ff · SLT-160 | PEDIDO (R600) → en escritorio, 44 px colado; en `/recoleccion`, segundo acceso de escaneo (SLT-194, R943)
- ⚠ | BuscadorFiltros.tsx:823-828 | Texto de ayuda nuevo bajo el campo, en todos los anchos | 8c3760ff · SLT-160 | PEDIDO (R770)
- ⚠ | (consecuencia) | «Vistas», los conmutadores de orden, los filtros puestos y «Descargar» se quedan en 32 px con el campo en 44: desalineados | SLT-160 y SLT-194 | El spec de SLT-160 lo aceptó en `:56-58`; DC4 de SLT-194 lo contradice → **NO PEDIDO** como resultado
- | BuscadorFiltros.tsx:634-637 + alto-controles-barra.ts:10 + FilterComponent.tsx, MultiSelectFilter.tsx, DateRangeFilter.tsx | Filtros puestos a 44 px solo en móvil | 9eb3e945 · SLT-194 | PEDIDO (R946, R948); en escritorio sin cambio ✔
- | DescargarDatasetButton.tsx:340 | «Descargar» `max-md:h-11` | 9eb3e945 · SLT-194 | PEDIDO (R947); en escritorio sin cambio ✔
- | BuscadorFiltros.tsx:798 | Hueco `trasFiltros` | 37355796 · SLT-189 | PEDIDO (R795); solo lo usa Reparto
- | OrdenesListado.tsx:1490 y SateliteOrdenesListado.tsx | Nombre accesible «Buscar órdenes» y el de la bodega (no se ve) | e568b3a8 · SLT-160 | PEDIDO (R772)

### Órdenes (`/ordenes`)

- ⚠ | OrdenesListado.tsx:1435 + RecibirPaquetesEntrada.tsx:51-56 | Botón nuevo «Recibir paquetes», a la derecha y junto a «Recibir paquete»: **dos disparadores de recibir** | da132140 · SLT-159 | PEDIDO (R611), pero Carlos lo nota como repetido
- ⚠ | OrdenesListado.tsx:1429 + EscanerModal.tsx:133-143 | El diálogo «Recibir paquete» lleva ahora arriba una barra con título y un «Cerrar» de 44 × 44, y la tarjeta pierde su encabezado (icono, título y descripción) | 53581f41 · SLT-193 | PEDIDO (R925, R927), todos los anchos
- | OrdenesListado.tsx:860-869, 1657 + RetirarACentralModal.tsx | Acción nueva «Retirar a bodega central» para el estado «en bodega satélite», con su modal | ddfe5b26 · SLT-197 | PEDIDO (spec de SLT-197, R980)
- ⚠ | ordenes/recibir/page.tsx + RecepcionContinuaPagina.tsx | Página nueva «Recibir paquetes»: campo de pistola `min-h-16 text-2xl`; «Terminar recepción (n)» y «Escanear con cámara» con `size="touch"` (44 px en escritorio) | feef0a69 · SLT-159 | PEDIDO (R610, canvas Main); 44 px en escritorio por diseño
- | EscaneoContinuo.tsx | Lista de lecturas con chips, contadores (`text-xl`) y «Reintentar» `size="touch"` | 8fe6312c, 17089299 · SLT-159 | PEDIDO (R581-R587)

### Recepción satélite (`/recepcion-satelite/por-recibir`, `/en-bodega`, `/recibir`)

- ⚠ | EscanerRecepcion.tsx:190-197 | «Recibir paquetes» junto a «Recibir paquete»: dos disparadores de recibir. En `/en-bodega` hay tres, con la cámara del buscador | da132140 · SLT-159 | PEDIDO (R611)
- ⚠ | EscanerRecepcion.tsx:199 | El diálogo con barra y «Cerrar» de 44; la tarjeta sin encabezado | 53581f41 · SLT-193 | PEDIDO (R925, R927)
- | recepcion-satelite/recibir/page.tsx | Página «Recibir paquetes» de la satélite, igual que la de `/ordenes` | SLT-159 | PEDIDO (R612, R613)

### Novedades (`/novedades`)

- ⚠ | RechazosSlaModule.tsx:146-170 | Buscador nuevo con cámara y ayuda en la pestaña «Devolución a origen por plazo vencido»; vacío nuevo «sin coincidencias» con «Limpiar búsqueda» (sm) | 9c84b826 · SLT-194 | PEDIDO (R949-R952); el 44 px colado viene de la barra
- ⚠ | pos-card/PosOrderCardMosaico.tsx:289 | «Ver detalle completo» con `min-h-11` sin prefijo; el componente también se usa en novedades de escritorio | 53581f41 · SLT-193 | PEDIDO para el mensajero (R910) → **SE COLÓ en Novedades**
- | PosOrderCardMosaico.tsx:145, 155; PosOrderCardDetalle.tsx:116; PosCardHeader.tsx:80, 93 | (i) con `CLASE_INFO_TACTIL`: crece el área activa, no la caja | 53581f41 · SLT-193 | PEDIDO (R916) → SE COLÓ en Novedades, aunque no se ve (R920 decía que los demás usos no cambian)

### Encabezado y menú (todos los roles)

- | layout.tsx:177; LogoutButton.tsx; AyudaBoton.tsx; InstalarPwaButton.tsx; NotificationsBell.tsx; TemaToggle.tsx | `TACTIL_MOVIL` = `max-md:min-h-11 max-md:min-w-11` | 53581f41 · SLT-193 | PEDIDO (R911, R913); en escritorio sin cambio ✔
- | Sidebar.tsx:398, 414, 444 | Ítems y subítems con `max-md:h-11` | 53581f41 · SLT-193 | PEDIDO (R914, R915); en escritorio sin cambio ✔

### Reparto (`/mis-asignaciones/reparto`, PWA del mensajero)

- ⚠ | RepartoModule.tsx:855 + EscanerGuiaReparto.tsx:69 | Botón nuevo «Escanear o escribir guía» arriba, `tactil` (44 px y todo el ancho) | 0113f39b · SLT-163; 53581f41 · SLT-193 | PEDIDO (R500, R802), todos los anchos
- ⚠ | EscanerGuiaReparto.tsx:69 + EscanerModal.tsx:139 | Diálogo con barra «Abrir orden por guía» y «Cerrar» `icon-touch`; se va la X | 53581f41 · SLT-193 | PEDIDO (R925, R927), todos los anchos
- ⚠ | RepartoModule.tsx:872-902 | El `Input` con rótulo y el filtro cantón/distrito pasan a un `BuscadorFiltros` fijo `tactil` (`h-8 max-md:h-11`) | add28800 · SLT-163 | PEDIDO (R495, R496, R505); en escritorio a 32 ✔
- | RepartoModule.tsx:144 | Placeholder «Guía, remisión, teléfono o nombre» | add28800 · SLT-163 | PEDIDO (R506)
- ⚠ | RepartoModule.tsx:887 | Conmutador Mosaico/Detalle dentro de la barra fija, `max-md:h-11` | d8681b1e · SLT-189 | PEDIDO (R795-R797) ✔
- ⚠ | FiltroCantonDistrito.tsx:29 | Select `min-h-8 max-md:min-h-11`, sin rótulos visibles | add28800 · SLT-163; 4c672c4b · SLT-190 | PEDIDO (R505) ✔
- ⚠ | RepartoModule.tsx:820, 863 | Los KPI pasan al módulo y salen también en el modo foco | add28800 · SLT-163; d8681b1e · SLT-189 | PEDIDO (R503, R798)
- | KpisMensajero.tsx:70-110 | Rejilla compacta en móvil (desde `md`, como prod) y sin `overflow-hidden` en la Card | add28800, 0ed3f4b8 · SLT-163 | PEDIDO (R502); quitar `overflow-hidden` es **NO PEDIDO**
- ⚠ | RepartoModule.tsx:793 | Separación del módulo `gap-8` → `gap-6` | add28800 · SLT-163 | **NO PEDIDO**
- ⚠ | RepartoModule.tsx:905… | Fuera del modo foco ya no hay panel de detalle: solo la lista | add28800 · SLT-163 | PEDIDO (R504)
- ⚠ | pos-card/PosOrderCardDetalle.tsx:191-247 | La vista Detalle pasa a fila compacta desplegable con botón `min-h-11` | ec496833 · SLT-189 | PEDIDO (R508, R790-R793); el `min-h-11` es de todos los anchos
- ⚠ | RepartoModule.tsx:715 | «Con ayuda solicitada» como fila compacta | d8681b1e · SLT-189 | PEDIDO (R800, R801)
- ⚠ | GestionarOrdenCardButton.tsx:45; MarcarLuegoToggle.tsx:78; RecuperarAyudaButton.tsx:80; RepartoModule.tsx:737 («Conversación») | Pasan de `sm` a `touch` | add28800 · SLT-163 | PEDIDO (R493 y design §4), todos los anchos
- | RepartoModule.tsx:629 | Pie de la tarjeta `gap-2` → `flex-wrap gap-3` | add28800 · SLT-163 | **NO PEDIDO** (menor)
- ⚠ | ConfirmarGestionDialog.tsx:43-54 | «Cancelar» y «Aceptar» a `touch`; `gap-3` | add28800 · SLT-163 | PEDIDO (R493), todos los anchos
- ⚠ | RepartoModule.tsx:824-833 | «Volver a la lista» nuevo, `touch w-full` | add28800 · SLT-163; d8681b1e · SLT-189 | PEDIDO (R513), todos los anchos
- ⚠ | GestionarOrdenPanel.tsx:980 | Se quitan la barra inferior «Gestionar esta orden» y «Ocultar gestión»; el bloque de la guía sale abierto | 0113f39b · SLT-163 | PEDIDO (R510, R511)
- ⚠ | VerificarGuiaGate.tsx:102-146 | Cámara arriba, separador «o», campo `h-11` «Ej. 1024», «Confirmar guía» `touch w-full` y texto nuevo «Con la pistola o la cámara se confirma sola.» | 0113f39b · SLT-163 | PEDIDO (R511), todos los anchos
- | GestionarOrdenPanel.tsx:855 | (i) con `CLASE_INFO_TACTIL`: no se ve | 53581f41 · SLT-193 | PEDIDO (R916)

### Recoger en bodega (PWA)

- ⚠ | RecogerPaqueteCard.tsx:55 | «Escanear o escribir guía» pasa de 32 px a `tactil` (44 px y todo el ancho); diálogo con barra «Recoger paquete»; sesión continua | 2bddeb94 · SLT-164; 9bcb476c · SLT-190; c85e6f07 · SLT-168 | PEDIDO (R500, R518, R867-R870), todos los anchos
- ⚠ | RecogerModule.tsx:361-383 | `BuscadorFiltros` fijo `tactil`, con el filtro «Tienda» nuevo y el conmutador en la barra | 2bddeb94 · SLT-164; 9bcb476c · SLT-190 | PEDIDO (R495, R518, R850-R852, R859) ✔
- ⚠ | FiltroTienda.tsx:23 | Select «Tienda» nuevo, `min-h-8 max-md:min-h-11` | 9bcb476c · SLT-190 | PEDIDO (R850-R852) ✔
- ⚠ | RecogerModule.tsx:402, 405 | Pestañas «Para recoger hoy» y «Para otro día» con `min-h-11` | 2bddeb94 · SLT-164 | PEDIDO (design §4), todos los anchos
- | RecogerModule.tsx:289, 311; PosOrderCardMosaico.tsx:108, 135; PosOrderCardDetalle.tsx:92 | Número de posición y «{n} de {total} · peso» | 9bcb476c · SLT-190 | PEDIDO (R855-R857)
- ⚠ | RecogerModule.tsx:230-235 | La vista Detalle pasa a fila compacta desplegable | 2bddeb94 · SLT-164 | PEDIDO (R517, R866)

### Recolección (`/recoleccion`, PWA)

- ⚠ | RecoleccionModule.tsx:258 | «Escanear o escribir guía» a `tactil` (44 px, todo el ancho); diálogo «Recolectar en tienda» continuo | 2bddeb94 · SLT-164; 9bcb476c · SLT-190; 528e59c9 · SLT-168 | PEDIDO (R500, R519, R868, R869), todos los anchos
- ⚠ | RecoleccionModule.tsx:298 | Segundo acceso de escaneo: la cámara del buscador, que solo busca | 9eb3e945 · SLT-194 | PEDIDO (R940, R943), pero Carlos lo verá como duplicado
- ⚠ | RecoleccionModule.tsx:298 → BuscadorFiltros | Por `escaneo` (que le gana a `tactil`), el campo, «Filtros» y «Limpiar todo» van a `h-11` en todos los anchos; aparece además la ayuda | 9eb3e945 · SLT-194 | PEDIDO (R940), todos los anchos
- ⚠ | RecoleccionModule.tsx:237, 282, 310 | Barra fija antes de las secciones; se quitan los dos conmutadores de las cabeceras; filtro «Tienda» | 2bddeb94 · SLT-164; 9bcb476c · SLT-190 | PEDIDO (R519, R520, R850, R860)
- | RecoleccionModule.tsx:330; RecolectadasHoyLista.tsx:45, 130, 153, 165 | Vacío de búsqueda nuevo, numeración y Detalle compacto | 2bddeb94 · SLT-164; 9bcb476c · SLT-190 | PEDIDO (R521, R855, R860)
- ⚠ | PosOrderCardDetalle.tsx:220-232, 257 | Fila compacta con tienda y «· Recogido a las {hora}»; fila de estado con su (i) y `min-h-11` | 9bcb476c, 9dfdf94b · SLT-190 | PEDIDO (R862, R863), todos los anchos

### Mapa de ruta (PWA)

- ⚠ | RepartoModule.tsx:765-777, 929 + AvisoRutaLinea.tsx:39, 45 | Avisos de ruta en una línea con «Ver más» `touch`; «Mostrar mapa» pasa de `xs` (24 px) a `touch` | add28800 · SLT-163; b5ec4754 · SLT-166; 2b98b576 · SLT-192 | PEDIDO (R509, R544, R883), todos los anchos
- ⚠ | RepartoModule.tsx:949-954 | Rótulo «Mapa de ruta» siempre visible | 2b98b576 · SLT-192 | PEDIDO (R884)
- ⚠ | RutaMapaInner.tsx:394-419 | Botones nuevos «Ver mapa completo» y «Ocultar mapa», `touch flex-1` | b5ec4754 · SLT-166; 2b98b576 · SLT-192 | PEDIDO (R541, R880, R881), todos los anchos
- ⚠ | RutaMapaInner.tsx:163, 388 | Leyenda nueva; la nota del punto de partida baja | b5ec4754, 2b98b576 | PEDIDO (R539, R885)
- ⚠ | RepartoModule.tsx:1007 | Texto nuevo «El mapa se centra en la orden del carrusel.» | b5ec4754 · SLT-166 | **NO PEDIDO** como requisito (solo design §11, sin R)
- ⚠ | ruta-mapa-iconos.ts:17-70 | Marcadores nuevos: siguiente amarilla de 34 px con anillo, pendientes negras y origen «Tú» | b5ec4754 · SLT-166 | PEDIDO (R539)
- | RutaMapaInner.tsx:151, 305 | En pantalla completa, «Cerrar» `touch` y «Centrar» `icon-touch` | b5ec4754 · SLT-166 | PEDIDO (R541)
- ⚠ | HojaParadaMapa.tsx | Hoja inferior nueva al tocar un marcador: asa `h-11 w-24`, «Navegar» y «Gestionar» `touch`; también en escritorio | b5ec4754 · SLT-166; 2b98b576 · SLT-192 | PEDIDO (R540, R887-R889), todos los anchos

### Chat (PWA e histórico de conversaciones)

- | ChatConversacion.tsx:703; ChatOrdenesLista.tsx:170 | (i) con `CLASE_INFO_TACTIL` (área invisible); también en el histórico, de otros roles | 53581f41 · SLT-193 | PEDIDO (R916) → SE COLÓ al histórico, aunque no se ve
- ⚠ | chat/chat-format.ts:18-19 | Chips «en reparto» y «entregado» con fondo nuevo `dark:bg-*/15`, en tema oscuro y para todos los roles | 6a2c1adb · SLT-173 | Sin spec: R no verificable

### Cierre del día (`/cierre-dia`)

- | CierreDiaModule.tsx:551, 582, 730; RechazosDeTiendaCierre.tsx:63-65, 82, 143 | En el teléfono, los rechazos van como filas desplegables (`min-h-11` solo en esa rama) | 0903e28f, 4fb7ade8 · SLT-191 | PEDIDO (R815-R817); en escritorio sin cambio ✔
- | GestionesCierre.tsx:211; FilaGestion.tsx:422, 442-505 | Tarjeta del mensajero solo en el teléfono (`useIsMobile`); «Devolver a gestión» al pie del desplegado | 5d1de9a6, d1ba1cc5 · SLT-191 | PEDIDO (R810-R814) ✔
- | FilaGestion.tsx:225, 486 | (i) `max-md:` | 53581f41 · SLT-193 | PEDIDO (R919) ✔
- | FilaGestion.tsx:317-360 | Fila de escritorio con el mismo DOM y las mismas clases que prod | 5d1de9a6 · SLT-191 | sin cambio

### Cola de cierres y cierres admin

- | ColaCierres.tsx:312; TablaColaPropia.tsx:119-146 | En el teléfono: barra fija, folio arriba, «Ganancia» y «Ver» `min-h-11` en el desplegable | caa83a75 · SLT-191 | PEDIDO (R818-R823); en escritorio sin cambio ✔
- | CascadaDinero, CascadasCierreMensajero y DesglosePorTienda (borrados); CierresAdminModule; cierre-detalle-shared; Cuenta | Nada cambia en pantalla: era código muerto | a6fe3db8 · SLT-172; 5bdd136c, 6b180aa1 · SLT-174 | PEDIDO (SLT-172 R640-R643)
- | cierre-confirmacion-fisica.tsx:685 | Cámara continua en la confirmación física | 71cef5e2 · SLT-159 | PEDIDO (R588); es comportamiento, no tamaño

### Planes (`/plataforma/planes`, superadmin)

- ⚠ | PlanForm.tsx:79; PlanesModule.tsx:223; PlanDetalle.tsx:427 | El panel de crear y editar pasa de 512 px a `min(920px, 100vw)` | f554cbb7 · SLT-130 | PEDIDO (R6)
- ⚠ | FormularioPorPasos.tsx:97-179 | Formulario por pasos: columna de pasos de 220 px, «Paso n de m» y pie fijo | c139a40e, 3e363d83, 8136eb6f · SLT-130 y SLT-144 | PEDIDO (SLT-130 R1, R2; SLT-144 R6)
- ⚠ | PlanForm.tsx:865-893 | Pie con «Anterior», estado y «Guardar y continuar», y la acción final | f554cbb7, 8136eb6f | PEDIDO (SLT-130 R20, R24; SLT-144 R1)
- ⚠ | PlanForm.tsx:842, 875, 905 | Tres textos de borrador casi iguales (cabecera, pie y cada paso), y un cuarto al retomar | 8136eb6f · SLT-144 | PEDIDO (R7, R15), pero se lee como repetido
- ⚠ | PlanForm.tsx:914-925, 943 | «Descartar y empezar de nuevo» y su diálogo | 8136eb6f · SLT-144 | PEDIDO (R15, R16)
- ⚠ | PasoRevisar.tsx:118-129 | Enlaces «Ir a <paso>» que repiten la columna de pasos | f554cbb7, 4b50e8e9 | PEDIDO (SLT-144 R8; SLT-130 R28)
- | PasoRevisar.tsx:85; PasoPrecio.tsx:121, 203; FechasPorEmpresa.tsx; AbrirPlanForm.tsx:70-102 | Revisión en lista clave/valor, descuentos, tabla de fechas por empresa y estados de carga y error | SLT-130 y SLT-144 | PEDIDO (SLT-130 R10-R12, R22, R23; SLT-144 R14, R17-R20)
- | PasoModulos.tsx:32 | `min-h-11` sin prefijo, igual que ya estaba en prod (solo se movió) | f554cbb7 · SLT-130 | heredado de prod
- ⚠ | BorradoresDePlanes.tsx:91-170, montada en PlanesModule.tsx:203 | Sección nueva «Borradores», con «Retomar» y «Descartar»; solo si hay borradores | 4b50e8e9 · SLT-144 | PEDIDO (R24, R26, R27)
- | PlanesModule.tsx:198, 298; PlanDetalle.tsx:205, 269 | Insignia «Cambio en borrador», aviso al cerrar y `?editar=1` | 4b50e8e9, c670d9c6, 3e363d83 · SLT-144 | PEDIDO (R13, R25, R26)

### Empresa / pagos / Mi plan / Facturas

- ⚠ | empresas/[organizacionId]/page.tsx:209 → PagosPorConfirmar.tsx:97-135, 244-248, 349, 430 | Sección nueva «Pagos por confirmar», **siempre visible**, con tabla, «Confirmar…» y diálogo `xl` | f39fd717 · SLT-60 | PEDIDO (R12-R17, R32, R33)
- | EmpresasModule.tsx:602-609 | Línea nueva «N pagos por confirmar» en la celda | f39fd717 · SLT-60 | PEDIDO (R27)
- ⚠ | DetalleDeFactura.tsx:70-73 + DescargarFactura.tsx:87, 90; FacturasDeLaEmpresa.tsx; MiPlanModule.tsx:69 | «Descargar PDF» y «Descargar Excel» (outline sm) en la factura cerrada | 47ff35a6 · SLT-136 | PEDIDO (R19, R20)

### Ranking

- ⚠ | RankingModule.tsx:207 | Buscador nuevo «Buscar mensajero» en Ranking del día, también en escritorio (h-8) | 804e2c1e · SLT-162 | PEDIDO (R769, DC23: «en todos los anchos»)
- ⚠ | RankingHistoricoModule.tsx:250-268 | El selector de fecha va dentro de un `BuscadorFiltros` sin campo; `gap-2` | 0c494089 · SLT-162 | PEDIDO (R757)
- | RankingPodio.tsx:37-38, 115-350 | Chip «Tú» `px-2 py-1` y retoques de ±2 px de espaciado en escritorio | 804e2c1e · SLT-162 | PEDIDO (R765)
- | RankingPodio.tsx:200, 232 | Barra de progreso desde `md` en vez de `sm`; entre 640 y 767 px sale la versión móvil | 804e2c1e · SLT-162 | PEDIDO (R751)
- | RankingPodio.tsx, PremioInputRow.tsx | Los textos parten línea en vez de «…»; lo demás, solo `max-md:` | 804e2c1e · SLT-162 | PEDIDO (R750-R768)

### Otros

- ⚠ | ZonasModule.tsx:250-256 | «Sin distritos» en vez de «0 distritos» | 2127284c · SLT-198 | PEDIDO (R1230)
- | DataTable.tsx:545 | Solo el nombre accesible del desplegable | SLT-162 | PEDIDO (R760), invisible
- | SaldosSatelitesTable.tsx; CarruselCards.tsx; select.tsx (`partirLinea`, opcional) | Sin cambio visible en escritorio | SLT-171, SLT-166, SLT-190 | —

### Resumen de la auditoría

- **SE COLÓ a escritorio (44 px):**
  - la barra con `escaneo` (campo, cámara, «Filtros» y «Limpiar todo») en 10 pantallas;
  - «Ver detalle completo» de la tarjeta Mosaico, en `/novedades`;
  - el «Cerrar» 44 del diálogo de escáner, en Órdenes y recepciones;
  - todos los `touch`/`min-h-11` de las pantallas del mensajero, que son «todos los anchos» por spec.
- **NO PEDIDO:**
  - el desalineado de la barra (campo de 44 con hermanos de 32);
  - `gap-8` → `gap-6` y el pie `gap-3` en Reparto;
  - quitar `overflow-hidden` en los KPI;
  - «El mapa se centra en la orden del carrusel.»
- **Repetidos que Carlos nota:**
  - «Recibir paquete» + «Recibir paquetes» en `/ordenes`, `/recepcion-satelite/por-recibir` y `/en-bodega`;
  - la cámara del buscador junto al escáner de acción en `/recoleccion`, `/ordenes` y satélite en bodega;
  - los textos de borrador en Planes.
