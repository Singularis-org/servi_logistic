# Review SL-39 «Wallet: IVA aparte de las ganancias»

> Reviewer, 2026-10-23. Rama `feature/SL-39-wallet-iva-aparte`, head revisado `640ddcb`, diff contra
> `origin/dev` (88 archivos). Spec R1–R27 con P1 = sí. Grafo MCP no usado: la revisión se hizo con
> Grep/Read sobre el diff.

## Verificación ejecutada por el reviewer

Todo dentro de `gate.lock` (owner «reviewer SL-39»), con `prisma generate` hecho dentro del lock, sobre
la base desechable `sl39r_review` (`migrate deploy` de las 234 migraciones). La base se borró al terminar
y el lock se liberó.

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | verde |
| `pnpm run lint` | verde |
| Los 58 archivos de test del diff (`vitest run`) | 54 verdes. 4 rojos, todos en `tests/baseline-rojos.json` y por la misma causa: «faltan la zona central… (SL-31)» en `cargarCatalogo459`. Son `caja-caracterizacion-459`, `caja-invariante-tiendas`, `ajuste-caja-anulacion-461` y `wallet-anulacion-458` (y `libro-kardex-468`, también listado). |
| `pnpm run test:guardias` | 301/302. El rojo es `dependencias-declaradas-presentes.guardia`, que está en el baseline (línea 51) y que el diff no toca (`init.sh`/`scripts/` sin cambios). |
| Integración SL-39 contra Postgres (`caja-iva-aparte-sl39`, `cierre-iva-aparte-sl39`, `aislamiento-wallet`) | 3 archivos, 13/13 verdes |

### Mutaciones (aplicadas con autocomprobación de que el texto estaba, revertidas con `git checkout`, `git diff` vacío después)

| # | Mutación | Resultado |
|---|---|---|
| m1 | `esCategoriaIva` → `false` (el IVA vuelve a ser «propio» y ganancia) | **muere**: 10 rojos (T0 integración y unit). `'3616.00'` en vez de `'3200.00'`, `'0.00'` en vez de `'416.00'` |
| m2 | `facturadoSinIva` devuelve `total` (el cierre con IVA) | **muere**: 16 rojos (C0 integración, `iva-cierre`, los dos unit de servicio). `'2116.00'`/`'1700.00'`, `'160.00'`/`'-100.00'` |
| m3 | serie diaria: `esPropio` vuelve a `=== "propio"` | **muere**: 2 rojos en `finanzas-diario` (`'2116.00'` en vez de `'1700.00'` el día) |
| m4 | `ingreso_iva_flete` vuelve a `ganancia_empresa.definicion.categorias` | **muere**: 2 rojos en `metrics-caja-naturaleza.guardia` y 1 en `analitica-financiera-service` (bruto `'1730.00'` en vez de `'1600.00'`) |
| m5 | `deEmpresa` sin el sumando del IVA (R5) | **muere**: 5 rojos (`'1700.00'` en vez de `'2116.00'` en «De la empresa») |
| control | sin mutación, los 9 archivos de arriba | 237/237 verdes |

### Las cifras del spec, contra Postgres

Las afirman con literales los dos tests de integración, en verde sobre `sl39r_review`; recalculadas a mano:

- **Caja A**: ganancia `1700.00` = (2.500 + 700) − 1.500; IVA `416.00` = 325 + 91; «De la empresa» `2116.00`
  (igual que antes); cifra principal `18500.00`; R4: 1.700 + 416 + 0 + 16.384 = 18.500. ✓
- **Cierre A**: facturado `3616.00`, IVA facturado `416.00`, ganancia = neto `1700.00`. ✓
- **Cierre B**: facturado `2260.00`, IVA `260.00`, ganancia = neto `-100.00` → «Debe 100». ✓
- **Bodega (A+B), agregado**: 5.876 − 676 − 3.600 = `1600.00`. Cada cierre del día da 1.700 / −100. ✓
- **R16**: B ve IVA `6.50` y ganancia `40.00`, sin nada de A; A no ve nada de B. ✓

## Checklist

### CHECKPOINTS.md
- [x] `requirements.md` con R1–R27 en EARS.
- [x] `design.md` con alternativas descartadas (§10, cinco; §12.8, una).
- [x] `tasks.md`: 50 tareas, todas `[x]`, ninguna abierta.
- [x] `design.md` abre con `## Lo que ya existe`, con contenido real. El diff no re-crea nada de esa
      lista: reutiliza `ingreso_iva` como referencia (R13), no toca `tarifas` (SL-21) y en
      `ingreso-empresa.ts` (SL-38) solo cambian docstrings, y después del merge de SL-38.
- [~] Assignee en Jira: no lo puedo verificar desde aquí. La rama está publicada en `origin`.
- [x] Cada `R<n>` mapea a un test concreto, y el mapa está en `progress/impl_SL-39.md`. Ver la sección de trazabilidad.
- [x] Typecheck y lint en verde.
- [ ] `gate-completo` del CI: todavía no hay PR. Lo comprueba el leader.
- [x] Flujo crítico (wallet y cierres-admin): `e2e/wallet-iva-aparte-sl39.spec.ts`, con la salida local
      en la bitácora (4 passed y una mutación que lo pone rojo). Ver el hallazgo menor 4.
