# SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)» — design

> Ruta completa. Solo cambian pruebas, el baseline y `progress/`. Producción no se toca (R1209).
> El índice del grafo no tenía este worktree (`index_status`: proyecto no indexado). La exploración
> se hizo con Grep/Read sobre el árbol del worktree (= `dev` en `5b9b23de`).

## Lo que ya existe

Términos buscados: `pago_satelite`, `sin_saldo`, `caja-459`, `D64`, `registro-gestion-sin-transicion`
y `asentarCierreDia`, en `feature_list.json`, `specs/`, `progress/` y `lib/`.

- **Board:** solo esta ficha (SLT-195) habla de estas pruebas. SLT-177 «siembra del baseline» las
  midió y las dejó citándola. SLT-184, SLT-185 y SLT-187 se llevan otros rojos del mismo lote, no
  estos.
- **Specs con las reglas que estas pruebas no siguen:**
  - `specs/SLT-73-dinero-satelite-al-conciliar` (R1, R3, R10);
  - `specs/SLT-122-pago-bodega-duena` (R1, R9, R10);
  - `specs/SLT-123-pago-independiente-efectivo` (R313, R314);
  - `specs/SLT-139-pago-independiente-satelite` (R317, R336, D7);
  - `specs/SLT-124-ranking-central-sin-satelite` (R1, R12);
  - SLT-79 «Primera ruta del día solo manual con «Sincronizar ruta»» (sin spec; `progress/impl_SLT-79.md:17-18`).
- **Lo que se reutiliza:**
  - `asentarCierreDia` (`lib/repositories/_shared/asientos-cierre-dia.ts:136`). Las pruebas
    `454/455 dinero-aprobacion` ya lo llaman tras aprobar un cierre de satélite (patrón de SLT-73,
    `454/caracterizacion/dinero-aprobacion.test.ts:92-98`).
  - Para el escenario 459: la zona central que ya siembra (`cat.centralZonaId`) y el actor `maestro`.
  - En 454: el helper del mensajero central (`_escenario.ts:641-661`), por si hace falta.
- **No se re-crea nada.**

## Diagnóstico

Cada fila dice qué esperaba la prueba, qué hace hoy el código, qué regla está escrita y el
veredicto. El «primer error» sale de los motivos del baseline (`tests/baseline-rojos.json`, medido
el 2026-11-16 en la base desechable de SLT-177). Vitest solo enseña la primera aserción que cae por
caso, así que T1 vuelve a medir tras cada arreglo.

### Grupo 2 — 7 archivos

| Archivo (primer error) | Esperaba | Hace hoy el código | Regla escrita | Veredicto |
|---|---|---|---|---|
| `477-aprobacion-tras-correccion-sql-real` (`expected [] to deeply equal [cod_recaudado\|4000.00, …]`, :91) | COD en caja y tienda justo tras `e.aprobar(x)` (aprueba el `adminSatelite`) | `CierresAdminRepository.ts:2692-2695` solo asienta al aprobar si `destinoTipo === "bodega_central"` | SLT-73 R1 (D2) | **Prueba desactualizada** |
| `454/caracterizacion/cierre-rechazado` (`expected 0 to be greater than 0`, :87) | dinero > 0 tras re-solicitar y aprobar | ídem: 0 filas | SLT-73 R1 | **Desactualizada** |
| `454/caracterizacion/deshacer` (`expected [] to deeply equal ['2000.00']`, :86) | `cod_recaudado` de la vigente tras aprobar | ídem | SLT-73 R1 | **Desactualizada** |
| `454/caracterizacion/multi-dia-271` (`expected 0 to be greater than 0`, :77) | caja de C1 > 0 tras aprobar C1 | ídem | SLT-73 R1 | **Desactualizada** |
| `454/caracterizacion/dinero-aprobacion` (`pago_satelite` donde espera `pago_efectivo`, :130) | tras `asentarCierreDia`: `mensajero\|pago\|pago_efectivo\|1500.00` | el cierre se aprueba con la marca en `true` (R336); `WalletMensajeroFeedService.ts:92-103` escribe `pago_satelite = P` si la marca es `true` y el destino es satélite | SLT-139 R317, R336 (D3) | **Desactualizada.** Mismo importe: P = 1500 ≤ E = 6000, así que min(P, E) = P. Solo cambia la categoría |
| `455/caracterizacion/dinero-aprobacion` (`expected [ …(18) ] to deeply equal [ …(18) ]`, :133) | ídem, `MOVIMIENTOS_ESPERADOS` línea 175 | ídem | SLT-139 R317 | **Desactualizada** (mismo caso: 18 contra 18, cambia una categoría) |
| `454/registro-gestion-sin-transicion-sql-real` (`expected +0 to be 1`, :165) | un job `optimizacion_ruta` nuevo tras la gestión | `GestionOrdenRepository.ts:873-883` solo encola si la orden tiene coordenadas y la primera ruta del día NO está pendiente (`ruta_optimizada.calculada_at` de hoy). El escenario no siembra ninguna de las dos | SLT-79, decisión «todo manual» (`progress/impl_SLT-79.md:17-18`) | **Desactualizada. No es de dinero** (PA2) |

