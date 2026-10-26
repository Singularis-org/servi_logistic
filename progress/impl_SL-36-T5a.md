# SL-36 · T5.1 (IntegracionesService) y T5.2 (CredencialesIntegracionService) — bitácora de backend_dev

> Parcial de T5. El implementer la funde en `impl_SL-36.md`. Sin commit (lo hace el leader).
> Solo unit con dobles de interfaz: el SQL ya está probado contra la base en T3. MCP del grafo no
> consultado: todo lo leído es código nuevo de esta feature (Read/Grep).

## Archivos

Creados:
- `lib/interfaces/services/IIntegracionesService.ts`: las seis operaciones, `VistaIntegracion`, resultados.
- `lib/interfaces/services/ICredencialesIntegracion.ts`: `LecturaCredencial<S>`, `CodigoRechazoDe<S>`, contrato de T6.
- `lib/services/IntegracionesService.ts`: R6 en la primera línea de cada operación; `conEmpresa(actor.organizacionId)`
  propio en cada una (R7); esquemas de entrada exportados `ESQUEMAS_ENTRADA_ALTA` / `ESQUEMAS_ENTRADA_EDICION`.
- `lib/services/CredencialesIntegracionService.ts`: `leer` y `marcarRechazo`; exporta `CODIGO_CREDENCIAL_ILEGIBLE`.
- `tests/unit/services/integraciones-dobles.ts` (dobles compartidos: repo en memoria que filtra por la
  empresa del contexto y la anota, cifrador que falla con otro contexto, probadores, contador).
- `tests/unit/services/integraciones-autorizacion.test.ts`, `integraciones-service.test.ts`,
  `credenciales-integracion-service.test.ts`.

No se tocó el catálogo (`lib/types/integraciones.ts`) ni ningún repositorio de T3.

## Contrato para T6 (firma exacta)

```ts
// lib/interfaces/services/ICredencialesIntegracion.ts
export type LecturaCredencial<S extends ServicioIntegracion> =
  | { estado: "sin_configurar" }
  | { estado: "ilegible" }            // ya dejó la fila en error con "credencial_ilegible" (R29)
  | { estado: "lista"; integracionId: string; credencial: CredencialPorServicio[S]; datosPublicos: DatosPublicosPorServicio[S] };
export type CodigoRechazoDe<S extends ServicioIntegracion> = Extract<CodigoRechazoUso, `${S}.${string}`>;
export interface ICredencialesIntegracion {
  leer<S extends ServicioIntegracion>(servicio: S): Promise<LecturaCredencial<S>>;
  marcarRechazo<S extends ServicioIntegracion>(servicio: S, codigo: CodigoRechazoDe<S>): Promise<void>;
}
// new CredencialesIntegracionService({ repo: new IntegracionRepository(prisma), cifrador: new BovedaIntegraciones(), log? })
```

- Se llama DENTRO de `conEmpresa` (sesión, job o webhook). Sin contexto de empresa (o en plataforma),
  `leer` y `marcarRechazo` lanzan `EmpresaNoResuelta` sin consultar.
- `credencial` por servicio: WhatsApp `{ token_acceso, app_secret }`; Maps y asistente `{ clave_api }`;
  rutas `{ clave_cuenta_servicio }` (el JSON entero, en texto).
- `datosPublicos` de WhatsApp incluye `numeroId` (sale de la columna `whatsapp_numero_id`); rutas
  `{ proyectoId, cuentaServicio }`; Maps y asistente `{}`.
- `ilegible`: el consumidor NO llama al proveedor y lo trata como «no configurado» (design §9.1).
- Lanza también si la bóveda no está configurada (`ConfiguracionBovedaError`, R4): no marca la fila.
- `marcarRechazo` códigos: `whatsapp.credencial_rechazada`, `google_maps.credencial_rechazada`,
  `optimizacion_rutas.credencial_rechazada`, `optimizacion_rutas.permiso`, `asistente.credencial_rechazada`.
  Un código de otro servicio lanza `TypeError` sin escribir. Sin integración del servicio, no hace nada.
- Sin caché a propósito (R28): cada `leer` va a la base.

## Contrato para T7.1 (la action)

