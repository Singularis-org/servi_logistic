# Review SL-36 «integraciones-por-empresa»

## Vuelta 1 (diff `origin/dev...0e26b3a`)

**Veredicto: RECHAZADO**: 1 bloqueante (B1) y 4 menores. El código y los tests están bien. Lo que
falta es una corrida que el checkpoint del proyecto exige y que nadie hizo: el E2E de humo de dos
empresas.

### Verificación ejecutada por el reviewer

Todo se corrió contra `servi_logistic_sl36`. La URL se reescribió sin imprimirla, y solo salieron booleanos.

- `./init.sh` (rápido), con `NODE_OPTIONS=--max-old-space-size=8192`: **EXIT=0**.
  - typecheck verde;
  - lint con 0 errores (los warnings son previos);
  - tests relacionados: 1098 archivos y 15245 tests en verde, 26 skipped previos;
  - guardias: 307 archivos y 4198 tests en verde, 1 skipped previo.
- Integración de la feature (8 archivos: dos-empresas, migración, enrutado, prueba-minuto, recifrado,
  estado superadmin, route del webhook y route del asistente): **69/69 passed, 0 skipped**.
- Mutaciones propias. Cada una se restauró; `git status --porcelain` quedó vacío y la RLS, activa (`relrowsecurity=true`):

| # | Mutación | Resultado |
|---|---|---|
| M1 | `IntegracionRepository.porId` sin `organizacionId` en el `where` | ROJO: R8 (repo) y R9 |
| M2 | AAD de la bóveda sin `organizacionId` | ROJO: «otro contexto … ilegible» (unit) y las dos de recifrado (base real) |
| M3 | `marcarError`/`porServicio` sin `organizacionId` | ROJO: R5 y R8 (repo) |
| M4 | `IntegracionEnrutadoRepository` selecciona además `secretos` | ROJO: `integracion-enrutado` (R22) |
| M5 | `ALTER TABLE integracion DISABLE ROW LEVEL SECURITY` en la base | ROJO: los tres casos de RLS (migración ×2 y dos-empresas «comoApp(B)») |
| M6 | caché de token de rutas con clave constante | ROJO: «el de A sí se reutiliza para A». El cruce A→B lo sigue bloqueando la huella (integracionId+clave), así que R28 no depende solo de la clave del mapa |
| M7 | caché del app id de Meta con clave constante | ROJO: «⭑ la caché de A no responde a B» |
| M8 | `metaReal` construye el cliente de envío con el `fetch` global | ROJO: «⭑ enviar: … un 401 la marca en ESA empresa» |
| M9 | `listar` sin el chequeo de rol `maestro` | ROJO: admin, mensajero, adminTienda, adminSatelite y apiKey («forbidden sin tocar repo ni probador») |

### Prioridades del leader

- **(a) Ninguna clave de plataforma leída.** OK.
  - Se hizo Grep de `process.env` en `app/`, `lib/` y `scripts/` contra las 19 variables de design §9.3, `GOOGLE_APPLICATION_CREDENTIALS` y `VERCEL_OIDC`, y no aparece ninguna.
  - Las lecturas dinámicas `process.env[nombre]` de `lib/config/{asistente,geocode,route-optimization}.ts` solo leen parámetros: `ASISTENTE_*`, `GEOCODE_TIMEOUT_MS`, `RUTA_*`, `ROUTE_OPT_TIMEOUT_MS` y `ROUTES_ROUTING_PREFERENCE`.
  - `.env.example` no declara ninguna de las retiradas.
  - Guardia R41 en verde.
- **(b) El composition root PASA la credencial.** OK. Cada consumidor lee la credencial de su empresa de esta forma:
  - Envíos (`whatsapp-envio-deps.ts:41-47`), chat (`chat-whatsapp.ts:67`), plantillas (`plantillas.ts:75,82,284`), plantillas-sync, el job de sincronización, bienvenida, chat-envío y `chat/media`: leen con `whatsappDeLaEmpresa(Opcional)`.
  - El cron de plantillas lee dentro de `paraCadaEmpresa`.
  - El webhook usa `leerAppSecret` sobre `CredencialesIntegracionService`, dentro de `conEmpresa` de la empresa del número.
  - `whatsapp-app-id` va con caché por empresa y el `fetch` de la empresa.
  - Geocodificación: fábrica de cliente por job (`geocodificacion-handler.ts:78-111`).
  - Rutas: `RutasPorEmpresa` (`optimizacion-ruta-handler.ts:97-123`).
  - Asistente: `asistenteDeLaEmpresa` (`app/api/asistente/route.ts:145-160`).
  - Lo prueban los tests dinámicos de `integraciones-consumidores-composition-root`, `whatsapp-composition-root` y `whatsapp-sin-integracion`, sin inyectar el lector real. M8 lo confirma.
