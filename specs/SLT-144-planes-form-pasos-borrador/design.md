# SLT-144 — planes-form-pasos-borrador · design.md

## Lo que ya existe

Busqué «borrador», «guardar y continuar», «fecha de cada empresa», «recepción», «N de M» y «Cambio en borrador» en
`feature_list.json`, `specs/` y el código. El grafo no tiene índice de este worktree (`index_status`: proyecto no
indexado), así que el código lo revisé con Grep y Read.

| Apareció | Qué es | Qué se hace |
|---|---|---|
| SLT-129 «Planes: borrador del plan guardado en el servidor por pasos» (`lib/actions/plan-borrador.ts`, `lib/types/plan-borrador.ts`, `PlanBorradorService`) | Las cuatro actions del borrador, los esquemas por paso, `BorradorVista`/`BorradorResumen` y `PlanBorradorService.borradores` | Se usan tal cual. Esta ficha no cambia el contrato del servidor del borrador. Se quitan los `@sin-superficie` (R29). |
| SLT-130 «Planes: formulario por pasos compartido en un sheet (crear y editar)» (`PlanForm.tsx`, `plan-form/*`, `components/shared/FormularioPorPasos.tsx`) | El formulario por pasos, la validación por paso con el esquema de la action, `pasoDeLaClave` y `camposEnOrden` | Se amplía. Sigue habiendo un solo `PlanForm` para los dos modos (decisión de SLT-130). |
| SLT-128 «Planes: el cambio programado del plan llega a cada empresa al inicio de su período» (`lib/planes/recepcion.ts > fechaDeRecepcion`, `PlanesRepository > excedidosDe`, `programarCambio`, `detalle`) | Cómo se calcula la fecha de cada empresa y los topes pasados al programar, y el conteo «N de M» | La vista previa (§3.1) llama a esas mismas funciones; no se copia ninguna regla. «N de M» se corrige en `detalle` (§3.2). |
| `previsualizarCustomAction` + la vista previa del custom en `PlanForm` (D13/D17, espera de 300 ms, clave de vigencia) | El patrón de una lectura previa que se repite con debounce y descarta respuestas viejas | Se copia la forma, no el código, para la fecha de cada empresa (§5). |
| `components/shared/AvisosDeTopes.tsx` (`textosDeLosAvisosDeTopes`) | El texto de los topes pasados que ya pintan el detalle y el alta | Se reutiliza para R18. |
| `components/shared/Modal.tsx` | Las confirmaciones de archivar y cancelar en `PlanDetalle` | Se reutiliza para descartar (R16, R27). |
| `PlanDetalle.tsx > fechaHora` (privada) | `AAAA-MM-DD HH:mm` en la hora de la plataforma | Se mueve a `plan-form/borrador.ts` y se exporta. `PlanDetalle` la importa de ahí. |
| SLT-135 «Planes: sin «De inmediato» al editar un plan» (en paralelo) | Quita «De inmediato» del paso «Cuándo rige» | No se toca. Con «De inmediato» no hay F y no se pinta la tabla (R17). Cuando SLT-135 lo quite, la tabla saldrá siempre, sin cambios aquí. Las dos fichas tocan `PasoCuandoRige.tsx`: aquí solo se añade debajo `<FechasPorEmpresa>`. |

Nada de lo encontrado hace ya lo que pide esta ficha.

## 1. Modelo de datos

- **Sin tablas, columnas, migraciones ni RLS nuevas.** No hay `down.sql`. `plan_borrador` es de SLT-129.
  `plan_cambio_recepcion` y `plan_version_empresa` son de SLT-128.
- **Sin `organizacion_id` nuevo.** Las lecturas nuevas son de plataforma, en `PlanesRepository`, bajo
  `comoPlataforma("SL-24", …)`, como el resto de lecturas de planes del superadmin. No hay excepción de aislamiento
  nueva.

## 2. Autorización, módulo y país

- **Quién:** solo el superadmin.
  - Las páginas ya hacen `notFound()` antes de leer nada si `!esPlataforma(actor.rol)`. Ahora lo hacen también
    antes de leer los borradores (R28).
  - Las actions del borrador ya responden `forbidden` (SLT-129 R1).
  - La lectura nueva, `previsualizarCambio`, valida en el servicio con `esSuperadmin` antes de zod y del
    repositorio (R22).
- **Módulo:** ninguno. Planes es núcleo. La action nueva va en `lib/actions/planes.ts`, que ya es núcleo en
  `lib/modulos/reparto.ts`.
