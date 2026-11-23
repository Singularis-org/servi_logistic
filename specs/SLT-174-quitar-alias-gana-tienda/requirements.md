# SLT-174 «Quitar el alias ganaLaTienda y los restos de la cascada del mensajero» — requirements

Ruta: **completa** (zona fullstack, complejidad low): toca contratos y servicios de cierres, que son
dinero. Requisitos: **R650-R663**, con el rango **R650-R669** reservado. El último rango en uso es el
R640-R649 de SLT-172 «Limpieza tras el pago neto a la tienda: componentes de cierres sin uso».

## Origen

Es la rebanada B del corte de SLT-172, que se mergeó en #182 (`dev` e92741e5). La evidencia ya está
medida en `specs/SLT-172-limpieza-pago-neto/requirements.md > ## Evidencia para SLT-174` y no se
repite aquí. La revisé contra el árbol de este worktree (e92741e5) y sigue vigente, con un cambio de
números: tras SLT-172 `ganaLaTienda` aparece en **45 archivos de `tests/`** (259 apariciones) y en
**11 de producción** (8 de `lib/`, 2 de `app/` y 1 de `components/`). Los menores 1, 2 y 4 de
`progress/review_SLT-172.md` entran aquí.

## Alcance

**Dentro** (cerrado por Carlos y el leader, no se reabre):

1. **Quitar el alias `ganaLaTienda`** de servicios, interfaces, utils, descargas, UI y tests. Desde
   SLT-169 P3 vale lo mismo que `pagoTienda`. Ningún nombre visible ni columna de Excel cambia.
   - Los campos que se van: `ParteDeTienda.ganaLaTienda`, `CifrasCierre.ganaLaTienda`, el detalle
     del cierre de mensajero, el detalle de bodega (agregado y cada cierre del día),
     `CifrasCierreDescargaDTO`, `ParteDeTiendaDescargaDTO`, `DineroEmpresaMensajero` y el estado del
     detalle de `CierresAdminModule`.
   - En la descarga de bodega, `CifrasCierreBodegaDescargaDTO` no lleva `pagoTienda`. Su campo
     `ganaLaTienda` pasa a llamarse `pagoTienda`, con el mismo valor. La columna «Se le paga a la
     tienda» no cambia: solo su `clave` interna, que no se escribe en el libro.
   - Las clasificaciones `CLASE_*` pierden la entrada `ganaLaTienda`.
2. **`cobradoSobreRecaudado` se queda**: no es un alias (`lib/utils/ingreso-empresa.ts:746-748`).
   Solo se ajusta lo que dependía del alias.
3. **Retirar los rótulos sin uso** `GANA_LA_TIENDA_*`, `COBRADO_SOBRE_RECAUDADO_*`,
   `IVA_FACTURADO_NOTA` y `FLETE_NO_ENTREGADAS_NOTA`, y el componente `CascadaDinero.tsx`
   (`LineaCascada` se reubica). Hay que verificar que no les queda ningún importador.
4. **Devolver a `marcaDeVariasTiendas` su tipo de dominio.** `ParteDeTienda` se muda a un módulo de
   tipos sin Prisma, sin romper la guardia `pagos-captura` R19.
5. **Corregir los comentarios que nombran `CascadasCierreMensajero` como consumidor vivo**:
   `CierresAdminModule.tsx:490,501` y `cierre-detalle-shared.tsx:606`.

