# SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» — design

> 2026-11-09. Baja a ejecutable el plan S2 del spec madre (`specs/SLT-95-detalle-cierre-rediseno/
> design.md`, `tasks.md > Plan de las demás rebanadas > S2`). Hereda de él, sin repetirlo, la
> arquitectura de los cuatro componentes, «De dónde sale cada cifra», los «Números escritos a mano»
> y las alternativas descartadas 1-6. Aquí está solo lo que S2 decide: cómo se monta el detalle en
> `/cierres-admin`, qué se sustituye, la lectura nueva del servidor (R80) y cómo se verifica.

## Lo que ya existe

**Términos buscados:**
- board (`feature_list.json`): «detalle de cierre», «quién resolvió», «resuelto_por», «descargar
  gestiones», «rechazados por la tienda»;
- `specs/`: «resueltoPorNombre», «Pasaron a Novedad interna», «Automático (por plazo vencido)»,
  «Detalle del cierre»;
- código (Grep/Read; el grafo no tiene índice de este worktree, ver la nota final):
  `CierresAdminModule`, `CierreFacturaDetalle`, `SeccionRechazosDeTienda`, `SeccionSinGestion`,
  `GestionesPorResultado`, `PagoMensajeroSeccion`, `findCierreByIdEnAlcance`,
  `CIERRE_RESUMEN_SELECT`, `resueltoPorUsuario`, `DescargarDatasetButton`,
  `vistaMensajeroDesdeAdmin`, `LineaCuenta.notas`.

**Resultado:**
- **Board:** ninguna ficha hace esto. Las rebanadas hermanas SLT-101 a SLT-115 cubren otras
  superficies (`requirements.md > Lo que NO entra`). SLT-95 «Rediseño del detalle de cierre
  (mensajero y bodega)» (S1, en `dev` desde f1eb8cc1) dejó el componente sin montar.
- **Specs:** 264 (órdenes sin gestionar), 425 (rechazos de tienda), 102 (desglose del ingreso de
  bodega por origen), 172 (pago al mensajero en el detalle), 205 (enlace `?cierre=`), 223
  (impresión), 398, 478, 481, 486 y SLT-56 (fila y diálogos). Se respetan todas: S2 reutiliza sus
  piezas y no reabre ninguna.
- **Código que se reutiliza tal cual:**
  - de S1: `DetalleCierre`, `DineroCierre`, `CifrasCierre`, `Cuenta`, `detalle-cierre-vista.ts`
    con `vistaMensajeroDesdeAdmin`, `pestanasDe` y `accionesDe`;
  - del módulo: `GestionesPorResultado` y `PagoMensajeroSeccion`;
  - los diálogos de hoy de `CierresAdminModule.tsx`: rechazo, confirmación física, indemnización,
    destrabe, corregir pagos, corregir resultado y ajuste;
  - `DescargarDatasetButton`;
  - del servidor: la relación Prisma `CierreDia.resueltoPorUsuario` (feature 38/R14), que ya existe
    con su índice `[resueltoPor]`.
- **Lo que existe y no sirve tal cual:**
  - `SeccionRechazosDeTienda`: devuelve `null` sin rechazos, lo que choca con D11, y lleva los
    conteos del comprobante. R17 pide la tabla del canvas con estado vacío, así que nace
    `RechazosDeTiendaCierre.tsx`.
  - `SeccionSinGestion` sí sirve tal cual: solo se exporta.
- **`LineaCuenta.notas`** (S1) ya admite notas bajo una línea: R81 la usa sin tocar `Cuenta.tsx`.

## Qué cambia en `/cierres-admin`

```
CierresAdminModule.tsx (cliente)
  └─ abrirDetalle(id) → verCierreDetalle (Server Action de hoy, sin cambios de firma)
       └─ <DetalleCierre tipo="mensajero" marco="modal"
             detalle={vistaMensajeroDesdeAdmin(detalle)}
             audiencia={audiencia === "admin" ? "central" : "satelite"}
             modo={modoAdminDe(detalle.cierre.estado)}                       // R79
             pestanas={{ gestiones, rechazos, pago? }}                       // R17-R19, R21
             acciones={{ rechazar?, aprobar?, destrabar? }}                  // R12, R39, R83
             onCerrar={cerrarDetalle} />
```

