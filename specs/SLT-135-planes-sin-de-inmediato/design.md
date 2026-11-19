# SLT-135 — planes-sin-de-inmediato · design.md

> Diseño de SLT-135 «Planes: sin «De inmediato» al editar un plan». Parte del código con SLT-144 «Planes:
> formulario por pasos conectado al borrador y a la fecha de cada empresa» mergeada en la rama (PR #209, sin
> mergear a `dev`). Requisitos en `requirements.md` (R1–R23); tareas en `tasks.md`.

## Lo que ya existe

Nada que quite «De inmediato» (búsqueda en `feature_list.json`, `specs/` y el código). SLT-144 lo excluye de
forma explícita, y SLT-128 lo dejó para esta ficha (P3, P9). El mecanismo que se reutiliza ya está entero:

| Pieza | Dónde | Qué hace hoy |
|---|---|---|
| `PlanesService.editar` | `lib/services/PlanesService.ts` | Tres caminos: `vigenteDesde: null` → `editarYa` (a todas en el acto); precio con F = hoy → `editarYa` con el precio desde las 00:00; F futura → `repo.programarCambio`. Sin precio, F = hoy se rechaza («posterior a hoy»). |
| `PlanesRepository.editar` | `lib/repositories/PlanesRepository.ts` (≈ l. 1413) | La edición inmediata: `planPartido` → `cambio_a_medias` (SLT-128 R16), `aplicarVersion`, rastro `editado`, correo `guardado` sin fecha. |
| `PlanesRepository.programarCambio` | ídem (≈ l. 1930) | SLT-128 entero: un pendiente, el reemplazo (R13, R29), `fijarRecepciones` con `fechaDeRecepcion`, la aplicación sin empresa en F, y el correo de guardado por empresa con su recepción. |
| `editarPlanSchema` | `lib/types/planes.ts` | `vigenteDesde: fechaSchema.nullable()`. |
| Paso `vigencia` del borrador | `lib/types/plan-borrador.ts` | `vigenciaSchema` toma `editarPlanSchema.shape.vigenteDesde`: hereda lo que diga el esquema de editar. |
| Lectura defensiva del borrador | `PlanBorradorService.pasosValidos` | Un paso guardado que ya no valida con el esquema de hoy se descarta al leer y al confirmar (`pasos_pendientes`). |
| `previsualizarCambio` | `PlanesService`, `previsualizarCambioSchema` | `vigenteDesde: null` = «De inmediato»: empresas y avisos sin fechas (`recibeEl: null`). |
| Formulario | `app/(app)/plataforma/planes/_components/` | `PasoCuandoRige` con el grupo «Aplicar» (`aplicar: "inmediato" \| "programado"`) o «Rige desde» si cambia el precio; `textoEnviar` «Guardar» / «Programar cambio»; `revision.ts` «Aplicar: De inmediato»; `FechasPorEmpresa` sin tabla con F null; `PlanDetalle.alEditar` con «Cambios guardados.». |
| Correo de guardado sin fecha | `lib/planes/mensajes.ts > introCambioPlan` | `fecha === null` → «… cambió y los cambios ya rigen.». |

## §1 Contrato: los esquemas y los tipos

**`lib/types/planes.ts`**
- `editarPlanSchema.vigenteDesde` pasa a ser **obligatoria**: `fechaSchema` sin `.nullable()`.
  - Ausente o `null` es un error de tipo y lleva el texto `FECHA_DE_EFECTO_OBLIGATORIA` («Elige desde qué fecha
    rige el cambio.», R1). La forma de hacerlo es libre (p. ej. `z.string({ error: … }).pipe(fechaSchema)`, zod
    4); el formato inválido sigue con el mensaje de `fechaSchema`.
  - La constante se **mueve** a `lib/types/planes.ts` y `lib/planes/mensajes.ts` la reexporta, igual que
    `TIPO_QUINCENAL_CON_ORDENES_MENSUALES`. El motivo: `mensajes.ts` importa este módulo en ejecución, y al revés
    habría un ciclo. `PlanesService` y `PlanesRepository` siguen importándola de `mensajes`.
- `previsualizarCambioSchema.vigenteDesde`: `fechaSchema`, sin `null`. Se queda sin mensaje propio: la pantalla
  no la llama sin fecha (R13).
