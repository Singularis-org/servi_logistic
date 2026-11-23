# impl SL-21 «Moneda e impuestos configurables por país» — bitácora backend_dev

## Tanda 1 — bloques 1 y 2 (T1.1, T1.2, T1.3, T2.1, T2.2, T2.3) · 2026-11-19

Grafo (`codebase-memory-mcp`): no usado; el worktree no está indexado (design, «Lo que ya existe»).
Exploración con Grep/Read.

### Commits
- `2ae66940` feat(SL-21): T1.1-T1.2 migración y esquema de moneda e impuesto del país
- `d70109a0` test(SL-21): T1.3 moneda e impuesto del país contra Postgres y migración de ida y vuelta
- `0eea7c71` feat(SL-21): T2.1 formatearMontoEn con la moneda como parámetro; los seis caminos delegan (T2.3 incluido)
- `2fa80a13` test(SL-21): T2.2 guardia 359 con el séptimo camino (formatearMontoEn)

### Archivos
Producción:
- `db/migrations/20261122120000_sl21_pais_moneda_impuesto/migration.sql` (nuevo)
- `db/migrations/20261122120000_sl21_pais_moneda_impuesto/down.sql` (nuevo)
- `db/schema.prisma` (6 campos de `Pais` con `///`)
- `lib/config/moneda.ts` (`FormatoMoneda`, `MONEDA_PLATAFORMA`, `MONEDA_DE_LOS_PLANES`, `formatearMontoEn`;
  `formatMontoString`/`formatMonto` delegan en él, `formatMontoTope` en su variante de cota interna)

Tests:
- `tests/fabricas/paises.ts` (`crearPaisDePrueba` acepta `moneda` e `impuestoNombre`, NULL por defecto)
- `tests/fabricas/reglas-pais.ts` (solo `MONEDA_DE_PRUEBA`; el resto de la fábrica es de T3.2)
- `tests/integration/db/migracion-sl21-ida-y-vuelta.test.ts` (nuevo)
- `tests/integration/db/pais-moneda-impuesto.test.ts` (nuevo)
- `tests/unit/config/moneda-formato-pais.test.ts` (nuevo; incluye el caso de integración de T2.3)
- `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts` (séptimo camino, recuento 7)

### Mapa R → test (de esta tanda)
| R | Test |
|---|---|
| R1 | `migracion-sl21-ida-y-vuelta.test.ts` («la subida carga CR, añade solo las seis columnas…», sin columna de tasa); `pais-moneda-impuesto.test.ts` (R1: nace sin datos; rangos válidos) |
| R2 | `pais-moneda-impuesto.test.ts` («R2: cada regla rechaza su caso (23514)…», 17 casos) |
| R3 | `migracion-sl21-ida-y-vuelta.test.ts` (subida, down, reaplicar; foto de esquema y filas) |
| R4 | `pais-moneda-impuesto.test.ts` («R4: una empresa lee… no puede escribirlos (42501)») |
| R8 | `moneda-formato-pais.test.ts` (0, 1 y 2 decimales; signo; acarreo; separadores) |
| R9 | `dinero-centimos-cuando-existen.guardia.test.ts` (7 caminos, mismo texto) y `moneda-formato-pais.test.ts` (fila CR migrada = `MONEDA_PLATAFORMA` con env vacío) |
| R19 (parte base) | `migracion-sl21-ida-y-vuelta.test.ts` (enums y `wallet_movimiento` iguales) |

### Verificación (salida real)
- Migración sobre `servi_logistic_sl21`: `prisma migrate deploy` aplica → `pnpm run db:rollback` revierte →
  `migrate deploy` reaplica. `prisma validate` verde; `prisma generate` hecho una vez.
  `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` → «This is an empty
  migration.» (`--from-migrations` pide `shadowDatabaseUrl`, que el repo no configura.)
