# impl SLT-111 «Cifras del servidor: reparto en % y señales de la cola»

## Tanda backend_dev (T0-T4) — 2026-11-12

Base desechable propia `slt111_reparto` (local): `prisma migrate deploy` (todas aplicadas) +
`pnpm run db:seed` (catálogos). Sin `migrate reset` ni `prisma generate`. `.env` del worktree solo
leído para derivar la URL (validada en booleano: local y con la base `slt111_reparto`).

### T0 — comprobaciones

- **T0.1** `git fetch` + `git grep origin/dev`: ningún `porcentajesReparto` en `lib/` y no existe
  `lib/utils/porcentajes-reparto.ts`. `senalesCola` sigue en `CierresAdminService` (SLT-102), sin
  tocar. La rama contenía ya `origin/dev` (c451f6bb).
- **T0.2** Recalculado a mano leyendo `pagoTiendaEmpresa`, `cobradoSobreRecaudado` y `paraLaCentral`
  (`lib/utils/ingreso-empresa.ts`, restas/sumas `Prisma.Decimal` → `toFixed(2)`). Todo casa:
  - MA: 100 000,00 − 4 520,00 (4 000 + 13 %) − 1 130,00 (1 % de 100 000 + 13 %) = 94 350,00;
    empresa 5 650,00 → [94, 6]. Siembra: una entrega `montoCobrar` 100 000,00, pagos efectivo
    70 000,00 + SINPE 30 000,00, `tarifaValorFlete(Gam)` 4 000,00, `tarifaComisionCod` 1,00,
    IVA 13,00/13,00; zona `esCentral`; snapshot `general` 100 000,00.
  - MB: 3 × 10 000,00; empresa 3 × 1 130,00 = 3 390,00; tienda 26 610,00 → [89, 11]. Siembra:
    tres entregas efectivo, flete 1 000,00, comisión 0,00 (`cobraComision` false).
  - MC: `montoCobrar` nulo, sin pagos, `general` 0,00, flete 1 000,00 + 13 % → tienda −1 130,00 → null.
  - BX: 100 000,00 − 3 000,00 − 500,00 = 96 500,00 → [97, 3, 0]. Dos cierres del día (60 000/2 000/500
    y 40 000/1 000/0).
  - BY: 1 000,00 − 1 500,00 − 0,00 = −500,00 → null. Un cierre del día, en otra zona satélite
    (índice `cierre_bodega_zona_solicitado_uq`: un `solicitado` por zona).
  - Literales de la regla: [94,6], [97,3,0], [77,22,1], [89,11], [34,33,33], [100,0]: casan.
- **T0.3** Medido en `dev` ANTES de tocar producción (espía de `crearPrismaDeTestConEspia`):
  - `verCierreDetalle`: MA (1 gestión) = MB (3 gestiones). Sin N+1.
  - `verCierreBodegaDetalle`: **BX (2 cierres del día) = 40 sentencias, BY (1) = 24**. Es un N+1
    PREVIO: `CierresBodegaAdminRepository.findCierreBodegaConDetalle` lee `gestionOrden` y
    `cierreDetail` por cada `cierre_dia` (16 sentencias por día). **ABIERTO para el leader/Carlos:**
    la segunda mitad de R265 («el número de consultas NO DEBE depender del número de cierres del día»)
    no se cumple en bodega desde antes de SLT-111; según T0.3, R265 se reescribe y no se arregla aquí.
    Mientras, el test afirma lo que esta ficha sí garantiza: el servicio de bodega emite **exactamente**
    las sentencias de su repositorio (BX 40 = repo 40, BY 24 = repo 24): el reparto no añade ninguna.
    En mensajero se afirma MA = MB.

### Archivos

- `lib/utils/porcentajes-reparto.ts` (nuevo): la regla (mayor resto, céntimos `Prisma.Decimal`,
  `divToInt`/`mod`, `null` de R261; también `null` sin partes o con un importe que no es entero de
  céntimos).
- `lib/interfaces/services/ICierresAdminService.ts`, `ICierresBodegaAdminService.ts`:
  `porcentajesReparto?: number[] | null` en la rama `ok`, con doc.
