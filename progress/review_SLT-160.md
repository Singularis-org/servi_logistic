# review SLT-160 «Buscar escaneando en los listados»

Ruta **ligera**, review acotada al diff `origin/dev...fe8e4400`. Spec: R600-R609, R770-R772, DC1, DC2.
Reviewer, 2026-11-16. Grafo no usado (Grep/Read sobre el worktree).

## Checklist

- [x] **Ruta.** Frontend + un cambio de consulta de lectura en servidor; sin dinero, permisos,
      auth, integraciones ni webhooks. La ligera vale.
- [x] **Lo que ya existe.** Sección presente en el spec. El diff no re-crea nada: amplía
      `BuscadorFiltros` (prop `escaneo`), `EscanerModal` (`soloIcono`), `QrScanner`
      (`encendidaAlMontar`), y reutiliza `leerGuia` (`lib/utils/paquete-url`) en el Enter y en la
      cámara. Ningún regex de guía nuevo en el diff.
- [x] **Trazabilidad.** Cada R tiene test que falla si se rompe (ver tabla).
- [x] **Tasks T1-T4, T4b** marcadas `[x]`. **T5** (dispositivo en Preview) y **T6** (cierre:
      `./init.sh` + E2E locales) abiertas: según `AGENTS.md` F2.4 son del leader, después de esta
      review (ver condición C1).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 28/40 archivos, 295/1000 líneas de producción,
      998/3000 de tests. Dentro.
- [x] **Typecheck.** `tsc --noEmit -p .` → exit 0.
- [x] **Lint** de lo tocado: 0 errores; 1 warning previo en `dev` (`IOrdenRepository.ts:11`).
- [x] **Tests** (contra la desechable `servi_slt160_desechable`): `buscador-filtros*`, `EscanerModal`,
      `QrScanner`, `ordenes-listado*`, guardia, `recepcion-satelite*`, `bulk-orden-service*`,
      `orden-service`, `rol-admin-satelite-authz`, `satelite-paginado-where`,
      `tests/integration/db/satelite*` → 547 passed, 4 rojos, todos de
      `satelite-bodega-alcance-real.test.ts` («el catalogo local no tiene el estatus ayuda_tienda»),
      que está en `tests/baseline-rojos.json`: no es hallazgo.
- [x] **Multi-empresa.** `existeGuiaEnBodega` usa el MISMO `condicionesSatelite` que la página, la
      descarga y la vigencia (acotado por `zona_id`, que es de una empresa, y cubierto por la RLS en
      el SQL a mano). Hay test de integración con dos empresas (R608 «OTRA EMPRESA»).
- [x] **Sin migración, sin dependencia nueva, sin literales de país, sin Ordenex.**
- [x] **/cierres-admin fuera.** Ningún archivo de `cierres-admin` en el diff; la guardia afirma que
      `FiltrosCierresBarra.tsx` monta sin `escaneo` y que solo los 7 montajes de B1-B8 lo pasan.
- [x] **Usos sin `escaneo` no cambian.** `alto` sigue en `h-8` / `h-8 max-md:h-11`; «Limpiar todo»
      solo suma `h-11` con `escaneo`; `onKeyDown` es `undefined` sin `escaneo`; `aria-describedby`
      sin `escaneo` queda igual; sin cámara ni ayuda. Test «sin `escaneo`, el alto de siempre (h-8)»,
      «sin `escaneo`, Enter no adelanta…», «sin `escaneo` no se monta», «sin `escaneo` no está».
      Los nombres de B3-B8 no cambian (sus montajes solo suman `escaneo`).
- [x] **UI contra el artboard** (`BuscadorListado.dc.html`): cámara aparte de 44 × 44 con
      `aria-label="Escanear con cámara"` (`size-11`, fuera del contenedor del campo); campo de
      `min-height: 44px` (`h-11`); ayuda literal idéntica; label «Buscar órdenes». Coincide.
- [x] **Archivos fuera de la lista original.** Dobles de repositorio
      (`bulk-orden-service*`, `orden-service`, `rol-admin-satelite-authz`: una línea
      `existeGuiaEnBodega` en `false`; `recepcion-satelite-paginado`: doble que responde `false`, sin
      tocar aserciones) y `ordenes-listado-{filtros,orden,vistas}` (solo `name: "Buscar"` →
      `"Buscar órdenes"`, por R772). Justificados y mínimos.
