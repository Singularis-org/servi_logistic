# impl SLT-202 «Escritorio igual a prod: tamaños de controles y un solo botón de recibir»

Ruta directa. frontend_dev, 2026-11-18. Regla: desde `md` las clases EXACTAS de origin/prod; por debajo
de `md` (PWA en el teléfono), los 44 px de dev con `max-md:`.

**Estado:** `tamano-pr` en rojo (62/40 archivos); el leader pidió commitear y pedir a Carlos que acepte el tamaño.

## Puntos (antes → después)

1. `components/shared/BuscadorFiltros.tsx` (barra con `escaneo`, 10 pantallas)
   - `ALTO_CONTROL_ESCANEO`: `h-11` → `h-8 max-md:h-11` (campo y «Filtros»).
   - Cámara: `size-11 shrink-0` → `shrink-0 max-md:size-11` sobre `size="icon"` (32 × 32; 44 en el móvil).
   - «Limpiar todo»: `shrink-0 h-11` → `shrink-0 max-md:h-11` sobre `size="sm"`: **28 px en escritorio, que es
     lo que tiene prod** (el brief decía 32; manda la regla «clases EXACTAS de prod»). Fuera del test de
     alineación porque solo aparece con algo escrito.
   - Texto de ayuda y tooltip de SLT-200: sin cambio.
2. PWA del mensajero en escritorio (constantes nuevas en `components/shared/texto-entero.ts`:
   `BOTON_TACTIL_MOVIL` = lo que medía `touch`, con `max-md:`; `ICONO_TACTIL_MOVIL` = `max-md:size-11`):
   - `GestionarOrdenCardButton`, `MarcarLuegoToggle`, `RecuperarAyudaButton`, «Conversación»: `touch` → `sm` (prod).
   - «Mostrar mapa»: `touch` → `xs` (prod). `ConfirmarGestionDialog`: `touch` → por defecto, `gap-3` → `gap-2 max-md:gap-3` (prod).
   - Sin par en prod → tamaño por defecto (32): «Volver a la lista», «Ver más» de `AvisoRutaLinea`, «Navegar» y asa
     de `HojaParadaMapa` (`h-11` → `h-8 max-md:h-11`), «Cerrar»/«Centrar»/«Ver mapa completo»/«Ocultar mapa» de
     `RutaMapaInner`, campo y «Confirmar guía» de `VerificarGuiaGate`.
   - `min-h-11` → `max-md:min-h-11`: pestañas de `RecogerModule`, filas de `PosOrderCardDetalle` (`:210`, `:257`).
   - `EscanerModal`: disparador `tactil` `touch w-full` → por defecto + `BOTON_TACTIL_MOVIL max-md:w-full`;
     «Cerrar» `icon-touch` → `icon-sm` (el de `DialogContent` de prod) + `max-md:size-11`.
3. `PosOrderCardMosaico` «Ver detalle completo»: `min-h-11` → `max-md:min-h-11` (arregla `/novedades`).
4. `RepartoModule`: `gap-6` (dev) → `gap-8` (prod); se quita «El mapa se centra en la orden del carrusel.» (el mapa sigue al carrusel, R542).
5. Un solo «Recibir paquete» en `/ordenes`, `/recepcion-satelite/por-recibir` y `/en-bodega`:
   - `RecibirPaquetesEntrada` es el único disparador; su texto pasa a «Recibir paquete» (`RECIBIR_PAQUETE`); el
     diálogo y la página siguen llamándose «Recibir paquetes». Con puntero fino, enlace a la página; con táctil,
     diálogo continuo. En `/ordenes` va a la izquierda (sitio de prod) y la carga masiva sigue a la derecha.
   - **Verificado que la continua cubre la suelta:** misma acción (`recibirPorQr`, `recibirEnBodegaCentralPorQr`,
     `recibirEnOrigenPorQr`), mismos motivos (`desenlace*`), campo para teclear/pistola, «Recibir» manual y cámara;
     el código inválido lo corta la sesión (`EscaneoContinuo.test.tsx` R584). Diferencias: sin toast por lectura
     (R590) y el listado se relee una vez al cerrar (R592), no tras cada guía. Por eso se **quitó** la suelta:
     `RecepcionSateliteSuelta`, `RecepcionBodegaCentralSuelta`, `RecepcionOrigenSuelta` y sus pruebas.
   - `modo` de los tres receptores: `Exclude<ModoRecepcion, "suelta">`. El literal `"suelta"` sigue en
     `lib/utils/sesion-escaneo.ts` (fuera de mi capa; queda sin uso, anotado).
   - Consecuencia: el HTML del servidor ya no trae disparador de recibir (aparece al hidratar; review B1 de SLT-159).

