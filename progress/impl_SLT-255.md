# SLT-255 «Planes: prórroga del pago antes del congelamiento» — bitácora de implementación

## Tanda 1 — Enums y catálogo del historial (backend_dev, 2026-11-23)

T1.1, T1.2 y T1.3 hechas. Base: `servi_logistic_slt255`, con `20261127120000_prorroga_enums` aplicada por
`pnpm exec prisma migrate deploy` y el cliente regenerado (`prisma generate`).

### Archivos

Creados:

- `db/migrations/20261127120000_prorroga_enums/migration.sql`: los dos `ADD VALUE IF NOT EXISTS`, sola por el 55P04.
- `db/migrations/20261127120000_prorroga_enums/down.sql`: la función de SLT-136 con el sufijo `_255`, en
  `BEGIN … COMMIT`. Generada copiando la de SLT-121 con `sed`; comparada con `diff` contra la de SLT-136: igual.
- `tests/integration/db/prorroga-migration.test.ts`.

Modificados:

- `db/schema.prisma`: los dos valores en `HistorialAccionTipo` y el comentario de `descongeladaHasta` (design §1.1).
- `lib/types/historial-accion.ts`: catálogo, `CATEGORIA_POR_ACCION` (`mora`) y `ACCION_LABELS`.
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`: el total pasa de 95 a 97, la categoría `mora`
  incluye los dos, y hay un `describe` nuevo de SLT-255.
- `tests/integration/db/mora-migration.test.ts`: un caso en disco. La de la prórroga va detrás de la principal de
  SLT-121, y el `down` de enums de la mora no nombra sus valores.
- Los 8 inventarios de `historial_accion_tipo`, siguiendo el patrón de SLT-121:
  - `caja-459-migration`: los dos se afirman al final y se quitan antes de los cortes (`hastaSlt121`).
  - Los otros 7 añaden los dos a la lista de posteriores: `correccion-resultado-gestion`,
    `historial-accion-cobro-tienda`, `historial-accion-conciliacion-bodega`,
    `historial-accion-orden-zona-reconciliada`, `historial-accion-pago-mensajero-ajustado`,
    `historial-accion-zona-pago-mensajero` y `historial-accion-zona-sinpe`.
- **Fuera de la lista de `tasks.md`:** `tests/integration/db/orden-traspaso-migration.test.ts`. Su lista exacta de
  migraciones posteriores se pone roja con cualquier carpeta nueva; SLT-121 también la amplió. Se añade
  `20261127120000_prorroga_enums`. Con esto el PR queda en 42 archivos, no en los 41 aceptados.

### Qué cubre cada test

| Test | Cubre |
|---|---|
| `prorroga-migration.test.ts` | design §1.2 (base de R14 y R15). En disco: va justo después de SLT-121, sola y con los dos `ADD VALUE`. El `down` va en `BEGIN … COMMIT`, con la función de SLT-136 byte a byte salvo el sufijo, y quita solo los dos. En base propia (`slt255_iv_*`): subir añade solo los dos, al final; el `down` aborta (P0001) si una fila los usa, sin tocar nada; bajar deja la foto igual; bajar otra vez no hace nada; subir otra vez da el mismo esquema. |
| `catalogo-y-choke-point.test.ts` | R14: los dos van a la categoría `mora`, con sus etiquetas, al final del catálogo. Hay 97 tipos. |
| `mora-migration.test.ts` y los 8 inventarios | design §1.2: los dos valores se afirman al final y se quitan antes de los cortes. |

### Verificación (salida real)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit`, salida 0, sin errores.
- `pnpm exec eslint` sobre los 13 archivos TS tocados: salida 0, sin avisos.
- `pnpm exec vitest run` sobre los 12 archivos de test tocados, con `DATABASE_URL` de la base de la feature:
  - prorroga, mora, los 8 inventarios, orden-traspaso y catalogo;
  - `Test Files 12 passed (12)`, `Tests 194 passed (194)`: 0 fallidos y 0 saltados.
- Informativo, fuera del encargo: `historial-accion-escrituras-cubiertas.guardia.test.ts` da **2 rojos esperados**.
  - Los dos casos son «TODO valor del enum tiene productor declarado» y «los 55 tipos del Anexo A … siguen siendo 55».
  - Los dos tipos nuevos todavía no tienen productor ni entrada en el censo. Eso es T2.3, que lo enmienda por spec.
  - `historial-accion-sin-datos-cliente` está en verde.

