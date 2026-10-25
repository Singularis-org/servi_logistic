# Reimplementar: bóveda de credenciales e integraciones por empresa

Esto es una bóveda que cifra las credenciales de cada empresa ligándolas a su fila, y una conexión por empresa y proveedor que se prueba antes de guardarse. La referencia es la conexión de WhatsApp de QuimiCloude (SHA `f786d72`). Se dirige a quien implemente SL-36 en Servi Logistic.

**Cómo usar este prompt.**
- Reimplementa desde cero en tu stack. No copies rutas ni copys.
- Lo propio de QuimiCloude va marcado (empresa = `companies`, permisos con añadidos, Meta Graph).
- Las decisiones abiertas viven en `decisiones.md` (D1-D8). Son tuyas: se cierran en `/afinar-feature` de SL-36, no aquí.
- Lo marcado **No verificado** no está comprobado en el original. No lo des por hecho.

## 1. Propósito y actor

- **Actor.** Un usuario de una empresa con permiso para configurar integraciones. En el original es `integraciones.modificar` y solo lo tiene el rol Administrador.
- **Qué consigue.** Conectar la cuenta de un servicio externo de **su** empresa: en el original, un número de WhatsApp Business por la Meta Cloud API. Sus credenciales quedan cifradas, aisladas de las demás empresas y comprobadas contra el proveedor.
- **Camino feliz.**
  1. El usuario rellena el formulario.
  2. El sistema prueba las credenciales contra el proveedor **antes** de escribir nada.
  3. Si la prueba es buena, crea la conexión en `PENDING` con los datos que devuelve el proveedor.
  4. El usuario ve una sola vez el verify token y la URL del webhook. Esto es propio de WhatsApp.
- **Caminos alternos.**
  - Prueba fallida: no se crea nada y se muestra el motivo.
  - Editar.
  - Probar de nuevo.
  - Deshabilitar, y habilitar con una prueba buena.
  - Regenerar el verify token.
  - Secreto guardado ilegible: la conexión pasa a `ERROR` y pide reescribir el secreto.
- **Quién recupera.** El mismo usuario de la empresa, no la plataforma.
- **Núcleo reusable.**
  - La bóveda: cifrado con contexto, formato versionado y anillo de claves.
  - Una conexión por empresa y proveedor, con estado, último error y última prueba.

## 2. Contrato congelado, transcrito literal

Esto es lo estructural: la sintaxis TypeScript es del lenguaje y el contrato es la forma.

