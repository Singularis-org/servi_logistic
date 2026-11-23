# Review SLT-221 «Maestro: corregir correo y cédula de un usuario» — PR 1 (Tanda 1: cédula y base del Histórico)

> reviewer, 2026-11-19. PR #251 a `dev`, rama `feature/SLT-221-corregir-correo-cedula`, HEAD revisado
> `2b6dde06` (con `origin/dev` mergeado). Ruta completa. Alcance: R1601-R1609, tasks T1.1-T1.8.
> Base de integración: `servi_slt221_desechable` (sin `migrate reset`; esquema al día, 334 migraciones).
> MCP de grafo: no usado (el worktree no tiene índice propio); Grep/Read.

## Veredicto: **RECHAZADO** (3 bloqueantes, 3 menores)

## Checklist

### Spec y proceso
- [x] `requirements.md` con EARS numerados (R1601-R1609 para este PR), decisiones D1-D10 cerradas.
- [x] `design.md` abre con `## Lo que ya existe` (búsqueda hecha, lista de reutilizados); el diff no re-crea
      nada de esa lista (reutiliza `validarTipoYDocumento`, `appendAccion`/`resolverActorCongelado`,
      `mapDuplicadoError`). Alternativas descartadas A1-A7.
- [ ] Tasks de la Tanda 1 en `[x]`: **T1.7 y T1.8 sin marcar** (T1.7 abierta porque el E2E no se corrió en
      local; ver B1/B2).
- [x] Tamaño: `node scripts/tamano-pr.mjs` → `30/40 archivos, 509/1000 líneas de producción, 998/3000 de tests`,
      exit 0.
- [x] Sin dependencias nuevas.
- [ ] `progress/features/SLT-221.md` no existe (evidencia de T1.8). Ver m3.

### Trazabilidad R → test (verificado leyendo cada test)
| R | Test | Estado |
|---|---|---|
| R1601 | `usuario-service-cedula.test.ts` (normaliza, par tipo+cédula) + `usuario-cedula-corregida.test.ts` (UPDATE real) | OK |
| R1602 | `usuario-service-cedula.test.ts` (tipo guardado, tipo nuevo, sin empresa; `repo.update` no llamado) + `usuario-form.test.tsx` | OK |
| R1603 | `usuario-cedula-corregida.test.ts` (índice real, misma empresa choca, otra no) + service + `usuario-form.test.tsx` («Ya está en uso por otro usuario» como descripción accesible) + `usuarios.test.ts` | OK |
| R1604 | `usuario-cedula-corregida.test.ts` (fila con anterior, nuevo, entidad, actor, empresa; mismo lote con el rol) | OK |
| R1605 | `usuario-cedula-corregida.test.ts` (mismo documento + otro cambio: sin fila, con control positivo) | OK |
| R1606 | `usuario-form.test.tsx` (habilitado, viaja en el payload) + `e2e/usuario-corregir-cedula.spec.ts` | **E2E rojo en CI (B1)** |
| R1607 | `usuario-schema.test.ts` + `usuarios.test.ts` | OK |
| R1608 | `usuario-cedula-corregida.test.ts` (254 cabe entero; 255 aborta la transacción entera) | OK |
| R1609 | `historial-accion-escrituras-cubiertas.guardia.test.ts` (catálogo, categoría, etiquetas) + E2E (fila en pantalla) | **E2E rojo en CI (B1)**; descarga sin test propio (m2) |

### Verificación ejecutada por mí
- 7 archivos del diff (integración de cédula, service, schema, acciones, formulario, dos guardias):
  `Test Files 7 passed (7) · Tests 252 passed (252)`. La integración corre de verdad (7 `✓` con tiempos; no
  `skipped`).