### Veredicto

Tanda 1 en verde. La guardia del censo sigue roja hasta T2.3, y `orden-traspaso-migration` es un archivo fuera de
la lista de `tasks.md`.

## Tanda 2 — Dominio, repositorio, servicio y actions (backend_dev, 2026-11-23)

T2.1 a T2.5 hechas. Base: `servi_logistic_slt255`. El MCP del grafo no se usó: la tanda se exploró con Grep/Read.

### Archivos

Producción:

- `lib/planes/mora.ts` (T2.1): `plazoVigente`, el estado `con_plazo` en lugar de `descongelada_a_mano`, el orden nuevo
  de `estadoDeMora` (design §2) y `MORA_TEXTOS` (`banner.conPlazo`, `estado.con_plazo`, `errores.sinPlazo`; sale
  `noCongelada`).
- `lib/repositories/_shared/encolar-aviso-mora.ts` (T2.2): las formas `prorroga`, `prorroga_quitada` y `prorroga_vence`
  de `AvisoMoraPayload`, y sus tres dedupes.
- `lib/repositories/MoraEmpresaRepository.ts` e `IMoraEmpresaRepository.ts` (T2.3):
  - `darPlazo` y `quitarPlazo` en lugar de `descongelarAMano`;
  - el helper `filaDelPlazo` toma la fila con `FOR NO KEY UPDATE`;
  - la víspera del plazo entra en `encolarRecordatorios`.
- `lib/services/MoraEmpresaService.ts`, `IMoraEmpresaService.ts` y `lib/types/mora.ts` (T2.4):
  - `darPlazo` y `quitarPlazo`, con `darPlazoSchema` y `quitarPlazoSchema`;
  - los resultados `DarPlazoResult` y `QuitarPlazoResult`;
  - `MoraEmpresaVista.plazo`, que reemplaza a `descongelar`. `rangoDeDescongelar` pasa a `rangoDelPlazo`.
- `lib/actions/mora-empresa.ts` (T2.5): `darPlazoEmpresaAction` y `quitarPlazoEmpresaAction`.
  - `quitarPlazoEmpresaAction` lleva por ahora `@sin-superficie`, porque ninguna página la importa hasta T4.2. Sin la
    anotación, `superficie-de-uso.guardia` se pone roja.
  - La guardia exige quitar la anotación en cuanto `page.tsx` la ligue.

**Fuera de la lista de la tanda**, cambios mínimos para que compile:

- `lib/planes/jobs-mora.ts` (T3.2): una guarda `if (aviso.tipo !== "descongelada") return null;` en
  `contenidoVigente`. Sin ella, la unión ampliada no compila. El zod del payload todavía no deja pasar los tipos
  nuevos, y T3.2 la reemplaza.
