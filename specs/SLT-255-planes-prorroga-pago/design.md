# SLT-255 — planes-prorroga-pago · design.md

> Requisitos: `requirements.md` (R1–R23). Lo escribió `spec_author` el 2026-11-23, sobre `dev` con SLT-121
> «Planes: plazo de pago de la factura y operación congelada por mora» mergeada (#264).
>
> - **Una sola migración, la de enums**, con su `down.sql`. No hay columnas, tablas ni funciones SQL nuevas.
> - **Sin dependencias nuevas.**
> - **Enmiendas explícitas a SLT-121:**
>   - el banner y el estado `descongelada_a_mano` pasan a `con_plazo` (R11; enmienda de su R24);
>   - `descongelarAMano` y `descongelarEmpresaAction` pasan a «dar plazo»;
>   - el recordatorio de R26 se ajusta durante el plazo (R22).
> - **Tamaño:** unos 41 archivos, por encima de los 40 de `gate.tamano_pr`. El humano lo aceptó el 2026-11-23 con
>   la label `tamano-pr-aceptado` (§10).

## Lo que ya existe

Busqué el 2026-11-23 los términos `prórroga`/`prorroga`, `congel`, `mora`, `plazo`, `vencid`, `descongelada_hasta` y
`descongelarAMano` en tres sitios: el board (`feature_list.json`), `specs/` y el código. El grafo
`codebase-memory-mcp` no tiene índice de este worktree (`index_status`: «project not found»), así que usé Grep y Read.

- **En el board** solo aparece SLT-121 (done), que es la base. Ninguna otra ficha da prórrogas ni plazos.
- **En `specs/`**, nada habla de prórroga. SLT-121 R22/R23 son el descongelamiento a mano que esta ficha amplía.
- **En el código**, se reutiliza lo siguiente:

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| Columna `organizacion.descongelada_hasta` (`DATE NULL`) | `20261126120100_mora_congelamiento` | **Es el plazo** de esta ficha (§1). Se reutiliza tal cual |
| `organizacion_mora_congelar`: no congela con `descongelada_hasta >= hoy` | misma migración | Da R8 y R9 sin cambios |
| `organizacion_mora_descongelar_a_mano(p_org, p_hasta, p_ahora)` | misma migración | La llama «dar plazo» si la empresa está congelada (R2). No se toca |
| `MoraEmpresaRepository.descongelarAMano` / `fijarGracia` | `lib/repositories/MoraEmpresaRepository.ts` | `darPlazo` reemplaza al primero; `fijarGracia` sirve de molde para la escritura del dueño en TS (§3.1) |
| `MoraEmpresaService.descongelar`, `rangoDeDescongelar`, `descongelarSchema` | `lib/services/`, `lib/types/mora.ts` | Pasan a `darPlazo`, `rangoDelPlazo` y `darPlazoSchema` (§3.2) |
| `encolarAvisosDeMora`, `dedupeAvisoMora`, `mora_aviso_correo` | `lib/repositories/_shared/encolar-aviso-mora.ts`, `lib/planes/jobs-mora.ts` | Suman tres formas de payload (§4). No hay `job_tipo` nuevo |
| `crearMoraDiariaHandler` → `encolarRecordatorios` | `lib/planes/jobs-mora.ts`, repositorio | El recordatorio de la víspera del plazo entra en el mismo paso (§4.2) |
| `plantillaMoraAviso`, `MORA_AVISO_TEXTOS` | `lib/services/email/plantillas/mora-aviso.ts` | Tres contenidos nuevos y el recordatorio con plazo (§4.3) |
| `estadoDeMora`, `MORA_TEXTOS` | `lib/planes/mora.ts` | Estado `con_plazo` (§2) |
| `AvisoMora`, `MoraEmpresa` | `app/(app)/_components/`, `app/(app)/plataforma/empresas/[organizacionId]/_components/` | Banner y sección del superadmin (§5) |
| Excepción P5 de texto libre en `historial_accion` | `tests/unit/guards/historial-accion-sin-datos-cliente.guardia.test.ts` | Se extiende a los dos tipos nuevos (decisión «Motivo») |
| `e2e/mora-congelamiento.spec.ts`, `_superadmin-fixture`, `_planes-fixture` | `e2e/` | Molde y siembra del E2E (§7) |

Nada choca con el alcance.

## 1. Modelo de datos

### 1.1 El plazo es `descongelada_hasta` (reutilizada)

- **El plazo** de una empresa es `organizacion.descongelada_hasta`: el último día, en el calendario de la
  plataforma, en que la corrida no la congela. Está **vigente** mientras `descongelada_hasta >= hoy` (R1).
- **Quién lo escribe:**
  - el descongelamiento a mano de SLT-121, que ya la escribía;
  - la prórroga, que ahora también la escribe;
  - quitar el plazo, que la deja en `NULL`.
- **Una empresa congelada nunca tiene un plazo vigente.** `organizacion_mora_congelar` no congela si lo hay, y
  `organizacion_mora_descongelar_a_mano` fija las dos columnas a la vez. Por eso «quitar» con la empresa congelada
  responde `sin_plazo` (R5).
- **No hay columna ni `GRANT` nuevos.** `servi_app` sigue leyendo la columna en su fila y sin poder escribirla, así
  que la empresa no puede darse un plazo a sí misma.
- **El nombre** `descongelada_hasta` no se cambia (§9, alternativa 2). El comentario de la columna en
  `db/schema.prisma` y la entrada de `docs/architecture.md` pasan a decir «último día de un plazo dado por el
  superadmin: descongelamiento a mano o prórroga».

### 1.2 Enums (migración `20261127120000_prorroga_enums/`)

- `historial_accion_tipo` suma dos valores:
  - `empresa_prorroga_fijada`: prórroga dada, alargada o acortada (R3, R4, R15);
  - `empresa_prorroga_quitada`: prórroga quitada (R5, R15).
- Los dos van a la categoría `mora`. Así entran solos en `TIPOS_MORA` del repositorio, en el historial del
  superadmin y en el «Histórico de acciones» del maestro (R14).
- El descongelamiento sigue con `empresa_descongelada_a_mano` (R2). Esto cumple la decisión de que en el historial
  sean dos acciones distintas.
- **Migración:**
  - **UP:** `ALTER TYPE … ADD VALUE IF NOT EXISTS` de los dos valores. Va sola por el error `55P04`, como
    `20261126120000_mora_enums`.
  - **`down.sql`:** la función `pg_temp.quitar_valores_de_enum_*` de SLT-136, con el sufijo `_255`. Aborta si alguna
    fila usa uno de los dos valores.
- **Prefijo `20261127120000`:** va después de `20261126120100_mora_congelamiento`. Si `dev` avanzó cuando se abra el
  PR, se renumera antes de aplicar.

**Formato de las filas** (`entidad = organizacion`, `etiquetaDeEntidad("organizacion", { asunto: "mora" })`, actor
= el superadmin con `resolverActorCongelado`):

| Tipo | `valor_anterior` | `valor_nuevo` |
|---|---|---|
| `empresa_prorroga_fijada` | `hasta AAAA-MM-DD` si había un plazo vigente; si no, `NULL` | `hasta AAAA-MM-DD — <motivo>` |
| `empresa_prorroga_quitada` | `hasta AAAA-MM-DD` | `sin prórroga — <motivo>` |
| `empresa_descongelada_a_mano` (sin cambios) | `NULL` | `hasta AAAA-MM-DD — <motivo>` |

El motivo se recorta a 200 caracteres (`MOTIVO_MAX`). Es la excepción P5 extendida (decisión «Motivo»): dos filas
nuevas en `EXCEPCIONES_DECLARADAS` con el motivo `SLT-255: …`, solo en `MoraEmpresaRepository.ts`.

### 1.3 Datos que dependen del país

- **Hora:** la de la plataforma, por `lib/planes/ciclo.ts` (`fechaCalendarioPlataforma`,
  `mananaCalendarioPlataforma`), como en SLT-121. No hace falta ninguna excepción de país nueva.
- **Moneda:** la de los planes (`MONEDA_DE_LOS_PLANES`) en los correos, como en SLT-121.
- **Impuestos y métodos de pago:** ninguno.

## 2. Dominio puro: `lib/planes/mora.ts`

`EstadoMora` cambia el estado `descongelada_a_mano` por **`con_plazo`**:

```ts
export type EstadoMora =
  | { estado: "al_dia" }
  | { estado: "en_plazo"; fechaLimite: string }
  | { estado: "vencida"; facturas: FacturaVencida[]; saldoVencido: string }
  | { estado: "congelada"; desde: Date; facturas: FacturaVencida[]; saldoVencido: string }
  | { estado: "con_plazo"; hasta: string };          // reemplaza a "descongelada_a_mano"

/** R1: el plazo vigente (AAAA-MM-DD) o null. Una congelada no tiene plazo vigente. */
export function plazoVigente(o: OrganizacionMora, ahora: Date): string | null;
```

`estadoDeMora(o, facturas, ahora)` evalúa en este orden:

1. `congeladaAt !== null` → `congelada` (igual que antes).
2. Hay un plazo vigente `h` y alguna factura con saldo cuya `fechaLimite <= h` → `{ con_plazo, hasta: h }` (R11).
   Una factura vencida siempre cumple esto, porque su fecha límite es anterior a hoy, y hoy es como mucho `h`.
3. Hay vencidas → `vencida`.
4. Hay facturas con saldo → `en_plazo` con la fecha límite más próxima (R12).
5. Si no → `al_dia`.

Este orden cambia un comportamiento de SLT-121. Antes, el estado del plazo solo salía si había vencidas. Ahora también
sale si una factura en plazo vence dentro del plazo. Ese es el caso del ejemplo de la ficha: vence el miércoles y la
prórroga llega hasta el viernes, así que el banner ya dice «hasta el viernes».

**`MORA_TEXTOS`:**

- `banner.descongeladaAMano` → `banner.conPlazo(hasta)`: «Tienes prórroga de pago hasta el dd/mm/aaaa. Si no
  pagas, la operación se congela la madrugada siguiente.»
- `plataforma.estado.descongelada_a_mano` → `con_plazo`: «Con prórroga».
- `plataforma.errores` suma `sinPlazo`: «La empresa no tiene una prórroga vigente.». Quita `noCongelada`, porque
  «dar plazo» ya no tiene ese rechazo.

## 3. Repositorio, servicio y actions

### 3.1 `MoraEmpresaRepository` (`IMoraEmpresaRepository`)

`descongelarAMano` desaparece. En su lugar hay dos métodos:

```ts
darPlazo(org: string, hasta: string, motivo: string, actor: string, ahora: Date):
  Promise<"descongelada" | "prorroga" | "sin_cambio">;
quitarPlazo(org: string, motivo: string, actor: string, ahora: Date): Promise<"ok" | "sin_plazo">;
```

Los dos corren en `comoPlataforma(FICHA, …)` y dentro de un `$transaction`, como `fijarGracia`.

**`darPlazo`** (R2, R3, R4, R10, R15, R16, R21):

1. `SELECT congelada_at, descongelada_hasta FROM organizacion WHERE id = $org FOR NO KEY UPDATE`. Si la empresa no
   existe, lanza. Es el mismo candado de fila que `organizacion_mora_*`: la corrida y la acción se serializan (R10).
2. **Congelada:** llama a `organizacion_mora_descongelar_a_mano(org, hasta, ahora)`, que vuelve a tomar la misma fila
   sin problema y responde `ok`. Después hace lo mismo que el antiguo `descongelarAMano`:
   - `appendAccion` con `empresa_descongelada_a_mano`;
   - encola `{ tipo: "descongelada", motivo: "a_mano", hasta }` (R21).

   Devuelve `descongelada`.
3. **No congelada:**
   - el anterior es `descongelada_hasta` si está vigente (`>= hoy` de la plataforma); si no, `null`;
   - si el anterior es igual a `hasta` → devuelve `sin_cambio` sin escribir (R4);
   - si no:
     1. `UPDATE organizacion SET descongelada_hasta = $hasta::date, updated_at = now()`;
     2. `appendAccion` con `empresa_prorroga_fijada` (§1.2);
     3. encola `{ tipo: "prorroga", cambio, hasta }`, donde `cambio` es `"dada"` si no había anterior,
        `"alargada"` si `hasta > anterior` y `"acortada"` si es menor (R16).

     Devuelve `prorroga`.

**`quitarPlazo`** (R5, R15, R17):

1. Toma la misma fila en `FOR NO KEY UPDATE`.
2. Responde `sin_plazo` si la empresa está congelada o no tiene un plazo vigente.
3. Si no:
   1. `UPDATE … SET descongelada_hasta = NULL, updated_at = now()`;
   2. `appendAccion` con `empresa_prorroga_quitada`;
   3. encola `{ tipo: "prorroga_quitada", hasta: <la que tenía> }`.

   Devuelve `ok`.

**Por qué en TS y no en una función SQL nueva:** el dueño ya escribe `organizacion` desde TS en `fijarGracia`. La
decisión «congelada o no» queda protegida por el `FOR NO KEY UPDATE` de la misma transacción. Así no hace falta
migración de funciones, ni su `down.sql`, ni tocar las de SLT-121 (§9, alternativa 3). La escritura pasa el trigger
`bloqueo_por_mora` porque `current_user` no es `servi_app`.

**`encolarRecordatorios`** (la corrida) suma la víspera del plazo (R18). En la misma transacción, después de las
facturas:

- lee `congelada_at` y `descongelada_hasta`;
- si la empresa no está congelada, `descongelada_hasta = mañana` y `factura_plataforma_mora` tiene alguna `vencida`,
  encola `{ tipo: "prorroga_vence", hasta }` con:
  - `runAfter` = las 08:00 de hoy, como los recordatorios;
  - la dedupe `mora_aviso:prorroga_vence:<org>:<hasta>`, que hace que salga una vez por empresa y fecha.

El número que devuelve cuenta también este aviso. `crearMoraDiariaHandler` no cambia.

### 3.2 `MoraEmpresaService` (la autorización vive aquí)

| Método | Quién | Valida (zod) | Resultado |
|---|---|---|---|
| `darPlazo(actor, { organizacionId, motivo, hasta })` | `esPlataforma` (R7) | `darPlazoSchema` (el `descongelarSchema` de SLT-121 con otro nombre: motivo recortado de 1 a 200, `hasta` en `z.iso.date()`), y además el rango hoy … hoy + 60 de la plataforma (R6) | `descongelada` / `prorroga` / `sin_cambio` / `forbidden` / `not_found` / `validation_error` |
| `quitarPlazo(actor, { organizacionId, motivo })` | `esPlataforma` (R7) | `quitarPlazoSchema`: motivo de 1 a 200 | `ok` / `sin_plazo` / `forbidden` / `not_found` / `validation_error` |
| `moraDeEmpresa` (se ajusta) | igual | igual | `datos.descongelar` pasa a `datos.plazo: { desde, hasta, porDefecto, vigente: string \| null }`. `porDefecto` es el vigente, o hoy + 7 si no hay (R13) |

El orden no cambia: primero quién, luego zod, luego el rango, después `existeEmpresa` y al final el repositorio.
`descongelar` y `rangoDeDescongelar` desaparecen.

### 3.3 Actions (`lib/actions/mora-empresa.ts`; `nucleo` ya está en `reparto.ts`)

- `descongelarEmpresaAction` pasa a **`darPlazoEmpresaAction(organizacionId, input)`**.
- Nueva: **`quitarPlazoEmpresaAction(organizacionId, input)`**.
- Las dos van ligadas con `.bind` en `page.tsx`. Un `organizacionId` dentro de `input` no cuenta
  (`conEmpresaLigada`).

## 4. Correos (`mora_aviso_correo`)

### 4.1 Payload (`AvisoMoraPayload` y su zod en `jobs-mora.ts`)

```ts
| { tipo: "recordatorio"; facturaId: string }                                  // sin cambios en la forma
| { tipo: "congelada"; congeladaAt: string }
| { tipo: "descongelada"; motivo: "pago" | "a_mano" | "gracia"; hasta?: string }
| { tipo: "prorroga"; cambio: "dada" | "alargada" | "acortada"; hasta: string }  // R16
| { tipo: "prorroga_quitada"; hasta: string }                                   // R17
| { tipo: "prorroga_vence"; hasta: string }                                     // R18
```

Dedupe en `dedupeAvisoMora`:

- `prorroga: mora_aviso:prorroga:<org>:<ahora ISO>`;
- `prorrogaQuitada: mora_aviso:prorroga_quitada:<org>:<ahora ISO>`;
- `prorrogaVence: mora_aviso:prorroga_vence:<org>:<hasta>`.

### 4.2 Se relee antes de enviar (`contenidoVigente`, R19)

| Tipo | Sale solo si, al ejecutarse… |
|---|---|
| `prorroga` | la empresa no está congelada y su plazo vigente es `hasta` |
| `prorroga_quitada` | la empresa no está congelada y no tiene plazo vigente. El párrafo «se congela la madrugada siguiente» va solo si hay vencidas en ese momento (R17) |
| `prorroga_vence` | la empresa no está congelada, el plazo vigente es `hasta`, `hasta` es mañana y hay alguna vencida |
| `recordatorio` (R22) | lo mismo que en SLT-121. Además, si hay un plazo vigente `h` con `h >= fechaLimite`, el contenido lleva `plazoHasta: h` |

### 4.3 Plantillas (`mora-aviso.ts`)

`ContenidoAvisoMora` suma:

- `{ tipo: "prorroga"; cambio; hasta }`;
- `{ tipo: "prorroga_quitada"; conVencidas: boolean }`;
- `{ tipo: "prorroga_vence"; hasta }`;
- `plazoHasta?` en `recordatorio`.

Textos en `MORA_AVISO_TEXTOS`. Van escritos aquí para que el humano los vea al aprobar:

- **prorroga:**
  - asunto: «Tienes prórroga de pago hasta el dd/mm/aaaa». Si el plazo se alarga o se acorta: «Tu prórroga de pago
    cambió: ahora vence el dd/mm/aaaa»;
  - cuerpo: «La plataforma dio a <empresa> plazo para pagar las facturas pendientes hasta el dd/mm/aaaa.» y «Si
    para entonces no se pagan las facturas vencidas, la operación se congela la madrugada siguiente.»
- **prorroga_quitada:**
  - asunto: «Tu prórroga de pago se quitó»;
  - cuerpo: «La plataforma quitó la prórroga de pago de <empresa>.» Con vencidas, añade: «Como hay facturas
    vencidas sin pagar, la operación se congela la madrugada siguiente.»
- **prorroga_vence:**
  - asunto: «Tu prórroga de pago vence mañana»;
  - cuerpo: «La prórroga de pago de <empresa> vence mañana, dd/mm/aaaa. Si no se pagan las facturas vencidas, la
    operación se congela la madrugada siguiente.»
- **recordatorio con `plazoHasta`:** la línea `consecuencia` se cambia por «Tienes prórroga de pago hasta el
  dd/mm/aaaa.» (R22).

Todos llevan el botón «Ver facturas» → `/mi-plan`. La plantilla ya está en `permitidos` de
`mi-plan-solo-maestro.guardia`.

## 5. Interfaz

### 5.1 Banner (`AvisoMora.tsx`, R11, R12)

- El caso `descongelada_a_mano` pasa a `con_plazo`: tono `aviso` (`role="status"`), con el texto de
  `MORA_TEXTOS.banner.conPlazo`.
- El enlace «Ver facturas» sigue igual: solo en `en_plazo` y para `ROLES_MI_PLAN`.
- `app/(app)/layout.tsx` no cambia.

### 5.2 Sección del superadmin (`MoraEmpresa.tsx`, R13)

- **Estado:** `con_plazo` se ve como «Con prórroga hasta el dd/mm/aaaa».
- **Botones:**
  - «Dar plazo hasta…» siempre;
  - «Quitar prórroga…» solo si `datos.plazo.vigente !== null` y el estado no es `congelada`.
- **Diálogo «dar plazo»** (el antiguo `DialogoDescongelar`, generalizado):
  - título según el caso: congelada → «Descongelar la operación»; con prórroga → «Cambiar la prórroga»; sin
    ninguna → «Dar prórroga de pago»;
  - un aviso que explica el efecto;
  - motivo y «Hasta», con `min`, `max` y el valor por defecto de `datos.plazo`;
  - `sin_cambio` muestra «La fecha es la misma de la prórroga vigente.»
- **Diálogo «quitar»:** pide el motivo. `sin_plazo` muestra `MORA_TEXTOS.plataforma.errores.sinPlazo`.
- Las props `descongelar` pasan a `darPlazo` y se añade `quitarPlazo`. Las dos llegan ligadas desde `page.tsx`.
- **Historial:** las filas nuevas salen con `ACCION_LABELS`:
  - `empresa_prorroga_fijada`: «Dio o cambió la prórroga de pago»;
  - `empresa_prorroga_quitada`: «Quitó la prórroga de pago».

  Llevan `valor_anterior → valor_nuevo` con el `detalleDeFila` que ya existe.

### 5.3 El maestro (R14)

Las filas entran por la categoría `mora` de `lib/types/historial-accion.ts`, con sus dos etiquetas en
`ACCION_LABELS` y `CATEGORIA_POR_ACCION`. No hay pantalla nueva.

## 6. Concurrencia

| Choque | Cómo se evita |
|---|---|
| La corrida congela mientras el superadmin da plazo | Las dos toman la fila con `FOR NO KEY UPDATE`. Si gana la corrida, `darPlazo` la ve congelada y descongela (R2, R10). Si gana `darPlazo`, la corrida ve el plazo vigente y responde `descongelada_a_mano` |
| Dos superadmins cambian el plazo a la vez | Se serializan sobre la fila. El segundo lee el anterior ya confirmado, así que el historial dice la verdad |
| Se quita el plazo mientras corre la madrugada | Se serializan. Si la corrida ya pasó, la empresa se congela la madrugada siguiente (R9, «primera madrugada después») |
| El correo de una prórroga que se cambió enseguida | Al ejecutarse se relee (R19): solo sale el de la fecha vigente |

`darPlazo` no toma el candado `pago_plataforma:`, igual que el descongelamiento a mano de SLT-121. Un pago que se
confirma a la vez solo puede descongelar, y una empresa ya descongelada responde `sin_cambio`.

## 7. E2E (`e2e/mora-prorroga.spec.ts`, proyecto `dinero`, R23)

**Siembra:** la de `mora-congelamiento.spec.ts`. Una empresa con su maestro y su `admin`, un plan custom y una
factura cerrada con el atajo SQL. El superadmin de prueba entra con su candado.

**Pasos:**

1. El superadmin abre la empresa en Plataforma > Empresas y pulsa «Dar plazo hasta…». Pone un motivo y una fecha
   `H` posterior a la fecha límite `FL` de la factura (con gracia 7, por ejemplo hoy + 10). Confirma. La sección
   pasa a «Con prórroga hasta …» y el historial muestra «Dio o cambió la prórroga de pago».
2. El dueño llama a `organizacion_mora_congelar` con un `ahora` a las 00:30 del día siguiente a `FL`, cuando la
   factura ya está vencida y la fecha sigue dentro de la prórroga. La respuesta es `descongelada_a_mano` y
   `congelada_at` sigue `NULL`. Es el mismo artificio de reloj que en SLT-121 §11.
3. El maestro y el `admin` ven el banner «Tienes prórroga de pago hasta el …».
4. El dueño llama a `organizacion_mora_congelar` con un `ahora` a las 00:30 de `H + 1`. La respuesta es
   `congelada`.
5. El maestro ve «Empresa congelada por falta de pago».

- El banner se lee con el reloj real. La factura no está vencida en tiempo real, pero cumple
  `fechaLimite <= H`, así que R11 aplica.
- `playwright.config.ts` suma `"mora-prorroga"` al proyecto `dinero`.
- Antes del PR se corren en local: `--project=dinero` (incluye `mora-congelamiento`) y `dos-empresas-humo`.

## 8. Tests (trazabilidad R → test)

| Archivo | Cubre | Cómo |
|---|---|---|
| `tests/unit/planes/mora.test.ts` (se amplía) | R1, R11, R12 | `plazoVigente`: hoy sí, ayer no, congelada → `null`. `estadoDeMora`: `con_plazo` con vencidas, con una factura en plazo dentro de `H` y con descongelamiento a mano; `en_plazo` si `H < fechaLimite`; congelada manda |
| `tests/integration/repositories/mora-empresa-repository.test.ts` (se amplía; base real) | R2, R3, R4, R5, R8, R9, R10, R15, R21 | `darPlazo` congelada → `descongelada` con su fila y su aviso «a_mano». No congelada → `prorroga`, sin tocar facturas ni gracia, con su fila y su aviso «dada». Alargar y acortar dejan anterior y nuevo con su `cambio`. Igual → `sin_cambio`, sin fila ni trabajo. `quitarPlazo` → `ok` con su fila; sin plazo o congelada → `sin_plazo`. `congelarSiVencida` con el plazo vigente → `descongelada_a_mano`; con `H` = ayer o quitado → `congelada`. Dos `darPlazo` en paralelo terminan los dos sin `40P01`. `encolarRecordatorios`: víspera del plazo con vencidas → un trabajo; sin vencidas o congelada → ninguno; dos corridas → uno |
| `tests/unit/services/mora-empresa-service.test.ts` (se amplía) | R6, R7, R13 | `forbidden` sin llamadas al repositorio. Motivo vacío o de 201 caracteres; `hasta` = ayer y hoy + 61 → `validation_error`; hoy y hoy + 60 pasan. `not_found`. `datos.plazo.vigente` y `porDefecto` |
| `tests/unit/actions/mora-empresa.test.ts` (se amplía) | R7 | `darPlazoEmpresaAction` y `quitarPlazoEmpresaAction` mandan la empresa ligada, no la de `input` |
| `tests/unit/planes/jobs-mora.test.ts` (se amplía) | R16–R20, R22 | Los tres payloads nuevos parsean y uno malformado falla. `contenidoVigente` no envía si cambió `hasta`, si se volvió a dar, si se congeló, o (en la víspera) si ya no hay vencidas. `prorroga_quitada` con y sin vencidas. El recordatorio lleva `plazoHasta` solo si `h >= fechaLimite`. Un envío fallido sigue con los demás y lanza |
| `tests/unit/services/email/plantilla-mora-aviso.test.ts` (se amplía) | R16, R17, R18, R22 | Asunto y cuerpo de cada tipo y de cada `cambio`. El recordatorio con plazo no dice «se congela». Escape |
| `tests/components/AvisoMora.test.tsx` (se amplía) | R11 | `con_plazo` con su texto y `role="status"`. Sin enlace |
| `tests/components/MoraEmpresa.test.tsx` (se amplía) | R13 | Los botones según el estado. Título del diálogo en los tres casos. `sin_cambio` y `sin_plazo` muestran su texto. Validación del cliente |
| `tests/unit/guards/historial-accion-sin-datos-cliente.guardia.test.ts` (se enmienda) | R15 | Dos excepciones declaradas `SLT-255` para los dos tipos nuevos, solo en `MoraEmpresaRepository.ts` |
| `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts` (se enmienda) | R15 | Censo: `darPlazo` produce `empresa_descongelada_a_mano` y `empresa_prorroga_fijada`; `quitarPlazo` produce `empresa_prorroga_quitada`. Las dos abren la transacción. El total de tipos sube en 2 |
| `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` (se enmienda) | R14 | Los dos tipos en la categoría `mora`, con etiqueta |
| `tests/integration/db/prorroga-migration.test.ts` (nuevo) | §1.2 | `down` en `BEGIN … COMMIT`, con la función de SLT-136 byte a byte salvo el sufijo. Subir, bajar, bajar otra vez y subir. El `down` aborta si una fila usa un valor |
| `tests/integration/db/mora-migration.test.ts` y los 8 inventarios de `historial_accion_tipo` (se amplían) | §1.2 | Los dos valores se afirman al final y se quitan antes de los cortes, como hizo SLT-121 |
| `e2e/mora-prorroga.spec.ts` (nuevo) | R23, R8, R9, R11 | §7 |
| `e2e/mora-congelamiento.spec.ts` y `e2e/dos-empresas-humo.spec.ts` (sin cambios, se corren) | R23 | Obligatorio por `docs/checkpoints-proyecto.md` |

## 9. Alternativas descartadas

1. **Una columna nueva, `organizacion.prorroga_hasta`, separada de `descongelada_hasta`.**
   - Habría que enseñarle la columna a `organizacion_mora_congelar`: una función nueva o reescrita, con otra
     migración y su `down.sql`, y otra vez la prueba de los 5 cruces forzados del `40P01`.
   - Habría dos fuentes para lo mismo, «no congelar hasta X», y alargar un descongelamiento a mano no sabría cuál de
     las dos tocar.
   - La decisión cerrada dice que dar plazo y descongelar son la misma acción, y que el banner es el mismo texto. Un
     solo plazo lo cumple sin coordinar dos columnas.
2. **Renombrar `descongelada_hasta` a `plazo_hasta`.**
   - Obliga a reescribir con `CREATE OR REPLACE` las funciones de SLT-121 que la leen (congelar y descongelar a
     mano), y a tocar sus tests, para ganar solo un nombre.
   - Se queda el nombre y se documenta su significado (§1.1).
3. **Una función SQL del dueño, `organizacion_mora_dar_plazo`.**
   - Daría la misma atomicidad que `FOR NO KEY UPDATE` en el `$transaction` del repositorio, pero suma una migración
     con su `down.sql`.
   - Además, el historial y el outbox tienen que ir en TS de todos modos, por la guardia
     `historial-accion-escrituras-cubiertas`. `fijarGracia` ya escribe `organizacion` desde TS.
4. **Un solo tipo de historial para dar, cambiar y quitar** (por ejemplo, quitar como `valor_nuevo = NULL`). Cuesta
   lo mismo en inventarios que dos tipos, porque cada valor nuevo toca los mismos archivos. Además, «Quitó la
   prórroga» no se podría filtrar ni etiquetar aparte.
5. **Un `job_tipo` nuevo para los correos de la prórroga.** Duplicaría `mora_aviso_correo` (destinatarios,
   reintentos, relectura) y sumaría otra migración de enums y otros inventarios de `job_tipo`.
6. **Encolar la víspera del plazo al darla, con `runAfter = H − 1 a las 08:00`.** Un cambio de fecha dejaría
   trabajos viejos que se descartan al releer. Hacerlo en la corrida diaria, como el recordatorio de las facturas,
   da una sola fuente y la dedupe por fecha (R18).

## 10. Decisiones de diseño que el humano debe ver

1. **El plazo vive en `descongelada_hasta`** (§1.1). La prórroga y el descongelamiento a mano no se distinguen en la
   base, solo en el historial. Por eso la víspera del plazo (R18) también avisa tras un descongelamiento a mano: es
   el mismo plazo.
2. **El banner `con_plazo` sale también antes de que la factura venza**, si su fecha límite cae dentro del plazo
   (R11). Con un plazo más corto que la fecha límite, rige el banner de siempre (R12).
3. **Se puede dar prórroga a una empresa al día o en plazo** (R3). La decisión no la limita y no tiene efecto
   dañino.
4. **Sin víspera si el plazo llega a mañana y se da después de la corrida de hoy** (00:30). Ese caso ya lo cubre
   el correo de R16, que sale al darla con la fecha.
5. **Con la misma fecha, `sin_cambio`**: no deja fila ni correo, aunque el motivo sea otro (R4).
6. **El correo al descongelar sigue siendo el de SLT-121 R28** (R21), no el de la prórroga.
7. **Tamaño:** unos 41 archivos (19 de producción y 22 de tests), unas 650 líneas de producción y unas 1 300 de
   tests. Pasa del tope de 40 archivos, y el humano lo aceptó (`tamano-pr-aceptado`). Once archivos son ediciones
   mecánicas: los 8 inventarios, `mora-migration` y dos guardias del historial.
