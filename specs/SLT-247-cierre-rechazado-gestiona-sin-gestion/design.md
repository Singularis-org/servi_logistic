# SLT-247 — Diseño

> Requisitos: `requirements.md` (R1770–R1800). Arreglo MÍNIMO (D3): se amplía lo que la ficha 477
> ya hace con el cierre rechazado a una segunda fuente de órdenes, `cierre_sin_gestion`. Sin tablas
> ni columnas nuevas; un solo valor de enum nuevo.
> Nota de exploración: el índice del grafo no tiene este worktree; todo se verificó con Grep/Read
> sobre el árbol del worktree (rama `dev` al 2026-11-20).

## Lo que ya existe

Buscado: «novedad interna», «sin gestión», «rechazad» en `feature_list.json` (títulos);
`cierre_sin_gestion`+«rechaz» en `specs/`; en el código `cierre_sin_gestion`, `ordenesEnCorreccion`,
`resolicitarCierreRechazado`, `rechazarCierre`, `findMensajerosConActividadSinCierre`,
`findBarridasDelCierre`.

| Qué apareció | Qué hace hoy | Qué se hace con ello |
|---|---|---|
| Ficha 477 «Corregir las gestiones de un cierre rechazado» (`specs/477-corregir-gestiones-cierre-rechazado/`) | Predicado único «orden en corrección» (`lib/repositories/correccion-cierre.ts`) sobre `cierre_detail`. Lo consumen: la exención del bloqueo al escoger y gestionar (`MisAsignacionesService.motivoBloqueoParaOrden`, L251), la marca de Entregas (L337), el deshacer caso (b), la re-solicitud (`CierreDiaRepository.resolicitarCierreRechazado`, L2127) y la pantalla (`findCorreccionesPendientes`, L2261). | **Se reutiliza entero.** El predicado gana una segunda rama sobre `cierre_sin_gestion` y los cinco consumidores la heredan. Lo ya gestionado (D1) no se toca. |
| Feature 109 / 264 / 271 — corte diario | `CorteDiarioService.ejecutarCorte` + `CierreDiaRepository.crearCierre` (L1311-1431): crea el `vencido`, barre `en_reparto` → `novedad_interna` (`corte_sin_gestionar`), conserva `mensajero_asignado_id` y escribe `cierre_sin_gestion`. La selección (`CorteDiarioRepository.findMensajerosConActividadSinCierre`, rama b) y la escritura usan el MISMO predicado («gemelo», 246/R16). Desde la 271 no se excluye a nadie por tener cierre abierto. | Se añade UNA condición, idéntica en la selección y en la escritura (R1788). |
| Feature 109/R16 + 276 — aprobación | `CierresAdminRepository.resolverCierre` (L2703): libera a bodega (o termina en `rechazada` por tope) las barridas DE ESE CIERRE que sigan en `novedad_interna`. Guardada por estatus. | Sin cambios: ya ignora una barrida que volvió a `en_reparto` (R1792). |
| Ficha 451 / SLT-72 «Confirmación física también para las órdenes sin gestionar del cierre» | `CierresAdminService.validarConfirmacionFisica` (L1582) exige escanear TODAS las barridas (`findBarridasDelCierre`, sin filtro de estado); la pantalla las pide con `filasAConfirmar` (`cierre-confirmacion-fisica.tsx` L260). | Se acotan las dos al mismo conjunto: barridas que siguen en `novedad_interna` (R1791). |
| Rechazo | `CierresAdminService.rechazarCierre` (L1981) → `resolverCierre` con `nuevoEstado: "rechazado"`. Hoy NO mueve ninguna orden (109/R27; test caso 5 de `cierre-sin-gestion-tope-sql-real.test.ts`). | Se le añade el retorno de las barridas (R1770). 109/R27 se enmienda solo en esto: el rechazo sigue sin liberar a bodega. |
| Gestión | `MisAsignacionesService`: solo se gestiona desde `en_reparto` (`ORIGEN_GESTION`, L128/L847). | Sin cambios: por eso el retorno es a `en_reparto`. |
| «Cierre del día» (SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página») | La página de un `rechazado`/`vencido` ya pinta la sección de las órdenes que el corte pasó a Novedad interna (`SeccionSinGestion`, `CierreDiaModule.tsx` L580; R151) y la pestaña «Corregir» (`CorregirCierre.tsx`) con las órdenes en corrección. `DetalleCierre` ya admite `deshabilitadas.solicitarRechazado`. | D4 ya está cubierto en lo que es «mostrar la lista» (R1798, solo test). Se añade la distinción de las obligatorias y el bloqueo del botón (R1795-R1797). |

