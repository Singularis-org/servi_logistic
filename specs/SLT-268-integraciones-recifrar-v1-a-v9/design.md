# SLT-268 «Integraciones: pasar las credenciales de v1 a v9 desde servi» — design

## Lo que ya existe

Términos buscados el 2026-11-26:
- `recifr`, `CLAVES_CIFRADO_EXTRA`, `v9` en `specs/` y en los títulos de `feature_list.json`;
- `leerAnilloDeClaves`, `IntegracionRecifrado`, `CRON_SECRET` y `SELF_AUTH_ROUTES` en el código.

Ninguna ficha ni spec cubre una segunda variable de claves ni un disparador del recifrado dentro del
runtime. Lo que apareció se REUTILIZA:

| Qué | Dónde | Uso aquí |
|---|---|---|
| Anillo de claves (`v<n>:<base64>`, activa, `ConfiguracionBovedaError` sin valores) | `lib/config/integraciones.ts > leerAnilloDeClaves` | Se extiende (D2): es el único punto por el que pasa todo el que cifra o descifra (`lib/crypto/boveda-integraciones.ts`, `lib/actions/_shared/integraciones.ts`, el script) |
| Regla del recifrado: cuenta por versión, recifra a la activa, deja los ilegibles, CAS sobre el JSON, no saca valores | `lib/services/RecifradoIntegracionesService.ts` (SL-36 design §12) | Sin cambios (D5) |
| Acceso a `integracion` para el recifrado | `lib/repositories/IntegracionRecifradoRepository.ts` | Sin cambios |
| Cableado de consola `pnpm integraciones:recifrar [--solo-contar]` | `scripts/recifrar-integraciones.ts` | Molde del cableado de la ruta. No se toca (D12): su cabecera no nombra la variable nueva, que queda documentada en `lib/config/integraciones.ts` |
| Recorrer empresas en su contexto | `lib/db/para-cada-empresa.ts > paraCadaEmpresa` | Igual que el script |
| Patrón de ruta cron: `Bearer CRON_SECRET` vía `loadCronConfig()`, 401 sin efectos, deps inyectables | `app/api/cron/purga-descargas/route.ts` y otras 11 | Molde de la ruta nueva |
| `middleware.ts` deja pasar `/api/cron/*` (`SELF_AUTH_ROUTES`) | `middleware.ts:34` | Sin cambios: la ruta se autentica sola |
| Test del recifrado contra Postgres real (transacción revertida, `cliente` doble de `paraCadaEmpresa`) | `tests/integration/db/recifrado-integraciones.test.ts` | Molde. No se toca (D12): los casos de R9 a R12 y R17 van en `tests/integration/db/recifrado-integraciones-extra.test.ts`, que reutiliza sin modificarlos `tests/integration/db/_postgres-real.ts` y `tests/fabricas/organizaciones.ts`. Los helpers locales de ese archivo, como `revertida`, se copian: no están exportados y exportarlos sería tocarlo |

No es un «ya existe» que bloquee: el script corre en local y en local no está `v1`. La pieza que
falta es correr esa misma regla en un proceso que tenga `v1` en su entorno, y ese proceso solo es
el runtime de servi en Vercel.

## Qué escribe hoy el recifrado (para R12)

Leído entero el 2026-11-26:
- **`RecifradoIntegracionesService.ejecutar`** solo escribe a través de
  `repositorio.reemplazarSecretos(fila.id, fila.secretos, nuevos)`, y solo cuando `aMover > 0` y no
  es `soloContar` (líneas 100-105). No marca estado, no registra errores y no toca fechas. Un valor
  ilegible no se mueve (línea 96); los demás campos de esa misma fila sí se recifran. Si la base
  falla en una empresa, se cuenta en `empresasConError` y no se propaga el mensaje.
- **`IntegracionRecifradoRepository.reemplazarSecretos`** es un único
  `prisma.integracion.updateMany({ where: { id, organizacionId, secretos: { equals: anteriores } }, data: { secretos: nuevos } })`.
  - `data` solo lleva `secretos`.
  - **Prisma añade `updated_at`** por el `@updatedAt` del modelo `Integracion`
    (`db/schema.prisma`, «updatedAt … @updatedAt»). Es la única columna que cambia además de
    `secretos`. Carlos lo aceptó el 2026-11-26 (`requirements.md`, D8), así que el repositorio no
    se toca.
  - Las demás columnas no se tocan: `estado`, `datos_publicos`, `ultimo_error_codigo`,
    `ultima_prueba_at`, `ultimo_webhook_at`, `whatsapp_*`, `organizacion_id` y `created_at`.
