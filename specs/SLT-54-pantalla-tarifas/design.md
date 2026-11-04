# SLT-54 — pantalla-tarifas · design.md

## Lo que ya existe

**Términos buscados:** en `feature_list.json`, `specs/` y el código, `activar tarifas`,
`tarifa_activacion`, `tarifas_activadas`, `Hoy rige`, `usaModeloNuevo`, `tarifa_valor`, `cobro_vehiculo`,
`distrito_zona_especial`. El grafo no tiene proyecto para este worktree (`list_projects`): el código se
exploró con Grep y Read.

| Apareció | Qué se hace |
|---|---|
| Activación explícita o referencia vigente | Nada ya hecho: solo esta ficha y su maqueta. |
| `TarifaValorService`, `GrupoDistritosService`, `lib/tarifas/servicios.ts` (SLT-52) | Se reutilizan para escribir. Las actions las crea esta ficha, como pide SLT-52 §8. Un cambio: R52. |
| `resolver-tarifas.ts`, `precedencia.ts`, `catalogo.ts` | Se reutilizan. Solo cambia `usaModeloNuevo` y se exportan dos lecturas del modelo viejo. |
| `resolverFlete`, `derivarIngresoOrden`, `montoFulfillmentDeTarifa`, `pagoPorResultado`, `ingresoBodegaPorResultado` | Son la fuente de la referencia (R21), sin segunda lógica. |
| `SELECT_MARCA_ZONA_ESPECIAL` (`_shared/zona-especial.ts`) | Única forma de leer la marca (guardia `zona-especial-punto-unico`). |
| `lib/config/moneda.ts`, `useEtiquetasGeograficas` | Dinero y nombres de nivel en pantalla (R61). |
| `VehiculoRepository.findMany` | Catálogo de vehículos para las columnas. |
| `CobroVehiculoTarifas`, `TiendasModule`, `CrearTiendaForm`, `TarifaCampos`, `actualizarDistritosEspeciales` | Se retiran. Son el modelo viejo. |
| SLT-53 (cancelada), SLT-55, SLT-57, SLT-77, SLT-78 | Fuera de alcance, como dice el requirements. SLT-55 escribirá el nivel de mensajero; esta pantalla no lo ofrece. |

No aparece nada que cambie el alcance. **SLT-52 §11 y `docs/architecture.md` dicen que «el primer valor
apaga el modelo viejo»:** esta ficha lo cambia, y el párrafo de la arquitectura se actualiza (T6.4).

## 1. Forma de la solución

```
page.tsx (Server Component) → TarifasModule (cliente, por props)
                                 │ Server Actions: lib/actions/tarifas.ts
TarifaActivacionService ── TarifaActivacionRepository ── tarifa_activacion (nueva)
TarifasPantallaService  ── TarifasPantallaRepository  ── lecturas de la pantalla
  ├─ lib/tarifas/faltantes.ts (puro)
  └─ lib/tarifas/referencia-vigente.ts (puro; lo alimenta el modelo viejo del resolver)
TarifaValorService / GrupoDistritosService (SLT-52, escriben)
resolver-tarifas.ts ── usaModeloNuevo → tarifa_activacion
```

## 2. Modelo de datos

### 2.1 `tarifa_activacion` (modelo `TarifaActivacion`)

Una fila = empresa activada; sin fila, no. Mismo patrón que `organizacion_modulo`.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `TEXT` PK | uuid |
| `organizacion_id` | `TEXT` NOT NULL, FK `organizacion` RESTRICT | `@default(dbgenerated())`, como el resto |
| `activada_at` | `TIMESTAMP(3)` NOT NULL DEFAULT `CURRENT_TIMESTAMP` | «En vigor desde» |
| `activada_por` | `TEXT` NULL, FK `usuario` SET NULL | `NULL` en las activadas por migración |

- **Único:** `@@unique([organizacionId])`, `tarifa_activacion_organizacion_id_key`. Es lo que resuelve
  dos activaciones a la vez (R7) y lo que deja la consulta del interruptor en un índice.
- **RLS:** `tarifa_activacion_por_empresa`, como todas las de negocio: `ENABLE ROW LEVEL SECURITY` y
  `CREATE POLICY ... FOR ALL TO servi_app`, según `tarifa_valor` en
  `20261103120100_tarifas_flexibles_tablas`.
- **Permisos:** `REVOKE UPDATE, DELETE ON tarifa_activacion FROM servi_app`. La base impide volver atrás
  (R8), con error `42501`.
- **Trigger de misma empresa:** para `activada_por`, generado con
  `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes`. `TRIGGERS_MISMA_EMPRESA` pasa de 167 a
  168 en `scripts/verificar-rls-despliegue.ts` y su test.