- `pnpm run typecheck` → verde (sin salida de `tsc --noEmit`).
- `pnpm run lint` → 0 errores, 249 warnings (preexistentes; el de `salidasQueCasan` en la guardia 359 ya estaba).
- `pais-moneda-impuesto.test.ts` + `migracion-sl21-ida-y-vuelta.test.ts` → 2 files, 8 passed.
- `pais-tabla`, `pais-repositorio`, `hora-por-pais-dos-empresas` → 3 files, 19 passed.
- `tests/unit/config/` + guardia 359 → 36 files, 391 passed (incluye `moneda-formato.test.ts` sin cambios).
- `moneda-formato-pais.test.ts` → 12 passed (el de integración T2.3 corre, no se salta).
- `pnpm run test:guardias` → 360 files, 5421 passed | 1 skipped.
- `vitest related --run lib/config/moneda.ts …` no terminó en 590 s (arrastra demasiados archivos). En su lugar,
  los 184 tests unitarios y de componentes que tocan dinero o los módulos de la ficha (grep de `config/moneda`,
  `formatMonto`, `money(`, `montoExacto`, `PriceLabel`, plantillas, tránsito, etiquetas, facturas, planes), en
  4 tandas: 175 files, 3 714 passed, 0 failed. Ningún valor esperado cambió (R9/R16).

### Desviaciones del design
- `formatearMontoEn` con un `number`: entra por `toFixed(ESCALA)` (2, la frontera), no por
  `toFixed(moneda.decimales)`. Motivo: `tests/unit/config/moneda-formato.test.ts` fija que el único
  `toFixed` del módulo es `toFixed(ESCALA)`, y así el cuadre a la escala de la moneda lo hace siempre el
  módulo sobre la cadena (half away from zero) y no el motor de JS en binario. Con la plataforma (2) es
  idéntico.
- Guardia 359: `formatearMontoEn` entra en las dos listas y `CAMINOS_PUBLICOS` pasa a contar nombres
  distintos (si no, daría 8 y no 7).
- La variante de cota (`formatearTopeEn`) no se exporta: un camino público más tendría que entrar en el
  censo de la 359 y hoy no tiene consumidor fuera de la plataforma.

### Veredicto
Bloques 1 y 2 hechos y en verde; listo para el bloque 3.

## Tanda 2 — Bloque 3, el puerto (T3.1, T3.2; R5–R7)

### Archivos
- Producción: `lib/types/pais.ts` (`PaisDTO.moneda`, `impuestoNombre`), `lib/repositories/PaisRepository.ts`
  (select con las 6 columnas y `paisDeFila`, que junta las 5 de moneda en `FormatoMoneda` o `null`),
  `lib/db/errores-pais.ts` (`PaisSinMoneda`, `PaisSinImpuesto`), `lib/interfaces/services/IReglasPaisEmpresa.ts`,
  `lib/services/ReglasPaisEmpresaService.ts` (`moneda()`, `nombreImpuesto()` sobre `paisDeLaEmpresa`).
- Tests: `tests/fabricas/reglas-pais.ts` (`MONEDA_CR`; `ReglasPaisFijas.moneda`/`impuestoNombre` con CR por
  defecto; `reglasPaisFijas` cumple los dos métodos; `paisDelAltaFijo` con moneda e impuesto de CR),
  `tests/integration/db/pais-repositorio.test.ts` (caso SL-21 nuevo + alta con `moneda: null`),
  `tests/unit/services/reglas-pais-empresa-service.test.ts` (6 casos R5–R7), fixtures de `PaisDTO` en
  `pais-service.test.ts`, `GeografiaPlataformaAltaPais.test.tsx`, `geografia-plataforma-page.test.tsx`; la fila
  simulada de `pais` en `organizaciones-action.composition-root.test.ts`; dobles a mano en
  `usuario-service-cedula.test.ts`, `usuario-service-superadmin.test.ts`, `webhook-whatsapp-pais-incompleto.test.ts`.
- `usuario-service-pais.test.ts` y `cierres-filtro-folio.test.ts` (en la lista esperada) no hizo falta tocarlos:
  sus dobles extienden `reglasPaisFijas()` con spread y heredan los métodos nuevos.

