# SL-36 · T7.1 (Server Actions de `/configuracion/integraciones` y composition root) — bitácora de backend_dev

> Parcial de T7. El implementer la funde en `impl_SL-36.md`. Sin commit (lo hace el leader).
> MCP del grafo no consultado: todo lo leído es código de esta feature o patrones puntuales
> (`lib/actions/api-keys.ts`, `geografia.composition-root.test.ts`), leídos con Read/Grep.

## Archivos

Creados:
- `lib/actions/integraciones.ts` ("use server"): las seis actions y sus tipos de resultado.
- `lib/actions/_shared/integraciones.ts` (SIN "use server"): `dependenciasIntegraciones`,
  `construirIntegracionesService`, `urlWebhookWhatsapp`, `RUTA_WEBHOOK_WHATSAPP`. Va fuera del
  archivo de actions porque ahí toda función exportada es un endpoint público, y para que un test vea
  qué se pasa.
- `tests/unit/actions/integraciones-actions.test.ts` (borde, service doble).
- `tests/unit/actions/integraciones.composition-root.test.ts` (root real con Prisma falso).

Modificado:
- `lib/types/integraciones.ts`: solo `ResultadoInesperadoIntegracion` (aditivo).

## Firmas para frontend_dev (T7.2)

Todas aceptan un `deps` opcional solo para tests; la UI NO lo pasa. Ninguna recibe el actor ni la
empresa: salen de la sesión (R7). Todas pueden devolver además
`{ status: "unexpected"; referencia: string; texto: string }` (`ResultadoInesperadoIntegracion`):
mostrar `texto` («Algo falló al guardar. Si se repite, comparte la referencia con soporte.») y la
`referencia`.

Importar tipos con `import type { … } from "@/lib/actions/integraciones"`. `VistaIntegracion` sale de
`@/lib/interfaces/services/IIntegracionesService`. Lo estático de cada servicio (nombre, marca,
`queDejaDeFuncionar` de R31, `guia` de R35, `campos` con `secreto`/`multilinea` de R36) sale de
`CATALOGO_INTEGRACIONES` en `@/lib/types/integraciones` y los textos de error de
`TEXTOS_ERROR_INTEGRACION` (misma ruta).

```ts
// Lectura del Server Component de la página (no hay otra; no revalida)
listarIntegraciones(): Promise<ListarIntegracionesAccion>
//  { status: "ok"; servicios: VistaIntegracion[] }  // siempre los 4, en el orden SERVICIOS_INTEGRACION
//  | { status: "forbidden" }                         // texto: «No tienes permiso para acceder a esta sección.» (patrón /configuracion/api)
//  | unexpected

altaIntegracion(input: { servicio: ServicioIntegracion; campos: Record<string, string> }): Promise<AltaIntegracionAccion>
//  { status: "creada"; vista; verificacion?: { token; urlWebhook } }  // verificacion SOLO en whatsapp (R18). Revalida.
//  | { status: "prueba_fallida"; codigo; texto }    // mostrar `texto` (R13)
//  | { status: "ya_existe" } | { status: "numero_ocupado" }           // TEXTOS_ERROR_INTEGRACION[status]
//  | { status: "limite"; reintentarEnS: number }    // TEXTOS_ERROR_INTEGRACION.limite + los segundos
//  | { status: "invalid_input"; fieldErrors: Record<campo, string[]> } // texto propio, sin eco de lo escrito
//  | { status: "forbidden" } | unexpected

editarIntegracion(input: { id: string; campos: Record<string, string> }): Promise<EditarIntegracionAccion>
//  secreto vacío o ausente = conservar (R14)
//  { status: "guardada"; vista } (revalida) | prueba_fallida{codigo,texto} | { status: "credencial_ilegible" }
//  | { status: "no_encontrada" } | numero_ocupado | limite{reintentarEnS} | invalid_input{fieldErrors} | forbidden | unexpected

probarIntegracion(input: { id: string }): Promise<ProbarIntegracionAccion>
//  { status: "probada"; ok: true } | { status: "probada"; ok: false; codigo; texto }  // las dos revalidan (la prueba escribe el estado, R15)
//  | no_encontrada | limite{reintentarEnS} | forbidden | unexpected

regenerarTokenIntegracion(input: { id: string }): Promise<RegenerarTokenIntegracionAccion>
//  { status: "regenerado"; token; urlWebhook }  // NO revalida (R18) | no_encontrada | forbidden | unexpected

desconectarIntegracion(input: { id: string }): Promise<DesconectarIntegracionAccion>
//  { status: "desconectada"; servicio } (revalida) | no_encontrada | forbidden | unexpected
//  La confirmación con marca y `queDejaDeFuncionar` (R31) es de la UI, antes de llamar.
```

