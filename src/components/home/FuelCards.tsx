import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Eye, EyeOff, Fuel, Loader2, Lock, Nfc } from "lucide-react";
import { FitText } from "@/components/ui/fit-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FUEL_CODE_LEN,
  clearFuelUnlocked,
  getFuelUnlocked,
  setFuelUnlocked,
  syncFuelCards,
  unlockFuelPin,
  useFuelCards,
  type FuelCardData,
} from "@/lib/fuel-cards";

export type FuelCardOwner = { fullName: string };

/**
 * Acesso aos cartões de abastecimento na Home: um quadrado ao lado do
 * "Último relatório" (o estilo vem de quem usa, via className). Com mais de um
 * colaborador, pergunta de quem é o cartão. Se o colaborador tem senha
 * cadastrada, pede o código pessoal já aqui; o cartão abre desbloqueado na
 * tela própria /fuel-card/$slot, em pé.
 */
export function FuelCardsAccess({
  userId,
  owners,
  className,
}: {
  userId: string | null;
  owners: FuelCardOwner[];
  className?: string;
}) {
  const navigate = useNavigate();
  const cards = useFuelCards(userId);
  const [choose, setChoose] = useState(false);
  // Colaborador escolhido aguardando o código pessoal.
  const [askFor, setAskFor] = useState<0 | 1 | null>(null);
  // Já baixa os cartões do sistema ao abrir a Home, pra estarem no aparelho
  // mesmo se depois faltar internet no posto.
  useEffect(() => {
    void syncFuelCards(userId);
  }, [userId]);
  if (owners.length === 0) return null;

  const go = (i: number) => void navigate({ to: "/fuel-card/$slot", params: { slot: String(i + 1) } });
  const open = (i: number) => {
    setChoose(false);
    // Com senha cadastrada, só o dono abre: pede o código antes.
    if (cards[i]?.vault) setAskFor(i as 0 | 1);
    else go(i);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => (owners.length === 1 ? open(0) : setChoose(true))}
        className={className}
      >
        <Fuel className="size-10 text-primary" strokeWidth={1.6} />
        <p className="text-xs font-semibold leading-tight">Cartão de abastecimento</p>
      </button>

      <Dialog open={choose} onOpenChange={setChoose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Qual cartão?</DialogTitle>
            <DialogDescription>Escolha de quem é o cartão de abastecimento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {owners.map((o, i) => (
              <button
                key={i}
                type="button"
                onClick={() => open(i)}
                className="flex w-full items-center justify-between gap-3 rounded-card border-2 border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/50"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f7941d] text-[#241300]">
                    <Fuel className="size-[18px]" strokeWidth={2.2} />
                  </span>
                  <span className="truncate text-sm font-semibold">{o.fullName}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <PinCodeDialog
        open={askFor !== null}
        onOpenChange={(o) => !o && setAskFor(null)}
        name={owners[askFor ?? 0]?.fullName ?? ""}
        lockUntil={cards[askFor ?? 0]?.lockUntil ?? 0}
        onSubmit={async (code) => {
          if (askFor === null) return null;
          const i = askFor;
          const r = await submitCode(userId, i, code);
          if ("error" in r) return r;
          setAskFor(null);
          go(i);
          return null;
        }}
      />
    </>
  );
}

/** Confere o código pessoal; certo → guarda a senha desbloqueada (em memória). */
async function submitCode(userId: string | null, i: 0 | 1, code: string): Promise<{ error: string } | { pin: string }> {
  if (!userId) return { error: "Sessão indisponível." };
  const r = await unlockFuelPin(userId, i, code);
  if (r.ok) {
    setFuelUnlocked(userId, i, r.pin);
    return { pin: r.pin };
  }
  if (r.reason === "wrong") {
    return { error: `Código incorreto. ${r.left} ${r.left === 1 ? "tentativa restante" : "tentativas restantes"}.` };
  }
  if (r.reason === "locked") return { error: lockedMessage(r.until) };
  return { error: "Senha não cadastrada." };
}

// Arte do cartão: fixa nos dois temas (é a "estampa" do cartão, não um
// card da interface), com o laranja do app como destaque.
const CARD_BG =
  "radial-gradient(110% 70% at 100% 0%, rgba(247,148,29,0.38) 0%, rgba(247,148,29,0) 55%), linear-gradient(160deg, #0d2238 0%, #12405e 55%, #0b6b62 100%)";

/**
 * Cartão de abastecimento em pé (vertical). Toque: vira em 3D e mostra o
 * verso com matrícula e senha. A senha é individual (o celular é da equipe):
 * fica num cofre criptografado e só aparece depois do código pessoal do dono
 * (pedido na escolha do colaborador, ou aqui se a tela abrir travada).
 * Desbloqueada, fica visível enquanto a tela estiver aberta, por até
 * FUEL_UNLOCK_MS; o olho oculta/mostra matrícula e senha sem pedir o código.
 */
export function FuelCardView({
  userId,
  index,
  name,
}: {
  userId: string | null;
  index: 0 | 1;
  name: string;
}) {
  const data: FuelCardData = useFuelCards(userId)[index];
  const [flipped, setFlipped] = useState(false);
  const [unlock, setUnlock] = useState(() => getFuelUnlocked(userId, index));
  const [askCode, setAskCode] = useState(false);
  // Olho: oculta/mostra matrícula e senha no verso (não pede o código).
  const [hidden, setHidden] = useState(false);
  const hasData = !!(data.matricula || data.vault);
  const pin = unlock?.pin ?? null;

  // Abriu a tela já travada (ex.: voltou pra ela depois do tempo) — pede o código.
  const asked = useRef(false);
  useEffect(() => {
    if (!asked.current && data.vault && !unlock) {
      asked.current = true;
      setAskCode(true);
    }
  }, [data.vault, unlock]);

  // Trava de novo quando o desbloqueio vence.
  useEffect(() => {
    if (!unlock) return;
    const t = window.setTimeout(() => {
      clearFuelUnlocked(userId, index);
      setUnlock(null);
    }, Math.max(0, unlock.until - Date.now()));
    return () => window.clearTimeout(t);
  }, [unlock, userId, index]);

  // Saiu da tela do cartão: trava.
  useEffect(() => () => clearFuelUnlocked(userId, index), [userId, index]);

  const toggle = () => setFlipped((f) => !f);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={`Cartão de abastecimento de ${name}. Toque para ${flipped ? "ver a frente" : "ver matrícula e senha"}.`}
        onClick={toggle}
        onKeyDown={onKey}
        className="mx-auto block w-[min(78vw,340px)] cursor-pointer select-none outline-none [perspective:1400px] focus-visible:[&>div]:ring-2 focus-visible:[&>div]:ring-primary"
      >
        <div
          className="relative aspect-[54/85.6] w-full rounded-card transition-transform duration-700 ease-[cubic-bezier(.2,.8,.2,1)] [transform-style:preserve-3d] motion-reduce:transition-none"
          style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
        >
          {/* Frente */}
          <div
            className="absolute inset-0 flex flex-col overflow-hidden rounded-card p-[8%] text-white shadow-xl [backface-visibility:hidden]"
            style={{ background: CARD_BG }}
          >
            <Waves />
            <div className="relative flex items-start justify-between">
              <span className="flex size-11 items-center justify-center rounded-xl bg-[#f7941d] text-[#241300]">
                <Fuel className="size-6" strokeWidth={2.2} />
              </span>
              <Nfc className="size-7 text-white/70" strokeWidth={1.8} />
            </div>
            <div className="relative mt-[10%] leading-tight">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">Cartão de</p>
              <p className="text-2xl font-bold uppercase tracking-[0.06em]">Abastecimento</p>
            </div>
            <Chip />
            <div className="relative mt-auto">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">Condutor</p>
              <FitText className="text-xl font-bold uppercase tracking-[0.05em]">{name}</FitText>
            </div>
          </div>

          {/* Verso */}
          <div
            className="absolute inset-0 flex overflow-hidden rounded-card text-white shadow-xl [backface-visibility:hidden] [transform:rotateY(180deg)]"
            style={{ background: CARD_BG }}
          >
            {/* Tarja magnética na lateral (cartão em pé) */}
            <div className="ml-[8%] h-full w-[17%] shrink-0 bg-black/80" />
            <div className="flex min-w-0 flex-1 flex-col px-[8%] py-[10%]">
              <div className="flex flex-1 flex-col justify-center gap-6">
                {hasData ? (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <BackField
                        label="Matrícula"
                        // Travado (tem senha e ainda não digitou o código) ou ocultado pelo olho.
                        value={hidden || (data.vault && !pin) ? "••••••" : data.matricula || "—"}
                      />
                      <button
                        type="button"
                        aria-label={hidden ? "Mostrar matrícula e senha" : "Ocultar matrícula e senha"}
                        onClick={(e) => {
                          // Só oculta/mostra — não vira o cartão.
                          e.stopPropagation();
                          setHidden((h) => !h);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white transition-colors hover:bg-white/25 active:bg-white/30"
                      >
                        {hidden ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
                      </button>
                    </div>
                    <div className="space-y-3">
                      <BackField label="Senha" value={!data.vault ? "—" : pin && !hidden ? pin : "••••"} />
                      {data.vault && !pin && (
                        <button
                          type="button"
                          aria-label="Desbloquear senha (pede o código pessoal)"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAskCode(true);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white/15 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/25 active:bg-white/30"
                        >
                          <Lock className="size-4" /> Desbloquear
                        </button>
                      )}
                      {!data.vault && (
                        <p className="text-xs text-white/70">Senha não cadastrada — cadastre em Configurações.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-white/85">Matrícula e senha ainda não cadastradas.</p>
                    <Link
                      to="/settings"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex min-h-10 items-center rounded-lg bg-[#f7941d] px-3 py-2 text-sm font-semibold leading-tight text-[#241300]"
                    >
                      Cadastrar em Configurações
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fora do cartão clicável: eventos do portal do diálogo sobem pela
          árvore React e, dentro dele, viravam o cartão a cada toque. */}
      <PinCodeDialog
        open={askCode}
        onOpenChange={setAskCode}
        name={name}
        lockUntil={data.lockUntil}
        onSubmit={async (code) => {
          const r = await submitCode(userId, index, code);
          if ("error" in r) return r;
          setUnlock(getFuelUnlocked(userId, index));
          setAskCode(false);
          return null;
        }}
      />
    </>
  );
}

function lockedMessage(until: number) {
  const min = Math.max(1, Math.ceil((until - Date.now()) / 60_000));
  return `Muitas tentativas erradas. Tente de novo em ${min} min.`;
}

function PinCodeDialog({
  open,
  onOpenChange,
  name,
  lockUntil,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  lockUntil: number;
  onSubmit: (code: string) => Promise<{ error: string } | null>;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Trava imediata contra envio duplo (Enter + submit no mesmo instante):
  // o estado `busy` só vale no próximo render, e cada envio extra contava
  // como mais uma tentativa errada.
  const sending = useRef(false);

  useEffect(() => {
    if (open) {
      setCode("");
      setError(lockUntil > Date.now() ? lockedMessage(lockUntil) : null);
    }
  }, [open, lockUntil]);

  const submit = async () => {
    if (!code || sending.current) return;
    sending.current = true;
    setBusy(true);
    const r = await onSubmit(code).finally(() => {
      sending.current = false;
    });
    setBusy(false);
    if (r) {
      setError(r.error);
      setCode("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Código pessoal</DialogTitle>
          <DialogDescription>
            Só {name.split(" ")[0]} deve ver esta senha. Digite o código pessoal cadastrado em Configurações.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={FUEL_CODE_LEN}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="Código pessoal"
            className="h-12 text-center text-lg tracking-[0.4em] placeholder:text-base placeholder:tracking-normal"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-11 w-full" disabled={!code || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Ver senha"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Esqueceu o código? Cadastre a senha de novo em Configurações.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BackField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">{label}</p>
      {/* Encolhe até caber (matrícula longa no verso estreito do cartão em pé). */}
      <FitText className="font-mono text-2xl font-semibold tracking-[0.12em]">{value}</FitText>
    </div>
  );
}

function Chip() {
  return (
    <div
      className="relative mt-[12%] h-[9%] w-[24%] rounded-md border border-[#a4822f]/60"
      style={{ background: "linear-gradient(135deg, #f3d27a 0%, #c9a24a 50%, #f0cf73 100%)" }}
      aria-hidden
    >
      <span className="absolute inset-x-0 top-1/3 h-px bg-[#8a6a1f]/60" />
      <span className="absolute inset-x-0 top-2/3 h-px bg-[#8a6a1f]/60" />
      <span className="absolute inset-y-0 left-1/2 w-px bg-[#8a6a1f]/60" />
    </div>
  );
}

function Waves() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]" viewBox="0 0 200 320" preserveAspectRatio="none" aria-hidden>
      <path d="M0 230 C 60 200, 120 270, 200 215" fill="none" stroke="#fff" strokeWidth="1.2" />
      <path d="M0 250 C 65 220, 125 290, 200 235" fill="none" stroke="#fff" strokeWidth="1.2" />
      <path d="M0 270 C 70 240, 130 310, 200 255" fill="none" stroke="#fff" strokeWidth="1.2" />
    </svg>
  );
}
