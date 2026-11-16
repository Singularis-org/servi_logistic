# SLT-172 «Limpieza tras el pago neto a la tienda: componentes de cierres sin uso» — requirements

Ruta: **ligera** (zona frontend, complejidad low). Este archivo es el spec entero: no hay
`design.md` ni `tasks.md`. Requisitos: **R640-R645**, con el rango R640-R649 reservado (el último
rango en uso es el R620-R639 de SLT-169 «Se le paga hoy a la tienda con todos los cobros restados»).

## Origen

Es la rebanada A del corte que Carlos aprobó el 2026-11-16. Las otras dos son fichas aparte:
- SLT-174 «Quitar el alias ganaLaTienda y cobradoSobreRecaudado de los cierres»;
- SLT-175 «Pruebas R621/R623 con datos propios y guardia R631 con imports indirectos».

Viene de `progress/review_SLT-169.md:51` (H5): componentes sin superficie que siguen con las notas
viejas «Gana en total».

## Lo que ya existe

- **Board.** SLT-115 «Retirar los componentes de cierre sustituidos» está `done`, pero no retiró
  estos dos componentes: `CascadasCierreMensajero.tsx:347` todavía dice `@sin-superficie … lo
  retira SLT-115`. No es un duplicado: esta ficha termina ese retiro.
- **Código.** Lo busqué con Grep/Read en el worktree, que parte de `dev` 1a4a353f. Sin shell no he
  podido hacer `git fetch` de `origin/dev`: el leader lo confirma antes de F1.4. No usé el grafo.

## Alcance

**Dentro:**
- Borrar `app/(app)/cierres-admin/_components/CascadasCierreMensajero.tsx` (389 líneas).
  - Ningún módulo de `app/`, `components/` ni `lib/` lo importa.
  - Solo lo montan el fixture `tests/fixtures/detalle-cierre-admin-anterior.tsx:4` y los tests
    `CierreDesgloseModeloNuevo:10`, `CierreIngresoBodegaModeloNuevo:11`,
    `DineroIdentidadesEnPantalla:554` y `DeudasD39D40ModeloEnPantalla:40`.
- Borrar `app/(app)/cierres-admin/_components/DesglosePorTienda.tsx` (165 líneas).
  - Su componente solo lo montan `CascadasCierreMensajero.tsx:14` y los tests
    `CierreIngresoBodegaModeloNuevo:12` y `DeudasD39D40ModeloEnPantalla:41`.
  - **Pero `marcaDeVariasTiendas` (`:111-113`) está viva:** la importa
    `components/private/cierres/detalle/detalle-cierre-vista.ts:49` y la usa en `:887` y `:919`.
    Antes de borrar el archivo se muda a `cierre-labels.ts`, junto a `totalDeVariasTiendasNota`
    (`:521-523`), que es lo único que usa.
- Borrar de `cascadas-bodega.ts` la función `lineasCascadaDueno` (`:85-170`), que nadie importa. El
  único import del archivo es `lineasCascadaCentral`, en `detalle-cierre-vista.ts:48`. Con ella se
  van la nota de H5 (`:151`) y los imports que dejan de usarse (`:8-32`).
- Borrar de `cierre-labels.ts` los textos que solo usaba `DesglosePorTienda`:
  - `DESGLOSE_POR_TIENDA_TITULO` (`:504`);
  - `TIENDA_RECAUDADO_LABEL`, `TIENDA_PAGO_HOY_LABEL` y `TIENDA_GANA_TOTAL_LABEL` («Gana en total»)
    (`:544-546`);
  - `DESGLOSE_POR_TIENDA_NOTA*` (`:554-558`) y `DESGLOSE_NO_REPARTIDO_NOTA*` (`:569-573`);
  - `nombreAccesibleDeTienda` (`:600-607`).

  Ninguno de estos lo importa `app/`, `components/` ni `lib/` fuera de los dos archivos que se
  borran, ni `cierre-detalle-shared.tsx` los re-exporta. En `tests/` solo aparecen en
  `CierreMensajeroDesglosePorTienda.test.tsx`, que se borra.
