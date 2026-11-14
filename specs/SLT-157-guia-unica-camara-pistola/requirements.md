# SLT-157 «Guía única leída por cámara o pistola» — requirements

Ruta: **ligera** (zona frontend, complejidad low). Requisitos: **R560-R568** (reserva R560-R569).
Sale de SLT-155 «Evaluar el lector de código de barras en toda la app»
(`specs/SLT-155-lector-codigo-barras/evaluacion.md` §2 y §4.1, `brief-diseno.md` §1.4 y §4.1).
Depende de: nada (es la primera de las cuatro). SLT-158 «Entrada de escaneo para pistola» y
SLT-160 «Buscar escaneando en los listados» dependen de esta.

## Origen

La etiqueta lleva dos códigos con el mismo dato (`num_guia`): un CODE128 que teclea solo dígitos
(`1024`) y un QR con la URL `<origin>/paquete/<numGuia>`. Hoy cada camino acepta solo uno:

- el camino **tecleado** (donde escribe la pistola) exige `/^\d+$/`, así que el QR leído por una
  pistola 2D se rechaza, y en C3 (satélite), recogida, recolección y verificar guía **sin mensaje**;
- el camino **cámara** pasa por `extractNumGuiaFromScan` (`lib/utils/paquete-url.ts:55-67`), que
  hace `new URL(texto)`: si la cámara lee el CODE128 sale «Código inválido».

Son siete `/^\d+$/` y siete `extractNumGuiaFromScan` sueltos, con tres reglas distintas
(`brief-diseno.md` §1.5, «Diferencias del camino tecleado»).

## Lo que ya existe (evidencia)

Buscado `extractNumGuiaFromScan`, `/^\d+$/`, `pistola`, `CODE128`, `formatsToSupport` en `specs/`,
`feature_list.json` y el código (grafo no indexado para este worktree: Grep/Read).

- `lib/utils/paquete-url.ts`: `buildPaqueteUrl`, `parseNumGuia` (privada, entero positivo seguro) y
  `extractNumGuiaFromScan` (solo URL). Se **amplía** aquí; no se crea otro módulo.
- `components/shared/QrScanner.tsx:92-107`: `new Html5Qrcode(regionId)` sin configuración de
  formatos.
- Superficies que leen una guía: `EscanerRecepcionBodegaCentral.tsx` (C1), `EscanerRecepcionOrigen.tsx`
  (C2), `recepcion-satelite/_components/EscanerRecepcion.tsx` (C3/C4), `cierre-confirmacion-fisica.tsx`
  (C5, `interpretarLectura` con `MedioDeCaptura`), y las del mensajero que usan las mismas piezas:
  `RecogerPaqueteCard.tsx`, `RecoleccionModule.tsx`, `VerificarGuiaGate.tsx`.
- Specs que fijaron el formato: `specs/33-recepcion-qr-satelite`, `specs/238-confirmacion-fisica-cierre`,
  `specs/157-recoleccion-tienda-qr` (feature antigua 157, no es esta ficha). Ninguno trata la pistola.
- Ninguna ficha del board duplica esta (SLT-69 «Escáner rechaza guías asignadas después de abrir la
  pantalla» trata la lista vieja de recoger, no el formato).

## Alcance

**Dentro:**
- Una sola función de lectura de guía en `lib/utils/paquete-url.ts` que recibe cualquier texto
  capturado, por cámara o por teclado (pistola), y devuelve el `num_guia` o nada.
- Las siete superficies de captura de arriba la usan en **los dos** caminos. Con eso, la cámara lee
  también el CODE128 y la pistola lee también el QR. Las superficies siguen llamando a sus Server
  Actions de hoy con el mismo `numGuia`.
- Rechazo **siempre con mensaje**, nunca en silencio, en las siete.
- `QrScanner` declara explícitamente los formatos que decodifica: QR y CODE128.
- Viajan en este PR, solo como documentos (`specs/` y `progress/` no cuentan para el tamaño ni los
  mira `gate.yml`): la evaluación de SLT-155 (`specs/SLT-155-lector-codigo-barras/evaluacion.md` y
  `brief-diseno.md`, y `progress/features/SLT-155.md`) y los specs de SLT-157, SLT-158, SLT-159
  «Escaneo continuo en recepciones y recogidas» y SLT-160. Al mergear, SLT-155 se cierra
  (`progress/features/SLT-155.md > Cierre`).

