# SLT-99 — planes-vista-empresa-cambiar-plan · design.md

> Escrito por `spec_author` el 2026-11-09. El índice del grafo (`codebase-memory-mcp`) no tenía este
> worktree: la exploración se hizo con Grep/Read. Los marcados **P<n>** son propuestas abiertas
> (`requirements.md > Preguntas abiertas`); se cierran con la aprobación del spec.

## Lo que ya existe

**Buscado:** «cambiar plan», «cambio de plan» con «maestro», «planes públicos», `publicos`, «carrusel»,
«cambio pendiente de empresa», «Mi plan» en `feature_list.json`, `specs/` y el código.

| Apareció | Qué es | Qué se hace |
|---|---|---|
| SLT-116 «Planes: página pública de planes para elegir en la inscripción» | Hermana: la página pública reutiliza el carrusel y el detalle | Fuera de alcance; los componentes de §5 quedan con la API que ella necesita (R9) |
| SLT-117 «Planes: solicitud de plan a la medida desde Contáctanos» | Hermana: el envío de «Contáctanos» | Fuera de alcance; el carrusel recibe la acción opcional (R7, P7) |
| SLT-86 «Planes: período de facturación de calendario por empresa y sin tope de órdenes» | El cambio de empresa pendiente: columnas `organizacion.plan_cambio_*`, `escribirPendiente`, `cancelarPendienteDeEmpresaEnTx`, el trabajo `plan_aplicar_cambio_empresa` y su barrido | **Se reutiliza tal cual** (§3). Ni tabla ni trabajo nuevos |
| `PlanesRepository.publicos()` (SL-24 R7, «para SL-25») | Planes públicos no archivados | Se reutiliza; el servicio filtra los de costo concreto |
| `PlanesRepository.preciosQueRigenDesde` y `primerPeriodoDelCambio` (`components/shared/tipo-cobro.ts`) | Precio que regirá en una fecha y primer período que abre un cambio (SLT-86 R15, R25, revisión m4) | Se reutilizan para la confirmación (R19) |
| `fechaDeEfectoPorDefecto(tipo, ahora)` (`lib/planes/ciclo.ts`) | Inicio del siguiente período de calendario | Con `"quincenal"` da justo el próximo corte 1/16; `proximoCorte` la envuelve (R10) |
| `montoDelPeriodo` (`lib/planes/cobro.ts`), `textoDelCostoPorOrden*` (`lib/planes/mensajes.ts`), `MODULOS_APAGABLES` | Costo por período con descuento, textos del costo por orden, nombres de módulos | Se reutilizan en `planes-vista.ts` |
| `MiPlanService` / `MiPlanRepository` / `verMiPlan` (SLT-58, SLT-91) | La lectura de «Mi plan» del maestro (`plan_de_la_empresa`) | Sin cambios; la página la sigue usando para el panel activo y el consumo |
| `ConsumoDelPlan`, `TipoCobroCampo`, `TEXTOS_TIPO_COBRO` | Consumo y costeo; selector de tipo; textos del pendiente | `ConsumoDelPlan` se queda (P8); `TEXTOS_TIPO_COBRO.pendiente` se reutiliza; `TipoCobroCampo` no se usa (el maestro no cambia el tipo) |
| `components/ui/carousel.tsx` | Carrusel de shadcn sobre `embla-carousel-react` (aprobada) | Se usa (R5, R23) |

Nada de lo encontrado resuelve ya el cambio de plan por la empresa: no hay re-creación.

## 1. Modelo de datos

**Sin cambios de esquema ni migración.** El pendiente del maestro es el cambio de empresa pendiente de
SLT-86, en las cinco columnas `organizacion.plan_cambio_{id,plan_id,tipo_cobro,desde_at,actor_id}` (CHECK
«las cinco o ninguna» de 20261106120000). Por eso:

- no hay tabla nueva, ni `organizacion_id` nuevo, ni RLS nueva, ni `down.sql`;
- uno como mucho por empresa: el del maestro y el del superadmin comparten sitio (de ahí P3);
- «pendiente del maestro» se distingue por `plan_cambio_actor_id`: su `usuario.organizacion_id` es el de la
  empresa. Si es `NULL` (superadmin), es de plataforma.

