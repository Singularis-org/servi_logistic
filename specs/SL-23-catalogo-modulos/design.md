# SL-23 — catalogo-modulos · design.md

> Requisitos en `requirements.md` (R1–R33). Aprobado por el humano el 2026-10-26, con el cambio
> de catálogo de esa fecha (cierres al núcleo) y las respuestas a P1–P6 aplicadas aquí.

## Lo que ya existe

Términos buscados: `modulo`, `módulo activo`, `modulo_inactivo`, `organizacion_modulo`,
`apagar módulo` y `SL-23`, en `feature_list.json`, en `specs/` y en el código. El grafo no tiene
proyecto para este worktree (`list_projects` no lo lista), así que el código se buscó con
Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| Solo esta ficha trata del catálogo. SL-24 (planes), SL-25 (autoservicio) y SL-26 (panel de superadmin) citan los módulos como algo que consumen | `feature_list.json` | Nada que acotar: ya están en «Lo que NO entra» |
| SL-32, SL-38, SL-40 y SL-45 dicen «no hay módulo que encender: el catálogo es SL-23» | `specs/SL-32-rol-superadmin/design.md:167`, `specs/SL-38-…/design.md:349`, `specs/SL-40-…/design.md:251`, `specs/SL-45-…/design.md:289` | Confirma que no hay nada previo. Sus piezas se reparten en §3 |
| Nada de módulos en el esquema, en `lib/`, en `app/` ni en `middleware.ts` | Grep de `modulo` en código | Se crea |
| Visibilidad del menú solo por rol: `SIDEBAR_ITEMS`, `puedeVer`, `itemsVisibles`, `primerDestino` | `lib/auth/menu-visibility.ts` | **Se reutiliza sin cambiar firmas.** Se añade un campo opcional `modulo` a ítem y subítem y un filtro aparte (§6) |
| Contexto de empresa: `conEmpresa`, `comoPlataforma`, `contextoActual`; empresa de la cookie | `lib/db/contexto-empresa.ts`, `lib/auth/empresa-de-la-peticion.ts` | Se reutiliza: la puerta del módulo lee la empresa del contexto, nunca del cliente |
| Superadmin: `ROLES_PLATAFORMA`, `esPlataforma`, `exigirSuperadmin` | `lib/auth/plataforma.ts`, `lib/auth/exigir-superadmin.ts` | Única pregunta de autorización del servicio (R10) |
| Cron por empresa: `paraCadaEmpresa` | `lib/db/para-cada-empresa.ts` | Se amplía con la opción `modulo` (R21) |
| Drenador: `conSuEmpresa`, `buildHandlers`, `buildRecurrencias`; `JobQueueService.drenar` | `app/api/cron/procesar-jobs/route.ts`, `lib/services/JobQueueService.ts` | Se amplía: el descarte por módulo (R19, R20) |
| API por key: `buildAutenticar`, `conEmpresaDeLaKey` (9 rutas la usan) | `lib/api/api-key-request.ts` | Punto único para R18 |
| Historial: `appendAccion(tx, …)`, punto único vigilado; categorías en `lib/types/historial-accion.ts`; SL-36 añadió valores con la misma forma | `lib/repositories/registrar-accion.ts`, migración `20261025120100_historial_accion_integraciones` | Se reutiliza con dos tipos y una entidad nuevos (§5.2) |
| Trigger de misma empresa: deja pasar un actor `usuario` sin empresa (superadmin) | `db/migrations/20261022130300_misma_empresa_en_fk/migration.sql:25` | Permite registrar al superadmin como actor en `historial_accion` de la empresa |
| Tabla «una fila = sí, sin fila = no» por empresa | `distrito_zona_especial` (SL-38) | Se copia su forma (§4.1) |
| Escritura solo por el superadmin con `REVOKE` a `servi_app` | `cobro_plataforma_movimiento` (SL-40 §3.3–3.4) | Se copia el `REVOKE` (R7) |
| Pantalla «Empresas» del superadmin (listado con acciones por fila; no hay página de detalle) | `app/(app)/plataforma/empresas/page.tsx`, `_components/EmpresasModule.tsx` | Se añade la página de detalle y un enlace desde la fila (§7) |
| Fábricas de empresa por el servicio de alta | `tests/fabricas/empresa-y-usuarios.ts > crearEmpresa`, `tests/fabricas/e2e.ts > crearEmpresaE2E` | Encienden los 9 módulos por defecto, para que E2E y demo sigan como hoy (§9) |
| Borrado de la demo de QA, genérico por `organizacion_id` | `scripts/demo-qa/borrar.ts` (vía `information_schema`) | No hay que tocarlo: la tabla nueva tiene `organizacion_id` |

## 1. Resumen

- **Catálogo:** un enum de Postgres `modulo_apagable` con los 9 valores, más un catálogo en TS
  (`lib/modulos/catalogo.ts`) tipado como `Record<ModuloApagable, …>`. El typecheck impide que
  diverjan.
- **Estado:** la tabla de negocio `organizacion_modulo`, con una fila por empresa y módulo
  encendido. Sin fila, el módulo está apagado.
- **Reparto:** `lib/modulos/reparto.ts` asigna cada pieza a un módulo o al núcleo. Una guardia lo
  compara con el disco (R3).
- **Puertas** (`lib/modulos/exigir-modulo.ts`):
  - `exigirModuloEnRuta`, en la página: `notFound()`;
  - `exigirModuloActivo`, en la action y en la API: `ModuloInactivoError`, que es un 403;
  - el descarte en el drenador;
  - el filtro en `paraCadaEmpresa`;
  - el filtro del menú.
- **Escritura:** solo el superadmin, con `ModulosEmpresaService` → `ModulosEmpresaRepository` en
  `comoPlataforma("SL-23", …)` y su fila de historial en la misma transacción.

## 2. Catálogo (R1, R2)

`lib/modulos/catalogo.ts`. No importa nada de servidor: solo `import type { ModuloApagable }`, para
que el `Sidebar` cliente pueda importarlo.