6. **Retirar los rótulos que SLT-172 dejó sin uso**, solo los que no tienen ningún importador vivo
   (D8). Los medí en el árbol e92741e5, buscando en `app/`, `components/`, `lib/` y `tests/`. Los
   tests que solo cubrían el rótulo no cuentan como importador vivo.
   - **Entran (12):**
     - `PAGO_TIENDA_HOY_NOTA` y `PAGO_TIENDA_HOY_NOTA_MODELO_NUEVO`;
     - `FLETE_RECHAZO_YA_COBRADO_NOTA`, `FLETE_RECHAZO_AUN_NO_COBRADO_NOTA`,
       `FLETE_RECHAZO_NO_SE_COBRARA_NOTA` y `FLETE_RECHAZO_NO_DEDUCIBLE_NOTA`;
     - `NETO_EMPRESA_NOTA`, `NETO_EMPRESA_NOTA_MODELO_NUEVO` y `NETO_EMPRESA_NEGATIVO_NOTA`;
     - `CASCADA_DUENO_TITULO`, `CASCADA_FACTURA_TIENDA_TITULO` y `CASCADA_NETO_EMPRESA_TITULO`.

     Fuera de `cierre-labels.ts` solo aparecen en tres sitios:
     - el import y re-export de `cierre-detalle-shared.tsx`;
     - las filas de literal de `cierre-bodega-vocabulario.guardia.test.ts`;
     - las aserciones de `rechazo-nombre-466-app.test.ts:138-143`, solo para
       `FLETE_RECHAZO_NO_DEDUCIBLE_NOTA` y `NETO_EMPRESA_NOTA`.
   - **No entra:** `CASCADA_CENTRAL_TITULO`. Está vivo en
     `components/private/cierres/detalle/detalle-cierre-vista.ts:26,573,826`,
     `app/(app)/cierres-admin/_components/cierre-factura.tsx:119,1059-1060` y
     `app/(app)/wallet/satelites/_components/ConciliacionSatelite.tsx:21,166`.

**Fuera:**
- **La función `ganaLaTienda()`** de `lib/utils/ingreso-empresa.ts:523` no es el alias: es la
  fórmula de `pagoTienda` y no se renombra en esta ficha (D6).
- **`cierre-factura.tsx`**, que es de SLT-125 «Geografía jerárquica: presentación, exportes, cierres
  y geocodificación» y no tiene ninguna línea del alias. Su comentario `:515` nombra `CascadaDinero`
  y queda como deuda, anotada en `design.md > §12 Deuda` (D7).
- **R621/R623 en el baseline y la guardia R631** son de SLT-175 «Pruebas R621/R623 con datos propios
  y guardia R631 con imports indirectos». Su archivo
  `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts` no se toca.
- Ni esquema, ni migraciones, ni `app/api/`, ni `lib/actions/`. Ninguno de ellos nombra el alias.

## Decisiones cerradas (no reabrir)

