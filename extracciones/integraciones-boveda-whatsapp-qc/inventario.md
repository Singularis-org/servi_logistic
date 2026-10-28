# Inventario — integraciones-boveda-whatsapp-qc

- **Módulo:** bóveda de secretos de integraciones + conexión de WhatsApp por empresa, de QuimiCloude.
- **Cómo se resolvió el argumento:** el leader fijó la frontera a mano: 52 archivos confirmados (`scratchpad/lista.txt`). No se usó ninguno de los tres modos del Paso 1.
- **Origen:** repo QuimiCloude, rama `origin/dev`, **SHA `f786d72`**. Es otro repo, no este. Se leyó solo la exportación de solo lectura `…/scratchpad/qc-f786d72/`.
- **Destino:** SL-36 en Servi Logistic, el módulo de integraciones por empresa (tabla `organizacion`). El destino adapta, no copia.
- **Naturaleza:** `datos`, así que el eje 13 aplica.
- **Fecha:** 2026-10-24.
- **Fuera de la frontera, por decisión del humano:**
  - la mensajería de WhatsApp: plantillas, contactos, envío, webhook, cron, inbox y outbox;
  - la configuración del proveedor de IA;
  - `components/ui/*`.
- **Citas:** las rutas son relativas a la raíz de la exportación. `db/schema.prisma` se leyó solo en los modelos `Permission`/`RolePermission` (48-75), `Company`/`Addon`/`CompanyAddonOverride` (150-205), `WhatsappConnection` y sus enums (1194-1239) y `AiProviderConnection` (1510-1529).
- **Sin specs:** la exportación no trae `specs/` de QuimiCloude.
  - La única justificación escrita son los comentarios del código y de las migraciones.
  - Los tests citan `R<n>` y `D10` de specs que no se pudieron leer.
- **`docs/architecture.md`:** se leyó el de Servi Logistic (destino), solo para comparar.
- **MCP:** no se usó el grafo, porque el código no es de este repo. Todo salió de Read/Grep sobre la exportación.

## Archivos del cierre

| Archivo | Rol |
|---|---|
| `lib/modules/integraciones/domain/connection-secrets.ts` | Campos secretos de la conexión, contexto de cifrado, leer/descifrar; un secreto ilegible deja la conexión en ERROR |
| `lib/modules/integraciones/domain/stored-secret.ts` | Forma pura del valor guardado `v<n>:<iv>:<tag>:<ct>` y validación base64 estricta |
| `lib/modules/integraciones/domain/secret-context.ts` | Contexto `{companyId, recordId, field}` y su codificación canónica (AAD) |
| `lib/modules/integraciones/domain/connection-status.ts` | Parches de estado tras una prueba buena o fallida |
| `lib/modules/integraciones/domain/integraciones-scope.ts` | Ámbito de empresa, derivado del actor |
| `lib/modules/integraciones/domain/actor.ts` | Actor y guardas de permiso (configurar, enviar, vincular) |
| `lib/modules/integraciones/domain/errors.ts` | Jerarquía de errores con código del catálogo y diagnóstico solo para log |
| `lib/modules/integraciones/ports/secret-cipher.ts` | Puerto cifrar/descifrar (asíncrono) |
| `lib/modules/integraciones/ports/secret-digest.ts` | Puerto resumen/comparación de secretos de alta entropía |
| `lib/modules/integraciones/ports/random-source.ts` | Puerto de ids y verify tokens |
| `lib/modules/integraciones/adapters/driven/security/secret-cipher-aes-gcm.ts` | Cifrador AES-256-GCM con AAD y anillo de claves versionado |
| `lib/modules/integraciones/adapters/driven/security/secret-digest-sha256.ts` | SHA-256 hex y comparación en tiempo constante |
| `lib/modules/integraciones/adapters/driven/security/random-source-node.ts` | UUID y verify token de 32 bytes base64url |
| `lib/modules/integraciones/adapters/driven/config/encryption-keys-env.ts` | Lectura y validación del anillo de claves y la versión activa desde el entorno |
| `lib/modules/integraciones/adapters/driven/persistence/company-scope.ts` | Única definición del `where` «de la empresa» para las tablas del módulo |
| `lib/modules/integraciones/domain/whatsapp-connection.ts` | Estados, orígenes, Record (con cifrados) y View (sin secretos) |
| `lib/modules/integraciones/domain/whatsapp-connection-input.ts` | Esquemas de alta y edición, límites y forma del id |
| `lib/modules/integraciones/domain/create-whatsapp-connection.ts` | Caso de uso: alta con prueba previa, cifrado e importación de plantillas que no deshace el alta |
| `lib/modules/integraciones/domain/update-whatsapp-connection.ts` | Caso de uso: edición; prueba solo si cambian secretos o teléfono; si falla, no se escribe nada |
| `lib/modules/integraciones/domain/get-whatsapp-connection.ts` | Caso de uso: leer la conexión viva de la empresa |
| `lib/modules/integraciones/domain/test-whatsapp-connection.ts` | Caso de uso: probar la conexión guardada y escribir el resultado |
| `lib/modules/integraciones/domain/set-whatsapp-connection-enabled.ts` | Caso de uso: deshabilitar, o habilitar solo con una prueba buena |
| `lib/modules/integraciones/domain/regenerate-whatsapp-verify-token.ts` | Caso de uso: nuevo verify token; se guarda solo su resumen |
| `lib/modules/integraciones/ports/whatsapp-connection-repository.ts` | Puerto de persistencia (filas vivas por empresa, parche, handshake) |
| `lib/modules/integraciones/ports/whatsapp-graph-client.ts` | Puerto Graph: un fallo es un resultado, no una excepción |
| `lib/modules/integraciones/adapters/driven/persistence/whatsapp-connection-prisma.ts` | Adaptador Prisma y traducción de violaciones de unicidad |
| `lib/modules/integraciones/adapters/driven/graph/whatsapp-graph-client-fetch.ts` | Adaptador `fetch` a Meta Graph (timeout, token en cabecera) |
| `lib/modules/integraciones/adapters/driving/whatsapp-connection-actions.ts` | Server Actions: actor, FormData, estados de salida, traducción de errores |
| `app/(private)/integraciones/whatsapp/page.tsx` | Página servidor: guarda de permiso; alta, o tarjeta + webhook + acciones |
| `app/(private)/integraciones/whatsapp/components/whatsapp-connection-card.tsx` | Tarjeta de estado; hora en el huso del navegador |
| `app/(private)/integraciones/whatsapp/components/whatsapp-connection-form.tsx` | Formulario de alta y edición; los secretos nunca se precargan |
| `app/(private)/integraciones/whatsapp/components/whatsapp-status-badge.tsx` | Etiqueta y variante por estado |
| `app/(private)/integraciones/whatsapp/components/whatsapp-connection-actions.tsx` | Botones Editar/Probar/Deshabilitar/Habilitar/Regenerar con confirmaciones |
| `lib/modules/integraciones/domain/test-ai-provider-key.ts` | (de reojo) Segundo ejemplo de «probar la clave» antes de guardar |
| `lib/modules/integraciones/domain/resolve-ai-provider-for-reading.ts` | (de reojo) Segundo ejemplo de «leer el secreto para usarlo», sin actor |
| `db/migrations/20261008120843_integrations_permission/migration.sql` | Migración de datos: permiso `integraciones.modificar` al rol Administrador |
| `db/migrations/20261009130000_whatsapp_connections/migration.sql` | Tabla, enums, únicos parciales, FK a mano, RLS forzada |
| `db/migrations/20261019120000_whatsapp_connections_drop_meta_app_id/migration.sql` | Correctiva: deshace la edición en sitio de la migración anterior |
| `db/schema.prisma` | Modelos citados arriba |
| `tests/unit/integraciones/secret-cipher-aes-gcm.test.ts` | Cifrador: ida y vuelta, forma, alteración, contexto, versiones, fugas |
| `tests/unit/integraciones/secret-digest-sha256.test.ts` | Resumen: vector conocido, comparación en tiempo constante |
| `tests/unit/integraciones/stored-secret.test.ts` | Forma pura, contexto sin ambigüedad, errores del contrato |
| `tests/unit/integraciones/encryption-keys-env.test.ts` | Variables del anillo, sin fugas, lectura por llamada, fachada cerrada |
| `tests/unit/integraciones/whatsapp/create-whatsapp-connection.test.ts` | Alta: orden prueba→escritura, cifrado por contexto, saneado, plantillas |
| `tests/unit/integraciones/whatsapp/update-whatsapp-connection.test.ts` | Edición: not found, conservar secretos, prueba condicional, estado |
| `tests/unit/integraciones/whatsapp/whatsapp-connection-actions.test.ts` | Borde: estados de salida, nada de secretos, revalidación, errores |
| `tests/unit/integraciones-ui/whatsapp-connection-card.test.tsx` | Tarjeta: etiquetas, último error solo en ERROR, marca de vacío |
| `tests/unit/integraciones-ui/whatsapp-connection-form.test.tsx` | Formulario y acciones: campos, fallo, revelado único, talla táctil |
| `tests/integration/integraciones/whatsapp-connection-prisma.int.test.ts` | Repositorio contra Postgres real: ámbito, unicidades, concurrencia, cifrado en base |
| `tests/integration/integraciones/whatsapp-connection-migration.int.test.ts` | Migración: RLS, índices parciales, DOWN e ida-vuelta-ida |
| `e2e/integraciones.spec.ts` | Menú y rutas: 200 a quien tiene el permiso y 404 indistinguible a quien no |
| `e2e/integraciones-whatsapp.spec.ts` | Recorrido real: alta fallida, alta buena, recarga sin token, edición, deshabilitar/habilitar |

