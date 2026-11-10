# Review — SLT-101 «Fila de gestión única y lista con filtros»

Reviewer, 2026-11-09. Rama `feature/SLT-101-fila-gestion-unica`, HEAD revisado `deea9b97`
(50 archivos contra `origin/dev`). Ruta completa (toca dinero), zona fullstack desde PA1.

## Veredicto: **OK con menores** (0 bloqueantes, 6 menores)

## Checklist

### Ruta y especificación
- [x] Ruta completa (toca dinero): `requirements.md` con EARS, `design.md` con 8 alternativas
  descartadas, `tasks.md`.
- [x] `design.md` abre con `## Lo que ya existe`, y el diff no vuelve a crear nada de esa lista: reutiliza
  `BuscadorFiltros`/`FilterComponent` (con props aditivas), `Cuenta`, `EstadoConInfo`, `MarcaAjustado`,
  `BotonesEvidencia`, `DescargarDatasetButton`, `money()`, `esMontoCero`, `vuelveABodega` y
  `toIngresoEmpresa`. `GestionesPorResultado` no se toca (alternativa 1).
- [ ] Tasks: 77 `[x]`; **T7.1** (gate de cierre) sigue `[ ]`. Ver menor m1.

### Tamaño
- [x] `node scripts/tamano-pr.mjs`: 45/40 archivos y 4 750/1 000 líneas, **aceptado** con la marca
  `tamano-pr-aceptado` de 2026-11-09 en `progress/features/SLT-101.md` («no partir», S3-3).

### Trazabilidad: los 28 R activos tienen su test
| R | Test que lo verifica (leído, no vacío) |
|---|---|
| R22 | `FilaGestion.test.tsx` (cuatro audiencias); `CierresAdminDetalleUnico` «SLT-101 R90» |
| R23 | `fila-gestion-vista.test.ts` «R23, R86 — columnas por audiencia»; `DetalleCierreGestiones` (cabecera) |
| R24 | `fila-gestion-vista.test.ts` «R24, R85»; `FilaGestion.test.tsx` «celda vacía» |
| R25 | `fila-gestion-vista.test.ts` «R25: qué tarjetas ve cada audiencia»; `FilaGestion.test.tsx` (cabecera de tres datos) |
| R26 | `fila-gestion-vista.test.ts` «tabla de R26…»; `FilaGestion.test.tsx` «R26, R89»; `CorregirResultadoCierre` (+ satélite) |
| R27 | `fila-gestion-vista.test.ts` (métodos en 0 fuera, «Sin dato»); `FilaGestion.test.tsx` |
| R28 | `FilaGestion.test.tsx` «nuevo: abre y pliega» |
| R29 | `fila-gestion-vista.test.ts` (GAM, no GAM, pacto, sin pacto, sin comisión, sin tarifa); `FilaGestion.test.tsx` (paridad) |
| R30 | `fila-gestion-vista.test.ts` «R30: la satélite nunca ve el fulfillment»; E2E satélite A |
| R64 | `cierre-detalle-cifras-fila-sql-real` «R64/R97»; `FilaGestion.test.tsx`; E2E central B |
| R65 | ídem «R65/R93/R92» y «R65/R94» |
| R66 | ídem «R66/R95» y «R66/R96» |
| R71 | `liquidacion-money-safe` (cuenta los 5 archivos de `fila/`) + grep vacío (lo repetí, abajo) |
| R72 | `git diff db/ lib/actions` vacío (lo comprobé). Es una restricción negativa: no tiene un test propio, pero se puede comprobar |
| R77 | `e2e/cierres-rediseno.spec.ts` (S3-A central/satélite, central B) + `ajuste-pago-mensajero-cierre` |
| R84 | `fila-gestion-vista.test.ts` (7 opciones con literales escritos a mano); `DetalleCierreGestiones` (sin buscador, «Todas 4» activa, filtrar, vacío, no navega); `filter-component-chips`; `buscador-filtros-sin-buscador` |
| R85 | `fila-gestion-vista.test.ts` (texto por audiencia y orden); E2E `cierres-admin-rechazos-sla` |
| R86 | `FilaGestion.test.tsx` «los importes nulos son «—»»; `estado-con-info.guardia` |
| R89 | `FilaGestion.test.tsx` (nombres de los botones); `DetalleCierreGestiones` (grupo, `aria-pressed`) |
| R90 | `CierresAdminDetalleUnico` «SLT-101 R90»; E2E central A y satélite A |
| R91 | `detalle-cierre-descarga-columnas.test.ts` (8 cabeceras, señales, `null`); E2E central A (xlsx) |
| R92 | `cierre-detalle-cifras-fila-sql-real` (strings de escala 2) |
| R93 | integración «R65/R93/R92»; `fila-gestion-vista.test.ts` «sin `ivaIncluido` no hay línea» |
| R94 | integración «reverso → null», «la orden D no se cuela»; `cierres-admin-fulfillment-solo-central` (satélite `null`) |
| R95 | integración «R95: sin fila del mensajero…»; `fila-gestion-vista.test.ts` («− Ajuste», «+ Ajuste», viejo) |
| R96 | integración «R66/R96» (A false, B true, C viejo false) |
| R97 | `fila-gestion-vista.test.ts` «R97 nuevo = el canvas», `origenDe` × 8 niveles, nombres nulos, nota sin fecha |
| R98 | `fila-gestion-vista.test.ts` «R95, R98: pago con «Por tarifa»…» |

