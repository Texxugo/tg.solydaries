"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CredenciaisProvisorias } from "@/features/acessos/types";

/**
 * Exibe a senha provisoria recem-gerada. O portal guarda apenas o hash, entao
 * esta e a unica chance de copiar: recarregar a pagina perde o valor e obriga a
 * gerar outra.
 */
export function SenhaProvisoria({ credenciais }: { credenciais: CredenciaisProvisorias }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(credenciais.senha);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem contexto seguro ou permissao: o valor continua visivel na tela.
      toast.error("Nao foi possivel copiar. Selecione a senha manualmente.");
    }
  }

  return (
    <Alert>
      <KeyRound aria-hidden />
      <AlertTitle>Senha provisoria de {credenciais.login}</AlertTitle>
      <AlertDescription>
        <code className="bg-muted text-foreground rounded px-2 py-1 font-mono text-sm break-all">
          {credenciais.senha}
        </code>
        <p className="mt-2">
          Anote agora: ela nao sera exibida de novo. No primeiro acesso o portal exige a troca.
        </p>
      </AlertDescription>
      <AlertAction>
        <Button type="button" variant="outline" size="sm" onClick={copiar}>
          {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </AlertAction>
    </Alert>
  );
}
