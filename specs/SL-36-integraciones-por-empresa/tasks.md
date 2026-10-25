# SL-36 — integraciones-por-empresa · tasks.md

> Orden: T1 → T2 → (T3 ‖ T4) → T5 → T6 → T7.0 (puerta humana) → T7 → T8 → T9 → T10.
> `[P]` = puede ir en paralelo con las otras `[P]` de su bloque. Cada tanda cierra con `./init.sh`
> en verde. Un commit por task (`feat(SL-36): …`).
> Reparto por capa (`docs/perfil-agentes.md > implementer`): `backend_dev` hace T1-T6, T8.1 y T10;
> `frontend_dev` hace T7 y T8.2.

## T1. Datos

- [x] **T1.1** Migración `20261025120000_integracion` (design §2.1-2.4), con UP y `down.sql`.
  - Hecho cuando: `pnpm run db:migrate` y `pnpm run db:rollback` dejan el esquema igual en
    ida-vuelta-ida;
  - los dos modelos están en `MODELOS_DE_NEGOCIO`;
  - las guardias `organizacion-en-modelos` y `fk-misma-empresa` están en verde.
- [x] **T1.2** Migración `20261025120100_historial_accion_integraciones`, con UP y `down.sql`; enums
  y categoría en `lib/types/historial-accion.ts` (design §13).
  - Hecho cuando: los tests del catálogo del historial pasan con el total nuevo.
- [x] **T1.3** Test de integración de la migración contra Postgres real:
  - RLS activa en las dos tablas;
  - los CHECK de `secretos` y de las columnas de WhatsApp rechazan un valor en claro y una columna de
    WhatsApp en otro servicio.
  - Hecho cuando: el test está en verde y una mutación que quita el CHECK lo pone en rojo.

## T2. Bóveda (depende de nada; puede empezar con T1)

- [x] **T2.1** `lib/config/integraciones.ts`: el anillo, el valor activo y el límite de pruebas, leídos
  en cada llamada.
  - Hecho cuando: los tests de config de R4 están en verde.
- [x] **T2.2** `lib/crypto/boveda-integraciones.ts`, con sus tres interfaces (design §3).
  - Hecho cuando: la batería de QC §10 «Cifrador», «Resumen» y «Configuración» está en verde.
  - Se comprueba que el test de contexto falla si el AAD se arma con `join(":")`.

## T3. Repositorios [P]

- [x] **T3.1** `IntegracionRepository`:
  - filtro por empresa en el `where`, empresa tomada del contexto y nunca de la fila;
  - `P2002` traducido a `ya_existe` o `numero_ocupado`; cualquier otra violación se propaga;
  - `appendAccion` en la misma `$transaction` (design §13).
  - Hecho cuando: el test de dos empresas contra base real (R8-R11, R32) está en verde.
- [x] **T3.2** `IntegracionPruebaMinutoRepository`, con SQL `ON CONFLICT … RETURNING` que filtra por
  `organizacion_id`.
  - Hecho cuando: el test real de dos empresas y de concurrencia está en verde.
- [x] **T3.3** `IntegracionEnrutadoRepository` y su entrada en `EXCEPCIONES_DE_PLATAFORMA`, ficha
  SL-36 (design §10).
  - Hecho cuando: el test afirma que el `select` trae solo `id` y `organizacion_id`.
- [x] **T3.4** `EmpresasPlataformaRepository.estadoIntegraciones()` y
  `EmpresasPlataformaService.estadoIntegraciones(actor)` (design §11).

## T4. Probadores [P]

- [x] **T4.1** Probador de WhatsApp: número + WABA y señales de rechazo (design §5).
- [x] **T4.2** Probador de Google Maps: dirección fija; `REQUEST_DENIED` da prueba fallida; la URL no
  va al log.
- [x] **T4.3** Probador de optimización de rutas: zod del JSON de la clave e intercambio JWT-bearer.
- [x] **T4.4** Probador del asistente: confirmar con context7 el endpoint de listado de modelos de
  Anthropic antes de escribirlo (design §18).
- [x] **T4.5** `probador-doble.ts` y su selección por entorno (design §15).
- Hecho (todo T4) cuando:
  - cada probador tiene tests con `fetch` inyectado: éxito, rechazo, red, timeout y respuesta
    inválida;
  - ningún test ve la credencial en un mensaje ni en un log.

