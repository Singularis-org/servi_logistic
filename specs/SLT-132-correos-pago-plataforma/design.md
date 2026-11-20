# SLT-132 «Correos del pago a la plataforma» — design

> Requisitos: `requirements.md` (R1–R25). Escrito por `spec_author` el 2026-11-20, con P1 cerrada por el humano: un
> solo PR por encima del tope.
> - Hay **una migración**, solo de enums, con su `down.sql`.
> - **No hay tablas ni columnas nuevas**, y la RLS no cambia.
> - **No hay dependencias nuevas:** nodemailer, zod y Prisma ya están.
> - **No hay enmiendas:** la guardia de SLT-91 no se toca (el enlace del maestro es `/wallet`).

## Lo que ya existe

Busqué el 2026-11-20 con los términos `pago_plataforma`, `aviso`, `correo`, `superadmin`, `encolarEnEmpresas`,
`factura_plataforma_aviso`, `plantilla-marca` y `destinatariosDelAviso`, en los tres sitios. El grafo
`codebase-memory-mcp` no tiene índice de este worktree (`index_status`: project not found), así que exploré con Grep y
Read.

- **El board** (`feature_list.json`):
  - SLT-136 «Planes: aviso, correo y descarga de la factura» (done) dejó el molde de aviso, correo y trabajo, y saca
    de su alcance «los correos del pago».
  - SLT-60 «Confirmación del pago a la plataforma por el superadmin» y SLT-143 «El superadmin registra un pago hecho
    por fuera y anula un pago confirmado» dejan los cuatro hechos. SLT-143 P7 pasa los avisos a esta ficha.
  - SLT-142 «Rechazo del pago a la plataforma y su estado en la wallet» (pending) reutilizará la plantilla (§6).
  - Ninguna otra ficha avisa de pagos.
- **`specs/`:** los tres anteriores. Ninguno envía correos del pago.
- **El código:**

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| Outbox `encolarEnEmpresas(tx, …)` + `JobRepository.enqueue(…, { dedupeKey }, tx)` con `ON CONFLICT (dedupe_key) DO NOTHING` | `lib/repositories/_shared/encolar-en-empresas.ts`, `IJobRepository.ts:70-81` | **Se reutiliza** en las tres operaciones del superadmin (§3.2) |
| `FacturaPlataformaRepository.cerrar`: `$transaction` dentro de `comoPlataforma`, con la rama sin `$transaction` | `lib/repositories/FacturaPlataformaRepository.ts:57-76, 292-299` | **Es el molde** del cambio en `PagoPlataformaConfirmacionRepository` (§3.2) |
| `crearMovimientoRegistrado`: abre su `$transaction`, corre `antes`, inserta y devuelve `count` (0 con la clave repetida) | `lib/repositories/WalletMovimientoRepository.ts:231-282` | **Gana el encolado** después del INSERT, solo si `count > 0` y solo para `egreso_pago_plataforma` (§3.1) |
| `PagoPlataformaConfirmacionRepository.confirmar`, `registrarPorFuera` y `anularConfirmado`: hoy cada uno es una sola sentencia `SELECT pago_plataforma_…()` | `lib/repositories/PagoPlataformaConfirmacionRepository.ts:202-260` | Cada uno pasa a una transacción que encola si la función devuelve `ok` (§3.2) |
| `crearFacturaAvisoHandler`: emite la campanita (no best-effort), lee los maestros, envía uno por uno y falla después sin datos personales | `lib/planes/jobs-factura-aviso.ts` | **Es el molde** del manejador nuevo (§4) |
| `PlanesRepository.destinatariosDelAviso(org, null)` → `{ empresaNombre, maestros }` activos | `lib/repositories/PlanesRepository.ts:2309` | **Se reutiliza** para los maestros (R10–R12, R16) |
| `componerCorreo` (bloques `parrafo`, `boton` y `nota`; escape y logo) y `formatearMontoEn(MONEDA_DE_LOS_PLANES, …)` | `lib/services/email/plantillas/plantilla-marca.ts`, `factura-emitida.ts`, `lib/config/moneda.ts` | La plantilla nueva va sobre ellos (§6) |
| `emitirFilas`, la dedupe estructural (evento, entidad, destinatario) y `repoReal()` | `lib/notificaciones/emitir.ts`, `notificadores.ts` | Los tres avisos nuevos (§5) |
| `fechaCalendarioPlataforma`, `diaDeLaPlataforma` | `lib/notificaciones/emitir.ts:1618` | La fecha de la campanita y del correo (R20) |
| Catálogos exhaustivos `Record<NotificacionEvento, …>` | `catalogo-avisos.ts`, `push-elegibles.ts`, `lib/whatsapp-envios/eventos.ts` | Tres entradas en cada uno (R14) |
| El único superadmin: el índice `usuario_un_solo_superadmin` (SL-32 R27), con `organizacion_id` nulo; la búsqueda por `ROLES_PLATAFORMA` en `comoPlataforma` | `db/migrations/20261023100100_seed_rol_superadmin`, `lib/repositories/ArranqueSuperadminRepository.ts:61` | **Mismo filtro**, más `estado = 'activo'` (R7, R8) |
| `crearEmailSender()`, `emailContacto()` y `baseUrlDeLaApp()` | `lib/services/EmailProvider.ts`, `lib/config/email.ts`, `lib/config/app-url.ts` | Composition root del trabajo (§4.3) |
| La migración de enums de SLT-136 y su `down.sql` con `pg_temp.quitar_valores_de_enum_136` | `db/migrations/20261117120000_factura_plataforma_aviso_enums/` | Molde de la migración (§1) |
| `correrCron("procesar-jobs")` para los E2E | `e2e/_escenarios/crons.ts` | El E2E corre la cola real (§9) |