Nada de esto es la misma feature: la 477 dejó fuera explícitamente las barridas (su predicado solo
mira `cierre_detail`), y la 451 trata la aprobación, no el rechazo.

## 1. Modelo de datos

- **Sin tablas ni columnas nuevas.** `cierre_sin_gestion` (264) ya guarda, por cierre, qué órdenes
  barrió el corte, con `organizacion_id`, RLS `cierre_sin_gestion_por_empresa` y su único
  `(cierre_id, orden_id)`. Sigue siendo inmutable (R1793).
- **Un valor de enum nuevo**: `orden_historial_origen_tipo` gana `retorno_por_rechazo_cierre`
  (R1771).
  - Migración `db/migrations/20261120120000_orden_historial_origen_retorno_rechazo_cierre/`:
    `migration.sql` = `ALTER TYPE "orden_historial_origen_tipo" ADD VALUE 'retorno_por_rechazo_cierre';`.
  - `down.sql` = recrear el tipo con la lista previa y recastear `orden_historial_estado.origen_tipo`.
    Es el patrón de `20260908160000_correccion_resultado_gestion/down.sql`, con su aviso de lista
    fechada. La lista se MIDE contra la base al escribirlo, no se copia.
  - Si otra feature en vuelo añade antes otra migración, se renumera el timestamp (no está
    aplicada en ninguna base compartida).
- **Multi-empresa:** todas las lecturas y escrituras nuevas corren en el contexto de empresa del
  servicio que ya las envuelve (extensión de cliente + RLS). El SQL a mano nuevo vive en
  `correccion-cierre.ts`, que ya está en `EXCEPCIONES_SQL_A_MANO` por RLS. La lista no crece. Los
  triggers de misma empresa no cambian: no hay FK nueva.
- **País:** nada nuevo depende del país. La zona horaria del rechazo ya la resuelve
  `rechazarCierre` (SLT-42). El cobro congelado de R1784 usa el mismo resolver de tarifas por
  empresa que `crearCierre` (`tarifaRepo.resolveTarifas`).

## 2. El rechazo devuelve las barridas (R1770-R1777, R1799)

**Contrato** (`lib/interfaces/repositories/ICierresAdminRepository.ts`). La rama `rechazado` de
`ResolverCierreInput` gana un campo opcional:

```ts
retornoSinGestion?: { sinGestionarEstatusId: string; enRepartoEstatusId: string };
```

Es opcional por la misma razón que `liberacionSinGestionar`: hay 13 archivos de test que llaman a
`resolverCierre` con `rechazado`, y un campo obligatorio los rompe todos sin cambiar nada de lo que
prueban. El cableado lo sostiene un test del servicio que comprueba que se pasa (memoria del
proyecto: «el composition root que no inyecta»).

**Servicio** (`CierresAdminService.rechazarCierre`). Antes de `resolverCierre` resuelve los dos ids
con `ordenRepo.findEstatusIdByValue` (lo mismo que hace `aprobarCierre`). Si alguno es `null`,
devuelve `validation_error` con `MSG_CATALOGO_ANCLAJE` sin tocar el repositorio (R1775: falla
cerrado). Degradar en silencio sería reponer el bug de esta ficha.

**Repositorio** (`CierresAdminRepository.resolverCierre`, dentro de la misma `$transaction`, después
del `updateMany` del cierre y solo si `res.count === 1 && nuevoEstado === "rechazado" &&
retornoSinGestion`):

1. Lee `cierre_dia { mensajeroId, sinGestionRegistrado }`. Con `sinGestionRegistrado = false` no
   hace nada (R1774).
2. `ids` = `cierre_sin_gestion.orden_id` del cierre.
3. `orden.findMany({ id in ids, estatusId: sinGestionar, mensajeroAsignadoId: cierre.mensajeroId,
   deletedAt: null })` (R1773).
4. `orden.updateMany` con las mismas guardas en el `where` y `data: { estatusId: enReparto }`. Solo
   toca `estatusId` (R1772): ni `prioridad`, ni `mensajeroAsignadoId`, ni `fechaReparto`.