- [x] **OrdenRepository/IOrdenRepository.** Cambio mínimo: `numGuia?` en `RecepcionSateliteFiltro`,
      un `push` en `condicionesSatelite` (en el AND) y el método `existeGuiaEnBodega`. Choque con la
      épica de geografía jerárquica aceptado por Carlos (`progress/features/SLT-160.md`).

## Trazabilidad (verificada)

| R | Test |
| --- | --- |
| R600 | `buscador-filtros-escaneo.test.tsx` «con `escaneo` se muestra… fuera del campo y de 44 px», «sin `escaneo` no se monta» |
| R601 | id. «R601 — la URL del QR + Enter…», «R601 — `#1024`…»; `ordenes-listado-buscador.test.tsx` «SLT-160 R601…» |
| R602 | id. «R602 — un texto que no es guía…», «R602 — por debajo de `minChars`…» |
| R603 | id. «R603 — tras Enter…», «R603 — la segunda lectura sustituye…», «R603 — Enter repetido…» |
| R604 | id. «R604 — abre el visor ya encendido…», «R604 — la URL del QR leída por la cámara…»; `QrScanner.test.tsx` |
| R605 | id. «R605 — lo que no es guía avisa «Código inválido.»…» |
| R606 | `tests/integration/db/satelite-busqueda-guia-sql-real.test.ts` «R606 — la guia trae solo su orden…» (control positivo: el prefijo trae las dos), «R606 — con los filtros puestos…» |
| R607 | id. «R607 — la pagina, la descarga y la vigencia…» |
| R608 | id. «R608 — OTRA ZONA…» (control positivo: B la ve), «R608 — OTRA EMPRESA…» |
| R609 | `buscador-filtros-escaneo.test.tsx` (500 ms, sin `escaneo`, «X»); `buscadores-con-escaneo.guardia.test.ts` |
| R770 | `buscador-filtros-escaneo.test.tsx` — ayuda con literal a mano (no contra `AYUDA_ESCANEO`) y descripción accesible |
| R771 | id. — `h-11` del contenedor, «Filtros» y «Limpiar todo»; sin `escaneo`, `h-8` |
| R772 | `ordenes-listado-buscador.test.tsx` «SLT-160 R772…»; guardia para B1 y B2 |

## Mutaciones propias (restauradas con `git checkout --`, sin `git stash`)

| # | Mutación | Resultado |
| --- | --- | --- |
| M1 | `OrdenRepository.condicionesSatelite`: `o."num_guia" = $g` → `CAST(o."num_guia" AS text) LIKE '%g%'` (volver a contención) | rojo: R606, R607, R608 zona (3/5) |
| M2 | `existeGuiaEnBodega`: `condicionesSatelite(filtro).slice(1)` (sin el acotado por zona) | rojo: R608 zona y R608 empresa (2/5) |

Base: el archivo de integración corrió con 5 passed (no skipped) antes y después de restaurar.

## Hallazgos

- **menor** — `components/shared/BuscadorFiltros.tsx:241`: el JSDoc de la prop `escaneo` dice
  «un botón de cámara dentro del campo, junto a la «X»»; tras DC2 la cámara va FUERA del campo.
  Comentario desfasado.
- **menor** — `progress/impl_SLT-160.md:47`: «la «X» pasa a su izquierda (`right-8`), campo `pr-16`»
  ya no describe el código (la «X» y `pr-9` siguen como en `dev`; la cámara salió del campo).
- **menor** — `tests/integration/db/satelite-busqueda-guia-sql-real.test.ts:302-332`: el caso
  «OTRA EMPRESA» no tiene control positivo propio (que el admin de la otra empresa sí la vea). Lo
  cubre de hecho el control de «OTRA ZONA» y M2 lo pone en rojo; no bloquea.
- **menor** — el botón de cámara no recibe `disabled` cuando la barra está deshabilitada
  (`BuscadorFiltros.tsx`, montaje de `EscanerModal`); no lo pide el spec.

## Condición para el PR (no es hallazgo de código)

- **C1** — T6 sigue abierta: `./init.sh` en verde y, por `docs/perfil-agentes.md > Todos los agentes`
  (toca pantallas), los E2E locales que usan los buscadores de B1-B8 (`grep -rl` en `e2e/`) con la
  salida en `impl_SLT-160.md` antes de abrir el PR. Sin esa constancia, el PR queda bloqueado por
  la regla del reviewer de `perfil-agentes.md`. T5 (Preview) va después.

## Veredicto

**OK** — sin bloqueantes en el código. Cuatro menores; C1 queda a cargo del leader en F2.4.
