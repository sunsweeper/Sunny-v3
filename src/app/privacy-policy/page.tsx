import Image from "next/image";
import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <main className="privacy-shell">
      <section className="privacy-hero">
        <Image src="/logo.png" alt="SunSweeper logo" width={560} height={306} className="privacy-logo" priority />
        <p className="privacy-kicker">Privacy Policy</p>
        <h1>How SunSweeper protects your information.</h1>
        <p className="privacy-effective-date">Effective Date: 01/30/2025</p>
      </section>

      <section className="privacy-content">
        <p>
          With access to answers everywhere, our customers have grown accustomed to receiving accurate
          information quickly. At SunSweeper, we believe speed and accuracy matter, especially when it
          comes to protecting your home and solar investment.
        </p>
        <p>
          In order to provide fast, informed, and helpful responses, we need to know who we are
          communicating with and understand the context of past interactions. Remembering you when you
          return to our website, use our AI assistant, or call SunSweeper directly allows us to serve
          you more efficiently and without asking you to repeat information you have already shared.
        </p>
        <p>
          Information helps us deliver better service. It allows us to respond faster, provide more
          accurate answers, improve our systems, and continually refine the tools we use, including our
          AI assistant.
        </p>
        <p>
          We collect only the information necessary to operate responsibly, improve our services, and
          maintain clear communication. We do not sell personal information. We use data to serve our
          customers and strengthen our service, not to exploit it.
        </p>
        <p>
          This Privacy Policy explains what information we collect, how we use it, and how you remain in
          control of your data.
        </p>
        <p>
          At SunSweeper, we value your privacy and are committed to protecting your personal information.
          This Privacy Policy explains how SunSweeper.com (&ldquo;SunSweeper,&rdquo; &ldquo;we,&rdquo;
          &ldquo;our,&rdquo; or &ldquo;us&rdquo;) collects, uses, stores, discloses, and protects your
          information when you visit our website, interact with our AI assistant (&ldquo;Sunny&rdquo;),
          request services, or communicate with us. This policy complies with the California Consumer
          Privacy Act (CCPA) as amended by the California Privacy Rights Act (CPRA) and other applicable
          federal laws. We do not sell your personal information, as defined under the CCPA.
        </p>

        <h2>1. Notice at Collection</h2>
        <p>
          We collect the categories of personal information listed below for the purposes described in
          Section 4. For more details, see our full Privacy Policy <Link href="/privacy-policy">on this page</Link>.
          If you are a California resident and we sell or share your personal information, you can submit
          a request to opt out via our &ldquo;Do Not Sell or Share My Personal Information&rdquo; link in
          the website footer (or contact us directly). We recognize Global Privacy Control (GPC) signals
          as a valid opt-out request for sale or sharing.
        </p>

        <h2>2. Information We Collect</h2>
        <h3>A. Information You Provide</h3>
        <ul>
          <li>Name</li>
          <li>Email address</li>
          <li>Phone number</li>
          <li>Service address</li>
          <li>Any information you voluntarily provide in messages, forms, or chat with Sunny</li>
        </ul>

        <h3>B. AI Chat Conversations</h3>
        <p>When interacting with Sunny:</p>
        <ul>
          <li>Conversation content</li>
          <li>Any personal information you include</li>
          <li>Technical metadata (e.g., IP address, browser type, device type)</li>
        </ul>
        <p>
          Conversations are stored for quality assurance, service improvement, and internal review only.
        </p>

        <h3>C. Automatically Collected Information</h3>
        <ul>
          <li>IP address</li>
          <li>Browser type</li>
          <li>Device type</li>
          <li>Pages visited</li>
          <li>Time spent on pages</li>
          <li>Referral sources</li>
        </ul>
        <p>Collected via cookies and analytics tools.</p>

        <h2>3. Cookies, Analytics, and Tracking</h2>
        <p>We use:</p>
        <ul>
          <li>Google Analytics for website performance</li>
          <li>Meta (Facebook) Pixel for advertising effectiveness</li>
        </ul>
        <p>
          Cookies help identify returning visitors and improve experience. You can disable cookies in your
          browser, though some features may not work. We do not use cookies to sell personal information.
        </p>

        <h2>4. How We Use Your Information</h2>
        <p>We use information to:</p>
        <ul>
          <li>Provide and schedule services</li>
          <li>Respond to inquiries and communications</li>
          <li>Improve website and AI system functionality/accuracy</li>
          <li>Conduct marketing (with opt-out available)</li>
          <li>Maintain records and protect against fraud/misuse</li>
        </ul>

        <h2>5. AI Usage and Data Logging</h2>
        <p>
          Sunny conversations are stored internally for improving AI performance, customer service,
          training, and quality assurance. Data is never sold or shared externally except with authorized
          service providers under contract. We use reasonable safeguards to protect it.
        </p>

        <h2>6. Data Sharing and Disclosures</h2>
        <p>We do not sell personal information.</p>
        <p>
          We disclose categories of personal information to service providers and contractors for business
          purposes only (under contracts requiring them to protect data and limit use):
        </p>
        <ul>
          <li>
            Identifiers (e.g., name, email, phone) &rarr; To CRM systems and EZ Texting (for
            scheduling/SMS)
          </li>
          <li>
            Internet or other electronic network activity (e.g., IP, browser/device info, pages visited)
            &rarr; To Google Analytics and Meta Pixel (for analytics/ad measurement)
          </li>
          <li>
            Geolocation data (approximate, from service address) &rarr; Limited internal use or to
            scheduling tools
          </li>
        </ul>
        <p>
          These providers are contractually obligated not to use data independently or for their own
          marketing.
        </p>

        <h2>7. Data Retention</h2>
        <p>
          We retain information only as long as necessary to provide services, fulfill legal obligations,
          improve systems, or maintain records (typically [X years/months; add your policy, e.g., 3-7
          years for business records]).
        </p>

        <h2>8. Your Privacy Rights (California Residents &ndash; CCPA/CPRA)</h2>
        <p>If you are a California resident, you have the right to:</p>
        <ul>
          <li>
            <strong>Know/access:</strong> Categories and specific pieces of personal information we
            collect, use, disclose, or sell/share (twice per 12 months, free).
          </li>
          <li>
            <strong>Delete:</strong> Request deletion of your personal information (with exceptions, e.g.,
            legal obligations).
          </li>
          <li>
            <strong>Correct:</strong> Request correction of inaccurate personal information.
          </li>
          <li>
            <strong>Opt-out of sale/sharing:</strong> Stop any sale or sharing (including for targeted
            advertising). We honor Global Privacy Control signals.
          </li>
          <li>
            <strong>Limit use/disclosure of sensitive personal information:</strong> To only necessary
            purposes (we collect minimal sensitive data).
          </li>
          <li>
            <strong>Non-discrimination:</strong> No different pricing/service for exercising rights.
          </li>
        </ul>

        <p>To exercise rights, contact us via:</p>
        <ul>
          <li>Email: removemydata@sunsweeper.com</li>
          <li>Phone: 805-938-1515</li>
          <li>Mail: SunSweeper, 1251 Talmadge Rd, Santa Maria, CA 93455</li>
        </ul>
        <p>
          We verify requests (using provided info) and respond within required timelines (45 days for
          most, extendable; 15 business days for opt-outs). Submit via any method&mdash;no account needed.
        </p>

        <h2>9. Children&apos;s Privacy</h2>
        <p>
          Our services target homeowners/property owners (not children). We do not knowingly collect
          personal information from children under 13 without parental consent. If discovered, we delete
          it. Contact us for deletion requests.
        </p>

        <h2>10. Data Security</h2>
        <p>
          We use reasonable administrative, technical, and physical safeguards. No system is 100% secure
          &mdash; avoid sharing sensitive info (e.g., financial details) via chat/forms.
        </p>

        <h2>11. Updates to This Policy</h2>
        <p>
          We update periodically; changes posted here with new effective date. Continued use constitutes
          acceptance.
        </p>
      </section>
    </main>
  );
}
