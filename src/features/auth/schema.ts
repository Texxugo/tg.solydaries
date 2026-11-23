import { z } from "zod";

/** Politica unica de senha: reaproveitada pela troca de senha e pelo seed. */
export const senhaSchema = z
  .string()
  .min(10, "A senha precisa de pelo menos 10 caracteres")
  .max(128, "A senha pode ter no maximo 128 caracteres")
  .regex(/[a-zA-Z]/, "A senha precisa de pelo menos uma letra")
  .regex(/[0-9]/, "A senha precisa de pelo menos um numero");

export const loginSchema = z.object({
  login: z.string().trim().toLowerCase().min(3, "Informe seu usuario").max(64, "Usuario invalido"),
  // Sem politica no login: a senha ja cadastrada e que manda, e mensagens
  // detalhadas aqui so dariam pistas a quem tenta adivinhar.
  senha: z.string().min(1, "Informe sua senha").max(128, "Senha invalida"),
});

export const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual").max(128, "Senha invalida"),
    novaSenha: senhaSchema,
    confirmacao: z.string().min(1, "Confirme a nova senha"),
  })
  .refine((dados) => dados.novaSenha === dados.confirmacao, {
    path: ["confirmacao"],
    error: "A confirmacao nao confere com a nova senha",
  })
  .refine((dados) => dados.novaSenha !== dados.senhaAtual, {
    path: ["novaSenha"],
    error: "A nova senha precisa ser diferente da atual",
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type TrocarSenhaInput = z.infer<typeof trocarSenhaSchema>;
