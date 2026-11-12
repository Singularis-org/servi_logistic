# SLT-103 «Diálogos del módulo de cierres y trato tú» — requirements (rebanada 1)

> Ruta: completa (`complexity: high`). Zona de la ficha: **fullstack**; esta rebanada solo toca
> pantalla y tests. Escrito por spec_author el 2026-11-11 sobre el árbol del worktree
> `SLT-103-dialogos-trato-tu` (rama de `dev` tras SLT-127, `edfeedc1`).
>
> **Rebanada S5** del rediseño de cierres. Los R53-R57 son **copia tal cual** del madre
> `specs/SLT-95-detalle-cierre-rediseno/requirements.md > F. Diálogos` (v2, aprobado por Carlos el
> 2026-11-09), con su número. Los R137-R146 se escribieron aquí para fijar lo que el madre dejó abierto.
> Canvas: `specs/SLT-95-detalle-cierre-rediseno/canvas/project/Dialogos.dc.html`. Patrón: las hermanas
> SLT-102 «Cola de cierres única: mensajeros (central y satélite)», SLT-104 «Detalle de cierre de
> bodega en el detalle único (central)» y SLT-127 «Cola de bodega de la central con la cola única».
>
> **Partida en tres (PA1 = A, Carlos, 2026-11-11).** La ficha entera no cabía en un PR (~51 archivos,
> ~1 250 líneas). SLT-103 se queda con la **rebanada 1, «Diálogos»**: R53, R54, R55, R57 y
> R137-R141. Los demás R van a las fichas nuevas (`## Fuera de alcance`):
> - SLT-133 «Mensajes del servidor de cierres en tú y con tildes» (rebanada 2);
> - SLT-134 «Textos de pantalla de cierres en tú, con guardia» (rebanada 3; depende de SLT-103 y de
>   SLT-133).
>
> `## Definiciones` y `## Anexo A` se quedan aquí porque SLT-133 y SLT-134 los citan.

## Lo que ya existe

Buscado en el board (`feature_list.json`, todos los estados): «trato», «voseo», «diálogo»,
«evidencia», «sin saldo». En `specs/`: «voseo», «VisorEvidencia», «mensajeSinSaldo». En el código
(Grep/Read: el índice del grafo de este worktree no existe): `Modal`, `VisorEvidencia`,
`BotonesEvidencia`, `mensajeSinSaldo`, `onVerEvidencia`, `MSG_`.

- **Board:** ninguna otra ficha hace esto. SLT-102, SLT-104, SLT-105 «Cola de bodega de la central:
  Por conciliar y Conciliados» y SLT-127 dejaron escrito que su voseo pendiente va a esta ficha; tras
  el corte va a SLT-133 y SLT-134.
- **Código que se reutiliza:** `components/shared/Modal.tsx` (todos los diálogos del módulo ya lo
  montan); la prop `mensajeSinSaldo` de `RegistrarPagoDialog` (existe, `RegistrarPagoMensajeroDialog`
  no la pasa); `BotonesEvidencia` (se reduce a un botón).
- **Código que se sustituye:** hay **tres** visores de evidencia iguales, no dos:
  `VisorEvidencia` de `cierre-detalle-shared.tsx` (lo usa `CierresBodegaAdminModule`), y dos `Modal`
  en línea en `CierresAdminModule.tsx` y `CierreDiaModule.tsx`.

## Alcance (rebanada 1)

- Un solo visor de evidencia para `/cierres-admin` › Mensajero, `/cierres-admin` › Bodega y
  `/cierre-dia`, con «Anterior», «Siguiente» y «foto i de n»; un solo botón «Ver evidencia (n)» por
  gestión en lugar de uno por foto.
- El resumen Gestiones / Recaudado / Tu ganancia en el diálogo «Solicitar cierre del día».
- El aviso de «sin saldo» del pago al mensajero, sin hablar de una tienda.
- Los textos que esta rebanada **crea** nacen en «tú». Los que ya existen y tienen voseo no se tocan
  aquí (van a SLT-133 y SLT-134).
- Se adaptan los tests que afirman el visor o los botones de hoy.

## Lo que NO entra