```ts
// Contexto que liga cada valor cifrado a su fila (datos autenticados del AEAD).
type SecretContext = { readonly companyId: string; readonly recordId: string; readonly field: string };
// Codificación canónica del AAD: JSON, NUNCA unión con ':'.
// JSON.stringify(['integraciones.secret', version, companyId, recordId, field])

// Valor guardado: 'v<n>:<iv>:<tag>:<ciphertext>', base64 ESTÁNDAR estricta (regex, no la del runtime).
// <n> entero positivo sin ceros a la izquierda (/^v[1-9][0-9]*$/). IV 12 bytes, tag 16, clave 32.
// Algoritmo: AES-256-GCM con authTagLength explícito en cifrar y descifrar.

interface SecretCipher {            // asíncrono: la firma no cambia si la clave sale a un KMS
  encrypt(plaintext: string, context: SecretContext): Promise<string>;
  decrypt(stored: string, context: SecretContext): Promise<string>;
}
interface SecretDigest {            // solo para secretos de ALTA entropía (sin sal)
  digestOf(secret: string): string; // SHA-256 en hex minúscula de 64
  matches(secret: string, storedDigest: string): boolean; // tiempo constante, 32 vs 32 bytes
}
interface RandomSource {
  newId(): string;                  // UUID
  newVerifyToken(): string;         // 32 bytes aleatorios en base64url
}

// Variables de entorno (se leen en CADA llamada, nunca al importar):
// INTEGRATIONS_ENCRYPTION_KEYS   = 'v1:<base64 32 bytes>,v2:<base64 32 bytes>'
// INTEGRATIONS_ENCRYPTION_ACTIVE = 'v2'

const WHATSAPP_CONNECTION_STATUSES = ['PENDING', 'ACTIVE', 'ERROR', 'DISABLED'] as const;
const WHATSAPP_CONNECTION_ORIGINS = ['MANUAL', 'EMBEDDED_SIGNUP'] as const; // EMBEDDED_SIGNUP: sin flujo

// Lo que el dominio lee y escribe; lleva cifrados y nunca sale del módulo.
type WhatsappConnectionRecord = {
  id; companyId; origin; displayName; wabaId; phoneNumberId;
  displayPhoneNumber: string | null; verifiedName: string | null;
  accessTokenEnc; appSecretEnc; verifyTokenHash; status;
  lastError: string | null; lastCheckedAt: Date | null; lastWebhookAt: Date | null;
  templatesSyncedAt: Date | null;
};
// Lo único que va a la UI. Se construye campo a campo, SIN spread.
type WhatsappConnectionView = {
  id; displayName; wabaId; phoneNumberId; displayPhoneNumber; verifiedName; status;
  lastError: string | null; lastCheckedAt: string | null; lastWebhookAt: string | null; // ISO
};

// Repositorio: solo filas vivas de la empresa; `scope` va AL FINAL de cada firma (omitirlo no compila).
interface WhatsappConnectionRepository {
  findLive(scope): Promise<Record | null>;
  findLiveById(id, scope): Promise<Record | null>;   // null = no existe | borrada | otra empresa
  create(row /* sin companyId */, scope): Promise<Record>;
  update(id, patch /* campo ausente = se conserva */, scope): Promise<Record | null>;
  recordWebhookHandshake(id, at, scope): Promise<void>;
}

// Límites de entrada: displayName 1..80 tras recortar; secretos 1..1024; IDs del proveedor
// sin regla de dígitos ni de largo (lo valida la prueba). En edición, un secreto vacío
// o ausente = conservar el guardado. El id con forma no-UUID se trata como «no encontrado».

// Estados de salida del borde:
// create: idle | created{verifyToken, webhook} | test_failed{message} | error
// update: idle | saved | test_failed{message} | error
// test:   idle | tested{ok:true} | tested{ok:false, message} | error
// toggle: idle | saved | test_failed{message} | error   (test_failed solo al habilitar)
// regenerate: idle | regenerated{verifyToken, webhook} | error
```

Códigos de error del catálogo:
- `unauthorized`
- `invalid_input`
- `integration_secret_unreadable`
- `whatsapp_connection_not_found`
- `whatsapp_connection_exists`
- `whatsapp_phone_number_taken`
- `action_not_allowed`
- `unexpected`, que lleva referencia.

Los tipos con campos sin anotar arriba son `string` salvo `status` y `origin`. En el original, la lista de operaciones de la fachada está cerrada por test.

## 3. Mapa de capas en Controller → Service → Repository

El original es hexagonal: puerto, caso de uso y adaptadores. En el destino se traduce así:

| Original | Destino | Responsabilidad |
|---|---|---|
| Página servidor + guarda de permiso | página de `app/` | Si no hay permiso, 404 indistinguible de una ruta inexistente. Si no hay conexión, alta; si la hay, tarjeta, webhook y acciones |
| Server Action (*driving*) | `lib/actions/<integraciones>.ts` | Resuelve el actor desde la sesión, extrae los campos, llama al service y traduce el resultado o el error. **No decide nada**: ni permiso, ni esquema, ni ORM. Revalida tras una mutación con éxito |
| Caso de uso `createX(deps)` | `lib/services/<Integracion>Service.ts` | Comprueba el permiso en la **primera línea**, valida la entrada, prueba contra el proveedor, cifra, persiste y arma la vista |
| Puertos | `lib/interfaces/{repositories,external,services}/` | `SecretCipher`, `SecretDigest`, `RandomSource`, el repositorio y el cliente del proveedor (uno por interfaz) |
| Adaptador Prisma | `lib/repositories/<Integracion>Repository.ts` | Filtra por empresa y por fila viva **en el `where`**, y traduce cada único a su error de dominio |
| Adaptadores de cripto, entorno y HTTP | `lib/clients/…` o `lib/<boveda>/…` | AES-GCM, SHA-256, aleatorio, lectura del anillo y cliente HTTP con timeout |

