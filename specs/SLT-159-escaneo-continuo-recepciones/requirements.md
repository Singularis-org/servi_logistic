# SLT-159 «Escaneo continuo en recepciones y recogidas» — requirements

Ruta: **completa** (zona frontend, complejidad medium; UI nueva dentro del modal, pasó por
`/design`). Requisitos: **R580-R594** (reserva R580-R599).
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

**Fuera:**
- Las **recogidas y recolecciones del mensajero** (`RecogerPaqueteCard`, `RecoleccionModule`) y
  verificar guía (`VerificarGuiaGate`): son del móvil del mensajero, fuera por la decisión de Carlos.
  Siguen en guía suelta (la cámara se cierra tras leer). El título de la ficha dice «recogidas»
  porque así nació; en bodega y tienda no hay recogida con escaneo.
- Armar lotes de asignación escaneando (ficha 5 de la evaluación, pospuesta).
- Buscadores (SLT-160 «Buscar escaneando en los listados»).
- Cualquier cambio de servidor, Server Action, esquema, permisos o dinero.

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién / cuándo |
| --- | --- | --- |
| DC1 | En el escaneo continuo la cámara queda abierta entre lecturas; en guía suelta se cierra. | Carlos, 2026-11-13 |
| DC2 | Lista de lecturas con estado y contadores dentro del modal, campo «Lista para la pistola» arriba y cámara debajo; en el móvil de tienda, la cámara arriba. | Carlos, canvas aprobado 2026-11-13 |
| DC3 | Pistola y uso en bodega y tienda; el mensajero queda fuera por ahora. | Carlos, 2026-11-13 |

## Requisitos (EARS)

- **R580** — MIENTRAS el modal de recepción de C1, C2 o C3/C4 está abierto, el sistema DEBE aceptar
  lecturas seguidas (pistola, teclado o cámara) sin cerrarse y sin que haga falta tocar la pantalla
  entre una y otra; cada lectura DEBE llegar a la acción de recepción de hoy de esa superficie.
- **R581** — CUANDO llega una lectura, el modal DEBE añadir una fila a la lista de la sesión, la más
  reciente arriba, con el número de guía (o lo leído, si no es una guía) y su estado.
- **R582** — MIENTRAS la acción de una lectura no ha respondido, su fila DEBE mostrar el estado
  «Recibiendo…».
- **R583** — CUANDO la acción responde, la fila DEBE pasar a uno de estos estados, con estos textos:
  «Recibida» (`ok`), «Ya estaba recibida» (`ya_recibida`), «No encontrada» (`no_encontrada`) o «No se
  pudo recibir» seguido del motivo que hoy muestra el toast de esa respuesta (resto de respuestas,
  p. ej. «Esta orden es de otra tienda.»).
- **R584** — SI la lectura no es una guía, ENTONCES su fila DEBE mostrar «Código inválido» y la
  acción NO DEBE llamarse.
- **R585** — SI la guía leída ya está en la lista de la sesión como «Recibiendo…», «Recibida» o «Ya
  estaba recibida», ENTONCES el sistema NO DEBE volver a llamar a la acción, DEBE añadir una fila «Ya
  leída en esta sesión» y NO DEBE sumarla a ningún contador. Una guía cuya fila anterior terminó en
  error SÍ DEBE volver a enviarse.
- **R586** — El modal DEBE mostrar tres contadores de la sesión: recibidas (filas «Recibida»), ya
  recibidas (filas «Ya estaba recibida») y con error (filas «No encontrada», «No se pudo recibir» y
  «Código inválido»), con el formato «3 recibidas», «1 ya recibida», «2 con error» (singular con 1,
  plural con 0 y con más de 1).
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
- **R592** — CUANDO se cierra el modal después de al menos una fila «Recibida» o «Ya estaba
  recibida», el listado de fondo DEBE refrescarse una vez; si no hubo ninguna, NO DEBE refrescarse.
- **R593** — MIENTRAS el puntero es táctil, el modal DEBE mostrar la cámara arriba, el campo debajo y
  la lista y los contadores debajo de ambos; con puntero fino, el campo arriba, luego la cámara y
  luego la lista.
- **R594** — Las superficies del mensajero (recoger paquete, recolectar en tienda, verificar guía)
  DEBEN seguir en guía suelta: tras leer por cámara, la cámara se cierra y no hay lista de sesión.

## Trazabilidad (R → test)