- **Sustituye** el `<Modal title="Detalle del cierre">` de `CierresAdminModule.tsx:1285-1461`
  (`CascadasCierreMensajero` + `CierreFacturaDetalle` + `PagoMensajeroSeccion` + la sección
  «Decisión del cierre»). Los tres diálogos de corrección y ajuste (`CorregirPagosDialog`,
  `CorregirResultadoDialog` y `AjustarPagoMensajeroDialog`) salen de dentro del modal y pasan a
  ser hermanos del detalle, con el mismo estado y la misma relectura.
- **Nombre accesible:** el de S1 («Detalle del cierre · <título>»). Los E2E que buscan el diálogo
  por `{ name: "Detalle del cierre" }`, una subcadena, lo siguen encontrando.
- **Modo por estado (R79):** `modoAdminDe(estado)` es una función pura nueva en
  `detalle-cierre-vista.ts`:
  - `solicitado` → `"decidir"`;
  - `vencido` → `"vencido"`;
  - `aprobado` o `rechazado` → `"solo lectura"`.

  Los `ofrecer*` del módulo (`esResoluble`, `ofrecerCorreccion*`, `ofrecerAjustePago`,
  `ofrecerPagoEnDetalle`) no cambian: siguen decidiendo qué callback se pasa, y `accionesDe` (S1)
  decide qué botón se pinta.
- **Acciones del pie:**

  | Acción | Callback | Cuándo se pasa |
  |---|---|---|
  | Rechazar | el `onClick` de hoy (limpia el motivo y abre el sub-modal) | `esResoluble` |
  | Aprobar | `pedirAprobacion` de hoy (encadena la confirmación física y la indemnización). El rótulo «Revisar paquetes y aprobar» lo decide S1 con `paquetesVuelven` | `esResoluble` |
  | Destrabar | `() => setDestrabar(cierreAbierto)`. Mismo diálogo y misma `confirmarDestrabar` que la cola; al volver `ok`, además de lo de hoy (cerrar el diálogo y refrescar las listas), se llama a `abrirDetalle(id)` si el detalle sigue abierto (R83) | estado `vencido` |

  Con estado `vencido`, `accionesDe` pinta «Cerrar» y «Destrabar cierre vencido». En solo
  lectura, solo «Cerrar».
- **Pestañas:**
  - **Gestiones** = `<GestionesPorResultado>`, con las mismas props que hoy le pasa
    `CierreFacturaDetalle`:
    - `verFulfillment = audiencia === "admin"` (481);
    - los callbacks `onCorregirPagos`, `onCorregirResultado` y `onAjustarPago` con su condición
      de hoy;
    - `onVerEvidencia`.

    Debajo va `<SeccionSinGestion>` (R19), que se exporta de `cierre-factura.tsx` sin cambiar ni
    una línea. Arriba a la derecha, `<DescargarDatasetButton>` (R21, R82).
  - **Rechazados por la tienda** = `<RechazosDeTiendaCierre rechazos={detalle.rechazosDeTienda}>`
    (R17).
  - **Pago al mensajero** = `<PagoMensajeroSeccion>` con las mismas props y la misma relectura de
    hoy, solo si `ofrecerPagoEnDetalle` (R18). S1 la muestra solo si el estado es `aprobado` y el
    slot llega.
- **Impresión (R21):** el detalle nuevo no monta `HojaFactura`, así que dentro del diálogo no hay
  ninguna `.hoja-imprimible`. No se añade botón. El CSS de `@media print` se queda: lo usan
  `/cierre-dia` y la hoja compacta de la cola (`CierreFacturaResumen`), que siguen hasta SLT-108
  «/cierre-dia: detalle y cola únicos para el mensajero» y SLT-102 «Cola de cierres única:
  mensajeros (central y satélite)».
- **`@sin-superficie` (D21):** se borra la anotación de los 6 módulos de
  `components/private/cierres/detalle/` (`DetalleCierre.tsx`, `CifrasCierre.tsx`, `DineroCierre.tsx`,
  `Cuenta.tsx`, `detalle-cierre-vista.ts`, `detalle-cierre-labels.ts`). Si la guardia
  `superficie-de-uso` pide conservarla en algún export que sigue sin consumidor (por ejemplo
  `vistaBodegaDesdeAdmin`, que se usa en SLT-104 «Detalle de cierre de bodega en el detalle único
  (central)»), se deja **solo en ese export**, con motivo y ficha, y se anota en `impl_SLT-100.md`.

