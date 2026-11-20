# Review SLT-193 «Botones de 44 px pendientes en la PWA del mensajero»

Fecha: 2026-11-17. Ruta ligera, zona frontend. Diff revisado: `b2e872ee..5789293d` (solo lo propio de
SLT-193; queda fuera el merge de SLT-190 «Recoger y Recolección según el canvas»). Worktree
`.worktrees/SLT-193-botones-44-pwa-mensajero`, rama `feature/SLT-193-botones-44-pwa-mensajero`.

## Veredicto: CAMBIOS (RECHAZADO)

El código está bien: los 15 R tienen test, las 15 mutaciones murieron y el escritorio no cambia.
Los dos bloqueantes son de cierre y los resuelve el leader, no el implementer: falta el marcador de
tamaño y faltan T4 y T6 (`./init.sh`). El código no necesita otra vuelta del implementer.

## Checklist

- [x] **Ruta.** Ligera correcta: no toca dinero, permisos, autenticación, integraciones ni webhooks.
  Es solo de clases y del montaje del escáner.
- [x] **Trazabilidad.** Cada R910-R921 y R925-R929 tiene un test que lo verifica. Mapa en
  `progress/impl_SLT-193.md:26-48`. Lo comprobé mutando el código (abajo).
- [ ] **Tasks.** T4 y T6 siguen en `[ ]` (`requirements.md:262`, `:277`). Su «Hecho» pide
  `INIT_EXIT=0` y el mapa R→test en `progress/features/SLT-193.md`, y no hay ninguna de las dos cosas.
- [ ] **Tamaño.** `node scripts/tamano-pr.mjs` da rojo: 61/40 archivos, porque SLT-190 aún no está
  en `dev`. `progress/features/SLT-193.md` no lleva la línea `<!-- tamano-pr-aceptado: … -->`.
- [x] **CHECKPOINTS / checkpoints-proyecto.** No toca `db/`, migraciones, `organizacion_id`, dinero
  ni literales de país, ni añade dependencias. No hay `design.md` (ruta ligera). El spec reutiliza
  `TACTIL_MOVIL`, `size="icon-touch"`, `CLASE_INFO_TACTIL` y `sinEncabezado`, y no re-crea nada.
- [x] **Typecheck.** `pnpm typecheck`, exit 0.
- [x] **Lint** de los archivos tocados: 0 errores y 1 aviso, que ya existía (`GestionarOrdenPanel.tsx:73`).
- [x] **Tests de componente.** Los 14 archivos de test del diff, con la guardia: 278/278 en verde
  (base `servi_slt193_desechable`).
- [x] **Guardias.** `pnpm run test:guardias`: 354/355. El rojo es
  `dependencias-declaradas-presentes.guardia.test.ts` y está en `tests/baseline-rojos.json`; no es un
  hallazgo.
- [x] **E2E.** `e2e/pwa-mensajero-botones-44.spec.ts --retries=0` (`E2E_PUERTO=3193`, desechable):
  5/5 en verde. Los vecinos (`pwa-mensajero-reparto`, `-recoger-recoleccion`, `recepcion-satelite`,
  `mis-asignaciones`, `pwa-mensajero-cierre-dia`) los corrió el implementer, 21/21. Ningún E2E de
  `e2e/` busca los encabezados ni las descripciones que se quitaron de las tarjetas: lo comprobé con
  grep.
- [x] **Reglas de Carlos.**
  - **Un solo escáner.** Hay 7 `<EscanerModal` y todos llevan `titulo`. Se borraron la rama sin barra
    y la X del `Dialog` (`EscanerModal.tsx:127`, `showCloseButton={false}`). Ninguna pantalla pinta un
    cierre propio.
    - `VerificarGuiaGate`, `cierre-confirmacion-fisica` y `RecepcionContinuaPagina` no son diálogos
      de escáner: no son variantes.
    - `QrScanner.tsx` («Cerrar cámara») no se toca.
  - **Escritorio sin cambios.** Toda clase nueva en código compartido lleva `max-md:`:
    - `TACTIL_MOVIL` en el encabezado;
    - `max-md:justify-center` en `NotificationsBell.tsx:263`;
    - `ITEM_MENU_TACTIL_MOVIL = "max-md:h-11"` en `Sidebar.tsx:67`;
    - `CLASE_INFO_TACTIL_MOVIL` en `FilaGestion.tsx:225,486`.

    `components/ui/*` no se toca. La hamburguesa ya era `md:hidden`.
  - **El (i) flotante de Detalle** (`PosOrderCardDetalle.tsx:93`) no se toca: R918.
  - **`CLASE_INFO_TACTIL`** se reutiliza desde `texto-entero.ts`, con re-export en `PosOrderCardDetalle`.