- Cambiar cómo se calcula, congela o asienta un importe; estados, permisos, esquema o migraciones (D5).
- Pasar a «tú» los textos con voseo de hoy (`## Inventario`): SLT-133 (servidor) y SLT-134 (pantalla).
- La guardia de trato: SLT-134.
- Rediseñar diálogos o reescribir sus textos según el canvas.
- Retirar `BotonesEvidencia` o `cierre-factura.tsx`: SLT-115 «Retirar los componentes de cierre
  sustituidos».
- Tocar `components/shared/Modal.tsx` (PA4).

## Fuera de alcance (van a otras fichas; texto copiado tal cual)

- **R56** [S5] → **SLT-133** (mensajes del servidor) y **SLT-134** (pantalla) — Todos los textos del
  módulo (pantallas, diálogos, toasts, avisos y mensajes del servidor que el módulo muestra) DEBEN usar
  el trato «tú» y llevar sus tildes. Ningún texto del módulo DEBE contener voseo («Indicá», «tenés»,
  «podés», «resolvé»…).
- **R142** → **SLT-134** — SI un texto del módulo (`## Definiciones`) contiene una forma de voseo o de
  «usted», ENTONCES la guardia `tests/unit/guards/cierres-trato-tu.guardia.test.ts` DEBE fallar y
  nombrar el archivo, la línea y la forma encontrada. SI la forma está solo en un comentario o en un
  especificador de `import`, ENTONCES NO DEBE fallar.
- **R143** → **SLT-134** — La guardia NO DEBE marcar como voseo ni como «usted»: las formas de «tú»
  (`puedes`, `tienes`, `estás`, `estés`, `enviarás`, `deberás`, `inténtalo`, `escríbele`,
  `gestiónalos`, `revisa`, `indica`, `elige`, `vuelve`), los futuros (`será`, `podrá`, `verá`,
  `quedará`, `enviará`), los subjuntivos de tercera persona en mitad de frase (`revise`, `apruebe`,
  `vuelva`) ni estas palabras: `está`, `aquí`, `allí`, `ahí`, `así`, `acá`, `allá`, `qué`, `sí`, `más`,
  `jamás`, `además`, `demás`, `atrás`, `detrás`, `después`, `través`, `inglés`, `interés`, `país`,
  `caché`. Cada excepción nueva DEBE llevar su motivo, y la lista de excepciones NO DEBE pasar de 40.
- **R144** → **SLT-133** (filas L1-N1) y **SLT-134** (filas A1-K4) — Cada texto del `## Inventario`
  DEBE quedar exactamente como dice `## Anexo A`: la misma frase, cambiando solo la forma verbal o el
  pronombre a «tú» y añadiendo las tildes que faltan.
- **R145** → **SLT-134** — La guardia DEBE tener control positivo y contraprueba: DEBE comprobar que
  su censo incluye al menos `CierreDiaModule.tsx`, `CierresAdminModule.tsx`, `conciliacion-labels.ts` y
  `CierreDiaService.ts`, y que mira más de 60 archivos; y DEBE ponerse en rojo con un texto de muestra
  que contenga cada forma de las tres listas de voseo y de la de «usted».
- **R146** → **SLT-133** y **SLT-134** — Los cambios de esta ficha NO DEBEN cambiar ningún importe,
  estado, permiso, clave de traducción ni contrato de servicio: solo textos, el visor y el resumen de
  R140.
- **R141, segunda frase** («CUANDO un mensaje del servidor de `## Anexo A` cambia de texto…»): R141
  se queda en SLT-103, pero esa frase solo tiene objeto donde cambian mensajes del servidor; su test va
  en **SLT-133**. En SLT-103 ningún mensaje del servidor cambia.
- **Límites de la guardia** para el spec de **SLT-134** (PA6 y PA7, aceptadas): la guardia no busca
  tildes que faltan (un léxico sin tilde chocaría con claves y valores de enum); no mira el «su/sus» de
  usted (no se distingue de la tercera persona).

## Decisiones cerradas (no reabrir)

