# SLT-130 — planes-form-pasos · design.md

## Lo que ya existe

Busqué «pasos», «stepper», «wizard», «formulario por pasos», `aria-current="step"`, «borrador del plan» y
«descuentos» en `feature_list.json`, `specs/` y el código. El grafo no tiene índice de este worktree, así
que el código lo revisé con Grep y Read.

| Apareció | Qué es | Qué se hace |
|---|---|---|
| SLT-129 «Planes: borrador del plan guardado en el servidor por pasos», SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» | Las fichas que siguen a esta | Fuera de alcance (`requirements.md > Lo que NO entra`). SLT-144 depende de esta. |
| `app/(app)/ordenes/_components/OrdenesCargaMasivaButton.tsx` (indicador de pasos) | Indicador local, sin navegación ni orientación | No se reutiliza ni se toca: no elige pasos, no tiene orientación y vive dentro de la carga masiva. |
| `hooks/use-mobile.ts` (`useIsMobile`, `max-width: 767px`) | El corte de teléfono que ya usa el Sidebar | Se reutiliza para R3. Se le añade una guarda para cuando no hay `matchMedia` (R4, §3). |
| `app/(app)/configuracion/plantillas/_components/FormSheet.tsx` | Sheet ancho con `style` inline | Se copia su forma de fijar el ancho (`width` + `maxWidth: "none"`), que explica por qué una clase no basta. |
| `lib/planes/rastro.ts` (`diferenciasDelPlan`, `cambiaElPrecio`, `importeCanonico`) | El diff canónico del plan | Se reutiliza para «Revisar» (R23) y para «Hoy» (R16). |
| `lib/planes/mensajes.ts` (`textoDelPrecio`, `textoDelDescuento`, `SIN_LIMITE`, `SIN_DESCUENTO`), `plan-vista.ts` (`textoDelCostoPorOrdenDelPlan`, `TEXTOS_PLAN`), `components/shared/tipo-cobro.ts` (`TEXTOS_TIPO_COBRO`) | Los textos de valores del plan | Se reutilizan para los valores de «Revisar» y de «Hoy». No se copian. |
| `lib/planes/mensajes.ts > lineasDeCambioDelPlan` | Líneas «qué cambia» del correo | No se reutiliza: ver §8, alternativa C. |
| `components/shared/SegmentedToggle.tsx` | Botones con `aria-pressed` | No se usa para «Fijo / %»: su comentario lo reserva para cuando no hay formulario detrás. Se usa `RadioGroup`. |

## 1. Modelo de datos, autorización y país

- **Sin cambios de datos.** No hay tablas, migraciones, RLS ni `organizacion_id` nuevos. Las actions
  (`crearPlanAction`, `editarPlanAction`, `previsualizarCustomAction`) y sus esquemas
  (`crearPlanSchema`, `editarPlanSchema`, `previsualizarCustomSchema` de `lib/types/planes.ts`) no cambian.
  La petición que sale del formulario es la misma de hoy (R24).
- **Autorización:** la de hoy, en las actions (superadmin de plataforma). La ficha no la toca.
- **País:** los importes se pintan como texto sin moneda, con los helpers de hoy (`montoParaCampo`,
  `importeCanonico`, `textoDelPrecio`). No entra ningún literal de país ni de moneda.

## 2. Estructura de archivos

Un solo `PlanForm` y un componente por paso, compartidos por crear y editar (decisión «Mismos pasos»). La
diferencia de modo entra por props.