Textos: `credencial_ilegible`, `no_encontrada`, `ya_existe`, `numero_ocupado`, `limite`,
`invalid_input`, `forbidden` → `TEXTOS_ERROR_INTEGRACION[status]`. `prueba_fallida` y
`probada{ok:false}` traen su `texto`; no hay que resolverlo.

R18 en la UI: el `token` vive solo en el estado local del diálogo que lo muestra, nunca en props del
Server Component ni en almacenamiento. Regenerar no revalida a propósito; el alta sí (la tarjeta cambia
de estado), y el token tiene que sobrevivir a ese re-render solo en el estado del cliente.

**`@sin-superficie`:** cada action lleva la anotación con motivo «la página … llega en T7.2». La
guardia `superficie-de-uso` exige QUITARLA en cuanto la página la importe; T7.2 la borra de las seis.

## Composition root: dependencia → de dónde sale

| Dependencia | Valor en producción |
|---|---|
| `repo` | `new IntegracionRepository(getPrismaClient())` |
| `pruebas` | `new IntegracionPruebaMinutoRepository(getPrismaClient())` |
| `probadores` | `crearProbadores(process.env)` (único punto real/doble, design §15) |
| `cifrador` | `new BovedaIntegraciones(() => leerAnilloDeClaves(process.env))` (anillo de `lib/config/integraciones.ts`, leído en cada operación, R4) |
| `resumen` | `new ResumenSecretoSha256()` |
| `aleatoria` | `new FuenteAleatoriaCripto()` |
| `urlWebhook` | `baseUrlDeLaApp()` + `/api/webhooks/whatsapp`; sin base, el origen de la petición (`x-forwarded-host`/`host` + `x-forwarded-proto`) |
| `limitePorMinuto` | `() => pruebasPorMinuto(process.env)` (pasado explícito, no el defecto) |
| `reloj` | defecto del service (`new Date()`) — único opcional sin pasar, a propósito |
| historial | no es dependencia del service: lo escribe `IntegracionRepository` dentro de su transacción (`appendAccion`) |

El tipo `DependenciasIntegraciones` hace obligatorias todas menos `reloj`: una dependencia nueva del
service sin cablear no compila. El test la afirma con una lista cerrada de claves y la clase de cada
una, y un alta de WhatsApp por la action REAL (Prisma falso) recorre las ocho.

## Mapa R<n> → test (lo que toca T7.1)

| R | Test | Estado |
|---|---|---|
| R6 | `integraciones-actions.test.ts` › «SL-36/R6» (sin sesión pasa `null`, otro rol pasa tal cual; el rechazo es del service, ya probado en `integraciones-autorizacion.test.ts`) | verde |
| R7 | ídem › «SL-36/R7» (entrada con `organizacionId`/`actor`/`usuarioId` ajenos: el service recibe el actor de la sesión en las seis) + composition-root › `findMany`/`findFirst` con la empresa de la sesión | verde |
| R9 | ídem › «SL-36/R9» (id no texto → `""` → `no_encontrada`; alta sin cáscara → `invalid_input`) | verde |
| R12-R16, R32 (borde) | ídem › «qué resultados revalidan la pantalla» (12 casos) | verde |
| R12, R18 (root real) | composition-root › «un alta de WhatsApp recorre TODAS las dependencias reales» (cifrado `v1:`, SHA-256 del token, id UUID, contador, historial, URL) | verde |
| R18 | actions › «SL-36/R18» (token solo en alta/regenerar; listar siguiente sin token; regenerar no revalida) | verde (recarga en HTML: T9) |
| R4 | composition-root › bóveda lee el entorno en cada operación; alta sin anillo → `unexpected` sin escribir | verde |
| R16 | composition-root › el límite sale del entorno pasado, en cada prueba | verde |
| design §15 | composition-root › producción con el doble pedido → probadores reales (la alta llama a `fetch` y no escribe); fuera → doble | verde |
| Sin secretos en errores/log | actions › «lo que el service lanza sale como `unexpected`» (mensaje con secreto no llega ni al resultado ni al log) | verde |
| R31, R34-R36 | son de UI (T7.2) | — |

