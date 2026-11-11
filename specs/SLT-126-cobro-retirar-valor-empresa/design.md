# SLT-126 — cobro-retirar-valor-empresa · design.md

> Escrito por `spec_author` el 2026-11-11. Requisitos en `requirements.md` (R1–R13, D1). Una sola ficha y
> un solo PR (decisión P0): la tarjeta lleva `tamano-pr-aceptado`.

## Lo que ya existe

Grafo: el proyecto de este worktree no está indexado en `codebase-memory-mcp`; todo se buscó con Grep/Read.
Términos buscados: `cobro_plataforma_por_orden`, `cobroPlataformaPorOrden`, `cobroPorOrden`,
`fijarDeEmpresa`, `fijarCobroEmpresa`, `existeEmpresa`, fuente `"empresa"`, «propio», «Usar el global»,
`textoExcepcion`. Board: nada que retire el valor propio. Se encontró lo siguiente:

| Qué | Dónde | Qué pasa aquí |
|---|---|---|
| Columna `organizacion.cobro_plataforma_por_orden` y su CHECK `organizacion_cobro_plataforma_por_orden_check` | `db/migrations/20261023130000_cobro_plataforma_tarifa/migration.sql` | Se borran (R10). Sin RLS ni GRANT propios: hereda el «solo lectura» de `organizacion` para `servi_app`. |
| La regla vigente `cobro_plataforma_tarifa_de(text)` | Última versión en `db/migrations/20261104150200_cobro_plataforma_porcentual_funciones/migration.sql` §3 | Es la **única** función o trigger vivo que lee la columna. Ninguna migración posterior la redefine; 20261106120000 y 20261106130000 solo la llaman desde `plan_de_la_empresa`. Pierde la rama de la excepción (R5). |
| Triggers de alta, anulación y recuperación | `cobro_plataforma_al_crear_orden` y `cobro_plataforma_al_cambiar_borrado` (20261104150200 §5, §6), conciliación porcentual (§4) | No cambian. El de alta llama a `cobro_plataforma_tarifa_de`; los reversos y re-cargos copian `fuente` y `monto` del último movimiento, así que una orden antigua con fuente `empresa` conserva su importe (R8). |
| Traza SLT-85 | `20261109120000_cobro_plataforma_traza` | No cambia: copia `NEW."fuente"` del movimiento (R8). |
| Enum `cobro_plataforma_fuente` (`empresa`, `global`, `sin_configurar`, `plan`) | 20261023130100, 20261031140100; `db/schema.prisma > CobroPlataformaFuente` | Se queda con `empresa` (R10): lo llevan movimientos y trazas antiguos. |
| Escritura del valor propio | `fijarCobroEmpresaAction` (`lib/actions/cobro-plataforma.ts`), `CobroPlataformaService.fijarDeEmpresa`, `CobroPlataformaTarifaRepository.existeEmpresa` / `fijarDeEmpresa`, `fijarCobroEmpresaSchema` | Se borran (R2). |
| Editor de la fila | `CeldaCobroEmpresa` en `app/(app)/plataforma/empresas/_components/CobroPorOrden.tsx`, cableado por `EmpresasModule.tsx` y `page.tsx` | Queda solo la lectura (R1, R3). `BloqueCobroGlobal` se queda, con otra ayuda (R4). |
| `EmpresaListada.cobroPorOrden` | `lib/types/empresas-plataforma.ts`, `lib/repositories/EmpresasPlataformaRepository.ts` | Se borra: solo lo usaba el editor. `cobroVigente` sigue saliendo de `cobro_plataforma_tarifa_de`. |
| Fuente `empresa` en lo vigente | `FuenteDelCosto` (`lib/types/consumo-plan.ts:30`), `MiPlanRepository.ts:63` (zod), `ORIGEN` de la celda («propio»), nota `textoExcepcion` de `components/shared/ConsumoDelPlan.tsx` y `PlanEmpresa.tsx` | Se quita (R11). Ninguna pantalla lee la fuente de movimientos o trazas históricos. |
| Demo de QA | `scripts/demo-qa/receta.ts:459-465` fija un valor propio de 100 (SL-43 R19) | Pasa a un plan custom con costo fijo de 100 (R13, §6). |
| Crear y asignar planes | `PlanesService.crear` (`lib/services/PlanesService.ts:172`) → `PlanesRepository.crearYAsignar` (`lib/repositories/PlanesRepository.ts:855`) | Se **reutiliza** para la demo, sin cambios (§6). |
| Fixtures de tests que siembran el valor propio | `tests/integration/db/_fixtures/cobro-porcentual.ts > fijarExcepcion`, `tarifas().fijarDeEmpresa(...)` en 6 tests de integración, `UPDATE … SET "cobro_plataforma_por_orden"` en otros | Se borran o pasan a sembrar con un plan fijo (`crearPlan`/`fijarCostoDelPlan`/`asignar` del mismo fixture). |