- `app/(app)/_components/AvisoMora.tsx` (T4.1): el caso `con_plazo` con `banner.conPlazo`.
- `app/(app)/plataforma/empresas/[organizacionId]/_components/MoraEmpresa.tsx` (T4.2):
  - `DarPlazoResult` y `datos.plazo`;
  - el caso `con_plazo`, que sigue con el texto viejo «Descongelada a mano hasta…»;
  - `descongelada`, `prorroga` y `sin_cambio` cierran el diálogo;
  - sale `no_congelada`. La prop sigue llamándose `descongelar`.
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx` (T4.2): liga `darPlazoEmpresaAction` en la prop
  `descongelar`.

Tests:

- Ampliados: `tests/unit/planes/mora.test.ts`, `tests/integration/repositories/mora-empresa-repository.test.ts`,
  `tests/unit/services/mora-empresa-service.test.ts` y `tests/unit/actions/mora-empresa.test.ts`.
- Guardias enmendadas:
  - `historial-accion-escrituras-cubiertas` (censo): dos entradas de `darPlazo`, una por tipo y con su mutación, y una
    de `quitarPlazo`. El total pasa de 95 a 97;
  - `historial-accion-sin-datos-cliente`: dos excepciones `SLT-255`, con su control positivo y su contraprueba.
- Renombres mínimos en tres dobles y componentes:
  - `tests/unit/planes/jobs-mora.test.ts`: el doble del repositorio;
  - `tests/components/AvisoMora.test.tsx`: el caso `con_plazo` con el texto nuevo;
  - `tests/components/MoraEmpresa.test.tsx`: `DarPlazoResult`, `plazo` y `con_plazo`. Sale la fila `no_congelada`.

### Qué cubre cada test

| Requisito | Test |
|---|---|
| R1 | `mora.test.ts` > «SLT-255 R1 — plazoVigente» (hasta las 23:59:59, ayer no, congelada → `null`). `mora-empresa-repository` > «R1: un plazo ya vencido no cuenta como anterior» |
| R2 | `mora-empresa-repository` > «R2, R15, R21: con la empresa congelada, la descongela…» |
| R3 | `mora-empresa-repository` > «R3, R15, R16: sin congelar, deja la prórroga sin tocar la gracia, las facturas…» y «R3: también a una empresa sin facturas» |
| R4 | `mora-empresa-repository` > «R4, R15, R16: alargar y acortar…» y «R4: la misma fecha vigente responde sin_cambio…» |
| R5 | `mora-empresa-repository` > «SLT-255 quitarPlazo» (ok; sin plazo o vencido; congelada → `sin_plazo`) |
| R6 | `mora-empresa-service` > «darPlazo — R6: …» (los extremos, el hoy de la plataforma, fechas, motivos y el error por campo) y «quitarPlazo — R6» |
| R7 | `mora-empresa-service` > «R4 (SLT-255 R7)» (`forbidden` sin llamadas, `not_found`). `actions/mora-empresa` > las dos actions con la empresa ligada y `forbidden` sin base |
| R8, R9 | `mora-empresa-repository` > «R8, R9: con la prórroga vigente no congela…» y «R9: la primera madrugada después de quitar…» |
| R10 | `mora-empresa-repository` > «R10: si la corrida congeló primero…» y «SLT-255 — R10: darPlazo en paralelo no da 40P01» (5 rondas de dos `darPlazo` y 5 de `darPlazo` contra `congelarSiVencida`, con filas commiteadas y dos conexiones) |
| R11, R12 | `mora.test.ts` > «SLT-255 R11, R12 — estadoDeMora con plazo» y los textos |
| R13 | `mora-empresa-service` > «moraDeEmpresa» (`plazo.vigente` y `porDefecto`, con plazo, vencido y congelada). La pantalla es T4.2 |
| R15 | Las filas y el motivo de 200 en `mora-empresa-repository`, incluido «R15: si el registro falla…». Las dos guardias del historial |
| R16, R17 (encolado) | Los avisos `prorroga` (`dada`, `alargada`, `acortada`) y `prorroga_quitada` en `mora-empresa-repository`. El envío y la relectura son T3 |
| R18 (encolado) | `mora-empresa-repository` > «R18: la víspera del plazo…» y «R18: sin vencidas, o con la empresa congelada…» |
| R21 | `mora-empresa-repository` > «R2, R15, R21…»: el aviso es `descongelada`/`a_mano`, no `prorroga` |

R19, R20, R22 y R23 son de las tandas 3 y 5. R14 quedó en la Tanda 1.

**Prueba de mutación** sobre el cruce en paralelo: sin el `FOR NO KEY UPDATE` de `filaDelPlazo`, los dos casos en
paralelo caen. En la ronda 2, el segundo `darPlazo` no vio la fecha del primero. Se restauró el archivo.

### Verificación (salida real)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: salida 0, sin errores.
- `pnpm exec eslint` sobre los 21 archivos tocados: salida 0, «No issues found».
- `pnpm exec vitest run`, con `DATABASE_URL` de la base de la feature, sobre:
  - `mora.test`, `mora-empresa-service`, `actions/mora-empresa` y `jobs-mora`;
  - las dos guardias del historial y `superficie-de-uso`;
  - `AvisoMora.test` y `MoraEmpresa.test`;
  - `mora-empresa-repository`.

  Resultado: `Test Files 10 passed (10)`, `Tests 393 passed (393)`, sin saltados. El repositorio solo: 32 de 32.
- `pnpm run test:guardias`, antes de la anotación: 1 rojo, `superficie-de-uso`, por `quitarPlazoEmpresaAction`. Con
  la anotación, `superficie-de-uso` pasa 18 de 18. No se volvió a correr el resto de las guardias, que estaba en verde
  (357 archivos pasados).

### Veredicto

Tanda 2 en verde. Quedan dos deudas para la Tanda 4: la anotación `@sin-superficie` de `quitarPlazoEmpresaAction` y los
textos de la UI.

## Tanda 4 — Interfaz (frontend_dev, 2026-11-23)

### Archivos

- `app/(app)/_components/AvisoMora.tsx`: el caso `con_plazo` ya venía de la Tanda 2 (`MORA_TEXTOS.banner.conPlazo`,
  tono aviso, sin enlace). Solo se añadió el comentario de cabecera de SLT-255.
- `tests/components/AvisoMora.test.tsx`: el caso `con_plazo` es ahora `it.each` para maestro y admin. Comprueba que
  sale `status`, `data-tono="aviso"`, sin `alert`, sin «esta madrugada», sin «habilitada hasta» y sin enlace.

### Qué cubre cada test

- R11 → `tests/components/AvisoMora.test.tsx` › «SLT-255 R11: con plazo, el aviso (`status`)…» (maestro, admin).
- R12 → sin cambio de UI. Lo decide `estadoMora` (Tanda 2): los casos `en_plazo` y `al_dia` del mismo archivo siguen en
  verde.
- R13 → ver «T4.2 — Diálogos de la prórroga» abajo.

### Verificación (salida real)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `tsc --noEmit` sin errores.
- `pnpm exec eslint "app/(app)/_components/AvisoMora.tsx" tests/components/AvisoMora.test.tsx` → exit 0, sin avisos.
- `pnpm exec vitest run tests/components/AvisoMora.test.tsx tests/unit/guards/superficie-de-uso.guardia.test.ts` →
  `Test Files 2 passed (2) · Tests 27 passed (27)`.

### T4.2 bloqueada: textos que el spec no fija

design §5.2 fija estos textos:

- el estado «Con prórroga hasta el …»;
- los botones «Dar plazo hasta…» y «Quitar prórroga…»;
- los tres títulos del diálogo «dar plazo»;
- el campo «Hasta»;
- `sin_cambio` → «La fecha es la misma de la prórroga vigente.»;
- `sin_plazo` → `errores.sinPlazo`.

**No fija** estos, aunque son visibles y R13 exige el aviso:

1. El aviso del efecto en el diálogo «dar plazo» sin congelar (con y sin prórroga vigente). Con la empresa congelada,
   sirve el aviso que ya existe, `avisoDescongelar`.
2. El botón de confirmar del diálogo «dar plazo» cuando no descongela. Hoy dice «Descongelar».
3. El diálogo «quitar»: su título, su aviso del efecto y su botón de confirmar.

T4.2 no se tocó, así que `@sin-superficie` sigue en `quitarPlazoEmpresaAction`. No se tocaron `MoraEmpresa.tsx`,
`page.tsx` ni `MoraEmpresa.test.tsx`.

### T4.2 — Diálogos de la prórroga (frontend_dev, 2026-11-23)

Los textos 1 a 3 los fijó el humano (filas «T4.2 — …» de «Decisiones cerradas» en `requirements.md`); van literales.
El MCP del grafo no se usó: se exploró con Grep/Read.

Archivos:

- `app/(app)/plataforma/empresas/[organizacionId]/_components/MoraEmpresa.tsx`:
  - el estado `con_plazo` dice «Con prórroga hasta el dd/mm/aaaa» (sale el texto viejo «Descongelada a mano hasta…»);
  - «Dar plazo hasta…» siempre; «Quitar prórroga…» solo con `plazo.vigente !== null` y sin congelar;
  - `DialogoDescongelar` pasa a `DialogoDarPlazo`: título, aviso y botón según congelada / con prórroga / sin prórroga;
    campo «Hasta» con `min`, `max` y `porDefecto` de `datos.plazo`; `sin_cambio` ya no cierra en silencio: dice «La
    fecha es la misma de la prórroga vigente.» y el diálogo sigue abierto;
  - `DialogoQuitarPlazo` nuevo: título «Quitar plazo de pago», aviso con la fecha vigente, motivo y «Quitar plazo»;
    `sin_plazo` pinta `MORA_TEXTOS.plataforma.errores.sinPlazo`;
  - la prop `descongelar` pasa a `darPlazo` y se añade `quitarPlazo`. Los textos nuevos viven en el `TEXTOS` local de
    la pantalla, junto a los que ya había (el patrón del archivo); `MORA_TEXTOS` no cambia.
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`: liga `darPlazoEmpresaAction` en `darPlazo` y
  `quitarPlazoEmpresaAction` en `quitarPlazo`.
