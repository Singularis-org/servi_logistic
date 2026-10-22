# SL-32 — Rol superadmin y su usuario de arranque

> Zona: fullstack · Complejidad: medium · depends_on: — (las tandas 3 y 4 esperan a SL-17) ·
> Rama: `feature/SL-32-rol-superadmin` · Assignee: Carlos Restrepo
>
> **Alcance.** Un rol nuevo, `superadmin`, que es de la **plataforma** y no de ninguna empresa. No es
> `maestro`: `maestro` conserva sus permisos actuales, con **una** excepción declarada, el módulo de
> gestión de geografía (R24). El superadmin es el único usuario que nace con la app, y hay **uno solo**: es un
> invariante del sistema que respalda la base (R27). Lo crea un **comando de arranque** que lee sus
> datos de variables de entorno; no hay seeds. Desde él se darán de alta las empresas (SL-25) y se
> gestionarán en el panel (SL-26).
>
> Esta ficha deja:
> - el rol, con su migración, su fila de catálogo y el índice que impide un segundo superadmin;
> - el comando de arranque;
> - la frontera de autorización: el superadmin no entra en ningún módulo de empresa, y ningún rol de
>   empresa puede crear, ver ni tocar al superadmin;
> - la fuente única de «quién es plataforma» (`lib/auth/plataforma.ts`), que leerán SL-25 y SL-26;
> - el módulo de gestión de geografía (`/configuracion/geografia`), que pasa entero del `maestro` al
>   superadmin.
>
> **Alcance añadido por Carlos (2026-10-22, deuda D7 de `progress/deudas.md`; ampliado el mismo día).**
> Gestionar la geografía es de la **plataforma**, no de la empresa. Eso incluye dar de alta,
> renombrar, retirar y reactivar provincias, cantones y distritos, y leer su árbol y su conteo en
> `/configuracion/geografia`. Las lecturas de geografía que necesitan los flujos operativos de la
> empresa no cambian (R25). Se corrigen:
> - el texto del contrato de la API (código de SL-15) y su documentación (SL-16);
> - la guardia de SL-16 que vigila ese texto;
> - la ayuda de la pantalla de Geografía;
> - el menú del `maestro`, que pierde el subítem Geografía;
> - la autorización en el servidor.
>
> D7 se cierra sin deuda nueva.
>
> **Lo que NO entra.**
> - El alta de empresas: es SL-25. El panel del superadmin y cualquier pantalla suya: es SL-26. Hasta
>   SL-26, el superadmin entra y ve la portada vacía, sin menú (R6). Por eso, mientras tanto, nadie
>   gestiona la geografía desde la interfaz (`design.md > Riesgos`).
> - El alta de empresas y de los usuarios de cada una desde el superadmin: es SL-25 y SL-26. Esta
>   ficha solo asegura que ningún rol de empresa crea ni toca al superadmin (R8–R11, R27).
> - `organizacion_id` en `usuario`: es SL-17, que entra antes. El superadmin queda con `NULL` y nunca
>   pasa por el filtro de empresa (`design.md > Multi-empresa`).
> - Consolidar las migraciones: es SL-28, que va después de SL-17. La migración de esta ficha va
>   encima de la de SL-17.
> - Cambiar el login, el OTP o la recuperación de contraseña: el superadmin usa los de siempre.
> - Los demás módulos del `maestro` no cambian: Usuarios, Tarifas, API, Plantillas, Vehículos, Envíos
>   automáticos, SINPE, Histórico › Acciones, Monitoreo e Incidentes (Carlos).

## Requisitos (EARS)

### El rol

- **R1.** El sistema DEBE tener un rol `superadmin`, distinto de los seis que ya existen (`maestro`,
  `admin`, `mensajero`, `adminTienda`, `adminSatelite` y `apiKey`).
- **R2.** CUANDO se aplican las migraciones o se corre `db:seed` sobre una base vacía, el sistema
  DEBE dejar exactamente una fila del catálogo `rol` con valor `superadmin`. Repetirlo DEBE
  conservar esa fila y su `id`.
