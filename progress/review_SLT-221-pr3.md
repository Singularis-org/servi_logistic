# Review — SLT-221 «Maestro: corregir correo y cédula de un usuario», PR 3 (UI del cambio de correo)

- Rama `feature/SLT-221-corregir-correo-cedula`, HEAD revisado `72f21e65`.
- Diff: `git diff origin/feature/SLT-221-correo-backend...HEAD` (el backend va en #258, aún fuera de `dev`).
- Alcance: T3.1-T3.3, más m5 y m6 de la review del PR 2. T2.0 (canvas) omitido por decisión de Carlos.
- Reviewer, 2026-11-20.

## Checklist

- [ ] **Trazabilidad R1618-R1627 (UI).** Ver B1: el mensaje de R1624 en la página pública no lo afirma ningún test.
  - R1617: `cambio-correo-usuario.test.tsx` (pedir y reenviar con `envio_fallido`). OK.
  - R1618: `cambio-correo-usuario.test.tsx` (sin pendiente, con pendiente y fecha, vencido, error de lectura) + E2E paso 1. OK.
  - R1619: componente (cancelar y cancelar fallido) + E2E paso 2 (pendiente anulado en la base). OK.
  - R1620: componente (reenvía el MISMO correo y muestra el vencimiento nuevo). OK.
  - R1622: E2E pasos 6, 8 y 9 (correo cambiado en la base, entra con el nuevo y no con el anterior, fila del Histórico con los dos correos). OK.
  - R1623: E2E paso 7 (mismo enlace otra vez → mensaje genérico). OK.
  - R1624: **falta en la UI** (B1).
  - R1626, R1628: E2E paso 5 (sin sesión; al abrir, correo y pendiente intactos). OK, con m2.
  - R1621, R1625, R1627: sin parte de UI; cubiertos por los tests del PR 2.
  - m5 y m6: dos tests m5 y el de reenvío fallido reforzado para m6. OK.
- [x] **Tasks.** T2.0 y T3.1-T3.3 en `[x]`. T3.4 (cierre) queda abierta: incluye esta review y el PR.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs` sale rojo (42/40, 1371/1000) porque mide contra `dev` sin #258: ignorado por indicación del leader. A mano, contra `origin/feature/SLT-221-correo-backend` y sin `specs/` ni `progress/`: **10 archivos, 479 líneas de producción, 527 de tests**. Cabe.
- [x] **Abrir la página no llama a nada (R1626).** `ConfirmarCorreoForm` solo llama a `confirmarCambioCorreo` desde el `onClick`; el `useLayoutEffect` solo hace `replaceState`. Sin enlace en el fragmento, muestra el genérico sin llamar.
- [x] **Textos en español llano y sin filtrar si el enlace existe.** Formato roto, ausente, `invalid_or_expired` y `validation_error` dan el mismo texto de R1623. La página no muestra ni el correo ni el nombre. `correo_en_uso` sí revela que el enlace era válido, pero así lo pide R1624. Ver m3 para un texto.
- [x] **La cuenta apiKey no ve el bloque.** `UsuarioForm.tsx:490`: `!esRolApiKey`. Implementado, pero sin test (m1).
- [x] **`@sin-superficie` quitadas.** Las cuatro (`usuarios.ts` ×3, `confirmar-correo.ts` ×1). `grep "@sin-superficie SLT-221"` fuera de `progress/`: 0.
- [x] **E2E real.** Siembra un `admin` con contraseña y dispositivo confiado; el maestro pide, ve el pendiente, cancela (anulado en la base) y vuelve a pedir; el test pone el hash de un secreto suyo en el pendiente (design §10); abre el enlace sin sesión, comprueba que no cambió nada y confirma; el mismo enlace otra vez da el genérico; entra con el correo nuevo y el anterior da «Correo o contraseña inválidos»; el Histórico muestra «Cambió el correo de un usuario» con los dos correos.
- [x] **Checkpoints.** Sin tablas, migraciones ni queries nuevas en este diff. Sin literales de país en producción (el `CR`/`cedula_fisica` del E2E es la siembra del catálogo, como en `usuario-corregir-cedula`). Sin recursos de Ordenex. Sin dependencias nuevas. `design.md > Lo que ya existe` presente; el diff reusa `FormField`, `Input`, `Button`, `Badge`, `Alert`, `Card`, `Logo`, `formatFechaHoraLegible` y el marco de `/recuperar-contrasena`; no re-crea nada.
- [x] **Reglas del proyecto.** Comentarios explican el porqué. E2E de la pantalla corrido en local (abajo).

## Verificación ejecutada (logs en el scratchpad `rev221pr3/`)

- `pnpm run typecheck`: `TC_EXIT=0`.
- `pnpm run lint`: `LINT_EXIT=0` (0 errores; ningún aviso en los archivos del diff).
- `pnpm run test:guardias`: 360 files, 5424 passed, 1 skipped, `GUARD_EXIT=0`.
- Componentes (`cambio-correo-usuario` + `usuario-form`): 2 files, 53 passed.
- E2E `usuario-cambio-correo` (base `servi_slt221_e2e_pr3`, build de HEAD reusado: ningún fuente de `app/`, `lib/`, `components/` más nuevo que `.next/BUILD_ID`, árbol limpio; `E2E_PUERTO=3321`): **11 passed** (el de SLT-221 + 10 de la dependencia `plataforma-vacia`), `E2E_EXIT=0`.

### Mutaciones propias (cada una aplicada sola, test corrido, archivo restaurado con `git checkout`, árbol limpio después)

| # | Mutación | Resultado |
|---|---|---|
| M1 | `CambioCorreoUsuario.tsx`: `envio_fallido` devuelve `T.errorGeneral` en vez de `T.envioFallido` | **muerta**: 2 tests en rojo (R1617 al pedir y R1617/m6 al reenviar) |
| M2 | `UsuarioForm.tsx:490`: quitar `!esRolApiKey` (la cuenta apiKey ve el bloque) | **sobrevive**: 53/53 verdes (m1) |
| M3 | `ConfirmarCorreoForm.tsx`: `case "correo_en_uso"` → `setFase("invalido")` | **sobrevive por construcción**: ningún test (unitario ni E2E) monta `ConfirmarCorreoForm` ni afirma «Ese correo ya lo usa otra cuenta de tu empresa…» (B1) |

## Hallazgos

### B1 — BLOQUEANTE: R1624 sin test en la parte de UI
R1624 dice que el sistema SHALL «mostrar «Ese correo ya lo usa otra cuenta de tu empresa. Habla con tu
administrador.»». La rama `correo_en_uso` de `ConfirmarCorreoForm.tsx:89-91` no la prueba nadie: el
E2E no recorre ese caso y no hay test de componente de la página. Los tests del PR 2 solo prueban
que el servicio y la acción devuelven `correo_en_uso`. M3 (mandar `correo_en_uso` al texto genérico)
sobrevive. Además `tasks.md` T3.2 dice «los tres mensajes (R1622-R1624) … cubierto por T3.3», y no
es así para R1624.

**Qué falta:** un test de componente de `ConfirmarCorreoForm` (jsdom, acción con doble y
`window.location.hash` fijado) que afirme, como mínimo:
- con `correo_en_uso`, el texto literal de R1624;
- con `invalid_or_expired` y con `validation_error`, el texto de R1623;
- sin `#enlace=`, el texto de R1623 sin llamar a la acción;
- al montar, la acción no se llama (R1626 en el nivel unitario, ver m2).

Corrige también la línea de T3.2 en `tasks.md` y el mapa R → test de la bitácora.

### m1 — menor: el ocultado del bloque para la cuenta apiKey no tiene test
`UsuarioForm.tsx:490` no monta `CambioCorreoUsuario` para `apiKey`, pero M2 sobrevive. El servidor
rechaza igual (R1613, probado en el PR 2), así que no es un agujero de seguridad, pero el leader pidió
comprobarlo. `usuario-form.test.tsx` ya tiene `USUARIO_API` (línea ~925): un test que afirme que en
edición de un `admin` aparece la región «Cambiar correo» y en la de `USUARIO_API` no, mata M2. Barato
de añadir en la misma vuelta que B1.

### m2 — menor: R1626 en el E2E se afirma por el estado de la base, no por la ausencia de la llamada
El paso 5 lee la base justo después de ver el título. Si un cambio futuro confirmara al montar, el
paso 6 caería (no habría botón), así que el E2E lo atraparía de forma indirecta. El test de
componente de B1 («al montar, la acción no se llama») lo deja directo.

### m3 — menor: el texto de la página pública dice que el correo ya cambió
`TEXTOS_CONFIRMAR_CORREO.explicacion`: «Tu administrador cambió el correo de tu cuenta. Confírmalo
para empezar a entrar con él.». El correo NO ha cambiado hasta confirmar (D2, R1615). Más exacto:
«Tu administrador pidió cambiar el correo de tu cuenta a este. Confírmalo para empezar a entrar con
él.» (o similar). No bloquea.

### m4 — menor: la sección «Estado» de `progress/features/SLT-221.md` está desactualizada
Dice que el PR 2 está pendiente y que pasa por /design (T2.0); T2.0 se omitió y el PR 2 está en #258.

## Veredicto

**RECHAZADO** por B1 (R1624 sin test en la UI). m1-m4 no bloquean; m1 y m2 salen solos con el test de
B1 y uno de `usuario-form`.