Specs previos afectados (no se editan; esta ficha los modifica): SL-40 R2, R5, R7, R10, R11 (excepción);
SLT-66 R12 (precedencia) y R31 (fuente «propio»); SLT-83 R7 (la excepción gana al porcentual); SL-43 R19.

## 1. Modelo de datos

### 1.1 Migración `20261113120000_cobro_plataforma_sin_valor_empresa` (nombre provisional: va detrás de la última del repo)

A mano, como las demás (`db:migrate:create` falla con P3006, ver 20261022130000). Envuelta en
`BEGIN; … COMMIT;` para que sea atómica también con el runner de tests que corre sentencia a sentencia
(misma razón que 20261109120000).

1. `CREATE OR REPLACE FUNCTION cobro_plataforma_tarifa_de(p_organizacion_id text)` con el **mismo**
   `RETURNS TABLE ("monto", "fuente", "porcentaje", "minimo")`, `STABLE SECURITY DEFINER SET search_path =
   public, pg_temp`. Cuerpo: el de 20261104150200 copiado literalmente salvo dos cambios: desaparecen
   `v_excepcion` y su `IF`, y el `SELECT` deja de leer `o."cobro_plataforma_por_orden"`. Orden resultante:
   plan porcentual > plan fijo > global > `0.00 sin_configurar` (R5). `CREATE OR REPLACE` conserva dueño,
   el `REVOKE … FROM PUBLIC` y la llamada desde `plan_de_la_empresa` y el trigger de alta.
2. `ALTER TABLE "organizacion" DROP CONSTRAINT "organizacion_cobro_plataforma_por_orden_check";`
3. `ALTER TABLE "organizacion" DROP COLUMN "cobro_plataforma_por_orden";` (R10).

No toca movimientos, trazas, condiciones porcentuales ni el enum (R9, R10). La función se reemplaza antes
de borrar la columna: plpgsql no registra la dependencia, así que el orden inverso también aplicaría, pero
así nunca hay un instante con una función que lee una columna inexistente.

### 1.2 `down.sql`

1. `ALTER TABLE "organizacion" ADD COLUMN "cobro_plataforma_por_orden" DECIMAL(12,2);` y su CHECK con el
   mismo nombre y expresión de 20261023130000. Todas las filas quedan NULL (R12): no hay copia (P3).
2. `CREATE OR REPLACE FUNCTION cobro_plataforma_tarifa_de` con el cuerpo de 20261104150200 **byte a byte**,
   para que el `md5(pg_get_functiondef(...))` coincida antes de subir y tras bajar, como en
   `migracion-slt83-ida-y-vuelta.test.ts`.

### 1.3 `db/schema.prisma`

Se borra `cobroPlataformaPorOrden` del modelo `Organizacion`, con su comentario. `CobroPlataformaFuente`
no cambia.

### 1.4 Multi-empresa, RLS y autorización

- No hay tabla nueva ni `organizacion_id` nuevo. La RLS de `organizacion` (`organizacion_propia`) y su
  «solo lectura» para `servi_app` no cambian.
- `cobro_plataforma_tarifa_de` sigue siendo `SECURITY DEFINER` sin `GRANT` a `servi_app`; la llaman
  `plan_de_la_empresa` (que exige `app.organizacion_id` = la empresa, `42501` si no) y el trigger de alta.