## T5. Services

- [x] **T5.1** `IntegracionesService`: las seis operaciones de design §4 y el límite de design §6.
  - R6 va en la primera línea de cada operación.
  - Hecho cuando: los tests de autorización y de cada operación están en verde.
  - Se comprueba que una mutación que borra la línea de R6 deja en rojo el test de autorización.
- [x] **T5.2** `CredencialesIntegracionService`: `leer` y `marcarRechazo` (design §4).
- [x] **T5.3** `WebhookWhatsappService`: GET y POST (design §10).
- [x] **T5.4** `RecifradoIntegracionesService` + `scripts/recifrar-integraciones.ts` + el script
  `integraciones:recifrar` en `package.json` (design §12).
- [x] **T5.5** Catálogo de servicios `lib/types/integraciones.ts` (design §7, §8), con la marca
  propuesta.
  - La marca se ajusta si el humano responde la pregunta abierta 1.

## T6. Consumidores (depende de T5.2). Cada fila de design §9.1 es una casilla

- [x] **T6.1** WhatsApp:
  - `lib/config/whatsapp.ts` y `lib/clients/whatsapp-app-id.ts`, con la caché por empresa (R28);
  - los handlers de jobs, las actions, `construir-template-port.ts`, `PlantillaMensajeService.ts`
    y `documento-ejemplo-plantilla.ts`;
  - el cron de plantillas por empresa;
  - `app/api/chat/media/[mensajeId]/route.ts`.
- [x] **T6.2** Webhook:
  - `app/api/webhooks/whatsapp/route.ts` delega en `WebhookWhatsappService`;
  - `lib/types/whatsapp-webhook.ts` conserva `metadata.phone_number_id`;
  - se borra `repartirPorEmpresa`;
  - sale la entrada del route en `EXCEPCIONES_DE_PLATAFORMA`.
- [ ] **T6.3** Maps: `lib/config/geocode.ts`, `GeocodificacionService.ts` y
  `geocodificacion-handler.ts`.
- [ ] **T6.4** Rutas:
  - `lib/config/route-optimization.ts`, `google-sa-token.ts` y `google-token-shared.ts`;
  - borrar `google-wif-token.ts` y `google-adc-token.ts` con sus tests;
  - `optimizacion-ruta-handler.ts`, con el token por empresa (R28).
- [ ] **T6.5** Asistente: `lib/config/asistente.ts` y `app/api/asistente/route.ts`, con el texto nuevo
  de R27.
- [ ] **T6.6** `app/api/cron/procesar-jobs/route.ts` (builders), `e2e/_escenarios/crons.ts`,
  `.env.example` y `README.md`.
- [ ] **T6.7** Guardia `sin-credenciales-de-entorno` (R41), con su autocomprobación.
- Hecho (todo T6) cuando:
  - Grep de cada variable de design §9.3 en `app/`, `lib/` y `scripts/` da 0 lecturas de
    `process.env`;
  - los tests existentes de cada consumidor se actualizan y siguen en verde;
  - `./init.sh` está en verde.

## T7. Pantalla

- [x] **T7.0 PUERTA HUMANA — DISPENSADA por Carlos (2026-10-24, «implementa ya»).** La pantalla
  `/configuracion/integraciones` NO pasa por `/design`: sigue los patrones visuales y componentes ya
  existentes de `app/(app)/configuracion/` (p. ej. `configuracion/api`, `configuracion/geografia`).
  Carlos la revisa en el PR; un rediseño posterior es otra ficha.
- [x] **T7.1** `lib/actions/integraciones.ts`, con las Server Actions y el composition root.
- [ ] **T7.2** Página, tarjetas, formularios, diálogo de desconexión, revelado único del token y menú
  (`lib/auth/menu-visibility.ts`), siguiendo los patrones de `app/(app)/configuracion/` (T7.0 dispensada).
  - Hecho cuando: los tests de componentes de R18 (token una vez), R31, R34, R35 y R36 están en verde.

## T8. Guías

- [x] **T8.1** [P] Los cinco documentos de `docs/ayuda/oficina/` (design §14), con `fuentes` que
  citan el código y la documentación oficial de cada proveedor.
- [ ] **T8.2** [P] Revisión humana de los pasos de las consolas de terceros.
  - Hecho cuando: el humano da el OK escrito en `progress/features/SL-36.md`.