### Grupo 1 — 14 archivos del escenario `caja-459`

Los 14 caen en el mismo paso del escenario, antes de que corra su primera aserción. Son
`analitica-anulacion-rechazo-458`, `caja-caracterizacion-459`, `caja-invariante-tiendas`,
`como-quedo`, `efecto-movimiento-predice`, `libro-caja-a-quien`, `libro-caja-filtro-a-quien`,
`libro-caja-revision-458c`, `libro-caja-revision-458e`, `liquidacion-fechas-cr-461`,
`wallet-anulacion-458`, `wallet-comprobante-alcance`, `wallet-documento-comprobante-458` y
`wallet-registro-comprobante-458`.

- **Lo que esperaba:** `registrarRepartoMensajero` de 1000 a ese mensajero responde `ok`
  (`caja-459.ts:773-786`). Después, `registrarPagoMensajero` de 664 contra el cierre del día
  (`:796-809`), también `ok`.
- **Lo que hace hoy el código:**
  - El mensajero es de la zona satélite (`caja-459.ts:517`). Su cierre del día es `bodega_satelite`
    y lo aprueba el `adminSatelite` (`:669-675`). El escenario lo asienta a mano con
    `asentarCierreDia` (`:683-689`).
  - `LiquidacionService.imputablesDe` (`:1102-1109`) solo toma cierres `bodega_central`. Con un único
    cierre de satélite la ventana queda vacía y responde `sin_saldo` (`:586`).
  - Aunque entrara, el cierre ya tiene la marca en `true` (SLT-139 R336). El asiento escribe
    `pago_satelite = P`, y lo pendiente es 0 (SLT-139 R319, R338).
  - El pago de 664 contra ese mismo cierre también caería: SLT-122 R1 no deja a la central pagar
    cierres de satélite.
- **Reglas escritas:** SLT-122 R9 y R10 (literal: «SI el mensajero solo tiene cierres con pendiente en
  una bodega satélite, ENTONCES registrar un reparto DEBE responder `sin_saldo`»), SLT-139 D7, R317,
  R319 y R336.
- **Veredicto: el escenario está desactualizado.** No hay fallo de dinero: el código hace lo que dicen
  SLT-122 y SLT-139. D64 ya apuntaba la incoherencia: un mensajero de satélite con un cierre central
  para el premio (`progress/deudas.md:372-376`).

### ¿Hay algún fallo real?

**No se encontró ninguno.** Las siete diferencias tienen una regla escrita y aprobada por Carlos que
las explica, y el código la cumple en la línea citada. No queda ninguna regla de dinero sin escribir
que haya que preguntar. Si la re-medición de T1 enseña una aserción que no se explica con D1-D6,
se para (R1203).

## Qué cambia en cada prueba

Solo pruebas. Toda cifra nueva lleva al lado su cálculo y su regla (R1202).

### A. Aprobar y luego asentar (477, cierre-rechazado, deshacer, multi-dia-271)

Mismo patrón que SLT-73 dejó en `454/caracterizacion/dinero-aprobacion.test.ts:92-98`: tras
`e.aprobar(...)` se cuenta el dinero (debe ser 0, R1190), se llama a
`asentarCierreDia(e.tx, cierreId)` y se lee el dinero que afirma cada prueba.
- `477`: `aprobacion` ok → `dineroAlAprobar = 0` → asentar `x` → se leen `cod` y el resto de
  movimientos como hoy. Los literales no cambian: COD 4000 de la vigente; la anulada no cobra (R1192).
- `cierre-rechazado`: `trasAprobar.dinero` se lee tras asentar (`> 0`, R1191), y se añade
  `alAprobar.dinero = 0`. La re-aprobación devuelve `conflict` y no mueve dinero ni historial
  (afirmación de hoy, sin cambio).