- [x] El mapa `R → test` está en `progress/impl_SLT-101.md` (T1 y T2–T6).
- [x] Los literales de los tests de pantalla están escritos a mano («Con señales 3», «Por tarifa ·
  precio propio del mensajero», «Ajustó Carlos R. · 07/11 19:02»); ninguno se compara contra la
  función que lo produce.

### Verificación ejecutable (la corrí yo)
- [x] `vitest run` de 13 archivos del diff (fila, lista, barra de filtros, descarga, montaje, ajuste,
  corregir resultado, ficha 481, `liquidacion-money-safe`, `estado-con-info`): **13 files, 239 passed**.
- [x] Integración contra Postgres real, base desechable `slt101_rev` (migrada y sembrada; destino
  confirmado con `migrate status` → `database "slt101_rev"`): `cierre-detalle-cifras-fila-sql-real` +
  `tarifas-flexibles-snapshot` **18 passed, 0 skipped**.
- [x] Mutaciones mías del `WHERE`, cada una restaurada con `git checkout` (árbol limpio):
  - quitar `where: { actor: "mensajero" }` → **ROJO (2)** (R95 y R96);
  - `ordenFulfillmentMovimiento` con `where: {}` → **ROJO (1)** (se cuela la orden de otro cierre).
- [x] `eslint` de los archivos cambiados: 0 errores (3 avisos que ya estaban).
- [x] Typecheck y gate: según el leader, `INIT_EXIT=0` sobre `slt101_t1`. No repetí el typecheck
  (8 GB). El rojo `dependencias-declaradas-presentes` es el heredado (`init.sh` fuera del diff).

### Dinero (R71, R72, R92)
- [x] Servidor: cada cifra nueva con `Prisma.Decimal` y `.toFixed(2)` (`sumaPresentes`, `fulfillmentConIva`,
  `toPagoPorTarifa` con `minus`/`abs`/`isZero`), dentro del mismo `derivado` que `total`. Sin migración.
- [x] Cliente: `grep Number(|parseFloat|parseInt|toFixed|Math.` en `fila/`, `Cuenta.tsx` y la barra de
  filtros da **vacío**. `porcentajeParaVer` y `esMontoCero` solo trabajan sobre el texto (regex y
  `replace`). Ninguna suma ni reordenación de importes en el cliente.
- [x] Campos aditivos y opcionales; `toDetalleDTO` conserva el `false` donde la fila no lo trae
  (bodega y `/cierre-dia` no cambian).

### La satélite no recibe el fulfillment ni datos que son solo de la central
- [x] Servidor: `ocultarFulfillmentSiNoCentral` también anula `fulfillmentConIva`, `ivaPctFulfillment`
  y `fulfillmentCargadoAt` (`cierres-admin-fulfillment-solo-central`, «SLT-101 R94»).
- [x] Pantalla: `veFulfillment` solo para `central`, y para `solo lectura` cuando mira la central.
  Es una segunda capa (mutación de las dos capas roja en el E2E satélite A).
- [x] El pago por tarifa sale **solo** de la fila congelada con `actor = 'mensajero'`, filtrada en el
  `where` de la relación. Lo comprobé con una mutación: nunca sale el importe de la satélite.
- [x] Acciones: la satélite solo tiene «Ajustar pago» y «Ver evidencia», aunque le lleguen los otros
  callbacks (R26). Lo prueba `FilaGestion.test.tsx`.
- [x] `conceptosTarifa`, `ivaIncluido` y `pagoPorTarifa` llegan a la satélite: son del cobro a la tienda
  y del pago, que R25 ya le muestra («Se le cobra», «Ver cómo se calculó»).

### Props aditivas, apagadas por defecto
- [x] `BuscadorFiltros.buscador` (default `true`): con `true`, el DOM es el mismo de antes.
- [x] `FilterDef.presentacion` (default `Select`) y `FilterOption.tono`: solo se aplican en el
  `single` con «pastillas». `filter-component-chips` comprueba que sin la prop sigue el `Select`.
