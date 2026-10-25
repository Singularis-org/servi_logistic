# SL-36 · T5.3 + T5.4 — webhook por empresa y recifrado (backend_dev)

Fecha: 2026-10-25. Rama `feature/SL-36-integraciones-por-empresa`. Sin commit (lo hace el leader).
En paralelo otro backend_dev hace T5.1/T5.2; no se tocaron sus archivos.

## Archivos

Creados:
- `lib/interfaces/services/IWebhookWhatsappService.ts` — resultados sin HTTP (`ok`/`forbidden`, `ok`/`unauthorized`).
- `lib/services/WebhookWhatsappService.ts` — GET y POST de design §10; exporta tambien `firmaValida`.
- `lib/interfaces/services/IRecifradoIntegracionesService.ts` — `OpcionesRecifrado`, `ResumenRecifrado`.
- `lib/interfaces/repositories/IIntegracionRecifradoRepository.ts` + `lib/repositories/IntegracionRecifradoRepository.ts`
  — `listarSecretos()` y `reemplazarSecretos(id, anteriores, nuevos)`, empresa del contexto en el `where`.
- `lib/services/RecifradoIntegracionesService.ts` — design §12.
- `scripts/recifrar-integraciones.ts` — cableado + `ejecutarRecifrado(servicio, argv, salida)` + `lineasDelResumen`.
- `tests/unit/services/webhook-whatsapp-service.test.ts` (10 tests).
- `tests/integration/db/recifrado-integraciones.test.ts` (3 tests, Postgres real, dos empresas).

Modificado: `package.json` (solo `"integraciones:recifrar": "tsx scripts/recifrar-integraciones.ts"`).

## Firma del service del webhook (para T6.2)

```ts
new WebhookWhatsappService(deps: WebhookWhatsappDeps)
interface WebhookWhatsappDeps {
  enrutado: IIntegracionEnrutadoRepository;               // new IntegracionEnrutadoRepository(prisma)
  resumidor: Pick<IResumenSecreto, "resumen">;           // new ResumenSecretoSha256()
  leerAppSecret: (integracionId: string) => Promise<string | null>;  // se llama YA en conEmpresa
  anotarWebhook: (integracionId: string, at: Date) => Promise<void>; // IntegracionRepository.anotarWebhook
  ingesta: { ingerirEventos(eventos: WebhookEventos): Promise<IngestaResumen> }; // ChatWhatsappService
  entregaEstado: () => IEntregaEstadoService;            // fabrica, como buildEntregaEstadoService
  logger: ChatLogger;                                    // consoleLogger
  depuracion?: (mensaje: string, detalle: string) => void; // default console.log
  reloj?: () => Date;
}
verificar({ mode, token, challenge }: { mode: string|null; token: string|null; challenge: string|null })
  : Promise<{ status: "ok"; challenge: string } | { status: "forbidden" }>
recibir({ cuerpoCrudo, firma }: { cuerpoCrudo: string; firma: string | null })   // firma = header x-hub-signature-256
  : Promise<{ status: "ok"; resumen: IngestaResumen } | { status: "unauthorized" }>
```

Adaptador sugerido de `leerAppSecret` sobre T5.2:
`async (id) => { const r = await credenciales.leer("whatsapp"); return r.estado === "lista" && r.integracionId === id ? r.credencial.app_secret : null; }`

Route en T6.2: GET -> `ok` = 200 text/plain con el challenge, `forbidden` = 403; POST -> `ok` = 200
`{ ok: true, ...resumen }`, `unauthorized` = 401. El service ya NO necesita `metadata` en
`lib/types/whatsapp-webhook.ts`: lee `phone_number_id` con su propio zod laxo y pasa al parser de siempre
solo los `changes` de cada empresa. T6.2 puede dejar ese archivo como esta (desviacion 1).

## R → test

| R | Test | Estado |
|---|---|---|
| R19 | `tests/unit/services/webhook-whatsapp-service.test.ts` › «GET: challenge solo con resumen conocido; 403 si no; anota el último webhook» (+ «GET sin modo subscribe…», «GET: si anotar… falla») | verde |
| R20 | idem › «POST: empresa por número, firma con su App Secret, ingesta en su contexto» + «POST con eventos de dos empresas: cada una solo con su firma, sus eventos y su contexto» | verde (la parte de base real es de T6.2) |
| R21 | idem › «número desconocido o firma inválida: descartado; ninguno válido: 401 sin efectos» (+ «POST sin firma… 401 sin leer la base», «sin App Secret legible», «el log… solo conteos») | verde |
| R39 | `tests/integration/db/recifrado-integraciones.test.ts` › «recifra a la activa en dos empresas; conteo por versión e ilegibles; no imprime valores» | verde, base real |
| R40 | idem › «--solo-contar no escribe» | verde, base real |

