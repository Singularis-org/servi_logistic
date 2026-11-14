# SLT-159 «Escaneo continuo en recepciones y recogidas» — requirements

Ruta: **completa** (zona frontend, complejidad medium; UI nueva dentro del modal, pasó por
`/design`). Requisitos: **R580-R599** y **R610-R614** (R600-R609 son de SLT-160).
Sale de SLT-155 «Evaluar el lector de código de barras en toda la app»
(`specs/SLT-155-lector-codigo-barras/evaluacion.md` §4.1 y §4.3 ficha 3, `brief-diseno.md` §4.2 (c)).
**Depende de SLT-158 «Entrada de escaneo para pistola»** (cola, foco, limpieza, tono), que a su vez
depende de SLT-157 «Guía única leída por cámara o pistola».

## Origen

Decisiones de Carlos (`progress/features/SLT-155.md`):
- 2026-11-13: pistola 2D que manda Enter; uso en bodega y tienda, **no** en el móvil del mensajero
  por ahora.
- 2026-11-13: diseño aprobado (canvas https://claude.ai/artifact/BKro9B2dap6jrmGejRq6M3): escaneo
  continuo con lista de lecturas y contadores; en el móvil de tienda la cámara arriba. **En el escaneo
  continuo la cámara se queda ABIERTA entre lecturas; en una guía suelta se sigue cerrando.**
- 2026-11-14 (al revisar este spec): SLT-159 **sí incluye las recogidas del mensajero**, con la
  cámara del teléfono. En la PWA el modal se abre desde el escáner colapsado «Escanear o escribir
  guía» de SLT-156 «PWA de los mensajeros: tablas usables en el móvil», que monta `EscanerModal`.

Hoy cada lectura es suelta: la cámara se cierra tras leer (`QrScanner.tsx:108-113`) y el resultado
es un toast que se va solo. Recibir una tanda de 30 paquetes son 30 toques en «Escanear con cámara»
y ninguna cuenta de lo hecho.

## Alcance

**Dentro** — las recepciones de bodega y tienda que lista la evaluación (`brief-diseno.md` §1.5):
- C1 `/ordenes`, recepción en bodega central (maestro, admin);
- C2 `/ordenes`, recepción en tienda de lo que vuelve (adminTienda);
- C3 `/recepcion-satelite/por-recibir` y C4 `/recepcion-satelite/en-bodega` (adminSatelite; mismo
  componente);
- C5 confirmación física de un cierre en `/cierres-admin`: solo la cámara abierta entre lecturas (ya
  tiene su propia barra de progreso, faltantes y aviso persistente; no gana la lista de esta ficha).

**Dentro** — las recogidas del mensajero (`evaluacion.md` §2, filas 4 y 5), con la cámara del
teléfono (y la pistola Bluetooth si alguien la conecta, por el mismo campo):
- M1 `/mis-asignaciones`, «Recoger paquete» en bodega (`RecogerPaqueteCard`, montada en
  `RecogerModule`; acción `recogerAsignaciones` vía `useRecogerPorGuia`);
- M2 `/recoleccion`, «Recolectar en tienda» (`RecoleccionModule`; acción vía `useRecolectarPorGuia`).

**Fuera:**
- Verificar guía antes de gestionar (`VerificarGuiaGate`): es una sola guía por orden; sigue en guía
  suelta (la cámara se cierra tras leer).
- El disparador colapsado «Escanear o escribir guía» de la PWA: lo hace SLT-156; esta ficha solo
  pone en modo continuo el contenido del `EscanerModal` que abra.
- Armar lotes de asignación escaneando (ficha 5 de la evaluación, pospuesta).
- Buscadores (SLT-160 «Buscar escaneando en los listados»).
- Acciones nuevas o en lote, esquema, migraciones, permisos o dinero. El único cambio de servidor es
  que las tres acciones de recepción de hoy devuelven también destinatario y tienda (R614).

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién / cuándo |
| --- | --- | --- |
| DC1 | En el escaneo continuo la cámara queda abierta entre lecturas; en guía suelta se cierra. | Carlos, 2026-11-13 |
| DC2 | Lista de lecturas con estado y contadores dentro del modal, campo «Lista para la pistola» arriba y cámara debajo; en el móvil de tienda, la cámara arriba. | Carlos, canvas aprobado 2026-11-13 |
| DC3 | Pistola y uso en bodega y tienda. | Carlos, 2026-11-13 |
| DC4 | El escaneo continuo incluye las recogidas del mensajero (M1, M2) con la cámara del teléfono; el modal se abre desde el escáner colapsado de SLT-156. | Carlos, 2026-11-14 |
| DC5 | La recepción continua (C1, C2, C3/C4) es una **página** «Recibir paquetes» en escritorio, como el canvas (Main); en la PWA del mensajero (M1, M2) es el diálogo `EscanerModal`. En este spec, «el modal» nombra a cualquiera de los dos y «cerrar el modal» es «Terminar recepción ({n})» en la página o cerrar el diálogo. | Leader, 2026-11-14 (canvas aprobado) |
| DC7 | SLT-159 no cabe en un PR (46 archivos): se implementa en tres rebanadas en orden, (a) resumen en las acciones R614, (b) recepciones de bodega y tienda con página y diálogo R580-R594 y R610-R613, (c) recogidas del mensajero R595-R599. Cada una se mergea sola. | Leader (corte de reserva pedido para >32 archivos), 2026-11-14 |
| DC6 | «Código inválido» y «No se pudo recibir» son filas con ese estado y NO suman a ningún contador; «No se pudo recibir» lleva «Reintentar» (44 px). | Leader, 2026-11-14 |

## Requisitos (EARS)

- **R580** — MIENTRAS el modal de recepción de C1, C2 o C3/C4 está abierto, el sistema DEBE aceptar
  lecturas seguidas (pistola, teclado o cámara) sin cerrarse y sin que haga falta tocar la pantalla
  entre una y otra; cada lectura DEBE llegar a la acción de recepción de hoy de esa superficie.
- **R581** — CUANDO llega una lectura, el modal DEBE añadir una fila a la lista de la sesión, la más
  reciente arriba, con las columnas «Hora», «Guía», «Destinatario», «Tienda» y «Estado» (lo leído
  en «Guía» si no es una guía; «—» en Destinatario y Tienda si no se encontró) (canvas
  BKro9B2dap6jrmGejRq6M3: Main).
- **R582** — MIENTRAS la acción de una lectura no ha respondido, su fila DEBE mostrar el estado
  «Recibiendo…».
- **R583** — CUANDO la acción responde, la fila DEBE pasar a uno de estos estados, con estos textos:
  «Recibida» (`ok`), «Ya recibida» (`ya_recibida`), «No encontrada» (`no_encontrada`) o «No se
  pudo recibir» seguido del motivo que hoy muestra el toast de esa respuesta (resto de respuestas,
  p. ej. «Esta orden es de otra tienda.»). La fila «No se pudo recibir» DEBE llevar el botón
  «Reintentar» (44 px), que vuelve a enviar esa guía a la cola (DC6).
- **R584** — SI la lectura no es una guía, ENTONCES su fila DEBE mostrar «Código inválido» y la
  acción NO DEBE llamarse.
- **R585** — SI la guía leída ya está en la lista de la sesión como «Recibiendo…», «Recibida» o «Ya
  recibida», ENTONCES el sistema NO DEBE volver a llamar a la acción, DEBE añadir una fila «Ya
  recibida» y DEBE sumarla al contador «Repetidas» (canvas: Main, guía 60762858 leída dos veces).
  Una guía cuya fila anterior terminó en error SÍ DEBE volver a enviarse.
- **R586** — El modal DEBE mostrar un resumen con tres contadores de la sesión, cada uno con su
  rótulo y su número: «Recibidas» (filas «Recibida»), «Repetidas» (filas «Ya recibida») y «No
  encontradas» (filas «No encontrada») (canvas: Main). Las filas «Código inválido» y «No se pudo
  recibir» NO DEBEN sumar a ningún contador (DC6).
- **R587** — CUANDO llegan varias lecturas antes de que responda la primera, el sistema DEBE
  enviarlas a la acción de una en una y en el orden de llegada, y cada fila DEBE quedar con la
  respuesta de su propia guía.
- **R588** — MIENTRAS el modal de C1, C2, C3/C4 o C5 está abierto con la cámara encendida, la cámara
  DEBE seguir encendida y leyendo después de cada lectura; solo se apaga con «Cerrar cámara» o al
  cerrar el modal.
- **R589** — SI la cámara encendida entrega el mismo texto que su lectura anterior antes de que pasen
  3 segundos, ENTONCES el sistema DEBE ignorarlo (ni fila ni llamada).
- **R590** — MIENTRAS el modal está en escaneo continuo, el sistema NO DEBE mostrar un toast por cada
  lectura; el error de permisos de cámara sí sigue saliendo como toast.
- **R591** — CUANDO se cierra el modal, el sistema DEBE descartar la sesión: al volver a abrirlo, la
  lista está vacía y los contadores en 0.
- **R592** — CUANDO se cierra el modal después de al menos una fila «Recibida» o «Ya
  recibida», el listado de fondo DEBE refrescarse una vez; si no hubo ninguna, NO DEBE refrescarse.
- **R593** — MIENTRAS el puntero es táctil, el modal DEBE mostrar la cámara arriba, el campo debajo y
  la lista y los contadores debajo de ambos; con puntero fino, el campo arriba, luego la cámara y
  luego la lista.
- **R594** — Verificar guía antes de gestionar (`VerificarGuiaGate`) DEBE seguir en guía suelta: tras
  leer por cámara, la cámara se cierra y no hay lista de sesión.

### Recogidas del mensajero (M1, M2)

- **R595** — MIENTRAS el modal «Recoger paquete» (M1) o «Recolectar en tienda» (M2) está abierto, el
  sistema DEBE funcionar en escaneo continuo igual que las recepciones (R580-R582, R584, R585,
  R587-R591 y R593), con la acción de hoy de cada uno; la cámara del teléfono DEBE seguir abierta
  entre lecturas.
- **R596** — CUANDO responde la acción de M1 o M2, la fila DEBE pasar a: «Recogida» (M1, éxito),
  «Recolectada» (M2, éxito), «Ya recolectada» (M2, ya recolectada), «No está entre tus órdenes» (la
  guía no está en su lista ni tras la relectura de SLT-69 «Escáner rechaza guías asignadas después
  de abrir la pantalla»), o «No se pudo recoger» / «No se pudo recolectar» seguido del motivo que
  hoy muestra el toast de esa respuesta, con «Reintentar» (44 px). Textos propuestos por el leader
  (2026-11-14), en «tú», con el patrón del canvas («Recibida» / «Ya recibida»).
- **R597** — Los contadores de M1 y M2 DEBEN seguir la regla de R586 con el verbo de la superficie:
  «Recogidas» (M1) o «Recolectadas» (M2), «Repetidas» (filas «Ya recolectada» y relecturas de la
  sesión) y «No encontradas» (filas «No está entre tus órdenes»); «No se pudo recoger» / «No se pudo
  recolectar» y «Código inválido» no suman (DC6). Textos propuestos por el leader (2026-11-14).
- **R598** — CUANDO se cierra el modal de M1 o M2 después de al menos un éxito (o una «Ya
  recolectada»), la lista de órdenes de la pantalla DEBE refrescarse una vez; si no hubo ninguno, NO
  DEBE refrescarse. La relectura de SLT-69 ante una guía que no está en la lista cargada DEBE seguir
  ocurriendo en cada lectura que la necesite.
- **R599** — SI la orden leída en M1 está reservada para otro día, ENTONCES su fila DEBE quedar en
  error con el aviso de hoy (feature 261, R13) y la acción NO DEBE llamarse.

### Página de recepción en escritorio (DC5)

R600-R609 son de SLT-160 «Buscar escaneando en los listados»; la página usa R610-R614 (libres en la
reserva R560-R619). El antiguo «R600» de este archivo es ahora R610, con el mismo texto.

- **R610** — En la página de recepción continua (DC5), el sistema DEBE mostrar: título «Recibir
  paquetes»; el campo con el rótulo «Escanea la guía con la pistola» y el placeholder «Listo para
  leer…»; tras cada lectura, la línea de estado de la última («Guía {n} recibida · {destinatario}»
  cuando acierta); la ayuda «El campo vuelve a estar listo después de cada lectura. También acepta
  el QR de la etiqueta.» con el botón «Escanear con cámara» a su lado; y arriba a la derecha el
  botón «Terminar recepción ({n})», con {n} = filas «Recibida» (canvas: Main).
- **R611** — MIENTRAS el puntero es fino, las pantallas de recepción de hoy (`/ordenes` para
  maestro, admin y adminTienda; `/recepcion-satelite/por-recibir` y `/recepcion-satelite/en-bodega`
  para adminSatelite) DEBEN mostrar, junto al disparador de guía suelta «Recibir paquete», un enlace
  «Recibir paquetes» a la página de su rol (`/ordenes/recibir` o `/recepcion-satelite/recibir`).
  MIENTRAS el puntero es táctil, el mismo botón «Recibir paquetes» DEBE abrir la sesión continua en
  el diálogo `EscanerModal`, sin cambiar de página. El disparador «Recibir paquete» DEBE seguir
  siendo de guía suelta en los dos casos.
- **R612** — CUANDO se entra a `/ordenes/recibir`, el sistema DEBE servir la recepción en bodega
  central a maestro y admin, la recepción en tienda a adminTienda, y DEBE responder «no encontrada»
  a cualquier otro rol o sin sesión, antes de leer ningún dato. CUANDO se entra a
  `/recepcion-satelite/recibir`, DEBE servirla solo a adminSatelite, con la misma regla.
- **R613** — CUANDO se pulsa «Terminar recepción ({n})», el sistema DEBE volver a la pantalla desde la
  que se entró (`/ordenes`, o la de la satélite indicada al entrar; `/recepcion-satelite/por-recibir`
  si no se indicó o no es una de las dos) y esa pantalla DEBE mostrar los datos vigentes. Salir de la
  página por otro camino DEBE descartar la sesión (R591).
- **R614** — CUANDO la acción de recepción responde `ok` o `ya_recibida`, la respuesta DEBE traer el
  destinatario y el nombre de la tienda de esa orden, para la fila (R581) y la línea de estado
  (R610). SI la orden es de otra empresa o está fuera del alcance del actor, ENTONCES la respuesta
  NO DEBE traerlos (la de hoy ya responde `tienda_ajena` o `zona_ajena` antes de `ya_recibida`).

## Trazabilidad (R → test)

Literales a mano; en los negativos, guías imposibles por casualidad (`7777777`). Sin servidor nuevo:
las acciones se doblan en los tests de componente (su SQL ya tiene sus tests y no cambia).

| R | Test |
| --- | --- |
| R580 | `tests/components/EscaneoContinuo.test.tsx` (nuevo) — cinco Enter seguidos sin clics intermedios: la acción doble se llama cinco veces y el diálogo sigue abierto. `tests/components/EscanerRecepcionBodegaCentral.test.tsx`, `EscanerRecepcionOrigen.test.tsx`, `EscanerRecepcion.test.tsx` — una lectura en cada superficie llega a su acción (`recibirEnBodegaCentralPorQr`, `recibirEnOrigenPorQr`, `recibirPorQr`) con `numGuia`. |
| R581 | `tests/components/EscaneoContinuo.test.tsx` — tras `1024` y `2048`, la primera fila es `2048`. |
| R582 | `tests/components/EscaneoContinuo.test.tsx` — con la acción pendiente, la fila `1024` dice «Recibiendo…». |
| R583 | `tests/components/EscaneoContinuo.test.tsx` — tabla: `ok` → «Recibida»; `ya_recibida` → «Ya recibida»; `no_encontrada` → «No encontrada»; `estado_invalido` → «No se pudo recibir» + el motivo. `tests/components/EscanerRecepcionOrigen.test.tsx` — `tienda_ajena` → «No se pudo recibir» + «Esta orden es de otra tienda.». Con `estado_invalido`, pulsar «Reintentar» vuelve a llamar a la acción con la misma guía. |
| R584 | `tests/components/EscaneoContinuo.test.tsx` — `"1024abc"`: fila «Código inválido», acción no llamada. |
| R585 | `tests/components/EscaneoContinuo.test.tsx` — `1024`, `1024`: acción llamada una vez; segunda fila «Ya recibida»; contadores «Recibidas» 1, «Repetidas» 1, «No encontradas» 0. `7777777` con `no_encontrada` y otra vez `7777777`: la acción se llama dos veces. |
| R586 | `tests/unit/utils/sesion-escaneo.test.ts` (nuevo) — reductor puro: secuencia de estados → contadores «Recibidas», «Repetidas» y «No encontradas» con su número (0, 1, 2). Una fila «Código inválido» y una «No se pudo recibir» dejan los tres en 0. |
| R587 | `tests/unit/hooks/useSesionEscaneo.test.ts` (nuevo) — tres lecturas con respuestas resueltas en orden inverso: la acción se llama `1024`, `2048`, `4096` en ese orden y de una en una; cada fila con su respuesta. |
| R588 | `tests/components/QrScanner.test.tsx` — en modo continuo, tras dos `decodedText` distintos, `stop()` del doble no se llamó y `onDecoded` se llamó dos veces; en modo suelto, tras uno, `stop()` se llamó. `tests/components/CierresAdminConfirmacionFisica.test.tsx` — C5 monta la cámara en modo continuo. |
| R589 | `tests/components/QrScanner.test.tsx` — con timers falsos: mismo texto a 1 s → una entrega; mismo texto a 3,1 s → dos entregas; texto distinto a 0,5 s → dos entregas. |
| R590 | `tests/components/EscaneoContinuo.test.tsx` — tras `ok` y `no_encontrada`, el doble de `useToast` no recibió `success` ni `error`. |
| R591 | `tests/components/EscaneoContinuo.test.tsx` — leer `1024`, cerrar, reabrir: ninguna fila; «0 recibidas». |
| R592 | `tests/components/EscanerRecepcionBodegaCentral.test.tsx` — tres `ok` y cerrar: `onRecibida` llamada una vez, y ninguna antes de cerrar; solo `no_encontrada` y cerrar: cero veces. |
| R593 | `tests/components/EscaneoContinuo.test.tsx` — `matchMedia` táctil: el botón «Escanear con cámara» precede al campo y el campo a la lista; fino: campo, cámara, lista. |
| R594 | `tests/components/VerificarGuiaGate.test.tsx` — tras `onDecoded`, `stop()` del doble se llamó y no existe la lista de la sesión. |
| R595 | `tests/components/RecogerPaqueteCard.test.tsx` y `tests/components/RecoleccionModule.test.tsx` — tres lecturas seguidas (cámara doble y Enter) sin cerrar: la acción doble se llama tres veces en orden, `stop()` no se llamó, sin toast por lectura, y una guía repetida no se reenvía. |
| R596 | `tests/components/RecogerPaqueteCard.test.tsx` — éxito → «Recogida»; guía `7777777` ausente tras la relectura doble → «No está entre tus órdenes»; `forbidden` → «No se pudo recoger» + «No tienes permiso para recoger esta orden.». `tests/components/RecoleccionModule.test.tsx` — éxito → «Recolectada»; ya recolectada → «Ya recolectada»; `forbidden` → «No se pudo recolectar» + «No tienes permiso para recolectar órdenes.». |
| R597 | `tests/unit/utils/sesion-escaneo.test.ts` — con el verbo de M1: rótulos «Recogidas», «Repetidas», «No encontradas»; con el de M2: «Recolectadas»; una fila «No se pudo recolectar» no suma. |
| R598 | `tests/components/RecogerModule.test.tsx` — dos éxitos y cerrar: el refresco de la lista se llama una vez y ninguna antes de cerrar; solo errores: cero. `tests/components/RecogerPaqueteCard.test.tsx` — dos guías fuera de la lista cargada: `listarMisAsignaciones` (doble) se llama dos veces. |
| R610 | `tests/components/RecepcionContinuaPagina.test.tsx` (nuevo) — en la página: `getByRole("heading", { name: "Recibir paquetes" })`, `getByLabelText("Escanea la guía con la pistola")` con placeholder «Listo para leer…», tras `ok` de `1024` el `status` dice «Guía 1024 recibida · » + el destinatario doble, la ayuda literal y `getByRole("button", { name: "Terminar recepción (1)" })`. |
| R599 | `tests/components/RecogerPaqueteCard.test.tsx` — orden con `esParaManana`: fila en error con el aviso de reserva y `recogerAsignaciones` no llamada. |
| R611 | `tests/components/EscanerRecepcionBodegaCentral.test.tsx` y `tests/components/PorRecibirModule.test.tsx` (nuevo) — `matchMedia` fino: `getByRole("link", { name: "Recibir paquetes" })` con `href` `/ordenes/recibir` (o `/recepcion-satelite/recibir?desde=por-recibir`) y el botón «Recibir paquete» abre un diálogo cuya cámara se cierra tras leer; táctil: no hay enlace y `getByRole("button", { name: "Recibir paquetes" })` abre el diálogo con la lista de la sesión. |
| R612 | `tests/unit/app/recibir-paquetes-page.test.tsx` (nuevo) — con `resolveActorFromSession` doble: maestro y admin montan la recepción central, adminTienda la de tienda, adminSatelite en `/ordenes/recibir` y mensajero en las dos llaman a `notFound()` sin que se llame ninguna acción de lectura; adminSatelite monta la de satélite. |
| R613 | `tests/components/RecepcionContinuaPagina.test.tsx` — con el `router` doble: «Terminar recepción (2)» llama a `push("/recepcion-satelite/en-bodega")` con `desde=en-bodega` y a `push("/recepcion-satelite/por-recibir")` con `desde=https://evil.test`; en `/ordenes`, a `push("/ordenes")`, y a `refresh()` una vez. |
| R614 | `tests/unit/services/recepcion-resumen.test.ts` (nuevo) — en los tres servicios, `ok` y `ya_recibida` traen `destinatario` y `tienda` del doble; `tienda_ajena`, `zona_ajena` y `no_encontrada` no los traen. `tests/integration/db/recepcion-resumen-sql-real.test.ts` (nuevo, Postgres real) — la lectura del resumen por id devuelve el destinatario y la tienda sembrados (positivo) y nada para una orden sembrada en otra empresa leída con la sesión de la primera, ni para un id inexistente (`00000000-0000-0000-0000-00000000dead`); se mata con una mutación (quitar el filtro de empresa) antes de darlo por bueno. |

## Preguntas abiertas

- **Resuelta (canvas BKro9B2dap6jrmGejRq6M3: Main, leído 2026-11-14; decisiones del leader
  2026-11-14):** textos de la lista, contadores y página en R581, R583, R585, R586 y R610 (antes R600); página en
  escritorio y `EscanerModal` en la PWA (DC5); «Código inválido» y «No se pudo recibir» no suman y
  la segunda lleva «Reintentar» (DC6); M1/M2 con textos propuestos por el leader (R596, R597).
- **Tamaño:** con la página (DC5), M1/M2 y el resumen en las acciones son **46 archivos** (`tasks.md >
  Tamaño`), por encima del tope (40). Queda escrito como decisión **DC7** el corte en tres rebanadas
  que se mergean solas, en orden: (a) resumen en las acciones (R614); (b) recepciones de bodega y
  tienda, página y diálogo (R580-R594, R610-R613); (c) recogidas del mensajero (R595-R599). Hace
  falta crear las dos fichas nuevas en el board (leader, `/afinar-feature` paso 5) o aceptar que
  SLT-159 se implemente en tres PR con la misma key.
- Ninguna para Carlos.
