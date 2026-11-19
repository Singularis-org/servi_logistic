# SLT-96 «Consolidación de ₡0 no se puede marcar recibida» · design (HOTFIX)

Rama `feature/SLT-96-consolidacion-cero-recibida` desde `origin/prod`. Arreglo mínimo: dos validaciones
(borde y repositorio) y el diálogo. Sin migración, sin dependencias, sin pantalla nueva.

## Lo que ya existe

Buscado: «monto_recibido», «marcarConsolidacionRecibida», «recibido 0 / ₡0 / cero», «montoPositivoSchema»,
«esMontoCero», en `feature_list.json` (todas las fichas), `specs/` y el código. El grafo no tiene indexado
este worktree (`list_projects` solo trae el repo principal en `dev`), así que el código se leyó con
Grep/Read sobre el worktree, que es el código de `prod`.

- **Board:** ninguna ficha previa trata el 0 en la conciliación. SLT-96 «Consolidación de ₡0 no se puede
  marcar recibida» todavía no está en `feature_list.json` (la última es SLT-95): se tomó el alcance de
  `progress/features/SLT-96.md`.
- **Specs que lo decidieron al revés, y que esta ficha corrige en parte (decisión de Carlos del 2026-11-09):**
  - `specs/431-cierres-satelite-autonomos/design.md` §4.3: «se usa `montoPositivoSchema` tal cual (> 0)…
    marcar "recibí ₡0" no es una marca, es no marcar. Si el humano quiere admitir `0`, se cambia la pieza
    compartida». El humano decidió admitirlo **solo con lo declarado en 0** y **sin** cambiar la pieza
    compartida. Eso no se puede expresar en `montoPositivoSchema`, que no conoce lo declarado: ver §2.
  - `specs/473-corregir-recepcion-satelite/requirements.md` R11: corregir con monto ≤ 0 → `validation_error`.
    Sigue valiendo salvo con lo declarado en 0.
  - `specs/SLT-73-dinero-satelite-al-conciliar/`: la diferencia y los asientos. No cambian (§4).
- **Código que se reutiliza, sin copiarlo:**
  - `esperadoDe` (`lib/utils/conciliacion-satelite.ts:61`): lo declarado desde el snapshot. Es la misma
    cifra que el diálogo pinta como «Declarado» (`paraLaCentral`, que montan
    `app/(app)/wallet/satelites/_components/ConciliacionSatelite.tsx:316` y
    `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx:950`).
  - `montoPositivoSchema` (`lib/types/wallet.ts:674`): sigue siendo la forma del monto mayor que 0.
  - `esMontoCero` (`app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx:606`): el lector textual
    del cero que ya usan cuatro archivos. Se **promueve** a `components/shared/monto-cliente.ts` y
    `cierre-detalle-shared.tsx` lo re-exporta (mismo camino que siguió `montoValido` en la 172).
  - El `CHECK "cierre_bodega_monto_recibido_no_negativo"`
    (`db/migrations/20260919120100_cierre_bodega_conciliacion/migration.sql:106-107`) ya admite 0.

## 1. Causa

| Capa | Dónde | Qué rechaza el 0 |
|---|---|---|
| Pantalla | `components/shared/conciliacion/MarcarRecibidoDialog.tsx:163` → `montoValido` (`components/shared/monto-cliente.ts:63`) | `!/[1-9]/.test(limpio)` → botón deshabilitado |
| Borde | `marcarConsolidacionRecibidaSchema` (`lib/types/conciliacion-satelites.ts:289-295`), usado por `marcarConsolidacionRecibidaAction` y `corregirConsolidacionRecibidaAction` (`lib/actions/conciliacion-satelites.ts:190,210`) | `montoPositivoSchema`: `Decimal(v).gt(0)` |
| Base | — | Nada: `monto_recibido >= 0` |

Con lo declarado en 0 el diálogo precarga `"0.00"` (`partida = montoActual ?? declarado`) y el botón nace
apagado: no hay forma de marcarla.

## 2. La regla en el servidor

Dos piezas, porque el borde no conoce lo declarado y el repositorio sí:

### 2.1 Borde: la forma admite el 0

`lib/types/conciliacion-satelites.ts`:

```ts
/** SLT-96: el 0 exacto con hasta 2 decimales ("0", "0.0", "0.00"). Sin signo. */
const montoCeroSchema = z.string().trim().regex(/^0+(\.0{1,2})?$/);

export const MENSAJE_MONTO_RECIBIDO_FORMA =
  "El monto debe ser 0 o mayor, con hasta 2 decimales.";

/** SLT-96: el monto de marcar y corregir. El 0 pasa el borde; si vale, lo decide el repositorio. */
const montoRecibidoSchema = z.union([montoPositivoSchema, montoCeroSchema], {
  error: MENSAJE_MONTO_RECIBIDO_FORMA,
});
```