- `deshacer`: `cod` se lee tras asentar (`["2000.00"]`, R1192), y se añade `codAlAprobar = []`.
- `multi-dia-271`: tras aprobar C1, `dineroC1AlAprobar = 0`. Se asienta C1 y `trasC1.dineroC1 > 0`
  (R1193). `trasC2.dineroC1 = 0` se queda.

¿Por qué asentar directo y no consolidar y marcar recibida? La marca escribe con su propia fecha y
añade la fila «diferencia de la satélite» (SLT-73 R11, R22). Estas pruebas no van de eso, y SLT-73
ya eligió este mismo atajo con ese motivo.

### B. `454` y `455` `dinero-aprobacion`

Un literal en cada archivo: `"mensajero|pago|pago_efectivo|1500.00"` pasa a
`"mensajero|pago|pago_satelite|1500.00"`, con el comentario «SLT-139 R317: cierre nuevo de satélite
→ `pago_satelite = P`; P = 1500 (1 entrega × 1500, tarifa de la zona)». Las otras 17 filas no
cambian (R1195). El comentario de cabecera que dice «la regla de la 44» se corrige.

### C. `registro-gestion-sin-transicion`

- Para el caso de R5 (ahora **R1196**), el escenario siembra dentro de la tx:
  - latitud y longitud en la orden `entregada`;
  - una fila de `ruta_optimizada` del mensajero con `calculada_at` de hoy y la `organizacion_id` del
    escenario (la sub-consulta de `GestionOrdenRepository.ts:814-816` filtra por empresa).
- Se añade un caso **R1197**: otra orden con coordenadas, sin ruta calculada hoy → 0 jobs nuevos.
- Si `sembrarOrden` no admite coordenadas, se añade una opción a `454/_escenario.ts`. Se escribe
  directo en la tx; no hace falta ningún helper nuevo de producción.

### D. Escenario `caja-459` (grupo 1)

Cambios en `tests/integration/db/_fixtures/caja-459.ts`:
1. **El mensajero pasa a la zona central** (`crearUsuario("Mensajero", …, cat.centralZonaId)`). Su
   `actorMensajero` también, con `zonaId = cat.centralZonaId`. El `adminSatelite` y la zona satélite
   se quedan, porque otras pruebas los leen.
2. **La tarifa del mensajero** (`:490`, 1500/164) se pone en la zona central, para que P siga
   siendo 4500.00. Si la central ya trae una fila `(zona, vehiculo null)` con otros importes, se
   actualiza dentro de la tx; nunca se crea otra (índice único por empresa).
3. **El cierre del día lo aprueba el `maestro`.** La confirmación física se pide con el alcance
   central. **Se quita la llamada a `asentarCierreDia`** (`:676-689`): la aprobación de la central
   asienta sola (SLT-73 R3, R1198). Las dependencias del asiento se pasan al repositorio de
   aprobación, como ya hace `adminRepo`, incluido
   `WalletTiendaFeedService({ TIENDA_DEBITA_FLETE_DEVOLUCION: true })`.
4. **El cierre del premio** (`:880-891`) ya es `bodega_central`. Se le corrige la nota «antes
   `bodega_satelite`».

Qué cambia en las cifras (calculado a mano, para comprobar en T1):
- **Libro del mensajero, por el cierre del día (SLT-123 R313):** desaparece
  `cierre_dia|pago|pago_efectivo|2000.00`. Antes salía de min(P = 4500, E = 2000) = 2000.
  `pago_devengado|4500.00` se queda (`caja-caracterizacion-459.test.ts:400-410`).
- **Caja (SLT-123 R314):** `egreso_pago_mensajero = 4500.00`, como hoy.
- **Libro por tienda:** sin cambio (R1201).
- **Lo pendiente del mensajero y su cuenta por pagar** (`caja-459.ts:1024` y quien la lea): sube
  2000.00, porque el efectivo ya no se descuenta. Cada cifra afectada se recalcula a mano con
  `derivarPendienteCierre` y la regla SLT-123 R321.
- **El nombre de quien aprobó** en `libro-caja-a-quien:151` pasa de `adminSat` a `maestro`. No es
  dinero: solo cambia quién aprueba en el escenario.
- **Fechas de los asientos:** antes las ponía `asentarCierreDia` y ahora la aprobación. Si
  `liquidacion-fechas-cr-461` u otro archivo fija una fecha de asiento del cierre, se recalcula con
  la regla de fecha de la aprobación, citada en el comentario.

Si una cifra cambia y no cabe en esta lista, se aplica R1203: el archivo se queda en el baseline y
se pregunta.