`organizacion` es de solo lectura para `servi_app` y las tablas `plan*` están cerradas a la app (SL-24 R8,
SLT-86 R32). Toda lectura del catálogo y toda escritura van por `PlanesRepository` en `comoPlataforma`,
que ya es excepción con ficha (`lib/db/excepciones-aislamiento.ts`, SL-24). Su `motivo` se amplía para
nombrar las operaciones del maestro: el archivo no cambia de lista. La empresa la pone siempre el servicio
desde `actor.organizacionId`, nunca el cliente (R2).

**Datos que dependen del país.** Importes sin símbolo de moneda, como hoy en «Mi plan» (SLT-58 D26); las
fechas y el corte en la hora de la plataforma (Costa Rica, SLT-58 P8) hasta que SLT-90 traiga la zona por
empresa: `proximoCorte` vive en `lib/planes/ciclo.ts` y cambia con ella.

## 2. Autorización

- **Dónde:** `MiPlanCambioService` (nuevo, `lib/services/`), primera línea de cada método: el actor tiene
  rol en `ROLES_MI_PLAN` (importado de `lib/auth/menu-visibility.ts`, como pide la guardia de SLT-91) y
  `organizacionId` no nulo. Si no, `forbidden` sin tocar repositorios (R1).
- **Orden fijo:** quién → zod estricto (`{ planId }` / `{}`) → reloj (próximo corte) → repositorio, que
  decide las reglas **bajo el cerrojo de la empresa** (§3).
- **Módulo:** «Mi plan» es núcleo (`lib/modulos/reparto.ts`); la action nueva se registra como
  `"mi-plan": "nucleo"`. Sin puerta de módulo.
- **La página** sigue sin decidir quién entra: `forbidden` → `notFound()` (SLT-58 R8).

## 3. Repositorio (`PlanesRepository`, tres métodos nuevos)

Todos en `comoPlataforma("SL-24", …)` y con el mismo orden de cerrojos que `asignar` (empresa `FOR UPDATE`
→ plan `FOR SHARE`).

```ts
// IPlanesRepository
empresaParaElMaestro(organizacionId: string): Promise<EmpresaParaElMaestro | null>;
cambiarPlanPorLaEmpresa(organizacionId: string, planId: string, actorUsuarioId: string,
                        desde: Date, ahora: Date): Promise<ResultadoCambioDelMaestro>;
cancelarCambioPorLaEmpresa(organizacionId: string, actorUsuarioId: string): Promise<ResultadoCancelarDelMaestro>;

type EmpresaParaElMaestro = {
  planId: string | null;
  planEsCustom: boolean;
  tipoCobro: TipoCobro;
  pendiente: null | { deLaEmpresa: boolean };   // sin el actor (SLT-86 R32)
};
type ResultadoCambioDelMaestro =
  | { estado: "ok"; pendiente: boolean }          // false = pidió su plan activo y se canceló el pendiente (R15)
  | { estado: "sin_plan" } | { estado: "pendiente_de_plataforma" } | { estado: "no_disponible" }
  | { estado: "tope_excedido"; excedidos: TopeExcedido[] };
type ResultadoCancelarDelMaestro =
  | { estado: "ok" } | { estado: "sin_cambio_programado" } | { estado: "pendiente_de_plataforma" };
```

`cambiarPlanPorLaEmpresa`, dentro de una transacción:

1. `bloquearEmpresa`. `plan_id` nulo → `sin_plan` (R18, P5).
2. Pendiente con actor de plataforma → `pendiente_de_plataforma` (R17, P3).
3. Plan `FOR SHARE` + `leerPlan`. No existe, archivado, `custom` o sin costo concreto (vigente o versión de su
   `plan_cambio_programado`, la regla de `PlanesService.sinCostoConcreto`) → `no_disponible` (R12). El
   predicado puro `esPlanDisponible(plan, versionPendiente)` va a `lib/planes/costo-concreto.ts`, junto a
   `tieneCostoConcreto`, para que el servicio filtre el carrusel con la misma regla.
4. Mismo plan que el activo → la rama de SLT-86 R19 de `cambiarEmpresaEnTx`: cancela el pendiente con su
   fila, o `ok` sin cambio si no lo hay (R15).
