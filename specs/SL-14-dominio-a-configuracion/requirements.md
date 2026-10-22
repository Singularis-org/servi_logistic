# SL-14 — El dominio de Ordenex sale a configuración

> Zona: fullstack · Complejidad: medium · depends_on: SL-10 · Rama: `feature/SL-14-dominio-a-configuracion`
>
> **Cómo se escribe el dominio en este spec.** El dominio no aparece literal en ningún sitio de este
> spec, para que la guardia de R9 no tenga que exceptuarlo. Se escribe de dos formas:
> - como expresión regular, `ordenex\.co`, que no casa consigo misma;
> - como `<dominio-ordenex>` dentro de URLs y emails.
>
> **Alcance.** Ningún archivo versionado de servi_logistic debe llevar el dominio de Ordenex. Solo se
> admiten excepciones **temporales**, y cada una nombra la ficha que la retira. El dominio público
> sale de variables de entorno, sin poner otro dominio fijo en su lugar.
>
> Medido el 2026-10-21 en el worktree con `ordenex\.co(?![a-z0-9-])`, sin distinguir mayúsculas. El
> `ingresoOrdenex.comision…` de `specs/234-…` es un falso positivo de `git grep` y no cuenta.
>
> | Dónde | Archivos | Quién lo retira |
> |---|---|---|
> | `app/_landing/LandingNav.tsx`, `app/_landing/primitivas.tsx`, `app/page.tsx`, `app/globals.css` (solo comentarios) | 4 | SL-8 |
> | `scripts/seed-maestro.ts` | 1 | SL-11 |
> | `docs/api/` | 4 | SL-16 |
> | `tests/unit/api/openapi-406-evidencias-url.test.ts`, en las aserciones que leen `docs/api/` | 1 | SL-16 |
> | `specs/` de Ordenex: 86, 288, 404, 406 (×2), 426 | 6 | SL-27 |
> | `docs/limpieza-ordenex.md`, `docs/plan-saas.md`, `docs/checkpoints-proyecto.md` | 3 | **SL-14** |
> | `lib/` | 5 | **SL-14** |
> | `tests/` (sin contar `openapi-406`) | 23 | **SL-14** |
> | `.env.example` (lo versiona SL-10) | 1 | **SL-14** |
> | `specs/SL-10-gate-verde-heredado/` (`design.md`, `requirements.md`, `tasks.md`; llegaron con el merge de `dev`) | 3 | **SL-14** |
>
> Solo **un** archivo usa el dominio como valor de verdad: `lib/config/push.ts`, con el `subject`
> VAPID por defecto. El resto son ejemplos, comentarios, fixtures y prosa. La app ya lee su origen
> público de `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_SITE_URL`, que se reutilizan tal cual.
>
> Clases de uso, separadas como pide la ficha:
>
> | Uso | Dónde | Hoy | Después |
> |---|---|---|---|
> | URL de la app (QR, `evidenciasUrl` del webhook, enlace del aviso interno, `{{url_guia}}`) | `lib/utils/paquete-url.ts`, `lib/config/webhook.ts`, `lib/config/whatsapp-envios.ts`, `lib/utils/whatsapp-envio-valores.ts` | ya salen de `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` | igual (R4–R6) |
> | Remitente de correo | `lib/config/email.ts` | sale de `SMTP_USER` / `SMTP_FROM` | igual; solo cambian los fixtures (R9) |
> | `subject` VAPID de push | `lib/config/push.ts` | default `mailto:soporte@<dominio-ordenex>` | obligatorio por variable (R1–R3) |
> | OpenAPI servido por la app | `lib/api/openapi-spec.ts` | ejemplo `https://app.<dominio-ordenex>/…` | `example.com` (R7) |
> | Linkificar | `lib/utils/linkificar.ts` | solo comentarios | `example.com` (R9) |
> | Plantillas de WhatsApp | `lib/types/plantilla-datos.ts`, `lib/whatsapp-envios/informes/aviso-interno.ts` | `ejemplo` y datos de ejemplo | `example.com` (R7) |
>
> **Lo que NO entra.**
> - La landing y la paleta (los 4 archivos de la tabla): las absorbe SL-8 y quedan como excepción
>   temporal atada a SL-8.
> - `docs/api/`, y las aserciones de `openapi-406-evidencias-url.test.ts` que leen `docs/api/` → SL-16.
> - `scripts/seed-maestro.ts` → SL-11.
> - Versionar `.env.example` (sacarlo de `.gitignore`) → SL-10. SL-14 solo cambia su contenido.
> - Los `specs/` de Ordenex: no se editan (decisión cerrada). Los retira SL-27.
> - `progress/`: es el estado del arnés, no la app, y la guardia no lo recorre.
> - El nombre «Ordenex» (`DEFAULT_FROM_NAME`, el `title` de `app/layout.tsx`, `sinpeNombre`…) → SL-8 /
>   SL-15. En las líneas que esta ficha toca, solo cambia el dominio.
> - El fallback `http://localhost:3000` de `app/layout.tsx`: no es un dominio de Ordenex, y el archivo
>   es de SL-8.
> - Unificar `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_SITE_URL`, y validar el formato de `VAPID_SUBJECT`.
> - Costa Rica, SINPE y colones (fase 3).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-21 | ¿El dominio se sustituye por otro dominio fijo? | No: va a variables de entorno del dominio público (issue SL-14; `docs/limpieza-ordenex.md` §4). → R1–R6, R9 |
| 2026-10-21 | ¿Se tocan los `specs/` de Ordenex? | No (humano, vía leader; regla 5 de `docs/limpieza-ordenex.md`). → R12 |
| 2026-10-21 | ¿`docs/api/` entra? | No: es de SL-16 (leader). → R10, R12 |
| 2026-10-21 | ¿Arreglo o rediseño? | Arreglo mínimo: se reutiliza lo que ya lee el entorno (leader). → R4–R6, R13 |
| 2026-10-21 | ¿Los 4 archivos de landing y paleta? | Los absorbe SL-8. En SL-14 son una excepción temporal atada a SL-8 (humano, P1). → R10, R12 |
| 2026-10-21 | ¿`VAPID_SUBJECT` obligatoria? | Sí: sin ella no hay canal de push (humano, P2). → R1–R3 |
| 2026-10-21 | ¿`example.com` en los ejemplos visibles? | Sí (humano, P3). → R7 |
| 2026-10-21 | ¿Quién versiona `.env.example`? | SL-10, no esta ficha. SL-14 depende de eso y solo cambia el contenido (humano, P4). → R8, R12 |
| 2026-10-21 | ¿Quedan excepciones permanentes del dominio? | No: lo de Ordenex desaparece del todo. Solo hay excepciones temporales, cada una con la ficha que la retira (humano). → R10 |
| 2026-10-21 | ¿Se puede editar una migración ya aplicada que lleve el dominio? | Sí. No existe ninguna base de servi_logistic desplegada, solo bases locales desechables, y la historia se aplanará antes del primer push (humano). Medido: hoy ninguna migración de `db/` lleva el dominio, así que no hay que editar ninguna. → R9 |

