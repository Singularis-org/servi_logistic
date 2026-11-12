# review SLT-114 «Estado de cuenta de la satélite: conciliación en pestaña» — vuelta 1

Ruta **ligera**, revisión acotada a `git diff origin/dev...83df8fad` (22 archivos). Reviewer, 2026-11-12.

## Veredicto: CAMBIOS (RECHAZADO)

Un bloqueante: la cláusula de R239 sobre el importe del aviso con varias incompletas se quedó sin test
al adaptar los tests de «Pendiente de llegar» (PA1). El resto está bien y verificado.

## Ruta

- [x] Ligera es suficiente. PA4 (¿«toca dinero»?): el diff solo **pinta** los STRING del servidor con
  `money()`. No hay servicio, acción, consulta, esquema ni permiso tocado (`git diff --stat`: solo
  `app/`, `components/`, `lib/utils/cierre-enlace.ts`, tests, e2e y docs). En el código nuevo no hay
  `Number(`, `parseFloat` ni restas (grep). No sube a completa.

## Checklist

- [x] Spec ligero: `requirements.md` con `## Lo que ya existe` (no vacía), alcance, EARS R230–R239,
  `## Tasks`, `## Archivos esperados`. El diff reutiliza lo listado (`Cuenta`, `cuentaConciliacion`,
  `metodosVisibles`, `components/ui/tabs`, rótulos del detalle) y no re-crea nada de esa lista.
- [x] PA1/PA2/PA3 reflejadas en R231/R235/R239 y en el código: sin tarjeta «Pendiente de llegar»
  (`ConciliacionSatelite.tsx:370`), columnas `DESGLOSE_SATELITE_COLUMNAS.debeLlegar/falta`
  (`satelites-labels.ts:206-210`), `metodosVisibles` (`ConciliacionSatelite.tsx:257`).
- [ ] Tasks: T1–T5 `[x]`; **T6 sigue `[ ]`** (`requirements.md:171`) aunque su evidencia existe (ver menor 1).
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 19/40 archivos, 1132/1000 líneas, con
  `tamano-pr-aceptado` de Carlos en `progress/features/SLT-114.md:30`.
- [ ] Trazabilidad: R230–R238 con test concreto y verde; **R239 incompleta** (bloqueante 1).
- [x] `EstadoCuenta` sin la prop: el libro va en un fragmento, mismo DOM. `R234` en
  `tests/components/EstadoCuenta.test.tsx:393` comprueba sin tablist/tabpanel en tienda y vista
  tienda, con un control positivo que con la prop sí hay tablist (el test caería si el libro fuera
  siempre en pestañas). Solo `EstadoCuentaSatelite.tsx:72` pasa `pestanaPrevia` (grep). Los tests de
  tienda/`/mi-wallet` (`EstadoCuenta468`, `EstadoCuentaBarra467`) solo cambian la superficie satélite.
- [x] Solo frontend: ni `lib/services`, ni `lib/repositories`, ni `lib/actions`, ni `db/` en el diff.
  `useTotalSinConciliar` usa la misma clave SWR que la página 1 «Sin conciliar» (`ConciliacionSatelite.tsx:232` y `:270`), sin lectura nueva.
- [x] Enlace `?cierreBodega=`: `lib/utils/cierre-enlace.ts` +12 (constante y href con
  `encodeURIComponent`), reexporta `cierre-enlace.ts` del módulo, `CierresTabs.tsx` +9 (solo el
  inicializador de `useState`), `CierresBodegaAdminModule.tsx` +50 aditivos (componente
  `AbrirCierreBodegaDeLaUrl`, `limpiarCierreBodegaDeLaUrl` y una llamada en `cerrarDetalle`), sin tocar
  la cola ni el detalle. Mínimo; poca superficie de choque con SLT-106/SLT-110.
- [x] Aserciones: literales escritos a mano (importes con céntimos, canario `₡1.234,56` en R236, href
  `cb-1%2Fzeta%26x`); ninguna compara contra la función que genera el texto. Negativos con valores que
  no aparecen por casualidad (`ID_RARO`, `"₡0"` en una cuenta sin ceros, «Pendiente de llegar»).
