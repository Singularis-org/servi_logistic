# SL-32 — Rol superadmin y su usuario de arranque

> Zona: fullstack · Complejidad: medium · depends_on: — (lo que necesita el enum o `organizacion` espera a SL-17 en `dev`: `tasks.md > Tandas`) ·
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
> **Segunda ampliación de Carlos (2026-10-22, la transmite el leader): la pantalla «Empresas».**
> Mañana dos empresas reales usan la app en Vercel y Supabase, y **las empresas se crean desde el
> superadmin**. Por eso se adelanta a esta ficha un trozo de SL-26, que se queda con el resto del
> panel. Entra:
> - el listado de empresas: nombre, slug, fecha de alta y su maestro (R29);
> - el formulario «Crear empresa», que llama a la Server Action de alta de SL-17 (R30). Pide el
>   nombre y el slug de la empresa, y del primer maestro el nombre, el email, el teléfono, el
>   documento y el tipo de documento;
> - los errores visibles: slug repetido, email repetido, documento repetido y entrada inválida
>   (R31–R34);
> - el acceso: solo el superadmin la ve y la usa, y el servidor rechaza a cualquier otro rol (R35);
> - el ítem de menú, solo para el superadmin (R36). Con él, el superadmin deja de ver la portada
>   vacía y aterriza en «Empresas» (R6, revisado);
> - el primer acceso del maestro creado, por el mecanismo que ya existe: «recuperar contraseña»
>   (R37, R38). Tiene una dependencia operativa: el correo (`design.md > Dependencias operativas`);
> - la regla de base `rol = superadmin ⇔ organizacion_id IS NULL` sobre la columna de SL-17 (R28).
>
> **Vehículos pasa a plataforma** (SL-17, D12). La edición del catálogo es del superadmin, y su
> interfaz llega con SL-26. SL-32 no toca Vehículos: la escritura del `maestro` la cierra SL-17.
>
> **Lo que NO entra.**
> - El resto del panel del superadmin (editar o retirar empresas, sus usuarios, la geografía y los
>   vehículos de plataforma): es SL-26. El alta de empresas por un camino que no sea esta pantalla:
>   SL-25 queda con lo que esta pantalla no cubre. Mientras tanto nadie gestiona la geografía ni los
>   vehículos desde la interfaz (`design.md > Riesgos`).
> - La pieza de dominio del alta (`OrganizacionService.altaEmpresa`, su repositorio y su Server
>   Action): es SL-17. SL-32 solo pone la pantalla y la comprobación de rol que la action consume.
> - Los usuarios de cada empresa, salvo el primer maestro: los da de alta ese maestro, como hoy.
> - `organizacion_id` en `usuario`: es SL-17, que entra antes. El superadmin queda con `NULL` y nunca
>   pasa por el filtro de empresa (`design.md > Multi-empresa`).
> - Consolidar las migraciones: es SL-28, que va después de SL-17. Las migraciones de esta ficha van
>   encima de las de SL-17.
> - Cambiar el login, el OTP o la recuperación de contraseña: el superadmin y el maestro usan los de
>   siempre. Volver a montar el formulario de «recuperar contraseña», que está desactivado, sí entra
>   (R38), y solo cuando el correo funcione.
> - Los demás módulos del `maestro` no cambian por esta ficha: Usuarios, Tarifas, API, Plantillas,
>   Envíos automáticos, SINPE, Histórico › Acciones, Monitoreo e Incidentes (Carlos). Vehículos
>   cambia, pero por SL-17 (D12), no por SL-32.

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

  La escritura de Vehículos que pierde el `maestro` no es un cambio de SL-32: la retira SL-17
  (D12, R40 de SL-17). Este requisito no la exige ni la deshace.
- **R4.** El sistema DEBE declarar en una sola constante qué roles son de la plataforma, y un solo
  predicado para preguntarlo. Ninguna otra lista de roles DEBE escribir `superadmin` a mano, salvo
  las tablas exhaustivas que el tipo obliga a completar (`design.md > Fuente única`).

### Plataforma no es empresa

- **R5.** MIENTRAS el actor de la sesión tenga el rol `superadmin`, el sistema DEBE rechazar en el
  servidor toda operación de un módulo de empresa: `forbidden` en Server Actions y servicios, y
  `notFound()` en páginas. Ocultarlo en el menú no basta. Las únicas operaciones que el superadmin
  puede ejecutar son las de plataforma de R24, R25 y R29–R35.
