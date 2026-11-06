import type { Metadata } from "next";
import Link from "next/link";
import { LanguageSwitch } from "@/components/language-switch";
import { Wordmark } from "@/components/wordmark";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { CONTACT_EMAIL } from "@/lib/contact";
import { homeCopy } from "./_home/copy";
import { HomeEffects } from "./_home/home-effects";
import "./home.css";

/**
 * The Edumi home page (/): Edumi's core is studying with friends (student sign-up at /join), with
 * Edumi Study Hall (/study_hall) and Edumi for Tutors (/tutors) beside it. Copy in _home/copy.ts. Motion is progressive: content is visible without JavaScript and with reduced
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
  const join = href("/join");

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
            <a href="#students">{t.nav.students}</a>
            <Link href={studyHall}>{t.nav.studyHall}</Link>
            <Link href={tutors}>{t.nav.tutors}</Link>
          </nav>
          <div className="home-nav-end">
            <LanguageSwitch locale={locale} className="home-quiet" />
            <Link href={href("/login")} className="home-btn home-btn--ghost">
              {t.nav.logIn}
            </Link>
            <Link href={join} className="home-btn home-btn--primary">
              {t.nav.join}
            </Link>
          </div>
          {/* Phones: the same links in a disclosure, no script needed. */}
          <details className="home-menu">
            <summary>{t.nav.menu}</summary>
            <nav aria-label={t.nav.label}>
              <Link href={join}>{t.nav.join}</Link>
              <a href="#students">{t.nav.students}</a>
              <Link href={studyHall}>{t.nav.studyHall}</Link>
              <Link href={tutors}>{t.nav.tutors}</Link>
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
                <Link href={join} className="home-btn home-btn--primary">
                  {t.hero.primary} <span aria-hidden="true">→</span>
                </Link>
                <Link href={studyHall} className="home-btn home-btn--secondary">
                  {t.hero.secondary}
                </Link>
              </div>
            </div>

            {/* Product visual: built from the student app's real pieces, with fictional names. */}
            <figure className="home-visual" aria-label={t.hero.visualLabel} data-rv style={{ "--d": 2 } as React.CSSProperties}>
              <div className="home-window">
                <div className="home-window-bar" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <code>edumi.app/student/groups</code>
                </div>
                <div className="home-window-body">
                  <div className="home-card home-card--report">
                    <p className="home-mono">Methods crew · {t.hero.goal}</p>
                    <div className="home-goal" aria-hidden="true">
                      <span style={{ width: "31%" }} />
                    </div>
                    <p className="home-goal-row">
                      <strong>1h 50m / 6h</strong> <span>{t.hero.left}</span>
                    </p>
                    <p className="home-chat home-chat--sys">{t.hero.started}</p>
                    <p className="home-chat home-chat--help">{t.hero.help}</p>
                    <p className="home-chip-row">
                      <span className="home-chip home-chip--lav">● Leo K. · Ava S.</span>
                      <span className="home-chip">1 Leo 1h 10m · 2 Ava 40m</span>
                    </p>
                  </div>
                  <div className="home-card home-card--session" aria-hidden="true">
                    <p className="home-mono">{t.hero.quiz}</p>
                    <ol>
                      <li>
                        <span className="home-tick">✓</span> {t.hero.score}
                      </li>
                      <li>
                        <span className="home-tick home-tick--lav">●</span> Silver tier
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
                  [t.products.students, join, "st"],
                  [t.products.studyHall, studyHall, "sh"],
                  [t.products.tutors, tutors, "tu"],
                ] as const
              ).map(([p, link, key], i) => (
                <article
                  key={key}
                  id={key === "st" ? "students" : undefined}
                  className={`home-product home-product--${key}`}
                  data-rv
                  style={{ "--d": i } as React.CSSProperties}
                >
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
                  <span className={`home-tag ${f.tag === "Study Hall" ? "" : f.tag === "Students" || f.tag === "学生" ? "home-tag--st" : "home-tag--lav"}`}>{f.tag}</span>
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
              <Link href={join} className="home-btn home-btn--light">
                {t.closing.join}
              </Link>
              <Link href={studyHall} className="home-btn home-btn--outline">
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
            <Link href={join}>{t.footer.students}</Link>
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