| # | Fecha · quién | Decisión |
|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D6 (regla 7) | canvas n2 (v2) | Un solo trato en todo el módulo: «tú». |
| D15 | 2026-11-09 · Carlos | Mismo flujo = UN componente con props; nunca uno por rol. |
| D17 | 2026-11-09 · Carlos | `Modal` existente para los diálogos; no se crea otra caja. |
| D18 | 2026-11-09 · Carlos | Canvas aprobado (versión 33) con sus notas. |
| PA1 | 2026-11-11 · Carlos | Opción A: tres fichas. SLT-103 = R53-R55, R57, R137-R141; SLT-133 = servidor; SLT-134 = pantalla y guardia. |
| PA2 | 2026-11-11 · Carlos | Texto de sin saldo: «Este mensajero no tiene ganancia pendiente de pago en este cierre, así que no hay nada que pagar.» Se valida en Preview. |
| PA3 | 2026-11-11 · Carlos | Con una foto: «Ver evidencia» como hoy y visor sin «Anterior», «Siguiente» ni «foto 1 de 1». |
| PA4 | 2026-11-11 · Carlos | «Anterior» y «Siguiente» van en el cuerpo, bajo la foto. Sin prop nueva en `Modal`. |
| PA5 | 2026-11-11 · Carlos / spec_author | Si `MSG_CATALOGO` llega a la pantalla va en SLT-133; si no, no se toca. **Comprobado: llega** (`## Inventario`); va en SLT-133 como fila L10 del Anexo A. |
| PA6, PA7 | 2026-11-11 · Carlos | Aceptadas como límites de la guardia (spec de SLT-134). |
| PA8 | 2026-11-11 · Carlos | Los compartidos con `/wallet/*` entran en el censo de la guardia (SLT-134). |

Cobertura de las decisiones en SLT-103:

| Decisión | Requisitos |
|---|---|
| D5 | R140 (el resumen no calcula importes en el cliente) |
| D6 | R137, R139, R141 (los textos que crea esta rebanada están en «tú») |
| D15 | R54, R137 (un visor para las tres pantallas) |
| D17 | R53, R137 (el visor es un `Modal`) |
| D18 | R54, R137 y R139 (canvas l.183-184); R55 y R140 (canvas l.200-202) |
| PA1 | este archivo: R de la ficha y `## Fuera de alcance` |
| PA2 | R57, R141 |
| PA3 | R138 |
| PA4 | R139 (en el cuerpo); R53 se cumple con «Cerrar» al pie (R137) |
| PA5 | `## Anexo A`, fila L10 (SLT-133) |
| PA6, PA7, PA8 | `## Fuera de alcance` y `## Definiciones` (SLT-134) |

## Definiciones

(Las usan SLT-133 y SLT-134; esta rebanada no las aplica.)

- **Módulo de cierres (el censo):** los `.ts`/`.tsx` (sin `.d.ts`) de
  - `app/(app)/cierres-admin/**`, `app/(app)/cierre-dia/**`, `app/(app)/wallet/satelites/**`;
  - `components/private/cierres/**`, `components/shared/conciliacion/**`,
    `components/shared/liquidacion/**`;
  - `components/shared/DesglosePagoField.tsx` y `components/shared/EscanerGuiaCard.tsx` (se montan
    dentro de los diálogos del módulo);
  - `lib/constants/bloqueo-mensajero.ts`;
  - `lib/services/CierreDiaService.ts`, `CierreBodegaService.ts` (el «ConsolidacionBodegaService»
    del madre), `CierresAdminService.ts`, `CierresBodegaAdminService.ts`,
    `ConciliacionSatelitesService.ts`, `LiquidacionService.ts`;
  - `lib/actions/cierre-dia.ts`, `cierre-bodega.ts`, `cierres-admin.ts`, `conciliacion-satelites.ts`,
    `liquidacion.ts`.
  Los compartidos con `/wallet/*` se quedan dentro (PA8).
- **Texto del módulo:** el contenido de un literal de cadena, de una plantilla (cada tramo fijo) o de
  un texto JSX de un archivo del censo. **No** cuentan: los comentarios, los nombres de identificador y
  los especificadores de `import`/`export` (`"@/lib/auth/resolve-actor"` no es un texto).
- **Palabra:** secuencia máxima de letras Unicode (`\p{L}`) dentro de un texto. Se compara en
  minúsculas.