## Contrato público y consumidores

Esto es lo que el cierre expone o lo que otros consumen. Los importadores no entran al módulo.

- **Fachada `integraciones` de `@/lib/composition`.** Su lista de claves está cerrada por test (`tests/unit/integraciones/encryption-keys-env.test.ts:260-305`).
  - Las de este módulo: `createWhatsappConnection`, `getWhatsappConnection`, `updateWhatsappConnection`, `testWhatsappConnection`, `setWhatsappConnectionEnabled`, `regenerateWhatsappVerifyToken`, `whatsappWebhookUrl`, `secretCipher` y `secretDigest`.
  - Las demás son de la mensajería y de IA, fuera de la frontera.
  - `secretCipher` es el mismo objeto que `secretCipherAesGcm` (`…test.ts:306-307`).
- **`SecretCipher` también lo consume la IA:** `resolve-ai-provider-for-reading.ts:8`. La bóveda es compartida por todas las integraciones del módulo.
- **`company-scope.ts:19-39`** da el ámbito también a `WhatsappContact`, `WhatsappMessage`, `WhatsappTemplate`, `WhatsappVariableKey` y `WhatsappTemplateVariable`, que están fuera de la frontera.
- **Para la mensajería** quedan `recordWebhookHandshake` (`ports/whatsapp-connection-repository.ts:55-59`) y `decryptStoredSecret`/`readStoredSecret` (`connection-secrets.ts:24-57`).
  - No verificado: que el webhook y el envío los usen; no se leyeron sus importadores.
- **`actor.ts:14,27-45`** exporta `WHATSAPP_SEND_PERMISSION`, `requireSendPermission`, `requireCustomerLinkPermission` y `hasConfigurePermission`.
  - Los consumidores son de la mensajería o de la UI y no se leyeron.
- **Importaciones del cierre hacia fuera.** No se persiguieron.
  - `domain/graph-failure` (`metaMessageOf`, `GraphFailure`, `HIDDEN_SECRET_MARK`, `GRAPH_UNREACHABLE_MESSAGE`): `create-whatsapp-connection.ts:4`, `ports/whatsapp-graph-client.ts:1`.
  - `domain/sync-whatsapp-templates`, `domain/whatsapp-template` y `ports/whatsapp-template-repository`: `create-whatsapp-connection.ts:6,9,16`.
  - `adapters/driven/config/whatsapp-config-env` (`readGraphApiVersion`): `whatsapp-graph-client-fetch.ts:3`.
  - Los componentes `WhatsappIntegrationTabs`, `WhatsappSetupGuide`, `WhatsappWebhookPanel` y `useRevealWhatsappVerifyToken`: `page.tsx:13-20`, `whatsapp-connection-form.tsx:18`.
  - Las acciones de plantillas y del diccionario: `page.tsx:9-10`.

## Ejes