`marcarConsolidacionRecibidaSchema.montoRecibido` pasa a `montoRecibidoSchema`. El objeto sigue `.strict()`
(R5): no hay forma de mandar el declarado. `montoPositivoSchema` no se toca (R8). El comentario de la 431
que dice «el 0 se rechaza a propósito» se reescribe con la decisión nueva.

Si el `{ error }` de la unión no llega a `fieldErrors.montoRecibido` con la versión de zod del repo, el
implementer lo comprueba con el test de R6 y usa la forma equivalente de esa versión. El texto es el contrato.

### 2.2 Repositorio: el 0 solo con lo declarado en 0

`lib/repositories/CierresBodegaAdminRepository.ts`, helper privado del módulo:

```ts
/** SLT-96: ¿lo declarado de esta consolidación es 0? `null` si no existe. Lee el SNAPSHOT. */
async function declaradoEsCero(tx: TxMarca, id: string): Promise<boolean | null> {
  const s = await tx.cierreBodega.findUnique({
    where: { id },
    select: { totalGeneral: true, totalPagoMensajero: true, totalIngresoBodegaRechazos: true },
  });
  return s === null ? null : esperadoDe(s).isZero();
}
```

- En `marcarConciliado`, **dentro de la transacción y antes del `updateMany`**:
  `if (monto.isZero()) { const c = await declaradoEsCero(tx, id); if (c === null) return null; if (!c) return "monto_cero_no_permitido"; }`.
  `null` cae en el conteo de existencia de siempre → `fuera_de_alcance` (R9).
- En `corregirConciliacion`, lo mismo, tras leer `previo` (que ya corta en `null`) y antes del `updateMany`.
- **Solo se lee cuando el monto es 0.** Con monto > 0 las consultas son las de hoy, así que los dobles de
  `tests/unit/repositories/cierres-bodega-admin-marca.test.ts` no cambian y el camino de siempre queda intacto.
- Los snapshots de `cierre_bodega` no se actualizan nunca después de consolidar (los únicos `updateMany`
  de la tabla tocan estado y marca), así que leerlos en la misma transacción no deja carrera.
- Multi-empresa: la lectura es del mismo modelo y por la misma vía que el resto del método (cliente con la
  extensión de empresa y RLS). Sin tablas ni columnas nuevas.

Contrato (`lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`):

```ts
/** SLT-96: marcar y corregir tienen un desenlace más. Revertir no lo devuelve nunca. */
export type MarcaConMontoResult = MarcaConciliacionResult | "monto_cero_no_permitido";
marcarConciliado(input): Promise<MarcaConMontoResult>;
corregirConciliacion(input): Promise<MarcaConMontoResult>;
```

`MarcaConciliacionResult` y `RevertirConciliacionResult` no cambian. Los comentarios «ya validado en el
borde (> 0)» de `MarcarConciliadoInput` y `CorregirConciliacionInput` pasan a «≥ 0; el 0 lo filtra el repositorio».

### 2.3 Servicio

`lib/services/ConciliacionSatelitesService.ts`, en `marcarRecibida` y `corregirRecibida`:

```ts
if (res === "monto_cero_no_permitido") {
  return { status: "validation_error", fieldErrors: { montoRecibido: [MENSAJE_MONTO_CERO_CON_DECLARADO] } };
}
```

`MENSAJE_MONTO_CERO_CON_DECLARADO = "Solo se puede registrar 0 cuando lo declarado es 0."` vive en
`lib/types/conciliacion-satelites.ts`, junto a `MENSAJE_REVERTIR_CON_ASIENTOS`. No lleva símbolo de moneda:
la moneda depende del país y aquí no hace falta.

Tipo (`lib/interfaces/services/IConciliacionSatelitesService.ts`):

```ts
export type MarcaConMontoServiceResult =
  | MarcaConciliacionServiceResult
  | { status: "validation_error"; fieldErrors: Record<string, string[]> };
```

para `marcarRecibida` y `corregirRecibida`. `MarcaConciliacionServiceResult` no cambia, así que
`RevertirConciliacionServiceResult` tampoco. `MarcaConciliacionActionResult` ya trae `validation_error`:
la acción y la pantalla no necesitan un caso nuevo. El rol se sigue comprobando primero (`esAccesoTotal`).

### 2.4 La acción

`lib/actions/conciliacion-satelites.ts`: solo los comentarios de `marcarConsolidacionRecibidaAction` y
`corregirConsolidacionRecibidaAction` («monto > 0» → «monto ≥ 0; el 0 solo con lo declarado en 0»).

## 3. La pantalla

`components/shared/monto-cliente.ts`:

- recibe `esMontoCero` (movido, no copiado, con su regex `/^-?0(\.0+)?$/`); `cierre-detalle-shared.tsx` lo
  re-exporta para no tocar a sus cuatro lectores;
- añade `montoValidoOCero(monto)`: forma de `montoValido` (`/^\d+(\.\d{1,2})?$/`) sin exigir un dígito
  distinto de 0. Money-safe: texto, sin `Number`.