### Mapa R → test (tanda 2)
| R | Test |
|---|---|
| R5 | `reglas-pais-empresa-service.test.ts` («R5: dos empresas seguidas…», «R5: dos empresas a la vez…», «R5: sin empresa en curso…»); `pais-repositorio.test.ts` («SL-21 (R1, R3, R5): porId, listar y deLaEmpresa…») |
| R6 | `reglas-pais-empresa-service.test.ts` («R6: un país sin moneda lanza PaisSinMoneda…»; doble `reglasPaisFijas`) |
| R7 | `reglas-pais-empresa-service.test.ts` («R7: un país sin nombre de impuesto lanza PaisSinImpuesto…»; doble) |

### Verificación (salida real)
- `pnpm run typecheck` → verde (sin errores TS).
- `pnpm run lint` → 0 errores, 249 warnings (los mismos de la tanda 1).
- T3.1: `pais-repositorio` (integración, base `servi_logistic_sl21`), `pais-service`, `reglas-pais-empresa-service`,
  `GeografiaPlataformaAltaPais`, `geografia-plataforma-page` → 5 files, 98 passed. Vecinos (`geografia-plataforma-action`,
  `paises-plataforma.composition-root`, `organizacion-service(-pais)`, `hora-por-pais-dos-empresas`,
  `tipos-identificacion-por-pais`, `geografia-superadmin-sin-empresa`, `organizacion-alta`, `AppLayout`,
  `organizaciones-action.composition-root`, `rastreo-publico-zona-pais`, `pais-tabla`) → 12 files, 200 passed tras
  arreglar la fila simulada de `organizaciones-action.composition-root` (fallaba con «pais.moneda_decimales inesperado: undefined»).
- T3.2: `reglas-pais-empresa-service`, `usuario-service-cedula`, `usuario-service-superadmin`,
  `webhook-whatsapp-pais-incompleto`, `usuario-service-pais`, `cierres-filtro-folio`, `pais-service`,
  `organizacion-service-pais` → 8 files, 143 passed.
- `pnpm run test:guardias` → 360 files, 5421 passed | 1 skipped.

### Desviaciones del design
- `PaisRepository` ya no devuelve la fila de Prisma tal cual: `paisDeFila` arma el DTO. Una fila con la moneda a
  medias o `moneda_decimales` fuera de 0–2 lanza (la base no cumpliría su CHECK), como `caracteresDeDocumento`.
- `MONEDA_CR` se exporta desde `tests/fabricas/reglas-pais.ts` (el design solo nombra `MONEDA_DE_PRUEBA`): es la
  moneda de CR por defecto de `ReglasPaisFijas` y de `paisDelAltaFijo`.
- Archivo fuera de la lista esperada: ninguno de producción; en tests, todos los tocados están en la lista.

### Veredicto
Bloque 3 hecho y en verde; listo para el bloque 4.

## Tanda 3 — Bloque 4, plantillas e informes (T4.1, T4.2; R10–R13, R16)

Grafo: no usado (worktree sin indexar); Grep/Read.

### Commits
- `51fc9442` feat(SL-21): T4.1 plantillas de WhatsApp con la moneda del país (usaMoneda, necesitaMoneda)
- T4.2: el commit que trae esta sección.

### Archivos
- T4.1 producción: `lib/types/plantilla-datos.ts` (`usaMoneda` en `monto`, heredado por el alias `total`;
  `necesitaMoneda`; cuarto argumento `moneda?` en `transform`, `valorDeCampo` y `resolverValoresPlantilla`;
  `dinero` = `formatearMontoEn(moneda ?? MONEDA_PLATAFORMA, v)`), `lib/services/ChatWhatsappService.ts`
  (reintento de plantilla), `lib/actions/chat-whatsapp.ts` y `lib/services/jobs/whatsapp-bienvenida-handler.ts`
  (`Pick<…, "zonaHoraria" | "moneda">`). Composition roots: los dos ya pasan `construirReglasPaisEmpresa(prisma)`
  (la acción, además, cae al real si el test no inyecta); `ChatWhatsappService` lo exige por tipo (R21).
- T4.1 tests: `tests/unit/services/whatsapp-moneda-por-pais.test.ts` (nuevo, 13 casos).
- T4.2 producción: `lib/whatsapp-envios/informes/tipos.ts` (`ContextoInforme.moneda?`, perezosa),
  `lib/services/EjecucionEnvioService.ts` (`moneda: () => this.deps.reglasPais.moneda()`; su root
  `whatsapp-envio-deps.ts` ya pasa el real), `transito/informe.ts`, `transito/calculo.ts`, `transito/pdf.ts`.