- **Clasificación:** `{ modelo: "TarifaActivacion", tabla: "tarifa_activacion" }` en
  `lib/db/modelos-de-negocio.ts`. La relación inversa en `Organizacion` y `Usuario`.
- **Por qué no una columna en `organizacion`:** ver §13, alternativa 1.

### 2.2 Historial

`historial_accion_tipo` gana `tarifas_activadas` y `historial_accion_entidad` gana `tarifa_activacion`.
Categoría «mueve dinero» en `lib/types/historial-accion.ts`, con su etiqueta. `valorNuevo` = `faltantes: N`
(cabe en `varchar(60)`). Las activadas por migración no llevan historial: no hay actor, y Postgres prohíbe
usar un valor de enum en la transacción que lo añade.

### 2.3 Migraciones

1. `..._historial_tarifa_activacion`: solo los dos `ALTER TYPE ... ADD VALUE IF NOT EXISTS`. Va sola por
   el `55P04`. **Down:** borra las filas que los usan y quita los valores con la función dinámica de
   `20261103120300_historial_tarifas_flexibles/down.sql`, renombrada `_slt54`.
2. `..._tarifa_activacion`: tabla, único, FK, RLS, `REVOKE`, trigger y el relleno, que va en el mismo
   archivo para que el despliegue no deje ventana:

   ```sql
   INSERT INTO tarifa_activacion (id, organizacion_id, activada_por)
   SELECT gen_random_uuid()::text, organizacion_id, NULL
     FROM (SELECT DISTINCT organizacion_id FROM tarifa_valor) e;
   ```

   Corre como dueño, sin contexto de empresa. No toca ninguna otra fila (R11). Es una regla genérica sobre
   datos, no una lista de empresas: vale con lo que haya cuando se aplique. **Down:** `DROP TABLE`.

**Ventana de despliegue.** El código viejo no conoce la tabla y el nuevo la exige: migración antes que
código, como siempre. Hasta que ambos estén, una empresa con valores sigue calculando con el modelo nuevo
por cualquiera de los dos caminos. La bajada deja a toda empresa como en SLT-52: con valores, nueva; sin
valores, vieja (una empresa activada y sin valores vuelve a la vieja, y conviene saberlo antes de bajar).

### 2.4 Qué depende del país

| Dato | De dónde sale |
|---|---|
| Moneda y formato | `lib/config/moneda.ts`. `formatMontoString` para pintar y `montoParaCampo` para el valor inicial de un campo, que viaja con punto y sin símbolo. El «Monto ₡» de la maqueta se compone con `monedaConfig.simbolo`. |
| IVA | Lo digita la empresa por concepto. No hay porcentaje en código (P3). |
| Geografía | Distritos de la zona, con su RLS por país. «Grupos de distritos» y «N distritos» se componen con `useEtiquetasGeograficas` (guardia `etiquetas-geograficas-sin-literal`). Los mensajes de `GrupoDistritosService` dicen «El distrito» a mano: pasan a nombrar solo el distrito y la zona, como ya hace `mensajeDistritoEnOtraZona`. |
| Vehículos | Catálogo de plataforma, único. Nada por país. |

## 3. El interruptor (R1-R3, R10, R12)

`usaModeloNuevo` pasa a:

```ts
export async function usaModeloNuevo(db: Pick<PrismaClient, "tarifaActivacion">): Promise<boolean> {
  const fila = await db.tarifaActivacion.findFirst({ select: { id: true } });
  return fila !== null;
}
```

- Tiene **tres llamadores**, todos en este archivo: `resolverCobrosCon`, `resolverCobrosYFilasViejasCon` y
  `resolverPagosCon`. Ninguno necesita más cambio, y los conteos de consultas de R39 de SLT-52 no cambian.
- **Lectores de `tarifa_valor`, medidos:** por delegado o SQL solo `resolver-tarifas.ts`,
  `TarifaValorRepository.ts` y `ApiKeyRepository.ts:96`, que decide si una cuenta es eliminable, no un
  importe. El resto de lo que el Grep cuenta son `tarifa_valor_flete`, `tarifaValorId` y parecidos, sobre
  columnas congeladas. Una guardia nueva (`tarifa-valor-lectores.guardia`) deja escrita esa lista: un
  lector nuevo de esa tabla pone el gate en rojo.
- **Lectores directos del modelo viejo, medidos:** `TarifaRepository` (se queda sin action; R26),
  `ZonaRepository` y `CoberturaRepository.listZonaIdsConTarifaGeneral` (R30, §8).