- **R3.** El sistema DEBE conceder a `maestro` y a los otros cinco roles exactamente los mismos
  accesos que tenían antes de SL-32, salvo dos cambios:
  - la **única** excepción es la de R24 y R26: el `maestro` pierde el módulo de gestión de
    geografía;
  - las listas de denegación de R7 añaden `superadmin`.
- **R4.** El sistema DEBE declarar en una sola constante qué roles son de la plataforma, y un solo
  predicado para preguntarlo. Ninguna otra lista de roles DEBE escribir `superadmin` a mano, salvo
  las tablas exhaustivas que el tipo obliga a completar (`design.md > Fuente única`).

### Plataforma no es empresa

- **R5.** MIENTRAS el actor de la sesión tenga el rol `superadmin`, el sistema DEBE rechazar en el
  servidor toda operación de un módulo de empresa: `forbidden` en Server Actions y servicios, y
  `notFound()` en páginas. Ocultarlo en el menú no basta. Las únicas operaciones que el superadmin
  puede ejecutar son las de plataforma de R24 y R25.
- **R6.** MIENTRAS el actor tenga el rol `superadmin`, el menú NO DEBE mostrarle ningún ítem.
  CUANDO entra, `/dashboard` DEBE pintar la portada «Bienvenido», sin redirigir a ninguna pantalla
  de empresa.
- **R7.** SI el actor es `superadmin`, ENTONCES:
  - la analítica DEBE denegarlo con el motivo `rol_sin_analitica`, no con `rol_desconocido`;
  - el asistente de ayuda DEBE rechazarlo antes de componer nada, como a `apiKey`.

### Ningún rol de empresa toca al superadmin

- **R8.** CUANDO el `maestro` pide la lista de roles asignables, el sistema NO DEBE incluir
  `superadmin`.
- **R9.** SI un alta o una edición de usuario pide el rol `superadmin`, ENTONCES el sistema DEBE
  responder `validation_error` en el campo `rolId` y no escribir nada.
- **R10.** CUANDO el `maestro` lista o busca usuarios, con o sin filtros, el sistema NO DEBE devolver
  ningún usuario con rol `superadmin`, ni contarlo en el total. Un filtro por rol `superadmin` DEBE
  rechazarse en el borde como rol inexistente.
- **R11.** SI una operación de gestión de usuarios apunta a un usuario con rol `superadmin`,
  ENTONCES el sistema DEBE responder `not_found` y no escribir nada. Son: obtener, editar, cambiar
  el estado, restablecer la contraseña y consultar el impacto de un cambio.

### Un único superadmin

- **R27.** SI una escritura en `usuario` dejaría dos usuarios con rol `superadmin`, ENTONCES la base
  DEBE rechazarla. Vale tanto para un alta como para un cambio de `rol_id`, y venga del flujo que
  venga: el comando, `UsuarioService`, SL-26 o una consulta directa.

### El comando de arranque

- **R12.** El sistema DEBE ofrecer un único comando de arranque, `pnpm arranque:superadmin`. Sobre
  una base sin superadmin, crea un usuario con rol `superadmin`, en estado `activo`. Sus datos salen
  de seis variables de entorno obligatorias:
  - `SUPERADMIN_EMAIL`;
  - `SUPERADMIN_PASSWORD`;
  - `SUPERADMIN_NOMBRE`;
  - `SUPERADMIN_TELEFONO`;
  - `SUPERADMIN_DOCUMENTO`;
  - `SUPERADMIN_TIPO_DOCUMENTO`, que debe ser un valor del catálogo `tipo_identificacion`.

  Ninguna tiene valor por defecto.
- **R13.** SI falta una variable del comando o no es válida, ENTONCES el comando DEBE:
  - terminar con código distinto de 0, sin escribir en la base;
  - nombrar en el mensaje la variable y la regla que incumple;
  - no imprimir nunca el valor recibido.

  Una contraseña es válida si cumple la política de contraseñas nuevas del repo
  (`strongPasswordSchema`).
- **R14.** SI ya existe un usuario con rol `superadmin`, ENTONCES el comando DEBE terminar con código
  0 y no escribir nada: ni la contraseña, ni el estado, ni ningún otro campo del que existe.
- **R15.** SI el email o el documento de identidad ya pertenecen a otro usuario, ENTONCES el comando
  DEBE terminar con código distinto de 0 y no escribir nada. En particular, no cambia el rol de ese
  usuario.
