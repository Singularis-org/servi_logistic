# SL-42 — Vehículos: catálogo de la plataforma · requirements.md

> Zona: fullstack · Complejidad: low · depends_on: — · Rama: `feature/SL-42-vehiculos-catalogo-plataforma` ·
> Assignee: Camilo
>
> **Alcance.** El catálogo de tipos de vehículo (`vehiculos`) es de la **plataforma** (SL-17, D12; la
> tarjeta lo llama «decisión P1»). Esta ficha:
> - da al superadmin una pantalla propia, con su ítem de menú, para crear, renombrar, activar y
>   desactivar tipos de vehículo;
> - quita al `maestro` el submódulo Vehículos: sale de su menú y su ruta deja de existir
>   (Carlos, 2026-10-23);
> - hace que cada error diga su motivo real. Hoy el `maestro` intenta crear y recibe un «ya existe»
>   falso: la base rechaza la escritura por el aislamiento (`permission denied`), y el `catch {}`
>   de `lib/actions/vehiculos.ts` la cuenta como `conflict`;
> - sigue el patrón de la geografía de plataforma (SL-32 R24–R26, SL-20 R21, R22, R36, R37).
>
> Cierra la parte de vehículos de la deuda D12 (`progress/deudas.md`).
>
> **Lo que NO entra.**
> - Las lecturas operativas del catálogo solo cambian en lo que fija R18: el formulario de usuarios
>   del `maestro` y la postulación pública siguen leyendo el catálogo. La asignación de órdenes no
>   cambia.
> - Tarifas por tipo de vehículo: `CobroVehiculoTarifas` está desmontado (`@sin-superficie`, vuelve
>   en SLT-54). Cómo trata Tarifas un vehículo inactivo lo decide esa ficha.
> - Un catálogo de vehículos por empresa. El catálogo es uno solo para todas (D12).
> - La pantalla que lea el rastro de las acciones del superadmin: aquí el rastro solo se escribe.

«Superadmin» es todo rol de `ROLES_PLATAFORMA` (`lib/auth/plataforma.ts`). «Rol de empresa» es
cualquier otro.

## Requisitos (EARS)

### La pantalla del superadmin

- **R1.** El sistema DEBE ofrecer la pantalla `/plataforma/vehiculos` y su ítem de menú «Vehículos»
  solo al superadmin. SI la pide un rol de empresa (`maestro` incluido), ENTONCES DEBE responder 404
  antes de leer la base.
- **R2.** CUANDO el superadmin abre `/plataforma/vehiculos`, el sistema DEBE listar todos los tipos
  de vehículo, activos e inactivos, por nombre, con el estado de cada uno. SI la lectura falla,
  ENTONCES la pantalla DEBE decir que no se pudo cargar el catálogo, y no DEBE mostrarlo como vacío.
- **R3.** El ítem «Vehículos» del superadmin NO DEBE mover su aterrizaje post-login (sigue en
  «Empresas») ni el de ningún rol de empresa.

### Operaciones del superadmin

- **R4.** CUANDO el superadmin crea un tipo de vehículo con un nombre válido, el sistema DEBE
  guardarlo **activo**, con el nombre normalizado (recortado y con los espacios internos colapsados).
- **R5.** CUANDO el superadmin renombra un tipo de vehículo con un nombre válido, el sistema DEBE
  guardar el nombre nuevo. Renombrarlo a su propio nombre DEBE ser éxito.
- **R6.** CUANDO el superadmin desactiva o activa un tipo de vehículo, el sistema DEBE guardar el
  estado nuevo sin borrar la fila ni tocar a los mensajeros ni a las tarifas que lo referencian.
  Pedir el estado que el tipo ya tiene DEBE ser éxito sin escribir.
- **R7.** Las operaciones de R4–R6 DEBEN completarse con un superadmin que no pertenece a ninguna
  empresa, sin fallar con `EmpresaNoResuelta` ni con `permission denied`.
- **R8.** El sistema NO DEBE ofrecer borrar un tipo de vehículo, ni al
  superadmin ni a ningún rol: desactivar sustituye al borrado.

### Errores con su motivo real

- **R9.** SI el nombre está vacío, tiene menos de 2 o más de 40 caracteres tras normalizarlo, o la
  entrada trae campos desconocidos, ENTONCES el sistema DEBE responder `validation_error` con el error
  en su campo, sin escribir nada.
- **R10.** SI el alta o el renombre dejaría dos tipos con el mismo nombre normalizado (esté activo o
  inactivo el que ya lo tiene), ENTONCES el sistema DEBE responder `conflict`, sin escribir nada.
- **R11.** SI el alta, el renombre o el cambio de estado falla por un motivo que no es el nombre
  repetido, ENTONCES el sistema NO DEBE responder `conflict` ni `in_use`: DEBE responder `error` y
  registrar en el log del servidor la operación y el nombre de la causa, sin el nombre del vehículo ni
  el mensaje de la base.
- **R12.** SI el renombre o el cambio de estado apunta a un tipo que no existe, ENTONCES el sistema
  DEBE responder `not_found`, sin escribir nada.
- **R13.** CUANDO una operación de R4–R6 responde, la pantalla DEBE mostrar un mensaje distinto para
  cada desenlace: éxito, nombre inválido (junto al campo), nombre repetido (junto al campo), tipo que
  ya no existe, sin permiso y error genérico. Ninguno DEBE decir «ya existe» salvo el de R10.

