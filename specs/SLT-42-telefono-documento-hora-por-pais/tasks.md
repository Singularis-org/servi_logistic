# SLT-42 — Teléfono, documento y hora por país · tasks

> P1–P8 quedaron cerradas en F1.4 el 2026-11-03 (`requirements.md > Decisiones cerradas`). Los
> cuatro checks de `libphonenumber-js` están verificados (`design.md` §7). Antes de T1 falta solo que
> una persona haga las comprobaciones previas en solo lectura de `design.md` §2.5: si aparece una
> empresa fuera de CR, se para y decide el humano (P7).
> `[P]` = paralelizable con las otras `[P]` de su bloque. «Hecho» siempre incluye `./init.sh` en
> verde (o, si muere por memoria, typecheck + guardias, y el resto en CI).

## Bloque 0 — Dependencia

- [x] **T0.1** Fila de `libphonenumber-js` en `docs/dependencias.md`, con los cuatro checks
  verificados y la aprobación, y `pnpm add libphonenumber-js`.
  *Hecho:* la guardia `guard-dependencias-aprobadas` en verde; `package.json` y `pnpm-lock.yaml`
  con la dependencia.

## Bloque 1 — Base de datos (depende de F1.4)

- [ ] **T1.0** («pendiente: la hace una persona antes del deploy») Comprobaciones previas en producción, en solo lectura, hechas por una persona y no por
  un agente (`design.md` §2.5; P7). La primera es `SELECT count(*) FROM organizacion WHERE pais_id
  <> 'CR'` → 0. El resultado de las tres se anota en `progress/features/SLT-42.md`. Además, antes
  del deploy:
  1. **Índice concurrente:** si la tercera comprobación (`SELECT count(*) FROM usuario`) pasa de
     100 000 filas, el `CREATE UNIQUE INDEX` de `20261107120200` se cambia a `CONCURRENTLY` fuera de
     transacción (`design.md` §2.4) antes de aplicarla.
  2. **Ensayo:** las tres migraciones y sus `down.sql` se ensayan sobre una copia de producción, nunca
     sobre producción (`design.md` §2.5).
  3. **Corte de postulaciones:** `POSTULACION_VALIDADA_POR_PAIS_DESDE`
     (`lib/config/aprobacion-postulaciones.ts`, hoy `2026-11-07T12:00Z`) se ajusta al instante real del
     deploy, igual o posterior a él: las postulaciones recibidas después ya se validaron con el país al
     recibirlas. Fijarlo exige un commit antes del deploy (decisión «tras tanda 2b» punto 1).
  *Hecho:* las tres comprobaciones dan lo esperado, el ensayo pasa y el corte está fijado en un commit.
  Si aparece una empresa fuera de CR, se para y decide el humano: T1.1–T1.3 no se aplican fuera de la
  base de test hasta entonces.

- [x] **T1.1** Migración `20261107120000_slt42_pais_telefono_y_zona` + `down.sql` + `model Pais` en
  `db/schema.prisma` (`design.md` §2.1).
  *Hecho:* sube, baja y vuelve a subir en la base de test; CR queda con 506 / 8 / `America/Costa_Rica`.
- [x] **T1.2** Migración `20261107120100_slt42_tipo_documento_por_pais` + `down.sql` + `model
  TipoIdentificacion` (§2.2): precondición, columnas, filas de CR, índices y política restrictiva.
  *Hecho:* el `down` aborta si un usuario usa `dimex`/`nite`; sin usuarios, vuelve al esquema exacto
  de antes.
- [x] **T1.3** Migración `20261107120200_slt42_usuario_documento_unico_por_tipo` + `down.sql` (§2.3).
  *Hecho:* el `down` aborta con repetidos de `(organizacion_id, cedula)`; la guardia
  `unicos-por-empresa` en verde. Si para entonces existe la guardia de migraciones destructivas, el
  `DROP INDEX` figura en su lista de excepciones con la ficha SLT-42 (excepción P4, `design.md` §2.3).
- [x] **T1.4** Test `tests/integration/db/migracion-slt42-ida-y-vuelta.test.ts` (R1, R3, R7, R8):
  foto de `usuario`, `organizacion`, `pais` y las tres filas viejas de `tipo_identificacion`, antes
  y después de subir. Las columnas viejas, idénticas.
  *Hecho:* verde; cubre también bajar y volver a subir.
