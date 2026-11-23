# review SLT-172 «Limpieza tras el pago neto a la tienda: componentes de cierres sin uso»

Ruta **ligera**, review acotada al diff `origin/dev...HEAD` (base `1a4a353f` = `origin/dev`; commits
`a6fe3db8`, `2765a41a`, `1e26da60`). Spec: `specs/SLT-172-limpieza-pago-neto/requirements.md` (R640-R645).

## Checklist

- [x] **Ruta.** Ligera, aprobada por Carlos (D1). El diff retira componentes de presentación sin
      superficie y muda una función de umbral de pantalla; no cambia ningún cálculo de dinero, ni
      permisos, ni `lib/`. Sube de ruta no hace falta.
- [x] **Spec ligera completa:** alcance, EARS R640-R645, `## Tasks`, `## Archivos esperados`, `## Lo que ya existe`.
- [ ] **Tasks:** T1-T5 `[x]`; **T6 abierta** (`./init.sh` + E2E `cierres-rediseno` y
      `cierre-bodega-satelite`), del leader. Condición antes del PR, no hallazgo de código.
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` → AVISO, 15/40 archivos, 761/1000 producción,
      2676/3000 tests. Por debajo del máximo; no necesita aceptación.
- [x] **Trazabilidad:** mapa R→test en `progress/impl_SLT-172.md:56-65`; cada R con test que muerde (abajo).
- [x] **Sin `lib/`:** `git diff --name-only origin/dev...HEAD -- lib/` vacío. Nada de SLT-174
      «Quitar el alias ganaLaTienda y los restos de la cascada del mensajero» (alias, DTOs y contratos intactos).
- [x] **Typecheck:** `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` → exit 0, 0 errores.
- [x] **Lint** de los 10 archivos tocados que existen → 0 errores, 1 aviso preexistente
      (`DineroIdentidadesEnPantalla.test.tsx:541`, directiva `import/first` sin uso, ya en `origin/dev`).
- [x] **Tests** (unidad/componente/guardia, sin Postgres): 13 archivos, 367/367 verdes — guardia nueva,
      `marca-varias-tiendas`, `nombres-estado-retirados`, `pagos-captura`, `superficie-de-uso`,
      `cierre-bodega-vocabulario`, `detalle-cierre-vista`, `DineroIdentidades`, `CierreDesgloseModeloNuevo`,
      `CierreIngresoBodegaModeloNuevo`, `DeudasD39D40`, `CierreBodegaDesglosePorTienda`, `DetalleCierreDinero`.
- [x] Checkpoints de proyecto: sin tablas, queries, migraciones, dependencias, secretos ni literales de
      país nuevos; nada de Ordenex. `docs/perfil-agentes.md > reviewer`: comentarios explican el porqué.
- [ ] **E2E en local** (`perfil-agentes > reviewer`, diff toca `app/`): sin constancia todavía; es T6
      del leader y debe estar en `progress/impl_SLT-172.md` antes de abrir el PR.

## Mutaciones del reviewer (árbol restaurado, `git status` vacío)

1. `marcaDeVariasTiendas`: `>= 2` → `>= 1` (`cierre-labels.ts:533`) → 3 rojos:
   `marca-varias-tiendas` «con una sola tienda no hay marca», `detalle-cierre-vista` «Por tienda solo con
   dos o más tiendas» y `CierreBodegaDesglosePorTienda` «con UNA sola tienda en toda la bodega…». R642 y R643 muerden.
2. En el árbol real, a la vez: `DesglosePorTienda.tsx` restaurado de `origin/dev`; `tests/fixtures/zz-revisor.ts`
   con `typeof import("../../app/(app)/…/CascadasCierreMensajero")` (ruta relativa, forma no usada por el
   implementer); `export { totalDeVariasTiendasNota as nombreAccesibleDeTienda }` en `cierre-labels.ts`;
   `export const lineasCascadaDueno = () => []` en `cascadas-bodega.ts` → 5 rojos en la guardia nueva
   (R640 existe, R640 cita, R641, R644 y la autocomprobación de `cascadas-bodega`). La contraprueba funciona.
3. R645: el censo exige `15` escrito a mano y `not.toContain` de las dos rutas literales: no se apoya en su fuente.

## T1 — lo borrado no protegía nada vivo sin reubicar

Comprobado lo dudoso:
- `CierreMensajeroDetalleCascadas` «SLT-54 R65» leía `factura()` = la región
  `CASCADA_FACTURA_TIENDA_TITULO` de la cascada retirada (`origin/dev`, línea 446), no el comprobante:
  bien clasificado como «no vivo».
- «Liquidación» A/B (bruto, IVA, Debe, orden, cuenta) de `CierreFacturaDetalle` (vivo) → reubicado en
  `DineroIdentidadesEnPantalla` · B6, del DOM y con literales; el implementer probó la mutación
  `conOperador`→`money` con 2 rojos.
- `IVA_FACTURADO_NOTA`, `NETO_EMPRESA_NOTA`, `GANANCIA_NOTA_BODEGA`: solo los re-exporta
  `cierre-detalle-shared.tsx`; ningún consumidor vivo. Quedan para la pregunta abierta 1 / SLT-174.
- Money-safe de `cierre-labels.ts`: rescatado en la guardia nueva (bloque «T1»).
- Cascada central (R641, segunda mitad): sigue cubierta por `detalle-cierre-vista.test.ts` y los tests de
  componente de bodega, sin cambios y en verde.

## Desvíos declarados

1. **`nombres-estado-retirados.guardia.test.ts` (4 → 3 «entregadas»)**, fuera de Archivos esperados.
   Correcto y obligado: la guardia exige el conteo exacto y R644 retira `DESGLOSE_POR_TIENDA_NOTA_MODELO_NUEVO`,
   que llevaba una de las cuatro. No hay alternativa sin tocarla. El motivo se actualizó con la razón.
2. **`marcaDeVariasTiendas(partes: readonly unknown[])`** en vez de `readonly ParteDeTienda[]`.
   Correcto como mínimo dentro del alcance: `cierre-labels.ts` está en el árbol del panel que vigila
   `pagos-captura` R19, que sigue también los `import type`, y `lib/utils/ingreso-empresa.ts` importa `Prisma`.
   Alternativas evaluadas:
   - genérico `<T>(partes: readonly T[])`: igual de laxo, no gana nada;
   - recibir `cuantas: number`: rompe «la misma firma» más que `unknown[]` y obliga a cambiar los dos llamadores;
   - **la que conserva el tipo**: sacar `ParteDeTienda` a un módulo de tipos sin `Prisma` (p. ej. `lib/types/`)
     y pedirlo desde ahí. Toca `lib/`, que esta ficha tiene vetado (T6): queda para SLT-174, que ya edita ese tipo.
   Los llamadores (`detalle-cierre-vista.ts:887,919`) siguen pasando `ParteDeTienda[]` tipados; no se pierde
   seguridad real, la función solo cuenta. Ver hallazgo 1.

## Hallazgos

1. **menor** — `specs/SLT-172-limpieza-pago-neto/requirements.md:107` (R642) dice «con la misma firma» y
   `tests/unit/utils/marca-varias-tiendas.test.ts:3` repite «con la misma firma», pero la firma cambió a
   `readonly unknown[]` (`cierre-labels.ts:532`). Ajustar el texto del R642 (o anotar el desvío en el spec)
   y el comentario del test, para que no mientan.
2. **menor** — Comentarios que siguen nombrando `CascadasCierreMensajero` como consumidor vivo:
   `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:490` y `:501`, y
   `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx:606`. Los de `CierresAdminModule` documentan
   `ganaLaTienda`/`partesPorTienda`, territorio de SLT-174: se pueden dejar para esa ficha, pero que conste allí.
3. **menor** — Nada fija que `detalle-cierre-vista.ts` importe la marca DESDE `cierre-labels` (segunda frase
   de R643): una copia local del umbral pasaría los tests. Riesgo bajo (la guardia R640 impide el import viejo
   y la mutación del umbral en `cierre-labels` sí pone rojo `detalle-cierre-vista`). No pide cambio.
4. **menor** — Sugerencia para SLT-174: mover `ParteDeTienda` a un módulo de tipos sin `Prisma` y devolver
   a `marcaDeVariasTiendas` su tipo de dominio.

Sin hallazgos bloqueantes.

## Veredicto

**OK.** Condición previa al PR (no es de código): cerrar T6 — `./init.sh` en verde y los E2E
`e2e/cierres-rediseno.spec.ts` y `e2e/cierre-bodega-satelite.spec.ts` en local, anotados en
`progress/impl_SLT-172.md`. Los menores 1 y 2 pueden ir en este PR o en SLT-174.
