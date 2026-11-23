# SLT-99 — planes-vista-empresa-cambiar-plan · design.md

> Escrito por `spec_author` el 2026-11-09. El índice del grafo (`codebase-memory-mcp`) no tenía este
> worktree: la exploración se hizo con Grep/Read. Ajustado el mismo día con las respuestas del humano a
> P1–P9 (`requirements.md > Decisiones cerradas`). P10 se cerró el mismo día (§8): no queda ninguna abierta.

## Lo que ya existe

**Buscado:** «cambiar plan», «cambio de plan» con «maestro», «planes públicos», `publicos`, «carrusel»,
«cambio pendiente de empresa», «Mi plan» en `feature_list.json`, `specs/` y el código.

| Apareció | Qué es | Qué se hace |
|---|---|---|
| SLT-116 «Planes: página pública de planes para elegir en la inscripción» | Hermana: la página pública reutiliza el carrusel y el detalle | Fuera de alcance; los componentes de §5 quedan con la API que ella necesita (R9) |
| SLT-117 «Planes: solicitud de plan a la medida desde Contáctanos» | Hermana: el envío de «Contáctanos» | Fuera de alcance; el carrusel recibe la acción opcional y, sin ella, el botón sale deshabilitado con «Próximamente» (R7, P7) |
| SLT-86 «Planes: período de facturación de calendario por empresa y sin tope de órdenes» | El cambio de empresa pendiente: columnas `organizacion.plan_cambio_*`, `escribirPendiente`, `cancelarPendienteDeEmpresaEnTx`, el trabajo `plan_aplicar_cambio_empresa` y su barrido | **Se reutiliza tal cual** (§3). Ni tabla ni trabajo nuevos |
| `PlanesRepository.publicos()` (SL-24 R7, «para SL-25») | Planes públicos no archivados | Se reutiliza; el servicio filtra los de costo concreto |
| `PlanesRepository.preciosQueRigenDesde` y `primerPeriodoDelCambio` (`components/shared/tipo-cobro.ts`) | Precio que regirá en una fecha y primer período que abre un cambio (SLT-86 R15, R25, revisión m4) | Se reutilizan para la confirmación (R19) |
| `fechaDeEfectoPorDefecto(tipo, ahora)` (`lib/planes/ciclo.ts`, SLT-86 R25) | Primer día (`AAAA-MM-DD`) del siguiente período de calendario del tipo, en hora de la plataforma; nunca hoy (usa el fin exclusivo del período en curso) | **Es el corte de R10 tal cual** (decisión P2): se reutiliza con el tipo vigente de la empresa, sin función nueva ni cambios en `ciclo.ts`. `inicioDelDiaPlataforma` la vuelve instante |
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
- uno como mucho por empresa: el del maestro y el del superadmin comparten sitio. Por la decisión P3 el
  maestro cancela o reemplaza cualquiera de los dos, así que el repositorio no necesita distinguir quién lo
  programó (el actor sigue sin salir de la base, SLT-86 R32).

`organizacion` es de solo lectura para `servi_app` y las tablas `plan*` están cerradas a la app (SL-24 R8,
SLT-86 R32). Toda lectura del catálogo y toda escritura van por `PlanesRepository` en `comoPlataforma`,
que ya es excepción con ficha (`lib/db/excepciones-aislamiento.ts`, SL-24). Su `motivo` se amplía para
nombrar las operaciones del maestro: el archivo no cambia de lista. La empresa la pone siempre el servicio
desde `actor.organizacionId`, nunca el cliente (R2).

**Datos que dependen del país.** Importes sin símbolo de moneda, como hoy en «Mi plan» (SLT-58 D26); las
fechas y el corte en la hora de la plataforma (Costa Rica, SLT-58 P8) hasta que SLT-90 traiga la zona por
empresa: el corte sale de `fechaDeEfectoPorDefecto` (`lib/planes/ciclo.ts`) y cambia con ella.

## 2. Autorización

- **Dónde:** `MiPlanCambioService` (nuevo, `lib/services/`), primera línea de cada método: el actor tiene
  rol en `ROLES_MI_PLAN` (importado de `lib/auth/menu-visibility.ts`, como pide la guardia de SLT-91) y
  `organizacionId` no nulo. Si no, `forbidden` sin tocar repositorios (R1).
- **Orden fijo:** quién → zod estricto (`{ planId }` / `{}`) → repositorio con `ahora` del reloj del
  servicio. El repositorio calcula el corte con el tipo vigente y decide las reglas **bajo el cerrojo de la
  empresa** (§3): así el tipo que fija la fecha es el mismo que se guarda, aunque a las 00:00 se aplique en
  paralelo otro pendiente.
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
                        ahora: Date): Promise<ResultadoCambioDelMaestro>;
