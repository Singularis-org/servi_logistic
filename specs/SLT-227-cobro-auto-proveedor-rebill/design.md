# SLT-227 «Cobro automático: interfaz de proveedores y adaptador de Rebill» — design

> Requisitos: `requirements.md` (R1–R27). Escrito por `spec_author` el 2026-11-21.
> - Hay una migración nueva con su `down.sql` y una tabla nueva **de plataforma**, `cobro_proveedor_credencial`.
> - **No hay dependencias nuevas:** `fetch` y `node:crypto` de Node, zod y Prisma, que ya están.
> - Los montos viajan como `string` decimal, como en SLT-226. Nunca pasan por `Number`.
> - La forma de la API de Rebill sale de su doc v3, que leyó el leader el 2026-11-21 (P1–P5 resueltas; fuentes en
>   §6.1). Todo lo que depende de ella vive en un solo archivo, `lib/clients/cobro/rebill-proveedor.ts`, y en el
>   doble. P6–P8 las respondió el humano el 2026-11-21: un solo PR, `partially_refunded` ⇒ `aprobado` y
>   `cancelled` ⇒ `rechazado`.

## Lo que ya existe

Busqué el 2026-11-21 con los términos `rebill`, `proveedor`, `credencial`, `bóveda`/`boveda`, `recifr`, `x-api-key`,
`pasarela` y `VERCEL_ENV`. El grafo **no** tiene indexado este worktree (`index_status`: project not found), así que
exploré con Grep y Read.

- **El board** (`feature_list.json`): las fichas de EP-9 «Cobro automático del plan». Ninguna se solapa con esta. Las
  fronteras ya están en `requirements.md > Lo que NO entra`. Además:
  - SLT-234 «Cobro automático: panel del superadmin para cobros y proveedor» pasó la configuración del proveedor a
    SLT-251 «Cobro automático: medios y proveedor por país»;
  - SLT-228 «Cobro automático: webhook por proveedor y el de Rebill» usará `verificarFirma` y `consultarPago`.
- **`specs/`:** SL-36 (integraciones por empresa) es el dueño de la bóveda. SLT-226 «Cobro automático: modelo del cobro
  e idempotencia» es el dueño del puerto mínimo. Ningún spec define credenciales de plataforma.
- **El código:**

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| El puerto `IProveedorCobro` con `consultarPago` | `lib/interfaces/external/IProveedorCobro.ts` (SLT-226 §4.2) | **Se amplía** (§3). `consultarPago` no cambia de firma (R1, R27) |
| `PROVEEDORES_COBRO`, `METODOS_COBRO`, `CobroIntentoInvalido` | `lib/types/cobro.ts` | **Se reutilizan.** Nacen junto a ellos `ENTORNOS_COBRO` y `ProveedorCobroError` (§4) |
| `CobroIntentoService` con su `Map<ProveedorCobroId, IProveedorCobro>` | `lib/services/CobroIntentoService.ts` | **Solo cambia el tipo** del mapa a `IConsultaPagoProveedor` (§3). Su comportamiento no cambia (R27) |
| `BovedaIntegraciones` (AES-256-GCM, datos asociados, anillo versionado) e `ICifradorSecretos` | `lib/crypto/boveda-integraciones.ts`, `lib/interfaces/external/ICifradorSecretos.ts` | **Se reutiliza sin cambios** (R5, R7). El contexto de plataforma va en §8.1 |
| `leerAnilloDeClaves`, `ConfiguracionBovedaError` | `lib/config/integraciones.ts` | **Se reutilizan sin cambios** |
| El CHECK de forma cifrada `integracion_secretos_cifrados` | `20261025120000_integracion` | **Se copia** su expresión en la tabla nueva (R5) |
| `RecifradoIntegracionesService` y `pnpm integraciones:recifrar` | `lib/services/`, `scripts/recifrar-integraciones.ts` | **Se amplía** con una pasada de plataforma (§9.2, R13) |
| `IIntegracionRecifradoRepository` (`listarSecretos`, `reemplazarSecretos`) | `lib/interfaces/repositories/` | **Lo implementa** el repositorio nuevo, para el recifrado |
| `IFuenteAleatoria.nuevoId` | `lib/interfaces/external/IFuenteAleatoria.ts` | **Se reutiliza** para el id de la fila antes de cifrar (§8.2) |
| `esPlataforma` | `lib/auth/plataforma.ts` | **Se reutiliza** para R10 |
| El doble HTTP de Storage (Node puro, en memoria, `arrancarStorageFalso({ puerto })`) | `e2e/_storage-falso/servidor.mjs` | **Es el molde** del doble de Rebill (§11, R26) |
| `AbortSignal.timeout(this.timeoutMs)` y la traducción de `4xx`/`5xx` | `lib/clients/google-geocode.ts`, `whatsapp-cloud.ts`, `webhook-sender.ts` | **Es el molde** del tiempo máximo (§5) |
| `VERCEL_ENV === "production"` y no `NODE_ENV` | `lib/config/email.ts` | **Es el molde** del entorno (§2, R3) |
| Los actores opacos y sin FK de las tablas de plataforma | `plan_rastro.actor_usuario_id` (`20261028130000_plan`) | **Es el molde** de `actualizado_por` (§1) |

No se re-crea nada de lo anterior.

## 1. Modelo de datos: `cobro_proveedor_credencial` (de plataforma)

```
cobro_proveedor_credencial
  id               text PK                    -- lo genera el servicio antes de cifrar (§8.2)
  proveedor        text NOT NULL CHECK IN ('rebill','wompi','global66')
  pais_id          text NOT NULL FK pais(id) ON DELETE RESTRICT
  entorno          text NOT NULL CHECK IN ('sandbox','produccion')
  secretos         jsonb NOT NULL             -- { campo: "v<n>:<iv>:<tag>:<cifrado>" }
  actualizado_por  text NULL                  -- opaco y sin FK, como plan_rastro.actor_usuario_id
  created_at       timestamp(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
  updated_at       timestamp(3) NOT NULL
  CONSTRAINT cobro_proveedor_credencial_trio_key UNIQUE (proveedor, pais_id, entorno)
```

- **Es de plataforma, sin `organizacion_id`** (decisión del 2026-11-21). Va en `MODELOS_DE_PLATAFORMA`, como
  `cobro_webhook_evento`.
- **Acceso (R6):**
  - la RLS está encendida y sin políticas;
  - `REVOKE ALL ON cobro_proveedor_credencial FROM servi_app`, con el patrón de `historial_plataforma` y `bug_report`.
- **`cobro_proveedor_credencial_secretos_cifrados` (R5):** la expresión de `integracion_secretos_cifrados`, copiada
  literal, más `secretos <> '{}'::jsonb`. Corre para todos los roles, el dueño incluido.