- `lib/actions/mora-empresa.ts`: sale la anotación provisional `@sin-superficie` de `quitarPlazoEmpresaAction`.
- `tests/components/MoraEmpresa.test.tsx`: props nuevas, el estado «Con prórroga hasta el…», el campo «Hasta», y el
  bloque nuevo «SLT-255 R13».

R → test:

- R13 → `tests/components/MoraEmpresa.test.tsx` › «SLT-255 R13 — dar, cambiar y quitar la prórroga de pago»:
  - «Dar plazo hasta…» aparece siempre (5 estados); «Quitar prórroga…» aparece con plazo vigente y no aparece sin
    plazo ni congelada;
  - «el diálogo …» en los tres casos: título, aviso, botón de confirmar y «Hasta» con su valor por defecto (hoy + 7 o
    la fecha vigente), `min` y `max`;
  - dar la prórroga manda motivo y fecha; `sin_cambio` muestra su texto; quitar manda el motivo recortado; sin motivo
    no llega al servidor; `sin_plazo`, `forbidden` y `not_found` se muestran;
  - el estado «con prórroga, hasta cuándo (SLT-255 R13)» en «SLT-121 R32 — lo que ve el superadmin».

Verificación (salida real):

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `tsc --noEmit` sin errores (exit 0).
- `pnpm exec eslint` sobre `MoraEmpresa.tsx`, `page.tsx`, `lib/actions/mora-empresa.ts` y `MoraEmpresa.test.tsx` →
  exit 0, sin avisos.