- El valor global sigue siendo de solo superadmin: `CobroPlataformaService` comprueba `esPlataforma` antes
  de tocar nada (R2). No interviene ningún módulo de SL-23.
- Datos que dependen del país: ninguno nuevo. Los importes son de la moneda de la empresa como hoy
  (SL-21 fuera de alcance).

## 2. Servidor

| Archivo | Cambio |
|---|---|
| `lib/actions/cobro-plataforma.ts` | Se borra `fijarCobroEmpresaAction`. Quedan `verCobroGlobalAction` y `fijarCobroGlobalAction` (R2). |
| `lib/interfaces/services/ICobroPlataformaService.ts`, `lib/services/CobroPlataformaService.ts` | Se borra `fijarDeEmpresa` y el import de `fijarCobroEmpresaSchema`. Cabecera: sin «luego si la empresa existe (R7)». |
| `lib/interfaces/repositories/ICobroPlataformaTarifaRepository.ts`, `lib/repositories/CobroPlataformaTarifaRepository.ts` | Se borran `existeEmpresa` y `fijarDeEmpresa`. El cliente pasa a `Pick<PrismaClient, "cobroPlataformaTarifa">`. |
| `lib/types/cobro-plataforma.ts` | Se borran `fijarCobroEmpresaSchema`, `FijarCobroEmpresaInput` y la variante `not_found` de `FijarCobroResult` (solo la devolvía `fijarDeEmpresa`). |
| `lib/types/empresas-plataforma.ts`, `lib/repositories/EmpresasPlataformaRepository.ts` | Fuera `cobroPorOrden` del tipo, del `select` y del mapeo. El comentario de `planYCobroVigente` deja de decir «sin excepción». |
| `lib/types/consumo-plan.ts` | `FuenteDelCosto = "plan" \| "global" \| "sin_configurar"` (R11). Comentarios de `CostoVigente` y `CosteoDelCiclo` sin la excepción. |
| `lib/repositories/MiPlanRepository.ts` | El `z.enum` de `costo_vigente.fuente` pierde `"empresa"`: si la base la devolviera (solo tras un `down.sql`), la lectura falla ruidosa en vez de pintar una fuente que ya no existe. |
| `lib/planes/costeo.ts` | Solo comentarios («la excepción y el global son fijos» → «el global es fijo»; nota de R28 de SLT-66 sin la excepción). |

`EmpresasPlataformaRepository.planYCobroVigente` sigue con la misma consulta: la regla nueva le llega sola
por `cobro_plataforma_tarifa_de` (R11).

## 3. Pantallas

| Archivo | Cambio |
|---|---|
| `app/(app)/plataforma/empresas/_components/CobroPorOrden.tsx` | `CeldaCobroEmpresa` queda como lectura pura: props `cobroVigente` (y nada más), pinta `textoDelCobroVigente` y la fuente. Fuera el formulario, `abrir`, `guardar`, `useRouter`, `FijarCobroEmpresa`, y los textos `propio`, `cambiar`, `cancelar`, `usarGlobal`, `errorNoExiste`. `ORIGEN` pierde `empresa` (el `Record<FuenteDelCosto, …>` lo obliga). `ayudaGlobal` = texto de R4. `guardarCobro` y `falloDe` dejan de aceptar `monto: null` y `not_found`. `BloqueCobroGlobal` no cambia en lo demás. |
| `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx` | Fuera la prop `fijarCobroEmpresa` (raíz y fila) y su documentación; la celda recibe solo `cobroVigente`. |
| `app/(app)/plataforma/empresas/page.tsx` | Fuera el import y la prop de `fijarCobroEmpresaAction`; comentario de SL-40 con «la action de guardado» en singular. |
| `components/shared/ConsumoDelPlan.tsx` | Fuera `textoExcepcion` (prop, default `TEXTOS.excepcion`, parámetro de `CostoDelCiclo`) y la nota: el costo por orden se pinta sin nota venga del plan o del global (R11). |
| `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx` | Fuera `TEXTOS.excepcion` y la prop `textoExcepcion`. |

Contrato de la celda tras el cambio:

```ts
export interface CeldaCobroEmpresaProps {
  /** SLT-66 (R31), SLT-83 (R22): lo que se cobraría hoy por una orden nueva, y de dónde sale. */
  cobroVigente: CostoVigente;
}
```