- **Otras tablas:** el cliente del repositorio está tipado como `Pick<PrismaClient, "integracion">`,
  así que no puede alcanzar otra tabla; lo garantiza el typecheck.
- **Triggers de `integracion`:** solo está `integracion_sin_cambio_de_empresa`
  (`db/migrations/20261025120000_integracion/migration.sql:82`), que impide cambiar
  `organizacion_id` y no escribe.

Conclusión: el código actual ya cumple D7. R12 lo fija con un test para que no se rompa en el futuro.

## 1. Anillo: `INTEGRACIONES_CLAVES_CIFRADO_EXTRA` (R1-R5)

Cambio en `lib/config/integraciones.ts`. No cambia la firma pública:
`leerAnilloDeClaves(env = process.env): AnilloDeClaves`.

- Nueva constante exportada: `VARIABLE_CLAVES_CIFRADO_EXTRA = "INTEGRACIONES_CLAVES_CIFRADO_EXTRA"`.
- `leerEntrada(entrada, posicion)` pasa a recibir también el **nombre de la variable**, para que el
  mensaje nombre la que falla (R3). Hoy tiene `VARIABLE_CLAVES_CIFRADO` fijo en el texto. Los
  mensajes de `INTEGRACIONES_CLAVES_CIFRADO` quedan idénticos, carácter por carácter (R2).
- Orden de lectura:
  1. la principal, como hoy;
  2. si `env[EXTRA]?.trim()` no está vacía, sus entradas en el mismo `Map`, en orden.

  Una versión ya presente lanza `ConfiguracionBovedaError(`${EXTRA}: la entrada ${i} repite una version anterior`)`
  (R4). Vale tanto si se repite con la principal como dentro de la propia variable. El mensaje es el
  mismo que ya existe, con el nombre de la variable.
- La comprobación de la activa no cambia de lugar. Si falta, el mensaje pasa a nombrar las dos
  variables cuando `EXTRA` está presente (R5). Sin `EXTRA`, queda el texto de hoy (R2).
- Ausente o vacía = como hoy (R2). Se trata igual que vacía porque Vercel permite guardar una
  variable vacía, y fallar ahí tumbaría todas las integraciones por un campo en blanco.
- **Invariante:** ningún mensaje lleva un valor ni la etiqueta de una versión de la variable extra.
  Es la misma regla que la cabecera del archivo (QC inv. 13).
- **Documentación (D12):** la variable se documenta en el comentario de cabecera de
  `lib/config/integraciones.ts`, no en `.env.example`. El comentario explica que es opcional, que
  tiene la misma forma que la principal, que sus versiones no pueden repetir las de la principal y
  para qué existe (añadir una clave sin reescribir una variable Sensitive).

`BovedaIntegraciones` no cambia: descifra por la versión del prefijo y cifra con la activa. Al
fusionar en `leerAnilloDeClaves`, la pantalla de integraciones, el script y la ruta quedan
cubiertos a la vez.

## 2. Disparador `POST /api/cron/recifrar-integraciones` (R6-R16)

Archivo `app/api/cron/recifrar-integraciones/route.ts`. Capa Controller; la regla está en el
servicio.

```ts
export const runtime = "nodejs";
export const maxDuration = 60;

export interface RecifrarIntegracionesDeps {
  getSecret?: () => string | null;              // por defecto loadCronConfig().CORTE_DIARIO_SECRET
  servicio?: () => IRecifradoIntegracionesService; // por defecto construirServicioRecifrado()
}

/** Composition root. La misma forma que `scripts/recifrar-integraciones.ts > main`. */
export function construirServicioRecifrado(deps?: {
  prisma?: Pick<PrismaClient, "integracion">;   // por defecto getPrismaClient()
  env?: Readonly<Record<string, string | undefined>>; // por defecto process.env, leído en cada llamada
  recorrerEmpresas?: RecifradoDeps["recorrerEmpresas"]; // por defecto (fn) => paraCadaEmpresa(fn)
}): IRecifradoIntegracionesService;
// cifrador: new BovedaIntegraciones(() => leerAnilloDeClaves(env))
// versionActiva: () => leerAnilloDeClaves(env).activa

export async function handleRecifrarIntegraciones(req: Request, deps?: RecifrarIntegracionesDeps): Promise<NextResponse>;
export async function POST(req: Request) { return handleRecifrarIntegraciones(req); }
// NO se exporta GET (R7): Next responde 405.
```