- **El único del trío** no lleva `organizacion_id`, y no es un único de negocio. T0.3 comprueba si la guardia
  `unicos-por-empresa` mira las tablas de plataforma. Si las mira, el único va a `UNICOS_SIN_EMPRESA` con tipo
  `global` y a la lista de `docs/architecture.md`.
- **El estado del proveedor no se guarda aquí.** Qué proveedor y qué métodos usa cada país es de SLT-251.
- **Prisma:** el modelo `CobroProveedorCredencial` (`@@map("cobro_proveedor_credencial")`), con la relación a `Pais`.
  El CHECK de forma y el `REVOKE` viven solo en el SQL, como en SLT-226.
- **Sin historial (alternativa 4):** la fila guarda el último cambio (`actualizado_por`, `updated_at`).

### 1.1 La migración

`db/migrations/20261127120000_cobro_proveedor_credencial/`, con `BEGIN`/`COMMIT` escritos a mano, como en SLT-226.
- **El prefijo:** tiene que ser mayor que `20261126120000_mora_enums` y `20261126120100`, de SLT-121 «Planes: plazo
  de pago de la factura y operación congelada por mora» (PR #264, por mergear). T0.1 lo vuelve a comprobar contra
  `origin/dev` y los PR abiertos.
- **El nombre:** no puede contener «125». `20261127120000_cobro_proveedor_credencial` no lo contiene.

**`down.sql`:**
1. Aborta si la tabla tiene filas, con el molde de SLT-143 §3.7: borrar credenciales cargadas es una decisión
   humana, no un rollback.
2. `DROP TABLE cobro_proveedor_credencial`.

## 2. País y entorno

| Dato | De dónde sale |
|---|---|
| País | Lo recibe el registro (`obtener(proveedor, paisId)`, R2). Lo resuelve quien llama: SLT-230 con el país de la empresa, SLT-228 con el del aviso (§14) |
| Entorno | `entornoDeCobro(env = process.env)` en `lib/config/cobro.ts`: `env.VERCEL_ENV === "production" ? "produccion" : "sandbox"` (R3). Se lee **una vez**, en la construcción del registro, y no es parámetro de ninguna operación |
| URL base de Rebill | `URL_BASE_REBILL = "https://api.rebill.com"` en `lib/config/cobro.ts`. Es la misma en los dos entornos, porque el entorno lo define la key (P5). Lo que separa sandbox de producción es la fila de credenciales que se lee (R4) |
| Moneda del enlace | La pasa quien llama: la del intento (`moneda_cobro`). El adaptador no elige moneda |
| Impuestos, geografía | No aplican |

- **Por qué `VERCEL_ENV` y no `NODE_ENV`:** el E2E de CI corre `next start`, que es `NODE_ENV=production`. Con
  `NODE_ENV` el E2E saldría a producción. Es el mismo motivo de `lib/config/email.ts`.
- **Sin interruptor por país** (decisión del 2026-11-21): el país elige las credenciales, nunca el entorno.
- **Sin variable para la URL base.** Una variable permitiría apuntar producción a cualquier host. Los tests le pasan
  al adaptador la URL del doble por constructor (§6), y el E2E de SLT-231 decide cómo hacerlo en la app.
- **El límite de peticiones** de Rebill (1 200 lecturas y 300 escrituras por minuto por organización) queda muy por
  encima de lo que pide esta ficha. Un `429` se trata como en R21 y R24.
- **Constantes del transporte** (en `lib/config/cobro.ts`; son valores propuestos, sin medición detrás, como
  `PRUEBAS_POR_MINUTO_DEFECTO`):
  - `TIEMPO_MAXIMO_COBRO_MS = 10_000`: el de una petición. Un enlace o una consulta normales tardan bastante menos;
  - `ESPERAS_REINTENTO_CONSULTA_MS = [250, 1_000]`: dos esperas, así que son 3 intentos (R21). Así la consulta acaba
    en menos de 32 s, dentro de un job de SLT-228.

## 3. El puerto (`lib/interfaces/external/IProveedorCobro.ts`)

```ts
/** El puerto que ya usa SLT-226 (§4.2). Su firma no cambia (R1, R27). */
export interface IConsultaPagoProveedor {
  readonly proveedor: ProveedorCobroId;
  /** El estado REAL del pago. `null` si el proveedor no lo conoce. Lanza `ProveedorCobroError` si falla. */
  consultarPago(pagoProveedorId: string): Promise<PagoDelProveedor | null>;
}

export interface CrearEnlaceEntrada {
  intentoId: string;      // va en `metadata` (§6.2)
  facturaId: string;      // va en `metadata` (§6.2)
  monto: string;          // decimal en texto, > 0, dos decimales
  moneda: string;         // ISO 4217
  metodo: MetodoCobro;
  descripcion: string;    // p. ej. "Factura N.º 12 · Empresa A"; la arma quien llama (SLT-230)
}
export interface EnlaceDelProveedor { idExterno: string; url: string; venceAt: Date | null }

export interface AvisoFirmado {
  cuerpoCrudo: string;                                     // los bytes tal cual llegaron (SLT-228)
  cabeceras: Readonly<Record<string, string | undefined>>; // en minúsculas
}

export interface DevolverEntrada { pagoProveedorId: string; monto: string; moneda: string } // monto parcial o total
export type EstadoDevolucion = "pendiente" | "aprobada" | "denegada";
/** Rebill solo responde `{ status }`: no hay id de devolución (P3). */
export interface DevolucionDelProveedor { estado: EstadoDevolucion }

export interface IProveedorCobro extends IConsultaPagoProveedor {
  crearEnlace(entrada: CrearEnlaceEntrada): Promise<EnlaceDelProveedor>;       // nunca se reintenta (R22)
  verificarFirma(aviso: AvisoFirmado): Promise<boolean>;                       // sin red (R18)
  devolver(entrada: DevolverEntrada): Promise<DevolucionDelProveedor>;         // nunca se reintenta (R22)
}

/** Lo único que el adaptador sabe de las credenciales (§8.3). */
export type LeerCredencialesCobro = (
  clave: { proveedor: ProveedorCobroId; paisId: string; entorno: EntornoCobro },
) => Promise<Readonly<Record<string, string>> | null>;
```

- **`verificarFirma` es asíncrona** porque lee el secreto del webhook de la bóveda.
- **Por qué se parte en dos interfaces:** `CobroIntentoService` solo consulta. Si dependiera de `IProveedorCobro`
  entero, el doble de su test tendría que implementar tres métodos que no usa. Cambian solo los tipos de
  `CobroIntentoService.ts` (dos líneas) y los tres `IProveedorCobro` del test de SLT-226, que pasan a
  `IConsultaPagoProveedor`. Ninguna afirmación cambia (R27).
- `EstadoPagoProveedor` y `PagoDelProveedor` no cambian.
- `LeerCredencialesCobro` es un tipo de función, no una interfaz: el adaptador no recibe nada más que esto (R11).

## 4. Errores del dominio (`lib/types/cobro.ts`)

```ts
export const ENTORNOS_COBRO = ["sandbox", "produccion"] as const;
export type EntornoCobro = (typeof ENTORNOS_COBRO)[number];

export type OperacionProveedor = "crearEnlace" | "consultarPago" | "verificarFirma" | "devolver";
export type CodigoErrorProveedor =
  | "sin_configuracion" | "proveedor_no_disponible" | "metodo_no_soportado" | "solicitud_invalida"
  | "credencial_ilegible" | "credencial_rechazada" | "no_encontrado" | "solicitud_rechazada"
  | "limite_de_peticiones" | "proveedor_caido" | "tiempo_agotado" | "sin_conexion" | "respuesta_invalida";

export class ProveedorCobroError extends Error {
  readonly codigo: CodigoErrorProveedor;
  readonly proveedor: ProveedorCobroId;
  readonly operacion: OperacionProveedor | null;  // null en el registro (R2)
  readonly estadoHttp: number | null;
  readonly reintentable: boolean;                 // reintentar más tarde puede servir (R24)
  readonly incierto: boolean;                     // el efecto pudo ocurrir en el proveedor (R22)
}
```

- **El mensaje:** `"<proveedor> <operacion>: <codigo>"`, más ` (HTTP <n>)` si hubo respuesta. Ejemplo: `rebill
  devolver: proveedor_caido (HTTP 503)`. Es lo que pide `docs/conventions.md > Manejo de errores`: qué operación
  falló, sin secretos.
- **Sin `cause` y sin cuerpo, a propósito (R25),** como `CredencialIlegibleError`. El cuerpo de Rebill puede traer
  datos del pagador o repetir la cabecera. Un `TypeError` de `fetch` puede traer la URL con lo que lleve. Lo que
  importa para decidir ya va en el código y el estado HTTP.
- **La tabla de R24** es una función pura, `traducirFalla(operacion, falla)`, en `lib/clients/cobro/http-proveedor.ts`.
  Así Wompi y Global66 la reutilizan.
- **`reintentable`:** es `true` para `limite_de_peticiones`, `proveedor_caido`, `tiempo_agotado` y `sin_conexion`.
- **`incierto`:** es `true` solo en `crearEnlace` y `devolver`, con `tiempo_agotado`, `sin_conexion` o
  `proveedor_caido`. Una consulta nunca es incierta. Qué hacer con un enlace incierto es de SLT-230, y con una
  devolución incierta, de SLT-233 «Cobro automático: conciliación, devoluciones y contracargos».
- **`ConfiguracionBovedaError` no se traduce:** es un fallo de despliegue (faltan las variables del anillo), no del
  proveedor. Sale tal cual, y su mensaje ya no lleva valores (SL-36).

## 5. El transporte: tiempo máximo y reintentos (`lib/clients/cobro/http-proveedor.ts`)

```ts
export interface TransporteDeps {
  fetchImpl: typeof fetch;
  esperar: (ms: number) => Promise<void>;   // setTimeout en la app; un doble que anota en los tests
  tiempoMaximoMs: number;
  esperasReintentoMs: readonly number[];    // solo las usa `pedirIdempotente`
}
export function pedirUnaVez(deps, proveedor, operacion, url, init): Promise<RespuestaCruda>;   // R20, R22
export function pedirIdempotente(deps, proveedor, operacion, url, init): Promise<RespuestaCruda>; // R21
export function traducirFalla(...): ProveedorCobroError;                                      // R24
```

- **Cada intento** lleva `signal: AbortSignal.timeout(tiempoMaximoMs)`:
  - un `TimeoutError` o `AbortError` es `tiempo_agotado` (R20);
  - otro rechazo de `fetch` es `sin_conexion`.
- **`pedirIdempotente`** solo es para métodos `GET`, y lo afirma en tiempo de ejecución (lanza un error de
  programación si el método es otro):
  - reintenta ante `tiempo_agotado`, `sin_conexion`, `429` y `5xx`, esperando `esperasReintentoMs[i]` entre
    intentos;
  - **no** reintenta ningún otro `4xx` (R23);
  - agotados los intentos, traduce la última falla.
- **`pedirUnaVez`** hace exactamente una petición (R22). La usan `crearEnlace` y `devolver`.
- **`RespuestaCruda`** es `{ estado: number; cuerpo: unknown }`. El cuerpo se parsea como JSON. Si no es JSON, en una
  respuesta `2xx` es `respuesta_invalida`, y en una de error se descarta.
- **El orden de las esperas** lo afirma el test con el doble de `esperar`: no hay esperas reales en los tests.
- **Sin jitter:** con un solo llamador por aviso (el job de SLT-228) no hay manada que dispersar.

## 6. El adaptador de Rebill (`lib/clients/cobro/rebill-proveedor.ts`)

```ts
export class RebillProveedorCobro implements IProveedorCobro {
  readonly proveedor = "rebill";
  constructor(private readonly deps: {
    paisId: string; entorno: EntornoCobro; urlBase: string;
    leerCredenciales: LeerCredencialesCobro; transporte: TransporteDeps;
  }) {}
}
```

**En cada operación, en este orden:**
1. Valida la entrada (monto `^\d{1,10}\.\d{2}$` y > 0, moneda `^[A-Z]{3}$`, método admitido). Si falla:
   `solicitud_invalida` o `metodo_no_soportado`, sin leer credenciales (R16, R19).
2. `leerCredenciales({ proveedor: "rebill", paisId, entorno })`:
   - si devuelve `null`, es `sin_configuracion` (R14);
   - si la bóveda lanza `CredencialIlegibleError`, es `credencial_ilegible`.

   Se lee **en cada operación**, sin caché. Así un cambio de credenciales rige en la siguiente llamada, y nada
   derivado de una credencial queda en memoria entre llamadas (el criterio de SL-36 R28).
3. Arma la petición con la cabecera `x-api-key: <apiKey>` y `content-type: application/json` (R15).
4. `crearEnlace` y `devolver` van por `pedirUnaVez`; `consultarPago`, por `pedirIdempotente`.
5. Valida la respuesta con zod. Si no tiene la forma, o trae un estado fuera del mapa: `respuesta_invalida` (R17).

### 6.1 Lo que dice la doc de Rebill v3 (P1–P5)

La leyó el leader el 2026-11-21 desde las páginas `.md` de `https://docs.rebill.com`: `llms.txt`,
`api/reference/{payment-links, payments, refunds, webhooks, authentication, my-organization}`, `guides/webhooks`,
`api/rate-limits` y `api/test-tools-and-resources`. **Una limitación de la doc:** las páginas de referencia no dan
el nombre ni el tipo de los parámetros del request. Los nombres salen de sus `curl`, de las tablas de errores y del
objeto de respuesta. El doble usa exactamente esas formas, y cada ruta del doble cita su página.

| P | Lo que fija la doc | Dónde lo usa el diseño |
|---|---|---|
| P1 | `POST /v3/payment-links`. Lleva exactamente uno de `prices`, `product` o `plan`; con `prices` es `instant`. Obligatorios: `title: [{text, language}]`, `paymentMethods: [{methods, currency}]` y `prices: [{amount, currency, isDefault}]`, con `amount` como número decimal en la unidad mayor. Opcionales: `metadata`, `isSingleUse` (por defecto `true`), `expirationDate`, `redirectUrls`… Responde `201` con `id` (`pl_…`), `url` (`https://pay.rebill.com/…`) y `status` | §6.2 |
| P2 | `GET /v3/payments/:id` (`pay_…`), con `id`, `amount` (decimal, unidad mayor), `currency`, `status`, `metadata` y `paymentMethodType`. `status` es uno de `pending`, `approved`, `rejected`, `refunded`, `partially_refunded`, `cancelled` o `chargeback` | §6.3 |
| P3 | `POST /v3/refunds/:paymentId` con `amount` (si se omite, se devuelve todo lo que queda). Admite devoluciones parciales y en varios pasos. Solo para pagos `card` en estado `approved` o `partially_refunded`; si no, `400`. Responde `201` con `{ status }`: `refunded`, `partially_refunded`, `approved` (pendiente asíncrono) o `cancelled`. **Sin idempotencia documentada** | §6.4 |
| P4 | `x-rebill-signature` = HMAC-SHA256 en hex del cuerpo crudo, sin marca de tiempo ni prefijo. La clave es el `signingSecret` completo (`whsec_` y 64 hex). Al rotarlo, el anterior deja de valer en el acto | §6.5 |
| P5 | Una sola URL base, `https://api.rebill.com`. El entorno (`sandbox` o `productive`) lo define la key, y los ids de sandbox llevan `test_` | §2 |
| — | `x-api-key` con la clave secreta `sk_` (las `pk_` se rechazan). `429` con `Retry-After` y `code: rate_limit_exceeded`. La idempotencia (`x-idempotency-key`) solo está documentada en `/v3/checkout` | §5, §8.3 |

### 6.2 `crearEnlace` (R16)

**Cuerpo:**

```json
{
  "title": [{ "text": "<descripcion>", "language": "es" }],
  "prices": [{ "amount": 20000.00, "currency": "CRC", "isDefault": true }],
  "paymentMethods": [{ "methods": ["card"], "currency": "CRC" }],
  "metadata": { "facturaId": "<id>", "intentoId": "<id>" },
  "isSingleUse": true
}
```

- **Los métodos:**
  - `tarjeta` → `card`;
  - `transferencia` → `bank_transfer`;
  - `recurrente` → `metodo_no_soportado`. Un enlace `instant` no crea suscripciones: es de SLT-232 «Cobro automático:
    medios de pago guardados y cobro recurrente». `cash` no tiene `MetodoCobro`.
- **`paymentMethods` y `prices`** tienen el mismo largo (1) y la misma moneda, para no caer en «`paymentMethods` length
  must match `prices` length» ni en «Missing payment method for price currency».
- **`metadata`** lleva la factura y el intento. Así el pago se puede atar a la factura sin depender solo del id del
  enlace (§14).
- **`language: "es"`:** la doc no da la lista de valores. T4.5 confirma en sandbox que se acepta. Si no, se usa el
  valor que acepte.
- **Fuera de esta ficha:** `expirationDate` y `redirectUrls` (absolutas, sin localhost) los pide SLT-230 «Cobro
  automático: enlace de pago por factura», que sabe a dónde volver. `CrearEnlaceEntrada` los sumará como opcionales.
- **La respuesta:** `rebillEnlaceSchema` exige `id` (texto que empieza por `pl_` o `test_`) y `url` (`https://`).
  `venceAt` sale de `expirationDate` si viene, y si no, es `null`.

**El monto como número JSON sin pasar por `Number` (decisión técnica).** Rebill pide `amount` como número decimal en
la unidad mayor. `JSON.stringify` solo escribe números desde un `number`, y ese es justo el paso que se evita. Por eso
el cuerpo se arma en dos pasos, en la función pura `cuerpoJsonConMontos(objeto)`:
1. **Validación.** El monto entra como texto y se valida con `^\d{1,10}\.\d{2}$` y > 0 (mirando que no sean todo
   ceros, sobre la cadena). Esa forma es, además, un literal numérico JSON válido.
2. **Escritura.** En el objeto, cada monto va como un marcador `MontoJson` (una clase con el texto). `JSON.stringify`
   corre con un *replacer* que cambia cada `MontoJson` por una ficha de texto única,
   `"__monto_<uuid de la llamada>_<n>__"`. Después se cambia cada ficha **entre comillas** por el literal validado.
   El `uuid` es nuevo en cada llamada, así que una descripción escrita por el usuario no puede imitarlo. Si alguna
   ficha no aparece exactamente una vez, la función lanza un error de programación.

El test afirma dos cosas sobre el cuerpo crudo que recibe el doble:
- contiene `"amount":20000.00`, `"amount":0.10` y `"amount":9999999999.99`, literales;
- `JSON.parse` de ese cuerpo es igual al objeto esperado.

### 6.3 `consultarPago` (R17)

- **`404` devuelve `null`** (el contrato de SLT-226).
- **`rebillPagoSchema`** exige `id`, `amount` (número), `currency` (`^[A-Z]{3}$`) y `status`. El `id_externo` sale de
  `metadata.paymentLinkId`, que es como el aviso `payment.updated` ata el pago a su enlace.
  - **Un riesgo que se acepta:** la doc lo muestra en el aviso, no en el `GET`. Si el `GET` no lo trae, el pago es
    `respuesta_invalida` y el aviso queda pendiente: se ve en el primer pago de sandbox (T4.5). Si pasa, la
    alternativa es buscar el intento por `metadata.intentoId`, que ponemos nosotros (§6.2). Hacerlo exige cambiar
    `cobro_intento_avanzar` de SLT-226, así que iría en una ficha aparte.
- **El monto, al leer.** `JSON.parse` ya convirtió `amount` en `number`: la respuesta llega así y no hay otra forma
  de leerla. Se normaliza con `toFixed(2)`, y dos comprobaciones lo hacen exacto:
  - el valor es finito, no negativo y menor que 10¹⁰. Con 12 cifras significativas, un `double` da exactamente el
    decimal original al redondear a 2 decimales;
  - `Number(texto) === amount`. Si falla, Rebill mandó más de 2 decimales, y el pago es `respuesta_invalida` en vez
    de redondear en silencio.

  Es la única lectura de un monto a través de `number`, está acotada y tiene su test de bordes: `0.1`, `20000`,
  `9999999999.99` y `0.005`, que da `respuesta_invalida`.
- **`ESTADO_REBILL_A_PROVEEDOR`:**

| `status` de Rebill | `EstadoPagoProveedor` |
|---|---|
| `pending` | `pendiente` |
| `approved` | `aprobado` |
| `rejected` | `rechazado` |
| `refunded` | `devuelto` |
| `chargeback` | `contracargo` |
| `partially_refunded` | `aprobado` (decisión P7: la devolución parcial es de SLT-233) |
| `cancelled` | `rechazado` (decisión P8: sobre un aprobado, SLT-226 da `sin_cambio`) |
| Cualquier otro | Sin entrada |

  Un estado sin entrada es `respuesta_invalida` (R17). `expirado` no sale nunca de Rebill: lo que vence es el enlace
  (`status: expired`), no el pago.

### 6.4 `devolver` (R19)

- **La petición:** `POST /v3/refunds/:paymentId` con `{ "amount": <literal> }`, escrito con `cuerpoJsonConMontos`.
  Siempre se manda el monto: devolver «lo que quede» sin decir cuánto es una decisión de SLT-233, no un valor por
  defecto.
- **Los rechazos:** un pago que no es `card`, o que no está `approved` ni `partially_refunded`, da `400` →
  `solicitud_rechazada`. El adaptador no consulta antes: lo decide Rebill, que es quien sabe.
- **`rebillDevolucionSchema`** traduce `{ status }`:

| `status` | `EstadoDevolucion` |
|---|---|
| `refunded` | `aprobada` |
| `partially_refunded` | `aprobada` |
| `approved` | `pendiente` (asíncrono, según la doc) |
| `cancelled` | `denegada` |

  Cualquier otro valor es `respuesta_invalida`.
- **No se reintenta** (R22): sin idempotencia documentada, un segundo `POST` puede devolver dos veces.

### 6.5 `verificarFirma` (R18)

1. Lee el secreto del webhook con el paso 2 de §6.
2. Toma la cabecera `x-rebill-signature`. Si no está, o no casa con `^[0-9a-f]{64}$` (se pasa a minúsculas antes),
   devuelve `false`.
3. Calcula `createHmac("sha256", secretoWebhook).update(cuerpoCrudo, "utf8").digest()` (con la clave completa,
   `whsec_` incluido) y compara los 32 bytes con `timingSafeEqual` contra `Buffer.from(cabecera, "hex")`. Los dos
   miden siempre 32, porque la regex ya lo garantizó: `timingSafeEqual` nunca lanza.
4. No llama a la red.

**Lo que no cubre:** sin marca de tiempo, la firma no protege contra un reenvío. Lo cierra SLT-228 con el `logId`
(SLT-226 R12, R13) y confirmando con `consultarPago` (SLT-226 R14), que es lo que recomienda la doc.

### 6.6 Lo común

- **No escribe logs.** Toda la información sale en el error (§4).

## 7. El registro (`lib/clients/cobro/registro-proveedores.ts`)

```ts
export class RegistroProveedoresCobro {
  constructor(private readonly deps: {
    entorno: EntornoCobro; leerCredenciales: LeerCredencialesCobro; transporte: TransporteDeps;
    urlsBase: { rebill: string };   // la misma en los dos entornos (P5); los tests pasan la del doble
  }) {}
  obtener(proveedor: ProveedorCobroId, paisId: string): IProveedorCobro;
}
export function construirRegistroProveedoresCobro(): RegistroProveedoresCobro; // entorno de R3, lector real, fetch real
```

- **`rebill`:** `new RebillProveedorCobro({ paisId, entorno, urlBase: urlsBase.rebill, … })`. El entorno elige la
  fila de credenciales que lee el adaptador (R4).
- **`wompi` y `global66`:** lanzan `ProveedorCobroError("proveedor_no_disponible", operacion = null)`, sin leer nada
  (R2). Sus fichas añaden aquí una rama y su URL.
- **El país se valida** con `^[A-Z]{2}$`. Si no la cumple, es `solicitud_invalida`. Si el país es válido pero no
  tiene credenciales, el error sale en la primera operación (R14).
- **Por qué un registro y no el `Map` de SLT-226:** el adaptador depende del país, porque cada país tiene sus
  credenciales. Un `Map` por proveedor serviría para un solo país. El `Map` de `CobroIntentoService` sigue igual, y lo
  llena quien lo construye (SLT-228) con `registro.obtener(…)` (§14).

## 8. Las credenciales

### 8.1 El contexto de la bóveda (R7)

```ts
export const ORGANIZACION_PLATAFORMA_EN_BOVEDA = "plataforma";
const contexto = (filaId: string, campo: string): ContextoSecreto =>
  ({ organizacionId: ORGANIZACION_PLATAFORMA_EN_BOVEDA, integracionId: filaId, campo });
```

- **La bóveda no cambia.** `exigirContexto` pide tres textos no vacíos, y `"plataforma"` lo es.
- **Por qué no hay colisión:**
  - los datos asociados se codifican en JSON (QC inv. 2);
  - las empresas tienen ids `uuid`, que nunca valen `"plataforma"`;
  - `integracionId` es el id de la fila, `uuid` también.

  Así un cifrado de una integración de empresa no se lee aquí, y uno de otra fila de esta tabla tampoco.
- **Cada fila tiene su id** (§1), así que copiar un secreto a otro trío o a otro campo da `credencial_ilegible` (R7).

### 8.2 El repositorio (`CobroCredencialRepository` e `ICobroCredencialRepository`)

Todos sus métodos corren en `comoPlataforma("SL-36", …)`. `FichaJira` no admite `SLT` (deuda D29), y SL-36 es la
ficha de la bóveda. La entrada nueva de `EXCEPCIONES_DE_PLATAFORMA` lleva el motivo «SLT-227: credenciales de los
proveedores de cobro, de plataforma y sin empresa; las lee el adaptador sin sesión y las escribe el superadmin (R5–R13)».

| Método | Qué hace |
|---|---|
| `idDe(trio)` | El `id` de la fila o `null` |
| `guardar({ id, trio, secretos, por, ahora })` | `INSERT … ON CONFLICT (proveedor, pais_id, entorno) DO UPDATE SET secretos, actualizado_por, updated_at WHERE cobro_proveedor_credencial.id = EXCLUDED.id`. Devuelve `ok` o `conflicto` (0 filas: otra escritura creó el trío con otro id). Traduce la `23503` del país a `pais_no_existe` |
| `estado(trio)` | `{ campos: string[]; actualizadoAt; actualizadoPor } \| null`. Selecciona solo `jsonb_object_keys(secretos)`, nunca los valores (R9) |
| `secretosDe(trio)` | `{ id, secretos } \| null`, cifrados. Solo lo llama el lector (§8.3) |
| `idSuperadmin()` | El id del único superadmin (`usuario_un_solo_superadmin`) o `null`. Solo lo usa el comando de carga (§9.1) |
| `listarSecretos()` y `reemplazarSecretos(id, anteriores, nuevos)` | `IIntegracionRecifradoRepository` sobre esta tabla, con el mismo `equals` sobre el JSON entero que `IntegracionRecifradoRepository` (§9.2) |

### 8.3 El servicio y el lector (`lib/services/CobroCredencialService.ts`)

**`CobroCredencialService`** (`ICobroCredencialService`) recibe por constructor el repositorio, el cifrador
(`ICifradorSecretos`), la fuente de ids (`IFuenteAleatoria`) y el reloj.

| Método | Orden |
|---|---|
| `guardar(actor, entrada)` | 1) Si `!esPlataforma(actor.rol)`, devuelve `forbidden` sin llamar a nada (R10). 2) Valida con `guardarCredencialSchema`; si falla, `validation_error`. 3) Si el proveedor no está en `CAMPOS_POR_PROVEEDOR`, `proveedor_no_disponible` (R8). 4) `id = repo.idDe(trio) ?? fuente.nuevoId()`. 5) Cifra cada campo con `contexto(id, campo)`. 6) `repo.guardar(…, por = actor.usuarioId)`. Devuelve `ok` con los nombres de los campos, `pais_no_existe` o `conflicto` |
| `estado(actor, trio)` | 1) Igual que arriba: `forbidden` (R10). 2) `repo.estado(trio)`, que devuelve `{ configurada: false }` o `{ configurada: true, campos, actualizadoAt, actualizadoPor }` (R9) |