## 4. Demo de QA (R13)

Hoy, `scripts/demo-qa/receta.ts` (l. 459-465) llama a `CobroPlataformaService.fijarDeEmpresa(ACTOR_PLATAFORMA,
{ organizacionId: org, monto: "100" })` en paralelo con las altas de usuarios y **antes** de la primera
orden, porque el cargo se calcula al nacer cada orden.

Pasa a crear un **plan custom de la empresa demo y asignárselo en una sola operación**, con el camino que
ya usa la pantalla de Planes:

```ts
new PlanesService(new PlanesRepository(app), ahora).crear(ACTOR_PLATAFORMA, {
  nombre: `Demo QA ${clave}`,
  visibilidad: "custom",
  organizacionId: org,
  topes: { porRol: {}, apiKeys: null },          // sin topes: la demo no debe chocar con ninguno
  modulos: [...ORDEN_MODULOS],                    // los tres módulos apagables (lib/modulos/catalogo.ts)
  precio: { tipo: "sin_precio" },                  // el costo base no entra en la demo
  costoPorOrden: COBRO_PLATAFORMA_POR_ORDEN,       // pasa de "100" a "100.00" (montoCobroSchema admite los dos)
  costoPorOrdenPorcentual: null,
  tipoCobro: "mensual",
});
```

Lo que dice el código y por qué cada valor:
- `PlanesService.crear` exige actor de plataforma (`esPlataforma`), valida con `crearPlanSchema`
  (`lib/types/planes.ts:153`): un custom lleva `organizacionId` y `tipoCobro`; sin `inicioCiclo` la
  primera asignación rige desde hoy. Llama a `PlanesRepository.crearYAsignar`, que crea el plan, sus topes
  y módulos (`crearEnTx`) y lo asigna (`asignarEnTx` → `aplicarEnTx`) en **una transacción** en
  `comoPlataforma`. Un rechazo revierte las dos cosas.
- `aplicarEnTx` llama a `sincronizarModulos`: deja encendidos **exactamente** los módulos del plan y
  apaga los demás. Por eso el plan lleva `ORDEN_MODULOS`: la empresa demo nace con todos encendidos
  (`tests/fabricas/empresa-y-usuarios.ts:112`, por defecto `"todos"`) y así no cambia nada. El
  implementer confirma que la receta no pasa `modulos` distinto al crear la empresa.
- `ACTOR_PLATAFORMA.usuarioId = "demo-qa"` no es un usuario: `resolverActorCongelado` devuelve
  `ACTOR_SISTEMA` (actor NULL) para el historial, y `plan_rastro.actor_usuario_id` no tiene FK. Funciona
  igual que hoy con `CobroPlataformaService`.
- **Custom y no público («crea o reutiliza»):** un custom va atado a su empresa
  (`plan.organizacion_exclusiva_id`, FK `ON DELETE CASCADE`), así que el borrado de la demo (R28 de SL-43,
  que borra `organizacion`) se lo lleva con sus topes, módulos, descuentos e historial de precio (todos
  `ON DELETE CASCADE` desde `plan`). Cada corrida lo crea de nuevo; no hace falta reutilizar.
- El resultado se comprueba (`estado === "ok"`) y un rechazo lanza, como el resto de pasos de la receta.
- `plan_rastro` no tiene FK a `plan`: tras borrar una demo quedan sus filas de rastro (una `creado` por
  corrida y empresa). Es un residuo de plataforma que ninguna pantalla lista sin el plan. Se acepta y se
  anota en el informe del implementer.

`fijarCobroEmpresaSchema` y `CobroPlataformaTarifaRepository` dejan de importarse en la receta;
`CobroPlataformaService` también si nada más lo usa (lo mira el implementer).

## 5. Tests

### 5.1 Nuevos

