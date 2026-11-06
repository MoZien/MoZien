import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Card, Note } from "../components/ui";
import { useApp } from "../lib/app";
import { useT } from "../lib/i18n";
import { href } from "../lib/router";

// Impressum, privacy policy and terms. German is the binding language; the operator's details
// come from the server (LEGAL_* settings on Render), so no address lives in the code.

export type LegalKind = "impressum" | "datenschutz" | "nutzungsbedingungen";
export const LEGAL_PAGES: LegalKind[] = ["impressum", "datenschutz", "nutzungsbedingungen"];
const UPDATED = "November 2026";

export function LegalPage({ kind, back }: { kind: LegalKind; back?: string }) {
  const t = useT();
  const { meta } = useApp();
  const legal = meta?.legal;
  const missing = !legal?.name || !legal.address.length || !legal.email;
  const owner = Boolean(meta?.account?.admin) || meta?.auth_required === false;
  const Back = t.lang === "ar" ? ArrowRight : ArrowLeft;
  const title = { impressum: t("legal_imprint"), datenschutz: t("legal_privacy"), nutzungsbedingungen: t("legal_terms") }[kind];

  return (
    <div className="space-y-4" dir="ltr" lang="de">
      <a href={back ?? href("settings")} className="flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <Back className="size-4" /> {t("back")}
      </a>
      <h1 className="text-[24px] font-semibold leading-tight lg:text-[28px]">{title}</h1>
      {t.lang !== "de" && <Note>{t("legal_german_only")}</Note>}
      {missing && owner && (
        <Note tone="warn">
          Für dich als Betreiber: Name, Anschrift und E-Mail fehlen noch. Trage sie bei Render unter „Environment“ ein:
          <code className="mx-1">LEGAL_NAME</code>, <code className="mx-1">LEGAL_ADDRESS</code> (Zeilen mit „;“ trennen),
          <code className="mx-1">LEGAL_EMAIL</code>, optional <code className="mx-1">LEGAL_PHONE</code>.
        </Note>
      )}
      <Card className="space-y-5 p-5 text-[15px] leading-relaxed sm:p-6">
        {kind === "impressum" && <Imprint />}
        {kind === "datenschutz" && <Privacy />}
        {kind === "nutzungsbedingungen" && <Terms />}
        <p className="text-xs text-faint">Stand: {UPDATED}</p>
      </Card>
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 pb-4 text-sm">
        {LEGAL_PAGES.filter((page) => page !== kind).map((page) => (
          <a key={page} href={href(page)} className="text-muted underline-offset-4 hover:text-text hover:underline">
            {{ impressum: t("legal_imprint"), datenschutz: t("legal_privacy"), nutzungsbedingungen: t("legal_terms") }[page]}
          </a>
        ))}
      </nav>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const Blank = ({ children }: { children: ReactNode }) => <span className="text-warn">[{children}]</span>;

/** The operator as the legal texts name them. */
function Operator({ withContact = true }: { withContact?: boolean }) {
  const { meta } = useApp();
  const legal = meta?.legal;
  return (
    <p>
      {legal?.name || <Blank>Name</Blank>}
      <br />
      {legal?.address.length ? legal.address.map((line) => <span key={line} className="block">{line}</span>) : <Blank>Anschrift</Blank>}
      {withContact && (
        <>
          <span className="mt-2 block">
            E-Mail: {legal?.email ? <a className="text-accent" href={`mailto:${legal.email}`}>{legal.email}</a> : <Blank>E-Mail</Blank>}
          </span>
          {legal?.phone && <span className="block">Telefon: {legal.phone}</span>}
        </>
      )}
    </p>
  );
}

function Imprint() {
  const { meta } = useApp();
  return (
    <>
      <Section title="Angaben gemäß § 5 DDG">
        <Operator />
        {meta?.legal?.vat_id && <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: {meta.legal.vat_id}</p>}
      </Section>
      <Section title="Verantwortlich für den Inhalt">
        <p>{meta?.legal?.name || <Blank>Name</Blank>}, Anschrift wie oben.</p>
      </Section>
      <Section title="Verbraucherstreitbeilegung">
        <p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
      </Section>
      <Section title="Keine Verbindung zu den Plattformen">
        <p>
          {meta?.app_name ?? "AutoHalle"} ist ein unabhängiges Angebot und steht in keiner Verbindung zu Kleinanzeigen, AutoScout24 oder Autohero. Die
          genannten Namen sind Marken ihrer jeweiligen Inhaber.
        </p>
      </Section>
    </>
  );
}

function Privacy() {
  const { meta } = useApp();
  const app = meta?.app_name ?? "AutoHalle";
  return (
    <>
      <Section title="1. Wer ist verantwortlich?">
        <p>Verantwortlich für die Verarbeitung deiner Daten in {app} im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:</p>
        <Operator />
      </Section>

      <Section title="2. Das Wichtigste in Kürze">
        <ul className="list-disc space-y-1 ps-5">
          <li>Keine Werbung, kein Tracking, keine Analyse-Tools, keine Schriftarten oder Skripte von fremden Servern.</li>
          <li>Deine gespeicherten Autos, deine Garage und deine Suchen hält die App für dein Konto auf dem Server bereit, damit du sie auf allen deinen Geräten hast. Einstellungen bleiben nur auf deinem Gerät.</li>
          <li>Darüber hinaus speichert der Server über dich nur, was für Anmeldung, Missbrauchsschutz und die laufende Prüfung nötig ist – und das nur kurz.</li>
          <li>Für die KI-Auswertung gehen Anzeigendaten (Text und bis zu sechs Fotos der Anzeige) und deine Chat-Fragen an Anthropic (USA). Du kannst die KI – oder nur die Foto-Prüfung – in den Einstellungen abschalten.</li>
        </ul>
      </Section>

      <Section title="3. Hosting und Server-Protokolle">
        <p>
          Die App läuft bei Render Services, Inc. (USA) auf Servern in Frankfurt am Main. Beim Aufruf verarbeitet der Server technisch notwendige
          Verbindungsdaten: IP-Adresse, Zeitpunkt, aufgerufene Adresse und Browser-Kennung. Sie dienen der Auslieferung der App, der Fehlersuche und der
          Abwehr von Missbrauch und werden nach den Löschfristen des Hosters gelöscht. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren,
          funktionierenden Angebot (Art. 6 Abs. 1 lit. f DSGVO). Mit Render besteht ein Vertrag zur Auftragsverarbeitung; für mögliche Übermittlungen in
          die USA gelten die Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO).
        </p>
      </Section>

      <Section title="4. Anmeldung">
        <p>
          Bei der Anmeldung per E-Mail verarbeiten wir deine E-Mail-Adresse und einen einmaligen Code, der 10 Minuten gilt. Den Code verschicken wir
          über das Google-Konto des Betreibers (Gmail, Google Ireland Limited, Irland; Übermittlungen an Google LLC in den USA stützen sich auf das
          EU-US Data Privacy Framework). Damit niemand massenhaft Codes anfordert, merkt sich der Server für eine Stunde, wann an deine Adresse und von
          deiner IP-Adresse Codes verschickt wurden. Codes und Zeitpunkte liegen nur im Arbeitsspeicher und sind spätestens nach einem Neustart weg.
        </p>
        <p>
          Nach der Anmeldung setzt die App ein Sitzungs-Cookie (<code>cd_session</code>, 30 Tage gültig). Es enthält deine Kontokennung (bei
          E-Mail-Anmeldung die Adresse) in signierter Form und ist für die Anmeldung technisch notwendig (§ 25 Abs. 2 Nr. 2 TDDDG). Rechtsgrundlage der
          Anmeldung ist die Nutzung der App, um die du bittest (Art. 6 Abs. 1 lit. b DSGVO). Ohne E-Mail-Adresse oder Zugangscode ist keine Anmeldung möglich.
        </p>
      </Section>

      <Section title="5. Deine gespeicherten Autos, Garage und Suchen">
        <p>
          Die App speichert deine Daten im Speicher deines Browsers bzw. der App (localStorage), getrennt nach Konto. Gespeicherte Autos (mit dem
          Ergebnis der Prüfung, deinen Notizen und dem Status), deine Garage und deine gespeicherten Suchen hält sie außerdem für dein Konto auf dem
          Server (Render, Frankfurt) bereit, damit du sie auf allen Geräten hast, auf denen du angemeldet bist. Rechtsgrundlage ist die Nutzung der
          App, um die du bittest (Art. 6 Abs. 1 lit. b DSGVO).
        </p>
        <p>
          Löschst du einen Eintrag, verschwindet er auch auf dem Server; ein Löschvermerk ohne Inhalt bleibt bis zu 180 Tage, damit die Löschung auch
          deine anderen Geräte erreicht. Mit „Konto löschen“ ist alles sofort weg. Einstellungen, Vergleichsliste und bereits gesehene Anzeigen
          bleiben nur auf dem jeweiligen Gerät (§ 25 Abs. 2 Nr. 2 TDDDG). In den Einstellungen kannst du alles exportieren und löschen.
        </p>
      </Section>

      <Section title="6. Prüfen von Anzeigen">
        <p>
          Wenn du einen Link prüfst oder Schnäppchen suchen lässt, ruft der Server die öffentlichen Anzeigenseiten bei Kleinanzeigen, AutoScout24 oder
          Autohero und vergleichbare Anzeigen ab. Anzeigen können Angaben über die Verkäufer enthalten (z. B. Vorname, Ort). Für die Marktpreise speichert
          der Server Anzeigendaten (Titel, Preis, Kilometerstand, Baujahr, Ort, Link) und löscht sie, wenn die Anzeige 60 Tage nicht mehr gesehen wurde – ohne Verbindung zu deinem Konto.
          Rechtsgrundlage ist unser berechtigtes Interesse, Marktpreise zuverlässig zu ermitteln (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
        <p>
          Laufende Prüfungen und ihre Ergebnisse liegen im Arbeitsspeicher und werden zwei Stunden nach ihrem Ende, spätestens beim nächsten Neustart,
          gelöscht. Pro Konto zählt der Server, wie oft am Tag die KI genutzt wurde (Tageslimit); auch diese Zahlen liegen nur im
          Arbeitsspeicher.
        </p>
      </Section>

      <Section title="7. KI-Auswertung und Chat">
        <p>
          Ist die KI eingeschaltet, schicken wir den Inhalt der Anzeige (Text und bis zu sechs Fotos der Anzeige), die berechneten Werte und deine Fragen im Chat an Anthropic, PBC (USA), die
          Anbieterin des KI-Modells Claude. Anthropic verarbeitet die Daten in unserem Auftrag, um die Antwort zu erzeugen, und verwendet sie nach den
          geltenden Geschäftsbedingungen nicht zum Training seiner Modelle. Die Übermittlung in die USA stützt sich auf die Standardvertragsklauseln der
          EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO). Rechtsgrundlage ist die Nutzung der Funktion, um die du bittest (Art. 6 Abs. 1 lit. b DSGVO).
          Bitte schreib keine persönlichen Daten in den Chat. Du kannst die KI in den Einstellungen abschalten.
        </p>
        <p>
          Die Fotos lädt dein Gerät selbst von der Plattform, verkleinert sie und schickt sie für diese eine Prüfung über unseren Server an Anthropic;
          unser Server speichert sie nicht. Auf Anzeigenfotos können Kennzeichen oder Personen zu sehen sein – die KI soll nur den Zustand des Autos
          beurteilen. Die Foto-Prüfung lässt sich in den Einstellungen getrennt abschalten („KI prüft auch die Fotos“).
        </p>
        <p>
          Die Einschätzungen der App sind Empfehlungen. Es gibt keine automatisierte Entscheidung, die dir gegenüber rechtliche Wirkung entfaltet (Art. 22 DSGVO).
        </p>
      </Section>

      <Section title="8. Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und
          Datenübertragbarkeit (Art. 20). Einer Verarbeitung auf Grundlage berechtigter Interessen kannst du widersprechen (Art. 21). Schreib dafür an
          die oben genannte E-Mail-Adresse. Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO).
        </p>
        <p>
          Unter Einstellungen → „Konto löschen“ löschst du jederzeit selbst alles, was der Server über dein Konto weiß, und alle Daten des Kontos auf
          diesem Gerät.
        </p>
      </Section>
    </>
  );
}

