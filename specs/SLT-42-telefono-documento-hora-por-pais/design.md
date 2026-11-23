# SLT-42 — Teléfono, documento y hora por país · design

> Alcance, «Lo que NO entra» y decisiones cerradas: `requirements.md`. Aquí solo el cómo.
> Las referencias `R<n>` y `P<n>` son las de `requirements.md`.

## Lo que ya existe

Buscado el 2026-11-03 con `zona horaria`, `timezone`, `libphonenumber`, `prefijo`, `tipo de
documento`, `tipo_identificacion` y `America/Costa_Rica`, en `feature_list.json` (todos los
estados), en `specs/` y en el código. **El grafo (`codebase-memory-mcp`) no tiene indexado este
worktree** (`list_projects` no lo lista): la búsqueda de código se hizo con Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| SLT-81 «Datos del país: pantalla del superadmin y formularios» | `feature_list.json` | Es la otra mitad de la ficha partida (decisión cerrada). No se solapa: aquí no hay pantalla ni formularios. |
| SL-20 «Geografía configurable por país» (`done`) | `feature_list.json`, `specs/SL-20-pais-geografia-configurable/` | Su descripción manda teléfono, documento y zona horaria a esta ficha. Se **reutiliza**: tabla `pais`, `organizacion.pais_id` inmutable, `IPaisRepository.deLaEmpresa`, el patrón de RLS de plataforma (`pais_lectura` + `REVOKE` a `servi_app`), las fábricas de países de prueba `XA`–`XZ` y `lib/db/errores-pais.ts`. |
| SL-21 (moneda e impuestos) y SL-22 (métodos de pago, SINPE) | `feature_list.json` | Fuera. `lib/utils/sinpe-cr.ts` y `lib/types/sinpe-bodega.ts` (prefijo `506` de SINPE) quedan en la lista de excepciones de R29 con ficha SL-22. |
| SLT-43…SLT-47 (épica GEO) | `feature_list.json` | No tocan teléfono, documento ni hora. Se hereda su regla de producción (migraciones que no cambian datos, `down.sql`, comprobación previa en solo lectura). SLT-43 también toca `db/schema.prisma` (misma persona: sin conflicto de equipo). |
| SL-37 «rastreo fecha UTC» | `specs/SL-37-rastreo-fecha-utc/` | Dejó la zona del rastreo público en `RASTREO_PUBLICO_ZONA_HORARIA`. R27 la cambia por la del país de la empresa de la orden; el formato del desfase de SL-37 se conserva. |
| SL-24 «ciclo en UTC» | `docs/architecture.md > Planes y límites` | El ciclo de planes es UTC por decisión. **No se toca** (`lib/planes/ciclo.ts`). |
| Catálogo `tipo_identificacion` («cedula», «ruc», «pasaporte») | `db/schema.prisma:16`, `20261022130000_organizacion_y_rol_app` | Se **amplía** en vez de crear otra tabla (§2.2). |
| Validación genérica de documento y teléfono | `lib/types/auth.ts > numericIdentifierSchema` (7–15 dígitos, todos los tipos) | Queda solo para el usuario de plataforma (R17). |
| Normalización de teléfono CR y su gemelo SQL | `lib/utils/telefono-cr.ts`, `telefono-cr-sql.ts`, `whatsapp-telefono.ts`, `lib/whatsapp-envios/telefono.ts` | Se **generalizan** con el prefijo y los dígitos del país, mismas cuatro reglas (R18–R21). |
| Hora de CR con desfase fijo | `lib/utils/fecha-cr.ts` (`CR_OFFSET_MS`), `hora-cr.ts`, `separador-dia-cr.ts`, `liberar-reprogramadas-handler.ts`, `analitica-rollup-diario-handler.ts`, `lib/config/aviso-reparto-manana.ts` (`OFFSET_CR_HORAS`) | Se crea el módulo genérico por zona (§4.1). Los módulos `*-cr` quedan como envoltorios **solo para la UI** de SLT-81. |
| Convención «sin zona horaria en el SQL» | `FinanzasDiarioRepository`, `IngresosAnaliticaRepository`, `CohorteCargaRepository`, `ConteoCargadasPorDiaRepository`, `TableroDiaRepository` | Se **mantiene**: los límites del día siguen entrando como parámetros calculados en TS, ahora con la zona del país (§4.3). |

No apareció ninguna ficha ni código que ya resuelva esto.

## 1. Resumen

1. `pais` gana tres columnas: prefijo, dígitos nacionales y zona horaria (R1). Costa Rica se
   siembra en la migración (R3).
2. `tipo_identificacion` gana país y regla de formato (R2). Las tres filas de hoy se convierten en
   tipos de CR rellenando solo columnas nuevas, y se insertan DIMEX y NITE. `usuario` no se toca (R7,
   R8).
3. El único del documento pasa a `(organizacion_id, tipo_identificacion_id, cedula)` (R13, P4).
4. Un puerto `IReglasPaisEmpresa` da a los servicios los datos del país de la empresa del contexto.
   Valida teléfono (libphonenumber) y documento (R10–R16) y alimenta el cálculo de fechas (R22).
5. Todo cálculo de fecha del servidor pasa por `lib/utils/calendario-zona.ts`, con la zona como
   parámetro explícito (R22, R23). Los jobs diarios se agendan por zona (R25, R26).
6. Una guardia impide volver a escribir la zona, el desfase o el `506` en el servidor (R29).

**Fuera, explícito.**
- Componentes de UI (`app/**/_components/**`, `components/**`): siguen con los envoltorios CR
  (`fecha-cr.ts`, `hora-cr.ts`, `separador-dia-cr.ts`, `telefono-cr.ts`) y con `+506` y el selector
  de documento tal como están. Pasan a SLT-81 y quedan en la lista de excepciones de R29. Esta ficha
  solo cambia en ellos lo mínimo para que compilen si una firma compartida cambia, y **no** cambia
  su comportamiento.