El flujo de una petición es: página → acción → service → (repositorio, cliente del proveedor, cifrador) → vista.

- **Esencial:** el service no conoce HTTP ni el ORM; la empresa sale del actor, nunca de la entrada; el borde no decide.
- **Convención:** que el borde sea una Server Action y la carpeta concreta de cada pieza.

## 4. Invariantes que no puedes romper

1. **Liga el AAD a `(versión, empresa, registro, campo)`.**
   - Si se rompe, un cifrado copiado a otra fila o empresa se descifra: con escritura en la base, se mueve el token de A a B.
2. **Codifica el contexto en JSON.**
   - Si se rompe, `('a:b','c')` y `('a','b:c')` darían el mismo AAD.
3. **El id de la fila existe antes de cifrar**, así que la base no lo genera.
   - Si se rompe, no hay `recordId` con qué cifrar, o el secreto pasa un instante en claro por una segunda escritura.
4. **A la base solo llegan valores `v<n>:…` y el resumen del verify token.**
   - Si se rompe, un backup o un `SELECT` filtra las credenciales.
5. **El verify token en claro solo viaja en la respuesta de alta o de regenerar.**
   - Si se rompe, queda en el HTML o la caché y se puede falsificar la suscripción del webhook.
6. **La vista se construye campo a campo.**
   - Si se rompe, un campo nuevo de la fila, por ejemplo un cifrado, llega a la UI sin que nadie lo decida.
7. **El repositorio pone la empresa desde el ámbito, nunca desde la fila.**
   - Si se rompe, una entrada manipulada crea la conexión en otra empresa.
8. **Toda lectura y escritura filtra por empresa y por fila viva en el `where`.**
   - Si se rompe, B lee o edita la conexión de A, o distingue «existe en otra empresa» de «no existe».
9. **Una conexión viva por empresa, también en concurrencia.** En WhatsApp, además, un número vivo en todo el sistema.
   - Si se rompe, quedan dos conexiones, o un webhook no sabe a qué empresa pertenece.
10. **Una edición cuya prueba falla no escribe nada**, tampoco con un secreto ilegible.
    - Si se rompe, un token mal pegado tumba una conexión que funcionaba.
11. **Habilitar exige una prueba buena, y `DISABLED` se conserva al editar o al leer un secreto ilegible.**
    - Si se rompe, se reactiva una conexión que el usuario apagó.
12. **Tras una prueba buena el estado es `PENDING` si nunca llegó un webhook y `ACTIVE` si ya llegó.** Esto es propio de WhatsApp.
    - Si se rompe, la conexión queda «Pendiente» para siempre.
13. **Ningún error, log ni diagnóstico lleva el texto en claro, la clave, el valor guardado ni trozos de la variable.** Un secreto mal formado en la configuración se nombra por posición, no por su etiqueta.
    - Si se rompe, las credenciales acaban en el agregador de logs.
14. **Las variables de cifrado se leen en cada llamada.**
    - Si se rompe, la app no arranca sin ellas, y rotar la clave activa exige reiniciar.
15. **El tag tiene largo explícito y la base64 se valida con regex estricta.**
    - Si se rompe, se aceptan tags truncados o valores con basura que el runtime decodifica en silencio.
16. **El resumen sin sal se usa solo para secretos aleatorios y se compara en tiempo constante.**
    - Si se rompe, un secreto humano se adivina por diccionario, o el tiempo de respuesta filtra el resumen.
17. **El token del proveedor va solo en la cabecera `Authorization`, y no se registran ni la URL, ni la cabecera, ni el cuerpo.**
    - Si se rompe, el token queda en los logs de proxies.
18. **Un fallo del proveedor o de red es un resultado, no una excepción, con timeout de 10 s.**
    - Si se rompe, no se puede guardar `ERROR` con el mensaje, o la acción se cuelga.
19. **En el original, la importación posterior al alta (plantillas) que falla no deshace el alta.**
    - Si se rompe, una caída del proveedor tras la prueba buena impide conectar.

## 5. Máquina de estados