## Componentes nuevos

### `components/private/cierres/detalle/RechazosDeTiendaCierre.tsx` (R17)

El cuerpo de la pestaña según el canvas (`Main.dc.html`, `enRechazos`):
- la nota «No son gestiones del mensajero y no suman a su pago.» y, con rechazos, la frase de hoy
  sobre lo que pasa al aprobar (`separarParaDevolucion` / `efectoAlAprobar`, que se reusan);
- una lista (`role="list"`, nombre accesible «Lista de paquetes rechazados por la tienda», el de
  hoy) con las columnas Guía, Destinatario, Motivo (`motivoGestionLegible`), Tienda y Fecha del
  rechazo (`fechaCalendarioCR`);
- sin rechazos: la nota y el estado vacío «Este cierre no tiene paquetes rechazados por la
  tienda.» (D27), con `role="status"`.

Los textos nuevos van en `detalle-cierre-labels.ts`. Los de hoy se importan de sus labels, no se
copian. Si viven como `const` privadas de `cierre-factura.tsx`, se exportan desde ahí sin
cambiarlas.

### `components/private/cierres/detalle/detalle-cierre-descarga-columnas.ts` (R21, R82)

Módulo puro con el sufijo `-descarga-columnas.ts`, para que `columnas-sensibles.guardia` lo
descubra por convención (la guardia ya mira en `components/**`):
- `COLUMNAS_DESCARGA_DETALLE_CIERRE: DescargaColumna[]`: Nº Guía, Destinatario, Tienda,
  Resultado, Recibido, Cobro a la tienda, Pago al mensajero. Los encabezados reusan las constantes
  de las descargas de hoy donde ya existen («Nº Guía», `RESULTADO_COL`, `PAGO_MENSAJERO_COL`…).
- `filaDescargaDetalleCierre(g: CierreDetalleGestion): DescargaFila`. Cada importe es el **string
  del servidor** (`g.montoRecibido`, `g.ingresoEmpresa?.total`, `g.pagoMensajero`) o `null`, nunca
  `"0"` (R82, R71); el resultado sale con su etiqueta legible de hoy.

En el módulo:

```ts
<DescargarDatasetButton titulo={`Gestiones del cierre ${folio}`} columnas={COLUMNAS_DESCARGA_DETALLE_CIERRE}
  obtenerFilas={async () => ({ status: "ok", filas: gestiones.map(filaDescargaDetalleCierre) })} />
```

Las filas salen del detalle ya leído; no hay Server Action nueva. No lleva `ambitoColumnas`: sin
selector, salen las siete. SLT-101 «Fila de gestión única y lista con filtros» añadirá «Señales»
(D26). La forma exacta del `ok` de `DescargaFilasResult` se toma de su tipo en T0.2.

## «Dinero»: nota del origen del ingreso de bodega (R81)

- `DetalleMensajeroVista` gana un campo opcional `desgloseIngresoBodega?: { sla: string; manual:
  string } | null`, que rellena `vistaMensajeroDesdeAdmin` desde
  `detalle.desgloseIngresoBodegaRechazos`.
- Queda en `null` en el modelo nuevo, con la regla de hoy de `CierreFacturaDetalle`: se oculta si
  `modeloNuevo` o si `sla`/`manual` faltan.
- `lineasDinero` añade a la línea «− pago a la bodega» de la cuenta «De lo facturado, le queda a
  la empresa» `notas: ["Automático (por plazo vencido) ₡x · Manual ₡y"]`:
  - los rótulos son `INGRESO_BODEGA_RECHAZOS_SLA_LABEL` e `INGRESO_BODEGA_RECHAZOS_MANUAL_LABEL`,
    los de hoy;
  - los importes salen de `money()` sobre el string del servidor: es formato, no aritmética (R71).

`Cuenta.tsx` ya pinta `notas`: no se toca su lógica. El `data-signo` de la línea no cambia, así que
`DineroIdentidadesEnPantalla` sigue cerrando la cuenta.

## Servidor: quién resolvió el cierre (R80)