- Pantalla del superadmin para editar los datos del país: SLT-81.
- SINPE (SL-22), moneda e impuestos (SL-21).

## 2. Modelo de datos

Las tablas que se tocan son **de plataforma** (sin `organizacion_id`, en `MODELOS_DE_PLATAFORMA`,
igual que `pais` y `tipo_identificacion` hoy). `usuario` ya es de negocio y ya tiene
`organizacion_id`. No hay tabla de negocio nueva.

### 2.1 `pais`: datos de teléfono y hora (R1)

```sql
ALTER TABLE "pais"
  ADD COLUMN "prefijo_telefonico"          text     NULL,  -- solo dígitos, sin '+': '506'
  ADD COLUMN "telefono_digitos_nacionales" smallint NULL,  -- largo del número nacional: 8
  ADD COLUMN "zona_horaria"                text     NULL;  -- IANA: 'America/Costa_Rica'
ALTER TABLE "pais"
  ADD CONSTRAINT "pais_prefijo_telefonico_formato" CHECK ("prefijo_telefonico" ~ '^[1-9][0-9]{0,2}$'),
  ADD CONSTRAINT "pais_telefono_digitos_rango"     CHECK ("telefono_digitos_nacionales" BETWEEN 4 AND 14);
UPDATE "pais" SET "prefijo_telefonico" = '506', "telefono_digitos_nacionales" = 8,
                  "zona_horaria" = 'America/Costa_Rica'
 WHERE "id" = 'CR';   -- solo columnas nuevas (R8)
```

- **NULL a propósito.** Los países dados de alta con la pantalla de SL-20 no tienen estos datos, y
  rellenarlos con valores inventados sería peor. Un país incompleto no admite altas de empresa nuevas
  (R6, P7) y una operación que necesita la zona falla con `PaisSinZonaHoraria` (R28).
- La zona se valida al escribir en el servidor con
  `Intl.supportedValuesOf("timeZone").includes(z)`. No va un `CHECK` en la base porque Postgres y
  Node no traen la misma versión de tzdata. La escritura es de SLT-81; aquí solo la siembra de CR.
- En Prisma: `prefijoTelefonico String? @map(...)`, `telefonoDigitosNacionales Int? @db.SmallInt
  @map(...)`, `zonaHoraria String? @map(...)`.
- Seguridad: `pais` ya tiene `pais_lectura` (SELECT para `servi_app`) y `REVOKE INSERT, UPDATE,
  DELETE … FROM servi_app` (SL-20). Las columnas nuevas lo heredan (R4). No hay política nueva.

### 2.2 `tipo_identificacion`: tipos por país (R2, R3, R7)

```sql
ALTER TABLE "tipo_identificacion"
  ADD COLUMN "pais_id"     text     NULL REFERENCES "pais"("id") ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD COLUMN "clave"       text     NULL,   -- 'cedula_fisica', 'cedula_juridica', 'dimex', 'nite', 'pasaporte'
  ADD COLUMN "nombre"      text     NULL,   -- 'Cédula física', …
  ADD COLUMN "caracteres"  text     NULL,   -- 'digitos' | 'alfanumerico'
  ADD COLUMN "largo_min"   smallint NULL,
  ADD COLUMN "largo_max"   smallint NULL,
  ADD COLUMN "orden"       smallint NULL,
  ADD COLUMN "activo"      boolean  NOT NULL DEFAULT true;

-- Las tres filas de hoy PASAN A SER tipos de CR: solo se escriben columnas nuevas (R7, R8).
UPDATE "tipo_identificacion" SET "pais_id"='CR', "clave"='cedula_fisica',   "nombre"='Cédula física',   "caracteres"='digitos',      "largo_min"=9,  "largo_max"=9,  "orden"=1 WHERE "value"='cedula';
UPDATE "tipo_identificacion" SET "pais_id"='CR', "clave"='cedula_juridica', "nombre"='Cédula jurídica', "caracteres"='digitos',      "largo_min"=10, "largo_max"=10, "orden"=2 WHERE "value"='ruc';
UPDATE "tipo_identificacion" SET "pais_id"='CR', "clave"='pasaporte',       "nombre"='Pasaporte',       "caracteres"='alfanumerico', "largo_min"=6,  "largo_max"=20, "orden"=5 WHERE "value"='pasaporte'; -- P5
INSERT INTO "tipo_identificacion" ("id","value","pais_id","clave","nombre","caracteres","largo_min","largo_max","orden")
VALUES (gen_random_uuid()::text,'dimex','CR','dimex','DIMEX','digitos',11,12,3),
       (gen_random_uuid()::text,'nite', 'CR','nite', 'NITE', 'digitos',10,10,4);

-- Con las filas ya rellenas, las columnas nuevas se cierran (siguen siendo columnas nuevas).
ALTER TABLE "tipo_identificacion"
  ALTER COLUMN "pais_id" SET NOT NULL, ALTER COLUMN "clave" SET NOT NULL, ALTER COLUMN "nombre" SET NOT NULL,
  ALTER COLUMN "caracteres" SET NOT NULL, ALTER COLUMN "largo_min" SET NOT NULL,
  ALTER COLUMN "largo_max" SET NOT NULL, ALTER COLUMN "orden" SET NOT NULL,
  ADD CONSTRAINT "tipo_identificacion_caracteres" CHECK ("caracteres" IN ('digitos','alfanumerico')),
  ADD CONSTRAINT "tipo_identificacion_largos"     CHECK ("largo_min" BETWEEN 1 AND "largo_max" AND "largo_max" <= 30);
CREATE UNIQUE INDEX "tipo_identificacion_pais_clave_key" ON "tipo_identificacion" ("pais_id","clave");
CREATE INDEX "tipo_identificacion_pais_idx" ON "tipo_identificacion" ("pais_id");
```

