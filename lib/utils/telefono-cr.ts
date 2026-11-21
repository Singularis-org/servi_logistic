// Feature 87 (T9, design §3.4) — normalizacion de telefono a E.164 Costa Rica para el
// enlace de WhatsApp (`wa.me/<normalizado>`). Reglas cerradas por el humano (gate F1.4 #4):
//   1. Si el crudo empieza por `+` -> se respeta el prefijo internacional: solo digitos.
//   2. Si ya trae `506` (codigo pais CR) -> se respeta, no se re-prefija.
//   3. Si tras limpiar quedan exactamente 8 digitos (numero local CR) -> se antepone `506`.
//   4. Cualquier otra longitud atipica -> solo digitos, SIN inventar prefijo.
//
// SLT-42: es un ENVOLTORIO de `telefono-pais.ts` con los datos de Costa Rica, que queda solo para
// la UI hasta SLT-81 (lista de excepciones de R29). El servidor usa `normalizarTelefono` con el
// prefijo y los digitos del pais de la empresa.
import { normalizarTelefono, type ReglasTelefono } from "@/lib/utils/telefono-pais";

const REGLAS_TELEFONO_CR: ReglasTelefono = { prefijo: "506", digitosNacionales: 8 };

export function normalizarTelefonoCR(raw: string): string {
  return normalizarTelefono(raw, REGLAS_TELEFONO_CR);
}