- **País:** nada nuevo.
  - Las fechas salen en `AAAA-MM-DD` con la hora de la plataforma (`fechaCalendarioCR`, `horaCostaRica`).
  - Los importes se pintan con los helpers de hoy (`montoParaCampo`, `textoDelPrecio`).
  - El tipo de cobro de cada empresa sale de `organizacion.plan_tipo_cobro`, la misma columna que usa `programarCambio`.

## 3. Servidor

### 3.1 Vista previa del cambio: la fecha de cada empresa y los topes (R17–R22)

**Cómo se obtiene la fecha de cada empresa antes de programar.** Con una lectura de servidor que llama a las MISMAS
piezas que `programarCambio`:
- la fecha de cada empresa: `fechaDeRecepcion(tipo, F)` de `lib/planes/recepcion.ts`;
- los topes pasados: `excedidosDe(tx, empresas, topes)`;
- F: la convierte de `AAAA-MM-DD` a instante la misma función que `editar` usa con `vigenteDesde`.

Así lo que se ve en «Cuándo rige» es lo que programar escribirá en `plan_cambio_recepcion.recibe_at` y devolverá en
`avisos`. R21 lo prueba comparando las dos cosas.

- **Tipos** (`lib/types/planes.ts`):

  ```ts
  export const previsualizarCambioSchema = z.object({
    planId: z.uuid(),
    vigenteDesde: fechaSchema.nullable(),   // null = «De inmediato»: solo avisos, sin fechas
    topes: topesPlanSchema,
  }).strict();
  export type FechaDeEmpresa = { empresaId: string; empresa: string; tipoCobro: TipoCobro; recibeEl: string | null };
  export type VistaPreviaCambioResult =
    | { estado: "ok"; empresas: FechaDeEmpresa[]; avisos: TopeExcedido[] }
    | { estado: "forbidden" } | { estado: "validation_error"; fieldErrors: Record<string, string[]> } | { estado: "not_found" };
  ```

- **Repositorio** (`IPlanesRepository.vistaPreviaCambio(planId, topes)`): una transacción de lectura, sin cerrojos ni
  escrituras.
  - Si el plan no existe, devuelve `null`.
  - Si existe, lee `organizacion WHERE plan_id = P ORDER BY nombre, id` con `id`, `nombre` y `plan_tipo_cobro`, y
    calcula `avisos = excedidosDe(tx, empresas, topes)`.
  - Devuelve `{ empresas: { id, nombre, tipoCobro }[], avisos }`.
- **Servicio** (`PlanesService.previsualizarCambio(actor, input)`), en el orden de siempre:
  1. quién (`forbidden`);
  2. zod (`validation_error`);
  3. el repositorio (`null` → `not_found`);
  4. por empresa, `recibeEl = vigenteDesde === null ? null : fechaCalendarioCR(fechaDeRecepcion(tipo, F))`.

  No mira el rango de F: eso lo hace confirmar (SLT-129 R19). Una F inválida para programar también se previsualiza.
- **Action** (`lib/actions/planes.ts > previsualizarCambioPlanAction`): `conServicio(deps, (s, a) => s.previsualizarCambio(a, input))`,
  como `previsualizarCustomAction`. La inyecta `[planId]/page.tsx` en `PlanDetalle`, y de ahí llega a `PlanForm`.

### 3.2 «N de M» con las empresas que entran en F o después (R23)

`PlanesRepository.detalle` pasa a leer también `versionesDeEmpresa` con `cambioId = pendiente.id` y
`noAplicadaAt = null`. La función pura `pendienteDelDetalle` cuenta por **empresa**:
- `R`: las empresas con recepción del pendiente;
- `V`: las empresas con versión propia de ese pendiente.

`total = |R ∪ V|` y `recibidas = |{r ∈ R : recibidoAt ≠ null} ∪ (V \ R)|`.

Una empresa que recibió por recepción tiene fila en `R` y en `V` (SLT-128 §3.3, paso 6) y cuenta una sola vez. Una
que entró en F o después solo está en `V` (`entrarAlCambioEnTx`) y cuenta como recibida. Una que sale del plan pierde
las dos filas (SLT-128 §3.5). El tipo `PendienteDelDetalle` no cambia: solo cambian los números. Las no aplicadas
siguen en `total` y fuera de `recibidas`, como hoy (R28 de SLT-128).

### 3.3 Lector de borradores para la página (R24, R25, R28)