- **R6.** *(Revisado el 2026-10-22 por la pantalla «Empresas».)* MIENTRAS el actor tenga el rol
  `superadmin`, el menú DEBE mostrarle exactamente un ítem, «Empresas», y ningún ítem ni subítem de
  empresa. CUANDO entra, `/dashboard` DEBE redirigirle a la pantalla «Empresas», y a ninguna pantalla
  de empresa. El marco del portal (barra y pie con su nombre) DEBE pintarse para él sin fallar por
  no tener empresa.
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
- **R19.** Ninguna migración DEBE insertar filas en `usuario`. Un script de `package.json` que crea
  usuarios DEBE estar en la lista de excepciones de `faltasDeScripts`, con su nombre y su comando
  exactos y su ficha. SL-32 añade solo `arranque:superadmin` → `tsx scripts/arranque-superadmin.ts`.
  Cualquier otro script que nombre `superadmin`, o el mismo nombre con otro comando, DEBE poner la
  guardia en rojo. *(Cambiado el 2026-10-22: ya no dice «el único», porque SL-17 puede dejar su
  propia excepción en la misma lista.)*
- **R20.** El repositorio NO DEBE contener un valor de ninguna variable `SUPERADMIN_*`. `.env.example`
  las declara vacías. El README explica el comando sin ningún valor, y dice que se corre a mano, una
  vez por entorno, fuera del build y de CI, salvo en el E2E con credenciales de prueba.

### La migración

- **R21.** Las migraciones del rol, del índice de R27 y de la regla de R28 DEBEN tener un timestamp
  posterior al de la última migración de SL-17 (hoy `20261022130300_misma_empresa_en_fk`, según su
  spec; se confirma en T0), y cada una trae su `down.sql`. Los `down.sql` dejan el enum
  `rol_value`, el catálogo `rol` y los índices y restricciones de `usuario` como estaban. SI queda
  algún usuario `superadmin`, ENTONCES el `down.sql` del rol DEBE fallar sin borrarlo.
- **R28.** SI una escritura en `usuario` dejaría un usuario con rol `superadmin` y `organizacion_id`
  no nulo, o un usuario de cualquier otro rol con `organizacion_id` nulo, ENTONCES la base DEBE
  rechazarla. Vale para el alta y para el cambio de `rol_id` o de `organizacion_id`, venga del flujo
  que venga. Es la regla que SL-17 deja a SL-32 (R35 y design §10 de SL-17).

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

  **Abierto (P7):** con SL-17 en `dev`, la rama del `superadmin` choca con el aislamiento. El
  registro de acciones (`historial_accion`) y el conteo de órdenes son tablas de negocio, y el
  superadmin no tiene empresa. La rama del `maestro` (`forbidden`) no depende de eso.
- **R25.** El sistema DEBE dejar que el `superadmin` lea el árbol geográfico. Las lecturas de
  geografía de los flujos operativos de la empresa NO DEBEN cambiar: en particular, el `maestro`
  DEBE seguir leyendo el árbol desde `/configuracion/tarifas` para armar zonas, y los selectores de
  provincia o cantón de las órdenes siguen como hoy.
- **R26.** MIENTRAS el actor sea `maestro`, el menú NO DEBE mostrarle el subítem Geografía, y
  `/configuracion/geografia` DEBE responderle `notFound()`. La ayuda
  `docs/ayuda/oficina/configuracion-geografia.md` NO DEBE decir que la oficina gestiona la
  geografía: DEBE decir que la gestiona la plataforma.

### La pantalla «Empresas» del superadmin

- **R29.** CUANDO el `superadmin` abre la pantalla «Empresas», el sistema DEBE listar todas las
  empresas, las más recientes primero. De cada una muestra el nombre, el slug, la fecha de alta y el
  nombre y el email de cada usuario con rol `maestro` de esa empresa, por orden de alta. SI no hay
  ninguna empresa, ENTONCES DEBE mostrar un estado vacío que invite a crear la primera.
- **R30.** CUANDO el `superadmin` envía el formulario «Crear empresa» con datos válidos, el sistema
  DEBE llamar a la Server Action de alta de SL-17 con el nombre y el slug de la empresa y, del primer
  maestro, el nombre, el email, el teléfono, el documento y el tipo de documento. El tipo de
  documento DEBE elegirse de una lista con los valores del catálogo `tipo_identificacion`. SI la
  action responde éxito, ENTONCES la nueva empresa DEBE aparecer en el listado sin recargar la página
  a mano, y el formulario DEBE quedar vacío.
- **R31.** SI la action responde que el slug ya existe, como conflicto o como «ya existe», ENTONCES
  la pantalla DEBE mostrar el error junto al campo slug, conservar lo escrito y no presentar la
  empresa como creada. El listado no cambia.
- **R32.** SI la action responde que el email del maestro ya pertenece a otro usuario, ENTONCES la
  pantalla DEBE mostrar el error junto al campo email, conservar lo escrito y no crear nada.
- **R33.** SI la action responde que el documento del maestro ya pertenece a otro usuario, ENTONCES
  la pantalla DEBE mostrar el error junto al campo documento, conservar lo escrito y no crear nada.
