# SLT-77 — tope-intentos-por-empresa · design.md

## Lo que ya existe

Buscado `tope`, `intentos`, `reintento` en `feature_list.json`; `REINTENTOS_MIN_INTENTOS` en `specs/`;
`MIN_INTENTOS_ENTREGA`, `reintentosConfig`, `umbral`, `enElTope`, `organizacion.update` en el código. El
grafo no tiene índice de este worktree: se buscó con Grep y Read.

| Apareció | Qué se hace |
|---|---|
| Ficha o spec que haga lo mismo | Ninguna. SLT-52 lo remite a esta ficha. |
| `lib/config/reintentos.ts` | Se retira (§5). |
| 276: `alcanzaElTope`, `permitidoEnElTope`, `MSG_TOPE_*`, `RESULTADOS_PERMITIDOS_EN_EL_TOPE` | Se reutilizan sin tocarlos: el tope entra por parámetro. |
| 215: `contarIntentosVigentes`, `contarIntentosEnLote` | Sin cambios (R30). |
| `IOrdenHistorialService` en 8 de los 10 servicios | Vía de entrada del tope (§3). |
| `appendAccion` y `resolverActorCongelado` (activación de SLT-54) | Rastro de R10 (§2.3). No hay mecanismo nuevo. |
| `current_setting('app.organizacion_id', true)` en `MiPlanRepository` y `CupoPlanRepository` | Molde de la lectura (§2.2). |
| `TarifasPantallaService`, `lib/actions/tarifas.ts`, `lib/tarifas/servicios.ts` | Se amplían (§4). |

**Lo medido contra el encargo.** Los 10 servicios son exactos. Ningún otro punto de `lib/` o `app/` lee el
valor; `scripts/contraste-454.sql` tiene un `3` propio de un contraste ya hecho y no se toca.

**`DevolucionSlaService` y `AvisosDiariosService` no mezclan empresas en producción.** Sus rutas los
corren dentro de `paraCadaEmpresa`, con `conEmpresa(id, ...)` (`app/api/cron/*/route.ts`), y la extensión
filtra `findDevueltasSla`. Cada `ejecutar` ve una sola empresa. Por eso basta leer el tope una vez por
corrida: no hace falta resolverlo por orden. El camino `deps.service` sin `deps.empresas` es solo de tests.

## 1. Modelo de datos

Columna en `organizacion`, no tabla nueva. `organizacion` es de plataforma: no lleva `organizacion_id` y ya
tiene RLS por `id`. No es tabla de negocio nueva, así que `lib/db/modelos-de-negocio.ts` no cambia.

```prisma
model Organizacion {
  // SLT-77: intentos de entrega de la empresa, de 1 a 10. Lo edita su `maestro`.
  topeIntentosEntrega Int @default(3) @map("tope_intentos_entrega")
}
```

### 1.1 Migraciones

A mano: `db:migrate:create` falla con P3006 en este repo. Dos, porque Postgres prohíbe usar un valor de enum
en la transacción que lo añade (mismo motivo que `20261104140000`). Antes de crearlas, mirar `origin/dev` y
tomar un timestamp mayor que el último. Ninguna edita una migración aplicada.

**`20261106160000_historial_tope_intentos`**

```sql
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'tope_intentos_cambiado';
ALTER TYPE "historial_accion_entidad" ADD VALUE IF NOT EXISTS 'organizacion';
```

`down.sql`: borra las filas con esos valores y recrea los dos tipos con la función dinámica de
`20261104140000/down.sql`, renombrada `_slt77`.

**`20261106160100_organizacion_tope_intentos`**

