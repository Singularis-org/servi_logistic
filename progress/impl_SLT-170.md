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
Tanda 1: arreglo medido (oscuro 1.01 → 12.64 en la tarjeta reportada; claro intacto); gate rojo sólo por drift de la base del worktree. Tanda 2 abajo.

## Tanda 2 — caja `aviso` y censo de `bg-warning-soft` (pedido del leader)
`--color-warning-soft` (#fef3c7) es fijo, igual que brand-soft: bajo `text-warning-strong` (que gira a
#fbbf24) o bajo `--foreground` claro no se lee en oscuro. No hay token opaco de aviso que gire, así que
se usa el par del sistema que ya llevan `Badge` warning, Tarifas, RankingPodio o NotificationsBell:
`bg-warning-soft dark:bg-warning/15`. El claro no cambia; al imprimir `dark:` no dispara (feature 221).

### Archivos
- `components/private/cierres/detalle/CifrasCierre.tsx` — caja `aviso` (+ comentario).
- `components/private/cierres/detalle/DetalleCierre.tsx` — franja de aviso, tono warning.
- `components/private/cierres/cola/ColaCierres.tsx` — aviso de consolidar.
- `app/(app)/configuracion/envios-whatsapp/_components/DestinatariosField.tsx`, `EnvioForm.tsx`.
- `app/(app)/configuracion/plantillas/_components/PlantillaInformeFields.tsx`.
- `app/(app)/mis-asignaciones/_components/pos-card/pos-estado.ts` — `CLASE_NOTA_AYUDA` y `CLASE_NOTA`.
- `tests/components/ContrasteBrandSoftOscuro.test.tsx` — 4 casos de la caja aviso + censo que pinta
  cada lista de clases con `bg-warning-soft` del árbol y la mide en los dos temas.

### Rojo → verde
ANTES: 10 rojos, todos en oscuro (2 de la caja aviso, 8 del censo). DESPUÉS: 51/51 del archivo; y
119 archivos de tests de componente/guardias afectados, 2362 tests verdes. `eslint` sobre el diff: 0.
`tsc --noEmit` (8 GB): 0. No se corrió `./init.sh` (lo corre el leader sobre base migrada).

### Contrastes (fondo `warning/15` compuesto sobre card #1C1C1A / background #111111)
| Texto | Claro (sin cambio) | Oscuro antes | Oscuro después (card / bg) |
|---|---|---|---|
| `muted-foreground` (rótulo, contexto) | 9.22 | 1.91 | 6.05 / 6.94 |
| `foreground` (cifra) | 16.96 | 1.04 | 11.98 / 13.73 |
| `warning-strong` (cifra aviso, avisos) | 6.37 | 1.50 | 7.70 / 8.82 |
| `danger-strong` (negativa) | 5.81 | 2.48 | 4.65 / 5.33 |

### Censo de `bg-warning-soft`
| Uso | Veredicto |
|---|---|
| CifrasCierre aviso, DetalleCierre franja, ColaCierres aviso, DestinatariosField, EnvioForm, PlantillaInformeFields, pos-estado ×2 | **ARREGLADOS** (`dark:bg-warning/15`). |
| TarifasActivarDialog, TarifasEstado, TarifasTopeIntentos, ChatConversacion, FranjaReprogramadasRetenidas, RankingPodio, CajaResumenCard, NotificationsBell, SinpeAvisoRiesgo, badge.tsx | OK: ya llevan `dark:bg-warning/15`. |
| Toast warning | OK: par `dark:` propio (tinta `color-mix`); fuera del lector del censo. |
| CobrosGastoFijo/CobrosRechazoTienda (comentarios) | No son clases. |

### Hallazgo abierto (no tocado)
`DetalleCierre.tsx:213`, rama `peligro`: `bg-danger-soft text-danger-strong` sin `dark:` → #f87171 sobre
#fee2e2 en oscuro = 2.26 (mismo patrón). Fuera del censo pedido.