La única pieza de servidor. Es una lectura aditiva: no hay columna, migración, RLS, escritura ni
importe nuevos.

| Capa | Cambio |
|---|---|
| `lib/repositories/CierresAdminRepository.ts` · `findCierreByIdEnAlcance` | El `select` del `findFirst` de la cabecera pasa a `{ ...CIERRE_RESUMEN_SELECT, sinGestionRegistrado: true, resueltoPorUsuario: { select: NOMBRE_USUARIO_SELECT } }` y el resultado gana `resueltoPorNombre: string \| null` (`nombreCompletoUsuario`, o `null` sin relación). Se añade **solo aquí**, como hizo la 264 con `sinGestionRegistrado`: los cinco listados que usan `CIERRE_RESUMEN_SELECT` no lo pintan y no pagan el join. El alcance sigue en el mismo `WHERE` (R13 de la 38): fuera de alcance devuelve `null` y no se lee nada. |
| `lib/interfaces/repositories/ICierresAdminRepository.ts` | `resueltoPorNombre?: string \| null` en el tipo de retorno del detalle. |
| `lib/services/CierresAdminService.ts` · `verCierreDetalle` | Emite `resueltoPorNombre` **solo** con `cierre.estado` `aprobado` o `rechazado`; en otro caso, `null`. Sin esa regla, un `rechazado` que el mensajero vuelve a solicitar arrastraría al resolutor anterior en un `solicitado`. |
| `lib/interfaces/services/ICierresAdminService.ts` | `resueltoPorNombre?: string \| null` en la rama `ok` de `CierreDetalleAdminServiceResult`. |
| `components/private/cierres/detalle/detalle-cierre-vista.ts` | `vistaMensajeroDesdeAdmin` pasa `resueltoPorNombre: r.resueltoPorNombre ?? null`. S1 ya lo pinta (`fechaConQuien`). |

**Por qué el campo es opcional en los dos contratos:** el madre exige contratos que crecen solo
con campos aditivos. Un campo obligatorio obligaría a tocar los ~30 dobles de test que construyen
este resultado (la lista de `grep sinGestionRegistrado tests/`). Los dobles no están en este diff
y ninguno necesita el nombre. Opcional y ausente se pinta igual que `null`: sin «por …».

**Autorización:** no cambia. `verCierreDetalle` ya filtra por rol y alcance (central = todo;
adminSatelite = su zona destino) y el nombre se lee en la misma sentencia acotada.

**Test que prueba la lectura real** (memoria del proyecto «probar el WHERE donde vive»):
`tests/integration/db/cierre-resuelto-por-sql-real.test.ts`, contra la base desechable y con el
mismo arranque que `cierre-sin-gestion-sql-real.test.ts`. Siembra:
- un cierre `aprobado` con `resuelto_por` = una usuaria «Carla Resolutora»;
- un cierre `solicitado` sin resolutor;
- un cierre aprobado de otra zona.

Afirma:
1. el detalle del aprobado trae exactamente «Carla Resolutora»;
2. el `solicitado` trae `null`;
3. el de otra zona, con alcance satélite, devuelve `null` (no encontrado), sin nombre.

Se autocomprueba: falla si no sembró las tres filas, nunca `if (!x) return`. Hay que matar dos
mutaciones: quitar `resueltoPorUsuario` del `select`, y leer `mensajero` en su lugar. La regla
del estado se prueba en `tests/unit/services/cierres-admin-service.test.ts`: un `solicitado` con
resolutor en el doble debe salir `null`.

## Datos que dependen del país

- Moneda: solo con `money()`, también en la nota de R81 y en ninguna celda de la descarga (la
  descarga lleva el string crudo, como las de hoy).
- Fechas de la cabecera y de los rechazos: `fechaCalendarioCR`/`horaCostaRica`, como hoy y como
  S1. SLT-92 «Pantallas: fechas y teléfonos en la zona y el prefijo del país de la empresa» las
  generalizará; aquí no se adelanta.
- Ningún símbolo, impuesto ni método escrito a mano. Los métodos salen de `METODO_LABEL`.

## Tests y guardias que cambian

Ninguno pierde lo que vigila: si una aserción leía una región que desaparece, pasa a leer la
región nueva **con el mismo literal**.

