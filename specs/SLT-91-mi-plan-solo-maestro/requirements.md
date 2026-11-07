# SLT-91 — mi-plan-solo-maestro · requirements.md

> Zona: fullstack · Complejidad: low · depends_on: ninguna · Rama: feature/SLT-91-mi-plan-solo-maestro
>
> **Alcance:** «Mi plan» pasa a ser solo del `maestro`. El `admin` no ve el ítem del menú, la ruta le da
> no encontrado y no recibe avisos del plan. Enmienda SLT-58 R1, R8, R10 y su design §3.1.
>
> **Lo que NO entra:** lo que hace el plan para el `admin`: límites, cobro, wallet y módulos. Mover «Mi
> plan» de sitio en el menú. Cambiar los textos del tope. Migraciones y dependencias.

## Requisitos (EARS)

**Glosario.** *Empresa*: la organización de la sesión. *Los siete roles*: `maestro`, `admin`, `adminTienda`,
`adminSatelite`, `mensajero`, `apiKey` y `superadmin`. *Marcas del consumo*: «Cerca del tope» (desde el 80 %) y
«Lleno» (al 100 %). *Aviso de cambio*: el correo de un cambio de plan guardado, su recordatorio a 7 días o a 1 día,
o su cancelación.

### La vista

- **R1.** El sistema DEBE ofrecer «Mi plan» en el menú solo al `maestro`: de los siete roles ningún otro DEBE verlo,
  y sin sesión tampoco. Enmienda SLT-58 R10.
- **R2.** SI quien pide «Mi plan» no es un `maestro` de una empresa (el `admin`, cualquier otro rol, el superadmin o
  sin sesión), ENTONCES el sistema DEBE responder `forbidden` sin leer la base. Enmienda SLT-58 R8.
- **R3.** CUANDO un `admin` abre `/mi-plan`, el sistema DEBE responder 404 HTTP con «No encontramos esta página», sin
  el nombre del plan.
- **R4.** CUANDO un `maestro` abre «Mi plan», el sistema DEBE seguir mostrándole el plan de su empresa como hasta hoy.
  Enmienda SLT-58 R1.
- **R5.** El sistema DEBE tener una única lista de roles de «Mi plan», con `maestro` como único elemento, que lean el
  menú y el servicio.
- **R6.** Al quitar el ítem, el sistema NO DEBE cambiar el aterrizaje de ningún rol ni ningún otro ítem del menú del
  `admin`.

### Los avisos

- **R7.** CUANDO se envía un aviso de cambio a una empresa, el sistema DEBE enviarlo solo a sus `maestro` activos: un
  `admin` activo de esa empresa NO DEBE recibirlo.
- **R8.** El sistema DEBE mostrar las marcas del consumo y el cambio programado solo en «Mi plan» y en el detalle de
  empresa del superadmin: ninguna otra pantalla DEBE mostrárselas al `admin`.
- **R9.** El sistema NO DEBE tener ningún evento de notificación de la campana sobre el plan.

### Otras vías

- **R10.** El sistema NO DEBE tener, fuera del ítem del menú, ningún enlace a `/mi-plan`, y la ayuda NO DEBE nombrar
  «Mi plan».
- **R11.** CUANDO un `admin` aprueba una postulación y el tope del plan la rechaza, el sistema DEBE seguir mostrándole
  el mismo texto del tope, que NO DEBE nombrar «Mi plan».
- **R12.** La feature NO DEBE cambiar lo que hace el plan para el `admin`: DEBE seguir leyendo la deuda con la
  plataforma en la wallet, sus usuarios DEBEN seguir contando en el consumo por rol, y NO DEBE haber migración.
- **R13.** SI un `admin` pide el historial de acciones o una lectura de planes de la plataforma, ENTONCES el sistema
  DEBE seguir sin dársela.

### E2E

- **R14.** El E2E DEBE cubrir, por pantalla: el `admin` de A recibe 404 en `/mi-plan`, sin el nombre del plan, y su
  menú no enlaza a esa ruta; el `maestro` de A sigue viendo su plan.

### Trazabilidad prevista

Rutas de `tasks.md`. El implementer la confirma con el test concreto en `progress/impl_SLT-91.md`.
`guardia` = `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts`, `integracion` =
`tests/integration/db/mi-plan-solo-maestro.test.ts`, `menu` = `tests/unit/auth/menu-mi-plan.test.ts`, `servicio` =
`tests/unit/services/mi-plan-service.test.ts`, `pagina` = `tests/integration/mi-plan-page.test.tsx`, `e2e` =
`e2e/planes-superadmin.spec.ts`.

| R | Test |
|---|---|
| R1 | `menu` |
| R2 | `servicio`, `integracion`, `pagina` |
| R3 | `pagina`, `e2e` |
| R4 | `integracion`, `pagina`, `e2e` |
| R5 | `guardia`, `menu` |
| R6 | `menu` (aterrizajes), `tests/unit/auth/menu-visibility.test.ts` (lista exacta del `admin`), `tests/unit/auth/menu-historial-acciones.test.ts`, `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` |
| R7 | `tests/integration/db/planes-cambio-correos.test.ts` (existente, con un `admin` activo en la empresa) |
| R8 | `guardia` |
| R9 | `guardia` |
| R10 | `guardia` |
| R11 | `tests/unit/services/aprobacion-postulacion-tope-plan.test.ts` (caso nuevo con `admin`), `guardia` (el texto no nombra «Mi plan») |
| R12 | `tests/unit/services/deuda-plataforma-service.test.ts` (existente), `tests/integration/db/mi-plan-repository.test.ts` (existente, el uso trae `admin`), revisión del diff (sin `db/migrations/`) |
| R13 | `tests/components/HistorialAccionesPage.test.tsx`, `tests/unit/auth/menu-historial-acciones.test.ts`, `tests/unit/services/planes-service-lecturas.test.ts` (existentes) |
| R14 | `e2e` |

### Cobertura de las decisiones cerradas

| Decisión | R |
|---|---|
| ¿Quién ve «Mi plan»? | R1, R2, R3, R4, R5 |
| ¿Y los avisos del plan? | R7, R8, R9 |
| ¿Qué no cambia? | R6, R11, R12 |
| Enmienda de SLT-58 | R1, R2, R4 |

## Preguntas abiertas

- **P1 (Carlos; no bloquea).** El `admin` aprueba postulaciones y, si el tope la rechaza, lee por ejemplo: «Tu plan
  permite 5 usuarios activos con el rol Mensajero. Ya tienes 5. Inactiva alguno o pide un cambio de plan.» Es dato del
  plan, pero no es un aviso: es el motivo de una acción que él mismo intentó. Este spec lo deja igual (R11), porque
  los límites no cambian para el `admin`. ¿Lo confirmas, o ese texto debe ser otro para él? De paso: «Inactiva alguno»
  le pide algo que no puede hacer, porque Usuarios es solo del `maestro`; eso ya es así hoy.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-06 | ¿Quién ve «Mi plan»? | Solo el `maestro`. El `admin` no ve el menú y la ruta le da no encontrado. |
| 2026-11-06 | ¿Y los avisos del plan? | Tampoco le llegan al `admin`, si existen. |
| 2026-11-06 | ¿Qué no cambia? | Lo que hace el plan (límites, cobro, wallet, módulos) no cambia para el `admin`: solo la vista y los avisos. Sin migración si se puede. |
| 2026-11-06 | Enmienda de SLT-58 | Enmienda SLT-58 R1 y su design §3.1, que decían `maestro` y `admin`. |