5. `excedidosDe(tx, [empresa], plan.topes)` no vacío → `tope_excedido` **sin escribir** (R13). Es la
   diferencia con el camino del superadmin, que con fecha futura guarda y avisa.
6. `escribirPendiente(tx, empresa.id, plan.id, empresa.plan_tipo_cobro, desde, actorUsuarioId)`: reemplaza el
   que hubiera sin historial y encola el trabajo de SLT-86 (R11, R15). Al corte lo aplica
   `aplicarCambioDeEmpresa` sin cambios (R14).

`cancelarCambioPorLaEmpresa`: `bloquearEmpresa` → sin pendiente: `sin_cambio_programado` → de plataforma:
`pendiente_de_plataforma` → `cancelarPendienteDeEmpresaEnTx` con el maestro congelado como actor (R16).

## 4. Servicio, actions y página

**`MiPlanCambioService`** (`IMiPlanCambioService`), constructor `(planes: IPlanesRepository, ahora = () => new Date())`.
`MiPlanService` no cambia: así no se tocan sus tres tests ni la guardia de SLT-91.

```ts
verPlanes(actor): Promise<PlanesDeMiPlanResult>;
cambiarPlan(actor, input: unknown): Promise<CambiarMiPlanResult>;
cancelarCambio(actor, input: unknown): Promise<CancelarCambioMiPlanResult>;

type PlanVista = Pick<PlanDTO, "id" | "nombre" | "precio" | "costoPorOrden" | "costoPorOrdenPorcentual" | "topes" | "modulos">;
type PlanesDeMiPlanResult =
  | { estado: "ok";
      planes: PlanVista[];               // disponibles, orden del catálogo (R5)
      activoId: string | null;           // marca «Activo» (R5)
      customActivo: PlanVista | null;    // la tarjeta «Plan a la medida» como activa (R7)
      tipoCobro: TipoCobro | null;       // fila resaltada (R8)
      corte: string;                     // AAAA-MM-DD (R10)
      primerPeriodo: Record<string, PrimerPeriodo>; // por plan, con el precio que rige en el corte (R19)
      puedeCambiar: "si" | "sin_plan" | "pendiente_de_plataforma";
      pendienteDelMaestro: boolean }     // ofrece «Cancelar cambio» (R16, R17)
  | { estado: "forbidden" };
type CambiarMiPlanResult =
  | { estado: "ok"; vigenteDesde: string | null }   // null = no queda pendiente (R15)
  | { estado: "forbidden" } | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "sin_plan" } | { estado: "pendiente_de_plataforma" } | { estado: "no_disponible" }
  | { estado: "tope_excedido"; excedidos: TopeExcedido[]; mensaje: string };
type CancelarCambioMiPlanResult =
  | { estado: "ok" } | { estado: "forbidden" } | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "sin_cambio_programado" } | { estado: "pendiente_de_plataforma" };
```

`verPlanes`: `empresaParaElMaestro` + `publicos()` filtrado con `tieneCostoConcreto` (la versión pendiente se
mira al escribir, paso 3; un plan cuya versión programada pierde el costo se ve y se rechaza con
`no_disponible`: caso raro, documentado) + `plan(planId)` si el activo es custom + `preciosQueRigenDesde`
para `primerPeriodo` con `primerPeriodoDelCambio(precioQueRigeEn(…, corte), tipoCobro, corte)`.

**Actions** (`lib/actions/mi-plan.ts`, `"use server"`): `cambiarMiPlanAction(input, deps)` y
`cancelarCambioMiPlanAction(input, deps)`, patrón `conServicio` de `lib/actions/planes.ts`. **No** llaman a
`revalidatePath("/mi-plan")`: la guardia de SLT-91 R10 prohíbe nombrar la ruta fuera de menú, reparto y
página. El cliente refresca con `router.refresh()`.

**Composition root** (`lib/actions/_shared/mi-plan.ts`): `construirMiPlanCambioService()` y
`verPlanesDeMiPlan(actor, servicio?)`, lectura de servidor sin `"use server"`, como `verMiPlan`.

