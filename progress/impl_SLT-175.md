# SLT-175 «Pruebas R621/R623 con datos propios y guardia R631 con imports indirectos» — bitácora de implementación

backend_dev, 2026-11-16. Ruta ligera, en primer plano, sin subagentes. Grafo no usado: el worktree es
nuevo y todo lo tocado son tests; Grep/Read.

## Base desechable

- Nombre: **`servi_slt175_desechable`** (mismo servidor Postgres local del `.env`). Hay que borrarla
  al cerrar la ficha.
- Creada con un script de un solo uso en el scratchpad (`create database`), luego
  `pnpm exec prisma migrate deploy` contra ella. **Sin `db:seed`.** Nunca `migrate reset`.
- `DATABASE_URL` de la desechable solo en el entorno del proceso de vitest (y `DIRECT_URL` quitada),
  sin imprimirla.

## T1 — Medición antes de tocar nada

### Primer rojo de cada archivo sql-real (base solo con migraciones)

| Archivo | Primer rojo |
|---|---|
| `cierre-desglose-por-tienda-sql-real.test.ts` | `beforeAll` (`:113`): «hay DATABASE_URL pero la tabla `orden` esta vacia: sin FKs no se puede sembrar el corpus». 4 skipped. |
| `cierre-bodega-desglose-por-tienda-sql-real.test.ts` | `beforeAll` (`:129`): el mismo mensaje. 4 skipped. |

Los dos son el de falta de datos: la causa es la del baseline. Se sigue.

### Caminos de valor desde los servicios de dinero

Script de un solo uso (scratchpad, `medir.ts`, con el recorrido de R676: imports de valor, `import type`
y `{ type X }` puros fuera, alias `@/` y relativos, BFS por primer módulo). 19 servicios de dinero,
112 módulos leídos, `lib/utils/ingreso-empresa.ts` incluido, 0 especificadores sin resolver.

| Servicio | Primer módulo (import) | Cadena |
|---|---|---|
| `CierreBodegaService.ts` | `lib/services/cifras-bodega-descarga.ts` (`CierreBodegaService.ts:33`) | → `lib/utils/cifras-cierre-bodega.ts` |
| `CierreBodegaService.ts` | `lib/services/CierresAdminService.ts` (`CierreBodegaService.ts:40`) | → `lib/utils/cifras-cierre.ts` |

Exactamente los dos de `## Medición` del spec. No hay caminos nuevos: no se para.
