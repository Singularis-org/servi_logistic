# SLT-168 «Escaneo continuo en las recogidas del mensajero» — design

Rebanada (c) de SLT-159 «Escaneo continuo en recepciones y recogidas». Todo es cliente: se cablean M1
y M2 a las piezas de SLT-159 y se les da el verbo de cada superficie.

## Lo que ya existe

Buscado el 2026-11-16 en `feature_list.json` (términos «continu», «recog», «recolec», «escane»),
`specs/` y el código de este worktree (parte de `dev` con SLT-159 mergeada, PR #192). El grafo no se
consultó: se leyó con Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
| --- | --- | --- |
| SLT-159 (`done`): sesión pura | `lib/utils/sesion-escaneo.ts` (`reducirSesion`, `contadores`, `textoEstado`, `resumenVisible`, `DesenlaceRecepcion`, `ResumenRecepcion`) | Se **reutiliza**. Gana **un** parámetro opcional de textos (ver Contratos); sin él, idéntico (R834). Los tipos `EstadoFila` y `DesenlaceRecepcion` no cambian: «recibida» es el éxito genérico. |
| SLT-159: hook de sesión | `hooks/useSesionEscaneo.ts` (cola FIFO, cadena única, `alCerrarConRecepcion` una vez, cerrar con lecturas en vuelo: review m4) | Se **reutiliza sin cambios**. Su `alCerrarConRecepcion` es el refresco único de R598 (cuenta `recibida` y `ya_recibida`, que es justo «éxito o Ya recolectada»). |
| SLT-159: lista y tarjeta | `components/shared/EscaneoContinuo.tsx` (`TarjetaEscaneoContinuo`, `ContadoresEscaneo`, `LecturasEscaneo` variante `lista`, chips con variante oscura `COLOR_ESTADO`) | Se **reutiliza**. Ganan dos props opcionales: `textos` y `icono` (este solo en la tarjeta). Mismos colores. |
| SLT-159/SLT-158: tarjeta y cámara continuas | `EscanerGuiaCard` (`continuo`, `alLlegar`, `children`), `QrScanner` (`continuo`, filtro de 3 s) | Sin cambios: llegan por `TarjetaEscaneoContinuo`. |
| SLT-156 (`done`): disparador único | `EscanerModal label={ESCANER_LABEL_GUIA} tactil` en `RecogerPaqueteCard.tsx:79` y `RecoleccionModule.tsx:246` | **No cambia.** Su contenido pasa a ser la tarjeta continua. Un solo disparador, sin cambio de rol al hidratar (la B1 de la review de SLT-159 no aplica: no hay botón nuevo). |
| M1: lógica de recogida | `app/(app)/mis-asignaciones/_components/useRecogerPorGuia.ts` (relectura SLT-69, reserva 261/R13, `conflict` con `reservada_para_otro_dia`, toasts) | Se **conserva la lógica**; cambia la salida: devuelve `DesenlaceRecepcion` (con `resumen` de la orden) y **sin toasts** (R590). Los motivos son los de hoy, en el mismo archivo (la guardia `estado-con-info` lo tiene en `USOS_PERMITIDOS` por `nombreDeEstado`). |
| M2: lógica de recolección | `app/(app)/recoleccion/_components/useRecolectarPorGuia.ts` (sin pre-chequeo local, feature 167/R12) | Ídem: devuelve `DesenlaceRecepcion`, sin toasts; recibe las órdenes cargadas solo para el `resumen` (R832), **no** para rechazar en cliente. |
| Destinatario y tienda | `MiAsignacionDTO.destinatario` y `.tiendaNombre` (`lib/interfaces/services/IMisAsignacionesService.ts:20,30`); `RecoleccionOrdenDTO` y `RecolectadaHoyDTO` lo extienden | Fuente de R832. Sin servidor. |
| Respuesta de las acciones | `recogerAsignaciones` (`ok` sin datos de la orden); `RecolectarEnTiendaResult` (`lib/types/recoleccion-tienda.ts:40-47`, sin destinatario ni tienda) | **No cambian.** Lo que R581 pide «del `resumen`» sale del DTO cargado (R832). |
| Refresco de hoy | `RecogerModule.tsx:307` `onRecogida={() => router.refresh()}`; `RecoleccionModule.tsx:185` `router.refresh()` por acierto | M1: `onRecogida` conserva nombre y firma y pasa a llamarse **una vez al cerrar** (`alCerrarConRecepcion`): **`RecogerModule.tsx` no cambia**. M2: el `router.refresh()` pasa a `alCerrarConRecepcion`. |
| Guardias que nombran estos archivos | `tests/unit/guards/lectura-guia-unica.guardia.test.ts:35-36,90-93` (exige `import { leerGuia }`), `rutas-336-retiradas.guardia.test.ts:198-252` (exige `<EscanerGuiaCard`), `pwa-mensajero-sin-recorte.guardia.test.ts:97`, `estado-con-info.guardia.test.ts:185-186` | Las dos primeras se **ajustan**: M1 y M2 delegan la lectura y la tarjeta en `TarjetaEscaneoContinuo` (ver Guardias). Las otras dos siguen valiendo sin cambios. |
| SLT-190 «Recoger y Recolección según el canvas» (`pending`, ligera, sin spec) | mismas pantallas y el diálogo | Choque de archivos posible en `RecogerPaqueteCard.tsx` y `RecoleccionModule.tsx`; aquí solo cambia el contenido del diálogo. Anotado para el leader. |
| SLT-194 «Buscar escaneando en recolección, devoluciones y rechazos» (`pending`) | buscador de `RecoleccionModule.tsx` | Otra zona del mismo archivo; no se toca el buscador. |

Nada del board duplica esta ficha.

## Modelo de datos

**Ninguno.** Sin tablas, migraciones, `down.sql` ni cambios en `db/schema.prisma`. La sesión vive en
memoria del cliente mientras el diálogo está montado (R591 heredado).

- **Multi-empresa / RLS:** no cambia nada. Cada lectura llama a la Server Action de hoy, que resuelve
  la empresa y el actor desde la sesión; el destinatario y la tienda salen de DTOs que el servidor ya
  entregó acotados al mensajero.
- **Autorización:** la de hoy. `RecogerModule` y `RecoleccionModule` solo montan el escáner sin bloqueo
  por cierre; `recogerAsignaciones` (R17 del service + `WHERE`) y `recolectarEnTiendaPorQr`
  (`RecoleccionTiendaService`) revalidan rol, propiedad, estado y reserva en servidor. Ningún módulo
  que encender.
- **País:** nada depende del país. La hora de la fila es la del dispositivo (`horaLectura`, SLT-159).

## Rutas y contratos

Sin rutas, Server Actions ni cambios de servidor.

| Superficie | Acción | Respuesta → desenlace (fila) |
| --- | --- | --- |
| M1 `/mis-asignaciones/recoger` | `recogerAsignaciones({ ordenIds: [orden.id] })`, tras resolver `numGuia` → orden en `porRecoger` o en la relectura `listarMisAsignaciones` (SLT-69) | `ok` → `recibida` + `resumen` de la orden («Recogida»); guía ausente tras la relectura → `no_encontrada` («No está entre tus órdenes»); `orden.esParaManana` → `no_se_pudo` con `avisoReservaParaOtroDia` **sin llamar** (R599); `conflict` → `no_se_pudo` (reserva o «La orden ya no está en «…»…»); `forbidden`, `unauthenticated`, `validation_error`, `error`, relectura fallida → `no_se_pudo` con el texto de hoy. |
| M2 `/recoleccion` | `recolectarEnTiendaPorQr({ numGuia })` | `ok` → `recibida` + `resumen` si la guía está en las listas cargadas («Recogida en tienda»); `ya_recolectada` → `ya_recibida` + `resumen` ídem («Ya recogida en tienda»); `no_encontrada` → `no_encontrada`; `estado_invalido`, `conflict`, `forbidden`, `unauthenticated`, `validation_error` → `no_se_pudo` con el texto de hoy. |

### Contratos internos (cliente)

```ts
// lib/utils/sesion-escaneo.ts — los textos de cada superficie (R596, R597, R830, R831, R834).
export interface TextosSesion {
  enCurso: string;        // «Recibiendo…» | «Recogiendo…» | «Recolectando…»
  exito: string;          // «Recibida» | «Recogida» | «Recogida en tienda»
  yaHecha: string;        // `ya_recibida` del servidor: «Ya recibida» | «Ya recogida» | «Ya recogida en tienda»
  repetida: string;       // `repetida_en_sesion` (R585/R831): igual que `yaHecha` en las tres
  noEncontrada: string;   // «No encontrada» | «No está entre tus órdenes»
  noSePudo: string;       // «No se pudo recibir» | «No se pudo recoger» | «No se pudo recolectar»
  contadorExitos: string; // «Recibidas» | «Recogidas» | «Recogidas en tienda»
}
export const TEXTOS_RECEPCION: TextosSesion;  // los literales de hoy; es el valor por defecto
export const TEXTOS_RECOGIDA: TextosSesion;
export const TEXTOS_RECOLECCION: TextosSesion;

export function textoEstado(estado: EstadoFila, textos?: TextosSesion): string; // por defecto TEXTOS_RECEPCION
```

- «Repetidas» y «No encontradas» son el mismo rótulo en las tres (R597); no van en `TextosSesion`.
- `lineaDeEstado` (la página de escritorio, R615) no cambia: solo la usan las recepciones.

```ts
// components/shared/EscaneoContinuo.tsx — props opcionales nuevas; sin ellas, lo de hoy (R834).
ContadoresEscaneo:      { textos?: TextosSesion }  // rótulo del primer contador
LecturasEscaneo:        { textos?: TextosSesion }  // chip de estado
TarjetaEscaneoContinuo: { textos?: TextosSesion; icono?: LucideIcon }  // los pasa abajo; icono a EscanerGuiaCard
```

```ts
// app/(app)/mis-asignaciones/_components/useRecogerPorGuia.ts
export function useRecogerPorGuia(porRecoger: MiAsignacionDTO[]): {
  /** Sin toasts. `recibida` lleva { destinatario, tienda: tiendaNombre } de la orden resuelta (R832). */
  recoger: (numGuia: number) => Promise<DesenlaceRecepcion>;
  procesando: boolean;
};

// app/(app)/recoleccion/_components/useRecolectarPorGuia.ts
export function useRecolectarPorGuia(
  /** Solo para el `resumen` (R832): «Por recolectar» + «Recogidos en tienda hoy» cargadas. */
  conocidas: readonly MiAsignacionDTO[],
): { recolectar: (numGuia: number) => Promise<DesenlaceRecepcion> };
```

- La guarda `enCurso` de `useRecogerPorGuia` (SLT-69/R9) se queda: la cadena única de
  `useSesionEscaneo` ya impide dos llamadas a la vez, así que nunca salta, y quitarla es un cambio sin
  requisito.
- `useRecolectarPorGuia` **no** rechaza en cliente una guía que no esté en `conocidas` (feature
  167/R12 sigue): solo la usa para buscar destinatario y tienda.

### Piezas de UI

- **`RecogerPaqueteCard`** (M1): `EscanerModal` igual que hoy; dentro, `TarjetaEscaneoContinuo` con
  `recibir={recoger}`, `alCerrarConRecepcion={onRecogida}`, `textos={TEXTOS_RECOGIDA}`,
  `icono={PackageCheck}`, `titulo="Recoger paquete"`, `ariaLabel="Recoger por número de guía o
  escaneo"`, `descripcion` y `submitLabel="Recoger"` de hoy (R833). Desaparecen `procesar`, el estado
  `ultimaRecogida` y `exito` (R833), y el `leerGuia` local (lo hace la sesión).
- **`RecoleccionModule`** (M2): el mismo cambio dentro de su `EscanerModal`, con `TEXTOS_RECOLECCION`,
  `icono={Store}`, `submitLabel="Confirmar recolección"` y
  `alCerrarConRecepcion={() => router.refresh()}`. Desaparecen `procesar`, `ultima`, `useToast` y
  `leerGuia`. `conocidas` = `porRecolectar` + `recolectadasHoy` (memo). Nada más del archivo cambia
  (barra, buscador, listas, bloqueo).
- **R593 heredado** (táctil: cámara arriba, campo, lista): lo da `EscanerGuiaCard` con `continuo`;
  el teléfono del mensajero es táctil.

### Guardias

- `lectura-guia-unica.guardia.test.ts`: las superficies M1 y M2 dejan de importar `leerGuia` porque la
  lectura la hace `reducirSesion` (en `lib/`, donde la guardia no mira). Se cambia la regla para esas
  dos: **importan `leerGuia` o montan `<TarjetaEscaneoContinuo`**, y se añade que
  `lib/utils/sesion-escaneo.ts` importa `leerGuia` (la delegación no queda en el aire). Sigue
  prohibido `/^\d+$/` y `Number(` en las siete.
- `rutas-336-retiradas.guardia.test.ts` (sección 3): una superficie de escaneo vale si monta
  `<EscanerGuiaCard` **o** `<TarjetaEscaneoContinuo`, y se afirma que `EscaneoContinuo.tsx` monta
  `<EscanerGuiaCard`. Siguen siendo seis.
- Cada ajuste se comprueba con su mutación: quitar `<TarjetaEscaneoContinuo` de `RecogerPaqueteCard`
  pone la guardia en rojo.

### Riesgos

- **Lista vacía en M1 con el diálogo abierto.** `RecogerModule.tsx:304` desmonta la tarjeta si
  `porRecoger` queda vacío. Con el refresco solo al cerrar, eso ya no pasa por las lecturas; sí puede
  pasar si `useRefrescarAlVolver` (`RecogerModule.tsx:131`) refresca al volver a la app con todo
  recogido: el diálogo se cierra y la sesión se descarta (lo recogido ya está en el servidor; el
  refresco único lo dispara el desmontaje). Se acepta: cambiarlo es tocar `RecogerModule`, que SLT-190
  también tocará.
- **Lista cargada desactualizada durante la sesión.** Es lo esperado (R598): una guía recogida en la
  sesión sigue en `porRecoger` hasta cerrar, pero la sesión la frena antes (R585/R831); una asignada
  después pasa por la relectura en cada lectura que la necesite.

## Alternativas descartadas

1. **Dejar el diálogo de guía suelta y añadir un segundo botón «Recoger paquetes» (como
   `RecibirPaquetesEntrada` en las recepciones).** Descartada: DC4 y R595 dicen que el propio modal
   «Recoger paquete» / «Recolectar en tienda» es continuo; SLT-156 (R500) fija un disparador único en
   las pantallas del mensajero; y un botón que depende del puntero es lo que dio la B1 de la review de
   SLT-159 (dos botones antes de hidratar).
2. **Que el servidor devuelva destinatario y tienda (un `resumen` como el de SLT-167).** Descartada
   aquí: en M1 toda guía que se puede recoger está en la lista cargada o en la relectura, que ya traen
   los dos datos; en M2 solo faltan para guías asignadas después de abrir la pantalla. Cambiaría la
   ficha a servidor (service, repositorio, tests de integración con SQL real) por un caso de borde.
   Queda como pregunta a Carlos (requirements, pregunta 3).
3. **Un componente propio de recogida continua** (copiar `TarjetaEscaneoContinuo` con los textos
   puestos). Descartada: duplica la sesión y la lista que SLT-159 dejó genéricas para esto; dos
   copias divergen. Se parametrizan los textos con un valor por defecto que deja las recepciones
   intactas.
4. **Renombrar `DesenlaceRecepcion` / `alCerrarConRecepcion` a nombres neutros.** Descartada: toca
   todos los archivos de SLT-159 sin cambiar comportamiento y engorda el PR; el tipo ya es genérico.

## Dependencias de terceros

Ninguna nueva (`lucide-react` ya está: `PackageCheck`, `Store`).
