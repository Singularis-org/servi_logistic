# Review SLT-123 «Pago al mensajero independiente del efectivo» (parte «Central») — vuelta 1

Reviewer, 2026-11-12. Rama `feature/SLT-123-pago-independiente-efectivo` @ `26751d62` (PR #145). Ruta
completa (toca dinero, esquema y migración; `complexity: high`): correcta.
Base desechable `slt123_pago`. Cliente Prisma regenerado desde el worktree antes de cada corrida
(`grep -c pagoIndependienteEfectivo` del `index.d.ts` = 85). **Otro worktree lo sobrescribió dos
veces durante la review** (conteo 0): un typecheck y dos mutaciones salieron rojos por eso. Los
descarté y los repetí con el cliente bueno, comprobado antes y después de cada corrida.

## Veredicto: RECHAZADO (CAMBIOS)

El código de producción está bien: la marca se escribe en la tx correcta y antes de los asientos.
La regla vieja queda intacta en todas las superficies que leen lo pendiente, y la migración es
aditiva, con un `down` que aborta. Hay dos bloqueantes: uno de test (R321, reparto) y uno de proceso
(tasks sin cerrar).

## Hallazgos

1. **BLOQUEANTE — R321 «ventana del reparto «Pagar»»: ningún test verifica que la marca llegue
   desde el repositorio.**
   - Dónde: el mapeo `pagoIndependienteEfectivo: row.pagoIndependienteEfectivo` de
     `lib/repositories/LiquidacionPagoRepository.ts`: `:374` (`listarCierresImputables`) y `:409`
     (`listarCierresImputablesEnAlcance`, el que usa `imputablesDe`).
   - Mutación I: quité ese mapeo (el campo es opcional en `CierreParaPagoDTO`, así que el
     typecheck no lo ve). Corrí `liquidacion-pago-repository`, `liquidacion-service` y
     `slt123-pago-independiente.int`: **sobrevive, 177/177 en verde**.
   - Efecto en producción: el reparto de `/wallet/mensajeros` aplicaría la regla vieja a los cierres
     nuevos. Un N1 con E ≥ P saldría con imputable `0.00` y su deuda caería en «deuda no imputable».
   - Es justo el riesgo de los DTO con la marca opcional. Los demás caminos sí están cubiertos
     (abajo: E, F, G, H, J, K, L, todas matadas).
   - R321 se traza solo al unit con dobles, que inyectan el campo a mano.
   - Para cumplirlo:
     - añadir a `tests/integration/db/slt123-pago-independiente.int.test.ts` un reparto (o
       `imputablesDe` vía `LiquidacionService` real con `LiquidacionPagoRepository` real) sobre N1
       que afirme imputable `3000.00`;
     - o hacer el campo obligatorio en las filas del repositorio.
     - Después, repetir la mutación I y anotarla en `progress/impl_SLT-123.md`.
2. **BLOQUEANTE (proceso) — tasks sin `[x]`** (`CHECKPOINTS.md > Especificacion` y `> Verificacion
   final`):
   - `tasks.md:125` T8.1 `./init.sh` en verde: no hay evidencia en `progress/impl_SLT-123.md` (ni
     log ni `INIT_EXIT`). El CI está verde, pero el checkpoint pide el gate local.
   - `tasks.md:126` T8.2: el contenido ya está en la bitácora (mapa R→test, mutaciones, tamaño);
     falta marcarla.
   - `tasks.md:24` T0.4 (Carlos, conteo en prod, informativo): o se anota el número o el leader la
     marca como diferida con el motivo. No puede quedar abierta en silencio.
3. **menor — R331, caso 8 de la integración**
   (`tests/integration/db/slt123-pago-independiente.int.test.ts:544`):
   - afirma caja, tienda y premios;
   - no afirma `paraLaCentral` («Debe llegar a la central»), aunque `tasks.md > Trazabilidad` lo
     promete. La conciliación analítica queda cubierta de forma indirecta (libro de tienda igual).
   - Riesgo bajo: SLT-123 no toca la satélite y su marca queda siempre en `false` (verificado en el
     caso 6). Basta con ajustar la trazabilidad o añadir la aserción.
4. **menor — comentario desfasado.** `lib/interfaces/services/ICierresAdminService.ts`, el JSDoc de
   `pendientePagoMensajero` (`:111`), sigue diciendo «`min(P, E)` menos
   los pagos VIGENTES». Ya no es cierto para los cierres con la marca.

## Checklist

- [x] **Ruta completa** (dinero + esquema + `high`); el spec tiene sus 3 archivos y
  `## Alternativas descartadas` (design §10).
- [x] **`design.md > ## Lo que ya existe`** presente y con contenido. El diff no re-crea nada:
  reutiliza `calcularSplitPago`, `derivarPendienteCierre` y `asentarCierreDia`.
- [ ] **Tasks todas `[x]`**: faltan T0.4, T8.1 y T8.2 (hallazgo 2).
- [x] **Tamaño**: `node scripts/tamano-pr.mjs` da 38/40 archivos y 1 527/1 000 líneas; está
  aceptado en `progress/features/SLT-123.md:24` (Carlos, «doy mi ok»).
- [ ] **Trazabilidad**: los 15 R tienen test. R321 (reparto) no está verificado de punta a punta
  (hallazgo 1). R331 está parcial (hallazgo 3).
- [x] **Typecheck**: `tsc --noEmit` da TC=0 y 0 errores, con el cliente comprobado antes y después.
- [x] **Lint** sobre los 39 `.ts` tocados: exit 0, sin salida.
- [x] **Unit** (8 archivos del diff): 300/300.
- [x] **Integración** (`slt123-pago-independiente.int` 13, `migracion-slt123-ida-y-vuelta` 7,
  `cierre-dia-pendiente-pago` 6, `slt73-aprobar-central-igual` 3, `slt73-migracion-retira-asientos` 6):
  35/35, sin skips.
- [x] **CI del PR #145 @ `26751d62`**: `gate-completo`, vitest x3, `e2e (dinero)` y
  `e2e (aislamiento)` en verde.
- [x] **E2E en local**: grupo `dinero` 101/101 con base nueva, anotado en la bitácora (T7.2).
- [x] **Migración**:
  - nueva (`20261114120000_pago_independiente_efectivo`); no edita ninguna ya aplicada (solo `A` en
    `db/migrations`);
  - aditiva: `ADD COLUMN ... NOT NULL DEFAULT false`, sin `UPDATE` ni backfill;
  - el `down.sql` aborta (P0001) si hay alguna marca en `true`;
  - el test de ida y vuelta lo prueba: Σ y md5 iguales, el `down` aborta, sin marcas el esquema
    queda igual y se puede reaplicar;
  - no hace falta `GRANT`: los permisos son de tabla (T0.3).
- [x] **Marca, transacción y orden**:
  - va en la misma `tx`, después del `updateMany` con guarda de alcance y antes de
    `asentarCierreDia`, solo en la rama `bodega_central`
    (`lib/repositories/CierresAdminRepository.ts:2452-2462`);
  - la integración lo prueba: el feed ve la marca ya escrita, un rollback forzado deja
    `solicitado/false` y el cliente vigilado delata una escritura fuera de la tx;
  - un cierre de satélite queda en `false` y rechazar no la toca.
- [x] **Un cierre viejo no cambia ni un céntimo**:
  - la foto `row_to_json` de V1/V2 (cierre, libro, caja, tienda, pagos) sale idéntica antes y
    después;
  - V1 tiene pendiente `2000.00`, con un `resuelto_at` posterior al despliegue (mata la regla por
    fecha);
  - V2 y S1 se concilian con la regla de la 44.
- [x] **Mutaciones reproducidas por mí** (aplicar, correr, revertir; `git status` limpio tras cada
  una):

  | # | Mutación | Resultado |
  |---|---|---|
  | A | condición del pendiente invertida (`!pagoIndependienteEfectivo`) | MATADA (24/44) |
  | B | fórmula nueva = `calcularSplitPago(P,E).pendiente` | MATADA (15/44) |
  | C | regla nueva para todos (`= true`) | MATADA: V1 y S1 de la integración, filas viejas del unit |
  | D | el feed nunca escribe `pago_efectivo` | MATADA: viejo central del unit, casos 3 y 6 |
  | E | `CierresAdminService.conPendiente` con `false` fijo | MATADA |
  | F | `LiquidacionService.pendienteDelCierre` con `false` fijo | MATADA |
  | G | `CierreDiaService.conPendientePago` con `false` fijo | MATADA |
  | H | `toResumenRow` sin la marca | MATADA (caso 3) |
  | J | `obtenerCierreParaPago` sin la marca en el mapeo | MATADA (R321, anular) |
  | K | `obtenerCierreParaPagoEnAlcance` sin la marca en el mapeo | MATADA |
  | L | `toCierrePasadoDTO` sin la marca | MATADA (2b) |
  | **I** | `listarCierresImputables[EnAlcance]` sin la marca en el mapeo | **SOBREVIVE** (hallazgo 1) |

- [x] **DTO opcional leído `=== true`**: los 6 consumidores de `derivarPendienteCierre` lo leen así,
  y los 3 repositorios reales leen la columna en todos sus `select`. Sin otros productores de
  `CierreAdminResumenRow`, `CierrePasadoDTO` ni `CierreParaPagoDTO` en `lib/` ni `app/`. La UI pinta
  el string del servidor (`CierresAdminModule.tsx:878, 1389`), sin recálculo en cliente. Hueco de
  test: hallazgo 1.
- [x] **Superficies que no cambian**:
  - la caja: el egreso es `P` en N1 y en V1, con el literal `CAJA_P3000`;
  - la tienda y los premios;
  - la Ganancia: el snapshot P no se toca y el E2E `cierres-rediseno` comprueba «Ganancia 3.000»;
  - la satélite: siempre `false`, y «La central debe» de S1 es `0.00`;
  - las descargas de `/cierres-admin`, que no llevan lo pendiente (design §8 #21);
  - no hay otro `min(P,E)` ni `LEAST(...)` de pago en `lib/` ni `app/`.
- [x] **Los 9 tests adaptados** (2 de integración y 7 E2E): cada literal sale de la regla, y lo he
  rehecho a mano:
  - `ajuste-pago-mensajero-cierre`: P ajustado 2.200, nada del efectivo, así que Disponible y «le
    debe» son **2.200**;
  - `wallet-mensajeros`: P 3.000, E 1.000, así que pagado **0** y cuenta **3.000**;
  - `incentivo-mensajero-slt68`: 3.000 + 700 = **3.700**, y tras anular **3.000** (la ganancia de
    1.000 no cambia: la caja está intacta);
  - `cierres-rediseno`: P 3.000 pendiente, así que «**Pendiente de pago**»;
  - `slt73-migracion-retira-asientos` pasa de 29 a **28**: central 7+5+1 (sin `pago_efectivo`) +
    conciliado 7+5+2 + 1 fila forzada. `CAJA` = 7 y `TIENDA` = 5 (`:57-73`). El test sigue
    vigilando lo mismo (`despuesIntactos == antesIntactos`, sin respaldo);
  - ninguno perdió aserciones sin sustituirlas. «Pago del efectivo» pasa de `toHaveCount(1)` a
    `toHaveCount(0)`, y lo que vigilaba R13 (total ajustado) sigue.
- [x] **Dinero sin floats**: `Prisma.Decimal` con `toDecimalPlaces(2, ROUND_HALF_UP)`; la lectura
  del archivo prohíbe `Number(`, `parseFloat`, `Math.` y `toNumber(`; las mutaciones M10 se
  anotaron en la bitácora.
- [x] **Trato en tú**: el diff no añade texto de UI.
- [x] **Multi-empresa**: no hay tabla nueva. La única escritura nueva va por `id` dentro de la tx,
  después del `updateMany` con guarda de alcance; la tabla tiene RLS. `e2e (aislamiento)` está en
  verde en CI.
- [x] Sin dependencias nuevas, secretos, literales de país en producción, `console.log` ni recursos
  de Ordenex. (`metodo: "SINPE"` aparece solo en un test, como en otros 84 tests.)

## Qué falta para OK

1. Un test que cubra el reparto de un cierre nuevo con el repositorio real, o el campo obligatorio
   en las filas. Que la mutación I muera.
2. Correr `./init.sh` en el worktree con `INIT_EXIT=$?` escrito en el log, marcar T8.1 y T8.2, y
   resolver T0.4 (número o diferida con motivo).
3. (menores) Ajustar la trazabilidad o la aserción de `paraLaCentral` en R331, y el JSDoc
   desfasado.

## Vuelta 2 (acotada a a60b8868..06bcd553)

Se amplió a los tipos de DTO y filas porque el arreglo toca contratos compartidos.

### Veredicto: OK

Hay una condición de proceso que no es de código: marcar T8.1 cuando el `./init.sh` del leader,
que corría mientras se hizo esta revisión, termine en verde con `INIT_EXIT=$?` en el log.

### Checklist

- [x] **Paso 0**: `npx prisma generate` corrido desde el worktree. El `index.d.ts` del cliente
  contiene `pagoIndependienteEfectivo` (85 apariciones).
- [x] **B1 (R321)**: el hallazgo está cerrado. `CierreParaPagoDTO.pagoIndependienteEfectivo` y
  `CierreAdminResumenRow.pagoIndependienteEfectivo` pasan a ser obligatorios.
  - **Mutación I reproducida.** Se quitó el mapeo en `LiquidacionPagoRepository.ts:374` y `:409`
    en un worktree temporal, porque el gate del leader corría sobre este árbol. Después se
    restauró y el worktree temporal se borró.
    - `tsc --noEmit` da exit 2, con dos TS2322 justo en `:368` y `:402`.
    - El test de integración «R321: el reparto «Pagar» con el repositorio real…» cae y los otros
      14 siguen verdes.
  - **No queda otro camino de producción que pierda la marca.**
    - `CierrePasadoDTO` sigue opcional, pero lo construye un solo mapper, `toCierrePasadoDTO`, que
      sirve a las 3 lecturas (`:1732`, `:1805`, `:1840`).
    - Ese mapper tiene un retorno estrecho `& { pagoIndependienteEfectivo: boolean }` y su select
      (`:774`) lee la columna.
    - `CierreDiaService.conPendientePago` hace un spread del DTO, así que la marca no se pierde.
    - No hay ningún `as CierrePasadoDTO`, `as CierreAdminResumenRow` ni `as CierreParaPagoDTO` en
      `lib/` ni en `app/`.
    - `CierreAdminResumenRow` sale solo de `toResumenRow` (`CierresAdminRepository.ts:827`), que
      ya obliga el compilador.
- [x] **Literales verificados a mano** con la siembra del encabezado del test.
  - N1 (central, regla nueva, P 3 000 / E 5 000, pago anulado): queda imputable P = `3000.00`.
    Con la regla vieja sería 0 y N1 no se imputaría, así que el test distingue las dos reglas.
  - V1 (marca false, P 3 000 / E 1 000): 3 000 − min(3 000, 1 000) = `2000.00`.
  - S1 `paraLaCentral`: general 4 000 − P 2 500 = `1500.00`.
  - Los tres valores están escritos como literales, no salen de la función que los genera.
- [x] **Los 17 dobles con `false`**:
  - En todos los casos el valor `false` va como default de una factory o de un literal, antes del
    `...over`, así que un override sigue ganando.
  - Antes, la marca ausente se leía con `=== true`, que daba `false`. La semántica no cambia y
    estos tests siguen vigilando lo mismo.
- [x] **m4, JSDoc**: `ICierresAdminService.ts`, el JSDoc de `pendientePagoMensajero`, dice ahora
  «nuevo: P − pagos; viejo: P − min(P, E) − pagos; los dos + premios vivos». Coincide con
  `derivarPendienteCierre` (`lib/utils/pendiente-cierre.ts:79-91`).
- [x] **m3, R331**: el caso 8 tiene ahora un segundo `it` que afirma que `paraLaCentral` de S1 es
  `1500.00`. La trazabilidad está al día.
- [x] **B2, tasks**: T8.2 está `[x]`. T0.4 queda `[ ]` con el motivo en la propia línea: es una
  consulta de solo lectura a prod, informativa y bloqueada para agentes. T8.1 queda para el gate
  del leader (ver la condición del veredicto).
- [x] **Tests del rango, sin mutar**: los 16 archivos de `tests/` del diff pasan, 539 de 539, con
  `DATABASE_URL` apuntando a `slt123_pago`.

### Hallazgos

- menor (anotación): en la primera corrida de la mutación, `DATABASE_URL` quedó apuntando a la base
  de `.env` por un error de mi sustitución. El test falló en el primer `create` dentro de
  `enTransaccionRevertida`, así que no escribió nada. Se repitió contra `slt123_pago` y esa es la
  corrida que cuenta.