Literales a mano; en los negativos, guías imposibles por casualidad (`7777777`). Sin servidor nuevo:
las acciones se doblan en los tests de componente (su SQL ya tiene sus tests y no cambia).

| R | Test |
| --- | --- |
| R580 | `tests/components/EscaneoContinuo.test.tsx` (nuevo) — cinco Enter seguidos sin clics intermedios: la acción doble se llama cinco veces y el diálogo sigue abierto. `tests/components/EscanerRecepcionBodegaCentral.test.tsx`, `EscanerRecepcionOrigen.test.tsx`, `EscanerRecepcion.test.tsx` — una lectura en cada superficie llega a su acción (`recibirEnBodegaCentralPorQr`, `recibirEnOrigenPorQr`, `recibirPorQr`) con `numGuia`. |
| R581 | `tests/components/EscaneoContinuo.test.tsx` — tras `1024` y `2048`, la primera fila es `2048`. |
| R582 | `tests/components/EscaneoContinuo.test.tsx` — con la acción pendiente, la fila `1024` dice «Recibiendo…». |
| R583 | `tests/components/EscaneoContinuo.test.tsx` — tabla: `ok` → «Recibida»; `ya_recibida` → «Ya estaba recibida»; `no_encontrada` → «No encontrada»; `estado_invalido` → «No se pudo recibir» + el motivo. `tests/components/EscanerRecepcionOrigen.test.tsx` — `tienda_ajena` → «No se pudo recibir» + «Esta orden es de otra tienda.». |
| R584 | `tests/components/EscaneoContinuo.test.tsx` — `"1024abc"`: fila «Código inválido», acción no llamada. |
| R585 | `tests/components/EscaneoContinuo.test.tsx` — `1024`, `1024`: acción llamada una vez; segunda fila «Ya leída en esta sesión»; contadores «1 recibida», «0 ya recibidas», «0 con error». `7777777` con `no_encontrada` y otra vez `7777777`: la acción se llama dos veces. |
| R586 | `tests/unit/utils/sesion-escaneo.test.ts` (nuevo) — reductor puro: secuencia de estados → contadores; textos «1 recibida», «2 recibidas», «0 recibidas», «1 ya recibida», «1 con error», «3 con error». |
| R587 | `tests/unit/hooks/useSesionEscaneo.test.ts` (nuevo) — tres lecturas con respuestas resueltas en orden inverso: la acción se llama `1024`, `2048`, `4096` en ese orden y de una en una; cada fila con su respuesta. |
| R588 | `tests/components/QrScanner.test.tsx` — en modo continuo, tras dos `decodedText` distintos, `stop()` del doble no se llamó y `onDecoded` se llamó dos veces; en modo suelto, tras uno, `stop()` se llamó. `tests/components/CierresAdminConfirmacionFisica.test.tsx` — C5 monta la cámara en modo continuo. |
| R589 | `tests/components/QrScanner.test.tsx` — con timers falsos: mismo texto a 1 s → una entrega; mismo texto a 3,1 s → dos entregas; texto distinto a 0,5 s → dos entregas. |
| R590 | `tests/components/EscaneoContinuo.test.tsx` — tras `ok` y `no_encontrada`, el doble de `useToast` no recibió `success` ni `error`. |
| R591 | `tests/components/EscaneoContinuo.test.tsx` — leer `1024`, cerrar, reabrir: ninguna fila; «0 recibidas». |
| R592 | `tests/components/EscanerRecepcionBodegaCentral.test.tsx` — tres `ok` y cerrar: `onRecibida` llamada una vez, y ninguna antes de cerrar; solo `no_encontrada` y cerrar: cero veces. |
| R593 | `tests/components/EscaneoContinuo.test.tsx` — `matchMedia` táctil: el botón «Escanear con cámara» precede al campo y el campo a la lista; fino: campo, cámara, lista. |
| R594 | `tests/components/RecogerPaqueteCard.test.tsx` — tras `onDecoded`, `stop()` del doble se llamó y no existe la lista de la sesión. |

## Preguntas abiertas

- **Para el leader (no para Carlos):** los textos exactos de la lista y los contadores en el canvas
  aprobado (este spec no pudo abrir el artifact). R583, R585 y R586 fijan textos que salen del
  vocabulario de los toasts de hoy y de `evaluacion.md` §4.1 («7 recibidas · 1 con error»). Si el
  canvas dice otra cosa, gana el canvas y se corrigen esos tres requisitos antes de implementar.
- Ninguna para Carlos.