5. `appendCambioEstado` (choke point) por orden movida: origen `novedad_interna`, destino
   `en_reparto`, `actorUsuarioId = resueltoPor`, `origenTipo = "retorno_por_rechazo_cierre"`, sin
   `gestionOrdenId` (R1771).

Si algo lanza, el rechazo entero hace rollback. Con `count = 0` (carrera o fuera de alcance) el
bloque no corre (R1776). La empresa la acota el contexto de la transacción (R1777).

**Historial y grafo:**
- `lib/types/orden-historial.ts`: el valor entra en `ORDEN_HISTORIAL_ORIGEN_TIPO_SEED`. NO entra en
  `ORIGEN_TIPOS_VISITA_REAL` (no hubo visita, R1771) ni en `ORIGEN_TIPOS_CON_GESTION` (no enlaza
  gestión).
- `lib/types/order-status-transiciones.ts`: arista nueva
  `novedad_interna -> en_reparto via retorno_por_rechazo_cierre, rol "admin (rechazar cierre)"`, en
  el MISMO commit que su productor. Sin arista, el choke point rechazaría la escritura y revertiría
  el rechazo.
- Webhook: la política por familia tiene la lista de exentas vacía desde la 268/R5, así que la
  transición emite `en_reparto` como cualquier reingreso. Es lo correcto: la orden vuelve a la
  calle.

## 3. El predicado «orden en corrección» gana la segunda fuente (R1778-R1781)

`lib/repositories/correccion-cierre.ts`. `sqlOrdenesEnCorreccion` pasa a ser la unión de dos ramas
y devuelve una columna más, `fuente`:

- **rama `detalle`** (la de hoy, sin tocar una condición): `cierre_detail` de un rechazado propio
  sin gestión vigente vinculada a él.
- **rama `sin_gestion`** (nueva): `cierre_sin_gestion csg JOIN cierre_dia c JOIN orden o JOIN
  order_status s`, con
  - `c.mensajero_id = $mensajero` y `c.estado = 'rechazado'`;
  - `o.mensajero_asignado_id = c.mensajero_id`, `o.deleted_at IS NULL` y `s.value = 'en_reparto'`;
  - `NOT EXISTS` de una gestión vigente de esa orden vinculada a `c`.

  Las condiciones de estado y dueño son las que hacen que R1800 se cumpla por construcción: la
  barrida de un rechazado anterior al despliegue sigue en `novedad_interna` y no aparece.
- Si un par `(cierre, orden)` sale por las dos ramas (segundo rechazo de una orden que ya era
  barrida, gestionada y luego deshecha), gana `sin_gestion`. Sigue siendo obligatoria (D2).
- `OrdenEnCorreccion` gana `fuente: "detalle" | "sin_gestion"`. `findOrdenesEnCorreccion`
  (OrdenRepository) sigue devolviendo un `Set<ordenId>`: la exención del bloqueo (R1778), la marca de
  Entregas y el aviso de la 479 (R1779) y el deshacer caso (b) (R1781) funcionan sin tocar
  `MisAsignacionesService`.

Fragmento Prisma nuevo, exportado del mismo módulo para el corte (§5):

```ts
export function whereOrdenNoRetenidaPorRechazado(): Prisma.OrdenWhereInput {
  return { cierresSinGestion: { none: { cierre: { estado: "rechazado" } } } };
}
```

## 4. El reenvío del rechazado (R1782-R1786)

`CierreDiaRepository.resolicitarCierreRechazado` cambia su retorno de `boolean` a:

```ts
type ResolicitarRechazadoResult =
  | { status: "ok" }
  | { status: "conflict" }                                   // carrera, como hoy (477/R22)
  | { status: "obligatorias_pendientes"; guias: (number | null)[]; total: number };
```

Pasos, sobre los seis de la 477:

1. Candado + lectura de `enCorreccion`, ahora con `fuente` (sin cambios).
2. **Nuevo (R1782/R1783).** `obligatorias` = las de `fuente = sin_gestion`. Se buscan sus gestiones
   candidatas con `gestionesDelCierreWhere(mensajeroId)` (el predicado de vinculación de siempre).
   `pendientes` = obligatorias sin candidata. Si hay alguna, se lanza `ObligatoriasPendientes` con
   sus guías congeladas (`cierre_sin_gestion.num_guia`, ordenadas). Eso hace rollback (todavía no se
   escribió nada) y se devuelve `obligatorias_pendientes`.