- **Por qué así el remapeo (P1).** `usuario.tipo_identificacion_id` no cambia: el usuario que apuntaba
  a la fila «cedula» sigue apuntando a ella, y esa fila *es* ahora la cédula física de CR. Cero
  `UPDATE` sobre `usuario` y cero sobre columnas existentes. `value` no se toca y sigue siendo único
  global: es lo que mandan hoy el alta de empresa, la postulación y `ArranqueSuperadminRepository`.
- **`value` en países futuros.** Sigue siendo `@unique` global. Un tipo de otro país (lo da de alta
  SLT-81) lleva `value = '<PAIS>_<clave>'` (`PA_pasaporte`). Las búsquedas nuevas son por
  `(pais_id, clave)` o por `id`. `value` queda como compatibilidad y su retiro es de SLT-81.
- **Precondición** (va en la migración, aborta si falla): existe la fila `pais` `CR` y existen las
  tres filas `value IN ('cedula','ruc','pasaporte')`. Si `tipo_identificacion` tiene otra fila
  (alguien la creó a mano), la migración aborta con un mensaje y no cambia nada: una fila sin país
  no cabría en el `SET NOT NULL`.
- **Seguridad (R4, R5).** Hoy la política `tipo_identificacion_lectura` es `USING (true)` y la
  escritura está revocada a `servi_app`. Se **añade**, sin borrar la de hoy, una política
  restrictiva:

  ```sql
  CREATE POLICY "tipo_identificacion_del_pais" ON "tipo_identificacion" AS RESTRICTIVE
    FOR SELECT TO servi_app
    USING ("pais_id" = (SELECT o."pais_id" FROM "organizacion" o
                         WHERE o."id" = current_setting('app.organizacion_id', true)));
  ```

  Con la permisiva de hoy, el resultado es «solo los del país de mi empresa» (la misma expresión que
  `provincia_del_pais` de SL-20; el implementer copia la forma exacta de esa migración, incluido el
  cast de `current_setting`). En plataforma (dueño) no hay RLS. El repositorio filtra **además** por
  `pais_id` y `activo` (R5): la política es la red, el filtro es la regla.

### 2.3 `usuario`: único por empresa y tipo (R13, P4)

Mismo patrón que `20261026090000_usuario_unico_por_empresa` (SL-18). Se borra el índice y se crea
con **el mismo nombre**, para que la traducción de `P2002` por nombre (`UserRepository`,
`PostulacionRepository`, `OrganizacionRepository`, `ArranqueSuperadminRepository`) siga dando
`campo: "cedula"` / `"documento"` sin tocarla:

```sql
DROP INDEX "usuario_cedula_key";
CREATE UNIQUE INDEX "usuario_cedula_key" ON "usuario" ("organizacion_id","tipo_identificacion_id","cedula");
```

- Todo lo guardado cumple el índice nuevo, que es más permisivo. No se borra ni cambia ningún dato.
- **down:** antes de volver a `(organizacion_id, cedula)`, cuenta los repetidos de `(organizacion_id,
  cedula)`. Si hay alguno, `RAISE EXCEPTION` que nombra el índice y no cambia nada (patrón de SL-18).
- Empieza por `organizacion_id`: la guardia `unicos-por-empresa` lo acepta sin tocar su lista.
- **Excepción declarada a la regla de la épica GEO (P4, cerrada el 2026-11-03).** El
  `DROP INDEX "usuario_cedula_key"` de `20261107120200_slt42_usuario_documento_unico_por_tipo` es la
  única sentencia destructiva de la ficha. El humano la aceptó porque solo afecta a un índice, no
  toca datos y el `down.sql` lo restaura. Hoy no existe la guardia de migraciones destructivas: la
  regla de la épica dice que se definirá con `/afinar-regla`, y en `tests/` no hay ninguna. Cuando
  exista, su lista de excepciones debe nombrar esta migración, esta sentencia y la ficha `SLT-42`.
  Si la guardia entra antes de que se mergee esta ficha, el implementer añade esa entrada en T1.3.

### 2.4 Migraciones

| Migración | Qué hace | `down.sql` |
|---|---|---|
| `20261107120000_slt42_pais_telefono_y_zona` | §2.1 | `DROP CONSTRAINT` de los dos `CHECK` y `DROP COLUMN` de las tres columnas. Solo borra lo que creó la subida. |
| `20261107120100_slt42_tipo_documento_por_pais` | §2.2 (columnas, filas de CR, índices, política) | `DROP POLICY "tipo_identificacion_del_pais"`, índices y `CHECK`. Borra las filas `dimex` y `nite` **solo si ningún usuario las usa**: si alguno las usa, `RAISE EXCEPTION` y no cambia nada (son personas). Al final, `DROP COLUMN` de las ocho columnas nuevas. Las tres filas de antes vuelven a su forma porque sus columnas viejas nunca cambiaron. |
| `20261107120200_slt42_usuario_documento_unico_por_tipo` | §2.3 | Comprueba los repetidos y vuelve al índice de SL-18 (§2.3). |

Las tres van en una transacción cada una. Ninguna hace `UPDATE` de una columna que existía antes (P1), y
ninguna toma bloqueos largos sobre `usuario`: el `CREATE UNIQUE INDEX` sobre `usuario` es de una
tabla de cientos de filas. Si en la comprobación previa (§2.5) `usuario` pasa de 100 000 filas, se
cambia a `CONCURRENTLY` fuera de transacción.

### 2.5 Comprobaciones previas en producción (solo lectura, las corre una persona)

Las tres deben dar lo esperado. Si alguna no lo da, se para y decide el humano (patrón SLT-43):

1. `SELECT count(*) FROM organizacion WHERE pais_id <> 'CR'` → 0. Si no es 0, esas empresas
   quedarían en un país sin zona y sus crons fallarían (R28). Es la condición de P7 (cerrada el
   2026-11-03): si aparece alguna, no se migra y decide el humano.
2. `SELECT value, count(*) FROM tipo_identificacion GROUP BY 1` → exactamente `cedula`, `ruc` y
   `pasaporte`.
