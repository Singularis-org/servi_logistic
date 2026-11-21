# SLT-55 — valor-propio-mensajero · design.md

## Lo que ya existe

**Términos buscados:** en `feature_list.json`, `specs/` y el código, `valor propio`, `mensajeroId`,
`mensajero_id`, `tarifa_valor`, `nivel mensajero`. El grafo no tiene proyecto para este worktree
(`list_projects`): el código se exploró con Grep y Read.

Es la misma ficha que dejaron prevista SLT-52 R6 y SLT-54 «Lo que NO entra»: no hay otra ficha ni otro
spec que la cubra. No es `BLOQUEADO`. Lo ya hecho se reutiliza:

| Apareció | Qué se hace |
|---|---|
| `tarifa_valor.mensajero_id`, CHECK `tarifa_valor_niveles_mensajero`, índice `tarifa_valor_nivel_key` (`NULLS NOT DISTINCT`), índice por mensajero, FK CASCADE, trigger `sme_tarifa_valor_mensajero_id`, RLS | Se usan tal cual. **Sin migración** (§2). |
| `lib/tarifas/niveles.ts` (`nivel: "mensajero"`), `lib/tarifas/precedencia.ts` (rango 1, tercera rama de `whereValores`), `resolverPagosCon` | No se tocan. Ya resuelven el valor propio; lo que falta es probarlo en cada camino del cierre (§4). |
| `lib/tarifas/faltantes.ts:67` y `valoresDeZonaOGrupo` | Ya excluyen el valor propio. Se atan con tests (§5). |
| `TarifaValorService`, `TarifaValorRepository`, `escrituraValorSchema`, `guardarValoresTarifa` | Se abren: hoy fuerzan o descartan `mensajeroId` (§3). |
| `TarifasTiendas`, `DataTable`, `Modal`, `planDeGuardado`, `celdaDeGuardado`, `conceptosDeActor`, `etiquetaConcepto` | Precedente y piezas de la sección nueva (§7). |
| `ESTADOS_USUARIO_NO_ASIGNABLES` (`lib/constants/estado-usuario-asignable.ts`) | La única lista de «dado de baja». No se crea otra. |
| `WHERE_VEHICULO_ELEGIBLE`, `vehiculoEsElegibleONivelOcupado` (SLT-54 R52) | Forma de la regla de R8. |
| `etiquetaDePersona` | Nombre del mensajero en el historial (§3.4). Su contrato es «de un OPERADOR», y un mensajero lo es. |

**Hallazgo, por lectura del código y sin ejecutar.** El `z.object` de `escrituraValorSchema` no declara
`mensajeroId` y zod lo descarta en silencio: hoy un pago con `mensajeroId` y `zonaId` se guardaría como **valor de
la zona**, que pagaría a todos los mensajeros de esa zona. Solo lo alcanza un `maestro` con un payload a mano. Lo
cierran R6 y §3.1.

## 1. Forma de la solución

```
page.tsx → TarifasModule → TarifasMensajeros (nueva) → TarifaMensajeroDialogo (nuevo)
                                     │ guardarValoresTarifa (sin cambios)
TarifaValorService ── TarifaValorRepository ── tarifa_valor
TarifasPantallaService ── TarifasPantallaRepository ── mensajeros y valores propios
resolver-tarifas.ts, precedencia.ts, niveles.ts, faltantes.ts: sin cambios
```

## 2. Modelo de datos: sin migración

Todo lo que el valor propio necesita lo creó `20261103120100_tarifas_flexibles_tablas` y
`20261103120200_tarifas_flexibles_misma_empresa`:

| Necesidad | Ya existe |
|---|---|
| `organizacion_id` y RLS | `tarifa_valor`, política `tarifa_valor_por_empresa` |
| Un valor por empresa, concepto y mensajero (R3) | `tarifa_valor_nivel_key`, `NULLS NOT DISTINCT`, empieza por `organizacion_id` |
| Solo el mensajero, sin zona, grupo, tienda ni vehículo (R6) | CHECK `tarifa_valor_niveles_mensajero`, `_tienda` y `_satelite` |
| Sin IVA en la base | CHECK de IVA solo en la tienda (SLT-52 R45) |
| Mensajero de la misma empresa (R9) | Trigger `sme_tarifa_valor_mensajero_id_d5fbd496` |
| Buscar por mensajero | `tarifa_valor_organizacion_id_mensajero_id_idx` |
| Historial | `tarifa_valor_fijado`, `tarifa_valor_quitado`, entidad `tarifa_valor` |
| Nivel congelado | Enum `TarifaNivel` con `mensajero` |