- [x] **T1.5** Test `tests/integration/db/tipo-documento-por-pais.test.ts` (R2, R4, R5, R11, R13) con
  dos empresas, en CR y en `XA`. La fábrica `tests/fabricas/paises.ts` gana zona, prefijo y tipos de
  prueba.
  *Hecho:* verde. `servi_app` recibe `42501` al escribir en `pais` y en `tipo_identificacion`.

## Bloque 2 — Módulos puros (depende de T0.1 solo para T2.4) `[P]`

- [x] **T2.1** `[P]` `lib/utils/calendario-zona.ts` + `tests/unit/utils/calendario-zona.test.ts`
  (R22, R23). Los casos de CR son los mismos ejemplos que documentan `fecha-cr.ts`, y además una zona
  con horario de verano en sus dos días de cambio.
  *Hecho:* verde. Las funciones de `fecha-cr.ts` pasan a ser envoltorios de estas con la zona de CR,
  y sus tests de hoy siguen en verde sin tocarlos.
- [x] **T2.2** `[P]` `lib/utils/telefono-pais.ts` + `tests/unit/utils/telefono-pais.test.ts` (R18,
  R20, R21). La tabla de casos de CR se genera con el código de hoy **antes** de cambiarlo y se
  congela en el test.
  *Hecho:* verde; `telefono-cr.ts` y `whatsapp-telefono.ts` son envoltorios.
- [x] **T2.3** `[P]` `lib/utils/documento.ts` + `tests/unit/utils/documento.test.ts` (R10, regla de
  P5).
  *Hecho:* verde.
- [x] **T2.4** `[P]` `lib/validacion/telefono.ts` (solo servidor, sin `server-only`: no es dependencia del proyecto,
  desvío 8 de `design.md`; `libphonenumber-js/max`) +
  `tests/unit/validacion/telefono.test.ts` (R14, R15, R16).
  *Hecho:* verde: CR válido e inválido, número de Panamá con región CR rechazado, `XA` da
  `pais_sin_reglas`.

## Bloque 3 — Puerto del país (depende de T1.1, T1.2)

- [x] **T3.1** `PaisDTO` con los campos nuevos; `IPaisRepository` y `PaisRepository` con
  `tipoDocumentoDelPais` y `zonasConEmpresas` (con su entrada en `EXCEPCIONES_DE_PLATAFORMA`);
  errores `PaisSinZonaHoraria` y `PaisIncompleto` en `lib/db/errores-pais.ts`.
  *Hecho:* typecheck; `tests/integration/db/pais-repositorio.test.ts` ampliado y en verde.
- [x] **T3.2** `IReglasPaisEmpresa` + `ReglasPaisEmpresaService` (memoria solo dentro del marco de
  `conEmpresa`) + `tests/fabricas/reglas-pais.ts` + `tests/unit/services/reglas-pais-empresa-service.test.ts`
  (R28, R30).
  *Hecho:* verde: dos contextos seguidos devuelven cada uno su país, y sin zona lanza
  `PaisSinZonaHoraria`.

## Bloque 4 — Documento y teléfono en los servicios (depende de T2.2–T2.4, T3.2)

- [x] **T4.1** `UsuarioService` (alta y edición) + `UserRepository.listTiposIdentificacion` por país +
  schemas de `lib/types/usuario.ts` solo de forma.
  `tests/unit/services/usuario-service-pais.test.ts` (R5, R9–R12, R14–R16) y el caso de R17 en
  `usuario-service-superadmin.test.ts`.
  *Hecho:* verde; los tests de `UsuarioService` que ya existían, en verde con `reglasPaisFijas(CR)`.
- [x] **T4.2** `[P]` `PostulacionMensajeroService` y `AprobacionPostulacionService` +
  `tests/unit/services/postulacion-mensajero-service-pais.test.ts`.
  *Hecho:* verde.
  *Tanda 2b:* aprobar una postulación previa a SLT-42 (`createdAt` < `POSTULACION_VALIDADA_POR_PAIS_DESDE`) no valida país (decisión 6).
- [x] **T4.3** `[P]` `OrganizacionService.altaEmpresa` (R6, y R10/R14 del maestro con el país elegido) +
  `tests/unit/services/organizacion-service-pais.test.ts`.
  *Hecho:* verde; `validation_error` en `paisId` y en `maestro.*` sin escribir.
  *Tanda 2b:* la repetición (`ya_existe`/`conflicto`) se decide antes de R6 y del maestro (decisión 7).