3. `SELECT count(*) FROM usuario` → para el punto del índice concurrente (§2.4).

Ensayo de las tres migraciones y de sus `down.sql` sobre una copia de producción, nunca sobre
producción (regla de la épica GEO, 2026-10-28). Ningún agente toca la base de producción.

## 3. Datos que dependen del país y de dónde salen

| Dato | Fuente | Quién lo lee |
|---|---|---|
| Prefijo telefónico, dígitos nacionales | `pais.prefijo_telefonico`, `pais.telefono_digitos_nacionales` | `IReglasPaisEmpresa` → normalización de WhatsApp (R18–R20) |
| Reglas de validez del teléfono | libphonenumber-js, región = `pais.id` (ISO alfa-2) | `lib/validacion/telefono.ts` (R14–R16) |
| Tipos de documento y su regla | `tipo_identificacion` con `pais_id` | `UserRepository.listTiposIdentificacion`, `IReglasPaisEmpresa` (R5, R10–R12) |
| Zona horaria | `pais.zona_horaria` | `IReglasPaisEmpresa` → `calendario-zona.ts` (R22–R28) |
| Moneda, impuestos, métodos de pago | — | Fuera (SL-21, SL-22) |

## 4. Capas y contratos

### 4.1 Módulos puros nuevos (sin DB, sin `process.env`)

**`lib/utils/calendario-zona.ts`** — la única pieza del servidor que sabe convertir entre instante y
calendario. Todas reciben `zona: string` (IANA) explícita y resuelven con `Intl.DateTimeFormat`
(`timeZone`, `hourCycle: "h23"`). Sin aritmética de desfase fijo, para que funcione con horario de
verano (R23). Es el espejo de lo que hoy hace `fecha-cr.ts`, con los mismos nombres sin el sufijo
`CR` y las mismas convenciones documentadas allí, incluida la trampa de las 6 h:

| Función | Equivale hoy a |
|---|---|
| `desfaseEnMs(instante, zona)` | `CR_OFFSET_MS` (pero por instante) |
| `fechaCalendario(now, zona): "YYYY-MM-DD"` | `fechaCalendarioCR` |
| `inicioDelDiaComoFecha(now, zona): Date` (medianoche UTC de la fecha local, convención `@db.Date`) | `startOfDayCR` |
| `inicioDelDiaEnUtc(fecha, zona): Date` (instante real de las 00:00 locales) | `inicioDelDiaCREnUtc` |
| `inicioDelDiaSiguienteEnUtc(fecha, zona)` | `inicioDelDiaSiguienteCREnUtc` |
| `manana(now, zona)`, `ultimosNDias(n, now, zona)`, `inicioDeUltimosNDiasEnUtc(n, now, zona)` | sus gemelas `CR` |
| `periodoMensual(now, zona)`, `inicioDelMesEnUtc(now, zona)`, `diasNaturalesDesde(desde, now, zona)` | sus gemelas `CR` |
| `horaDePared(instante, zona): "HH:mm"` | `horaCostaRica` |
| `proximaHoraLocal(now, zona, hh, mm): Date` (estrictamente posterior a `now`) | `proximaCorridaLiberarCR`, `proximaCorridaRollupCR` |

`esFechaCalendarioValida` no depende de zona y se mueve sin cambios (`fecha-cr.ts` la re-exporta).
`inicioDelDiaEnUtc` resuelve el desfase **en la medianoche de ese día**, no en `now`. En un día de
cambio de hora las 00:00 pueden no existir (salto a las 01:00): entonces devuelve el primer instante
del día local (R23).

**`lib/utils/telefono-pais.ts`** — generaliza `telefono-cr.ts`, `telefono-cr-sql.ts` y
`whatsapp-envios/telefono.ts`:

```ts
export interface ReglasTelefono { prefijo: string; digitosNacionales: number }
export function normalizarTelefono(raw: string, r: ReglasTelefono): string;          // R18
export function telefonoSirveParaEnvio(raw: string | null | undefined, r: ReglasTelefono): boolean; // R20
/** Expresión SQL; `$p` y `$n` son los NÚMEROS de los parámetros que llevan prefijo y dígitos. */
export function sqlNormalizarTelefono(columna: string, p: number, n: number): string;  // R19
```

En el SQL, el prefijo y los dígitos viajan como parámetros (`$p::text`, `$n::int`), nunca
interpolados: solo `columna` se interpola, como hoy, y es un literal del código. Los módulos de hoy
quedan así:
- `telefono-cr.ts` y `whatsapp-telefono.ts`: envoltorios con `{ prefijo: "506", digitosNacionales: 8 }`,
  solo para la UI (`ChatConversacion.tsx`). Quedan en la lista de excepciones de R29, a SLT-81.
- `telefono-cr-sql.ts` se retira: sus llamantes (`ChatConversacionRepository`,
  `busqueda-texto-sql.ts`) son de servidor y pasan a `sqlNormalizarTelefono`.
- `whatsapp-envios/telefono.ts`: `telefonoValido` se retira a favor de `telefonoSirveParaEnvio`;
  `enmascararTelefono` no depende del país y se queda.

**`lib/utils/documento.ts`**:

```ts
export interface ReglaDocumento { caracteres: "digitos" | "alfanumerico"; largoMin: number; largoMax: number }
export function validarDocumento(valor: string, r: ReglaDocumento): { ok: true; valor: string } | { ok: false; mensaje: string };
```

`digitos` = `^\d+$`. `alfanumerico` = `^[A-Z0-9]+$` tras pasar a mayúsculas. Lo que se guarda es
`valor` (el de entrada; en el alfanumérico, en mayúsculas). No se quitan guiones ni espacios: hoy
tampoco se aceptan.

### 4.2 Servidor

**`lib/validacion/telefono.ts`** (solo servidor; sin `import "server-only"`, ver desvío 8; el único que importa libphonenumber-js):

