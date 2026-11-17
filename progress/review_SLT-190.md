# Review SLT-190 «Recoger y Recolección según el canvas» — vuelta 1

Fecha: 2026-11-17. Rama `feature/SLT-190-recoger-recoleccion-segun-canvas`, HEAD revisado `9bcb476c`,
diff contra `origin/dev` (`bed7c694`, = merge-base). Ruta **ligera**, zona frontend, complejidad low.
El diff no toca dinero, permisos, autenticación, integraciones ni webhooks: la ruta ligera vale.

**Veredicto: RECHAZADO (CAMBIOS)** — 2 bloqueantes, 3 menores.

## Checklist

- [x] Ruta: ligera respeta el suelo (solo presentación; nada de `lib/`, `db/`, `app/api/`, `page.tsx`).
- [x] Spec: `requirements.md` con alcance, EARS R850-R871, `## Lo que ya existe` (no vacía), `## Tasks`, `## Archivos esperados`.
- [ ] Tasks: T1-T5 `[x]`; **T6 `[ ]`** (E2E sin correr, `./init.sh` sin correr). Ver B2.
- [x] Lo que ya existe: no se re-crea nada. `BuscadorFiltros` (`filtros`/`activos`/`onLimpiarTodo`/`trasFiltros`), `VistaCardsToggle`, `Select` con `labelPrefix`, `showCloseButton`, `horaDe`, `Button size="icon-touch"` se reutilizan.
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 21/40 archivos, 538/1000 producción, 944/3000 tests.
- [x] Trazabilidad: R850-R871 mapeados a tests concretos en `progress/impl_SLT-190.md`; R861 solo por E2E (no corrido, B2).
- [x] Lint de los archivos del diff: `LINT_EXIT=0`. Typecheck: no lo repetí (gate en paralelo); el implementer reporta `TC_EXIT=0`.
- [ ] Guardias: **`estado-con-info.guardia.test.ts` en rojo, nuevo** (B1). `dependencias-declaradas-presentes` también rojo, pero está en `tests/baseline-rojos.json`: no es hallazgo.
- [ ] E2E afectados corridos en local (perfil reviewer: PR que toca pantallas): **no** (B2).
- [x] Datos/seguridad: sin tablas, queries, migraciones, secretos, literales de país/moneda nuevos, ni recursos de Ordenex.
- [x] Dependencias: ninguna nueva.
- [x] Táctil ≥ 44 px: «Cerrar» `size-11` (`components/ui/button.tsx:121`), conmutador `VISTA_TOGGLE_TACTIL` (`max-md:h-11`), selector «Tienda» `max-md:h-11`.
- [x] No rompe SLT-168 «Escaneo continuo en las recogidas del mensajero» (R833 en `RecogerPaqueteCard.test.tsx` y `EscaneoContinuo.test.tsx` verdes) ni R794 de SLT-189 «Reparto del mensajero según el canvas» (`PosOrderCardDetalleCompacta.test.tsx` verde; R866).
- [x] Sin rediseño: solo los puntos C1-C5 de la ficha; C7 fuera.

## Verificación ejecutada (base desechable `servi_slt190_desechable`)

- `vitest run` de 12 archivos (RecogerModule, RecoleccionModule, PosOrderCardPosicion, PosOrderCardDetalleCompacta, EscanerModal, EscanerGuiaCard, RecogerPaqueteCard, EscaneoContinuo, filtro-tienda, guardias nombres-estado-retirados, pwa-mensajero-sin-recorte, estado-con-info): **335 passed, 2 failed** — los 2 son `estado-con-info` (B1).
- `pnpm run test:guardias`: 352 archivos verdes, 2 rojos: `estado-con-info` (nuevo, B1) y `dependencias-declaradas-presentes` (baseline).
- Mutaciones (todas revertidas con `git checkout --`, `git status` limpio al final):
  - R851: `filtrarPorTienda` no filtra → 9 rojos (filtro-tienda, RecogerModule, RecoleccionModule). Muere.
  - R853: contadores «Para recoger hoy» y aviso de nuevas desde la lista filtrada → rojo en RecogerModule; «{n} paquetes por recolectar» desde la filtrada → rojo en RecoleccionModule. Muere. **«Para otro día (n)» desde la filtrada sobrevive** (m1).
  - R865: «Recogido a las» repetido en el despliegue de Detalle → rojo R863/R865. Muere.
  - R869: `showCloseButton` siempre encendido (dos «Cerrar») → rojo en EscanerModal, RecogerPaqueteCard, RecoleccionModule. Muere.
  - R867/R868: `EscanerGuiaCard` ignora `sinEncabezado` → rojo en EscanerGuiaCard y RecogerPaqueteCard. Muere.
  - El implementer ya mató R855 (posición desde `secuenciaRuta`) y R860 (conmutador en la cabecera).

## Lo declarado fuera de lo previsto