- `FechaDeEmpresa.recibeEl: string` (deja de ser `string | null`).
- Comentarios: el de `editarPlanSchema` («null = de inmediato»), el de `previsualizarCambioSchema` y el de
  `cambio_a_medias` en `PlanResult`. `cambio_a_medias` se queda en el tipo, porque lo devuelven archivar y
  cancelar (SLT-128 R14, R15); editar ya no.

**`lib/types/plan-borrador.ts`**
- No cambia el código: `vigenciaSchema` hereda la obligatoriedad (R10).
- Se actualiza el comentario (l. 129): «posterior a ahora si no cambia el precio» ya no existe.
- `ValoresDeVigencia` queda `{ vigenteDesde: string }`.

## §2 El servicio: `PlanesService.editar`

```
editar(actor, input, opciones):
  superadmin? → no: forbidden                                  (R22)
  editarPlanSchema.safeParse → validation_error                (R1: sin fecha, sin leer nada)
  hoy = fechaCalendarioPlataforma(ahora)
  vigenteDesde < hoy → validation_error FECHA_DE_EFECTO_PASADA (R2)
  plan = repo.plan(planId); null → not_found; archivado → archivado
  p = repo.programarCambio(planId, version, inicioDelDiaPlataforma(vigenteDesde), actor, ahora, …borrador)
  periodicidad_incompatible → periodicidadQueNoCabe; otro rechazo → tal cual
  ok(planId, p.cambio, { avisos: p.avisos, vigenteDesde: p.cambio ? vigenteDesde : null })   (R7, R9)
```

- Se van `editarYa`, la rama de `cambiaElPrecio` (F obligatoria con precio, hoy → en el acto) y el texto «La
  fecha de vigencia tiene que ser posterior a hoy.».
- Si los imports `cambiaElPrecio` y `diferenciasDelPlan` quedan sin uso en el servicio, se quitan.
- `previsualizarCambio`: `desde = inicioDelDiaPlataforma(vigenteDesde)` siempre, y `recibeEl` siempre es una
  fecha (R13).
- `IPlanesService` y `lib/actions/planes.ts` solo cambian sus comentarios: «de inmediato con `vigenteDesde:
  null`» desaparece.

**Por qué funciona F = hoy sin tocar `programarCambio` (R4, R5, R6).** El instante es las 00:00 de hoy, que ya
pasó.
- **Recepción por empresa.** `fechaDeRecepcion(tipo, F)` da hoy para la empresa cuyo período empieza hoy, y el
  inicio del siguiente para las demás (SLT-128 R1).
- **Cola.** `fijarRecepciones` encola `plan_aplicar_cambio` con `runAfter` = la recepción. La de hoy ya venció:
  la toma la siguiente pasada de `procesar-jobs` (cada minuto, `vercel.json`) o, como tarde, el barrido horario.
  `recibirCambio` solo espera si `recibeAt > ahora`, así que la aplica.
- **Recordatorios.** `recordatoriosDe(ahora, recibeAt)` con d = 0 no devuelve ninguno: el de 1 día cae antes de
  guardar (SLT-128 R21).
- **Correo.** El de guardado sale con la recepción de cada empresa: hoy para la que lo recibe hoy.
- **Plan sin empresas.** `encolarAplicacion` en F; `aplicarCambioProgramado` promueve si `vigenteDesde <= ahora`
  y no quedan recepciones sin resolver (R5).
- **Precio.** La fila de `plan_precio_historial` con `desde_at = F` la escriben la recepción y la promoción
  (`escribirPrecioDelCambio`, SLT-128 R3). `plan_inicio_ciclo_de` busca el precio del período por su inicio, así
  que el período que empieza hoy ya toma el nuevo.

Con el precio, F = hoy hace lo mismo que la edición inmediata de SLT-86 R22 para la empresa que empieza período
hoy. Las demás lo pagan desde su recepción, que es lo que decide SLT-128 R3 (R6).

**Nota 2026-11-18 (decisión humana, «Gana el último»). Dos precios el mismo día.** Con F = hoy, dos cambios de
precio guardados el mismo día y aplicados por la cola caen en la misma fila de `plan_precio_historial`
(`desde_at` = las 00:00 de hoy). Hasta ahora `escribirPrecioDelCambio` escribía con «dejar» (`ON CONFLICT DO
NOTHING`), así que el historial se quedaba con el primer precio aunque el plan ya tuviera el segundo. La regla
nueva:
- si la fila de ese `desde_at` la dejó un cambio **anterior**, `escribirPrecioDelCambio` la **sobrescribe**;
- si la dejó **este mismo** cambio (un reintento de la cola o la recepción de otra empresa), no la toca.