| Archivo | Qué vigilaba | Cómo queda |
|---|---|---|
| `tests/components/CierresAdminModule.test.tsx` | Abrir, aprobar, rechazar, relectura | Mismo flujo sobre el detalle nuevo; pie «Rechazar»/«Aprobar»; sin «Decisión del cierre» |
| `CierresAdminPagoMensajero.test.tsx` | Pago solo en aprobado y con permiso | Pestaña «Pago al mensajero»; ausente para la satélite y sin permiso (R18) |
| `CierresAdminIndemnizacion.test.tsx`, `CierresAdminConfirmacionFisica.test.tsx` | Aprobar encadena diálogos | Se lanzan desde el pie («Revisar paquetes y aprobar») (R39) |
| `CierresAdminDeepLink.test.tsx` | `?cierre=` abre el detalle | Abre el detalle nuevo en su modo (R38, R79) |
| `CierreMensajeroDetalleCascadas.test.tsx`, `CierreMensajeroDesglosePorTienda.test.tsx` | Cascadas y «por tienda» en el modal | Mismos literales sobre «Dinero» del detalle nuevo |
| `CierrePremioPendiente.test.tsx`, `cierre-detalle-ajuste-badge.test.tsx`, `CorregirResultadoCierre.test.tsx` | Marcas y correcciones en la fila | Navegan a la pestaña «Gestiones» antes de leer la fila |
| `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts` | Toda superficie del comprobante pasa `ordenesSinGestion`, `sinGestionRegistrado` y `rechazosDeTienda` | El censo suma la superficie nueva: `CierresAdminModule` pasa esos tres datos a `SeccionSinGestion` y `RechazosDeTiendaCierre`. La autocomprobación sigue exigiendo que encuentre las superficies |
| `tests/unit/guards/impresion-flujo.guardia.test.ts` | El modal del admin conserva `max-h-[70vh]` | Ese caso se retira (el admin ya no imprime, D12); se añade que el módulo del admin **no** monta `CierreFacturaDetalle` ni `HojaFactura`. El resto del flujo de impresión (mensajero y hoja compacta) no cambia |
| `tests/unit/guards/factura-contraste.guardia.test.ts` | Pares de contraste con anclas en `CierresAdminModule.tsx:<línea>` | Se actualizan las anclas que se muevan. Ningún par ni suelo cambia |

E2E que leen regiones que desaparecen. Se adaptan a las regiones nuevas: cifras como `group` con
nombre (R20) y cuentas como `region` con su título. Los literales no cambian:

| E2E | Región de hoy | Región nueva |
|---|---|---|
| `cierres-admin.spec.ts`, `ajuste-pago-mensajero-cierre.spec.ts`, `wallet-iva-aparte-sl39.spec.ts` | comprobante, liquidación, IVA | cifras y cuentas de «Dinero»; fila en «Gestiones» |
| `reglas-bloqueos-cierre.spec.ts` | «Totales del cierre» | cifra «Recaudado» |
| `cierres-admin-rechazos-sla.spec.ts`, `tope-intentos-por-empresa.spec.ts` | «Ingreso de bodega por devoluciones a origen del cierre» y su desglose | línea «− pago a la bodega» y su nota (R81) |
| `cierre-modelo-nuevo-plan-porcentual.spec.ts`, `tarifas-activacion.spec.ts`, `tarifas-valor-propio-mensajero.spec.ts` | KPI «Pago al mensajero», «Total de la empresa», «Comprobante detallado del cierre» | cifra «Pago al mensajero»; «Total facturado» de la cuenta |

Los que solo abren el diálogo y pulsan «Aprobar» (`cierre-vencido-modelo.spec.ts`) no cambian,
pero se re-ejecutan.

## Verificación de lo que ve el usuario (R77)

`e2e/cierres-rediseno.spec.ts` es nuevo, en el grupo `dinero`. Se siembra con
`e2e/_escenarios/reparto.ts` y `cierres.ts`, y el modelo nuevo con `_tarifas-activacion-fixture.ts`.
Los importes van **escritos a mano** en el test, nunca calculados con la función que los produce.

**Escenario A, modelo viejo** (los «Números escritos a mano» del madre):