No tocado (no está en la lista): `RecepcionContinuaPagina` y «Reintentar» de `EscaneoContinuo` (`touch`, SLT-159 R610),
`PasoModulos` (heredado de prod), `RecoleccionModule` `gap-6`.

## Cambio de comportamiento (m1, para el PR)
- En escritorio (puntero fino), «Recibir paquete» ya no abre un diálogo encima del listado: navega a la página
  «Recibir paquetes» (`/ordenes/recibir`, `/recepcion-satelite/recibir?desde=…`). En táctil abre el diálogo continuo.
- La guía suelta desaparece: no hay toast por lectura (R590); cada lectura queda como fila con su desenlace y su
  motivo, y el listado se relee una vez, al terminar o cerrar (R592).
- La central sigue viendo el destino de una devolución recibida: la fila dice «Queda por devolver a la tienda.» (B1).
- m2: `RecibirPaquetesEntrada` no se pinta en el HTML del servidor (puntero desconocido hasta hidratar, review B1
  de SLT-159); en prod el disparador sí venía del servidor. Hay un salto pequeño de la fila al hidratar; está
  fijado como intencionado en `EscanerRecepcion.test.tsx > HTML del servidor`.
- No toca dinero, permisos ni auth: los permisos de las páginas continuas son los mismos (review §2).

## Review (RECHAZADA, 5f4d6eec) → arreglos
- B1 (opción a): `desenlaceBodegaCentral` lleva `result.estado` al desenlace: con `por_devolver_a_tienda`, `aviso`
  «Queda por devolver a la tienda.»; `EstadoFila`/`DesenlaceRecepcion` ganan `aviso?` (`lib/utils/sesion-escaneo.ts`)
  y `EscaneoContinuo` lo pinta bajo «Recibida» (lista y tabla).
- B2: `tests/unit/components/desenlace-recepcion.test.ts`, un `it.each` por receptor con todos sus `status` y los
  textos de prod escritos a mano.
- B3: línea `tamano-pr-aceptado` en la ficha (ec876a14); `tamano-pr` pasa a aviso.
- m3: `ModoRecepcion` = `"continua" | "pagina"` (fuera `"suelta"`); comentarios viejos de `EscanerModal`,
  `OrdenesListado` y los tres receptores, al día. m6: texto de la ficha corregido (`gap-8`, como prod).

Mutaciones (en dcb4c36e, restauradas con `git checkout --`): quitar el `aviso` del `ok` y cruzar `forbidden` ↔
`unauthenticated` en `desenlaceSatelite`:
```
      Tests  4 failed | 29 passed (33)
VEXIT=1
 FAIL  EscanerRecepcionBodegaCentral.test.tsx > … > B1: el ok de una devolución pinta «Queda por devolver a la tienda.» …
 FAIL  desenlace-recepcion.test.ts > desenlaceBodegaCentral > B1 · ok de una devolución …
 FAIL  desenlace-recepcion.test.ts > desenlaceSatelite > forbidden
 FAIL  desenlace-recepcion.test.ts > desenlaceSatelite > unauthenticated
```
Sin mutar: 9 archivos (desenlace, los tres receptores, `EscaneoContinuo`, `sesion-escaneo`, `RecepcionContinuaPagina`,
página `/ordenes/recibir`, `OrdenesPage`) → `113 passed`, VEXIT=0.

## Enmiendas (decisión de Carlos del 2026-11-18, citada en cada test)
SLT-156 design §4, SLT-160 R600/R771/DC2, SLT-193 R910/R925/R929: 44 px solo en el móvil. SLT-159 R594/R611: una
sola entrada (la continua). Guardias: `lectura-guia-unica` (las 3 recepciones delegan en la sesión continua) y
`escaner-un-solo-cierre` (montajes 7 → 5: Órdenes y satélite ya no montan `EscanerModal`).

## Mapa R → test
- Barra 32 px alineada a 1280 / 44 px a 360 / un solo «Recibir paquete»: `e2e/escritorio-igual-a-prod.spec.ts` (verde, ver E2E).
- R771/R600 clases: `tests/unit/components/buscador-filtros-escaneo.test.tsx`, `WalletCajaBarra467`, `EstadoCuentaBarra467`.
- PWA: `tests/components/escritorio-igual-a-prod.test.tsx` (constantes, «Gestionar» y confirmación), `RepartoMovil`,
  `RepartoModoFoco`, `RecogerModule`, `RecoleccionModule`, `EscanerGuiaReparto`, `RecogerPaqueteCard`, `EscanerModal`.