```sql
-- NOT NULL DEFAULT 3 deja en 3 a las existentes y a las futuras (R2), sin tocar el alta y sin reescribir la tabla.
ALTER TABLE "organizacion" ADD COLUMN "tope_intentos_entrega" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_tope_intentos_entrega_check"
  CHECK ("tope_intentos_entrega" BETWEEN 1 AND 10);  -- R6; molde: cobro_plataforma_por_orden

-- `organizacion` es de solo lectura para la app (20261022130000): se abre SOLO esto (R7).
-- `updated_at` porque Prisma y el UPDATE lo escriben; `es_demo`, `plan_id` y demás siguen en 42501.
GRANT UPDATE ("tope_intentos_entrega", "updated_at") ON "organizacion" TO servi_app;
CREATE POLICY "organizacion_propia_editar_tope" ON "organizacion" FOR UPDATE TO servi_app
  USING      ("id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("id" = NULLIF(current_setting('app.organizacion_id', true), ''));
```

`down.sql`: `DROP POLICY`, `REVOKE UPDATE (...)`, `DROP COLUMN` (que se lleva el CHECK). Pierde los valores
elegidos: se dice en §8.

No escribe en órdenes ni cierres. No hay backfill: la migración no mueve una orden (276 R35).

## 2. Lectura y escritura

### 2.1 Punto único

`lib/repositories/_shared/tope-intentos-empresa.ts`, único archivo con el SQL de lectura:

```ts
export async function leerTopeIntentosDeLaEmpresa(cliente: Pick<PrismaClient, "$queryRaw">): Promise<number> {
  const filas = await cliente.$queryRaw<{ tope: number }[]>`
    SELECT "tope_intentos_entrega" AS "tope" FROM "organizacion"
     WHERE "id" = NULLIF(current_setting('app.organizacion_id', true), '')`;
  if (filas.length === 0) throw new EmpresaNoResuelta("organizacion", "leerTopeIntentos");
  return filas[0].tope;
}
```

Acepta también el `tx` de una transacción.

### 2.2 Por qué SQL a mano y no Prisma

| Contexto | `prisma.organizacion.findFirst()` | Este SQL |
|---|---|---|
| Empresa | Su fila, por RLS | Su fila, por `id` y RLS |
| Sin contexto | Corre como dueño: **fila de cualquier empresa** | `EmpresaNoResuelta` (la extensión) |
| Plataforma | Corre como dueño: **fila de cualquier empresa** | Sin filas: `EmpresaNoResuelta` |

`findFirst` cobraría con el tope de otra empresa en los dos últimos. `findUnique` por id tampoco sirve:
`contextoActual()` viene vacío en una petición con sesión (lo dice `MiPlanRepository`). La guardia
`sql-a-mano-por-empresa` no aplica: `organizacion` no es tabla de negocio. Esto cumple R27.

Sin caché en memoria (R9): cuesta una consulta por ejecución.

### 2.3 Escritura

`TopeIntentosRepository.guardar(tope, actorUsuarioId)`, en una transacción:

1. `SELECT ... WHERE id = <contexto> FOR NO KEY UPDATE`. Sin fila, `EmpresaNoResuelta`. `FOR NO KEY UPDATE`, y no
   `FOR UPDATE`, para no frenar las FK a `organizacion` de cada inserción de la empresa; serializa dos
   guardados, así el «anterior» del historial es cierto.
2. Igual al vigente: devuelve `{ cambio: false }` (R11).
3. `UPDATE ... SET tope_intentos_entrega = $1, updated_at = now() WHERE id = <contexto>`.
4. `appendAccion` con `accion: "tope_intentos_cambiado"`, `entidadTipo: "organizacion"`, `entidadId` la empresa,
   `valorAnterior` y `valorNuevo` los dos números, y `resolverActorCongelado` (R10).

Interbloqueo con los cerrojos de SL-24: el guardado solo toma la fila de la empresa, y un alta que la tenga en
`FOR SHARE` le hace esperar, sin ciclo.

`lib/types/historial-accion.ts`: `tope_intentos_cambiado` en la categoría `mueve_dinero`, con etiqueta
«Cambió el tope de intentos de entrega»; entidad `organizacion` con etiqueta «Empresa».

## 3. Cómo llega el tope a cada punto