No se re-crea nada de lo anterior.

## 1. Modelo de datos y migración (R23)

**Ninguna tabla ni columna nueva.** El trabajo lee `wallet_movimiento`, `pago_plataforma_confirmacion`,
`pago_plataforma_aplicacion`, `pago_plataforma_anulacion`, `ajuste_caja_anulacion`, `factura_plataforma`,
`organizacion` y `usuario`. Todas existen y su RLS no cambia.

**Migración `db/migrations/20261125120000_pago_plataforma_aviso_enums/`.** El timestamp va después de la última de
`dev` (`20261124120000_sl21_pais_moneda_impuesto`). Si `dev` avanzó al abrir el PR, se renumera antes de aplicarla,
nunca después (T0).

```sql
ALTER TYPE "notificacion_evento"       ADD VALUE IF NOT EXISTS 'pago_plataforma_confirmado';
ALTER TYPE "notificacion_evento"       ADD VALUE IF NOT EXISTS 'pago_plataforma_por_fuera';
ALTER TYPE "notificacion_evento"       ADD VALUE IF NOT EXISTS 'pago_plataforma_anulado';
ALTER TYPE "notificacion_entidad_tipo" ADD VALUE IF NOT EXISTS 'pago_plataforma';
ALTER TYPE "job_tipo"                  ADD VALUE IF NOT EXISTS 'pago_plataforma_aviso';
```

- La migración solo añade valores: el primer uso es en runtime (`55P04`). No tiene backfill, no toca la RLS y no crea
  índices.
- **`down.sql`:** copia la función de la 462 con el sufijo `_132`, como la de SLT-136. Lee la lista vigente de
  `pg_enum` y quita solo estos cinco valores. Si alguna fila de cualquier columna de esos tipos los usa (un aviso en
  `notificacion`, un cupo en `push_envio_dia`, un trabajo en `jobs`), aborta con `RAISE`.
- **`db/schema.prisma`:** los cinco valores, con su comentario, en `NotificacionEvento`, `NotificacionEntidadTipo` y
  `JobTipo`.
- **Nombres (R24):** ninguno contiene «plan». La guardia de SLT-91 R9 (`/plan/i` sobre los eventos) sigue en verde.
- **Por qué una entidad nueva, `pago_plataforma`:** `notificacion_entidad_tipo` no tiene `wallet_movimiento`. La
  entidad es el pago (el id de su `wallet_movimiento`), y la clave única (evento, entidad, destinatario) da:
  - un aviso por pago y por evento, para siempre (R15);
  - dos avisos distintos para un pago confirmado y después anulado, porque son eventos distintos (R15).
- **`organizacion_id`:**
  - el trabajo lo toma del DEFAULT `app.organizacion_id`: en la sesión de la empresa (R1) o fijado por
    `encolarEnEmpresas` (R2–R4);
  - el aviso lo toma por `conSuEmpresa` al correr el trabajo.

**Datos que dependen del país:**
- **Moneda:** `MONEDA_DE_LOS_PLANES` (SL-21), con `formatearMontoEn`, igual que `factura-emitida.ts`. El pago es a la
  plataforma, en su moneda, sea cual sea el país de la empresa.
- **Fecha:** el día de `fecha_movimiento` en la hora de la plataforma (`fechaCalendarioPlataforma`, `ZONA_CR` hasta
  SLT-90). Es la de «Pagos por confirmar» (SLT-60 §6.1) y la del correo de SLT-136. Ningún literal de zona nuevo
  (guardia `pais-sin-literales`).
- **Impuestos y métodos de pago:** ninguno.

## 2. El aviso como dato

`lib/interfaces/repositories/IPagoPlataformaAvisoRepository.ts` (nuevo) define los tipos y el contrato de lectura:

```ts
/** Los hechos que avisa esta ficha. SLT-142 sumará "rechazado". */
export const AVISOS_PAGO_PLATAFORMA = ["registrado", "confirmado", "por_fuera", "anulado"] as const;
export type AvisoPagoPlataforma = (typeof AVISOS_PAGO_PLATAFORMA)[number];

export interface DatosAvisoPago {
  pagoId: string;
  empresaNombre: string;
  monto: string;                // texto de la base, 2 decimales
  fecha: Date;                  // fecha_movimiento
  referencia: string | null;    // descripcion del pago
  porConfirmar: boolean;        // sin confirmación y sin contra-asiento (la definición de SLT-60)
  confirmacion: { porFuera: boolean; aplicaciones: { numero: number; monto: string }[] } | null;
  anulacionDeLaPlataforma: { motivo: string } | null; // fila en pago_plataforma_anulacion + motivo de ajuste_caja_anulacion
}

export interface IPagoPlataformaAvisoRepository {
  datosDelPago(organizacionId: string, pagoId: string): Promise<DatosAvisoPago | null>;
  superadminActivo(): Promise<{ email: string; nombre: string } | null>;
}
```

`lib/repositories/PagoPlataformaAvisoRepository.ts` (nuevo):
- **Corre en `comoPlataforma("SL-45", …)`:** tiene que leer el usuario sin empresa y las tablas de varias fichas con
  un único cliente, como `PagoPlataformaConfirmacionRepository`. `FichaJira` no admite `SLT` (deuda D29). Lleva su
  entrada en `EXCEPCIONES_DE_PLATAFORMA` (`lib/db/excepciones-aislamiento.ts`).
- **`datosDelPago`:**
  - es una sola sentencia `$queryRaw` con `jsonb_build_object`, para tener una sola foto. Cada `JOIN` y cada
    subconsulta lleva `organizacion_id = ${org}` escrito: como dueño no hay RLS;
  - solo lee el pago si es `tipo = 'egreso'` y `categoria = 'egreso_pago_plataforma'`. Si no, devuelve `null`;
  - las aplicaciones salen con el `numero` de su factura, ordenadas por número;
  - `porConfirmar` = `NOT EXISTS` confirmación `AND NOT EXISTS` contra-asiento (`ingreso_ajuste`, `origen_tipo =
    gasto`, `origen_id` = el pago). Es la misma condición que `pago_plataforma_por_confirmar`, y T1.3 comprueba que
    coinciden;
  - el borde se valida con zod, como `leer` (importes con `Prisma.Decimal(...).toFixed(2)` y fechas UTC).
- **`superadminActivo`:**
  `usuario.findFirst({ where: { organizacionId: null, estado: "activo", rol: { value: { in: [...ROLES_PLATAFORMA] } } }, select: { email, nombre } })`.
  Hay como mucho uno: lo garantiza el índice de R27 de SL-32.

## 3. El encolado (R1–R6)

Un módulo compartido, `lib/repositories/_shared/aviso-pago-plataforma.ts` (nuevo):

```ts
export function dedupeAvisoPago(aviso: AvisoPagoPlataforma, pagoId: string): string {
  return `pago_plataforma_aviso:${aviso}:${pagoId}`;             // R5
}
/** Encola en la empresa del contexto (`app.organizacion_id`) y dentro de `tx`. */
export function encolarAvisoPago(tx: JobTxClient, aviso: AvisoPagoPlataforma, pagoId: string): Promise<unknown> {
  return new JobRepository(tx).enqueue("pago_plataforma_aviso", { pagoId, aviso }, { dedupeKey: dedupeAvisoPago(aviso, pagoId) }, tx);
}
```

El payload no lleva datos personales: solo dos ids y el nombre del aviso.

### 3.1 El registro por la empresa (R1)

En `WalletMovimientoRepository.crearMovimientoRegistrado`, dentro de su `$transaction`, después de
`if (count === 0) return 0;` y de los laterales:

```ts
if (mov.categoria === "egreso_pago_plataforma") await encolarAvisoPago(tx, "registrado", mov.id); // SLT-132 R1
```

- **Corre en la sesión de la empresa:** `servi_app` con `app.organizacion_id` fijado. El trabajo toma esa empresa por
  el DEFAULT, igual que `webhook_evento` (ficha 454), que también se encola en la transacción del hecho. T0.2
  comprueba el permiso de `INSERT` en `jobs`.
- **Si el registro no queda escrito, no queda trabajo:**
  - con el tope superado, `antes` lanza antes del INSERT;
  - con la clave repetida, `count === 0` sale antes de encolar;
  - con cualquier error, la transacción se deshace.
- **Por qué en el repositorio y no en `WalletEgresoService`:**
  - es el mismo sitio donde ya viven los laterales y el historial del asiento, en su transacción;
  - el servicio no conoce Prisma, y un puerto nuevo en su constructor obligaría a cambiar el composition root, la
    receta de la demo y los cinco tests que lo construyen. El repositorio ya lo usan todos;
  - la condición es la categoría, que el repositorio ya tiene.

  `crearMovimientoRegistrado` también escribe el ajuste manual y el reverso, pero no son `egreso_pago_plataforma`,
  así que no encolan nada.

