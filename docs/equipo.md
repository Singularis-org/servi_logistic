# docs/equipo.md — Trabajar en equipo con el arnés

El arnés v2 asume que **varias personas**, cada una con su sesión de Claude Code, toman features
del mismo board. Este documento dice qué impide que dos trabajen la misma feature, cómo se cuenta
el cupo y qué estado es de quién.

## Quién soy: `.arnes.local.json`

Archivo personal en la raíz del worktree principal, **fuera de git**. Lo escribe `/jira-connect`:

```json
{ "jira_account_id": "712020:…", "nombre": "Ana Pérez" }
```

Sin él, el validador no sabe cuáles son tus features: cuenta el cupo sobre todo el equipo y avisa.

## Tomar una feature (F1.0) — el candado

Dos cerrojos, en este orden. El primero es visible para el equipo y el segundo es atómico.

1. **Releer el issue en vivo** (`getJiraIssue`). No fiarse de la copia de F0, que puede tener horas.
2. **Solo si el assignee es nadie o soy yo.** Si es otra persona, la feature no está disponible:
   se salta y se evalúa la siguiente.
3. **Asignármela** (`editJiraIssue`, campo `assignee` con mi `jira_account_id`) y **releer** para
   confirmar que quedó a mi nombre.
4. **`./scripts/wt.sh new <key> <slug>`**. Crea un commit propio («feature tomada por …») y publica la
   rama con `git push --force-with-lease=refs/heads/<rama>:`, que **solo funciona si la rama no
   existe en el remoto**. El servidor lo comprueba de forma atómica, así que de dos personas en el
   mismo segundo solo una gana.
   - Sale con **código 4 (`TOMADA`)** si otro la publicó antes: suelta el assignee si lo pusiste
     y elige otra feature.
   - Si la rama es **tuya** y viene de otra máquina: `./scripts/wt.sh --retomar new <key> <slug>`.
   - `--sin-publicar` desactiva el candado. Úsalo solo si trabajas sin equipo o sin red.

Jira no ofrece una operación atómica de "asignar si nadie la tiene". Por eso el assignee es el
aviso para las personas y la rama publicada es el cerrojo de verdad.

## Soltar una feature

Si abandonas una feature sin terminarla:
1. Quita tu assignee en Jira y devuelve la tarjeta a su estado anterior.
2. Anota en `progress/features/<key>.md` hasta dónde llegaste y haz push.
3. La rama queda publicada. Quien la retome debe asignársela y correr `wt.sh --retomar new`.

## Cupo por persona

`arnes.config.json > cupos_por_persona` (por defecto: 2 `frontend`, 3 `backend`, 3 `fullstack`)
es **tuyo**, no del equipo. `scripts/validate-features.mjs` cuenta solo las `in_progress` cuyo
assignee es tu `jira_account_id`. Además, **toda feature en vuelo** (`spec_ready` o
`in_progress`) **debe tener assignee**: si no, el gate se pone en rojo.

## Conflicto de archivos entre personas

El cupo es personal, pero los archivos son de todos. Antes de tomar una feature:

```bash
node scripts/archivos-en-vuelo.mjs --candidata <key>   # exit 1 si choca
```

Por cada feature en vuelo de cualquiera, el script mira dos fuentes:
- los archivos que su rama remota **ya toca**: `git diff origin/<integracion>...origin/<rama>`;
- los que su `tasks.md` **dice que tocará**: las rutas entre backticks de su sección
  `## Archivos esperados` (`docs/specs.md > 3. tasks.md`).

Reglas de lectura:
- **Lista en `## Archivos esperados` todo archivo que vas a editar**, también los de la raíz
  (`init.sh`, `package.json`). Fuera de esa sección, las rutas citadas no cuentan.
- **Si un `tasks.md` no tiene la sección**, el script lee todo el archivo, descarta las rutas
  que empiezan por `./` (son comandos: `./init.sh`) y lo avisa.
- **Los archivos de apéndice compartidos dan AVISO, no CHOCA**: `tests/baseline-rojos.json` y
  `progress/deudas.md`. La lista se amplía en `arnes.config.json > equipo.archivos_compartidos`
  (sustituye a la de por defecto). Edítalos añadiendo, sin reordenar, como `progress/deudas.md`.