```ts
export type ResultadoTelefono =
  | { ok: true; nacional: string }                        // R15: dígitos del número nacional
  | { ok: false; motivo: "invalido" | "pais_sin_reglas" }; // R14 | R16
export function validarTelefonoDelPais(raw: string, paisId: string): ResultadoTelefono;
```

Usa `isSupportedCountry(paisId)`. Si es `false` (p. ej. los países de prueba `XA`–`XZ`), devuelve
`pais_sin_reglas`. Si no, usa `parsePhoneNumberFromString(raw, paisId)` de `libphonenumber-js/max`
(metadatos completos: valida por tipo de línea, no solo por largo) y exige `isValid()` y `country ===
paisId`. Así un número válido de otro país no pasa como de este.

**Puerto `IReglasPaisEmpresa`** (`lib/interfaces/services/IReglasPaisEmpresa.ts`):

```ts
export interface ReglasPais {
  paisId: string;
  zonaHoraria: string | null;
  telefono: ReglasTelefono | null;            // null si al país le falta prefijo o dígitos
}
export interface IReglasPaisEmpresa {
  /** País de la empresa del contexto. Lanza EmpresaNoResuelta sin empresa. */
  deLaEmpresa(): Promise<ReglasPais>;
  /** Igual, pero lanza PaisSinZonaHoraria si falta la zona (R28). */
  zonaHoraria(): Promise<string>;
  tipoDocumento(idOValue: string): Promise<TipoDocumentoDTO | null>; // solo del país de la empresa (R11)
}
```

- Implementación: `lib/services/ReglasPaisEmpresaService.ts`, sobre `IPaisRepository.deLaEmpresa` y
  un método nuevo `IPaisRepository.tipoDocumentoDelPais(paisId, idOValue)`. `PaisDTO` gana
  `prefijoTelefonico`, `telefonoDigitosNacionales` y `zonaHoraria` (nullable).
- **Sin caché entre empresas (R30).** Cada `deLaEmpresa()` es una consulta por clave primaria. Sí se
  permite recordar el resultado dentro del mismo marco de `conEmpresa` (el objeto de contexto de
  `lib/db/contexto-empresa.ts`), que muere con la petición o con la iteración de `paraCadaEmpresa`.
  Nunca en una variable de módulo.
- Errores nuevos en `lib/db/errores-pais.ts`: `PaisSinZonaHoraria` (R28) y `PaisIncompleto` (R6). Se
  traducen en `withErrorHandler` a `{ status: "error" }` con mensaje genérico, sin PII.
- Los tests unitarios inyectan `reglasPaisFijas({...})` desde `tests/fabricas/reglas-pais.ts`.

**Validación en los servicios (R9–R17).**

| Punto | Archivo | Qué cambia |
|---|---|---|
| Alta de usuario | `UsuarioService.crear` | Valida tipo (R11), documento (R10) y teléfono (R14, R16). Guarda el teléfono como `nacional` (R15). |
| Edición de usuario | `UsuarioService.editar` | Solo si cambia `telefono`, valida teléfono (R14). Solo si cambia `tipoIdentificacionId`, valida tipo (R11) y el documento guardado contra el tipo nuevo (R12). Si no cambia ninguno, no valida (R9). |
| Postulación de mensajero | `PostulacionMensajeroService` (al recibir) y `AprobacionPostulacionService` (al aprobar) | Igual que el alta. El tipo llega como `value` (`lib/types/postulacion-mensajero.ts`), se resuelve con `tipoDocumento(value)`. |
| Alta de empresa | `OrganizacionService.altaEmpresa` | Corre en plataforma con el país elegido (no hay contexto de empresa). Usa `IPaisRepository.porId(paisId)`: si el país está incompleto, R6 (`validation_error` en `paisId`). Valida `maestro.telefono` y `maestro.documento`/`tipoDocumento` con las reglas de **ese** país. Los errores van en `maestro.telefono`, `maestro.documento` y `maestro.tipoDocumento`. |
| Usuario de plataforma | `ArranqueSuperadminRepository`/su servicio, `UsuarioService` sin empresa | Sin cambios: `numericIdentifierSchema` (R17). |
| Usuarios sintéticos de API key | `ApiKeyRepository`, `lib/utils/api-key-identity.ts` | Sin cambios: su documento es sintético y no es de una persona. |

**Fuera de libphonenumber (P8, cerrada el 2026-11-03).** El teléfono del destinatario de una orden
(alta, carga masiva, API, corrección de datos), el de la tienda y el de la postulación de vehículo o
bodega no se validan con la librería. Siguen aceptándose como hoy y solo se normalizan con el
prefijo del país para WhatsApp (R18).

Los schemas zod de borde (`lib/types/usuario.ts`, `postulacion-mensajero.ts`, `organizacion.ts`)
pasan a validar solo la forma (texto no vacío, tope de largo). La regla del país vive en el servicio
porque depende de la empresa, que el schema no conoce. Contrato de respuesta sin cambios: `{ status:
"validation_error", fieldErrors }` y `{ status: "conflict", campo }`.

`UserRepository.listTiposIdentificacion()` filtra por el país de la empresa y por `activo`, y ordena
por `orden` (R5). `TipoIdentificacionItem` gana `nombre` y `clave`.

### 4.3 Hora en el servidor (R22–R24, R27)

Regla para el implementer: **todo servidor que hoy llama a una función `*CR` de fecha u hora pasa a
la gemela de `calendario-zona.ts` con la zona que da `IReglasPaisEmpresa.zonaHoraria()`**.

- **Servicios**: reciben `IReglasPaisEmpresa` por constructor, con la implementación real como valor
  por defecto en su `build*`. Leen la zona una vez por operación.