Orden dentro de `handleRecifrarIntegraciones`:
1. **Autorización (R6).** La misma comprobación que `purga-descargas`: Bearer contra
   `CRON_SECRET`, y 401 `{ error: "unauthorized" }` si falta, es distinto o el secreto no está
   configurado. Todavía no se ha construido el servicio ni se ha leído el anillo.
2. **Parámetros (R8).** `new URL(req.url).searchParams`:
   - sin parámetros, recifra;
   - exactamente `solo-contar=1`, solo cuenta;
   - cualquier otra cosa (otra clave, otro valor, la clave repetida) da 400
     `{ error: "parametro_no_reconocido" }`, sin repetir lo recibido (como el script: alguien podría
     pegar una clave ahí).

   Una errata como `?solo_contar=1` NO recifra.
3. **Ejecutar.** `servicio().ejecutar({ soloContar })` dentro de un `try` propio.
   - `ConfiguracionBovedaError` da 500 `{ error: "configuracion_boveda" }` (R15). El servicio lee
     `versionActiva()` antes de recorrer empresas (`RecifradoIntegracionesService.ts:44`), así que la
     base no se toca.
   - Cualquier otro error da 500 `{ error: "recifrado_fallido" }`. Al log solo va el nombre y el
     código del error, como `rastroDelError` del script, nunca el `message`: el de Prisma lleva los
     argumentos de la consulta, cifrados incluidos.
   - No se usa `withErrorHandler`: no está demostrado que no vuelque el mensaje al log, y el script ya
     tomó esta misma decisión.
4. **Responder (R13, R14).** Un objeto con exactamente las claves de `ResumenRecifrado`, copiadas una
   a una (no un spread del resultado). Status 200, o 500 si `empresasConError > 0`.

**Contrato de salida (200):**
```json
{ "soloContar": true, "versionActiva": "v9", "porVersion": { "v1": 3 }, "ilegibles": 0,
  "recifrados": 0, "conflictos": 0, "empresasConError": 0 }
```
A diferencia de `purga-descargas`, no se devuelven ids de empresa (R13; SL-36 R39).

**`vercel.json`:** no se toca (R16). El guardia `tests/unit/guards/cron-hora-cr.guardia.test.ts` ya
cuenta 11 crons, y seguirá contando 11.

## 3. Multi-empresa, autorización, módulos y país

- **Tablas, RLS y únicos:** ninguno nuevo. El recorrido es el de SL-36: `paraCadaEmpresa` pone cada
  empresa en su contexto, y el repositorio filtra por `organizacionId` en el `where` además de la RLS
  (`docs/architecture.md > Multi-empresa`). Listar las empresas es la lectura de plataforma de SL-17,
  que ya está en la lista de excepciones.
- **Autorización:** en el route handler, con `CRON_SECRET` (operación de plataforma, como las demás
  `/api/cron/*`). No hay sesión ni módulo que comprobar: es la misma operación que hoy hace el
  superadmin con `pnpm integraciones:recifrar`.
- **Migraciones:** ninguna (D3).
- **Datos por país:** ninguno.
- **Dependencias nuevas:** ninguna.

## 4. Sale a prod sola (D4)

La release se hace por cherry-pick sobre `origin/prod` (4e4f7b39). Todo lo que importa la ruta nueva
tiene que existir con la misma forma en prod:
- `lib/config/integraciones.ts`, `lib/config/cron.ts`;
- `lib/crypto/boveda-integraciones.ts`;
- `lib/db/para-cada-empresa.ts`, `lib/db/prisma-client.ts`;
- `lib/repositories/IntegracionRecifradoRepository.ts`, `lib/services/RecifradoIntegracionesService.ts`;
- `lib/interfaces/services/IRecifradoIntegracionesService.ts`;
- y lo que importan los tests: `tests/unit/config/integraciones-config.test.ts`, que se amplía,
  `tests/integration/db/_postgres-real.ts` y `tests/fabricas/organizaciones.ts`.

El leader afirma que el código de cifrado es idéntico. No he podido comprobar el resto (`lib/config/cron.ts`,
`para-cada-empresa`, `prisma-client`) porque no tengo shell: lo comprueba T0 con un `git diff` contra
`origin/prod`. Si algo difiere, la ruta se ajusta a lo que hay en prod; no se trae código de `dev`.

## 5. Tests (todas las claves se generan en el test: `randomBytes(32)` o `Buffer.alloc(32, n)`)

