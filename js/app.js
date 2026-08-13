/* Shared site shell and light interactions. */
const Site = (() => {
  const brand = "All About Worksheets";
  const nav = `
    <nav class="navbar navbar-expand-lg fixed-top">
      <div class="container">
        <a class="navbar-brand" href="index.html"><span class="brand-mark">A</span>${brand}</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu" aria-label="Toggle navigation">
          <i class="bi bi-list"></i>
        </button>
        <div class="collapse navbar-collapse" id="navMenu">
          <ul class="navbar-nav ms-auto align-items-lg-center">
            <li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
            <li class="nav-item"><a class="nav-link" href="worksheets.html">Worksheets</a></li>
            <li class="nav-item"><a class="nav-link" href="about.html">About</a></li>
            <li class="nav-item"><a class="nav-link" href="contact.html">Contact</a></li>
            <li class="nav-item ms-lg-2"><button class="theme-toggle" id="theme-toggle" aria-label="Toggle dark mode"><i class="bi bi-moon-stars"></i></button></li>
          </ul>
        </div>
      </div>
    </nav>`;
  const footer = `
    <div class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <a class="navbar-brand text-white" href="index.html"><span class="brand-mark">A</span>${brand}</a>
            <p class="mt-3">Printable worksheets that help children practise with confidence at home and in class.</p>
          </div>
          <div>
            <h3>Explore</h3>
            <div class="footer-links">
              <a href="worksheets.html">Worksheets</a>
              <a href="about.html">About us</a>
              <a href="contact.html">Contact</a>
            </div>
          </div>
          <div>
            <h3>Helpful links</h3>
            <div class="footer-links">
              <a href="privacy.html">Privacy Policy</a>
              <a href="terms.html">Terms & Conditions</a>
              <a href="sitemap.xml">Sitemap</a>
            </div>
          </div>
        </div>
        <div class="copyright">&copy; ${new Date().getFullYear()} ${brand}. Made with care for growing minds.</div>
      </div>
    </div>`;
  const categories = [
    ["Math", "bi-calculator", "#fff5c8"],
    ["English", "bi-book", "#e5f7ee"],
    ["Science", "bi-lightbulb", "#e9f6ff"],
    ["Art", "bi-palette", "#fff0e7"],
    ["General Knowledge", "bi-globe", "#f2efff"],
  ];

  function init() {
    const header = document.getElementById("site-header");
    const siteFooter = document.getElementById("site-footer");
    if (header) header.innerHTML = nav;
    if (siteFooter) siteFooter.innerHTML = footer;

    const page = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.toggle("active", link.getAttribute("href") === page);
    });

    const toggle = document.getElementById("theme-toggle");
    if (localStorage.getItem("aaw-theme") === "dark") document.body.classList.add("dark");
    toggle?.addEventListener("click", () => {
      document.body.classList.toggle("dark");
      localStorage.setItem("aaw-theme", document.body.classList.contains("dark") ? "dark" : "light");
    });

    const top = document.getElementById("back-to-top");
    window.addEventListener("scroll", () => top?.classList.toggle("show", scrollY > 400));
    top?.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));

    const categoryGrid = document.getElementById("category-grid");
    if (categoryGrid) {
      categoryGrid.innerHTML = categories.map(([name, icon, color]) => `
        <a class="category-card" href="worksheets.html?subject=${encodeURIComponent(name)}" style="--card-color:${color}">
          <span class="category-icon"><i class="bi ${icon}"></i></span>
          <h3>${name}</h3>
        </a>
      `).join("");
    }

    document.getElementById("contact-form")?.addEventListener("submit", event => {
      event.preventDefault();
      const name = document.getElementById("name")?.value || "";
      const email = document.getElementById("email")?.value || "";
      const message = document.getElementById("message")?.value || "";
      const subject = encodeURIComponent(`Website enquiry from ${name}`);
      const body = encodeURIComponent(`${message}\n\nFrom: ${name}\nEmail: ${email}`);
      location.href = `mailto:hello@allaboutworksheets.com?subject=${subject}&body=${body}`;
    });

    document.getElementById("newsletter-form")?.addEventListener("submit", event => {
      event.preventDefault();
      document.getElementById("newsletter-message").textContent = "Thanks! We will share updates when new worksheets are added.";
      event.currentTarget.reset();
    });
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", Site.init);