| # | Eje | Estado | Evidencia (archivo:linea o spec §) | Nota |
|---|---|---|---|---|
| 1 | Propósito y actor | RESUELTO | `page.tsx:31`; `create-whatsapp-connection.ts:48-113`; `e2e/integraciones-whatsapp.spec.ts:173-350` | Quien lo usa es un usuario con `integraciones.modificar` de una empresa. Conecta **una** cuenta de WhatsApp Business (Meta Cloud API) y guarda sus credenciales cifradas. Camino feliz: rellena 5 campos; se prueba contra Graph **antes** de escribir; nace en `PENDING`; ve una sola vez el verify token y la URL del webhook. El núcleo reusable para SL-36 es la bóveda (cifrar con contexto, anillo versionado) más «una conexión por empresa con estado y prueba» |
| 2 | Forma de la entrada primaria | IMPLICITA | `whatsapp-connection-input.ts:17-32`; `whatsapp-connection.ts:4`; `migration 20261009130000:7,15`; `create-whatsapp-connection.ts:87` | **Elegido:** formulario manual de 5 campos (nombre visible, WABA ID, Phone Number ID, Access Token, App Secret), siempre `origin: 'MANUAL'`. **Alternativa:** el valor `EMBEDDED_SIGNUP` existe en el enum y en la tabla, sin flujo; es el alta guiada de Meta. Con ella el usuario no copia tokens a mano, pero exige una app de Meta revisada y una ruta de retorno. Nada dice por qué se eligió el manual. **RESUELTO dentro del eje:** los IDs de Meta no llevan regla de dígitos «porque la prueba contra Graph lo detecta» (`whatsapp-connection-input.ts:7`). Para SL-36, Maps y el asistente piden una sola clave: la forma cambia por proveedor |
| 3 | Camino de recuperación y quién lo ejecuta | RESUELTO | `connection-secrets.ts:13-14,35-56`; `errors.ts:18-21`; `regenerate-whatsapp-verify-token.ts:26-43`; `secret-cipher-aes-gcm.test.ts:222-239` | Lo ejecuta el mismo usuario con permiso de la empresa, no la plataforma. **Secreto ilegible:** un solo error, con la acción «vuelve a escribir el secreto». La conexión pasa a `ERROR` con ese texto, salvo si está `DISABLED`. **Verify token perdido:** se regenera; el anterior deja de valer (`whatsapp-connection-actions.tsx:50-55`). **Clave maestra rotada:** los valores viejos siguen legibles con su versión (R9). **De reojo:** la IA no lanza ante un secreto ilegible; devuelve `{status:'unreadable'}` (`resolve-ai-provider-for-reading.ts:56-62`). Son dos políticas distintas en el mismo módulo, cada una justificada en su sitio |
| 4 | Quién obtiene acceso | IMPLICITA | `migration 20261008120843:6-14`; `actor.ts:13`; `e2e/integraciones.spec.ts:197-207` | **Elegido:** un solo permiso, `integraciones.modificar`, «Ver y configurar las integraciones con servicios externos». Abre WhatsApp, IA e inventarios (`e2e/integraciones.spec.ts:67-90`), y se siembra solo al rol `Administrador`. **Alternativa:** un permiso por integración (p. ej. configurar mapas aparte de WhatsApp). **Consecuencia:** hoy, quien puede configurar el asistente puede también cambiar el token de WhatsApp. Nadie escribió por qué es uno solo |
| 5 | Estado y duración de la sesión | NO APLICA | `whatsapp-connection-actions.ts:62-72` | El módulo no gestiona sesión. Lee usuario y empresa de `identity` en cada acción; sin sesión, el actor es `null` y el caso de uso rechaza |
| 6 | Autorización y roles | RESUELTO | `actor.ts:16-25,47-55`; `integraciones-scope.ts:3-8`; `page.tsx:31`; `whatsapp-connection-actions.test.ts:390-404`; `e2e/integraciones.spec.ts:92,255-293` | **En el dominio:** `requirePermission` es la **primera línea** de cada caso de uso. Rechaza también al actor sin empresa. La empresa sale del actor, nunca de la entrada. **En el borde:** no decide; un test lo verifica sobre el texto fuente. **En la página:** sin permiso responde 404, indistinguible de una ruta que no existe, y no menciona «permiso», «rol» ni «autoriz». `hasConfigurePermission` no lanza: solo decide qué se muestra. **Propio de QC:** `assertPermission` y `assertAddon` de `identity` (`actor.ts:2`). En el destino la empresa es `organizacion_id`, resuelta por `conEmpresa`/RLS (`docs/architecture.md:54-65`) |
| 7 | Política de fallo hacia el usuario | IMPLICITA | `create-whatsapp-connection.ts:65-70`; `update-whatsapp-connection.ts:75-79`; `test-whatsapp-connection.ts:63-70`; `whatsapp-connection-form.tsx:53,229-230`; `errors.ts:6,46,63`; `whatsapp-connection-actions.test.ts:352-388`; `create-whatsapp-connection.test.ts:115-131` | **RESUELTO dentro del eje.** «No existe», «borrada» y «de otra empresa» dan el mismo error. El número ocupado no nombra a la empresa dueña. El diagnóstico va solo al log; un error ajeno sale como `unexpected` con referencia. Los secretos escritos se tapan con `HIDDEN_SECRET_MARK` en el mensaje. **IMPLICITA (a):** al usuario se le muestra el **texto literal de Meta**, en inglés y técnico, con el prefijo «Meta rechazó la prueba: ». Además se **persiste** en `last_error`. Alternativa: traducirlo a un texto propio del catálogo. Consecuencia: detalles internos de Meta llegan a la pantalla y a la base. **IMPLICITA (b):** «Probar conexión» no tiene límite de intentos. Alternativa: limitar por minuto. Consecuencia: un usuario puede agotar la cuota de Graph de la empresa. **IMPLICITA (c):** no queda registrado **quién** probó o cambió una credencial; solo `created_by`. Alternativa: un `updated_by` o un evento, que la IA sí tiene (`schema.prisma:1521`). Consecuencia: no se puede saber quién reemplazó el token |
| 8 | Mapa de capas y flujo de datos | RESUELTO | `whatsapp-connection-actions.ts:3-9,62-72,110-254`; `create-whatsapp-connection.ts:43-114`; `ports/*`; `adapters/driven/*` | **Flujo:** `page.tsx` (Server Component) → Server Action (adaptador *driving*) → fachada `integraciones` del composition root → caso de uso (fábrica `createX(deps)`) → puertos (repo, graph, cipher, digest, random) → adaptadores *driven* (Prisma, `fetch`, AES-GCM, SHA-256, `node:crypto`, `process.env`). El borde «no decide nada» (`actions.ts:3-6`). Es hexagonal; el destino usa Controller → Service → Repository con interfaces (`docs/architecture.md:99-131`), así que el puerto pasa a `lib/interfaces/`, el caso de uso a un service y el adaptador a un repository |
| 9 | Contrato congelado | RESUELTO | `whatsapp-connection.ts:1-55`; `secret-context.ts:1-21`; `stored-secret.ts:1-33`; `ports/secret-cipher.ts:3-7`; `ports/secret-digest.ts:1-5`; `ports/random-source.ts:1-4`; `ports/whatsapp-connection-repository.ts:9-60`; `whatsapp-connection-input.ts:3-4`; `secret-cipher-aes-gcm.ts:14-17`; `encryption-keys-env.ts:9-11`; `random-source-node.ts:5`; `whatsapp-connection-actions.ts:24-58`; `encryption-keys-env.test.ts:260-305` | **Para transcribir literal en la §6:** `SecretContext`; la etiqueta `'integraciones.secret'`; la codificación JSON `[label, version, companyId, recordId, field]`; el formato `v<n>:<iv>:<tag>:<ct>` con base64 estándar, IV 12, tag 16 y clave 32 bytes. **Puertos:** `SecretCipher` es asíncrono «para que la firma no cambie si la clave sale a un KMS» (`secret-cipher.ts:3`); también `SecretDigest` y `RandomSource`. **Variables:** `INTEGRATIONS_ENCRYPTION_KEYS` (`v1:<b64>,v2:<b64>`) e `INTEGRATIONS_ENCRYPTION_ACTIVE`. **Tipos de dominio:** estados, orígenes, `Record`/`View`, el `Patch` del repositorio, los estados de formulario y los límites 80/1024. **Códigos de error:** `errors.ts`. La fachada está cerrada por test |
| 10 | Puntos de costura y stubs | RESUELTO | `ports/secret-cipher.ts:3`; `create-whatsapp-connection.ts:25,46`; `e2e/integraciones-whatsapp.spec.ts:6-7,27-32`; `whatsapp-connection-prisma.int.test.ts:17`; `whatsapp-connection.ts:4` | **Costura KMS:** puerto asíncrono. **`now?`** es inyectable en cada caso de uso. **Doble de Graph** (`whatsapp-graph-client-canned`): lo cablea una variable en `playwright.config.ts` y un prefijo de token marcado hace fallar la prueba. **Stub sin firma:** `EMBEDDED_SIGNUP`, tratado en el eje 2. No verificado: el nombre de la variable que activa el doble, porque `playwright.config.ts` no está en la lista |
| 11 | Invariantes y validación | RESUELTO | ver detalle abajo | Todas tienen comentario o test que dice el porqué. Las consecuencias de romperlas están en **«Invariantes»** abajo |
| 12 | Máquina de estados y forma serializada | RESUELTO | `whatsapp-connection.ts:1`; `connection-status.ts:6-32`; `create-whatsapp-connection.ts:96`; `update-whatsapp-connection.ts:76,85`; `test-whatsapp-connection.ts:42,53-70`; `set-whatsapp-connection-enabled.ts:62-81`; `connection-secrets.ts:48-54`; `whatsapp-connection-prisma.ts:180-197`; `whatsapp-connection-card.tsx:48`; `whatsapp-connection-actions.tsx:149,174-212` | Ver **«Máquina de estados»** abajo. La forma serializada es texto en mayúsculas `PENDING`/`ACTIVE`/`ERROR`/`DISABLED`, como enum de Postgres y unión TS. **Ausente a propósito:** no hay estado «borrada» en la UI; lo borrado es invisible y da not found (`ports/…repository.ts:42-45`) |
| 13 | Datos persistidos | IMPLICITA | `migration 20261009130000:1-59`; `schema.prisma:1194-1239,1510-1529`; `whatsapp-connection-migration.int.test.ts:217-247`; `migration 20261019120000:1-11` | **RESUELTO dentro del eje (con porqué escrito):** `id` UUID sin default, porque el cifrado necesita el id antes del INSERT (`:10`). Único parcial `(company_id) WHERE deleted_at IS NULL`, para una conexión viva incluso con dos altas concurrentes (`:39-41`). Único parcial `(phone_number_id) WHERE deleted_at IS NULL` **entre empresas**, porque un webhook se resuelve a una sola empresa (`:43-46`). Clave candidata `(company_id,id)` como destino de FK compuestas (`:36-37`). FK escritas a mano, drift a propósito (`schema.prisma:1210-1212`). Enums de Postgres. IDs de Meta como `text` sin límite. Ninguna columna de versión de clave, porque va dentro del valor. `timestamptz(6)`. Borrado lógico con `deleted_at`. RLS `ENABLE`+`FORCE` **sin policies** (`:57-59`). Identificadores en inglés. **IMPLICITA (a):** una **tabla por proveedor**, con forma distinta para WhatsApp e IA: la de IA tiene único **total** por empresa y sin `deleted_at`, frente al parcial con borrado lógico de WhatsApp (`schema.prisma:1512` frente a `migration:39-41`). Alternativa: una tabla genérica `integracion(organizacion_id, proveedor, secreto_cifrado, estado, …)`. Consecuencia: con tablas por proveedor, cada integración nueva es una migración y su propio código; con la genérica, los campos propios de cada proveedor (WABA, teléfono, modelo) acaban en JSON sin esquema. Nadie escribió por qué una ni por qué difieren. **IMPLICITA (b):** borrado lógico con únicos parciales frente a borrado físico. Consecuencia: los parciales no los declara el ORM y son lo primero que se pierde al portar. **Deuda anotada:** la migración se editó en sitio y obligó a la correctiva `20261019120000` (`:3-6`). **No verificado:** `templates_synced_at` está en el esquema (`:1230`) y no en la migración leída; la añade otra fuera de la lista. **No verificado:** con `FORCE` y sin policies, la app de QC tiene que conectar con un rol `BYPASSRLS`. El destino usa el rol `servi_app` con la policy `<t>_por_empresa` (`docs/architecture.md:63-65`), así que allí la tabla **necesita** policy |
| 14 | Acoplado al framework | RESUELTO | `whatsapp-connection-actions.ts:1,8-9,12,105-107`; `whatsapp-connection-form.tsx:93-94,109-110,138`; `whatsapp-connection-actions.tsx:83-131`; `whatsapp-connection-card.tsx:24-28,39`; `page.tsx:22-24,30-31` | Equivalentes en otro stack en **«Framework»** abajo |
| 15 | Acoplado a librerías | IMPLICITA | `secret-cipher-aes-gcm.ts:1,14-17,72`; `secret-digest-sha256.ts:1,11`; `whatsapp-connection-input.ts:1`; `whatsapp-graph-client-fetch.ts:1,21,106-112`; `whatsapp-connection-prisma.ts:59-94`; `whatsapp-status-badge.tsx:1` | **RESUELTO dentro del eje:** qué aporta cada librería y qué requisito sobrevive, en **«Librerías»** abajo. **IMPLICITA:** el cifrado es **en la aplicación**, con el anillo de claves en variables de entorno. Alternativa: el gestor de secretos de la base (p. ej. Supabase Vault, que el destino ya tiene) o un KMS. Consecuencia: con cifrado en la app, una copia de la base sin las variables es ilegible, pero la rotación y la custodia de la clave son manuales. Con Vault, la base guarda la clave y un acceso total a la base lo descifra todo. El puerto deja abierta la puerta a un KMS (`secret-cipher.ts:3`), pero no escribe por qué no se empezó por él |
| 16 | Acoplado al proyecto | RESUELTO | ver **«Parámetros a reemplazar»** abajo | Es la tabla de parámetros; no hay nada que decidir. La separación entre lo propio de QuimiCloude y el núcleo va abajo |
| 17 | Núcleo invariante | RESUELTO | ver **«Núcleo invariante»** abajo | Candidatos a EARS con su `R<n>` original. Los números son de specs de QC que no se leyeron |
| 18 | Lo que el módulo NO hace | HUECO | `encryption-keys-env.test.ts:264-305`; `whatsapp-connection-prisma.int.test.ts:233,292,334`; `migration 20261009130000:31,40-46`; `update-whatsapp-connection.ts:60-63` | **Deliberado (frontera humana):** mensajería, plantillas, webhook, cron, inbox/outbox y configuración de IA. **Stub:** `EMBEDDED_SIGNUP`. **HUECO 1:** no existe caso de uso para **borrar o desconectar**. La tabla tiene `deleted_at` y los parciales cuentan con él, pero la fachada no tiene `delete…`/`disconnect…` para WhatsApp (la IA sí tiene `disconnectAiProvider`), y los tests borran escribiendo `deletedAt` a mano. No se sabe si es deliberado, otra feature o deuda. **HUECO 2:** nada **vuelve a cifrar** con la versión activa. Una clave vieja no se puede retirar mientras quede una fila cifrada con ella, y nadie escribió quién ni cuándo la retira. **Deuda (no juzgada):** el WABA ID nunca se comprueba contra Graph. La prueba solo pide el teléfono (`whatsapp-graph-client-fetch.ts:125-132`) y la edición no prueba si solo cambia el WABA (`update-whatsapp-connection.ts:60-63`). Un WABA equivocado solo aflora como fallo de importación de plantillas, que va al log (`whatsapp-connection-actions.ts:138-143`) |
| 19 | Provisionalidad | RESUELTO | `whatsapp-connection-form.tsx:32-54`; `whatsapp-connection-actions.tsx:35-55`; `whatsapp-status-badge.tsx:6-11`; `whatsapp-connection-card.tsx:17-22`; `e2e/integraciones-whatsapp.spec.ts:22-24,230`; `whatsapp-connection-form.test.tsx:161-167` | Ningún copy está marcado como provisional. Todos son constantes exportadas, y el E2E afirma sobre ellas (`WHATSAPP_STATUS_LABELS`, `WHATSAPP_TABS_TEXTS`). Los errores salen de `errorMessage(code)`, y el test compara contra esa función. **Excepción a propósito:** el test del formulario fija las etiquetas **literales** como contrato. La técnica transferible: copys en constantes, tests contra la constante y el literal solo cuando es contrato |
| 20 | Tests como criterio de aceptación | RESUELTO | ver **«Tests»** abajo | Hay E2E del recorrido principal. **No verificado:** si existen tests unitarios de `test-whatsapp-connection`, `set-whatsapp-connection-enabled`, `regenerate-whatsapp-verify-token`, `get-whatsapp-connection`, del adaptador `fetch` de Graph y de `recordWhatsappWebhookHandshake`. No están en la lista y el doble `whatsapp-doubles` tampoco |
| 21 | Dependencias asumidas ya montadas | RESUELTO | ver **«Dependencias asumidas»** abajo | — |