Se añade `topeIntentos(): Promise<number>` a `IOrdenHistorialService`, que delega en
`IOrdenHistorialRepository.leerTopeIntentos()`. **Ningún constructor cambia**: 8 de los 10 ya reciben ese
servicio por un `Pick`, que se ensancha. Un doble sin el método rompe el typecheck; un `new` no puede
olvidarlo (memoria «composition root que no inyecta»).

| Servicio | Línea hoy | Cambio | Lecturas |
|---|---|---|---|
| `MisAsignacionesService` | 345 lista, 669 gestión | `historial.topeIntentos()` | 1 por lista; 1 por gestión prohibible |
| `GestionDesdeAyudaService` | 212 | Igual | 1 por gestión |
| `NovedadesService` | 228 | Igual; se lee fuera del `map` | 1 por lista |
| `ReprogramacionTiendaService` | 90 | Igual | 1 |
| `GuiaAsignacionService` | 505 | Igual | 1 por lote |
| `AsignacionSateliteService` | 240 | Igual | 1 por lote |
| `AvisosDiariosService` | 313 | Se lee en `ejecutar`; `plazoDelLote` recibe `tope` | 1 por corrida |
| `DevolucionSlaService` | 105 | `historial.topeIntentos()` | 1 por corrida + R35 |
| `OrdenHistorialService` | 199 | `historialRepo.leerTopeIntentos()` | 1, solo si el rol no es `mensajero` |
| `CierresAdminService` | 1076 | `ICierresAdminRepository.leerTopeIntentos()`; no recibe el historial | 1 + R35 |

`CierresAdminRepository` sigue recibiendo `umbralIntentos` por parámetro. `lib/types/tope-intentos.ts` solo cambia
el comentario de la línea 57; el test que le prohíbe nombrar la configuración sigue (R33). La constante 1..10
vive en `lib/types/tarifa-flexible.ts`, no ahí: ese módulo lo importa el panel del mensajero.

### 3.1 Tope 1

`alcanzaElTope(0, 1)` da `true`, así que R28 sale sin código. Se prueba, porque es el valor nuevo que más
cambia el flujo.

### 3.2 La línea de tiempo y el mensajero (R32)

**Hallazgo:** `OrdenHistorialService.obtenerHistorial` autoriza al `mensajero` y hoy le devuelve `umbral`. La
pantalla no se le monta (`/ordenes` le da 404), pero la Server Action sí responde con su sesión. Contradice la
decisión cerrada y 276 R10.

Arreglo mínimo: el resultado pasa a `umbral: number | null`, con `null` para `mensajero`, y el tope ni se lee.
`HistorialOrdenSheet` pinta «Intento X» si llega `null`.

## 4. Controlador y pantalla

### 4.1 Contratos

```ts
// lib/types/tarifa-flexible.ts
export const TOPE_INTENTOS_MINIMO = 1;
export const TOPE_INTENTOS_MAXIMO = 10;
export const guardarTopeIntentosSchema = z.object({ tope: z.number().int().min(1).max(10) }).strict();

// lib/actions/tarifas.ts: withErrorHandler, actor por sesión
export async function guardarTopeIntentos(input: unknown, deps?): Promise<
  | { status: "ok"; tope: number }
  | { status: "forbidden" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "error" }
>;
```

- **Autorización:** `TopeIntentosService.guardar` comprueba `actor.rol === "maestro"` antes de mirar el input, como
  `TarifaActivacionService`. Fábrica en `lib/tarifas/servicios.ts`.
- **Módulo:** Tarifas es núcleo, sin puerta. Va en una action que `lib/modulos/reparto.ts` ya cubre.
- **País:** ningún dato depende del país, y los textos no nombran moneda.
- **Lectura:** `TarifasPantallaService.cargarPantalla` añade `topeIntentos`, tras su comprobación de `maestro`/`admin`.

### 4.2 La sección

`TarifasTopeIntentos.tsx`, junto a las demás secciones, al final de `TarifasModule`. Props: `tope` y
`puedeEscribir`, que la pantalla ya calcula. No es pantalla nueva: no pasa por `/design`. Usa `Select` de
`components/ui/` con 1..10, que evita valores inválidos sin quitar la validación del servidor.