- [x] `Cuenta`: 7 props (`insignia`, `tono`, `vacio`, `aparte`, `notas`, `subtitulo`, `pie`). Sin ellas,
  el DOM sale idéntico; lo comprobé leyendo las ramas. `DineroIdentidadesEnPantalla` sigue verde
  (bitácora).
- [x] Las guardias `filtros-url-r25`, `wallet-barra-unica-467`, `analitica-barra-filtros-sin-solape` y
  `vistas-superficies-declaradas` están en verde (bitácora; `test:guardias` sin rojos nuevos).

### Fidelidad al canvas
- [x] Los textos de `Fila2.dc.html` están en el código tal cual: «Recibió el mensajero», «Se le cobra
  a la tienda», «de eso, IVA (no es de la empresa)», «Tarifa: grupo «…» de la zona …», «Monto fijo»,
  «Por tarifa · precio propio del mensajero», «− Ajuste», «Se le paga», «Motivo: «…»», «Ajustó … ·
  dd/MM HH:mm», «Fulfillment · se cobró al crear la orden», «Se cobró».
- [x] Los filtros son pastillas con el conteo detrás del nombre; «Con señales» va en ámbar; no hay
  buscador; «Descargar» va a la derecha en la misma fila.
- [x] La cabecera desplegada lleva solo Orden, Producto y Dirección (PA6). Ni indemnización ni
  «Ingreso de bodega» por gestión (S3-2).

### Checkpoints del proyecto
- [x] Ninguna tabla nueva, ninguna migración y ningún `down.sql` necesario.
- [~] Consulta nueva (`ordenFulfillmentMovimiento`): no lleva `organizacion_id` explícito. Se limita a
  las órdenes de `cierre_detail` del cierre ya resuelto dentro del alcance, y la empresa la impone
  `lib/db/extension-empresa.ts` (RLS). Es el mismo patrón que las otras 4 consultas de ese
  `Promise.all` y que todo el repositorio (0 filtros `organizacionId` a mano). Su test de
  integración siembra otra orden de otro cierre, no de otra empresa. Ver menor m2.
- [x] Ningún recurso de Ordenex, ningún secreto y ningún `console.log` nuevo con PII.
- [~] Literales de país: no hay «SINPE», «colones» ni «₡» en el código nuevo; los «₡» que aparecen
  están solo en comentarios. Las fechas usan `ZONA_CR`/`horaCostaRica`, y `design.md` lo aprueba
  hasta SLT-92 «Pantallas: fechas y teléfonos en la zona y el prefijo del país de la empresa». Ver
  menor m3.
- [x] El flujo crítico de cierres tiene E2E: `--project=dinero` dos veces seguidas, **91 passed**, sobre
  una base recreada (bitácora). Incluye todos los E2E que leen la pestaña «Gestiones» de
  `/cierres-admin`.
- [~] `dos-empresas-humo` (exigido si se tocan datos de negocio): no hay constancia de que se haya
  corrido. Ver menor m4.
- [x] Autorización: sin cambios. La audiencia sale de `audiencia === "admin"`, igual que el
  `verFulfillment` de antes.
- [x] Ninguna dependencia nueva.

## Las 12 desviaciones declaradas por frontend_dev

| # | Desviación | Juicio |
|---|---|---|
| 1 | 7.ª prop `subtitulo` en `Cuenta` | **Aceptable**: es aditiva, viene apagada y sin ella la línea «Tarifa: …» no tendría sitio. |
| 2 | `money()` («₡25.000») en lugar de «₡25.000,00» | **Aceptable**: es el formato de toda la app (ficha 359). Mirarlo en Preview junto con lo demás. |
| 3 | «Paquete dañado · sin indemnizar» (rótulo legible) | **Aceptable**: lo pide R85 literalmente («su rótulo legible») y D20. |
| 4 | `%` con `porcentajeParaVer` («13 %») | **Aceptable**: solo da formato al texto. Ver menor m5 por el import desde `app/`. |
| 5 | Fechas `dd/MM/yyyy HH:mm` con helpers de CR | **Aceptable**: es el formato del canvas; la zona fija queda como deuda de SLT-92 (m3). |
| 6 | La región «Órdenes del cierre» solo envuelve la tabla | **Aceptable**: R89 conserva el nombre de la región, y los filtros quedan en su grupo con nombre. |
| 7 | `aria-label` único por tarjeta | **Aceptable**: evita nombres repetidos cuando hay N filas abiertas; el cálculo conserva el nombre del canvas. |
| 8 | Fulfillment con `fulfillmentDeIngreso`; en el modelo nuevo la central siempre ve la tarjeta (₡0 si no hay concepto) | **Pregunta para Preview**: cumple R30 al pie de la letra (el servidor emite `"0.00"`, que no es nulo), pero toda gestión del modelo nuevo sin concepto de fulfillment enseñará «Fulfillment ₡0 · Se cobró ₡0». |
| 9 | R26 filtra también por audiencia | **Aceptable**: es exactamente la tabla de R26. `CorregirResultadoCierre` monta `admin`, como la página (`puedeCorregirResultado = esAccesoTotal`). |
| 10 | El rechazo manual pierde la marca «Manual» | **Aceptable** y cubierto por PA6 (ya está en «Preguntas para Preview»). |
| 11 | La mutación «Fulfillment a la satélite» se aplicó a las dos capas | **Aceptable**: cada capa por separado la matan sus propios tests. |
| 12 | La mutación `leerDeUrl=true` no se puede matar | **Aceptable**: la explicación es correcta (en modo URL la barra solo resta params) y la URL intacta se comprueba igual (`replace`/`push` sin llamar). |