### Invariantes (eje 11): cada una con la consecuencia de romperla

1. **El cifrado va ligado a `(versión, empresa, registro, campo)` como datos autenticados.**
   - Evidencia: `secret-context.ts:9-21`, `secret-cipher-aes-gcm.ts:20-22,34,64`; tests R5 y R6 en `secret-cipher-aes-gcm.test.ts:154-177`.
   - Si se rompe, un valor cifrado copiado a otra fila u otra empresa se descifra: un atacante con escritura en la base mueve el token de la empresa A a la B.
2. **La codificación del contexto es JSON, no una unión con `:`.**
   - Evidencia: `secret-context.ts:9-12`; R6 en `stored-secret.test.ts:84-105`.
   - Si se rompe, `('a:b','c')` y `('a','b:c')` dan el mismo AAD y un contexto descifra el valor del otro.
3. **El id de la fila existe antes de cifrar.**
   - Evidencia: `create-whatsapp-connection.ts:72-82`; `migration 20261009130000:10`; R9 en `create-whatsapp-connection.test.ts:86-102`.
   - Si la base genera el id, no hay `recordId` con qué cifrar, o hay que escribir dos veces con un secreto en claro en medio.
4. **A la base solo llegan valores cifrados con prefijo `v<n>:` y el resumen hex del verify token.**
   - Evidencia: R9 de integración en `whatsapp-connection-prisma.int.test.ts:353-414`.
   - Si se rompe, una copia de seguridad o un `SELECT` filtra credenciales de Meta.
