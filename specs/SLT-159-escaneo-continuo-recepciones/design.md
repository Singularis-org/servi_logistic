# SLT-159 «Escaneo continuo en recepciones y recogidas» — design

## Lo que ya existe

Buscado en `feature_list.json` (todos los estados), `specs/` y el código: `escaneo continuo`,
`pistola`, `EscanerGuiaCard`, `QrScanner`, `entregado`, `ultimaRecibida`, `cola`. El grafo no tiene
indexado este worktree (`index_status`: proyecto no encontrado); se usó Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
| --- | --- | --- |
| SLT-158 «Entrada de escaneo para pistola» (spec) | `specs/SLT-158-entrada-escaneo-pistola/requirements.md` | Se **reutiliza**: su cola en orden (`hooks/useEntradaEscaneo.ts`), foco, limpieza, tono, orden por puntero y el contrato `acierto / error` de la tarjeta. Esta ficha no los rehace. |
| SLT-157 «Guía única leída por cámara o pistola» (spec) | `specs/SLT-157-guia-unica-camara-pistola/requirements.md` | `leerGuia` decide «Código inválido» (R584). |
| `EscanerModal`, `EscanerGuiaCard`, `QrScanner` | `components/shared/` | Se amplían. `EscanerModal` sigue arrancando cerrado y desmontando al cerrar (eso es lo que apaga la cámara y descarta la sesión, R591). |
| Pestillo `entregado` de la cámara | `QrScanner.tsx:82`, `:108-113` | Es lo que hoy cierra la cámara tras leer. En modo continuo se sustituye por el filtro «mismo texto en 3 s» (R589). |
| Línea `ultimaRecibida` / `exito` | `EscanerRecepcionBodegaCentral.tsx:33-35`, `EscanerGuiaCard.tsx:167-` | La lista de la sesión la sustituye en las tres superficies de recepción. |
| Barra de progreso, faltantes y aviso persistente de C5 | `cierre-confirmacion-fisica.tsx:612-641` | Se queda tal cual; C5 solo gana la cámara continua (R588). |
| Traducción de cada respuesta a texto | `notificar` en las tres superficies (p. ej. `EscanerRecepcionBodegaCentral.tsx:38-81`) | Los motivos de «No se pudo recibir» salen de ahí: se extrae la traducción a una función por superficie y la usan el toast (guía suelta, si quedara) y la fila. |
| SLT-69 «Escáner rechaza guías asignadas después de abrir la pantalla» | board, `done` | No solapa: trata la lista de recoger del mensajero. |
| SLT-156 «PWA de los mensajeros: tablas usables en el móvil» | board, `in_progress` | Usa `EscanerModal` para su escáner colapsado; el modo continuo es opcional (prop), así que su uso en guía suelta no cambia (R594). |

Nada del board duplica esta ficha.

## Modelo de datos

**Ninguno.** Sin tablas, sin migraciones, sin `down.sql`, sin cambios en `db/schema.prisma`. La
sesión vive en memoria del cliente mientras el modal está abierto y se pierde al cerrarlo (R591), a
propósito: no hay nada que auditar que no quede ya en el historial de la orden que escribe cada
recepción.

- **Multi-empresa / RLS:** no cambia nada. Cada lectura llama a la Server Action de hoy, que resuelve
  la empresa desde la sesión y filtra por `organizacion_id`.
- **Autorización:** la de hoy. El padre solo monta cada recepción para su rol (C1 maestro/admin, C2
  adminTienda, C3/C4 adminSatelite) y cada Server Action revalida en servidor (R16 de la 138 y
  equivalentes). Ningún módulo nuevo que encender.
- **País:** nada depende del país (ni moneda, ni geografía, ni impuestos).

## Rutas y contratos

Sin rutas ni Server Actions nuevas. Se usan las de hoy:

| Superficie | Acción | Respuestas |
| --- | --- | --- |
| C1 `/ordenes` | `recibirEnBodegaCentralPorQr({ numGuia })` (`lib/actions/recepcion-bodega-central`) | `ok` (con `estado`), `ya_recibida`, `estado_invalido`, `no_encontrada`, `validation_error`, `forbidden`, `unauthenticated`, `conflict` |
| C2 `/ordenes` | `recibirEnOrigenPorQr` | las anteriores + `tienda_ajena` |
| C3/C4 `/recepcion-satelite/*` | `recibirPorQr` | las de C1 + `zona_ajena`, `sin_zona` |

### Contratos internos nuevos (cliente)

```ts
// lib/utils/sesion-escaneo.ts — puro, sin React (R581-R587).
type EstadoFila =
  | { tipo: "recibiendo" }
  | { tipo: "recibida" }
  | { tipo: "ya_recibida" }
  | { tipo: "no_encontrada" }
  | { tipo: "no_se_pudo"; motivo: string }
  | { tipo: "codigo_invalido" }
  | { tipo: "repetida_en_sesion" };

interface FilaLectura { id: number; leido: string; numGuia: number | null; estado: EstadoFila }

/** Lo que cada superficie traduce desde la respuesta de su acción. */
type DesenlaceRecepcion =
  | { tipo: "recibida" } | { tipo: "ya_recibida" } | { tipo: "no_encontrada" }
  | { tipo: "no_se_pudo"; motivo: string };

function contadores(filas: readonly FilaLectura[]): { recibidas: number; yaRecibidas: number; conError: number };
function textoContador(n: number, singular: string, plural: string): string; // «1 recibida», «3 recibidas»
```