Así se mantiene que la última fila del historial es el precio vigente (SLT-86 §1.2). Esto sí toca
`programarCambio` y la cola, en contra de lo que dice el título de arriba. Lo encontró T4.1.

**Ventana visible.** Entre guardar y la siguiente pasada de la cola (en torno a un minuto), el detalle del plan
muestra «Cambio programado desde <hoy>» con «0 de N empresas ya lo recibieron». Es el comportamiento de SLT-128
con una fecha que ya llegó, y se acepta. Una empresa que entra al plan ese mismo día entra ya con la versión
nueva (SLT-128 R17: entrada en F o después).

## §3 El repositorio y su interfaz

- **Se quitan:**
  - `PlanesRepository.editar`;
  - de `IPlanesRepository`, `editar` y el tipo `ResultadoEdicion` (solo lo usa `editar`).
- **Se quedan:**
  - `planPartido`, que lo usa `cancelarCambio` (SLT-128 R14);
  - `aplicarVersion` y `escribirRastro`, que los usan promover y crear;
  - `consumirBorrador`.
- `programarCambio` no cambia (§2).
- **Rastro.** La acción `editado` de `plan_rastro` deja de escribirse al editar. El enum de Prisma no se toca:
  hay filas históricas y el detalle las sigue pintando.

## §4 La action y el borrador

- `editarPlanAction` no cambia de forma; la validación nueva está en el esquema y el servicio (R1).
- `PlanBorradorService` no cambia:
  - **R10:** al guardar `vigencia` sin fecha, `guardarPasoBorradorSchema` responde `validation_error` con la
    clave `vigenteDesde` (quita el prefijo `valores.`).
  - **R11:** un borrador guardado antes con `vigencia: { vigenteDesde: null }` queda con ese paso descartado por
    `pasosValidos`. Leer lo da sin ✓ en «Cuándo rige» y confirmar responde `pasos_pendientes: ["vigencia"]`.
  - No hace falta migrar las filas de `plan_borrador`.
- `lib/planes/borrador.ts > peticionDeEditar` no cambia: copia `pasos.vigencia.vigenteDesde`, que ahora siempre
  es una fecha.

## §5 El formulario (`app/(app)/plataforma/planes/_components/`)

**`plan-form/estado.ts`**
- Se quitan el tipo `Accion` y el campo `aplicar` de `Formulario`.
- `inicial(plan, inicioCiclo, precioDesde)`:
  - al editar (`plan !== null`), `vigenteDesde = precioDesde`, que es mañana por defecto (R15, decisión P2);
  - al crear, `vigenteDesde = ""` (la fecha de efecto del custom, como hoy).
- `camposEnOrden`: al editar, `vigenteDesde` entra siempre.

**`plan-form/PasoCuandoRige.tsx`** (R14)
- Con cambio de precio, igual que hoy: «Rige desde» sobre `precioDesde`.
- Sin cambio de precio, un `FormField` «A partir de» (`TEXTOS_PLAN_FORM.programado`) con la ayuda
  `TEXTOS_PLAN_FORM.fechaAyuda`, sobre `form.vigenteDesde`.
- Se van el `fieldset`, el `RadioGroup` y su import.

**`PlanForm.tsx`**
- **La fecha que viaja.** `const fecha = cambiaPrecio ? form.precioDesde : form.vigenteDesde`. Va en
  `erroresDelFormulario` (`vigenteDesde: fecha`) y en la entrada de `previsualizarCambio`. Una fecha inválida o
  vacía no se pide (como hoy); en «Guardar y continuar» el campo se marca (R17).
- **Botón final.** `textoEnviar`: al editar, siempre `TEXTOS_PLAN_FORM.programar` (R16). El `aria-label` del
  `form` («Guardar») no cambia, porque los E2E lo usan para encontrarlo.
- **Rechazos.** En `RECHAZOS`, `cambio_a_medias` pasa al texto de `generico`, que editar ya no lo devuelve. Se va
  el import de `MENSAJE_EDITAR_CAMBIO_A_MEDIAS`.

