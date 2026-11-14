# Review SLT-158 «Entrada de escaneo para pistola»

Vuelta 1 · 2026-11-14 · ruta ligera (frontend, medium) · diff `origin/dev...HEAD` (código a3acfa0c,
bitácora c20a2a0f). T6 (pistola real) queda para el cliente por decisión de Carlos: no se cuenta.

## Checklist

- [x] Ruta ligera adecuada: sin dinero, permisos, auth, integraciones ni webhooks.
- [x] Trazabilidad R570-R579: cada R tiene un test que lo verifica de verdad (ver tabla abajo).
- [x] Tasks T1-T5 `[x]`; T6 fuera por decisión de Carlos; T7 (cierre) abierta, la cierra el leader.
- [ ] **Tamaño:** `node scripts/tamano-pr.mjs` → 1217/1000 líneas de producción, sin línea
      `tamano-pr-aceptado` en `progress/features/SLT-158.md`.
- [x] `## Lo que ya existe` presente y con evidencia; el diff no re-crea nada (`use-mobile.ts` es por
      ancho, D1 pide puntero; `usePunteroFino` no duplica). Se amplía `tono-notificacion.ts`, no se crea otro.
- [x] `pnpm run typecheck`: exit 0 (corrido por mí).
- [x] `eslint` de los 18 .ts/.tsx tocados: 0 errores, 2 avisos ya existentes en `origin/dev`
      (`RecoleccionModule.tsx:3,7`, `useMemo`/`ContactoButtons` sin usar); la bitácora dice "0 avisos".
- [x] `vitest run` de 10 archivos (tarjeta, modal, tonos, C1, C2, C3/C4, C5, RecogerPaqueteCard,
      RecoleccionModule, useRecogerPorGuia): `Test Files 10 passed · Tests 216 passed`.
- [x] Checkpoints del proyecto: sin tablas, queries, migraciones, literales de país/moneda,
      recursos de Ordenex ni dependencias nuevas. Comentarios explican el porqué.
- [ ] **E2E de pantallas tocadas** (`recepcion-satelite`, `mis-asignaciones`, `cierres-admin`):
      sin constancia todavía (T7 abierta; los corre el leader).

## Lo pedido en especial

- **Cola sin pérdidas ni duplicados.** `useEntradaEscaneo.ts:165-185`: cola y pestillo en refs; el
  `shift()` vacío → `break` → `finally` es síncrono, así que no hay hueco en el que un `push` quede
  sin drenar. Dos Enter seguidos: el segundo ve `valor === ""` (el Enter de la pistola es otra tarea;
  React 19 ya re-renderizó) y sale sin duplicar. Cámara + pistola: comparten cola (test «una lectura
  de la cámara también espera»). La cámara no duplica: `QrScanner` ya tiene su pestillo
  (`QrScanner.tsx:89-95`), lo que antes cubría también el `if (procesando)` de los consumidores.
- **Pestillo si una superficie lanza.** El `procesar` que lanza se convierte en error y la cola
  sigue (test «si la superficie lanza…»); el `finally` suelta `drenando` y `procesando` en todo
  camino. La UI no queda trabada. Ver menor M1 (lo que lanza `terminar` no está cubierto).
- **R→test.** Literales a mano (frecuencias 1318.51 / 220→174.61 / 880→1174.66, 900 ms, textos);
  nada compara contra su fuente. R577 tiene control positivo (sí suena con la preferencia activada),
  así que el «0 osciladores» no es verde sin datos. R571 táctil espera a que el foco asiente dentro
  del diálogo antes de afirmar dónde no está.
- **SLT-69/R9.** `useRecogerPorGuia.test.tsx:217` sigue en verde con la guarda en ref
  (`useRecogerPorGuia.ts:170`). Ver M2: el motivo del cambio a ref no tiene test.
- **Tono y preferencia.** `EscanerGuiaCard.tsx:72-75` lee la preferencia en cada lectura;
  `reproducirTono` de notificaciones no cambia (test lo fija con literales).
- **Foco.** Fino: foco inicial en el campo (modal) y tras cada lectura. Táctil: el Dialog usa su foco
  por defecto (primer tabulable = botón de cámara, que va arriba) y `enfocarTrasLectura` es `false`.
  Ver M3: lo táctil tras una lectura no tiene test.
- **Tres tests viejos cambiados** (Cierres `:699`, Origen `:206`, RecogerPaqueteCard `:329`): pasan
  de «conserva lo tecleado» a «vacía el campo», que es exactamente R575/D2, y los de Origen y
  RecogerPaqueteCard GANAN aserciones (alert con lo leído y el motivo). No es ablandamiento.

## Desvíos declarados (juicio)

- `useRecogerPorGuia.ts` + test fuera de lista: **justificado** (sin el ref, la lectura en cola veía el
  `procesando` del render previo y caía en «Hay otra recogida en curso»). El test cambia `true` por
  `.tipo === "acierto"` sin invertir ningún caso.