## Control positivo (R1205)

Una mutación por archivo, o una compartida si pone rojos a varios. Cada una se aplica en el
worktree, se corre el archivo, se anota la aserción que cayó y se restaura con `git checkout --`.
Después, `git diff --name-only -- lib/` debe salir vacío. Mutaciones propuestas (el implementer
confirma que muerden y anota cuál usó):

| Archivos | Mutación | Debe caer |
|---|---|---|
| 4 de A, 454 y 455 `dinero-aprobacion` | `CierresAdminRepository.ts:2692`: quitar la condición `bodega_central`, para que aprobar una satélite asiente | `alAprobar = 0` / `[]` |
| `cierre-rechazado`, `multi-dia-271` | `asientos-cierre-dia.ts`: que `asentarCierreDia` vuelva sin escribir | dinero `> 0` tras asentar |
| `477`, `deshacer` | `deshacerGestion` sin desvincular el `cierre_id` de la anulada, o el feed de contra-entrega sin filtrar las vigentes | COD `4000` / `["2000.00"]` |
| 454 y 455 `dinero-aprobacion` | `WalletMensajeroFeedService.ts:97`: `pago_satelite` → `pago_efectivo` | la fila `pago_satelite` |
| `registro-gestion-sin-transicion` | `GestionOrdenRepository.ts:875-876`: quitar `!primeraRutaPendiente(...)` (cae R1197), o quitar el `if` entero | 0 jobs / 1 job |
| `caja-caracterizacion-459`, `caja-invariante-tiendas`, `como-quedo`, `efecto-movimiento-predice` | `WalletMensajeroFeedService`: volver a escribir `pago_efectivo = min(P, E)` con la marca en `true`, o tocar la comisión COD del feed de tienda | libro del mensajero / invariante / cifras de caja |
| `libro-caja-*` (4), `analitica-anulacion-rechazo-458` | invertir el signo o quitar un tipo en el lector que vigila cada archivo, o tocar la comisión COD | la fila o la cifra que fija cada uno |
| `wallet-*` (4), `liquidacion-fechas-cr-461` | `LiquidacionService.anularPago` sin compensar, o la fecha del asiento del pago (`inicioDelDiaEnUtc`) un día después | comprobante / anulación / fecha |

La tabla final, con la mutación usada y la aserción que cayó por archivo, va en
`progress/impl_SLT-195.md`. Un control que no pone rojo el archivo no vale: hay que buscar otra
mutación. Las salidas se leen del JSON de vitest de esa corrida, no de un resumen
(`progress/impl_SLT-177.md`, T6).

## Verificación (R1204, R1206)

- **Base desechable nueva**, con un nombre propio (p. ej. `servi_slt195_desechable`):
  - se crea con un wrapper en el scratchpad, como `con-desechable.cjs` de SLT-177, que pone
    `DATABASE_URL`/`DIRECT_URL` sin leer ni imprimir el `.env`;
  - `pnpm exec prisma migrate deploy` y luego `pnpm run db:seed`, como el CI (`gate.yml`);
  - nunca la base del `.env` ni `migrate reset`.
- `vitest run --reporter=json` sobre los 21 archivos: 0 fallos, 0 saltados, y
  `HAY_BASE_DE_DATOS = true` (un `describe.skip` no cuenta como verde).
- `./init.sh` en el worktree, con `.env` copiado antes del primer gate (si no, la integración se salta).
- E2E: el diff no toca `db/`, ni pantallas, ni dinero de producción, así que la regla de
  `docs/perfil-agentes.md` no lo pide. Si el reviewer considera que «toca dinero», se corre
  `--project=dinero` en la desechable.

## Baseline (R1207, R1208)

- Se borran las entradas de los archivos que quedan verdes (hasta 21), cada una con su bloque de 4
  líneas.
- Se añade una línea «PODA DEL 2026-11-xx (SLT-195): …» en `_lee_esto`, con el número que sale y la
  causa: «pruebas desactualizadas por SLT-73/79/122/123/139; sin fallo de producción».
- `_lee_esto` deja de nombrar SLT-195 si no queda ninguna entrada que la cite.
- La guardia de forma del baseline (`gate-cableado-arnes-v2.guardia.test.ts`) tiene que seguir en
  verde. Si alguna de sus reglas cuenta las entradas que citan SLT-195, se ajusta en el mismo cambio.

## Modelo de datos, autorización, país