```ts
export const CAMPOS_POR_PROVEEDOR = {
  rebill: z.object({
    apiKey: z.string().trim().min(1).max(500),
    secretoWebhook: z.string().trim().regex(/^whsec_[0-9a-f]{64}$/), // el signingSecret completo (P4)
  }).strict(),
} as const;   // wompi y global66 los añaden sus fichas
export const guardarCredencialSchema = z.object({
  proveedor: z.enum(PROVEEDORES_COBRO), paisId: z.string().regex(/^[A-Z]{2}$/),
  entorno: z.enum(ENTORNOS_COBRO), secretos: z.record(z.string(), z.string()),
});
export type GuardarCredencialResult =
  | { estado: "ok"; campos: string[] }
  | { estado: "forbidden" | "validation_error" | "pais_no_existe" | "proveedor_no_disponible" | "conflicto" };
```

- **`apiKey`** es `z.string().trim().startsWith("sk_").min(4).max(500)`. Rebill rechaza las `pk_` en `x-api-key`, así
  que pegar la pública por error sale aquí y no en la primera llamada. El tope de 500 caracteres es una red contra
  basura, no un largo de Rebill.
- **El `signingSecret` se guarda completo, `whsec_` incluido,** porque es la clave del HMAC (P4). Si se rota en Rebill,
  el anterior deja de valer en el acto: hay que cargar el nuevo con el comando en ese momento (§14).