### 3.2 Las tres operaciones del superadmin (R2–R4)

En `PagoPlataformaConfirmacionRepository`, `confirmar`, `registrarPorFuera` y `anularConfirmado` siguen en
`comoPlataforma` y conservan su contrato. Por dentro pasan al molde de `FacturaPlataformaRepository.cerrar`:

```ts
const ejecutar = async (c: ClienteDelPago) => {
  const [fila] = await c.$queryRaw`SELECT pago_plataforma_confirmar(…) AS "resultado"`;   // igual que hoy
  if (fila?.resultado === "ok") {
    await encolarEnEmpresas(c, [{ organizacionId: input.organizacionId, encolar: () => encolarAvisoPago(c, "confirmado", input.pagoId) }]);
  }
  return fila;
};
const fila = this.prisma.$transaction === undefined ? await ejecutar(this.prisma) : await this.prisma.$transaction(ejecutar);
```

- `registrarPorFuera` encola `"por_fuera"` con su `input.pagoId`, que genera el servicio. `anularConfirmado` encola
  `"anulado"`.
- **Los rechazos no encolan:** `ya_confirmado`, `ya_registrado` y `ya_anulado` no pasan por el `if`, y un `SL060` o el
  tope lanzan dentro de la transacción y la deshacen. El `try/catch` de hoy envuelve la transacción entera, así que
  la traducción de errores no cambia.
- **El tipo del cliente** `PagoPlataformaConfirmacionPrismaClient` suma `$executeRaw` y `$transaction?`, este último
  opcional, como en `FacturaPlataformaRepository`.
- **La función del dueño toma el candado de la empresa**, y este dura hasta el commit de la misma transacción. El
  encolado no cambia la serialización (SLT-60 R19, R21).

### 3.3 Por qué en la misma transacción y no después

La consigna admitía «en la misma transacción o de forma idempotente». Se eligen las dos cosas: misma transacción y
`dedupe_key`.
- **Encolar después del commit** (en el servicio o en la action) pierde el aviso si el proceso cae entre los dos
  pasos. Ningún cron lo recuperaría: no hay nada vencido que barrer. Es el mismo argumento que SLT-136 §10.
- **El coste** es que un fallo al encolar deshace el pago. Es un INSERT en `jobs` dentro de la misma base. R6 habla
  del fallo del **correo** y de la campanita, que van fuera de la operación.

## 4. El trabajo `pago_plataforma_aviso` (R7–R18, R22)

`lib/planes/jobs-pago-aviso.ts` (nuevo) va junto a `jobs-factura-aviso.ts`.

```ts
export interface DepsAvisoPago {
  pagos: IPagoPlataformaAvisoRepository;
  destinatarios: Pick<IPlanesRepository, "destinatariosDelAviso">;
  /** emitirAvisoPagoPlataformaReal: NO best-effort. */
  emitirAviso: (ctx: AvisoPagoContexto) => Promise<number>;
  sender: IEmailSender; contacto: string | null; urlApp: string | null;
}
export function crearPagoAvisoHandler(deps: () => DepsAvisoPago): JobHandler;
```

### 4.1 Pasos

1. `empresaDelJob(job)`. Sin empresa, lanza `pago_plataforma_aviso: el trabajo no tiene empresa` (R22).
2. Valida el payload `{ pagoId: string.min(1), aviso: z.enum(AVISOS_PAGO_PLATAFORMA) }`. Si está malformado, lanza con
   su motivo (R22).
3. Lee `datos = pagos.datosDelPago(org, pagoId)`. Con `null`, termina sin hacer nada (R8, R13).
4. Según `aviso`:

| Aviso | Condición para seguir (si no, termina sin nada) | Campanita | Correo a |
|---|---|---|---|
| `registrado` | `datos.porConfirmar` (R8) | ninguna (R9) | `superadminActivo()`; si es `null`, termina (R8) |
| `confirmado` | `confirmacion !== null && !confirmacion.porFuera` (R13) | `pago_plataforma_confirmado` (R10) | maestros activos |
| `por_fuera` | `confirmacion !== null && confirmacion.porFuera` (R13) | `pago_plataforma_por_fuera` (R11) | maestros activos |
| `anulado` | `anulacionDeLaPlataforma !== null` (R13) | `pago_plataforma_anulado` (R12) | maestros activos |

5. **Avisos del maestro:**
   - primero emite la campanita. Si lanza, el trabajo falla antes de enviar nada y el reintento no la duplica
     (R15, R18);
   - después lee `destinatariosDelAviso(org, null)`. Con `null` o sin maestros, termina (R16).
6. **Envío:** un correo por destinatario con `plantillaPagoPlataforma` (§6). Si alguno falla, sigue con los demás y
   después lanza `pago_plataforma_aviso: fallaron N de M envío(s) a la empresa <org>`, sin direcciones (R18).