Estados: `PENDING`, `ACTIVE`, `ERROR` y `DISABLED`. Se serializan en mayúsculas, como enum de la base y unión de tipos.

- **Alta:** prueba buena → `PENDING`. Prueba fallida → no hay fila.
- **Probar:**
  - si está `DISABLED`, se rechaza con `action_not_allowed`;
  - si sale bien, `PENDING` o `ACTIVE` según si ya hubo webhook, y se limpia el último error;
  - si sale mal, `ERROR`, y se guardan el último error y la hora de la prueba.
- **Editar:**
  - prueba solo si cambia un secreto o el identificador que se prueba (el teléfono);
  - sin prueba, no toca el estado;
  - con prueba buena, como «Probar», pero `DISABLED` se conserva;
  - con prueba fallida, **nada** cambia. Es una asimetría a propósito frente a «Probar».
- **Deshabilitar:** cualquier estado → `DISABLED`, sin probar e idempotente.
- **Habilitar:** solo desde `DISABLED`, y con prueba buena. Si la prueba falla, devuelve `test_failed` sin escribir.
- **Secreto ilegible al usarlo:** → `ERROR` con «vuelve a escribir la credencial», salvo si está `DISABLED`.
- **Handshake del webhook** (WhatsApp): `PENDING` → `ACTIVE`; no toca `DISABLED`.
- **UI:**
  - el último error solo se pinta en `ERROR`;
  - en `DISABLED` se ocultan «Probar» y «Deshabilitar» y aparece «Habilitar»;
  - deshabilitar y regenerar piden confirmación; habilitar no.
- **Omitido a propósito:** no existe estado «borrada» visible. Una conexión borrada da el mismo «no encontrado» que una inexistente o de otra empresa.
- **De reojo (asistente de IA del original):** ante un secreto ilegible no lanza; devuelve `unreadable`. La lectura para consumir el secreto no tiene actor: la empresa sale de la fila del job. Son dos políticas en el mismo módulo, cada una justificada en su sitio.

## 6. Datos persistidos

**Lo que hace el original.** Tabla `whatsapp_connections`:
- **Identidad:** `id` UUID **sin default**, `company_id` obligatoria con FK RESTRICT, y clave candidata `(company_id, id)` para FK compuestas.
- **Enums de base:** origen y estado.
- **IDs del proveedor:** texto sin límite.
- **Secretos:** `access_token_enc`, `app_secret_enc` y `verify_token_hash`. **No hay columna de versión**, porque la versión viaja dentro del valor.
- **Estado de la prueba:** `last_error`, `last_checked_at` y `last_webhook_at`.
- **Auditoría y tiempos:** `created_by`, `created_at`, `updated_at` y `deleted_at` (borrado lógico).
- **Únicos parciales**, escritos a mano en la migración porque el ORM no los declara. Son lo primero que se pierde al portar:
  - `(company_id) WHERE deleted_at IS NULL`;
  - `(phone_number_id) WHERE deleted_at IS NULL`, entre empresas.
- **RLS:** `ENABLE` + `FORCE`, **sin policies**. No verificado: que el original dependa de un rol que salta RLS.

**Exigencia del destino.**
- La tabla lleva `organizacion_id` NOT NULL con FK a `organizacion`, índice y la **política RLS `<t>_por_empresa`**, que compara `organizacion_id` con `current_setting('app.organizacion_id')`, con el rol `servi_app`.
- Los únicos por empresa van compuestos, con `organizacion_id` primero.
- Cada migración tiene su `down.sql`, que nunca se edita una vez aplicada. El original tuvo que añadir una correctiva por editarla en sitio.
- Una FK hacia otra tabla de negocio necesita su trigger de misma empresa.
- El modelo se clasifica como «de negocio».

La forma de la tabla está abierta: una por proveedor o una genérica (D6), y borrado lógico o físico (D7).

## 7. Acoples

