import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rotuloDaArea } from "@/features/acessos/areas";
import type { UsuarioGerenciado } from "@/features/acessos/types";

const formatador = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Server Component: so exibe. Toda escrita passa pelos formularios da feature. */
export function ListaUsuarios({ usuarios }: { usuarios: UsuarioGerenciado[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Usuario</TableHead>
          <TableHead>Areas</TableHead>
          <TableHead>Situacao</TableHead>
          <TableHead>Ultimo acesso</TableHead>
          <TableHead className="sr-only">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {usuarios.map((usuario) => (
          <TableRow key={usuario.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <span className="font-medium">{usuario.nome}</span>
                {/* Badge so para administrador — os demais nao tem perfil algum. */}
                {usuario.perfil === "administrador" ? (
                  <Badge variant="secondary">Administrador</Badge>
                ) : null}
              </div>
              <span className="text-muted-foreground text-sm">{usuario.login}</span>
            </TableCell>

            <TableCell className="whitespace-normal">
              {usuario.perfil === "administrador" ? (
                <span className="text-muted-foreground text-sm">Todas</span>
              ) : usuario.areas.length === 0 ? (
                <span className="text-muted-foreground text-sm">Nenhuma</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {usuario.areas.map((area) => (
                    <Badge key={area} variant="outline">
                      {rotuloDaArea(area)}
                    </Badge>
                  ))}
                </div>
              )}
            </TableCell>

            <TableCell>
              {usuario.ativo ? (
                <span className="text-sm">Ativo</span>
              ) : (
                <Badge variant="destructive">Inativo</Badge>
              )}
              {usuario.senhaProvisoria ? (
                <p className="text-muted-foreground text-sm">Senha provisoria</p>
              ) : null}
            </TableCell>

            <TableCell className="text-muted-foreground text-sm">
              {usuario.ultimoAcessoEm ? (
                <time dateTime={usuario.ultimoAcessoEm.toISOString()}>
                  {formatador.format(usuario.ultimoAcessoEm)}
                </time>
              ) : (
                "Nunca acessou"
              )}
            </TableCell>

            <TableCell className="text-right">
              <Button asChild variant="ghost" size="sm">
                <Link href={`/acessos/${usuario.id}`}>
                  Gerenciar<span className="sr-only"> os acessos de {usuario.nome}</span>
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