**Notas:**
- **Un confirmado que después se anula** sigue mandando su aviso de confirmado si el trabajo corre tarde: el hecho
  ocurrió y la confirmación es inmutable. El de anulado llega con su propio trabajo (R5, R15).
- **El superadmin no recibe un pago que ya resolvió:** si confirma o la empresa anula antes de que corra el trabajo,
  `porConfirmar` es falso y no sale nada (R8).
- **La entrega es «al menos una vez»,** como en SLT-136 §7.2: si el SMTP envía y el trabajo falla antes de marcarse
  hecho, el correo se repite. Ese residuo ya está aceptado (SLT-128).

### 4.2 Registro

- `lib/modulos/reparto.ts`: `MODULO_POR_JOB.pago_plataforma_aviso = "nucleo"` (R22).
- `app/api/cron/procesar-jobs/route.ts`:
  `handlers.set("pago_plataforma_aviso", crearPagoAvisoHandler(buildDepsAvisoPago))`. No es recurrente.

### 4.3 Composition root

`buildDepsAvisoPago()` vive en `jobs-pago-aviso.ts` y arma:
- `new PagoPlataformaAvisoRepository(getPrismaClient())` y `new PlanesRepository(getPrismaClient())`;
- `emitirAvisoPagoPlataformaReal`;
- `crearEmailSender()`, `emailContacto()` y `baseUrlDeLaApp()`.

## 5. La campanita (R10–R12, R14, R15, R17)

**`lib/notificaciones/emitir.ts`:**

```ts
export type AvisoPagoContexto =
  | { aviso: "confirmado" | "por_fuera"; pagoId: string; fecha: Date; facturas: number[] }
  | { aviso: "anulado"; pagoId: string; fecha: Date; motivo: string };
export function textoAvisoPagoPlataforma(ctx: AvisoPagoContexto): string;
export async function emitirAvisoPagoPlataforma(repo, ctx, tx?): Promise<number>;
```

Los textos van sin montos (regla 146 §4.6) y en forma impersonal:

| Aviso | `descripcion` | `anexo` |
|---|---|---|
| confirmado | `La plataforma confirmó el pago del dd/mm/aaaa.` | `Aplicado a: factura N.º 1, factura N.º 2.` |
| por fuera | `La plataforma registró un pago hecho por fuera de la app, del dd/mm/aaaa.` | igual que confirmado |
| anulado | `La plataforma anuló el pago del dd/mm/aaaa.` | `Motivo: <motivo>` |

- Cada aviso es **una** fila `alert` con `entidadTipo: "pago_plataforma"`, `entidadId: pagoId` y
  `destinatario: { tipo: "rol", rol: "maestro" }`.
- No hay filas para `admin`, para otro rol ni para un usuario concreto (R17). El superadmin no tiene empresa
  (SL-32 R6).
- Es `alert` porque es dinero de la empresa con la plataforma, como `factura_plataforma_emitida`.

**El resto de los archivos:**
- **`notificadores.ts`:** `emitirAvisoPagoPlataformaReal = (ctx) => emitirAvisoPagoPlataforma(repoReal(), ctx)`. No es
  best-effort.
- **`catalogo-avisos.ts`:** las tres entradas son
  `{ porDefecto: { clase: "accionable", atajo: { href: "/wallet", etiqueta: "Ver wallet" } }, destinatarios: ["maestro"] }`
  (R14). La guardia R5 del catálogo comprueba que el maestro ve `/wallet`.
- **`push-elegibles.ts`:** las tres son `push: "no"`, con el motivo «El canal decidido para el maestro es correo y
  campanita (SLT-132, 2026-11-20)» (R14).
- **`lib/whatsapp-envios/eventos.ts`:** las tres son `disponible: false`, con el motivo «Aviso del dinero de la empresa
  con la plataforma, solo para su maestro; ya le llega por correo» (R14).
- **`lib/types/notificacion.ts`:** los tres eventos y la entidad, con su comentario.

## 6. La plantilla (`lib/services/email/plantillas/pago-plataforma.ts`, R7, R10–R12, R19–R21)

```ts
interface ComunDelCorreo {
  to: string; nombre: string; empresaNombre: string;
  pago: { monto: string; fecha: Date; referencia: string | null };
  contacto: string | null; urlApp: string | null;
}
export type CorreoPagoPlataforma = ComunDelCorreo & (
  | { tipo: "registrado"; organizacionId: string }
  | { tipo: "confirmado" | "por_fuera"; aplicaciones: { numero: number; monto: string }[] }
  | { tipo: "anulado"; motivo: string }      // SLT-142 suma { tipo: "rechazado"; motivo } con la misma forma
);
export const PAGO_PLATAFORMA_TEXTOS: Record<CorreoPagoPlataforma["tipo"], TextosDelAviso>;
export function plantillaPagoPlataforma(c: CorreoPagoPlataforma): EmailMessage;
```