- **R16.** El comando DEBE guardar solo el hash de la contraseña. La contraseña, el email y el
  documento NO DEBEN salir por la salida estándar ni por la de errores, ni en los mensajes de error.
- **R17.** CUANDO se lanzan dos ejecuciones del comando a la vez sobre la misma base, el sistema DEBE
  terminar con un solo usuario `superadmin`, y las dos ejecuciones DEBEN terminar con código 0.
- **R18.** CUANDO el comando ha creado el superadmin, ese usuario DEBE poder iniciar sesión por el
  login de siempre, sin un factor adicional propio. El OTP de dispositivo nuevo sigue aplicando. Tras
  entrar, ve lo que describe R6.
- **R19.** Ninguna migración DEBE insertar filas en `usuario`. El único script de `package.json` que
  crea usuarios DEBE ser `arranque:superadmin`.
- **R20.** El repositorio NO DEBE contener un valor de ninguna variable `SUPERADMIN_*`. `.env.example`
  las declara vacías. El README explica el comando sin ningún valor, y dice que se corre a mano, una
  vez por entorno, fuera del build y de CI, salvo en el E2E con credenciales de prueba.

### La migración

- **R21.** Las migraciones del rol y del índice de R27 DEBEN crearse encima de la migración de
  SL-17, y cada una trae su `down.sql`. Los `down.sql` dejan el enum `rol_value`, el catálogo `rol`
  y los índices de `usuario` como estaban. SI queda algún usuario `superadmin`, ENTONCES el
  `down.sql` DEBE fallar sin borrarlo.

### Gestionar la geografía es de la plataforma (D7)

- **R22.** El contrato de la API DEBE atribuir a la plataforma, y no a la empresa, el retiro de una
  provincia, un cantón o un distrito, que es la gestión de geografía que nombra. Eso incluye:
  - la descripción de `openApiSpec`, en `lib/api/openapi-spec.ts`;
  - el YAML `docs/api/api-key-openapi.yaml`;
  - la entrada del 2026-09-06 de `docs/api/CHANGELOG.md`.

  El TS y el YAML DEBEN decir lo mismo.
- **R23.** La guardia `tests/unit/guards/docs-marca-heredada.guardia.test.ts` DEBE vigilar esas
  frases como frases de plataforma (`FRASES_PLATAFORMA`) y no como frases de la empresa
  (`FRASES_OPERADOR`). La paridad TS↔YAML (`DESCRIPCIONES_QUE_CAMBIAN`) DEBE vigilar la forma nueva.
- **R24.** CUANDO un actor pide dar de alta, renombrar, retirar o reactivar una provincia, un cantón
  o un distrito, o contar las órdenes sin entregar de un nodo, el sistema DEBE:
  - SI el actor no es de la plataforma (`maestro` incluido), responder `forbidden` en el servidor
    antes de tocar la base, sin escribir el nodo ni el registro de acciones;
  - SI es `superadmin`, aplicar la operación con las reglas de hoy: sin borrado físico, cascada
    reversible y registro de acciones.
- **R25.** El sistema DEBE dejar que el `superadmin` lea el árbol geográfico. Las lecturas de
  geografía de los flujos operativos de la empresa NO DEBEN cambiar: en particular, el `maestro`
  DEBE seguir leyendo el árbol desde `/configuracion/tarifas` para armar zonas, y los selectores de
  provincia o cantón de las órdenes siguen como hoy.
- **R26.** MIENTRAS el actor sea `maestro`, el menú NO DEBE mostrarle el subítem Geografía, y
  `/configuracion/geografia` DEBE responderle `notFound()`. La ayuda
  `docs/ayuda/oficina/configuracion-geografia.md` NO DEBE decir que la oficina gestiona la
  geografía: DEBE decir que la gestiona la plataforma.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Respuesta | Cubre |