- `pnpm exec vitest run tests/components/MoraEmpresa.test.tsx tests/components/AvisoMora.test.tsx
  tests/unit/guards/superficie-de-uso.guardia.test.ts` → `Test Files 3 passed (3) · Tests 74 passed (74)`.

### Veredicto

Tanda 4 en verde: T4.1 (R11) y T4.2 (R13), sin `@sin-superficie` pendiente.

## Tanda 3 — Correos (backend_dev, 2026-11-23)

### Archivos

- `lib/services/email/plantillas/mora-aviso.ts`: contenidos `prorroga`, `prorroga_quitada`, `prorroga_vence` y
  `plazoHasta` en `recordatorio`, con los textos de design §4.3 en `MORA_AVISO_TEXTOS`.
- `lib/planes/jobs-mora.ts`: el zod acepta los tres payloads nuevos; `contenidoVigente` relee con `plazoVigente`
  (design §4.2). Se quitó la guarda provisional de la Tanda 2.
- `tests/unit/services/email/plantilla-mora-aviso.test.ts`, `tests/unit/planes/jobs-mora.test.ts`: ampliados.

Nota: el spec no fija los preheaders de los tres correos nuevos. Repiten la primera frase del cuerpo, sin texto
inventado.

### R → test

| R | Test |
|---|---|
| R16 | `plantilla-mora-aviso.test.ts > SLT-255/R16`; `jobs-mora.test.ts > SLT-255/R16, R19, R20` |
| R17 | `plantilla-mora-aviso.test.ts > SLT-255/R17`; `jobs-mora.test.ts > SLT-255/R17, R19` (con y sin vencidas) |
| R18 | `plantilla-mora-aviso.test.ts > SLT-255/R18`; `jobs-mora.test.ts > SLT-255/R18, R19` |
| R19 | `jobs-mora.test.ts`: hasta cambiada, quitada, vuelta a dar, congelada y víspera sin vencidas → no sale |
| R20 | `jobs-mora.test.ts > SLT-255/R20` (envío fallido sigue y lanza); el encolado en la transacción ya lo cubre `mora-empresa-repository.test.ts` (Tanda 2) |
| R22 | `plantilla-mora-aviso.test.ts > SLT-255/R22`; `jobs-mora.test.ts > SLT-255/R22` (`plazoHasta` solo si `h >= fechaLimite`) |