`components/shared/conciliacion/MarcarRecibidoDialog.tsx`:

```ts
const declaradoCero = esMontoCero(declarado);
const montoOk = declaradoCero ? montoValidoOCero(monto) : montoValido(monto);
```

y el aviso del campo elige `MARCAR_RECIBIDO_ERROR.montoConCero` cuando `declaradoCero` (R13).
`components/shared/conciliacion/conciliacion-labels.ts` suma ese texto. El resto del diálogo no cambia:
el `validation_error` del servidor ya se pinta bajo el campo y deja el diálogo abierto (R12).

Lo declarado llega del servidor como `paraLaCentral.toFixed(2)`, la misma cifra que lee el repositorio.
Si el cliente se equivocara al leerlo, el servidor sigue decidiendo: la pantalla solo habilita el botón.

Las dos pantallas que montan el diálogo (`/wallet/satelites` y la cola de `/cierres-admin`) heredan el
arreglo sin tocarse. «Marcar recibido» se ofrece por estado (`ConciliacionAcciones`), no por importe.

## 4. Qué pasa con el dinero (SLT-73), con declarado 0 y recibido 0

Leído en `CierresBodegaAdminRepository.ts:628-699` y `:82-132`:

1. **`asentarCierreDia` por cada cierre del día aprobado de la consolidación:** no depende del monto
   recibido. Es lo mismo que hoy hace cualquier marca. Sus feeds omiten los conceptos en 0
   (`WalletFeedService.ts:95`, `WalletTiendaFeedService.ts:168`, `WalletMensajeroFeedService.ts:49,62,79`).
2. **`asentarDiferenciaSatelite`:** `delta = esperado − recibido − yaAsentado = 0 − 0 − 0 = 0` →
   `if (delta.isZero()) return`. **Ninguna fila de ajuste ni movimiento** (R7). Si antes se marcó con un
   monto > 0 y luego se corrige a 0, `delta` deshace exactamente lo asentado: es la secuencia de
   `slt73-corregir-diferencia.int.test.ts`, sin código nuevo.
3. **División por cero:** las únicas divisiones del dinero (`caja-tesoreria.ts:368,376`) dividen por el
   total en caja, no por lo declarado ni lo recibido. Esta ficha no escribe movimientos con declarado 0,
   así que no les llega nada nuevo.
4. **Saldo «Falta por recibir»:** `saldoDe(0, 0) = 0`, así que la consolidación se lee «Recibido» y no
   ofrece «Corregir» (`estadoConciliacionDe`). «Corregir» a 0 solo aparece si alguien marcó antes un monto
   > 0 que dejó faltante, lo que con declarado 0 no pasa. El servidor lo admite igual (R3), por coherencia
   con la decisión y para no depender de la pantalla.
5. **Historial:** `historial_accion.monto` es `DECIMAL(12,2)` nulable sin `CHECK` de signo; `monto = 0` es válido.

## 5. Alternativas descartadas

1. **Relajar `montoPositivoSchema` a `>= 0`.** Era lo que proponía la 431 si el humano quería el 0. Se
   descarta: Carlos lo prohibió y aceptaría el 0 en la wallet, en los pagos de gestión y en otros bordes
   que hoy lo rechazan a propósito. Además no resuelve la condición, porque el schema no conoce lo declarado.
2. **Que el cliente mande lo declarado (o un `declaradoCero`) y validarlo en el borde con `superRefine`.**
   Se descarta: el cliente decidiría una regla de dinero. Es lo que la decisión prohíbe y lo que R5 prueba.
3. **Aceptar siempre el 0 y que la diferencia de SLT-73 lo registre como faltante.** Se descarta: con lo
   declarado > 0, un 0 por error de tecleo asentaría un egreso por todo lo declarado. Carlos pidió
   mantener el > 0 en ese caso.
4. **Validar en el servicio leyendo lo declarado con `ISaldosSatelitesRepository` antes de escribir.** Se
   descarta: sería una lectura fuera de la transacción de la escritura y un segundo lector del snapshot. En
   el repositorio va dentro de la misma transacción, junto a `asentarDiferenciaSatelite`, que ya lee esos campos.
5. **Un indicador `declaradoCero` en el DTO de la consolidación.** Se descarta: cambia el contrato de dos
   listados y sus descargas para algo que el diálogo ya puede leer del `declarado` que recibe.

## 6. Datos que dependen del país

Ninguno nuevo. Los textos no llevan símbolo de moneda; el diálogo sigue pintando el declarado con `money()`.

## 7. Divergencia `prod` / `dev`

El hotfix nace de `prod`. Antes del PR, `git diff origin/prod origin/dev` sobre los «Archivos esperados»
(T5). `dev` tiene SLT-91 «Mi plan solo para el maestro» y otros cambios posteriores; si alguno toca estos
archivos, se anota y se resuelve al sincronizar `prod` → `dev`.