**Lo que la base no puede decir:** que el usuario tenga rol `mensajero`. Un CHECK no mira otra tabla, y un
trigger nuevo sería una migración para una regla que `esTiendaTarifable` ya resuelve en el service para la
tienda. Vive en el repositorio y se prueba en Postgres (§3.3).

**Qué depende del país.** Moneda: `lib/config/moneda.ts`. El valor propio no lleva IVA ni geografía. Los
textos de la sección dicen «zona», que no es un nivel de país: es el mismo «Usa la zona» de hoy.

**Autorización.** En el servidor: `TarifaValorService` y `TarifasPantallaService`, `maestro` escribe y
`maestro` y `admin` leen. Tarifas es núcleo: sin puerta de módulo.

## 3. Escritura

### 3.1 Tipos (`lib/types/tarifa-flexible.ts`)

- `nivelSchema` gana `mensajeroId: idSchema.nullable().default(null)`, en cobro y en pago. Con `default` y no
  obligatorio: la rejilla por zona no manda la clave y no tiene por qué empezar a mandarla.
- `FijarValorInput` gana `mensajeroId?: string | null`.

### 3.2 Service (`TarifaValorService`)

- `nivelDeValor(dato.concepto, { ...dato, mensajeroId: null })` pasa a `nivelDeValor(dato.concepto, dato)`.
  Toda la regla de R6 ya está escrita en `niveles.ts`.
- `referenciasInvalidas` gana el chequeo de R7 y R8, con error en `mensajeroId`:
  «El mensajero no existe, no es de la empresa o está dado de baja: no admite un valor nuevo.»
- `repo.fijar` recibe `mensajeroId`. `quitarValor` no cambia: no valida el mensajero, así que un valor de un
  dado de baja se puede quitar (R8).
- Si `nivel.nivel === "mensajero"` no hay nada más que validar: no lleva zona ni vehículo.

### 3.3 Repositorio (`TarifaValorRepository`)

```ts
/** R7, R8: mismo patrón que vehiculoEsElegibleONivelOcupado. La empresa la filtra la extensión. */
async mensajeroEsElegibleONivelOcupado(nivel: { concepto: TarifaConcepto; mensajeroId: string }): Promise<boolean> {
  const elegible = await this.prisma.usuario.findFirst({
    where: { id: nivel.mensajeroId, rol: { value: "mensajero" }, estado: { notIn: [...ESTADOS_USUARIO_NO_ASIGNABLES] } },
    select: { id: true },
  });
  if (elegible !== null) return true;
  const ocupado = await this.prisma.tarifaValor.findFirst({
    where: { concepto: nivel.concepto, mensajeroId: nivel.mensajeroId, zonaId: null, grupoId: null, tiendaId: null, vehiculoId: null },
    select: { id: true },
  });
  return ocupado !== null;
}
```

`pendiente` es elegible, igual que en `listMensajerosParaFiltro`: es quien se está dando de alta. `fijar` pasa de
`mensajeroId: null` a `datos.mensajeroId`, en el `where` y en el `create`. `FijarValorDatos` gana `mensajeroId`.
El `mensajeroId: null` de `vehiculoEsElegibleONivelOcupado` (línea 153) se queda: un valor con vehículo nunca lleva
mensajero.

### 3.4 Historial (R11)

`etiquetaDelValor` añade `mensajero: { select: { nombre: true, primerApellido: true } }` y lo suma a `partes` con
`etiquetaDePersona`, igual que la tienda. Etiqueta: `mensajero_entregado · Ana Torres`. Se lee antes del `DELETE`,
como hoy, y queda congelada. `etiquetaDeEntidad` no cambia de firma; solo se corrige el comentario de
`tarifa_valor` en `historial-accion-etiquetas.ts`, que enumera los niveles.

### 3.5 Action

`guardarValoresTarifa` no cambia: `datos` ya viaja sin validar hasta el service.

## 4. Resolución: qué se comprueba y qué no cambia

### 4.1 Lo que hay probado hoy, medido

