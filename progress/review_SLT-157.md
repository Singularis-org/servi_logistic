# Review SLT-157 «Guía única leída por cámara o pistola»

Vuelta 1 · 2026-11-14 · ruta ligera (frontend) · diff `origin/dev...HEAD` (código en 6963a951; el resto
son documentos de SLT-155 y specs hermanos).

## Checklist

- [x] **Ruta.** Ligera es válida: sin dinero, permisos, autenticación, integraciones externas ni
      webhooks; ni servidor ni esquema. `html5-qrcode` ya estaba instalada (D5), no hay dependencia nueva.
- [x] **Spec ligera.** `requirements.md` con alcance, EARS R560-R568, `## Tasks` y `## Archivos esperados`.
      T1-T4 `[x]`; T5 (dispositivo) y T6 (E2E locales) quedan al leader por acuerdo de la tanda.
      T6 no pide escribir E2E nuevos, solo correr los tres existentes (`e2e/recepcion-satelite.spec.ts`,
      `e2e/mis-asignaciones.spec.ts`, `e2e/cierres-admin.spec.ts`), que existen.
- [x] **Lo que ya existe.** Se amplía `lib/utils/paquete-url.ts` (`parseNumGuia` reutilizada); no se
      crea módulo nuevo. `extractNumGuiaFromScan` y `MedioDeCaptura` desaparecen sin alias: 0 referencias
      en `app/ components/ lib/ e2e/ tests/` salvo el texto de la guardia.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 22/40 archivos, 261/1000 producción, 505/3000 tests.
- [x] **Trazabilidad.** Cada R tiene test real (detalle abajo); mapa R→test→mutación en `progress/impl_SLT-157.md`.
- [x] **Tests.** Los 10 archivos del diff con vitest (base desechable): 10/10 archivos, 227/227 tests verdes.
- [x] **Typecheck / lint / gate.** Gate local del leader verde (INIT_EXIT=0). No los repetí.
- [x] **Datos y seguridad.** Sin tablas, queries, migraciones ni secretos. Sin recursos de Ordenex.
      Sin literales de país o moneda.
- [x] **Arquitectura.** La lectura vive en `lib/utils/`; las superficies solo la llaman.
- [x] **Configuración.** El origen no se compara (D2), así que Preview, prod y `http://localhost:3000`
      (el de `gate.yml`) valen igual.
- [ ] **E2E locales (T6) y `gate-completo` en CI.** Pendientes del leader; no cuentan en esta tanda.
- [ ] **`progress/features/SLT-157.md > Cierre`.** Se completa al mergear.

## R → test (comprobado leyendo cada test)

| R | Test | Protege lo que dice |
| --- | --- | --- |
| R560 | `paquete-url.test.ts` «R560» | Sí: literales 1024 y 34991060 escritos a mano. |
| R561 | `paquete-url.test.ts` «R561» ×2 | Sí: dos orígenes y barra final; `/ordenes/1024` y `/paquete/abc` → null. Con la regla vieja (último segmento) `/ordenes/1024` habría dado 1024: el test cubre el cambio de D2. |
| R562 | `paquete-url.test.ts` «R562» ×5 | Sí: `\r\n`, `\t`, `\u001d`, `#`, y `#https://…` → null. |
| R563 | `paquete-url.test.ts` «R563» ×11 | Sí: los once negativos del spec, con `9007199254740993` y el UUID. |
| R564 | `QrScanner.test.tsx` «R564» | Sí, y **no** compara contra su propia fuente: traduce los números que recibe el constructor con el enum de la lib REAL (`vi.importActual`), y compara con nombres escritos a mano. |
| R565 | bloque «SLT-157» en los 7 archivos de superficie | Sí: cámara `"1024"` + URL tecleada → la acción (doble) recibe `numGuia: 1024` en las dos lecturas (en C5, la fila queda «Confirmada»; en recogida, la misma `ordenIds`). Con el código viejo, la cámara con dígitos daba «Código inválido» y la URL tecleada se rechazaba: el test habría salido en rojo. |
| R566 | los mismos 7 | Sí: `"1024abc"` por los dos caminos → mensaje D4 y la acción no se llama. En C3, recogida, recolección y verificar guía, el camino del teclado era silencioso: rojo con el código viejo. En C2, rojo por el texto viejo. En C5 ya avisaba por los dos caminos: ahí el test protege contra regresiones, no demuestra el cambio (era lo esperado). |
| R567 | `lectura-guia-unica.guardia.test.ts` | Sí: no puede salir verde sin datos (exige >100 fuentes, que estén las 7 superficies y que la excepción exista). |
| R568 | `paquete-url.test.ts` «R568» | Sí: ida y vuelta contra `n` (la entrada), no contra la salida de `buildPaqueteUrl`; incluye `http://localhost:3000` y `MAX_SAFE_INTEGER`. |