### Verificación

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `tsc --noEmit` sin errores.
- `pnpm exec eslint` de los 4 archivos → exit 0, sin avisos.
- `pnpm exec vitest run tests/unit/planes/jobs-mora.test.ts tests/unit/services/email/plantilla-mora-aviso.test.ts`
  → `Test Files 2 passed (2) · Tests 79 passed (79)`.

### Veredicto

Tanda 3 en verde (R16–R20, R22).

## T5.2 (docs/architecture.md, sección de la mora)

- **Archivo:** `docs/architecture.md` > «Mora y congelamiento (SLT-121)». Nuevo punto «El plazo» (vive en
  `descongelada_hasta`, `plazoVigente`, congelada sin plazo); enums con `empresa_prorroga_fijada` y
  `empresa_prorroga_quitada` (`20261127120000_prorroga_enums`); corrida con `prorroga_vence`; correos con
  `prorroga`, `prorroga_quitada`, `prorroga_vence` y `plazoHasta` del recordatorio; repositorio con `darPlazo` y
  `quitarPlazo` (en lugar de `descongelarAMano`); servicio, actions y estado `con_plazo` del banner.
- **Grep** `descongelarAMano\|descongelada_a_mano`: ya no nombra `descongelarAMano` ni el estado del banner.
  Quedan 4 líneas que son código vigente: el tipo del historial `empresa_descongelada_a_mano` (lo sigue
  escribiendo `darPlazo` al descongelar, R2) y el resultado `descongelada_a_mano` de `organizacion_mora_congelar`,
  que SLT-255 no renombra.
- **Guardia que lee el doc:** `pnpm exec vitest run tests/unit/guards/unicos-por-empresa.guardia.test.ts` →
  `Test Files 1 passed (1) · Tests 15 passed (15)`.
- **Veredicto:** T5.2 hecha; sin código tocado.

## T5.1 — E2E (`e2e/mora-prorroga.spec.ts`, proyecto `dinero`)

- **Archivos:** `e2e/mora-prorroga.spec.ts` (nuevo); `playwright.config.ts` (`"mora-prorroga"` en `dinero`).
- **Fecha de la prórroga:** `H = FL + 2`, con `FL` leída de `factura_plataforma_mora` (gracia 7). El design §7 ponía
  «hoy + 10» como ejemplo, pero la factura cerrada con el atajo de SLT-121 tiene `FL` ≈ hoy + 15 (medido:
  `FL = 2026-12-08`, `H = 2026-12-10`). El test comprueba que `H` no pasa del `max` del campo «Hasta» (hoy + 60).
- **Reloj:** artificio de SLT-121 §11. Corrida 1: `vence_at + 30 min` (00:30 de `FL + 1`); corrida 2:
  `vence_at + (H − FL) días + 30 min` (00:30 de `H + 1`), calculado en SQL.

| Caso | R |
|---|---|
| 1. el superadmin da la prórroga: «Con prórroga hasta el …» y la fila «Dio o cambió la prórroga de pago» | R3, R13, R14, R23 |
| 2. corrida dentro de la prórroga, factura vencida: `descongelada_a_mano`, `congelada_at` NULL | R8, R23 |
| 3. maestro y `admin` ven «Tienes prórroga de pago hasta el …» (`role="status"`) | R11, R23 |
| 4. corrida de `H + 1`: `congelada` | R9, R23 |
| 5. el maestro ve «Empresa congelada por falta de pago» | R23 |

- **Typecheck:** `tsc --noEmit` sin errores. **Lint:** `eslint e2e/mora-prorroga.spec.ts playwright.config.ts`
  sin salida. **Guardia:** `e2e-sin-saltos.guardia.test.ts` → `Tests 38 passed (38)`.