| Clave (`modulo_apagable`) | Nombre en pantalla |
|---|---|
| `analitica` | Analítica |
| `monitoreo` | Monitoreo |
| `recoleccion` | Recolección |
| `bodegas_satelite` | Bodegas satélite |
| `wallet` | Wallet |
| `ranking` | Ranking |
| `incidentes_novedades` | Incidentes y novedades |
| `whatsapp` | WhatsApp |
| `api_integraciones` | API e integraciones |

- `MODULOS_APAGABLES: Record<ModuloApagable, { nombre: string; descripcion: string }>`. El
  orden de pantalla es una tupla aparte, `ORDEN_MODULOS`.
- `NUCLEO = ["Inicio", "Órdenes", "Entregas", "Cierres", "Usuarios", "Tarifas", "Ayuda"] as
  const`. Solo sirve para mostrarlo; no es una clave de base. «Cierres» entró al aprobar el spec
  (2026-10-26).
- «Recolección» es la **recolección en tienda** del mensajero (`/recoleccion`, ficha 167).
  «Recoger en bodega» (`/mis-asignaciones/recoger`) es parte de Entregas, o sea del núcleo.

## 3. Reparto de piezas (aprobado el 2026-10-26)

Vive en `lib/modulos/reparto.ts` como datos. El tipo del destino es
`Destino = ModuloApagable | "nucleo" | readonly [ModuloApagable, ModuloApagable]`; la tupla solo
se usa para las piezas compartidas de §3.7 (P5, R33).

- `MODULO_POR_RUTA`, `MODULO_POR_ACTION`, `MODULO_POR_CRON` y `MODULO_POR_API`: claves de texto
  hacia `Destino`;
- `MODULO_POR_JOB: Record<JobTipo, Destino>`. Un `JobTipo` nuevo sin clasificar no compila;
- `CALCULO_CONTINUO`: los jobs y crons de un módulo que siguen corriendo con el módulo apagado
  (P2, R30), §3.8.

La guardia de R3 lista el disco y exige que cada pieza esté exactamente una vez. Lo marcado con
**(P<n>)** remite a la decisión fechada de `requirements.md`.

**Cambio del 2026-10-26.** El humano sacó los cierres del módulo «Wallet y cierres», que pasa a
llamarse «Wallet» (clave `wallet`). Al núcleo van `/cierre-dia`, `/cierres-admin`, las actions
`cierre-dia`, `cierres-admin`, `cierre-bodega` y `liquidacion` (pagos, decisión del 2026-10-26), el cron `corte-diario`, el cierre `vencido` y el
bloqueo por cierre pendiente (R31). Las piezas que mezclan wallet y cierres se repartieron así;
las **dudosas** van con nota en §3.9.

### 3.1 Rutas de `app/(app)/` (43 páginas)

| Módulo | Rutas |
|---|---|
| núcleo | `/dashboard`, `/ordenes`, `/mis-asignaciones/reparto`, `/mis-asignaciones/recoger`, `/cierre-dia`, `/cierres-admin`, `/configuracion` (Usuarios), `/configuracion/tarifas`, `/ayuda`, `/ayuda/[...slug]`, `/historico/acciones` (P3), `/configuracion/integraciones` (P3), `/configuracion/sinpe` (P3), `/configuracion/vehiculos` (P3), `/configuracion/geografia` (plataforma), `/plataforma/empresas` (plataforma) y `/plataforma/empresas/[organizacionId]` (nueva, plataforma) |
| analitica | `/analitica` |
| monitoreo | `/monitoreo` |
| recoleccion | `/recoleccion` |
| bodegas_satelite | `/recepcion-satelite`, `/recepcion-satelite/por-recibir`, `/recepcion-satelite/en-bodega`, `/mi-bodega` |
| wallet | `/wallet`, `/wallet/tiendas`, `/wallet/tiendas/[tiendaId]`, `/wallet/mensajeros`, `/wallet/mensajeros/[mensajeroId]`, `/wallet/satelites`, `/wallet/satelites/[zonaId]`, `/mi-wallet` |
| ranking | `/ranking`, `/ranking/historico` |
| incidentes_novedades | `/incidentes`, `/novedades` |
| whatsapp | `/configuracion/plantillas`, `/configuracion/envios-whatsapp`, `/configuracion/envios-whatsapp/nuevo`, `/configuracion/envios-whatsapp/[id]`, `/configuracion/envios-whatsapp/historial`, `/historico/conversaciones` |
| api_integraciones | `/configuracion/api` |

### 3.2 Archivos de `lib/actions/` (108)

La unidad es el archivo. Regla: un archivo que se consume desde una pantalla del núcleo va al
núcleo aunque su nombre suene a un módulo. Se marca como **mixto** y lo protege la puerta de la
ruta. La guardia de §8.2 lo comprueba: una action de un módulo importada desde una ruta de otro
módulo o del núcleo falla, salvo que esté en `CONSUMOS_ENTRE_MODULOS` (§6.3).