- **El `validation_error` no repite el valor,** solo el nombre del campo.
- **`entorno` se pasa explícito al guardar:** el superadmin carga sandbox y producción desde el mismo sitio. El
  entorno de la app solo decide cuál se **lee** (R3, R4).

**`crearLectorCredencialesCobro({ repo, cifrador }): LeerCredencialesCobro`**, en el mismo archivo:
1. `repo.secretosDe(trio)`; si no hay fila, devuelve `null`;
2. descifra cada campo con `contexto(fila.id, campo)`;
3. si un campo es ilegible, lanza `ProveedorCobroError("credencial_ilegible")` sin el campo ni el valor.

Es la única salida del secreto descifrado (R11). No hay actor porque lo llama el adaptador en un job sin sesión
(SLT-228). La puerta es estructural: lo vigila la guardia de §12.

## 9. El comando de carga y el recifrado

### 9.1 `pnpm cobro:credencial` (`scripts/cobro-credencial-guardar.ts`, R12)

- **Argumentos:** solo `--proveedor`, `--pais` y `--entorno`. Cualquier otro sale con 1 y el texto «Argumento no
  reconocido», sin repetirlo, por si alguien pegó ahí una clave (el molde de `recifrar-integraciones.ts`).
- **Secretos:** una línea por campo por la entrada estándar, `campo=valor` (p. ej. `apiKey=…` y `secretoWebhook=…`).
  Ni argumentos ni variables de entorno: los argumentos quedan en el historial de la shell, y las variables, en el
  entorno del proceso.