function Terms() {
  const { meta } = useApp();
  const app = meta?.app_name ?? "AutoHalle";
  return (
    <>
      <Section title="1. Anbieter und Geltung">
        <p>{app} wird angeboten von:</p>
        <Operator withContact={false} />
        <p>Diese Bedingungen gelten für die Nutzung der App. Mit der Anmeldung erklärst du dich mit ihnen einverstanden.</p>
      </Section>

      <Section title="2. Was die App macht">
        <p>
          {app} schätzt anhand öffentlicher Anzeigen ein, was ein Gebrauchtwagen wert ist, ob sich ein Kauf zum Weiterverkauf lohnt und worauf du achten
          solltest, und sucht auf Wunsch nach günstigen Angeboten. Die Nutzung ist derzeit kostenlos (Testphase). Es besteht kein Anspruch darauf, dass
          die App jederzeit verfügbar ist oder bestimmte Funktionen dauerhaft anbietet.
        </p>
      </Section>

      <Section title="3. Keine Garantie, keine Beratung">
        <p>
          Alle Preise, Bewertungen und KI-Hinweise sind automatische Schätzungen auf Grundlage der Anzeigen, die zum Zeitpunkt der Prüfung auffindbar
          waren. Sie können unvollständig oder falsch sein, etwa wenn eine Anzeige falsche Angaben enthält. Sie ersetzen keine Besichtigung, Probefahrt
          oder Prüfung durch eine Werkstatt oder einen Gutachter. Kauf- und Verkaufsentscheidungen triffst du selbst und auf eigenes Risiko.
        </p>
      </Section>

      <Section title="4. Faire Nutzung">
        <p>
          Nutze die App nur für deine eigenen Zwecke. Gib deinen Zugang nicht weiter und versuche nicht, die App automatisiert oder in großem Umfang
          abzufragen oder ihre Begrenzungen zu umgehen. Bei Missbrauch können wir den Zugang sperren.
        </p>
      </Section>

      <Section title="5. Inhalte Dritter">
        <p>
          Die Anzeigen stammen von den jeweiligen Plattformen und ihren Nutzern. {app} ist kein Angebot dieser Plattformen und hat keinen Einfluss auf
          die Anzeigen. Verträge über ein Fahrzeug schließt du allein mit dem Verkäufer.
        </p>
      </Section>

      <Section title="6. Haftung">
        <p>
          Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit. Bei einfacher
          Fahrlässigkeit haften wir nur für die Verletzung einer Pflicht, deren Erfüllung die Nutzung der App erst ermöglicht und auf die du vertrauen
          darfst, und begrenzt auf den typischerweise vorhersehbaren Schaden. Im Übrigen ist die Haftung ausgeschlossen, insbesondere für Schäden aus
          Entscheidungen, die du auf Grundlage der Schätzungen triffst.
        </p>
      </Section>

      <Section title="7. Änderungen und Ende">
        <p>
          Du kannst dein Konto jederzeit in den Einstellungen löschen. Wir können die App ändern oder einstellen und diese Bedingungen mit Wirkung für
          die Zukunft anpassen; über wesentliche Änderungen informieren wir in der App.
        </p>
      </Section>

      <Section title="8. Recht">
        <p>Es gilt deutsches Recht. Zwingende Verbraucherschutzvorschriften des Landes, in dem du lebst, bleiben unberührt.</p>
      </Section>
    </>
  );
}
