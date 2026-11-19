# SLT-174 «Quitar el alias ganaLaTienda y los restos de la cascada del mensajero» — design

## Lo que ya existe

**Términos buscados:** `ganaLaTienda`, `CascadaDinero`, `ParteDeTienda`, `alias`, «cascada del
mensajero».

| Dónde | Qué apareció | Qué se hace con ello |
|---|---|---|
| Board (`feature_list.json`) | Solo esta ficha nombra `ganaLaTienda` o `CascadaDinero`. Sus hermanas son SLT-172 «Limpieza tras el pago neto a la tienda: componentes de cierres sin uso» (rebanada A, `done` en #182) y SLT-175 «Pruebas R621/R623 con datos propios y guardia R631 con imports indirectos» (rebanada C, `pending`, depende de esta). | Ninguna es duplicado. El corte es D1. |
| `specs/` | `SLT-169-pago-tienda-neto`: P3 deja el alias para «la ficha de limpieza», que es esta. `SLT-172-limpieza-pago-neto/requirements.md > ## Evidencia para SLT-174` mide los 7 caminos, los contratos y los invariantes. | Se reutiliza esa evidencia (§2) y no se repite. |
| Código | La guardia `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts` de SLT-172 ya trae un detector de especificadores (alias, relativo, `export … from`, `import()`, `require`, `vi.mock`, CRLF) y un lector de exports de valor, los dos con autocomprobación. | **Se amplía** con lo de esta ficha en vez de escribir otra guardia (§7 y alternativa B). |
| Código | `pagos-captura.guardia.test.ts` R19 ya recorre el árbol del panel siguiendo también los `import type`. | Es la restricción que obliga a sacar `ParteDeTienda` a un módulo sin imports (§4). |
| Código | `lib/types/` es la carpeta de tipos de dominio (`docs/architecture.md > Estructura de carpetas`). | Ahí va `parte-de-tienda.ts`. |

**Grafo:** el proyecto de este worktree no está indexado (`index_status`: «project not found»). Lo
busqué con Grep y Read sobre el árbol del worktree (`dev` e92741e5).

## 1. Resumen

Es un refactor de borrado y no cambia ningún importe:
- se quita un campo duplicado (`ganaLaTienda` vale lo mismo que `pagoTienda`) de los contratos y de
  quienes lo pasan de largo;
- se retiran rótulos y un componente que ya no monta nadie;
- se muda un tipo para que un util de presentación recupere su tipado.

No hay modelo de datos nuevo ni migración. No cambian la autorización, el país ni las dependencias.

| Aspecto (`docs/perfil-agentes.md > spec_author`) | Esta ficha |
|---|---|
| Modelo de datos, `organizacion_id`, RLS, únicos | Sin cambios: no toca `db/`. |
| Autorización / módulo encendido | Sin cambios. La regla «la satélite no ve el dinero de la empresa» se apoya en las `CLASE_*` + `anularEmpresaSiNoCentral`, que solo pierden la entrada `ganaLaTienda`. `pagoTienda` ya es `"empresa"` en todas (R655). |
| Migraciones / `down.sql` | Ninguna. |
| Datos que dependen del país | Ninguno nuevo. Los rótulos que quedan siguen saliendo de `EMPRESA` / `IMPUESTO_ROTULO`. |
| Dependencias de terceros | Ninguna. |

## 2. Evidencia verificada contra el árbol actual

La tabla de los 7 caminos (`specs/SLT-172-limpieza-pago-neto/requirements.md:222-232`) sigue
cierta línea a línea:

| Sitio | Hoy | Dato |
|---|---|---|
| `lib/utils/cifras-cierre.ts` | `:35` (campo), `:52` (doc), `:73` `const ganaTienda = pagoTienda`, `:83` | `cifrasDelCierre` lo copia de `pagoTienda` |
| `lib/utils/ingreso-empresa.ts` | `:506-507`, `:557-562` (campo de `ParteDeTienda`), `:602`, `:708` | `partesPorTienda` llama dos veces a la misma función |
| `lib/services/CierresAdminService.ts` | `:214`, `:238` (CLASE), `:1083`, `:1090`, `:1137`, `:1139`, `:2064`, `:2074` | detalle y descarga de mensajeros |
| `lib/services/CierresBodegaAdminService.ts` | `:93`, `:118` (CLASE), `:530-536` (cierre del día), `:601` (agregado) | `:516` y `:536` son la misma llamada |
| `lib/services/cifras-bodega-descarga.ts` | `:56` (CLASE), `:98` | el único DTO sin `pagoTienda` |
| `lib/interfaces/services/ICierresAdminService.ts` | `:216`, `:232`, `:564-576`, `:595`, `:604-609`, `:620-625` | `ParteDeTiendaDescargaDTO`, `CifrasCierreDescargaDTO` y el detalle |
| `lib/interfaces/services/ICierreBodegaService.ts` | `:181-195`, `:197`, `:203`, `:219`, `:348-349` | cierre del día y `CifrasCierreBodegaDescargaDTO` |
| `lib/interfaces/services/ICierresBodegaAdminService.ts` | `:116-125`, `:127`, `:149` | agregado de bodega |
| `app/(app)/cierres-admin/_components/CierresAdminModule.tsx` | `:488-490`, `:494`, `:497`, `:501`, `:819` | lo pasa de largo, no lo pinta |
| `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga-columnas.ts` | `:42`, `:61-62`, `:145` | la clave interna de «Se le paga a la tienda» |
| `components/private/cierres/detalle/detalle-cierre-vista.ts` | `:84`, `:980`, `:984`, `:995` | solo lo comprueba (`!== null`) y lo pasa |

**Lo que no cambia:**
- No hay `ganaLaTienda` en `app/api/`, `lib/actions/` ni `e2e/`.
- En el Excel de mensajeros ya no hay columna (SLT-169 R628).
- En el de bodega, el encabezado ya es «Se le paga a la tienda»: solo cambia la `clave`, que no se
  escribe en el libro.

## 3. Contratos: antes → después

Todos los importes siguen siendo STRING de escala 2 con su signo. Ningún valor cambia.

| Contrato | Antes | Después |
|---|---|---|
| `ParteDeTienda` (`lib/types/parte-de-tienda.ts`, re-exportado por `ingreso-empresa`) | `tiendaId, tiendaNombre, recaudado, pagoTienda, ganaLaTienda` | `tiendaId, tiendaNombre, recaudado, pagoTienda` (R652) |
| `CifrasCierre` (`cifras-cierre.ts`) | `… pagoTienda, cobradoSobreRecaudado, netoEmpresa, ganaLaTienda, partesPorTienda` | sin `ganaLaTienda` |
| Detalle del cierre de mensajero (`ICierresAdminService.ts`, rama `ok`) | `ganaLaTienda: string \| null` | sin el campo |
| `CifrasCierreDescargaDTO` | `pagoTienda, ganaLaTienda, …` | sin `ganaLaTienda` |
| `ParteDeTiendaDescargaDTO` | `tiendaNombre, recaudado, pagoTienda, ganaLaTienda` | `tiendaNombre, recaudado, pagoTienda` (R652) |
| Cierre del día de bodega (`ICierreBodegaService.ts:195`) | `ganaLaTienda: string \| null` | sin el campo |
| Agregado de bodega (`ICierresBodegaAdminService.ts:125`) | `ganaLaTienda: string \| null` | sin el campo |
| `CifrasCierreBodegaDescargaDTO` (`ICierreBodegaService.ts:349`) | `ganaLaTienda: string \| null` («Se le paga a la tienda») | **`pagoTienda: string \| null`**, mismo valor (`cifras.pagoTienda`) (R653) |
| `DineroEmpresaMensajero` (`detalle-cierre-vista.ts:81`) | `… ganaLaTienda: string …` | sin el campo; `empresaDe` deja de comprobarlo |
| Estado del detalle de `CierresAdminModule` (`:483-503`) | `ganaLaTienda: string \| null` | sin el campo |
| `CLASE_CIFRAS_DESCARGA_CIERRE`, `CLASE_DETALLE_MENSAJERO`, `CLASE_DETALLE_BODEGA`, `CLASE_CIERRE_DEL_DIA_BODEGA` | `ganaLaTienda: "empresa"` | sin la entrada (`satisfies ClasificacionDinero<…>` obliga a quitarla) |
| `CLASE_CIFRAS_BODEGA_DESCARGA` | `ganaLaTienda: "empresa"` | `pagoTienda: "empresa"` |
| Columna de bodega | `clave: "ganaLaTienda"`, también en `CLAVES_EMPRESA` | `clave: "pagoTienda"`, también en `CLAVES_EMPRESA`; mismo `encabezado` y posición |

**`empresaDe` (`detalle-cierre-vista.ts:979-1004`).** Hoy devuelve `null` si cualquiera de las siete
cifras de la empresa llega en `null`. Al quitar `ganaLaTienda` quedan seis, y el comportamiento no
cambia: la satélite recibe todas en `null` a la vez, porque todas son `"empresa"` en la misma
`CLASE_DETALLE_MENSAJERO` (R655).

**`cobradoSobreRecaudado` no cambia** (D4, R657). Sus usos siguen como están: el `:869` decide si
se monta la cuenta, y `:983`, `:994` y `:1191` lo pasan adelante. Ninguna pantalla viva pinta su
importe. Lo único que se va es el rótulo `COBRADO_SOBRE_RECAUDADO_*`, que solo leía el componente
retirado en SLT-172.

**La función `ganaLaTienda()` se queda** (D6). Es la fórmula
`general − total` y la llaman `cifras-cierre.ts:68`, `ingreso-empresa.ts:706` y
`CierresBodegaAdminService.ts:516`. En `partesPorTienda` se borra la segunda llamada (`:708`). En
`CierresBodegaAdminService` se borra la de `:536`. Su JSDoc (`:476`, `:506-507`) deja de hablar de
«campos alias».

## 4. `ParteDeTienda` en un módulo de tipos sin imports (R661)

**Archivo nuevo `lib/types/parte-de-tienda.ts`:**
- Contiene solo `export interface ParteDeTienda { tiendaId; tiendaNombre; recaudado; pagoTienda }`,
  con el JSDoc de hoy (`ingreso-empresa.ts:531-556`) y sin la cifra alias. La regla «cinco claves y
  ni una más» pasa a ser «cuatro».
- **Sin un solo `import`.** Así no puede arrastrar `@prisma/client` al árbol del panel, ni como valor
  ni como tipo.

**`lib/utils/ingreso-empresa.ts`:**
- `import type { ParteDeTienda } from "@/lib/types/parte-de-tienda";`
- `export type { ParteDeTienda };`

Es un **re-export del mismo tipo, no una copia**. Por eso no cambian los importadores que ya lo
piden a `ingreso-empresa`: `ICierresAdminService.ts:32`, `ICierreBodegaService.ts:15`,
`ICierresBodegaAdminService.ts:12`, `cifras-cierre.ts:10`, `detalle-cierre-vista.ts:17`,
`CierresAdminModule.tsx:29` y `tests/components/CierreBodegaDesglosePorTienda.test.tsx:16`. Así no
se toca la línea de import de `ICierresAdminService.ts`, que es de SLT-125 (§6).

**`cierre-labels.ts`:**
- `import type { ParteDeTienda } from "@/lib/types/parte-de-tienda";`
- `marcaDeVariasTiendas(partes: readonly ParteDeTienda[])`.
- El JSDoc de `:527-530` deja de justificar el `unknown[]`. Así se cierra el menor 1 de
  `progress/review_SLT-172.md`: «con la misma firma» vuelve a ser cierto.

**Por qué no rompe R19.** `pagos-captura.guardia.test.ts` recorre el árbol desde `GestionarOrdenPanel`.
Ese árbol alcanza `cierre-labels.ts` (`:201`) y sigue también los `import type` (`RE_IMPORT`, `:79-80`).
El módulo nuevo entra en el árbol sin hijos:
- no añade ningún import de `@prisma/client`, ni de valor ni de tipo;
- no deja especificadores sin resolver (`noResueltos` sigue `[]`);
- el umbral de `import type` de Prisma (`> 5`, `:228-230`) no baja, porque no se quita ninguno.

`ingreso-empresa.ts` sigue fuera del árbol del panel.

**Prueba del tipo.** `tests/unit/utils/marca-varias-tiendas.test.ts` añade
`expectTypeOf(marcaDeVariasTiendas).parameter(0).toEqualTypeOf<readonly ParteDeTienda[]>()` y pide
`ParteDeTienda` a `@/lib/types/parte-de-tienda`. Lo comprueba `pnpm run typecheck`. Que el tipo de
`ingreso-empresa` es el mismo, y no una copia, lo fija la guardia de §7: `ingreso-empresa.ts` no
declara `interface ParteDeTienda` y re-exporta el de `lib/types`.

## 5. Rótulos y `CascadaDinero` (R658, R659, R660)

**Rótulos que se borran de `cierre-labels.ts`:**
- `GANA_LA_TIENDA_LABEL` (`:373-385`), `GANA_LA_TIENDA_NOTA` (`:387-392`),
  `GANA_LA_TIENDA_NOTA_MODELO_NUEVO` (`:393-395`) y `GANA_LA_TIENDA_NEGATIVO_NOTA` (`:404-410`);
- `COBRADO_SOBRE_RECAUDADO_LABEL` (`:298-302`) y `COBRADO_SOBRE_RECAUDADO_NOTA` (`:412-414`);
- `IVA_FACTURADO_NOTA` (`:435-437`) y `FLETE_NO_ENTREGADAS_NOTA` (`:187-188`).

Se van con su JSDoc. `IVA_FACTURADO_LABEL` y `FLETE_NO_ENTREGADAS_LABEL` siguen vivos y se quedan.

**Sin importador, medido hoy:**
- en `app/`, `components/`, `lib/` y `e2e/` solo aparecen en `cierre-labels.ts` (declaración) y en
  `cierre-detalle-shared.tsx`, que los importa y re-exporta (`:45`, `:64`, `:77-80`, `:83`, `:94`,
  `:142`, `:158`, `:169-172`, `:175`, `:186`);
- en `tests/` solo aparecen en `cierre-bodega-vocabulario.guardia.test.ts:13,19-20,595,737-746`.

En esa guardia se quitan sus imports y sus filas de `it.each`. Las demás filas siguen con su literal
escrito a mano.

**Los rótulos que SLT-172 dejó sin uso (D8, R663).** Los medí en e92741e5. Se borran 12 de
`cierre-labels.ts`, con su JSDoc:
- `CASCADA_DUENO_TITULO` (`:263-264`);
- `FLETE_RECHAZO_NO_DEDUCIBLE_NOTA` (`:351-353`);
- `PAGO_TIENDA_HOY_NOTA` y `PAGO_TIENDA_HOY_NOTA_MODELO_NUEVO` (`:397-402`);
- `NETO_EMPRESA_NOTA` y `NETO_EMPRESA_NOTA_MODELO_NUEVO` (`:416-425`);
- `NETO_EMPRESA_NEGATIVO_NOTA` (`:439-441`);
- `FLETE_RECHAZO_YA_COBRADO_NOTA`, `FLETE_RECHAZO_AUN_NO_COBRADO_NOTA` y
  `FLETE_RECHAZO_NO_SE_COBRARA_NOTA` (`:443-464`);
- `CASCADA_FACTURA_TIENDA_TITULO` y `CASCADA_NETO_EMPRESA_TITULO` (`:466-473`).

Fuera de su declaración solo aparecen aquí:
- el import y re-export de `cierre-detalle-shared.tsx`. Son 26 líneas y el archivo no los usa
  dentro;
- `cierre-bodega-vocabulario.guardia.test.ts:10-12,16,23-24,590,676-679,747-758`, filas de
  literal que solo cubrían el rótulo;
- `rechazo-nombre-466-app.test.ts:16,19,138-143`, solo para `FLETE_RECHAZO_NO_DEDUCIBLE_NOTA` y
  `NETO_EMPRESA_NOTA`. Con el rótulo se va la aserción. Lo de C34/C35 que sigue vivo
  (`INGRESO_BODEGA_RECHAZOS_LABEL`, `GANA_BODEGA_SATELITE_NOTA`) se queda.

No hay ningún `import * as` sobre `cierre-labels` ni sobre `cierre-detalle-shared`.

**`CASCADA_CENTRAL_TITULO` se queda**, porque está vivo en tres sitios:
- `detalle-cierre-vista.ts:26,573,826`;
- `cierre-factura.tsx:119,1059-1060`;
- `ConciliacionSatelite.tsx:21,166`.

Sus usos en la guardia de vocabulario (`:9`, `:159`, `:297`, `:591`) siguen igual.

**Efecto en otra guardia.** `nombres-estado-retirados.guardia.test.ts:100-105` exige, para
`cierre-labels.ts`, exactamente `["entregadas", "entregadas", "entregadas"]`. Dos de los tres se
retiran: `GANA_LA_TIENDA_NOTA_MODELO_NUEVO` (`:395`) y `PAGO_TIENDA_HOY_NOTA_MODELO_NUEVO` (`:402`).
- La foto baja a **uno**: `FLETE_NO_ENTREGADAS_LABEL` (`:185`).
- Hay que actualizar el motivo. Es el mismo ajuste que hizo SLT-172 (`progress/review_SLT-172.md`,
  nota 1).
- `FLETE_NO_ENTREGADAS_NOTA` dice «no entregada», en singular, y no cuenta.

**`CascadaDinero.tsx` (149 líneas) se borra.**
- Hoy no lo monta nadie. Su único importador es `cascadas-bodega.ts:24`, que solo pide el tipo
  `LineaCascada`.
- `export type SignoCascada` y `export interface LineaCascada` (`CascadaDinero.tsx:45-63`) se mudan
  tal cual a `cascadas-bodega.ts`, con su JSDoc.
- Para R641 de SLT-172 no cambia nada: `exportsDeValor` ignora los `type` y las `interface`, así
  que el único export de valor sigue siendo `lineasCascadaCentral`.
- `detalle-cierre-vista.ts` no nombra `LineaCascada`: usa el tipo inferido de `lineasCascadaCentral`.

**Lo que cae con el componente:**
- `tests/components/CascadaDinero.test.tsx` (153 líneas), entero. Solo monta el componente: ninguna
  aserción cubre algo vivo. Se confirma con el mapa de rescate de T1.
- `cierre-bodega-vocabulario.guardia.test.ts:118`: `"CascadaDinero.tsx"` sale de
  `SUPERFICIES_ENTERAS`. Si no, la autocomprobación `:343-346` pide que exista.
- `DineroIdentidadesEnPantalla.test.tsx:1525-1528`: la entrada sale del censo y el número escrito a
  mano baja de 15 a 14, con su comentario (R660).
- `cierres-componentes-retirados.guardia.test.ts:188` usa `./CascadaDinero` como «vecino de nombre
  parecido». Pasa a ser un módulo retirado, así que ese ejemplo se cambia por otro vecino vivo, p. ej.
  `./cascadas-bodega`.

**Comentarios que nombran `CascadaDinero` como si existiera:**
- `cierre-detalle-shared.tsx:57` y `Cuenta.tsx:16` se corrigen.
- `cierre-factura.tsx:515` **no**, por D2 y D7: es deuda (§12).

## 6. Convivencia con SLT-125 (D2)

SLT-125 «Geografía jerárquica: presentación, exportes, cierres y geocodificación» (PR #161) toca
estos cuatro archivos. En cada uno, esta ficha solo toca lo que sigue. No reordena, no reformatea y
no cambia imports que no sean del alcance.

| Archivo | Líneas que toca esta ficha (árbol e92741e5) | Por qué |
|---|---|---|
| `lib/interfaces/services/ICierresAdminService.ts` | `:216`, `:232`, `:564-576`, `:595`, `:604-609`, `:620-625` | Campo alias en tres contratos y su JSDoc. **No toca** el import `:32` (§4). |
| `lib/services/CierresAdminService.ts` | `:214`, `:238`, `:1082-1083`, `:1090`, `:1137`, `:1139`, `:2064`, `:2074` | CLASE, detalle y descarga. |
| `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx` | Imports `:45`, `:55-59`, `:64`, `:73-91`, `:92-94`. Re-exports `:142`, `:150-153`, `:158`, `:167-183`, `:184-186`. Comentario `:606`. | Rótulos retirados (alcance 3 y 6, D8), sus comentarios de bloque y `:606` (alcance 5). **No son líneas del alias** sino del alcance cerrado. Se avisa al leader. |
| `app/(app)/cierres-admin/_components/cierre-factura.tsx` | **ninguna** | No tiene alias. Su comentario `:515` es deuda (D7, §12). |

Si #161 se mergea antes, el implementer rebasa y vuelve a localizar estas líneas por contenido: los
números de arriba son del árbol e92741e5.

## 7. La guardia: ampliar `cierres-componentes-retirados`

Se amplía `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts` con bloques
`SLT-174 · R…`. Las piezas de SLT-172 se reutilizan sin cambiar su comportamiento.

1. **R659 (módulo retirado):** `${COMPONENTES}/CascadaDinero` entra en `MODULOS_RETIRADOS`. Los
   detectores ya cubren todas las formas de import. Se añade un caso sintético por
   `import type { LineaCascada } from "./CascadaDinero"`, que es la forma que existía de verdad.
2. **R658 y R663 (rótulos):**
   - una lista `NOMBRES_RETIRADOS_SLT174` con los 20 nombres: los 8 de R658 y los 12 de R663;
   - sobre `cierre-labels.ts`: ninguno sale en `exportsDeValor`;
   - sobre `cierre-detalle-shared.tsx`: ninguno sale en su `export { … }`;
   - sobre todo `app/`, `components/`, `lib/` y `tests/` sin comentarios: ninguno aparece como
     identificador (`\bNOMBRE\b`), salvo dentro de esta guardia.
   - Autocomprobación: inyectar `export const GANA_LA_TIENDA_LABEL = "x"`,
     `export { a as IVA_FACTURADO_NOTA }` o `export const CASCADA_DUENO_TITULO = "x"` da rojo.
   - Control: `CASCADA_CENTRAL_TITULO` sí sale exportado de `cierre-labels.ts` y re-exportado de
     `cierre-detalle-shared.tsx`. Así se ve que el corte deja vivo lo que sigue en uso.
3. **R650 (alias en el código):**
   - En `app/`, `components/` y `lib/`, sin comentarios, se buscan todas las apariciones de
     `\bganaLaTienda\b`.
   - Una es legítima solo si se cumple una de tres:
     - le sigue `\s*\(`: una llamada, o la declaración `function ganaLaTienda(`;
     - está dentro de las llaves de un `import { … } from "@/lib/utils/ingreso-empresa"` (o su ruta
       relativa);
     - está en `lib/utils/ingreso-empresa.ts` en la forma `export function ganaLaTienda(`.
   - Cualquier otra aparición es hallazgo: `.ganaLaTienda`, `ganaLaTienda:`, `ganaLaTienda?:`,
     `"ganaLaTienda"`, `{ ganaLaTienda }` o `ganaLaTienda,` en un literal.
   - Autocomprobación con cinco sintéticos que dan rojo: acceso `.ganaLaTienda`, clave de interfaz,
     clave de columna `"ganaLaTienda"`, desestructuración `{ pagoTienda, ganaLaTienda } = r` y
     shorthand en un objeto.
   - Y dos que dan verde: una llamada y el import desde `ingreso-empresa`.
   - Además: el barrido leyó más de 0 archivos con `ganaLaTienda(` (no-vacuidad).
4. **R661 (tipo):**
   - `lib/types/parte-de-tienda.ts` existe, sin comentarios no tiene ni un `import`, y declara
     `interface ParteDeTienda`;
   - `lib/utils/ingreso-empresa.ts` no declara `interface ParteDeTienda` y re-exporta el de
     `@/lib/types/parte-de-tienda`;
   - `cierre-labels.ts` importa `ParteDeTienda` desde `@/lib/types/parte-de-tienda`.
   - Autocomprobación: una copia de la interfaz inyectada en `ingreso-empresa` da rojo.
5. **R662 (comentarios):**
   - se cuentan las apariciones de `CascadasCierreMensajero` en `app/`, `components/` y `lib/`, con
     comentarios incluidos;
   - la foto esperada, escrita a mano, es `{ "app/(app)/cierres-admin/_components/CierresAdminModule.tsx": 1 }`;
   - y esa única línea contiene «Sustituye».

## 8. Tests existentes: qué se hace con cada uno

`ganaLaTienda` aparece en **45 archivos de `tests/`**. La regla es mecánica y no se reescribe
ninguna otra aserción.

| Patrón | Acción |
|---|---|
| Aserción `expect(x.ganaLaTienda).toBe(LITERAL)` junto a una de `pagoTienda` con el mismo literal | Se borra la de `ganaLaTienda`. La de `pagoTienda` se queda. Si no la hubiera, se convierte en `pagoTienda` con el **mismo literal**: nunca en `toBe(x.pagoTienda)`, porque sería una aserción contra su propia fuente. |
| `expect(p.ganaLaTienda).toBe(p.pagoTienda)` (alias de igual valor) | Se borra el `it`. Lo sustituye `expect(p).not.toHaveProperty("ganaLaTienda")` (R651/R652). |
| `describe("396/R11 …")` en `partes-por-tienda.test.ts:265-275` | Se borra: la identidad desaparece (R656). R10 y R12 (`:250-262`, `:277-284`) se quedan intactas. |
| `Object.keys(parte)` de cinco claves (`partes-por-tienda.test.ts:439-451`) | Pasa a cuatro y el título dice «cuatro» (R652). |
| Fixtures con `ganaLaTienda: "…"` en un DTO u objeto de detalle | Se quita la clave. Los dobles tipados lo exigen; los no tipados se limpian igual, porque R650 no barre `tests/` pero el reviewer sí. |
| Descarga de bodega (`cierres-bodega-modelo-nuevo-descarga.test.ts`, `CierresBodegaResumenModeloNuevo.test.tsx`, `cierres-bodega-cifras-lote-sql-real.test.ts`, `cierres-bodega-resumen-modelo-nuevo-service.test.ts`) | `ganaLaTienda` → `pagoTienda` en fixtures y claves, con **los mismos literales**. El encabezado «Se le paga a la tienda» y el conteo de 26 columnas no se tocan (R653, R654). |
| Satélite (`satelite-detalle-sin-dinero-empresa-sql-real.test.ts`, `satelite-cierre-bodega-lectura.int.test.ts`) | Se quita la aserción `ganaLaTienda === null`. `pagoTienda === null` ya está o se añade (R655). |
| Comentarios de test que llaman a `ganaLaTienda` «alias» | Se corrigen o se quitan. |

**Aserciones nuevas** (pocas y con literal):
- `cierres-admin-service.test.ts`: el detalle `not.toHaveProperty("ganaLaTienda")`, y lo mismo en
  cada parte de `partesPorTienda`.
- `cierres-bodega-admin-service.test.ts`: igual en el agregado y en cada cierre del día.
- `cierres-resumen-modelo-nuevo-descarga-service.test.ts`: igual en `CifrasCierreDescargaDTO` y en
  sus partes.

## 9. Invariantes de dinero (R656)

No se añade ninguna fórmula y no se cambia ninguna. Las identidades siguen fijadas por tests verdes
con literales escritos a mano. Ninguno está en `tests/baseline-rojos.json`: las pruebas sql-real de
R621/R623, que sí lo están, son de SLT-175.

| Identidad | Test que la fija |
|---|---|
| R10 / SLT-169 R621: Σ `.pagoTienda` === `pagoTienda` | `tests/unit/utils/partes-por-tienda.test.ts:250-262`; `tests/unit/services/cierre-desglose-tres-superficies.test.ts` (tres superficies) |
| R12: Σ `.recaudado` === `general` | `tests/unit/utils/partes-por-tienda.test.ts:277-284` |
| SLT-169 R624: `pagoTienda + totalesIngreso.total === general` | `tests/unit/utils/cifras-cierre.test.ts:213`; `tests/unit/services/cierres-admin-service.test.ts:2436` |
| SLT-169 R623: Σ cierres del día === agregado | `tests/unit/services/cierres-bodega-admin-service.test.ts:1546` y `:1124` |
| R621 por tienda, con flete por rechazo | `tests/unit/utils/partes-por-tienda.test.ts:293-298`; `cierres-bodega-admin-service.test.ts:1554` |

**La guardia R631 sigue igual.** Es la de SLT-175, en `pago-tienda-no-mueve-dinero.guardia.test.ts`,
y esta ficha no la toca. Ningún servicio que mueve dinero empieza a nombrar `ganaLaTienda`,
`pagoTiendaEmpresa` ni `partesPorTienda`.

## 10. Alternativas descartadas

- **A. Mantener `ganaLaTienda` en `CifrasCierreBodegaDescargaDTO`** porque es «el único DTO sin
  `pagoTienda`». Descartada:
  - deja el alias vivo justo donde peor se lee: un campo llamado «gana» que alimenta la columna «Se
    le paga»;
  - R650 tendría que llevar una excepción, y una excepción en la guardia de un alias es la forma en
    que el alias vuelve.
  - El cambio es una clave interna que no se escribe en el libro.
- **B. Una guardia nueva para SLT-174** en lugar de ampliar la de SLT-172. Descartada:
  - duplicaría el detector de especificadores y el lector de exports, unas 90 líneas con su
    autocomprobación;
  - y dos copias del mismo detector divergen. Ampliar cuesta solo cambiar el ejemplo de
    `:188` (§5).
- **C. Cambiar todos los importadores de `ParteDeTienda` a `@/lib/types/parte-de-tienda`** y no
  re-exportar desde `ingreso-empresa`. Descartada:
  - toca la línea de import de `ICierresAdminService.ts:32`, de SLT-125 (D2), y seis archivos más,
    sin ganar nada;
  - el re-export es el mismo tipo, y la guardia de §7 impide que se convierta en una copia.
- **D. Poner `ParteDeTienda` en `lib/types/cierre.ts`.** Descartada: ese módulo importa `zod` y
  `@/lib/config/cierre` como valor y `@prisma/client` como tipo (`:1-7`). Metería en el árbol del
  panel todo eso, que hoy no está, y R19 o su umbral podrían moverse.
- **E. Marcar los campos `@deprecated`** y quitarlos en otra ficha. Descartada: es lo que SLT-169
  ya hizo con «alias hasta P3», y esta es la ficha P3.
- **F. Renombrar también la función `ganaLaTienda()`.** Descartada (D6): es la fórmula, no el
  alias, y renombrarla toca la guardia R631 de SLT-175 «Pruebas R621/R623 con datos propios y
  guardia R631 con imports indirectos».
- **G. Retirar también `CASCADA_CENTRAL_TITULO`** junto con los demás `CASCADA_*_TITULO`.
  Descartada: tiene tres consumidores vivos (§5), y D8 solo admite los rótulos sin importador.

## 11. Riesgos

- **Un doble no tipado que siga emitiendo `ganaLaTienda`** pasaría el typecheck. Lo cubren las
  aserciones `not.toHaveProperty` de §8, que leen la salida de los servicios reales, y el barrido de
  R650 sobre el código de producción.
- **Rebase sobre #161.** Las líneas de §6 cambian de número. El implementer las localiza por
  contenido y vuelve a correr `vitest related` sobre los cuatro archivos.
- **`vitest related` toca la base local** (memoria del leader): antes de cualquier vitest, exportar
  la base desechable.

## 12. Deuda que deja esta ficha

- **`app/(app)/cierres-admin/_components/cierre-factura.tsx:515`** (D7). El comentario dice «Mismo
  criterio que `CascadaDinero` del detalle», y R659 borra ese componente.
  - No se toca aquí porque el archivo es de SLT-125 «Geografía jerárquica: presentación, exportes,
    cierres y geocodificación» (PR #161) y no tiene líneas del alias (D2).
  - Se corrige en un `chore/` después del merge de #161, nombrando el criterio, no el componente.
  - R662 no lo vigila: solo cubre `CascadasCierreMensajero`.