- [x] **T4.4** `[P]` WhatsApp con el prefijo del país: `ChatConversacionRepository` y
  `busqueda-texto-sql.ts` con `sqlNormalizarTelefono` parametrizado; envío, webhook, bienvenida y
  rastreo con `normalizarTelefono`/`telefonoSirveParaEnvio`. Se retira `telefono-cr-sql.ts`.
  `chat-entrante-telefono-cr.test.ts` se parametriza (R19).
  *Hecho:* verde; los tests de chat y envíos que ya existían, en verde.
  *Tanda 2b:* el webhook salta la empresa con `PaisIncompleto` y responde 200 (decisión 2); `CorregirDatosClienteService` usa el prefijo del país (decisión 4).

## Bloque 5 — Hora en el servidor (depende de T2.1, T3.2)

Orden sugerido. Cada task deja su grupo en verde con sus tests de hoy, inyectando `reglasPaisFijas(CR)`.

- [x] **T5.1** Utilidades de `lib/utils/` y `lib/analytics/` que calculan días (`dia-reparto`,
  `ventana-dia-cr`, `filtros-listado-ordenes`, `fecha-dia-iso`, `fecha-movimiento-manual`,
  `periodicidad`, `descarga-dataset`, `ranges`, `cubo-temporal`, `rollup-dia`, `backfill-rango`):
  reciben `zona`.
  *Hecho:* typecheck y sus tests en verde.
- [x] **T5.2** Schemas zod con «hoy» de `lib/types/` (§4.3): la comparación con hoy pasa al servicio
  o a una fábrica `(zona) => schema`.
  *Hecho:* typecheck; sus tests en verde.
- [x] **T5.3** Servicios y repositorios de órdenes, reparto, cierres, corte y reprogramadas.
  *Hecho:* verde.
- [x] **T5.4** `[P]` Wallet, liquidación, estado de cuenta, gastos fijos, aportes y caja.
  - [x] `lib/types/historial-accion-etiquetas.ts`: la fecha del cierre (`cierre_dia`, `cierre_bodega`) en la
    zona del país; la reciben `CierresAdminRepository` y `CierresBodegaAdminRepository` (decisión del
    humano, 2026-11-05, tras T5.3).
  *Hecho:* verde.
- [x] **T5.5** `[P]` Analítica, tablero, ranking, notificaciones, avisos e informes de WhatsApp.
  - [x] Rutas (`OptimizacionRutaService`) y la fecha que muestra `PlanesService` (`siguienteCiclo`); el ciclo de cobro sigue en UTC (decisión del humano, 2026-11-05, tras T5.4).
  *Hecho:* verde.
- [x] **T5.6** `[P]` Rastreo público (R27; se retira `RASTREO_PUBLICO_ZONA_HORARIA`) +
  `tests/unit/services/rastreo-publico-zona-pais.test.ts`.
  *Hecho:* verde.
- [x] **T5.7** `[P]` API por key y OpenAPI; páginas de servidor (`ordenes`, `wallet/mensajeros`,
  `recepcion-satelite/en-bodega`).
  *Hecho:* typecheck; los tests de la API, en verde.

## Bloque 6 — Jobs y crons (depende de T3.1, T5.3, T5.5)

- [x] **T6.1** `RecurrenciaSpec.siguiente(now, zonas)` en `IJobQueueService`/`JobQueueService`, y las
  recurrencias no diarias adaptadas a la firma (`jobs-cambio-plan.ts`,
  `whatsapp-envio-mantenimiento-handler.ts`).
  *Hecho:* typecheck; los tests de `JobQueueService`, en verde.
- [x] **T6.2** `liberar-reprogramadas-handler.ts` y `analitica-rollup-diario-handler.ts` (y
  `analitica-rollup-diario-encolado.ts`): clave con la zona, filtro por la zona de la corrida y
  compatibilidad con la clave vieja. `tests/unit/services/jobs/recurrencia-por-zona.test.ts` (R25,
  R26).
  *Hecho:* verde; con una sola zona, mismos `runAfter` que hoy.
- [x] **T6.3** Crons (`app/api/cron/**`): cada empresa calcula con su zona, y una sin zona falla
  sola. `tests/integration/db/hora-por-pais-dos-empresas.test.ts` (R24, R28, R31).
  *Hecho:* verde.

## Bloque 7 — Cierre

