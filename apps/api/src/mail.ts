import { createRequire } from "node:module";

export class MailConfigError extends Error {
  constructor() {
    super("Accounting email is not fully configured.");
    this.name = "MailConfigError";
  }
}

export type InvoiceMail = {
  subject: string;
  text: string;
  filename: string;
  pdf: Buffer;
};

type Nodemailer = {
  createTransport: (options: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  }) => {
    sendMail: (message: {
      from: string;
      to: string;
      subject: string;
      text: string;
      attachments: { filename: string; content: Buffer; contentType: string }[];
    }) => Promise<unknown>;
  };
};

let testDelivery: ((mail: InvoiceMail) => Promise<boolean>) | null = null;

export function installInvoiceDelivery(delivery: ((mail: InvoiceMail) => Promise<boolean>) | null) {
  testDelivery = delivery;
}

export async function deliverInvoice(mail: InvoiceMail): Promise<boolean> {
  if (testDelivery) {
    return testDelivery(mail);
  }
  const host = process.env.SMTP_HOST?.trim() ?? "";
  const to = process.env.ACCOUNTING_EMAIL?.trim() ?? "";
  const user = process.env.SMTP_USER?.trim() ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  const from = process.env.SMTP_FROM?.trim() || user;
  const portText = process.env.SMTP_PORT?.trim() ?? "";
  const configured = Boolean(host || to || user || pass || process.env.SMTP_FROM?.trim() || portText);
  if (!configured) {
    return false;
  }
  const port = portText ? Number(portText) : 587;
  if (!host || !to || !from || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new MailConfigError();
  }
  const nodemailer = createRequire(import.meta.url)("nodemailer") as Nodemailer;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });
  await transport.sendMail({
    from,
    to,
    subject: mail.subject,
    text: mail.text,
    attachments: [{ filename: mail.filename, content: mail.pdf, contentType: "application/pdf" }],
  });
  return true;
}