| Dato | Valor |
|---|---|
| Recaudado | ₡100.000,00 (Efectivo 70 000,00; SINPE 30 000,00; sin Transferencia) |
| Se le paga hoy a la tienda | 94 350,00 |
| Pago al mensajero | 3 000,00 |
| Le queda a la empresa | 3 500,00 |
| Sale de lo recaudado | 5 650,00 |
| Total facturado | 7 910,00 |
| − IVA | 910,00 |
| − pago a la bodega | 500,00 |
| Ganan en total | 92 090,00 |

T0.3 fija las entradas del escenario (montos de las órdenes, tarifa de la tienda y del mensajero,
un rechazo) que producen esas cifras. **Si el escenario no puede producir exactamente esos
números**, T0.3 escribe en `progress/impl_SLT-100.md` los literales alternativos y su derivación a
mano antes de escribir el test, y el reviewer los comprueba.

**Escenario B, modelo nuevo:** una gestión con tarifas activadas. Sus cuatro cifras se derivan a
mano en T0.3, igual que el escenario A.

Casos:
- **Central, A, solicitado:**
  - cuatro cifras con sus literales; Transferencia ausente; sin «Debe» ni «Ganancia»;
  - las dos cuentas;
  - la nota «Automático (por plazo vencido) … · Manual …» bajo «− pago a la bodega» (R81);
  - pie visible tras desplazar el panel; «Rechazados por la tienda (0)» con el texto de D27;
  - «Gestiones» con «Descargar»: el archivo bajado tiene las 7 cabeceras de R82 y una fila por
    gestión;
  - ninguna `.hoja-imprimible` en el diálogo (R21);
  - «Aprobar» pasa el cierre a `aprobado` en la base;
  - al reabrirlo: solo lectura, cabecera «Aprobado … por <nombre del admin sembrado>» (R80) y
    pestaña «Pago al mensajero».
- **Central, B:** las cuatro cifras del modelo nuevo; la nota de R81 **ausente**.
- **Satélite, A (destino satélite):** las mismas cuatro cifras al céntimo; sin pestaña «Pago al
  mensajero»; sin fulfillment en la fila desplegada; «Rechazar» con motivo.
- **Vencido:** pie «Destrabar cierre vencido» → el diálogo de hoy → el detalle se relee en modo
  decidir (R83).

**Mutaciones antes de creer el verde:**
- `netoEmpresa` → `ganancia` en `cifrasDe` pone el E2E en rojo (pedido del madre);
- quitar la nota de R81 lo pone en rojo;
- emitir el resolutor con `solicitado` pone en rojo el test de servicio.

## Alternativas descartadas

1. **Componente puente `DetalleCierreAdmin.tsx`** entre el módulo y `DetalleCierre`. Aislaría el
   cableado, pero es un archivo más, y el estado que cablea (diálogos, `ofrecer*`, `abrirDetalle`)
   vive en `CierresAdminModule` y tendría que pasar entero por props. El cableado se queda en el
   módulo, en el sitio del modal que sustituye.
2. **Reutilizar `SeccionRechazosDeTienda` para la pestaña.** Devuelve `null` sin rechazos (choca
   con D11) y trae los conteos «paga / revisar» del comprobante, que en el detalle nuevo ya están
   en la franja «Por revisar» y en el conteo de la pestaña. Cambiarla movería también el
   comprobante del mensajero de `/cierre-dia`.
3. **Llevar `resueltoPorNombre` en `CIERRE_RESUMEN_SELECT`** (cabecera de todos los listados).
   Costaría un join por fila en cinco listados que no lo pintan (el mismo motivo por el que la 264
   dejó `sinGestionRegistrado` solo en el detalle).
4. **Descargar con la hoja fundida de 31 columnas** (`DescargarGestionesDialog`). Ya existe y se
   pide al servidor, pero no son «las columnas que la audiencia ve» (R21, D26), y obligaría a
   filtrar por un solo cierre en una Server Action pensada para rangos.
5. **Partir S2 por modo (resueltos / decidir).** Lo descartó Carlos (D22).

## Dependencias de terceros

Ninguna nueva.

*Grafo:* `index_status` del proyecto
`R-job-singularis-projects-servi_logistic-.worktrees-SLT-100-detalle-unico-mensajeros` responde
«project not found». Se exploró con Grep/Read sobre el worktree.