La desviación de T1 (backend_dev: `tarifaFaltante` solo en el detalle de mensajero; en bodega sigue
`false` hasta SLT-104 «Detalle de cierre de bodega en el detalle único (central)») es **aceptable**:
sin ella cambiaría la pantalla de bodega, y R90 no lo permite.

## Hallazgos

Bloqueantes: **ninguno**.

- **m1 (menor)** — `tasks.md > T7.1` está `[ ]`. El leader dice que el gate está verde (`INIT_EXIT=0`).
  Hay que marcarla `[x]` con la referencia al log antes del PR. Es tarea del leader, no del
  implementer.
- **m2 (menor)** — La consulta nueva de `ordenFulfillmentMovimiento` no tiene un test con **dos
  empresas** (`docs/checkpoints-proyecto.md > Datos y seguridad`). Riesgo bajo, por tres motivos: se
  limita a las órdenes del cierre ya resuelto en el alcance, la RLS la pone la extensión de empresa, y
  el `ordenId IN` lo mata una mutación. Se puede saldar añadiendo un caso de otra empresa a
  `cierre-detalle-cifras-fila-sql-real`, o anotándolo como deuda del patrón «EL ALCANCE NO SE REPITE».
- **m3 (menor)** — Hay `ZONA_CR`/`horaCostaRica` en código nuevo (`fila-gestion-vista.ts:18-221`).
  `design.md > Datos que dependen del país` lo aprueba, pero suma un uso más a lo que tendrá que
  generalizar SLT-92 «Pantallas: fechas y teléfonos en la zona y el prefijo del país de la empresa».
  Conviene anotarlo en esa ficha.
- **m4 (menor)** — No hay constancia local de `e2e/dos-empresas-humo.spec.ts` (el checkpoint lo pide
  cuando se tocan datos de negocio), ni de `e2e/wallet-iva-aparte-sl39.spec.ts`. Este segundo está en
  el proyecto `aislamiento` y lee la `Cuenta` de «Dinero» en `/cierres-admin`. El DOM de `Cuenta` sin
  props es idéntico y la consulta es solo de lectura, así que el riesgo es bajo. Aun así, el leader
  debería correr esos dos specs en local antes de abrir el PR y pegar la salida en
  `impl_SLT-101.md`.
- **m5 (menor)** — `components/private/cierres/fila/fila-gestion-labels.ts:10` importa
  `porcentajeParaVer` de `app/(app)/configuracion/tarifas/_components/tarifas-textos`: es una
  dependencia de `components/` hacia el `_components` de otra pantalla. Ya hay precedente (`fila/`
  importa también de `app/(app)/cierres-admin/_components/`), pero a medio plazo convendría mover
  el helper a `lib/utils/`.
- **m6 (menor)** — En la audiencia `mensajero` (con dobles, sin montar; la monta SLT-108 «/cierre-dia:
  detalle y cola únicos para el mensajero»), si hay ajuste la tarjeta pinta «Por tarifa ₡2.500» y
  «Tu ganancia ₡1.800» sin la línea «− Ajuste». Esa cascada no cuadra a la vista. SLT-108 tiene que
  decidirlo (quitar «Por tarifa» al mensajero cuando hubo ajuste, o enseñarle el ajuste).
  Además, en `progress/features/SLT-101.md` la tabla sigue con zona `frontend` y la sección «Estado»
  está desactualizada (solo bitácora).

## Preguntas para Preview (no bloquean)
- Desviación 8: la tarjeta «Fulfillment ₡0 · Se cobró ₡0» en las gestiones del modelo nuevo sin
  concepto de fulfillment.
- Las que ya estaban: PA2, PA6, PA8, «Sin dato» en «Recibió» fuera de una entrega, la tabla 338 que
  desaparece, y el modelo viejo sin «Por tarifa».

## Notas
- Base desechable `slt101_rev` creada en el servidor de `.env` para esta revisión (migrada y sembrada). No
  se borró: puede eliminarse cuando se quiera.
- No usé el grafo: el índice de este worktree no existe (`design.md` lo anota). Revisé con Grep/Read.