| 2026-10-21 | ¿Quién retira los 6 specs de Ordenex que llevan el dominio? | SL-27 «Retirar los specs/ heredados de Ordenex». Hasta entonces son excepción temporal atada a SL-27; SL-16 no los toca (humano). → R10 |
| 2026-10-21 | ¿La guardia recorre `progress/`? | No: `progress/` es el estado del arnés, no la app (humano). → R9 |
| 2026-10-21 | ¿Los specs de SL-10, que llegaron con el merge de `dev`, son excepción? | No. Ampliación del leader, 2026-10-21: los specs SL-* se limpian; solo los heredados esperan a SL-27. SL-14 reescribe sus 4 líneas sin el literal. → R9, R12 |
| 2026-10-22 | El caso «paridad TS↔YAML» de `openapi-webhook-estado-actualizado.test.ts` compara el ejemplo `evidenciasUrl` del TS con el de `docs/api/api-key-openapi.yaml`. ¿Cómo se cumple R7 sin romperlo? | Ampliación del leader: las 3 líneas cambian juntas a `example.com`: `lib/api/openapi-spec.ts`, `docs/api/api-key-openapi.yaml` (ejemplo `evidenciasUrl`) y la línea 63 de `openapi-406-evidencias-url.test.ts`. El resto de `docs/api/` sigue siendo de SL-16. → R7, R12 |

## Requisitos (EARS)

### Push (`subject` VAPID)

- **R1.** SI `VAPID_SUBJECT` falta o está vacía, ENTONCES el sistema DEBE tratar el canal de push
  como no configurado: `pushConfigurado()` devuelve `false`, `clavePublicaPush()` devuelve `null`, y
  `piezasVapidAusentes()` incluye `VAPID_SUBJECT`, detrás de las dos claves.