- T4.2 tests: `tests/unit/whatsapp-envios/informe-moneda-por-pais.test.ts` (nuevo, 9 casos); firma
  (`MONEDA_CR`) en `informe-transito-calculo.test.ts` y `tests/unit/pdf/informe-transito-pdf.test.ts`;
  `moneda: async () => MONEDA_CR` en el contexto de `informe-transito-informe`, `-composicion`,
  `-repo-consultas`, `tests/unit/actions/informe-transito-actions.test.ts` y
  `tests/integration/db/informe-transito-catalogo-real.test.ts`. Ningún valor esperado cambió (R16).

### Mapa R → test (tanda 3)
| R | Test |
|---|---|
| R10 | `whatsapp-moneda-por-pais.test.ts` («R10: …» en acción del chat, bienvenida y reintento del servicio, con `MONEDA_DE_PRUEBA` → `€25 900`) |
| R11 | `whatsapp-moneda-por-pais.test.ts` («R11: sin importe…» ×3 con `moneda()` que lanza y espiada; `necesitaMoneda`) |
| R12 | `informe-moneda-por-pais.test.ts` («`por_cobrar` y los importes del PDF…», PaisSinMoneda, llamante sin moneda, motor) |
| R13 | `informe-moneda-por-pais.test.ts` (picking, aviso interno, prueba con `ctx.moneda` que lanza; tránsito vacío no la lee; el motor no la lee al construir el contexto) |
| R16 | casos «R16: con Costa Rica…» en los dos tests nuevos; `plantilla-datos.test.ts`, `informe-transito-calculo.test.ts` e `informe-transito-pdf.test.ts` sin cambiar valores esperados |

### Verificación (salida real)
- T4.1: `whatsapp-moneda-por-pais`, `plantilla-datos`, `chat-whatsapp-actions`, `chat-whatsapp-service`,
  `tests/unit/plantillas/`, `whatsapp-sin-integracion` → 19 files, 483 passed. Vecinos (bienvenida y chat-envio
  de integración, `chat-whatsapp-*`, `whatsapp-composition-root`, `whatsapp-fallo-saliente`, catálogo de variables,
  `ChatConversacionPlantillaDiaria`, `plantilla-estatus`) → 11 files, 89 passed.
- T4.2: `tests/unit/whatsapp-envios/`, `informe-transito-pdf`, `informe-transito-catalogo-real`,
  `informe-transito-zonas`, `ejecucion-envio-*`, `whatsapp-envio-*`, `informe-transito-actions`,
  `hora-por-pais-analitica-avisos` → 33 files, 344 passed. Integración de tránsito y motor (`hitos`, `parados`,
  `seleccion`, `whatsapp-envio-ejecucion-admintienda`, `whatsapp-envio-entrega-reclamo`) → 5 files, 12 passed.
- `pnpm run typecheck` → verde. `pnpm run lint` → 0 errores, 249 warnings (los mismos).
- `pnpm run test:guardias` → 360 files, 5421 passed | 1 skipped.

### Desviaciones del design
- Cinco tests de tránsito fuera de la lista esperada (`informe-transito-informe`, `-composicion`,
  `-repo-consultas`, `informe-transito-actions`, `informe-transito-catalogo-real`) ganan
  `moneda: async () => MONEDA_CR` en su contexto: sin ella `generar` lanza (design §5.3). Solo cambia el
  contexto, no lo esperado.
- El tránsito pide la moneda después de decidir «vacío»: un informe vacío no pinta importes y no la lee.
- La bienvenida, sin puerto y con importe, lanza un `Error` que nombra la operación (igual que `zonaDeLaEmpresa`).
- `PlantillaMensajeService.preview` (vista previa en servidor) y `resolverValoresOrden` (sin llamantes) siguen con
  la moneda de la plataforma: son vista previa (SLT-235) y no están entre los tres llamantes del design.