**Los 14 lugares de `brief-diseno.md` §2.4:** esta ficha cubre las 5 entradas de flujo (C1-C5) y,
de paso, las 3 del mensajero que comparten piezas. Los 9 buscadores (B1-B9) usan la misma función
en SLT-160; aquí no se tocan.

**Fuera:**
- Foco, limpieza del campo, cola de lecturas, tono y orden de la tarjeta (SLT-158).
- Escaneo continuo y cámara abierta entre lecturas (SLT-159).
- Buscadores de listados (SLT-160).
- El rastreo público de la landing y la página `/paquete/[numGuia]`: no cambian.
- Reparar una URL deformada por una distribución de teclado distinta (`:` y `/` cambiados). Se
  comprueba en dispositivo (T5); si pasa, se arregla configurando la pistola, no en código.
- Cualquier cambio de servidor, esquema, permisos o dinero.

## Decisiones (tomadas aquí)

| # | Decisión | Por qué |
| --- | --- | --- |
| D1 | La función nueva se llama `leerGuia(texto)` y **sustituye** a `extractNumGuiaFromScan` (se retira, no queda alias). | Dos funciones con el mismo fin vuelven a divergir; la guardia R567 lo vigila. |
| D2 | Una URL solo vale si su ruta es exactamente `/paquete/<n>` (con o sin barra final), con cualquier origen. Hoy se aceptaba el último segmento de **cualquier** URL. | El QR siempre lleva `/paquete/`; aceptar `…/ordenes/1024` era casualidad. El origen no se compara porque Preview y producción imprimen orígenes distintos. |
| D3 | Se toleran, solo en los extremos: espacios, tabuladores, saltos de línea, caracteres de control (p. ej. `\u001d`, el separador GS que algunas pistolas añaden) y **un** `#` delante del número. | Son los prefijos/sufijos que añade una pistola o que escribe una persona copiando «#1024». Un espacio en medio (`10 24`) no es una guía. |
| D4 | El mensaje de rechazo es «Código inválido.» en todas las superficies con toast (C1-C4, recogida, recolección, verificar guía). C5 conserva su aviso propio «No se pudo leer un número de guía en ese código. Escanea de nuevo o escribe el número.» (R29 de la 238). | Es el texto que ya usan C1, C3 y el camino cámara de todas; el de C2 «El número de guía solo admite dígitos.» deja de ser verdad, porque ahora también se admite la URL. |
| D5 | `QrScanner` pasa `formatsToSupport: [QR_CODE, CODE_128]` a html5-qrcode (ya instalada, `^2.3.8`). **No hace falta librería nueva.** | Sin la lista decodifica todos los formatos (más lento y lee códigos ajenos); con ella el CODE128 queda declarado, no implícito. |

## Requisitos (EARS)

- **R560** — El sistema DEBE tener una sola función de lectura de guía que, dado un texto formado
  solo por dígitos que representa un entero positivo seguro, devuelva ese entero (`"1024"` → 1024,
  `"34991060"` → 34991060).
- **R561** — CUANDO el texto es una URL cuya ruta es `/paquete/<n>` (con o sin barra final y con
  cualquier origen), la función DEBE devolver `n` (`"https://app.ejemplo.test/paquete/1024"` → 1024,
  `"https://otra.test/paquete/1024/"` → 1024). SI la URL tiene otra ruta, ENTONCES DEBE devolver nada
  (`"https://app.ejemplo.test/ordenes/1024"`, `"https://app.ejemplo.test/paquete/abc"`).
- **R562** — CUANDO el texto trae en sus extremos espacios, tabuladores, saltos de línea, caracteres
  de control o un solo `#` pegado delante de los dígitos, la función DEBE ignorarlos y leer la guía
  (`" 1024\r\n"`, `"\t1024"`, `"\u001d1024"`, `"#1024"` → 1024). El `#` solo vale delante de dígitos,
  no delante de una URL.