En `lib/actions/_shared/planes-plataforma.ts` se añade `verBorradoresDePlanes(actor, servicio?)`. Es una lectura sin
action, como `verCatalogoDePlanes`, sobre `PlanBorradorService.borradores` (SLT-129 §4), con su composition root:
`new PlanBorradorService(repo, new PlanesService(repo))`.

`planes/page.tsx` lo llama en el mismo `Promise.all` que el catálogo y las empresas, DESPUÉS del `notFound()`. Si
falla (lanza o no es `ok`), pasa `borradores: null` y el catálogo sigue (R24).

## 4. Cliente: el formulario con borrador

### 4.1 Archivos

```
components/shared/FormularioPorPasos.tsx         + `guardados` y `sinGuardar` (✓, «Sin guardar», R5, R6)
app/(app)/plataforma/planes/_components/
  PlanForm.tsx                    guardar por paso, confirmar, avisos de borrador (R1, R3, R4, R7–R12, R15, R16)
  BorradoresDePlanes.tsx          NUEVO: sección «Borradores» y su diálogo de descartar (R24, R26, R27)
  PlanesModule.tsx                monta la sección, la marca (R25), «Retomar» y el aviso al cerrar (R13)
  plan-form/borrador.ts           NUEVO, puro: valoresDelPaso, formDelBorrador, pasoInicial, fechaHora (R2, R15)
  plan-form/usar-borrador.ts      NUEVO: hook con el estado del borrador y las llamadas (R1, R4, R10–R12)
  plan-form/AbrirPlanForm.tsx     NUEVO: lee el borrador y muestra cargando/error antes de montar PlanForm (R14)
  plan-form/FechasPorEmpresa.tsx  NUEVO: tabla de fechas y avisos de topes, con sus estados (R17–R20)
  plan-form/PasoCuandoRige.tsx    + <FechasPorEmpresa> debajo de los controles de hoy
  plan-form/PasoRevisar.tsx       + <FechasPorEmpresa> al editar; motivo «Faltan pasos por guardar» (R8)
  plan-form/estado.ts             + IdPasoGuardable, PASOS_QUE_SE_GUARDAN
  plan-form/textos.ts             textos nuevos (§9)
[planId]/_components/PlanDetalle.tsx  monta AbrirPlanForm; abre con ?editar=1 (R26); aviso al cerrar (R13)
```

### 4.2 Del formulario al borrador y de vuelta (`plan-form/borrador.ts`, R2)

```ts
type IdPasoGuardable = Exclude<IdPaso, "revisar">;
function valoresDelPaso(modo, paso: IdPasoGuardable, form: Formulario, visibles: CamposVisibles): ValoresDelPaso;
function formDelBorrador(base: Formulario, pasos: BorradorVista["pasos"]): Formulario;
function pasoInicial(modo, guardados: ReadonlySet<IdPasoGuardable>): IdPaso;   // primer paso sin guardar, o "revisar"
function fechaHora(iso: string): string;                                       // movida desde PlanDetalle
```

Cada paso arma sus valores igual que hoy `peticion()` arma la petición entera, con `versionDe` y `precioDe`:

| Paso | Valores |
|---|---|
| `general` al crear | `nombre`, `visibilidad`, `organizacionId` (`null` si es público), `tipoCobro` si es custom, `inicioCiclo` si `pideInicioCiclo`, `vigenteDesde` si `pideFechaDeEfecto` |
| `general` al editar | `{ nombre }` |
| `precio` | `{ precio: { tipo: "sin_precio" } }` o `{ precio: { tipo: "monto", mensual, descuentos: [{ periodo, tipo: forma, valor }] } }`, en el orden de la lista |
| `orden` | `costoPorOrden`, `costoPorOrdenPorcentual`, `periodicidadOrdenes` de `versionDe` |
| `topes` | `{ topes }` de `versionDe` |
| `modulos` | `{ modulos }` de `versionDe` |
| `vigencia` | `{ vigenteDesde: cambiaPrecio ? precioDesde : aplicar === "inmediato" ? null : vigenteDesde }` |

`formDelBorrador` hace la inversa sobre `base`: `inicial(plan, …)` al editar, `inicial(null, …)` al crear.
- Los importes pasan por `montoParaCampo`, como `inicial`.
- `vigencia` con fecha pone `precioDesde = vigenteDesde = d` y `aplicar = "programado"`; así sirve tanto si cambia el
  precio como si no.
- `vigencia` con `null` pone `aplicar = "inmediato"`.

La prueba de ida y vuelta de R2 se hace por paso.

### 4.3 Estado del borrador (`plan-form/usar-borrador.ts`)