**Estructura común** (R21), sobre `componerCorreo`:
1. El asunto es `${T.titulo} — ${empresaNombre}`, y el preheader, `${T.titulo}: ${monto}`.
2. Párrafo `Hola, ${nombre}:`.
3. Párrafo con la frase del aviso (`T.frase(empresaNombre)`).
4. Tres párrafos: `Monto: ₡…`, `Fecha del pago: dd/mm/aaaa` y `Referencia: …` o `Referencia: Sin referencia`.
5. La parte propia del aviso:
   - **confirmado y por fuera:** `Se aplicó a:` y un párrafo por factura, `Factura N.º n: ₡…`. `componerCorreo` no
     tiene bloque de lista, el mismo ajuste que SLT-136 §7.4;
   - **anulado:** `Motivo: …` y la nota «El monto vuelve a la caja de la empresa y las facturas recuperan su saldo.».
6. El botón `T.boton` a `T.ruta(c)`, o, sin `urlApp`, una `nota` con `T.sinUrl` (R19).

**Textos por tipo:**

| tipo | título | frase | botón → ruta | sin URL |
|---|---|---|---|---|
| registrado | Pago por confirmar | `${empresa} registró un pago a la plataforma que espera confirmación.` | «Ver empresa» → `/plataforma/empresas/${organizacionId}` | «Está en Plataforma > Empresas, en el detalle de la empresa.» |
| confirmado | Pago confirmado por la plataforma | «La plataforma confirmó el pago y lo aplicó a las facturas de la empresa.» | «Ver wallet» → `/wallet` | «Está en la wallet, dentro de la app.» |
| por_fuera | Pago registrado por la plataforma | «La plataforma registró un pago hecho por fuera de la app y lo aplicó a las facturas de la empresa.» | «Ver wallet» → `/wallet` | igual |
| anulado | Pago anulado por la plataforma | «La plataforma anuló un pago confirmado de la empresa.» | «Ver wallet» → `/wallet` | igual |

**Formato y escape:**
- **Montos:** `formatearMontoEn(MONEDA_DE_LOS_PLANES, valor, SIN_MONTO_RAYA)` sobre el texto de la base (R20).
- **Fecha:** `diaDeLaPlataforma`. Se exporta desde `emitir.ts` para que el correo y la campanita no diverjan.
- **Escape:** todo dato variable lo escapa `componerCorreo`.
- **Remitente:** el `EmailMessage` no lleva `from`, así que sale el de `SMTP_FROM` (R20).
- **Adjuntos:** ninguno.
- **Guardia de SLT-91:** ningún literal `/mi-plan` (R24).

**Para SLT-142:** se suma una variante a la unión y una fila a `PAGO_PLATAFORMA_TEXTOS`. El `Record` exhaustivo hace
que el compilador pida los textos, y la parte del motivo ya existe.

## 7. Autorización y aislamiento

| Qué | Quién | Dónde |
|---|---|---|
| Disparar los avisos | Quien ya puede hacer la operación: `maestro` o `admin` (registro, SL-45) y el superadmin (SLT-60, SLT-143) | Sin cambios: el encolado va dentro de la operación ya autorizada |
| Leer los datos del aviso | El trabajo, como plataforma | `PagoPlataformaAvisoRepository` (`comoPlataforma`, en `EXCEPCIONES_DE_PLATAFORMA`), con el `organizacion_id` del trabajo escrito en cada filtro |
| Ver el aviso | El rol `maestro` de esa empresa | La RLS de `notificacion` y su destinatario de rol |

No hay módulo: todo es núcleo. Ninguna action ni pantalla nueva.

## 8. Tests (trazabilidad R → test)