- **Esquema, migraciones, RLS:** ninguno. No hay `down.sql`.
- **Multi-empresa:** las filas sembradas en las pruebas (`ruta_optimizada`, la tarifa de la central)
  llevan la `organizacion_id` del escenario y viven en su tx revertida.
- **Autorización:** no cambia. Las pruebas usan actores existentes (`maestro`, `adminSatelite`,
  `mensajero`).
- **Datos que dependen del país:** ninguno nuevo. Las cifras están en colones, como hoy.

## Alternativas descartadas

1. **Cambiar producción para que la central pueda repartir a un mensajero de satélite.** Reabriría
   SLT-122 R9/R10 y SLT-139 D7, que Carlos cerró («No se reabre»). No hay ningún fallo que lo pida.
2. **Escenario 459 en la satélite, sin reparto ni pago al mensajero** (PA1 b). Deja sin datos las
   pruebas de comprobantes, de anulación del pago y de fechas de liquidación (`wallet-*`,
   `liquidacion-fechas-cr-461`). Las sacaría del baseline vacías: «verde sin datos».
3. **Escenario 459 con un mensajero de satélite y un segundo cierre central para pagarle.** Es
   justo la incoherencia de D64: un mensajero de satélite con cierres de la central. SLT-124 R12 lo
   saca del ranking, y el escenario dejaría de parecerse a ningún caso real.
4. **Forzar la marca `pago_independiente_efectivo = false` tras aprobar, para conservar
   `pago_efectivo = 2000`.** Probaría la regla vieja (SLT-139 D5, cierres de antes), no la de hoy.
   Además escribe un estado que la aprobación actual nunca produce.
5. **En los 4 archivos de A, aprobar con el mensajero central en vez de asentar a mano.** Cambia el
   actor, el alcance de la confirmación física y lo que caracterizan (cierres de satélite, 454). El
   patrón de asentar ya lo usa SLT-73 en dos archivos hermanos.
6. **Actualizar los literales pegando lo que imprime la prueba.** Deja una aserción comparada con su
   propia fuente, que siempre sale verde. Por eso existe R1202.

## Riesgos

- **Más cifras de las previstas en el grupo 1.** Vitest solo muestra la primera aserción que cae; tras
  arreglar el escenario pueden aparecer otras. Mitigación: T1 mide todo antes de tocar literales, y
  R1203 para ante lo que no se explica.
- **Choque de archivos con otras fichas en vuelo.** SLT-43 a SLT-48 (geografía jerárquica, en vuelo)
  podrían tocar `454/_escenario.ts` o `_fixtures/caja-459.ts` (provincia y cantón). El leader lo
  mira con `scripts/archivos-en-vuelo.mjs` antes de tomar la ficha.
- **`node_modules` compartido:** no se corre `prisma generate` en este worktree mientras otro worktree
  está en el gate.

## Trazabilidad

| R | Prueba |
|---|---|
| R1190 | `477-aprobacion-tras-correccion-sql-real`, `454/caracterizacion/{cierre-rechazado,deshacer,multi-dia-271}` (dinero al aprobar = 0); `454` y `455` `dinero-aprobacion` (`alAprobar = []`) |
| R1191 | `454/caracterizacion/cierre-rechazado` |
| R1192 | `454/caracterizacion/deshacer`, `477-aprobacion-tras-correccion-sql-real` |
| R1193 | `454/caracterizacion/multi-dia-271` |
| R1194, R1195 | `454/caracterizacion/dinero-aprobacion`, `455/caracterizacion/dinero-aprobacion` |
| R1196, R1197 | `454/registro-gestion-sin-transicion-sql-real` |
| R1198, R1199 | `caja-caracterizacion-459` (pasos `aprobarCierre`, `repartoMensajero`, `anularPagoMensajero` y `pagoMensajero` en `ok`; destino del cierre), y los 14 archivos del escenario |
| R1200 | `caja-caracterizacion-459` (libro del mensajero y fila `egreso_pago_mensajero`) |
| R1201 | los 14 archivos del grupo 1 (cifras de caja y tienda sin cambio en el diff) |
| R1202, R1203 | revisión del diff (comentario por literal) + `progress/impl_SLT-195.md` |
| R1204, R1205, R1206 | JSON de vitest en la desechable + tabla de mutaciones en `progress/impl_SLT-195.md` |
| R1207, R1208 | `scripts/comparar-baseline-rojos.mjs` en el gate + `gate-cableado-arnes-v2.guardia.test.ts` |
| R1209 | `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ package.json` vacío |
| R1210 | `progress/deudas.md > D64` |