3. `rechazado -> solicitado` (sin cambios).
4. Vincular (sin cambios: ya incluye las obligatorias, porque están en `enCorreccion`).
5. **Nuevo (R1784).** Para cada orden vinculada SIN fila de `cierre_detail` en este cierre (son las
   obligatorias: un cierre del corte no tiene detalle de órdenes barridas), se crea su detalle con el
   cobro congelado. El bloque que hoy lo hace dentro de `crearCierre` (L1559-1667: tarifa por par
   tienda/zona/distrito, descriptivos, `createMany` o `createManyAndReturn` + conceptos en el modelo
   nuevo) se **extrae tal cual** a una función de módulo del mismo archivo,
   `congelarDetalleDeOrdenes(tx, cierreId, filas)`, y lo llaman los dos. La extracción no cambia
   ningún valor de `crearCierre`: lo prueban sus tests de hoy, que no se tocan.
6. Congelar el pago de las vinculadas (sin cambios). Va DESPUÉS del paso 5 porque
   `rebasarConElCobroCongelado` lee el `cierre_detail` de cada una (y es error duro si falta, 69/R14).
7. Borrar de `cierre_detail` las sin rehacer: solo las de `fuente = detalle` (477/R18 intacto). Una
   obligatoria no puede llegar aquí sin rehacer: el paso 2 lo impide.
8. Recalcular los seis totales (sin cambios, R1785).

R1786 se cumple por construcción: sin obligatorias, los pasos 2 y 5 no hacen nada y el resto es el
código de la 477 sin cambios.

**Servicio** (`CierreDiaService.solicitarCierre`, rama de re-solicitud): mapea
`obligatorias_pendientes` a `{ status: "conflict", motivo }`, con el motivo construido por
`motivoObligatoriasPendientes(guias, total)`:

> «Antes de enviar de nuevo este cierre tienes que gestionar 3 órdenes que pasaron a Novedad
> interna: guía 1201, 1202 y 1250. Están en Entregas.»

Muestra hasta 10 guías y añade «y N más». Una guía `null` se nombra «una orden sin guía». En
singular: «1 orden … guía 1201». El `vencido` sigue por `transicionarASolicitado`, que no se toca
(R1787).

**Cobro congelado de las nuevas filas:** se usa la tarifa de tienda vigente al reenviar. Es la misma
decisión que la 477 aceptó para el pago (su pregunta abierta 4): `cierre_dia` no guarda qué fila de
tarifa usó. Si la empresa cambió de modelo de cobro entre la solicitud original y el reenvío, las
filas nuevas salen con el modelo de hoy. Es el mismo comportamiento de `crearCierre` para cualquier
cierre que se cree hoy.

## 5. El corte no las vuelve a barrer (R1788-R1790)

El mismo fragmento `whereOrdenNoRetenidaPorRechazado()` en los dos puntos del predicado gemelo:

- `CorteDiarioRepository.findMensajerosConActividadSinCierre`, rama (b), junto a
  `whereOrdenSinGestionPendiente()`.
- `CierreDiaRepository.crearCierre`, en el `findMany` de `pendientes` del barrido (L1352), junto a
  `whereOrdenSinGestionPendiente()`. El `updateMany` escribe solo esos `ids`, así que no necesita
  repetirlo.

Consecuencias:
- Un mensajero cuyo único trabajo suelto son las obligatorias de su rechazado no entra en la
  lista del corte. No nace un segundo `vencido` (R1788).
- El fragmento mira `estado = 'rechazado'` y no el mensajero (Prisma no puede atar el mensajero del
  cierre al de la fila exterior). Una barrida de un rechazado reasignada a OTRO mensajero tampoco se
  barrería mientras el cierre siga rechazado. Ese mensajero puede gestionarla normalmente, y se
  barre en cuanto el cierre salga de `rechazado` (R1789). Hoy no existe ninguna vía para reasignar
  una orden `en_reparto` de un mensajero bloqueado. Se acepta y se documenta.
- Gestiones registradas y no reenviadas: siguen el camino de la 477 (rama (a) del corte, su pregunta
  abierta 1), y el aviso `CORRECCION_AVISO_CORTE` ya lo dice en pantalla (R1790).

## 6. Aprobación y confirmación física (R1791-R1794)