cancelarCambioPorLaEmpresa(organizacionId: string, actorUsuarioId: string): Promise<ResultadoCancelarDelMaestro>;

type EmpresaParaElMaestro = {
  planId: string | null;
  planEsCustom: boolean;
  tipoCobro: TipoCobro;
  hayPendiente: boolean;                          // de quien sea (P3); sin el actor (SLT-86 R32)
};
type ResultadoCambioDelMaestro =
  | { estado: "ok"; vigenteDesde: string | null } // AAAA-MM-DD del corte; null = pidió su plan activo (R15)
  | { estado: "sin_plan" } | { estado: "no_disponible" }
  | { estado: "tope_excedido"; excedidos: TopeExcedido[] };
type ResultadoCancelarDelMaestro =
  | { estado: "ok" } | { estado: "sin_cambio_programado" };
```

`cambiarPlanPorLaEmpresa`, dentro de una transacción:

1. `bloquearEmpresa`. `plan_id` nulo → `sin_plan` (R18, P5).
2. Corte (R10): `corte = fechaDeEfectoPorDefecto(empresa.plan_tipo_cobro, ahora)`, con el tipo **vigente**
   leído bajo el cerrojo (no el del pendiente), y `desde = inicioDelDiaPlataforma(corte)`. Es siempre inicio
   de un período de calendario del tipo, así que al aplicarse `periodoEnCurso` da `esTramo = false` (R14).
3. Plan `FOR SHARE` + `leerPlan`. No existe, archivado, `custom` o sin costo concreto (vigente o versión de su
   `plan_cambio_programado`, la regla de `PlanesService.sinCostoConcreto`) → `no_disponible` (R12). El
   predicado puro `esPlanDisponible(plan, versionPendiente)` va a `lib/planes/costo-concreto.ts`, junto a
   `tieneCostoConcreto`, para que el servicio filtre el carrusel con la misma regla.
4. Mismo plan que el activo → la rama de SLT-86 R19 de `cambiarEmpresaEnTx`: cancela el pendiente (del
   maestro o del superadmin, P3) con su fila, o `ok` sin cambio si no lo hay (R15). `vigenteDesde: null`.
5. `excedidosDe(tx, [empresa], plan.topes)` no vacío → `tope_excedido` **sin escribir** (R13). `excedidosDe`
   ya compara rol por rol y API keys (P4), no la suma de «Usuarios». Es la diferencia con el camino del
   superadmin, que con fecha futura guarda y avisa.
6. `escribirPendiente(tx, empresa.id, plan.id, empresa.plan_tipo_cobro, desde, actorUsuarioId)`: reemplaza el
   que hubiera —también uno del superadmin, aunque cambiara el tipo de cobro (P3)— sin historial y encola el
   trabajo de SLT-86 (R11, R15). Al corte lo aplica `aplicarCambioDeEmpresa` sin cambios (R14).
   `vigenteDesde: corte`.

`cancelarCambioPorLaEmpresa`: `bloquearEmpresa` → sin pendiente: `sin_cambio_programado` →
`cancelarPendienteDeEmpresaEnTx` con el maestro congelado como actor, sea de quien sea el pendiente (R16, P3).

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
      corte: string | null;              // AAAA-MM-DD (R10); null sin plan
      primerPeriodo: Record<string, PrimerPeriodo>; // por plan, con el precio que rige en el corte (R19)
      puedeCambiar: boolean;             // false sin plan (R18, P5)
      hayPendiente: boolean;             // ofrece «Cancelar cambio» y avisa del reemplazo (R16, R17)
      activoEsCustom: boolean }          // aviso de P6 en la confirmación (R19)
  | { estado: "forbidden" };
type CambiarMiPlanResult =
  | { estado: "ok"; vigenteDesde: string | null }   // null = no queda pendiente (R15)
  | { estado: "forbidden" } | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "sin_plan" } | { estado: "no_disponible" }
  | { estado: "tope_excedido"; excedidos: TopeExcedido[]; mensaje: string };
type CancelarCambioMiPlanResult =
  | { estado: "ok" } | { estado: "forbidden" } | { estado: "validation_error"; fieldErrors: Record<string, string[]> }
  | { estado: "sin_cambio_programado" };
```