- **El actor:** `{ rol: "superadmin", usuarioId: repo.idSuperadmin() }`. Si no hay superadmin, sale con 1 y pide
  correr `pnpm arranque:superadmin`. Llama a `CobroCredencialService.guardar`, así que pasa por R8 y R10.
- **La salida:** «Guardadas: rebill · CR · sandbox (apiKey, secretoWebhook)» o el código del error. Nunca un valor.
- **La forma:** exporta `ejecutarGuardado(servicio, idSuperadmin, argumentos, entrada, salida)` para probarlo sin
  base, y solo corre `main` cuando es el entrypoint, como `recifrar-integraciones.ts`.

### 9.2 El recifrado (R13)

- **`RecifradoDeps` gana `plataforma: IIntegracionRecifradoRepository`.** Es el `CobroCredencialRepository`.
- **`ejecutar`:** después de `recorrerEmpresas`, hace una pasada más con
  `this.empresa(ORGANIZACION_PLATAFORMA_EN_BOVEDA, activa, soloContar, this.deps.plataforma)`.
- **El método `empresa`** gana el parámetro `repositorio`, por defecto `this.deps.repositorio`. El contexto que arma,
  `{ organizacionId, integracionId: fila.id, campo }`, es justo el de §8.1.
- **Un fallo de la pasada de plataforma** se cuenta en `empresasConError`, con el mismo `catch` sin imprimir. El
  comando sale con 1 y su texto ya dice que el conteo no sirve para retirar versiones.