```ts
type EstadoDelBorrador = {
  borradorId: string | null;
  guardados: ReadonlySet<IdPasoGuardable>;        // los que el servidor confirmó
  instantaneas: Partial<Record<IdPasoGuardable, string>>; // JSON de valoresDelPaso al guardar, para «Sin guardar»
  actualizadoAt: string | null;
  aviso: string | null;                           // R10–R12, R15
  enVuelo: boolean;                               // R4
};
```

- **Sin guardar (R6):** un paso guardado pasa a `sinGuardar` si `JSON.stringify(valoresDelPaso(…))` ya no es igual a su
  instantánea.
- **Navegación (R5):** se puede elegir el paso `i` si `i === 0`, si `guardados.has(p[i])` o si
  `guardados.has(p[i-1])`. `FormularioPorPasos` sustituye `visitados` por `elegibles` (mismo tipo) y añade
  `guardados` y `sinGuardar` para pintar ✓ o «Sin guardar». El nombre accesible del botón es «<título> (guardado)».
- **«Guardar y continuar» (R1, R3):** sustituye a «Siguiente».
  1. Corre la validación de hoy por paso (`siguiente()` de SLT-130). Si hay errores, no llama a nada.
  2. Con `enVuelo = true` (R4), llama a `guardarPaso`. Al crear: `{ modo: "crear", borradorId, paso, valores }`. Al
     editar: `{ modo: "editar", planId, paso, valores }`.
  3. Con `ok`: `guardados = pasosGuardados` de la respuesta, la instantánea del paso, `actualizadoAt`, y avanza.
  4. Con `validation_error`: `mostrarErrores(fieldErrors)`, igual que hoy. Una clave sin campo (`paso`) va al aviso
     del paso.
  5. Con otro rechazo o un throw: el aviso del paso. Los textos están en §9.
- **Confirmar (R8, R9):** el botón final llama a `confirmar({ borradorId })`. Se habilita solo si
  `PASOS_QUE_SE_GUARDAN(modo)` están todos en `guardados`, ninguno está en `sinGuardar` y `!enVuelo`. El resultado
  `PlanResult` se trata como hoy en `guardar()`; el texto del botón (`textoEnviar`) no cambia. Además:
  - `pasos_pendientes`: quita esos pasos de `guardados` y va al primero;
  - `borrador_no_encontrado`: aviso general de «Revisar».
- **El ✓ cuando confirmar devuelve un error de campo:** los pasos conservan el ✓. Al corregir, el paso queda «Sin
  guardar» y hay que volver a guardarlo, así que no se puede confirmar con el valor viejo.

### 4.4 Guardado tardío tras confirmar (review m4 de SLT-129) y borrador compartido

El problema: un guardado del cambio que espera al `FOR UPDATE` de una confirmación en curso no encuentra la fila al
soltarse, y el `INSERT … ON CONFLICT` crea un borrador NUEVO con solo ese paso.

- **En la misma pantalla se evita (R4).** Hay un solo `enVuelo` para guardar y confirmar. Mientras hay uno en vuelo,
  no se puede pulsar ningún otro botón ni elegir otro paso, y Enter se ignora. Confirmar exige además que no haya
  pasos «Sin guardar». Así, esta pantalla nunca manda un guardado después de su propia confirmación. Tras el `ok` el
  panel se cierra y el formulario se desmonta: no queda ningún guardado pendiente que pueda llegar tarde.
- **Si viene de otra pantalla, se tolera (R10–R12).** Otro superadmin u otra pestaña pueden confirmar o descartar
  mientras esta sigue abierta.
  - **Editar, id distinto (R10):** si `ok.borradorId !== borradorId` y el `borradorId` conocido no es `null`, el
    borrador abierto ya no existe y el servidor abrió otro. La pantalla avisa, adopta el id nuevo y deja `guardados`
    en lo que trae la respuesta. Con eso, confirmar exige guardar otra vez los demás pasos, y el usuario no programa
    por error un cambio a medias. Si no lo quiere, tiene «Descartar y empezar de nuevo».
  - **Crear (R11):** `guardarPasoDeCreacion` con un id que ya no existe responde `borrador_no_encontrado`, y el
    servidor no abre otro. La pantalla avisa y no reintenta sin borrador, porque eso crearía un plan nuevo duplicado
    sin que nadie lo pida.
  - **Pasos ajenos (R12):** si `pasosGuardados` trae pasos que no estaban en `guardados` (por ejemplo, otro
    superadmin empezó el borrador de cambio mientras esta pantalla lo tenía en `null`), la pantalla llama a
    `leer({ borradorId })` y aplica `formDelBorrador` solo sobre esos pasos. Avisa, y lo escrito en los demás pasos se
    queda. Si el mismo paso lo guardan dos a la vez, gana el último sin aviso, que es la decisión heredada de SLT-129.

