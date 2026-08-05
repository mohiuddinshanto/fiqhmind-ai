import { Button } from "@/components/ui/button";

const languages = ["বাংলা", "العربية", "English"] as const;

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-emerald-50 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-emerald-950 sm:text-6xl">FiqhMind AI</h1>
      <p className="max-w-2xl text-lg leading-relaxed text-emerald-900/80">
        A grounded multilingual assistant over the Arabic Hanafi fiqh corpus. Every answer is
        backed by a verbatim Arabic quotation with book, volume, and page citations.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {languages.map((lang) => (
          <span
            key={lang}
            className="rounded-full border border-emerald-800/20 bg-white px-4 py-1 text-sm text-emerald-900"
          >
            {lang}
          </span>
        ))}
      </div>
      <Button size="lg" disabled>
        Ask a question
      </Button>
      <p className="max-w-xl text-sm text-emerald-900/60">
        The chat interface is implemented in a later phase. This scaffold only establishes the
        frontend foundation per ARCHITECTURE.md.
      </p>
    </main>
  );
}