## Mutaciones (todas restauradas; suite verde despues)

| Mutacion | Resultado |
|---|---|
| Webhook: el App Secret se lee una vez y se reusa para las demas empresas del POST (evento de A verificado con el secreto de B) | ROJO: «POST con eventos de dos empresas…» |
| Webhook: quitar `!firmaValida(...)` | ROJO: 3 tests (dos empresas, firma invalida/401, log de descartes) |
| Recifrado: `--solo-contar` escribe (`if (version === activa) continue`) | ROJO: «--solo-contar no escribe» |
| Recifrado: sin `organizacionId` en el `where` de `listarSecretos` | ROJO: los dos casos de R39/R40 |
| Recifrado: imprimir cada valor guardado por stdout | ROJO: los dos casos (espia de stdout/console) |

## Comandos (salida real resumida)

- `pnpm run typecheck` → `tsc --noEmit` sin errores.
- `pnpm run lint` → `0 errors, 232 warnings` (ninguno en mis archivos; `eslint` de mis 9 archivos: «No issues found»).
- `pnpm run test:guardias` → `Test Files 2 failed | 303 passed | 2 skipped`; `Tests 5 failed | 4180 passed`.
  Los rojos: `dependencias-declaradas-presentes` (4, en `tests/baseline-rojos.json`) y
  `ayuda-pantalla-ruta-existe` (1: `oficina/configuracion-integraciones.md -> /configuracion/integraciones`,
  guias del trabajo en paralelo sin la pagina de T7 todavia; no es de esta tanda).
  `plataforma-solo-en-lista` y las de historial, verdes.
- `pnpm exec vitest run tests/unit/services/webhook-whatsapp-service.test.ts` → 10 passed.
- `pnpm exec vitest run tests/integration/db/recifrado-integraciones.test.ts` (con la DATABASE_URL de la feature) → 3 passed, 0 skipped.
- `pnpm exec vitest related --run <mis 7 archivos de lib/scripts>` → `Test Files 2 passed`, `Tests 13 passed`.

## Desviaciones y decisiones

1. **`metadata` sin tocar `whatsapp-webhook.ts`.** El service extrae `phone_number_id` con un zod laxo por
   `change` y reparte los `changes` por empresa antes del parser de siempre. Granularidad `change` (no
   `entry`): es ahi donde vive `metadata`.
2. **Cuerpo sin JSON o sin numero → 401** (antes, con firma valida, 200 + volcado): sin numero no hay App
   Secret con que verificar (R21). El volcado de depuracion `WP - type other` solo ocurre ya con la firma
   validada, y vuelca el JSON del lote de la empresa (no el crudo entero).
3. **Firma sin `sha256=` → 401 sin leer la base**; GET sin token/challenge → 403 sin leer la base.
4. **`leerAppSecret` va antes de la firma** (lo exige design §10.4): si la credencial es ilegible, la
   lectura real de T5.2 la deja en `error` (R29) antes de validar. Es idempotente y refleja un estado real.
5. **Fallo al anotar `ultimo_webhook_at`**: se avisa (solo el nombre del error) y no cambia el challenge ni el 200.
6. **Un error de base en la ingesta se propaga** (500, Meta reintenta), como hacia el route.
7. **Recifrado — repositorio propio** (`IntegracionRecifradoRepository`) en vez de usar `actualizar`: recifrar
   no es accion del maestro, no deja historial ni cambia el estado. `updateMany` con `secretos: { equals:
   anteriores }`: una sentencia por fila (atomica) que no pisa una edicion concurrente (cuenta `conflictos`).
8. **Sin excepcion de plataforma nueva**: `paraCadaEmpresa` (lectura de SL-17 ya listada) y cada empresa en
   `conEmpresa`. El error de una empresa se cuenta y NO se propaga, para que `paraCadaEmpresa` no vuelque el
   mensaje de Prisma (lleva los cifrados); con `empresasConError > 0` el comando sale 1 y avisa de que el
   conteo esta incompleto.
9. **Semantica del conteo**: `porVersion` cuenta los valores LEGIBLES en la version en que quedan (tras
   recifrar: todos en la activa; con `--solo-contar`: como estan hoy). Los ilegibles van aparte y nunca se
   tocan. Se descifran tambien los de la version activa para contar sus ilegibles.
10. **Argumento desconocido → salida 1** sin repetirlo (podria ser una clave pegada).
11. No se marcaron T5.3/T5.4 en `tasks.md` para no chocar con el trabajo en paralelo: lo hace el leader.

Veredicto: T5.3 y T5.4 hechas y verdes (unit + Postgres real), con 5 mutaciones en rojo; el route queda para T6.2.