### 4.5 Abrir, retomar y descartar (`plan-form/AbrirPlanForm.tsx`, R14–R16)

```ts
type AbrirPlanFormProps = PlanFormProps & { origen: { planId: string } | { borradorId: string } | null };
```

- `origen === null` (un «Nuevo plan»): monta `PlanForm` sin borrador.
- En los demás casos, llama a `leer(origen)`:
  - mientras lee, «Cargando el borrador…» (`role="status"`);
  - si lanza o no es `ok`, «No se pudo leer el borrador.» con «Reintentar»;
  - `ok` con `borrador: null`: al editar, el formulario de hoy; al retomar una creación, «Este borrador ya no existe.»
    con «Cerrar»;
  - `ok` con borrador: monta `PlanForm` con `borradorInicial`.
- `PlanForm` con `borradorInicial`:
  - `form = formDelBorrador(base, pasos)`;
  - `guardados = pasosGuardados`, y las instantáneas se toman de esos valores;
  - `paso = pasoInicial(…)`.

  **Decisión del spec:** abre en el primer paso sin guardar y no en General. Retomar es seguir donde se dejó; desde
  la lista se puede volver a cualquier paso guardado (R5).
- **Aviso (R15):** «Borrador de <iniciadoPor>, guardado el <fechaHora(actualizadoAt)>», con «Descartar y empezar de
  nuevo».
- **Descartar (R16):** `Modal` de confirmación y luego `descartar({ borradorId })`.
  - Con `ok` o `borrador_no_encontrado`: `form = base`, `guardados = ∅`, `borradorId = null` y paso `general`. Al
    editar, el siguiente guardado crea el borrador de cambio otra vez (SLT-129 R5).
  - Si falla: el mensaje se queda en el `Modal`.

  **Decisión del spec:** pide confirmación igual que «Descartar» en la lista. La decisión cerrada del 2026-11-17
  pide confirmación para descartar, y este botón borra lo mismo.

### 4.6 Estado del borrador en pantalla (R7, R13)

- Encima de `FormularioPorPasos`: «Borrador · <guardados.size> de <PASOS_QUE_SE_GUARDAN.length> pasos guardados».
- En el pie, a la izquierda: «Aún sin guardar» o «Borrador guardado el <fechaHora(actualizadoAt)>».
- En los pasos que se guardan, el aviso de la maqueta: «Borrador: se guarda al continuar, …».
- `PlanForm` avisa a quien lo monta con `onBorradorGuardado()` en el primer `ok` de un guardado. Al cerrar el `Sheet`
  (`onOpenChange(false)`) sin haber confirmado, `PlanesModule` y `PlanDetalle` pintan «El borrador queda guardado.
  Puedes retomarlo luego.» (`role="status"`).

### 4.7 Props de `PlanForm`

`enviar` se sustituye por `borrador: AccionesDelBorrador`, con `{ guardarPaso, leer, descartar, confirmar }`: las
actions de `lib/actions/plan-borrador.ts`, inyectadas desde la página para poder probarlas.

Se añaden:
- `borradorInicial: BorradorVista | null`;
- `onBorradorGuardado?: () => void`;
- al editar, `previsualizarCambio: (input) => Promise<VistaPreviaCambioResult>`.

`crearPlanAction` y `editarPlanAction` dejan de bajar a la pantalla, pero siguen existiendo y funcionando
(SLT-129 R21). Siguen teniendo superficie por la API y las demás pantallas que ya la tienen: la guardia de superficie
se comprueba en T8.

2026-11-18 (humano): crearPlanAction y editarPlanAction se borran; deja sin efecto SLT-129 R21 en ese punto.

## 5. Cliente: fecha de cada empresa (`plan-form/FechasPorEmpresa.tsx`)

### 5.1 Cuándo se pide

`PlanForm` (solo al editar) calcula la entrada `{ planId, vigenteDesde: F | null, topes: versionDe(form).topes }`:
- F es `precioDesde` si cambia el precio;
- si no cambia, F es `vigenteDesde` con «A partir de», o `null` con «De inmediato».