### Veredicto
T4.1 y T4.2 hechas y en verde.

## Tanda 4 — Bloque 4, etiquetas, facturas, alta y monto (T4.3–T4.6; R14, R15, R17, R18, R16)

### Commits
- `feat(SL-21): T4.3` etiquetas por API con la moneda del país.
- `feat(SL-21): T4.4` facturas de planes con `MONEDA_DE_LOS_PLANES`.
- `feat(SL-21): T4.5` el alta de empresa exige país con moneda e impuesto.
- `test(SL-21): T4.6` monto a cobrar por país (con esta sección).

### Archivos
- Producción: `lib/pdf/etiquetas-dibujo.ts`, `lib/pdf/etiquetas-pdf-lote.ts`,
  `lib/services/EtiquetasLotePdfService.ts`, las 3 rutas `app/api/ordenes/api-key/{carga,carga/[cargaId]/generate,orden/[id]/generate}/route.ts`,
  `lib/facturas-plataforma/resumen.ts`, `lib/services/email/plantillas/factura-emitida.ts`, `lib/planes/mensajes.ts`,
  `lib/services/OrganizacionService.ts`.
- Tests: `tests/unit/services/etiquetas-lote-pdf-service.test.ts`, `tests/unit/planes/factura-moneda-plataforma.test.ts` (nuevo),
  `tests/unit/services/organizacion-service-pais.test.ts`, `tests/unit/utils/monto-cobrar-por-pais.test.ts` (nuevo);
  fuera de la lista esperada: `tests/unit/services/api-pdf-etiqueta-columna-intacta.test.ts` y
  `tests/integration/db/organizacion-alta.test.ts`.

### Mapa R → test (tanda 4)
| R | Test |
|---|---|
| R14 | `etiquetas-lote-pdf-service.test.ts` («SL-21 R14 ·…»: `build` recibe la moneda en los dos modos y se lee una vez; `PaisSinMoneda` sin construir ni subir en los dos modos; lote vacío no la lee; sin `reglasPais` lanza; PDF real con `€1 234 567`) |
| R15 | `factura-moneda-plataforma.test.ts` (correo, `notaMoneda`, `importeDocumento`, PDF de la factura y `textoDelCobroVigente` en la moneda de los planes, sin moneda ni impuesto del país de prueba ni «IVA») |
| R16 | casos CR en los dos tests nuevos de R14/R15; los tests existentes de PDF de etiquetas y de facturas sin cambiar valores esperados |
| R17 | `organizacion-service-pais.test.ts` («sin moneda (SL-21 R17)», «sin nombre de impuesto (SL-21 R17)») |
| R18 | `monto-cobrar-por-pais.test.ts` (moneda de 2 decimales: `125.50` → 126 con aviso; texto `"125.50"` → `"126"`; el módulo no importa moneda ni puerto) |

### Verificación (salida real)
- T4.3: `etiquetas-lote-pdf-service` → 28 passed. Existentes de etiquetas (`api-pdf-etiqueta-service`,
  `-columna-intacta`, `etiquetas-descarga-service`, `etiquetas-pdf-lote`, `.smoke`, `etiquetas-dos-generadores`,
  `components/etiquetas-pdf`) → 7 files, 130 passed (tras pasar el doble de CR a `columna-intacta`). Rutas
  (`ordenes-api-key-carga-generate`, `-carga`, `-orden-generate`, `carga-api-etiquetas`, `ordenes-api-key-composicion-415`)
  → 5 files, 75 passed.
- T4.4: `factura-moneda-plataforma` → 6 passed. Existentes (`facturas-plataforma/{anexo,pdf,resumen}`,
  `emitir-factura-emitida`, `mensajes-costo-porcentual`, `plantilla-factura-emitida`, `jobs-factura-aviso`) → 7 files, 119 passed.
- T4.5/T4.6: `factura-moneda-plataforma`, `organizacion-service-pais`, `monto-cobrar-por-pais`, `monto-cobrar` → 4 files, 58 passed.
  Alta: `organizacion-service`, `organizaciones-action{,.composition-root}`, `organizacion-alta` (int.),
  `organizacion-pais-inmutable` (int.) → 5 files, 82 passed (tras el arreglo de `organizacion-alta`).