- **Repositorios con SQL por día** (`FinanzasDiario`, `IngresosAnalitica`, `CohorteCarga`,
  `ConteoCargadasPorDia`, `TableroDia`, `CierreDia`, `GestionOrden`, …): no leen la zona. Siguen
  recibiendo los límites ya calculados, que ahora calcula su servicio con la zona. Se mantiene la
  regla de esos archivos: nada de `AT TIME ZONE` en el SQL. Donde hoy un repositorio llama a
  `fecha-cr` por su cuenta, el límite pasa a parámetro de su interfaz.
- **Schemas zod con «hoy»** (`esFechaFutura` en `lib/types/gestion-orden.ts`, `wallet*.ts`,
  `liquidacion.ts`, `aporte-capital.ts`, `gasto-fijo-plantilla.ts`, `filtro-dias-cr.ts`, …): la
  comprobación contra «hoy» sale del schema y pasa al servicio. Si el schema la necesita, se vuelve
  una fábrica `(zona) => schema`, construida en el servicio. El schema conserva la validación de
  forma (`esFechaCalendarioValida`).
- **Páginas de servidor** (`app/(app)/ordenes/page.tsx`, `wallet/mensajeros/page.tsx`,
  `recepcion-satelite/en-bodega/page.tsx`): calculan los valores por defecto con la zona de la
  empresa y los pasan por props. El componente cliente no cambia.
- **Rastreo público (R27)**: `RastreoPublicoService` ya resuelve la orden y abre su empresa; toma la
  zona de `IReglasPaisEmpresa`. `RASTREO_PUBLICO_ZONA_HORARIA` se retira de `lib/config/rastreo-publico.ts`.
  El formato del desfase de SL-37 no cambia.
- **Aviso de reparto de mañana**: `OFFSET_CR_HORAS` de `lib/config/aviso-reparto-manana.ts` se
  sustituye por `desfaseEnMs(now, zona)` de la empresa.
- **Informes de WhatsApp y plantillas** (`lib/whatsapp-envios/informes/**`, `lib/types/plantilla-datos.ts`,
  `lib/whatsapp-envios/proxima-ocurrencia.ts`): reciben la zona del envío, que es de una empresa.
- **API por key** (`app/api/ordenes/api-key/**`, `lib/api/analitica-api-key-rango.ts`,
  `lib/api/openapi-spec.ts`): el rango de fechas se interpreta en la zona del país de la empresa de
  la key. El texto de OpenAPI dice «zona horaria del país de la empresa» en vez de «-06:00».

Inventario de archivos de servidor afectados: `tasks.md > Archivos esperados`. Lo sacó
`Grep` de los importadores de `fecha-cr`, `hora-cr`, `dia-reparto`, `separador-dia-cr`,
`ventana-dia-cr`, `jornada-cierre`, `periodicidad`, `tiempo-relativo`, `fecha-dia-iso`,
`fecha-movimiento-manual`, `filtro-dias-cr` y de los literales `America/Costa_Rica`, `CR_OFFSET`
y `OFFSET_CR`. Si un archivo de la lista solo los nombra en un comentario, se actualiza el
comentario y nada más.

## 5. Autorización y módulos

- **Escritura del catálogo**: solo plataforma. En esta ficha no hay action que lo escriba (la siembra
  es por migración). La base lo garantiza: `REVOKE` a `servi_app` (R4).
- **Lectura**: la empresa, por RLS (`pais_lectura`, `tipo_identificacion_lectura` +
  `tipo_identificacion_del_pais`) y por el filtro del repositorio.
- **Autorización de las operaciones** (alta y edición de usuario, postulación, alta de empresa): la
  de siempre, en sus actions. Esta ficha no cambia quién puede hacer qué.
- **Módulos**: todo es núcleo. No hay puerta de módulo nueva ni entrada nueva en
  `lib/modulos/reparto.ts`.

## 6. Jobs y crons (R24–R26, P2, P6)

### 6.1 Jobs recurrentes de la cola: una serie por tipo, corrida por zona

Hoy `liberar_reprogramadas` (00:00 CR) y `analitica_rollup_diario` (00:30 CR) son una serie sin
empresa. `conSuEmpresa` los corre una vez por empresa con `paraCadaEmpresa`.

- `RecurrenciaSpec.siguiente(now)` pasa a `siguiente(now, zonas: readonly string[])`.
  `JobQueueService` carga `zonas` antes de llamarla con un método nuevo,
  `IPaisRepository.zonasConEmpresas()`. Es una lectura de plataforma: `SELECT DISTINCT p.zona_horaria
  FROM pais p JOIN organizacion o ON o.pais_id = p.id WHERE p.zona_horaria IS NOT NULL`, con su
  entrada en `EXCEPCIONES_DE_PLATAFORMA`, ficha `SLT-42`. Las recurrencias que no son diarias
  ignoran `zonas`.
- Próxima corrida = el mínimo, entre `zonas`, de `proximaHoraLocal(now, zona, hh, mm)` (R25). Para
  esa zona, `dedupeKey = <prefijo>:<zona>:<fecha local>`.
- El handler lee la zona de su `dedupe_key`. Dentro de cada empresa compara la zona de la empresa
  con la de la corrida: si no coinciden, no hace nada (R25). Si coinciden, calcula «hoy» o «ayer» con
  esa zona.
- **Compatibilidad del despliegue (R26).** El job pendiente de antes del despliegue tiene una clave
  sin zona (`liberar_reprogramadas:2026-11-04`). El handler lo trata como «todas las empresas, cada
  una con su zona» y su `siguiente` ya agenda con el formato nuevo. Con solo CR, los instantes no
  cambian (00:00 y 00:30 CR). Si la siembra del arranque coincidiera con el pendiente viejo, las dos
  corridas caen en el mismo instante y la segunda no cambia nada: las dos operaciones ya son
  idempotentes por empresa y día (features 46/90 y 124, R27), y un test lo fija.
- Con varias zonas, la serie se despierta una vez por zona y día, y cada empresa se procesa una vez
  por su día local (R26).

### 6.2 Crons de Vercel