- `lib/services/CierresAdminService.ts`: `verCierreDetalle` emite
  `porcentajesReparto([pagoTienda, cobradoSobreLoRecaudado], resumen.totales.general)`.
- `lib/services/CierresBodegaAdminService.ts`: `verCierreBodegaDetalle` emite
  `porcentajesReparto([resumen.paraLaCentral, resumen.totalPagoMensajero, resumen.totalIngresoBodegaRechazos], resumen.totales.general)`.
- `tests/unit/utils/porcentajes-reparto.test.ts` (nuevo, 20 casos).
- `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (nuevo, 7 casos).

### R → test (tanda backend)

| R | Test |
|---|---|
| R70 (reparto) | `tests/unit/utils/porcentajes-reparto.test.ts` · `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (señales: SLT-102, sin cambios) |
| R72 | integración «R265/R72: sin escrituras…» (huella de `cierre_dia`, `cierre_bodega`, `cierre_detail`, `gestion_orden` igual antes y después) · tests de servicio existentes verdes sin cambiar aserciones |
| R260 | unit «mayor resto…» (6 literales + orden + suma 100 + 7 partes) · integración MA, MB, BX |
| R261 | unit «los casos null» (total 0, prepagada, total negativo, parte negativa, no suman, sin partes, no-céntimos) · integración MC, BY |
| R262 | unit «aritmética exacta» · mutación 3 (`Math.round`) cae · sin `Number(`/`parseFloat(` en la regla |
| R263 | integración MA (central), MB (central y adminSatelite) |
| R264 | integración BX, BY |
| R265 | integración «R265/R72» (mensajero MA = MB; bodega servicio = repositorio). Ver ABIERTO de T0.3 |
| R266, R267, R71 | frontend_dev (T5-T6) |

### Salidas

- typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): `TC_EXIT=0`.
- lint: `pnpm run lint` `LINT_EXIT=0` (0 errores; 243 warnings previos, ninguno en los archivos de esta tanda).
- `vitest run` porcentajes-reparto (unit) + cierre-reparto-porcentajes-sql-real (integración,
  `passed`, ninguna `skipped`) + cierres-admin-service + cierres-admin-detalle-lectura +
  cierres-bodega-admin-service + cierre-iva-aparte-sl39: **6 archivos, 204 tests passed**.
- `pnpm run test:guardias`: 343/344 archivos verdes; 4 rojos en
  `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (busca el marcador
  `">>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<"` y `init.sh` dice `">>> FIN PASO 2: DEPENDENCIAS <<<"`).
  **Previo y ajeno**: `init.sh` y esa guardia son idénticos a `origin/dev`; este diff no los toca.

### T4 — mutaciones (una a una, revertidas; corridos unit + integración)

| # | Mutación | Resultado | Qué cae |
|---|---|---|---|
| 1 | empate: gana la última (`b.indice - a.indice`) | matada | unit bodega `[96,3,1]`, empate triple `[33,33,34]`, orden, 7 partes; integración BX `[96,3,1]` |
| 2 | los puntos que faltan, todos a la primera | matada | unit MA `[95,5]`, sin escala, 7 partes, resto al céntimo; integración MA `[95,5]` |
| 3 | `Math.round` por parte | matada | unit bodega `[97,3,1]`, suma 100 «expected 101», empate triple; integración BX |
| 4 | sin `null` por parte negativa | matada | unit parte negativa `[-50,150,0]`; integración BY `[-50,150,0]` |
| 5 | partes del mensajero invertidas | matada | integración MA `[6,94]`, MB `[11,89]` |
| 6 | `totalPagoMensajero` como total en bodega | matada | integración BX `null` |
| 7 | bodega no emite el campo | matada | integración BX y BY `undefined` |
| 8 | (extra) una lectura más en `verCierreBodegaDetalle` | matada | integración R265 `{bx:80, by:48}` vs `{bx:40, by:24}` |

Árbol de vuelta al original tras cada una (`cmp` contra la copia; `git diff` final solo con el cambio).

Veredicto: T0-T4 hechas; regla y emisión verdes contra Postgres real, 8/8 mutaciones matadas;
abierto R265 (N+1 previo en bodega) para el leader.
