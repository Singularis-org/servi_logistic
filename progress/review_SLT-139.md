# Review SLT-139 «Pago al mensajero independiente del efectivo: satélite» — vuelta 1

Reviewer, 2026-11-12. Ruta completa (toca dinero, esquema, enum y migraciones). Diff `origin/dev...HEAD`
(HEAD `5bcf8898`, con SLT-123 y SLT-112 ya en `dev`). Base de tests `slt139_satelite`; cliente Prisma
con `pago_satelite` comprobado antes de correr nada. Ningún archivo de código editado; las mutaciones se
revirtieron con `git checkout -- <archivo>` (árbol limpio tras cada una).

## Checklist

- [x] **Ruta**: completa, con requirements (EARS) + design + tasks. Toca dinero: la ruta es la correcta.
- [x] **Trazabilidad**: R317-R319, R322-R324, R329, R330, R333-R338, R340-R345 tienen test que los verifica
  (mapa en `progress/impl_SLT-139.md > Mapa R → test`, comprobado contra los tests y con mutaciones).
- [~] **Tasks**: todas `[x]` salvo T0.4 (diferida, informativa, consulta a prod), T12.1 (gate del leader,
  en curso), T12.2 (contenido ya en la bitácora, sin marcar) y T12.3 (Preview con Carlos, posterior al
  PR). Ver m5.
- [x] **Tamaño**: 45/40 archivos, 2 472/1 000 líneas; aceptado por Carlos en `progress/features/SLT-139.md`
  («hasta 45 archivos»): `tamano-pr.mjs` da AVISO, no rojo.
- [x] **Lo que ya existe** (`design.md:9`): presente, con 14 filas; el diff no re-crea nada de la lista
  (reusa `repartirEfectivo`, `netoDe`, `asentarCierreDia`, `derivarPendienteCierre`, el molde de
  `sumarPremiosVivosPorCierre` y el `down.sql` dinámico de SLT-68).
- [x] **Typecheck** (`tsc --noEmit`): 0 errores. **Lint** de los archivos del diff: 0 errores (7 warnings
  `_d`/`_h` sin usar en tests).
- [x] **Tests del diff** (21 archivos, con integración contra `slt139_satelite`): 500/501; el único rojo
  es `premio-ranking-devengo-migration` «`ranking_snapshot_fila` … 7 previos», listado en
  `tests/baseline-rojos.json:583` (ajeno).
- [x] **Migraciones**: dos nuevas (`20261115120000_pago_satelite_enum`, `20261115120100_pago_satelite_checks`),
  ninguna aplicada editada; el `ADD VALUE IF NOT EXISTS` va solo en la 1; la 2 rehace el CHECK
  tipo↔categoría partiendo exactamente del de SLT-68 (la última que lo tocó) y añade el de origen; sin
  INSERT/UPDATE/DELETE. El `origen_uq` (predicado de SLT-68) ya cubre `pago_satelite` → R318 en base.
  Los dos `down.sql` abortan con RAISE si hay una fila `pago_satelite`; el del enum quita solo ese valor
  leyendo `pg_enum`. `migracion-slt139-ida-y-vuelta` verde.
- [x] **Multi-empresa**: sin tabla nueva. `sumarPagadoSatelitePorCierre` probado con dos empresas (int
  caso 11: B tiene un `pago_satelite` colgado del MISMO id de NS y A no lo ve). Ver m4 para la lectura
  por rango.
- [x] **Sin literales de país/moneda, sin Ordenex, sin `Number`/`parseFloat`/`toNumber`** en el código
  nuevo (grep del diff de producción).
- [x] **E2E**: `dinero` 106/106 tras el merge con SLT-112 (`progress/impl_SLT-139.md:277`).
- [x] **Capas**: lógica en services, lecturas en repositories, cableado en actions.
- [x] **Comentarios**: explican el porqué.

## Verificación de los puntos que pidió el leader

**Un cierre de satélite viejo no cambia ni un céntimo.** La regla la decide solo la marca:
feed (`WalletMensajeroFeedService.ts:81-92`), pendiente (`pendiente-cierre.ts:114`), consolidación
(`CierreBodegaService.ts:308-318`). La marca solo la pone `resolverCierre` (único `updateMany` que pasa
un `cierre_dia` a `aprobado`; revisados los otros nueve). VS (viejo de satélite) en la int: libro
devengo 3000 + `pago_efectivo` 2000 (caso 5), pendiente 1000.00 antes y después (casos 3 y 6); VC
(viejo central) idéntico en 5 tablas (caso 1); conjunto «V solo» de la consolidación = el número de antes
(unit). Mutaciones reproducidas:

| # | Mutación | Resultado |
|---|---|---|
| R1 | feed decide por destino y no por marca (viejo de satélite → `pago_satelite`) | muerta (int casos 5, 12) |
| R2 | «La central debe» reparte el efectivo de TODOS los cierres (código de antes) | muerta (unit ×3 + int caso 4) |
| R3 | neto sin restar Σ P de los nuevos | muerta (unit ×3 + int caso 4) |
| R4 | pendiente ignora lo pagado por la satélite | muerta (unit filas 8-11 + int caso 6) |
| R5 | cierre viejo calculado como nuevo (P completo) | muerta (14 unit) |
| R6 | la marca no se pone al aprobar | muerta (15 int) |
| R7 | rango `gte/lt` → `gt/lte` | **sobrevive** (m1) |
| R8 | rango sin `mensajeroId` | muerta (accion-real) |
| R9 | rango del mes en UTC en vez de la zona | muerta (unit + accion-real) |
| R10 | `resumenGanancia` salta el cierre sin cifra en vez de `sin_dato` | muerta (unit) |
| R11 | `conPendiente` sin la lectura no lanza | muerta (unit R335) |
| R12 | `LiquidacionService` sin la lectura no lanza | muerta (unit R344) |
| R13 | `pago_satelite = min(P,E)` en vez de P | muerta (int ×5; NS tiene E < P) |
| R14 | `/cierre-dia` sin inyectar `pagadoPorSatelite` | muerta (cableado + accion-real) |

**Conciliación mixta y R345.** `marcarConciliado` asienta cada cierre con su marca (caso 5: NS
`pago_satelite`, VS `pago_efectivo`, NS0 sin libro). `corregirConciliacion` no re-asienta;
`revertirConciliacion` se niega con `con_asientos` (cuenta la caja `cierre_dia`, que existe siempre que
hay `pago_satelite` porque los dos exigen P > 0). Caso 8 compara las filas antes y después de las dos.

**B1.** Las filas nuevas son obligatorias (`CierreDiaConsolidableRow.pagoIndependienteEfectivo`,
`ICierreBodegaRepository.ts:30`) y `PendienteCierreInput` es una unión discriminada (con la marca,
`pagadoPorSatelite` obligatorio). Las lecturas opcionales: `conPendiente` y `LiquidacionService` lanzan;
`/cierre-dia` da «Sin dato» (`cola-propia-vista.ts:106`) y `resumenGanancia` da `sin_dato`;
`pendienteTrasAprobar` da `"0.00"` (aceptado en `design.md:259`). Las cuatro inyecciones de producción
(las tres acciones + `resumenGananciaMensajero`) las vigila `cierre-dia-pendiente-cableado` (R14 lo
confirma). Queda m2.

**Merge con SLT-112.** La celda «Pago» y la tarjeta «Ganancia pendiente» salen del mismo
`pendientesPorCierre` (`CierreDiaService.ts:670`); lo pagado por la satélite resta en las dos; un cierre
nuevo sin la cifra da `sin_dato` en la tarjeta (R357) y «Sin dato» en la celda.

**El puerto `sumarPagadoPorSateliteEnRango`** (`PagoMensajeroMovimientoRepository.ts:437-454`): fecha =
`fecha_movimiento` (el feed la fija con el instante de la PRIMERA marca; corregir no re-asienta),
filtra `mensajeroId` y `categoria`, `gte/lt`, rango en la zona de la empresa (`inicioDelDiaEnUtc`,
`CierreDiaService.ts:764-765`), empresa por el cliente con RLS.

**Los 5 tests existentes arreglados** (verificados a mano 4):
- `slt73-marcar-asienta`: `pago_satelite 1500.00` = P del fixture (`_fixtures/slt73-cierre-aprobable.ts:118`,
  E 20000): correcto; la regla vieja de satélite queda vigilada por la int de SLT-139 (VS).
- `slt123-pago-independiente` caso 2: `S1: true` (R336); después se le devuelve `false` y los casos 6-7
  siguen caracterizando el cierre «entre los dos merges».
- `slt73-migracion-retira-asientos`: los cierres de montaje vuelven a `false`; literales intactos.
- `liquidacion-migration:277`: `pago_satelite` en `AGREGADAS_DESPUES`; sigue siendo exhaustivo.
- `premio-ranking-devengo-migration`: lista renombrada; mismo `toHaveLength(6)`.
Ninguno pierde lo que vigilaba.

**Superficies que no cambian.** Caja (`egreso_pago_mensajero = P`, el feed no toca esa parte),
`paraLaCentral` y el pago agregado (unit R341 + int caso 4 «Debe llegar» 6500.00 / pago 5500.00),
deuda de la satélite (caso 9 «Debe llegar» NS 1500.00), premios (caso 9), la central no paga NS (caso 9,
SLT-122), conciliación analítica (libro de tienda igual, caso 9).

## Hallazgos

- **m1 (menor)** — `lib/repositories/PagoMensajeroMovimientoRepository.ts:446`: la mutación
  `gte/lt → gt/lte` sobrevive. Ningún test pone un `pago_satelite` justo en las 00:00 locales del día 1
  (debe contar) ni en las 00:00 del día 1 del mes siguiente (no debe). El código está bien; falta el test
  del borde, que el comentario del método afirma.
