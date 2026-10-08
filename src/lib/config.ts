const env = (k: string, d = "") => (process.env[k] ?? d).trim();

export const config = {
  groqKey: () => env("GROQ_API_KEY"),
  tavilyKey: () => env("TAVILY_API_KEY"),
  groqModel: () => env("GROQ_MODEL", "llama-3.3-70b-versatile"),
  smtpHost: () => env("SMTP_HOST", "smtp.gmail.com"),
  smtpPort: () => Number(env("SMTP_PORT", "465")),
  smtpUser: () => env("SMTP_USER"),
  // Google shows app passwords with spaces; strip them.
  smtpPassword: () => env("SMTP_PASSWORD").replace(/\s/g, ""),
  fromName: () => env("MAIL_FROM_NAME", "WebScope"),
  mailConfigured: () => !!(env("SMTP_USER") && env("SMTP_PASSWORD")),
};