| Módulo | Archivos (`lib/actions/<nombre>.ts`) |
|---|---|
| analitica (13) | `analitica-financiera`, `analitica-operativa`, `analitica-refrescar`, `ciclo-vida`, `cohorte-carga`, `conteo-cargadas-por-dia`, `conteo-devoluciones`, `conteo-entregas`, `conteo-hoy-gestion`, `conteo-por-status`, `conteo-productos`, `detalle-dinero-producto`, `finanzas-diario` |
| monitoreo (1) | `tablero-dia` |
| recoleccion (1) | `recoleccion-tienda` |
| bodegas_satelite (2) | `recepcion-satelite`, `envio-devolucion-central` |
| wallet (19) | `abono-tienda`, `aporte-capital`, `como-quedo`, `conciliacion-satelites`, `deuda-plataforma`, `efecto-movimiento`, `estado-cuenta`, `gasto-fijo-cobro`, `gasto-fijo-plantilla`, `libro-caja-autoria`, `pago-por-cuenta-tienda`, `rechazo-tienda-cobro`, `wallet`, `wallet-anulacion`, `wallet-comprobante`, `wallet-egresos`, `wallet-filtros`, `wallet-mensajero`, `wallet-tienda` |
| wallet + ranking (1) | `premio-ranking-devengo` (P5, §3.7) |
| ranking (2) | `ranking`, `ranking-historico` |
| incidentes_novedades (5) | `incidentes`, `novedades`, `habilitar-novedad`, `rechazos-sla-tienda`, `gestion-desde-ayuda` |
| whatsapp (8) | `chat-whatsapp`, `envios-whatsapp`, `historico-conversaciones`, `plantillas`, `plantillas-sync`, `whatsapp-envio`, `informe-picking`, `informe-transito` |
| api_integraciones (2) | `api-keys`, `webhooks` |
| núcleo (54) | `auth`, `aprobacion-postulaciones`, `atencion-postulaciones-recurso`, `carga-masiva-resumen`, `cierre-bodega` (Cierres), `cierre-dia` (Cierres; también la usan `/mis-asignaciones/*` y `/recoleccion`), `cierres-admin` (Cierres), `cobertura`, `cobro-plataforma` (plataforma), `corregir-datos-cliente`, `corregir-dia-reparto`, `corregir-fecha-reprogramacion`, `descargas`, `deshacer-asignacion`, `devolucion-origen`, `devolucion-tienda` (se usa en `/ordenes`), `eliminar-orden`, `etiquetas-guia`, `filtros-ordenes`, `geografia` (plataforma), `historial-acciones`, `integraciones` (P3), `liberacion-reprogramada`, `liquidacion` (Cierres, mixto: `/cierres-admin`, `/wallet/tiendas`, `/wallet/mensajeros`; decisión humana 2026-10-26, §3.9), `manifiesto`, `mis-asignaciones`, `notificaciones`, `orden-ayuda` (mixto: `mis-asignaciones` y `novedades`), `orden-historial`, `orden-mensajero-meta`, `orden-notas`, `ordenes`, `ordenes-guia`, `order-status`, `organizaciones` (plataforma), `password-reset`, `postulacion-mensajero`, `postulacion-recurso`, `push`, `rastreo-publico` (público), `recepcion-bodega-central` (se usa en `/ordenes`), `recepcion-origen`, `recuperar-orden`, `reprogramadas-retenidas`, `resolver-novedad` (mixto: `/ordenes` y `/novedades`), `ruta-mensajero`, `sinpe-bodega` (mixto: `/mi-bodega`, `/configuracion/sinpe` y el aviso del layout), `tarifas`, `traspasar-mensajero`, `usuarios`, `usuarios-por-rol`, `vehiculos`, `vistas-filtro`, `zonas` |

`lib/actions/modulos-empresa.ts` (nuevo, §7) es de plataforma, así que va al núcleo. Con él son
109.

### 3.3 Tipos de job (`JobTipo`, 16)

| Módulo | Tipos |
|---|---|
| núcleo | `liberar_reprogramadas`, `geocodificacion`, `optimizacion_ruta`, `push_web` |
| analitica | `analitica_rollup_diario` (recurrente; cálculo continuo, P2), `analitica_invalidacion_cache` (cálculo continuo, dudosa §3.9) |
| whatsapp | `whatsapp_template_sync`, `whatsapp_chat_envio`, `whatsapp_bienvenida`, `whatsapp_envio_programado`, `whatsapp_envio_evento`, `whatsapp_envio_ejecucion`, `whatsapp_envio_reintento`, `whatsapp_envio_mantenimiento` (recurrente) |
| api_integraciones | `webhook_estado`, `webhook_evento` (R19) |

`whatsapp_envio_programado` es una cadena: cada job encola el siguiente. Si se descarta, la cadena
se corta. Al reencender, la re-siembra `whatsapp_envio_mantenimiento` (ficha 474, R25 de aquella),
que corre de nuevo para la empresa.

### 3.4 Crons de `app/api/cron/` (12)

| Módulo | Crons |
|---|---|
| núcleo | `procesar-jobs` (el descarte es por job, §5.4), `corte-diario` (Cierres, P1: barre las órdenes, crea el cierre `vencido` y dispara el bloqueo siempre), `liberar-reprogramadas`, `procesar-devueltas-sla` (devoluciones de órdenes), `avisos-diarios` (P3), `aviso-reparto-manana` (P3), `purga-descargas`, `purga-pdf-cargas`, `purga-postulaciones-recurso` |
| wallet | `generar-gastos-fijos` |
| ranking | `snapshot-ranking` (cálculo continuo, P2: no pasa `modulo` a `paraCadaEmpresa`) |
| whatsapp | `sync-plantillas-whatsapp` |

### 3.5 Endpoints de `app/api/` que no son cron (14)

| Módulo | Endpoints |
|---|---|
| núcleo | `asistente` (Ayuda), `ordenes/carga-masiva/chunk` (carga por pantalla, Órdenes), `docs/openapi` (público, sin empresa) |
| whatsapp | `chat/media/[mensajeId]` (con sesión: 403 `modulo_inactivo`), `webhooks/whatsapp` (entrante: R24, P6) |
| api_integraciones + analitica | `ordenes/api-key/analitica` (P5, §3.7) |
| api_integraciones | las otras 8 de `ordenes/api-key/**`: `route`, `[numGuia]/cancelar`, `carga`, `carga/[cargaId]/generate`, `cotizacion`, `habilitar`, `orden/[id]` y `orden/[id]/generate` |

### 3.6 Menú (`SIDEBAR_ITEMS`)