## T9. E2E

- [ ] **T9.1** `e2e/integraciones-por-empresa.spec.ts`, con el doble de design §15, sobre dos empresas.
  - El maestro de A da de alta WhatsApp:
    - un intento rechazado no crea fila;
    - un alta buena muestra el token una vez, y al recargar el token ya no está en el HTML.
  - Prueba y desconecta, viendo antes el aviso de qué deja de funcionar.
  - El admin de A y el maestro de B no ven nada de la integración de A.
  - El superadmin no ve el formulario.
  - Hecho cuando: el E2E pasa en Chromium y en el segundo navegador del proyecto.

## T10. Cierre

- [ ] **T10.1** Quitar D10 de `progress/deudas.md` y actualizar `docs/architecture.md`
  (sección Multi-empresa: excepciones y bóveda).
- [ ] **T10.2** `progress/impl_SL-36.md` con el mapa `R<n> → test` de la tabla de abajo, verificado.

## Trazabilidad R<n> → test

Base real = Postgres de test, sin dobles. Unit = dobles de interfaz.

| R | Test | Tipo |
|---|---|---|
| R1 | `tests/unit/crypto/boveda-integraciones.test.ts` › «forma v<n>:iv12:tag16 y contexto JSON» | unit |
| R2 | `tests/unit/crypto/boveda-integraciones.test.ts` › «dos cifrados difieren y no contienen el texto ni su base64» | unit |
| R3 | `tests/unit/crypto/boveda-integraciones.test.ts` › «alterado, mal formado, versión ausente u otro contexto dan credencial ilegible sin cause» | unit |
| R4 | `tests/unit/config/integraciones-config.test.ts` › «ausente, mal formada o repetida nombran variable y posición; se lee por llamada» | unit |
| R5 | `tests/integration/db/integracion-dos-empresas.test.ts` › «en la base solo hay v<n>: y hex de 64» + `tests/unit/services/integraciones-service.test.ts` › «la vista no lleva secretos, cifrados ni resumen» | base real + unit |
| R6 | `tests/unit/services/integraciones-autorizacion.test.ts` › «admin, mensajero, superadmin y sin sesión: forbidden sin tocar repo ni probador» (las seis operaciones) | unit (service) |
| R7 | `tests/unit/services/integraciones-autorizacion.test.ts` › «la empresa sale del actor aunque la entrada traiga otra» | unit |
| R8 | `tests/integration/db/integracion-dos-empresas.test.ts` › «B no lee, edita, prueba ni borra la de A, por repo y por SQL a mano con RLS» | base real |
| R9 | `tests/unit/services/integraciones-service.test.ts` › «id inválido, inexistente o de otra empresa: mismo no_encontrada» + caso real en `integracion-dos-empresas.test.ts` | unit + base real |
| R10 | `tests/integration/db/integracion-dos-empresas.test.ts` › «dos altas concurrentes del mismo servicio: una sola fila» | base real |
| R11 | `tests/integration/db/integracion-dos-empresas.test.ts` › «número de A rechazado en B como numero_ocupado; liberado al desconectar» | base real |
| R12 | `tests/unit/services/integraciones-service.test.ts` › «alta: prueba antes de escribir; buena crea conectada con datos del proveedor» | unit |
| R13 | `tests/unit/services/integraciones-service.test.ts` › «prueba fallida: nada escrito y texto del catálogo» | unit |
| R14 | `tests/unit/services/integraciones-service.test.ts` › «edición: secreto vacío conserva sin descifrar; prueba solo cuando toca; fallida no cambia nada» | unit |
| R15 | `tests/unit/services/integraciones-service.test.ts` › «probar: buena limpia el error; mala deja error con código y hora» | unit |
| R16 | `tests/integration/db/integracion-prueba-minuto.test.ts` › «la sexta prueba del minuto se rechaza sin llamar al proveedor; otra empresa no cuenta» | base real |
| R17 | `tests/unit/clients/probadores/*.test.ts` › «cada probador llama solo a su operación de lectura» | unit |
| R18 | `tests/unit/services/integraciones-service.test.ts` › «alta y regenerar devuelven el token una vez y guardan solo el resumen» + E2E T9.1 «al recargar no está en el HTML» | unit + E2E |
| R19 | `tests/unit/services/webhook-whatsapp-service.test.ts` › «GET: challenge solo con resumen conocido; 403 si no; anota el último webhook» | unit |
| R20 | `tests/unit/services/webhook-whatsapp-service.test.ts` › «POST: empresa por número, firma con su App Secret, ingesta en su contexto» + `tests/integration/api/webhook-whatsapp.route.test.ts` (actualizado) | unit + base real |
| R21 | `tests/unit/services/webhook-whatsapp-service.test.ts` › «número desconocido o firma inválida: descartado; ninguno válido: 401 sin efectos» | unit |
| R22 | `tests/unit/guards/plataforma-solo-en-lista.guardia.test.ts` (el route ya no llama) + `tests/integration/db/integracion-enrutado.test.ts` › «select solo id y organizacion_id» | guardia + base real |
| R23 | `tests/unit/services/credenciales-integracion-service.test.ts` › «lee la de la empresa en curso; sin contexto falla EmpresaNoResuelta» + tests de cada consumidor de T6 | unit |
| R24 | `tests/unit/services/whatsapp-sin-integracion.test.ts` › «actions, jobs y cron sin integración» | unit |
| R25 | `tests/unit/services/geocodificacion-service.test.ts` › «sin integración y sin caché: fallo marcado, sin red» + `tests/unit/services/asignabilidad-coordenadas.test.ts` (sin cambio, sigue verde) | unit |
| R26 | `tests/unit/services/optimizacion-ruta-degradacion.test.ts` › «sin integración: orden local, sin red, job no muere» | unit |
| R27 | `tests/integration/asistente-route.test.ts` › «sin integración: texto de R27, sin red, sin contar uso» | integración |
| R28 | `tests/unit/clients/whatsapp-app-id.test.ts` › «la caché de A no responde a B» + `tests/unit/services/optimizacion-ruta-token-por-empresa.test.ts` › «el token de A no se usa para B» | unit |
| R29 | `tests/unit/services/credenciales-integracion-service.test.ts` › «ilegible: deja error con código y no llama al proveedor» | unit |
| R30 | `tests/unit/services/credenciales-integracion-service.test.ts` › «marcarRechazo» + un caso por consumidor (Meta 401/190, REQUEST_DENIED, invalid_grant, Anthropic 401) | unit |
| R31 | `tests/components/integraciones/DesconectarDialogo.test.tsx` › «muestra marca y qué deja de funcionar antes de confirmar», contra los literales del design §7 | componente |
| R32 | `tests/integration/db/integracion-dos-empresas.test.ts` › «desconectar borra la fila y sus secretos; el historial sobrevive» | base real |
| R33 | `tests/integration/db/integracion-dos-empresas.test.ts` › «alta, edición, prueba, regenerar y desconectar dejan su fila de historial sin secretos» | base real |
| R34 | `tests/components/integraciones/TarjetaIntegracion.test.tsx` › «estado, marca, error solo en error, hora de prueba y del webhook» | componente |
| R35 | `tests/components/integraciones/TarjetaIntegracion.test.tsx` › «enlace a la guía» + `tests/unit/ayuda/guias-integraciones.test.ts` › «cada guía del catálogo existe en docs/ayuda» | componente + unit |
| R36 | `tests/components/integraciones/FormularioIntegracion.test.tsx` › «secretos password sin valor; tras rechazo solo lo no secreto» | componente |
| R37 | `tests/integration/db/empresas-plataforma-integraciones.test.ts` › «superadmin: solo estado; sin_configurar completado; no superadmin: forbidden» | base real |
| R38 | `tests/unit/crypto/boveda-integraciones.test.ts` › «v1 sigue legible tras activar v2; lo nuevo sale en v2» | unit |
| R39 | `tests/integration/db/recifrado-integraciones.test.ts` › «recifra a la activa en dos empresas; conteo por versión e ilegibles; no imprime valores» | base real |
| R40 | `tests/integration/db/recifrado-integraciones.test.ts` › «--solo-contar no escribe» | base real |
| R41 | `tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts` | guardia |