| Archivo | Cubre | Cómo |
|---|---|---|
| `tests/integration/db/pago-plataforma-aviso-migration.test.ts` (nuevo) | R23 | Los cinco valores existen; el `down` quita solo esos cinco, aborta si un aviso o un trabajo los usa, y es idempotente |
| Inventarios de enums (se amplían a mano con los valores nuevos) | R23 | `tests/integration/db/notificacion-evento-{bloqueo-cierre,dia-reparto-corregido,gasto-fijo,postulacion-recurso,webhook-suscripcion}-migration.test.ts`, `orden-traspaso-migration.test.ts`, `factura-plataforma-aviso-migration.test.ts`, `migracion-plan-borrador-ida-y-vuelta.test.ts`, `tests/integration/api/procesar-jobs-{webhook-estado,geocodificacion}.test.ts`. Si el gate pone en rojo otro inventario, se amplía igual |
| `tests/integration/db/pago-plataforma-aviso-encolado.test.ts` (nuevo) | R1–R6 | Base real, empresas A y B, factura cerrada con `_fixtures/factura-cerrada.ts`. Casos en la tabla de abajo |
| `tests/integration/db/pago-plataforma-aviso-datos.test.ts` (nuevo) | R7, R8, R13 | `datosDelPago` en los cuatro estados (por confirmar, confirmado, por fuera y anulado por la plataforma, con su motivo) y en uno anulado por la empresa (no por confirmar y sin anulación de la plataforma); un id de otra empresa → `null`; `porConfirmar` coincide con `pago_plataforma_por_confirmar`; `superadminActivo` → el sembrado; inactivo → `null` |
| `tests/unit/planes/jobs-pago-aviso.test.ts` (nuevo) | R7–R18, R22 | Dobles. Cada aviso a su destinatario; `registrado` ya no por confirmar → nada; sin superadmin → nada; hecho inexistente → nada; la campanita se emite antes de enviar y, si lanza, no envía; sin maestros → solo la campanita; un envío falla → sigue y lanza sin el correo; nunca `emitirAviso` en `registrado`; payload malo o sin empresa → lanza; `MODULO_POR_JOB` es `nucleo` |
| `tests/unit/services/email/plantilla-pago-plataforma.test.ts` (nuevo) | R7, R10–R12, R14, R19–R21 | Los cuatro tipos: asunto `— empresa`, saludo, monto con la moneda de los planes sin redondear («1234.5» → el texto de `formatearMontoEn`), fecha `dd/mm/aaaa` (un pago a las 23:30 CR), referencia o «Sin referencia», facturas o motivo, botón y su URL, ninguno con `/mi-plan`; sin URL → nota y sin botón; sin `from`; un nombre y un motivo con `<` se escapan; el `Record` de textos cubre todos los tipos |
| `tests/unit/notificaciones/emitir-pago-plataforma.test.ts` (nuevo) | R10–R12, R15, R17 | Una fila por aviso, rol `maestro`, entidad = pago y tipo `pago_plataforma`; textos sin «₡» ni importes; el anexo con las facturas o el motivo; la segunda emisión no crea fila; confirmado y anulado del mismo pago → dos filas |
| `tests/unit/notificaciones/catalogo-avisos.test.ts`, `push-elegibles.test.ts`, `tests/unit/whatsapp-envios/eventos-envio.test.ts` (se amplían) | R14 | Accionable con «Ver wallet» → `/wallet`, solo para el maestro; push no; WhatsApp no disponible |
| `tests/unit/services/notificacion-notificadores-reales.test.ts`, `notificacion-productores-wiring.test.ts`, `tests/unit/whatsapp-envios/fila-puenteable.test.ts` (se amplían si cubren todos los eventos) | R14 | `emitirAvisoPagoPlataformaReal` pasa por `repoReal()`; los eventos nuevos tienen su productor |
| `tests/unit/api/procesar-jobs-registro.test.ts` (se amplía) | R22 | El tipo nuevo tiene manejador y no es recurrente |
| `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts` (sin cambios) | R24 | Sigue en verde sin tocarse |
| `e2e/pago-plataforma-confirmacion.spec.ts` (se amplía, proyecto `dinero`) | R25 (pasos 1 y 2) | §9 |
| `e2e/pago-plataforma-por-fuera.spec.ts` (se amplía, proyecto `dinero`) | R25 (paso 3) | §9 |

**Casos de `pago-plataforma-aviso-encolado.test.ts`:**

| Paso | Resultado |
|---|---|
| A paga desde `WalletEgresoService` (con el tope real) | 1 trabajo `pago_plataforma_aviso`, `organizacion_id = A`, payload `{ pagoId, aviso: "registrado" }`, `dedupe_key` de §3 (R1) |
| A reenvía con la misma clave | Sigue habiendo 1 (R1, R5) |
| A intenta pagar por encima de lo disponible | `validation_error`; 0 trabajos nuevos (R1) |
| Un gasto variable y un ajuste manual de A | 0 trabajos (solo el pago encola) |
| El superadmin confirma el pago | 1 trabajo `confirmado` con empresa A (R2) |
| Confirmar otra vez (`ya_confirmado`) y una confirmación rechazada (`suma_distinta`) | 0 trabajos nuevos (R2) |
| Por fuera `ok`; repetir con la misma clave (`ya_registrado`); otro que supera el tope | 1, 0 y 0 (R3) |
| Anular el confirmado; anular otra vez (`ya_anulado`); anular uno no confirmado | 1, 0 y 0 (R4); el pago anulado tiene sus dos trabajos, confirmado y anulado (R5) |
| Se fuerza un fallo al encolar con un trigger temporal en `jobs`, en la transacción de confirmar | La confirmación no queda (R1–R4: misma transacción) |
| Se marca el trabajo como fallido | El pago, su confirmación y la deuda no cambian (R6) |
| Un pago de B | Su trabajo es de B; desde A no se ve (RLS de `jobs`) |

**Control de no vacuidad:** antes de afirmar, la factura está cerrada y la función `pago_plataforma_confirmar` existe
en `pg_proc`. Un `skip` por falta de base no cuenta como verde.