- **Build:** `next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3044` → exit 0.
- **Corrida 1 (`--project=dinero`), INCOMPLETA:** Claude Code la mató por falta de memoria del sistema tras
  147 casos ✓ y 0 ✘ (llegó a `wallet.spec.ts`; no imprimió resumen «N passed»). Incluye:
  ```
  ✓   71-76 [dinero] › e2e\mora-congelamiento.spec.ts › 1. … 6.  (los seis)
  MEDIDO factura 462b02e2-…: fecha límite=2026-12-08; prórroga hasta=2026-12-10
  ✓   77 [dinero] › e2e\mora-prorroga.spec.ts:260:5 › 1. el superadmin da la prórroga … (R3, R13, R14, R23) (1.5s)
  MEDIDO corrida de 2026-12-09 00:30 → {"resultado":"descongelada_a_mano"}
  ✓   78 [dinero] › e2e\mora-prorroga.spec.ts:297:5 › 2. la corrida de madrugada dentro de la prórroga … (R8, R23) (37ms)
  ✓   79 [dinero] › e2e\mora-prorroga.spec.ts:304:5 › 3. el maestro y el admin ven «Tienes prórroga …» (R11, R23) (1.2s)
  MEDIDO corrida de 2026-12-11 00:30 → {"facturas":[…],"resultado":"congelada","saldo_vencido":"1000.00"}
  ✓   80 [dinero] › e2e\mora-prorroga.spec.ts:326:5 › 4. la corrida de la madrugada siguiente … congela (R9, R23) (28ms)
  ✓   81 [dinero] › e2e\mora-prorroga.spec.ts:333:5 › 5. el maestro ve «Empresa congelada por falta de pago» (R23) (265ms)
  ```
- **Verificación completa (implementer, 2026-11-23).** La base es `servi_logistic_slt255_e2e`, la misma de arriba y
  sin recrear. El build es el de las 10:37, posterior al último commit de código (`d647699e`, 10:26).
  Cada comando lleva `E2E_PUERTO=3044` y `NODE_OPTIONS=--max-old-space-size=8192`, y corre en primer plano, uno a uno.
  `dinero` dura más de los 10 min que admite un comando, así que va por lotes de archivos. Entre los lotes de cada
  corrida entran los 27 archivos del proyecto.
  - `playwright test e2e/mora-prorroga.spec.ts --project=dinero`: `5 passed (35.2s)`.
  - **Corrida 1:**
    - `--project=dinero` entero, cortado por mi propio `timeout 590` en el caso 123 (exit 124). Hasta ahí: 122 ✓,
      0 ✘ reales y los 23 archivos anteriores completos. El ✘ del 123 es el corte, no un fallo.
    - El resto (`tarifas-valor-propio-mensajero`, `tope-intentos-por-empresa`, `wallet`, `wallet-mensajeros`):
      `30 passed (5.3m)`.
    - `e2e/dos-empresas-humo.spec.ts` (con `plataforma-vacia`): `18 passed (3.7m)`. La primera vez la cortó un
      `timeout 170` mío en el caso 16; repetida entera, verde.
  - **Corrida 2** (misma base):
    - Lote A, de `ajuste-pago-mensajero-cierre` a `cierre-vencido-modelo` (8 archivos): `35 passed, 1 failed (5.5m)`.
      El rojo es `ajuste-pago-mensajero-cierre.spec.ts:143`, en la preparación del escenario
      (`e2e/_escenarios/crons.ts:83`): «tras 15 pasadas de procesar-jobs, la geocodificación … no falló por
      configuración». En la base había 389 jobs `geocodificacion` `pending` de la corrida 1, y el job de esa orden ya
      tenía el `[geocode:config]` pero seguía `pending`, con `run_after` futuro. Es la cola acumulada en una base
      desechable reutilizada, ya vista en `progress/impl_SLT-190.md` y `progress/impl_SLT-200.md`, y no toca la
      mora. Repetido solo: `2 passed (1.0m)`.
    - Lote B, de `cierres-rediseno` a `pago-plataforma-por-fuera` (9 archivos, con `mora-congelamiento` y
      `mora-prorroga`): `53 passed (6.2m)`.
    - Lote C, de `planes-costo-porcentual` a `tarifas-activacion` (6 archivos): `29 passed (3.9m)`.
    - Lote D, de `tarifas-valor-propio-mensajero` a `wallet-mensajeros` (4 archivos): `30 passed (3.2m)`.
    - `e2e/dos-empresas-humo.spec.ts`: `18 passed (1.9m)`.
  - Ninguna corrida tuvo skipped ni flaky (sin reintentos).
- **Veredicto:** T5.1 hecha. `mora-prorroga` sale verde en las tres corridas (5/5). `dinero` y el humo salen verdes en
  las dos, salvo el rojo de la cola de geocodificación de arriba, que no es de esta feature.