5. **El verify token en claro solo viaja en la respuesta de `created` y `regenerated`; después solo queda su resumen.**
   - Evidencia: `create-whatsapp-connection.ts:33`, `whatsapp-connection-actions.ts:6`; R14/R15 en `whatsapp-connection-actions.test.ts:291-298`; R16 en `e2e/integraciones-whatsapp.spec.ts:271-283`.
   - Si se rompe, el token queda en el HTML servido o en la caché y cualquiera falsifica la suscripción del webhook.
6. **La vista se construye campo a campo, sin spread.**
   - Evidencia: `whatsapp-connection.ts:41-55`; R10 en `whatsapp-connection-actions.test.ts:300-311`.
   - Si se rompe, un campo nuevo de la fila (un cifrado) llega a la UI sin que nadie lo decida.
7. **La empresa la pone el adaptador desde el ámbito, nunca desde la fila.**
   - Evidencia: `ports/whatsapp-connection-repository.ts:8`, `whatsapp-connection-prisma.ts:125`, `company-scope.ts:5-11`; R2 en `whatsapp-connection-prisma.int.test.ts:176-188`.
   - Si se rompe, una entrada manipulada crea la conexión en otra empresa.
8. **Toda lectura y escritura filtra por empresa y `deleted_at IS NULL` en el `where`, no en un `if`.**
   - Evidencia: `whatsapp-connection-prisma.ts:100,112,149-158`; R3 en `whatsapp-connection-prisma.int.test.ts:206-262`.
   - Si se rompe, la empresa B lee o edita la conexión de A, y además puede distinguir «existe en otra empresa» de «no existe».
9. **Una conexión viva por empresa y un `phone_number_id` vivo en todo el sistema.**
   - Evidencia: `migration 20261009130000:39-46`; R6/R7 en `whatsapp-connection-prisma.int.test.ts:264-351`, incluida la concurrencia.
   - Si se rompe, dos altas concurrentes dejan dos conexiones, o un webhook de Meta no sabe a qué empresa pertenece.
10. **Una edición cuya prueba falla no escribe nada.** Tampoco con un secreto ilegible.
    - Evidencia: `update-whatsapp-connection.ts:67,76`; R26 y R13/D10 en `update-whatsapp-connection.test.ts:173-194,214-223`.
    - Si se rompe, un token mal pegado deja sin servicio una conexión que funcionaba.
11. **Habilitar exige una prueba buena, y una conexión deshabilitada sigue `DISABLED` tras editar o tras leer un secreto ilegible.**
    - Evidencia: `set-whatsapp-connection-enabled.ts:77-80`, `update-whatsapp-connection.ts:85`, `connection-secrets.ts:36-37,48`.
    - Si se rompe, se reactiva sin querer una conexión que el usuario apagó, o se habilita una que no recibiría webhooks.
12. **Tras una prueba buena el estado es `PENDING` si nunca llegó un webhook y `ACTIVE` si ya llegó.** Meta solo verifica al suscribir.
    - Evidencia: `connection-status.ts:6-14`; R31 en `update-whatsapp-connection.test.ts:196-212`.
    - Si se rompe, una conexión sana se queda en «Pendiente» para siempre tras una prueba.
13. **Ningún error, log o diagnóstico lleva el texto en claro, la clave, el valor guardado ni un trozo de la variable de entorno.**
    - Evidencia: `errors.ts:6`, `secret-cipher-aes-gcm.ts:72`, `encryption-keys-env.ts:2-3,37`; R14 en `secret-cipher-aes-gcm.test.ts:52-58` y `encryption-keys-env.test.ts:60-69,111-150`. Los tests espían que `console.*` no se llame (`…:72-88`).
    - Si se rompe, las credenciales acaban en el agregador de logs.
