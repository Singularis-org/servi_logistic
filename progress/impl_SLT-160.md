# impl SLT-160 «Buscar escaneando en los listados»

Spec: `specs/SLT-160-buscar-escaneando-listados/requirements.md` (R600-R609, DC1). Ruta ligera, sin partir.
Rama `feature/SLT-160-buscar-escaneando-listados`. Hechas T1-T4; T5 (dispositivo en Preview) y T6 (cierre:
`./init.sh` + E2E) quedan para el leader.

## Commits

| SHA | Task |
| --- | --- |
| a698d86e | T1 Enter busca ya y deja el texto seleccionado (`BuscadorFiltros`) |
| 4b579861 | T2 cámara del buscador: `EscanerModal` `soloIcono`, `QrScanner` `encendidaAlMontar` |
| 9ca67442 | T3 B1-B8 pasan `escaneo` + guardia |
| 17b78c13 | T4 guía exacta en el listado de la satélite |
| e16c6d74 | T4 dobles completos del repositorio declaran `existeGuiaEnBodega` |

## Archivos

Producción (13): `components/shared/BuscadorFiltros.tsx`, `components/shared/EscanerModal.tsx`,
`components/shared/QrScanner.tsx`, los 7 montajes (`OrdenesListado`, `SateliteOrdenesListado`,
`NovedadesFiltrosBarra`, `HistoricoFiltrosBar`, `HistorialAccionesFiltrosBar`, `LibroCajaBarra`,
`EstadoCuenta` — B7 y B8 comparten este último), `lib/services/RecepcionSateliteService.ts`,
`lib/repositories/OrdenRepository.ts`, `lib/interfaces/repositories/IOrdenRepository.ts`.

Tests nuevos: `tests/unit/components/buscador-filtros-escaneo.test.tsx`,
`tests/unit/guards/buscadores-con-escaneo.guardia.test.ts`,
`tests/unit/services/recepcion-satelite-busqueda-guia.test.ts`,
`tests/integration/db/satelite-busqueda-guia-sql-real.test.ts`.
Tests ampliados: `tests/unit/components/ordenes-listado-buscador.test.tsx`, `tests/components/EscanerModal.test.tsx`,
`tests/components/QrScanner.test.tsx`.

**Fuera de la lista de archivos esperados (inevitable, una línea cada uno):** al añadir
`existeGuiaEnBodega` a `IOrdenRepository` (lo pide T4), los dobles que declaran el repositorio COMPLETO dejan
de compilar, y el doble en memoria de la satélite rompe en ejecución con un término de solo dígitos:
- `tests/unit/services/recepcion-satelite-paginado.test.ts` — el doble responde `false` (`88880000` es un
  teléfono); la aserción del test no cambia.
- `tests/unit/services/{bulk-orden-service.carga-api,bulk-orden-service,orden-service,rol-admin-satelite-authz}.test.ts`
  — `existeGuiaEnBodega: vi.fn().mockResolvedValue(false)`, como sus vecinos que el archivo no ejerce.
Se probó la alternativa (interfaz aparte `IGuiaEnBodegaRepository`): rompía el tipado de 7 tests de la satélite
en vez de 4. Se descartó.

## Decisiones tomadas aquí

- Enter y la cámara solo actúan con `escaneo` (R609: sin la prop, Enter no hace nada nuevo).
- La cámara del buscador vive en `CamaraDelBuscador`, que pide `useToast` solo al abrirse el modal: la barra
  sigue sin exigir `ToastProvider` a sus ~77 tests y consumidores.
- Botón de cámara siempre a la derecha (`right-1.5`); la «X» pasa a su izquierda (`right-8`), campo `pr-16`.
- B2: `filtroDeRepo` pasa a `async` y llama a `conGuiaExacta`: término de solo dígitos, 1..2147483647 (int4,
  como `OrdenService`), pregunta `existeGuiaEnBodega` con el MISMO `condicionesSatelite`; si existe, el filtro
  lleva `numGuia` y no `busqueda`/`busquedaDigitos`. `o."num_guia" = $g` va en el AND.

## Mapa R → test

| R | Test |
| --- | --- |
| R600 | `buscador-filtros-escaneo.test.tsx` «R600: con `escaneo` se muestra…» / «sin `escaneo` no se monta»; `EscanerModal.test.tsx` «SLT-160 (R604): con `soloIcono`…» |
| R601 | `buscador-filtros-escaneo.test.tsx` «R601 — la URL del QR + Enter…», «R601 — `#1024` con relleno…»; `ordenes-listado-buscador.test.tsx` «SLT-160 R601: la URL del QR + Enter llega como `q: "1024"`» |
| R602 | `buscador-filtros-escaneo.test.tsx` «R602 — un texto que no es guía…», «R602 — por debajo de `minChars`…» |
| R603 | `buscador-filtros-escaneo.test.tsx` «R603 — tras Enter el texto queda seleccionado», «R603 — la segunda lectura sustituye…», «R603 — Enter repetido…» |
| R604 | `buscador-filtros-escaneo.test.tsx` «R604 — abre el visor ya encendido…», «R604 — la URL del QR leída por la cámara…»; `QrScanner.test.tsx` «`encendidaAlMontar`» |
| R605 | `buscador-filtros-escaneo.test.tsx` «R605 — lo que no es guía avisa «Código inválido.»…» |
| R606 | `satelite-busqueda-guia-sql-real.test.ts` «R606 — la guia trae solo su orden…», «R606 — con los filtros puestos…»; `recepcion-satelite-busqueda-guia.test.ts` (R606) |
| R607 | `satelite-busqueda-guia-sql-real.test.ts` «R607 — la pagina, la descarga y la vigencia…»; `recepcion-satelite-busqueda-guia.test.ts` (R607) |
| R608 | `satelite-busqueda-guia-sql-real.test.ts` «R608 — … OTRA ZONA …» (con control positivo en B), «R608 — … OTRA EMPRESA …» |
| R609 | `buscador-filtros-escaneo.test.tsx` «R609: sin Enter…» (500 ms, sin `escaneo`, «X»); `buscadores-con-escaneo.guardia.test.ts`; `buscador-filtros-*.test.tsx` existentes en verde |