- **`scripts/recifrar-integraciones.ts`** solo cablea el repositorio nuevo.

## 10. Autorización

| Operación | Quién | Dónde se decide | R |
|---|---|---|---|
| Guardar credenciales | Solo el superadmin | `CobroCredencialService.guardar` (`esPlataforma`, antes de leer nada) | R8, R10 |
| Consultar si hay credenciales | Solo el superadmin | `CobroCredencialService.estado` (`esPlataforma`) | R9, R10 |
| Cargar por comando | Quien opera la plataforma con acceso a la base, como `integraciones:recifrar` | El comando, con el actor superadmin | R12 |
| Leer el secreto descifrado | Solo el adaptador, en el servidor | `crearLectorCredencialesCobro`, y la guardia de §12 | R11 |
| Leer o escribir la tabla como empresa | Nadie | RLS sin políticas y `REVOKE ALL` a `servi_app` | R6 |

**Módulo:** ninguno. El cobro de la plataforma es núcleo, como en SLT-226. **No hay actions, rutas ni pantallas:** el
borde lo ponen SLT-228, SLT-230 y SLT-251.

## 11. El doble de Rebill (`e2e/_rebill-falso/servidor.mjs`, R26)

Node puro (`node:http`), en memoria, sin dependencias, con `arrancarRebillFalso({ puerto, apiKey, secretoWebhook })`,
que devuelve `{ url, cerrar }`. Es el molde del doble de Storage, y vive en `e2e/` para que lo reutilice el E2E de
SLT-231 «Cobro automático: botón «Pagar» y estado de la factura».

