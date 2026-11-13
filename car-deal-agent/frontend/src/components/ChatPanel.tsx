import { Send, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ApiError, chat } from "../lib/api";
import { type TextKey, useT } from "../lib/i18n";
import { prefsStore, useStore } from "../lib/store";
import type { Result } from "../lib/types";
import { EASE } from "./motion";
import { Button, Card, Note, cx } from "./ui";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const conversations = new Map<string, Message[]>(); // kept while the app is open

/** Questions about one analysed car; the server sends the analysis along as context. */
export function ChatPanel({ result }: { result: Result }) {
  const t = useT();
  const prefs = useStore(prefsStore);
  const key = result.listing.id;
  const [messages, setMessages] = useState<Message[]>(conversations.get(key) ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conversations.set(key, messages);
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, key]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next = [...messages, { role: "user" as const, content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const context = { ...result, valuation: { ...result.valuation, used: result.valuation.used.slice(0, 12) } };
      const { answer } = await chat(context, next.slice(-12), prefs);
      setMessages([...next, { role: "assistant", content: answer }]);
    } catch (err) {
      const reason = err instanceof ApiError ? (err.details.reason as string | undefined) : undefined;
      setError(reason ? t(`ai_reason_${reason}` as TextKey) : t(`err_${err instanceof ApiError ? err.code : "server"}` as TextKey, { message: "" }));
    } finally {
      setBusy(false);
    }
  }

  const quick: TextKey[] = ["chat_q1", "chat_q2", "chat_q3", "chat_q4"];
  return (
    <Card className="flex min-h-[30rem] flex-col overflow-hidden p-0">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="bg-brand grid size-9 place-items-center rounded-xl text-white shadow-glow">
          <Sparkles className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-tight">{t("chat_title")}</div>
          <div className="truncate text-xs text-muted" dir="auto">
            {result.listing.title}
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        <Bubble role="assistant" text={t("chat_intro")} />
        {messages.map((message, i) => (
          <Bubble key={i} role={message.role} text={message.content} />
        ))}
        {busy && (
          <div className="flex items-end gap-2.5">
            <Avatar />
            <div className="flex items-center gap-1 rounded-[18px] rounded-es-md bg-surface-2 px-4 py-3.5">
              {[0, 1, 2].map((dot) => (
                <span key={dot} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${dot * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        {error && <Note tone="bad">{error}</Note>}
        <div ref={end} />
      </div>
      {messages.length === 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3 sm:flex-wrap sm:px-5">
          {quick.map((q) => (
            <button key={q} onClick={() => send(t(q))} className="shrink-0 cursor-pointer rounded-full border border-accent/25 bg-accent/8 px-3.5 py-2 text-[13px] font-medium text-accent transition hover:bg-accent/14 active:scale-95">
              {t(q)}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2 border-t border-line bg-surface-2/50 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("chat_placeholder")}
          className="h-12 min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-4 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
        <Button type="submit" variant="primary" className="size-12! rounded-full! px-0!" icon={<Send className="size-[18px] rtl:-scale-x-100" />} loading={busy} disabled={!input.trim()} aria-label="send" />
      </form>
    </Card>
  );
}

function Avatar() {
  return (
    <span className="bg-brand grid size-8 shrink-0 place-items-center rounded-full text-white">
      <Sparkles className="size-4" />
    </span>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const mine = role === "user";
  return (
    <motion.div className={cx("flex items-end gap-2.5", mine && "flex-row-reverse")} initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: EASE }}>
      {!mine && <Avatar />}
      <div className={cx("max-w-[85%] whitespace-pre-wrap px-4 py-2.5 text-sm leading-relaxed", mine ? "bg-brand rounded-[18px] rounded-ee-md text-white" : "rounded-[18px] rounded-es-md bg-surface-2")} dir="auto">
        {text}
      </div>
    </motion.div>
  );
}