| Ítem o subítem | `modulo` |
|---|---|
| Analítica | `analitica` |
| Monitoreo | `monitoreo` |
| Recolección | `recoleccion` |
| Órdenes del `adminSatelite` (`/recepcion-satelite`) | `bodegas_satelite` |
| Mi bodega | `bodegas_satelite` |
| Novedades, Incidentes | `incidentes_novedades` |
| Ranking | `ranking` |
| Wallet, Mi wallet | `wallet` |
| Configuración › API | `api_integraciones` |
| Configuración › Plantillas, Configuración › Envíos automáticos, Histórico › Conversaciones | `whatsapp` |
| Inicio, Órdenes, Entregas, Cierre del día, Cierres del día, Configuración › Usuarios/Tarifas/Integraciones/Vehículos/SINPE, Histórico › Acciones, Empresas, Ayuda | sin `modulo` (núcleo) |

### 3.7 Piezas compartidas entre dos módulos (P5, R33)

Exigen los dos módulos encendidos. La puerta acepta varias claves:
`exigirModuloActivo("wallet", "ranking")` y `exigirModuloEnRuta(...)` igual; está apagada si
falta cualquiera, y el error nombra el primer módulo apagado en `details.modulo`.

| Pieza | Módulos | Cómo se aplica |
|---|---|---|
| `lib/actions/premio-ranking-devengo.ts` | wallet + ranking | Cada función exportada abre con `exigirModuloActivo("wallet", "ranking")`. Su panel (`PremiosRankingPanel`, en la pestaña de `/wallet/mensajeros`) entra en `CONSUMOS_ENTRE_MODULOS` y no se pinta con Ranking apagado. `wallet-anulacion` la importa para anular un premio: esa rama devuelve `forbidden` con Ranking apagado, sin tocar las demás anulaciones |
| `app/api/ordenes/api-key/analitica/route.ts` | api_integraciones + analitica | `conEmpresaDeLaKey` ya exige `api_integraciones` (§5.5); la ruta añade `exigirModuloActivo("analitica")` antes de leer. Sale 403 `modulo_inactivo` con `details.modulo = "analitica"` |

### 3.8 Cálculo continuo (P2, R30)

`CALCULO_CONTINUO` en `reparto.ts` lista `analitica_rollup_diario`, `analitica_invalidacion_cache`
y `snapshot-ranking`. Siguen clasificados en su módulo (para el menú, la guardia y la trazabilidad),
pero:

- el drenador no los descarta con el módulo apagado (`conSuEmpresa` recibe `modulo` solo si el tipo
  no es de cálculo continuo);
- `snapshot-ranking` y el recurrente `analitica_rollup_diario` llaman a `paraCadaEmpresa` **sin**
  `modulo`: corren para todas las empresas;
- la guardia de §8 (caso d) exige que un cron de cálculo continuo **no** pase `modulo`, y que
  cualquier otro cron de un módulo sí lo pase.

Al reencender, la pantalla encuentra los días apagados ya calculados (R30).

### 3.9 Notas sobre piezas dudosas

- **`liquidacion` (pagos al mensajero y a la tienda) → núcleo.** Decidido por el humano el
  2026-10-26. La usan `/cierres-admin` («Pago al mensajero» de un cierre aprobado y la oferta de
  pago al aprobar) y `/wallet/tiendas` y `/wallet/mensajeros`. Es una pieza mixta del núcleo: pagar
  desde `/cierres-admin` está siempre disponible, con Wallet encendido o apagado (R31). Las pantallas
  de wallet la siguen usando; las protege la puerta de su ruta. `wallet-anulacion` la importa
  para anular un pago, y una action de wallet que importa una del núcleo no es un consumo cruzado.
- **Aprobar un cierre escribe movimientos de caja.** La action `cierres-admin` (núcleo) sigue
  escribiéndolos con Wallet apagado, igual que el pago de `liquidacion`; solo no se ven en
  `/wallet` hasta reencender (R22). Confirmado por el humano el 2026-10-26. Wallet apagado solo
  oculta `/wallet`, `/mi-wallet` y sus actions propias.
- **`cierre-dia` la usan `/mis-asignaciones/*` y `/recoleccion`.** Antes era un consumo cruzado;
  ahora es núcleo y deja de serlo.
- **`analitica_invalidacion_cache` en cálculo continuo.** P2 nombra el rollup y la foto; la
  invalidación de caché se añade porque, si se descartara, al reencender la analítica podría
  servir caché vieja de días ya recalculados. Es barata.
- **KPIs financieros de `/analitica`** (`app/(app)/analitica/_components/finanzas/cargar-kpis.ts`)
  llaman a actions de wallet (`wallet`, `wallet-tienda`, `wallet-mensajero`). Hoy la sección está
  comentada en `analitica/page.tsx` (2026-08-18). Se registra en `CONSUMOS_ENTRE_MODULOS` para que,
  si vuelve, no se pinte con Wallet apagado; la guardia (e) lo exige.
- **`adminSatelite` con Bodegas satélite apagado (P4, R32).** Le quedan «Cierres del día»
  (núcleo) y lo que su rol vea; si no le queda nada, aterriza en Inicio.

## 4. Modelo de datos

### 4.1 `organizacion_modulo` (negocio)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | `@default(uuid())` en Prisma; `gen_random_uuid()::text` en el backfill |
| `organizacion_id` | `TEXT NOT NULL` | `DEFAULT NULLIF(current_setting('app.organizacion_id', true), '')`, como toda tabla de negocio; FK `organizacion` `ON DELETE CASCADE ON UPDATE CASCADE` |
| `modulo` | enum `modulo_apagable` `NOT NULL` | |
| `created_at` | `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` | Cuándo se encendió por última vez |

- **Índices.** `UNIQUE ("organizacion_id", "modulo")`, con la empresa primero (R4: una fila como
  mucho). Cubre la consulta de la puerta. Además, `("organizacion_id")`.
- **RLS.** La política `organizacion_modulo_por_empresa` es `FOR ALL TO servi_app`, con `USING` y
  `WITH CHECK` por `organizacion_id`. Es la forma que reconoce `rls-por-empresa.guardia`.
- **Solo lectura para la empresa.** `REVOKE INSERT, UPDATE, DELETE ON "organizacion_modulo" FROM
  servi_app`. Sin él, los privilegios por defecto de SL-17 dejarían que una empresa se encendiera
  módulos con SQL a mano (R7). Precedente: SL-40 §3.4.