`verPlanes`: `empresaParaElMaestro` + `publicos()` filtrado con `tieneCostoConcreto` (la versión pendiente se
mira al escribir, paso 3; un plan cuya versión programada pierde el costo se ve y se rechaza con
`no_disponible`: caso raro, documentado) + `plan(planId)` si el activo es custom. Con plan, `corte =
fechaDeEfectoPorDefecto(tipoCobro, ahora)` —la misma función que el repositorio, así la pantalla anuncia la
fecha que se guardará salvo que el reloj cruce un inicio de período entre la lectura y la confirmación; en ese
caso manda la del repositorio, que vuelve en `vigenteDesde`— y `primerPeriodo` con
`primerPeriodoDelCambio(precioQueRigeEn(…, corte), tipoCobro, corte)`, que con un corte en inicio de período
da siempre un período completo.

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
| `components/shared/planes/planes-vista.ts` | puro | `usuariosDelPlan(topes)` y `usuariosEnUso(porRol)` (R4); `precioDeLaVista(precio, "mensual"\|"anual")` con `montoDelPeriodo`, «Sin cuota» con costo base `0.00` y la insignia (R6, P1): en porcentaje, el del descuento; en monto fijo, `1 − montoDelPeriodo(precio, "anual") ÷ (mensual × 12)` en aritmética de céntimos (`bigint`, como `lib/planes/cobro.ts`), redondeado al entero, mitad hacia arriba; `filasDePeriodos(precio)` con «equivale por mes» en céntimos exactos, mitad hacia arriba (R8); `filasDeComparacion(plan, activo)` (R8); `excedidosContra(topes, uso)` para el aviso previo (R13). Textos en un objeto `TEXTOS_PLANES`. El texto «sobra(n) N {rol}» (R13, P4) es `mensajeTopesSobran` de `lib/planes/mensajes.ts`: lo usan el servicio (`mensaje` de `tope_excedido`) y el aviso previo, así que dicen lo mismo |
| `components/shared/planes/CarruselDePlanes.tsx` | cliente | Selector Mensual/Anual (`role="radiogroup"`), `Carousel` de shadcn, tarjetas como `button` con `aria-pressed`, tarjeta «Plan a la medida» (sin `onContactar`, «Contáctanos» `disabled` con «Próximamente» debajo, P7). Props: `planes`, `activoId?`, `customActivo?`, `seleccionado?`, `onSeleccionar`, `onContactar?` |
| `components/shared/planes/DetalleDePlan.tsx` | cliente | Tabla de períodos, comparación, aviso de topes previo y el botón «Cambiar a {plan}». Props: `plan`, `vista`, `activo?: { plan: PlanVista; uso: UsoDelPlan; tipoCobro }`, `onCambiar?` |
| `app/(app)/mi-plan/_components/PlanActivo.tsx` | servidor | El panel del diseño (R3) sobre `PlanConConsumo` + `PlanVista` del activo |
| `app/(app)/mi-plan/_components/CambioDePlan.tsx` | cliente | Estado de la selección, diálogo de confirmación (R19) y «Cancelar cambio», los dos con `components/shared/Modal` como en `PlanEmpresa` (SLT-86), llamadas a las actions, textos de rechazo (R20), `router.refresh()` |
| `app/(app)/mi-plan/_components/MiPlanModule.tsx` | servidor | Pendiente (`TEXTOS_TIPO_COBRO.pendiente`) + `PlanActivo` + `ConsumoDelPlan` debajo, sin cambios (P8) + `CambioDePlan` |

Los dos de `components/shared/planes/` solo importan de `components/ui`, `components/shared`,
`lib/types`, `lib/planes/{cobro,costo-concreto,mensajes}`, `lib/modulos/catalogo` (solo `import type` de
Prisma, como hoy) y `lucide-react`. Una guardia nueva lo comprueba (R9). Ninguno importa `ConsumoDelPlan`
(guardia de SLT-91 R8).

Íconos de módulo (`lucide-react`, ya en el repo): Analítica `BarChart3`, Monitoreo `Activity`, Ranking
`Trophy`, en un `Record<ModuloApagable, LucideIcon>` para que un módulo nuevo rompa el typecheck.

## 6. Textos (aprobados con el spec)

- Panel: «Activo», «Uso de la plataforma», «Costo por orden», «Período actual», «Se renueva el», «Usuarios»,
  «API keys», «Incluido», «No incluido», «Sin tope», «{usados} de {máximo}».
- Carrusel: «Planes disponibles», «Mensual», «Anual», insignia «{p} %» + «anual», «Sin cuota · solo pagas
  el costo por orden» (P1), «Plan a la medida», «Contáctanos», «Próximamente» (P7).
