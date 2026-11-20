# SLT-235 — Moneda e impuesto del país en las pantallas de la empresa · design

> Alcance, «Lo que NO entra» y las decisiones cerradas están en `requirements.md`; aquí solo va el
> cómo. Las referencias `R<n>` son las de `requirements.md`. Rebanada 1 de 8 (SLT-240 a SLT-246 son
> las demás).

## Lo que ya existe

Busqué el 2026-11-20 con `moneda`, `monedaConfig`, `MONEDA_PLATAFORMA`, `IMPUESTO_ROTULO`,
`formatMonto`, `money(`, `Provider`, `deLaEmpresa` y `memo`, en tres sitios:
- `feature_list.json`, en todos los estados;
- `specs/`;
- el código.

**El grafo (`codebase-memory-mcp`) no tiene indexado este worktree** (`index_status`: «project not
found»), así que la búsqueda en el código se hizo con Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| SL-21 «Moneda e impuestos configurables por país» (`in_progress`, esta rama va apilada encima) | `specs/SL-21-moneda-impuestos-configurables/` | Se **reutiliza**: `FormatoMoneda`, `formatearMontoEn`, `MONEDA_PLATAFORMA` (`lib/config/moneda.ts`), `PaisDTO.moneda` / `impuestoNombre`, el cuarto argumento `moneda?` de `resolverValoresPlantilla` y la fábrica `MONEDA_DE_PRUEBA`. El puerto `IReglasPaisEmpresa.moneda()` **no** se usa: es para servicios, lanza `PaisSinMoneda` y no tiene caché a propósito (SLT-42 R30). |
| SL-20 «Geografía configurable por país» (`done`) | `providers/EtiquetasGeograficasProvider.tsx`, `hooks/use-etiquetas-geograficas.ts`, `app/(app)/layout.tsx > etiquetasDelActor`, `PaisService.etiquetasDeEmpresa` | Es el patrón: lectura en el layout, proveedor de contexto y hook con valor por defecto sin proveedor, y caída con `console.error`. La lectura de las etiquetas **se funde** con la de la moneda (una consulta y un memo para las dos). |
| Memo por proceso de SL-17 | `lib/auth/empresa-de-la-peticion.ts` | Es el patrón del memo (decisión cerrada): `Map` de módulo, caducidad, barrido por encima de 1 000 entradas y no se memoriza lo que no se pudo resolver. Se copia la forma, no el código: ese memo es de `sessionId` y este de `organizacionId → PaisDTO`. |
| Guardia 359 y censo de pantallas de dinero | `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts`, `tests/components/DineroIdentidadesEnPantalla.test.tsx` | No se tocan. `PriceLabel` sin proveedor da el mismo texto que hoy (R15), y los archivos censados siguen nombrando su formateador (`montoExacto` reexportado, `formatMonto` local). |
| `pais-sin-literales` y su lista de excepciones | `tests/unit/guards/_pais-sin-literales-excepciones.ts` | SL-21 T5.1 le añade las entradas `SLT-235`. Esta ficha retira la de `app/paquete/[numGuia]/page.tsx` y pasa las demás a su rebanada (R19). |
| SLT-237, SLT-240 a SLT-246 | `feature_list.json` | Fichas del corte. Esta deja el proveedor y el hook que usarán todas. |

No apareció ninguna ficha ni código que ya resuelva esto.

## 1. Resumen

1. `PaisRepository.deLaEmpresa` pasa a una sola consulta (R6).
2. `lib/services/pais-para-pantallas.ts`: memo por proceso `organizacionId → PaisDTO` de 10 min y el
   armado de los datos del país para pantallas, con sus caídas (R2–R5, R7–R10).
3. `PaisService.etiquetasDeEmpresa` se sustituye por `paraPantallas`, que pasa por el memo y devuelve
   etiquetas, moneda e impuesto de una vez.
4. El layout lo lee una vez y lo baja por `MonedaDelPaisProvider`. Los hooks `useMonedaDelPais` y
   `useImpuestoDelPais` lo leen, y sin proveedor dan los de la plataforma (R1, R15, R17).