- **m2 (menor)** — `lib/interfaces/services/ICierreDiaService.ts:432` + `lib/services/CierreDiaService.ts:761`:
  sin `pagadoPorSatelite`, «Ganancia pagada este mes» omite en silencio lo pagado por la satélite (el
  contrato R353 de SLT-112). Las otras tres lecturas opcionales fallan ruidosas y esta no. En producción
  la inyección está vigilada por test (R14 muerta), así que no es un dinero mal pintado hoy; ahora que
  `pago_satelite` existe, conviene hacerla obligatoria o devolver `sin_dato`.
- **m3 (menor, heredado de SLT-123)** — `lib/interfaces/services/ICierreDiaService.ts:357`:
  `CierrePasadoDTO.pagoIndependienteEfectivo?` sigue opcional y `conPendientePago` lo lee con `=== true`.
  Si el mapper lo perdiera, un cierre nuevo de satélite ya conciliado saldría en `/cierre-dia` con
  `P − min(P,E)` en vez de 0.00. La int caso 6 lo atrapa hoy; el patrón es el de B1.
- **m4 (menor)** — `tests/integration/db/cierre-dia-ganancia-accion-real.test.ts:204`: el
  `pago_satelite` de la empresa B es de otro mensajero (`mb`), así que la lectura por rango no
  demuestra el aislamiento entre empresas por sí sola (quitar el filtro de empresa no cambiaría nada).
  El mecanismo (cliente con RLS sobre la misma tabla) sí lo prueba el caso 11. Se cierra con un
  `pago_satelite` en B del mismo `m`, como hace el caso 11 con el origen.
- **m5 (menor)** — `specs/SLT-139-pago-independiente-satelite/tasks.md:210-213`: T12.1 y T12.2 sin
  marcar (T12.2 ya está hecho en la bitácora; T12.1 depende del gate del leader, que debe salir verde
  con `INIT_EXIT` en el log). T12.3 (Preview) y T0.4 (informativa, diferida) son posteriores al PR.
- **m6 (menor, aceptado en diseño)** — `lib/services/CierresAdminService.ts:1423`:
  `pendienteTrasAprobar` sin la lectura da `"0.00"` para un cierre nuevo (`design.md:259`). Inocuo: la
  producción la inyecta y la central no paga cierres de satélite.

## Veredicto

**OK** — sin bloqueantes. Condición del arnés que sigue en pie: el `./init.sh` del leader (T12.1) en
verde antes de abrir el PR.

## Vuelta 2 (acotada a d00fa124..0ec7ab45)

Rango: un commit (`0ec7ab45`). Toca `CierreDiaService.ts` (guarda de `resumenGanancia`),
`ICierreDiaService.ts` (comentario), los dos tests de ganancia, `requirements.md` (D14 y la nota de
SLT-112 R353), `tasks.md` (T12.2) y la bitácora. Ningún otro cambio de código.

### Checklist
- [x] **m1 (borde del mes):** M4 con dos `pago_satelite` sembrados con literales a mano
  (`2026-11-01T06:00Z` = 250, cuenta; `2026-12-01T06:00Z` = 130, no cuenta) → esperado `250.00`/1.
  Mutaciones reproducidas en `PagoMensajeroMovimientoRepository.sumarPagadoPorSateliteEnRango` y
  revertidas (`git status` limpio): `gt` → rojo (`0.00`/0); `lte` → rojo (`380.00`/2).
- [x] **m2 (`sin_dato`):** sin `pagadoPorSatelite`, `resumenGanancia` devuelve `sin_dato` antes de
  leer nada. Mutación que vuelve al comportamiento viejo (sin la guarda, satélite = 0) → rojo en el
  test nuevo («R353 (revisado en SLT-139) + R357»); revertida.
- [x] **Cableado de producción:** el único `new CierreDiaService(` de `lib/`/`app/` es
  `lib/actions/cierre-dia.ts`, que inyecta `pagadoPorSatelite: new PagoMensajeroMovimientoRepository(prisma)`;
  lo vigila `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts` (verde, 4/4). Ningún
  camino de producción cae en `sin_dato` por la guarda nueva.
- [x] **Test viejo reescrito:** lo que vigilaba («la pagada sin la satélite es la de R352») sigue en
  «con la lectura en cero, la pagada es la de R352» (3500.00/2) y además exige que la lectura se
  llame una vez; el caso «sin lectura» pasa a vigilar el comportamiento nuevo. No se debilita.
- [x] **D14:** escrita en la tabla de decisiones (leader, review 1 m2) y en «Lo que cambia de otras
  fichas» con texto vigente y test; el spec de SLT-112 no se edita.
- [x] Verificación: los 2 tests de ganancia 28/28 contra `slt139_satelite` (la integración corrió,
  no se saltó); cableado 4/4; `tsc --noEmit` 0; eslint de los 4 archivos 0. Cliente Prisma con
  `pago_satelite`.

### Hallazgos
Ninguno.

### Veredicto
**OK.** Sigue en pie la condición de la vuelta 1: `./init.sh` del leader (T12.1) en verde antes del PR.