- [x] **T7.1** Guardia `tests/unit/guards/pais-sin-literales.guardia.test.ts` + lista
  `_pais-sin-literales-excepciones.ts` con la UI (SLT-81) y SINPE (SL-22) (R29).
  *Hecho:* verde; un literal nuevo de prueba en `lib/` la pone en rojo (comprobado y revertido).
  *Tanda 6:* la misma guardia exige `construirReglasPaisEmpresa` en cada composition root de los servicios con `reglasPais?` (decisión del humano tras T5.3). Cinco archivos quedan en `PENDIENTES_DE_DECISION_SLT42` a la espera del humano (`progress/impl_SLT-42.md > Tanda 6`).
  *Tanda 7:* decididos (2026-11-06): los 3 de planes pasan a excepción con ficha SLT-86; los 2 repositorios agrupan con `AT TIME ZONE` parametrizado (y `CohorteCarga`, que comparte el fragmento); `whatsapp-telefono.ts` se borra. `PENDIENTES_DE_DECISION_SLT42` se retiró.
- [x] **T7.2** `docs/architecture.md > País por empresa (SL-20)`: un párrafo sobre los datos de
  teléfono, documento y zona, `IReglasPaisEmpresa`, `calendario-zona.ts` y la guardia.
  `.env.example` sin `RASTREO_PUBLICO_ZONA_HORARIA`. La deuda de P6 la anota el leader en
  `progress/deudas.md`; esta task no la escribe.
  *Hecho:* el gate de perfil en verde.
- [x] **T7.3** Mapa `R<n> -> test` en `progress/impl_SLT-42.md` (las 31 R). `./init.sh` en verde.
  *Hecho:* ninguna R sin test.

## Archivos esperados

Nuevos:
- `db/migrations/20261107120000_slt42_pais_telefono_y_zona/migration.sql`
- `db/migrations/20261107120000_slt42_pais_telefono_y_zona/down.sql`
- `db/migrations/20261107120100_slt42_tipo_documento_por_pais/migration.sql`
- `db/migrations/20261107120100_slt42_tipo_documento_por_pais/down.sql`
- `db/migrations/20261107120200_slt42_usuario_documento_unico_por_tipo/migration.sql`
- `db/migrations/20261107120200_slt42_usuario_documento_unico_por_tipo/down.sql`
- `lib/utils/calendario-zona.ts`
- `lib/utils/telefono-pais.ts`
- `lib/utils/documento.ts`
- `lib/validacion/telefono.ts`
- `lib/interfaces/services/IReglasPaisEmpresa.ts`
- `lib/services/ReglasPaisEmpresaService.ts`
- `tests/fabricas/reglas-pais.ts`
- `tests/unit/utils/calendario-zona.test.ts`
- `tests/unit/utils/telefono-pais.test.ts`
- `tests/unit/utils/documento.test.ts`
- `tests/unit/validacion/telefono.test.ts`
- `tests/unit/services/reglas-pais-empresa-service.test.ts`
- `tests/unit/services/usuario-service-pais.test.ts`
- `tests/unit/services/postulacion-mensajero-service-pais.test.ts`
- `tests/unit/services/organizacion-service-pais.test.ts`
- `tests/unit/services/rastreo-publico-zona-pais.test.ts`
- `tests/unit/services/jobs/recurrencia-por-zona.test.ts`
- `tests/unit/guards/pais-sin-literales.guardia.test.ts`
- `tests/unit/guards/_pais-sin-literales-excepciones.ts`
- `tests/integration/db/migracion-slt42-ida-y-vuelta.test.ts`
- `tests/integration/db/tipo-documento-por-pais.test.ts`
- `tests/integration/db/hora-por-pais-dos-empresas.test.ts`

Esquema, configuración y docs:
- `db/schema.prisma`
- `package.json`
- `pnpm-lock.yaml`
- `docs/dependencias.md`
- `docs/architecture.md`
- `.env.example`
- `lib/config/rastreo-publico.ts`
- `lib/config/aviso-reparto-manana.ts`
- `lib/db/errores-pais.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/db/contexto-empresa.ts`