La pide solo si `paso` es `vigencia` o `revisar` y la entrada pasa `previsualizarCambioSchema`. Espera
`ESPERA_VISTA_PREVIA_MS` (300 ms) desde el último cambio, y la respuesta va atada a la clave de la entrada: una
respuesta vieja no se pinta (R20). Es el mismo mecanismo que la vista previa del custom (`claveVigente`, lectura
en vuelo reutilizada). El estado vive en `PlanForm`, porque depende de Precio, Topes y Cuándo rige a la vez. Los
dos pasos pintan el mismo componente.

### 5.2 Qué pinta

| Estado | Pantalla |
|---|---|
| Entrada inválida (F vacía o mal formada) | Nada; el error de la fecha sale al guardar el paso |
| Cargando | «Calculando la fecha de cada empresa…» (`role="status"`) |
| Error (lanza o no `ok`) | «No se pudo calcular la fecha de cada empresa.» y «Reintentar» |
| `ok`, sin empresas y con F | «Este plan no tiene empresas: el cambio pasa al plan el <F>.» (SLT-128 R10) |
| `ok`, con empresas y con F | Tabla «Empresa · Período · Recibe el cambio el», una fila por empresa (`TEXTOS_TIPO_COBRO` para el período) |
| `ok` con F `null` («De inmediato») | Sin tabla (R17) |
| `ok` con `avisos` | `<AvisosDeTopes avisos={textosDeLosAvisosDeTopes(avisos)} />` debajo, en cualquiera de los casos `ok` |

### 5.3 Dónde se pinta

En «Cuándo rige», debajo de los controles de hoy. En «Revisar y programar», debajo de la fila «Rige desde» / «A
partir de».

### 5.4 Un error no bloquea

**Decisión del spec:** ni el error ni la carga bloquean el botón final.
- La fecha es informativa: la que manda es la que calcula programar, bajo cerrojo.
- Los topes pasados no bloquean por SLT-128 P2: «se guarda y se avisa».

Es lo contrario de la vista previa del custom (D17), que sí bloquea. Allí lo pide su decisión, porque después de
crear el plan la empresa ya no admite la lectura.

## 6. Lista de planes y detalle

- **`planes/page.tsx`** pasa a `PlanesModule`:
  - `borradores: BorradorResumen[] | null` (§3.3);
  - las actions del borrador;
  - ya no pasa `crearPlan`.
- **`BorradoresDePlanes.tsx`** (R24, R26, R27):
  - Solo se pinta con `borradores === null` (aviso de error) o con al menos una fila.
  - La tabla lleva Nombre (`nombre ?? «Sin nombre»`), Tipo («Plan nuevo» / «Cambio de <nombre del plan>», con el
    nombre sacado del catálogo por `planId`), «Empezado por», «Empezado el», «Guardado el» y las acciones.
  - «Retomar» de una creación: `onRetomar(borradorId)`, y `PlanesModule` abre el `Sheet` con
    `AbrirPlanForm origen={{ borradorId }}`.
  - «Retomar» de un cambio: un `Link` a `/plataforma/planes/<planId>?editar=1`.
  - «Descartar»: `Modal` y luego `descartar`. Con `ok`, `router.refresh()` y «Borrador descartado.»; los otros dos
    casos, según R27.
- **Marca (R25):** en `Catalogo`, un `Badge` «Cambio en borrador» cuando
  `borradores?.some(b => b.planId === plan.id)`. No se añade nada a `PlanDelCatalogo`.
- **Detalle:**
  - `[planId]/page.tsx` lee `searchParams.editar === "1"` y lo pasa como `abrirEditar`; también pasa las actions del
    borrador y `previsualizarCambioPlanAction`.
  - `PlanDetalle` arranca con `editando = abrirEditar && !plan.archivado` y monta
    `AbrirPlanForm origen={{ planId: plan.id }}`.
  - `alEditar` no cambia: el `ok` de confirmar es el mismo `PlanResult`.

## 7. Estados vacío, cargando y error (resumen)

| Lugar | Vacío | Cargando | Error |
|---|---|---|---|
| Sección «Borradores» | No se pinta | — (la página tiene `loading.tsx`) | «No se pudieron cargar los borradores.»; el catálogo sigue |
| Abrir / retomar (`AbrirPlanForm`) | Editar sin borrador → formulario de hoy; retomar uno borrado → «Este borrador ya no existe.» | «Cargando el borrador…» | «No se pudo leer el borrador.» + «Reintentar» |
| Guardar un paso | — | Botones y lista deshabilitados (R4); el botón muestra que carga | Aviso del paso; lo escrito se queda (R3) |
| Confirmar | — | Igual (R4) | Aviso de «Revisar» o el paso del campo (R9) |
| Fecha de cada empresa | Plan sin empresas → texto de R19 | «Calculando la fecha de cada empresa…» | «No se pudo calcular…» + «Reintentar»; no bloquea |
| Descartar (lista o panel) | — | El botón del `Modal` muestra que carga | El mensaje se queda en el `Modal` |