**Resto del formulario**
- **`plan-form/borrador.ts`** (R15):
  - `valoresDelPaso("vigencia")` devuelve `{ vigenteDesde: cambiaPrecio ? precioDesde : vigenteDesde }`;
  - `conVigencia` copia la fecha a `precioDesde` y a `vigenteDesde`, sin rama `null`.
- **`plan-form/revision.ts`** (R18): `filaDeVigencia` recibe `{ cambiaPrecio, precioDesde, vigenteDesde }` y
  devuelve «Rige desde: F» o «A partir de: F»; desaparece «Aplicar: De inmediato».
- **`plan-form/textos.ts`:**
  - se quitan `aplicar`, `inmediato` y `fecha`, sin otro uso en `planes/`;
  - `programado` («A partir de») pasa a ser la etiqueta del campo;
  - `fechaAyuda` no cambia.
- **`plan-form/FechasPorEmpresa.tsx`** (R19): en `FechasDelCambio`, `vigenteDesde: string`. Se va la rama
  `vigenteDesde === null` y la tabla o «Este plan no tiene empresas…» salen siempre con `ok`.

**`[planId]/_components/PlanDetalle.tsx`** (R20)
- `alEditar`:
  - `r.cambio && r.vigenteDesde !== null` → `guardadoProgramado(r.vigenteDesde)`;
  - si no → `sinCambios`.
- Se quita `TEXTOS.guardadoInmediato`.

**`empresas/[organizacionId]/_components/PlanEmpresa.tsx`**
- `RECHAZOS.cambio_a_medias` usa «No se pudo guardar. Inténtalo de nuevo.», el genérico de `PlanForm`: asignar
  nunca lo devuelve (su comentario ya lo dice).
- Se va el import del mensaje retirado.

**`lib/planes/mensajes.ts`**
- Se quita `MENSAJE_EDITAR_CAMBIO_A_MEDIAS` (SLT-128 R16 retirado, R8).
- Reexporta `FECHA_DE_EFECTO_OBLIGATORIA` desde `lib/types/planes.ts`.
- `introCambioPlan` conserva la rama `fecha === null` para los correos encolados antes del despliegue (R21); solo
  se actualiza el comentario.

## §6 Datos, empresas y país

- **Sin migración ni cambio de `db/schema.prisma`.** No hay tablas, RLS ni `down.sql` nuevos.
- **Multiempresa** (`docs/architecture.md > Multi-empresa`):
  - el catálogo de planes y sus pendientes son de plataforma (SL-24 R8, SLT-128 R26), y esta ficha no añade
    lecturas ni escrituras con `organizacion_id`;
  - cada empresa sigue recibiendo el cambio en su recepción.
- **Datos que ya existen:**
  - borradores con `vigencia` sin fecha → §4 (R11);
  - correos `plan_aviso_correo` sin fecha en la cola → siguen saliendo (R21);
  - filas `editado` del rastro → se siguen pintando.
- **País:** las fechas son días de la plataforma (−06:00, CR), como el resto de planes (`fechaCalendarioPlataforma`,
  `inicioDelDiaPlataforma`, `mananaCalendarioPlataforma`). No toca moneda, geografía, impuestos ni métodos de pago.

## §7 Autorización

- La valida `PlanesService.editar` / `previsualizarCambio` (superadmin) antes del esquema, y
  `PlanBorradorService` antes de guardar o confirmar. Sin cambios (R22).
- No depende de ningún módulo encendido: planes es de plataforma.

## §8 Coordinación con SLT-144 y con los specs anteriores

- **SLT-144 está sin mergear** y tiene pendientes `T6.1` (`e2e/planes-borrador.spec.ts`) y `T6.2` (adaptar
  `e2e/planes-superadmin.spec.ts` y `e2e/planes-costeo.spec.ts`). Si entran con «De inmediato» o con el botón
  «Guardar» al editar, esta rama los ajusta al rebasar. No están en `## Archivos esperados` porque hoy no existen
  aquí o no editan planes.
- **Specs anteriores sin tocar.** Los requisitos de SL-24, SLT-86, SLT-128 y SLT-144 no se editan. La sustitución
  queda escrita en `requirements.md` (cabecera) y la ve quien lea esta ficha. Editar cinco specs ajenos solo
  sumaría archivos al PR.