- **R34.** SI la entrada no es válida (un campo vacío, un slug con otro formato, un email inválido o
  un tipo de documento fuera del catálogo), ENTONCES la pantalla DEBE mostrar el error junto a cada
  campo afectado, sin llamar a la action, o con el error por campo que devuelva la action. Una
  respuesta de error que no sea de un campo DEBE mostrarse como un mensaje genérico, sin detalle
  técnico ni datos personales.
- **R35.** SI el actor no es de la plataforma (`maestro` incluido), ENTONCES el servidor DEBE:
  - responder `notFound()` en la página «Empresas»;
  - responder `forbidden` en la lectura del listado y en la action de alta, sin leer ni escribir
    empresas ni usuarios.

  Ocultar el ítem del menú no basta. La comprobación de rol de la action de SL-17 DEBE leer
  `esPlataforma` de `lib/auth/plataforma.ts`.
- **R36.** El ítem de menú «Empresas» DEBE ser visible solo para los roles de `ROLES_PLATAFORMA`.
  Ningún otro rol lo ve, y el aterrizaje post-login de los otros seis roles NO DEBE cambiar.

### Primer acceso del maestro creado

- **R37.** CUANDO la action de alta termina con éxito, el maestro creado DEBE poder entrar por el
  mecanismo que ya existe: pone su contraseña en «recuperar contraseña» con el código que recibe por
  correo, y después entra por `/login`, OTP de dispositivo nuevo incluido. La pantalla «Empresas» NO
  DEBE mostrar, generar ni pedir una contraseña del maestro. Tras el alta, DEBE decirle al
  superadmin que el maestro entra con «¿Olvidaste tu contraseña?» y su email.
- **R38.** MIENTRAS el correo de la app no envíe de verdad en el entorno, el sistema NO DEBE ofrecer
  el formulario de «recuperar contraseña»: sigue el aviso de hoy (`RecuperacionDesactivadaAviso`).
  CUANDO el correo esté verificado en el entorno (`design.md > Dependencias operativas`), el
  formulario y el enlace del login DEBEN volver a montarse, como describe ese aviso. *(El cambio de
  montaje necesita el OK de Carlos: P8.)*

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
| 2026-10-22 | ¿Qué otros módulos del `maestro` cambian? | Ninguno. Usuarios, Tarifas, API, Plantillas, Vehículos, Envíos automáticos, SINPE, Histórico › Acciones, Monitoreo e Incidentes se quedan igual (Carlos). **Vehículos, revisada el mismo día: ver «¿Vehículos sigue con el `maestro`?».** | R3 |
| 2026-10-22 | ¿El `maestro` crea superadmins? | No (R8–R11, R27). El alta de empresas y de sus usuarios desde el superadmin es de SL-25 y SL-26, no de esta ficha (Carlos). **El alta de empresas, revisada el mismo día: ver «¿Quién crea las empresas, y desde dónde?».** El `maestro` sigue sin crear superadmins. | R8–R11, R27 |
| 2026-10-22 | ¿Quién gestiona la geografía hasta SL-26? | Nadie desde la interfaz. Carlos lo acepta (`design.md > Riesgos`). | R24, R26 |
| 2026-10-22 | P2: ¿de dónde salen los campos obligatorios de `usuario`? | De cuatro variables obligatorias más, sin valores por defecto, con el tipo de documento validado contra el catálogo (Carlos). | R12, R13 |
| 2026-10-22 | P3: ¿uno o varios superadmins? | Uno solo, como invariante del sistema y no solo del comando. Lo respalda la base con un índice único parcial. El comando solo crea el primero; si ya hay uno, termina en 0 sin tocar nada. Ningún flujo crea un segundo superadmin ni asciende a alguien a superadmin, tampoco SL-26. La contraseña se cambia con «Recuperar contraseña» (Carlos). | R9, R14, R17, R27 |
| 2026-10-22 | P4: ¿dónde se ejecuta el comando? | A mano, una vez por entorno, fuera del build de Vercel y de CI, salvo el E2E con credenciales de prueba (Carlos). | R20 |
| 2026-10-22 | P5: ¿un segundo factor propio para el superadmin? | No en SL-32: el mismo login y OTP que todos (Carlos). | R18 |
| 2026-10-22 | P6: ¿qué ve el superadmin hasta SL-26? | La portada «Bienvenido» de `/dashboard`, sin menú y sin pantallas provisionales (Carlos). **Revisada el mismo día: fila siguiente.** | R6 |
| 2026-10-22 | ¿Quién crea las empresas, y desde dónde? | El superadmin, desde una pantalla «Empresas» que se adelanta de SL-26 a SL-32: listado, formulario «Crear empresa» que llama a la action de SL-17, errores visibles, acceso solo de plataforma en el servidor y el ítem de menú solo para el superadmin. SL-26 queda con el resto del panel (Carlos, por el leader). Sustituye a P6: el superadmin ve «Empresas» y aterriza ahí. | R5, R6, R29–R36 |
| 2026-10-22 | ¿Qué pide el alta para el maestro? | El contrato de SL-17: `{nombre, email, telefono, documento, tipoDocumento}`, porque `usuario` exige `telefono`, `cedula` (única global) y `tipo_identificacion_id`. El tipo de documento sale del catálogo. El maestro nace activo y sin contraseña, y pone la suya con «recuperar contraseña» (leader, contrato de SL-17). | R30, R33, R34, R37 |
| 2026-10-22 | ¿Vehículos sigue con el `maestro`? | No. Pasa a plataforma (SL-17, D12): la edición es del superadmin y su interfaz llega con SL-26. Corrige la fila «¿Qué otros módulos del `maestro` cambian?» solo en Vehículos, y el cambio es de SL-17, no de SL-32 (Carlos, por el leader). | R3 |
| 2026-10-22 | ¿La regla `superadmin ⇔ organizacion_id NULL` va en la base? | Sí, en una migración de SL-32 posterior a las de SL-17. Es el contrato de SL-17 (R35, design §10), y cierra el ABIERTO de `design.md > Multi-empresa` (leader). | R21, R28 |