- `new IntegracionesService({ repo, pruebas, probadores: crearProbadores(process.env), cifrador, resumen,
  aleatoria, urlWebhook })`; `limitePorMinuto` y `reloj` tienen defecto (`pruebasPorMinuto()`, `new Date()`).
  `urlWebhook` la arma el composition root (el service no lee el entorno).
- Cada operación recibe `Actor | null` (null = sin sesión) y `campos: unknown`; el service valida.
- Lo que lanza (base caída, `ConfiguracionBovedaError`) lo traduce la action a `unexpected` con referencia.
- `prueba_fallida` y `probada{ok:false}` traen `codigo` y `texto` (del catálogo).

## Mapa R<n> → test

| R | Test | Estado |
|---|---|---|
| R5 (vista) | `integraciones-service.test.ts` › «SL-36/R5» (listar + alta/edición/prueba sin secretos, `v1:` ni resumen) | verde |
| R6 | `integraciones-autorizacion.test.ts` › «SL-36/R6»: 9 actores (admin, mensajero, adminTienda, adminSatelite, apiKey, superadmin, maestro sin empresa ×2, sin sesión) × 6 operaciones, `forbidden` con 0 llamadas; tabla cerrada contra el prototipo; control positivo con el maestro | verde (56) |
| R7 | ídem › «SL-36/R7» (alta con `organizacionId` ajeno en la entrada y dentro de `conEmpresa(B)`; editar/probar/regenerar/listar/desconectar; maestro de B no alcanza la de A) | verde |
| R9 | `integraciones-service.test.ts` › «SL-36/R9» (editar, probar, regenerar, desconectar: sin forma / inexistente / de otra empresa = mismo resultado; sin forma no consulta) | verde |
| R12 | ídem › «SL-36/R12» (orden límite → existe → prueba → id → cifrado → crear; datos del proveedor; rutas; `ya_existe` sin proveedor; P2002 del repo; límites 1/4096) | verde |
| R13 | ídem › «SL-36/R13» (alta y edición fallidas no escriben; código + texto del catálogo) | verde |
| R14 | ídem › «SL-36/R14» (solo nombre: sin descifrar/cifrar/probar/contar ni tocar estado; todo vacío no escribe; secreto nuevo: solo él se cifra y el conservado queda el mismo valor; WABA/número reprueban; ilegible → `credencial_ilegible`) | verde |
| R15 | ídem › «SL-36/R15» (buena limpia; mala deja código y hora; ilegible sin proveedor) | verde |
| R16 (service) | ídem › «SL-36/R16» (sexta rechazada con `reintentarEnS: 40` sin proveedor; cuentan alta/edición/probar; contador antes del proveedor; acotado 1..60). La parte de base ya está en `integracion-prueba-minuto.test.ts` (T3) | verde |
| R18 | ídem › «SL-36/R18» (token + URL una vez; al repo solo el SHA-256; `listar` no lo trae; regenerar ídem; otro servicio sin token) | verde (E2E de recarga: T9) |
| R32 (service) | ídem › «SL-36/R32» | verde |
| R23 | `credenciales-integracion-service.test.ts` › «SL-36/R23» (lee la de A con contexto de A; B no ve la de A; sin contexto o en plataforma → `EmpresaNoResuelta` sin consultar) | verde |
| R29 | ídem › «SL-36/R29» (alterado/otra fila/campo ausente → `ilegible` + `marcarError(…, "credencial_ilegible")`; log solo con diagnóstico; bóveda sin configurar se propaga sin marcar) | verde |
| R30 | ídem › «SL-36/R30» (marca con el código; en B no toca A; los 5 códigos del catálogo; uno ajeno → TypeError sin escribir). Los casos por consumidor son de T6 | verde |

Secretos fuera de logs: los dos archivos de service espían `console.*` en cada test y el `afterEach`
afirma que ningún secreto ni el token aparecen.

## Mutaciones (script en el scratchpad; cada una aplicada, medida y revertida; `cmp` final = iguales)