## §9 Alternativas descartadas

1. **Dejar `vigenteDesde` *nullable* en el esquema y rechazar `null` en el servicio.**
   - A favor: menos tests de esquema tocados.
   - Por qué no:
     - el paso `vigencia` del borrador seguiría aceptando «sin fecha» y el error solo saldría al confirmar, lo
       que contradice la decisión «`vigencia` valida como editar»;
     - la validación del cliente, que usa el mismo esquema, no marcaría el campo.
2. **Conservar `PlanesRepository.editar` (camino inmediato) sin llamarlo.**
   - A favor: los tests de integración que lo usan como atajo de datos seguirían igual.
   - Por qué no:
     - deja vivo un camino que el producto ya no tiene, con su regla `cambio_a_medias` (R16 retirado);
     - cualquier llamada futura volvería a aplicar «a todas en el acto».
   - Los tests que lo usaban pasan a programar y recibir con la cola, o a SQL a mano si solo preparan datos.
3. **Un solo campo de fecha (quitar `precioDesde` y la etiqueta «Rige desde»).**
   - A favor: más limpio.
   - Por qué no: no cambia ningún comportamiento y obliga a reescribir `tests/components/PlanFormDescuentos.test.tsx`
     y `tests/components/PlanEmpresaPeriodo.test.tsx`, cuando el PR ya pasa del tope. Queda para una limpieza
     aparte.
4. **Partir la ficha en tres rebanadas** (F = hoy por empresa / el formulario / el servidor): la descartó el
   humano el 2026-11-18 («Un PR sobre el tope»).

## §10 Dependencias de terceros

Ninguna nueva.

## §11 Tests (mapa)

| Archivo | Qué cubre |
|---|---|
| `tests/unit/services/planes-service.test.ts` | R1, R7, R9, R22. Se quitan los de «editar de inmediato» y el R16 de `cambio_a_medias` en editar. |
| `tests/unit/services/planes-service-periodo.test.ts` | R2, R3. «Hoy en el acto» pasa a «hoy programa». |
| `tests/unit/services/planes-service-costeo.test.ts`, `-costo-porcentual.test.ts` | Ajuste: editar con fecha (`programarCambio` en lugar de `editar`). |
| `tests/unit/services/planes-previsualizar-cambio.test.ts` | R13, R22. |
| `tests/unit/types/planes-schema*.test.ts` (3) | R1. Las entradas válidas llevan fecha. |
| `tests/unit/types/plan-borrador-schema.test.ts` | R10. |
| `tests/unit/planes/plan-form-borrador.test.ts` | R15. |
| `tests/unit/planes/plan-form-revision.test.ts` | R18. |
| `tests/components/PlanForm.test.tsx` | R14, R15, R16, R17. |
| `tests/components/PlanFormRevisar.test.tsx` | R18. |
| `tests/components/PlanFormFechasPorEmpresa.test.tsx` | R19. |
| `tests/components/PlanFormBorrador.test.tsx` | R16 (botón «Programar cambio» con precio). |
| `tests/components/PlanDetalle.test.tsx` | R20. |
| `tests/integration/db/planes-cambio-por-empresa.test.ts` | R4, R8. |
| `tests/integration/db/planes-cambio-programado.test.ts` | R5. |
| `tests/integration/db/plan-precio-historial.test.ts` | R6. Los casos de la edición inmediata se reescriben con F. |
| `tests/integration/db/plan-descuento-periodo.test.ts` | R6. |
| `tests/integration/db/plan-borrador-confirmar.test.ts` | R11, R12. |
| `tests/integration/db/planes-edicion-en-uso.test.ts` | R3. |
| `tests/integration/db/planes-cambio-correos.test.ts`, `planes-historial.test.ts`, `plan-costo-porcentual-escritura.test.ts`, `planes-costeo-escritura.test.ts`, `planes-periodicidad-ordenes.test.ts`, `factura-plataforma-cambio-plan.test.ts`, `planes-asignacion.test.ts`, `cobro-plataforma-plan.test.ts` | Ajuste: dejan de editar sin fecha o de llamar a `repo.editar`, con las mismas aserciones de su ficha. |
| `tests/unit/services/email/plantilla-cambio-plan.test.ts` | R21, sin cambios. |
| `e2e/planes-costo-porcentual.spec.ts` | R23. |