- Los 9 tests de conteo/orden de migraciones + `tests/unit/historial-accion/`: `Test Files 11 passed · Tests 212 passed`.
- **Mutaciones pedidas (todas revertidas; `git status` limpio después):**
  1. Quitar `organizacion_id` de `usuario_cedula_key` (DROP/CREATE en la desechable, restaurado con su
     definición exacta y comprobado «igual») → rojo «R1603: el mismo documento en OTRA empresa no choca».
  2. Quitar la condición «cambió» (`despues.cedula !== previo.cedula`) en `UserRepository.update` → rojo
     «R1605: reenviar el mismo documento…».
  3. Aceptar `email: z.string().email()` en `actualizarUsuarioSchema` → 3 rojos (`usuario-schema.test.ts` ×2,
     `usuarios.test.ts` «R1607: una edición con email es validation_error y no llega al service»).
  4. Extra, sobre el archivo real: `nota: previo.cedula` en la entrada hermana `usuario_zona_cambiada` →
     rojo en la guardia (`(entrada usuario_zona_cambiada): cedula`).
- CI del PR #251 (run 44612682204): `estatico` verde, `e2e (reparto)` verde, **`e2e (aislamiento)` ROJO**; vitest
  y `e2e (dinero)` aún en curso al escribir esto.

### Multi-empresa / RLS
- [x] Sin tabla nueva. `update` sigue por `updateMany({ where: { id } })` bajo la extensión de empresa; el
      `appendAccion` va en la misma transacción. El duplicado se decide por el índice `(organizacion_id,
      tipo_identificacion_id, cedula)`, probado contra Postgres (mutación 1).
- [x] Sin literales de país/moneda en código de producción nuevo.

### Migración `20261120120000_slt221_historial_correo_cedula`
- [x] Posterior a la última de `dev` (`20261119120100_cobro_plataforma_ocurrido_utc`).
- [x] Aditiva: dos `ADD VALUE IF NOT EXISTS` + ensanchar `varchar(60→254)` (no reescribe la tabla; no se usan
      los valores nuevos en la misma transacción).
- [x] `down.sql` coherente: borra las filas de los dos tipos (no hay trigger que impida `DELETE` en
      `historial_accion`), quita los valores con la función dinámica del molde SLT-211 (lista vigente de
      `pg_enum`) y estrecha con `left(…, 60)`. Ida y vuelta probada por el implementer en la desechable (no la
      repetí).
- [x] `db/schema.prisma` al día (dos valores, `@db.VarChar(254)`, comentario D10).

### Guardia `historial-accion-sin-datos-cliente`
- [x] Excepción acotada a `{ archivo: UserRepository.ts, accion: usuario_cedula_cambiada | usuario_email_cambiado }`;
      `usuario_email_cambiado` marcada `escritorPendiente` con autocomprobación (si aparece el escritor, la
      entrada pendiente se pone roja).
- [x] La ampliación (barrer también los objetos `{ accion: "<tipo>" … }`) solo AÑADE hallazgos: en los archivos
      sin excepción el barrido viejo sigue igual y se suma el nuevo; en `UserRepository.ts` solo se blanquea
      el objeto cuyo `accion` está en la lista. La guardia sigue verde en todos los puntos de escritura, y la
      mutación 4 la pone roja. Cabecera con la consecuencia aceptada de D10.

### Formulario y E2E sin Tanda 2
- [x] `UsuarioForm.tsx`: solo quita `disabled` de «Número de documento» y añade `cedula` al payload; «Email»
      sigue deshabilitado; nada de `CambioCorreoUsuario` ni de confirmación.
- [x] `e2e/usuario-corregir-cedula.spec.ts`: solo cédula + Histórico; registrado en `aislamiento`.

## Hallazgos

### B1 — BLOQUEANTE: el E2E de R1606/R1609 está ROJO en CI
`e2e (aislamiento)` del run 44612682204 cae en el `beforeAll`, antes de abrir la pantalla:

```
Invalid `dueno.tipoIdentificacion.findFirstOrThrow()` … e2e/usuario-corregir-cedula.spec.ts:51
  where: { paisId: "CR", clave: "cedula" }
No record was found for a query.
```

Las claves del catálogo por país son `cedula_fisica`, `cedula_juridica`, `dimex`… (`db/schema.prisma`,
comentario de `TipoIdentificacion.clave`); no hay `(CR, "cedula")` en la base del CI. El test falla en el
intento y en el reintento, así que R1606 (en pantalla) y R1609 («fila visible en el Histórico») no tienen
un test que pase. **Qué falta:** sembrar el tipo con la clave real del catálogo (la que use la regla de 9
dígitos de `cedulaFisica()`), correr el E2E en verde y marcar T1.7.