- **Trigger** `organizacion_modulo_sin_cambio_de_empresa` (`impedir_cambio_de_empresa`). No lleva
  `verificar_misma_empresa`, porque su única FK va a `organizacion`.
- **No guarda quién la escribió.** El autor lo da `historial_accion` (R12), como en SL-36 §2.4.
- **Por qué `CASCADE` y no el `RESTRICT` de SL-38.** La fila es configuración y no tiene valor sin
  su empresa. Con `RESTRICT`, cada limpieza de tests que hoy borra una `organizacion` encendida
  por la fábrica empezaría a fallar. La evidencia del cambio vive en `historial_accion`, que
  sigue siendo `RESTRICT`.
- **Prisma.**
  - `model OrganizacionModulo` con `@@map("organizacion_modulo")`, `enum ModuloApagable` con
    `@@map("modulo_apagable")` y la relación inversa `Organizacion.modulos`.
  - `organizacionId` va con `@default(dbgenerated())` vacío, como `DistritoZonaEspecial`.
  - Se clasifica en `MODELOS_DE_NEGOCIO` de `lib/db/modelos-de-negocio.ts`. Sin eso, el gate se
    pone en rojo.

### 4.2 `jobs.estado`: valor `descartado` (R20)

- Valor nuevo `descartado` en `job_estado` (`JobEstado` en Prisma).
- El job descartado queda con `estado = 'descartado'` y
  `last_error = 'modulo_inactivo:<clave>'`, y no vuelve a reclamarse: el reclamo solo toma
  `pending`.
- `DrenarResult` gana `descartados`.

### 4.3 `historial_accion`

- **`HistorialAccionTipo`:** `modulo_activado` y `modulo_desactivado`.
- **`HistorialAccionEntidad`:** `organizacion_modulo`, 1:1 con su tabla.
  - `entidad_id` es el id de la fila creada o borrada. Es opaco y sin FK, así que sobrevive al
    borrado de la fila al apagar.
- **En cada fila:**
  - `entidad_etiqueta`: el nombre del módulo (catálogo);
  - `valor_nuevo`: la clave del módulo (catálogo; cabe en 60).
- **Categoría nueva** `cambia_modulos` («Cambia módulos») en `lib/types/historial-accion.ts`, con su
  etiqueta y el total del catálogo actualizado.
- **El maestro lo ve.** La fila es de la empresa, así que el `maestro` la ve en
  `/historico/acciones`, con el superadmin como actor. Es lo que pide la decisión: quién, cuándo y
  qué módulo.

### 4.4 Datos que dependen del país

Ninguno. El catálogo no tiene moneda, geografía, impuestos ni métodos de pago.

## 5. Capas

### 5.1 Lectura en contexto de empresa (las puertas)

| Archivo | Papel |
|---|---|
| `lib/interfaces/repositories/IModulosActivosRepository.ts`, `lib/repositories/ModulosActivosRepository.ts` | `activos(): Promise<ModuloApagable[]>`. Un `findMany` sin `where` de empresa: lo pone la extensión y lo respalda la RLS (R7, R25). Sin empresa, falla con `EmpresaNoResuelta` |
| `lib/modulos/exigir-modulo.ts` | `modulosActivos()`: la lista de la empresa en curso, envuelta en `cache()` de React, una consulta por petición. **No hay memo entre peticiones** (R9): a diferencia de `empresaDeLaPeticion`, este dato cambia. `moduloActivo(m)`. `exigirModuloActivo(...ms)`: lanza `ModuloInactivoError` si alguno está apagado (una clave, o dos para §3.7). `exigirModuloEnRuta(...ms)`: llama a `notFound()` si alguno está apagado. `modulosDelMenu(actor)`: un conjunto vacío para el superadmin o sin sesión, sin consulta |
| `lib/modulos/modulo-inactivo-error.ts` | `class ModuloInactivoError extends ForbiddenError`, con `details: { codigo: "modulo_inactivo", modulo }` y el mensaje «El módulo <nombre> no está activo para esta empresa.» |

### 5.2 Escritura por el superadmin

| Archivo | Papel |
|---|---|
| `lib/types/modulos-empresa.ts` | Esquemas zod en el borde: `fijarModuloEmpresaSchema` (`organizacionId` uuid, `modulo` en `z.enum(claves)`, `activo` boolean) y `verModulosEmpresaSchema`. DTO `ModulosDeEmpresa = { organizacionId, nombre, modulos: { clave, nombre, activo }[] }` |
| `lib/interfaces/repositories/IModulosEmpresaRepository.ts`, `lib/repositories/ModulosEmpresaRepository.ts` | `empresa(id)`, `activos(id)`, `encender(id, modulo, actor)` y `apagar(id, modulo, actor)`. Todo dentro de `comoPlataforma("SL-23", …)`. `encender` y `apagar` abren un `$transaction`, escriben y llaman a `appendAccion(tx, [...])` **solo si la fila cambió**: `createMany … skipDuplicates` contado, o `deleteMany` contado (R13). Escriben `organizacion_id` explícito, porque en plataforma la extensión no lo inyecta |
| `lib/interfaces/services/IModulosEmpresaService.ts`, `lib/services/ModulosEmpresaService.ts` | `ver(actor, input)` y `fijar(actor, input)`. El orden es fijo: `esPlataforma` (R10), luego zod (R11), luego que la empresa exista (R11), y al final el repositorio. Resultado: `{ estado: "ok", cambio: boolean } \| { estado: "forbidden" \| "validation_error" \| "not_found" }` |
| `lib/actions/modulos-empresa.ts` | `'use server'`: `fijarModuloEmpresaAction(input)`. Resuelve el actor de la sesión y monta el servicio en su composition root, con test de que lo **pasa** (precedente SL-40 §5) |
| `lib/actions/_shared/modulos-empresa.ts` | El composition root de lectura para la página. No es `use server`, igual que `empresas-plataforma.ts` |