```
components/shared/FormularioPorPasos.tsx      componente de pasos genérico (R1–R5)
hooks/use-mobile.ts                           + guarda sin matchMedia (R4)
app/(app)/plataforma/planes/_components/
  PlanForm.tsx                    estado, navegación, validación por paso, guardar, vista previa del custom
                                  (sigue exportando TEXTOS_PLAN_FORM, RECHAZO_GENERICO, mensajeDelRechazo,
                                  EmpresaParaCustom, ESPERA_VISTA_PREVIA_MS, PlanForm, PlanFormProps)
  plan-form/textos.ts             TEXTOS_PLAN_FORM (se muda aquí; PlanForm lo re-exporta)
  plan-form/estado.ts             Formulario, inicial, versionDe, precioDe, camposEnOrden, PASOS, pasoDeLaClave
  plan-form/revision.ts           filasDeRevision (puro, R22, R23) y textoDeHoy (R16)
  plan-form/PasoGeneral.tsx       R8, R9
  plan-form/PasoPrecio.tsx        R10–R13, R16 (costo base)
  plan-form/PasoCobroPorOrden.tsx R14
  plan-form/PasoTopes.tsx         R15, R16 (topes), R27
  plan-form/PasoModulos.tsx       R15
  plan-form/PasoCuandoRige.tsx    R17 (solo se monta al editar)
  plan-form/PasoRevisar.tsx       R22, R23, R26, R28
  PlanesModule.tsx                Sheet ancho (R6)
[planId]/_components/PlanDetalle.tsx Sheet ancho (R6)
```

`TEXTOS_PLAN_FORM` se muda a `plan-form/textos.ts` para evitar un import circular: los pasos lo necesitan y
`PlanForm` importa los pasos. `PlanForm` lo re-exporta, así `PlanDetalle.tsx` y `PlanEmpresa.tsx` no
cambian sus imports.

Cada paso recibe el mismo contrato (`PropsDelPaso`):

```ts
type PropsDelPaso = {
  modo: "crear" | "editar";
  form: Formulario;
  cambiar: <K extends keyof Formulario>(campo: K, valor: Formulario[K]) => void;
  setForm: Dispatch<SetStateAction<Formulario>>;
  idDe: (clave: string) => string;
  errorDe: (clave: string) => string[] | undefined;
  plan: PlanDTO | null;            // el guardado, al editar; null al crear (para «Hoy» y «Revisar»)
};
```

Cada paso añade solo lo suyo. Por ejemplo, `PasoGeneral` recibe `empresas`, los rangos y los flags
`pideInicioCiclo` / `pideFechaDeEfecto`; `PasoTopes` recibe la vista previa y `onReintentar`. Ningún paso
tiene una variante por modo: las diferencias van por condiciones sobre `modo`.

## 3. Componente de pasos — `components/shared/FormularioPorPasos.tsx`

```ts
type PasoDelFormulario = { id: string; titulo: string };
type FormularioPorPasosProps = {
  pasos: readonly PasoDelFormulario[];
  actual: string;                        // id del paso actual
  visitados: ReadonlySet<string>;        // los que se pueden elegir (R5)
  onIr: (id: string) => void;
  orientacion?: "vertical" | "horizontal"; // por defecto "vertical"
  pie: ReactNode;                        // botones de quien lo usa
  children: ReactNode;                   // contenido del paso actual
  tituloRef?: Ref<HTMLHeadingElement>;   // para mover el foco (R21)
};
```

- **Marcado:** `<nav aria-label="Pasos">` con un `<ol>`. Cada paso es un `<button type="button">` con su
  número y su título. El actual lleva `aria-current="step"`. Un paso no visitado va `disabled` (R1, R5).
  Encima del contenido van «Paso <n> de <m>» y un `<h3 tabIndex={-1}>` con el título (R1, R21).
- **Orientación:** `const efectiva = useIsMobile() ? "horizontal" : orientacion`. Se expone en
  `data-orientacion` en el contenedor (R2, R3). Con `vertical`, la lista va en una columna de ~220 px con
  borde a la derecha. Con `horizontal`, va en una fila con `overflow-x-auto` encima del contenido, como la
  variante «Horizontal (arriba)» de la maqueta. Los estilos son utilidades de Tailwind con los tokens de
  hoy (`border-border`, `bg-muted`, `text-primary`…), no los colores de la maqueta.
- **Disposición:** el componente ocupa toda la altura disponible (`flex min-h-0 flex-1`). El contenido
  tiene su propio scroll y el pie queda fijo abajo, sin el `sticky -mx-4 -mb-4` de hoy.
- **Sin ✓ ni estados de borrador:** son de SLT-144.