`corte-diario`, `generar-gastos-fijos`, `snapshot-ranking`, `avisos-diarios`, `aviso-reparto-manana`,
`liberar-reprogramadas` y `procesar-devueltas-sla` siguen con el horario de `vercel.json`. Dentro de
`paraCadaEmpresa`, cada servicio calcula la fecha con la zona de **su** empresa (R24). Una empresa
cuyo país no tiene zona falla sola y las demás corren (R28; `paraCadaEmpresa` ya aísla los fallos).
El horario con varias zonas es P6 (cerrada el 2026-11-03): los crons siguen a hora fija UTC y es
deuda para cuando entre el primer país con otra zona. La anota el leader en `progress/deudas.md`.

## 7. Dependencia nueva: `libphonenumber-js`

Se aprueba con este spec (regla 7 de `CLAUDE.md`). Va en `dependencies` y se usa **solo en el
servidor** en esta ficha (`lib/validacion/telefono.ts`, solo lo importan servicios; sin `server-only`, desvío 8). SLT-81 decidirá si la
lleva al cliente.

- **Qué código nos ahorra.** Las reglas de numeración por país: prefijos, largos, tipos de línea
  (móvil o fijo) y rangos asignados, con sus metadatos actualizados (los de Google). Escribirlas a
  mano para CR ya es frágil y para cada país nuevo es imposible.
- **Variante:** `libphonenumber-js/max` (metadatos completos). En el servidor el tamaño no importa,
  y `min` solo valida el largo.
- **Los cuatro checks** (`docs/architecture.md > Dependencias de terceros`). Los verificó el leader
  el 2026-11-03. Pasan los cuatro:

  | Check | Verificado (2026-11-03) |
  |---|---|
  | 1. No `deprecated` | No marcada (metadatos `latest` del registro). |
  | 2. Release en los últimos 12 meses | Última versión 1.13.15; `time.modified` del registro: 2026-10-08. |
  | 3. ≥ 10 000 descargas semanales | 39 658 588 (2026-10-27..2026-11-02, api.npmjs.org). |
  | 4. Licencia | MIT. |

- Al aprobarse: fila en `docs/dependencias.md` (la guardia `guard-dependencias-aprobadas` lo exige) y
  `pnpm add libphonenumber-js`.

## 8. Guardia nueva (R29)

`tests/unit/guards/pais-sin-literales.guardia.test.ts` recorre `lib/**`, `app/api/**` y
`app/**/page.tsx`/`layout.tsx`, y falla si encuentra:
- `America/Costa_Rica`;
- un desfase fijo de CR: `CR_OFFSET`, `OFFSET_CR`, `6 * 60 * 60 * 1000` cerca de un nombre con `CR`,
  `T06:00:00`;
- el literal `506` como prefijo (`"506"`, `'506'`, `+506`, `506${`);
- un import de `@/lib/utils/(fecha-cr|hora-cr|separador-dia-cr|telefono-cr|whatsapp-telefono)`.

La lista de excepciones (`tests/unit/guards/_pais-sin-literales-excepciones.ts`) lleva la ruta, la
ficha (`SLT-81`, `SL-22` o, desde el 2026-11-06, `SLT-90` para los planes; al cierre se movieron desde `SLT-86`) y el motivo. Además de la guardia, el test exige que la lista no crezca
respecto de un tope numérico escrito en el mismo archivo (patrón de `EXCEPCIONES_SQL_A_MANO`). Los
envoltorios `*-cr.ts` están en la lista: sí contienen el literal, porque la UI aún los usa.

## Desvíos aceptados en implementación (2026-11-04)

Decididos por el humano tras la tanda 1 (`progress/features/SLT-42.md > Decisiones`, 2026-11-04):

1. **Migración `20261107120100`: inserta «ruc» y «pasaporte» si faltan**, en vez de abortar (§2). Ninguna
   migración los creaba antes (los sembraba `db:seed`, que corre después de `migrate deploy`), así que en una
   base nueva o en CI la precondición fallaba. Inserta filas completas con `ON CONFLICT DO NOTHING` y, si ya
   existen, solo rellena las columnas nuevas. En producción el resultado es el del design.
2. **Tipo de documento inactivo:** `tipoDocumentoDelPais` y `IReglasPaisEmpresa.tipoDocumento` lo devuelven con
   `activo: false` (no `null`), y el servicio lo rechaza (R11) con un mensaje propio.
3. **`scripts/seed-catalogos.ts` ya no siembra tipos de documento**: solo los crea la migración.
4. **La guardia `geografia-predicado-unico` se acota a geografía** (provincia, cantón, distrito y nodo
   geográfico). Deja pasar `activo: true` en otras tablas, como `tipo_identificacion` (filtro de R5).

Decididos por el humano tras el bloque 7 (`progress/features/SLT-42.md > Decisiones`, 2026-11-06):

5. **`AT TIME ZONE` parametrizado en los repositorios que agrupan por día en SQL** (§4.3 y alternativa 2
   de §9). `ConteoCargadasPorDiaRepository`, `CohorteCargaRepository` (fragmento compartido
   `diaDeCargaEnZona`) y `FinanzasDiarioRepository` agrupan con
   `(col AT TIME ZONE 'UTC') AT TIME ZONE $zona`, con la zona de la empresa como parámetro: un desfase fijo
   rompía R23 en zonas con horario de verano. La zona llega en `ConsultaConteoEntregas.zona` y como tercer
   argumento de `sumarPorDia`. Sigue prohibido escribir una zona o un desfase en el SQL.
6. **Planes fuera de SLT-42:** `lib/planes/ciclo.ts`, `cobro.ts` y `consumo.ts` pasan a la lista de
   excepciones de R29 con la ficha `SLT-90` (§8; al cierre se movieron desde `SLT-86`).
7. **`lib/utils/whatsapp-telefono.ts` se borra** con sus tests: no tenía consumidores de producción.