- **Las rutas de la API v3** que usa el adaptador, con las formas de §6.1:
  - `POST /v3/payment-links`: valida que el cuerpo tenga `title`, `prices` y `paymentMethods` del mismo largo y
    moneda, y si no responde `400`. Devuelve `201` con `id: "pl_…"` y `url`. Guarda el cuerpo crudo para el test
    del monto;
  - `GET /v3/payments/:id`: el pago sembrado (`id: "pay_…"`, `amount` numérico, `currency`, `status` y
    `metadata.paymentLinkId`), o `404`;
  - `POST /v3/refunds/:paymentId`: `400` si el pago no es `card` o no está `approved` ni `partially_refunded`, o si
    el monto pasa de lo que queda; si no, `201` con `{ status }`;
  - responden `401` si `x-api-key` no es la configurada;
  - el `401` repite la key recibida en su cuerpo **a propósito**, para que R25 pruebe que el adaptador descarta el
    cuerpo.
- **Control de la prueba** (solo en el doble, con el prefijo `/__control`):
  - `POST /__control/pagos`: siembra un pago con su estado;
  - `POST /__control/fallos`: encola respuestas para las siguientes peticiones (`{ estado, demoraMs }`), para el
    `5xx`, el `429`, el `4xx` y el tiempo agotado;
  - `GET /__control/peticiones`: devuelve las peticiones recibidas (método, ruta, cuerpo y si la key era correcta).
    La key no se guarda;
  - `POST /__control/reiniciar`: vacía todo entre casos.
- **`firmar(cuerpo, secreto)`:** devuelve el HMAC-SHA256 en hex del cuerpo crudo, como Rebill (§6.5), para el test de
  R18. SLT-228 lo reutilizará.
- **Un riesgo que se acepta:** no hay SDK contra el que contrastar el doble, como sí lo hay con Storage. Además, la
  doc no da los nombres ni los tipos de los parámetros del request (§6.1). Su fidelidad depende de esa lectura. Lo
  mitiga que el doble y el adaptador usan las mismas formas, cada ruta con el enlace a su página. T4.5 lo contrasta
  una vez en sandbox: un enlace, un pago y una devolución reales de prueba, sin tests automáticos contra Rebill
  (R26).

## 12. Tests

| Archivo | Cubre | Cómo |
|---|---|---|
| `tests/integration/cobro/rebill-proveedor.test.ts` (**nuevo**) | R1, R4, R14–R19, R22, R24 (HTTP), R25, R26 | El adaptador real contra el doble, con `leerCredenciales` doble (sin base). Una sección «R25: el secreto no sale» recorre todos los caminos de error |
| `tests/unit/clients/cobro-http-registro.test.ts` (**nuevo**) | R2, R3, R20, R21, R23, R24 (tabla) | `fetch` y `esperar` dobles, sin red. `entornoDeCobro` con cada `VERCEL_ENV`, y el registro |
| `tests/integration/db/cobro-proveedor-credencial.test.ts` (**nuevo**) | R5–R9, R13 (fila), migración ida y vuelta | Base real: `CobroCredencialService` con el repositorio y la bóveda reales. Como `servi_app`, `42501`. El `down` aborta con filas y revierte sin ellas |
| `tests/unit/services/cobro-credencial-service.test.ts` (**nuevo**) | R8 (validación), R9 (forma), R10, R12 | Repositorio, cifrador y fuente dobles. `ejecutarGuardado` con una salida doble |
| `tests/integration/db/recifrado-integraciones.test.ts` (**se amplía**) | R13 | Una credencial de cobro en `v1` con `v2` activa: queda en `v2`, se lee con el lector y el resumen la cuenta |
| `tests/unit/guards/credenciales-cobro-solo-adaptador.guardia.test.ts` (**nuevo**) | R11, R26 | Lee los archivos (abajo) |
| `tests/unit/services/cobro-intento-service.test.ts` (**solo tipos**) | R27 | `IProveedorCobro` → `IConsultaPagoProveedor` en tres líneas. Ninguna afirmación cambia |

**La guardia `credenciales-cobro-solo-adaptador`:**
- `crearLectorCredencialesCobro` y `secretosDe` solo aparecen en:
  - `lib/services/CobroCredencialService.ts`;
  - `lib/repositories/CobroCredencialRepository.ts`;
  - `lib/interfaces/repositories/ICobroCredencialRepository.ts`;
  - `lib/clients/cobro/**`;
  - y los tests.

  Ningún archivo de `app/` ni de `lib/actions/` los nombra (R11).
- Ningún archivo de `tests/` ni de `e2e/` contiene el host de `URL_BASE_REBILL` (`api.rebill.com`; R26). El de
  checkout (`pay.rebill.com`) sí puede salir: el doble lo usa en las URLs que devuelve y nadie lo llama.
- **Control de no vacuidad:** la guardia encuentra el lector en su archivo, y `URL_BASE_REBILL` no está vacía.

**R25, el secreto no sale.** API key `sk_CENTINELA_9f3` y secreto del webhook `whsec_` seguido de `c0ffee` repetido
hasta completar 64 hex (la forma de R8), con
`console.log`, `warn`, `error`, `info` y `debug` espiados. Los casos son:
- `401` (el doble repite la key), `403`, `404`, `422`, `429`, `503`, tiempo agotado, sin conexión y respuesta
  inválida, en las tres operaciones de red;
- `credencial_ilegible`;
- y `verificarFirma` con una firma mala.

Para cada error, el centinela no aparece en `message`, `stack`, `String(e)` ni `JSON.stringify(e)`, y ninguna llamada
a `console` lo contiene. **Control de no vacuidad:** la petición que recibió el doble sí llevaba el centinela en
`x-api-key` (así el test no pasa por no haber enviado nada).

**Mutaciones que deben matar los tests**, una a la vez:
1. `pedirIdempotente` usado en `devolver` (R22: 3 peticiones en vez de 1);
2. reintentar ante un `401` (R23);
3. el error con el cuerpo de la respuesta en `cause` o en el mensaje (R25);
4. `entornoDeCobro` con `NODE_ENV` (R3: el caso del E2E da `produccion`);
5. el contexto de la bóveda sin el id de la fila (R7: la copia entre tríos se descifra);
6. `estado` que devuelve `secretos` (R9);
7. `verificarFirma` con `===` en vez de `timingSafeEqual`. No lo detecta un test de comportamiento: lo vigila la
   revisión y un test que espía `timingSafeEqual`;