- **R563** — SI el texto no es una guía, ENTONCES la función DEBE devolver nada: `""`, `"   "`,
  `"abc"`, `"10 24"`, `"1024abc"`, `"-1"`, `"1.5"`, `"0"`, `"##1024"`, `"9007199254740993"` y un
  UUID.
- **R564** — El visor de cámara DEBE decodificar el QR y el CODE128 de la etiqueta, y solo esos dos
  formatos.
- **R565** — CUANDO cualquiera de las siete superficies de captura (C1, C2, C3/C4, C5, recogida en
  bodega, recolección en tienda, verificar guía antes de gestionar) recibe una lectura, por cámara o
  por teclado, DEBE interpretarla con la función única: los dígitos por cámara y la URL tecleada
  DEBEN llegar a la acción de la superficie con el mismo `numGuia` que llega hoy por el otro camino.
- **R566** — SI la lectura de una de las siete superficies no es una guía, ENTONCES la superficie
  DEBE mostrar un mensaje (D4) y NO DEBE llamar a su acción, por los dos caminos. Ninguna lo
  descarta en silencio.
- **R567** — Ningún archivo de `app/` ni de `components/` DEBE interpretar una guía por su cuenta:
  ni `/^\d+$/` aplicado a lo leído, ni `Number(valor)` sobre lo tecleado, ni importar
  `extractNumGuiaFromScan`, que deja de existir.
- **R568** — Para todo `n` entero positivo seguro y todo origen, leer `buildPaqueteUrl(n, origen)`
  DEBE devolver `n`, y leer `String(n)` (el contenido del CODE128) DEBE devolver `n`.

## Trazabilidad (R → test)

Literales escritos a mano en el test, nunca contra la función que los genera. En los negativos, un
valor imposible de encontrar por casualidad.

| R | Test |
| --- | --- |
| R560 | `tests/unit/utils/paquete-url.test.ts` — `leerGuia("1024")` → 1024; `leerGuia("34991060")` → 34991060. |
| R561 | `tests/unit/utils/paquete-url.test.ts` — las dos URL positivas → 1024; `/ordenes/1024` y `/paquete/abc` → `null`. |
| R562 | `tests/unit/utils/paquete-url.test.ts` — tabla con `" 1024\r\n"`, `"\t1024"`, `"\u001d1024"`, `"#1024"` → 1024. |
| R563 | `tests/unit/utils/paquete-url.test.ts` — tabla de los once negativos → `null`. |
| R564 | `tests/components/QrScanner.test.tsx` — el doble de `html5-qrcode` recibe en el constructor `formatsToSupport` con exactamente `QR_CODE` y `CODE_128`. |
| R565 | `tests/components/EscanerRecepcionBodegaCentral.test.tsx`, `EscanerRecepcionOrigen.test.tsx`, `EscanerRecepcion.test.tsx`, `CierresAdminConfirmacionFisica.test.tsx`, `RecogerPaqueteCard.test.tsx`, `RecoleccionModule.test.tsx`, `VerificarGuiaGate.test.tsx` — en cada una: cámara entrega `"1024"` y el campo recibe `"https://app.ejemplo.test/paquete/1024"` + Enter; la acción (doble) se llama con `numGuia: 1024` las dos veces (en C5, la fila 1024 queda confirmada). |
| R566 | Los mismos siete archivos — `"1024abc"` por cámara y por teclado: aparece «Código inválido.» (C5: el aviso de D4) y la acción no se llama. |
| R567 | `tests/unit/guards/lectura-guia-unica.guardia.test.ts` (nuevo) — recorre `app/` y `components/`: ningún archivo importa `extractNumGuiaFromScan` ni contiene `/^\d+$/`; los siete archivos de captura importan `leerGuia`. Se mata con una mutación (reponer un `/^\d+$/` en `EscanerRecepcion.tsx`) antes de darlo por bueno. |
| R568 | `tests/unit/utils/paquete-url.test.ts` — ida y vuelta con `n` en `[1, 1024, 34991060, Number.MAX_SAFE_INTEGER]` y dos orígenes. |