5. Las pantallas de esta ficha pasan la moneda a `formatearMontoEn` (R11–R14).
6. Una guardia por censo impide que vuelvan a llamar a los formateadores implícitos (R18).

## 2. Modelo de datos

No hay tabla, columna, migración ni política nueva. `pais` es de plataforma y la empresa la lee por
`pais_lectura` (SL-20). Las columnas de moneda e impuesto son de SL-21.

**Datos que dependen del país y de dónde salen:**

| Dato | Fuente | Quién lo lee en esta ficha |
|---|---|---|
| Moneda | `pais.moneda_*` → `PaisDTO.moneda` | Layout → `MonedaDelPaisProvider` → `useMonedaDelPais`; `/paquete/[numGuia]` en el servidor |
| Nombre del impuesto | `pais.impuesto_nombre` → `PaisDTO.impuestoNombre` | Layout → proveedor → `useImpuestoDelPais` (lo consumen SLT-241 y SLT-243 a SLT-246) |
| Etiquetas de nivel | `pais.nivel*` (SL-20) | Las de siempre, ahora desde la misma lectura |
| Caída | `MONEDA_PLATAFORMA`, `IMPUESTO_ROTULO`, `ETIQUETAS_NEUTRAS` | `pais-para-pantallas.ts` y los hooks sin proveedor |
| Locale de conteos no monetarios | `monedaConfig.locale` | Sin cambio (fechas y locale: SLT-92) |

## 3. Lectura del país en una consulta (R6)

```ts
async deLaEmpresa(organizacionId: string): Promise<PaisDTO | null> {
  const fila = await this.prisma.pais.findFirst({
    where: { organizaciones: { some: { id: organizacionId } } },
    select: SELECT_PAIS,
  });
  return fila === null ? null : paisDeFila(fila);
}
```

- Postgres lo resuelve como semi-join (`EXISTS`): una sola sentencia, sin `relationJoins` ni
  `$queryRaw` (decisión cerrada).
- **Mismo resultado que hoy para todos sus llamantes** (`ReglasPaisEmpresaService`,
  `zonaDeOrganizacionCon`, el layout). Con `servi_app`, la RLS de `organizacion` solo deja ver la
  propia: el id de otra empresa no casa y devuelve `null`, como hoy. En `comoPlataforma` ve todas,
  como hoy.
- Se prueba contra Postgres con `crearPrismaDeTestConEspia` (`tests/integration/db/_postgres-real.ts`):
  1 sentencia, y la misma respuesta para CR, para `XA` y para la empresa de otro contexto.

## 4. Memo y datos para pantallas: `lib/services/pais-para-pantallas.ts`

Módulo de servidor. Ningún componente cliente lo importa.

```ts
export const MEMO_PAIS_MS = 10 * 60_000;   // decisión cerrada
export const MEMO_PAIS_BARRIDO = 1_000;    // como SL-17

export class MemoPaisEmpresa {
  constructor(private readonly ahora: () => number = Date.now) {}
  /** `recienLeido` = salió de la base en esta llamada. Lanza si `leer` lanza o da null; no memoriza. */
  leer(organizacionId: string, leer: () => Promise<PaisDTO | null>): Promise<{ pais: PaisDTO; recienLeido: boolean }>;
}
/** El de producción: uno por proceso. */
export const memoPaisEmpresa: MemoPaisEmpresa;

/** R3, R4, R10: arma los datos; si falta moneda o impuesto, cae y avisa solo si `recienLeido`. */
export function paraPantallasDe(pais: PaisDTO, recienLeido: boolean, organizacionId: string): PaisParaPantallas;

/** R2: sin empresa. */
export const PARA_PANTALLAS_DE_PLATAFORMA: PaisParaPantallas;
  // { etiquetas: ETIQUETAS_NEUTRAS, moneda: MONEDA_PLATAFORMA, impuestoNombre: IMPUESTO_ROTULO }

/** R2, R5: lo que llaman el layout y /paquete. Sin empresa, sin consulta; si falla, cae y lo registra. */
export async function paisParaPantallasDelActor(
  organizacionId: string | null,
  servicio: Pick<IPaisService, "paraPantallas">,
): Promise<PaisParaPantallas>;
```