### El maestro y los roles de empresa

- **R14.** SI un rol de empresa (`maestro` incluido) invoca crear, renombrar, activar o desactivar un
  tipo de vehículo, ENTONCES el sistema DEBE responder `forbidden` en el servidor antes de tocar la
  base. Sin sesión DEBE responder `unauthenticated`.
- **R15.** MIENTRAS el actor sea `maestro`, el menú NO DEBE mostrarle el subítem «Vehículos» bajo
  «Configuración» ni en ningún otro ítem, y su aterrizaje post-login NO DEBE cambiar.
- **R16.** El sistema DEBE dejar de servir `/configuracion/vehiculos`: responde 404 a todo rol.
- **R17.** El `maestro` DEBE seguir leyendo el catálogo de vehículos en el formulario de alta y
  edición de usuarios, y la postulación pública DEBE seguir ofreciéndolo, con el alcance de R18.
- **R18.** MIENTRAS un tipo de vehículo esté inactivo:
  - el formulario de usuarios del `maestro` y la postulación pública NO DEBEN ofrecerlo para una
    elección nueva; el formulario DEBE seguir mostrando el que ya tiene un mensajero;
  - SI un alta de usuario, una edición que cambia el vehículo o una postulación eligen ese tipo,
    ENTONCES el sistema DEBE responder `validation_error` en el campo `vehiculoId`, sin escribir;
  - los mensajeros que ya lo tienen DEBEN conservarlo, y una edición que no cambia el vehículo DEBE
    seguir siendo válida;
  - la asignación de órdenes NO DEBE cambiar por el estado del vehículo del mensajero.
- **R19.** La ayuda de empresa NO DEBE describir una pantalla de vehículos de la oficina: ninguna ayuda
  DEBE enlazar a `/configuracion/vehiculos`.

### Rastro de las acciones del superadmin

- **R20.** Las escrituras de vehículos del superadmin NO DEBEN escribir en `historial_accion` (es de
  negocio y el superadmin no tiene empresa).
- **R21.** CUANDO el superadmin crea, renombra, activa o desactiva un
  tipo de vehículo y la operación escribe, el sistema DEBE guardar, en la misma transacción, una fila
  de rastro de plataforma con la acción, el id y el nombre congelado del vehículo, el actor (id y
  nombre congelado), la fecha y, en el renombre, el nombre anterior y el nuevo. Una operación que no
  escribe (R5 a su propio nombre, R6 al mismo estado) NO DEBE dejar fila.
- **R22.** SI una operación en el contexto de una empresa intenta leer o escribir ese
  rastro, ENTONCES la base DEBE rechazarla (`42501`).

### Datos

- **R23.** CUANDO se aplican las migraciones, todo tipo de vehículo existente DEBE quedar activo, y el
  `down.sql` DEBE devolver `vehiculos` a como estaba. La escritura de `vehiculos` desde una empresa
  (`servi_app`) DEBE seguir denegada (SL-17 R40).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Respuesta | Cubre |
|---|---|---|---|
| 2026-10-22 | ¿De quién es el catálogo de vehículos? | De la plataforma: las empresas solo lo leen y escribir desde una empresa falla cerrado; la edición es del superadmin (SL-17, D12, R40; la tarjeta lo llama «P1 de SL-17»). | R1, R4–R7, R14, R23 |
| 2026-10-23 | ¿El `maestro` conserva el submódulo Vehículos? | No: se quita de su menú y de su ruta (Carlos). | R15, R16, R19 |
| 2026-11-03 | ¿Qué gestiona el superadmin? | Crear, renombrar, activar y desactivar (tarjeta SL-42). | R4–R6 |
| 2026-11-03 | ¿Cómo responden los errores? | Con su motivo real: el «ya existe» falso del `maestro` desaparece (tarjeta SL-42). Patrón de SL-20 R36: `conflict` solo por el único; otra causa, `error` con log. | R9–R14 |
| 2026-11-03 | ¿Qué patrón sigue? | El de la geografía de plataforma (SL-32 R24–R26; SL-20 R21, R22, R36, R37): pantalla en `/plataforma/…` con 404 al rol de empresa, `forbidden` en el servidor, ruta vieja retirada, ayuda de oficina retirada, lectura operativa del `maestro` intacta (tarjeta SL-42). | R1, R3, R14–R17, R19 |
| 2026-10-26 | ¿Dónde se registra una acción del superadmin? | En un rastro de plataforma, nunca en `historial_accion` (D15, decidido en SL-20). | R20, R21, R22 |
| 2026-11-03 | P1: ¿se retira el borrado? | Sí. La acción de borrar se retira y desactivar la sustituye (humano). | R8 |
| 2026-11-03 | P2: ¿las acciones de vehículos dejan rastro de plataforma? | Sí, en una tabla propia `vehiculo_rastro`, calcada de `plan_rastro` (SL-24), sin pantalla de lectura (humano). | R21, R22 |
| 2026-11-03 | P3: ¿qué hace un vehículo inactivo en las empresas? | Deja de ofrecerse para elecciones nuevas, y quien ya lo tiene lo conserva. La asignación de órdenes no cambia (humano). | R17, R18 |

## Preguntas abiertas

Ninguna. P1, P2 y P3 se cerraron el 2026-11-03 (ver la tabla de arriba).