## Preguntas abiertas

Abiertas el 2026-10-22, al añadir la pantalla «Empresas». Ninguna bloquea el spec. P8 y P9 bloquean
que el maestro entre mañana.

**Estado al implementar (2026-10-22, leader):**
- **P8 y P9, resueltas.** El correo sale por SMTP de Brevo (`SMTP_HOST=smtp-relay.brevo.com`,
  puerto 587, con las variables de `lib/config/email.ts`), y Carlos las pone en Vercel. T19 vuelve a
  montar el formulario. Sin SMTP, el flujo degrada a `ConsoleEmailSender`.
- **P7, diferida a SL-26** (`progress/deudas.md > D10`). No se resuelve en SL-32.
- **P10.** Se lee en el spec de SL-17 (§7.7) y se confirma en T0.

- **P7 (Carlos). La geografía del superadmin, con SL-17 en `dev`.** `cambiarActivacion` y
  `renombrar` escriben `historial_accion` en la misma transacción, y `contarOrdenesSinEntregar` lee
  `orden`. Las dos son tablas de negocio de SL-17, con `organizacion_id NOT NULL`. El superadmin no
  tiene empresa, así que esas operaciones fallan con `EmpresaNoResuelta`. ¿Qué empresa lleva el
  registro de una acción de plataforma, o se registra en otro sitio? ¿El conteo es de todas las
  empresas, en contexto de plataforma? Hoy no tiene efecto visible, porque no hay pantalla de
  geografía de plataforma hasta SL-26. Mientras no se decida, R24 se prueba para el `superadmin`
  solo con dobles, y la rama del `maestro` (`forbidden`) se prueba entera.
- **P8 (Carlos). El correo en Production y Preview.** El maestro pone su contraseña con «recuperar
  contraseña», que manda un código por correo. Ese formulario está desactivado desde el
  2026-09-04 porque el SMTP fallaba (`RecuperacionDesactivadaAviso`), y hoy no hay SMTP configurado.
  Sin correo, el maestro no entra. Hay dos salidas:
  - (a) configurar `SMTP_USER` y `SMTP_PASSWORD` en Vercel, por entorno, y verificar un envío real;
  - (b) poner `AUTH_OTP_DEBUG_LOG=1` y leer el código en los logs de Vercel. `.env.example` dice que
    es «un secreto en los logs» y que va vacío en producción.

  ¿Cuál, y en qué entorno? El OTP de dispositivo nuevo del login, también del superadmin (R18),
  depende de lo mismo.
- **P9 (Carlos). Volver a montar el formulario de «recuperar contraseña»** (R38). Se desactivó por
  una decisión con fecha. ¿Se vuelve a montar cuando P8 quede resuelta en el entorno, o se queda el
  aviso y hace falta otro camino de primer acceso? No hay otro en el código: el `maestro` restablece
  contraseñas de su empresa, pero el superadmin no restablece la del maestro.
- **P10 (leader / SL-17). Contrato de la action, por leer en T0:**
  - su ruta y su nombre (el spec de SL-17 no los nombra);
  - la forma de cada error: slug repetido (conflicto o «ya existe»), email, documento y campo
    inválido;
  - cómo guarda «sin contraseña», si `usuario.password_hash` es `NOT NULL` en `db/schema.prisma`;
  - si la action expone un listado o lo pone SL-32 (`design.md > Pantalla «Empresas»`).

  El spec de SL-17 en disco no es coherente: D18 dice «desde el superadmin», pero R44–R47, §7.7 y
  T2.8 siguen describiendo `pnpm alta:empresa`, con una contraseña temporal y el código de salida.
