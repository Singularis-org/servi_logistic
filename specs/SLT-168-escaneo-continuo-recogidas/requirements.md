# SLT-168 «Escaneo continuo en las recogidas del mensajero» — requirements

Ruta: **completa** (zona frontend, complejidad medium). Es la rebanada (c) de DC7 de SLT-159 «Escaneo
continuo en recepciones y recogidas» (`specs/SLT-159-escaneo-continuo-recepciones/requirements.md >
## Fuera: SLT-168`). **Depende de SLT-159** (rebanada b, PR #192, en `dev`): reutiliza sus piezas
`lib/utils/sesion-escaneo.ts`, `hooks/useSesionEscaneo.ts`, `components/shared/EscaneoContinuo.tsx`
(`TarjetaEscaneoContinuo`, `ContadoresEscaneo`, `LecturasEscaneo`) y `QrScanner` / `EscanerGuiaCard`
con `continuo`.

**Hereda R595-R599 tal cual, con su numeración.** Sus referencias a R580-R593 apuntan a los requisitos
de SLT-159, ya implementados y probados allí. Los requisitos nuevos de esta ficha van en **R830-R849**
(libres: `grep` de `R8[34]\d` en `specs/` de este worktree, del principal y de `.worktrees/*`, y en
`feature_list.json`, sin resultados el 2026-11-16).

## Origen

- Carlos, 2026-11-14 (al revisar el spec de SLT-159): el escaneo continuo **sí incluye las recogidas
  del mensajero**, con la cámara del teléfono; el modal se abre desde el escáner colapsado «Escanear o
  escribir guía» de SLT-156 «PWA de los mensajeros: tablas usables en el móvil», que monta
  `EscanerModal`.
- Hoy cada lectura es suelta también aquí: en «Recoger paquete» (M1, `/mis-asignaciones/recoger`) y en
  «Recolectar en tienda» (M2, `/recoleccion`) el resultado es un toast y una línea «Guía {n} recogida /
  recolectada correctamente.»; la pantalla se refresca tras **cada** acierto
  (`RecogerModule.tsx:307`, `RecoleccionModule.tsx:185`). Recolectar decenas de paquetes en una tienda
  es la tanda que motiva la ficha (`RecoleccionModule.tsx:78-80`).

## Alcance

**Dentro:**
- M1 «Recoger paquete» en `/mis-asignaciones/recoger` (`RecogerPaqueteCard`, acción
  `recogerAsignaciones` vía `useRecogerPorGuia`, con la relectura de SLT-69 «Escáner rechaza guías
  asignadas después de abrir la pantalla» y el rechazo por reserva de la feature 261).
- M2 «Recolectar en tienda» en `/recoleccion` (`RecoleccionModule`, acción `recolectarEnTiendaPorQr`
  vía `useRecolectarPorGuia`).
- En las dos, el diálogo `EscanerModal` que ya abre «Escanear o escribir guía» pasa a ser **el diálogo
  continuo** (DC5 de SLT-159): no hay un segundo disparador.
- Lo mínimo en las piezas compartidas para que hablen con el verbo de cada superficie (textos de
  estado y del contador de éxitos, icono), sin cambiar nada de las recepciones.

**Fuera:**
- **Servidor.** Las acciones devuelven lo que hoy devuelven: `recogerAsignaciones` y
  `recolectarEnTiendaPorQr` **no traen** destinatario ni tienda (`lib/types/recoleccion-tienda.ts:40-47`;
  la de M1 recibe ids). R581 heredado los pide «del `resumen` de la respuesta»: aquí salen de las
  órdenes que la pantalla ya tiene cargadas (R832). Traerlos del servidor para las guías que no están
  en la lista sería un cambio de servidor (otra ficha, como SLT-167 «Recepción: destinatario y tienda
  en la respuesta»); ver `## Preguntas abiertas`.
- Lo que hará SLT-190 «Recoger y Recolección según el canvas» (`pending`) en las mismas pantallas:
  filtro «Tienda», tarjetas numeradas, Mosaico/Detalle en la barra, fila plegada, y la barra del
  diálogo «Recoger paquete» + «Cerrar». Esta ficha no toca el encabezado del diálogo, la barra, las
  pestañas ni las tarjetas; `RecogerModule.tsx` no cambia.
- El buscador con escaneo de Recolección: SLT-194 «Buscar escaneando en recolección, devoluciones y
  rechazos» (`pending`).
- Verificar guía antes de gestionar (`VerificarGuiaGate`) y el escáner de Reparto
  (`EscanerGuiaReparto`): siguen en guía suelta (R594 de SLT-159).
- Pistola en el móvil del mensajero: no se pide (Carlos, 2026-11-13). El campo acepta teclado como
  hoy y, si alguien conecta una, la cola de SLT-158 «Entrada de escaneo para pistola» la atiende igual.
- Acciones nuevas o en lote, esquema, migraciones, permisos o dinero.

## Decisiones cerradas (no reabrir)

Heredadas de SLT-159 (`specs/SLT-159-escaneo-continuo-recepciones/requirements.md`), solo las que
aplican a la PWA del mensajero.

| # | Decisión | Quién / cuándo |
| --- | --- | --- |
| DC1 | En el escaneo continuo la cámara queda abierta entre lecturas; en guía suelta se cierra. | Carlos, 2026-11-13 |
| DC4 | El escaneo continuo incluye las recogidas del mensajero (M1, M2) con la cámara del teléfono; el modal se abre desde el escáner colapsado de SLT-156. | Carlos, 2026-11-14 |
| DC5 | En la PWA del mensajero (M1, M2) la sesión continua es el diálogo `EscanerModal` (la página «Recibir paquetes» es solo de las recepciones en escritorio). | Leader, 2026-11-14 (canvas aprobado) |
| DC6 | «Código inválido» y «No se pudo …» son filas con ese estado y NO suman a ningún contador; «No se pudo …» lleva «Reintentar» (44 px). | Leader, 2026-11-14 |
| DC7 | SLT-159 se implementa en rebanadas que se mergean solas; la (c), R595-R599, es esta ficha. | Leader, 2026-11-14 |

Cobertura: DC1 → R595 (R588 heredado); DC4 → R595, R598; DC5 → R595, R833; DC6 → R596, R597, R599;
DC7 → este spec (R595-R599 con su numeración).

## Requisitos (EARS)

### Heredados de SLT-159 (texto vigente, sin cambios)

- **R595** — MIENTRAS el modal «Recoger paquete» (M1) o «Recolectar en tienda» (M2) está abierto, el
  sistema DEBE funcionar en escaneo continuo igual que las recepciones (R580-R582, R584, R585,
  R587-R591 y R593), con la acción de hoy de cada uno; la cámara del teléfono DEBE seguir abierta
  entre lecturas.
- **R596** — CUANDO responde la acción de M1 o M2, la fila DEBE pasar a: «Recogida» (M1, éxito),
  «Recogida en tienda» (M2, éxito), «Ya recogida en tienda» (M2, ya recolectada), «No está entre tus órdenes» (la
  guía no está en su lista ni tras la relectura de SLT-69 «Escáner rechaza guías asignadas después
  de abrir la pantalla»), o «No se pudo recoger» / «No se pudo recolectar» seguido del motivo que
  hoy muestra el toast de esa respuesta, con «Reintentar» (44 px). Textos propuestos por el leader
  (2026-11-14), en «tú», con el patrón del canvas («Recibida» / «Ya recibida»). Carlos (2026-11-17):
  en M2 no se usan «Recolectada»/«Recolectadas», nombres de estado retirados por la 455; se dice
  «Recogida en tienda» / «Ya recogida en tienda».
- **R597** — Los contadores de M1 y M2 DEBEN seguir la regla de R586 con el verbo de la superficie:
  «Recogidas» (M1) o «Recogidas en tienda» (M2), «Repetidas» (filas «Ya recogida en tienda» y relecturas de la
  sesión) y «No encontradas» (filas «No está entre tus órdenes»); «No se pudo recoger» / «No se pudo
  recolectar» y «Código inválido» no suman (DC6). Textos propuestos por el leader (2026-11-14); el de
  M2, «Recogidas en tienda», por Carlos (2026-11-17, nombres retirados de la 455).
- **R598** — CUANDO se cierra el modal de M1 o M2 después de al menos un éxito (o una «Ya
  recogida en tienda»), la lista de órdenes de la pantalla DEBE refrescarse una vez; si no hubo ninguno, NO
  DEBE refrescarse. La relectura de SLT-69 ante una guía que no está en la lista cargada DEBE seguir
  ocurriendo en cada lectura que la necesite.
- **R599** — SI la orden leída en M1 está reservada para otro día, ENTONCES su fila DEBE quedar en
  error con el aviso de hoy (feature 261, R13) y la acción NO DEBE llamarse.

### Nuevos de esta ficha

- **R830** — MIENTRAS la acción de una lectura de M1 o M2 no ha respondido (también si espera en la
  cola detrás de otra), su fila DEBE mostrar «Recogiendo…» (M1) o «Recolectando…» (M2) en lugar del
  «Recibiendo…» de R582. (Texto propuesto por el spec_author, mismo patrón que R596. Carlos,
  2026-11-17: «Recolectando…» se queda porque la guardia de nombres retirados de la 455 no lo marca.)
- **R831** — SI la guía leída ya está en la lista de la sesión como en curso, éxito o repetida
  (R585), ENTONCES su fila nueva DEBE decir «Ya recogida» en M1 y «Ya recogida en tienda» en M2, la acción NO
  DEBE llamarse y la fila DEBE sumar a «Repetidas» (R597). (Texto de M1 propuesto por el spec_author:
  R596 no lo nombra porque el servidor de M1 no tiene un «ya recogida». El de M2, «Ya recogida en
  tienda», por Carlos el 2026-11-17: «Ya recolectada» nombra un estado retirado por la 455.)
- **R832** — En M1 y M2, «Destinatario» y «Tienda» de la fila (R581) DEBEN salir de la orden que la
  pantalla ya tiene para esa guía: en M1, la orden de «Por recoger» con la que se recogió (la de la
  lista cargada o la de la relectura de SLT-69); en M2, la orden de «Por recolectar en tienda» o de
  «Recogidos en tienda hoy» cargadas con ese `numGuia`. SI la guía no está en ninguna, ENTONCES DEBEN
  mostrar «—». En cualquier estado que no sea éxito, «Ya recogida en tienda» o repetida (R831), DEBEN mostrar
  «—».
- **R833** — MIENTRAS el diálogo de M1 o M2 está en escaneo continuo, DEBE conservar su título, su
  nombre accesible y su botón de hoy («Recoger paquete», «Recoger por número de guía o escaneo»,
  «Recoger» en M1; «Recolectar en tienda», «Recolectar por número de guía o escaneo», «Confirmar
  recolección» en M2), y NO DEBE mostrar la línea de la última confirmación («Guía {n} recogida
  correctamente.» / «Guía {n} recolectada correctamente.»): la lista la sustituye. El disparador
  «Escanear o escribir guía» DEBE seguir siendo uno solo y abrir este diálogo.
- **R834** — Las recepciones de SLT-159 (C1-C4, diálogo y página) DEBEN seguir mostrando sus textos
  de hoy («Recibiendo…», «Recibida», «Ya recibida», «No encontrada», «No se pudo recibir»,
  «Recibidas»): el verbo de M1 y M2 no les llega.

## Trazabilidad (R → test)

Literales a mano; en los negativos, guías imposibles por casualidad (`7777777`). Las acciones se doblan
en los tests de componente (sin servidor nuevo); el E2E ejercita las acciones reales.

| R | Test |
| --- | --- |
| R595 | `tests/components/RecogerPaqueteCard.test.tsx` y `tests/components/RecoleccionModule.test.tsx` — tres lecturas seguidas (cámara doble y Enter) sin cerrar: la acción doble se llama tres veces en orden, `stop()` no se llamó, sin toast por lectura (`success`, `info` y `error` del doble sin llamar), y una guía repetida no se reenvía. `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` (b) — dos guías sembradas tecleadas con Enter seguidas en el diálogo de Recolección: dos filas «Recogida en tienda» y el diálogo sigue abierto. |
| R596 | `tests/components/RecogerPaqueteCard.test.tsx` — éxito → «Recogida»; guía `7777777` ausente tras la relectura doble → «No está entre tus órdenes»; `forbidden` → «No se pudo recoger» + «No tienes permiso para recoger esta orden.» + botón «Reintentar» que vuelve a llamar a la acción sin añadir fila. `tests/components/RecoleccionModule.test.tsx` — éxito → «Recogida en tienda»; `ya_recolectada` → «Ya recogida en tienda»; `no_encontrada` → «No está entre tus órdenes»; `forbidden` → «No se pudo recolectar» + «No tienes permiso para recolectar órdenes.». `tests/components/useRecogerPorGuia.test.tsx` — cada `status` de `recogerAsignaciones` → su desenlace con el motivo de hoy. `e2e/mis-asignaciones.spec.ts` — tras recoger por el diálogo, la fila dice «Recogida». |
| R597 | `tests/unit/utils/sesion-escaneo.test.ts` — con los textos de M1: rótulos «Recogidas», «Repetidas», «No encontradas»; con los de M2: «Recogidas en tienda»; una fila «No se pudo recolectar» no suma. `tests/components/RecoleccionModule.test.tsx` — `ok`, `ya_recolectada` y `no_encontrada`: «Recogidas en tienda» 1, «Repetidas» 1, «No encontradas» 1. |
| R598 | `tests/components/RecogerModule.test.tsx` — dos éxitos y cerrar: el refresco de la lista se llama una vez y ninguna antes de cerrar; solo errores: cero. `tests/components/RecoleccionModule.test.tsx` — ídem con `router.refresh` (un `ya_recolectada` solo también refresca una vez). `tests/components/RecogerPaqueteCard.test.tsx` — dos guías fuera de la lista cargada: `listarMisAsignaciones` (doble) se llama dos veces. |
| R599 | `tests/components/RecogerPaqueteCard.test.tsx` — orden con `esParaManana`: fila «No se pudo recoger» con el aviso de `avisoReservaParaOtroDia` (texto literal a mano) y `recogerAsignaciones` no llamada. |
| R830 | `tests/components/RecogerPaqueteCard.test.tsx` — con la acción de `1024` pendiente, la fila dice «Recogiendo…». `tests/components/RecoleccionModule.test.tsx` — ídem «Recolectando…». `tests/unit/utils/sesion-escaneo.test.ts` — `textoEstado` de `recibiendo` con los textos de M1 y de M2. |
| R831 | `tests/components/RecogerPaqueteCard.test.tsx` — `1024`, `1024`: segunda fila «Ya recogida», `recogerAsignaciones` llamada una vez, «Repetidas» 1. `tests/components/RecoleccionModule.test.tsx` — ídem «Ya recogida en tienda», `recolectarEnTiendaPorQr` llamada una vez. |
| R832 | `tests/components/RecogerPaqueteCard.test.tsx` — orden cargada con destinatario «Ana Quesada Mora» y tienda «Tienda Prueba Norte»: la fila «Recogida» muestra los dos; orden que llega por la relectura con «Beto Ruiz» / «Tienda Prueba Sur»: muestra esos; «No está entre tus órdenes»: «—» en los dos. `tests/components/RecoleccionModule.test.tsx` — guía de «Por recolectar» con `ok`: sus dos datos; guía de «Recogidos en tienda hoy» con `ya_recolectada`: sus dos datos; `ok` de una guía que no está en ninguna lista: «—». |
| R833 | `tests/components/RecogerPaqueteCard.test.tsx` — tras un éxito: `getByRole("region", { name: "Recoger por número de guía o escaneo" })`, el título «Recoger paquete» y el botón «Recoger»; `queryByText(/recogida correctamente/)` es `null`; un solo botón «Escanear o escribir guía». `tests/components/RecoleccionModule.test.tsx` — ídem con «Recolectar en tienda», «Confirmar recolección» y `/recolectada correctamente/`. `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` (b) — el diálogo sigue mostrando «Recolectar en tienda». |
| R834 | `tests/components/EscaneoContinuo.test.tsx` y `tests/unit/utils/sesion-escaneo.test.ts` — sus casos de SLT-159 («Recibiendo…», «Recibida», «Recibidas»…) siguen en verde **sin tocarlos**; un caso nuevo: `TarjetaEscaneoContinuo` sin `textos` pinta «Recibidas». |

## Preguntas abiertas

> **Cerradas por Carlos el 2026-11-17** (ver `progress/features/SLT-168.md > Decisiones`): textos aprobados, sin la línea «Guía {n} recogida correctamente.», «—» aceptado en Recolección, y «Recogida en tienda» / «Recogidas en tienda» en lugar del nombre retirado «Recolectada». Lo que sigue queda como historia.

**Para Carlos:**

1. **Textos (R596, R597, R830, R831).** Siguen como propuesta: «Recogiendo…» / «Recolectando…»,
   «Recogida» / «Recolectada», «Ya recogida» / «Ya recolectada», «No está entre tus órdenes», «No se
   pudo recoger: …» / «No se pudo recolectar: …» y los contadores «Recogidas» / «Recolectadas»,
   «Repetidas», «No encontradas». ¿Valen? (Se pueden confirmar en Preview.)
2. **La línea «Guía {n} recogida correctamente.» desaparece (R833).** Hoy vive fuera de la tarjeta a
   propósito, para que cerrar y reabrir no la pierda (`RecogerPaqueteCard.tsx:72-76`, decisión del
   2026-07-31). Con la lista de la sesión deja de hacer falta mientras el diálogo está abierto, y al
   cerrar la pantalla ya se refrescó (R598). Propuesta: quitarla. ¿Vale?
3. **Destinatario y tienda en Recolección (R832).** Una guía asignada después de abrir `/recoleccion`
   no está en las listas cargadas: su fila «Recolectada» saldría con «—» en los dos. Traerlos sería un
   cambio de servidor (que `recolectarEnTiendaPorQr` devuelva un resumen, como hizo SLT-167 en las
   recepciones), en otra ficha. Propuesta: aceptar «—» en ese caso. ¿Vale? En M1 no pasa: una guía
   solo se recoge si está en la lista o en la relectura, y las dos traen los datos.

**Para el leader (sin pregunta a Carlos):**

- **Choque de archivos con SLT-190 y SLT-194.** Esta ficha toca `RecogerPaqueteCard.tsx` y
  `RecoleccionModule.tsx` (solo el bloque del escáner y su `procesar`); SLT-190 «Recoger y Recolección
  según el canvas» tocará el diálogo y las mismas pantallas, y SLT-194 «Buscar escaneando en
  recolección, devoluciones y rechazos» el buscador de `RecoleccionModule.tsx`. Ninguna está en vuelo
  hoy; conviene que SLT-168 se mergee antes o que se acepte el choque (`docs/equipo.md`).
- **Canvas.** `EscanerAbierto.dc.html` (canvas de SLT-156) dibuja el diálogo «Recoger paquete» de
  **una** guía, sin lista ni contadores, como el artboard «4 · Tienda en el móvil» que ya anotó SLT-159
  (su pregunta 3). Se sigue DC4/DC5 (lista debajo en el diálogo táctil). «Recogiendo…»,
  «Recolectando…», «Ya recogida», «Código inválido», «No se pudo …» y «Reintentar» no salen en ningún
  canvas: vienen de R596-R599 y R830-R831. Es para que la revisión en Preview no los cuente como
  diferencia.