**Framework (Next App Router) y su equivalente en otro stack:**
- **`'use server'`, importado por su ruta exacta:** endpoint RPC o form action.
- **`revalidatePath` tras mutar:** invalidar la caché del query o redirigir con PRG. «Probar» revalida también cuando falla, porque escribe el estado.
- **`useActionState`:** un reductor local más una llamada asíncrona con `pending`.
- **Formulario no controlado que se vacía:** lo no secreto vuelve desde el estado y los secretos vuelven vacíos.
- **El token se revela dentro de la acción:** el refresco desmonta el formulario; en otro stack, mostrar el token en la respuesta antes de navegar.
- **Hora:** el servidor pinta UTC y el cliente repinta en su huso (`useSyncExternalStore`).

**Librerías, y el requisito que sobrevive si se sustituyen:**
- **`node:crypto`:** AEAD con datos asociados, IV aleatorio de 96 bits, CSPRNG y comparación en tiempo constante.
- **`zod`:** validación declarativa en el borde, también de las respuestas del proveedor.
- **Prisma:** traducir la violación de **cada** único parcial a su error de dominio y propagar las demás. El «no encontrado» sale del recuento del `UPDATE … WHERE`.
- **`fetch` con timeout y sin caché:** cliente HTTP con timeout para llamadas autenticadas.
- **shadcn y Tailwind:** primitivos accesibles, campos de 16 px y 44 px de alto.

**Parámetros a reemplazar:**

| Marcador | Valor en el original | Qué poner en el tuyo |
|---|---|---|
| Empresa | `companies` / `company_id` | `organizacion` / `organizacion_id` |
| Usuario de auditoría | `users` / `created_by` | la tabla de usuario del destino |
| Tabla de conexión | `whatsapp_connections` | nombre en español (D6) |
| Permiso | `integraciones.modificar`, rol Administrador | modelo de permisos del destino (D2) |
| Ruta de pantalla | `/integraciones/whatsapp` | la del destino |
| Ruta de webhook | `/api/integraciones/whatsapp/webhook/<id>` | la del destino (fuera de alcance) |
| Variables de cifrado | `INTEGRATIONS_ENCRYPTION_KEYS`, `…_ACTIVE` | nombres del destino |
| Etiqueta del AAD | `'integraciones.secret'` | la tuya; cambiarla invalida todo lo cifrado |
| Campos secretos | `access_token`, `app_secret` | los de cada proveedor |
| API externa | Meta Graph, versión por variable | la de cada proveedor |
| Copys y códigos de error | en español, `whatsapp_*` | catálogo del destino |

**Propio de QuimiCloude (no lo portes tal cual):**
- empresa = `companies`;
- permisos con añadidos;
- todo Meta: WABA, verify token, handshake, importación de plantillas, `PENDING` hasta el primer webhook y el único global por número.

## 8. Núcleo EARS reusable

Entre paréntesis va el `R<n>` original. Los números son de specs de QC que no se leyeron.

- **E1.** El sistema cifra cada credencial como `v<n>:<iv>:<tag>:<ct>` con la versión activa, y la descifra con la versión que trae el valor (R3, R9).
- **E2.** El sistema produce valores distintos al cifrar dos veces el mismo texto, y ninguno contiene el texto ni su base64 (R2, R3).
- **E3.** El sistema toma la empresa de toda operación del actor de la sesión, nunca de la entrada (R2).
- **E4.** El sistema excluye de toda respuesta a la UI los secretos, sus cifrados y sus resúmenes (R10).
- **E5.** Cuando el usuario da de alta una conexión, el sistema prueba las credenciales contra el proveedor antes de escribir nada (R21).
- **E6.** Cuando la prueba del alta es buena, el sistema crea la conexión en estado pendiente con los datos que devuelve el proveedor (R22).
- **E7.** Cuando el usuario regenera un token, el sistema lo devuelve una sola vez y guarda solo su resumen (R15).
- **E8.** Si la prueba falla, el sistema no crea ni modifica nada y devuelve el motivo con los secretos tapados (R23, R26).
- **E9.** Si el valor guardado está alterado, mal formado, con una versión desconocida o con otro contexto, el sistema falla con un único error «credencial ilegible», sin causa ni fugas (R4, R5, R7, R8, R14).
- **E10.** Si una credencial guardada es ilegible al usarla, el sistema pasa la conexión a error pidiendo reescribirla, salvo si está deshabilitada (R13, D10).
- **E11.** Si la configuración de claves falta o está mal formada, el sistema falla nombrando la variable y nunca su valor (R11, R12).
- **E12.** Si el id no es válido, no existe, está borrado o es de otra empresa, el sistema responde el mismo «no encontrado» (R3).
- **E13.** Mientras la empresa tenga una conexión viva de ese proveedor, el sistema rechaza una segunda alta, también en concurrencia (R6).
- **E14.** Mientras la conexión esté deshabilitada, el sistema no la prueba, y editarla no la habilita (R31).
- **E15.** Donde la edición deje vacía una credencial, el sistema conserva la guardada sin descifrarla ni volver a cifrarla (R11).
- **E16.** Donde la edición cambie una credencial o el identificador que se prueba, el sistema vuelve a probar antes de guardar (R12, R26).

