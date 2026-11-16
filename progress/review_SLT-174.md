# Review — SLT-174 «Quitar el alias ganaLaTienda y los restos de la cascada del mensajero»

- Ruta: **completa** (toca contratos y servicios de cierres: dinero). Review completa contra el spec.
- Rama `feature/SLT-174-quitar-alias-gana-tienda`, HEAD `dd2d4bb7`, merge-base `e92741e5` (= `origin/dev`).
- Diff revisado: `git diff origin/dev...HEAD` (72 archivos; 67 contados por `tamano-pr`).
- PR #183 abierto; en el momento de la review el `gate-completo` de `dd2d4bb7` seguía corriendo
  (vitest 1-3 y `e2e (dinero)` en pending; `estatico` y `e2e (reparto)` en verde).
- Grafo: no lo usé; exploré con Grep/Read y `git diff` (el índice de este worktree no se consultó).

## Checklist

- [x] **Ruta.** Completa, como exige el dinero. `requirements.md`, `design.md` y `tasks.md` existen.
- [x] **`design.md > ## Lo que ya existe`** presente y con contenido (board, specs, guardias de
  SLT-172 y `pagos-captura`, `lib/types/`). El diff no re-crea nada de esa lista: amplía la guardia
  `cierres-componentes-retirados` en vez de escribir otra (alternativa B).
- [ ] **Tasks.** T1-T7 `[x]`. **T8 (cierre) abierta**: `./init.sh` con `INIT_EXIT`, E2E en local
  (`cierres-rediseno`, `cierre-bodega-satelite`, `--project=dinero`) y el mapa final. Ver hallazgo 1.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 67/40 archivos, 591/1000 líneas de producción,
  1040/3000 de tests. Aceptado por Carlos con la línea `<!-- tamano-pr-aceptado: … -->` en
  `progress/features/SLT-174.md` (D3).
- [x] **Trazabilidad R650-R663.** Cada R tiene test concreto y no vacío (tabla abajo). Mapa
  `R → test` en `progress/impl_SLT-174.md` (tandas 1 y 2).
- [x] **Typecheck** (`NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .`):
  `TSC_EXIT=0`.
- [x] **Lint** de los archivos de `app/`, `components/`, `lib/` y `tests/` del diff: 0 errores,
  1 aviso preexistente (`DineroIdentidadesEnPantalla.test.tsx:541`, directiva sin uso, línea no
  tocada).
- [x] **Tests.** Los 42 archivos de unidad/componente/guardia del diff + `pagos-captura.guardia` +
  `pago-tienda-no-mueve-dinero.guardia`: `Test Files 44 passed (44)`, `Tests 1117 passed (1117)`.
  Integración no corrida (por instrucción: sin Postgres); CI de la tanda 1 la pasó.
- [x] **Mutaciones propias sobre el dinero** (11, todas en ROJO, tabla abajo). Árbol restaurado con
  `git checkout --` tras cada una; `git status --porcelain` vacío al final.
- [x] **R653/R654: valor de `pagoTienda` y de «Se le paga a la tienda» sin cambio en ningún camino.**
  - Mensajero: `cifrasDelCierre` sigue con `pagoTienda = ganaLaTienda(general, totalesIngreso.total)`;
    lo borrado (`const ganaTienda = pagoTienda`) era la copia.
  - `partesPorTienda`: queda la llamada de `pagoTienda`; se borró la segunda, idéntica.
  - Bodega, cierre del día: queda `pagoTienda: ganaLaTienda(cd.resumen.totales.general, totalesIngreso.total)`
    (`CierresBodegaAdminService.ts:514`); se borró la de `:536` con los mismos argumentos.
    Agregado: `pagoTienda: agregado.pagoTienda` intacto.
  - Descarga de bodega: `cifras.ganaLaTienda` → `cifras.pagoTienda` en `cifras-bodega-descarga.ts:98`.
    Las dos venían de `cifrasDelCierre` vía `cifrasAgregadasBodega`, con el mismo valor.
    La columna mantiene encabezado «Se le paga a la tienda», posición 12.ª (`columnas[11]`), 26 columnas,
    y su clave sigue en `CLAVES_EMPRESA` (fuera para la satélite).
  - Ningún `encabezado` ni rótulo visible cambia en el diff (solo se borran rótulos sin importador).
- [x] **Archivos de SLT-125 «Geografía jerárquica: presentación, exportes, cierres y geocodificación» (D2, design §6).**
  - `cierre-factura.tsx`: **sin diff** (`git diff --stat` vacío).
  - `ICierresAdminService.ts`: solo `:216`, `:232`, el bloque `:564-576`, `:595`, `:604-609` y
    `:620-625`. El import `:32` intacto.
  - `CierresAdminService.ts`: solo `:214`, `:238`, `:1082-1083`, `:1090`, `:1137`, `:1139`, `:2064`
    y `:2074`.
  - `cierre-detalle-shared.tsx`: solo imports y re-exports de los 20 rótulos, sus comentarios de bloque
    (`:55-59`, `:92-94`, `:150-153`, `:184-186`) y el comentario `:606`. Todo dentro de §6. El recuento
    «doce rótulos vivos» lo verifiqué: son 12.