- **(c) Cachés de proceso (R28).** OK.
  - Las únicas cachés de proceso nuevas o tocadas son `CACHE_PROCESO` de `whatsapp-app-id.ts`, por empresa, y `RutasPorEmpresa.tokens`, por empresa y con huella. M6 y M7 las mataron.
  - `credencialesIntegracionReales()` no cachea.
  - Ver m2: una caché vieja dentro de la MISMA empresa.
- **(d) Aislamiento contra Postgres con dos empresas.** OK. RLS `integracion_por_empresa` e `integracion_prueba_minuto_por_empresa`, `FOR ALL TO servi_app`, con `USING` y `WITH CHECK`. M1, M3 y M5 en rojo.
- **(e) Cifrado y rastro.**
  - Cifrado: AAD = `["integraciones.secreto", versión, org, integración, campo]` en JSON. M2 en rojo.
  - Historial: solo el servicio y `ok` o el código. R33 se prueba contra la base buscando los secretos en las filas.
  - «Solo maestro»: es la primera línea de cada operación en `IntegracionesService.ts:246,258,302,345,380,394`. Hay test de 6 operaciones × 9 actores. M9 en rojo.
- **(f) `IntegracionEnrutadoRepository`.** OK: `select { id, organizacionId }` (`:26`), por índice único. El route ya no llama a `comoPlataforma` y la excepción de la lista apunta al repositorio. M4 en rojo.
- **(g) Trazabilidad.** OK. Los 41 R tienen test en `tasks.md > Trazabilidad` y en `progress/impl_SL-36.md`. Todos los archivos citados existen y pasan.

### Desviaciones declaradas: juicio

| # | Desviación | Juicio |
|---|---|---|
| 1 | E2E solo en Chromium | Aceptable: la config no define otro navegador; es decisión de CI |
| 2 | 403 de `optimizeTours`: marca `permiso` y conserva el orden en vez de caer a Haversine | Aceptable en conducta (R26 y R30 se cumplen), pero el design §5 dice otra cosa → **m1** |
| 3 | CHECK de `secretos` y `datos_publicos` más estrictos | Aceptable: refuerzan R5 y la forma está alineada con la regex de la bóveda |
| 4 | 401 a un cuerpo sin número | Aceptable: es exactamente R21 («ningún evento válido → 401») |
| 5 | Tuteo (pantalla) y voseo (asistente) mezclados | Aceptable: ningún doc del perfil fija la persona; el voseo sigue los textos previos del asistente |
| 6 | Exención en `ayuda-pantalla-ruta-existe` | Aceptable: se deriva del catálogo, queda anclada a las 4 guías con un caso propio y solo exime `pantalla:` |
| 7 | JSON de la cuenta de servicio en un campo password; confirmación al regenerar | Aceptable: un `input` quita los saltos de línea, pero el JSON sigue siendo válido y los `\n` de `private_key` son escapes |
| 8 | Geocodificación sin empresa → `EmpresaNoResuelta` | Aceptable: falla cerrado; una orden siempre es de una empresa |
| 9 | `google-auth-library` y `@vercel/oidc` sin uso en `package.json` | Aceptable para esta vuelta → **m3** |

### Checklist `CHECKPOINTS.md`

- [x] `requirements.md` EARS R1-R41.
- [x] `design.md` con alternativas descartadas (§16, A-G).
- [~] `tasks.md` todo `[x]` salvo **T8.2**, la revisión humana de las guías. El leader la dispensó para esta vuelta; hay que cerrarla antes de `done`.
- [x] `## Lo que ya existe` abre el design. El diff no re-crea nada: `webhook-secret-cipher.ts` queda intacto, `appendAccion` se reutiliza y la lectura de estado se aloja en `EmpresasPlataformaRepository`.
- [x] Assignee y rama (según `progress/features/SL-36.md`).
- [x] Mapa R→test en `progress/impl_SL-36.md`.
- [x] Typecheck y lint (gate local).
- [ ] `gate-completo` en CI: pendiente del PR.
- [ ] **Flujo crítico con su E2E y la salida local en impl**: falta la corrida de `dos-empresas-humo` → **B1**.
- [x] Sin dependencias nuevas.
- [x] Sin secretos en el código. El anillo de `playwright.config.ts` es de prueba, derivado de un texto legible, y se respeta el del entorno si existe.
- [x] El webhook valida firma (HMAC en tiempo constante, por empresa) y token (resumen). La ingesta es la de siempre.
- [x] Nada que cambie entre entornos quedó hardcodeado.
- [x] `./init.sh` verde en el worktree.
- [ ] `progress/features/SL-36.md > Cierre`, y desmontar el worktree: es posterior al OK.

### Checklist `docs/checkpoints-proyecto.md` y `docs/perfil-agentes.md > reviewer`