- `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` (patrón de
  `migracion-slt83-ida-y-vuelta.test.ts` y `_fixtures/ida-y-vuelta-32.ts`: `aplicarMigracionesHasta`,
  `ejecutar`, `sqlDe`). Escenario en una base desechable:
  1. Migrar hasta la anterior a SLT-126. Empresa E con valor propio 80,00 y plan fijo 100,00; empresa G
     con valor propio 80,00 y sin plan, con global 50,00. Crear O1 en E y O2 en G (cargos `empresa` 80).
  2. Foto antes: movimientos y trazas (número, Σ por empresa), deuda por empresa, `md5` de
     `cobro_plataforma_tarifa_de`.
  3. Subir SLT-126. **R9:** foto igual. **R10:** la columna y el CHECK no existen
     (`information_schema`), ninguna función de `public` contiene `cobro_plataforma_por_orden` en
     `pg_get_functiondef`, y `enum_range(NULL::cobro_plataforma_fuente)` sigue con `empresa`.
  4. **R6, R7:** O3 en E → cargo 100,00 `plan`; O4 en G → cargo 50,00 `global`.
  5. **R8:** anular O1 → reverso 80,00 `empresa`; recuperarla → cargo 80,00 `empresa`; sus trazas con
     fuente `empresa` y ±80,00.
  6. **R12:** bajar con `down.sql`: la columna y su CHECK vuelven, NULL en E y G; `md5` igual al de antes.
     Fijar 70,00 en G y crear O5 → cargo 70,00 `empresa` (la regla vieja volvió).
- `tests/integration/db/cobro-plataforma-sin-valor-empresa.test.ts` (base migrada entera, R5): las cuatro
  ramas con empresas nuevas: plan porcentual (congela, sin cargo al crear), plan fijo (`plan`), plan sin
  costo y sin plan (`global`), sin global (`0.00 sin_configurar`); y `plan_de_la_empresa` devuelve la
  misma fuente que el cargo (R11).

### 5.2 Ajustados o borrados

| Test | Qué se hace |
|---|---|
| `tests/unit/services/cobro-plataforma-service.test.ts` | Fuera los casos de `fijarDeEmpresa`; el doble del repo sin `existeEmpresa`/`fijarDeEmpresa`. Se queda `forbidden` de `verGlobal` y `fijarGlobal` (R2). |
| `tests/unit/actions/cobro-plataforma.composition-root.test.ts` | Fuera el caso de `fijarCobroEmpresaAction`. Nuevo caso R2: las exportaciones del módulo son exactamente `verCobroGlobalAction` y `fijarCobroGlobalAction`. |
| `tests/unit/types/cobro-plataforma-schema.test.ts` | Fuera los casos de `fijarCobroEmpresaSchema`. |
| `tests/unit/actions/empresas-plataforma.composition-root.test.ts`, `tests/unit/services/empresas-plataforma-service.test.ts`, `tests/integration/db/empresas-plataforma.test.ts`, `tests/integration/empresas-page.test.tsx` | Fuera `cobroPorOrden` y `cobroPlataformaPorOrden` de fixtures y expectativas; la fila del doble con fuente `plan` o `global`. En `empresas-page.test.tsx`, fuera el mock de `fijarCobroEmpresaAction`. |
| `tests/components/EmpresasModuleCobro.test.tsx` | Fuera los casos del editor (guardar, quitar, `not_found`, `forbidden` de la fila). Nuevos: R1 (ninguna fila tiene «Cambiar», «Usar el global» ni un `textbox` fuera del bloque global), R3 («del plan», «global», nunca «propio»), R4 (texto exacto de la ayuda). |
| `tests/components/EmpresasModuleCobroPorcentual.test.tsx`, `EmpresasModulePlan.test.tsx`, `EmpresasModulePeriodo.test.tsx`, `empresas-module.test.tsx` | Fuera `cobroPorOrden`, la prop `fijarCobroEmpresa` y la fila con fuente `empresa`. |
| `tests/components/ConsumoDelPlanCosteo.test.tsx`, `tests/components/PlanEmpresaSinCosto.test.tsx` | Fuera los casos de la nota de la excepción; nuevo caso R11: con fuente `plan` y `global` no sale «precio acordado para tu empresa» ni «excepción de la empresa». |
| `tests/unit/planes/costeo.test.ts`, `tests/unit/planes/costeo-porcentual.test.ts` | Los casos con fuente `empresa` pasan a `plan` o se borran si solo probaban la excepción. |
| `tests/integration/db/empresas-plataforma-cobro.test.ts` | Probaba R2, R5, R10 de SL-40 (escribir la excepción). Se borra el archivo: lo que queda vivo (el listado) lo cubren `empresas-plataforma.test.ts` y `empresas-plataforma-plan.test.ts`. |
| `tests/integration/db/empresas-plataforma-plan.test.ts`, `empresas-plataforma-cobro-porcentual.test.ts`, `cobro-plataforma-plan.test.ts`, `cobro-plataforma-cargos.test.ts`, `cobro-plataforma-porcentual.test.ts`, `cobro-plataforma-traza.test.ts`, `plan-de-la-empresa-costeo.test.ts`, `deuda-plataforma-wallet.test.ts`, `deuda-plataforma-plan.test.ts` | Fuera los casos cuya razón era la excepción (precedencia, «la excepción gana al porcentual», fuente `empresa`); los que solo la usaban para tener un importe siembran un plan fijo. |
| `tests/integration/db/_fixtures/cobro-porcentual.ts` | Fuera `fijarExcepcion`. |
| `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts`, `pago-plataforma-sl45.test.ts`, `pago-plataforma-sl45-blindaje.test.ts` | La siembra `tarifas.fijarDeEmpresa(org, "300.00")` pasa a un plan fijo de 300,00 asignado a la empresa (mismo importe: las expectativas de deuda no cambian). |
| `tests/integration/db/tope-intentos-escritura.test.ts` | Fuera la fila `cobro_plataforma_por_orden` del `it.each`. |
| `tests/integration/db/demo-qa.test.ts` | R13: en lugar de leer la columna, la empresa demo tiene un plan custom con `costo_por_orden = 100.00` y cada orden sin condiciones porcentuales tiene un cargo de 100,00 `plan`. El `md5` de la empresa real (l. 389) deja de incluir la columna. |
| `e2e/cobro-plataforma-sl40.spec.ts` | El test T8 deja de fijar y quitar la excepción: fija el global, ve 500 y «global» en la fila de A, y comprueba R1 (sin botón «Cambiar · A») y R4 (la ayuda nueva). Fuera las lecturas de `cobroPlataformaPorOrden`. Cabecera actualizada. |