Flujo crítico E2E (decisión cerrada «E2E»): `e2e/integraciones-por-empresa.spec.ts` (T9.1), que
recorre R6, R12, R13, R18, R32 y R36.

## Archivos esperados

Datos:
- `db/schema.prisma`
- `db/migrations/20261025120000_integracion/migration.sql`
- `db/migrations/20261025120000_integracion/down.sql`
- `db/migrations/20261025120100_historial_accion_integraciones/migration.sql`
- `db/migrations/20261025120100_historial_accion_integraciones/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/types/historial-accion.ts`

Bóveda, config y tipos:
- `lib/crypto/boveda-integraciones.ts`
- `lib/config/integraciones.ts`
- `lib/types/integraciones.ts`

Interfaces:
- `lib/interfaces/external/ICifradorSecretos.ts`
- `lib/interfaces/external/IResumenSecreto.ts`
- `lib/interfaces/external/IFuenteAleatoria.ts`
- `lib/interfaces/external/IProbadorIntegracion.ts`
- `lib/interfaces/repositories/IIntegracionRepository.ts`
- `lib/interfaces/repositories/IIntegracionEnrutadoRepository.ts`
- `lib/interfaces/repositories/IIntegracionPruebaMinutoRepository.ts`
- `lib/interfaces/services/IIntegracionesService.ts`
- `lib/interfaces/services/ICredencialesIntegracion.ts`
- `lib/interfaces/services/IRecifradoIntegracionesService.ts`