- **Forma de voseo:** una palabra que cumple una de estas tres reglas y no está en la lista de
  excepciones (R143):
  1. **presente de vos**, de una lista cerrada: `tenés`, `podés`, `querés`, `sabés`, `debés`, `hacés`,
     `ponés`, `creés`, `leés`, `venís`, `decís`, `salís`, `pedís`, `seguís`, `elegís`, `preferís`,
     `recibís`, `escribís`, `sos`, `vos`; y sus variantes sin tilde que no coinciden con una forma de
     «tú»: `tenes`, `podes`, `queres`, `decis`, `venis`, `elegis`, `preferis`, `seguis`, `pedis`;
  2. **terminación aguda de vos:** dos o más letras seguidas de `á`, `é` o `í` al final
     (`indicá`, `volvé`, `escribí`) o de `ás`, `és`, `ís` (`necesitás`), **salvo** las que acaban en
     `rá`, `ré`, `rás` o `rés` (futuros: `será`, `podrá`, `enviarás`, `deberás`), que solo cuentan si
     están en la lista cerrada de imperativos en `r` (`esperá`, `mirá`, `borrá`, `cerrá`,
     `registrá`, `compará`, `declará`, `separá`, `prepará`, `generá`, `recuperá`, `considerá`);
  3. **imperativo de vos con pronombre, sin tilde**, de una lista cerrada: `escribile`,
     `escribiles`, `escribime`, `avisale`, `avisales`, `avisame`, `decile`, `decime`, `fijate`,
     `acordate`, `asegurate`, `gestionalos`, `gestionala`, `gestionalo`, `contactalo`, `contactala`,
     `intentalo`, `revisalo`, `confirmalo`, `hacelo`, `llamalo`, `mandale`, `pedile`, `resolve`,
     `resolvelo`.
- **Forma de «usted»:** las palabras `usted` y `ustedes`; los imperativos de usted con pronombre de
  una lista cerrada (`asegúrese`, `comuníquese`, `fíjese`, `diríjase`, `acérquese`, `inténtelo`,
  `revíselo`, `contáctelo`, `avísele`, `escríbale`, `hágalo`, `pídale`); y los imperativos de usted de
  una lista cerrada (`ingrese`, `seleccione`, `intente`, `verifique`, `revise`, `confirme`, `escriba`,
  `contacte`, `elija`, `vuelva`, `espere`, `indique`, `escanee`, `recargue`, `pulse`, `haga`,
  `solicite`, `avise`, `descargue`, `registre`) **solo cuando abren una frase**: primera palabra del
  texto o tras `.`, `:`, `!`, `?`, `¿` o `¡`. En mitad de la frase son subjuntivo de tercera persona y
  no cuentan («lo verá quien revise el comprobante»). El posesivo «su» no se mira (PA7).

## Inventario (2026-11-11)

Medido con Grep sobre el censo, leyendo cada coincidencia para separar texto de comentario. **Voseo:
54 textos en 14 archivos. «Usted»: 0.** Además, 6 mensajes del servidor sin voseo pero sin tildes.

| Archivo | Voseo | Formas | Ficha |
|---|---|---|---|
| `app/(app)/cierres-admin/_components/CierresAdminModule.tsx` | 14 | Indicá ×2, Revisá, Escribí, tenés ×3, contactá, Intentá ×4, Iniciá ×3 | SLT-134 |
| `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx` | 6 | tené, confirmá, Escaneá ×3, escribí ×3, Avisá, rechazá ×2 | SLT-134 |
| `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx` | 4 | tenés ×2, contactá, Iniciá, Intentá | SLT-134 |
| `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx` | 3 | tenés, Iniciá, Intentá | SLT-134 |
| `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx` | 4 | Vaciá ×2, Elegí ×2, Ampliá, volvé ×2 | SLT-134 |
| `app/(app)/cierres-admin/_components/pago-mensajero-labels.ts` | 2 | podés, Revisá, intentá | SLT-134 |
| `app/(app)/cierres-admin/error.tsx` | 2 | mirá, Volvé, revisá | SLT-134 |
| `app/(app)/cierres-admin/_components/cierre-labels.ts` | 1 | vos | SLT-134 |
| `app/(app)/cierres-admin/_components/FiltrosCierresBarra.tsx` | 1 | Usá | SLT-134 |
| `app/(app)/cierre-dia/_components/CierreDiaModule.tsx` | 5 | podés, Intentá ×2, Escribile, tenés | SLT-134 |
| `components/shared/conciliacion/conciliacion-labels.ts` | 5 | Escribí ×2, tenés, Iniciá, Intentá | SLT-134 |
| `lib/services/CierreDiaService.ts` | 4 (+6 sin tildes) | Tenés, gestionalos, tenes ×2, Escribile | SLT-133 |
| `lib/services/CierreBodegaService.ts` | 2 | resolve, tenes | SLT-133 |
| `lib/services/CierresAdminService.ts` | 1 | Avisá | SLT-133 |