- **Memo (R7–R9):**
  - La clave es el `organizacionId` que resolvió la sesión en el servidor, nunca un dato de la
    petición. Dos empresas son dos claves: no hay forma de que una reciba el país de otra (R8).
  - Una entrada caduca a los 10 min de leída y se borra al leerla caducada.
  - Al escribir con 1 000 entradas o más, se barren antes las caducadas (R9).
  - Si `leer` lanza o devuelve `null`, no se escribe nada y el error sube (R8).
  - Sin promesas en vuelo compartidas: dos páginas a la vez para una empresa sin memo hacen dos
    lecturas. Es una consulta por clave, y compartir la promesa añadiría un estado más que probar.
- **Caídas (R3–R5, R10):**
  - Falta la moneda: `MONEDA_PLATAFORMA` y `console.warn("[país] la empresa <org> (país <id>) no tiene moneda; las pantallas usan la de la plataforma")`.
  - Falta el impuesto: lo mismo con `IMPUESTO_ROTULO`.
  - El aviso solo sale con `recienLeido`, o sea una vez por lectura de la base (cada 10 min como
    mucho, por empresa e instancia), no en cada página (R10).
  - Si la lectura falla (`paraPantallas` lanza): `console.error` y `{ ETIQUETAS_NEUTRAS,
    MONEDA_PLATAFORMA, IMPUESTO_ROTULO }`. Es el criterio de `etiquetasDelActor` de SL-20, que
    desaparece del layout.
- **Coste aceptado (decisión cerrada):** un cambio de moneda, de impuesto o de nombres de nivel tarda
  hasta 10 min en verse por instancia. Afecta también a las etiquetas de SL-20, que hoy se leen en
  cada página.
- **El memo no entra en el puerto.** `ReglasPaisEmpresaService` sigue leyendo sin caché (SLT-42 R30):
  lo que arma el servidor (WhatsApp, PDF) ve el cambio al momento.

## 5. Servicio (R1)

`lib/interfaces/services/IPaisService.ts`:

```ts
export interface PaisParaPantallas {
  etiquetas: EtiquetasGeograficas;
  moneda: FormatoMoneda;
  impuestoNombre: string;
}
// sustituye a etiquetasDeEmpresa(organizacionId): Promise<EtiquetasGeograficas>
paraPantallas(organizacionId: string): Promise<PaisParaPantallas>;
```

`PaisService` recibe el memo como segundo argumento opcional del constructor (`memoPaisEmpresa` por
defecto; los tests pasan uno con reloj falso):

```ts
async paraPantallas(organizacionId: string): Promise<PaisParaPantallas> {
  const { pais, recienLeido } = await this.memo.leer(organizacionId, () => this.repo.deLaEmpresa(organizacionId));
  return paraPantallasDe(pais, recienLeido, organizacionId);
}
```

`etiquetasDeEmpresa` se borra: su único llamante de producción era el layout. Sin empresa
(`deLaEmpresa` → `null`) lanza, como hoy.

## 6. Layout, proveedor y hooks (R1, R2, R15, R17)

- **`app/(app)/layout.tsx`:** la cuarta lectura del `Promise.all` pasa a ser
  `paisParaPantallasDelActor(actor.organizacionId ?? null, construirPaisService())`. La rama del
  superadmin pone `PARA_PANTALLAS_DE_PLATAFORMA` sin promesa (R2). `etiquetasDelActor` se borra.

```tsx
<EtiquetasGeograficasProvider etiquetas={pais.etiquetas}>
  <MonedaDelPaisProvider moneda={pais.moneda} impuestoNombre={pais.impuestoNombre}>
    {children}
  </MonedaDelPaisProvider>
</EtiquetasGeograficasProvider>
```

- **`providers/MonedaDelPaisProvider.tsx`** (`"use client"`): un contexto con `{ moneda: FormatoMoneda;
  impuestoNombre: string } | null`. `FormatoMoneda` es un objeto plano y cruza del servidor al cliente
  sin más.