Guías del test SQL: `209102401` y `2091024015` (la contiene), prefijo `20910240`; no las de `91024`/`910245`
del spec porque `num_guia` es único en toda la base y lejos de la secuencia no chocan con filas existentes.

## Mutaciones (restauradas con `git checkout --`)

| # | Mutación | Resultado |
| --- | --- | --- |
| 1 | `select()` tras Enter desactivado | rojo: 2 tests R603 |
| 2 | cámara: quitar `return` tras «Código inválido.» | rojo: R605 |
| 3 | `QrScanner` sin `encendidaAlMontar` + quitar `return` | rojo: R604 ×2, R605 |
| 4 | guardia: quitar `escaneo` de `LibroCajaBarra` y ponerlo en `FiltrosCierresBarra` | rojo: 3 tests de la guardia |
| 5 | WHERE: `num_guia = $g` → `CAST(num_guia AS text) LIKE '%g%'` (volver a contención) | rojo: R606, R607, R608 zona |
| 6 | `existeGuiaEnBodega` sin la condición de zona | rojo: R608 zona y R608 empresa |
| 7 | servicio: `filtroDeRepo` sin `conGuiaExacta` | rojo: R606, R607 |

## Salidas

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` → `TSC_EXIT=0`.
- `pnpm exec eslint <lo tocado>` → 0 errores; 1 warning previo ajeno (`OrdenHistorialOrigenTipo` sin uso,
  `IOrdenRepository.ts:11`, ya en `dev`).
- `vitest run tests/unit/components/buscador-filtros` + `EscanerModal` + `QrScanner` → 9 archivos, 101 passed.
- Tests de los 7 montajes (31 archivos que los importan + guardia) → 34 archivos, 422 passed.
- `vitest run tests/unit/services/recepcion-satelite* bulk-orden-service* orden-service rol-admin-satelite-authz
  tests/unit/repositories/satelite-paginado-where.test.ts` → 15 archivos, 312 passed.
- `vitest run tests/integration/db/satelite-busqueda-guia-sql-real.test.ts` (base desechable) → 5 passed, 0 skipped.
- `satelite-*-real` existentes: `satelite-alcance-por-bodega-real`, `satelite-conjunto-sql-real`,
  `satelite-detalle-sin-dinero-empresa-sql-real`, `salida-a-reparto-sql-real` en verde.
  `satelite-bodega-alcance-real.test.ts` 4 rojos «el catalogo local no tiene el estatus ayuda_tienda» y
  `455/.../filtro-satelite-por-codigo` «tabla `orden` vacia»: **de la base desechable**, no del cambio —
  el mismo rojo con `lib/` de `dc919df2` (antes de SLT-160).

## Canvas vs spec (artboard «1 · Buscador de un listado (Órdenes)», `BuscadorListado.dc.html`)

Diferencias NO cambiadas (manda el spec aprobado); a decidir por el humano:

1. **Sitio del botón de cámara.** Canvas: botón APARTE de 44×44 junto al campo, fuera del borde
   (`<button type="button" aria-label="Escanear con cámara" style="width: 44px; height: 44px; …">`, línea 26,
   hermano del `div` del campo de la línea 22). Spec R600 y lo implementado: DENTRO del campo junto a la «X»
   (`components/shared/BuscadorFiltros.tsx:685`, `absolute right-1.5`).
2. **Texto de ayuda bajo la barra.** Canvas línea 32: «Escanea o escribe la guía y pulsa Enter. Lo leído por la
   pistola o por la cámara (QR o código de barras) se busca igual.» El spec no lo pide; no implementado.
3. **Nombre accesible del campo.** Canvas línea 21: «Buscar órdenes». Hoy «Buscar»
   (`app/(app)/ordenes/_components/OrdenesListado.tsx:1456`); el spec no lo cambia.
4. **Alto del campo.** Canvas: `min-height: 44px` (línea 22). Hoy `h-8` (`BuscadorFiltros.tsx:45`, 32 px).
5. **Alcance.** Canvas línea 43: «los 9 buscadores … (Órdenes, recolección, devoluciones, rechazos, novedades,
   satélite…)»; notas de `canvas.json`: «Buscadores (9)». Spec: B1-B8 y B9 `/cierres-admin` fuera (busca por
   folio, SLT-153); recolección/devoluciones/rechazos no figuran como buscadores en el spec.

## Abierto

- T5 dispositivo (pistola CODE128 y QR, cámara del teléfono) en Preview: no hecho.
- T6 `./init.sh` y E2E de los listados con buscador: no corridos aquí (sin dev server ni build por los
  agentes en paralelo); los corre el leader.
- Las 5 diferencias con el canvas de arriba.

Veredicto: T1-T4 hechas, R600-R609 con test, typecheck 0 y mutaciones del WHERE matadas contra Postgres real.