| Prueba | Hay | Falta |
|---|---|---|
| `resolverPagosCon` elige el nivel `mensajero` sobre los otros 4, y no el de otro mensajero | `tarifas-flexibles-resolver.test.ts`, Postgres | — |
| Elección pura | `tests/unit/tarifas/precedencia.test.ts` | — |
| Vista previa, solicitud, corte, re-solicitud y corrección con un valor propio | **Nada.** `tarifas-flexibles-snapshot.test.ts` y `-base-congelada.test.ts` siembran solo zona, grupo y vehículo: su `mensajeroId` es el de la gestión | **Va en T3** |
| Fijar un valor propio por el service, `sme_tarifa_valor_mensajero_id`, rol | **Nada.** `tarifas-flexibles-escritura.test.ts` no escribe `mensajeroId`; ningún test nombra el trigger | **Va en T2** |

### 4.2 Los cinco caminos

Los cinco terminan en el mismo resolver con el `mensajeroId` de la gestión, así que no se espera código de
producción. Si un test de T3 sale rojo, es un defecto real y se para (`tasks.md`).

| Camino | Dónde | Zona que pasa |
|---|---|---|
| Vista previa | `CierreDiaService.resolvePagosMensajero` | La del mensajero |
| Solicitud | `CierreDiaService.solicitarCierre` | La del mensajero |
| Corte diario | `CorteDiarioService.ejecutarCorte` | La del mensajero |
| Re-solicitud (477) | `CierreDiaRepository`, dentro de la transacción | `destinoZonaId` del cierre |
| Corrección (398) | `CierresAdminRepository.corregirResultadoGestionEnCierre` | `destinoZonaId` del cierre |

### 4.3 Porcentaje, con cifras (R17-R19)

`resolverPagosCon` elige el pago con el contexto del mensajero y el cobro con el de la orden (`zonaOrdenId`,
`distritoId`, `tiendaId`); `baseFlete` sale de `fleteSinIvaDeGestion` y `importePagoNuevo` aplica el %. La zona del
mensajero **no interviene en la base**, tenga o no valor de pago. Valor propio `mensajero_entregado` en 20 %:

| Escenario, con la zona del mensajero SIN ningún valor | Base | Pago |
|---|---|---|
| Flete de la zona de la orden, 3.000 + 13 % de IVA | 3.000,00 (sin IVA) | **600,00** (con IVA serían 678,00) |
| La tienda pactó 2.500 | 2.500,00 | **500,00** |
| Flete en 10 % de un pedido de 20.000 | 2.000,00 | **400,00** |
| Flete de 3.333,33 | 3.333,33 | **666,67** (666,666 redondea hacia arriba) |
| `mensajero_reprogramado` 20 % y la tienda sin `tienda_flete_reprogramado` | 0,00 | **0,00**, con fila congelada de base 0,00 |
| `mensajero_entregado` en monto, 1.700 | Sin base | **1.700,00**, cualquiera que sea el flete |

En 398 y 477 la base sale del cobro congelado (`rebasarConElCobroCongelado`), incluido el del modelo viejo (SLT-52
R54): R19 lo ata a un valor propio.

### 4.4 Mensajero sin zona (R20)

No cambia: `solicitarCierre` responde `validation_error` en `zona` (R16 de la 37), `ejecutarCorte` lo cuenta en
`mensajerosSinZona` y la vista previa da 0. El valor propio no lleva zona, pero el cierre la necesita para derivar la
bodega responsable. Decisión técnica: dar de alta un cierre sin bodega es otra ficha. Consecuencia en §10.

## 5. Activación y faltantes (R21-R24)

- **Sin activar (R21):** `usaModeloNuevo` falso lleva a `pagosViejos`, que no mira `tarifa_valor`. Fijar no crea
  activación (SLT-54 R3).
- **Faltantes (R23):** la zona se juzga con `v.zonaId === zona.id && v.mensajeroId === null`, y la lectura ya filtra
  `mensajeroId: null`. Hay dos tests: uno puro (`faltantes.test.ts:72`) y uno del `WHERE`
  (`tarifas-referencia.test.ts:433`). **Falta** el recorrido entero: un valor propio del único mensajero de la zona no
  cambia `cargarPantalla` ni la respuesta `confirmacion_requerida` de `activar`. Va en T4, en Postgres.
- **`valoresDeZona`** usa `where: { zonaId }` y el valor propio tiene zona nula: no se cuela en la rejilla.
  `valoresDelNivel` además exige `mensajeroId === null`.