- `procesando` fuera de las props; cámara y botón encolan: **correcto**, es lo que pide R574.
- `ya_recibida` / `ya_recolectada` como acierto: **razonable** (la lectura fue buena). Ver M5.
- Textos nuevos («No se pudo procesar la lectura. Intenta de nuevo.», «Hay otra recogida en curso.»):
  aceptables; el segundo no se ve en el flujo de la tarjeta (la cola serializa).
- C5 con `lineaDeError=false` y `motivo: ""`: evita dos `role="alert"` iguales, pero ver M4.

## Hallazgos

- **BLOQUEANTE (proceso, no de código)** — Tamaño del PR 1217/1000 sin `<!-- tamano-pr-aceptado -->`
  en `progress/features/SLT-158.md` (`docs/gate.md > Tamaño del PR`). Lo decide Carlos. Opinión:
  partir no tiene sentido técnico: el cambio de contrato (T1) obliga a tocar los seis consumidores a
  la vez y sus 405 líneas borradas son ese mismo cambio; lo separable (orden/foco/modal, ~60 líneas)
  no baja del tope.
- **BLOQUEANTE (proceso, cierre T7)** — Sin constancia de los E2E de las pantallas tocadas
  (`e2e/recepcion-satelite.spec.ts`, `e2e/mis-asignaciones.spec.ts`, `e2e/cierres-admin.spec.ts`);
  `docs/perfil-agentes.md > reviewer`. Lo cierra el leader al correrlos y anotarlos.
- **menor M1** — `hooks/useEntradaEscaneo.ts:179`: `terminar(...)` va fuera del `try` interno. Si la
  superficie devuelve algo que no es `ResultadoLectura` (p. ej. `undefined` de un `switch` que gane un
  estado nuevo sin `return`) o `alTerminar` lanza, el bucle sale, las lecturas en cola se quedan
  esperando hasta la siguiente lectura y la promesa de `drenar` rechaza sin manejar. La UI no se
  traba (el `finally` suelta). Sugerencia: normalizar el resultado o envolver `terminar`.
- **menor M2** — Ningún test protege el motivo del ref en `useRecogerPorGuia.ts:154-171`: volver a la
  guarda en estado deja verdes el R9 y el R574 de la tarjeta (que usa un doble). Falta un test en
  `RecogerPaqueteCard.test.tsx`: dos Enter seguidos con la primera pendiente → `recogerMock` recibe
  las dos.
- **menor M3** — `tests/components/EscanerGuiaCard.test.tsx:343`: R579 sólo prueba puntero fino. Con
  táctil, que tras una lectura el foco NO vuelva al campo (D1: abriría el teclado) no tiene test;
  la mutación `enfocarTrasLectura: true` en `EscanerGuiaCard.tsx:115` sobrevive.
- **menor M4** — C5 (`cierre-confirmacion-fisica.tsx:584-586`): con el campo vaciado y la línea de la
  tarjeta apagada, nadie muestra LO LEÍDO; el aviso de C5 dice «Esa guía…» / «No se pudo leer un
  número de guía en ese código» sin el número, y quien tecleó «70O1» ya no lo ve. R576 pide «lo leído
  y el motivo»; el desvío debe quedar como decisión en el spec o resolverse (p. ej. el aviso de C5 con
  la lectura).
- **menor M5** — Inconsistencia de tono: en C1/C2 `ya_recibida` suena a acierto, pero en C5 «Esa guía
  ya está confirmada» devuelve `false` y suena a error (`CierresAdminModule.tsx:1041-1043`). Decidir y
  anotar.
- **menor M6** — Comentario obsoleto en `CierresAdminModule.tsx:1028-1030` («con `false` el campo
  conserva lo escrito»): ya no es cierto (R575). El archivo no está en el diff; se arregla de paso.
- **menor M7** — `tests/components/EscanerModal.test.tsx` (R571) usa una tarjeta doble con
  `data-escaner-campo=""` a mano: si la tarjeta real perdiera el atributo
  (`EscanerGuiaCard.tsx:173`), el test seguiría verde. Un caso con `EscanerGuiaCard` real dentro del
  modal lo cerraría.
- **menor M8** — La bitácora dice «eslint: 0 avisos»; hay 2, heredados de `origin/dev`.

## Veredicto

**RECHAZADO** — sólo por los dos bloqueantes de proceso (tamaño sin aceptar y E2E de T7 sin
constancia). El código no tiene bloqueantes: no hace falta otra vuelta del implementer por ellos;
se levanta al anotar la aceptación de tamaño de Carlos y la constancia de los E2E. Los menores
M1-M3 conviene resolverlos antes del PR (son baratos); M4-M5 piden una decisión anotada.