## Mutaciones (todas revertidas; `git status` limpio)

| # | Mutación | Resultado |
|---|---|---|
| M1 | `EscanerModal`: `showCloseButton={true}` (vuelve la X) | rojo, 5 casos de `EscanerModal.test` (R925) |
| M2 | `EscanerModal`: «Cerrar» `icon-sm` | rojo, R925 × 3 disparadores |
| M3 | `EscanerGuiaReparto`: botón «Cerrar» propio | rojo en la guardia (cierre propio) |
| M4 | `OrdenesListado`: sin `titulo=` | rojo en la guardia (`titulo=`) |
| M5 | `Sidebar`: `h-11` sin `max-md:` | rojo, R914 y R915 |
| M6 | `LogoutButton` sin `TACTIL_MOVIL` | rojo, R911 |
| M7 | `TemaToggle` + `min-h-11` sin prefijo | rojo, R913 |
| M8 | `FilaGestion`: `CLASE_INFO_TACTIL` (todos los anchos) | rojo, R919 |
| M9 | `EscanerRecepcionOrigen` suelta con encabezado | rojo, R579/R927 (2 casos) |
| M10 | `CamaraDelBuscador` con título propio | rojo, R927 |
| M11 | Mosaico sin `min-h-11` | rojo, R910 |
| M12 | `NotificationsBell` sin `TACTIL_MOVIL` | rojo, R911 (3 casos, con y sin pendientes) |
| M13 | `CLASES_BOTON_INFO` a `-inset-3.5` | rojo, R920 (7 casos) |
| M14 | `EscanerGuiaReparto` sin `sinEncabezado` | rojo, R927 |
| M15 | Nota de Detalle sin `CLASE_INFO_TACTIL` | rojo, R916 |

La guardia muerde en sus dos reglas (M3, M4). La mutación de R918 la hizo el implementer y no la
repetí.

## Hallazgos

### BLOQUEANTE

1. **Falta el marcador de tamaño.** Archivo: `progress/features/SLT-193.md`, sección `## Decisiones`, líneas 18-27.
   - Hoy `scripts/tamano-pr.mjs` mide 61/40 archivos contra `dev`, porque el merge de SLT-190 aún no
     está allí, y sin el marcador `./init.sh` sale en rojo (`docs/gate.md:371-373`). La aceptación de
     Carlos está en `requirements.md:219` (P5), pero la línea mecánica no existe.
   - Arreglo: el leader añade
     `<!-- tamano-pr-aceptado: 2026-11-17 · <frase de Carlos>; 40 archivos propios, 61 hasta que #201 entre en dev -->`.
   - Cuando SLT-190 entre en `dev`, lo propio son 40 archivos (`git diff --stat b2e872ee..5789293d`
     sin `specs/` ni `progress/`). Es justo el tope, no lo supera.
   - Los 3 archivos extra sobre los 37 previstos se justifican:
     - `tests/components/EscaneoContinuo.test.tsx`: +2/-2, solo `titulo=`. Lo exige el typecheck,
       porque `titulo` pasa a ser obligatorio.
     - `tests/components/NotificationsBell.test.tsx`: cubre «con y sin pendientes» de R911; la
       píldora no se pinta en `PageHeader.test`. M12 lo confirma.
     - `playwright.config.ts`: +2, registra el spec en el proyecto `reparto`, como exige
       `e2e-sin-saltos`.
2. **T4 y T6 sin cerrar.** Archivo: `specs/SLT-193-botones-44-pwa-mensajero/requirements.md:262,277`.
   - Falta `./init.sh` con `INIT_EXIT=0`, y el mapa R→test no está en `progress/features/SLT-193.md`
     (vive solo en `impl_SLT-193.md`).
   - Arreglo: el leader corre el gate con la base desechable, copia o enlaza el mapa en la ficha y
     marca T4 y T6. El E2E ya está en verde.