| Id | Fecha · quién | Decisión |
|---|---|---|
| D1 | 2026-11-16 · Carlos | Corte de SLT-172 en tres. Esta ficha es la rebanada B y va por la ruta completa. |
| D2 | 2026-11-16 · Carlos | Se acepta el choque con SLT-125 (PR #161) en `cierre-detalle-shared.tsx`, `cierre-factura.tsx`, `ICierresAdminService.ts` y `CierresAdminService.ts`. En esos archivos solo se tocan las líneas del alias y de lo que el alcance retira. |
| D3 | 2026-11-16 · Carlos | Se acepta que el PR pase de 40 archivos («acepto el tamano de b»). |
| D4 | 2026-11-16 · leader | `cobradoSobreRecaudado` no es alias y se queda. |
| D5 | 2026-11-16 · leader | Entran además los rótulos `GANA_LA_TIENDA_*`, `COBRADO_SOBRE_RECAUDADO_*`, `IVA_FACTURADO_NOTA` y `FLETE_NO_ENTREGADAS_NOTA`; `CascadaDinero.tsx`, con `LineaCascada` reubicado; el tipo de dominio de `marcaDeVariasTiendas`; y los comentarios que nombran `CascadasCierreMensajero`. |
| D6 | 2026-11-16 · leader | La función `ganaLaTienda()` NO se renombra en esta ficha: es la fórmula, y renombrarla toca la guardia R631 de SLT-175 «Pruebas R621/R623 con datos propios y guardia R631 con imports indirectos». |
| D7 | 2026-11-16 · leader | `cierre-factura.tsx:515` NO se toca aquí. Queda como deuda para un `chore/` después del merge de #161, anotada en el design. |
| D8 | 2026-11-16 · leader | SÍ entran los rótulos que SLT-172 dejó sin uso (`PAGO_TIENDA_HOY_NOTA*`, `FLETE_RECHAZO_*_NOTA`, `NETO_EMPRESA_NOTA*`, `NETO_EMPRESA_NEGATIVO_NOTA`, `CASCADA_*_TITULO`), pero solo los que no tengan ningún importador vivo. |

**Cobertura:**
- D1 → R650-R663.
- D2 → R654: ningún nombre visible cambia. Las líneas exactas de cada archivo compartido están en
  `design.md > §6 Convivencia con SLT-125`.
- D3 → sin comportamiento. Se mide en `tasks.md > ## Tamaño`.
- D4 → R657.
- D5 → R658 (rótulos), R659 (`CascadaDinero`), R660 (censo), R661 (tipo de dominio) y R662
  (comentarios).
- D6 → R650: la única aparición de `ganaLaTienda` que se permite es la función.
- D7 → sin comportamiento. Es deuda anotada en `design.md > §12`.
- D8 → R663.

## Requisitos (EARS)

- **R650** — Ningún contrato ni tipo de `app/`, `components/` ni `lib/` DEBE declarar, leer ni
  escribir un campo `ganaLaTienda`. En el código sin comentarios de esas carpetas, el identificador
  `ganaLaTienda` SOLO PUEDE aparecer:
  - en la declaración de la función `ganaLaTienda(totalGeneral, ingresoTotal)` de
    `lib/utils/ingreso-empresa.ts`;
  - en una llamada a esa función;
  - como especificador de un `import` desde `@/lib/utils/ingreso-empresa`.
- **R651** — CUANDO el servicio entrega el detalle del cierre de mensajero, el detalle del cierre de
  bodega (el agregado y cada cierre del día) o las cifras de las dos descargas «Resumen» (mensajeros
  y bodega):
  - la respuesta NO DEBE contener la propiedad `ganaLaTienda`, ni en el nivel del cierre ni en
    ninguna parte por tienda;
  - DEBE contener `pagoTienda` con el mismo importe que entregaba antes de esta ficha, comprobado
    contra un literal escrito a mano.
- **R652** — Cada parte por tienda que devuelve `partesPorTienda` DEBE tener exactamente cuatro
  claves: `tiendaId`, `tiendaNombre`, `recaudado` y `pagoTienda`. Cada parte de la hoja «Por tienda»
  de la descarga de mensajeros (`ParteDeTiendaDescargaDTO`) DEBE tener exactamente tres:
  `tiendaNombre`, `recaudado` y `pagoTienda`.
- **R653** — La hoja «Cierres» de la descarga de bodega de la central DEBE seguir teniendo sus 26
  columnas, con «Se le paga a la tienda» en la misma posición (la 12.ª, tras «Debe llegar a la
  central»). Su celda DEBE valer el `pagoTienda` del cierre de bodega. SI quien descarga no tiene
  acceso total, ENTONCES:
  - esa cifra DEBE llegar en `null` desde el servidor (SLT-161 R480);
  - la hoja NO DEBE tener esa columna, igual que hoy (SLT-161 R485).
- **R654** — Los encabezados de las hojas de las dos descargas (mensajeros y bodega), y los rótulos
  e importes del detalle del cierre de mensajero y del de bodega, NO DEBEN cambiar con esta ficha.
- **R655** — SI quien mira el detalle del cierre de mensajero o de bodega no tiene acceso total,
  ENTONCES:
  - las cifras de la empresa (`pagoTienda`, `cobradoSobreRecaudado`, `netoEmpresa`, `ivaFacturado`,
    `totalesIngreso`, `partesPorTienda`) DEBEN seguir llegando en `null`;
  - la pantalla NO DEBE pintar el dinero de la empresa, como hoy (SLT-154 R462, R478).
- **R656** — **Invariantes de dinero.** Para un mismo conjunto de gestiones, en el detalle del
  mensajero, en cada cierre del día de bodega y en el agregado de bodega, DEBEN seguir siendo ciertas
  al céntimo, con literales escritos a mano:
  - Σ `partesPorTienda[].pagoTienda` === `pagoTienda` (R10 de la 396 / SLT-169 R621);
  - Σ `partesPorTienda[].recaudado` === `totales.general` (R12 de la 396);
  - `pagoTienda` + `totalesIngreso.total` === `totales.general` (SLT-169 R624);
  - Σ `pagoTienda` de los cierres del día === `pagoTienda` del agregado de bodega (SLT-169 R623).

  La identidad R11 de la 396 (Σ `.ganaLaTienda` === `ganaLaTienda`) desaparece con el campo. Desde
  SLT-169 era la misma cuenta que R10.
- **R657** — El detalle del cierre de mensajero y el de bodega DEBEN seguir entregando
  `cobradoSobreRecaudado` = `fleteConIva` + `comisionConIva`, con su valor de hoy. SI llegan todas las
  cifras de la empresa, ENTONCES el detalle DEBE seguir montando la cuenta «Lo que se le factura a la
  tienda» con la misma condición que hoy.
- **R658** — `app/(app)/cierres-admin/_components/cierre-labels.ts` NO DEBE exportar
  `GANA_LA_TIENDA_LABEL`, `GANA_LA_TIENDA_NOTA`, `GANA_LA_TIENDA_NOTA_MODELO_NUEVO`,
  `GANA_LA_TIENDA_NEGATIVO_NOTA`, `COBRADO_SOBRE_RECAUDADO_LABEL`, `COBRADO_SOBRE_RECAUDADO_NOTA`,
  `IVA_FACTURADO_NOTA` ni `FLETE_NO_ENTREGADAS_NOTA`. `cierre-detalle-shared.tsx` NO DEBE
  re-exportarlos. Ningún fuente de `app/`, `components/`, `lib/` ni `tests/` DEBE importarlos.
- **R659** — El sistema NO DEBE contener `app/(app)/cierres-admin/_components/CascadaDinero.tsx`, y
  ningún fuente de `app/`, `components/`, `lib/` ni `tests/` DEBE importarlo por ninguna vía (alias,
  ruta relativa, `export … from`, `import()`, `require` ni `vi.mock`).
  - `LineaCascada` y `SignoCascada` DEBEN exportarse como tipos desde `cascadas-bodega.ts`, cuyo único
    export de valor DEBE seguir siendo `lineasCascadaCentral` (R641 de SLT-172).
  - La cascada «Lo que va a la central» del detalle de bodega DEBE pintar las mismas cuatro líneas,
    con los mismos rótulos, importes y notas que antes.
- **R660** — El censo de pantallas de dinero («ficha 359 · D» de `DineroIdentidadesEnPantalla`) NO
  DEBE listar `CascadaDinero.tsx`. Para cada ruta que siga listando, DEBE seguir comprobando que
  existe, que no se repite y que declara su identidad. El número de rutas DEBE ir escrito a mano: 14.
- **R661** — `ParteDeTienda` DEBE declararse en un módulo de tipos de `lib/types/` que no importe
  nada, ni de valor ni de tipo.
  - `lib/utils/ingreso-empresa.ts` DEBE re-exportar ese mismo tipo, no una copia.
  - `marcaDeVariasTiendas` DEBE recibir `readonly ParteDeTienda[]` de ese módulo. Su comportamiento
    sigue siendo el de R642: con 2 o más tiendas, la nota con N; con 0 o 1, `null`.
  - La guardia `pagos-captura` R19 DEBE seguir en verde sin cambios: el árbol del panel no importa
    `@prisma/client` como valor ni nombra `lib/utils/lineas-pago`.
- **R662** — En `app/`, `components/` y `lib/`, el nombre `CascadasCierreMensajero` SOLO PUEDE
  aparecer en el comentario histórico de `CierresAdminModule.tsx` que dice que el detalle único
  sustituyó a ese modal (hoy `:78`). Ningún comentario DEBE presentarlo como consumidor vivo.
- **R663** — `cierre-labels.ts` NO DEBE exportar `PAGO_TIENDA_HOY_NOTA`,
  `PAGO_TIENDA_HOY_NOTA_MODELO_NUEVO`, `FLETE_RECHAZO_YA_COBRADO_NOTA`,
  `FLETE_RECHAZO_AUN_NO_COBRADO_NOTA`, `FLETE_RECHAZO_NO_SE_COBRARA_NOTA`,
  `FLETE_RECHAZO_NO_DEDUCIBLE_NOTA`, `NETO_EMPRESA_NOTA`, `NETO_EMPRESA_NOTA_MODELO_NUEVO`,
  `NETO_EMPRESA_NEGATIVO_NOTA`, `CASCADA_DUENO_TITULO`, `CASCADA_FACTURA_TIENDA_TITULO` ni
  `CASCADA_NETO_EMPRESA_TITULO`.
  - `cierre-detalle-shared.tsx` NO DEBE re-exportarlos, y ningún fuente de `app/`, `components/`,
    `lib/` ni `tests/` DEBE importarlos.
  - `CASCADA_CENTRAL_TITULO` DEBE seguir exportándose con el texto «Lo que va a la central».

## Preguntas abiertas

Ninguna. Las tres que había las cerró el leader el 2026-11-16 (D6, D7 y D8).