Repositorios y services:
- `lib/repositories/IntegracionRepository.ts`
- `lib/repositories/IntegracionEnrutadoRepository.ts`
- `lib/repositories/IntegracionPruebaMinutoRepository.ts`
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `lib/services/EmpresasPlataformaService.ts`
- `lib/services/IntegracionesService.ts`
- `lib/services/CredencialesIntegracionService.ts`
- `lib/services/WebhookWhatsappService.ts`
- `lib/services/RecifradoIntegracionesService.ts`

Probadores:
- `lib/clients/probadores/whatsapp-probador.ts`
- `lib/clients/probadores/google-maps-probador.ts`
- `lib/clients/probadores/optimizacion-rutas-probador.ts`
- `lib/clients/probadores/asistente-probador.ts`
- `lib/clients/probadores/probador-doble.ts`

Comando:
- `scripts/recifrar-integraciones.ts`
- `package.json`

Consumidores de WhatsApp:
- `lib/config/whatsapp.ts`
- `lib/clients/whatsapp-app-id.ts`
- `lib/services/jobs/whatsapp-envio-deps.ts`
- `lib/services/jobs/whatsapp-chat-envio-handler.ts`
- `lib/services/jobs/whatsapp-bienvenida-handler.ts`
- `lib/services/jobs/whatsapp-template-sync-handler.ts`
- `lib/services/jobs/whatsapp-envio-programado-handler.ts`
- `lib/services/jobs/whatsapp-envio-evento-handler.ts`
- `lib/services/jobs/whatsapp-envio-ejecucion-handler.ts`
- `lib/services/jobs/whatsapp-envio-reintento-handler.ts`
- `lib/services/jobs/whatsapp-envio-mantenimiento-handler.ts`
- `lib/services/whatsapp/construir-template-port.ts`
- `lib/services/whatsapp/documento-ejemplo-plantilla.ts`
- `lib/services/PlantillaMensajeService.ts`
- `lib/actions/chat-whatsapp.ts`
- `lib/actions/plantillas.ts`
- `lib/actions/plantillas-sync.ts`
- `lib/actions/envios-whatsapp.ts`
- `app/api/cron/sync-plantillas-whatsapp/route.ts`
- `app/api/chat/media/[mensajeId]/route.ts`
- `app/api/webhooks/whatsapp/route.ts`
- `lib/types/whatsapp-webhook.ts`

Consumidores de Maps:
- `lib/config/geocode.ts`
- `lib/services/GeocodificacionService.ts`
- `lib/services/jobs/geocodificacion-handler.ts`

Consumidores de rutas:
- `lib/config/route-optimization.ts`
- `lib/auth/google-sa-token.ts`
- `lib/auth/google-token-shared.ts`
- `lib/auth/google-wif-token.ts`
- `lib/auth/google-adc-token.ts`
- `lib/services/jobs/optimizacion-ruta-handler.ts`

Consumidores del asistente:
- `lib/config/asistente.ts`
- `app/api/asistente/route.ts`