### menor

3. **La guardia solo mira los archivos que montan `<EscanerModal`.**
   - Archivo: `tests/unit/guards/escaner-un-solo-cierre.guardia.test.ts:48-52`.
   - Un «Cerrar» añadido dentro de una tarjeta que vive en otro archivo no salta:
     `EscanerGuiaCard.tsx`, `EscaneoContinuo.tsx`, el cuerpo de `EscanerRecepcionOrigen` o
     `EscanerRecepcionBodegaCentral`. Coincide con lo que pide R928, pero deja un hueco.
   - Al revés, la guardia mira el archivo entero y no el diálogo: un «Cerrar» legítimo de OTRO
     diálogo en `OrdenesListado.tsx` o `BuscadorFiltros.tsx` la pondría en rojo (falso positivo).
4. **El patrón del botón propio es estrecho.** Archivo: el de la guardia, línea 60.
   - `/>\s*Cerrar\s*</` no ve `{"Cerrar"}` ni una constante distinta de `ESCANER_CERRAR_LABEL`.
   - El typecheck no lo compensa.
5. **R916 en chat, panel y hoja del mapa se comprueba leyendo el código, no renderizando.**
   - Archivo: `tests/components/botones-44-pwa-mensajero.test.tsx:145-171`.
   - Muerde, porque la mutación del implementer en `HojaParadaMapa` dio rojo. Pero solo Mosaico y
     `FilaGestion` se miden en el navegador.
   - Aceptable para la ruta ligera.
6. **El spec dice 37 archivos y el PR lleva 40.** Archivos: `requirements.md:5,219,284`.
   - Conviene ajustarlo al anotar el marcador (bloqueante 1).
7. **El fixture del test lleva dos títulos.** Archivo: `tests/components/EscaneoContinuo.test.tsx:66-69`.
   - Monta `TarjetaEscaneoContinuo` con su `titulo` y sin `sinEncabezado` dentro de un `EscanerModal`
     con `titulo`: dos títulos en el fixture.
   - No afecta al producto, pero contradice R927 como ejemplo de uso.

## Comandos (base `servi_slt193_desechable`)

- `pnpm exec vitest run` de los 14 archivos de test del diff: 278 passed, exit 0.
- Las 15 mutaciones, con `vitest run` de su test: las 15 en rojo, todas revertidas.
- `pnpm typecheck`: exit 0. `eslint` de los archivos tocados: exit 0.
- `pnpm run test:guardias`: 1 archivo rojo, el del baseline.
- `playwright test e2e/pwa-mensajero-botones-44.spec.ts --retries=0`: 5 passed (18,4 s).
- `node scripts/tamano-pr.mjs`: 61/40 archivos, 719/1000 líneas de producción y 2003/3000 de tests,
  contra `dev` y con SLT-190 incluido.

## Vuelta 2 (acotada a 8c2e004a..838b2431)

Commits: b6d33ca5 (menores), 129c9cde (merge de origin/dev con SLT-190 dentro), 1b6dd446 (marca de
tamaño) y 838b2431 (T4/T6 y mapa R→test).

### Veredicto: OK

### Hallazgos de la vuelta 1