| Archivo | Qué prueba | R |
|---|---|---|
| `tests/unit/config/integraciones-config.test.ts` | Fusión de las dos variables. EXTRA ausente, vacía o con espacios = anillo y mensajes de hoy (comparados con un literal, no con la función). EXTRA mal formada o de otro tamaño = error con la variable EXTRA y la posición, sin la base64 ni la versión. Versión repetida entre las dos o dentro de EXTRA. Activa en EXTRA válida. Activa ausente de las dos = error | R1-R5 |
| `tests/unit/api/cron-recifrar-integraciones.test.ts` | Con un servicio doble (`servicio: () => doble`): sin cabecera, con secreto erróneo o con secreto no configurado = 401 y la fábrica del servicio no se llama. Parámetros raros = 400 sin eco. `?solo-contar=1` llama con `soloContar: true` y sin parámetros con `false`. El body tiene exactamente las 7 claves y no contiene ninguna de las claves base64 del test, ni un texto `v1:`/`v9:` cifrado, ni un id. `empresasConError > 0` = 500 con resumen. `ConfiguracionBovedaError` = 500 `configuracion_boveda` sin valores. Otro error con un `message` que incluye un texto cifrado = 500 sin ese texto en el body ni en el log espiado. El módulo no exporta `GET`. `vercel.json` no tiene un cron con este path | R6-R8, R13-R16 |
| `tests/integration/db/recifrado-integraciones-extra.test.ts` (archivo nuevo, D12) | Con Postgres real y transacción revertida, el servicio sale de `construirServicioRecifrado({ prisma: tx, env, recorrerEmpresas })` con `env` = `{ CLAVES: v1, EXTRA: v9, ACTIVA: v9 }`, que también cubre la composición. Siembra: una integración con dos secretos en v1, `estado = error`, `ultimo_error_codigo`, `ultima_prueba_at` y `datos_publicos` con valor. Se comprueba: (a) solo-contar deja la fila idéntica, `updated_at` incluido (R9); (b) recifrar cambia solo `secretos` (y `updated_at`) y las demás columnas quedan iguales a la foto previa (R12); (c) todos los valores en `v9:` se descifran con `new BovedaIntegraciones(() => soloV9)` al mismo texto sembrado (R10, R17); (d) la segunda corrida da `recifrados: 0` y la fila queda idéntica, `updated_at` incluido (R11) | R9-R12, R17 |

**Mutaciones que deben poner rojo** (las anota el implementer en `progress/impl_SLT-268.md`):
- quitar la lectura de EXTRA: rojo R1/R5;
- `solo-contar` que no pasa `soloContar: true`: rojo R9;
- responder `...resumen` más un campo extra: rojo R13;
- comprobar el secreto después de construir el servicio: rojo R6;
- aceptar `solo_contar` como alias: rojo R8.

## 6. Alternativas descartadas

1. **Correr el recifrado en el build de Vercel.** El build ve las variables Sensitive, pero:
   - mutaría la base de prod en cada despliegue, también en un rollback o un redeploy;
   - el build de Preview corre con otras variables;
   - no hay modo solo-contar observable antes de escribir;
   - un fallo tumbaría el despliegue.

   Mezcla desplegar con migrar datos.
2. **Reescribir `INTEGRACIONES_CLAVES_CIFRADO` añadiendo `v9`.** Imposible: es Sensitive, nadie
   puede leer el valor actual, y reescribirla perdería `v1` para siempre. Por eso existe D2.
3. **Recifrar «en caliente» al leer cada credencial.** Ya descartada en SL-36 design §12: una
   integración que nadie usa en servi (aquí, optimizacion_rutas) no se recifraría nunca. Además,
   dependería de que la empresa usara servi y no Ordenex.
4. **Botón en una pantalla del superadmin (Server Action).** Necesita UI, `/design` y permisos de
   plataforma, para una operación que se hace una vez. La ruta con `CRON_SECRET` reutiliza un
   mecanismo de autenticación que ya existe.
5. **`GET` como las otras rutas cron.** Esas rutas son `GET` porque Vercel Cron llama con `GET`.
   Esta no la llama Vercel Cron, y modifica datos: con `POST`, una vista previa de enlace o un
   prefetch no la dispara ni por accidente.
6. **Comparar el secreto en tiempo constante (`crypto.timingSafeEqual`).** Se queda el mismo `!==`
   de las 12 rutas cron, por coherencia. Cambiarlo solo aquí no protege a las otras; si se quiere,
   es una ficha aparte para todas.
