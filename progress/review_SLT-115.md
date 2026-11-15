# Review SLT-115 «Retirar los componentes de cierre sustituidos»

## Vuelta 1 (acotada a `origin/feature/SLT-134-textos-cierres-tu-guardia...HEAD`, HEAD 7a182e33)

Ruta **ligera**, review acotada al diff propio (merge-base `fb1482de`). Grafo no consultado: el
worktree no tiene índice (lo registra el spec); Grep/Read y git.

### Checklist

- [x] **Trazabilidad R400-R409.** Cada R tiene test que lo mide (mapa en `progress/impl_SLT-115.md`):
  R400 con `it` (no `it.fails`) en `cierres-retirados.guardia.test.ts:175,182`; R401 descarga/*; R402
  `paginacion-transversal` + `paginacion-dominios`; R403 `ConsolidacionBodegaRefresco` (dos casos);
  R404/R405 guardia nueva + `cierre-dia-descarga-columnas` / `pagos-captura`; R406 literal sin cambios;
  R407 verificación por `git diff --name-only`; R408 control positivo y contrapruebas; R409
  `cascada-central…` con superficies `[]` y contrapruebas.
- [x] **R407.** `git diff --name-only fb1482de HEAD`: 0 rutas de `lib/`, `db/` o `e2e/`.
- [ ] **Tasks.** T0-T5 `[x]`; **T6 sin marcar** (cierre del leader: gate, Grep final, E2E local).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 55/40 archivos, 3330/1000 líneas contra `origin/dev`
  (incluye SLT-134 y SLT-141 apiladas); aceptado por Carlos en `progress/features/SLT-115.md`.
- [x] **Ruta ligera sostenida.** Sin dinero, permisos, esquema ni contratos de servidor: lo de
  `desglose-pago.ts` es borrar `desgloseDescarga`, sin consumidor (typecheck lo confirma).
- [x] **Mudanza idéntica (pregunta 1).** Comprobado por mi cuenta con un script que extrae cada
  declaración de `git show fb1482de:<lista>` y la busca literal en el módulo de `HEAD`:
  `descargaHistoricoCierres` (24 l.), `PAGINACION_HISTORICO_LABEL`, `ERROR_CARGA_HISTORICO`,
  `VACIO_HISTORICO`, `CierresAdminHistoricoPagina`, `descargaBodegaResueltos` (16 l.),
  `CierresBodegaResueltosPagina`, `descargaBodegaSolicitados` (31 l.), `CierresBodegaSolicitadosPagina`:
  idénticos. `PAGINACION_BODEGA_SOLICITADOS_LABEL` + `TITULO_DESCARGA` comprobados con `diff` de las
  líneas 44-107 de la lista contra `ConsolidacionBodegaModule.tsx:238-281`: solo faltan las props,
  `ERROR_CARGA`, `PAGE_SIZE_OPTIONS` y `leerPagina`, que eran del componente borrado. Siguen montadas:
  `CierresAdminModule.tsx:1318,1386`, `CierresBodegaAdminModule.tsx:534`,
  `ConsolidacionBodegaModule.tsx:499,549`. Fuera de los bloques mudados, los tres módulos solo cambian
  imports.
- [x] **`paginacion-transversal` (pregunta 2).** El campo `descarga` **endurece**: R52 se mide sobre el
  cuerpo de esa función (antes, una segunda descarga del módulo podía satisfacerlo), exige ≥ 1 acción
  leída y que todas sean `…Completo`; las dos mitades negativas siguen sobre el archivo entero. Las
  filas sin `descarga` (las otras diez pantallas) se miden igual que antes. La bitácora cita dos
  mutaciones que lo ponen en rojo.
- [x] **`cascada-central…` (pregunta 3).** No quedó hueca: las aserciones `toEqual([])` sobre el barrido
  real de `app/` muerden si alguien vuelve a montar `<CierreBodegaFacturaResumen>` o un comprobante
  ajeno (es exactamente R409); los `it.each` vacíos se cambiaron por funciones `problemasR38/R21`
  afirmadas sobre el barrido y sobre fuentes de muestra (literal, sin `cierre`, `cascadaCentral` en un
  ajeno, prefijos distinguidos). El control positivo del barrido (> 50 archivos) se mantiene.
- [x] **Tests borrados (pregunta 4).** Mapa de cobertura en la bitácora; comprobé que los tests vivos
  citados existen (`ColaCierresConsolidar` «recibido incompleto», `ConciliacionSateliteCascada`
  R235/R236, `ConsolidacionBodegaRefresco` «(d) sin marca / con marca»). Los «sin pantalla viva» lo son:
  la tarjeta no la monta nadie (R409).
- [x] **R403/P1 (pregunta 5).** Aviso presente, región y vacío ausentes, y `solicitados` no se llama
  tras dejar correr SWR (la bitácora cita la mutación de la clave que lo pone en rojo).
- [x] **Verificación ejecutable propia** (base desechable `slt115_wt`):
  - 13 archivos (guardias nueva y tocadas, paginación, descargas, R403): `Tests 202 passed`, EXIT=0.
  - 7 archivos (los tests recortados + los vivos del mapa): `Tests 144 passed`, EXIT=0.
  - Typecheck/lint: no los repetí; gate del leader `INIT_EXIT=0`.

### Hallazgos

1. **menor** — T6 sin `[x]` en `requirements.md > ## Tasks`: falta el cierre del leader (Grep final,
   mapa ya escrito, y los E2E locales `e2e/cierre-bodega-satelite.spec.ts` y
   `e2e/cierres-rediseno.spec.ts` que pide la propia T6). Marcarla con su evidencia antes del PR.
2. **menor** — La línea `tamano-pr-aceptado` dice «~1 900 líneas, 28 archivos»; el diff propio real es
   33 archivos y ~2 860 líneas (1 208 + 1 654, con ~600 de spec/progress), y `tamano-pr.mjs` mide
   55/3 330 contra `origin/dev` mientras SLT-134 y SLT-141 no mergeen. Actualizar la cifra con el real.
3. **menor** — Comentarios y títulos que quedan desfasados en `cascada-central…guardia.test.ts`: «las DOS
   superficies … están, y son éstas» con lista vacía, y «sigue declarado sin montar hasta que lo
   retire SLT-115» (ahora SLT-146 «Podar cierre-factura.tsx de lo que quedó sin montar»). Igual los
   comentarios mudados «Vive aquí, con el listado» (la bitácora ya lo anota). Sin efecto en la guardia.
4. **menor** — `cierre-bodega-vocabulario.guardia` deja de vigilar el texto de la descarga de solicitados
   (vive ahora en `ConsolidacionBodegaModule`, que esa guardia excluye). Lo sigue cubriendo el censo de
   trato de SLT-134; anotado en la bitácora. Aceptable.

### Veredicto

**APROBADO** (OK): sin bloqueantes. Los menores 1 y 2 los cierra el leader antes de abrir el PR.