- `TarifaTxClient` y `PagoTarifaTxClient` cambian `tarifaValor` por `tarifaValor | tarifaActivacion`:
  la elección sigue necesitando `tarifaValor`. Los dobles de test deben aprender el delegado (T1.3).
- **Concurrencia con un cierre (R10):** `asegurarMismoModelo` ya aborta si el servicio resolvió el pago con
  un modelo y la transacción el cobro con otro. Con la activación, el caso solo ocurre una vez por empresa.
  Se actualiza su comentario, que habla del «primer/último valor», y se prueba con la tabla nueva.
  El cierre falla y se reintenta (hallazgo H9 de la revisión de SLT-52, aceptado).
- **Empresa activada sin valores:** cae en `cobrosNuevos` con `valores: {}`, es decir «sin tarifa» por
  concepto. `fleteEntregadoSinTarifa` da 409 y el cierre registra 0, como R32.

## 4. La acción de activar (R4-R9)

`lib/actions/tarifas.ts`:

```ts
activarTarifasNuevas(input: unknown, deps?): Promise<
  | { status: "ok"; activadaAt: Date }
  | { status: "ya_activada"; activadaAt: Date }
  | { status: "confirmacion_requerida"; faltantes: FaltantesPorZona[] }
  | { status: "forbidden" | "unauthenticated" | "validation_error" | "error" }>
// input: { confirmaFaltantes: boolean }
```

`TarifaActivacionService.activar(input, actor)`:

1. `actor.rol !== "maestro"` → `forbidden`, antes de leer (R5).
2. Si ya existe → `ya_activada`.
3. Calcula los faltantes en el servidor, con la misma función que la pantalla. Si hay y
   `confirmaFaltantes !== true` → `confirmacion_requerida` (R6). Lo decide el servidor: el diálogo pudo
   abrirse con otro estado, y otra sesión pudo vaciar un valor entretanto. Si la confirmación llega y la
   lista ya cambió, se activa: el `maestro` aceptó activar con lo que falte.
4. `repo.activar(actorUsuarioId, totalFaltantes)`: en una transacción, `create` + `appendAccion`. Un `P2002`
   de `tarifa_activacion_organizacion_id_key` (otra sesión ganó) → devuelve `ya_activada` (R7); cualquier
   otra violación se propaga. La empresa sale del contexto, nunca del input.

No hay puerta de módulo: Tarifas es núcleo (`lib/modulos/reparto.ts` ya tiene `tarifas: "nucleo"` y la ruta).

## 5. Faltantes (R13-R19)

`lib/tarifas/faltantes.ts`, puro, importable en cliente:

```ts
export const CONCEPTOS_ESENCIALES = ["tienda_flete_entregado", "tienda_flete_rechazo", "mensajero_entregado"] as const;
faltantesDeZona({ zona, grupos, valores, vehiculosActivos }): EstadoZona
// EstadoZona = { estado: "completa" | "faltan" | "sin_empezar"; faltantes: Faltante[]; usaZona: AvisoGrupo[] }
```

- **Reglas:** las de R13-R17, en un solo sitio. Cuenta solo filas con `tiendaId` y `mensajeroId` nulos. La
  zona se juzga con valores de nivel zona; un grupo no suma faltante si la zona lo cubre, y se añade a
  `usaZona` para informarlo. Como un grupo siempre cae a la zona, **un esencial que falta en la zona es un
  solo faltante**, aunque la zona tenga grupos. El vehículo: `zona` o bien todos los `zona_vehiculo` activos.
- **Vehículo inactivo:** no se exige, pero su valor guardado sigue resolviendo (R53), así que no debilita
  la regla.
- **Dónde corre:** `TarifasPantallaService` lee una vez los valores de la empresa con `tiendaId` y
  `mensajeroId` nulos, los grupos y los vehículos activos: consultas fijas, sin N+1. Decisión marcada: P1.
- **Lo que no hace:** no escribe, no decide `sin tarifa` en el cálculo. La fuente de verdad sigue siendo el
  resolver.

## 6. Referencia «Hoy rige» (R20-R24)

Dos piezas:

**(a) `leerModeloViejoCon` en `resolver-tarifas.ts`.** Exporta las lecturas del modelo viejo, sin pasar por
el interruptor: la `TARIFA_SELECT`, `whereCascada`, `elegirPorCascada` y `resolvePagoTarifaCon`. La selección
de fila es la del cálculo real.

- **Nivel sin tienda:** se pasa un `tiendaId` que no es de nadie (`SIN_TIENDA = ""`), el mismo recurso que
  `contextoCobroDe` para el par sin zona. Con la misma `nivelDeCascada`, solo alcanza el nivel 3.
