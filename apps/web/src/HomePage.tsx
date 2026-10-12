import { Link } from "react-router";
import { appName, homePath } from "@cws/shared";
import { useSession } from "./session";
import "./home.css";

const papers = [
  { tone: "", lines: ["DRIVER LOG", "LOG-0929-04"], x: "-255px", y: "-192px", r: "-28deg", delay: "-5.6s" },
  { tone: "forest", lines: ["INVOICE", "INV-2026"], x: "265px", y: "-176px", r: "34deg", delay: "-4.9s" },
  { tone: "blue", lines: ["STOP LIST", "ROUTE 01"], x: "-310px", y: "-55px", r: "-54deg", delay: "-3.9s" },
  { tone: "", lines: ["SERVICE", "RECORD"], x: "310px", y: "-35px", r: "49deg", delay: "-3.3s" },
  { tone: "forest", lines: ["WEIGHT", "TICKET"], x: "-290px", y: "92px", r: "-67deg", delay: "-2.7s" },
  { tone: "blue", lines: ["CUSTOMER", "ADDRESS"], x: "298px", y: "110px", r: "63deg", delay: "-2.1s" },
  { tone: "", lines: ["PHOTO", "ATTACHED"], x: "-205px", y: "205px", r: "-39deg", delay: "-1.5s" },
  { tone: "forest", lines: ["PAPER", "RECEIPT"], x: "225px", y: "215px", r: "42deg", delay: "-.8s" },
  { tone: "blue", lines: ["DAILY", "ROUTE"], x: "-105px", y: "-250px", r: "-15deg", delay: "-4.3s" },
  { tone: "", lines: ["LOAD", "DETAILS"], x: "120px", y: "-252px", r: "22deg", delay: "-3.6s" },
  { tone: "forest", lines: ["SIGNATURE", "REQUIRED"], x: "-115px", y: "260px", r: "-19deg", delay: "-1.8s" },
  { tone: "blue", lines: ["STATUS", "UPDATE"], x: "115px", y: "260px", r: "19deg", delay: "-.2s" },
] as const;

export function HomePage() {
  const { user } = useSession();
  const portalPath = user ? homePath(user.role) : "/login";
  const portalLabel = user ? "Open portal" : "Login to portal";

  return (
    <div className="home">
      <nav className="home-nav">
        <div className="home-brand">
          <div className="home-mark" aria-hidden="true">
            C
          </div>
          <div>
            <strong>Certified Waste</strong>
            <span>Solutions</span>
          </div>
        </div>
        <div className="home-nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#capabilities">Capabilities</a>
          <Link className="home-login" to={portalPath}>
            {portalLabel} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </nav>

      <section className="home-hero">
        <div className="hero-copy">
          <div className="hero-kicker">Waste operations, made clear</div>
          <h1>
            Move more with <em>less paperwork.</em>
          </h1>
          <p>
            {appName} brings routes, driver updates, service records, and invoicing into one calm,
            connected workspace.
          </p>
          <div className="hero-ctas">
            <Link className="hero-cta" to={portalPath}>
              Open operations portal <span aria-hidden="true">→</span>
            </Link>
            <a className="hero-ghost" href="#capabilities">
              See what&apos;s inside <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="hero-proof">
            <div>
              <strong>42</strong>stops tracked today
            </div>
            <div>
              <strong>100%</strong>digital records
            </div>
            <div>
              <strong>1</strong>connected workspace
            </div>
          </div>
        </div>

        <div className="hero-visual" aria-label="Operations portal preview">
          <div className="paper-storm" aria-hidden="true">
            {papers.map((paper) => (
              <span
                key={paper.lines.join("-")}
                className={paper.tone ? `paper ${paper.tone}` : "paper"}
                style={{ ["--x" as string]: paper.x, ["--y" as string]: paper.y, ["--r" as string]: paper.r, ["--delay" as string]: paper.delay }}
              >
                {paper.lines[0]}
                <br />
                {paper.lines[1]}
              </span>
            ))}
          </div>
          <div className="dashboard-orbit" aria-hidden="true" />
          <div className="floating-chip chip-one">
            <div className="chip-icon" aria-hidden="true">
              ✓
            </div>
            <div>
              Route completed
              <small>Metro Foods · 10:42 AM</small>
            </div>
          </div>
          <div className="floating-chip chip-two">
            <div className="chip-icon" aria-hidden="true">
              ▧
            </div>
            <div>
              Invoice ready
              <small>Generated from driver log</small>
            </div>
          </div>
          <div className="dashboard-card">
            <div className="mock-top">
              <b>Certified Waste · Operations</b>
              <span>LIVE OVERVIEW</span>
            </div>
            <div className="mock-body">
              <div className="mock-greeting">
                <div>
                  <p>WEDNESDAY, SEPTEMBER 30</p>
                  <h3>Good morning, Jordan</h3>
                </div>
                <span className="mock-date">Today&apos;s routes</span>
              </div>
              <div className="mock-stats">
                <div className="mock-stat">
                  <span>Stops today</span>
                  <b>42</b>
                  <i>+8% this week</i>
                </div>
                <div className="mock-stat">
                  <span>Completed</span>
                  <b>28</b>
                  <i>66.7% complete</i>
                </div>
                <div className="mock-stat">
                  <span>In progress</span>
                  <b>9</b>
                  <i>4 active drivers</i>
                </div>
              </div>
              <div className="mock-route">
                <div className="mock-route-head">
                  Live route activity <span>View all →</span>
                </div>
                <div className="mock-stop">
                  <div className="dot">MF</div>
                  <div>
                    <b>Metro Foods</b>
                    <small>18 Harbor Industrial Rd</small>
                  </div>
                  <span className="mock-status done">Completed</span>
                </div>
                <div className="mock-stop">
                  <div className="dot">GN</div>
                  <div>
                    <b>Greenline Nursery</b>
                    <small>2040 Westfield Ave</small>
                  </div>
                  <span className="mock-status route">En Route</span>
                </div>
                <div className="mock-stop">
                  <div className="dot">HC</div>
                  <div>
                    <b>Harbor City Market</b>
                    <small>7 Dockside Parkway</small>
                  </div>
                  <span className="mock-status waiting">Not started</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="home-trust" id="how-it-works">
        <div className="home-trust-inner">
          <span>Built for the whole service day</span>
          <div className="trust-points">
            <span>
              <b>01</b> Plan stops
            </span>
            <span>
              <b>02</b> Track work
            </span>
            <span>
              <b>03</b> Close the books
            </span>
          </div>
        </div>
      </div>

      <section className="home-features" id="capabilities">
        <div className="section-heading">
          <div className="eyebrow">One connected workflow</div>
          <h2>Clarity from first stop to final invoice.</h2>
          <p>
            Drivers get a focused mobile experience. Admins get the full picture, without chasing
            paper across the office.
          </p>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">
              ⌁
            </div>
            <h3>Know what&apos;s next</h3>
            <p>
              Give every driver a clear daily stop list with flexible numbering, addresses, and live
              status updates.
            </p>
          </article>
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">
              ▣
            </div>
            <h3>Capture it once</h3>
            <p>
              Attach notes and photos from the field, then keep every status change and timestamp
              with the stop record.
            </p>
          </article>
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">
              ▧
            </div>
            <h3>Finish with confidence</h3>
            <p>
              Turn submitted driver logs into reviewable invoices, with locked records and a clear
              history of corrections.
            </p>
          </article>
        </div>
      </section>

      <footer className="home-footer">
        <strong>{appName}</strong>
        <span>Clearer routes. Better records. Less re-entry.</span>
      </footer>
    </div>
  );
}