## 9. Lo que NO hace

**Deliberado (fuera de alcance):**
- la mensajería: plantillas, contactos, envío, webhook, cron, inbox y outbox;
- la configuración del proveedor de IA del original.

**Stub:** `EMBEDDED_SIGNUP`, el alta guiada de Meta, existe en el enum y no tiene flujo (D1).

**Decidido para el destino (respuestas del humano, 2026-10-24):**
- **Desconectar: sí.** La empresa puede quitar cualquier conexión (WhatsApp, Maps o asistente).
  - Antes de confirmar, la app dice qué deja de funcionar sin ella.
  - En el original no existe: había columna de borrado y ningún caso de uso.
  - Borrar la clave o solo apagarla está abierto (D7).
- **Rotación de la clave maestra: versiones y comando.**
  - Lo nuevo se cifra con la versión activa y las viejas solo leen.
  - Un comando del superadmin recifra todo con la versión activa e informa cuántas filas quedan con cada versión vieja.
  - Una versión se retira del entorno cuando su conteo llega a 0.
  - Sin KMS externo. En el original no existía el recifrado.

**Deuda del original** (no la heredes):
- el WABA ID nunca se prueba contra el proveedor, ni al editar;
- la migración se editó en sitio;
- la auditoría guarda solo `created_by` (D5).

**Estado de completitud del original:**

| Pieza | Estado | Qué falta |
|---|---|---|
| Bóveda (cifrador, contexto, formato, anillo, resumen, aleatorio) | real | Comando de recifrado (decidido, por construir) |
| Alta, edición, prueba, habilitar/deshabilitar, regenerar | real | — |
| Desconectar / borrar | ausente | Todo (decidido, por especificar) |
| Alta guiada de Meta | stub | Flujo completo (D1) |
| Límite de intentos de «Probar» | ausente | D4 |
| Auditoría de cambios | ausente | D5 |
| Verificación del WABA ID | ausente | Deuda |
| Tests unitarios de probar, habilitar, regenerar y leer, y del cliente HTTP | No verificado | No estaban en la lista extraída |

## 10. Tests como criterio de aceptación

**Transferibles:**
- **Cifrador.**
  - Ida y vuelta: ASCII, no ASCII, 1 y 4096 caracteres.
  - Dos cifrados difieren.
  - La forma exacta, con IV 12 y tag 16.
  - Alterar el IV, el tag o el ciphertext da «ilegible» sin `cause` y sin fuga.
  - Otro contexto en empresa, registro o campo falla.
  - Los contextos ambiguos con `:` no se cruzan.
  - Las formas inválidas dan «ilegible» con diagnóstico «forma inválida».
  - Una versión ausente se nombra.
  - v1 sigue legible tras activar v2.
  - Un cambio de la versión activa entre llamadas se refleja.
  - Texto vacío o contexto incompleto dan `invalid_input`.
  - No se llama a la consola.
- **Resumen.** Vector conocido de `abc`. Un resumen mal formado da `false` sin comparar. Exactamente una comparación en tiempo constante, de 32 contra 32 bytes.
- **Configuración.**
  - Variables ausentes, vacías o mal formadas dan errores que nombran la variable o la posición, sin trozos del valor.
  - Una versión repetida falla.
  - Se lee por llamada.
  - La composición se importa sin las variables.
