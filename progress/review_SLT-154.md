# review SLT-154 «Vista de la bodega satélite: solo lo suyo» — vuelta 1

Ruta completa, fullstack (toca dinero y permisos). Diff `origin/dev...aa2ebafa` (46 archivos, 17 de
producción). Spec R460-R478. El grafo no indexa este worktree: revisado con Grep/Read.

## Verificación ejecutada por el reviewer

- `pnpm run typecheck` → `TC_EXIT=0`.
- `pnpm exec eslint` sobre los archivos del diff → 0 errores (1 aviso previo en un test, «Unused
  eslint-disable»).
- vitest contra la base desechable (18 archivos: la integración nueva, las 7 integraciones de T4, los
  servicios, la vista, la fila, la descarga y los componentes tocados) → **18/18 archivos, 575/575
  tests, 0 skipped** (la integración corrió de verdad, no `describe.skip`).
- `node scripts/tamano-pr.mjs` → AVISO 40/40 archivos, 692/1000 prod, 1821/3000 tests. En el tope, no
  por encima: no es bloqueante.
- `git show --stat 440dbe82`: el commit «rojo primero» solo trae el test de integración (529 líneas).
- No corrido (instrucción del leader): `./init.sh`, Playwright, dev server, prisma.

## Checklist

- [x] Ruta completa con requirements (EARS), design (con `## Lo que ya existe` y alternativas
      descartadas A1-A4) y tasks; diff de dinero/permisos en la ruta completa.
- [x] Tasks: 0 sin marcar en `tasks.md`.
- [x] Tamaño: 40/40, en el máximo sin pasarlo.
- [x] `## Lo que ya existe` presente y no vacía; el diff extiende lo listado
      (`ocultarFulfillmentSiNoCentral` → `ocultarDineroEmpresaSiNoCentral`, `repartirEfectivo`
      exportada sin copiarla, `cuentaCentral`/`lineasCascadaCentral` generalizadas, `tarjetasAConsolidar`
      reusada, `veFulfillment` delega en `veDineroEmpresa`). No re-crea nada.
- [x] Trazabilidad: R460-R478 con test real; mapa completo en `progress/impl_SLT-154.md > T6.2`.
- [x] Typecheck y lint verdes.
- [~] E2E del flujo crítico (`cierre-bodega-satelite`): T5 escrito, **sin correr**. Lo corre el leader
      (ver «Condición para el PR»).
- [x] Sin dependencias nuevas, sin migración, sin tablas, sin queries nuevas (solo una columna más en
      `DETALLE_CIERRE_SELECT`, misma sentencia y mismo alcance).
- [x] Sin literales de país o moneda en código nuevo (los «₡0» del diff de producción son comentarios).
      Sin Ordenex, sin secretos, sin `console.log`.
- [x] Autorización en el servidor: el corte vive en los servicios y el actor sale de
      `resolveActorFromSession` en las dos Server Actions (`lib/actions/cierre-bodega.ts:399`,
      `lib/actions/cierres-admin.ts:344`); el cliente no manda nada que decida el corte.
- [x] Reuso: ningún `.tsx` nuevo (`git diff --diff-filter=A -- '*.tsx'` vacío); ningún `CifraId`
      nuevo; ninguna prop nueva en `DineroCierre`, `Cuenta`, `CifrasCierre`, `DetalleCierre`,
      `GestionesCierre` ni `FilaGestion`. Nada recortado con «…» ni `truncate` en el diff.

## Lo que pidió el leader, por riesgo

1. **Fuga de dinero: no la hay en los dos detalles.**
   - Servidor: `verCierreDetalle` y `verCierreBodegaDetalle` devuelven por
     `anularEmpresaSiNoCentral` (agregado y cada `cierres[i]`); cada gestión pasa por
     `ocultarDineroEmpresaSiNoCentral` (`ingresoEmpresa: null` entero, con el fulfillment dentro).
     Las tres clasificaciones son `satisfies ClasificacionDinero<…>` con `-?`: un campo nuevo del
     contrato no compila hasta clasificarlo. Revisé los DTO que se marcan `"propio"`
     (`CierreAdminResumen`, `CierreBodegaResumen`, `CierreRechazoDeTienda`, `CierreOrdenSinGestion`,
     `CierreDetalleGestion` fuera de `ingresoEmpresa`): ninguno trae una cifra EMP del spec.
   - Únicos llamadores de los dos contratos: las dos Server Actions; no hay otra lectura que los arme.
   - Valores por defecto: `CierresAdminModule` y `CierresBodegaAdminModule` tienen
     `audiencia = "satelite"`; todo lo que muestra dinero EMP exige el valor exacto de la central
     (`audiencia === "admin"` / `=== "central"`, `veDineroEmpresa`). Falta la prop → falla cerrado. Y
     aunque fallara la vista, el dato ya llega en `null`.
   - Descarga del modal (R476): `columnasDescargaDetalle(tipo, audiencia === "admin"|"central")`;
     sin la central, «Gana bodega» en el sitio de «Cobro a la tienda». La fila aún emite la clave
     `cobroTienda`, pero vale `null` para la satélite y no está entre sus columnas.
   - Porcentajes: `porcentajesReparto` del mensajero ([tienda, empresa]) es `"empresa"` → `null`; el
     de bodega ([central, mensajeros, bodega]) y `porcentajesRepartoCentral` son de la satélite.
   - «Lo que va a la central»: `cuentaCentral(nivel, rotuloPago)` solo con cifras SAT.
