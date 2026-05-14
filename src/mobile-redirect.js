// mobile-redirect.js — Add a single <script> tag pointing to this file
// in the existing index.html, just before the closing </body>:
//
//   <script src="src/mobile-redirect.js"></script>
//
// Mobile breakpoint visitors are redirected to mobile.html; desktop visitors
// stay on index.html. Query string is preserved so deep links (e.g. ?language=)
// continue to work.

(function () {
  if (typeof window === "undefined") return;
  // Skip if already on mobile page
  if (location.pathname.endsWith("mobile.html") || /\/m\/?$/.test(location.pathname)) return;
  // Skip if explicitly disabled (?nomobile)
  if (location.search.includes("nomobile")) return;
  // Match coarse pointer (touch) AND narrow viewport
  const narrow = window.matchMedia("(max-width: 768px)").matches;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (narrow && touch) {
    const dir = location.pathname.replace(/[^/]*$/, "");
    location.replace(`${dir}mobile.html${location.search}${location.hash}`);
  }
})();