No se tocan: `migracion-sl40-ida-y-vuelta.test.ts`, `tope-intentos-migration.test.ts` y
`migracion-slt66-ida-y-vuelta.test.ts` aplican las migraciones hasta un punto fijo anterior. El implementer
los corre para confirmarlo.

### 5.3 E2E en local antes del PR

Toca `db/`, una pantalla y dinero: `pnpm exec playwright test --project=dinero` entero, más
`e2e/cobro-plataforma-sl40.spec.ts`, `e2e/planes-costo-porcentual.spec.ts` y los que `grep -rl` encuentre
por «Cobro por orden», `plataforma/empresas` y `cobro_plataforma` (`docs/perfil-agentes.md`).

## 6. Alternativas descartadas

1. **Dejar la columna y solo quitar la pantalla y la regla** (o vaciarla con `UPDATE … SET NULL`).
   Descartada: el humano pidió no dejar dato muerto; una columna que nadie lee confunde y obliga a
   mantenerla en Prisma y en los tests de privilegios.
2. **Quitar `empresa` del enum `cobro_plataforma_fuente`.** Descartada: Postgres no borra un valor de un
   enum sin recrear el tipo y reescribir `cobro_plataforma_movimiento` y `cobro_plataforma_traza`, y esas
   filas históricas deben conservar su fuente (R8, R9; la traza es inmutable, SLT-85 R24).
3. **Reescribir los cargos antiguos con fuente `empresa` a `global`.** Descartada: cambia el historial y la
   traza inmutable; el humano decidió que las órdenes ya creadas conservan su importe.
4. **Demo con un plan público reutilizado entre corridas.** Descartada: aparecería en el catálogo de
   planes asignables de las empresas reales y sobreviviría al borrado de la demo. El custom se va con la
   empresa demo (§4).
5. **Demo cobrando el global.** Descartada en P2: el global es de toda la plataforma.
6. **Partir la ficha en rebanadas.** Descartada por el humano (P0).

