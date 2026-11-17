# SLT-159 «Escaneo continuo en recepciones y recogidas» — design

**Rebanada (b) de DC7** (acotado el 2026-11-16): recepciones de bodega y tienda, página y diálogo
(R580-R594, R610-R613, R615). (a) está hecha por SLT-167 «Recepción: destinatario y tienda en la
respuesta»; (c) es SLT-168 «Escaneo continuo en las recogidas del mensajero», que reutiliza las
piezas de cliente de aquí.

## Lo que ya existe

Buscado el 2026-11-16 en `feature_list.json`, `specs/` y el código de este worktree (parte de `dev`
con SLT-167 y SLT-160 mergeadas). El grafo no se consultó: se leyó con Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
| --- | --- | --- |
| SLT-158 «Entrada de escaneo para pistola» (`done`) | `hooks/useEntradaEscaneo.ts` | Se **reutiliza**: cola en orden (`recibirLectura`, una a la vez), campo nunca `disabled`, limpieza, último error, marca, tono (`alTerminar`) y `usePunteroFino()` (`useSyncExternalStore`, en servidor = táctil). Gana **una** opción: `alLlegar` (ver Contratos). |
| SLT-157 «Guía única leída por cámara o pistola» | `leerGuia` | Decide «Código inválido» (R584). |
| SLT-167 «Recepción: destinatario y tienda en la respuesta» (`done`, PR #186) | `ResumenRecepcion { destinatario: string; tienda: string }` en `lib/interfaces/repositories/IOrdenRepository.ts:1362`; `resumen?: ResumenRecepcion` en `ok` y `ya_recibida` de `lib/types/recepcion-bodega-central.ts:30-34`, `recepcion-origen.ts:21-24`, `recepcion-satelite.ts:211-216` | Se **consume** tal cual. Es **opcional**: ausente → «—» en la fila (R581) y línea de estado sin « · {destinatario}» (R615). Ningún archivo de servidor en esta rebanada. |
| SLT-160 «Buscar escaneando en los listados» (`done`) | `EscanerModal` prop `soloIcono` (botón outline de solo icono); `QrScanner` prop `encendidaAlMontar` | `encendidaAlMontar` se reutiliza en la página: el botón compacto «Escanear con cámara» monta el visor ya encendido (patrón D4 de SLT-160). `soloIcono` no se usa aquí. |
| `EscanerModal` | `components/shared/EscanerModal.tsx` | **No cambia.** Monta y desmonta el contenido al abrir/cerrar; eso apaga la cámara y descarta la sesión (R591), y el desmontaje es el «al cerrar» de R592. Su slot `acciones` aloja «Recibir paquetes». |
| `QrScanner` con `disabled` | `QrScanner.tsx:165` | Con `disabled` pinta el botón en vez del visor: **desmontaría la cámara continua**. `EscanerGuiaCard` ya no se lo pasa (SLT-158); el modo continuo tampoco debe pasarlo. |
| Pestillo `entregado` | `QrScanner.tsx:99`, `:128-133` | Es lo que hoy cierra la cámara tras leer. En modo continuo se sustituye por el filtro «mismo texto en 3 s» (R589). |
| Línea `exito` / `ultimaRecibida` y línea de error de la tarjeta | `EscanerGuiaCard.tsx:248-263`; `EscanerRecepcionBodegaCentral.tsx:42` y equivalentes | En modo continuo la lista los sustituye (`lineaDeError={false}`, sin `exito`). En guía suelta, igual que hoy. |
| Barra de progreso, faltantes y aviso de C5 | `cierre-confirmacion-fisica.tsx:684` (`EscanerGuiaCard` sin `EscanerModal`) | Se queda tal cual; C5 solo gana `continuo` en su tarjeta (R588). |
| Traducción de cada respuesta a texto | `notificar` en las tres superficies (p. ej. `EscanerRecepcionBodegaCentral.tsx:54-92`) | Se parte en `desenlace(result)` puro (los motivos son los textos de hoy) + el toast, que solo queda en guía suelta. |
| Disparadores de hoy | `OrdenesListado.tsx:1405-1423` (`EscanerModal` con `acciones` = carga masiva); `EscanerRecepcion.tsx:117` (el `EscanerModal` vive dentro de la superficie satélite, montada por `PorRecibirModule.tsx:76` y `RecepcionSateliteModule.tsx:478`) | «Recibir paquetes» va en el `acciones` del mismo `EscanerModal`. En la satélite lo pone `EscanerRecepcion` (lee `usePathname()` para `desde`), así **`PorRecibirModule` y `RecepcionSateliteModule` no cambian**. |
| Gate de rol de página | `recepcion-satelite/por-recibir/page.tsx:27-32`; `AppPage` (`components/shared/AppPage.tsx`) | Se copia la forma. `AppPage` es el único envoltorio de página: la página continua lo usa. |
| SLT-168 «Escaneo continuo en las recogidas del mensajero» (`pending`) | `feature_list.json` | Consumirá `sesion-escaneo.ts`, `useSesionEscaneo`, `EscaneoContinuo` y `EscanerGuiaCard continuo`. Por eso aquí son genéricos (sin «recibir» cableado en el tipo de fila más allá de los textos). |

Nada del board duplica esta rebanada.

## Modelo de datos

**Ninguno.** Sin tablas, migraciones, `down.sql` ni cambios en `db/schema.prisma`. La sesión vive en
memoria del cliente mientras el modal o la página están montados y se pierde al desmontar (R591), a
propósito: lo recibido ya queda en el historial de cada orden.

- **Multi-empresa / RLS:** no cambia nada. Cada lectura llama a la Server Action de hoy, que resuelve
  la empresa desde la sesión; el `resumen` ya viene acotado a la empresa (SLT-167 R714).
- **Autorización:** la de hoy. El padre solo monta cada recepción para su rol (C1 maestro/admin, C2
  adminTienda, C3/C4 adminSatelite) y cada Server Action revalida en servidor. Las dos páginas nuevas
  validan rol en el Server Component antes de nada (R612). Ningún módulo que encender.
- **País:** nada depende del país. La columna «Hora» es la hora del **dispositivo** que lee
  (`Intl.DateTimeFormat` sin `timeZone`, `hourCycle: "h23"`, `HH:mm:ss`): es el reloj de quien
  escanea en ese momento, no se guarda ni se compara con datos del servidor.

## Rutas y contratos

Sin Server Actions nuevas ni cambios de servidor. Se usan las de hoy:

| Superficie | Acción | Respuestas |
| --- | --- | --- |
| C1 `/ordenes`, `/ordenes/recibir` | `recibirEnBodegaCentralPorQr({ numGuia })` | `ok` (`estado`, `resumen?`), `ya_recibida` (`resumen?`), `estado_invalido`, `no_encontrada`, `validation_error`, `forbidden`, `unauthenticated`, `conflict` |
| C2 `/ordenes`, `/ordenes/recibir` | `recibirEnOrigenPorQr` | las anteriores + `tienda_ajena` |
| C3/C4 `/recepcion-satelite/*` | `recibirPorQr` | las de C1 + `zona_ajena`, `sin_zona` |

### Contratos internos nuevos (cliente)

```ts
// lib/utils/sesion-escaneo.ts — puro, sin React (R581-R587).
import type { ResumenRecepcion } from "@/lib/interfaces/repositories/IOrdenRepository";

type EstadoFila =
  | { tipo: "recibiendo" }
  | { tipo: "recibida"; resumen?: ResumenRecepcion }
  | { tipo: "ya_recibida"; resumen?: ResumenRecepcion }     // respuesta del servidor
  | { tipo: "repetida_en_sesion"; resumen?: ResumenRecepcion } // R585, sin llamar; se pinta «Ya recibida»
  | { tipo: "no_encontrada" }
  | { tipo: "no_se_pudo"; motivo: string }
  | { tipo: "codigo_invalido" };

interface FilaLectura { id: number; hora: Date; leido: string; numGuia: number | null; estado: EstadoFila }

/** Lo que cada superficie traduce desde la respuesta de su acción. */
type DesenlaceRecepcion =
  | { tipo: "recibida"; resumen?: ResumenRecepcion }
  | { tipo: "ya_recibida"; resumen?: ResumenRecepcion }
  | { tipo: "no_encontrada" }
  | { tipo: "no_se_pudo"; motivo: string };

function contadores(filas: readonly FilaLectura[]): { recibidas: number; repetidas: number; noEncontradas: number };
function horaLectura(d: Date): string;              // «HH:mm:ss», hora del dispositivo
function lineaDeEstado(fila: FilaLectura): string;  // R615
```

- `repetidas` = filas `ya_recibida` + `repetida_en_sesion` (las dos se pintan «Ya recibida», R585/R586).
- «Destinatario» y «Tienda» salen de `estado.resumen` solo en `recibida`, `ya_recibida` y
  `repetida_en_sesion` (esta copia el `resumen` de la fila anterior de esa guía); en todo lo demás, o
  si `resumen` falta, «—» (R581).

```ts
// hooks/useEntradaEscaneo.ts — una opción nueva, opcional (SLT-158 no cambia si no se pasa).
interface OpcionesEntradaEscaneo {
  // …lo de hoy…
  /** Se llama en `recibirLectura`, ANTES de encolar: la fila nace al llegar, no al salir de la cola (R581-R582). */
  alLlegar?: (texto: string, origen: OrigenLectura) => void;
}
```

```ts
// hooks/useSesionEscaneo.ts
function useSesionEscaneo(
  recibir: (numGuia: number) => Promise<DesenlaceRecepcion>,
  opciones?: { alCerrarConRecepcion?: () => void },  // R592: se llama al DESMONTAR si hubo recibida/ya_recibida
): {
  filas: readonly FilaLectura[];
  contadores: { recibidas: number; repetidas: number; noEncontradas: number };
  registrar: (texto: string) => void;                 // → `alLlegar`: crea la fila (R581, R584, R585)
  procesar: (texto: string) => Promise<ResultadoLectura>; // → `procesar` de la cola de SLT-158
  reintentar: (filaId: number) => void;               // R583: misma fila a «recibiendo», a la cadena
  recibidas: number;                                  // {n} de «Terminar recepción ({n})»
};
```

- `registrar` clasifica al llegar: `leerGuia` → `null` = fila «Código inválido» (R584); guía ya en la
  lista como `recibiendo`/`recibida`/`ya_recibida`/`repetida_en_sesion` = fila `repetida_en_sesion`
  (R585); si no (también si su fila anterior falló), fila «Recibiendo…» y su id a una cola FIFO de
  filas pendientes.
- `procesar` (la llama la cola de SLT-158, una a una y en orden) toma la fila pendiente más antigua:
  si es inválida o repetida devuelve `error`/`acierto` sin llamar; si no, llama a `recibir` y pone el
  desenlace en **esa** fila por `id` (R587). `recibida` y `ya_recibida` → `acierto` (tono y marca de
  SLT-158); el resto → `error`.
- Las llamadas a `recibir` (las de la cola y los «Reintentar») pasan por **una** cadena de promesas
  propia del hook: nunca hay dos en vuelo (R587).
- Sin toasts (R590): la superficie no llama a `toast` en modo continuo. El toast de permisos de
  cámara sigue en `QrScanner`.
- `alCerrarConRecepcion`: efecto de desmontaje que lo llama una vez si hubo al menos una
  `recibida`/`ya_recibida` (ref, no estado). En `StrictMode` el doble montaje de desarrollo ocurre
  con la sesión vacía, así que no dispara.

### Piezas de UI

- `components/shared/EscaneoContinuo.tsx` (nuevo): contadores (`Recibidas`, `Repetidas`, `No
  encontradas`, rótulo + número) y lista (`role="log"`, más reciente arriba, alto máximo con
  desplazamiento) con «Hora», «Guía», «Destinatario», «Tienda», «Estado» y «Reintentar» (44 px) en
  `no_se_pudo`. Variante `tabla` (página, cinco columnas como `Main.dc.html:49-65`) y `lista` (diálogo
  `max-w-md`: guía y estado en la primera línea, destinatario · tienda · hora debajo). No sabe de
  dominio: recibe `filas`, `contadores` y `onReintentar`.
- `EscanerGuiaCard` gana `continuo?: boolean` (por defecto `false`), `alLlegar?` y `children`:
  pasa `continuo` a `QrScanner` y `alLlegar` a `useEntradaEscaneo`; en continuo no pinta `exito`, y la
  superficie pasa `lineaDeError={false}` (la fila ya lo dice). `children` (la lista) va debajo de
  cámara y campo, en el orden por puntero de SLT-158 (R593).
- `QrScanner` gana `continuo?: boolean`: no pone `entregado` ni cierra; recuerda el último texto y su
  hora y descarta el mismo texto antes de `ESPERA_MISMO_CODIGO_MS = 3000` (R588-R589). Y `alCerrar?:
  () => void`, llamado al pulsar «Cerrar cámara», para que la página desmonte el visor y vuelva a su
  botón compacto. En modo suelto, todo como hoy (R594).
- `components/shared/RecibirPaquetesEntrada.tsx` (nuevo): con `usePunteroFino()` → `next/link`
  «Recibir paquetes» a `href`; táctil → `EscanerModal label="Recibir paquetes"` con `children` (la
  superficie en modo continuo). Al hidratar, `usePunteroFino` arranca en táctil (snapshot de
  servidor) y pasa a enlace en el primer render del cliente con puntero fino: sin error de
  hidratación; un parpadeo de un frame, aceptado.
- C1, C2, C3/C4: cada superficie gana `modo?: "suelta" | "continua" | "pagina"` (por defecto
  `"suelta"`, lo de hoy). `notificar` se parte en `desenlace(result)` (puro, exportado) + toast solo en
  `suelta`. `continua` monta `EscanerGuiaCard continuo` con `useSesionEscaneo(recibir, {
  alCerrarConRecepcion: onRecibida })`. `pagina` monta `RecepcionContinuaPagina` con su `recibir` y
  `volverA`. En `suelta`, `onRecibida` se sigue llamando por lectura como hoy.
- `OrdenesListado`: en `acciones` del `EscanerModal` de hoy, delante de la carga masiva,
  `<RecibirPaquetesEntrada href="/ordenes/recibir">` con la superficie del rol en `modo="continua"` y
  `onRecibida={handleSuccess}`.
- `EscanerRecepcion` (satélite): lo mismo en su propio `EscanerModal`, con
  `href="/recepcion-satelite/recibir?desde=<por-recibir|en-bodega>"` según `usePathname()`.
- C5: solo pasa `continuo` a su tarjeta (R588); su lógica de filas no cambia.
- `VerificarGuiaGate` no cambia: usa `QrScanner` en modo suelto (R594).

## Página de recepción en escritorio (DC5, R610-R613, R615)

### Rutas

| Ruta | Roles | Qué monta |
| --- | --- | --- |
| `app/(app)/ordenes/recibir/page.tsx` → `/ordenes/recibir` | maestro, admin → `EscanerRecepcionBodegaCentral modo="pagina"`; adminTienda → `EscanerRecepcionOrigen modo="pagina"` | `volverA="/ordenes"` |
| `app/(app)/recepcion-satelite/recibir/page.tsx` → `/recepcion-satelite/recibir` | adminSatelite → `EscanerRecepcion modo="pagina"` | `volverA` = `/recepcion-satelite/<desde>` con lista blanca `por-recibir`/`en-bodega`; otro valor o ausente → `por-recibir` |

- **Permisos (R612):** `resolveActorFromSession()` en el Server Component y `notFound()` para
  cualquier otro rol o sin sesión, **antes** de leer nada (forma de `por-recibir/page.tsx:27-29`).
  Cada Server Action revalida como hoy. Sin entrada nueva en el menú: se llega por el enlace y el
  menú marca la sección padre por prefijo.
- La página **no lee datos** en servidor: solo resuelve el rol, calcula `volverA` desde `searchParams`
  y pasa props serializables a la superficie (cliente), que es quien conoce su acción. Una función no
  cruza del servidor al cliente; por eso no se pasa `recibir` desde la página.
- **Satélite sin zona:** la página no lo comprueba (no lee datos); el enlace no aparece sin zona
  (`EscanerRecepcion` no se monta, R42/R43 de la 279) y, si alguien teclea la URL, cada lectura
  queda «No se pudo recibir» con el motivo de `sin_zona` de hoy.

### `RecepcionContinuaPagina` (nuevo, cliente)

- Envuelve `AppPage` (`title="Recibir paquetes"`, `description` = nombre de la recepción,
  `actions` = «Terminar recepción ({n})»): el botón comparte estado con la sesión sin portales.
  `AppPage`/`PageHeader` no son async ni de servidor: se pueden pintar desde un cliente.
- Cuerpo como `Main.dc.html:26-66`: rejilla de tres columnas; a la izquierda (2/3) el campo propio
  «Escanea la guía con la pistola» (`useEntradaEscaneo` con `alLlegar`, foco inicial y tras cada
  lectura con puntero fino), la línea de estado (R615), la ayuda y el botón compacto «Escanear con
  cámara» (outline, 44 px, icono `Camera`) que monta `QrScanner continuo encendidaAlMontar
  alCerrar={…}` debajo; a la derecha (1/3) los contadores; debajo, `EscaneoContinuo` en variante
  `tabla`.
- «Terminar recepción ({n})» (R613): `router.push(volverA)` + `router.refresh()`. La sesión vive en
  el estado del componente: salir por el menú o el navegador la descarta (R591). Sin aviso al salir:
  lo recibido ya está guardado.
- No sabe de dominio: recibe `recibir(numGuia) => Promise<DesenlaceRecepcion>` (de la superficie, en
  el cliente), `volverA` y `nombreRecepcion`.

## Integraciones externas

Ninguna. `html5-qrcode` ya está instalada; la cámara continua solo deja de llamar a `stop()` tras
leer. **Ninguna librería nueva.**

## Alternativas descartadas

1. **Mantener los toasts y añadir solo un contador.** Con 30 lecturas seguidas los toasts se apilan o
   se pisan; quien tiene una pila de paquetes necesita ver cuál falló (la fila), no solo cuántos.
2. **Refrescar el listado tras cada recepción (como hoy).** En una tanda de 50 son 50 recargas del
   listado tapado por el modal. Se refresca una vez al cerrar (R592).
3. **Guardar la sesión en el servidor (tabla de lotes).** Nadie la pide; exigiría tabla con
   `organizacion_id`, RLS y migración, y la trazabilidad ya existe por orden.
4. **Frenar como repetida cualquier guía ya leída, también las que fallaron.** Un `conflict` pide
   justamente volver a pasarla. R585 solo frena las que están en curso o ya entraron.
5. **Crear la fila al salir de la cola de SLT-158, sin tocar `useEntradaEscaneo`.** Descartada: con
   la pistola, la segunda lectura no se vería hasta que respondiera la primera (R581-R582 piden la
   fila al llegar). `alLlegar` es una opción opcional de ~10 líneas; sin ella SLT-158 no cambia.
6. **Una segunda cola dentro de `useSesionEscaneo` en vez de la de SLT-158.** Descartada: duplicaría
   el orden, el foco y la limpieza que SLT-158 ya garantiza. El hook solo añade una cadena de promesas
   para que los «Reintentar» no se crucen con la cola.
7. **`onCerrado` en `EscanerModal` para el refresco único.** Descartada: el contenido ya se desmonta
   al cerrar, y un efecto de desmontaje en el hook lo resuelve sin tocar `EscanerModal`; además sirve
   igual en SLT-168.
8. **Solo diálogo, también en escritorio.** Descartada por DC5: el canvas aprobado (Main) es una
   página con tabla de cinco columnas, que no cabe en `max-w-md`.
9. **Una sola ruta `/recibir` para todos los roles.** La satélite no entra a `/ordenes` ni las
   tiendas a `/recepcion-satelite`; colgar la página de la sección de cada rol conserva el menú y el
   gate por pantalla.
10. **Que la página pase la acción como prop desde el Server Component.** Una función normal no se
    serializa al cliente y pasar Server Actions sueltas obligaría a repetir `desenlace` en la página.
    La superficie, ya cliente, monta la página con su acción y su traducción (un texto de motivo, un
    sitio).
11. **Reusar el botón grande de `QrScanner` en la página.** El canvas pone un botón compacto junto a
    la ayuda (`Main.dc.html:34-40`); el de `QrScanner` es una caja punteada de ancho completo. Se monta
    el visor con `encendidaAlMontar` (como SLT-160) y `alCerrar` lo desmonta.

## Riesgos

- **Cámara continua y batería en el teléfono de la tienda.** Se apaga con «Cerrar cámara» o al cerrar
  el modal (R588), como hoy al desmontar.
- **El mismo QR delante de la cámara durante segundos.** R589 lo frena en 3 s y R585 después.
- **Lecturas muy rápidas de pistola frente a una acción lenta.** La cola las ordena; las filas
  «Recibiendo…» dejan ver cuántas faltan.
- **Nombre accesible «Recibir paquete» contenido en «Recibir paquetes».** Testing Library compara
  exacto, pero Playwright por subcadena: `e2e/recepcion-satelite.spec.ts:44` usa
  `getByRole("button", { name: "Recibir paquete" })`. Con los proyectos de hoy (todos «Desktop
  Chrome», puntero fino) «Recibir paquetes» es un **enlace** y no choca; si un E2E futuro usa táctil,
  `exact: true`.
- **Tamaño:** las líneas de producción rozan el tope; ver `tasks.md > Tamaño` y la pregunta 5.
