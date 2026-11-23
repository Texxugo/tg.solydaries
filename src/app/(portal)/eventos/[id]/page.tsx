import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/features/auth/queries";
import { EditarEventoForm } from "@/features/eventos/components/editar-evento-form";
import { classesDaCor, rotuloDaNatureza } from "@/features/eventos/cores";
import { obterEvento } from "@/features/eventos/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Editar evento",
  description: "Sigla, natureza, cor e o que a celula pede quando este evento e usado.",
};

export default async function EditarEventoPage({ params }: PageProps<"/eventos/[id]">) {
  await exigirAcesso("eventos");

  const { id } = await params;
  const evento = await obterEvento(id);

  if (!evento) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/eventos">
            <ArrowLeft aria-hidden />
            Voltar para eventos
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span
              className={cn("rounded-sm px-1.5 py-0.5 font-mono text-sm", classesDaCor(evento.cor))}
            >
              {evento.codigo}
            </span>
            {evento.rotulo}
            {evento.padrao ? <Badge variant="secondary">Padrao</Badge> : null}
            {evento.ativo ? null : <Badge variant="destructive">Inativo</Badge>}
          </CardTitle>
          <CardDescription>
            Conta como {rotuloDaNatureza(evento.natureza).toLowerCase()}
            {evento.exigeHorario ? " e pede hora de entrada e saida na celula." : "."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditarEventoForm evento={evento} />
        </CardContent>
      </Card>
    </div>
  );
}