Textos en `tarifas-textos.ts`. Borrador, que el humano ajusta al aprobar el spec:

- Título: «Intentos de entrega».
- Ayuda: «Cuántos intentos se hacen antes de pasar una orden a rechazo. Rige al guardar, para todas las órdenes
  sin terminar.»
- Aviso al bajar (R15): «Guardar no rechaza ni cobra nada. Pero las novedades que ya alcancen este número se
  rechazan en la siguiente corrida automática, sin más clics, y ese rechazo genera cobro. Las órdenes en bodega
  que ya lo alcancen no se podrán asignar.»
- Solo lectura (R13): «Lo cambia el maestro.»

## 5. `REINTENTOS_MIN_INTENTOS`: se retira

Se borran `lib/config/reintentos.ts` y su test. Tras esta ficha nadie lo lee, y conservarlo como respaldo dejaría
dos fuentes para una decisión que cobra: es el fallo que evita 276 R7. El valor inicial queda en un solo sitio, el
`DEFAULT 3` de la columna.

Consecuencia: si en producción la variable tuviera otro valor, la migración cambiaría el comportamiento en
silencio. Lo mide la T0 (§9).

## 6. Dinero y carreras

Alcanzar el tope lleva a `rechazada`, que genera `cobroRechazado` (276). Bajarlo adelanta ese cobro sin más clics,
y la decisión cerrada lo acepta. Guardar no escribe nada más (R8).

### 6.1 Qué valor usa cada ejecución

Un solo valor por ejecución (R34). Dos puntos, además, vuelven a mirar antes de escribir un rechazo:

**`DevolucionSlaRepository.escalarDevueltaSla`.** El servicio pasa `vetoPorTope: { intentos }` solo si el rechazo se
debe al tope, no si venció la ventana de un `wrong_*`, que escala igual:

```ts
// primera sentencia de la transacción
if (input.vetoPorTope) {
  const vigente = await leerTopeIntentosDeLaEmpresa(tx);
  if (input.vetoPorTope.intentos < vigente) return false;
}
```

`false` ya cuenta como `omitidas`, y la siguiente corrida decide. Una `not_found` vetada tampoco se libera ahí.

**`CierresAdminRepository.resolverCierre`, en la transacción, junto al conteo:**

```ts
const umbral = Math.max(umbralIntentos, await leerTopeIntentosDeLaEmpresa(tx));
```

### 6.2 Dirección de cada carrera

| Carrera | Qué pasa | Yerra hacia |
|---|---|---|
| Sube durante una corrida de devoluciones | Veto: no se rechaza | No cobrar |
| Sube antes de la lectura en la transacción de una aprobación | Gana el mayor: va a bodega | No cobrar |
| Baja durante cualquiera de las dos | Termina con el mayor; se resuelve después | No cobrar, ahora |
| **Sube entre la relectura y el `COMMIT`** | **Se rechaza y cobra con el tope anterior** | **Cobrar: ventana residual** |
| Gestión o asignación con un tope a punto de cambiar | Pasa o se rechaza; no escribe cobro | Sin dinero |
| Pantalla del mensajero con el booleano viejo | El servidor rechaza igual (276 R11) | Sin dinero |
| Aprobación concurrente sube el contador (ya declarada, 276 §9.2) | Sin cambio | No cobrar |

La ventana residual dura lo que queda de la transacción, y es indistinguible de «el proceso terminó justo antes de
guardar». Cerrarla exige un cerrojo sobre `organizacion` (§7).

Un rechazo ya hecho no se deshace al subir el tope después: «si sube, la orden gana intentos» vale para las órdenes
sin terminar.

### 6.3 Regla de lo mínimo

No cambia: el conteo, las familias de origen, el cobro, la transición, `LiberacionReprogramada`, ni las aristas. La
consecuencia en bodega se deja declarada en `requirements > P1`.

## 7. Alternativas descartadas

