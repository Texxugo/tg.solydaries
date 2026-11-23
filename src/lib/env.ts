import { z } from "zod";

/**
 * Validacao das variaveis de ambiente no boot: falha rapido e com mensagem
 * clara em vez de estourar mais tarde dentro do driver do banco.
 */
/**
 * Variavel que pode nao existir. `""` conta como ausente: um `.env` copiado do
 * exemplo tem a chave sem valor, e tratar isso como "configurado" faria o envio
 * tentar falar com a Z-API usando uma credencial vazia.
 */
const opcional = z
  .string()
  .trim()
  .optional()
  .transform((valor) => valor || undefined);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /**
   * Credenciais da Z-API, o provedor de WhatsApp usado pelas mensagens de
   * tratativa de ponto. **Opcionais de proposito**: o portal inteiro funciona
   * sem elas, e a tela da ocorrencia diz que o envio esta indisponivel em vez
   * de o processo nem subir. Quem so confere ponto nao precisa de WhatsApp.
   */
  ZAPI_BASE_URL: z.url().default("https://api.z-api.io"),
  ZAPI_INSTANCE_ID: opcional,
  ZAPI_TOKEN: opcional,
  /** O `Client-Token` da conta, enviado no header de toda chamada. */
  ZAPI_CLIENT_TOKEN: opcional,
  /**
   * O segredo que vai na URL do webhook (`/api/whatsapp/webhook?token=...`). A
   * Z-API nao assina o que envia, entao e ele que separa o webhook dela de
   * qualquer um que descubra o endereco. Sem ele o webhook fica **desligado**
   * (503): um endpoint que responde em nome do RH nao pode nascer aberto.
   */
  ZAPI_WEBHOOK_SECRET: opcional,
  /**
   * O robo que conversa com o colaborador. `false` desliga **so a conversa**: o
   * webhook continua recebendo e respondendo 200 (senao a Z-API reentregaria
   * para sempre), mas nada e gravado e ninguem recebe resposta. E o jeito de
   * parar o robo sem apagar a URL no painel da Z-API, que e configuracao de
   * fora do portal e nao volta sozinha.
   */
  ZAPI_CHATBOT_ATIVO: z
    .enum(["true", "false"])
    .default("true")
    .transform((valor) => valor === "true"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL e obrigatoria")
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL deve ser uma connection string PostgreSQL",
    ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = z.flattenError(parsed.error).fieldErrors;
  const detalhes = Object.entries(issues)
    .map(([campo, erros]) => `  - ${campo}: ${erros?.join(", ")}`)
    .join("\n");

  throw new Error(
    `Variaveis de ambiente invalidas. Copie .env.example para .env e ajuste:\n${detalhes}`,
  );
}

export const env = parsed.data;
