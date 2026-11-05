import type { Metadata } from "next";
import Link from "next/link";
import { LanguageSwitch } from "@/components/language-switch";
import { Wordmark } from "@/components/wordmark";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { CONTACT_EMAIL } from "@/lib/contact";
import { SAMPLE_REPORT } from "@/lib/tutor/sample";
import { homeCopy } from "./_home/copy";
import { HomeEffects } from "./_home/home-effects";
import "./home.css";

/**
 * The Edumi home page (/): the product family at a glance, routing visitors to Edumi Study Hall
 * (/study_hall) or Edumi for Tutors (/tutors). Edumi AI is shown only as unavailable. Copy in
 * _home/copy.ts. Motion is progressive: content is visible without JavaScript and with reduced
 * motion (home.css, HomeEffects).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = homeCopy(await getLocale());
  return { title: { absolute: t.meta.title }, description: t.meta.description };
}

export default async function HomePage() {
  const locale = await getLocale();
  const t = homeCopy(locale);
  const href = (p: string) => localizePath(p, locale);
  const studyHall = href("/study_hall");
  const tutors = href("/tutors");
  const en = SAMPLE_REPORT.en;
  const zh = SAMPLE_REPORT["zh-CN"];

  return (
    <div className="home">
      <HomeEffects studyHallHref={studyHall} />
      <a className="home-skip" href="#main">
        {locale === "zh" ? "跳到正文" : "Skip to content"}
      </a>

      <header className="home-nav">
        <div className="home-wrap home-nav-in">
          <Link href={href("/")} aria-label="Edumi home" className="home-brand">
            <Wordmark />
          </Link>
          <nav aria-label={t.nav.label} className="home-nav-links">
            <Link href={studyHall}>{t.nav.studyHall}</Link>
            <Link href={tutors}>{t.nav.tutors}</Link>
            <a href="#ai">{t.nav.ai}</a>
          </nav>
          <div className="home-nav-end">
            <LanguageSwitch locale={locale} className="home-quiet" />
            <Link href={href("/login")} className="home-btn home-btn--ghost">
              {t.nav.logIn}
            </Link>
          </div>
          {/* Phones: the same links in a disclosure, no script needed. */}
          <details className="home-menu">
            <summary>{t.nav.menu}</summary>
            <nav aria-label={t.nav.label}>
              <Link href={studyHall}>{t.nav.studyHall}</Link>
              <Link href={tutors}>{t.nav.tutors}</Link>
              <a href="#ai">{t.nav.ai}</a>
              <Link href={href("/login")}>{t.nav.logIn}</Link>
              <LanguageSwitch locale={locale} className="home-quiet" />
            </nav>
          </details>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-glow" aria-hidden="true" />
          <div className="home-wrap home-hero-grid">
            <div className="home-hero-copy">
              <p className="home-eyebrow" data-rv>
                <span className="home-dot" aria-hidden="true" />
                {t.hero.eyebrow}
              </p>
              <h1 id="home-title" data-rv style={{ "--d": 1 } as React.CSSProperties}>
                {t.hero.title}
              </h1>
              <p className="home-lede" data-rv style={{ "--d": 2 } as React.CSSProperties}>
                {t.hero.lede}
              </p>
              <div className="home-cta" data-rv style={{ "--d": 3 } as React.CSSProperties}>
                <Link href={studyHall} className="home-btn home-btn--primary">
                  {t.hero.primary} <span aria-hidden="true">→</span>
                </Link>
                <Link href={tutors} className="home-btn home-btn--secondary">
                  {t.hero.secondary}
                </Link>
              </div>
            </div>

            {/* Product visual: built from real UI pieces, with the fictional sample report. */}
            <figure className="home-visual" aria-label={t.hero.visualLabel} data-rv style={{ "--d": 2 } as React.CSSProperties}>
              <div className="home-window">
                <div className="home-window-bar" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <code>edumi.app/app/reports</code>
                </div>
                <div className="home-window-body">
                  <div className="home-card home-card--report">
                    <p className="home-mono">Alex T. · Maths Methods · 4:00pm–5:00pm</p>
                    <div className="home-report-cols">
                      <div lang="en">
                        <p className="home-k">Covered</p>
                        <p>{en.covered[0]}</p>
                        <p className="home-k">Next focus</p>
                        <p>{en.nextFocus[0]}</p>
                      </div>
                      <div lang="zh-CN">
                        <p className="home-k">本节内容</p>
                        <p>{zh.covered[0]}</p>
                        <p className="home-k">下一步重点</p>
                        <p>{zh.nextFocus[0]}</p>
                      </div>
                    </div>
                    <p className="home-chip-row">
                      <span className="home-chip home-chip--lav">AI draft · checked by tutor</span>
                      <span className="home-chip">EN + 中文</span>
                    </p>
                  </div>
                  <div className="home-card home-card--session" aria-hidden="true">
                    <p className="home-mono">Study Hall · session</p>
                    <ol>
                      <li>
                        <span className="home-tick">✓</span> Goals set · 3
                      </li>
                      <li>
                        <span className="home-tick">✓</span> Supervisor check-in
                      </li>
                      <li>
                        <span className="home-tick home-tick--lav">●</span> Report to parent
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
              <figcaption className="home-note">{t.hero.visualNote}</figcaption>
            </figure>
          </div>
        </section>

        {/* Products */}
        <section className="home-section" aria-labelledby="products-title">
          <div className="home-wrap">
            <p className="home-label" data-rv>
              {t.products.label}
            </p>
            <h2 id="products-title" data-rv>
              {t.products.title}
            </h2>
            <div className="home-products">
              {(
                [
                  [t.products.studyHall, studyHall, "sh"],
                  [t.products.tutors, tutors, "tu"],
                ] as const
              ).map(([p, link, key], i) => (
                <article key={key} className={`home-product home-product--${key}`} data-rv style={{ "--d": i } as React.CSSProperties}>
                  <div className="home-product-head">
                    <span className="home-status">
                      <span className="home-dot" aria-hidden="true" /> {p.status}
                    </span>
                    <span className="home-mono">{p.for}</span>
                  </div>
                  <h3>{p.name}</h3>
                  <p>{p.body}</p>
                  <ul>
                    {p.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                  <Link href={link} className="home-btn home-btn--primary">
                    {p.cta} <span aria-hidden="true">→</span>
                  </Link>
                </article>
              ))}
              <article id="ai" className="home-product home-product--ai" data-rv style={{ "--d": 2 } as React.CSSProperties} aria-labelledby="ai-title">
                <div className="home-product-head">
                  <span className="home-status home-status--off">{t.products.ai.status}</span>
                </div>
                <h3 id="ai-title">{t.products.ai.name}</h3>
                <p>{t.products.ai.body}</p>
              </article>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="home-section home-section--tint" aria-labelledby="features-title">
          <div className="home-wrap">
            <p className="home-label" data-rv>
              {t.features.label}
            </p>
            <h2 id="features-title" data-rv>
              {t.features.title}
            </h2>
            <ul className="home-features">
              {t.features.items.map((f, i) => (
                <li key={f.title} className="home-feature" data-rv style={{ "--d": i % 4 } as React.CSSProperties}>
                  <span className={`home-tag ${f.tag === "Study Hall" ? "" : "home-tag--lav"}`}>{f.tag}</span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Closing */}
        <section className="home-closing" aria-labelledby="closing-title">
          <div className="home-wrap home-closing-in" data-rv>
            <h2 id="closing-title">{t.closing.title}</h2>
            <div className="home-cta">
              <Link href={studyHall} className="home-btn home-btn--light">
                {t.closing.studyHall}
              </Link>
              <Link href={`${tutors}#signup`} className="home-btn home-btn--outline">
                {t.closing.tutors}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="home-foot">
        <div className="home-wrap home-foot-in">
          <div>
            <Wordmark />
            <p>{t.footer.tagline}</p>
          </div>
          <nav aria-label="Footer">
            <Link href={studyHall}>{t.footer.studyHall}</Link>
            <Link href={tutors}>{t.footer.tutors}</Link>
            <Link href={href("/legal/privacy")}>{t.footer.privacy}</Link>
            <Link href={href("/legal/house-rules")}>{t.footer.houseRules}</Link>
            <Link href={href("/tutors/terms")}>{t.footer.tutorTerms}</Link>
            <Link href={href("/tutors/privacy")}>{t.footer.tutorPrivacy}</Link>
            <Link href={href("/login")}>{t.footer.logIn}</Link>
            <a href={`mailto:${CONTACT_EMAIL}`}>{t.footer.contact}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