- Detalle: «Detalles de {plan}», «Uso de la plataforma según el período de cobro», columnas «Período»,
  «Descuento», «Pagas por período», «Equivale por mes», «Resaltado: tu período de cobro actual ({tipo}).»,
  «Concepto», «{plan}», «Tu plan», «Activo desde», «Período en curso», «Próximo cobro», «Cambiar a {plan}».
- Confirmación (R19): título «¿Cambiar a {plan}?»; cuerpo «Tu plan cambia a {plan} el {corte}. Hasta
  entonces sigues con {activo}. Tu primer período con {plan}: {desde} – {hasta}, costo base {costo}.» («Sin
  cuota» si el costo base es `0.00`); si hay un pendiente (de quien sea, P3), además «Esto reemplaza el cambio
  programado: Desde el {fecha}: {plan} · {tipo}.»; si el activo es custom (P6), además «Si dejas tu plan a la
  medida, solo la plataforma puede volver a asignártelo.»; botones «Confirmar cambio» y «Volver».
- Hecho: «Listo: tu plan cambia a {plan} el {corte}.»
- Pendiente: «Desde el {fecha}: {plan} · {tipo}» (SLT-86 R26) y «Cancelar cambio»; confirmación «¿Cancelar
  el cambio a {plan} programado para el {fecha}?» con «Cancelar cambio» y «Volver» (SLT-86, 2026-11-06).
- Rechazos (R20): `tope_excedido` → «No puedes cambiar a {plan}:» + una línea por tope pasado (P4) «{plan}
  permite {máximo} y tienes {usados}: sobra 1 {rol}.» / «… sobran {n} {rol en plural}.». Nombres por rol en
  `TEXTOS_PLANES`, singular y plural: administrador/administradores, mensajero/mensajeros, admin de
  tienda/admins de tienda, admin satélite/admins satélite, API key/API keys; `no_disponible` → «Ese plan ya
  no está disponible.»; `sin_plan` → «Tu empresa no tiene plan: pide uno a la plataforma.»;
  `sin_cambio_programado` → «Tu empresa ya no tiene un cambio pendiente.» (el de SLT-86).

## 7. Integraciones externas

Ninguna. Sin correo ni campana al programar el cambio (SLT-91 R9: ningún evento de la campana habla del
plan). El superadmin lo ve en el detalle de empresa, como cualquier pendiente (SLT-86 R26).

## 8. Las preguntas, cerradas por el humano el 2026-11-09

Las respuestas están en `requirements.md > Decisiones cerradas`. Aquí queda lo investigado y cómo cae en el
diseño.

### P1 — Plan sin cuota en el selector anual (y descuento anual en monto fijo) · cerrada

- En el modelo, «sin cuota» no es `precio: { tipo: "sin_precio" }`: eso es «por definir» (SLT-66 R20) y un
  plan así **no se puede asignar** (`plan_sin_costo`, SLT-66 R28). El «Por paquete» del diseño (cuota nula y
  costo porcentual) hoy no sería elegible. Lo único que el modelo admite es un costo base `"0.00"`, que sí
  es concreto.
- **Decidido:** el carrusel solo lista planes con costo concreto (R5). Con costo base `0.00`, las dos vistas
  dicen «Sin cuota · solo pagas el costo por orden», sin insignia; en la tabla de períodos, «Sin cuota» en
  las cuatro filas; en la comparación, «Sin cuota» frente al costo del período del plan activo.
- **Monto fijo, decidido:** la insignia muestra el % equivalente `1 − anual con descuento ÷ (mensual × 12)`,
  redondeado al entero más cercano, mitad hacia arriba (la misma regla que los céntimos de
  `lib/planes/cobro.ts`). Ejemplo: mensual 100.00, descuento anual de 100.00 → 1 100.00 ÷ 1 200.00 →
  8,33 % → «8 %»; descuento de 90.00 → 7,5 % → «8 %».
- **P10, cerrada (humano, 2026-11-09):** si el equivalente redondea a 0 % (descuento < 0,5 %), sin insignia.

### P2 — El corte frente a los períodos de calendario de SLT-86 · cerrada: opción (b)

**Decisión del humano:** la opción (b) de abajo. El corte es el inicio del próximo período de cobro de la
empresa (`fechaDeEfectoPorDefecto(tipoVigente, ahora)`); reemplaza la decisión anterior «el 1 o el 16, igual
para todas las empresas». Nunca abre tramo, así que SLT-86 R12/R17 no cambian y el primer período del plan
nuevo cuesta completo. La tabla y las opciones quedan como registro de por qué.

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

- (a) Dejar el corte 1/16 y SLT-86 como está: el plan nuevo abre un tramo proporcional. *Descartada por el
  humano.*