## 8. Alternativas descartadas

- **A. Calcular la fecha de cada empresa en el navegador.** La página del detalle bajaría las empresas del plan con su
  tipo de cobro y su uso, y el formulario llamaría a `fechaDeRecepcion` y compararía los topes en el cliente. Ahorraba
  la action y el estado de carga. Se descarta por tres razones:
  1. Hacía falta una segunda definición de «pasa el tope» en el cliente, y `excedidosDe` dejaría de ser la única
     fuente (SLT-58 §4.2: «una sola definición de uso»).
  2. El detalle leería el uso de todas las empresas en cada visita, aunque nadie edite.
  3. El uso se quedaría congelado mientras el panel sigue abierto.

  La lectura en el servidor reutiliza las dos funciones de programar, y R21 lo prueba.
- **B. Guardar el paso al salir de él, también con «Anterior» o la lista.** Evitaba el estado «Sin guardar». Se
  descarta:
  - la maqueta y el Alcance atan el guardado a «Guardar y continuar»;
  - guardar al ir hacia atrás mandaría al servidor valores a medio escribir y los compartiría con otros superadmins;
  - para el guardado tardío (m4) es peor, porque hay más guardados en vuelo que no ha pedido el usuario.
- **C. Para el guardado tardío tras confirmar, cambiar el servidor** para que `guardarPasoDeCambio` rechace si el
  borrador que el cliente conocía ya no existe (un `borradorId` esperado en la entrada). Lo cortaba de raíz, pero
  cambia el contrato de SLT-129, que está cerrado y mergeado, y su esquema de entrada. La decisión cerrada deja a la
  pantalla «evitarlo o tolerarlo». Con R4 se evita, y con R10 se tolera sin tocar el servidor.
- **D. Que «Revisar» relea el borrador del servidor y pinte lo guardado.** Daba la garantía más fuerte de «lo que ves
  es lo que se confirma», a costa de una lectura y un estado de carga más en cada visita a «Revisar». Con R6 y R8
  (no se confirma con pasos «Sin guardar») y R12 (los pasos ajenos se cargan), lo que hay en pantalla ya es lo
  guardado. El único hueco es que otro superadmin guarde el mismo paso a la vez, y ahí gana el último sin aviso, que
  es una decisión heredada.
- **E. Un componente aparte para la lista de borradores dentro del catálogo** (filas mezcladas con los planes). Se
  descarta: un borrador de creación no es un plan; no tiene topes, costo ni empresas que pintar en esas columnas.

## 9. Textos nuevos (`plan-form/textos.ts` y `TEXTOS` de los hosts)

`guardarYContinuar` «Guardar y continuar» · `estadoBorrador(n, m)` «Borrador · n de m pasos guardados» · `sinGuardarAun`
«Aún sin guardar» · `guardadoEl(f)` «Borrador guardado el f» · `avisoBorrador` «Borrador: se guarda al continuar, pero no
se aplica a ninguna empresa hasta el último paso.» · `marcaSinGuardar` «Sin guardar» · `pasoGuardado(t)` «t (guardado)» ·
`faltanPasos(ts)` «Faltan pasos por guardar: ts.» · `borradorDe(q, f)` «Borrador de q, guardado el f» · `descartarYEmpezar`
«Descartar y empezar de nuevo» · `confirmarDescarte` «¿Descartar el borrador? Se borran todos sus pasos guardados. No se puede
deshacer.» · `borradorYaNoExiste` «Este borrador ya no existe: se confirmó o se descartó en otra pantalla.» · `borradorNuevo`
«El borrador que tenías abierto ya se programó o se descartó en otra pantalla. Lo que acabas de guardar abrió un borrador
nuevo.» · `pasosAjenos` «Otro superadmin guardó pasos de este borrador: se cargaron sus valores.» · `noSeGuardoElPaso` «No se
pudo guardar el paso. Inténtalo de nuevo.» · `cargandoBorrador` «Cargando el borrador…» · `errorBorrador` «No se pudo leer el
borrador.» · `calculandoFechas` «Calculando la fecha de cada empresa…» · `errorFechas` «No se pudo calcular la fecha de cada
empresa.» · `sinEmpresas(f)` «Este plan no tiene empresas: el cambio pasa al plan el f.» · cabeceras «Empresa», «Período»,
«Recibe el cambio el».