## Mutaciones (script en el scratchpad, cada una aplicada, medida y revertida)

| Mutación | Resultado |
|---|---|
| root sin `limitePorMinuto` | ROJO 2 |
| probadores siempre doble | ROJO 2 |
| bóveda con `process.env` en vez del entorno pasado | ROJO 1 |
| límite con `process.env` en vez del entorno pasado | ROJO 1 |
| la action pasa `null` en vez del actor | ROJO 9 |
| probar revalida solo si ok | ROJO 1 |
| regenerar revalida | ROJO 1 |
| log con `error.message` en vez del nombre | ROJO 3 |
| URL del webhook sin la ruta | ROJO 4 |

## Salida de verificación

- Mis tests: `Test Files 2 passed (2) · Tests 35 passed (35)`.
- `pnpm exec vitest related --run lib/actions/integraciones.ts lib/actions/_shared/integraciones.ts`:
  `Test Files 2 passed (2) · Tests 35 passed (35)`.
- `pnpm run typecheck`: exit 2, ningún error en mis archivos; todos en archivos de T6 en curso del otro
  backend_dev (`whatsapp-app-id`, `whatsapp-webhook-config`, `ejecucion-envio-service`,
  `plantilla-enviar-aprobacion-sin-app-id`, `whatsapp-template-port-documento`).
- `pnpm exec vitest related --run lib/types/integraciones.ts` (mi cambio es solo un tipo, aditivo):
  `Test Files 1 failed | 222 passed | 10 skipped (233) · Tests 1 failed | 3112 passed | 54 skipped`;
  el rojo es `ayuda-pantalla-ruta-existe` (conocido). Una corrida anterior dio 16 rojos de webhook de
  WhatsApp mientras T6 estaba a medias; en la repetición ya no estaban.
- `pnpm run lint`: exit 0.
- `eslint` sobre mis 5 archivos: «No issues found».
- `pnpm run test:guardias`: `Test Files 2 failed | 303 passed | 2 skipped (307) · Tests 5 failed | 4180 passed`.
  Solo los dos conocidos: `dependencias-declaradas-presentes` (4, baseline) y `ayuda-pantalla-ruta-existe`
  (1, se cierra en T7.2). `superficie-de-uso`, `use-server-exports-async` y
  `use-server-sin-reexport-de-tipos`: verdes.
- LF: 0 `\r` en los cinco archivos.

## Desviaciones y decisiones

1. **Sin `unauthenticated`.** El contrato del service toma `null` = sin sesión y responde `forbidden`;
   la action no lanza `UnauthenticatedError` como `api-keys`. Así R6 vive en un solo sitio.
2. **La action no valida los campos**: solo la cáscara (`servicio`/`id` texto, `campos` desconocido).
   El esquema por servicio está en el service (T5a, desviación 2). Cáscara inválida → valor que el
   service ya trata (`""`), así no hay un texto de error distinto para R9.
3. **`unexpected` con referencia `randomUUID()`**; al log `console.error("[integraciones] <op> falló",
   { referencia, error: <name>, codigo? })`. Sin `message`: el de Prisma cita los argumentos (secretos
   cifrados). Cubre también un fallo al resolver la sesión.
4. **URL del webhook sin `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL`**: el origen de la petición; sin
   cabecera, la ruta sola. Una cabecera falsa solo engaña a quien la mandó.
5. **`limitePorMinuto` se pasa explícito** (no el defecto del service) para que el root reciba un
   entorno y el test lo pueda medir.
6. **El root está en `lib/actions/_shared/integraciones.ts`**, archivo nuevo fuera del encargo literal:
   una factoría síncrona no puede exportarse de un "use server" y no debe ser un endpoint.

## Veredicto

T7.1 hecho: seis actions y root completo con 35 tests en verde y 9 mutaciones en rojo; typecheck,
lint y guardias limpios en lo mío. Pendiente de T7.2: quitar los `@sin-superficie`.