- **`hooks/use-moneda-del-pais.ts`:**
  - `useMonedaDelPais(): FormatoMoneda`;
  - `useImpuestoDelPais(): string`.
  - Sin proveedor devuelven `MONEDA_PLATAFORMA` e `IMPUESTO_ROTULO` y no lanzan (R15). Es la caída que
    decidió el humano, y es lo que mantiene verdes los cientos de tests de componentes que montan
    pantallas sueltas y esperan «₡».
- **Sin `localStorage`, sin acción de lectura por pantalla** (decisión cerrada): la moneda está en el
  HTML desde el primer pintado. La guardia de R18 lo comprueba en los archivos del censo (no importan
  `@/lib/actions/` para leer el país ni tocan `localStorage`).

## 7. Pantallas (R11–R14, R16)

Cada una lee `useMonedaDelPais()` (o la recibe del servidor, en `/paquete`) y llama a
`formatearMontoEn(moneda, valor, sinMonto)` con el mismo marcador de «sin monto» que usa hoy. Para CR,
`MONEDA_CR` = `MONEDA_PLATAFORMA` (SL-21 R9), así que el texto es idéntico (R16).

| Archivo | Cambio |
|---|---|
| `components/shared/PriceLabel.tsx` | Pasa a `"use client"` y usa el hook. Sus consumidores de otras rebanadas heredan la moneda del país sin tocarlos. Con CR no cambia nada. |
| `components/shared/KpiValorAnimado.tsx` | En modo moneda: `formatearMontoEn(moneda, n)` y `decimals = moneda.decimales` (R12). `moneda` entra en las dependencias del `useCallback`. Los conteos siguen con `Intl` y `monedaConfig.locale`. |
| `components/shared/DesglosePagoField.tsx` | El componente usa el hook. `mensajeDeCuadre(lineas, monto, moneda = MONEDA_PLATAFORMA)` gana un tercer argumento. `export { montoExacto }` se queda para `OrdenesConMontoAjustadoTabla` (SLT-240) y el censo 359. |
| `mis-asignaciones/_components/GestionarOrdenPanel.tsx` | Pasa la moneda del hook a `mensajeDeCuadre`. |
| `mis-asignaciones/_components/pos-card/pos-format.ts` | `formatMonto(monto, moneda)`: la moneda pasa a ser obligatoria. |
| `pos-card/PosAmountRow.tsx`, `PosOrderCardDetalle.tsx`, `PosOrderCardMosaico.tsx`, `chat/ChatConversacion.tsx` | Leen el hook y la pasan a `formatMonto`. |
| `mis-asignaciones/_components/AsignacionDetalle.tsx` | Su `formatMonto` local recibe la moneda del hook. |
| `mis-asignaciones/_components/KpisMensajero.tsx` | El `texto` de las tarjetas de dinero recibe la moneda (la tabla de tarjetas es de módulo y se le pasa como argumento). |
| `recepcion-satelite/_components/RecepcionDetalle.tsx`, `SateliteOrderCard.tsx` | Igual que `AsignacionDetalle`. |
| `components/shared/EnviarPlantillaWhatsappButton.tsx`, `chat/ChatConversacion.tsx` | `resolverValoresPlantilla(variables, datos, undefined, moneda)` (R13). |
| `components/shared/sinpe-preview-segmentos.ts` + `SinpeMensajePreview.tsx` | `segmentosDelMensaje(cuerpo, numero, nombre, moneda)`; el componente le pasa el hook. |
| `app/paquete/[numGuia]/page.tsx` | Está fuera del layout del portal: llama a `paisParaPantallasDelActor(actor.organizacionId ?? null, construirPaisService())` y pinta con `formatearMontoEn(pais.moneda, orden.montoCobrar)` (R14). Sale de la lista de excepciones (R19). |

- **El tercer argumento opcional de `mensajeDeCuadre`** es transitorio. Su otro llamante,
  `cierres-admin/_components/CorregirPagosDialog.tsx`, es de SLT-243 «Moneda e impuesto del país en
  pantallas: cierres del admin»; hasta entonces cuadra con la moneda de la plataforma, como el resto de
  esa pantalla. Así esta ficha no toca un archivo de otra rebanada.