- **`appendAccion` y la empresa.** `EntradaAccion` gana un `organizacionId?: string` opcional, que
  se vuelca a la fila si viene. Hace falta porque en `comoPlataforma` el `DEFAULT` de la columna
  sale `NULL`. Sigue siendo el único sitio que nombra `tx.historialAccion` (la guardia
  `historial-accion-punto-unico` no cambia). Ningún llamador de hoy lo pasa, así que su
  comportamiento no cambia.
- El actor congelado sale de `resolverActorCongelado` con el superadmin. El trigger de misma
  empresa lo admite porque el `usuario` no tiene empresa (migración `20261022130300`, línea 25).
- **Excepciones:** `EXCEPCIONES_DE_PLATAFORMA` gana `{ archivo:
  "lib/repositories/ModulosEmpresaRepository.ts", ficha: "SL-23", motivo: "encender y apagar módulos
  de una empresa: lo hace el superadmin, que no tiene empresa (R10)" }`.

### 5.3 Rutas y actions (R16, R17)

- **Página de un módulo.** La primera línea del componente, antes de cualquier lectura, es
  `await exigirModuloEnRuta("<clave>")`. Va en la página y no en un `layout.tsx` por segmento: un
  layout ya montado no se vuelve a pintar al navegar entre sus hijas, y apagar a mitad de sesión
  dejaría pasar `/wallet` → `/wallet/tiendas`.
- **Action de un módulo.** Cada función exportada de un archivo de un módulo llama a
  `await exigirModuloActivo("<clave>")` como primera sentencia de su cuerpo, dentro de su
  `withErrorHandler` si lo tiene. Ahí `toActionError` lo traduce a `{ status: "forbidden" }` sin
  tocar el contrato de la UI.

### 5.4 Jobs y crons (R19, R20, R21)

- **`conSuEmpresa(handler, recurrente, opciones, modulo)`.** `modulo` sale de `MODULO_POR_JOB`, en
  `buildHandlers`; para los tipos de `CALCULO_CONTINUO` (§3.8) se pasa `"nucleo"`, así que corren
  con el módulo apagado (R30).
  - **Con empresa:** dentro del `conEmpresa`, si `modulo !== "nucleo"` y está apagado, lanza
    `JobDescartado(motivo)` sin llamar al handler.
  - **Sin empresa y recurrente:** `paraCadaEmpresa(…, { modulo })`.
  - **Sin empresa y no recurrente:** filas viejas o de script. Corre como hoy: no hay empresa
    contra la que comprobar.
- **`JobQueueService.drenar`.** Un `JobDescartado` va a `repo.descartar(id, motivo)`, suma
  `descartados` y no pasa por `manejarFallo`. Si el tipo es recurrente, agenda la siguiente
  ocurrencia igual que tras un éxito (R20).
- **`IJobRepository` / `JobRepository`** ganan `descartar(id, motivo)`: `estado = 'descartado'` y
  `last_error`.
- **`paraCadaEmpresa(fn, { cliente, modulo })`.**
  - Con `modulo`, el listado como plataforma filtra
    `where: { modulos: { some: { modulo } } }`.
  - Las demás empresas se devuelven en `resumen.saltadas` y se registran en una línea
    `console.info` con los ids, que no son datos personales.
  - `ClienteDeOrganizaciones` se ensancha para aceptar el `where`.
- **Los dos crons de un módulo que se saltan empresas** pasan `{ modulo }`: `generar-gastos-fijos`
  y `sync-plantillas-whatsapp`. Sus resúmenes JSON ganan `saltadas: number`. `snapshot-ranking` es
  de cálculo continuo (§3.8) y no cambia: no pasa `modulo`.

### 5.5 API por key (R18)

- `conEmpresaDeLaKey(auth, cuerpo)` comprueba `exigirModuloActivo("api_integraciones")` dentro del
  `conEmpresa` y antes de `cuerpo`. Como las 9 rutas lo usan, es un único punto.
- El `ModuloInactivoError` lo recoge el `withErrorHandler` de cada ruta y sale por
  `appErrorToResponse`:

```json
HTTP 403
{ "status": "error", "code": "FORBIDDEN",
  "message": "El módulo API e integraciones no está activo para esta empresa.",
  "details": { "codigo": "modulo_inactivo", "modulo": "api_integraciones" } }
```

- **Por qué en `details.codigo` y no en `code`.** `code` es el `AppErrorCode` cerrado en
  MAYÚSCULAS de la feature 10. Ampliarlo cambiaría el `switch` exhaustivo de `toActionError` y el
  mapa HTTP para todo el repo. El código `modulo_inactivo` viaja literal, y el 403 es el de
  `FORBIDDEN`. Aprobado por el humano el 2026-10-26.
- **`chat/media/[mensajeId]`.** Llama a `exigirModuloActivo("whatsapp")` con la misma salida.

### 5.6 Webhook entrante de WhatsApp (R24, P6 aprobada)

`WebhookWhatsappService` ya abre la empresa del mensaje con `conEmpresa`. Ahí, si `whatsapp` está
apagado, anota una línea de log sin datos personales y no guarda ni encola nada. El route sigue
respondiendo 200: Meta reintenta todo lo que no sea 2xx.

## 6. Menú (R15)

### 6.1 Datos

`MenuItem` y `MenuChild` ganan un `modulo?: ModuloApagable` opcional (tabla de §3.6). Es un
`import type` de `@prisma/client`, así que no arrastra servidor al `Sidebar`.

### 6.2 Funciones

- **`filtrarPorModulos(items, activos: ReadonlySet<ModuloApagable>)`.** Es pura y nueva en
  `menu-visibility.ts`. Quita los ítems con `modulo` apagado y poda los subítems apagados. Si un
  desplegable se queda sin subítems, desaparece, con la misma regla que `puedeVer` (ficha 362).
  Conserva la identidad del ítem cuando no hay nada que podar.
- **`menuDeLaEmpresa(actor, activos)`.** Devuelve
  `filtrarPorModulos(itemsVisibles(SIDEBAR_ITEMS, actor), activos)`.