- Mosaico (R910): `botones-44-pwa-mensajero.test.tsx`. Reparto gap y texto: `RepartoMapa.test.tsx`.
- Un solo disparador: `EscanerRecepcion.test.tsx`, `RecibirPaquetesEntrada.test.tsx`, `OrdenesPage.test.tsx`,
  `PorRecibirModule.test.tsx`, `RecepcionSateliteModule.test.tsx`; E2E `recepcion-satelite.spec.ts` y
  `recibir-paquetes.spec.ts` ajustados (verdes).

## Salida real
ROJO (tests nuevos y ajustados contra el código de antes; fuentes en `git stash`, base `servi_slt202_desechable`):
```
 Test Files  18 failed | 6 passed (24)
      Tests  42 failed | 430 passed (472)
VEXIT=1
```
(Fallan por archivo: buscador-filtros-escaneo 4, escritorio-igual-a-prod 4, EscanerRecepcion 4, RecibirPaquetesEntrada 4,
OrdenesPage 5, RepartoMovil 2, EscanerGuiaReparto 2, EscanerModal 2, RecoleccionModule 2, PorRecibirModule 2 y 1 en
cada uno de los otros ocho.)

VERDE (mismo set + 3 vecinos, con el arreglo):
```
 Test Files  24 passed (24)
      Tests  472 passed (472)
VEXIT=0
```
`vitest related` de las 20 fuentes (antes de ajustar los últimos tests): 17 rojos, todos ajustados después y verdes arriba.
`pnpm run typecheck`: exit 0. `eslint` de los archivos tocados: exit 0, sin avisos.
`pnpm run test:guardias`: 5 rojos ajenos (`dependencias-declaradas-presentes`, 4, que buscan marcadores de `init.sh`;
`otp-debug-solo-en-pruebas`, timeout); ninguno toca este diff.

Gate rápido:
```
✗ SLT-202: el PR de esta feature pasa del tamano maximo (62/40 archivos, 877/1000 lineas de produccion, 2126/3000 de tests)
INIT_EXIT=1
```
Desglose: SLT-202 sola = 46 archivos, 584 líneas de producción, 1473 de tests (≈1000 son borrado de las pruebas de la
guía suelta). Lo traído de SLT-200 (merge `d016b9c9`, aún no en dev) = 25 archivos, 295 / 651; 9 archivos en común.

## E2E (base `servi_slt202_desechable` sembrada, `next build` BEXIT=0, `E2E_PUERTO=3044`)
`pnpm exec playwright test --project=reparto` (incluye los tres specs de la ficha):
```
  x  37 [reparto] › e2e\pwa-mensajero-reparto.spec.ts:130:9 › SLT-163 — Reparto en el móvil › (a) ... (0ms)
    Error: worker process exited unexpectedly (code=3221226505, signal=null)
  1 failed
  50 passed (2.9m)
```
- `escritorio-igual-a-prod.spec.ts`: 3/3 ok (1280 px a 32 px y alineada; 360 px a 44; un solo «Recibir paquete»).
- `recepcion-satelite.spec.ts` 1/1 ok; `recibir-paquetes.spec.ts` 2/2 ok.
- El único rojo es la caída del proceso worker de Windows (0xC0000409) a los 0 ms, antes de que el test arrancara.
  Volví a correr solo ese spec: `pnpm exec playwright test e2e/pwa-mensajero-reparto.spec.ts` → `5 passed (28.1s)`, EEXIT=0.

## Tras la review (dcb4c36e + docs)
- Gate rápido: `INIT_EXIT=0` (`tamano-pr` en aviso, aceptado por Carlos).
- `next build` BEXIT=0. E2E de recepción: `escritorio-igual-a-prod`, `recepcion-satelite`, `recibir-paquetes` y
  `retiro-satelite-central` → `9 passed (23.0s)`, EEXIT=0.

## Veredicto
Implementado, con los arreglos de la review. Verde en vitest, typecheck, lint y el proyecto E2E `reparto` (el único rojo fue la caída del worker, verde al repetir); `tamano-pr` aceptado por Carlos; gate rápido en verde.