Registrado tras la revisión (`progress/review_SLT-42.md > m1`, 2026-11-06):

8. **`lib/validacion/telefono.ts` sin `import "server-only"`** (§4.2, §7, T2.4). El paquete `server-only`
   no es dependencia del proyecto (no está en `package.json` ni en `docs/dependencias.md`) y ningún
   archivo del repo lo importa; añadirlo exigiría una dependencia nueva con aprobación humana. Hoy solo lo
   importa `lib/services/validacion-documento-telefono.ts`: ningún componente ni página lo importa, así que
   no hay fuga de libphonenumber-js al cliente.

## 9. Alternativas descartadas

1. **Tabla nueva `pais_tipo_documento` y columna nueva `usuario.tipo_documento_id`.** Es lo más
   «limpio» en el papel, pero obliga a rellenar la columna nueva de cada usuario (un `UPDATE` masivo
   sobre `usuario`, aunque sea de columna nueva) o a convivir con dos FK durante meses. Además, las
   ~150 referencias a `tipoIdentificacion` (código y tests) cambiarían. Ampliar `tipo_identificacion`
   da el mismo modelo sin tocar `usuario` (§2.2).
2. **Zona horaria en el SQL (`AT TIME ZONE p.zona_horaria`).** Una sola fuente en la base parece más
   simple, pero los repositorios de analítica y del tablero prohíben, a propósito y con guardias,
   una segunda definición del día dentro del SQL. Se mantiene «límites calculados en TS».
3. **`date-fns-tz` / `@date-fns/tz` / `luxon` para la zona.** Serían otra dependencia nueva para lo
   que `Intl.DateTimeFormat` ya resuelve con el ICU completo de Node (desfase por instante, horario
   de verano; `hora-cr.ts` y `separador-dia-cr.ts` ya usan `Intl` con `timeZone`).
   `calendario-zona.ts` son unas pocas funciones sobre `Intl`, probadas con una zona con horario de
   verano.
4. **Normalizar la clave de WhatsApp con libphonenumber (E.164).** Rompería el gemelo SQL, que no
   puede llamar a la librería, y cambiaría la clave de números de CR que hoy casan (p. ej. un número
   local que empieza por `506`). Por R21 la clave de CR no puede cambiar. libphonenumber valida y las
   cuatro reglas de hoy normalizan.
5. **`google-libphonenumber`.** Es el puerto directo de la librería de Google (Apache-2.0), pero mucho
   más pesado y con una API más incómoda. `libphonenumber-js` usa los mismos metadatos.
6. **Una serie de job por zona horaria** (payload con la zona y siembra por zona). Es correcta, pero
   necesita sembrar y retirar series cuando aparece o desaparece una zona. Con una serie y la zona en
   la `dedupe_key` (§6.1) basta, y con solo CR se comporta igual que hoy.
7. **Zona por empresa.** Descartada por decisión cerrada (2026-10-26): es del país.

## 10. Mapa R → test

| R | Test |
|---|---|
| R1, R3 | `tests/integration/db/migracion-slt42-ida-y-vuelta.test.ts` (CR queda con 506 / 8 / `America/Costa_Rica` y 5 tipos) |
| R2 | `tests/integration/db/tipo-documento-por-pais.test.ts` (CHECK, único `(pais_id, clave)`) |
| R4, R5, R11 | `tests/integration/db/tipo-documento-por-pais.test.ts` (dos empresas, CR y `XA`: cada una ve solo sus tipos; `servi_app` recibe 42501 al escribir en `pais`/`tipo_identificacion`) |
| R6 | `tests/unit/services/organizacion-service-pais.test.ts` |
| R7, R8 | `tests/integration/db/migracion-slt42-ida-y-vuelta.test.ts` (foto de `usuario` antes y después: idéntica; `down` y vuelta a subir) |
| R9, R10, R12, R14, R15, R16 | `tests/unit/services/usuario-service-pais.test.ts`, `tests/unit/services/postulacion-mensajero-service-pais.test.ts` |
| R13 | `tests/integration/db/tipo-documento-por-pais.test.ts` (mismo doc y tipo: `conflict`; otro tipo: ok; otra empresa: ok) |
| R14, R16 | `tests/unit/validacion/telefono.test.ts` (CR válido e inválido, número de PA con región CR, `XA` → `pais_sin_reglas`) |
| R17 | `tests/unit/services/usuario-service-superadmin.test.ts` (ya existe; caso nuevo) |
| R18, R20, R21 | `tests/unit/utils/telefono-pais.test.ts` (tabla de casos de CR comparada con la salida del código anterior, más un país con otro prefijo y largo) |
| R19 | `tests/integration/db/chat-entrante-telefono-cr.test.ts` (ya existe; se parametriza por prefijo y largo) |
| R22, R23 | `tests/unit/utils/calendario-zona.test.ts` (CR, más una zona con horario de verano en sus dos días de cambio) |
| R24, R28 | `tests/integration/db/hora-por-pais-dos-empresas.test.ts` (CR y `XA` con otra zona: misma corrida, fechas distintas; `XB` sin zona falla sola) |
| R25, R26 | `tests/unit/services/jobs/recurrencia-por-zona.test.ts` (una zona: mismos instantes que hoy; dos zonas: la más cercana y solo sus empresas; clave vieja sin zona) |
| R27 | `tests/unit/services/rastreo-publico-zona-pais.test.ts` |
| R29 | `tests/unit/guards/pais-sin-literales.guardia.test.ts` |
| R30 | `tests/unit/services/reglas-pais-empresa-service.test.ts` (dos contextos seguidos devuelven cada uno su país) |
| R31 | Los de integración de arriba con dos empresas (CR y `XA`); sin E2E |

Fábricas: `tests/fabricas/reglas-pais.ts` (doble del puerto) y la de países `XA`–`XZ` de SL-20
(`tests/fabricas/paises.ts`), que gana los tres campos nuevos y tipos de documento de prueba.