**Página** (`app/(app)/mi-plan/page.tsx`): `verMiPlan` + `verPlanesDeMiPlan` en paralelo; cualquiera en
`forbidden` → `notFound()`. Pasa los dos a `MiPlanModule`.

## 5. Componentes

| Archivo | Tipo | Qué hace |
|---|---|---|
| `components/shared/planes/planes-vista.ts` | puro | `usuariosDelPlan(topes)` y `usuariosEnUso(porRol)` (R4); `precioDeLaVista(precio, "mensual"\|"anual")` con `montoDelPeriodo` y la insignia (R6, P1); `filasDePeriodos(precio)` con «equivale por mes» en céntimos exactos, mitad hacia arriba (R8); `filasDeComparacion(plan, activo)` (R8); `excedidosContra(topes, uso)` para el aviso previo (R13). Textos en un objeto `TEXTOS_PLANES`. El texto «sobran N» (R13, P4) es `mensajeTopesSobran` de `lib/planes/mensajes.ts`: lo usan el servicio (`mensaje` de `tope_excedido`) y el aviso previo, así que dicen lo mismo |
| `components/shared/planes/CarruselDePlanes.tsx` | cliente | Selector Mensual/Anual (`role="radiogroup"`), `Carousel` de shadcn, tarjetas como `button` con `aria-pressed`, tarjeta «Plan a la medida». Props: `planes`, `activoId?`, `customActivo?`, `seleccionado?`, `onSeleccionar`, `onContactar?` |
| `components/shared/planes/DetalleDePlan.tsx` | cliente | Tabla de períodos, comparación, aviso de topes previo y el botón «Cambiar a {plan}». Props: `plan`, `vista`, `activo?: { plan: PlanVista; uso: UsoDelPlan; tipoCobro }`, `onCambiar?` |
| `app/(app)/mi-plan/_components/PlanActivo.tsx` | servidor | El panel del diseño (R3) sobre `PlanConConsumo` + `PlanVista` del activo |
| `app/(app)/mi-plan/_components/CambioDePlan.tsx` | cliente | Estado de la selección, diálogo de confirmación (R19) y «Cancelar cambio», los dos con `components/shared/Modal` como en `PlanEmpresa` (SLT-86), llamadas a las actions, textos de rechazo (R20), `router.refresh()` |
| `app/(app)/mi-plan/_components/MiPlanModule.tsx` | servidor | Pendiente (`TEXTOS_TIPO_COBRO.pendiente`) + `PlanActivo` + `CambioDePlan` + `ConsumoDelPlan` (P8) |

Los dos de `components/shared/planes/` solo importan de `components/ui`, `components/shared`,
`lib/types`, `lib/planes/{cobro,costo-concreto,mensajes}`, `lib/modulos/catalogo` (solo `import type` de
Prisma, como hoy) y `lucide-react`. Una guardia nueva lo comprueba (R9). Ninguno importa `ConsumoDelPlan`
(guardia de SLT-91 R8).

Íconos de módulo (`lucide-react`, ya en el repo): Analítica `BarChart3`, Monitoreo `Activity`, Ranking
`Trophy`, en un `Record<ModuloApagable, LucideIcon>` para que un módulo nuevo rompa el typecheck.

## 6. Textos (aprobados con el spec)

- Panel: «Activo», «Uso de la plataforma», «Costo por orden», «Período actual», «Se renueva el», «Usuarios»,
  «API keys», «Incluido», «No incluido», «Sin tope», «{usados} de {máximo}».
- Carrusel: «Planes disponibles», «Mensual», «Anual», insignia «{p} %» + «anual», «Sin cuota» y «solo pagas
  el costo por orden» (P1), «Plan a la medida», «Contáctanos».
- Detalle: «Detalles de {plan}», «Uso de la plataforma según el período de cobro», columnas «Período»,
  «Descuento», «Pagas por período», «Equivale por mes», «Resaltado: tu período de cobro actual ({tipo}).»,
  «Concepto», «{plan}», «Tu plan», «Activo desde», «Período en curso», «Próximo cobro», «Cambiar a {plan}».