- [x] Sin dependencias nuevas.
- [x] Sin secretos ni configuración hardcodeada. Sin webhooks.
- [ ] `./init.sh` del worktree: no lo corrí entero. Corrí sus piezas (typecheck, lint, los tests del diff
      y las guardias) y solo salen los rojos del baseline. La bitácora da INIT_EXIT=0 sobre `e63be32`
      con `TEST_RAPIDO_BASE=origin/dev`. El leader lo cierra antes del PR.

### docs/checkpoints-proyecto.md
- [x] typecheck y lint.
- [x] Sin tablas nuevas, sin migraciones (`git diff origin/dev...HEAD -- db/` vacío) y sin queries nuevas:
      `lib/repositories/` no aparece en el diff. Todo es derivación pura sobre la misma lectura por
      empresa. El aislamiento se probó con dos empresas y RLS real (`caja-iva-aparte-sl39` R16 y
      `aislamiento-wallet`, verdes).
- [x] Ningún recurso de Ordenex. Ningún `console.log` de secretos ni de PII: los del spec e2e solo pintan
      importes.
- [x] Capas: la regla vive en `lib/utils/` (pura) y en los servicios. La pantalla pinta strings del
      servidor (R20) y no calcula.
- [x] Impuestos: los rótulos nuevos de la wallet componen la palabra desde `IMPUESTO_ROTULO`. La tasa no
      se toca (SL-21).
- [x] Permisos: sin cambios. `verResumenCaja` sigue rechazando antes de la base (R17, `wallet-service.test`).
- [~] `e2e/dos-empresas-humo.spec.ts`: no lo corrió nadie en local. Lo corre el CI en el PR a
      producción (`AGENTS.md > Quién corre qué`), y el diff no toca queries, sesión ni `lib/db/`.

### docs/perfil-agentes.md > reviewer
- [x] Ninguna query sin `organizacion_id` y ninguna tabla sin RLS. No hay migración, así que no aplica `down.sql`.
- [~] Literales de país: ninguno en código de app. Ver los hallazgos menores 5 y 6.
- [x] Sin dependencias nuevas.
- [x] Los comentarios explican el porqué.

## Trazabilidad R1–R27

Todos los requisitos tienen al menos un test real que falla con su mutación:

| R | Test | Comprobado |
|---|---|---|
| R1–R5 | `tests/integration/db/caja-iva-aparte-sl39.test.ts` y `tests/unit/utils/caja-iva-aparte-sl39.test.ts` | m1, m5 |
| R6–R10, R20 (pantalla) | `WalletCajaIvaSL39`, `ComposicionGananciaCard`, `wallet-labels` | leídos; mutaciones de la bitácora |
| R11, R13 | `metrics-caja-naturaleza.guardia` y `analitica-financiera-service` | m4 |
| R12 | `finanzas-diario` SL-39/R12 | m3 |
| R14 | T0 escribe las filas como el feed y las separa al leer; sin migración | leído |
| R15 | sin test propio: es un «no cambia», y `ingreso-empresa.ts` solo cambia docstrings | ver el hallazgo menor 3 |
| R16 | T0 R16, con RLS real | ejecutado |
| R17 | `wallet-service.test` | preexistente |
| R18 | `caja-composicion-exhaustiva.guardia` SL-39/R18, con su autocomprobación | leído |
| R19 | `WalletDescarga` (solo cambia el fixture) y código de descarga sin tocar | ver el hallazgo menor 3 |
| R21–R23, R25 | `tests/integration/db/cierre-iva-aparte-sl39.test.ts`, `iva-cierre` y los unit de servicio | m2 |
| R24, R26, R27 | `CierreMensajeroDetalleCascadas`, `CierreBodegaDetalleCascadas` y `DineroIdentidadesEnPantalla` | leídos; mutaciones de la bitácora |

## Los puntos que pidió el leader

### 3. La pantalla del cierre B («Liquidación»)

En `cierre-factura.tsx:2666-2690` el bloque «Liquidación» pinta:
- «Ingreso bruto» 2.260, con la nota «Todo lo que facturó la empresa… (flete + IVA + comisión + IVA), sin descontar nada»;
- debajo, «Debe» −100, con la nota «Ingreso sin IVA menos el pago al mensajero.».

**Lo cubre el spec:**
- R27 es exactamente la nota de esa tarjeta;
- R26 deja lo facturado con su valor;
- R24 pone la línea «IVA facturado −260» en la cascada «Lo que le queda a la empresa», que está en la misma pantalla de detalle (`CierresAdminModule.tsx:1256` y `:1272`).