8. el recifrado sin la pasada de plataforma (R13);
9. el monto escrito con `Number(monto)` (R16: el cuerpo crudo dice `20000` y no `20000.00`);
10. la firma calculada sin el prefijo `whsec_` en la clave, o en base64 (R18).

## 13. Alternativas descartadas

1. **Guardar las credenciales en `integracion` (SL-36).** Esa tabla es de negocio, con `organizacion_id NOT NULL`, RLS
   por empresa y un enum `servicio_integracion` por empresa. Meter ahí credenciales de plataforma rompe su RLS o pide
   una empresa ficticia. La decisión del 2026-11-21 dice «de la plataforma, por proveedor y país».
2. **Variables de entorno por país** (`REBILL_API_KEY_CR_SANDBOX`, …). Haría falta un despliegue por cada país nuevo, y
   el humano decidió la bóveda y, más adelante, una pantalla (SLT-251). La guardia `sin-credenciales-de-entorno` va
   en esa dirección desde SL-36.
3. **Usar el SDK de Rebill.** Lo descarta la decisión del 2026-11-21. Además, metería una dependencia con sus cuatro
   checks, para cuatro llamadas REST.
4. **Un historial de cambios de credenciales en `historial_plataforma`.** Pediría dos valores nuevos de enum en una
   migración aparte (`55P04`, como en SLT-226 §1.3), sin pantalla que lo muestre. La fila guarda quién y cuándo
   cambió por última vez. El historial completo encaja con la pantalla de SLT-251.
5. **Reintentar también `crearEnlace` y `devolver`.** La doc solo documenta `x-idempotency-key` en `/v3/checkout`, no
   en enlaces ni en devoluciones (§6.1). Un reintento tras un tiempo agotado puede crear dos enlaces o devolver dos
   veces. Es dinero: se prefiere un error `incierto` y que decida quien llama.
6. **Ampliar la bóveda con un contexto «de plataforma» propio** (p. ej. `organizacionId: null`). Cambiaría
   `exigirContexto` y el contrato de los datos asociados de SL-36, que dejaría ilegible lo ya cifrado si se toca mal.
   `"plataforma"` como empresa cumple el contrato sin tocarlo (§8.1).
7. **Un `Map` por proveedor, como en SLT-226,** en vez del registro. No sabe del país (§7).
8. **Escribir el monto con `JSON.rawJSON` o leerlo con el `context.source` del *reviver*.** Resolverían el número sin
   fichas y sin `toFixed`. Pero dependen de la versión de Node del despliegue, que no verifiqué, y un fallo ahí no se
   ve hasta producción. La ficha con `uuid` (§6.2) y el `toFixed` acotado con su comprobación (§6.3) funcionan en
   cualquier versión y tienen tests de bordes.
9. **Mandar el monto en texto** (`"amount": "20000.00"`). Evitaría el problema, pero la doc lo da como número, y un
   texto podría rechazarse o, peor, interpretarse distinto.

## 14. Riesgos y notas para los specs que siguen

- **SLT-228: el país del aviso.** `consultarPago(pagoProveedorId)` no recibe el país, y el adaptador sale del registro
  ya ligado a uno. El webhook de SLT-228 tiene que saber el país **antes** de consultar. Puede ser con una URL por
  país, o leyendo el país del intento por el id del pago o del cobro que trae el aviso. Lo decide su spec; aquí no
  se fija.
  El aviso `payment.updated` trae `data.metadata`, y ahí va el `intentoId` que pone `crearEnlace` (§6.2): es un
  camino posible.
- **SLT-228: el `logId`.** La doc dice a la vez que es «unique per delivery attempt» y «stable across retries». Si
  cambiara en cada reintento, la capa 2 de SLT-226 (R12, R13) no frenaría un reenvío, aunque la capa 3 sí (el pago
  cuenta una vez). Lo confirma su spec.
- **SLT-230: el enlace incierto.** Un `crearEnlace` con `incierto = true` puede haber creado un enlace en Rebill. El
  `intentoId` de `metadata` sirve para reconocerlo. SLT-230 también añade `expirationDate` y `redirectUrls`.
- **Una key de sandbox cargada en producción.** Como la URL base es la misma, una `sk_` de sandbox en la fila de
  `produccion` funcionaría contra el sandbox de Rebill sin error. La doc dice que los ids de sandbox llevan `test_`,
  pero no la forma de la key. Esta ficha no lo detecta. SLT-251 puede avisar al guardar, por ejemplo, con una
  consulta a `my-organization` que devuelva el `environment`.
- **Rotar el `signingSecret`** invalida el anterior en el acto (P4). Hasta que se carga el nuevo con el comando, los
  avisos dan firma inválida. Rebill los reintenta a los 5 min, a la hora y al día, así que se recuperan si la carga
  es rápida.
- **SLT-251: la pantalla de credenciales.** Usa `CobroCredencialService.guardar` y `estado` desde una action en
  `comoPlataforma`. Ya trae `forbidden` y la respuesta sin secretos.
- **La rotación de una API key de Rebill:** se vuelve a cargar con el comando. Rige en la siguiente llamada (§6, paso
  2).

## 15. Tamaño

| | Archivos | Líneas (añadidas + borradas) |
|---|---|---|
| Producción | 21: la migración y su `down`, `schema.prisma`, `lib/types/cobro.ts`, `IProveedorCobro.ts`, `lib/config/cobro.ts`, los tres de `lib/clients/cobro/`, las dos interfaces, el repositorio y el servicio de credenciales, `CobroIntentoService.ts`, `excepciones-aislamiento.ts`, `modelos-de-negocio.ts`, `RecifradoIntegracionesService.ts`, los dos scripts, `package.json` y `docs/architecture.md` | ~1 150–1 300: SQL ~80, TypeScript ~1 040–1 190 (el adaptador ~280, con el monto, la firma y los mapas ya concretos; el transporte ~130; el servicio y el lector ~170; el repositorio ~140; el comando ~110), docs ~30 |
| Tests | 8 + 2 que solo entran si T0.3 lo pide (`tests/unit/guards/_unicos-sin-empresa.ts`, `scripts/verificar-rls-despliegue.ts`) | ~1 500–1 700: el doble ~260, el adaptador ~450, transporte y registro ~260, la base ~350, el servicio ~200, el recifrado ~60, la guardia ~70 |
| **Total** | **29–31/40** (por debajo del 80%: 32) | Producción **por encima** de 1 000, aceptado (P6); tests dentro de 3 000 |

**P6 (humano, 2026-11-21): «Aceptar, un solo PR».** El exceso de líneas de producción se acepta, y el marcador
`tamano-pr-aceptado` está en `progress/features/SLT-227.md`. No se corta nada.