1. **Tabla `empresa_ajuste`, de negocio.** Da RLS y filtro por extensión sin abrir `organizacion`. Pero obliga a
   backfill, a tocar el alta y a decidir qué significa «sin fila»: un `?? 3` en código, justo la segunda fuente que se
   quiere evitar. La columna con `DEFAULT` lo resuelve sola.
2. **Función `SECURITY DEFINER` para escribir.** `docs/architecture.md` dice que `plan_de_la_empresa` es la «última»
   función que `servi_app` puede llamar. Un `GRANT` por columna basta.
3. **Escribir con `comoPlataforma`.** Sin RLS, y `EXCEPCIONES_DE_PLATAFORMA` solo puede bajar.
4. **Inyectar un repositorio nuevo en cada servicio.** Son más de 30 sitios de construcción, y un olvido en uno daría un
   notificador muerto con la suite verde. Por `IOrdenHistorialService` no hay nada que olvidar.
5. **Cerrojo `FOR SHARE` sobre `organizacion` en cada rechazo.** Cierra la ventana residual, pero cada aprobación y
   corrida bloquearía al guardado y competiría con los cerrojos de SL-24, por una ventana de milisegundos sobre un ajuste
   que casi nunca cambia.
6. **Dejar la variable de entorno como tope máximo o respaldo.** Dos fuentes (§5).
7. **Resolver el tope por orden en los crons.** Ya corren por empresa; sería una consulta o un `JOIN` para un dato
   único.

## 8. Reversión, para el plan de EP-8

Ese plan no existe aún como documento: D49 solo lo cita. Esto entra como deuda nueva en `progress/deudas.md`, junto a
D49, con el mismo dueño, para que se escriba al promover la épica.

**Volver a un despliegue anterior sin `down.sql`:**

- Toda empresa vuelve a 3 al instante, leyendo la variable (o su defecto). La base no se toca, y los valores se
  conservan para un redespliegue. Requiere que la T0 siga válida.
- **Una empresa que tenía 4 o más:** sus órdenes con 3 o más intentos se escalan en la siguiente corrida de
  devoluciones, y **generan cobro** sin que nadie lo decida. Quedan agotadas también en asignación. Antes de revertir hay
  que contar esas órdenes.
- **Una empresa que tenía 1 o 2:** sus órdenes vuelven a admitir intentos. Lo ya rechazado y cobrado no se revierte.
- Se suma a D49: volver atrás también exige revisar `tarifa_valor`.

**Con `down.sql`:** se pierden los valores y el historial de esos cambios. Solo si se abandona la feature.

## 9. Medidas antes del PR a producción

SLT-77 sale con EP-8. La T0 es de solo lectura y la ejecuta el leader, inmediatamente antes del PR a `prod`:

- `REINTENTOS_MIN_INTENTOS` en el entorno de producción de Vercel: decir solo si existe y si vale 3. **Si existe con otro
  valor, se para**: el `DEFAULT 3` lo cambiaría sin decidirlo.
- Sin medida de órdenes: al desplegar todas las empresas siguen en 3 y el comportamiento no cambia.

## 10. Pruebas

Unit con dobles para la lógica de cada servicio; el SQL y cada decisión por empresa, con Postgres real
(`tests/integration/db/`, `HAY_BASE_DE_DATOS`, sin `if (!x) return`).

**`tope-intentos-caminos.test.ts`:** empresas A (tope 2) y B (tope 4), con órdenes con 2 intentos vigentes creados por
cierres aprobados reales. Por cada camino, servicio real sobre cliente real, en `conEmpresa`: A bloquea o rechaza; B no.
Afirmar los dos lados evita que un vacío pase por acierto.

Los tests dejan de importar `reintentosConfig`: los umbrales van en literales a mano (memoria «aserción contra su propia
fuente»).

**E2E.** `docs/checkpoints-proyecto.md > Flujos críticos` lo exige, porque toca «Devoluciones, reintentos» y dinero:
`e2e/tope-intentos-por-empresa.spec.ts` en el proyecto `dinero`, más `reintentos-escalado` y `dos-empresas-humo`. No se
difiere.