País, documento y teléfono:
- `lib/types/pais.ts`
- `lib/types/usuario.ts`
- `lib/types/organizacion.ts`
- `lib/types/postulacion-mensajero.ts`
- `lib/types/aprobacion-postulacion.ts`
- `lib/types/whatsapp-webhook.ts`
- `lib/interfaces/repositories/IPaisRepository.ts`
- `lib/interfaces/repositories/IUserRepository.ts`
- `lib/repositories/PaisRepository.ts`
- `lib/repositories/UserRepository.ts`
- `lib/repositories/PostulacionRepository.ts`
- `lib/repositories/ChatConversacionRepository.ts`
- `lib/repositories/WhatsappEjecucionRepository.ts`
- `lib/services/UsuarioService.ts`
- `lib/services/PostulacionMensajeroService.ts`
- `lib/services/AprobacionPostulacionService.ts`
- `lib/services/OrganizacionService.ts`
- `lib/services/WhatsappEnvioService.ts`
- `lib/services/EjecucionEnvioService.ts`
- `lib/services/ChatWhatsappService.ts`
- `lib/services/CorregirDatosClienteService.ts`
- `lib/services/RastreoPublicoService.ts`
- `lib/services/whatsapp/enrutado-por-cita.ts`
- `lib/services/jobs/whatsapp-bienvenida-handler.ts`
- `lib/utils/telefono-cr.ts`
- `lib/utils/telefono-cr-sql.ts`
- `lib/utils/whatsapp-telefono.ts`
- `lib/utils/busqueda-texto-sql.ts`
- `lib/whatsapp-envios/telefono.ts`
- `tests/fabricas/paises.ts`
- `scripts/seed-catalogos.ts` (2026-11-04: se le quitan los tipos de documento)
- `tests/unit/guards/geografia-predicado-unico.guardia.test.ts` (2026-11-04: se acota a geografía)
- `tests/integration/db/pais-repositorio.test.ts`
- `tests/integration/db/chat-entrante-telefono-cr.test.ts`
- `tests/unit/services/usuario-service-superadmin.test.ts`

Hora — utilidades y tipos:
- `lib/utils/fecha-cr.ts`
- `lib/utils/hora-cr.ts`
- `lib/utils/separador-dia-cr.ts`
- `lib/utils/dia-reparto.ts`
- `lib/utils/ventana-dia-cr.ts`
- `lib/utils/filtros-listado-ordenes.ts`
- `lib/utils/fecha-dia-iso.ts`
- `lib/utils/fecha-movimiento-manual.ts`
- `lib/utils/periodicidad.ts`
- `lib/utils/tiempo-relativo.ts`
- `lib/utils/descarga-dataset.ts`
- `lib/analytics/ranges.ts`
- `lib/analytics/cubo-temporal.ts`
- `lib/analytics/rollup-dia.ts`
- `lib/analytics/backfill-rango.ts`
- `lib/types/gestion-orden.ts`
- `lib/types/gasto-fijo-plantilla.ts`
- `lib/types/plantilla-datos.ts`
- `lib/types/premio-ranking-devengo.ts`
- `lib/types/aporte-capital.ts`
- `lib/types/filtros-cierres.ts`
- `lib/types/filtro-dias-cr.ts`
- `lib/types/estado-cuenta.ts`
- `lib/types/wallet.ts`
- `lib/types/wallet-filtros.ts`
- `lib/types/wallet-tienda.ts`
- `lib/types/wallet-mensajero.ts`
- `lib/types/liquidacion.ts`
- `lib/types/historico-conversaciones.ts`
- `lib/types/historial-accion.ts`
- `lib/types/historial-accion-etiquetas.ts`
- `lib/interfaces/repositories/ITableroDiaRepository.ts`
- `lib/interfaces/repositories/IGastoFijoPlantillaRepository.ts`

