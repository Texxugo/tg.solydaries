import { Lock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { areasVisiveis } from "@/features/acessos/areas";
import { exigirUsuario } from "@/features/auth/queries";
import { iconesDeArea } from "@/features/navegacao/icones";

export default async function Home() {
  const usuario = await exigirUsuario();
  const areas = areasVisiveis(usuario);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Portal TG</h1>
        <p className="text-muted-foreground">
          Ola, {usuario.nome}. Estas sao as areas liberadas para voce.
        </p>
      </header>

      {areas.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <Lock className="size-6" aria-hidden />
            Nenhuma area liberada ainda. Peca a um administrador do portal.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {areas.map((area) => {
            const Icone = iconesDeArea[area.id];

            return (
              <Card key={area.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icone className="size-5" aria-hidden />
                    {area.rotulo}
                  </CardTitle>
                  <CardDescription>{area.descricao}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild>
                    <Link href={area.href}>Abrir {area.rotulo.toLowerCase()}</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