- Tests que solo vigilan lo que se borra:
  - **se borran enteros:** el fixture `tests/fixtures/detalle-cierre-admin-anterior.tsx`, que solo
    usan `CierreMensajeroDetalleCascadas.test.tsx:101` y `CierreMensajeroDesglosePorTienda.test.tsx:89`,
    y esos dos tests;
  - **se recortan:**
    - `CierreDesgloseModeloNuevo.test.tsx:309-337`;
    - `CierreIngresoBodegaModeloNuevo.test.tsx:208-270`;
    - `DeudasD39D40ModeloEnPantalla.test.tsx:219-322` (la sección D40 del cierre de mensajero, con
      `TOTALES_INGRESO`, `UNA_TIENDA` y `DOS_TIENDAS`, si T1 confirma que nada más las usa);
    - `DineroIdentidadesEnPantalla.test.tsx`: el import de `:554-560`, la sección «SL-39 · B6» de
      `:1031`, que monta la cascada en `:1046-1072`, y las dos entradas del censo (`:1582-1602`) con
      el número que da el título de `:1637`.
  - **se reubica** cualquier aserción de esos tests que cubra algo que sigue vivo; ver T1.

**Fuera (lo que NO entra):**
- **Nada de `lib/`.** El alias `ganaLaTienda`, `cobradoSobreRecaudado`, los contratos y DTOs son de
  SLT-174, y la evidencia para esa ficha va abajo. Por eso esta ficha no toca
  `lib/interfaces/services/ICierresAdminService.ts` ni `lib/services/CierresAdminService.ts`, y no
  choca con SLT-125 «Geografía jerárquica: presentación, exportes, cierres y geocodificación».
- **Los rótulos y notas que solo usaba `CascadasCierreMensajero`**, que quedan sin importador vivo:
  - `GANA_LA_TIENDA_*`, `PAGO_TIENDA_HOY_NOTA*` y `COBRADO_SOBRE_RECAUDADO_*`;
  - `FLETE_RECHAZO_{YA_COBRADO,AUN_NO_COBRADO,NO_SE_COBRARA,NO_DEDUCIBLE}_NOTA`;
  - `NETO_EMPRESA_NOTA*` y `NETO_EMPRESA_NEGATIVO_NOTA`;
  - `CASCADA_{DUENO,FACTURA_TIENDA,NETO_EMPRESA}_TITULO`.

  Viven en `cierre-labels.ts:264-473`, los re-exporta `cierre-detalle-shared.tsx:59-91,153-183` y
  sus literales los fijan `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts:588-600,727-761`
  y `tests/unit/components/rechazo-nombre-466-app.test.ts:133-144`. Retirarlos aquí rebasaría el
  aviso de líneas (ver `## Tamaño`). Propuesta en la pregunta abierta 1.
- **`CascadaDinero.tsx`.** Tras esta ficha su componente no lo monta nadie, pero el módulo sigue
  alcanzable: `cascadas-bodega.ts:33` importa de él el tipo `LineaCascada`, y la guardia
  `superficie-de-uso` mira módulos (`superficie-de-uso.guardia.test.ts:317-330`). No pone la guardia
  en rojo. Ver la pregunta abierta 2.
- R621/R623 en el baseline y la guardia R631: son de SLT-175.

## Decisiones cerradas (no reabrir)

| Id | Fecha · quién | Decisión |
|---|---|---|
| D1 | 2026-11-16 · Carlos | Corte en tres. SLT-172 es solo la rebanada A, por ruta ligera y en zona frontend. El alias va a SLT-174; R621/R623 y R631 van a SLT-175. |

Cobertura: D1 → R640-R645 (todo lo de abajo cae dentro de la rebanada A; `lib/` queda fuera, T6).

## Requisitos (EARS)

- **R640** — El sistema NO DEBE contener los módulos
  `app/(app)/cierres-admin/_components/CascadasCierreMensajero.tsx` ni
  `app/(app)/cierres-admin/_components/DesglosePorTienda.tsx`, y ningún archivo de `app/`,
  `components/`, `lib/` ni `tests/` DEBE importarlos por ninguna vía: alias, ruta relativa,
  `export … from`, `import()` ni `require`.