- **R2.** SI se llama a `loadPushConfig()` sin `VAPID_SUBJECT`, ENTONCES el sistema DEBE lanzar
  `PushNoConfiguradoError` con un mensaje que nombre `VAPID_SUBJECT`.
- **R3.** CUANDO están puestas `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`, el sistema
  DEBE usar como `subject` exactamente el valor recortado de `VAPID_SUBJECT`, y ningún otro.

### Origen público de los enlaces (comportamiento que se conserva)

- **R4.** SI no hay ni `NEXT_PUBLIC_APP_URL` ni `NEXT_PUBLIC_SITE_URL`, ENTONCES el informe «Aviso de
  la app» DEBE terminar en `error` nombrando la variable de plantilla `enlace`, sin emitir un enlace.
- **R5.** SI `NEXT_PUBLIC_SITE_URL` no está puesta, ENTONCES `{{url_guia}}` DEBE resolver a cadena
  vacía.
- **R6.** SI `NEXT_PUBLIC_APP_URL` no está puesta, ENTONCES el cuerpo del webhook de estado DEBE
  omitir `data.evidenciasUrl`. No vale emitir una ruta relativa ni un origen inventado.

### Ejemplos y documentación de entorno

- **R7.** Los ejemplos que la app muestra o sirve DEBEN usar el dominio reservado `example.com`
  (RFC 2606), conservando subdominio y ruta. Son:
  - el `ejemplo` de `url_guia`;
  - el `urlBase` de los datos de ejemplo de plantilla;
  - el `ejemplo` de `enlace` del aviso interno;
  - el `evidenciasUrl` del ejemplo de `lib/api/openapi-spec.ts`.

  `url_guia` resuelta sobre los datos de ejemplo DEBE seguir siendo igual a su `ejemplo`.
- **R8.** El `.env.example` versionado (lo versiona SL-10) DEBE declarar `NEXT_PUBLIC_APP_URL`,
  `NEXT_PUBLIC_SITE_URL` y `VAPID_SUBJECT`, cada una sin valor, y DEBE decir que `VAPID_SUBJECT` es
  obligatoria para que haya push.

### Guardia del dominio

- **R9.** SI un archivo versionado fuera de `progress/`, `.env.example` incluido, casa con `ordenex\.co(?![a-z0-9-])` sin
  distinguir mayúsculas y no está en la lista de excepciones, ENTONCES la guardia del dominio DEBE
  fallar nombrando cada archivo y línea.
- **R10.** Cada entrada de la lista de excepciones DEBE ser temporal y nombrar la ficha que la
  retira: no hay entradas permanentes. Las entradas son las de la tabla de Alcance que no son de
  SL-14. SI una entrada ya no existe o ya no contiene el dominio, ENTONCES la guardia DEBE fallar
  nombrándola junto con su ficha.
- **R11.** La guardia DEBE autocomprobar su detector sobre texto sintético. DEBE marcar el dominio
  con subdominio y mayúsculas mezcladas, y el dominio como parte de un email. NO DEBE marcar
  `https://app.example.com/x`, ni la expresión `ordenex\.co` escrita con su barra, ni un
  identificador que siga con letras (como `ingresoOrdenex.comision`).

### Cierre

- **R12.** El cambio NO DEBE modificar `.gitignore`, ni ningún archivo bajo `specs/` salvo
  `specs/SL-14-dominio-a-configuracion/` y las 4 líneas con el dominio de
  `specs/SL-10-gate-verde-heredado/` (ampliación del leader, 2026-10-21), ni bajo `docs/api/`
  salvo el ejemplo `evidenciasUrl` de `docs/api/api-key-openapi.yaml` (ampliación del leader,
  2026-10-22). Tampoco los 4 archivos de landing y
  paleta, ni `app/layout.tsx`, ni `scripts/seed-maestro.ts`.
- **R13.** El cambio NO DEBE añadir variables de entorno nuevas ni dependencias.
- **R14.** CUANDO se corre `./init.sh --completo` en el worktree de la feature, el gate DEBE terminar
  con código 0, o rojo solo en archivos que estén en `tests/baseline-rojos.json`.

## Preguntas abiertas

1. **Verificar que SL-10 versiona `.env.example`.** El leader se lo pidió a SL-10 el 2026-10-21. Hay
   que confirmar que su spec lo recoge antes de aprobar este; SL-14 depende de ello (R8).