- Confirmación (R19): título «¿Cambiar a {plan}?»; cuerpo «Tu plan cambia a {plan} el {corte}. Hasta
  entonces sigues con {activo}. Tu primer período con {plan}: {desde} – {hasta}, costo base {costo}.»; si el
  activo es custom (P6), además «Tu plan a la medida deja de regir y solo el superadmin puede volver a
  asignarlo.»; botones «Confirmar cambio» y «Volver».
- Hecho: «Listo: tu plan cambia a {plan} el {corte}.»
- Pendiente: «Desde el {fecha}: {plan} · {tipo}» (SLT-86 R26) y «Cancelar cambio»; confirmación «¿Cancelar
  el cambio a {plan} programado para el {fecha}?» con «Cancelar cambio» y «Volver» (SLT-86, 2026-11-06).
- Rechazos (R20): `tope_excedido` → «No puedes cambiar a {plan}:» + una línea por tope «tienes {usados}
  {usuarios activos con el rol X | API keys activas} y {plan} permite {máximo}: sobran {n}.»;
  `no_disponible` → «Ese plan ya no está disponible.»; `pendiente_de_plataforma` → «Tu empresa tiene un
  cambio de plan programado por la plataforma.»; `sin_plan` → «Tu empresa no tiene plan: pide uno a la
  plataforma.»; `sin_cambio_programado` → «Tu empresa ya no tiene un cambio pendiente.» (el de SLT-86).

## 7. Integraciones externas

Ninguna. Sin correo ni campana al programar el cambio (SLT-91 R9: ningún evento de la campana habla del
plan). El superadmin lo ve en el detalle de empresa, como cualquier pendiente (SLT-86 R26).

## 8. Las preguntas abiertas, investigadas

### P1 — Plan sin cuota en el selector anual (y descuento anual en monto fijo)

- En el modelo, «sin cuota» no es `precio: { tipo: "sin_precio" }`: eso es «por definir» (SLT-66 R20) y un
  plan así **no se puede asignar** (`plan_sin_costo`, SLT-66 R28). El «Por paquete» del diseño (cuota nula y
  costo porcentual) hoy no sería elegible. Lo único que el modelo admite es un costo base `"0.00"`, que sí
  es concreto.
- **Propuesta:** el carrusel solo lista planes con costo concreto (R5). Con costo base `0.00`, las dos vistas
  dicen «Sin cuota» y «solo pagas el costo por orden», sin insignia; en la tabla de períodos, «Sin cuota» en
  las cuatro filas; en la comparación, «Sin cuota» frente al costo del período del plan activo.
- **Monto fijo:** la decisión dice «insignia del %». Con descuento anual en monto fijo no hay %. Opciones:
  (a) sin insignia; (b) el % equivalente `1 − anual ÷ (mensual × 12)`, truncado a entero para no prometer
  de más. **Propuesta: (a)**, que no inventa un número que el superadmin no escribió. Lo cierra el humano.

### P2 — El corte 1/16 frente a los períodos de calendario de SLT-86

Lo que hace hoy SLT-86 (`lib/planes/ciclo.ts`, `cobro.ts`; R4, R5, R12, R17): un cambio con fecha F pone la
entrada en F; el período en curso pasa a ser el tramo de F al fin del período de calendario del tipo, con
costo `costo del período × días del tramo ÷ días del período`. El período viejo no se recalcula: el costo
base es informativo y no mueve dinero (SLT-66 R21).

| Tipo de la empresa | Corte que cae en inicio de período | Corte a mitad de período → tramo proporcional del plan nuevo |
|---|---|---|
| Quincenal | el 1 y el 16: **siempre** | nunca |
| Mensual | el 1 | el 16 → tramo 16–fin de mes (p. ej. 15/30) |
| Bimestral | el 1 de ene, mar, may, jul, sep, nov | los otros diez cortes del año |
| Anual | el 1 de enero | los otros 23 (p. ej. 16 nov → tramo hasta el 31 dic, 46/365) |

**Choque:** salvo en quincenal, la decisión «Sin prorrateo» choca con SLT-86 R12/R17 si se lee como «el plan
nuevo no arranca con tramo proporcional». No choca si se lee como «no se devuelve ni se ajusta lo ya corrido
del plan actual».

