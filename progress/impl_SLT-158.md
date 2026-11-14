# SLT-158 «Entrada de escaneo para pistola» — implementación (frontend_dev)

Tanda 1 · 2026-11-14 · T1-T5 · commit COMMIT_SHA. T6 (dispositivo) queda para el cliente
(decisión de Carlos); T7: gate abajo, los E2E los corre el leader.

## Archivos
- Producción (esperados): `components/shared/EscanerGuiaCard.tsx`, `components/shared/EscanerModal.tsx`,
  `hooks/useEntradaEscaneo.ts` (nuevo; también `usePunteroFino`), `lib/audio/tono-notificacion.ts`
  (`reproducirTonoLectura`), `EscanerRecepcionBodegaCentral`, `EscanerRecepcionOrigen`,
  `EscanerRecepcion` (satélite), `cierre-confirmacion-fisica`, `RecogerPaqueteCard`,
  `RecoleccionModule`, `useRecolectarPorGuia`.
- Fuera de `## Archivos esperados`, con su porqué:
  - `app/(app)/mis-asignaciones/_components/useRecogerPorGuia.ts`: el `if (procesando) return` de
    `RecogerPaqueteCard` vive aquí (T5 pide quitarlo). Con estado, la lectura que la cola envía al
    terminar la anterior veía el `procesando` del render previo y se perdía; la guarda pasa a un
    ref (la exige SLT-69/R9) y `recoger` devuelve `ResultadoLectura` con el motivo del toast.
  - `tests/components/useRecogerPorGuia.test.tsx`: compara `.tipo === "acierto"` donde antes
    había `true` (10 asignaciones; ningún caso cambia de sentido).
- Tests: `tests/components/EscanerGuiaCard.test.tsx` (nuevo), `EscanerModal`, `tono-notificacion`,
  `EscanerRecepcionBodegaCentral`, `EscanerRecepcionOrigen`, `RecogerPaqueteCard`,
  `CierresAdminConfirmacionFisica`, `useRecogerPorGuia`.

## Decisiones y desvíos del spec
- `procesando` sale de la API de `EscanerGuiaCard`: la tarjeta lo sabe por su cola. La cámara y el
  botón de enviar ya no se bloquean: también encolan (R574 los nombra).
- `ya_recibida` / `ya_recolectada` cuentan como ACIERTO (la lectura fue buena; tono de acierto).
- C5 (cierres): ya pinta el motivo en su propio `role="alert"` (R29-R32). La tarjeta gana
  `lineaDeError` (por defecto `true`); C5 la apaga para no tener dos alert con el mismo texto, y
  devuelve `{ tipo: "error", motivo: "" }` (el motivo no se muestra). `CierresAdminModule.tsx` no se toca.
- Si la superficie LANZA, la lectura cuenta como error con «No se pudo procesar la lectura. Intenta
  de nuevo.» y la cola sigue (texto nuevo).
- `useRecogerPorGuia`: con la guarda activa (solo llamadas concurrentes, no las de la tarjeta)
  devuelve error «Hay otra recogida en curso.» sin toast (texto nuevo).
- Separador «o» (antes «o ingresa manualmente») en los dos punteros; la nota «Lee el QR o el código
  de barras de la etiqueta.» solo en táctil (R570).
- Tonos: acierto 1318.51 Hz (una nota, 80 ms); error 220 -> 174.61 Hz (dos notas, 140 ms c/u).
  `reproducirTono` (notificaciones) no cambia.
- C2: descripción sin cambio (D5); título y botón «Recibir paquete».

## R -> test -> mutación que lo mata (todas con rojo confirmado y restauradas)
| R | Test | Mutación |
| --- | --- | --- |
| R570 | EscanerGuiaCard «R570» ×2 | invertir la rama `punteroFino` del orden |
| R571 | EscanerModal «R571» ×2 | `focoInicial` siempre `true` (fino); quitar `if (!punteroFino) return true` (táctil) |
| R572 | EscanerGuiaCard «R572» | pastilla siempre visible |
| R573 | EscanerGuiaCard «R573» | `disabled={entrada.procesando}` en el campo |
| R574 | EscanerGuiaCard «R574» ×2 | quitar el pestillo `drenando` de la cola |
| R575 | EscanerGuiaCard «R575»; Cierres «vacía el campo» | quitar `setValor("")` de `enviarCampo` |
| R576 | EscanerGuiaCard «R576»; BodegaCentral «R576»; Origen «un fallo vacía»; RecogerPaqueteCard «robustez» | `lineaDeError = false`; acierto no limpia el error; C2 `tienda_ajena` como acierto; motivo vacío en RecogerPaqueteCard |
| R577 | tono-notificacion «R577» ×3; EscanerGuiaCard «preferencia desactivada» + «control» | error = `[1318.51]`; ignorar la preferencia; no llamar al tono |
| R578 | EscanerGuiaCard «R578» | duración ×10; sin `setMarca` |
| R579 | EscanerGuiaCard «R579»; EscanerRecepcionOrigen «R579» | `enfocarTrasLectura: false`; título C2 «Recibir en tienda» |

## Comandos (salida real)
- `pnpm run typecheck`: exit 0.
- `eslint` sobre los 19 archivos tocados: 0 errores, 0 avisos.
- `vitest run` de los 12 archivos de las superficies tocadas (EscanerGuiaCard, EscanerModal,
  EscanerRecepcionOrigen, EscanerRecepcion, EscanerRecepcionBodegaCentral, RecogerPaqueteCard,
  RecoleccionModule, RecoleccionPage, CierresAdminConfirmacionFisica, useRecogerPorGuia,
  RecogerModule, tono-notificacion): `Test Files 12 passed (12) · Tests 295 passed (295)`.
- Mutaciones: 19 aplicadas de una en una con `vitest -t`, las 19 en ROJO y restauradas.
- `./init.sh` real: **INIT_EXIT=1**, por dos pasos que no son del código:
  1. `feature_list.json invalido: zona frontend: SLT-156, SLT-157, SLT-158 (3 in_progress, max 2)`.
     SLT-157 ya está mergeada (#166) pero sigue `in_progress` en el board local del leader.
  2. `SLT-158: el PR pasa del tamaño máximo (20/40 archivos, 1217/1000 líneas de producción,
     553/3000 de tests)`. La cuenta suma añadidas + borradas: los seis consumidores BORRAN sus dos
     caminos viejos (`onDecoded` + `onManual` con su `if (procesando)`) y su `switch` pasa de
     `toast; break` a `return rechazar(...)`. Desglose (añadidas/borradas): tarjeta 173/82, hook
     211/0, tonos 41/4, modal 19/2, consumidores 280/405. Requiere aceptación humana
     (`<!-- tamano-pr-aceptado: ... -->`) o partir; no lo anoto yo.
- Copia de diagnóstico de `init.sh` (fuera del árbol) con esos dos pasos en `warn`:
  **INIT_EXIT=0** — typecheck, lint, test:rapido (`Test Files 80 passed · Tests 1048 passed |
  1 skipped`), todas las guardias, migraciones y `.env` en verde.

## Veredicto
Código, tests y guardias en verde; el gate real queda rojo por el board (SLT-157 sin cerrar) y por el tamaño del PR, que necesita OK humano.