- **Tienda en todas sus zonas:** par con `zonaId: null`, nivel 2.
- **Grupo:** un par por zona y una marca por distrito del grupo (`SELECT_MARCA_ZONA_ESPECIAL`).

**(b) `lib/tarifas/referencia-vigente.ts`, puro.** Por concepto del catálogo, llama a las funciones reales:

| Concepto | Función | Lectura |
|---|---|---|
| `tienda_flete_<r>` | `derivarIngresoOrden({ resultado: r, esCentral, esZonaEspecial, montoCobrar: null, cobraComision: false }, tarifaVieja)` | `ingreso_flete` o `ingreso_flete_devolucion` presente = importe, con `ivaFlete`. Ausente = «No cobra». |
| `tienda_fulfillment` | `montoFulfillmentDeTarifa` | Importe. Sin IVA en el viejo (SLT-52 R47). |
| `tienda_comision_cod` | Fila elegida | `comisionCod` % con `ivaComisionCod`. La cobra solo la entrega; no se calcula un importe sin pedido. |
| `mensajero_<r>` | `pagoPorResultado(r, tarifaVieja)` | Importe o «No paga». |
| `satelite_<r>` | `ingresoBodegaPorResultado(r, tarifaVieja)` | Importe o «No paga». |

- **«No paga» frente a ₡0 (R22):** ambas funciones devuelven `"0.00"` en los dos casos. Para no reescribir
  «solo entregado paga» en otro sitio, se distinguen con una **tarifa sonda** `{ cobroEntregado: "1.00",
  cobroRechazado: "1.00" }`: si con ella la función da `"0.00"`, ese resultado no paga nunca. Se aplica igual
  al «No cobra» en el flete, leyendo la presencia del concepto. La tabla de casos usa importes literales.
- **Variantes:** de un par de valores, si todos coinciden se da uno; si no, `varia` con mínimo y máximo
  (R23). Los grupos varían por marca de distrito; la tienda en todas sus zonas, por `esCentral` falso y
  verdadero; «Todos los vehículos», por el resultado de cada vehículo con fila.
- **Salida:**

  ```ts
  type Referencia =
    | { tipo: "monto"; valor: string; ivaPct: string | null }
    | { tipo: "porcentaje"; valor: string; ivaPct: string | null }
    | { tipo: "varia"; desde: string; hasta: string }
    | { tipo: "no_cobra" } | { tipo: "no_paga" } | { tipo: "sin_tarifa" };
  ```

- **Coste por zona pedida:** 1 lectura de `tarifas`, 1 de marcas y una `resolvePagoTarifaCon` por vehículo más
  la general, en serie. Se pide al abrir la zona, no por lote, y no es ruta de dinero.
- **Tras activar:** `leerZona` no llama a nada de esto y devuelve `referencia: null` (R24).

## 7. Lecturas y actions de la pantalla

`ROLES_QUE_LEEN = maestro, admin`, en el service y **sin reutilizar `ZonaService.listar`**: ese es
solo de `maestro` y SLT-51 R2 lo pide así. `TarifasPantallaRepository` lee directamente. Toda consulta va por
el cliente con la extensión de empresa; las que deciden qué se ve se prueban con dos empresas.

| Action | Rol | Contrato |
|---|---|---|
| `cargarPantallaTarifas()` | maestro, admin | `{ activacion, zonas: ZonaResumen[], vehiculos, tiendas, puedeEscribir }` |
| `cargarZonaTarifas({ zonaId })` | maestro, admin | `{ grupos, distritos, valores, referencia }` |
| `guardarValoresTarifa({ cambios })` | maestro | `{ resultados: Array<{ clave, status, fieldErrors? }> }` |
| `crearGrupoDistritos`, `renombrarGrupoDistritos`, `cambiarDistritosDeGrupo`, `borrarGrupoDistritos` | maestro | El resultado de `GrupoDistritosService` |
| `activarTarifasNuevas` | maestro | §4 |

- **`guardarValoresTarifa`:** `cambios` es una lista `fijar` o `quitar`, una entrada por concepto modificado.
  Llama a `fijarValor` y `quitarValor` en serie, cada una con su transacción e historial (R35, R38). Sin
  transacción común: cada concepto es independiente, y un fallo no debe tirar lo demás. Máximo 200 entradas.
- **`ivaPct` (R36):** el cliente construye `fijar` por actor. El campo no existe en la rama de pago: se omite,
  no va a `null`, porque `escrituraPagoSchema` rechaza también `null`.