- **(b) Elegida.** Corte = inicio del siguiente período de calendario del tipo de la empresa
  (`fechaDeEfectoPorDefecto(tipo)`): sin tramo. Consecuencia que dice la propia decisión: una empresa anual que cambia en
  febrero espera hasta el 1 de enero.
- (c) Sin tramo: el primer período tras un corte cuesta completo. Cambia SLT-86 R12/R17 para todas las
  entradas: queda fuera de esta feature.

### P3–P9 · cerradas

- **P3 (sí):** las dos clases de pendiente comparten las mismas columnas, así que el maestro puede borrar o
  reemplazar un cambio de tipo de cobro o a un custom que programó el superadmin. El reemplazo usa el tipo
  vigente (el cambio de tipo del superadmin se pierde) y, como en SLT-86 R19, no escribe historial; la
  cancelación sí, firmada por el maestro. La confirmación avisa del reemplazo (§6). Desaparece el rechazo
  `pendiente_de_plataforma`.
- **P4 (por rol):** los topes que el modelo hace cumplir son por rol (triggers `SL024`, `excedidosDe`). Un
  rechazo por la suma dejaría pasar un cambio que al corte bloquearía las altas de un rol (SLT-58 R36).
- **P5 (no elige):** sin plan, el cambio sería una primera asignación (`efecto.clase = "inicio"`, SLT-86 R2),
  que pasa de «sin límites» a topes: sigue siendo del superadmin o de SLT-116.
- **P6 (se permite, con aviso):** texto en §6.
- **P7 (deshabilitado, «Próximamente»):** hasta que SLT-117 pase `onContactar`.
- **P8 (se queda):** quitar `ConsumoDelPlan` habría retirado de la pantalla del maestro SLT-86 R27–R28 y roto
  la autocomprobación de la guardia de SLT-91.
- **P9 (un PR):** ver §10.

## 9. Alternativas descartadas

1. **Una rama del maestro dentro de `PlanesService.asignar`.** Ese servicio abre con «solo el superadmin»
   (SL-24 R5) y todo su orden depende de eso. Meter un segundo rol abre la puerta a que un error de rama deje
   al maestro asignar con fecha libre o a otra empresa. Un servicio aparte, con el maestro y la empresa de la
   sesión, es más chico y se prueba solo.
2. **Una tabla de solicitudes de cambio.** Servía si el superadmin aprobara (decisión: no). El pendiente de
   SLT-86 ya modela «plan + tipo + fecha + quién», con su trabajo, su barrido y su cancelación con historial.
3. **El corte como fecha libre (o «ahora») con el campo de SLT-86.** Descartada por el humano (sin «ahora»
   ni fecha); además «ahora» aplicaría en la transacción (SLT-86 R18) y saltaría el corte.
6. **Un corte 1/16 igual para todas las empresas** (la decisión original). Con tipos mensual, bimestral o
   anual abría un tramo proporcional del plan nuevo; el humano la reemplazó el 2026-11-09 por el inicio del
   próximo período de cobro (§8, P2).
7. **Una función `proximoCorte` nueva en `lib/planes/ciclo.ts`.** `fechaDeEfectoPorDefecto` ya da exactamente
   el inicio del período siguiente con el tipo vigente; otra función duplicaría la regla y podría divergir.
4. **Pedir los planes públicos desde el cliente con SWR.** Son datos públicos, pero aquí se combinan con la
   empresa (activo, corte, precio en el corte) y aún no hay un endpoint público: lo trae SLT-116. Se leen en
   el Server Component con el resto de «Mi plan».
5. **Ampliar `MiPlanService` en vez de un servicio nuevo.** Obliga a cambiar su constructor y sus tres
   tests (unitario, `mi-plan-solo-maestro` y `plan-de-la-empresa-periodo`) sin cambiar su comportamiento.

## 10. Tamaño (P9, aceptado)

30 archivos (`tasks.md > Archivos esperados`; `lib/planes/ciclo.ts` sale de la lista al reutilizar
`fechaDeEfectoPorDefecto`): 18 de producción y 12 de tests y E2E, el 75 % de los 40 de `gate.tamano_pr`.
Líneas estimadas: ~1 800 (~800 de producción y ~1 000 de tests), por encima de las 1 000. **El humano acepta
el exceso** (2026-11-09): pantalla y cambio de plan van juntos y se prueban juntos en el E2E. Queda la línea
`tamano-pr-aceptado` en `progress/features/SLT-99.md > Decisiones`. El corte en dos rebanadas («ver» /
«cambiar») que se había propuesto se descarta.

Sin dependencias nuevas (R23).