- **R641** — `app/(app)/cierres-admin/_components/cascadas-bodega.ts` NO DEBE exportar
  `lineasCascadaDueno`, y su único export de valor DEBE ser `lineasCascadaCentral`. La cascada «Lo
  que va a la central» del detalle de bodega DEBE pintar las mismas cuatro líneas, con los mismos
  rótulos, importes y notas que antes.
- **R642** — `marcaDeVariasTiendas` DEBE exportarse desde
  `app/(app)/cierres-admin/_components/cierre-labels.ts`, con la misma firma. SI recibe dos o más
  tiendas, ENTONCES DEBE devolver «Es el total de las N tiendas de este cierre, sumadas. Abajo,
  cuánto le toca a cada una.», con N el número de tiendas. SI recibe una o ninguna, ENTONCES DEBE
  devolver `null`.
- **R643** — El detalle del cierre (mensajero y bodega) DEBE seguir enseñando «Por tienda» solo
  cuando el nivel tiene dos o más tiendas, y NO DEBE enseñarlo con una. Ese umbral DEBE salir de la
  `marcaDeVariasTiendas` de R642: `detalle-cierre-vista.ts` la importa de `cierre-labels`.
- **R644** — `cierre-labels.ts` NO DEBE exportar `DESGLOSE_POR_TIENDA_TITULO`,
  `DESGLOSE_POR_TIENDA_NOTA`, `DESGLOSE_POR_TIENDA_NOTA_MODELO_NUEVO`, `DESGLOSE_NO_REPARTIDO_NOTA`,
  `DESGLOSE_NO_REPARTIDO_NOTA_MODELO_NUEVO`, `TIENDA_RECAUDADO_LABEL`, `TIENDA_PAGO_HOY_LABEL`,
  `TIENDA_GANA_TOTAL_LABEL` ni `nombreAccesibleDeTienda`.
- **R645** — El censo de pantallas de dinero («ficha 359 · D» de `DineroIdentidadesEnPantalla`) NO
  DEBE listar las rutas que retira R640. Para cada ruta que siga listando, DEBE seguir comprobando
  que existe, que no se repite y que declara su identidad, con el número de rutas escrito a mano.

## Tasks

- [ ] **T1 — Mapa de rescate, antes de borrar nada.**
  - Para cada `describe`/`it` que se borra:
    - de `CierreMensajeroDetalleCascadas.test.tsx` y `CierreMensajeroDesglosePorTienda.test.tsx`;
    - de los recortes de `CierreDesgloseModeloNuevo`, `CierreIngresoBodegaModeloNuevo`,
      `DeudasD39D40ModeloEnPantalla` y `DineroIdentidadesEnPantalla`.
  - Anotar en `progress/impl_SLT-172.md` qué comprueba y si lo que comprueba sigue vivo.
  - El fixture monta además `CierreFacturaDetalle` (`detalle-cierre-admin-anterior.tsx:53-65`). Cada
    aserción sobre esa parte, o sobre algo vivo que no esté cubierto en otro test, se mueve a un test
    vivo; lo previsible es `tests/components/DetalleCierreDinero.test.tsx` o
    `tests/unit/utils/detalle-cierre-vista.test.ts`.
  - *Hecho:* la tabla existe y no queda ni una fila «vivo, sin cubrir».
- [ ] **T2 — Mudar `marcaDeVariasTiendas` a `cierre-labels.ts`** y cambiar el import de
  `detalle-cierre-vista.ts:49`. Test nuevo `tests/unit/utils/marca-varias-tiendas.test.ts`, con
  literales escritos a mano: 0 tiendas → `null`, 1 → `null`, 2 → el texto de R642 con «2», 3 → con «3».
  - *Hecho:* R642 verde, y `tests/unit/utils/detalle-cierre-vista.test.ts:402-408` sigue verde sin
    cambios (R643).
  - *Mutación:* cambiar `>= 2` por `>= 1` pone rojos el test nuevo y `detalle-cierre-vista.test.ts:408`.