- **Carrera (R37):** `TarifaValorService.NIVEL_OCUPADO` ya traduce el `P2002`; esta ficha lo pinta en la fila.
- **Vehículo inactivo (R52):** `TarifaValorService.referenciasInvalidas` llama a `existeVehiculo`, que
  **hoy no mira `activo`**, y se añade la regla. `repo.vehiculoEsElegibleONivelOcupado` responde `true` si
  el vehículo está activo o ya existe valor de ese concepto y nivel exacto. `quitarValor` no cambia: no valida
  vehículo, así que un valor en un vehículo inactivo se puede quitar. La guarda sigue a `WHERE_VEHICULO_ELEGIBLE`.
- **Tiendas:** `usuario` con rol `adminTienda` o `apiKey`, como `ROLES_TARIFABLES`, solo `id` y nombre. Las
  actions `listarAdminTiendas` y `listarUsuariosPorRol` no se usan para esto.
- **Fábrica:** `serviciosDeTarifas` gana los dos services. `servicios-composicion.test.ts` comprueba las
  dependencias nuevas.

## 8. Pantalla vieja y vías de escritura (R25-R30)

**Vías de escritura del modelo viejo, censadas:**

| Vía | Escribe | Hoy | Con esta ficha |
|---|---|---|---|
| `crearTarifa`, `actualizarTarifa`, `borrarTarifa` | `tarifas` | Pantalla actual | **Se borran**, con `listarTarifas` (R26) |
| `TarifaService` | `tarifas` | Action, fixtures E2E, `tests/fabricas`, `scripts/demo-qa/receta.ts` | Se queda: lo usan solo sembrados, para la fase de modelo viejo. Lo retira SLT-57. |
| `crearZona`, `actualizarZona` con `tarifas` y `cobroVehiculo` | `tarifa_zona_mensajero`, `zona.cobro_vehiculo` | Sin pantalla desde SLT-51; la action lo sigue aceptando | **La action lo rechaza** (R27) |
| `ZonaService`, `ZonaRepository.create` y `update` | Igual | `tests/fabricas/escenarios/reparto.ts` | Se queda para sembrar. |
| `ZonaRepository` al borrar una zona | Borra `tarifa_zona_mensajero` de esa zona | Pantalla de Zonas | Se queda: la zona deja de existir, igual que su FK `tarifas` en CASCADE. |
| Borrar un usuario tienda o API key | CASCADE en `tarifas` | Sigue | Se queda. No es editar un precio. |
| `actualizarDistritosEspeciales` | `distrito_zona_especial` | `@sin-superficie`, «vuelve en SLT-54» | **Se borra** (R28). `DistritoZonaEspecialService` se queda para `receta.ts`. |
| Excel de cobertura | Nada: `CoberturaService` no escribe (su R21) | Solo lectura | R30 |
| Importaciones o cargas masivas | No hay ninguna sobre esas tablas | — | — |

**Archivos que salen:** `TiendasModule.tsx`, `CrearTiendaForm.tsx`, `TarifaCampos.tsx`,
`CobroVehiculoTarifas.tsx` (que además trae un `console.log`), `tarifas-labels.ts`, `useDestinoAnimado.ts`.
Sus tests salen con ellos. `TARIFA_CAMPO_LABEL`, `PAGO_ZONA_TEXTO` y el comentario de
`cierre-detalle-shared.tsx` dejan de citarse; las guardias `rechazo-nombre-466` y `estado-con-info` pierden
esa entrada.

**Zonas mock:** `CrearZonaForm` ya no llama a `actualizarDistritosEspeciales`. Los tests que la mockean la
pierden, y la guardia `superficie-de-uso` confirma que nada queda colgando.

**`actualizarZona` (R27):** la guarda vive en la action, después del `parse`. Mantiene los esquemas y el
service tal cual, para las fábricas de tests. `zonas-action.test.ts` pasa sus payloads a la forma sin costos.

**Cobertura (R30):** `listZonaIdsConTarifaGeneral` hoy lee `tarifas`, así que tras activar diría que ninguna
zona tiene tarifa. Pasa a mirar `usaModeloNuevo` y, si está activada, lee `tarifa_valor` con
`concepto = tienda_flete_entregado`, `tiendaId`, `grupoId`, `mensajeroId` y `vehiculoId` nulos, coherente con
`fleteEntregadoSinTarifa` (SLT-52 R51). El `WHERE` se prueba en Postgres. La guardia de §3 lo lista.