```ts
// hooks/useSesionEscaneo.ts — une la cola de SLT-158 con la lista.
function useSesionEscaneo(recibir: (numGuia: number) => Promise<DesenlaceRecepcion>): {
  filas: readonly FilaLectura[];
  contadores: { recibidas: number; yaRecibidas: number; conError: number };
  leer: (texto: string) => void;          // lo llama la tarjeta (pistola, teclado y cámara)
  huboRecepcion: boolean;                 // para el refresco único al cerrar (R592)
};
```

- `leer` pasa el texto por `leerGuia`: `null` → fila «Código inválido» sin llamar (R584); guía ya en
  la lista en curso o ya entrada → fila «Ya leída en esta sesión» sin llamar (R585); si no (también
  si su fila anterior falló), fila «Recibiendo…» y a la cola.
- La cola es la de SLT-158 (una a la vez, en orden, R587). Cada respuesta actualiza **su** fila por
  `id`, no «la última».
- El resultado `acierto / error` que espera la tarjeta (contrato de SLT-158) sale del desenlace:
  `recibida` y `ya_recibida` → acierto; el resto → error. Así suenan el tono y el destello.

### Piezas de UI

- `components/shared/EscaneoContinuo.tsx` (nuevo): lista (`role="log"`, la más reciente arriba,
  alto máximo con desplazamiento) y los tres contadores. No sabe de dominio: recibe `filas` y
  `contadores`.
- `EscanerGuiaCard` gana la prop `continuo` (por defecto `false`): pasa `continuo` a `QrScanner`, no
  pinta la línea `exito` y acepta la lista como `children` debajo de la cámara y el campo, respetando
  el orden por puntero de SLT-158 (R593).
- `EscanerModal` gana `onCerrado` (se llama al cerrarse) para el refresco único (R592).
- `QrScanner` gana la prop `continuo`: no pone `entregado` ni cierra; recuerda el último texto y su
  hora y descarta el mismo texto antes de `ESPERA_MISMO_CODIGO_MS = 3000` (R588-R589). En modo
  suelto, todo como hoy (R594).
- C1, C2, C3/C4: montan la tarjeta en modo continuo con `useSesionEscaneo`; su `notificar` se parte en
  `desenlace(result)` (puro) y el toast desaparece en este modo (R590). `onRecibida` pasa a llamarse
  desde `onCerrado` si `huboRecepcion` (R592).
- C5: solo pasa `continuo` a su tarjeta para la cámara (R588); su lógica de filas no cambia.

## Integraciones externas

Ninguna. `html5-qrcode` ya está instalada (`^2.3.8`); la cámara continua solo deja de llamar a
`stop()` tras leer. **Ninguna librería nueva.**

## Alternativas descartadas

1. **Mantener los toasts y añadir solo un contador.** Descartada: con 30 lecturas seguidas los
   toasts se apilan o se pisan, y el que se fue no se puede consultar; quien tiene una pila de
   paquetes necesita ver cuál falló (la fila), no solo cuántos.
2. **Refrescar el listado tras cada recepción (como hoy).** Descartada: en una tanda de 50 lecturas
   son 50 recargas del listado de `/ordenes` tapado por el modal; el listado no se ve hasta cerrar.
   Se refresca una vez al cerrar (R592).
3. **Guardar la sesión en el servidor (tabla de lotes de recepción).** Descartada: no la pide nadie,
   exigiría tabla con `organizacion_id`, RLS, migración y ruta completa por esquema, y la trazabilidad
   ya existe por orden en su historial.
4. **Frenar como repetida cualquier guía ya leída, también las que fallaron.** Descartada: un
   `conflict` («La orden cambió de estado. Vuelve a intentar.») pide justamente volver a pasarla.
   R585 solo frena las que están en curso o ya entraron; las que fallaron se reenvían.
5. **Botón «Reintentar» en las filas con error.** Descartada por ahora: obliga a tocar la pantalla,
   que es lo que esta ficha quita; volver a pasar la etiqueta hace lo mismo.

## Riesgos

- **Cámara continua y batería/calor en el teléfono de la tienda.** Mitigado: se apaga al cerrar el
  modal o con «Cerrar cámara» (R588), como hoy al desmontar.
- **El mismo QR delante de la cámara durante segundos.** R589 lo frena en 3 s y R585 después.
- **Lecturas muy rápidas de pistola frente a una acción lenta.** La cola (SLT-158) las ordena; la fila
  «Recibiendo…» deja ver cuántas faltan.