- [x] **R657 `cobradoSobreRecaudado` intacto**: `ingreso-empresa.ts:718-720` sin diff, sigue en los
  contratos y en `empresaDe`; su mutación (M3) da rojo.
- [x] **D6 función `ganaLaTienda()` sin renombrar**: `ingreso-empresa.ts:524`, misma firma y cuerpo.
  En `app/ components/ lib/` el identificador solo aparece como función, llamada, import o comentario.
- [x] **Seguridad / datos / capas / permisos** (`CHECKPOINTS.md`, `docs/checkpoints-proyecto.md`):
  - sin esquema, migraciones, queries, RLS, secretos, literales de país ni recursos de Ordenex;
  - autorización sin cambios: las `CLASE_*` solo pierden la entrada del alias, y en la de bodega
    `pagoTienda` sigue siendo `"empresa"`;
  - sin dependencias nuevas.
- [ ] **E2E en local** (`docs/perfil-agentes.md > reviewer`, toca dinero): sin constancia todavía.
  Es T8 (hallazgo 1).
- [ ] **`gate-completo` en verde**: corriendo en CI sobre `dd2d4bb7`; lo confirma el leader en F2.4.

## Trazabilidad verificada

| R | Test que lo fija (comprobado que falla si se rompe) |
|---|---|
| R650 | guardia `cierres-componentes-retirados` «SLT-174 · R650» (no-vacuidad + autocomprobación de 7 formas en rojo y 6 en verde; M4 del implementer); typecheck |
| R651 | `cierres-admin-service.test.ts`, `cierres-bodega-admin-service.test.ts`, `cierres-resumen-modelo-nuevo-descarga-service.test.ts:227` (`not.toHaveProperty` + `pagoTienda` "92090.00" a mano); mis M4, M7, M11 en rojo |
| R652 | `partes-por-tienda.test.ts:413` (cuatro claves); `cierres-resumen-modelo-nuevo-descarga-service.test.ts:227` (tres claves) |
| R653 | `cierres-bodega-modelo-nuevo-descarga.test.ts` (26 columnas, `columnas[11]`, celdas "92090.00"/"-2260.00", satélite sin la columna); `CierresBodegaResumenModeloNuevo.test.tsx`; mis M8, M9, M10 en rojo |
| R654 | encabezados escritos a mano en las dos descargas (`ENCABEZADOS_CIERRES_CENTRAL`); M10 (encabezado cambiado) en rojo |
| R655 | `detalle-cierre-vista.test.ts` (`empresaDe` → `null`); `cierres-admin-fulfillment-solo-central.test.ts`; integración satélite (CI) |
| R656 | `partes-por-tienda.test.ts:240-262` (R10 contra `AGREGADO_PAGO` "128474.00", también el agregado vía `ganaLaTienda`), R12; `cifras-cierre.test.ts:209` (R624 en céntimos contra `1990000`); `cierres-bodega-admin-service.test.ts:1106,1123,1524,1536,1646,1656` (R623, literales); `cierre-desglose-tres-superficies.test.ts`. Mis M1, M2, M6, M7, M11 en rojo |
| R657 | `cierres-admin-service.test.ts` (línea puente), `cifras-cierre.test.ts`, `cifras-cierre-bodega.test.ts`; M3 en rojo |
| R658 / R663 | guardia «SLT-174 · R658/R663»: lista de 20 nombres, `exportsDeValor` de `cierre-labels` y `cierre-detalle-shared`, barrido de `app/ components/ lib/ tests/`, control de `CASCADA_CENTRAL_TITULO` |
| R659 | guardia «SLT-174 · R659» (archivo inexistente, ninguna cita, tipos en `cascadas-bodega`, único valor `lineasCascadaCentral`) |
| R660 | `DineroIdentidadesEnPantalla.test.tsx` «las catorce…» con `toBe(14)` escrito a mano y `CascadaDinero.tsx` en la lista de retiradas |
| R661 | guardia «SLT-174 · R661»; `marca-varias-tiendas.test.ts` (`expectTypeOf` + R642); `pagos-captura.guardia` R19 sin cambios y verde |
| R662 | guardia «SLT-174 · R662» (foto a mano `{ CierresAdminModule.tsx: 1 }` + «Sustituye»); `grep` confirma una sola aparición (`CierresAdminModule.tsx:78`) |

## Mutaciones de la review