14. **Las variables de cifrado se leen en cada llamada, nunca al importar.**
    - Evidencia: `encryption-keys-env.ts:2`; R10/R19 en `encryption-keys-env.test.ts:152-164,239-310`.
    - Si se rompe, la app no arranca sin las variables, y rotar la clave activa exige reiniciar.
15. **El tag de GCM tiene largo explícito en los dos lados y la base64 se valida con regex estricta.**
    - Evidencia: `secret-cipher-aes-gcm.ts:16-17`, `stored-secret.ts:10-11`; R7 en `stored-secret.test.ts:70-76`.
    - Si se rompe, se aceptan tags truncados (falsificación más barata) o valores con basura que Node decodifica en silencio.
16. **El resumen sin sal solo vale para secretos de alta entropía y se compara en tiempo constante sobre 32 contra 32 bytes.**
    - Evidencia: `ports/secret-digest.ts:1`, `secret-digest-sha256.ts:11-18`; R16/R17 en `secret-digest-sha256.test.ts:72-98`.
    - Si se rompe, aplicado a un secreto elegido por una persona, se adivina por diccionario; sin tiempo constante, el tiempo de respuesta filtra el resumen.
17. **El token de Meta va solo en la cabecera `Authorization`, y nada registra la URL, la cabecera ni el cuerpo.**
    - Evidencia: `whatsapp-graph-client-fetch.ts:93-118`.
    - Si se rompe, el token queda en los logs de proxies.
18. **Un fallo de Graph o de red es un resultado, no una excepción, y hay timeout de 10 s.**
    - Evidencia: `ports/whatsapp-graph-client.ts:36`, `whatsapp-graph-client-fetch.ts:21,110,115-117`.
    - Si se rompe, el caso de uso no puede guardar `ERROR` con el mensaje, o una Server Action se cuelga.
19. **La importación de plantillas que falla no deshace el alta.**
    - Evidencia: `create-whatsapp-connection.ts:28,104-110`; R30 en `create-whatsapp-connection.test.ts:238-273`.
    - Si se rompe, una caída de Meta tras la prueba buena impide conectar.

### Máquina de estados (eje 12)

- **Alta:** prueba buena → `PENDING` (`create-whatsapp-connection.ts:96`). Prueba fallida → no hay fila.
- **Probar** (`test-whatsapp-connection.ts`):
  - si está `DISABLED`, se rechaza con `action_not_allowed` (`:42`);
  - si sale bien, `PENDING` (sin webhook) o `ACTIVE` (con webhook), y limpia `lastError`;
  - si sale mal, `ERROR` con `lastError` y `lastCheckedAt` (`connection-status.ts:30-32`).
- **Editar:**
  - sin cambiar secretos ni teléfono, no prueba y no toca el estado (`update-whatsapp-connection.ts:60-65`);
  - con prueba buena, como «Probar», pero `DISABLED` se conserva (`:85`);
  - con prueba fallida, **nada** cambia (`:76`). Es una asimetría a propósito frente a «Probar», que sí escribe `ERROR`.
- **Deshabilitar:** cualquiera → `DISABLED`, sin probar. Es idempotente (`set-whatsapp-connection-enabled.ts:62-65`).
- **Habilitar:** solo desde `DISABLED`. Exige una prueba buena → `PENDING`/`ACTIVE`; si falla, devuelve `test_failed` sin escribir (`:67-81`).
- **Secreto ilegible al usar:** → `ERROR` con «Vuelve a escribir…», salvo si está `DISABLED` (`connection-secrets.ts:48-54`).
- **Handshake del webhook:**
  - marca `lastWebhookAt` si no está `DISABLED`, y pasa `PENDING` → `ACTIVE`;
  - son dos `UPDATE` sin transacción, justificado (`whatsapp-connection-prisma.ts:180-197`).
- **UI:**
  - el último error solo se pinta en `ERROR` (`whatsapp-connection-card.tsx:48`; R37);
  - en `DISABLED` se ocultan «Probar» y «Deshabilitar» y aparece «Habilitar» (`whatsapp-connection-actions.tsx:174-212`);
  - Deshabilitar y Regenerar piden confirmación; Habilitar no (`:188-199,227-248`);
  - los estados de cada formulario son `idle | created | saved | tested | test_failed | regenerated | error` (`whatsapp-connection-actions.ts:30-58`).

### Framework (eje 14): qué existe solo por Next App Router y su equivalente

- **`'use server'` en las acciones, importadas por su ruta exacta.** Un `'use server'` reexportado desde el barrel se vuelve inimportable desde un componente cliente (`whatsapp-connection-actions.ts:1,8-9`).
  - Equivalente: un endpoint RPC/POST o un controlador de formulario (Remix `action`, SvelteKit form actions, un controlador Rails o Django).
- **`revalidatePath(ruta)` tras cada mutación con éxito.** La consulta no revalida, y «Probar» revalida también cuando falla (`:105-107,177`; test `:330-339`).
  - Equivalente: invalidar la caché de la página o del query (SWR/React Query `mutate`, `invalidateQueries`) o redirigir con PRG.
- **`useActionState`** con un estado discriminado por acción (`whatsapp-connection-form.tsx:138`; `whatsapp-connection-actions.tsx:83-123`).
  - Equivalente: un reductor local más una llamada asíncrona con estado `pending`.
- **Un `<form action>` no controlado se vacía al terminar.** Por eso lo escrito vuelve desde el estado, y la clave del `Input` lo remonta (`whatsapp-connection-form.tsx:91-95,159-161`).
  - Equivalente: un formulario controlado que conserva los campos no secretos y vacía los secretos.
- **El verify token se revela dentro de la acción, no en un efecto.** El refresco del servidor desmonta el formulario en el mismo paso (`:109-111`).
  - Equivalente: mostrar el token en la respuesta de la mutación antes de navegar o recargar.
- **Server Component `async`** con guarda de página (`page.tsx:30-31`) y `metadata` (`:22-24`).
  - Equivalente: un loader o controlador de servidor con su middleware de permiso.
- **El route group `(private)`.**
  - Equivalente: un layout autenticado.
- **`useSyncExternalStore`:** el servidor pinta UTC y el cliente repinta en su huso sin desajuste de hidratación (`whatsapp-connection-card.tsx:24-28`).
  - Equivalente: formatear en el cliente, o enviar la hora en ISO y formatear al montar.

### Librerías (eje 15): qué aporta cada una y el requisito que sobrevive

- **`node:crypto`.** AES-256-GCM, `randomBytes`, `randomUUID`, SHA-256 y `timingSafeEqual`.
  - Requisito: un cifrado autenticado (AEAD) con datos asociados, un IV aleatorio de 96 bits por valor, una comparación en tiempo constante y un CSPRNG.
- **`zod`.** Esquemas de entrada con recorte y límites, y validación de las respuestas de Graph.
  - Requisito: validación declarativa en el borde, también de las respuestas externas.
- **Prisma.**
  - `select` explícito.
  - `updateMany` con el `where` de empresa: el `null` sale del recuento, no de un `if`.
  - La traducción de `P2002` por nombre de índice o por columnas (`whatsapp-connection-prisma.ts:59-94`).
  - Requisito: traducir la violación de unicidad de **cada** índice parcial a un error de dominio, y propagar cualquier otra.