Hosts: «Borradores», «Sin nombre», «Plan nuevo», «Cambio de <plan>», «Empezado por», «Empezado el», «Guardado el», «Retomar»,
«Descartar», «¿Descartar el borrador «<nombre>»? …», «Borrador descartado.», «Ese borrador ya no existe.», «No se pudieron
cargar los borradores.», «Cambio en borrador», «El borrador queda guardado. Puedes retomarlo luego.».

Se aprueban con el spec.

## 10. Dependencias

Ninguna nueva. Se usan `zod`, `@base-ui/react` (vía `components/ui`), `lucide-react` (`Check`) y lo que ya hay.

## 11. Tests

| Archivo | Cubre |
|---|---|
| `tests/unit/planes/plan-form-borrador.test.ts` (nuevo) | R2; `pasoInicial` (R15) |
| `tests/components/PlanFormBorrador.test.tsx` (nuevo) | R1, R3–R12, R14–R16 (con dobles de las cuatro actions) |
| `tests/components/PlanFormFechasPorEmpresa.test.tsx` (nuevo) | R17–R20 |
| `tests/unit/services/planes-previsualizar-cambio.test.ts` (nuevo) | R22 y el cálculo de `recibeEl` |
| `tests/integration/db/planes-previsualizar-cambio.test.ts` (nuevo) | R21 |
| `tests/integration/db/planes-cambio-por-empresa.test.ts` (se amplía) | R23 |
| `tests/components/FormularioPorPasos.test.tsx` (se amplía) | R5, R6 |
| `tests/components/PlanesModule.test.tsx` (se amplía) | R13, R24–R27 |
| `tests/components/PlanDetalle.test.tsx` (se amplía) | R13, R26 |
| `tests/integration/plataforma-planes-page.test.tsx` (se amplía) | R28 |
| `tests/unit/guards/superficie-de-uso.guardia.test.ts` (sin cambios) | R29 |
| `e2e/planes-borrador.spec.ts` (nuevo) | R30 |
| Adaptados sin cambiar sus aserciones de carga útil | ver abajo |

- **Adaptados.** `PlanForm`, `PlanFormCosteo`, `PlanFormCostoPorcentual`, `PlanFormCustomAsigna`,
  `PlanFormPeriodicidad`, `PlanFormVistaPreviaCustom`, `PlanFormDescuentos`, `PlanFormPasos` y `PlanFormRevisar`
  dejan de inyectar `enviar`. Se hace con el helper `tests/components/plan-form-pasos.ts`:
  - `accionesFalsas()` devuelve las cuatro actions con un borrador en memoria;
  - `avanzarHasta` pulsa «Guardar y continuar»;
  - `terminar` confirma;
  - `peticionConfirmada(acciones)` reconstruye la petición con `peticionDeCrear` / `peticionDeEditar` de
    `lib/planes/borrador.ts`.

  Así cada test sigue comprobando la MISMA petición de crear o editar de hoy.
- **E2E de hoy** (`planes-superadmin`, `planes-costeo`, `planes-costo-porcentual`): cambia «Siguiente» por «Guardar y
  continuar», con las mismas aserciones.
- **Antes del PR** se corren en local los cuatro E2E de planes y `e2e/mi-plan-cambiar-plan.spec.ts`
  (`docs/perfil-agentes.md > E2E en local antes del PR`).

## 12. Tamaño

Lo cuenta `tasks.md > Archivos esperados`: **47 archivos**, por encima del tope de 40. El humano aceptó el tamaño en
una sola ficha el 2026-11-17 (`tamano-pr-aceptado`).

- **Producción: ~1150 líneas** (tope 1000).
  - Nuevos: `borrador.ts` ~140, `usar-borrador.ts` ~170, `AbrirPlanForm.tsx` ~90, `FechasPorEmpresa.tsx` ~110 y
    `BorradoresDePlanes.tsx` ~170.
  - Cambios: `PlanForm.tsx` +150, servidor (repositorio, servicio, tipos, action, lector) +130, hosts y páginas +110,
    y `FormularioPorPasos`, pasos y textos +80.
- **Tests: ~2700 líneas** (tope 3000).

El exceso de producción queda cubierto por la misma aceptación. Si el leader necesita bajarlo, lo más fácil de sacar
sin romper nada es `BorradoresDePlanes` (R24–R27).