## 6. Mensajero dado de baja, retirado o borrado (R8, R25, R26, R32)

Decisión técnica, por los dos precedentes del repo: SLT-54 R51-R53 (vehículo inactivo) y la ficha 351 (el estado no
toca los datos, solo la opción).

| Caso | Valor guardado | Pago | Lista |
|---|---|---|---|
| `inactivo` o `bloqueado` | Se conserva: reactivarlo no obliga a redigitar | `rangoPago` no mira el estado: sus gestiones pendientes, las del corte, se pagan con su valor | Marcado «Inactivo». Editable y quitable; filas vacías deshabilitadas. No se ofrece al añadir |
| Cambió de rol (`UserRepository.update` lo permite) | Igual | Igual | Igual: sale por `tarifaValoresComoMensajero` (§7.1) |
| Borrado de la base | CASCADE se lleva el valor | Lo congelado no depende de él: FK `SET NULL` y el importe viaja copiado | Desaparece |

**Borrado: no hay camino en la app.** El único `tx.usuario.delete` es el de la cuenta dedicada de API key
(`ApiKeyRepository:494`), que por eso mira `tarifa_valor.tienda_id` antes de borrar (`dependenciasPorCuenta`). A un
mensajero no le aplica: la única forma de sacarlo es el estado, y con gestiones la FK `gestion_orden_mensajero_id_fkey`
es `RESTRICT`. El CASCADE no se cambia: cambiarlo sería una migración sin un caso que la pida. R26 deja el
comportamiento atado en Postgres. `dependenciasPorCuenta` no se toca.

## 7. Pantalla

### 7.1 Lecturas

`CargarPantallaResult` (`status: "ok"`) gana:

```ts
mensajeros: MensajeroDePantalla[];        // { id; nombre; elegible: boolean }
valoresMensajero: TarifaValorDTO[];       // todos los de nivel mensajero
```

`TarifasPantallaRepository`:

```ts
async listarMensajeros() {
  const filas = await this.prisma.usuario.findMany({
    where: { OR: [{ rol: { value: "mensajero" } }, { tarifaValoresComoMensajero: { some: {} } }] },
    select: { id: true, nombre: true, primerApellido: true, estado: true, rol: { select: { value: true } } },
    orderBy: [{ nombre: "asc" }, { primerApellido: "asc" }],
  });
  // elegible = rol mensajero Y estado fuera de ESTADOS_USUARIO_NO_ASIGNABLES (la misma regla de §3.3)
}
async valoresDeMensajeros() { /* where: { mensajeroId: { not: null } }, SELECT_VALOR_DTO */ }
```

Dos consultas fijas por carga, sin N+1. El archivo ya está en la lista de `tarifa-valor-lectores.guardia`. El
`OR` hace que un retirado siga visible: si no, su valor pagaría sin poder verse ni quitarse.

### 7.2 Componentes (`app/(app)/configuracion/tarifas/_components/`)

- **`TarifasMensajeros.tsx`.** Sección debajo de `TarifasTiendas`, con su misma estructura: encabezado con nota y
  acción «Añadir mensajero», `DataTable` y `Modal` de quitar. Columnas: Mensajero (con `Badge` «Inactivo» en R32), una
  por `conceptosDeActor("mensajero")` y Acciones. Un resultado nuevo del catálogo gana su columna sin tocar esto.
- **`filasDeMensajeros(valores, mensajeros)`**, pura y exportada como `filasDePrecios`. Sin nombre conocido, el
  «Cuenta retirada» que ya existe (`TEXTOS.tiendaDesconocida`).
- **`TarifaMensajeroDialogo.tsx`.** `Modal` con `Select` de elegibles sin valor al añadir, o el nombre fijo al editar, y
  `Table` de 5 filas: Concepto, Modo y Valor. Sin IVA ni «Hoy rige». Usa `celdaDeGuardado`, `planDeGuardado`,
  `erroresDeResultado` y `enviar` por `guardarValoresTarifa`; los toasts son los de `TarifasValores` (R34). Cerrar con
  cambios los descarta, como un formulario de un solo paso: son 5 campos.
- **`tarifas-borrador.ts`.** `ColumnasDelNivel` gana `mensajeroId?: string | null`; `planDeGuardado` añade la clave solo
  si viene. Los payloads por zona no cambian y sus tests siguen valiendo.
