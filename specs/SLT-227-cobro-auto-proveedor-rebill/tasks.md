# SLT-227 «Cobro automático: interfaz de proveedores y adaptador de Rebill» — tasks

> Requisitos: `requirements.md` (R1–R27). Diseño: `design.md`. Todo es backend (`backend_dev`).
> Cada tanda cierra con `./init.sh` en verde y un commit por task (`feat(SLT-227): …` / `test(SLT-227): …`).
> No queda ninguna pregunta abierta y ninguna tanda está bloqueada. P1–P5 se resolvieron con la doc de Rebill v3
> (design §6.1), y P6–P8 las decidió el humano el 2026-11-21: un solo PR, `partially_refunded` ⇒ `aprobado` y
> `cancelled` ⇒ `rechazado`.

## Tanda 0 — Comprobaciones (sin código)

- [x] **T0.1** Listar las migraciones de `origin/dev` y de los PR abiertos, y fijar el prefijo: mayor que todas, y en
  particular que `20261126120100` de SLT-121 «Planes: plazo de pago de la factura y operación congelada por mora»
  (PR #264). Sin «125» en el nombre (propuesto `20261127120000_cobro_proveedor_credencial`).
  *Hecho:* el prefijo está anotado en `progress/impl_SLT-227.md`.
- [x] **T0.2** [P] Confirmar que `exigirContexto` acepta `organizacionId: "plataforma"` y que ningún `organizacion.id`
  puede valer eso (son `uuid`).
  *Hecho:* anotado, con la línea de la migración que fija el tipo del id.
- [x] **T0.3** [P] Leer tres guardias y anotar qué piden para una tabla de plataforma con un único sin
  `organizacion_id`: `unicos-por-empresa`, `rls-por-empresa` y `scripts/verificar-rls-despliegue.ts`.
  *Hecho:* está decidido si entran `tests/unit/guards/_unicos-sin-empresa.ts` y `scripts/verificar-rls-despliegue.ts`
  (design §1).
- [x] **T0.4** [P] Confirmar que `RecifradoIntegracionesService.empresa` puede recibir el repositorio como parámetro
  sin cambiar el resumen de las empresas.
  *Hecho:* los tests actuales de `recifrado-integraciones.test.ts` siguen en verde con el cambio de firma.

## Tanda 1 — El modelo (depende de T0)

- [x] **T1.1** La migración `…_cobro_proveedor_credencial` con su `down.sql` (design §1, §1.1): la tabla, los CHECK
  (el de forma cifrada, copiado de `integracion_secretos_cifrados`), el único del trío, la RLS sin políticas y
  `REVOKE ALL` a `servi_app`. El `down` aborta con filas.
  *Hecho:* se aplica y se revierte en una base desechable.
- [x] **T1.2** `db/schema.prisma`: el modelo `CobroProveedorCredencial` y su relación con `Pais`. Además, la entrada en
  `MODELOS_DE_PLATAFORMA` (`lib/db/modelos-de-negocio.ts`).
  *Hecho:* `pnpm run typecheck` y la guardia `organizacion-en-modelos` en verde.
- [x] **T1.3** Los tests de base de `cobro-proveedor-credencial.test.ts`:
  - el INSERT del dueño en claro da `23514` (R5);
  - un segundo trío igual da `23505` (R5);
  - como `servi_app`, `42501` al leer y al escribir (R6);
  - la ida y la vuelta de la migración, y el `down` que aborta con filas.

  *Hecho:* en verde. Con la migración sin el CHECK, el test de R5 cae.

## Tanda 2 — Las credenciales (depende de T1)

- [ ] **T2.1** `lib/types/cobro.ts`: `ENTORNOS_COBRO`, `EntornoCobro`, `OperacionProveedor`, `CodigoErrorProveedor` y
  `ProveedorCobroError` (design §4). `lib/interfaces/external/IProveedorCobro.ts`: `IConsultaPagoProveedor`, el
  `IProveedorCobro` ampliado, los tipos de entrada y salida, y `LeerCredencialesCobro` (design §3).
  `CobroIntentoService.ts` y su test pasan a `IConsultaPagoProveedor`, solo en los tipos.
  *Hecho:* typecheck en verde, y `cobro-intento-service.test.ts` en verde sin cambiar ninguna afirmación (R27).
- [x] **T2.2** `ICobroCredencialRepository` y `CobroCredencialRepository` (design §8.2), en `comoPlataforma("SL-36")`,
  con su entrada en `EXCEPCIONES_DE_PLATAFORMA`. Implementa también `IIntegracionRecifradoRepository`.
  *Hecho:* las guardias `plataforma-solo-en-lista` y `sql-a-mano-por-empresa` en verde.
- [ ] **T2.3** `ICobroCredencialService` y `CobroCredencialService.ts`: `guardar`, `estado`, `CAMPOS_POR_PROVEEDOR`,
  `guardarCredencialSchema`, el contexto de la bóveda (§8.1) y `crearLectorCredencialesCobro` (§8.3).
  *Hecho:* los tests unitarios de R8, R9 y R10 en verde.
- [ ] **T2.4** Los tests de base de las credenciales:
  - guardar y leer con la bóveda real;
  - reemplazar sin otra fila;
  - `pais_no_existe`;
  - la copia entre tríos y entre campos da `credencial_ilegible`;
  - `estado` sin secretos.

  Son R5, R7, R8 y R9. *Hecho:* en verde. Con la mutación 5 de design §12, el test de R7 cae.
- [ ] **T2.5** [P] `scripts/cobro-credencial-guardar.ts` y `package.json` (`"cobro:credencial"`), con
  `ejecutarGuardado` exportado (design §9.1).
  *Hecho:* los tests de R12 en verde, en `cobro-credencial-service.test.ts`.
- [ ] **T2.6** [P] El recifrado (design §9.2): `RecifradoIntegracionesService` con la pasada de plataforma y
  `scripts/recifrar-integraciones.ts` cableado. El test de R13 va en `recifrado-integraciones.test.ts`.
  *Hecho:* en verde. Sin la pasada, el test cae (mutación 8).

## Tanda 3 — Transporte, entorno y registro (depende de T2.1; [P] con T2.2–T2.6)

- [ ] **T3.1** `lib/config/cobro.ts`: `entornoDeCobro`, `TIEMPO_MAXIMO_COBRO_MS`, `ESPERAS_REINTENTO_CONSULTA_MS` y
  `URL_BASE_REBILL = "https://api.rebill.com"`, una sola para los dos entornos (design §2).
  *Hecho:* los tests de R3 en verde (`VERCEL_ENV` `production`, `preview`, ausente; `NODE_ENV=production` sin
  `VERCEL_ENV`).
- [ ] **T3.2** `lib/clients/cobro/http-proveedor.ts`: `pedirUnaVez`, `pedirIdempotente` y `traducirFalla` (design §5).
  *Hecho:* los tests de R20, R21, R23 y la tabla de R24 en verde, con `fetch` y `esperar` dobles. Las mutaciones 1 y
  2 caen.
- [ ] **T3.3** `lib/clients/cobro/registro-proveedores.ts` con `construirRegistroProveedoresCobro` (design §7).
  `rebill` devuelve el adaptador, aunque sea el esqueleto de T4.1.
  *Hecho:* el test de R2 en verde: con `wompi` y `global66`, `proveedor_no_disponible` y 0 lecturas de credenciales.

## Tanda 4 — El adaptador de Rebill y su doble (depende de T3)

- [ ] **T4.1** `e2e/_rebill-falso/servidor.mjs` (design §11), con las formas de design §6.1 y el enlace a la página de
  la doc en cada ruta.
  *Hecho:* arranca en el puerto 0, responde `/salud`, rechaza con `401` una key incorrecta y valida el largo de
  `prices` y `paymentMethods`.
- [ ] **T4.2** `lib/clients/cobro/rebill-proveedor.ts` (design §6.2–§6.6): `crearEnlace`, `consultarPago`,
  `verificarFirma` y `devolver`, más `cuerpoJsonConMontos`, los esquemas zod, `ESTADO_REBILL_A_PROVEEDOR` y el mapa de
  la devolución.
  *Hecho:* los tests de R14–R19 y R22 en verde contra el doble, incluido el cuerpo crudo con `"amount":20000.00` y los
  bordes de la lectura del monto. Las mutaciones 9 y 10 caen.
- [ ] **T4.3** La sección «R25: el secreto no sale» de `rebill-proveedor.test.ts` (design §12), con su control de no
  vacuidad.
  *Hecho:* en verde. Con la mutación 3, cae.
- [ ] **T4.4** El test de R4 con el registro real y el lector doble: en `sandbox`, el trío de `produccion` no se usa y
  sale `sin_configuracion` sin peticiones.
  *Hecho:* en verde.
- [ ] **T4.5** Contraste manual en el sandbox de Rebill, **no automatizado** (R26), con credenciales de sandbox que da
  el humano. Se hace una vez:
  - un enlace de ₡100,00 por tarjeta;
  - el pago con la tarjeta de prueba;
  - `consultarPago`;
  - una devolución parcial.

  Hay que confirmar tres cosas que la doc deja implícitas: que se acepta `language: "es"`, que el `GET` trae
  `metadata.paymentLinkId` y la forma de `amount`.
  *Hecho:* el resultado está anotado en `progress/impl_SLT-227.md`. Si algo difiere, el doble y el adaptador se
  corrigen juntos antes de T5. **No bloquea el PR si el humano no tiene aún la cuenta de sandbox:** queda como deuda
  anotada para SLT-230.

## Tanda 5 — Guardia, docs y cierre (depende de T4)

- [ ] **T5.1** `tests/unit/guards/credenciales-cobro-solo-adaptador.guardia.test.ts` (R11, R26), con su control de no
  vacuidad.
  *Hecho:* en verde. Si se importa el lector en un archivo de `lib/actions/` de prueba, cae.
- [ ] **T5.2** `docs/architecture.md > Multi-empresa`: un párrafo «Credenciales de los proveedores de cobro (SLT-227)»
  con:
  - la tabla de plataforma y quién la lee;
  - el entorno por `VERCEL_ENV`;
  - el registro;
  - los reintentos;
  - el comando de carga y el recifrado.

  Si T0.3 lo pidió, también el único global. Hay un choque aceptado con SLT-55, SLT-61 y SLT-77
  (`progress/features/SLT-227.md`).
  *Hecho:* el párrafo está escrito y la guardia `unicos-por-empresa` está en verde.
- [ ] **T5.3** `node scripts/tamano-pr.mjs` y el mapa `R<n> → test` en `progress/impl_SLT-227.md`.
  *Hecho:* cada R tiene su test. El tamaño se mide y se anota: el exceso de líneas de producción está aceptado
  (P6, marcador `tamano-pr-aceptado`), y los archivos y las líneas de tests siguen dentro de sus topes.

## Mapa `R<n>` → test previsto

Abreviaturas: `RP` = `tests/integration/cobro/rebill-proveedor.test.ts`; `HR` =
`tests/unit/clients/cobro-http-registro.test.ts`; `CB` = `tests/integration/db/cobro-proveedor-credencial.test.ts`;
`CS` = `tests/unit/services/cobro-credencial-service.test.ts`; `RC` =
`tests/integration/db/recifrado-integraciones.test.ts`; `GU` =
`tests/unit/guards/credenciales-cobro-solo-adaptador.guardia.test.ts`; `CI` =
`tests/unit/services/cobro-intento-service.test.ts`.

| R | Test | Qué afirma |
|---|---|---|
| R1 | RP «R1: el adaptador de Rebill ofrece las cuatro operaciones y consultarPago devuelve null con un 404» | Las cuatro contra el doble; `null`, y no un error, con un pago desconocido |
| R2 | HR «R2: el registro da el adaptador de rebill para CR; wompi y global66 dan proveedor_no_disponible sin leer credenciales» | `proveedor`, el país del adaptador y 0 llamadas al lector |
| R3 | HR «R3: el entorno es produccion solo con VERCEL_ENV=production» | `production`, `preview`, ausente, y `NODE_ENV=production` sin `VERCEL_ENV` |
| R4 | RP «R4: en sandbox el adaptador lee el trío de sandbox y usa la URL de sandbox; con credenciales solo de produccion, sin_configuracion y 0 peticiones» | La clave que recibe el lector y la URL a la que llama |
| R5 | CB «R5: guardar cifra los dos campos; el dueño no puede escribir un secreto en claro; un trío, una fila» | `v1:…` en cada valor, `23514` y `23505` |
| R6 | CB «R6: como servi_app, leer y escribir cobro_proveedor_credencial da 42501» | `SELECT`, `INSERT`, `UPDATE` y `DELETE` |
| R7 | CB «R7: un secreto copiado a otro trío o a otro campo da credencial_ilegible» | Con la bóveda real |
| R8 | CB «R8: guardar dos veces reemplaza sin otra fila y registra quién y cuándo; país inexistente, pais_no_existe» | Conteo de filas, `actualizado_por` y `updated_at` |
| R8 | CS «R8: falta un campo, sobra uno o va vacío ⇒ validation_error sin cifrar; wompi ⇒ proveedor_no_disponible» | El cifrador y el repositorio sin llamadas |
| R9 | CB «R9: estado devuelve los campos y el último cambio, y ningún valor» | `JSON.stringify` sin el valor ni `v1:` |
| R9 | CS «R9: un trío sin fila ⇒ configurada: false» | — |
| R10 | CS «R10: maestro, admin, mensajero y tienda reciben forbidden al guardar y al consultar, sin llamadas» | Los dobles sin ninguna llamada |
| R11 | GU «R11: el lector de secretos descifrados solo aparece en el servicio, el repositorio y lib/clients/cobro» | Ni `app/` ni `lib/actions/` |
| R12 | CS «R12: el comando lee los secretos de la entrada estándar, guarda como el superadmin y no imprime ningún valor» | La salida doble sin los valores; el actor es el superadmin |
| R12 | CS «R12: un argumento desconocido sale con 1 sin repetirlo; sin superadmin, sale con 1» | — |
| R13 | RC «R13: el recifrado lleva a v2 las credenciales de cobro en v1 y las suma al resumen» | `recifrados`, `porVersion`, y la lectura posterior con el lector |
| R14 | RP «R14: sin credenciales para el trío, las cuatro operaciones dan sin_configuracion y el doble no recibe peticiones» | `GET /__control/peticiones` vacío |
| R15 | RP «R15: cada petición lleva la API key del trío en x-api-key» | La petición del doble, con la key correcta |
| R8 | CS «R8: una apiKey pk_ o un secretoWebhook sin la forma whsec_ + 64 hex ⇒ validation_error» | — |
| R16 | RP «R16: crearEnlace devuelve el pl_ y la url, y el cuerpo crudo lleva "amount":20000.00, methods ["card"] y la factura y el intento en metadata» | El cuerpo crudo recibido por el doble, y `JSON.parse` de él |
| R16 | HR «R16: cuerpoJsonConMontos escribe 0.10, 20000.00 y 9999999999.99 literales, y una descripción con texto de ficha no se toca» | Función pura |
| R16 | RP «R16: recurrente ⇒ metodo_no_soportado; monto 0 ⇒ solicitud_invalida; los dos sin peticiones» | — |
| R17 | RP «R17: pending, approved, rejected, refunded y chargeback se traducen a pendiente, aprobado, rechazado, devuelto y contracargo» | Una fila por estado |
| R17 | RP «R17 (P7): partially_refunded ⇒ aprobado, con el monto y el id del enlace del pago» | No da `respuesta_invalida` |
| R17 | RP «R17 (P8): cancelled ⇒ rechazado» | No da `respuesta_invalida` |
| R17 | RP «R17: un estado inventado o una forma rara ⇒ respuesta_invalida» | — |
| R17 | Sin test nuevo de base: lo que pasa en el intento ya lo cubre `tests/integration/db/cobro-pago-en-linea.test.ts` (R15 de SLT-226) | Con P7, un `aprobado` sigue `aprobado`. Con P8, `rechazado` sobre un `aprobado` da `sin_cambio` |
| R17 | HR «R17: la lectura del monto da 0.10, 20000.00 y 9999999999.99; 0.005 ⇒ respuesta_invalida» | Los bordes de design §6.3 |
| R18 | RP «R18: el HMAC-SHA256 hex del doble con el whsec_ completo se acepta; con un byte cambiado, sin cabecera, en base64 o con otro secreto, false; sin peticiones de red» | — |
| R19 | RP «R19: devolver 5 000 de un pago card de 20 000 ⇒ aprobada (partially_refunded); approved ⇒ pendiente; un pago bank_transfer ⇒ solicitud_rechazada; monto 0 ⇒ solicitud_invalida sin peticiones» | — |
| R20 | HR «R20: una petición que pasa del tiempo máximo se corta con tiempo_agotado» | Un `fetch` doble que respeta la `signal` |
| R21 | HR «R21: consultarPago con 503, 503 y 200 hace 3 peticiones y espera [250, 1000]; con tres 503, proveedor_caido» | Las esperas anotadas |
| R22 | RP «R22: crearEnlace y devolver con un 503 o un tiempo agotado hacen 1 petición y el error es incierto» | Conteo del doble e `incierto = true` |
| R23 | HR «R23: un 401, un 404 o un 422 no se reintentan» | 1 petición |
| R24 | HR «R24: la tabla de traducción da el código, reintentable e incierto de cada falla» | Una fila por fila de la tabla |
| R25 | RP «R25: ningún error ni log lleva la API key, el secreto del webhook ni el cuerpo del proveedor» | Design §12, con el control de no vacuidad |
| R26 | GU «R26: ningún archivo de tests/ ni e2e/ nombra los hosts reales de Rebill» | Y RP corre entero contra el doble |
| R27 | CI, sin cambios de afirmaciones | Sigue en verde. Solo cambian los tipos de tres líneas |

## Archivos esperados

- `db/migrations/20261127120000_cobro_proveedor_credencial/migration.sql`
- `db/migrations/20261127120000_cobro_proveedor_credencial/down.sql`
- `db/schema.prisma`
- `lib/types/cobro.ts`
- `lib/interfaces/external/IProveedorCobro.ts`
- `lib/config/cobro.ts`
- `lib/clients/cobro/http-proveedor.ts`
- `lib/clients/cobro/rebill-proveedor.ts`
- `lib/clients/cobro/registro-proveedores.ts`
- `lib/interfaces/repositories/ICobroCredencialRepository.ts`
- `lib/repositories/CobroCredencialRepository.ts`
- `lib/interfaces/services/ICobroCredencialService.ts`
- `lib/services/CobroCredencialService.ts`
- `lib/services/CobroIntentoService.ts`
- `lib/services/RecifradoIntegracionesService.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/db/modelos-de-negocio.ts`
- `scripts/cobro-credencial-guardar.ts`
- `scripts/recifrar-integraciones.ts`
- `scripts/verificar-rls-despliegue.ts` (solo si T0.3 lo pide)
- `package.json`
- `docs/architecture.md`
- `e2e/_rebill-falso/servidor.mjs`
- `tests/integration/cobro/rebill-proveedor.test.ts`
- `tests/unit/clients/cobro-http-registro.test.ts`
- `tests/integration/db/cobro-proveedor-credencial.test.ts`
- `tests/unit/services/cobro-credencial-service.test.ts`
- `tests/integration/db/recifrado-integraciones.test.ts`
- `tests/unit/guards/credenciales-cobro-solo-adaptador.guardia.test.ts`
- `tests/unit/guards/_unicos-sin-empresa.ts` (solo si T0.3 lo pide)
- `tests/unit/services/cobro-intento-service.test.ts`