**Marca de zona especial (R44-R46).** La marca sigue decidiendo el flete hasta activar (`resolverFlete`) y por
eso esta pantalla no la escribe: cambiarla mientras se digita movería importes, y Carlos lo descartó. Se ve
de solo lectura en el selector de distritos, para que el `maestro` pueda repetir ese conjunto en su grupo sin
que nadie lo migre. Tras activar la marca no decide nada (SLT-52 R35), se oculta y SLT-57 la retira. La lectura
de la marca en el selector va por el punto único. El Excel sigue leyéndola: P4.

## 9. Pago por vehículo (R47-R54). Depende de `maqueta/Vehiculo.dc.html`, sin ver por Carlos

**Qué hace hoy `zona.cobro_vehiculo`, medido:** se escribe en `ZonaRepository.create` y `update` y se
devuelve en `ZonaDTO`, y `lib/types/zona.ts` lo usa para validar `tarifas`. **Ningún cálculo lo lee:**
`resolvePagoTarifaCon` busca (zona, vehículo) exacto y cae al de `vehiculo_id` nulo, valga lo que valga, y el
modelo nuevo tampoco lo mira. Tampoco `CoberturaRepository` ni los listados.

Por tanto el interruptor **no se relaciona** con esa columna: no la lee ni la escribe (R29, R49). Es estado de
pantalla derivado de que existan valores por vehículo en esa zona o grupo y en esa pestaña. La columna sigue
viva para el modelo viejo y SLT-57 la retira.

**Columnas (R47, R48, R51).** `vehiculos` llega del catálogo en cada carga, en orden por nombre. Columnas =
`activo` ∪ con valor guardado en ese nivel y pestaña. Sin lista escrita ni caché entre peticiones. El
inactivo lleva `Badge` «Inactivo» y sus celdas vacías van deshabilitadas.

**Qué hace el resolver con un valor en un vehículo inactivo, medido:** `rangoPago` y `whereValores` no miran
`activo`, y `mismoVehiculo` solo compara el id. Un mensajero con ese vehículo **sigue cobrando ese valor**, en
línea con SL-42 R18 («quien ya lo tiene lo conserva»). `quitarValor` lo borra sin mirar el vehículo y la FK
`RESTRICT` no estorba, porque no hay borrado de vehículos. **La decisión cerrada no choca con el resolver.** Lo
único que faltaba es que el service aceptaba un valor nuevo en un vehículo inactivo, y lo cierra R52.

**Referencia en esta tabla.** La maqueta no dibuja «Hoy rige» por vehículo, pero la decisión cerrada lo pide
junto a cada campo: se pinta una línea bajo cada campo, con el mismo texto. Sale del mismo cálculo.

**Scroll (R54).** Contenedor con `overflow-x-auto`; la primera columna `sticky left-0 z-10 bg-card` y la tabla
`min-width = 200px + 136px × columnas`, para que los campos conserven su ancho. Se mide en §12.

## 10. Vistas y estados

- **Estructura:** la de la maqueta, con los componentes reales. `AppPage` es el marco, con «Solo el maestro
  puede editar» en su lugar del encabezado, y `Sidebar`, `Tabs`, `Select`, `Checkbox`, `Modal`, `Badge`, `Alert`
  y `Input` son los del repo. El menú lateral de los `.dc.html` no se implementa: es el de la app.
- **Tablero `Vigente`.** Dibuja encabezado, grupos y tiendas, sin la lista de zonas ni el panel de valores. Esos
  dos se quedan tras activar, porque «los errores se corrigen editando el valor». Sin banda y sin «Hoy rige».
  Los bloques de grupos y de tiendas también están antes de activar: `Main` los alcanza por «Grupos de distritos»
  y por el selector, y se muestran bajo el panel de valores en los dos estados.
- **Componentes de tabla:** la tabla de precios de tienda es una lista: `DataTable`. La de valores es una rejilla
  editable, no una lista: `Table`. Cada control con `aria-label` y su `FieldError` de fila, porque `FormField` no
  cabe dentro de una celda.
- **Tokens:** banda `bg-warning-soft dark:bg-warning/15 text-warning-strong border-warning`. Estado: `Badge`
  variantes `success` y `warning`. Nunca los hex de la maqueta (R60).
- **Estados:** esqueleto del panel (R58); `Alert` con «Reintentar» (R57); `EmptyState` (R57). `Button loading`.
- **Móvil (R59):** bajo `lg`, la lista de zonas se apila arriba, los controles a `min-h-11` y la rejilla conserva
  su scroll. Mensajeros no entran aquí, pero el `maestro` puede usarla desde el teléfono.
- **Solo lectura:** a `admin` se le pintan los valores como texto y no se montan botones de escribir. La
  autorización vive en el servidor: R5 y SLT-52 R13.