- `pnpm run typecheck` → verde. `pnpm run lint` → 0 errores, 249 warnings (los mismos que en la tanda 3).
- `pnpm run test:guardias` → 358/360 files; 2 rojos por timeout de 20 s (`descargas-por-registro`,
  `sin-estados-retirados`), sin aserción fallida; repetidos solos → 2 files, 15 passed.

### Desviaciones del design
- `buildEtiquetasLotePdf(etiquetas, moneda = MONEDA_PLATAFORMA)`: con valor por defecto en vez de `moneda?`, para que
  `buildEtiquetasLotePdf.length` siga en 1 y el smoke de R18 de la 136 (`toHaveLength(1)`) no cambie. Mismo comportamiento.
- `api-pdf-etiqueta-columna-intacta.test.ts` construye el servicio con `build` real de la cadena y ahora le pasa
  `reglasPaisFijas()` (sin ella el servicio lanza, design §5.4). Solo cambia el montaje.
- `organizacion-alta.test.ts` (integración) crea Panamá «completo» a mano; con R17 necesita moneda e impuesto, y se le
  ponen los de prueba (`MONEDA_DE_PRUEBA`, «TASA DE PRUEBA»). Sin ellos 3 casos daban `invalida` en vez de `creada`.
- R15: ningún camino de factura recibe el puerto; el test usa `reglasPaisFijas` con `MONEDA_DE_PRUEBA` para nombrar el
  país de la empresa y exigir que su moneda e impuesto NO aparezcan.

### Veredicto
T4.3–T4.6 hechas y en verde.

## Tanda 5 — Bloque 5, guardia y docs (T5.1, T5.2; R20, R21) y recuentos de migraciones

Grafo: no usado (worktree sin indexar); Grep/Read.

### Commits
- `test(SL-21): T5.1` guardia `pais-sin-literales` con moneda e impuesto.
- `docs(SL-21): T5.2` párrafo «Moneda e impuesto (SL-21)» en `docs/architecture.md`.
- `test(SL-21): recuentos de migraciones y columnas` (con esta sección).

### Archivos
- `tests/unit/guards/pais-sin-literales.guardia.test.ts`: `literalesDelPais` caza «₡», `\bCRC\b`, `\bIVA\b` y los
  imports (también de varias líneas, con alias o como `export … from`) de `money`, `moneyTope`, `formatMonto`,
  `formatMontoString`, `formatMontoTope`, `montoExacto` y `monedaConfig` desde `@/lib/config/moneda`. Fichas
  admitidas: `SLT-81`, `SLT-90`, `SL-22`, `SLT-235`, `SLT-237` y `permanente` (con fecha en el motivo). 14 casos
  de autocomprobación nuevos. R21: el control positivo de la segunda parte exige `EtiquetasLotePdfService` entre
  los receptores de `reglasPais?`.
- `tests/unit/guards/_pais-sin-literales-excepciones.ts`: 12 entradas nuevas sacadas de la salida real; tope 8 → 20.
- `lib/constants/impuesto-rotulo.ts`: el comentario remite a SLT-235.
- `docs/architecture.md`: el párrafo de T5.2.
- `tests/integration/db/orden-traspaso-migration.test.ts` (fuera de la lista esperada): la migración de SL-21 entra
  en su lista de posteriores.

### Excepciones nuevas (salida real de la guardia)
`app/paquete/[numGuia]/page.tsx` (SLT-235, `formatMonto`), `lib/analytics/metrics.ts` (SLT-235, IVA),
`lib/api/openapi-spec.ts` (permanente, IVA), `lib/config/moneda.ts` (SLT-237, CRC y ₡),
`lib/constants/impuesto-rotulo.ts` y `lib/constants/wallet-rotulos.ts` (SLT-235, IVA),
`lib/repositories/TarifaValorRepository.ts` y `lib/repositories/_shared/resolver-tarifas.ts` (SLT-235, IVA),
`lib/services/AnaliticaFinancieraService.ts` (SLT-235, `monedaConfig`), `lib/types/plantilla-datos.ts` (SLT-235, ₡),
`lib/types/tarifa-flexible.ts` (SLT-235, IVA), `lib/whatsapp-envios/informes/transito/informe.ts` (SLT-235, ₡).