- **(a) Propuesta:** dejar SLT-86 como está. El plan actual rige hasta el corte y su período no se
  recalcula; el nuevo abre un tramo proporcional y después períodos de calendario. No toca el cálculo de
  SLT-86 y la confirmación (R19) enseña el tramo y su costo antes de confirmar.
- (b) Corte = inicio del siguiente período de calendario del tipo de la empresa (`fechaDeEfectoPorDefecto(tipo)`):
  sin tramo, pero contradice «el 1 o el 16, igual para todas las empresas». Haría falta reabrir esa decisión.
- (c) Sin tramo: el primer período tras un corte cuesta completo. Cambia SLT-86 R12/R17 para todas las
  entradas: queda fuera de esta feature.

### P3–P9

Propuestas en `requirements.md > Preguntas abiertas`. Lo que sale del código:

- **P3:** las dos clases de pendiente comparten las mismas columnas. Sin la regla, un maestro borraría un
  cambio de tipo de cobro o a un custom que programó el superadmin.
- **P4:** los topes que el modelo hace cumplir son por rol (triggers `SL024`, `excedidosDe`). Un rechazo por
  la suma dejaría pasar un cambio que al corte bloquearía las altas de un rol (SLT-58 R36).
- **P5:** sin plan, el cambio sería una primera asignación (`efecto.clase = "inicio"`, SLT-86 R2), que pasa de
  «sin límites» a topes: es otra regla.
- **P8:** quitar `ConsumoDelPlan` de «Mi plan» retiraría de la pantalla del maestro SLT-86 R27–R28 (los casos
  de período, tramo y costo de `tests/components/MiPlanModule.test.tsx`) y rompería la autocomprobación de la
  guardia de SLT-91, que espera que `MiPlanModule` lo importe (sumaría un archivo: 32, el 80 %).

## 9. Alternativas descartadas

1. **Una rama del maestro dentro de `PlanesService.asignar`.** Ese servicio abre con «solo el superadmin»
   (SL-24 R5) y todo su orden depende de eso. Meter un segundo rol abre la puerta a que un error de rama deje
   al maestro asignar con fecha libre o a otra empresa. Un servicio aparte, con el maestro y la empresa de la
   sesión, es más chico y se prueba solo.
2. **Una tabla de solicitudes de cambio.** Servía si el superadmin aprobara (decisión: no). El pendiente de
   SLT-86 ya modela «plan + tipo + fecha + quién», con su trabajo, su barrido y su cancelación con historial.
3. **El corte como fecha libre (o «ahora») con el campo de SLT-86.** Descartada por el humano (sin «ahora»
   ni fecha); además «ahora» aplicaría en la transacción (SLT-86 R18) y saltaría el corte.
4. **Pedir los planes públicos desde el cliente con SWR.** Son datos públicos, pero aquí se combinan con la
   empresa (activo, corte, precio en el corte) y aún no hay un endpoint público: lo trae SLT-116. Se leen en
   el Server Component con el resto de «Mi plan».
5. **Ampliar `MiPlanService` en vez de un servicio nuevo.** Obliga a cambiar su constructor y sus tres
   tests (unitario, `mi-plan-solo-maestro` y `plan-de-la-empresa-periodo`) sin cambiar su comportamiento.

## 10. Tamaño y corte posible (P9)

31 archivos (`tasks.md > Archivos esperados`): 19 de producción y 12 de tests y E2E, el 78 % de los 40 de
`gate.tamano_pr`. Líneas estimadas: ~800 de producción (repositorio ~120, servicio ~130, componentes
~450, resto ~100) y ~1 000 de tests: **~1 800, por encima de las 1 000**. Si el humano no acepta el exceso,
corte en dos rebanadas verticales que se mergean solas:

- **SLT-99 (esta ficha), «ver»:** R1, R3–R9, R21 en modo lectura. El carrusel y el detalle sin
  «Cambiar a {plan}». Es útil sola y desbloquea SLT-116. ~17 archivos.
- **Ficha nueva, «cambiar»:** R2, R10–R20, R22. Corte, servicio, repositorio, actions, confirmación,
  pendiente y E2E. `depends_on` la primera. ~16 archivos.

Sin dependencias nuevas (R23).