- **Menú (R56):** ítem `{ label: "Tarifas", href: "/configuracion/tarifas", roles: ["admin"] }` al final, sin mover
  `primerDestino`. Decisión marcada: P2.

## 11. Huecos heredados

| Hueco | Dónde | Cambio |
|---|---|---|
| Fulfillment en el detalle (R62) | `DesgloseIngresoEmpresa`, `cierre-factura.tsx:1872`, `cierres-gestiones-fundida-descarga-columnas.ts:478` | Leen `ing.tarifa.fulfillment`, y en el nuevo `tarifa` es `null`. Pasan a `ing.fulfillment` e `ing.ivaFulfillment`, ya en el DTO. Fuera del total (SLT-52 R31) y con la regla de la ficha 481. |
| Tarjeta en el nuevo (R63) | `DesgloseIngresoEmpresa:933` | Hoy `tarifa === null` pinta `SIN_TARIFA_CONGELADA_NOTA`: **dice algo falso** en un cierre nuevo. `IngresoEmpresaDTO` gana `tarifaModelo: "viejo" \| "nuevo" \| null`, y la rama nueva pinta los conceptos del DTO y su total. |
| Aporte sin concepto (R64) | `CierreAporteRepository.buildWhere` y `satisfaceCriterio` | `{ tarifaModelo: "nuevo" }` deja pasar órdenes sin ese concepto. La rama nueva exige, por resultado de la gestión, que exista el `cierre_detail_concepto` de ese resultado. Mismo cambio en la gemela en memoria (`HechosDeAporte`, test de equivalencia). El `count` usa el mismo `where`. `tienda_comision_cod` para comisión. |
| Etiqueta del flete (R65) | `FLETE_RECHAZO_LABEL` y totales | En el nuevo esa columna suma también reprogramado, novedad e incidente (SLT-52 §11). La fila usa el resultado de la gestión. Los totales usan «Flete de gestiones no entregadas», solo en el nuevo. |
| Fulfillment del listado (R66) | `OrdenRepository.toRelaciones`, `ordenes-columns.tsx:226`, monitoreo y recibidas | El ítem gana `fulfillment: string`, derivado con `montoFulfillmentDeTarifa(cobro, montoCobrar)`. Un solo cálculo. Las columnas lo leen. Sin el IVA, igual que hoy la columna. |

## 12. Comparación con la maqueta, con números

Se mide con Playwright (`e2e/tarifas-maqueta.spec.ts`, `boundingBox()`), con tolerancia ±2 px, tema claro y
oscuro. Los datos son de ejemplo; se mide estructura. El ancho de la lista y el panel depende del `Sidebar` real.

| Elemento | Maqueta | Medida a 1360 px |
|---|---|---|
| Lista de zonas | `flex: 1 1 250px; max-width: 280px` | 250 ≤ ancho ≤ 280 |
| Separación lista-panel | `gap: 24px` | 24 |
| Fila de zona | `min-height: 58px` | alto ≥ 58 |
| Panel de valores | `flex: 999 1 560px` | ancho ≥ 560; a su izquierda la lista, misma `y` |
| Pestañas | 3 | 3, alto ≥ 44 |
| Filas por pestaña | 7, 5, 5 | Igual al catálogo |
| Columnas cobro | Concepto, Modo, Valor, IVA, Hoy rige | 5; 4 en pago; una menos tras activar |
| Campo valor | `width: 110px; min-height: 40px` | 110 × ≥ 40 |
| Campo IVA | `width: 70px; min-height: 40px` | 70 × ≥ 40 |
| Selector de modo | `min-height: 40px` | ≥ 40 |
| Botón «Activar tarifas nuevas» | `min-height: 44px` | ≥ 44, dentro de la banda |
| «Guardar borrador» | `min-height: 44px` | ≥ 44, al pie del panel |
| Diálogo `Activar` | `max-width: 640px; padding: 24px` | ancho ≤ 640; padding 24 |
| Casilla de confirmación | 20 × 20 | ≥ 20 × 20, fila ≥ 44 |
| Tabla por vehículo | `min-width: 640px`, 2 vehículos | Campo 120 × ≥ 40. Con 2 vehículos, sin scroll si el contenedor lo admite |
| Tabla de tiendas | 5 columnas, `min-width: 620px` | 5 |

**Con muchos vehículos (R54), sembrando 8 activos.** A 1360 y 390 px: `scrollWidth > clientWidth` del contenedor
de la tabla; `documentElement.scrollWidth === clientWidth` (la página no desborda); 10 columnas; cada campo
sigue en 120 px; tras `scrollLeft = 400`, la `x` de la primera columna no cambia.