**Guarda en `hooks/use-mobile.ts`:** `subscribe` y `getSnapshot` devuelven `() => {}` y `false` si
`typeof window.matchMedia !== "function"`. Hoy, sin `matchMedia`, el hook lanza. jsdom no lo trae, así que
sin la guarda los 9 archivos de tests que montan `PlanForm` tendrían que simularlo. Donde sí hay
`matchMedia` (navegadores, el Sidebar), el hook se comporta igual que hoy.

## 4. `PlanForm`: estado y navegación

**Pasos** (`plan-form/estado.ts`):

```ts
type IdPaso = "general" | "precio" | "orden" | "topes" | "modulos" | "vigencia" | "revisar";
function pasosDe(modo): PasoDelFormulario[]  // "vigencia" solo al editar; el título de "revisar" según modo (R7)
```

Títulos: «General», «Precio y descuentos», «Cobro por orden», «Topes», «Módulos», «Cuándo rige», «Revisar y
crear» / «Revisar y programar».

**Estado nuevo en `PlanForm`:** `paso: IdPaso` (empieza en `general`) y `visitados: Set<IdPaso>` (empieza
con `general`). Avanzar añade el paso destino. El resto del estado (`form`, `errores`, `rechazo`,
`enviando`, la vista previa del custom) es el de hoy.

**A qué paso va cada clave de error** (`pasoDeLaClave(clave, modo)`), por prefijo:

| Clave | Paso |
|---|---|
| `nombre`, `visibilidad`, `organizacionId`, `tipoCobro`, `inicioCiclo` | `general` |
| `vigenteDesde` | `general` al crear (fecha de efecto del custom); `vigencia` al editar |
| `precio`, `precio.*` | `precio` |
| `costoPorOrden`, `costoPorOrdenPorcentual.*`, `periodicidadOrdenes` | `orden` |
| `topes.*` | `topes` |
| `modulos` | `modulos` |
| cualquier otra (`_`, `planId`…) | `null`: aviso general de «Revisar» (R26) |

`camposEnOrden` (la de hoy) se mantiene: da el orden de pantalla y qué claves tienen campo visible. Las
claves de descuentos dejan de depender de un grupo fijo por período y pasan a depender de las líneas de la
lista (§5).

**«Siguiente» (R18).** `peticion()` corre el esquema completo de hoy (`crearPlanSchema` /
`editarPlanSchema`). Los issues se filtran a las claves con campo visible cuyo `pasoDeLaClave` es el paso
actual. Si queda alguno, se pintan solo esos (`errores` se reemplaza) y el foco va al primero, con la
`enfocableDentro` de hoy. Si no queda ninguno, se limpia `errores`, se avanza y se marca visitado. No se
llama a ninguna action.

**Enter (R19).** El `<form>` es uno solo. Su `onSubmit` mira el paso: si no es el último, hace
«Siguiente»; si lo es, hace `guardar()`. Los botones «Anterior» y «Siguiente» son `type="button"`; solo el
botón final es `type="submit"`.

**Anterior y lista (R20).** Cambian `paso` sin validar. `form` vive en `PlanForm`, así que nada se pierde
al desmontar un paso.

**Foco al cambiar de paso (R21).** Un efecto sobre `paso` enfoca el `<h3>` del componente de pasos. No se
dispara en el primer render, para no robar el foco al abrir el Sheet. Tampoco cuando hay un
`focoPendiente`: ahí manda el foco al campo con error (R25).

**Guardar (R24–R26).** `guardar()` es el de hoy, con un cambio: tras pintar los errores, `mostrarErrores`
cambia `paso` al de la primera clave con error en el orden de pantalla y deja `focoPendiente`. El efecto de
foco de hoy enfoca el campo después de pintar el paso. Si ninguna clave tiene paso, se queda en «Revisar»
con el aviso general. `rechazoConCampo` (empresa que ya no existe → `organizacionId`) sigue igual y por
eso lleva a General. El texto del botón final es el `textoEnviar` de hoy.

**Vista previa del custom (R27, R28).** La lectura, la espera de 300 ms, `vistaPreviaLista` y
`creacionBloqueada` siguen en `PlanForm`, igual que hoy, porque dependen de General y de Topes a la vez.
El aviso (avisos / fallo con «Reintentar») se pinta en `PasoTopes`. Si `creacionBloqueada`, `PasoRevisar`
pinta junto al botón final:
- cargando: «Comprobando el consumo de la empresa…»;
- fallo: el texto de hoy, «No se pudo comprobar el consumo de la empresa»;
- en los dos casos, un botón con aspecto de enlace, «Ir a Topes», que llama a `onIr("topes")`.