Hora — servicios, repositorios, actions y API:
- `lib/services/AbonoTiendaService.ts`
- `lib/services/AnaliticaOperativaService.ts`
- `lib/services/ApiOrdenLecturaService.ts`
- `lib/services/AporteCapitalService.ts`
- `lib/services/AsignacionSateliteService.ts`
- `lib/services/AsistenteService.ts`
- `lib/services/AvisosDiariosService.ts`
- `lib/services/CajaBackfillTesoreriaService.ts`
- `lib/services/CierreDiaService.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/CobroTiendaService.ts`
- `lib/services/CorreccionDiaRepartoService.ts`
- `lib/services/CorteDiarioService.ts`
- `lib/services/EstadoCuentaService.ts`
- `lib/services/FiltrosWalletService.ts`
- `lib/services/GeneracionGastosFijosService.ts`
- `lib/services/GeocodeSaludService.ts`
- `lib/services/GestionDesdeAyudaService.ts`
- `lib/services/GuiaAsignacionService.ts`
- `lib/services/HistorialAccionService.ts`
- `lib/services/IncentivoMensajeroService.ts`
- `lib/services/LibroCajaAutoriaService.ts`
- `lib/services/LiquidacionService.ts`
- `lib/services/ManifiestoService.ts`
- `lib/services/MisAsignacionesService.ts`
- `lib/services/NotificacionService.ts`
- `lib/services/OptimizacionRutaService.ts`
- `lib/services/OrigenLegibleService.ts`
- `lib/services/PagoPorCuentaTiendaService.ts`
- `lib/services/PlanesService.ts`
- `lib/services/RankingService.ts`
- `lib/services/RechazoTiendaService.ts`
- `lib/services/RecoleccionTiendaService.ts`
- `lib/services/RepartoMananaAvisoService.ts`
- `lib/services/ReprogramadasRetenidasService.ts`
- `lib/services/TableroDiaService.ts`
- `lib/services/VigenciaAvisoAgregadoService.ts`
- `lib/services/WalletComprobanteService.ts`
- `lib/services/WalletEgresoService.ts`
- `lib/services/WalletService.ts`
- `lib/services/liberacion-al-aprobar-cierre.ts`
- `lib/services/liberacion-tras-corregir-fecha.ts`
- `lib/services/JobQueueService.ts`
- `lib/interfaces/services/IJobQueueService.ts`
- `lib/services/jobs/liberar-reprogramadas-handler.ts`
- `lib/services/jobs/analitica-rollup-diario-handler.ts`
- `lib/services/jobs/analitica-rollup-diario-encolado.ts`
- `lib/services/jobs/optimizacion-ruta-encolado.ts`
- `lib/services/jobs/whatsapp-envio-mantenimiento-handler.ts`
- `lib/planes/jobs-cambio-plan.ts`
- `lib/planes/consumo.ts`
- `lib/repositories/CierreBodegaRepository.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/repositories/CierresBodegaAdminRepository.ts`
- `lib/repositories/CohorteCargaRepository.ts`
- `lib/repositories/ConteoCargadasPorDiaRepository.ts`
- `lib/repositories/FinanzasDiarioRepository.ts`
- `lib/repositories/GestionOrdenRepository.ts`
- `lib/repositories/HistoricoConversacionesRepository.ts`
- `lib/repositories/IngresosAnaliticaRepository.ts`
- `lib/repositories/LiberacionReprogramadaRepository.ts`
- `lib/repositories/OrdenDiaRepartoCambioRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/repositories/ReprogramadaRetenidaRepository.ts`
- `lib/repositories/SaldosSatelitesRepository.ts`
- `lib/repositories/TableroDiaRepository.ts`
- `lib/repositories/WalletMovimientoRepository.ts`
- `lib/ranking/snapshot-dia.ts`
- `lib/notificaciones/emitir.ts`
- `lib/notificaciones/notificacion-repo-con-push.ts`
- `lib/whatsapp-envios/proxima-ocurrencia.ts`
- `lib/whatsapp-envios/informes/formato.ts`
- `lib/whatsapp-envios/informes/prueba-envio.ts`
- `lib/whatsapp-envios/informes/picking/modelo.ts`
- `lib/whatsapp-envios/informes/transito/calculo.ts`
- `lib/whatsapp-envios/informes/transito/pdf.ts`
- `lib/actions/chat-whatsapp.ts`
- `lib/actions/liberacion-reprogramada.ts`
- `lib/actions/ranking-historico.ts`
- `lib/actions/reprogramadas-retenidas.ts`
- `lib/api/analitica-api-key-rango.ts`
- `lib/api/openapi-spec.ts`
- `app/api/ordenes/api-key/route.ts`
- `app/api/ordenes/api-key/analitica/route.ts`
- `app/api/cron/procesar-jobs/route.ts`
- `app/api/cron/liberar-reprogramadas/route.ts`
- `app/api/cron/aviso-reparto-manana/route.ts`
- `app/api/cron/corte-diario/route.ts`
- `app/api/cron/generar-gastos-fijos/route.ts`
- `app/api/cron/snapshot-ranking/route.ts`
- `app/api/cron/avisos-diarios/route.ts`
- `app/api/cron/procesar-devueltas-sla/route.ts`
- `app/api/cron/purga-pdf-cargas/route.ts`
- `app/(app)/ordenes/page.tsx`
- `app/(app)/wallet/mensajeros/page.tsx`
- `app/(app)/recepcion-satelite/en-bodega/page.tsx`

Los tests unitarios que ya existen de los servicios de la lista se tocan para inyectar
`reglasPaisFijas(CR)`. Se ven en el diff de la rama, que `archivos-en-vuelo.mjs` también lee.
