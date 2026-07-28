/*
 * OpenStart embeddable registration widget (loader).
 *
 * Usage on any website:
 *   <div data-openstart-embed="your-event-slug"></div>
 *   <script src="https://YOUR-OPENSTART-HOST/embed.js"></script>
 *
 * Or attach directly to the script tag:
 *   <script src="https://YOUR-OPENSTART-HOST/embed.js" data-openstart-embed="your-event-slug"></script>
 *
 * Optional attributes: data-openstart-accent="#0f6b4f" (button colour).
 *
 * The widget renders inside an <iframe> served from the OpenStart host, so the
 * registration + Stripe checkout run entirely within OpenStart's own origin —
 * no CORS or allowed-origin configuration is required on the host page.
 */
(function () {
  var currentScript = document.currentScript;
  var base = new URL(".", currentScript.src); // directory that serves embed.js / embed.html
  var origin = new URL(currentScript.src).origin;

  function mount(container) {
    if (!container || container.dataset.openstartMounted === "1") return;
    var slug = container.dataset.openstartEmbed || container.dataset.openstartEvent;
    if (!slug) return;
    container.dataset.openstartMounted = "1";

    var frameUrl = new URL("embed.html", base);
    frameUrl.searchParams.set("event", slug);
    if (container.dataset.openstartAccent) frameUrl.searchParams.set("accent", container.dataset.openstartAccent);

    var iframe = document.createElement("iframe");
    iframe.src = frameUrl.toString();
    iframe.title = "Register with OpenStart";
    iframe.loading = "lazy";
    iframe.setAttribute("allow", "payment");
    iframe.style.cssText = "width:100%;border:0;display:block;min-height:220px;transition:height .15s ease;";
    iframe.dataset.openstartSlug = slug;
    container.appendChild(iframe);
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    var data = event.data || {};
    if (data.type !== "openstart:height" || !data.value) return;
    var frames = document.querySelectorAll('iframe[data-openstart-slug="' + (data.slug || "") + '"]');
    frames.forEach(function (frame) { frame.style.height = data.value + "px"; });
  });

  function init() {
    if (currentScript && (currentScript.dataset.openstartEmbed || currentScript.dataset.openstartEvent)) {
      var holder = document.createElement("div");
      holder.dataset.openstartEmbed = currentScript.dataset.openstartEmbed || currentScript.dataset.openstartEvent;
      if (currentScript.dataset.openstartAccent) holder.dataset.openstartAccent = currentScript.dataset.openstartAccent;
      currentScript.parentNode.insertBefore(holder, currentScript);
      mount(holder);
    }
    document.querySelectorAll("[data-openstart-embed]").forEach(mount);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