### B2 — BLOQUEANTE: sin constancia de los E2E afectados corridos en local
`docs/perfil-agentes.md > reviewer`: «PR que toca `db/`, pantallas o dinero sin constancia de los E2E
afectados corridos en local» es bloqueante. Este PR toca `db/` y `UsuarioForm.tsx`, y la bitácora dice «E2E:
no corrido en local (lo corre el CI, por indicación del leader)». B1 es justo el rojo que ese paso evita.
**Qué falta:** en base desechable nueva + build (`NEXT_PUBLIC_APP_URL` como en `gate.yml`), correr en local
`e2e/usuario-corregir-cedula.spec.ts` y los otros dos que el `grep -rl` del perfil devuelve
(`e2e/tope-intentos-por-empresa.spec.ts`, `e2e/tarifas-valor-propio-mensajero.spec.ts`), y dejar las salidas
en `progress/impl_SLT-221.md`.

### B3 — BLOQUEANTE: el formulario envía `cedula` siempre y bloquea editar usuarios con un documento de más de 30 caracteres (regresión)
Desvío declarado «el formulario envía `cedula` siempre»: **no lo acepto**. `actualizarUsuarioSchema.cedula`
es `documentoForma` (`max(30)`), y el formulario valida con ese schema en el cliente (`UsuarioForm.tsx:300`)
antes de llamar a la acción. Antes de este PR la cédula no viajaba en la edición; ahora sí, aunque no se
toque, así que un usuario cuyo documento guardado pasa de 30 ya no puede editar NINGÚN campo:
- las cuentas `apiKey`: su cédula es `APIKEY-<slug>` (`lib/utils/api-key-identity.ts`), con identificador
  hasta 60 caracteres (`lib/types/api-key.ts`), y se abren en el mismo formulario (el select de rol se
  conserva bloqueado para ellas; `UserRepository.list` solo excluye `ROLES_PLATAFORMA` = superadmin).
  Comprobado:
  `cedulaSintetica(slugify("Integracion Tienda Principal Norte"))` → 41 caracteres → `safeParse` = `false`,
  `{"cedula":["Too big: expected string to have <=30 characters"]}`;
- las cédulas guardadas antes de SLT-42, cuando el borde era `z.string().min(1)` sin tope.

Rompe lo que SLT-42 R9/P1 protege («un documento guardado antes no bloquea editar otro campo»), y que el
propio service sigue respetando (`cambiaCedula` solo valida si cambia). **Qué falta:** que el payload lleve
`cedula` solo cuando difiere de la guardada (o cualquier otra vía que no valide el documento sin tocar), y
un test que lo fije: editar el nombre de un usuario con una cédula guardada de más de 30 caracteres pasa y
no manda `cedula`.

### m1 — menor (para el PR 2): comentario de `VALOR_MAX_CHARS` desfasado
`lib/types/historial-accion-etiquetas.ts`: `VALOR_MAX_CHARS = 60` sigue diciendo que es la anchura de la
columna, que ahora es 254. No tocarlo es correcto (lo usa `valorDeCatalogo` para catálogos y subirlo cambiaría
su recorte), pero en el PR 2 el correo puede pasar de 60: ese PR debe dejar claro en el comentario que el
tope es de `valorDeCatalogo`, no de la columna, y que el correo NO pasa por él.

### m2 — menor: R1609 «en la descarga» sin test propio
La descarga usa `ACCION_LABELS` y `valorLegible` genéricos (`historial-acciones-descarga-columnas.ts`), así que
los tipos nuevos salen por construcción (Record exhaustivo). Aceptable, pero el mapa de trazabilidad no nombra
un test de la descarga; basta citarlo o añadir una aserción en el PR 2.

### m3 — menor (leader): `progress/features/SLT-221.md` no existe
T1.8 pide ahí la evidencia del cierre y la comprobación de lo que el usuario ve.

## Desvíos declarados