Las dos cifras del bloque son verdaderas y cada una dice qué es. El bloque nunca cuadró por dentro: el
pago al mensajero va en el bloque de abajo, también antes de SL-39. No hay una cifra falsa. **No es
bloqueante.** Sí cuesta leerlo, y queda como menor 1.

### 4. Totales y descargas
- Cifra principal, «Entró», «Salió», «De las tiendas», capital y «De la empresa»: T0 los afirma con
  literales, con los mismos valores que antes de la ficha. m5 lo comprueba.
- La barra recibe el mismo `deEmpresa`.
- `LibroKardexService`, `wallet-ledger-descarga-columnas`, `BarraComposicionCaja` y los repositorios no
  aparecen en el diff.
- `NATURALEZA_POR_CATEGORIA` no cambia, así que «Es dinero de» sigue diciendo la empresa.

### 5. Aislamiento
Sin SQL nuevo. La lectura sigue entrando por `agregarPorCategoriaYTipo` con la extensión y la RLS de SL-17.
Lo prueban dos empresas con importes reconocibles (R16), en verde.

### 6. Desviaciones de la bitácora
- **Los cuatro tests del baseline.** Ninguno se debilitó:
  - cada uno añade `iva` como sumando de la identidad R7 y pasa a afirmar con literales separados la
    ganancia (−1.000) y el IVA (−130) donde antes había una sola cifra (−1.130);
  - en `caja-caracterizacion-459` los literales nuevos están recalculados a mano. Los comprobé:
    66.471,43 − 1.492,21 = 64.979,22; 64.979,22 − 153.845,77 = −88.866,55; −89.866,55 + 1.362,21 = −88.504,34;
  - la identidad con el IVA sigue matando un IVA contado dos veces.
  - Pero ninguno corre en local ni en CI hasta SL-31. Menor 2.
- **`ICierreBodegaService.ts` tocado.** Es necesario: ahí vive el tipo de `cierres[]`.
- **El caso «0.10 + 0.20» borrado de `iva-cierre.test`.** Correcto: tras `toFixed(2)` no distinguía `Number` de `Decimal`.
- **Docstrings de `ingreso-empresa.ts` (`e63be32`).** Se tocaron después del merge de SL-38, como el
  design §12.3.4 permitía. La línea de T7 «diff de `ingreso-empresa.ts` vacío» quedó desfasada. Menor 3.

## Hallazgos

1. **menor**: «Liquidación» del cierre (`cierre-factura.tsx:2666-2690`). «Ingreso bruto» (con IVA) y
   «Debe» (sin IVA) quedan juntos sin una línea de IVA entre ellos. El usuario tiene que leer la nota o la
   cascada de arriba para cuadrarlo. Además, el panel «Ingreso de la empresa» y el KPI «Total de la
   empresa» siguen llamando «de la empresa» a un total que lleva IVA. Lo permite el alcance aprobado
   (R26: lo facturado no cambia). Propuesta: un renglón «IVA facturado» en «Liquidación», como seguimiento
   o dentro de SL-40. Decide el leader con Carlos.
2. **menor**: los literales nuevos de `caja-caracterizacion-459`, `caja-invariante-tiendas`,
   `ajuste-caja-anulacion-461` y `wallet-anulacion-458` no los ejecuta nadie hasta SL-31. Son cuentas
   correctas a mano, pero no están verificadas contra Postgres. Cuando SL-31 los encienda, hay que
   confirmar que salen verdes.
3. **menor**: R15 y R19 se apoyan en «el código no cambia» más que en un test que mida algo.
   `libro-kardex-468`, que la bitácora cita para R19, está en el baseline y no corre. Además, la bitácora
   (T7) dice que el diff de `ingreso-empresa.ts` está vacío y ya no lo está: hay 12 líneas de docstring,
   sin código.
4. **menor**: `e2e/wallet-iva-aparte-sl39.spec.ts` hace `test.skip` salvo con `SL39_UI=1`. En CI no corre
   nunca, así que la cobertura E2E del flujo crítico es solo local.
5. **menor**: el docstring nuevo de `gananciaEmpresa` (`lib/utils/ingreso-empresa.ts`) dice «el IVA
   cobrado es de Hacienda». Es el nombre de un fisco concreto. Mejor «del fisco», como en
   `iva-cierre.ts`. Es un comentario, no un literal de app.
6. **menor**: `IVA_FACTURADO_LABEL` («IVA facturado») escribe la palabra suelta, en vez de componerla desde
   `IMPUESTO_ROTULO` como la wallet. Es coherente con el resto de `cierres-admin`, que ya escribe «IVA» en
   todos sus rótulos. SL-21 lo tendrá que barrer.

Sin hallazgos bloqueantes.

## Veredicto

**OK.** R1–R27 están trazados a tests reales. Las cinco mutaciones de dinero mueren. Las cifras del spec
(1.700 / 416, «Debe 100» y bodega 1.600) salen contra Postgres. Totales, barra y descargas no cambian, y la
lectura sigue siendo por empresa. Los seis menores no bloquean. El 1 conviene decidirlo antes del merge.
