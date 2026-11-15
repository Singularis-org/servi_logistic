# impl SLT-170 «Contraste en modo oscuro de la tarjeta «Le queda a la empresa»» — ruta directa

## Causa
`--color-brand-soft` (#FFF8D9) es un crema FIJO sin variante oscura. Una caja `bg-brand-soft` sin
tinta propia hereda `--foreground`, que en oscuro es #F7F7F5: 1.01:1.

## Arreglo
`bg-brand-soft` → `bg-accent` (y `/40` → `bg-accent/40`). `--accent` ya existe y gira con el tema:
#FFF8D9 en claro (idéntico a brand-soft, así que el claro no cambia ni un hex), #352E0E en oscuro
(= `componer(#FFD000, #111111, 0.15)`, el mismo valor que el `dark:bg-brand/15` del resto del repo)
y se redeclara claro en los bloques `@media print` (217/224). Sin tokens nuevos ni CSS nuevo.

## Archivos
- `components/private/cierres/detalle/CifrasCierre.tsx` — `tonoCaja`: destacada `bg-accent`.
- `components/shared/HiloNotasOrden.tsx` — nota propia `bg-accent/40`.
- `components/shared/BulkUpload.tsx` — arrastrando `bg-accent`; hover `hover:bg-accent/40`.
- `tests/components/ContrasteBrandSoftOscuro.test.tsx` — nuevo (mide el DOM renderizado).
- `tests/components/CierreDiaColaPropia.test.tsx`, `tests/components/ColaCierresConsolidar.test.tsx`
  — la marca de la caja destacada pasa de `bg-brand-soft` a `bg-accent`.

## Test rojo → verde
`tests/components/ContrasteBrandSoftOscuro.test.tsx` (10 casos, claro y oscuro):
- ANTES: 5 rojos, todos en oscuro — CifrasCierre positivo 1.005, negativo 1.99; nota propia 2.21;
  BulkUpload arrastrando 1.005, hover 2.21. Los 5 de claro, verdes.
- DESPUÉS: 10/10 verdes. Más los tocados: 8 archivos, 231 tests en verde
  (incl. `marca-texto-amarillo` y `contraste-tokens`).

## Contrastes (peor texto de la caja; WCAG, aritmética de `tests/fixtures/contraste.ts`)
| Caja | Texto | Claro (igual antes/después) | Oscuro antes | Oscuro después |
|---|---|---|---|---|
| CifrasCierre destacada | cifra `foreground` | 17.70 | 1.01 | 12.64 |
| | rótulo/contexto `muted-foreground` | 9.63 | 1.99 | 6.39 |
| | cifra negativa `danger-strong` | 6.06 | (sobre crema) | 4.90 |
| Nota propia (α .40, sobre card) | `foreground` | 18.37 | 4.38 | 14.68 |
| | `muted-foreground` | 10.00 | 2.21 | 7.42 |
| BulkUpload arrastrando | igual que la destacada | 17.70 / 9.63 | 1.01 / 1.99 | 12.64 / 6.39 |
| BulkUpload hover (α .40) | igual que la nota | 18.37 / 10.00 | 4.38 / 2.21 | 14.68 / 7.42 |

## Censo de `bg-brand-soft` (app/ y components/)
| Uso | Veredicto |
|---|---|
| `analitica/.../AvisoPeriodoEnCurso.tsx:78` | OK: `dark:bg-brand/15` + `text-foreground`. |
| `configuracion/tarifas/.../TarifasZonas.tsx:67` | OK: `dark:bg-brand/15`. |
| `ordenes/.../EstatusBadge.tsx:80` | OK: par `dark:` explícito. |
| `ordenes/.../OrdenesCargaMasivaButton.tsx:84` | OK: tinta fija `text-brand-dark` (17.70 en los dos temas). |
| `ordenes/.../OrdenesCargaPreview.tsx:219` | OK: `hover:text-brand-dark`; el contador lleva su `bg-muted`. |
| `ranking/.../RankingPodio.tsx:62` | OK: `dark:bg-brand/15`. |
| `_landing/LandingServicios.tsx:48,69` | OK: landing `.tema-claro` + `text-brand-dark`. |
| `components/ui/button.tsx:50` | OK: `aria-expanded` crema+`brand-dark`; `dark:` transparente+`brand-light`; ganen cuales ganen, van en par. |
| `cierres/detalle/CifrasCierre.tsx:35` | **ARREGLADO** (el fallo reportado). |
| `shared/BulkUpload.tsx:288` (arrastrando) | **ARREGLADO**: 1.01 en oscuro. |
| `shared/BulkUpload.tsx:289` (hover /40) | **ARREGLADO**: 2.21 en oscuro. |
| `shared/HiloNotasOrden.tsx:252` (/40) | **ARREGLADO**: 2.21 en oscuro. |
| `mis-asignaciones/.../KpisMensajero.tsx` (`before:from-brand-soft`) | OK: `dark:before:from-white/10` lo pisa (feature 208). |

## Hallazgo fuera de alcance (no tocado)
`CifrasCierre` caja `aviso` (SLT-106, «La central debe»): `bg-warning-soft` (#fef3c7, fijo) tiene el
mismo patrón en oscuro — rótulo 1.91, cifra `warning-strong` 1.50, negativa 2.48. Pide su propia ficha.

## Gate
Ver la sección «Salida del gate» de abajo.

## Salida del gate (`./init.sh`, NODE_OPTIONS=--max-old-space-size=8192)
- Primer intento: `tsc` murió por heap (4 GB, `JavaScript heap out of memory`), no por un error de tipos.
- Segundo, con 8 GB: typecheck paso · lint paso · cupo por zona respetado · perfil 6/6 ·
  related 100 archivos / 1607 tests verdes · disparadores 99/100 archivos, 1316/1317 tests.
- **INIT_EXIT=1** por UN rojo ajeno al cambio: `tests/integration/db/zona-central-guarda-y-rastro.test.ts`
  › Q4 — `tx.cierreDia.create()`: «The column `(not available)` does not exist in the current
  database». La base del `.env` del worktree no tiene una migración aplicada (drift de esquema). El
  diff de SLT-170 sólo cambia clases CSS en tres componentes y tests de componente; no toca Prisma
  ni la base. No se arregló (fuera de alcance: base/backend).

## Veredicto
Arreglo hecho y medido (oscuro 1.01 → 12.64 en la tarjeta reportada; claro intacto); gate rojo sólo por drift de la base local del worktree.
