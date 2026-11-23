import type { Metadata } from "next";
import { ArrowLeft, ListChecks, MapPinned } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exigirAcesso } from "@/features/auth/queries";
import { CatalogoEfetivo } from "@/features/efetivos/components/catalogo-efetivo";
import { listarLocais, listarTiposDeExcecao } from "@/features/efetivos/queries";
import { AREA_EFETIVOS, ROTA_EFETIVOS } from "@/features/efetivos/types";

export const metadata: Metadata = {
  title: "Cadastros do efetivo",
  description: "Os locais e os tipos de excecao que o lancamento de efetivo oferece.",
};

export default async function CadastrosDoEfetivoPage() {
  // Repetida mesmo com o layout: layout nao roda em toda navegacao, e so exige
  // sessao, nao esta area.
  await exigirAcesso(AREA_EFETIVOS);

  const [locais, tipos] = await Promise.all([listarLocais(), listarTiposDeExcecao()]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={ROTA_EFETIVOS}>
            <ArrowLeft aria-hidden />
            Voltar para o lancamento
          </Link>
        </Button>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">Cadastros do efetivo</h1>

      <Tabs defaultValue="locais">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="locais">
            <MapPinned aria-hidden />
            Locais
          </TabsTrigger>
          <TabsTrigger value="tipos">
            <ListChecks aria-hidden />
            Tipos de excecao
          </TabsTrigger>
        </TabsList>

        {/* `forceMount`: o que foi digitado e nao salvo numa aba sobrevive a uma
            olhada na outra (ver as abas de funcionarios). */}
        <TabsContent value="locais" forceMount>
          <Card>
            <CardHeader>
              <CardTitle>Locais</CardTitle>
            </CardHeader>
            <CardContent>
              <CatalogoEfetivo catalogo="locais" itens={locais} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tipos" forceMount>
          <Card>
            <CardHeader>
              <CardTitle>Tipos de excecao</CardTitle>
            </CardHeader>
            <CardContent>
              <CatalogoEfetivo catalogo="tipos" itens={tipos} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