Los dos textos nuevos van en `TEXTOS_PLAN_FORM` y se aprueban con el spec.

## 5. Contenido de cada paso

**General (R8, R9).** Nombre, y Visibilidad con el `RadioGroup` de hoy. Al editar, el grupo lleva
`disabled`, el valor `plan.visibilidad` y la ayuda «No se cambia después de crear el plan.»
(`TEXTOS_PLAN_FORM.visibilidadFija`). Al crear un custom: Empresa, `TipoCobroCampo`, «Inicio del período»
o «Rige desde», y la lista del primer período (SLT-86 R25). Todo se mueve tal cual desde el `PlanForm` de
hoy, con los mismos ids, textos y rangos.

**Precio y descuentos (R10–R13).**
- «Sin precio» / «Con monto» y «Costo base mensual», como hoy.
- **Lista de descuentos.** En el formulario, `descuentos` pasa de `Record<TipoCobro, DescuentoDelFormulario>`
  a `LineaDeDescuento[]`:
  ```ts
  type LineaDeDescuento = { periodo: TipoCobro; forma: "porcentaje" | "monto"; valor: string };
  ```
  Un solo `valor` por línea: cambiar la forma conserva lo escrito (R10). `inicial` arma las líneas desde
  `plan.precio.descuentos`, en el orden de `TIPOS_COBRO` (R13). `precioDe` arma `descuentos[periodo]` con
  `{ tipo: "porcentaje", porcentaje: valor }` o `{ tipo: "monto", monto: valor }` (R10, R12).
- **Cada línea** es un `<fieldset>` con legend visualmente oculta «Descuento <período>»
  (`TEXTOS_PLAN_FORM.descuento`, el de hoy) y `id = idDe("precio.descuentos.<período>")`. Dentro van:
  - `Select` «Período», con las opciones de `TIPOS_COBRO` menos las que ya usan otras líneas (R11);
  - `Input` «Valor»; su id es `idDe("precio.descuentos.<período>.<forma>")`, así el error de la action cae
    en él;
  - `RadioGroup` en fila «Tipo del descuento» con «Fijo» (`monto`) y «%» (`porcentaje`);
  - un botón con icono `Trash2` y `aria-label` «Quitar descuento <período>».

  Si una línea cambia de período, sus errores pendientes se descartan.
- **«+ Agregar descuento»** añade `{ periodo: primer libre, forma: "porcentaje", valor: "" }`. Va
  `disabled` con 4 líneas (R11). Con la lista vacía se ve el texto de R12
  (`TEXTOS_PLAN_FORM.sinDescuentos`).
- `camposEnOrden` emite, por línea y en orden, `precio.descuentos.<período>` y
  `precio.descuentos.<período>.<forma>`.
- **«Hoy» del costo base (R16):** al editar y si `diferenciasDelPlan(plan, planDelFormulario).precio`
  existe, se pinta bajo el grupo «Costo base»: `Hoy: ${textoDelPrecio({ tipo, mensual })}`, solo el costo
  base y sin descuentos. Da, por ejemplo, «Hoy: 10.00 / mes» o «Hoy: sin precio».

**Cobro por orden (R14).** Los dos modos y sus campos de hoy, sin cambios, más «Facturación de órdenes».

**Topes (R15, R16, R27).** Los campos de hoy. Al editar, bajo cada tope cuyo valor del formulario (`tope()`)
difiere del de `plan.topes`, va `Hoy: <n>` o `Hoy: sin límite` (`SIN_LIMITE`). Debajo, la vista previa del
custom (§4).

**Módulos (R15).** Las casillas de hoy.

**Cuándo rige (R17).** Solo al editar. Es el bloque de hoy: «Rige desde» si `cambiaPrecio`; si no,
«Aplicar», con «De inmediato» o «A partir de» y su fecha. Textos y claves (`vigenteDesde`) sin cambios.