**PA5, comprobado en el código.** `MSG_CATALOGO` («catalogo de estados incompleto (seed pendiente)»,
`CierreDiaService.ts` l.115) **sí llega a la pantalla**: `deshacerGestion` lo devuelve como
`validation_error` con `fieldErrors.estatus` (l.930) cuando falta el estado `en_reparto` en el
catálogo; la Server Action lo pasa tal cual (`lib/actions/cierre-dia.ts` l.276) y `CierreDiaModule`
lo pinta en un toast con `mensajeError` (l.696, l.1123: primer `fieldErrors`). Es el sexto mensaje sin
tildes; va en SLT-133 (fila L10).

Sin voseo ni «usted»: `app/(app)/wallet/satelites/**`, `components/private/cierres/**`,
`components/shared/liquidacion/**`, `DesglosePagoField`, `EscanerGuiaCard`, `bloqueo-mensajero.ts`,
`CierresBodegaAdminService`, `ConciliacionSatelitesService`, `LiquidacionService` y las Server
Actions. Hay voseo en **comentarios** (`CierreDiaModule.tsx` l.336 «podes», l.675 «releé»;
`error.tsx` l.10 y l.21; `DescargarGestionesDialog.tsx` l.141): no cuentan.

Tests que afirman hoy un texto de la tabla (los actualizan SLT-133 y SLT-134): 21 archivos —
`tests/components/`: `CierreDiaModule`, `CierreDiaComprobanteMarcasDeOrigen`,
`CierreDiaModule477Correccion`, `CierresBodegaAdminDetalleUnico`, `ComprobanteMensajeroOrigenRechazo`,
`CierresAdminPage`, `CierresAdminDeepLink`, `ConciliacionAccionesConAsientos`, `CierresAdminModule`,
`CierresAdminConfirmacionFisica`, `descarga/DescargarGestionesDialog`, `MarcarRecibidoDeclaradoCero`,
`PagoMensajeroAcciones`, `RedDeErrores`; `tests/unit/services/`: `cierre-dia-service`,
`cierre-dia-477-resolicitud`, `cierre-dia-477-deshacer`, `cierres-admin-confirmacion-fisica`;
`tests/integration/db/`: `477-deshacer-cierre-rechazado-sql-real`, `cierre-rechazo-tienda-totales`,
`tarifas-valor-propio-caminos`. Ningún E2E afirma un texto del inventario.

## Requisitos (EARS)

Los R ≤ 78 son copia del madre, mismo número y mismo sentido. R137-R141 son de esta ficha. El test
previsto de cada R está en `tasks.md > Trazabilidad`.

### Diálogos (copia del madre)

- **R53** [S5] — Todo diálogo del módulo DEBE montarse sobre el `Modal` existente, con título,
  descripción, cuerpo y los botones al pie. Los diálogos son: rechazar, confirmar paquetes,
  indemnizar, destrabar, ajustar pago, registrar pago, anular pago, corregir métodos, corregir el
  resultado, evidencia, solicitar cierre de bodega, marcar recibido, corregir recibido, desmarcar,
  solicitar cierre del día, enviar cierre vencido, enviar cierre rechazado y devolver a gestión.

  *Hoy los 18 ya montan `Modal`; esta ficha lo deja vigilado. En el visor, «Anterior» y «Siguiente»
  navegan dentro del cuerpo (PA4) y la acción del diálogo, «Cerrar», va al pie.*
- **R54** [S5] — El visor de evidencia DEBE ser un solo diálogo con «Anterior», «Siguiente» y
  «foto i de n» en la descripción. La fila DEBE ofrecer un solo botón «Ver evidencia (n)» (o «Ver
  evidencia» con una foto) en lugar de un botón por foto.