### Mapa R → test (tanda 5)
| R | Test |
|---|---|
| R20 | `pais-sin-literales.guardia.test.ts` (censo, lista que solo baja, tope 20, fichas; autocomprobación «SL-21: …») |
| R21 | `pais-sin-literales.guardia.test.ts` (segunda parte: `EtiquetasLotePdfService` es receptor y sus 3 rutas pasan el real) |

### Verificación (salida real)
- `pais-sin-literales.guardia.test.ts` → 49 passed (antes 35).
- Recuentos contra `servi_logistic_sl21`: 21 archivos candidatos (`orden-traspaso-migration`,
  `verificar-rls-despliegue`, `empresas-plataforma`, `migracion-slt143/-slt42/-sl20/-sl21/-plan-beneficio`,
  `zona-desalineada-central-migration`, los 6 `historial-accion-*-migration` con lista de migraciones,
  `correccion-resultado-gestion-migration`, `caja-459-migration`, `schema-drift-saneamiento`, `no-migration-102`,
  `pais-tabla`, `tipo-documento-por-pais`) → 1 failed (`orden-traspaso`: 143 posteriores contra 142) | 196 passed.
  Tras el arreglo, `orden-traspaso` y 11 más que leen `db/migrations` (`backfill-guards`, `orden-clave-remision`,
  `orden-num-remision-parcial`, `notificacion-productores-wiring`, `busqueda-orden`, `censo-order-status-rename`,
  `carga-masiva-schema`, `plantillas.int`, `orden-mensajero-meta.int`, `migracion-sl17`, `migracion-sl38`)
  → 12 files, 167 passed. `verificar-rls-despliegue` no cambia: SL-21 no añade tablas.
- `pnpm run typecheck` → verde. `pnpm run lint` → 0 errores, 249 warnings (los mismos).
- `pnpm run test:guardias` → 360 files, 5435 passed | 1 skipped.

### Desviaciones del design
- `lib/pdf/etiquetas-dibujo.ts` no entra en la lista: nombra `MONEDA_PLATAFORMA` y la guardia no lo marca.
  Tampoco `PlantillaMensajeService.preview` ni `resolverValoresOrden` (`lib/utils/whatsapp-envio-valores.ts`):
  caen en la moneda de la plataforma por el `moneda ?? MONEDA_PLATAFORMA` de `plantilla-datos.ts`, sin literal ni
  import marcado. El censo es por archivo, así que no los ve (anotado en el motivo de `plantilla-datos.ts`).
- Las `page.tsx` de `app/` no escriben «IVA»; la única página en la lista es `app/paquete/[numGuia]/page.tsx`.

### Veredicto
T5.1 y T5.2 hechas y en verde; recuentos al día. Queda T5.3 (init.sh y E2E en local).

## Cierre (T5.3) · implementer · 2026-11-20