- [ ] **T3 — Borrar** los dos componentes, `lineasCascadaDueno` con sus imports sin uso y los textos
  de R644.
  - *Hecho:* `pnpm run typecheck` y `pnpm run lint` en verde, y `tests/unit/utils/detalle-cierre-vista.test.ts`
    verde sin tocarlo (lo de R641 sobre la cascada central).
  - Depende de T1 y T2.
- [ ] **T4 [P con T3] — Tests.** Borrar el fixture y los dos tests, y recortar los otros cuatro
  según el mapa de T1.
  - En `DineroIdentidadesEnPantalla` se quitan las dos entradas del censo y se ajusta a mano el
    número del título (R645).
  - *Hecho:* `pnpm exec vitest related --run` sobre el diff, en verde.
- [ ] **T5 — Guardia nueva `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts`**
  (R640, R641, R644).
  - Lee el árbol real:
    - los dos archivos no existen;
    - ningún fuente de `app/`, `components/`, `lib/` ni `tests/` tiene un especificador que resuelva
      a ellos;
    - `cascadas-bodega.ts` solo exporta `lineasCascadaCentral`;
    - `cierre-labels.ts` no exporta ninguno de los nombres de R644.
  - Con autocomprobación: un import sintético por alias, por ruta relativa, por `export * from` y
    por `import()` tiene que dar rojo, y el barrido tiene que haber leído más de 0 archivos.
  - *Hecho:* verde en el árbol, y rojo si se restaura `DesglosePorTienda.tsx` o se añade
    `export function lineasCascadaDueno`.
- [ ] **T6 — Cierre.**
  - `./init.sh` en verde.
  - `git diff --name-only origin/dev -- lib/` vacío: ni el alias ni el contrato cambian.
  - E2E en local, porque el diff toca `app/` (`docs/perfil-agentes.md > Todos los agentes`):
    `e2e/cierres-rediseno.spec.ts` y `e2e/cierre-bodega-satelite.spec.ts`.
  - *Hecho:* todo verde y anotado en `progress/impl_SLT-172.md`.

**Trazabilidad prevista:**

| R | Test |
|---|---|
| R640 | `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts` |
| R641 | la misma guardia (exports) y `tests/unit/utils/detalle-cierre-vista.test.ts`, la cascada central, sin cambios |
| R642 | `tests/unit/utils/marca-varias-tiendas.test.ts` |
| R643 | `tests/unit/utils/detalle-cierre-vista.test.ts:402-408` (mensajero) y `tests/components/CierreBodegaDesglosePorTienda.test.tsx` (bodega), sin cambios |
| R644 | `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts` |
| R645 | `tests/components/DineroIdentidadesEnPantalla.test.tsx` («ficha 359 · D») |

## Tamaño

Archivos: **16/40** (40%), holgado.

| Montón | Estimación | Tope | % |
|---|---|---|---|
| Producción | ~750 líneas: 389 + 165 de los dos archivos borrados, ~85 de `lineasCascadaDueno` e imports, ~100 de textos de `cierre-labels`, ~15 de la mudanza | 1000 | ~75% |
| Tests | ~2350 líneas: 1911 de los tres archivos borrados, ~380 de recortes, ~60 de los dos tests nuevos | 3000 | ~78% |

Casi todo son líneas borradas, y `scripts/tamano-pr.mjs:14` las cuenta igual que las añadidas. Las
dos cifras quedan por debajo del aviso del 80%, pero con poco margen. Por eso se quedaron fuera los
textos que solo usaba `CascadasCierreMensajero`: unas 120 líneas de producción más, y dos tests de
guardia que habría que editar.

## Archivos esperados