- `CierresAdminRepository.findBarridasDelCierre` añade `orden: { estatus: { value:
  "novedad_interna" } }` al `where` (servidor, R1791).
- `lib/utils/cierre-sin-gestion.ts`: `SIN_GESTION_SELECT` proyecta `orden.estatus.value` y
  `toSinGestionRow` pone `fueraDeNovedadInterna: true` cuando no es `novedad_interna`.
  - `CierreOrdenSinGestion` (`ICierreDiaService.ts`) gana `fueraDeNovedadInterna?: true`. Es
    opcional: si falta, es el comportamiento de hoy y vuelve. No es un campo de dinero, así que la
    guardia `cierre-sin-gestion-sin-dinero` no cambia.
- `filasAConfirmar` (`cierre-confirmacion-fisica.tsx`) descarta las barridas con
  `fueraDeNovedadInterna`. `filasDelCierre` (interpretar una lectura) no cambia.
- Los dos lados aplican la misma regla, «la barrida vuelve si sigue en `novedad_interna`», que es
  también la guarda de la liberación. Para todo cierre que no pasó por un rechazo es idéntico a hoy:
  ninguna vía saca una orden de `novedad_interna` antes de aprobar.
- Liberación, aplicación de gestiones e intentos: sin cambios (R1792). La gestión vinculada aplica
  su estado por la aplicación de la 454, y la liberación no ve la orden porque está `en_reparto`.
- Válvula `forzarSolicitudVencido` sobre un rechazado con obligatorias pendientes: no se toca
  (R1794). Por §6 su aprobación no las pide ni las libera, y por §5 el corte las barre en cuanto el
  cierre deja de estar rechazado.

## 7. Pantallas (R1795-R1798)

Sin pantalla nueva ni componente nuevo. Se reutilizan `CorregirCierre`, `DetalleCierre` y sus
`deshabilitadas`.

- `ICierreDiaService.ts`: `OrdenEnCorreccionDTO` gana `obligatoria?: true`. Es opcional para no
  tocar los fixtures de los tests de la 477. Lo rellenan `findCorreccionesPendientes` y
  `correccionesDe`.
- `CierreDiaRepository.findCorreccionesPendientes`: los descriptivos de `fuente = sin_gestion` se
  leen de `cierre_sin_gestion` (guía, remisión y destinatario congelados). Los de `detalle`, de
  `cierre_detail`, como hoy. `regestionada` se calcula igual para las dos fuentes.
- `CorregirCierre.tsx`: dos secciones. Primero «Órdenes que pasaron a Novedad interna» (las
  obligatorias), con la explicación «Tienes que gestionarlas antes de enviar de nuevo el cierre» y
  los estados «Ya la gestionaste» / «Falta gestionarla» + «Ir a Entregas». Debajo, la sección de hoy
  de la 477 con solo las deshechas. Los textos van en `detalle-cierre-labels.ts`.
- `CierreDiaModule.tsx`:
  - en modo `rechazado`, si el cierre de la página tiene obligatorias sin `regestionada`, pasa
    `deshabilitadas={{ solicitarRechazado: motivo }}` con «Te faltan N órdenes que pasaron a
    Novedad interna. Gestiónalas en Entregas y vuelve a enviar el cierre.» (R1796);
  - `sinRehacerDelReenviable` filtra `!o.obligatoria` (R1797);
  - el modo `error` (sin detalle) sigue ofreciendo el botón. Si faltan obligatorias, el servidor
    responde con el motivo de §4 y la pantalla lo muestra en el toast que ya existe.
- Entregas (`RepartoModule`) no cambia: ya habilita las tarjetas `enCorreccion` y el aviso ya
  cuenta `ordenesEnCorreccion` (R1779).

## 8. Carreras y bordes