### Mapa R → test consolidado (R22)
| R | Test |
|---|---|
| R1 | `tests/integration/db/migracion-sl21-ida-y-vuelta.test.ts`, `tests/integration/db/pais-moneda-impuesto.test.ts` |
| R2 | `tests/integration/db/pais-moneda-impuesto.test.ts` (17 casos, 23514) |
| R3 | `tests/integration/db/migracion-sl21-ida-y-vuelta.test.ts` |
| R4 | `tests/integration/db/pais-moneda-impuesto.test.ts` (42501 como `servi_app`) |
| R5 | `tests/unit/services/reglas-pais-empresa-service.test.ts`, `tests/integration/db/pais-repositorio.test.ts` |
| R6 | `tests/unit/services/reglas-pais-empresa-service.test.ts`; además `whatsapp-moneda-por-pais`, `informe-moneda-por-pais` y `etiquetas-lote-pdf-service` (falla antes de enviar o subir) |
| R7 | `tests/unit/services/reglas-pais-empresa-service.test.ts` |
| R8 | `tests/unit/config/moneda-formato-pais.test.ts` |
| R9 | `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts`, `tests/unit/config/moneda-formato-pais.test.ts` (CR migrada = plataforma) |
| R10 | `tests/unit/services/whatsapp-moneda-por-pais.test.ts` |
| R11 | `tests/unit/services/whatsapp-moneda-por-pais.test.ts` |
| R12 | `tests/unit/whatsapp-envios/informe-moneda-por-pais.test.ts` |
| R13 | `tests/unit/whatsapp-envios/informe-moneda-por-pais.test.ts` |
| R14 | `tests/unit/services/etiquetas-lote-pdf-service.test.ts` |
| R15 | `tests/unit/planes/factura-moneda-plataforma.test.ts` |
| R16 | casos CR de los tests nuevos de R10, R12, R14 y R15, y los existentes sin cambiar valores esperados: `plantilla-datos`, `informe-transito-calculo`, `informe-transito-pdf`, PDF de etiquetas y facturas |
| R17 | `tests/unit/services/organizacion-service-pais.test.ts`, `tests/integration/db/organizacion-alta.test.ts` |
| R18 | `tests/unit/utils/monto-cobrar-por-pais.test.ts` |
| R19 | `tests/integration/db/migracion-sl21-ida-y-vuelta.test.ts` (enums y `wallet_movimiento` iguales) y los tests de contrato de `tests/unit/api/openapi-*.test.ts` sin cambios (20 files, 255 passed el 2026-11-20); `lib/api/openapi-spec.ts` fuera del diff |
| R20 | `tests/unit/guards/pais-sin-literales.guardia.test.ts` |
| R21 | `tests/unit/guards/pais-sin-literales.guardia.test.ts` (receptores de `reglasPais`) |
| R22 | todos los anteriores usan una empresa de CR y otra de un país de prueba con `MONEDA_DE_PRUEBA`; sin E2E nuevo |

### Gate local
`./init.sh` (modo rápido) en verde, exit 0, el 2026-11-20. Lo corrí con una copia temporal de
`arnes.config.json` con `cupos_por_persona.fullstack` subido (el board tiene 12 fullstack en vuelo de
otras fichas, aceptado por el humano); la restauré al terminar y no se commitea.
- typecheck y lint en verde; `test:rapido` en verde: 7 lotes, 659 files, 8 626 passed, 1 skipped.
- Tamaño: 64/40 archivos, 674/1000 líneas de producción y 1771/3000 de tests (aceptado por el humano).
- Todas las migraciones con `down.sql`.

### E2E
No se corrieron en local. Por la memoria justa de la máquina, el leader pidió no lanzar playwright
en esta sesión. Los E2E afectados (el grupo `dinero` y los de etiquetas, plantillas y facturas) quedan
al CI del PR. No hay E2E nuevo (decisión cerrada: para CR la salida es idéntica, R16). Queda creada,
para correrlos en local, la base desechable `servi_logistic_sl21_e2e`.

## Renombre tras mergear dev · 2026-11-20
- La migración pasa de `20261122120000_sl21_pais_moneda_impuesto` a `20261124120000_sl21_pais_moneda_impuesto` (dev trae `20261122120000_slt221_usuario_cambio_correo`, mismo timestamp; tasks T1.1).

### Gate tras mergear dev (2026-11-20)
- Merge de origin/dev (72 commits; conflicto trivial en `orden-traspaso-migration.test.ts`) y migración
  renombrada a `20261124120000_sl21_pais_moneda_impuesto` (c7abbb16). Base `servi_logistic_sl21` recreada;
  `migrate diff` vacío; tests de migración/país 7 files 151 passed; guardias 360 files, 5440 passed.
- `./init.sh` tras el merge NO llega a los pasos de código: el validador de `feature_list.json` cae por el
  board (cupo backend 7/6 y SLT-235 en vuelo sin assignee), ajeno a esta rama. El último `./init.sh`
  completo en verde es el de antes del merge (84815d54).
- A mano, tras el merge: typecheck verde; lint 0 errores (249 warnings, los de siempre). `test:rapido` lo
  cortó el sistema por falta de memoria y no se relanzó; queda la suite completa del CI (`gate-completo`).