| # | Estado | Cómo se comprobó |
|---|---|---|
| M1 marcador de tamaño | cerrado | `progress/features/SLT-193.md:19`: «Acepto 41». `scripts/tamano-pr.mjs` da 41/40 como AVISO aceptado (216/1000 líneas de producción, 1184/3000 de tests), ya medido contra `dev` sin SLT-190. |
| M2 T4/T6 | cerrado | `requirements.md:263,278` en `[x]`. `INIT_EXIT=0` sobre 1b6dd446 (`features/SLT-193.md:36`). El mapa R→test está en Tandas (`:37-38`) y cubre R910-R921 y R925-R929. |
| m3 alcance de la guardia | cerrado | La guardia sigue el contenido de cada `<EscanerModal>` y de sus envoltorios (`RecibirPaquetesEntrada`), y también los componentes que monta, aunque estén en otro archivo. Excluye `acciones` y los otros diálogos del archivo. |
| m4 formas de «Cerrar» | cerrado | Detecta texto JSX, `{"Cerrar"}`, cualquier prop `"Cerrar"`, una constante cuyo valor es «Cerrar», `DialogClose`, `showCloseButton` y `ESCANER_CERRAR_LABEL`. Las piezas tienen tests propios, y «Cerrar cámara» queda fuera. |
| m5 R916 leído del disco | aceptado como estaba | — |
| m6 cuenta del spec | cerrado | `requirements.md:7,291`: 41 reales, 37 previstos más 4 justificados. |
| m7 dos títulos | cerrado | `EscanerModal.tsx:145-147` monta su contenido bajo `DentroDeEscanerContext`, y `EscanerGuiaCard.tsx:136-137` hace `sinEncabezado = pedido \|\| dentroDeEscaner`. `EscaneoContinuo.test.tsx` cubre las dos caras: dentro del escáner, un solo título; fuera, la tarjeta conserva su encabezado. |

### Mutaciones de esta vuelta (revertidas; `git status` limpio)

| # | Mutación | Esperado | Resultado |
|---|---|---|---|
| V1 | `<button>Cerrar</button>` en el cuerpo de `EscanerGuiaCard.tsx`, un archivo que no monta `EscanerModal` | rojo | rojo: «nada de lo que vive dentro del escáner…». Antes este caso se le escapaba. |
| V2 | `cerrarLabel={"Cerrar"}` en la tarjeta suelta de `EscanerRecepcionBodegaCentral` | rojo | rojo |
| V3 | función ajena con `<button>Cerrar</button>` en `OrdenesListado.tsx`, fuera del escáner | verde (sin falso rojo) | verde, 11/11 |
| V4 | `DentroDeEscanerContext.Provider value={false}` | rojo | rojo: R927 «un único título» en `EscaneoContinuo.test` |

### `DentroDeEscanerContext` no toca nada fuera del escáner

- El Provider envuelve solo los hijos dentro de `DialogContent` (`EscanerModal.tsx:145-147`). Las
  `acciones` se pintan fuera (`:182`), así que el disparador de «Recibir paquetes» no hereda el
  contexto.
- El valor por defecto es `false`, así que siguen como estaban:
  - `cierre-confirmacion-fisica.tsx`, que monta su `EscanerGuiaCard` en otro diálogo;
  - `RecepcionContinuaPagina` (modo página);
  - las rutas `/ordenes/recibir` y `/recepcion-satelite/recibir`.
- `vitest related` de `EscanerGuiaCard.tsx`, `EscanerModal.tsx`, la guardia y `EscaneoContinuo.test`
  pasa 210 archivos y 3140 tests en verde, entre ellos `CierresAdminConfirmacionFisica.test` y
  `EscanerGuiaCard.test`.

### El merge con dev

- 129c9cde no cambia ningún archivo frente a b6d33ca5: `git diff --name-only b6d33ca5 129c9cde`
  sale vacío.
- `dev` (8a6a07a7) tiene el mismo árbol que b2e872ee, el HEAD de SLT-190 que ya estaba en la rama.
- Los archivos compartidos con SLT-190 no cambian por el merge.

### Comandos (base `servi_slt193_desechable`)

- `pnpm typecheck`: exit 0.
- `vitest related --run` de los 4 archivos de arriba: 210 archivos, 3140 passed y 17 skipped, exit 0.
- Las mutaciones V1-V4, con su test: lo esperado en los 4 casos.
- `playwright test` de `pwa-mensajero-botones-44`, `pwa-mensajero-recoger-recoleccion` y
  `recepcion-satelite`, con `--retries=0`: 13 passed.

### Nuevos hallazgos

Ninguno bloqueante.
- **menor (nota):** la guardia recorre todo lo que monta el contenido del escáner. Un «Cerrar»
  legítimo que se añada en el futuro dentro de esa cadena, por ejemplo en un sub-diálogo de una
  tarjeta, la pondrá en rojo. Es lo que pide R928 («ningún cierre propio dentro»), así que no hay
  que cambiar nada.