- **`fetch` con `AbortSignal.timeout` y `cache: 'no-store'`.**
  - Requisito: un cliente HTTP con timeout y sin caché para llamadas autenticadas.
- **shadcn `Badge`/`Button`/`Input`/`Label`, Tailwind, `Intl.DateTimeFormat`.**
  - Requisito: primitivos accesibles, campos de 16 px y 44 px de alto (R40) y fechas localizadas.

### Parámetros a reemplazar (eje 16)

| Marcador | Valor en el original | Nota para el destino |
|---|---|---|
| Tabla de empresa / columna | `companies` / `company_id` | `organizacion` / `organizacion_id` (`docs/architecture.md:41`) |
| Tabla de usuario (auditoría) | `users` / `created_by` | la del destino |
| Tabla de la conexión | `whatsapp_connections` (inglés) | nombre en español según el destino |
| Permiso | `integraciones.modificar`, sembrado a `Administrador` | modelo de permisos del destino |
| Ruta de la pantalla | `/integraciones/whatsapp` (`WHATSAPP_INTEGRATION_ROUTE`) | la del destino |
| Ruta del webhook | `/api/integraciones/whatsapp/webhook/<id>` (`whatsappWebhookPath`; ver `whatsapp-connection-actions.test.ts:82`) | la del destino (fuera de frontera) |
| Variables de cifrado | `INTEGRATIONS_ENCRYPTION_KEYS`, `INTEGRATIONS_ENCRYPTION_ACTIVE` | nombres del destino |
| Etiqueta del AAD | `'integraciones.secret'` | etiqueta propia; cambiarla invalida todo lo ya cifrado |
| Campos secretos | `access_token`, `app_secret` | los de cada proveedor (p. ej. la clave de Maps, la del asistente) |
| API externa | `https://graph.facebook.com/<versión>` y la versión por variable (`whatsapp-graph-client-fetch.ts:16-17`) | la de cada proveedor |
| Copys | etiquetas, textos de diálogos y prefijo «Meta rechazó la prueba: » | del destino |
| Códigos de error | `whatsapp_connection_not_found`, `…_exists`, `…_phone_number_taken`, `integration_secret_unreadable`, `invalid_input`, `unauthorized`, `action_not_allowed` | catálogo del destino |
| `data-testid` | `whatsapp-*` | del destino |

**Propio de QuimiCloude:**
- la empresa como `companies`;
- el permiso con añadidos (`assertAddon`) y el permiso de `clientes`;
- todo Meta Graph: WABA, Phone Number ID, verify token, handshake del webhook, importación de plantillas, `PENDING` por webhook no recibido y el único global por número para enrutar el webhook.

**Núcleo reusable:**
- la bóveda: puerto `SecretCipher`, contexto AAD, formato versionado, anillo de claves, `SecretDigest` y `RandomSource`;
- el ámbito de empresa obligatorio al final de cada firma;
- una conexión por empresa y proveedor, con estado, `lastError` y `lastCheckedAt`;
- «probar antes de guardar», «la edición fallida no escribe», «los secretos no se precargan y en blanco significan conservar» y «la vista sin secretos».

### Núcleo invariante (eje 17): candidatos EARS con su `R<n>` original

Los números `R<n>` son de dos specs de QC que no se leyeron: la bóveda, por los tests de cripto (R1-R22), y la conexión, por los tests de WhatsApp. Los números chocan entre specs; ver la deuda.

- **Ubicuos**
  - Cifrar devuelve `v<n>:<iv>:<tag>:<ct>` con la versión activa (R3, R9).
  - Descifrar usa la versión del valor (R9).
  - Dos cifrados del mismo texto difieren (R2).
  - El valor guardado no contiene el texto ni su base64 (R3).
  - La empresa de toda operación sale del actor (R2 conexión).
  - Toda respuesta hacia la UI excluye secretos, cifrados y resúmenes (R10 conexión).
- **Ante evento**
  - Al dar de alta, el sistema prueba las credenciales contra el proveedor **antes** de escribir (R21).
  - Con prueba buena, crea la conexión `PENDING` con los datos que devuelve el proveedor (R22).
  - Al regenerar, devuelve el token nuevo una sola vez y guarda su resumen (R15).
- **Indeseado (*If … then*)**
  - Si la prueba falla, no crea ni modifica nada y devuelve el mensaje con los secretos tapados (R23, R26).
  - Si el valor guardado está alterado, mal formado, con otra versión o con otro contexto, el descifrado falla con un único error «ilegible» sin causa ni fugas (R4, R5, R7, R8, R14).
  - Si un secreto guardado es ilegible al usarlo, la conexión pasa a `ERROR` pidiendo reescribirlo, salvo si está deshabilitada (D10/R13).
  - Si falta o está mal formada la configuración de claves, el error nombra la variable y nunca su valor (R11, R12).
  - Si el id no tiene forma válida, no existe, está borrado o es de otra empresa, la respuesta es la misma «no encontrado» (R3).
- **Estado**
  - Mientras exista una conexión viva en la empresa, una segunda alta se rechaza, también en concurrencia (R6).
  - Mientras la conexión esté deshabilitada, no se prueba, y editar no la habilita (R31).
- **Opcional**
  - Donde la edición deje un secreto vacío, se conserva el guardado sin descifrarlo ni volver a cifrarlo (R11).
  - Donde cambien un secreto o el identificador probado, se vuelve a probar (R12, R26).

### Tests (eje 20)