- **R55** [S5] — El diálogo «Solicitar cierre del día» DEBE mostrar el resumen Gestiones, Recaudado
  y Tu ganancia, con las cifras de la página.
- **R57** [S5] — SI se intenta registrar un pago a un mensajero sin saldo, ENTONCES el diálogo DEBE
  decir que el mensajero no tiene ganancia pendiente, sin mencionar una tienda.

### Visor de evidencia

- **R137** — `/cierres-admin` › Mensajero, `/cierres-admin` › Bodega y `/cierre-dia` DEBEN abrir la
  evidencia con el MISMO visor. El visor DEBE tener el título «Evidencia de la gestión», la imagen con
  el texto alternativo «Evidencia fotográfica de la gestión» (la URL firmada que da el servidor, nunca
  una ruta de almacenamiento) y «Cerrar» al pie como acción principal. CUANDO se pulsa «Cerrar», Escape
  o fuera del visor, el visor DEBE cerrarse.
- **R138** — SI la gestión tiene una sola foto, ENTONCES el botón DEBE decir «Ver evidencia» y
  conservar su nombre accesible de hoy («Ver evidencia de la orden <remisión> · <destinatario>» donde
  hoy lo lleva), y el visor NO DEBE mostrar «Anterior», «Siguiente» ni «foto 1 de 1». SI tiene n > 1
  fotos, ENTONCES el botón DEBE decir «Ver evidencia (n)», con nombre accesible «Ver evidencia (n) de
  la orden <remisión> · <destinatario>» donde hoy lleva sufijo; SI no tiene fotos, ENTONCES NO DEBE
  haber botón.
- **R139** — CUANDO se abre el visor de una gestión con n > 1 fotos, el visor DEBE mostrar la foto 1
  con la descripción «<contexto> · foto 1 de n» (o «Foto 1 de n» sin contexto) y, en el cuerpo, bajo la
  foto, los botones «Anterior» y «Siguiente» (PA4). CUANDO se pulsa «Siguiente», el visor DEBE mostrar
  la foto siguiente en el orden del servidor y actualizar «foto i de n»; CUANDO se pulsa «Anterior», la
  anterior. MIENTRAS se muestra la foto 1, «Anterior» DEBE estar deshabilitado; MIENTRAS se muestra la
  foto n, «Siguiente» DEBE estar deshabilitado. CUANDO se vuelve a abrir, DEBE empezar en la foto 1.
  El contexto es «Orden <remisión> · <destinatario>» de la gestión.

### Resumen al solicitar el cierre del día

- **R140** — El resumen de R55 DEBE tener tres líneas, en este orden: «Gestiones» con el número de
  gestiones que la página lista en sus secciones por resultado; «Recaudado» con el «Total general» de
  «Totales del día»; «Tu ganancia» con el «Total de ganancia» de la sección «Ganancia». Los importes
  DEBEN tener el mismo formato que en la página y NO DEBEN calcularse en el cliente: son los valores
  que la página ya recibe del servidor.

### Pago al mensajero sin saldo

- **R141** — CUANDO el registro de un pago al mensajero responde `sin_saldo`, el diálogo DEBE mostrar
  «Este mensajero no tiene ganancia pendiente de pago en este cierre, así que no hay nada que pagar.»
  (texto a validar en Preview, PA2) y NO DEBE contener la palabra «tienda». CUANDO un mensaje del
  servidor de `## Anexo A` cambia de texto, su `status` y el campo donde viaja (`motivo`,
  `fieldErrors`, `message`) NO DEBEN cambiar.

  *La segunda frase se prueba en SLT-133 (`## Fuera de alcance`).*

## Anexo A — textos nuevos (contrato de R144; lo aplican SLT-133 y SLT-134)

`·` separa las ocurrencias idénticas. «Inténtalo de nuevo» es la fórmula que el módulo ya usa en
«tú» (`cierre-labels.ts` l.863, `CorregirPagosDialog`, `CorregirResultadoDialog`).