- **`TarifasModule.tsx`.** Pinta la sección tras `TarifasTiendas`. Como las tiendas, no sale sin zonas: esa rama enseña a
  crearlas, y sin zona un mensajero no puede cerrar (§4.4).
- **`tests/unit/descarga/censo-tablas.ts`.** La tabla nueva entra como `fuera`, con la misma nota de configuración que
  las tiendas: la guardia obliga a decidirlo.

### 7.3 `/design`

`docs/perfil-agentes.md` lo exige a **una pantalla NUEVA**. Esto es una sección de una pantalla existente, calcada de
`TarifasTiendas` y con los mismos tokens. **No pasa por `/design`.** Como la maqueta de SLT-54 no la dibuja, queda como
puerta humana en `tasks.md`: al aprobar el spec, el humano confirma o pide maqueta.

### 7.4 Textos

Van a `tarifas-textos.ts`: «Mensajeros con valor propio», «Gana sobre el grupo y la zona, en cualquier zona donde
trabaje. Lo que no digites usa el valor de la zona.», «En % se calcula sobre el flete sin IVA que se le cobra a la
tienda por esa gestión.». El E2E los escribe a mano: son contrato, y compararlos con su fuente siempre daría verde.

## 8. Contrato de la action, sin cambios de forma

```ts
guardarValoresTarifa({ cambios: [
  { accion: "fijar", clave: "mensajero_entregado:todos",
    datos: { concepto: "mensajero_entregado", modo: "monto", valor: "2900", zonaId: null, grupoId: null, tiendaId: null, vehiculoId: null, mensajeroId: "<id>" } },
  { accion: "quitar", clave: "mensajero_novedad:todos", id: "<valorId>" },
]});
```

Sin clave `ivaPct`. La empresa sale de la sesión. Integraciones externas: ninguna. **Dependencias nuevas: ninguna**, y
ninguna fila en `docs/dependencias.md`.

## 9. Alternativas descartadas

1. **Un nivel más en el selector del panel de valores, como «Tienda con precio propio…».** Reutilizaría `TarifasValores`
   entero. Pero el panel es de UNA zona: su título, su `key`, su `cargarZona` y su columna «Hoy rige» dirían que el valor
   es de esa zona, justo lo contrario de «en cualquier zona donde trabaje». Además forzaría a esconder dos pestañas y el
   interruptor por vehículo, y la decisión cerrada pide una sección.
2. **Un trigger de base que exija rol `mensajero`.** Daría la garantía también con SQL a mano. Pero es migración y un rol
   puede cambiar después de fijar, así que tampoco garantizaría «es mensajero» en el tiempo. La regla vive igual que la
   de la tienda y se prueba en Postgres.
3. **Pasar la FK a `RESTRICT` o `SET NULL`.** Ningún camino de la app borra un mensajero, y `SET NULL` violaría el CHECK de
   nivel. Sería una migración sin un caso que la pida.
4. **Borrar el valor propio al dar de baja.** La lista quedaría más limpia. Pero una reactivación perdería el pacto en
   silencio y las gestiones pendientes del corte cobrarían otro importe. Es el motivo de SLT-54 R53.
5. **Enseñar en «Hoy rige» lo que paga su zona hoy.** Sería una segunda lectura de un dato de otra pantalla, y dependería
   de la zona del mensajero en ese instante. El modelo viejo no tiene valor por mensajero: decir nada es lo correcto.

## 10. Riesgos y consecuencias

- **Un mensajero sin zona con valor propio no cobra hasta tener zona** (§4.4): no hay cierre. Es lo de hoy, y `solicitar`
  lo dice con su mensaje. La sección no lo avisa, para no ampliar la ficha.
- **Un valor propio en porcentaje paga 0 si la tienda no tiene flete para ese resultado** (R18). Es SLT-52 R28, pero es
  aquí donde se digitará: la nota de la sección dice la base.
- **El valor propio gana también si es menor:** un 0 escrito paga 0 (R15). Decidido en SLT-52 R23; `R28` lo dice en
  pantalla.
- **El hueco de §«Hallazgo»** queda cerrado solo con los tests de R6: si alguien vuelve a quitar la clave de `nivelSchema`, un
  valor propio caería a la zona. Tiene mutación propia en `tasks.md`.
- **`congeladoDelCierre`** en el fixture E2E gana `nivel` en `pagosCongelados`. Es aditivo: `tarifas-activacion` solo compara
  el resultado contra sí mismo y contra campos concretos.