- [x] Trato en tú: los textos nuevos no tienen imperativos ni voseo.
- [x] Sin literales nuevos de país/moneda en código (las menciones de SINPE/Costa Rica son líneas previas).
- [x] Comentarios explican el porqué.
- [x] Sin dependencias nuevas.
- [x] E2E del flujo crítico (cierres, wallet): caso nuevo «1b» en `e2e/cierre-bodega-satelite.spec.ts`
  más `cierres-rediseno` y `cierres-admin`, corridos en local según la bitácora. Ningún otro E2E lee
  `/wallet/satelites` (grep).

## Verificación propia (con `DATABASE_URL` → `slt114_conciliacion`)

- `pnpm run typecheck`: `TC_EXIT=0`.
- `eslint` sobre los `.ts/.tsx` del diff: `LINT_EXIT=0`.
- vitest de los 9 archivos del diff + `CierresBodegaAdminCola`, `CierresBodegaAdminDetalleUnico`,
  `CierresBodegaAdminRefresco`, `CierresAdminDeepLink`: 13 archivos, 197/197.
- vitest de todo test que importa un módulo tocado + guardias `wallet-sin-uuid`, `enlace-contraste-458`,
  `cierre-bodega-vocabulario`, `conciliacion-esperado-unico`: 50 archivos, 872/872.

## Hallazgos

### BLOQUEANTE

1. **R239 sin test en su cláusula del aviso con varias incompletas.** R239 dice «el aviso de diferencia
   (con varias incompletas, su importe sigue siendo el `saldoActual` del estado de cuenta)». Tras PA1,
   ese aviso (`ConciliacionSatelite.tsx:394`, `diferenciaDetalleVarias(money(pendiente))`) es el único
   sitio donde se pinta `pendiente`. Los dos tests que vigilaban que `pendiente` llegaba con el
   `saldoActual` («Pendiente de llegar» → `₡115.000` en `EstadoCuentaSatelite.test.tsx` y en
   `tests/integration/wallet-satelites.test.tsx:388`) se cambiaron por un negativo, y ningún test
   pinta «Entre todas falta por llegar…» (grep en `tests/` y `e2e/`: cero). Hoy, pasar a
   `ConciliacionSatelite` cualquier otro importe en `EstadoCuentaSatelite.tsx:76` deja todo verde.
   **Falta:** un test en `tests/components/EstadoCuentaSatelite.test.tsx` con dos consolidaciones
   incompletas que lea el aviso `role="status"` y compare con un literal a mano del `saldoActual`
   (p. ej. «Entre todas falta por llegar ₡115.000»), y añadirlo a la fila R239 de la trazabilidad
   del spec y de `progress/impl_SLT-114.md`.

### menor

1. `requirements.md:171` — T6 sigue `[ ]`. La evidencia está (E2E «1b», gate del leader con el tamaño
   aceptado y el único rojo `dominio-ordenex-fuera` por carga, 9/9 corrido solo); marcarla al cerrar.
2. `tests/components/EstadoCuentaSatelite.test.tsx:226-227` — R239 dice «las demás columnas y su orden no
   cambian», pero el test solo comprueba Debe llegar < Recibido < Falta. Un `toEqual` con la lista
   entera de cabeceras lo cerraría.
3. `tests/components/EstadoCuentaSatelite.test.tsx:280` — R232 pide conservar también término, casillas y
   página del libro; solo se prueba el estado de la conciliación (la mutación sin `keepMounted` sí lo
   mata). Riesgo bajo: el estado del libro vive en `EstadoCuenta`, encima de las pestañas.
4. `tests/components/DeudasD39D40ModeloEnPantalla.test.tsx:159-160` — al adaptar `-₡2.300,50`, el
   rótulo y el importe se miran por separado (`"₡2.300,50"` también casaría con `₡12.300,50`). La línea
   emparejada ya la vigila `ConciliacionSateliteCascada.test.tsx:171`, así que no se pierde cobertura.
5. `CierresBodegaAdminModule.tsx:350-357` — si la lectura por `?cierreBodega=` falla (`no_encontrada`), el
   parámetro se queda en la dirección y recargar repite el aviso. R238 no lo pide; anotarlo como deuda
   o limpiar también en el fallo.