- **Consumidores.** Los tres de `app/` pasan a `menuDeLaEmpresa`:
  - `app/(app)/layout.tsx`;
  - `app/(app)/dashboard/page.tsx`, que calcula `primerDestino` sobre la lista ya filtrada;
  - `app/(app)/not-found.tsx`.
- **`itemsVisibles` y `puedeVer` no cambian de firma.** Las 140 llamadas de los tests siguen
  valiendo.
- **Una guardia** impide que `app/` llame a `itemsVisibles` directamente.
- **Superadmin.** `modulosDelMenu` devuelve un conjunto vacío sin consulta. «Empresas» no tiene
  `modulo`, así que sigue visible.
- **`destinoInicial`** no cambia. Si se apagan «Analítica» y «Monitoreo», los ítems marcados
  desaparecen y `primerDestino` sigue saltándose los que queden marcados. El `toEqual` literal de
  `destino-post-login.test.ts` no cambia, porque `SIDEBAR_ITEMS` sigue igual.

### 6.3 Consumos entre módulos

`CONSUMOS_ENTRE_MODULOS` en `lib/modulos/reparto.ts` lista las piezas de un módulo que se pintan
en una pantalla de otro. La pantalla anfitriona solo las pinta si el módulo está encendido: recibe
el flag por props desde su Server Component. Lista inicial:

| Pieza | Pantalla anfitriona | Módulo de la pieza |
|---|---|---|
| `app/(app)/mis-asignaciones/_components/chat/ChatFlotante.tsx` (y `ChatConversacion.tsx`) | `/mis-asignaciones/*` (núcleo) | whatsapp |
| `app/(app)/wallet/mensajeros/_components/PremiosRankingPanel.tsx` | `/wallet/mensajeros` (wallet) | wallet + ranking (§3.7) |
| `app/(app)/analitica/_components/finanzas/cargar-kpis.ts` (hoy sin montar) | `/analitica` | wallet (§3.9) |

## 7. Pantalla del superadmin (R8, R14)

- **`app/(app)/plataforma/empresas/[organizacionId]/page.tsx`** (Server Component).
  - Hace `notFound()` si el actor no es `esPlataforma`, antes de leer (R14).
  - Lee `ModulosDeEmpresa` con el composition root de §5.2. Si la empresa no existe, `notFound()`.
  - Pinta el nombre de la empresa, «Núcleo (siempre activo)» con los seis nombres, y el bloque
    «Módulos».
- **`app/(app)/plataforma/empresas/[organizacionId]/_components/ModulosEmpresa.tsx`** (cliente).
  - Una fila por módulo con nombre, descripción y el `Switch` de shadcn (ya está en
    `components/ui/switch.tsx`).
  - Al cambiar, llama a `fijarModuloEmpresaAction`. Mientras espera, el switch queda deshabilitado.
  - Si el resultado no es `ok`, vuelve al estado anterior y avisa con el `ToastProvider`.
  - No hay confirmación modal: el cambio es reversible y no borra datos.
- **`EmpresasModule.tsx`** gana en cada fila un enlace «Módulos» a
  `/plataforma/empresas/<id>`. No cambia nada más del listado: SL-26 es el resto del panel.

## 8. Guardias nuevas

| Guardia | Qué falla | R |
|---|---|---|
| `tests/unit/guards/modulos-reparto.guardia.test.ts` | (a) Una `page.tsx` de `app/(app)/`, un `lib/actions/*.ts`, una carpeta de `app/api/cron/` o un `route.ts` de `app/api/` sin entrada en `reparto.ts`, o una entrada sin archivo. (b) Una página de un módulo sin `exigirModuloEnRuta(<sus claves>)`, o con otras claves. (c) Una función exportada de una action de un módulo (o compartida, §3.7) sin `exigirModuloActivo(<sus claves>)` como primera sentencia. (d) Un cron de un módulo que no es de cálculo continuo y llama a `paraCadaEmpresa` sin `modulo: "<su clave>"`, o uno de cálculo continuo (§3.8) que sí lo pasa. (e) Un import de una action de un módulo desde una ruta o componente de otro módulo o del núcleo que no esté en `CONSUMOS_ENTRE_MODULOS`. (f) Un `itemsVisibles(` en `app/` | R3, R15, R16, R17, R21, R30, R33 |
| `tests/unit/guards/modulos-sin-seed.guardia.test.ts` | `scripts/seed-catalogos.ts` (el `db:seed`) nombra `organizacionModulo` u `organizacion_modulo` | R28 |

Las guardias existentes que esta feature hace cumplir son `organizacion-en-modelos`,
`rls-por-empresa`, `fk-misma-empresa`, `plataforma-solo-en-lista`, `historial-accion-punto-unico`,
`historial-accion-escrituras-cubiertas` y `guard-dependencias-aprobadas`.

## 9. Migraciones

Van después de la última de `dev` (`20261025160100_entorno_marca`). Se escriben a mano, porque
`db:migrate:create` falla con P3006 en este repo (SL-40 §4). Antes de aplicarlas en una base
compartida, la T0 comprueba que siguen siendo las últimas.

| Carpeta | `migration.sql` | `down.sql` |
|---|---|---|
| `20261026120000_organizacion_modulo` | `CREATE TYPE modulo_apagable` (9 valores), la tabla, índices, FK `CASCADE`, RLS, política, `GRANT SELECT` y `REVOKE INSERT, UPDATE, DELETE` a `servi_app`, y el trigger sin cambio de empresa. Backfill (R5): `INSERT INTO organizacion_modulo (id, organizacion_id, modulo) SELECT gen_random_uuid()::text, o.id, m FROM organizacion o CROSS JOIN unnest(enum_range(NULL::modulo_apagable)) m` | `DROP TABLE organizacion_modulo; DROP TYPE modulo_apagable;` |
| `20261026120100_historial_accion_modulos` | `ALTER TYPE historial_accion_tipo ADD VALUE` ×2 y `ALTER TYPE historial_accion_entidad ADD VALUE 'organizacion_modulo'` | Borra las filas con esos valores y recrea los dos tipos sin ellos, con el patrón de `20260904120000_historial_accion_api_key_eliminada/down.sql` |
| `20261026120200_job_estado_descartado` | `ALTER TYPE job_estado ADD VALUE 'descartado'` | Pasa los `descartado` a `done` (con `last_error` intacto) y recrea `job_estado` sin el valor. Antes borra y después vuelve a crear los índices parciales que lo nombran (los de `20260717120000_jobs_cola`) |