- `specs/` y `progress/` nunca cuentan: cada feature escribe en su carpeta.
- **Mismo dueño: AVISO, no CHOCA.** Las fichas de una misma persona (mismo `assignee`) no se
  bloquean entre sí: el dueño decide su orden y lo anota en cada `progress/features/<key>.md`.
- **Otra persona: CHOCA, salvo aceptación del humano.** Con `--acepto <key>[,<key>]` el choque se
  imprime como `CHOCA ACEPTADO` y no bloquea. Solo vale con una decisión humana escrita en
  `progress/features/<candidata>.md > Decisiones` (fecha y frase). El conflicto lo resuelve quien
  mergee segundo, en F2.3: integra la rama de integración, resuelve y regenera snapshots.

Si choca sin aceptación, la candidata espera. Para que esto funcione, **cada tanda termina con
`git push`**: una rama sin publicar es invisible para los demás, y el script lo avisa.

### Por qué

- 2026-10-08: `--candidata QC-177` daba CHOCA con **todas** las features en vuelo. Dos causas
  ajenas a un conflicto real: cada `tasks.md` cita `./init.sh` como comando entre backticks y
  contaba como archivo, y `tests/baseline-rojos.json` lo edita toda feature que limpia rojos. El
  candado se volvió ruido y dejó de distinguir el choque de verdad (QC-180 con QC-167 en
  `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`). Lo prueba
  `tests/guards/guard-archivos-en-vuelo-sin-ruido.test.ts`.
- 2026-10-13: el script cuenta `spec_ready` como en vuelo, así que cinco specs aprobados de un
  mismo dueño (QC-262/263/264/266/267), con orden acordado, chocaban entre sí y ninguno
  arrancaba; y QC-262 quedaba parada por un solo test de paridad compartido con QC-214, de otra
  persona. Humano: «necesito que podamos avanzar sin bloqueantes, ya si es necesario al final
  podemos arreglar conflictos». Lo prueba la misma guardia.

## Dónde se edita `progress/deudas.md`

Es el único archivo versionado que se edita fuera de una feature: en un HOLD de F2.5, cuando F0
conserva una evaluación, desde `/extraer-modulo` o desde `/afinar-regla`. Dónde se escribe:
1. **Si tienes una feature en vuelo**, en su rama: viaja con su PR.
2. **Si no tienes ninguna**, en una rama `chore/deudas-<AAAA-MM-DD>` creada desde integración,
   con un PR corto. El CI no corre porque solo cambia `progress/`.

Nunca se commitea en el worktree principal, que se queda limpio en la rama de integración.
Escribe cada deuda como un bloque `### D<n>` nuevo y no reordenes los demás: así dos PRs que
añaden deudas a la vez chocan, como mucho, en una línea.

## Qué estado es de quién

| Archivo | Dueño | En git |
| --- | --- | --- |
| `feature_list.json` | tu máquina (copia del board, F0 la regenera) | no |
| `.arnes.local.json`, `progress/sesion.local.md` | tú | no |
| `progress/features/<key>.md`, `specs/<key>-*/`, `progress/impl_*`, `progress/review_*` | la rama de esa feature | sí |
| `progress/deudas.md` | el equipo (se edita poco y por bloques) | sí |
| `arnes.config.json`, docs del perfil | el proyecto | sí |

Ningún archivo versionado lo editan **todas** las sesiones en cada vuelta. Eso es lo que evita
los conflictos de merge constantes en `dev`.

## El perfil del proyecto

Lo que cambia de un proyecto a otro (stack, arquitectura, verificación, convenciones,
dependencias) vive en los docs que lista `arnes.config.json > perfil.docs`. Cada uno lleva en su
primera línea `<!-- perfil: revisado=AAAA-MM-DD por=<nombre> -->`. El gate avisa cuando uno pasa
de `perfil.max_dias_sin_revisar` días. Se revisa con `/arnes-init`, que en un proyecto existente
funciona en modo revisión.

## Merge sin protección de ramas

En el plan gratuito de GitHub los repos privados no tienen *branch protection*, así que el check
`gate-completo` del CI **no puede ser obligatorio**. Rige como convención:
- **Nadie mergea un PR con `gate-completo` en rojo o sin terminar.**
- El leader lo comprueba con `gh pr checks <n> --watch` antes de pedirte el merge (F2.4).