2. **La central no cambia (R477/R465).** Los T4 no ablandan nada de la central:
   - SL-39: los literales (1.700 / −100 / 416 / 3.616 / 2.260) siguen, ahora leídos con el maestro; se
     añade el `null` de la satélite.
   - SLT-111 MB: la central `[89, 11]` sin cambio.
   - SLT-141 R387: la paridad se redefine (el lote con el alcance de cada lector contra el detalle de
     la central). Sigue protegiendo: el lote con el alcance de zona de S tiene que dar las cifras de
     la central. Los literales a mano (94 350 / 3 500 / 92 090 / partes) siguen, sobre la central.
     No se sustituyó ningún literal por su función.
   - SLT-140: `throw` si el maestro recibe `null`, no una paridad `null === null`.
   - SLT-107 R284: la paridad sigue para todo lo que no es EMP; las ocho de la central, exigidas no
     nulas.
   - Unidad: `exigirDineroEmpresa` tras 25 lecturas del maestro, sin tocar esperados.
   - Las 5 mutaciones de T4 (X1-X5) y las de T2/T3 constan muertas. X5 (recortar también a la
     central) pone 49 casos en rojo.
3. **Campos opcionales: nunca «₡0».** `haciaLaCentralDe` devuelve `null` si faltan `paraLaCentral` o
   `efectivoCubreDescuentos` → solo recaudado y pago, y sin pestaña de dinero (`lineasDinero` →
   `null`). `centralDebe` ausente → `null` → sin tarjeta. `porcentajesRepartoCentral` ausente → barra
   sin %, con montos SAT. Lo prueban `detalle-cierre-vista.test.ts` › «R478 — sin los campos de R467…»,
   «R466 — `centralDebe` pasa tal cual; ausente, `null`», «R478 — sin «La central debe»…», «R478 — sin
   `haciaLaCentral`…» y «R472, R478 — sin empresa ni `haciaLaCentral`…».
4. **Punto de decisión.** Hay dos funciones con el mismo criterio `esAccesoTotal(actor.rol)`:
   `anularEmpresaSiNoCentral` (contratos) y `ocultarDineroEmpresaSiNoCentral` (cada gestión), más el
   `desmarcable` que ya existía. Todas leen el actor del servidor. R464 está probado en unidad sobre las
   dos, con `adminTienda` y `mensajero` (M4a, M4b).
5. **Integración contra SQL real.** La integración nueva pasa por las Server Actions reales
   (RLS, `conEmpresa`, composition root) contra Postgres. Solo se inyecta `getActor`. Sin
   `if (!x) return`: `ok()` lanza. Commit rojo primero, `440dbe82`: 6 rojos y 2 verdes (siembra y
   R465) según la bitácora.
6. **Reuso.** Ver checklist.

## Hallazgos

- **menor** — `lib/interfaces/services/ICierresAdminService.ts:670-677` y
  `lib/interfaces/services/ICierresBodegaAdminService.ts:190`: `paraLaCentral?`,
  `efectivoCubreDescuentos?`, `porcentajesRepartoCentral?` y `centralDebe?` son opcionales; el
  diseño los quería obligatorios. El desvío está anotado y la vista falla cerrado (probado), pero el
  tipo ya no obliga a un servicio futuro a emitirlos: si uno los olvida, la satélite pierde sus
  tarjetas sin que nada se ponga rojo salvo la integración. Deuda aceptable; conviene volverlos
  obligatorios cuando se toquen esos dobles.
- **menor** — `components/private/cierres/detalle/detalle-cierre-vista.ts:428`: `centralDebe ??
  "0.00"` se apoya en que `tarjetasAConsolidar` omite la caja en cero. Hoy es correcto y está probado
  (R478), pero el «sin dato» depende del comportamiento de otra función. Si `tarjetasAConsolidar`
  cambiara, aparecería «₡0».
- **menor** — `e2e/cierre-bodega-satelite.spec.ts:500-518`: el tramo S6 del E2E comprueba las
  tarjetas (R471), pero no que abra en «Gestiones» (R473) ni la ausencia de las cuentas de la empresa
  en su pestaña (R472). No es bloqueante: la trazabilidad de R472 y R473 no pide E2E y la unidad y el
  componente los cubren.
- **menor (fuera del spec, para que lo mire Carlos)** — `lib/interfaces/services/ICierreDiaService.ts:139`:
  `indemnizacion` de cada gestión sigue viajando a la satélite. El inventario del spec no la clasifica
  como EMP, así que no es incumplimiento; queda anotado por si es dato de la empresa (SLT-161 o una
  ficha aparte).

Ningún bloqueante.

## Condición para el PR (no es hallazgo de esta vuelta)

`docs/perfil-agentes.md > reviewer` y `> Todos los agentes`: el diff toca dinero y una pantalla, así
que antes de abrir el PR tienen que constar en `progress/impl_SLT-154.md` en verde y en local:
`e2e/cierre-bodega-satelite.spec.ts` (con el T5 nuevo, «4 — la satélite ve solo lo suyo») y el grupo
`--project=dinero`. Lo corre el leader. El T5 dice lo que pide el spec para R468, R469, R470, R471,
R474 y R475: tarjetas por `data-cifra`, «Gestiones (2)» seleccionada y sin pestaña «Dinero»,
`data-columna="ganaBodega"` en la cabecera y en la fila con ₡500, la desplegada sin cobro ni «Ver cómo
se calculó», la cuenta «Lo que va a la central» con sus cuatro líneas y sin «₡3.750» ni «₡1.750».
Los selectores existen en `FilaGestion.tsx:209-212` y `CifrasCierre.tsx:54`.

## Veredicto

**OK**