|---|---|---|---|
| 2026-10-21 | ¿El superadmin es `maestro`? | No. Es un rol nuevo, y `maestro` conserva sus permisos (humano; SL-11 y SL-15 lo dejaron escrito). La única excepción es la de la fila de P1. | R1, R3 |
| 2026-10-21 | ¿Cómo nace el superadmin? | Es el único usuario que nace con la app. Se crea con un comando de arranque, con email y contraseña por variable de entorno, y sin seeds (`docs/plan-saas.md`, decisión 5). | R12, R19, R20 |
| 2026-10-21 | ¿El superadmin es de una empresa? | No. Servi Logistic es solo la plataforma (`docs/plan-saas.md`, decisión 4). | R5–R11 |
| 2026-10-22 | ¿Quién retira una provincia? | La plataforma, no la empresa (Carlos, D7). Se corrige el texto de código, ayuda y guardia. | R22, R23, R26 |
| 2026-10-22 | ¿Sobre qué base va la migración? | Primero se dijo «encima de la línea base de SL-28». Corregido el mismo día (Carlos): SL-28 se retrasa y va después de SL-17, así que la migración va encima de la de SL-17, porque las dos tocan `usuario`. Solo esperan las tandas que necesitan el enum. | R21 |
| 2026-10-22 | ¿Qué `organizacion_id` tiene el superadmin? | `NULL`: no tiene empresa y nunca pasa por el filtro de empresa (Carlos). El índice de R27 es global y no lleva `organizacion_id`. El comando inserta `NULL` explícito. | R5, R12, R27 |
| 2026-10-22 | ¿Dónde puede aparecer la contraseña? | En ningún sitio del repo ni de los logs (leader). | R16, R20 |
| 2026-10-22 | P1: ¿cambia ya el permiso de geografía? | Sí, y es todo el módulo. Corregido el mismo día: primero fue solo retirar y reactivar, y Carlos lo amplió. Dar de alta, renombrar, retirar, reactivar, leer el árbol y contar en `/configuracion/geografia` pasan al superadmin. El `maestro` pierde el subítem del menú y recibe `forbidden` en el servidor. Es la excepción explícita a «`maestro` conserva sus permisos». El permiso va en la tanda 4, tras T0, y el texto de la ayuda y la API va en la tanda 1. D7 se cierra sin deuda nueva (Carlos). Lectura del spec: `listarArbol` sigue abierto al `maestro`, porque Tarifas lo usa para armar zonas, y es una lectura operativa que no cambia (R25). | R3, R24, R25, R26 |
| 2026-10-22 | ¿Qué otros módulos del `maestro` cambian? | Ninguno. Usuarios, Tarifas, API, Plantillas, Vehículos, Envíos automáticos, SINPE, Histórico › Acciones, Monitoreo e Incidentes se quedan igual (Carlos). | R3 |
| 2026-10-22 | ¿El `maestro` crea superadmins? | No (R8–R11, R27). El alta de empresas y de sus usuarios desde el superadmin es de SL-25 y SL-26, no de esta ficha (Carlos). | R8–R11, R27 |
| 2026-10-22 | ¿Quién gestiona la geografía hasta SL-26? | Nadie desde la interfaz. Carlos lo acepta (`design.md > Riesgos`). | R24, R26 |
| 2026-10-22 | P2: ¿de dónde salen los campos obligatorios de `usuario`? | De cuatro variables obligatorias más, sin valores por defecto, con el tipo de documento validado contra el catálogo (Carlos). | R12, R13 |
| 2026-10-22 | P3: ¿uno o varios superadmins? | Uno solo, como invariante del sistema y no solo del comando. Lo respalda la base con un índice único parcial. El comando solo crea el primero; si ya hay uno, termina en 0 sin tocar nada. Ningún flujo crea un segundo superadmin ni asciende a alguien a superadmin, tampoco SL-26. La contraseña se cambia con «Recuperar contraseña» (Carlos). | R9, R14, R17, R27 |
| 2026-10-22 | P4: ¿dónde se ejecuta el comando? | A mano, una vez por entorno, fuera del build de Vercel y de CI, salvo el E2E con credenciales de prueba (Carlos). | R20 |
| 2026-10-22 | P5: ¿un segundo factor propio para el superadmin? | No en SL-32: el mismo login y OTP que todos (Carlos). | R18 |
| 2026-10-22 | P6: ¿qué ve el superadmin hasta SL-26? | La portada «Bienvenido» de `/dashboard`, sin menú y sin pantallas provisionales (Carlos). | R6 |
