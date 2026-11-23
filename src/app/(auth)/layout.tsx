import { ShieldCheck } from "lucide-react";

/**
 * Layout das telas de credencial (`/login`, `/trocar-senha`): cartao centrado,
 * sem a navegacao do portal.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <ShieldCheck className="text-muted-foreground size-8" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight">Portal TG</h1>
        </div>
        {children}
      </div>
    </main>
  );
}