Cada una se aplicó sola y se corrieron 13 archivos de dinero:
- `cifras-cierre`, `cifras-cierre-bodega` y `partes-por-tienda`;
- los cinco tests de servicio;
- las dos descargas;
- `CierresBodegaResumenModeloNuevo`, `DetalleCierreDinero` y `detalle-cierre-vista`.

Después de cada una, `git checkout --` del archivo.

| # | Mutación | Resultado |
|---|---|---|
| M1 | `cifras-cierre.ts`: `pagoTienda = ganaLaTienda(general, totalesIngreso.fleteConIva)` | ROJO, 32 tests en 7 archivos (R624, R10/R12, tres superficies) |
| M2 | `ingreso-empresa.ts` `partesPorTienda`: `pagoTienda: ganaLaTienda(recaudado, ingreso.fleteConIva)` | ROJO, 27 en 8 archivos (R10/R621, descargas) |
| M3 | `cobradoSobreRecaudado` sin sumar la comisión | ROJO, 9 en 4 archivos (R657) |
| M4 | `CierresAdminService` `toCifrasDescarga`: `pagoTienda: cifras.netoEmpresa` | ROJO, 3 (descarga de mensajeros) |
| M5 | `toCifrasDescarga`, partes: `pagoTienda: p.recaudado` | ROJO, 2 |
| M6 | `CierresBodegaAdminService:514`, cierre del día con `fleteConIva` | ROJO, 8 en 2 archivos (R623, tres superficies) |
| M7 | agregado de bodega `pagoTienda: agregado.netoEmpresa` | ROJO, 10 en 2 archivos |
| M8 | `cifras-bodega-descarga.ts`: `pagoTienda: cifras.netoEmpresa` | ROJO, 2 (`cierres-bodega-resumen-modelo-nuevo-service`) |
| M9 | columna: `fila.pagoTienda = cifras.totalFacturado` | ROJO, 4 en 2 archivos |
| M10 | encabezado «Se le paga a las tiendas» | ROJO, 5 en 2 archivos (R654) |
| M11 | detalle de mensajero: `pagoTienda: ganancia` | ROJO, 10 en 2 archivos |

## Hallazgos

1. **menor (condición previa al aviso «listo para mergear», no de código).** `tasks.md` T8 sigue
   `[ ]`. Falta lo siguiente, que no se puede dar por hecho:
   - `./init.sh` en verde con `INIT_EXIT` dentro del log;
   - los E2E en local que pide `docs/perfil-agentes.md > Todos los agentes` porque el diff toca
     dinero: `e2e/cierres-rediseno.spec.ts`, `e2e/cierre-bodega-satelite.spec.ts` y
     `--project=dinero`, con base desechable y `next build`;
   - el mapa final en `progress/impl_SLT-174.md`.

   Es el mismo criterio de `progress/review_SLT-172.md`, que dio OK con T6 abierta. Si el leader no
   lo cierra antes del aviso, la regla del reviewer lo vuelve **bloqueante**: un PR que toca dinero
   sin constancia de E2E en local.
2. **menor.** `app/(app)/cierres-admin/_components/cascadas-bodega.ts:26`: el comentario dice
   «mudados tal cual desde `CascadaDinero.tsx`, que ya no monta nadie». El archivo ya no existe: decir
   «retirado en SLT-174» se leería mejor.
3. **menor (deuda ya anotada).** `lib/services/CierresAdminService.ts:1129` dice «las tres lineas
   derivadas arriba», y ahora son dos. Está fuera de §6 (línea de SLT-125) y el leader lo dejó como
   deuda en `progress/features/SLT-174.md`. Lo mismo vale para `cierre-factura.tsx:515`
   (`CascadaDinero`, D7, design §12). Que entren en el `chore/` posterior al merge de #161.
4. **menor (estilo).** Hay comentarios reescritos sin reflujo de línea:
   - `lib/types/parte-de-tienda.ts:13` (164 caracteres);
   - `lib/interfaces/services/ICierresBodegaAdminService.ts:133` (126);
   - `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx:141` (113).

   No rompe lint.
5. **menor (fuera del spec, bien resuelto).** `docs/ayuda/oficina/cierres.md` dejó de listar
   `CascadaDinero.tsx` en `fuentes:` (commit `dd2d4bb7`). No está en el spec, pero era necesario
   porque el archivo ya no existe.

Sin hallazgos bloqueantes.

## Veredicto

**OK.** Cumple R650-R663. El dinero no cambia en ningún camino: lo comprobé con 11 mutaciones
propias, todas en rojo contra literales escritos a mano. Los archivos de SLT-125 solo tienen las
líneas de §6. Falta cerrar T8 antes del aviso «#183 listo para mergear»: `./init.sh` y los E2E de
dinero en local, anotados en `progress/impl_SLT-174.md`. También falta el `gate-completo` en verde.