- **`monto-cliente.ts` no se toca** (P1 de `requirements.md`).
- **Componentes sin `"use client"`** (`PosAmountRow`, etc.): llaman al hook porque los monta un
  componente cliente. Si el typecheck o el build señalan alguno montado desde un componente de
  servidor, se le pone `"use client"`.

## 8. Guardias (R18, R19)

- **Censo de pantallas en la moneda del país** (dentro de `tests/components/moneda-del-pais-pantallas.test.tsx`,
  `describe` propio):
  - lista explícita de los archivos de §7;
  - cada uno, sin comentarios, no llama a `money(`, `moneyTope(`, `formatMontoString(`,
    `formatMontoTope(`, ni a `formatMonto(` o `montoExacto(` importados de `@/lib/config/moneda`, ni
    lee `monedaConfig.` salvo `.locale`;
  - y no usa `localStorage` ni importa de `@/lib/actions/` para leer el país;
  - con contraprueba sobre fuentes inventadas.

  SLT-240 a SLT-246 añaden sus archivos a la lista. Un archivo de la lista que vuelve al formateador
  implícito hace fallar el test.
- **`_pais-sin-literales-excepciones.ts`** (después de que SL-21 T5.1 esté en esta rama):
  - se quita la entrada de `app/paquete/[numGuia]/page.tsx` y el tope baja en uno;
  - `FichaQueLoRetira` gana `SLT-240` a `SLT-246`, y cada entrada `SLT-235` pasa a su rebanada:
    - `etiquetas-dibujo.ts` → SLT-240;
    - `TarifaValorRepository.ts`, `tarifa-flexible.ts` y `resolver-tarifas.ts` → SLT-241;
    - `AnaliticaFinancieraService.ts` y `metrics.ts` → SLT-242;
    - `impuesto-rotulo.ts` y `wallet-rotulos.ts` → SLT-245;
    - los dos ejemplos del catálogo de variables, según P2.

## 9. Autorización y módulos

- No hay operación nueva ni ruta nueva. La lectura es la de siempre: la empresa lee su país por
  `pais_lectura` y la RLS de `organizacion`.
- La clave del memo sale de `resolveActorFromSession`, nunca de la petición.
- El superadmin no lee ningún país (R2).
- `/paquete/[numGuia]` conserva su autorización (sesión obligatoria, `obtenerEtiquetaPorGuia`).
- Todo es núcleo: no hay puerta de módulo.

## 10. Mapa R → test

| R | Test |
|---|---|
| R1 | `tests/components/AppLayout.test.tsx`: con empresa, el proveedor recibe la moneda y el impuesto de `paraPantallas("org-xa")` y las etiquetas de la misma llamada (una sola) |
| R2 | `AppLayout.test.tsx` (superadmin: `paraPantallas` no se llama, proveedor con plataforma) y `tests/unit/services/pais-para-pantallas.test.ts` (`paisParaPantallasDelActor(null)` no llama al servicio) |
| R3, R4, R10 | `pais-para-pantallas.test.ts`: país sin moneda / sin impuesto → plataforma + un `console.warn` que nombra empresa y país; segunda lectura desde el memo → sin aviso |
| R5 | `pais-para-pantallas.test.ts` (servicio que lanza → neutras + plataforma + `console.error`) y `AppLayout.test.tsx` (la página se pinta) |
| R6 | `tests/integration/db/pais-repositorio.test.ts`: con espía, `deLaEmpresa` = 1 sentencia; mismo país para CR y `XA`; `null` para la empresa de otro contexto con `servi_app` |
| R7 | `pais-para-pantallas.test.ts` con reloj falso: segunda llamada a 9:59 min sin leer; a 10:00 lee otra vez. `tests/unit/services/pais-service.test.ts`: `paraPantallas` dos veces = un `deLaEmpresa` |
| R8 | `pais-para-pantallas.test.ts`: dos empresas, cada una su país; `leer` que lanza o da `null` → no queda en memo (la siguiente vuelve a leer) |
| R9 | `pais-para-pantallas.test.ts`: con 1 000 entradas caducadas, escribir una más deja solo la nueva |
| R11, R12 | `tests/components/moneda-del-pais-pantallas.test.tsx`: con el proveedor y `MONEDA_DE_PRUEBA`, cada pantalla de §7 pinta el importe con «€», espacio de miles y 0 decimales; `KpiValorAnimado` aterriza en `formatearMontoEn(MONEDA_DE_PRUEBA, v)`; `mensajeDeCuadre` con la moneda de prueba |
| R13 | `moneda-del-pais-pantallas.test.tsx`: la vista previa de las tres superficies con `{{monto}}` = `resolverValoresPlantilla(..., MONEDA_DE_PRUEBA)` |
| R14 | `moneda-del-pais-pantallas.test.tsx`: `/paquete/[numGuia]` con una empresa de país de prueba (servicio doblado) y sin empresa (no se llama) |
| R15 | `moneda-del-pais-pantallas.test.tsx` (sin proveedor: plataforma y `IMPUESTO_ROTULO`), y la guardia 359 y `DineroIdentidadesEnPantalla` sin cambios |
| R16 | `moneda-del-pais-pantallas.test.tsx`: cada caso de R11–R14 con `MONEDA_CR` da el mismo texto que sin proveedor; y los tests existentes de esas pantallas, sin cambiar ningún valor esperado |
| R17 | `moneda-del-pais-pantallas.test.tsx`: `useImpuestoDelPais` da «IGV» con el proveedor de prueba |
| R18 | `moneda-del-pais-pantallas.test.tsx > censo` |
| R19 | `tests/unit/guards/pais-sin-literales.guardia.test.ts` (sin cambios: exige quitar la entrada que sobra y que el tope no crezca) sobre la lista nueva |
| R20 | `git diff` sin archivos de `app/(app)/plataforma/**`, `components/shared/facturas/**` ni `lib/api/openapi-spec.ts` (lo mira el reviewer), y el test de contrato de `openapi-spec` existente en verde |