**Móvil, 390 × 844.** `documentElement.scrollWidth ≤ 390`; `y` de lista < `y` de panel; botones, pestañas e
interruptores ≥ 44 de alto.

**Tests que atan la disposición (jsdom no mide):** `tests/components/TarifasDisposicion.test.tsx` afirma la
estructura y las clases de ancho y alto de esta tabla; sin ellas, un cambio de clase saldría verde hasta el E2E,
que solo corre en el PR a producción.

**Oscuro (R60).** En la spec: con el tema oscuro, el contraste calculado de banda, `Badge` y marca de inactivo
sobre su fondo real ≥ 4,5:1. `TarifasDisposicion` afirma que no hay hex ni utilidades de color fijas.

## 13. Alternativas descartadas

1. **Columnas `tarifas_activadas_at` en `organizacion`.** Una tabla menos. Pero `organizacion` no está entre los
   modelos de negocio de `lib/db/modelos-de-negocio.ts`, y sus columnas de plan las lee `servi_app` sin
   escribirlas (`docs/architecture.md`): habría que abrirle una escritura a esa tabla solo para esto, y la base
   no podría impedir el `UPDATE` que vuelve atrás sin un trigger propio. Con tabla, el `REVOKE` lo resuelve, y la
   RLS y el trigger de misma empresa ya existen. Se retira en SLT-57 sin tocar `organizacion`.
2. **Mantener «tiene valores» y guardar el borrador en otra tabla (`tarifa_valor_borrador`).** El interruptor no
   cambiaría. Pero duplica la tabla con sus CHECK, sus niveles y sus services, y hay que copiar al activar. Esa
   copia es la que podría fallar a medias y es dinero. La decisión pide un botón, no un segundo almacén.
3. **Hacer que la pantalla escriba la marca `distrito_zona_especial` al crear un grupo «Zona especial».** Conservaría
   el E2E tal cual. Pero movería cobros antes de activar, contra la decisión, y dos fuentes de la misma idea
   terminarían por divergir.
4. **Referencia leyendo columnas de `tarifas` en la pantalla.** Más corta. Sería la segunda lógica que el encargo
   prohíbe: repetiría cascada, variante y pacto, y podría enseñar un precio que el cierre no cobra.
5. **Interruptor ligado a `zona.cobro_vehiculo`.** Parecía la relación natural. Pero ningún cálculo la lee, así que
   encenderlo no cambiaría nada, y apagarlo con valores guardados diría lo contrario de lo que se paga.
6. **Transacción común en `guardarValoresTarifa`.** Un guardado todo o nada. Cada concepto ya es independiente, y un
   choque en uno tiraría lo demás. Costaría reescribir `TarifaValorRepository.fijar`, ya probado.
7. **Dejar `TarifaService` y sus actions vivas hasta SLT-57.** Cero retiro. Pero dejaría un editor alcanzable de
   precios viejos; la guardia `superficie-de-uso` además obligaría a anotarlo.

## 14. Autorización, empresa e integraciones

- **Autorización:** en el servidor. La página decide qué pinta y cada service decide `forbidden`. Tarifas es núcleo.
- **Empresa:** sale de la sesión. Toda lectura y escritura por `getPrismaClient()` con extensión y RLS. Las FK nuevas
  tienen trigger.
- **Integraciones externas:** ninguna.
- **Dependencias nuevas:** ninguna. Todo con Prisma, zod, `lucide-react` y los componentes del repo. No se añade
  ninguna fila a `docs/dependencias.md`.

## 15. Riesgos y consecuencias

- **La empresa con valores al desplegar queda activada, aunque sean de prueba.** Decisión cerrada. T6.3 mide antes
  del PR cuántas hay y los pega en la bitácora.
- **No hay vuelta atrás por pantalla.** Una activación equivocada se arregla en base, a mano, con historial. El
  diálogo lo dice.
- **Tras activar, una zona con faltantes cobra 0.** La API responde 409 si falta el flete por entregado. Es lo
  decidido; el diálogo lo avisa y el estado de la zona se sigue viendo.
- **Un cierre en curso al activar se aborta.** Una sola vez por empresa. El mensajero lo reintenta.
- **Sigue existiendo `TarifaService` para los sembrados de pruebas y demo.** Una demo así sembrada queda en modelo
  viejo hasta que alguien pulse «Activar».
- **`resolvePagoTarifaCon` en `leerZona`.** Son `1 + vehículos` consultas en serie por zona abierta. Con el catálogo
  de hoy es poco; no es ruta de dinero.