- **Alta.**
  - Orden: prueba y luego escritura.
  - Cifrado con `{empresa, id de la fila, campo}`.
  - Solo el resumen del token, que se devuelve una vez.
  - Si falla, nada se escribe y el mensaje va saneado.
  - Con una conexión viva, se rechaza sin llamar al proveedor.
  - Límites 80/1024 en el borde exacto.
  - Un ID que el proveedor no reconoce da prueba fallida, no `invalid_input`.
- **Edición.**
  - «No encontrado» idéntico en los cuatro casos.
  - Un secreto vacío se conserva sin descifrar.
  - Prueba solo cuando toca.
  - Si falla, la fila no cambia.
  - Estado tras prueba buena según el webhook.
  - `DISABLED` se conserva.
  - Un secreto ilegible no llama al proveedor.
- **Repositorio contra Postgres real.**
  - RLS activa y forzada.
  - La empresa sale del ámbito.
  - Otra empresa no lee ni edita.
  - La fila borrada es invisible.
  - Una sola conexión viva, también con dos altas concurrentes.
  - El número es único entre empresas y se libera al borrar.
  - Otra violación de unicidad se propaga.
  - En la base solo hay `v<n>:` y un hex de 64.
- **Migración.** Índices parciales exactos, DOWN, ida-vuelta-ida idéntico, y un caso de sensibilidad sin `FORCE`.
- **UI.**
  - Una etiqueta por estado.
  - El último error solo en `ERROR`.
  - Los secretos son contraseñas sin valor inicial.
  - Tras un fallo, se conserva solo lo no secreto.
  - El aviso «no se volverá a mostrar» aparece una vez.
  - Confirmar antes de deshabilitar o regenerar.
  - Talla táctil.
- **E2E.**
  - Con permiso, 200; sin él, nada en el HTML y 404 sin las palabras «permiso», «rol» ni «autoriz».
  - Alta rechazada sin fila; alta buena.
  - Al recargar, el token no está en el HTML.
  - Editar el nombre conserva los cifrados.
  - Deshabilitar y habilitar.

**Específicos del stack original:** acciones del servidor contra dobles de la composición, revalidación de ruta, clases Tailwind y `vi.stubEnv`.

**Hueco:** el E2E del original no recorre «Probar» ni «Regenerar».

## 11. Dependencias asumidas

- Primitivos de UI: botón, input, label, badge, alerta de error, campo de contraseña con mostrar/ocultar, botón de envío con estado pendiente y diálogo de confirmación.
- Catálogo de errores con mensaje por código y referencia para lo inesperado.
- Sesión que da el usuario, la empresa y los permisos; guarda de página por permiso.
- Composition root o inyección de los services.
- Cliente de base global.
- Rutas y navegación centralizadas.
- Variables de entorno declaradas vacías en `.env.example`.
- Migraciones con `down.sql`.
- Tooling de tests: unit con dobles, jsdom, Postgres real para integración y E2E en dos navegadores con helpers de login y fixtures.
- Un doble del proveedor que se activa por variable para el E2E. No verificado: el nombre de esa variable.

## 12. Adaptación a SL-36

- **Una clave por servicio.** Maps y el asistente piden **una sola clave cada uno**; la forma de la entrada cambia por proveedor. WhatsApp conserva sus campos.
- **Maps se especifica desde cero.** No existe en QuimiCloude: qué endpoint lo prueba y qué responde son desconocidos aquí.
- **Requerido o recomendado.** Cada servicio se marca así en la pantalla, con lo que se pierde si se quita. Lo exige el «desconectar» decidido.
- **Abierto: sin Maps, ¿las asignaciones se bloquean o solo se degradan?** Lo verifica el spec.
  - El leader vio que la optimización de rutas del destino tiene respaldo sin Google.
  - La geocodificación depende de la clave de Google.
- **Hoy esas claves son de plataforma.** Pasan a ser por empresa.
- **Decisiones abiertas:** las decisiones D1-D8 de `decisiones.md` se cierran en `/afinar-feature` de SL-36.
- **Decisiones cerradas:** D9 (desconectar) y D10 (rotación con comando) no se reabren.