| Mutación | Resultado |
|---|---|
| R6: borrar la línea en listar / alta / editar / probar / regenerarToken / desconectar (una cada vez) | ROJO 9 cada una (los 9 actores de esa operación) |
| R7: `conEmpresa` del alta con el `organizacionId` de la entrada | ROJO 1 («alta: con un organizacionId en la entrada…») |
| R7: cifrar el alta con el `organizacionId` de la entrada | ROJO 1 (ídem) |
| R7: editar sin su propio `conEmpresa` (corre en el contexto de quien llama) | ROJO 11 |
| R13: escribir (crear) con la prueba fallida en el alta | ROJO 1 («alta: no genera id, no cifra, no crea…») |
| R13: escribir (actualizar) con la prueba fallida en la edición | ROJO 1 («edición: la fila no cambia…») |
| R14: descifrar aunque no haga falta probar | ROJO 2 («solo el nombre visible…», «todo vacío…») |
| R14: recifrar los secretos conservados | ROJO 1 («cambia un secreto…») |
| R16: sin límite | ROJO 3 |
| R18: guardar el token en claro en vez del resumen | ROJO 1 |
| R29: no marcar la fila ilegible | ROJO 2 |
| R30: marcar otro código | ROJO 1 |

## Salida de verificación

- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, `0 errors, 232 warnings` (los mismos de antes); `eslint` sobre mis 8 archivos: exit 0, sin avisos.
- Mis tests: `Test Files 3 passed (3) · Tests 100 passed (100)`.
- `pnpm exec vitest related --run` sobre mis 4 archivos de `lib/`: `Test Files 3 passed (3) · Tests 100 passed (100)`.
- `pnpm run test:guardias`: `Test Files 2 failed | 303 passed | 2 skipped (307) · Tests 5 failed | 4180 passed | 20 skipped`.
  Ninguno es mío:
  - `dependencias-declaradas-presentes` (4): en `tests/baseline-rojos.json`.
  - `ayuda-pantalla-ruta-existe` (1): `oficina/configuracion-integraciones.md -> /configuracion/integraciones`.
    La guía la commiteó T8.1 (`96bef5e`) antes de que exista la página (T7.2); se pone verde con T7.2.
- Archivos en LF (comprobado con node: 0 `\r`).

## Desviaciones y decisiones

1. **El service abre su propio `conEmpresa(actor.organizacionId)`** en cada operación, además del que
   ponga la action. Es lo que hace cierto R7 aunque quien llame esté en otro contexto (la mutación
   «editar sin su conEmpresa» lo mide). Anidarlo no cambia nada si la action ya abrió el mismo.
2. **Validación zod en el service** (no solo en la action): `campos: unknown` → `invalid_input`. Con
   `z.object` (descarta claves de más, como un `organizacionId` inyectado); los secretos se recortan
   (un salto de línea pegado al final no hace fallar la prueba). Tope de lo público 255 (el del esquema
   de `datos_publicos`; el design no fija otro). `fieldErrors` con texto propio: el de zod podría citar
   lo escrito.
3. **`editar` tiene un resultado más, `credencial_ilegible`**: cuando hace falta probar con un secreto
   conservado que no se lee. No escribe nada (QC inv. 10) y no marca la fila; si el maestro reescribe
   todos los secretos, no hace falta descifrar.
4. **`probar` con credencial ilegible** registra la prueba como mala con código `credencial_ilegible`
   (estado `error`, R15 + R29) sin llamar al proveedor.
5. **Cambiar el App Secret obliga a reprobar** (R14 literal: «si cambia un secreto»), aunque la prueba
   solo verifica el token: para eso se descifra el token conservado, que no se recifra.
6. **Edición sin ningún cambio** responde `guardada` con la vista actual sin escribir ni dejar historial.
7. **`prueba_fallida` y `probada{ok:false}` añaden `texto`** (del catálogo) al `codigo` del design §4.
8. **`reintentarEnS`** = segundos hasta `minuto + 60 s`, acotado a 1..60 (el minuto lo pone la base y el
   reloj de la instancia puede ir desfasado).
9. `marcarRechazo` comprueba la empresa del contexto en el propio service (no depende del repositorio
   inyectado) y rechaza en ejecución un código de otro servicio.
10. R16 completo (contra base) y R18 (recarga en el HTML) siguen en T3 y T9; aquí solo la parte del service.

## Veredicto

T5.1 y T5.2 hechos: 100 tests en verde, las mutaciones pedidas (R6 ×6, R7 ×3, R13 ×2, R14 ×2) y cinco
más (R16, R18, R29, R30) quedan en rojo; typecheck y lint limpios.