## Tasks

- [ ] **T1 — Función única.** `leerGuia` en `lib/utils/paquete-url.ts` (D1-D3), reutilizando
  `parseNumGuia`; se retira `extractNumGuiaFromScan`. *Hecho:* R560-R563 y R568 en verde.
- [ ] **T2 — Cámara (depende de nada) [P].** `QrScanner` pasa `formatsToSupport` (D5) al constructor
  de `Html5Qrcode`. *Hecho:* R564 en verde; los tests existentes de `QrScanner` en verde.
- [ ] **T3 — Superficies (depende de T1).** Las siete usan `leerGuia` en sus dos caminos; C5 quita
  `MedioDeCaptura` de `interpretarLectura` (el resto de sus desenlaces no cambia); C2 pasa a «Código
  inválido.»; C3, recogida, recolección y verificar guía dejan de rechazar en silencio. *Hecho:*
  R565-R566 en verde en los siete archivos de test.
- [ ] **T4 — Guardia (depende de T3).** `lectura-guia-unica.guardia.test.ts`, matada con una mutación.
  *Hecho:* R567 en verde y rojo con la mutación.
- [ ] **T5 — Dispositivo (depende de T2-T3).** En Preview, con una etiqueta impresa: la cámara del
  teléfono lee el CODE128 y el QR en C1; con la pistola de Carlos, el CODE128 y el QR en C1. Se anota
  en `progress/features/SLT-157.md` qué leyó cada uno y si el QR por pistola llegó deformado (Fuera).
  *Hecho:* nota escrita; si el CODE128 por cámara no lee con el marco cuadrado, se anota y se abre
  ficha aparte (no se cambia el marco aquí).
- [ ] **T6 — Cierre.** `./init.sh` en verde; E2E locales que tocan estas pantallas
  (`e2e/recepcion-satelite.spec.ts`, `e2e/mis-asignaciones.spec.ts`, `e2e/cierres-admin.spec.ts`;
  `docs/perfil-agentes.md > E2E en local antes del PR`).

## Tamaño

- Archivos: **20** (10 de producción, 10 de tests); tope 40, 80% = 32. Los documentos de `specs/` y
  `progress/` no cuentan.
- Producción: ~170 líneas (función ~40, siete superficies ~110, cámara ~10, quitar lo suelto).
- Tests: ~450 líneas (unidad ~120, siete superficies ~280, guardia ~50).

## Archivos esperados

- `lib/utils/paquete-url.ts`
- `components/shared/QrScanner.tsx`
- `app/(app)/ordenes/_components/EscanerRecepcionBodegaCentral.tsx`
- `app/(app)/ordenes/_components/EscanerRecepcionOrigen.tsx`
- `app/(app)/recepcion-satelite/_components/EscanerRecepcion.tsx`
- `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx`
- `app/(app)/mis-asignaciones/_components/RecogerPaqueteCard.tsx`
- `app/(app)/mis-asignaciones/_components/useRecogerPorGuia.ts`
- `app/(app)/mis-asignaciones/_components/VerificarGuiaGate.tsx`
- `app/(app)/recoleccion/_components/RecoleccionModule.tsx`
- `tests/unit/utils/paquete-url.test.ts`
- `tests/components/QrScanner.test.tsx`
- `tests/components/EscanerRecepcionBodegaCentral.test.tsx`
- `tests/components/EscanerRecepcionOrigen.test.tsx`
- `tests/components/EscanerRecepcion.test.tsx`
- `tests/components/CierresAdminConfirmacionFisica.test.tsx`
- `tests/components/RecogerPaqueteCard.test.tsx`
- `tests/components/RecoleccionModule.test.tsx`
- `tests/components/VerificarGuiaGate.test.tsx`
- `tests/unit/guards/lectura-guia-unica.guardia.test.ts`

## Preguntas abiertas

Ninguna para Carlos. Lo único no comprobable leyendo (que la cámara lea el CODE128 impreso y cómo
teclea el QR la pistola) lo resuelve T5 en dispositivo.