## 7. Dependencias de terceros

Ninguna nueva.

## 8. Riesgos

- **Tamaño:** ~55 archivos y ~1 600 líneas de diff (estimación en `tasks.md`). Aceptado por el humano
  (`tamano-pr-aceptado`, P0); el leader añade la línea `<!-- tamano-pr-aceptado: … -->` a
  `progress/features/SLT-126.md` si el gate la pide.
- **Despliegue:** D1 va antes de `prisma migrate deploy` en producción. Desde el deploy, una empresa que
  tenía valor propio cobra por su plan o por el global; si el informe de D1 muestra empresas sin plan y
  sin global, cobrarán `0.00` y el humano decide antes del deploy.

## Archivos esperados

Producción:
- `db/migrations/20261113120000_cobro_plataforma_sin_valor_empresa/migration.sql`
- `db/migrations/20261113120000_cobro_plataforma_sin_valor_empresa/down.sql`
- `db/schema.prisma`
- `lib/actions/cobro-plataforma.ts`
- `lib/services/CobroPlataformaService.ts`
- `lib/interfaces/services/ICobroPlataformaService.ts`
- `lib/repositories/CobroPlataformaTarifaRepository.ts`
- `lib/interfaces/repositories/ICobroPlataformaTarifaRepository.ts`
- `lib/types/cobro-plataforma.ts`
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `lib/types/empresas-plataforma.ts`
- `lib/types/consumo-plan.ts`
- `lib/repositories/MiPlanRepository.ts`
- `lib/planes/costeo.ts`
- `app/(app)/plataforma/empresas/page.tsx`
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`
- `app/(app)/plataforma/empresas/_components/CobroPorOrden.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`
- `components/shared/ConsumoDelPlan.tsx`
- `scripts/demo-qa/receta.ts`

Tests:
- `tests/unit/services/cobro-plataforma-service.test.ts`
- `tests/unit/actions/cobro-plataforma.composition-root.test.ts`
- `tests/unit/types/cobro-plataforma-schema.test.ts`
- `tests/unit/actions/empresas-plataforma.composition-root.test.ts`
- `tests/unit/services/empresas-plataforma-service.test.ts`
- `tests/unit/planes/costeo.test.ts`
- `tests/unit/planes/costeo-porcentual.test.ts`
- `tests/components/EmpresasModuleCobro.test.tsx`
- `tests/components/EmpresasModuleCobroPorcentual.test.tsx`
- `tests/components/EmpresasModulePlan.test.tsx`
- `tests/components/EmpresasModulePeriodo.test.tsx`
- `tests/components/empresas-module.test.tsx`
- `tests/components/ConsumoDelPlanCosteo.test.tsx`
- `tests/components/PlanEmpresaSinCosto.test.tsx`
- `tests/integration/empresas-page.test.tsx`
- `tests/integration/db/empresas-plataforma-cobro.test.ts`
- `tests/integration/db/empresas-plataforma-plan.test.ts`
- `tests/integration/db/empresas-plataforma-cobro-porcentual.test.ts`
- `tests/integration/db/empresas-plataforma.test.ts`
- `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts`
- `tests/integration/db/cobro-plataforma-plan.test.ts`
- `tests/integration/db/cobro-plataforma-cargos.test.ts`
- `tests/integration/db/cobro-plataforma-porcentual.test.ts`
- `tests/integration/db/cobro-plataforma-traza.test.ts`
- `tests/integration/db/_fixtures/cobro-porcentual.ts`
- `tests/integration/db/plan-de-la-empresa-costeo.test.ts`
- `tests/integration/db/deuda-plataforma-wallet.test.ts`
- `tests/integration/db/deuda-plataforma-plan.test.ts`
- `tests/integration/db/pago-plataforma-sl45.test.ts`
- `tests/integration/db/pago-plataforma-sl45-blindaje.test.ts`
- `tests/integration/db/tope-intentos-escritura.test.ts`
- `tests/integration/db/demo-qa.test.ts`
- `tests/integration/db/cobro-plataforma-sin-valor-empresa.test.ts`
- `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts`
- `e2e/cobro-plataforma-sl40.spec.ts`