## 11. Riesgos

- **Orden con SL-21 T5.1.** La lista de excepciones con las entradas `SLT-235` la escribe SL-21 en su
  bloque 5, que aún no está. T4.2 espera a que esa tarea esté en esta rama (merge de la rama de
  SL-21). Si SL-21 cambia de idea sobre sus entradas, T4.2 se ajusta a la lista real.
- **`PriceLabel` a `"use client"`.** Lo montan pantallas de todas las rebanadas. Con CR no cambia el
  texto. El riesgo es que un componente de servidor lo use en un contexto sin React (por ejemplo, un
  `renderToStaticMarkup` en el servidor): el Grep de hoy no muestra ninguno fuera de los tests.
- **10 min de retraso** en ver un cambio de país (aceptado por el humano).

## 12. Alternativas descartadas

1. **Leer la moneda con el puerto `IReglasPaisEmpresa.moneda()` en el layout.** Ya existe, pero lanza
   `PaisSinMoneda` y su lectura es aparte de la de las etiquetas: serían dos consultas por página y un
   `try` más. Además, el puerto no tiene caché a propósito (SLT-42 R30) y meterle el memo cambiaría
   lo que ven WhatsApp y los PDF. Por eso hay una lectura propia para pantallas, con memo y con caída.
2. **Un `useFormatoMoneda()` que devuelve `money` ya ligado, sin tocar las firmas.** Ahorra líneas,
   pero esconde la moneda detrás de un nombre que hoy significa «la de la plataforma». La guardia de
   R18 tendría que distinguir dos `money` con el mismo nombre. La decisión cerrada pide la moneda
   explícita.
3. **Memo con `unstable_cache` / `cache()` de Next.** `cache()` solo dura una petición, y la decisión
   pide 10 min. `unstable_cache` guarda en la caché de datos de Vercel, compartida entre instancias. Es
   más difícil de vaciar en un test y trae una API inestable para algo que un `Map` resuelve igual que
   en SL-17.
4. **`mensajeDeCuadre` con la moneda obligatoria.** Es más estricto, pero obliga a tocar
   `CorregirPagosDialog.tsx` (SLT-243) y `GestionarOrdenPanelCentimos.test.tsx`, lo que suma dos
   archivos a un PR que ya está en el 80% del tope. Queda opcional y documentado como transitorio
   hasta SLT-243, que lo vuelve obligatorio.

## Dependencias de terceros

Ninguna nueva.
