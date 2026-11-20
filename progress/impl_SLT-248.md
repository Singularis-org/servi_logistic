# impl SLT-248 «Actualizar zonas: también las reprogramadas y en novedad pasan a la zona nueva»

Tanda única (ruta ligera), backend_dev, 2026-11-20.

## Archivos modificados
- `lib/utils/estados-bodega-satelite.ts` — `reprogramado` y `novedad` pasan a `se_mueve`; sale la clase `por_liberar`; docstring cita SLT-248.
- `lib/types/actualizacion-zonas.ts` — `MotivoSaltada` sin `por_liberar`; docstring.
- `app/(app)/ordenes/_components/ActualizarZonasButton.tsx` — sale «esperando liberación en bodega» de `TEXTO_MOTIVO_SALTADA`.
- `docs/ayuda/oficina/ordenes.md` — sale la viñeta del motivo.
- `docs/ayuda/oficina/configuracion-zonas.md` — «Las que tienen el paquete en el estante de una bodega satélite».
- Tests: `tests/unit/utils/clase-reconciliacion-zona.test.ts`, `tests/unit/repositories/zona-repository.test.ts`,
  `tests/unit/services/actualizacion-zonas-action.test.ts`, `tests/components/ActualizarZonasButton.test.tsx`,
  `tests/integration/db/reconciliar-zona-corte-vivas.int.test.ts`, `tests/integration/db/actualizacion-zonas.int.test.ts`.
- `lib/services/ActualizacionZonasService.ts`: revisado, su comentario no nombra la clase; no se toca (T2).

## Mapa R → test
| R | Test |
|---|---|
| R1801 | `reconciliar-zona-corte-vivas.int.test.ts` «SLT-248/R1801/R1802/R1805 · la matriz…» (`estado-reprogramado`, `estado-novedad` en `SE_MUEVEN`, 5 reconciliadas y 5 acciones en un lote); `actualizacion-zonas.int.test.ts` «SLT-248/R1801: confirmar actualiza las seis elegibles…»; `clase-reconciliacion-zona.test.ts` «R1801: «se mueve»…» |
| R1802 | matriz: `cd-solicitado-reprogramado` y `cd-solicitado-novedad` en `NO_SE_MUEVEN`; `actualizacion-zonas-action.test.ts` «R1726: precedencia…» (`reprogramado`/`novedad` + cobro → `cobro_en_curso`) |
| R1803 | `actualizacion-zonas.int.test.ts` «R1715/R1719/SLT-248 R1803: la vista previa…» (total 6, un grupo de 6, `SALTADAS_ESPERADAS` sin los dos); `actualizacion-zonas-action.test.ts` «SLT-248/R1803: … no se saltan» |
| R1804 | `ActualizarZonasButton.test.tsx` «SLT-248/R1804: los motivos son exactamente cuatro…» y «R1726/R1804: cada motivo…» (sin G-4, sin el texto); typecheck (`MotivoSaltada` sin `por_liberar`) |
| R1805 | `clase-reconciliacion-zona.test.ts` «R1805: cada clase…» (devolución 5) y «… (9 estados, R1805)»; `zona-repository.test.ts` «⭑ R2/R9…» (`NO_SE_MUEVEN` literal 9); matriz `ESTADOS_R1723` con 6 |
| R1806 | Sin cambios: `liberacion-reprogramada-service.test.ts` (R12 central/satélite), `devolucion-sla-service.test.ts` (R15) |

## Base desechable
Base nueva `servi_slt248_*` (CREATE DATABASE + `prisma migrate deploy` + `db:seed`, todo OK), exportada
como `DATABASE_URL`/`DIRECT_URL` en cada vitest. Los dos `.int.test.ts` corren `passed`, no `skipped`.

## Mutaciones (en `CLASE_RECONCILIACION_ZONA`, restauradas con copia y `diff -q`)
`reprogramado: "por_liberar"` ya no compila (la clase no existe); se usó el equivalente `devolucion`.
1. `reprogramado: "devolucion"` → 12 failed / 89: 5 de `actualizacion-zonas.int` (vista previa, confirmar,
   re-evaluación, R1719 mismo distrito, R1727), la matriz de `reconciliar-zona-corte-vivas.int`, `zona-repository`
   ⭑R2/R9, 2 de `actualizacion-zonas-action`, 3 de `clase-reconciliacion-zona`.
2. `novedad: "devolucion"` → 12 failed / 89, los mismos 12.
R1802 (cobro en curso protege a las dos): lo cubre la mutación 1 de SLT-224 (`cierreDetalles: { none: {} }`)
sobre la misma matriz; no se re-ejecutó.

## Salidas
- `pnpm run typecheck` (con `--max-old-space-size=8192`; sin él, OOM de node): limpio.
- `pnpm exec eslint` sobre los 9 archivos de código/test: «No issues found».
- Los 6 archivos de test tocados: 6 files, 107 passed.
- `vitest related --run` de los 3 archivos de producción: 805 files passed; 9935 passed, 26 skipped.
- `tests/**/*zona*` + `*reconcili*` + `*actualizacion-zonas*` (64 rutas): 61 files, 839 passed.
- `./init.sh` (desechable exportada, `--max-old-space-size=8192`): `INIT_EXIT=0`; test:rapido 85 files, 1191 passed / 1 skipped; 4 rojos heredados del baseline fuera de la selección.

## Veredicto
Verde: R1801-R1806 cubiertos, integraciones con base real y matadas por mutación, gate local en verde.