**Revisar (R22, R23, R26, R28).**
- Subtítulo: al crear, «Así queda el plan. No existe hasta que pulses «<botón>».»; al editar, «Esto es lo
  que cambia. Nada se aplica hasta que pulses «<botón>».». `<botón>` es el `textoEnviar` vigente.
- Lista: `<dl>` con `<dt className="font-semibold">clave</dt><dd>valor</dd>` por fila, de `filasDeRevision`.
- Después: el aviso general (rechazo y errores sin campo) con `ref` para el foco, como hoy. Luego el motivo
  del bloqueo de la vista previa (§4).
- Pie: «Anterior» y el botón final (`type="submit"`, `loading={enviando}`, `disabled={creacionBloqueada}`).

## 6. `filasDeRevision` — `plan-form/revision.ts`

```ts
type FilaDeRevision = { clave: string; valor: string };   // valor: "a → b" al editar; el final al crear
function filasDeRevision(e: {
  modo: "crear" | "editar";
  plan: PlanDTO | null;                 // el guardado (editar)
  despues: PlanDTO;                     // { ...plan|base, ...versionDe(form) }
  extras: FilaDeRevision[];             // filas que no son del plan: visibilidad/empresa/custom, o cuándo rige
}): FilaDeRevision[]
```

- **Al editar:** se parte de `diferenciasDelPlan(plan, despues)`. Las filas van en el orden de pantalla y
  solo salen las que cambian:
  - Nombre;
  - Costo base mensual (`textoDelPrecio` sin descuentos);
  - Descuentos: una fila, con los textos de cada línea unidos por « · », o «Ninguno»;
  - Cobro por orden: una fila que junta `costoPorOrden` y `costoPorOrdenPorcentual` con
    `textoDelCostoPorOrdenDelPlan`;
  - Facturación de órdenes (`TEXTOS_TIPO_COBRO.tipo`);
  - un «Tope de <rol>» y «Tope de API keys» por cada tope que cambia;
  - Módulos (`nombreDelModulo` unidos por « · », o «Ninguno»).

  Cada fila sale como `antes → después`. Luego va la fila de `extras`: «Rige desde: <fecha>», «A partir
  de: <fecha>» o «Aplicar: De inmediato». Si no hay ninguna fila del plan, la vista muestra «Sin
  cambios.» (R23) y conserva la de cuándo rige.
- **Al crear:** las mismas claves, todas, con el valor final. Antes van los `extras` de General:
  Visibilidad (`textoDeVisibilidad` con el nombre de la empresa), Tipo de cobro, «Inicio del período» o
  «Rige desde», y las líneas del primer período cuando las hay (R22).
- **Valores todavía no válidos:** «Revisar» no valida, porque se puede llegar a él saltando. Un importe
  todavía no válido se pinta tal cual lo escribió el usuario. Guardar valida y lleva al paso del error
  (R25).
- **Claves:** las etiquetas del formulario (`TEXTOS_PLAN_FORM`), para que la clave diga lo mismo que el
  campo. Lo nuevo va en `TEXTOS_PLAN_FORM`: «Descuentos», «Tope de <rol>», «Ninguno», «Sin cambios.» y los
  subtítulos.

`textoDeHoy` (R16) vive en el mismo archivo y reutiliza `textoDelPrecio` y `SIN_LIMITE`.

## 7. Hosts: el Sheet ancho (R6)

`PlanesModule.tsx` y `PlanDetalle.tsx` cambian igual:
- `<SheetContent className="gap-0" style={ESTILO_SHEET_PLAN}>`, con
  `ESTILO_SHEET_PLAN = { width: "min(920px, 100vw)", maxWidth: "none" }` exportado desde `PlanForm.tsx`.
  El ancho sale de la maqueta, y el porqué del `style` es el de `FormSheet.tsx`.
- El `div className="px-4 pb-4"` pasa a `div className="flex min-h-0 flex-1"`. El scroll lo lleva el
  contenido del paso, no el Sheet entero.
- `SheetHeader`, título, descripción y `onGuardado` no cambian.

## 8. Alternativas descartadas