- [x] Las 2 tablas nuevas llevan `organizacion_id`, RLS, FK RESTRICT, trigger de no cambio de empresa y entrada en `MODELOS_DE_NEGOCIO`.
- [x] Las queries nuevas filtran por empresa, con test de integración de dos empresas: repo, prueba-minuto, recifrado y enrutado.
- [x] Las 2 migraciones traen `down.sql`; ninguna edita una aplicada.
- [x] Sin Ordenex. Sin literales de país en código nuevo: la dirección de prueba de Maps es neutra y el `+506` solo aparece en un fixture de test.
- [x] Sin `console.log` de secretos ni PII. El volcado crudo del webhook es heredado y ahora solo ocurre con la firma ya válida.
- [x] Capas Controller → Service → Repository; zod en el borde (actions y webhook).
- [x] Autorización en el servidor: service y página. Ningún módulo que encender (design §1).
- [x] Los comentarios explican el porqué.

### Hallazgos

**B1. BLOQUEANTE: falta la corrida del E2E de aislamiento `e2e/dos-empresas-humo.spec.ts`.**
- **Regla:** `docs/checkpoints-proyecto.md > Flujos críticos`, punto «Aislamiento entre empresas», dice que una feature que toque `lib/db/`, una entrada sin sesión (cron, job, webhook) o datos de negocio **lo corre**. `CHECKPOINTS.md` pide además su salida local en `progress/impl_<key>.md`.
- **Por qué aplica:** SL-36 toca las tres cosas:
  - `lib/db/excepciones-aislamiento.ts:120` y `lib/db/modelos-de-negocio.ts:37`;
  - el webhook sin sesión;
  - todos los jobs de WhatsApp, Maps y rutas.
- **Lo que falta:** `progress/impl_SL-36-T9.md` solo corrió `integraciones-por-empresa.spec.ts`, con `--no-deps`. En ninguna bitácora hay una corrida de `dos-empresas-humo`. El `e2e` del PR a `dev` existe, pero es informativo y no sustituye la evidencia que pide el checkpoint.
- **Fix:** sobre la misma base desechable y el mismo `next build` de T9, correr
  `pnpm exec playwright test e2e/dos-empresas-humo.spec.ts --project=aislamiento --no-deps` y pegar la salida (passed, skipped y exit) en `progress/impl_SL-36.md > Salida real`. Si sale rojo, va al implementer. No cambia código.

**m1. menor: el design §5 y el código no dicen lo mismo ante un 403 de `optimizeTours`.**
- **Dónde:** `specs/SL-36-integraciones-por-empresa/design.md:292-294` dice «la ruta cae al orden aproximado». El código (`lib/services/integraciones/rutas-de-la-empresa.ts:57,103-109` y `FallbackRouteOptimizationClient`) marca `optimizacion_rutas.permiso` y trata el 403 como `config_invalida`: conserva el orden previo y el job reintenta.
- **Consecuencia:** la conducta es segura y R26/R30 se cumplen, pero el spec queda desalineado. Con un 403 permanente, cada job de ruta agota reintentos.
- **Fix:** elegir una de las dos.
  - Corregir el design §5 para que diga lo que hace el código.
  - O implementar el fallback a Haversine ante `permiso` en `FallbackRouteOptimizationClient`, con su test.

**m2. menor: la caché del app id de Meta no ve un cambio de token dentro de la misma integración.**
- **Dónde:** `lib/clients/whatsapp-app-id.ts:113-116` acepta la entrada si coinciden `organizacionId` e `integracionId`.
- **Consecuencia:** si el maestro **edita** el token y el nuevo es de otra app de Meta, el id sigue igual. El proceso seguiría sirviendo el app id viejo hasta reiniciar. Es dentro de la misma empresa, así que no rompe R28.
- **Fix:** guardar en la entrada una huella del token, como hace `RutasPorEmpresa.huellaDe`, y exigir que coincida.

**m3. menor: dependencias sin uso.**
- **Dónde:** `package.json:36` (`@vercel/oidc`) y `:43` (`google-auth-library`) quedaron sin consumidor al borrarse WIF y ADC. Siguen citadas en comentarios: `lib/services/OptimizacionRutaService.ts:119` y `lib/logging/optimizer-log.ts:80`.
- **Fix:** anotarlo en `progress/deudas.md` para que el humano decida quitarlas, y ajustar los comentarios cuando se quiten.

**m4. menor: la aserción de forma de R5 en el test de base es más laxa que el contrato.**
- **Dónde:** `tests/integration/db/integracion-dos-empresas.test.ts:230` comprueba `^v[1-9][0-9]*:[A-Za-z0-9_-]+`, un prefijo con un alfabeto base64url que la bóveda no usa.
- **Consecuencia:** hoy lo cubre el CHECK `integracion_secretos_cifrados`, probado en `integracion-migracion.test.ts`, así que no hay hueco real.
- **Fix:** afirmar la forma completa `v<n>:<iv16>:<tag24>:<ct>` en base64 estándar, igual que el CHECK.

### Para la vuelta 2

Revisar solo:
- la evidencia de B1;
- lo que se toque por m1-m4, si se toca.
