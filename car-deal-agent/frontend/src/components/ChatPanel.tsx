import { Bot, Send, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, chat } from "../lib/api";
import { type TextKey, useT } from "../lib/i18n";
import { prefsStore, useStore } from "../lib/store";
import type { Result } from "../lib/types";
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
      setError(t(`err_${err instanceof ApiError ? err.code : "server"}` as TextKey, { message: "" }));
    } finally {
      setBusy(false);
    }
  }

  const quick: TextKey[] = ["chat_q1", "chat_q2", "chat_q3", "chat_q4"];
  return (
    <Card className="flex min-h-[28rem] flex-col p-0">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <Bubble role="assistant" text={t("chat_intro")} />
        {messages.map((message, i) => (
          <Bubble key={i} role={message.role} text={message.content} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Bot className="size-4 text-accent" />
            <span className="animate-pulse-soft">…</span>
          </div>
        )}
        {error && <Note tone="bad">{error}</Note>}
        <div ref={end} />
      </div>
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 px-5 pb-3">
          {quick.map((q) => (
            <button key={q} onClick={() => send(t(q))} className="cursor-pointer rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent">
              {t(q)}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("chat_placeholder")}
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-2/60 px-3.5 text-sm outline-none focus:border-accent"
        />
        <Button type="submit" variant="primary" icon={<Send className="size-4 rtl:-scale-x-100" />} loading={busy} disabled={!input.trim()} aria-label="send" />
      </form>
    </Card>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const mine = role === "user";
  return (
    <div className={cx("flex gap-2.5", mine && "flex-row-reverse")}>
      <span className={cx("grid size-8 shrink-0 place-items-center rounded-full", mine ? "bg-surface-2 text-muted" : "bg-gradient-to-br from-accent to-accent-2 text-white")}>
        {mine ? <User className="size-4" /> : <Bot className="size-4" />}
      </span>
      <div className={cx("max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed", mine ? "bg-accent text-white" : "bg-surface-2")} dir="auto">
        {text}
      </div>
    </div>
  );
}