- **A. Un esquema zod por paso** (partir `crearPlanSchema` / `editarPlanSchema` en sub-esquemas). Se
  descarta porque la decisión «Navegación» exige «el mismo esquema que la action». Unos sub-esquemas
  duplicarían los `.refine` de `crearPlanSchema` que cruzan campos de pasos distintos (visibilidad con
  empresa, empresa con tipo de cobro, tipo de cobro quincenal con facturación de órdenes mensual), y
  podrían divergir. Se valida todo con el esquema de la action y se filtra por paso (§4).

  Hay un límite conocido: zod no corre los `.refine` del objeto mientras otro campo tenga error. Si el
  usuario deja un importe inválido en un paso visitado y vuelve a General, un error de refine de General
  puede no salir al pulsar «Siguiente». Sí sale al guardar, y el formulario lo lleva a su paso (R25).
- **B. Orientación solo con CSS** (`max-md:flex-row`). No necesita JS y no tiene el problema de
  `matchMedia`, pero en jsdom no hay layout y R3 no se podría probar. `useIsMobile` ya fija el corte del
  proyecto (767 px) y se prueba simulando `matchMedia`.
- **C. Reutilizar `lineasDeCambioDelPlan` para «Revisar».** Devuelve cadenas planas («Clave: a → b»), no
  se puede poner la clave en negrita sin partir el texto, y sus textos son los del correo («Usuarios
  activos con el rol …», «Se incluye el módulo …», un descuento por línea). La maqueta pide una fila
  «Descuentos» y claves iguales a las del formulario. Se reutilizan los formateadores de valores, no las
  líneas.
- **D. Montar todos los pasos y ocultar los que no tocan** (`hidden`). Habría ahorrado diff en los tests
  de hoy. Se descarta: los campos ocultos siguen en el DOM y en la tabulación de algunos lectores, se
  encontrarían con `getByLabelText` aunque no estén en pantalla y los tests probarían algo que el usuario
  no ve.
- **E. Dos formularios o un componente por modo.** Lo descarta la decisión «Mismos pasos para crear y
  editar».

## 9. Dependencias

Ninguna nueva. Se usan `@base-ui/react` (vía `components/ui`), `lucide-react` (`Trash2`, `Plus`) y lo que
ya hay en el repo.

## 10. Tests

- **Nuevos:**
  - `tests/components/FormularioPorPasos.test.tsx` (R1–R5);
  - `tests/components/PlanFormPasos.test.tsx` (R7, R9, R14, R16, R18–R21, R25);
  - `tests/components/PlanFormRevisar.test.tsx` (R22, R23);
  - `tests/unit/planes/plan-form-revision.test.ts` (R22, R23, puro).
- **Helper:** `tests/components/plan-form-pasos.ts`. `avanzarHasta(user, "Topes")` pulsa «Siguiente»
  hasta el paso con ese título y falla si no llega. `terminar(user)` avanza hasta el último paso y pulsa el
  botón final. Los tests de hoy se adaptan con él: rellenan cada campo en su paso y guardan desde
  «Revisar».
- **Adaptados:**
  - `PlanForm.test.tsx`, `PlanFormCosteo.test.tsx`, `PlanFormCostoPorcentual.test.tsx`,
    `PlanFormCustomAsigna.test.tsx`, `PlanFormPeriodicidad.test.tsx`, `PlanFormVistaPreviaCustom.test.tsx`:
    navegación, con las mismas aserciones de carga útil y de errores;
  - `PlanFormDescuentos.test.tsx`: reescrito para la lista (R10–R13);
  - `PlanesModule.test.tsx` y `PlanDetalle.test.tsx`: navegación y R6.
- **E2E: ninguno nuevo** (decisión «E2E»). Hay tres specs que ya rellenan este formulario:
  `e2e/planes-superadmin.spec.ts`, `e2e/planes-costeo.spec.ts` y `e2e/planes-costo-porcentual.spec.ts`.
  Con los pasos se romperían, así que se adaptan para navegar, con las mismas aserciones. No es una
  cobertura nueva y no reabre la decisión. Se corren en local antes del PR
  (`docs/perfil-agentes.md > E2E en local antes del PR`).