- `app/(app)/mis-asignaciones/_components/FiltroTienda.tsx` (nuevo): **reusa**, no reinventa. Envuelve el `Select` con `labelPrefix` —el mismo control que pinta el `single` de `FilterComponent` (`components/shared/FilterComponent.tsx:922-933`)— y se monta como hijo de `BuscadorFiltros`, igual que `FiltroCantonDistrito` de Reparto. Cumple la decisión de Carlos (P2: selector existente, sin chip). Evita duplicar el control en las dos pantallas. Aceptable.
- `RecoleccionModule.test.tsx`: «sin nada por recolectar no hay conmutador» se sustituye por R860 (conducta contraria, pedida por DS4); el test de R517 solo cambia dónde busca el conmutador (`screen` en vez de la cabecera) y sigue afirmando el cambio de vista. No se debilita: el contrato viejo lo retira el spec.
- `RecogerModule.test.tsx:752-758` («de 2»): pasa de `getByText` (uno) a «al menos uno fuera de un `article`». Sigue exigiendo la etiqueta del carrusel; se ajusta porque ahora las tarjetas también dicen «n de 2». No se debilita en lo que importa.
- R861 solo por E2E: aceptable que jsdom no mida, pero entonces el E2E tiene que correr (B2).

## Hallazgos

### B1 — BLOQUEANTE: la guardia `estado-con-info` queda en rojo por el diff
`app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx:237` pinta
`{nombreDeEstado(orden.estatusValue)}` (import en :21) fuera de `EstadoConInfo`, y la guardia de la
456 (R18: ningún nombre de estado sin su botón de información) falla en (a) y (b):
`tests/unit/guards/estado-con-info.guardia.test.ts:290` y `:294`. No está en `tests/baseline-rojos.json`:
es rojo nuevo, `./init.sh` (todas las guardias) y el CI lo tumban. El `vitest related` del implementer no
lo vio porque la guardia lee archivos, no los importa.
Qué falta: el texto sin botón en la fila plegada lo decide DS5 (aprobado), así que hay que **declararlo**
en `USOS_PERMITIDOS` de la guardia con su clase y motivo (la candidata es `control-con-hermano`: el
`EstadoConInfo` del despliegue de la misma tarjeta es el hermano) y comprobar que el apartado (a) lo
admite. Si la guardia no admite pintarlo como hijo JSX ni con excepción, DS5 choca con 456 R18 y eso
se le pregunta a Carlos antes de tocar nada más. Cierre: `pnpm run test:guardias` verde salvo baseline.

### B2 — BLOQUEANTE: E2E y gate sin correr (T6 abierta)
La ruta ligera pide todas las tasks `[x]` y T6 está `[ ]`. El perfil (`docs/perfil-agentes.md > reviewer`)
bloquea un PR que toca pantallas sin constancia de los E2E afectados corridos en local, y R861 (pegado al
bajar, sin desborde a 360/414 px, 44 × 44) solo tiene cobertura E2E. Falta: correr
`e2e/pwa-mensajero-recoger-recoleccion.spec.ts` (los nuevos SLT-190 y los (a)/(b) de SLT-156, que
cambian de barra y de diálogo) y `e2e/mis-asignaciones.spec.ts` (abre el mismo diálogo de Recoger) sobre
base desechable con build, más `./init.sh` con `INIT_EXIT` en el log; dejar la salida en
`progress/impl_SLT-190.md` y marcar T6.

### m1 — menor: la mutación del contador «Para otro día» sobrevive (R853)
`RecogerModule.tsx:406` con `otroDiaFiltrado.length` en vez de `grupos.otroDia.length` deja verde
«R851/R853» (`tests/components/RecogerModule.test.tsx`, fixture `TRES` ~l.1977-1994): la única orden de
otro día es de «Tienda Sur», la tienda que el test elige, así que el número no cambia. Añadir una de otro
día de otra tienda (o filtrar por «Tienda Norte») para que la aserción `Para otro día (n)` muerda.

### m2 — menor: comentario desactualizado
`app/(app)/recoleccion/_components/RecoleccionModule.tsx:256-257` sigue diciendo «la tarjeta de dentro
conserva «Recolectar en tienda»»; con `sinEncabezado` ya no lo pinta (lo dice la barra del diálogo).

### m3 — menor (opcional): estado del filtro duplicado
`cambiarFiltrosPuestos`/`limpiarTodo` y el par `tienda`/`filtrosPuestos` son idénticos en
`RecogerModule.tsx:161-176` y `RecoleccionModule.tsx:169-184`. Un hook en `filtro-tienda.ts` lo dejaría
en un sitio; no bloquea.

## Veredicto

**RECHAZADO (CAMBIOS).** Vuelve al implementer por B1 (guardia `estado-con-info` en rojo) y a quien corra
el E2E y `./init.sh` por B2. El resto —trazabilidad, mutaciones, reuso, 44 px, SLT-168 y R794 intactos—
está bien.