## Superficies: función común y ningún rechazo en silencio

Las 7 llaman a `leerGuia` en los dos caminos, y cuando da `null` muestran «Código inválido.» por toast
(C1, C2, C3/C4, recogida, recolección, verificar guía) o el aviso R29 (C5) antes de cualquier `return`.
Las mismas 7 tampoco tienen `/^\d+$/` ni `Number(`. `VerificarGuiaGate` con el campo vacío no llega al
toast: el botón ya estaba deshabilitado (`VerificarGuiaGate.tsx:120`), así que no aparece un aviso nuevo.

**Lo que antes se aceptaba, que se sigue aceptando:** la URL del QR con cualquier origen `http:`/`https:`,
`http://localhost` incluido (R568), con barra final y con espacios alrededor; el número tecleado a secas.
**Lo que se deja de aceptar a propósito (D2):** una URL con otra ruta y cualquier esquema que no sea
http/https. `NEXT_PUBLIC_APP_URL` es un origen sin ruta en todos los entornos (`.env.example`,
`gate.yml`, prod `https://servilogistic.co`), así que el QR que se imprime siempre cumple
`^/paquete/<n>/?$`.

## Desvíos declarados

1. **`FORMATOS_ETIQUETA = [0, 5]` tipado** (`components/shared/QrScanner.tsx:533`). Aceptado: el motivo
   está documentado (los dobles de las superficies no exportan el enum) y el test R564 lo contrasta
   con la lib real, así que una renumeración se vería en rojo.
2. **Archivos fuera de lo esperado.** Aceptados. En `CierresAdminModule.tsx` el cambio es obligado por
   la nueva firma de `interpretarLectura`, y el renombre a `aplicarLectura` evita que convivan dos
   `leerGuia`. En `useRecolectarPorGuia.ts` solo cambia un comentario que citaba la API retirada.
3. **Excepción de la guardia para `app/paquete/[numGuia]/page.tsx`.** Aceptada: valida el segmento de
   ruta de la página pública, que el spec deja fuera («la página `/paquete/[numGuia]` no cambia»). La
   guardia comprueba además que la excepción no quede huérfana.
4. **`VerificarGuiaGate.test.tsx`: el caso viejo pasa a esperar «Código inválido.».** Aceptado: R566
   prohíbe justo ese silencio. Es un cambio de contrato pedido por el spec, no una aserción que se
   afloja.

## Hallazgos

- **menor** — `tests/unit/utils/paquete-url.test.ts:618-631`: se quitaron los casos viejos «URL con
  espacios alrededor» y «URL con `/paquete/0` o `/paquete/-5`». El código los cubre
  (`lib/utils/paquete-url.ts:621` y `parseNumGuia`), pero ya ningún test fija que el relleno de los
  extremos valga también para la URL ni el cero en la URL. Basta con un caso cada uno.
- **menor** — `tests/unit/guards/lectura-guia-unica.guardia.test.ts:504` y `:558`: la guardia busca solo
  el literal exacto `/^\d+$/`, y en el resto de `app/` y `components/` no mira `Number(`. Una variante
  como `/^[0-9]+$/` o un `Number(valor)` en una superficie nueva pasarían. Basta para lo que pide R567
  según su fila de trazabilidad, pero no para el «ningún archivo» del texto EARS.
- **menor** — `lib/utils/paquete-url.ts:590`: la ruta distingue mayúsculas, así que `/PAQUETE/1024`
  ahora se rechaza (antes se aceptaba por el último segmento). Puede salir en T5 si la pistola teclea con
  Bloq Mayús o con otra distribución. Según el spec (Fuera) eso se arregla en la configuración de la
  pistola, pero conviene anotarlo en la nota de T5.

Ningún bloqueante.

## Veredicto

**OK** (T1-T4). Quedan del leader T5 (dispositivo en Preview), T6 (E2E locales de las tres pantallas)
y `gate-completo` en CI antes del PR.
