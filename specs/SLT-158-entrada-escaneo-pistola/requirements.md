# SLT-158 «Entrada de escaneo para pistola» — requirements

Ruta: **ligera** (zona frontend, complejidad medium; comportamiento compartido, sin esquema, sin
servidor, sin permisos). Requisitos: **R570-R579**.
Sale de SLT-155 «Evaluar el lector de código de barras en toda la app»
(`specs/SLT-155-lector-codigo-barras/evaluacion.md` §2 y §4.1.2, `brief-diseno.md` §1.2, §4.1, §4.3).
**Depende de SLT-157 «Guía única leída por cámara o pistola»** (las superficies ya leen con
`leerGuia`). SLT-159 «Escaneo continuo en recepciones y recogidas» depende de esta.

## Origen

Decisiones de Carlos (`progress/features/SLT-155.md`): pistola 2D que manda Enter, uso en bodega y
tienda; diseño aprobado 2026-11-13 (canvas https://claude.ai/artifact/BKro9B2dap6jrmGejRq6M3): en las
entradas de flujo, **el campo primero**, «Lista para la pistola», y la cámara de hoy debajo; en el
móvil de tienda, la cámara arriba; en la tienda, botón y tarjeta dicen «Recibir paquete».

Hoy, en `EscanerGuiaCard` (`components/shared/EscanerGuiaCard.tsx`):
- el foco al abrir cae en el botón de cámara (va antes del campo, `:100-106`), así que la pistola
  escribe al vacío y su Enter abre la cámara **[verificar en dispositivo]**;
- el campo se deshabilita mientras procesa (`:147`) y suelta el foco: la segunda lectura se pierde;
- si la lectura falla el texto se queda (`:72-78`) y la siguiente se concatena (`10241025`);
- no hay tono; el visual es un toast y la línea `exito`.

## Lo que ya existe (evidencia)

Buscado `EscanerGuiaCard`, `initialFocus`, `autoFocus`, `reproducirTono`, `pistola` en `specs/`,
`feature_list.json` y el código (grafo no indexado para este worktree: Grep/Read).

- `EscanerGuiaCard`, `EscanerModal`, `QrScanner` (`components/shared/`): se modifican, no se crean
  otros. `EscanerModal` sigue arrancando cerrado (decisión del 2026-07-31, `EscanerModal.tsx:27-30`).
- Precedente «campo primero, cámara debajo»: `VerificarGuiaGate.tsx:106-136` (mensajero).
- Tono: `lib/audio/tono-notificacion.ts` (`prepararAudio`, `reproducirTono`, un solo timbre) y
  `lib/audio/preferencia-sonido.ts` (`leerPreferenciaSonido`). Se amplía el mismo módulo.
- Aviso persistente `role="alert"` de C5 (`cierre-confirmacion-fisica.tsx:634-641`).
- Consumidores de la tarjeta: C1 `EscanerRecepcionBodegaCentral`, C2 `EscanerRecepcionOrigen`, C3/C4
  `recepcion-satelite/_components/EscanerRecepcion`, C5 `cierre-confirmacion-fisica`, y los del
  mensajero `RecogerPaqueteCard` y `RecoleccionModule`. Heredan el cambio todos.
- SLT-156 «PWA de los mensajeros: tablas usables en el móvil» monta un escáner colapsado «Escanear o
  escribir guía» que abre `EscanerModal`: usa este mismo componente, no otro.

## Alcance

**Dentro:** la tarjeta compartida y su modal, con efecto en todos sus consumidores:
- orden de la tarjeta según el puntero (fino: campo arriba; táctil: cámara arriba);
- foco al abrir y tras cada lectura (solo con puntero fino); «Lista para la pistola» mientras escucha;
- el campo nunca se deshabilita; las lecturas que llegan mientras otra se procesa esperan en cola;
- el campo se vacía tras cada envío, acierto o error; el último error queda visible;
- tono de acierto y de error (respetando la preferencia de sonido) y destello del campo;
- en la tienda (C2), la tarjeta dice «Recibir paquete», como su disparador.

**Fuera:**
- Lista de lecturas, contadores y cámara abierta entre lecturas (SLT-159).
- Buscadores (SLT-160).
- Detectar la ráfaga de la pistola (ver D2).
- Escuchar el teclado en toda la página (descartado en `evaluacion.md` §4.1).
- Los textos de los toasts de cada superficie: no cambian.

## Decisiones (tomadas aquí)

| # | Decisión | Por qué |
| --- | --- | --- |
| D1 | «Escritorio» y «móvil» se distinguen por el **puntero** (`(pointer: fine)` frente a táctil), no por el ancho. Con puntero fino: campo arriba y autoenfoque. Táctil: cámara arriba y sin autoenfoque. | En el teléfono el autoenfoque abre el teclado numérico y tapa el visor (`brief-diseno.md` §4.3); un portátil estrecho sigue teniendo pistola. |
| D2 | El campo se vacía **siempre** tras un envío, tecleado o de pistola, y el error queda escrito en una línea con la lectura. Se descarta detectar la ráfaga (`evaluacion.md` §4.1 la proponía). | Con la línea de error la persona que tecleó ve qué escribió y lo repite; distinguir pistola de tecleo por tiempos es frágil en tests y en equipos lentos, y no aporta si el campo siempre queda limpio. |
| D3 | Las lecturas que llegan mientras otra se procesa entran en una **cola** y se envían en orden, una a la vez. | Hoy `if (procesando) return` (`EscanerRecepcionBodegaCentral.tsx:86`) tira la segunda; con el campo habilitado llegarían más rápido que la respuesta. SLT-159 la reutiliza. |
| D4 | La tarjeta sabe si una lectura acertó o falló porque la superficie se lo devuelve (contrato de T1); sigue sin saber de dominio. | El tono y el destello dependen del resultado del servidor, que solo conoce la superficie. |
| D5 | En C2 la tarjeta y su botón de enviar dicen «Recibir paquete» (como su disparador); la descripción no cambia. | Decisión de Carlos 2026-11-14. |

## Requisitos (EARS)

- **R570** — MIENTRAS el dispositivo tiene puntero fino, la tarjeta DEBE mostrar, de arriba abajo:
  el campo «Número de guía» (icono de código de barras, placeholder «Ej. 1024» en JetBrains Mono)
  con su botón de enviar debajo, el separador «o» entre dos líneas finas y, debajo, la cámara de hoy
  (botón con borde discontinuo «Escanear con cámara» y debajo «Apunta al código de la guía»).
  MIENTRAS el puntero es táctil, la cámara DEBE ir arriba, el separador en medio y el campo debajo
  (canvas BKro9B2dap6jrmGejRq6M3: EntradaGuia, TiendaMovil). En táctil el `EscanerGuiaCard` es el
  mismo que en SLT-156 «PWA de los mensajeros: tablas usables en el móvil»: separador «o» y, bajo el
  botón de enviar, la nota «Lee el QR o el código de barras de la etiqueta.» (decisión del leader
  2026-11-14; no «o con la pistola»).
- **R571** — CUANDO se abre el modal de escaneo con puntero fino, el foco DEBE quedar en el campo.
  Con puntero táctil, el foco NO DEBE ir al campo.
- **R572** — MIENTRAS el campo tiene el foco, la tarjeta DEBE mostrar «Lista para la pistola» (nada
  más) como pastilla verde dentro del campo, a la derecha, y el campo un borde de 2 px negro; sin
  foco, ese texto NO DEBE estar (canvas: EntradaGuia).
- **R573** — MIENTRAS la superficie procesa una lectura, el campo NO DEBE estar deshabilitado y DEBE
  conservar el foco; el envío repetido se bloquea, no el campo.
- **R574** — CUANDO llega una lectura (Enter en el campo, botón de enviar o cámara) mientras otra se
  procesa, la tarjeta DEBE guardarla y enviarla al terminar la anterior, en el orden de llegada; NO
  DEBE perder ni juntar ninguna.
- **R575** — CUANDO se envía lo escrito en el campo, el campo DEBE quedar vacío en ese momento,
  acierte o falle la lectura.
- **R576** — SI una lectura falla (no es una guía o la superficie la rechaza), ENTONCES la tarjeta
  DEBE mostrar una línea persistente (`role="alert"`) con lo leído y el motivo que da la superficie,
  hasta la siguiente lectura. CUANDO una lectura acierta, esa línea DEBE desaparecer.
- **R577** — CUANDO termina una lectura, SI la preferencia de sonido está activada, ENTONCES DEBE
  sonar un tono de acierto o uno de error, distintos entre sí; con la preferencia desactivada NO DEBE
  sonar nada.
- **R578** — CUANDO termina una lectura, el campo DEBE marcar el resultado (acierto o error) de forma
  visible durante un momento y volver a su estado normal.
- **R579** — CUANDO la cámara entrega una lectura, la cámara DEBE cerrarse (como hoy) y, con puntero
  fino, el foco DEBE volver al campo. En `/ordenes` de la tienda (C2), el título de la tarjeta y su
  botón de enviar DEBEN decir «Recibir paquete» (D5).

## Trazabilidad (R → test)

Literales a mano. `matchMedia` se dobla por test (fino / táctil). El tono se prueba con el doble de
`AudioContext` que ya usa `tests/unit/audio/tono-notificacion.test.ts`.

| R | Test |
| --- | --- |
| R570 | `tests/components/EscanerGuiaCard.test.tsx` (nuevo) — puntero fino: el `textbox` «Número de guía» precede en el DOM al botón «Escanear con cámara» (`compareDocumentPosition`); táctil: al revés. |
| R571 | `tests/components/EscanerModal.test.tsx` — al pulsar el disparador con puntero fino, `document.activeElement` es el campo «Número de guía»; con táctil, no lo es. |
| R572 | `tests/components/EscanerGuiaCard.test.tsx` — con foco aparece «Lista para la pistola»; tras `blur`, `queryByText` es `null`. |
| R573 | `tests/components/EscanerGuiaCard.test.tsx` — con `onSubmit` pendiente (promesa sin resolver): el campo no tiene `disabled` y sigue siendo `activeElement`. |
| R574 | `tests/components/EscanerGuiaCard.test.tsx` — tres Enter seguidos (`1024`, `2048`, `4096`) con la primera pendiente: el doble recibe `["1024","2048","4096"]` en ese orden, uno tras resolver el anterior, nunca `"10242048"`. |
| R575 | `tests/components/EscanerGuiaCard.test.tsx` — tras Enter con acierto y con error, el valor del campo es `""`. |
| R576 | `tests/components/EscanerGuiaCard.test.tsx` — la superficie rechaza `"7777777"` con «Orden no encontrada.»: hay `role="alert"` con `7777777` y «Orden no encontrada.»; tras un acierto, no hay `alert`. `tests/components/EscanerRecepcionBodegaCentral.test.tsx` — de punta a punta con la acción doble devolviendo `no_encontrada`. |
| R577 | `tests/unit/audio/tono-notificacion.test.ts` — el tono de acierto y el de error programan frecuencias distintas (se comparan los valores escritos a mano en el test, no las constantes); `tests/components/EscanerGuiaCard.test.tsx` — con `leerPreferenciaSonido` falsa no se crea ningún oscilador. |
| R578 | `tests/components/EscanerGuiaCard.test.tsx` — tras un acierto el campo tiene `data-resultado="acierto"`, tras un error `"error"`; con timers falsos, al avanzar la duración desaparece el atributo. |
| R579 | `tests/components/EscanerGuiaCard.test.tsx` — tras `onDecoded` de la cámara (doble), el campo es `activeElement` con puntero fino. `tests/components/EscanerRecepcionOrigen.test.tsx` — `getByRole("heading", { name: "Recibir paquete" })` y `getByRole("button", { name: "Recibir paquete" })`. |

## Tasks

- [ ] **T1 — Contrato de la tarjeta.** `manual.onSubmit` y `onDecoded` devuelven el resultado
  (`{ tipo: "acierto" } | { tipo: "error"; motivo: string }`, o su promesa). Se escribe en el
  JSDoc de `EscanerGuiaCardProps`. *Hecho:* typecheck en verde con los seis consumidores adaptados.
- [ ] **T2 — Entrada de escaneo (depende de T1).** Hook `hooks/useEntradaEscaneo.ts`: cola en orden,
  limpieza, último error, marca de resultado, foco tras cada lectura con puntero fino. La tarjeta lo
  usa y deja de pasar `disabled={procesando}` al campo. *Hecho:* R573-R576, R578 en verde.
- [ ] **T3 — Orden y foco (depende de T2).** Orden por puntero (D1), «Lista para la pistola» y foco
  inicial en el campo al abrir `EscanerModal` (sin tocar que arranca cerrado). *Hecho:* R570-R572,
  R579 (foco) en verde.
- [ ] **T4 [P] — Tonos.** `lib/audio/tono-notificacion.ts` gana el tono de acierto y el de error (el
  de notificaciones no cambia); la tarjeta lo llama respetando `leerPreferenciaSonido` y llama a
  `prepararAudio` al montarse. *Hecho:* R577 en verde; `tono-notificacion.test.ts` existente en verde.
- [ ] **T5 — Consumidores (depende de T1).** C1, C2, C3/C4, C5, `RecogerPaqueteCard` y
  `RecoleccionModule` devuelven el resultado; quitan su propio `if (procesando) return`; C2 cambia el
  título (D5). Los toasts de hoy se quedan. *Hecho:* tests de los seis en verde; R579 (título) en verde.
- [ ] **T6 — Dispositivo.** En Preview, con la pistola: abrir «Recibir paquete» en `/ordenes` y leer
  cinco etiquetas sin tocar la pantalla; en el teléfono, que la cámara salga arriba y no se abra el
  teclado. Nota en `progress/features/SLT-158.md`. *Hecho:* nota escrita.
- [ ] **T7 — Cierre.** `./init.sh` en verde; E2E locales de las pantallas tocadas
  (`e2e/recepcion-satelite.spec.ts`, `e2e/mis-asignaciones.spec.ts`, `e2e/cierres-admin.spec.ts`).

## Tamaño

- Archivos: **20** (11 de producción, 9 de tests); tope 40, 80% = 32.
- Producción: ~330 líneas (hook ~120, tarjeta ~80, tonos ~40, modal ~15, seis consumidores ~75).
- Tests: ~650 líneas (tarjeta ~350, modal ~40, tonos ~60, consumidores ~200).

## Archivos esperados

- `components/shared/EscanerGuiaCard.tsx`
- `components/shared/EscanerModal.tsx`
- `hooks/useEntradaEscaneo.ts`
- `lib/audio/tono-notificacion.ts`
- `app/(app)/ordenes/_components/EscanerRecepcionBodegaCentral.tsx`
- `app/(app)/ordenes/_components/EscanerRecepcionOrigen.tsx`
- `app/(app)/recepcion-satelite/_components/EscanerRecepcion.tsx`
- `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx`
- `app/(app)/mis-asignaciones/_components/RecogerPaqueteCard.tsx`
- `app/(app)/recoleccion/_components/RecoleccionModule.tsx`
- `app/(app)/recoleccion/_components/useRecolectarPorGuia.ts`
- `tests/components/EscanerGuiaCard.test.tsx`
- `tests/components/EscanerModal.test.tsx`
- `tests/unit/audio/tono-notificacion.test.ts`
- `tests/components/EscanerRecepcionBodegaCentral.test.tsx`
- `tests/components/EscanerRecepcionOrigen.test.tsx`
- `tests/components/EscanerRecepcion.test.tsx`
- `tests/components/CierresAdminConfirmacionFisica.test.tsx`
- `tests/components/RecogerPaqueteCard.test.tsx`
- `tests/components/RecoleccionModule.test.tsx`

## Preguntas abiertas

- **Resuelta (canvas BKro9B2dap6jrmGejRq6M3, leído 2026-11-14):** el separador con puntero fino es
  «o» entre dos líneas finas (EntradaGuia); «Lista para la pistola» no lleva nada más (R570, R572).
  Textos del canvas: tarjeta «Recibir paquete», «Número de guía», placeholder «Ej. 1024», botón
  «Recibir» (bodega central; en la tienda «Recibir paquete», D5), «Escanear con cámara» / «Apunta al
  código de la guía». En los buscadores (SLT-160,
  BuscadorListado): botón de icono «Escanear con cámara» junto al campo y la ayuda «Escanea o
  escribe la guía y pulsa Enter. Lo leído por la pistola o por la cámara (QR o código de barras) se
  busca igual.».
- **Resuelta (decisión del leader 2026-11-14):** el `EscanerGuiaCard` es uno; en táctil usa el
  separador «o» y la nota «Lee el QR o el código de barras de la etiqueta.», como SLT-156 (R570).
- **Resuelta (decisión de Carlos 2026-11-14):** en la tienda, tarjeta y botón «Recibir paquete» (D5,
  R579).
- Conflicto de archivos con SLT-156 «PWA de los mensajeros: tablas usables en el móvil» si toca
  `EscanerModal` o `EscanerGuiaCard`: lo mira `scripts/archivos-en-vuelo.mjs` al tomar la ficha.