| Caso | Qué pasa | Requisito |
|---|---|---|
| Rechazo y corte a la vez | El rechazo y el corte bloquean las mismas filas de `orden` (el corte con su `UPDATE` de candado). Lo que el rechazo devuelve a `en_reparto` queda excluido del barrido por el fragmento de §5, que se lee en una sentencia posterior al candado (READ COMMITTED). | R1788 |
| Segundo rechazo del mismo cierre | Solo se mueve lo que siga en `novedad_interna`. Lo gestionado y vinculado se queda donde está. | R1773 |
| Mensajero gestiona y deshace | Vuelve a ser obligatoria pendiente. | R1781 |
| Deshacer concurrente con el reenvío | La comprobación de §4 paso 2 va tras el candado del cierre y en la misma transacción. | R1783 |
| Aprobación de un `vencido` reenviado sin rechazo | Barridas en `novedad_interna`: confirmación física y liberación como hoy. | R1787 |
| Admin fuerza el rechazado | Ver §6. | R1794 |
| Rechazados de antes del despliegue | Sus barridas siguen en `novedad_interna`. No entran en el predicado (§3) y la aprobación las libera como hoy. | R1800 |
| Otra empresa | La extensión de cliente y la RLS acotan cada lectura y escritura. Rechazar un cierre ajeno devuelve `no_encontrada`. | R1777 |

## 9. Producción: el caso `f11ceb85`

Hoy está `solicitado` con 11 barridas en `novedad_interna`.
- Si la oficina lo **aprueba**: nada cambia respecto de hoy. Pide escanear las 11 y las libera a
  bodega (o a `rechazada` por tope).
- Si lo **rechaza** después del despliegue: R1770 aplica en ese momento (R1799). Las 11 vuelven a
  Entregas de Bryan, él las gestiona y reenvía.
- Si lo rechazó ANTES del despliegue: queda como hoy (R1800, pregunta abierta c).

No hace falta migración de datos. La T0 de `tasks.md` mide cuántos cierres están en cada caso.

## 10. Autorización

- Rechazar: `CierresAdminService.resolveAlcance` (maestro/admin con zona destino), sin cambios.
- Gestionar y reenviar: rol `mensajero` y cierre propio (`mensajero_id` en el `where`), sin
  cambios.
- No hay módulo nuevo que encender.

## 11. Alternativas descartadas

- **A1. Dejar las barridas en `novedad_interna` y permitir gestionarlas desde ahí.** Toca
  `ORIGEN_GESTION`, la aplicación de la 454 (aplica desde `en_reparto`), la liberación y la
  confirmación física. Es mucho más ancho que devolverlas a `en_reparto`, donde todo el flujo ya
  funciona.
- **A2. Reusar la familia `deshacer_gestion` para el historial** (evita la migración del enum). Ese
  origen significa «el mensajero deshizo una gestión»: aquí no hay gestión y quien actúa es el admin
  que rechaza. El historial es la única evidencia de por qué la orden volvió a la calle, y el repo
  ya rechazó este atajo con argumentos idénticos (`rechazo_tope_intentos`, 276; `correccion_resultado_gestion`, 398).
- **A3. Vincular la gestión al rechazado en el momento de registrarla** (cerraría R1790). Mete el
  congelado de detalle y pago en el camino caliente de la gestión, y la 477 ya descartó lo mismo
  (su A4). Se queda el comportamiento de la 477.
- **A4. Excluir del corte al mensajero entero mientras tenga un rechazado.** Repone el bug de
  `79cb2c0f`: dinero de un día nuevo sin cierre al que ir (271/R21). Se excluyen las órdenes, no
  al mensajero.
- **A5. No vincular las gestiones al rechazado y dejar que vayan al siguiente cierre.** El corte
  crearía un `vencido` nuevo esa noche: N=2, sigue bloqueado y contradice D2 («antes de reenviar el
  cierre»).
- **A6. Marca nueva (columna o tabla) de «orden obligatoria».** Es modelo nuevo y contradice D3.
  El dato ya existe: `cierre_sin_gestion` + estado del cierre + estado de la orden.

## 12. Dependencias

Ninguna librería nueva.

## 13. Tamaño

| Tipo | Archivos | Líneas estimadas (añadidas + borradas) |
|---|---|---|
| Producción | 19 | ~700. ~230 son la extracción de `congelarDetalleDeOrdenes` (mover sin cambiar) y ~80 la migración con su `down.sql`. |
| Tests | 13 | ~1 500 |
| **Total** | **32 / 40 (80%)** | prod ~700 / 1 000; tests ~1 500 / 3 000 |

Está justo en el aviso del 80%. Si al implementar aparece un archivo más (por ejemplo, un doble de
test de otro rechazo que haya que actualizar), el corte natural es en dos rebanadas que se mergean
solas:
1. Backend completo (§1-§6) + sus tests. Ya es útil: el servidor bloquea con el motivo y Entregas
   ya muestra las órdenes.
2. Pantalla de «Cierre del día» (§7) + el componente y el E2E.
