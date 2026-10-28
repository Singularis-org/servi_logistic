-- DOWN (SL-32, R21): quita la regla de R28. No toca datos ni el indice de R27.
ALTER TABLE "usuario" DROP CONSTRAINT "usuario_empresa_o_superadmin";