| Test | Qué fija | R | Tipo |
|---|---|---|---|
| `secret-cipher-aes-gcm.test.ts` | Ida y vuelta, IV distinto, forma, alteración, contexto, ambigüedad, versiones, entradas vacías, ni fugas ni `console` | R1-R14 (bóveda) | Transferible; `vi.stubEnv` es del stack |
| `secret-digest-sha256.test.ts` | Vector conocido, determinismo, resumen mal formado → `false` sin comparar, tiempo constante 32/32 | R14-R17 | Transferible |
| `stored-secret.test.ts` | Unir/partir, base64 permisivo rechazado, `v<n>` sin ceros, contexto sin ambigüedad, errores del contrato | R3, R6, R7, R13, R20 | Transferible |
| `encryption-keys-env.test.ts` | `.env.example` declara las variables; errores por posición sin fugas; lectura por llamada; fachada cerrada | R10-R12, R14, R19, R22 | Mixto; la fachada es del stack |
| `create-whatsapp-connection.test.ts` | Orden prueba→escritura, `PENDING`/`MANUAL`, cifrado por contexto, resumen del token, saneado, `exists` sin Graph, límites, plantillas que no deshacen | R6, R8, R9, R14, R21-R24, R29, R30 | Transferible; las plantillas son de QC |
| `update-whatsapp-connection.test.ts` | Not found idéntico, conservar secretos, prueba condicional, fallo sin escritura, estado tras la prueba, ilegible sin Graph | R3, R11-R13, R19, R25-R27, R31, D10 | Transferible |
| `whatsapp-connection-actions.test.ts` | Estados de salida, ni secretos ni resumen, token solo en created/regenerated, revalidación, traducción de errores, el borde no decide | R10, R14, R15, R30 | Del stack (Server Actions), con la intención transferible |
| `whatsapp-connection-card.test.tsx` | Etiquetas por estado, último error solo en `ERROR`, marca de vacío | R37 | Transferible |
| `whatsapp-connection-form.test.tsx` | Cinco campos, secretos como contraseña sin valor, conservar lo no secreto tras fallo, aviso único del token, confirmaciones, talla táctil | R36-R40 | Transferible; las clases Tailwind son del stack |
| `whatsapp-connection-prisma.int.test.ts` | RLS, ámbito, not found cruzado, únicos y concurrencia, otra violación se propaga, solo cifrados en base | R2, R3, R5-R7, R9 | Transferible (Postgres real) |
| `whatsapp-connection-migration.int.test.ts` | RLS forzada, FK, índices parciales exactos, DOWN e ida-vuelta-ida, sensibilidad sin `FORCE` | R5-R7 | Transferible (Postgres) |
| `e2e/integraciones.spec.ts` | 200 con permiso; sin él, nada en el HTML y 404 sin palabras delatoras; el seed da el permiso solo al Administrador | QC-222 R19-R21 | Transferible |
| `e2e/integraciones-whatsapp.spec.ts` | Pestañas, alta fallida sin fila, alta buena, recarga sin token, edición del nombre conserva cifrados, deshabilitar y habilitar | R11, R16, R22, R23, R29, R30, R35, R38, R41; QC-243 R2 | Transferible |

El E2E no recorre «Probar conexión» ni «Regenerar»: lo cubren solo los tests de componente (`whatsapp-connection-form.test.tsx:383-421`).

### Dependencias asumidas (eje 21)

- **Primitivos de UI.** `components/ui/{button,input,label,badge}`. También `components/shared/{error-alert,password-field,submit-button,confirm-dialog}`, que no están en la lista: hay que tenerlos o equivalentes (`whatsapp-connection-form.tsx:5-10`, `whatsapp-connection-actions.tsx:5-7`).
- **Catálogo de errores** `@/lib/modules/errores`: `errorMessage`, `ErrorCode`, `createErrorStateTranslator` y `ErrorState`, este último con `reference` para `unexpected` (`errors.ts:1`, `whatsapp-connection-actions.ts:15,60`).
- **Identidad.**
  - Sesión: `getSessionUser`, `getSessionContext`.
  - Permisos: `assertPermission`, `assertAddon`, `requirePagePermission`.
  - Las tablas `permissions` y `role_permissions` (`schema.prisma:48-75`) y el rol `Administrador` sembrado.
- **Infraestructura.**
  - El composition root `@/lib/composition` con la fachada `integraciones` y `observabilidad.readRequestIdHeader`.
  - `runInRequestScope`.
  - `@/lib/shared/routes` y `@/lib/shared/navigation/private-nav`.
  - `EMPTY_MARK`.
  - El cliente Prisma global `@/lib/shared/db/prisma`.
- **Variables y migraciones.**
  - Las de cifrado, declaradas vacías en `.env.example`.
  - La de la versión de Graph (`whatsapp-config-env`).
  - Cada migración con su `down.sql`; los tests los leen, pero no están en la lista.
- **Tooling de tests.**
  - Vitest con jsdom, Testing Library y los helpers `setupUser` e `identificador-de-request`.
  - Playwright en Chromium y WebKit, con los helpers `loginAndLand`, `createFixtureUser` y `enableAllAddons`.
  - El doble `whatsapp-graph-client-canned` y el doble de unit `whatsapp-doubles`.
  - Postgres real para `*.int.test.ts`.

### Deuda anotada (no juzgada)

- **Migración editada en sitio.** Hubo que añadir la correctiva `20261019120000` (`:3-6`).
- **WABA ID nunca verificado.** Ver el eje 18.
- **Numeración `R<n>` que choca.** En los unit, R29/R30 son la importación de plantillas (`create-whatsapp-connection.test.ts:211,242`). En el E2E, R29/R30 son deshabilitar y habilitar (`e2e/integraciones-whatsapp.spec.ts:320,334`). No verificado si vienen de specs distintos o es un error de trazabilidad.
- **Auditoría desigual.** WhatsApp guarda solo `created_by`; IA guarda `created_by` y `updated_by` (`schema.prisma:1231` frente a `:1520-1521`).
- **`currentActor` construye el actor sin `addons`** (`whatsapp-connection-actions.ts:67-71`).
  - `requireCustomerLinkPermission` exige `assertAddon` (`actor.ts:33`).
  - No verificado: que las acciones de contactos, fuera de la frontera, sufran el mismo hueco.

## Huecos para el humano

1. **(eje 18) ¿Puede una empresa quitar su conexión de WhatsApp (o de cualquier integración), y qué pasa con lo guardado?**
   - El original tiene la columna de borrado y los únicos cuentan con ella, pero no hay botón ni caso de uso para borrar.
   - ¿Es a propósito, es de otra feature o falta?
   - ¿Y en Servi Logistic: quitar la clave de Maps o del asistente la borra, o la deja apagada?
2. **(eje 18) Cuando la plataforma cambia su clave maestra de cifrado, ¿quién vuelve a cifrar las credenciales que ya guardaron las empresas, y cuándo se puede dar de baja la clave vieja?**
   - Hoy lo guardado sigue legible con la clave antigua y nada lo pasa a la nueva.
   - Por eso la clave vieja no se puede retirar nunca.

## Respuestas del humano (Carlos, 2026-10-24)

1. **Desconectar: SÍ.** La empresa puede quitar una conexión (WhatsApp, Maps, asistente).
   - Antes de hacerlo, la app debe dejar claro qué deja de funcionar sin ella.
   - Cada servicio se marca como «requerido» o «recomendado», con lo que se pierde al quitarlo.
   - Carlos cree que, sin Google, no se pueden hacer asignaciones («si no estoy mal»).
   - El leader vio en el código de servi_logistic dos cosas:
     - La optimización de rutas tiene respaldo sin Google (`lib/clients/fallback-route-optimization.ts`, `haversine-route-optimization.ts`).
     - La geocodificación depende de `GOOGLE_MAPS_API_KEY` (`lib/config/geocode.ts:24`).
   - Si sin Maps las asignaciones se **bloquean** o solo **se degradan** sigue ABIERTO; lo verifica el spec.
   - Borrar la clave o solo apagarla tampoco se decidió aquí: va con D7, en /afinar-feature.
2. **Rotación: versiones + comando.**
   - Las claves maestras con versión viven en el entorno; lo nuevo se cifra con la activa y las viejas solo leen.
   - Un comando del superadmin recifra todo con la versión activa y muestra cuántas filas quedan con cada versión vieja.
   - Una versión vieja se retira del entorno cuando su conteo llega a 0.
   - Sin servicio externo (KMS): Carlos lo eligió frente al gestor en la nube, por simple.