**Mutaciones que deben matar los tests:**
- encolar antes del `count === 0`;
- encolar `"registrado"` para cualquier categoría;
- encolar fuera de la transacción del superadmin;
- quitar la `dedupe_key`.

## 9. E2E (R25)

El pago de la empresa es el flujo crítico «Dinero: wallet» (`docs/checkpoints-proyecto.md`). Los dos specs se amplían
sin crear uno nuevo, con `correrCron("procesar-jobs")` de `e2e/_escenarios/crons.ts`. En CI no hay SMTP, así que
`crearEmailSender()` cae en la consola y el envío termina bien.

- **`e2e/pago-plataforma-confirmacion.spec.ts`:**
  1. **Después de que el maestro paga desde la wallet:** con el cliente del dueño, existe un trabajo
     `pago_plataforma_aviso` con `dedupe_key = pago_plataforma_aviso:registrado:<pagoId>` y `organizacion_id` = la
     empresa. Se corre `procesar-jobs` hasta que ese trabajo queda `done`, con su `last_error` vacío. Se espera la
     condición, nunca con `waitForTimeout`.
  2. **Después de que el superadmin confirma:** se corre la cola hasta que el trabajo `confirmado` queda `done`. El
     maestro abre la campanita y ve «La plataforma confirmó el pago del <fecha>.» y «Aplicado a: factura N.º 1.».
     Pulsa «Ver wallet» y la URL termina en `/wallet`.
- **`e2e/pago-plataforma-por-fuera.spec.ts`:** después del registro por fuera y de su anulación, se corre la cola
  hasta que los dos trabajos quedan `done`. El maestro ve en la campanita los dos avisos, y el de la anulación lleva
  «Motivo: <el motivo del test>».

Además se corren `e2e/pago-plataforma-sl45.spec.ts`, `e2e/wallet.spec.ts`, `e2e/dos-empresas-humo.spec.ts` y el grupo
`dinero` entero (`docs/perfil-agentes.md`).

## 10. Alternativas descartadas

1. **Un trigger `AFTER INSERT` en `wallet_movimiento`** que encole el aviso de todo `egreso_pago_plataforma`.
   - Cubriría también el SQL a mano.
   - Pero también el pago por fuera, que nace ya confirmado: el aviso «registrado» llegaría a un pago resuelto.
   - Pone en la base una lógica que hoy vive en TypeScript y se prueba con dobles.
   - Haría falta otra función del dueño con su `down.sql`.
2. **Encolar desde el servicio o la action después del commit.** Un fallo entre la operación y el encolado pierde el
   aviso para siempre (§3.3).
3. **Un puerto `IAvisoPagoPlataforma` en el constructor de `WalletEgresoService`.** Es más explícito, pero obliga a
   tocar el composition root, `scripts/demo-qa/receta.ts` y los cinco tests que construyen el servicio. El repositorio
   ya abre la transacción y conoce la categoría (§3.1).
4. **Cuatro tipos de trabajo, uno por aviso.** Cuatro valores de enum, cuatro manejadores casi iguales y más
   inventarios. Uno con `aviso` en el payload y su `dedupe_key` hace lo mismo.
5. **La dirección del superadmin en una variable de entorno**, como `PLAN_CHANGE_ALERT_EMAILS`. Descartada por el
   humano (2026-11-20): el usuario ya existe y es único.
6. **El enlace del maestro a `/mi-plan`.** Obligaba a enmendar otra vez la guardia de SLT-91 R10. Descartado por el
   humano (2026-11-20): el pago vive en la wallet.
7. **Avisos del maestro elegibles para push**, como la factura emitida. La decisión cerrada dice «correo y
   campanita»; sumar push sería ampliar el canal sin pedirlo.
8. **Una plantilla por aviso** (cuatro archivos). Repite la estructura y obligaría a SLT-142 a copiar una quinta. La
   decisión pide que SLT-142 reutilice la plantilla.
9. **Ampliar `PagoPlataformaConfirmacionRepository` con la lectura del aviso.** Ya tiene cinco operaciones y es de
   SLT-60 y SLT-143. Un repositorio propio, con su interfaz, deja al trabajo depender solo de lo que lee.

## 11. Riesgos

- **Tamaño:** unos 48 archivos. Está aceptado por el humano y el gate avisará.
- **Permiso de `servi_app` para `INSERT` en `jobs`** dentro de la transacción de la wallet: T0.2 lo comprueba con el
  precedente de `webhook_evento`.
- **Tests de integración que pagan** (`pago-plataforma-sl45*`, `wallet-*-458`, `factura-plataforma-deuda`) dejarán
  trabajos `pending` nuevos. T0.3 busca si alguno cuenta las filas de `jobs`, y se ajusta si hace falta.
- **Inventarios de enums:** la lista de §8 sale de un Grep. Si el gate pone en rojo otro, se amplía.
