# SL-45 «Pago a la plataforma desde la wallet» — bitácora de implementación

- Worktree: `.worktrees/SL-45-pago-a-la-plataforma`, rama `feature/SL-45-pago-a-la-plataforma`.
- Base: contenedor propio `sl45-pg` (postgres:17, `localhost:5445`), base `sl45_t`, migrada y sembrada. El
  `.env` del worktree apunta ahí. Ninguna base compartida.
- `node_modules`: junction al checkout principal (no se instala nada).
- Exploración del código con Grep/Read: el MCP `codebase-memory-mcp` no estaba entre las herramientas
  de este agente.

## Tanda 0 — T0. Estado de `dev` (2026-10-24)

1. **Última migración.** `origin/dev` = `87269af` (merge de SL-40). La última es
   `20261024120000_cobro_plataforma_blindaje_orden`. SL-41 y SL-44 no traen migraciones posteriores. Los
   timestamps de `design.md > 8` se quedan: `20261024130000` y `20261024130100`.
2. **`wallet_movimiento_tipo_categoria_check` vigente.** Lo reescriben cinco `migration.sql`
   (`20260803120000`, `20260925120200`, `20260926120100`, `20260927120100`, `20260928120100`). La última es
   `20260928120100_wallet_458_tablas/migration.sql`, l. 110-126. T2 parte de esa definición.
3. **«A quién» obligatorio.** Lo exigen dos sitios:
   - el **servidor**: `registrarEgresoConLateralesSchema` (`lib/types/wallet-laterales.ts`, l. 51-57), con
     un `superRefine` que pide `contraparteNombre` para **todo** `tipoEgreso`, con el mensaje
     `CONTRAPARTE_OBLIGATORIA`;
   - el **diálogo**: `aQuienDelConcepto` (`app/(app)/wallet/_components/wallet-conceptos-manuales.ts`, l. 533).
   El servicio (`WalletEgresoService`) no lo mira. T5 lo deja opcional para `pago_plataforma` en el schema.
   El diálogo es de T7.
4. **El lector `egresos` no filtra por categorías.** `EgresoCajaDocumentosRepository.estadoDeDocumentos(ids)`
   solo filtra por los ids que recibe. Los ids los elige `tipoDeDocumentoOriginal`
   (`lib/services/WalletService.ts`, l. 108): `m.tipo === "egreso" && m.origenTipo === "gasto"` →
   `egreso_caja`. Un pago con origen `gasto` entra solo. **T6 no toca código.**
5. **`WalletMovimientoRepository.crearMovimientoRegistrado`** (l. 205): firma
   `(mov, registro, laterales = {})`, y abre él mismo `this.prisma.$transaction(async (tx) => …)`. Su
   primera sentencia es `crearMovimientos(tx, [mov])`, un `createMany` con `skipDuplicates`. Si la clave de
   idempotencia ya existe, devuelve `0` y el servicio relee el original.
   **Aviso para T5.** El `antes` va justo antes de `crearMovimientos`. Si el tope corre ahí sin mirar la
   clave, el reenvío de un pago ya registrado choca con el tope antes que con la idempotencia. Pasa, por
   ejemplo, al reenviar 1.000 con una deuda de 500 (bajó por ese mismo pago): respondería
   `validation_error` y no `ya_registrado`. `design.md > 6` exige lo contrario. T1 lo cubre con ese caso
   exacto.
6. **Tests que fijan listas.**
   - `TIPO_EGRESO_MANUAL_SEED`:
     - `tests/unit/guards/egreso-indemnizacion-emisores.test.ts`, l. 139, con la regex
       `TIPO_EGRESO_MANUAL_SEED = \["gasto_variable", "sueldo"\]`. **No estaba en `## Archivos esperados`**:
       se añade antes de T1;
     - `tests/unit/services/wallet-egreso-service.test.ts`, l. 462: `toEqual` literal de
       `TIPO_EGRESO_MANUAL_A_CATEGORIA`.
   - Los diez conceptos: `tests/unit/components/wallet-conceptos-manuales.test.ts` (l. 79, 97, 116, 194,
     229, 281, 401, 535). Es de T7.
   - Las categorías propias: no hay ninguna lista literal en `caja-clasificacion-459`, `caja-composicion-exhaustiva`
     ni `caja-derivaciones`, porque recorren los `Record`. Sí la tiene
     `tests/unit/analytics/metrics-caja-naturaleza.guardia.test.ts` (l. 174), que ya estaba previsto. El resto
     de los diecinueve tests que importan `NATURALEZA_POR_CATEGORIA`, `LIQUIDEZ_POR_CATEGORIA` o
     `WALLET_EGRESO_NOMBRADO_SEED` se comprueba en T3 con `vitest related`.