- La primera también incluye a las empresas `es_demo` existentes: existen al desplegar.
- `tests/integration/db/migracion-sl23-ida-y-vuelta.test.ts`:
  1. aplica las tres;
  2. comprueba el backfill sobre dos empresas previas;
  3. comprueba los nombres en español (R27);
  4. descarta un job;
  5. aplica los tres `down.sql`;
  6. comprueba que vuelve el estado anterior.

## 10. Tests y fábricas que cambian por la feature

- **`tests/fabricas/empresa-y-usuarios.ts > crearEmpresa`.** Gana la opción
  `modulos?: "todos" | readonly ModuloApagable[]`, por defecto `"todos"`. Escribe como dueño con un
  `createMany`, sin historial: es una fábrica, no el superadmin. Así los E2E de `reparto` y
  `dinero` y la demo de QA (`scripts/demo-qa/receta.ts`, que la usa) siguen viendo sus módulos.
  `tests/fabricas/organizaciones.ts` (`organizacion.create` directo) no cambia: no enciende nada.
- **Tests de página y de action que ya hacen `vi.mock("@/lib/auth/resolve-actor")`.** Los de
  pantallas y actions de un módulo ganan `vi.mock("@/lib/modulos/exigir-modulo", …)` con el helper
  `tests/fabricas/modulos.ts > puertasAbiertas()`, que deja todo encendido. Es una línea por
  archivo. La lista conocida va en `tasks.md > Archivos esperados`; los demás que caigan en rojo
  se añaden allí al tocarlos.
- **`e2e/dos-empresas-humo.spec.ts`, `e2e/_dos-empresas-fixture.ts` y
  `e2e/_superadmin-fixture.ts`** (R26):
  - tras el alta, el superadmin abre `/plataforma/empresas/<id>` y enciende por la pantalla los 9
    módulos de A y 8 de B, todos menos `ranking`;
  - `rutasDelMenuDelMaestro(apagados)` excluye las rutas apagadas de B;
  - el caso nuevo: el menú de B no tiene «Ranking», `/ranking` y `/ranking/historico` muestran «No
    encontramos esta página», y A ve «Ranking» y abre `/ranking` sin error.

## 11. Alternativas descartadas

1. **Catálogo en una tabla de plataforma (`modulo`) con FK desde la activación.** Permitiría
   añadir módulos sin migración, pero la decisión cerrada dice que un módulo nuevo exige código. Una
   fila de catálogo sin código detrás sería un interruptor que no apaga nada. Con el enum, un
   módulo nuevo pasa por migración, y el `Record` del catálogo obliga a nombrarlo en TS.
2. **Columna `modulos text[]` (o JSON) en `organizacion`.** Habría menos tablas, pero:
   - no hay unicidad ni tipo por elemento;
   - `organizacion` ya es de solo lectura para `servi_app` y su lectura propia es otra política;
   - el patrón «una fila = sí» de SL-38 y SL-36 es la decisión cerrada.
3. **Puerta de rutas en `middleware.ts`.** Ya corre en `nodejs` y podría consultar la base, pero
   respondería un 404 propio, no la `not-found.tsx` del portal con su «volver al inicio». Además,
   repetiría la resolución de la empresa fuera de React y no cubre las actions, que siguen
   necesitando su puerta. Se elige la puerta en cada página, que una guardia vigila.
4. **Puerta en un `layout.tsx` por segmento.** Descartada en §5.3: no se vuelve a pintar al navegar
   entre hermanas.
5. **Descartar los jobs pendientes en el momento de apagar** (un `UPDATE` masivo en la
   transacción del superadmin). No cubre los jobs encolados después de apagar, como un
   `webhook_evento` de una orden nueva, y obliga a mantener el mapa tipo → módulo en SQL. El
   descarte al drenar cubre los dos casos con el mismo código.
6. **Marcar el descartado como `done` con `last_error`.** No pide migración de enum, pero mezcla
   «se hizo» con «no se hizo» en el estado que miran los recuentos y el monitoreo de la cola. Un
   valor propio se cuenta y se filtra sin leer texto.
7. **`code: "MODULO_INACTIVO"` como `AppErrorCode` nuevo.** Descartado en §5.5: rompe el `switch`
   exhaustivo de `toActionError` y el contrato de la feature 10 en todo el repo, por un caso que
   cabe en `details`.
8. **Cambiar la firma de `itemsVisibles` para recibir los módulos.** Obligaría a tocar 140 llamadas
   de tests. La composición `menuDeLaEmpresa` deja intacto lo probado.

## 12. Dependencias

Ninguna nueva (R29). Todo usa lo que ya hay: Prisma, zod, React `cache` y el `Switch` de shadcn ya
instalado.

## 13. Riesgos

- **Volumen de puertas.** Son 26 páginas y 54 archivos de actions (tras sacar los cierres al
  núcleo). La guardia de §8 es la red: sin
  ella, una puerta olvidada es una fuga silenciosa.
- **Una consulta más por página o action de un módulo**, cubierta por el único
  `(organizacion_id, modulo)` y memorizada por petición. El layout la hace una vez por carga.
- **Roles que se quedan sin pantalla de trabajo** (P4, aceptado: R32). No se bloquea en esta feature.
- **Cálculo continuo** (§3.8): con Analítica o Ranking apagados se sigue pagando su cómputo
  diario. Es lo decidido (P2); el coste es el de hoy con todo encendido.
