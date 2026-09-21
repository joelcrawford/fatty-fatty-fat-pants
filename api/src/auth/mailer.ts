export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** The only thing the rest of the app knows about email. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Development: print the message (and so the reset link) to the server log. */
export class ConsoleMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    console.log(`\n✉️  To: ${mail.to}\n   Subject: ${mail.subject}\n\n${mail.text}\n`);
  }
}

/** Production: Resend's HTTP API. No SDK; it is a single POST. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async send(mail: Mail): Promise<void> {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) {
      throw new Error(`Resend rejected the message: ${res.status} ${await res.text().catch(() => "")}`);
    }
  }
}

export function createMailer(mail: { resendApiKey: string | null; from: string }): Mailer {
  return mail.resendApiKey ? new ResendMailer(mail.resendApiKey, mail.from) : new ConsoleMailer();
}