| Desvío | Juicio |
|---|---|
| Guardia ampliada (barre objetos `{accion: …}`) | **Aceptado.** Necesario para la contraprueba (las entradas se arman con `entradas.push` fuera de `appendAccion`); solo suma hallazgos, la excepción blanquea únicamente las dos entradas declaradas, y la mutación 4 la pone roja. |
| 11 tests de conteo/orden fuera de «Archivos esperados» | **Aceptado.** Conteos 86→88 y orden de migraciones, mismo patrón que SLT-211; verdes. |
| `VALOR_MAX_CHARS = 60` sin tocar | **Aceptado**, con m1 para el PR 2. |
| `down.sql` borra filas de los dos tipos | **Aceptado.** Lo pide design §2.1; documentado en el encabezado; sin trigger que lo impida. |
| `playwright.config.ts` fuera de lista | **Aceptado.** La guardia `e2e-sin-saltos` exige registrar el spec. |
| El formulario envía `cedula` siempre | **Rechazado** → B3. |
| El E2E siembra su propio usuario | **Aceptado** como enfoque, pero la siembra está rota → B1. |

## Para la vuelta 2
Corregir B1 y B3, correr los E2E afectados en local (B2) y dejar sus salidas en la bitácora; marcar T1.7.

## Vuelta 2 (acotada a 9b158401..58eee134)

### Veredicto vuelta 2: **APROBADO** (0 bloqueantes, 1 menor nuevo)

- **B1 — resuelto.** `e2e/usuario-corregir-cedula.spec.ts` siembra el tipo con `(paisId: "CR", clave: "cedula_fisica")`,
  la clave real del catálogo. Hay constancia de que pasa en local (B2).
- **B2 — resuelto.** La bitácora (`progress/impl_SLT-221.md`, vuelta 2) deja constancia de una base nueva
  `servi_slt221_e2e` con deploy, seed y `next build` (`NEXT_PUBLIC_APP_URL` en el puerto del E2E), y de
  `playwright test` con los tres specs afectados más la dependencia `plataforma-vacia`: **34 passed, 0 failed,
  0 flaky, `E2E_EXIT=0`**. También `./init.sh` con `INIT_EXIT=0`. No volví a correr el E2E.
- **B3 — resuelto.** `UsuarioForm.tsx` solo manda `cedula` si `form.cedula !== usuario?.cedula`. Nuevo test
  «SLT-42 R9: sin tocar el documento, editar otro campo no manda `cedula` aunque la guardada pase de 30»
  (cédula `APIKEY-` de 67 caracteres; edita el nombre; afirma que se envía sin `cedula` y que el campo no
  queda inválido). **Mutación:** volví a poner `cedula: form.cedula` sin condición y ese test cae
  (`1 failed | 37 passed`); lo revertí y el árbol quedó limpio. Sin la mutación,
  `usuario-form.test.tsx` + `historial-acciones-descarga-columnas.test.ts` dan `56 passed`. R1606 sigue
  cubierto: el test «el documento editado viaja en el payload» cambia la cédula y la ve enviada.
- **m2 — resuelto.** Test de la descarga con `usuario_cedula_cambiada` pasada por `aDTO` real. Los literales
  del contrato están escritos a mano: etiqueta, «Cambia permisos», entidad, anterior y nuevo. Además, el filtro
  por categoría la encuentra.
- **m3 — resuelto.** Ya existe `progress/features/SLT-221.md`.
- **R1609:** la categoría se ajustó a la etiqueta real «Cambia permisos» (`CATEGORIA_LABELS.cambia_permisos`).
  Es una decisión del leader anotada en el requisito y coherente con lo que muestran la pantalla y la
  descarga. Sin objeción.
- **m1:** sigue pendiente para el PR 2, como estaba previsto.

#### m4 — menor nuevo: textos que dicen una etiqueta que la pantalla no muestra
En `historial-acciones-descarga-columnas.test.ts`, el título del segundo `it` («el filtro por categoría
«Cambia quién puede hacer qué» la encuentra») y el comentario de la línea 31 siguen nombrando la etiqueta
vieja. Basta alinearlos con «Cambia permisos» en el PR 2.

#### CI del nuevo head
Cuando escribo esto, el head del PR en GitHub es `58eee134`, pero solo aparece Vercel; el run de `gate.yml`
de este head aún no ha arrancado o no se ve. El aviso «listo para mergear» queda sujeto a que el leader vea
`gate-completo` y los grupos `e2e` en verde sobre `58eee134`.