| # | Archivo · línea de hoy | Texto nuevo |
|---|---|---|
| A1 | `CierresAdminModule.tsx` 353 | Este cierre trae paquetes dañados, perdidos o robados. Indica cuánto se indemniza por cada uno: al aprobar, la suma sale de la caja principal como un solo egreso. |
| A2 | `CierresAdminModule.tsx` 371 | El monto no puede superar ${tope} (10 dígitos y 2 decimales). Revisa si sobra un dígito. |
| A3 | `CierresAdminModule.tsx` 373 | Escribe un monto mayor que 0, con punto decimal y sin separador de miles (por ejemplo 12500.00). |
| A4 | `CierresAdminModule.tsx` 655 · `ConsolidacionBodegaModule.tsx` 309 | No tienes una zona asignada; contacta a tu administrador. |
| A5 | `CierresAdminModule.tsx` 714 · 756 | No se pudo abrir el detalle del cierre. Inténtalo de nuevo. |
| A6 | `CierresAdminModule.tsx` 753 · 836 · 1079 · `ConsolidacionBodegaModule.tsx` 292 · `CierresBodegaAdminModule.tsx` 333 · `conciliacion-labels.ts` 78 | Tu sesión expiró. Inicia sesión de nuevo. |
| A7 | `CierresAdminModule.tsx` 834 | No tienes permiso para resolver este cierre. |
| A8 | `CierresAdminModule.tsx` 838 | No se pudo resolver el cierre. Inténtalo de nuevo. |
| A9 | `CierresAdminModule.tsx` 1077 | No tienes permiso para destrabar este cierre. |
| A10 | `CierresAdminModule.tsx` 1081 | No se pudo destrabar el cierre. Inténtalo de nuevo. |
| A11 | `CierresAdminModule.tsx` 1466 | Indica el motivo del rechazo. El mensajero lo verá para corregir. |
| B1 | `cierre-confirmacion-fisica.tsx` 45 | Antes de aprobar, ten delante cada paquete que vuelve a bodega y confirma su guía: escanea el código o escribe el número. |
| B2 | `cierre-confirmacion-fisica.tsx` 51 | Escanea el código de la guía o escribe su número |
| B3 | `cierre-confirmacion-fisica.tsx` 69 | Sin número de guía: no se puede confirmar. Avisa a un administrador. |
| B4 | `cierre-confirmacion-fisica.tsx` 119 | No se pudo leer un número de guía en ese código. Escanea de nuevo o escribe el número. |
| B5 | `cierre-confirmacion-fisica.tsx` 138 | Falta 1 paquete por confirmar. Si no llegó, rechaza el cierre indicando cuál falta. |
| B6 | `cierre-confirmacion-fisica.tsx` 139 | Faltan ${faltan} paquetes por confirmar. Si alguno no llegó, rechaza el cierre indicando cuáles faltan. |
| C1 | `ConsolidacionBodegaModule.tsx` 290 | No tienes permiso para solicitar el cierre de bodega. |
| C2 | `ConsolidacionBodegaModule.tsx` 294 | No se pudo solicitar el cierre de bodega. Inténtalo de nuevo. |
| D1 | `CierresBodegaAdminModule.tsx` 329 | No tienes permiso para ver este cierre de bodega. |
| D2 | `CierresBodegaAdminModule.tsx` 337 | No se pudo abrir el detalle del cierre de bodega. Inténtalo de nuevo. |
| E1 | `DescargarGestionesDialog.tsx` 147 | Recorta por la fecha de solicitud del cierre. Vacías no recortan nada: se lleva todo el historial de los mensajeros elegidos. Vacía una fecha para quitar ese extremo, o «Limpiar» para quitar las dos. |
| E2 | `DescargarGestionesDialog.tsx` 167 | Elige al menos un mensajero para descargar sus gestiones. Sin mensajeros no hay archivo. |
| E3 | `DescargarGestionesDialog.tsx` 188 | No hay gestiones de cierre en el rango de fechas elegido para esos mensajeros. Amplía el rango o vacía las fechas y vuelve a intentarlo. |
| E4 | `DescargarGestionesDialog.tsx` 190 | Los mensajeros elegidos no tienen gestiones de cierre. Elige otros mensajeros y vuelve a intentarlo. |
| F1 | `pago-mensajero-labels.ts` 48 | El cierre quedó aprobado. El pago no se registró: puedes registrarlo después desde el detalle del cierre. |
| F2 | `pago-mensajero-labels.ts` 50 | No se registró el pago. Revisa el aviso del formulario e inténtalo de nuevo. |
| G1 | `error.tsx` 38 | Antes de repetir una aprobación, mira cómo quedó |
| G2 | `error.tsx` 39 | El fallo ocurrió al mostrar la pantalla, y eso también puede pasar justo después de guardar. Vuelve a cargar los cierres y revisa el estado del que estabas resolviendo antes de aprobarlo o rechazarlo otra vez. |
| H1 | `cierre-labels.ts` 171 | Esta gestión la registró la tienda desde «Ayuda solicitada», no tú: el motivo y la foto son suyos. Cuenta en tu cierre igual. |
| I1 | `FiltrosCierresBarra.tsx` 394 | Usa los filtros para acotar los cierres |
| J1 | `CierreDiaModule.tsx` 315 | No puedes deshacer esta gestión. |
| J2 | `CierreDiaModule.tsx` 316 | No se pudo deshacer la gestión. Inténtalo de nuevo. |
| J3 | `CierreDiaModule.tsx` 352 | Esta orden la resolvió la tienda desde su pantalla de ayuda; solo ella puede corregirlo. Escríbele por el chat de la orden. |
| J4 | `CierreDiaModule.tsx` 660 | No tienes permiso para solicitar el cierre. |
| J5 | `CierreDiaModule.tsx` 661 | No se pudo solicitar el cierre. Inténtalo de nuevo. |
| K1 | `conciliacion-labels.ts` 56 | Escribe un monto válido, mayor que cero y con dos decimales como máximo. |
| K2 | `conciliacion-labels.ts` 61 | Escribe un monto válido, de cero o más y con dos decimales como máximo. |
| K3 | `conciliacion-labels.ts` 77 | No tienes permiso para conciliar consolidaciones de bodega. |
| K4 | `conciliacion-labels.ts` 79 | No se pudo completar la operación. Inténtalo de nuevo. |
| L1 | `CierreDiaService.ts` `MSG_PENDIENTES` | Tienes paquetes en reparto que todavía no gestionaste; gestiónalos antes de cerrar. |
| L2 | `CierreDiaService.ts` `MSG_VACIO` | No tienes gestiones pendientes de cierre. |
| L3 | `CierreDiaService.ts` `MSG_SIN_ZONA` · `CierreBodegaService.ts` `MSG_SIN_ZONA` | No tienes una zona asignada; contacta a tu administrador. |
| L4 | `CierreDiaService.ts` `MSG_GESTION_DE_LA_TIENDA` | Esta orden la resolvió la tienda; solo ella puede corregirlo. Escríbele por el chat de la orden. |
| L5 | `CierreDiaService.ts` `MSG_DUPLICADO` (tildes) | Ese cierre ya se envió a aprobación; actualiza la página. |
| L6 | `CierreDiaService.ts` `MSG_YA_EN_CIERRE` (tildes) | Esta gestión ya está incluida en un cierre solicitado; no se puede deshacer. |
| L7 | `CierreDiaService.ts` `MSG_YA_DESHECHA` (tildes) | Esta gestión ya fue deshecha. |
| L8 | `CierreDiaService.ts` `MSG_NO_ES_LA_ULTIMA` (tildes) | Esta orden tiene una gestión más reciente; hay que deshacer esa primero. |
| L9 | `CierreDiaService.ts` `MSG_ORDEN_BORRADA` (tildes) | Esta orden fue eliminada; ya no se puede deshacer su gestión. |
| L10 | `CierreDiaService.ts` `MSG_CATALOGO` (tildes; PA5) | catálogo de estados incompleto (seed pendiente) |
| M1 | `CierreBodegaService.ts` `MSG_PENDIENTES` | Primero resuelve los cierres de tus mensajeros antes de cerrar la bodega. |
| N1 | `CierresAdminService.ts` 226 | Este paquete no tiene número de guía y no se puede confirmar. Avisa a un administrador. |

## Tamaño (rebanada 1)

~20 archivos (12 de producción, 8 de tests) y ~650 líneas: el 50 % de `gate.tamano_pr`. Detalle en
`tasks.md > Archivos esperados`.

## Preguntas abiertas

Ninguna. PA1-PA8 las respondió Carlos el 2026-11-11 (`## Decisiones cerradas`). PA2 (texto de sin
saldo) y R139 (los botones bajo la foto) se validan en Preview.