- `app/(app)/cierres-admin/_components/CascadasCierreMensajero.tsx`
- `app/(app)/cierres-admin/_components/DesglosePorTienda.tsx`
- `app/(app)/cierres-admin/_components/cascadas-bodega.ts`
- `app/(app)/cierres-admin/_components/cierre-labels.ts`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `tests/fixtures/detalle-cierre-admin-anterior.tsx`
- `tests/components/CierreMensajeroDetalleCascadas.test.tsx`
- `tests/components/CierreMensajeroDesglosePorTienda.test.tsx`
- `tests/components/CierreDesgloseModeloNuevo.test.tsx`
- `tests/components/CierreIngresoBodegaModeloNuevo.test.tsx`
- `tests/components/DeudasD39D40ModeloEnPantalla.test.tsx`
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`
- `tests/components/DetalleCierreDinero.test.tsx`
- `tests/unit/utils/detalle-cierre-vista.test.ts`
- `tests/unit/utils/marca-varias-tiendas.test.ts`
- `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts`

`DetalleCierreDinero.test.tsx` y `detalle-cierre-vista.test.ts` solo se tocan si T1 encuentra algo
vivo que reubicar. Van en la lista para que el choque con otras fichas sea visible.

## Evidencia para SLT-174

Lo que ya está medido, para que SLT-174 «Quitar el alias ganaLaTienda y cobradoSobreRecaudado de
los cierres» no lo repita. Todo es del worktree (`dev` 1a4a353f).

### `ganaLaTienda` vale lo mismo que `pagoTienda` en los 7 caminos

| Camino | `pagoTienda` | `ganaLaTienda` |
|---|---|---|
| Detalle del mensajero y Excel de mensajeros (`cifrasDelCierre`) | `lib/utils/cifras-cierre.ts:68` `ganaLaTienda(general, total)` | `:73` `const ganaTienda = pagoTienda` → `:83` |
| Cada tienda (`partesPorTienda`) | `lib/utils/ingreso-empresa.ts:706` | `:708`, la misma llamada |
| Cada cierre del día de bodega | `lib/services/CierresBodegaAdminService.ts:516` | `:536`, la misma llamada |
| Agregado de bodega (`cifrasAgregadasBodega` → `cifrasDelCierre`) | `CierresBodegaAdminService.ts:597` | `:601` `agregado.ganaLaTienda` |
| Detalle del mensajero (servicio) | `lib/services/CierresAdminService.ts:1087,1132` | `:1090,1137` `cifras.ganaLaTienda` |
| DTO de la hoja «Cierres» de mensajeros | `CierresAdminService.ts:2063`; por tienda `:2073` | `:2064`; por tienda `:2074` |
| DTO de la descarga de bodega | — (no lleva `pagoTienda`) | `lib/services/cifras-bodega-descarga.ts:98` |

- La **función** `ganaLaTienda()` (`ingreso-empresa.ts:523`) no es el alias: es la fórmula de
  `pagoTienda`. Si se renombra, cambia también `NOMBRES_PROHIBIDOS` de la guardia R631
  (`tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts:42`), que es de SLT-175.
- **Los campos del alias:**
  - `ICierresAdminService.ts:216` (`ParteDeTiendaDescargaDTO`), `:232` (`CifrasCierreDescargaDTO`)
    y `:576` (detalle);
  - `ICierreBodegaService.ts:195` (cierre del día) y `:349` (`CifrasCierreBodegaDescargaDTO`);
  - `ICierresBodegaAdminService.ts:125`;
  - `ParteDeTienda.ganaLaTienda` (`ingreso-empresa.ts:562`) y `CifrasCierre.ganaLaTienda`
    (`cifras-cierre.ts:35`);
  - las clasificaciones `CLASE_*`: `CierresAdminService.ts:214,238`, `CierresBodegaAdminService.ts:93,118`
    y `cifras-bodega-descarga.ts:56`.
- **Consumidores en pantalla:**
  - `detalle-cierre-vista.ts:84,980-995` solo lo usa para comprobar que no llega `null` y lo pasa
    adelante;
  - `CierresAdminModule.tsx:494,819`.
- **Contratos públicos y columnas.** Ningún nombre visible cambia:
  - No hay `ganaLaTienda` en `app/api/` ni en `lib/actions/`.
  - En el Excel de bodega la columna ya se rotula «Se le paga a la tienda»
    (`cierres-bodega-modelo-nuevo-descarga-columnas.ts:62`). Solo cambiaría su `clave` interna
    (`:42,62,145`), que no se escribe en el libro; lo que se escribe es `encabezado`.
  - En el Excel de mensajeros ya no hay columna desde SLT-169 R628.
- **Tamaño.** `ganaLaTienda` aparece hoy en 50 archivos de `tests/`. Tras SLT-172 bajan a unos 45
  (se van el fixture, `CierreMensajeroDetalleCascadas`, `CierreMensajeroDesglosePorTienda` y los
  recortes). Con unos 12 de producción, SLT-174 pasa de 40 archivos: habrá que aceptar el tamaño o
  partir la ficha.
- **Invariantes que tienen que seguir verdes** (`ICierresAdminService.ts:620-625`,
  `ICierreBodegaService.ts:217-220`):
  - Σ `.pagoTienda` === `pagoTienda` (R10 / SLT-169 R621);
  - Σ `.recaudado` === `totales.general` (R12);
  - `pagoTienda + totalesIngreso.total === general` (SLT-169 R624);
  - Σ cierres del día === agregado (SLT-169 R623).

  R11 (Σ `.ganaLaTienda` === `ganaLaTienda`) desaparece con el campo.

### `cobradoSobreRecaudado` NO es un alias

- **Su valor** es `fleteConIva + comisionConIva` (`lib/utils/ingreso-empresa.ts:746-748`). Se calcula
  en `cifras-cierre.ts:70` y en `CierresBodegaAdminService.ts:521-524`.
- **No coincide con ninguna otra cifra.** Difiere de `totalesIngreso.total` en el flete no
  deducible con IVA (`fleteDevolucionConIva`): es la identidad «puente + flete por devolución a
  origen = facturado» del censo (`DineroIdentidadesEnPantalla.test.tsx:1588`) y de la cascada
  (`cascadas-bodega.ts:141-153`). Coincide con `total` solo cuando no hay flete no deducible, y no es
  igual a `pagoTienda`, que es `general − total`.
- **Ninguna pantalla viva pinta su valor.** Las únicas pantallas que lo pintaban eran
  `CascadasCierreMensajero.tsx:281,298` y `lineasCascadaDueno` (`cascadas-bodega.ts:144`), y las
  retira esta ficha. Lo que queda:
  - `detalle-cierre-vista.ts:869` y `:983` solo lo usan para comprobar que no es `null`; el `:869`
    decide si se monta la cuenta «Lo que se le factura a la tienda», pero esa cuenta no lee su
    importe;
  - `:83`, `:170`, `:994` y `:1191` solo lo pasan adelante.
  - `CierresAdminModule.tsx:492` y `:817` lo pasan de largo: SLT-174 debe confirmar que no se pinta.
- **No va en ningún Excel:** no aparece en las columnas de descarga.
- **Su clasificación** es `"empresa"` en `CierresAdminService.ts:236` y `CierresBodegaAdminService.ts:91,116`.
- **Quitarlo cambia una condición.** `detalle-cierre-vista.ts:869` monta la cuenta de lo facturado
  solo si `cobradoSobreRecaudado !== null`. Al quitar el campo, esa condición tiene que pasar a
  depender de otra cifra que la satélite reciba también en `null`, como `totalesIngreso`, que ya se
  comprueba en `:869`.

## Preguntas abiertas

1. **(Para el leader y Carlos.) Los rótulos y notas que solo usaba `CascadasCierreMensajero`** quedan
   sin importador vivo tras esta ficha (la lista está en «Fuera»). Propongo que los retire SLT-174:
   `GANA_LA_TIENDA_*` y `COBRADO_SOBRE_RECAUDADO_*` nombran justo los dos campos que esa ficha quita.
   Se llevaría consigo `cierre-labels.ts`, `cierre-detalle-shared.tsx`,
   `cierre-bodega-vocabulario.guardia.test.ts` y `rechazo-nombre-466-app.test.ts`. Si no, quedan
   como código muerto sin dueño.
2. **(Para el leader.)** El componente `CascadaDinero` queda sin quien lo monte, aunque la guardia
   siga en verde porque el módulo exporta un tipo vivo (`LineaCascada`). ¿Se retira en SLT-174 o en
   una ficha aparte, moviendo `LineaCascada` a `cascadas-bodega.ts` y borrando
   `tests/components/CascadaDinero.test.tsx`? No cabe aquí sin pasar del aviso de líneas: son 149 de
   producción y 153 de tests.