Consumidores transversales:
- `app/api/cron/procesar-jobs/route.ts`
- `e2e/_escenarios/crons.ts`
- `.env.example`
- `README.md`
- `playwright.config.ts`

Pantalla y menú:
- `lib/actions/integraciones.ts`
- `lib/auth/menu-visibility.ts`
- `app/(app)/configuracion/integraciones/page.tsx`
- `app/(app)/configuracion/integraciones/_components/`

Guías:
- `docs/ayuda/oficina/configuracion-integraciones.md`
- `docs/ayuda/oficina/integracion-whatsapp.md`
- `docs/ayuda/oficina/integracion-google-maps.md`
- `docs/ayuda/oficina/integracion-optimizacion-rutas.md`
- `docs/ayuda/oficina/integracion-asistente.md`

Tests nuevos:
- `tests/unit/crypto/boveda-integraciones.test.ts`
- `tests/unit/config/integraciones-config.test.ts`
- `tests/unit/services/integraciones-autorizacion.test.ts`
- `tests/unit/services/integraciones-service.test.ts`
- `tests/unit/services/credenciales-integracion-service.test.ts`
- `tests/unit/services/webhook-whatsapp-service.test.ts`
- `tests/unit/services/whatsapp-sin-integracion.test.ts`
- `tests/unit/services/optimizacion-ruta-token-por-empresa.test.ts`
- `tests/unit/clients/probadores/`
- `tests/unit/ayuda/guias-integraciones.test.ts`
- `tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts`
- `tests/integration/db/integracion-migracion.test.ts`
- `tests/integration/db/integracion-dos-empresas.test.ts`
- `tests/integration/db/integracion-prueba-minuto.test.ts`
- `tests/integration/db/integracion-enrutado.test.ts`
- `tests/integration/db/empresas-plataforma-integraciones.test.ts`
- `tests/integration/db/recifrado-integraciones.test.ts`
- `tests/components/integraciones/`
- `e2e/integraciones-por-empresa.spec.ts`

Tests existentes que cambian:
- `tests/unit/config/whatsapp-webhook-config.test.ts`
- `tests/unit/config/geocode-config.test.ts`
- `tests/unit/config/geocode-salud-config.test.ts`
- `tests/unit/config/route-optimization-config.test.ts`
- `tests/unit/clients/whatsapp-app-id.test.ts`
- `tests/unit/clients/google-routes.test.ts`
- `tests/unit/clients/fallback-route-optimization.test.ts`
- `tests/unit/auth/google-sa-token.test.ts`
- `tests/unit/auth/google-wif-token.test.ts`
- `tests/unit/auth/google-adc-token.test.ts`
- `tests/unit/auth/google-token-selector.test.ts`
- `tests/unit/asistente/sin-credencial.test.ts`
- `tests/unit/api/procesar-jobs-registro.test.ts`
- `tests/unit/api/webhook-whatsapp-por-empresa.test.ts`
- `tests/unit/api/webhook-whatsapp-entregas.test.ts`
- `tests/unit/types/whatsapp-webhook.test.ts`
- `tests/unit/services/ejecucion-envio-service.test.ts`
- `tests/unit/services/geocodificacion-service.test.ts`
- `tests/unit/services/geocodificacion-marcador-contrato.test.ts`
- `tests/unit/services/optimizacion-ruta-origen.test.ts`
- `tests/unit/services/optimizacion-ruta-degradacion.test.ts`
- `tests/unit/services/optimizacion-ruta-tramo-vivo.test.ts`
- `tests/unit/services/optimizacion-ruta-trazado.test.ts`
- `tests/unit/services/optimizacion-ruta-service.test.ts`
- `tests/unit/services/plantilla-enviar-aprobacion-sin-app-id.test.ts`
- `tests/components/PlantillasInforme.test.tsx`
- `tests/integration/api/webhook-whatsapp.route.test.ts`
- `tests/integration/api/procesar-jobs-geocodificacion.test.ts`
- `tests/integration/api/procesar-jobs-whatsapp-bienvenida.test.ts`
- `tests/integration/api/procesar-jobs-whatsapp-chat-envio.test.ts`
- `tests/integration/api/chat-media-proxy.route.test.ts`
- `tests/integration/asistente-route.test.ts`

Cierre:
- `progress/deudas.md`
- `docs/architecture.md`
- `progress/impl_SL-36.md`
